import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@renderer/lib/ui'
import * as React from 'react'

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    className={cn('text-[13px] text-studio-muted', className)}
    ref={ref}
    {...props}
  />
))

DialogDescription.displayName = DialogPrimitive.Description.displayName

export { DialogDescription }
