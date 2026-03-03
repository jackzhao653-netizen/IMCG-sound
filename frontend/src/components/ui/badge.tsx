import * as React from 'react'
import { cn } from '@/lib/utils'

const badgeVariants = {
  default: 'bg-primary text-primary-foreground border-transparent',
  secondary: 'bg-secondary text-secondary-foreground border-transparent',
  destructive: 'bg-destructive text-white border-transparent',
  outline: 'text-foreground border-border',
  success: 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30',
  warning: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
  info: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
}

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: keyof typeof badgeVariants
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors',
        badgeVariants[variant],
        className,
      )}
      {...props}
    />
  )
}

export { Badge }
