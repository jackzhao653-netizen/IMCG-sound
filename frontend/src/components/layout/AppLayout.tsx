import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { Mic, Library, Film, Activity, AudioWaveform } from 'lucide-react'
import { useEffect, useState } from 'react'

const navItems = [
  { to: '/tts', icon: Mic, label: 'Text-to-Speech' },
  { to: '/music', icon: Library, label: 'Sound Profiles' },
  { to: '/profiles', icon: AudioWaveform, label: 'Profiles' },
  { to: '/library', icon: Film, label: 'Media Library' },
]

interface Health {
  server: string
  qwen3_tts: string
  ace_step: string
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'ok' ? 'bg-green-400 shadow-[0_0_6px_theme(colors.green.400)]' :
    status === 'offline' || status === 'not_loaded' ? 'bg-zinc-500' :
    'bg-yellow-400 shadow-[0_0_6px_theme(colors.yellow.400)]'
  return <span className={cn('inline-block w-2 h-2 rounded-full shrink-0', color)} />
}

export default function AppLayout() {
  const [health, setHealth] = useState<Health | null>(null)

  useEffect(() => {
    const fetchHealth = () => {
      fetch('/api/health').then(r => r.json()).then(setHealth).catch(() => {})
    }
    fetchHealth()
    const interval = setInterval(fetchHealth, 15000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col border-r border-border bg-card">
        {/* Logo */}
        <div className="flex items-center gap-2.5 p-4 border-b border-border">
          <span className="text-2xl">🎵</span>
          <span className="text-lg font-bold text-primary">IMCG Sound</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Health status footer */}
        <div className="border-t border-border p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Activity className="h-3 w-3" />
            <span className="font-semibold uppercase tracking-wider text-[10px]">Services</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <StatusDot status={health?.server || 'unknown'} />
                Server
              </div>
              <span className="text-[10px] text-zinc-500">{health?.server || '…'}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <StatusDot status={health?.qwen3_tts || 'unknown'} />
                Qwen3-TTS
              </div>
              <span className="text-[10px] text-zinc-500">{health?.qwen3_tts || '…'}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-muted-foreground">
                <StatusDot status={health?.ace_step || 'unknown'} />
                ACE-Step
              </div>
              <span className="text-[10px] text-zinc-500">{health?.ace_step || '…'}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
