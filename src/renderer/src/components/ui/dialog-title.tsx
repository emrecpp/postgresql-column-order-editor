import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@renderer/lib/ui'
import * as React from 'react'

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    className={cn('text-lg font-semibold tracking-[-0.02em] text-studio-text', className)}
    ref={ref}
    {...props}
  />
))

DialogTitle.displayName = DialogPrimitive.Title.displayName

export { DialogTitle }
