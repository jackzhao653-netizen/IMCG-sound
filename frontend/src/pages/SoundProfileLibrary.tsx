import { useEffect, useRef, useState } from 'react'
import { Library, Loader2, Trash2, Pencil, Check, X, Play, Pause, Zap } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/ui/confirm-dialog'

interface LegacyProfile {
  id: string
  name: string
  description: string
  created: string
}

interface RealProfile {
  id: string
  name: string
  description: string
  created: string
  voice_name?: string
  tags?: string[]
}

function LegacyProfileCard({
  profile,
  onDelete,
  onRename,
}: {
  profile: LegacyProfile
  onDelete: (id: string) => Promise<void>
  onRename: (id: string, name: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [nameInput, setNameInput] = useState(profile.name)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const { confirm, dialog } = useConfirm()

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const handlePlay = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(`/api/profiles/${profile.id}/audio`)
      audioRef.current.onended = () => setPlaying(false)
      audioRef.current.onpause = () => setPlaying(false)
    }
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.currentTime = 0
      audioRef.current.play()
      setPlaying(true)
    }
  }

  const handleRenameConfirm = async () => {
    if (!nameInput.trim() || nameInput.trim() === profile.name) {
      setEditing(false)
      setNameInput(profile.name)
      return
    }
    setSaving(true)
    await onRename(profile.id, nameInput.trim())
    setSaving(false)
    setEditing(false)
  }

  const handleRenameCancel = () => {
    setEditing(false)
    setNameInput(profile.name)
  }

  const handleDelete = async () => {
    const ok = await confirm(`Delete "${profile.name}"? This cannot be undone.`, {
      title: 'Delete Profile',
      variant: 'danger',
    })
    if (!ok) return
    setDeleting(true)
    await onDelete(profile.id)
    setDeleting(false)
  }

  const created = new Date(profile.created).toLocaleString()

  return (
    <>
      {dialog}
      <Card className="border-border bg-card hover:border-primary/40 transition-colors">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <input
                  ref={inputRef}
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameConfirm()
                    if (e.key === 'Escape') handleRenameCancel()
                  }}
                />
                <Button size="icon" variant="ghost" onClick={handleRenameConfirm} disabled={saving} className="h-7 w-7">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 text-green-500" />}
                </Button>
                <Button size="icon" variant="ghost" onClick={handleRenameCancel} className="h-7 w-7">
                  <X className="h-4 w-4 text-muted-foreground" />
                </Button>
              </>
            ) : (
              <>
                <span className="flex-1 font-semibold text-sm truncate">{profile.name}</span>
                <Button size="icon" variant="ghost" onClick={() => setEditing(true)} className="h-7 w-7">
                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">{profile.description}</p>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-zinc-500">{created}</span>
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary">V1</Badge>
              <Button size="icon" variant="outline" onClick={handlePlay} className="h-7 w-7">
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={handleDelete}
                disabled={deleting}
                className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
              >
                {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function RealProfileCard({ profile }: { profile: RealProfile }) {
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const handlePlay = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(`/api/real-profiles/${profile.id}/audio`)
      audioRef.current.onended = () => setPlaying(false)
      audioRef.current.onpause = () => setPlaying(false)
    }
    if (playing) {
      audioRef.current.pause()
      setPlaying(false)
    } else {
      audioRef.current.currentTime = 0
      audioRef.current.play()
      setPlaying(true)
    }
  }

  const created = new Date(profile.created).toLocaleString()

  return (
    <Card className="border-primary/40 bg-primary/5">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-sm truncate">{profile.name}</span>
          <Badge variant="info">real</Badge>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{profile.description}</p>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] text-zinc-500">{created}</span>
          <Button size="icon" variant="outline" onClick={handlePlay} className="h-7 w-7">
            {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
          </Button>
        </div>
        {profile.voice_name && (
          <p className="text-[10px] text-muted-foreground truncate" title={profile.voice_name}>
            {profile.voice_name}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

export default function SoundProfileLibrary() {
  const [profiles, setProfiles] = useState<LegacyProfile[]>([])
  const [realProfiles, setRealProfiles] = useState<RealProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProfiles = async () => {
    setLoading(true)
    try {
      const [legacyResp, realResp] = await Promise.all([
        fetch('/api/profiles'),
        fetch('/api/real-profiles'),
      ])
      if (!legacyResp.ok) throw new Error('Failed to fetch profiles')
      if (!realResp.ok) throw new Error('Failed to fetch real profiles')

      const [legacyData, realData] = await Promise.all([
        legacyResp.json(),
        realResp.json(),
      ])

      setProfiles(Array.isArray(legacyData.profiles) ? legacyData.profiles : [])
      setRealProfiles(Array.isArray(realData.profiles) ? realData.profiles : [])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchProfiles()
    const handler = () => fetchProfiles()
    window.addEventListener('profiles-updated', handler)
    window.addEventListener('real-profiles-updated', handler)
    return () => {
      window.removeEventListener('profiles-updated', handler)
      window.removeEventListener('real-profiles-updated', handler)
    }
  }, [])

  const handleDelete = async (id: string) => {
    try {
      const resp = await fetch(`/api/profiles/${id}`, { method: 'DELETE' })
      if (!resp.ok) throw new Error('Delete failed')
      setProfiles((prev) => prev.filter((p) => p.id !== id))
      window.dispatchEvent(new CustomEvent('profiles-updated'))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed')
    }
  }

  const handleRename = async (id: string, name: string) => {
    try {
      const resp = await fetch(`/api/profiles/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (!resp.ok) throw new Error('Rename failed')
      setProfiles((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
      window.dispatchEvent(new CustomEvent('profiles-updated'))
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Rename failed')
    }
  }

  const total = profiles.length + realProfiles.length

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Library className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Sound Profile Library</h1>
            <p className="text-sm text-muted-foreground">
              Manage saved sound profiles and browse cached real voices
            </p>
          </div>
        </div>
        {total > 0 && (
          <Badge variant="secondary">{total} profile{total !== 1 ? 's' : ''}</Badge>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading profiles...
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && total === 0 && (
        <div className="rounded-md border border-dashed border-border p-10 text-center text-muted-foreground text-sm space-y-2">
          <p>No profiles yet.</p>
          <p>
            Create a V1 profile from <a href="/profiles" className="text-primary underline">Sound Profile Generator</a> or a tagged real profile from{' '}
            <a href="/real-profiles" className="text-primary underline">Real Profile Generator</a>.
          </p>
        </div>
      )}

      {profiles.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">V1 Profiles</h2>
            <Badge variant="outline">{profiles.length}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {profiles.map((p) => (
              <LegacyProfileCard
                key={p.id}
                profile={p}
                onDelete={handleDelete}
                onRename={handleRename}
              />
            ))}
          </div>
        </section>
      )}

      {realProfiles.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Zap className="h-3.5 w-3.5" />
              Real Profiles
            </h2>
            <Badge variant="outline">{realProfiles.length}</Badge>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {realProfiles.map((p) => (
              <RealProfileCard key={p.id} profile={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
