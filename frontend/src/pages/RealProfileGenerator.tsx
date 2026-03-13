import { useEffect, useMemo, useState } from 'react'
import { AudioWaveform, Loader2, RefreshCw, Save, Upload, Zap } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

type GeneratedCandidate = {
  index: number
  audioUrl: string
  audioBlob: Blob
}

type RealProfile = {
  id: string
  name: string
  description: string
  created: string
  voice_name: string
}

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ja', label: 'Japanese' },
  { value: 'ko', label: 'Korean' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'ru', label: 'Russian' },
  { value: 'es', label: 'Spanish' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'it', label: 'Italian' },
]

const blobToBase64Payload = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Unable to read audio data'))
    reader.onload = () => resolve((reader.result as string).split(',')[1])
    reader.readAsDataURL(blob)
  })

export default function RealProfileGenerator() {
  const [description, setDescription] = useState('')
  const [testSentence, setTestSentence] = useState(
    'The quick brown fox jumps over the lazy dog. Mathematics is the language of the universe.'
  )
  const [numProfiles, setNumProfiles] = useState(3)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [candidates, setCandidates] = useState<GeneratedCandidate[]>([])
  const [saveNames, setSaveNames] = useState<Record<number, string>>({})
  const [savingIndex, setSavingIndex] = useState<number | null>(null)

  const [cloneName, setCloneName] = useState('')
  const [cloneDescription, setCloneDescription] = useState('')
  const [cloneRefText, setCloneRefText] = useState('')
  const [cloneFile, setCloneFile] = useState<File | null>(null)
  const [clonePreviewUrl, setClonePreviewUrl] = useState('')
  const [savingClone, setSavingClone] = useState(false)

  const [realProfiles, setRealProfiles] = useState<RealProfile[]>([])
  const [loadingRealProfiles, setLoadingRealProfiles] = useState(false)
  const [selectedRealProfileId, setSelectedRealProfileId] = useState('')

  const [speakText, setSpeakText] = useState('This is a speed test for real cached profiles.')
  const [speakLanguage, setSpeakLanguage] = useState('en')
  const [generatingFast, setGeneratingFast] = useState(false)
  const [fastAudioUrl, setFastAudioUrl] = useState('')
  const [fastLatencyMs, setFastLatencyMs] = useState<number | null>(null)

  const selectedRealProfile = useMemo(
    () => realProfiles.find((p) => p.id === selectedRealProfileId) || null,
    [realProfiles, selectedRealProfileId]
  )

  const fetchRealProfiles = async () => {
    setLoadingRealProfiles(true)
    try {
      const resp = await fetch('/api/real-profiles')
      if (!resp.ok) throw new Error('Failed to load real profiles')
      const data = await resp.json()
      setRealProfiles(Array.isArray(data.profiles) ? data.profiles : [])
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to load real profiles')
    } finally {
      setLoadingRealProfiles(false)
    }
  }

  useEffect(() => {
    fetchRealProfiles()
    const handler = () => fetchRealProfiles()
    window.addEventListener('real-profiles-updated', handler)
    return () => window.removeEventListener('real-profiles-updated', handler)
  }, [])

  const handleGenerateCandidates = async () => {
    if (!description.trim()) {
      alert('Please enter a voice description')
      return
    }

    setGenerating(true)
    setCandidates([])
    setProgress({ current: 0, total: numProfiles })

    const next: GeneratedCandidate[] = []
    for (let i = 0; i < numProfiles; i++) {
      setProgress({ current: i + 1, total: numProfiles })
      try {
        const resp = await fetch('/api/tts/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: testSentence,
            language: 'en',
            instruct: description,
            voice_description: description,
            robot: false,
          }),
        })
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ detail: 'Request failed' }))
          throw new Error(err.detail || 'Generation failed')
        }

        const blob = await resp.blob()
        next.push({ index: i + 1, audioUrl: URL.createObjectURL(blob), audioBlob: blob })
      } catch (e) {
        alert(`Candidate ${i + 1} failed: ${e instanceof Error ? e.message : e}`)
      }
    }

    setCandidates(next)
    setGenerating(false)
    setProgress({ current: 0, total: 0 })
  }

  const handleSaveCandidate = async (candidate: GeneratedCandidate) => {
    const name = saveNames[candidate.index]?.trim()
    if (!name) {
      alert('Please enter a name before saving')
      return
    }

    setSavingIndex(candidate.index)
    try {
      const b64 = await blobToBase64Payload(candidate.audioBlob)
      const resp = await fetch('/api/real-profiles/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: description.trim(),
          audio_data: b64,
          ref_text: testSentence.trim(),
        }),
      })
      const payload = await resp.json().catch(() => null)
      if (!resp.ok) {
        throw new Error(payload?.detail || 'Save failed')
      }

      alert(`Real profile "${name}" saved and cached.`)
      setSaveNames((prev) => ({ ...prev, [candidate.index]: '' }))
      window.dispatchEvent(new CustomEvent('real-profiles-updated'))
    } catch (e) {
      alert(`Save failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setSavingIndex(null)
    }
  }

  const handleCloneFileChange = (file: File | null) => {
    setCloneFile(file)
    if (!file) {
      setClonePreviewUrl('')
      return
    }
    setClonePreviewUrl(URL.createObjectURL(file))
  }

  const handleSaveClone = async () => {
    if (!cloneName.trim() || !cloneDescription.trim() || !cloneFile) {
      alert('Please provide name, description, and audio file')
      return
    }

    setSavingClone(true)
    try {
      const b64 = await blobToBase64Payload(cloneFile)
      const resp = await fetch('/api/real-profiles/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cloneName.trim(),
          description: cloneDescription.trim(),
          audio_data: b64,
          ref_text: cloneRefText.trim(),
        }),
      })
      const payload = await resp.json().catch(() => null)
      if (!resp.ok) {
        throw new Error(payload?.detail || 'Save failed')
      }

      alert(`Real profile "${cloneName.trim()}" saved and cached.`)
      setCloneName('')
      setCloneDescription('')
      setCloneRefText('')
      setCloneFile(null)
      setClonePreviewUrl('')
      window.dispatchEvent(new CustomEvent('real-profiles-updated'))
    } catch (e) {
      alert(`Save failed: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setSavingClone(false)
    }
  }

  const handleFastGenerate = async () => {
    if (!selectedRealProfileId || !speakText.trim()) {
      alert('Please select a real profile and enter text')
      return
    }

    setGeneratingFast(true)
    setFastAudioUrl('')
    setFastLatencyMs(null)

    const startedAt = performance.now()
    try {
      const resp = await fetch('/api/tts/generate-real', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: speakText.trim(),
          language: speakLanguage,
          real_profile_id: selectedRealProfileId,
          robot: false,
        }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'Request failed' }))
        throw new Error(err.detail || 'Generation failed')
      }
      const blob = await resp.blob()
      setFastAudioUrl(URL.createObjectURL(blob))
      setFastLatencyMs(Math.round(performance.now() - startedAt))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGeneratingFast(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <AudioWaveform className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Real Profile Generator</h1>
          <p className="text-sm text-muted-foreground">
            Save profiles into cached voice mode for faster reuse
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Generate Candidates from Description</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voice Description</label>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Warm documentary narrator with calm pacing"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reference Text</label>
            <textarea
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-y min-h-[80px]"
              value={testSentence}
              onChange={(e) => setTestSentence(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Number of Candidates</label>
            <input
              type="number"
              min={1}
              max={8}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={numProfiles}
              onChange={(e) => setNumProfiles(Math.min(8, Math.max(1, parseInt(e.target.value, 10) || 3)))}
            />
          </div>
          <Button onClick={handleGenerateCandidates} disabled={generating || !description.trim()}>
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Generating {progress.current}/{progress.total}...
              </>
            ) : (
              'Generate Real Candidates'
            )}
          </Button>
        </CardContent>
      </Card>

      {candidates.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            Candidates
            <Badge variant="secondary">{candidates.length}</Badge>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {candidates.map((candidate) => (
              <Card key={candidate.index} className="border-primary/30 bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-sm">Candidate {candidate.index}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <audio controls src={candidate.audioUrl} className="w-full" />
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="Real profile name..."
                      value={saveNames[candidate.index] || ''}
                      onChange={(e) => setSaveNames((prev) => ({ ...prev, [candidate.index]: e.target.value }))}
                    />
                    <Button variant="outline" onClick={() => handleSaveCandidate(candidate)} disabled={savingIndex === candidate.index}>
                      {savingIndex === candidate.index ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Save className="h-4 w-4 mr-1" /> Save
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Upload Audio as Real Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Profile Name</label>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value)}
              placeholder="e.g. Energetic Coach"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</label>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={cloneDescription}
              onChange={(e) => setCloneDescription(e.target.value)}
              placeholder="Describe the voice"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reference Transcript (optional)</label>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={cloneRefText}
              onChange={(e) => setCloneRefText(e.target.value)}
              placeholder="Text spoken in the uploaded clip for better cloning"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Audio File</label>
            <input
              type="file"
              accept=".wav,.mp3"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              onChange={(e) => handleCloneFileChange(e.target.files?.[0] || null)}
            />
          </div>
          {clonePreviewUrl && <audio controls src={clonePreviewUrl} className="w-full" />}
          <Button onClick={handleSaveClone} disabled={savingClone}>
            {savingClone ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Save as Real Profile
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Zap className="h-4 w-4" />
            Fast Speak Test (Cached Voice Path)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={fetchRealProfiles} disabled={loadingRealProfiles}>
              {loadingRealProfiles ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh Profiles
            </Button>
            <Badge variant="secondary">{realProfiles.length}</Badge>
          </div>
          <select
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            value={selectedRealProfileId}
            onChange={(e) => setSelectedRealProfileId(e.target.value)}
          >
            <option value="">Select cached real profile...</option>
            {realProfiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {selectedRealProfile && (
            <div className="rounded-md border border-border/70 bg-muted/40 p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Selected</p>
              <p className="mt-1 text-sm font-medium">{selectedRealProfile.name}</p>
              <p className="text-xs text-muted-foreground mt-1">{selectedRealProfile.description}</p>
              <audio controls src={`/api/real-profiles/${selectedRealProfile.id}/audio`} className="mt-2 w-full" />
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Text</label>
              <textarea
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-y min-h-[80px]"
                value={speakText}
                onChange={(e) => setSpeakText(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Language</label>
              <select
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={speakLanguage}
                onChange={(e) => setSpeakLanguage(e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <Button onClick={handleFastGenerate} disabled={generatingFast || !selectedRealProfileId || !speakText.trim()}>
            {generatingFast ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Generating...
              </>
            ) : (
              'Generate via Cached Voice'
            )}
          </Button>
          {fastLatencyMs !== null && <p className="text-xs text-muted-foreground">Request time: {fastLatencyMs} ms</p>}
          {fastAudioUrl && <audio controls src={fastAudioUrl} className="w-full" />}
        </CardContent>
      </Card>
    </div>
  )
}
