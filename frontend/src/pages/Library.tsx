import { useState, useEffect, useCallback } from 'react'
import { Film, Loader2, Trash2, Download, Search, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface LibraryItem {
  id: string
  name: string
  type: 'tts' | 'music' | string
  prompt: string
  duration: number
  created_at: string
  tags: string[]
  file_path: string
}

export default function Library() {
  const [items, setItems] = useState<LibraryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string>('all')

  const loadLibrary = useCallback(async () => {
    setLoading(true)
    try {
      const resp = await fetch('/api/library')
      const data = await resp.json()
      setItems(Array.isArray(data.items) ? data.items : [])
    } catch {
      setItems([])
    }
    setLoading(false)
  }, [])

  useEffect(() => { loadLibrary() }, [loadLibrary])

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this item?')) return
    try {
      await fetch(`/api/library/${id}`, { method: 'DELETE' })
      loadLibrary()
    } catch {
      alert('Delete failed')
    }
  }

  const filtered = items.filter(item => {
    if (filterType !== 'all' && item.type !== filterType) return false
    if (search) {
      const q = search.toLowerCase()
      return item.name.toLowerCase().includes(q) ||
        item.prompt.toLowerCase().includes(q) ||
        item.tags.some(t => t.toLowerCase().includes(q))
    }
    return true
  })

  const typeCounts = {
    all: items.length,
    tts: items.filter(i => i.type === 'tts').length,
    music: items.filter(i => i.type === 'music').length,
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Film className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Media Library</h1>
          <p className="text-sm text-muted-foreground">Browse, play, and manage your generated audio</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            className="w-full rounded-md border border-border bg-card pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Search by name, prompt, or tag..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1">
          {(['all', 'tts', 'music'] as const).map(t => (
            <Button
              key={t}
              variant={filterType === t ? 'default' : 'secondary'}
              size="sm"
              onClick={() => setFilterType(t)}
            >
              {t === 'all' ? 'All' : t.toUpperCase()} ({typeCounts[t]})
            </Button>
          ))}
        </div>
        <Button variant="secondary" size="sm" onClick={loadLibrary}>
          <RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh
        </Button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="mt-3 text-sm">Loading library...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <span className="text-4xl mb-3">{search || filterType !== 'all' ? '🔍' : '🎵'}</span>
          <p className="text-sm">{search || filterType !== 'all' ? 'No items match your filter.' : 'No saved audio yet. Generate something and save it!'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(item => (
            <Card key={item.id} className="overflow-hidden">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="text-sm font-medium truncate">{item.name}</span>
                  <Badge variant={item.type === 'tts' ? 'default' : 'secondary'}>
                    {item.type.toUpperCase()}
                  </Badge>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{new Date(item.created_at).toLocaleDateString()}</span>
                  {item.duration > 0 && <span>{item.duration.toFixed(1)}s</span>}
                </div>

                {item.prompt && (
                  <p className="text-xs text-muted-foreground line-clamp-2 italic">"{item.prompt}"</p>
                )}

                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.tags.map((tag, i) => (
                      <Badge key={i} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                    ))}
                  </div>
                )}

                <audio className="w-full h-8" controls src={`/api/library/${item.id}/audio`} preload="none" />

                <div className="flex gap-2">
                  <a href={`/api/library/${item.id}/audio`} download={`${item.name}.wav`}>
                    <Button variant="secondary" size="sm">
                      <Download className="h-3.5 w-3.5 mr-1" /> Download
                    </Button>
                  </a>
                  <Button variant="secondary" size="sm" onClick={() => handleDelete(item.id)} className="text-destructive hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        {filtered.length} item{filtered.length !== 1 ? 's' : ''}
        {filterType !== 'all' && ` (filtered from ${items.length})`}
      </div>
    </div>
  )
}
