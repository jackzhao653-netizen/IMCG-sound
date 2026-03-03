import { useState } from 'react'
import { AudioWaveform, Loader2, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function ProfileGenerator() {
  const [description, setDescription] = useState('')
  const [testSentence, setTestSentence] = useState(
    'The quick brown fox jumps over the lazy dog. Mathematics is the language of the universe.'
  )
  const [numProfiles, setNumProfiles] = useState(4)
  const [generating, setGenerating] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [profiles, setProfiles] = useState<Array<{
    index: number
    audioUrl: string
    audioBlob: Blob
  }>>([])
  const [savingIndex, setSavingIndex] = useState<number | null>(null)
  const [saveNames, setSaveNames] = useState<Record<number, string>>({})
  const [cloneName, setCloneName] = useState('')
  const [cloneDescription, setCloneDescription] = useState('')
  const [cloneFile, setCloneFile] = useState<File | null>(null)
  const [clonePreviewUrl, setClonePreviewUrl] = useState('')
  const [isSavingClone, setIsSavingClone] = useState(false)
  const [cloneMessage, setCloneMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleGenerate = async () => {
    if (!description.trim()) {
      alert('Please enter a voice description')
      return
    }

    setGenerating(true)
    setProfiles([])
    setProgress({ current: 0, total: numProfiles })

    const results: Array<{ index: number; audioUrl: string; audioBlob: Blob }> = []

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
          throw new Error(err.detail || 'Error')
        }

        const blob = await resp.blob()
        results.push({
          index: i + 1,
          audioUrl: URL.createObjectURL(blob),
          audioBlob: blob,
        })
      } catch (e) {
        alert(`Profile ${i + 1} failed: ${e instanceof Error ? e.message : e}`)
      }
    }

    setProfiles(results)
    setGenerating(false)
    setProgress({ current: 0, total: 0 })
  }

  const handleSave = async (profile: { index: number; audioBlob: Blob }) => {
    const name = saveNames[profile.index]?.trim()
    if (!name) {
      alert('Please enter a name for this profile')
      return
    }

    setSavingIndex(profile.index)
    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('Unable to read generated audio'))
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(profile.audioBlob)
      })

      const resp = await fetch('/api/profiles/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          audio_data: b64,
        }),
      })

      const payload = await resp.json().catch(() => null)
      if (!resp.ok) {
        throw new Error(payload?.detail || payload?.error || 'Save failed')
      }

      alert(`Profile "${name}" saved!`)
      window.dispatchEvent(new CustomEvent('profiles-updated'))
      setSaveNames((prev) => ({ ...prev, [profile.index]: '' }))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Save failed'
      console.error('Failed to save profile:', e)
      alert(`Save failed: ${message}`)
    }
    setSavingIndex(null)
  }

  const handleCloneFileChange = (file: File | null) => {
    setCloneFile(file)
    setCloneMessage(null)
    if (!file) {
      setClonePreviewUrl('')
      return
    }
    setClonePreviewUrl(URL.createObjectURL(file))
  }

  const handleSaveClone = async () => {
    if (!cloneName.trim() || !cloneDescription.trim() || !cloneFile) {
      setCloneMessage({
        type: 'error',
        text: 'Please provide voice name, description, and an audio file.',
      })
      return
    }

    setIsSavingClone(true)
    setCloneMessage(null)

    try {
      const b64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('Unable to read selected file'))
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(cloneFile)
      })

      const resp = await fetch('/api/profiles/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cloneName.trim(),
          description: cloneDescription.trim(),
          audio_data: b64,
        }),
      })

      const payload = await resp.json().catch(() => null)
      if (!resp.ok) {
        throw new Error(payload?.detail || payload?.error || 'Save failed')
      }

      setCloneMessage({ type: 'success', text: `Voice clone "${cloneName.trim()}" saved.` })
      setCloneName('')
      setCloneDescription('')
      setCloneFile(null)
      setClonePreviewUrl('')
      window.dispatchEvent(new CustomEvent('profiles-updated'))
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Save failed'
      setCloneMessage({ type: 'error', text: `Save failed: ${message}` })
    } finally {
      setIsSavingClone(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <AudioWaveform className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Sound Profile Generator</h1>
          <p className="text-sm text-muted-foreground">
            Generate multiple voice variations from a single description
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Voice Description
            </label>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. A warm British male narrator like David Attenborough"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Test Sentence
            </label>
            <textarea
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-y min-h-[80px]"
              value={testSentence}
              onChange={(e) => setTestSentence(e.target.value)}
              placeholder="All profiles will speak this sentence..."
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Number of Profiles
            </label>
            <input
              type="number"
              min={1}
              max={8}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={numProfiles}
              onChange={(e) => setNumProfiles(Math.min(8, Math.max(1, parseInt(e.target.value) || 4)))}
            />
            <p className="text-xs text-muted-foreground mt-1">Generate 1-8 variations (default: 4)</p>
          </div>

          <Button onClick={handleGenerate} disabled={generating || !description.trim()}>
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Generating {progress.current}/{progress.total}...
              </>
            ) : (
              '▶ Generate Profiles'
            )}
          </Button>
        </CardContent>
      </Card>

      {profiles.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            Generated Profiles
            <Badge variant="secondary">{profiles.length}</Badge>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profiles.map((profile) => (
              <Card key={profile.index} className="border-primary/30 bg-primary/5">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    Profile {profile.index}
                    <Badge variant="outline">TTS</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <audio controls src={profile.audioUrl} className="w-full" />
                  <p className="text-xs text-muted-foreground line-clamp-2">{description}</p>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      placeholder="Profile name..."
                      value={saveNames[profile.index] || ''}
                      onChange={(e) =>
                        setSaveNames((prev) => ({ ...prev, [profile.index]: e.target.value }))
                      }
                    />
                    <Button
                      variant="outline"
                      onClick={() => handleSave(profile)}
                      disabled={savingIndex === profile.index}
                    >
                      {savingIndex === profile.index ? (
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
          <CardTitle className="text-sm">Voice Clone - Save Audio File as Profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Voice name
            </label>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={cloneName}
              onChange={(e) => setCloneName(e.target.value)}
              placeholder="e.g. Energetic coach"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Voice description
            </label>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={cloneDescription}
              onChange={(e) => setCloneDescription(e.target.value)}
              placeholder="Describe this voice for TTS use"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Audio file
            </label>
            <input
              type="file"
              accept=".wav,.mp3"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              onChange={(e) => handleCloneFileChange(e.target.files?.[0] || null)}
            />
          </div>

          {clonePreviewUrl && (
            <div className="space-y-1">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Preview</p>
              <audio controls src={clonePreviewUrl} className="w-full" />
            </div>
          )}

          <Button onClick={handleSaveClone} disabled={isSavingClone}>
            {isSavingClone ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Saving...
              </>
            ) : (
              'Save Voice Clone'
            )}
          </Button>

          {cloneMessage && (
            <p className={cloneMessage.type === 'success' ? 'text-sm text-green-600' : 'text-sm text-red-600'}>
              {cloneMessage.text}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
