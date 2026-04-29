import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { cn } from '@renderer/lib/ui'
import { CheckIcon } from 'lucide-react'
import * as React from 'react'

function Checkbox({
  className,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer relative flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border border-studio-border bg-[#101010] text-studio-text outline-none transition duration-150 hover:border-studio-border-strong focus-visible:ring-2 focus-visible:ring-sky-300/20 disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:border-white data-[state=checked]:bg-white data-[state=checked]:text-[#050505]',
        'select-none cursor-pointer',
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-3"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
