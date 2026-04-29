import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { cn } from '@renderer/lib/ui'
import * as React from 'react'
import { Checkbox } from './checkbox-root'

interface CheckboxFieldProps extends React.ComponentProps<typeof CheckboxPrimitive.Root> {
  checkboxClassName?: string
  children: React.ReactNode
  labelClassName?: string
}

function CheckboxField({
  checkboxClassName,
  children,
  className,
  disabled,
  id,
  labelClassName,
  ...props
}: CheckboxFieldProps) {
  const generatedId = React.useId()
  const checkboxId = id ?? generatedId

  return (
    <label
      className={cn(
        'inline-flex items-center gap-2 text-sm text-studio-muted select-none',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        className
      )}
      htmlFor={checkboxId}
    >
      <Checkbox
        className={checkboxClassName}
        disabled={disabled}
        id={checkboxId}
        {...props}
      />
      <span className={labelClassName}>{children}</span>
    </label>
  )
}

export { CheckboxField }
