import { useEffect, useMemo, useState } from 'react'
import { Mic, Loader2, RefreshCw, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const PRESETS: Record<string, string> = {
  narrator: 'Clear narration voice, calm pacing, studio quality.',
  teacher: 'Warm teacher voice with clear pronunciation and medium pace.',
  excited: 'Energetic and enthusiastic voice with expressive tone.',
  storyteller: 'Rich storyteller voice with dramatic pauses and warmth.',
  assistant: 'Friendly AI assistant voice, polished and concise.',
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

type LegacyProfile = {
  id: string
  name: string
  description: string
}

type RealProfile = {
  id: string
  name: string
  description: string
  voice_name?: string
  tags?: string[]
}

type SelectedProfile = {
  id: string
  name: string
  description: string
  profileType: 'legacy' | 'real'
  tags?: string[]
}

export default function TTS() {
  const [text, setText] = useState('Welcome to IMCG Sound.')
  const [language, setLanguage] = useState('en')
  const [preset, setPreset] = useState('narrator')
  const [selectedProfileKey, setSelectedProfileKey] = useState('')
  const [description, setDescription] = useState(PRESETS.narrator)
  const [robot, setRobot] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [saveName, setSaveName] = useState('')
  const [saveTags, setSaveTags] = useState('')
  const [saving, setSaving] = useState(false)
  const [legacyProfiles, setLegacyProfiles] = useState<LegacyProfile[]>([])
  const [realProfiles, setRealProfiles] = useState<RealProfile[]>([])
  const [loadingProfiles, setLoadingProfiles] = useState(false)
  const [profilesError, setProfilesError] = useState('')

  const selectedProfile = useMemo<SelectedProfile | null>(() => {
    if (!selectedProfileKey) return null
    const [profileType, id] = selectedProfileKey.split(':')
    if (profileType === 'legacy') {
      const profile = legacyProfiles.find((p) => p.id === id)
      if (!profile) return null
      return { ...profile, profileType: 'legacy' }
    }
    if (profileType === 'real') {
      const profile = realProfiles.find((p) => p.id === id)
      if (!profile) return null
      return { ...profile, profileType: 'real' }
    }
    return null
  }, [legacyProfiles, realProfiles, selectedProfileKey])

  const fetchProfiles = async () => {
    setLoadingProfiles(true)
    setProfilesError('')
    try {
      const [legacyResp, realResp] = await Promise.all([
        fetch('/api/profiles'),
        fetch('/api/real-profiles'),
      ])

      if (!legacyResp.ok) {
        const err = await legacyResp.json().catch(() => ({ detail: 'Request failed' }))
        throw new Error(err.detail || 'Could not load voice profiles')
      }
      if (!realResp.ok) {
        const err = await realResp.json().catch(() => ({ detail: 'Request failed' }))
        throw new Error(err.detail || 'Could not load real profiles')
      }

      const legacyData = await legacyResp.json()
      const realData = await realResp.json()
      setLegacyProfiles(Array.isArray(legacyData.profiles) ? legacyData.profiles : [])
      setRealProfiles(Array.isArray(realData.profiles) ? realData.profiles : [])
    } catch (e) {
      setProfilesError(e instanceof Error ? e.message : 'Could not load profiles')
    } finally {
      setLoadingProfiles(false)
    }
  }

  useEffect(() => {
    fetchProfiles()
    const onProfilesUpdated = () => {
      fetchProfiles()
    }
    window.addEventListener('profiles-updated', onProfilesUpdated)
    window.addEventListener('real-profiles-updated', onProfilesUpdated)
    return () => {
      window.removeEventListener('profiles-updated', onProfilesUpdated)
      window.removeEventListener('real-profiles-updated', onProfilesUpdated)
    }
  }, [])

  useEffect(() => {
    if (selectedProfile) {
      setDescription(selectedProfile.description)
      return
    }
    setDescription(PRESETS[preset] || '')
  }, [selectedProfile, preset])

  const handlePresetChange = (p: string) => {
    setPreset(p)
    if (!selectedProfileKey && PRESETS[p]) {
      setDescription(PRESETS[p])
    }
  }

  const handleProfileChange = (profileKey: string) => {
    setSelectedProfileKey(profileKey)
  }

  const handleGenerate = async () => {
    setGenerating(true)
    setAudioUrl(null)
    try {
      const resp =
        selectedProfile?.profileType === 'real'
          ? await fetch('/api/tts/generate-real', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text,
                language,
                real_profile_id: selectedProfile.id,
                robot,
              }),
            })
          : await fetch('/api/tts/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text,
                language,
                instruct: description,
                voice_description: description,
                voice_name: preset,
                robot,
                ...(selectedProfile?.profileType === 'legacy' ? { voice_profile_id: selectedProfile.id } : {}),
              }),
            })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'Request failed' }))
        throw new Error(err.detail || 'Error')
      }
      const blob = await resp.blob()
      setAudioBlob(blob)
      setAudioUrl(URL.createObjectURL(blob))
    } catch (e) {
      alert('Generation failed: ' + (e instanceof Error ? e.message : e))
    }
    setGenerating(false)
  }

  const handleSave = async () => {
    if (!audioBlob) return
    setSaving(true)
    try {
      const b64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(audioBlob)
      })
      const name = saveName.trim() || `TTS ${new Date().toLocaleTimeString()}`
      const tags = saveTags.split(',').map(s => s.trim()).filter(Boolean)
      const resp = await fetch('/api/library/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: 'tts', prompt: text, duration: 0, tags, audio_data: b64 }),
      })
      if (!resp.ok) throw new Error('Save failed')
      setSaveName('')
      setSaveTags('')
      alert('Saved to library!')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Save failed')
    }
    setSaving(false)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Mic className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Text-to-Speech</h1>
          <p className="text-sm text-muted-foreground">Generate speech using presets, saved sound profiles, and tagged real voices</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Text</label>
            <textarea
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-y min-h-[100px]"
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="Enter text to speak..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Language</label>
              <select
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                value={language}
                onChange={e => setLanguage(e.target.value)}
              >
                {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voice Preset</label>
              <select
                className={`mt-1 w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring transition-colors ${
                  selectedProfile
                    ? 'border-border bg-muted/60 text-muted-foreground opacity-50 cursor-not-allowed'
                    : 'border-border bg-background'
                }`}
                value={preset}
                disabled={!!selectedProfile}
                onChange={e => handlePresetChange(e.target.value)}
              >
                {Object.keys(PRESETS).map(p => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Saved Sound Profiles</label>
              <Button variant="outline" size="sm" onClick={fetchProfiles} disabled={loadingProfiles}>
                {loadingProfiles ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                Refresh
              </Button>
            </div>
            <select
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={selectedProfileKey}
              onChange={(e) => handleProfileChange(e.target.value)}
            >
              <option value="">None</option>
              {legacyProfiles.length > 0 && (
                <optgroup label="Sound Profiles (V1)">
                  {legacyProfiles.map((cp) => (
                    <option key={`legacy:${cp.id}`} value={`legacy:${cp.id}`}>
                      {cp.name}
                    </option>
                  ))}
                </optgroup>
              )}
              {realProfiles.length > 0 && (
                <optgroup label="Real Profiles">
                  {realProfiles.map((rp) => (
                    <option key={`real:${rp.id}`} value={`real:${rp.id}`}>
                      {rp.name} [real]
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {profilesError && <p className="mt-1 text-xs text-red-500">{profilesError}</p>}
            {!profilesError && realProfiles.length > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">Real voices are marked with the <span className="font-semibold">[real]</span> tag.</p>
            )}
            {selectedProfile && (
              <div className="mt-2 rounded-md border border-border/70 bg-muted/40 p-3">
                <div className="flex items-center gap-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Selected Profile</p>
                  <Badge variant={selectedProfile.profileType === 'real' ? 'info' : 'secondary'}>
                    {selectedProfile.profileType === 'real' ? 'real' : 'v1'}
                  </Badge>
                </div>
                <p className="mt-1 text-sm">{selectedProfile.description}</p>
                <audio
                  controls
                  src={
                    selectedProfile.profileType === 'real'
                      ? `/api/real-profiles/${selectedProfile.id}/audio`
                      : `/api/profiles/${selectedProfile.id}/audio`
                  }
                  className="mt-2 w-full"
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Voice Description</label>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the voice..."
            />
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={robot} onChange={e => setRobot(e.target.checked)} className="accent-primary" />
            Robot Voice
          </label>

          <Button onClick={handleGenerate} disabled={generating || !text.trim()}>
            {generating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Generating...</> : '▶ Generate Speech'}
          </Button>
        </CardContent>
      </Card>

      {audioUrl && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              ✅ Generated
              <Badge variant="secondary">TTS</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <audio controls src={audioUrl} className="w-full" />
            <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-2">
              <input
                className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Name..."
                value={saveName}
                onChange={e => setSaveName(e.target.value)}
              />
              <input
                className="rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Tags (comma-separated)..."
                value={saveTags}
                onChange={e => setSaveTags(e.target.value)}
              />
              <Button variant="outline" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Save</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
