import { useState } from 'react'
import { Music as MusicIcon, Loader2, Save } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export default function Music() {
  const [prompt, setPrompt] = useState('uplifting synthwave soundtrack for a launch video')
  const [lyrics, setLyrics] = useState('[inst]')
  const [duration, setDuration] = useState(30)
  const [genreTags, setGenreTags] = useState('synthwave, upbeat')
  const [steps, setSteps] = useState(8)
  const [guidance, setGuidance] = useState(7.0)
  const [generating, setGenerating] = useState(false)
  const [status, setStatus] = useState('')
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [saveName, setSaveName] = useState('')
  const [saveTags, setSaveTags] = useState('')
  const [saving, setSaving] = useState(false)

  const handleGenerate = async () => {
    setGenerating(true)
    setAudioUrl(null)
    setStatus('Submitting to ACE-Step...')
    try {
      const tags = genreTags.split(',').map(s => s.trim()).filter(Boolean)
      const resp = await fetch('/api/music/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt, lyrics, duration, genre_tags: tags,
          inference_steps: steps, guidance_scale: guidance, seed: -1,
        }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'Request failed' }))
        throw new Error(err.detail || 'Error')
      }
      setStatus('Downloading audio...')
      const blob = await resp.blob()
      setAudioBlob(blob)
      setAudioUrl(URL.createObjectURL(blob))
      setStatus('')
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Generation failed')
      setStatus('')
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
      const name = saveName.trim() || `Music ${new Date().toLocaleTimeString()}`
      const tags = saveTags.split(',').map(s => s.trim()).filter(Boolean)
      const resp = await fetch('/api/library/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type: 'music', prompt, duration, tags, audio_data: b64 }),
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
        <MusicIcon className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Music Generation</h1>
          <p className="text-sm text-muted-foreground">Generate music using ACE-Step — describe a style or provide lyrics</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Prompt / Tags</label>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Describe the music style..."
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Lyrics (use [inst] for instrumental)</label>
            <textarea
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring resize-y min-h-[80px]"
              value={lyrics}
              onChange={e => setLyrics(e.target.value)}
              placeholder="[inst] for instrumental, or write lyrics with [verse], [chorus], [bridge]..."
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Genre Tags</label>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              value={genreTags}
              onChange={e => setGenreTags(e.target.value)}
              placeholder="synthwave, upbeat, electronic..."
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Duration ({duration}s)</label>
              <input
                type="range" min={5} max={240} value={duration}
                onChange={e => setDuration(Number(e.target.value))}
                className="mt-2 w-full accent-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Steps ({steps})</label>
              <input
                type="range" min={4} max={50} value={steps}
                onChange={e => setSteps(Number(e.target.value))}
                className="mt-2 w-full accent-primary"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Guidance ({guidance.toFixed(1)})</label>
              <input
                type="range" min={1} max={15} step={0.5} value={guidance}
                onChange={e => setGuidance(Number(e.target.value))}
                className="mt-2 w-full accent-primary"
              />
            </div>
          </div>

          <Button onClick={handleGenerate} disabled={generating || !prompt.trim()} className="w-full">
            {generating ? (
              <><Loader2 className="h-4 w-4 animate-spin mr-2" /> {status || 'Generating...'}</>
            ) : '▶ Generate Music'}
          </Button>
        </CardContent>
      </Card>

      {/* Result */}
      {audioUrl && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              Result <Badge variant="secondary">ACE-Step</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <audio className="w-full" controls src={audioUrl} />

            <div className="flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[150px]">
                <label className="text-xs text-muted-foreground">Name</label>
                <input
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  value={saveName} onChange={e => setSaveName(e.target.value)}
                  placeholder="My track"
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="text-xs text-muted-foreground">Tags (comma-separated)</label>
                <input
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  value={saveTags} onChange={e => setSaveTags(e.target.value)}
                  placeholder="synthwave, bgm"
                />
              </div>
              <Button onClick={handleSave} disabled={saving} variant="secondary">
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
                Save to Library
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
