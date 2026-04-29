import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@renderer/lib/ui'
import * as React from 'react'

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    className={cn(
      'fixed inset-0 bg-black/80 backdrop-blur-sm will-change-[opacity]',
      'data-[state=open]:animate-dialog-overlay-in data-[state=closed]:animate-dialog-overlay-out',
      className
    )}
    ref={ref}
    {...props}
  />
))

DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

export { DialogOverlay }
