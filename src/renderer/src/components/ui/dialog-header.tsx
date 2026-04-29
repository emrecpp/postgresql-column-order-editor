import { cn } from '@renderer/lib/ui'
import * as React from 'react'

function DialogHeader({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-4 flex flex-col gap-1', className)} {...props} />
}

export { DialogHeader }
