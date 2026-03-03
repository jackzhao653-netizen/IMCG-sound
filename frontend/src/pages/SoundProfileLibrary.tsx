import { useState, useEffect, useRef } from 'react'
import { Library, Loader2, Trash2, Pencil, Check, X, Play, Pause } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useConfirm } from '@/components/ui/confirm-dialog'

interface Profile {
  id: string
  name: string
  description: string
  created: string
}

function ProfileCard({
  profile,
  onDelete,
  onRename,
}: {
  profile: Profile
  onDelete: (id: string) => void
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
    onDelete(profile.id)
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

export default function SoundProfileLibrary() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchProfiles = async () => {
    try {
      const resp = await fetch('/api/profiles')
      if (!resp.ok) throw new Error('Failed to fetch profiles')
      const data = await resp.json()
      setProfiles(data.profiles || [])
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
    return () => window.removeEventListener('profiles-updated', handler)
  }, [])

  const handleDelete = async (id: string) => {
    try {
      const resp = await fetch(`/api/profiles/${id}`, { method: 'DELETE' })
      if (!resp.ok) throw new Error('Delete failed')
      setProfiles((prev) => prev.filter((p) => p.id !== id))
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
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Rename failed')
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Library className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Sound Profile Library</h1>
            <p className="text-sm text-muted-foreground">
              Manage your saved voice profiles — play, rename, or delete
            </p>
          </div>
        </div>
        {profiles.length > 0 && (
          <Badge variant="secondary">{profiles.length} profile{profiles.length !== 1 ? 's' : ''}</Badge>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading profiles…
        </div>
      )}

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {!loading && !error && profiles.length === 0 && (
        <div className="rounded-md border border-dashed border-border p-10 text-center text-muted-foreground text-sm">
          No profiles yet — generate and save one from the{' '}
          <a href="/profiles" className="text-primary underline">
            Sound Profile Generator
          </a>
          .
        </div>
      )}

      {profiles.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {profiles.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          ))}
        </div>
      )}
    </div>
  )
}
