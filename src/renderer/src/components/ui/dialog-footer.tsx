import { cn } from '@renderer/lib/ui'
import * as React from 'react'

function DialogFooter({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'mt-[18px] flex items-center justify-end gap-2 max-[720px]:flex-col max-[720px]:items-stretch',
        className
      )}
      {...props}
    />
  )
}

export { DialogFooter }
