import { useState, useCallback, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'
import { Button } from './button'

interface ConfirmDialogProps {
  open: boolean
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'default'
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'default',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) cancelRef.current?.focus()
  }, [open])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onCancel])

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onCancel}
      />
      {/* Dialog */}
      <div className="relative z-10 w-full max-w-sm mx-4 rounded-xl border border-border bg-card shadow-2xl p-6 space-y-4 animate-in fade-in-0 zoom-in-95 duration-150">
        <div className="flex items-start gap-3">
          {variant === 'danger' && (
            <div className="shrink-0 mt-0.5 rounded-full bg-destructive/15 p-1.5">
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </div>
          )}
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="text-sm text-muted-foreground">{message}</p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button ref={cancelRef} variant="ghost" size="sm" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            variant={variant === 'danger' ? 'destructive' : 'default'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// Hook for imperative usage: await confirm('Are you sure?')
export function useConfirm() {
  const [state, setState] = useState<{
    open: boolean
    title?: string
    message: string
    variant?: 'danger' | 'default'
    resolve?: (value: boolean) => void
  }>({ open: false, message: '' })

  const confirm = useCallback(
    (message: string, options?: { title?: string; variant?: 'danger' | 'default' }) =>
      new Promise<boolean>((resolve) => {
        setState({ open: true, message, ...options, resolve })
      }),
    []
  )

  const dialog = (
    <ConfirmDialog
      open={state.open}
      title={state.title}
      message={state.message}
      variant={state.variant}
      confirmLabel={state.variant === 'danger' ? 'Delete' : 'Confirm'}
      onConfirm={() => {
        setState((s) => ({ ...s, open: false }))
        state.resolve?.(true)
      }}
      onCancel={() => {
        setState((s) => ({ ...s, open: false }))
        state.resolve?.(false)
      }}
    />
  )

  return { confirm, dialog }
}
