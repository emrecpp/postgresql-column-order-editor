import * as DialogPrimitive from '@radix-ui/react-dialog'
import { cn } from '@renderer/lib/ui'
import { X } from 'lucide-react'
import * as React from 'react'
import { DialogPortal } from './dialog-primitives'
import { DialogOverlay } from './dialog-overlay'

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ children, className, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      className={cn(
        'fixed left-1/2 top-1/2 z-50 w-[min(560px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-[18px] border border-studio-border-strong bg-[#0c0c0c] p-[18px] shadow-studio will-change-[opacity,transform]',
        'data-[state=open]:animate-dialog-content-in data-[state=closed]:animate-dialog-content-out',
        className
      )}
      ref={ref}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-3.5 top-3.5 grid h-[30px] w-[30px] place-items-center rounded-full border border-studio-border bg-transparent text-studio-muted-strong transition hover:border-studio-border-strong">
        <X size={16} />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))

DialogContent.displayName = DialogPrimitive.Content.displayName

export { DialogContent }
