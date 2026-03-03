import * as React from 'react'
import { cn } from '@/lib/utils'

interface SliderProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: number
  onValueChange?: (value: number) => void
  min?: number
  max?: number
  step?: number
  label?: string
  showValue?: boolean
}

function Slider({ value, onValueChange, min = 0, max = 100, step = 1, label, showValue = true, className, ...props }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{label}</span>
          {showValue && <span className="font-mono text-foreground">{value}</span>}
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onValueChange?.(Number(e.target.value))}
        className="w-full appearance-none h-2 rounded-full bg-secondary cursor-pointer accent-primary"
        style={{
          background: `linear-gradient(to right, var(--color-primary) 0%, var(--color-primary) ${pct}%, var(--color-secondary) ${pct}%, var(--color-secondary) 100%)`,
        }}
        {...props}
      />
    </div>
  )
}

export { Slider }
