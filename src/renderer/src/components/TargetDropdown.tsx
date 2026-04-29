import {cn, scrollbarClass, subtleLabelClass} from '@renderer/lib/ui'
import {Check, ChevronDown, type LucideIcon} from 'lucide-react'
import {useEffect, useMemo, useRef, useState} from 'react'

export interface TargetDropdownOption {
    icon?: LucideIcon
    meta?: string
    value: string
}

interface TargetDropdownProps {
    align?: 'end' | 'start'
    autoOpenSignal?: number
    disabled?: boolean
    emptyMessage?: string
    hint: string
    icon: LucideIcon
    label: string
    onOpenChange?: (open: boolean) => void
    onSelect: (value: string) => void
    options: TargetDropdownOption[]
    placeholder?: string
    searchPlaceholder?: string
    selectedValue: string
    size?: 'default' | 'field'
    tone?: 'default' | 'schema'
    optionIcon?: LucideIcon
    onTriggerFocus?: () => void
    wideMenu?: boolean
}

function TargetDropdown({
    align = 'start',
    autoOpenSignal,
    disabled = false,
    emptyMessage = 'No results found.',
    hint,
    icon: Icon,
    label,
    onOpenChange,
    onSelect,
    options,
    placeholder = 'Select an option',
    searchPlaceholder,
    selectedValue,
    size = 'default',
    tone = 'default',
    optionIcon,
    onTriggerFocus,
    wideMenu = false
}: TargetDropdownProps) {
    const [open, setOpen] = useState(false)
    const [query, setQuery] = useState('')
    const rootRef = useRef<HTMLDivElement | null>(null)
    const searchInputRef = useRef<HTMLInputElement | null>(null)
    const handledAutoOpenSignalRef = useRef<number | null>(null)

    const showSearch = Boolean(searchPlaceholder) && options.length > 7
    const selectedOption = options.find((option) => option.value === selectedValue) ?? null

    function setOpenState(nextOpen: boolean): void {
        setOpen(nextOpen)
        onOpenChange?.(nextOpen)
    }

    const filteredOptions = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase()

        if (!normalizedQuery) {
            return options
        }

        return options.filter((option) => {
            const valueMatch = option.value.toLowerCase().includes(normalizedQuery)
            const metaMatch = option.meta?.toLowerCase().includes(normalizedQuery) ?? false
            return valueMatch || metaMatch
        })
    }, [options, query])

    useEffect(() => {
        if (disabled) {
            setOpenState(false)
        }
    }, [disabled])

    useEffect(() => {
        if (autoOpenSignal === undefined || autoOpenSignal === handledAutoOpenSignalRef.current) {
            return
        }

        if (disabled) {
            return
        }

        handledAutoOpenSignalRef.current = autoOpenSignal
        setOpenState(true)
    }, [autoOpenSignal, disabled])

    useEffect(() => {
        if (!open) {
            setQuery('')
            return
        }

        function handlePointerDown(event: MouseEvent): void {
            if (!rootRef.current?.contains(event.target as Node)) {
                setOpenState(false)
            }
        }

        function handleKeyDown(event: KeyboardEvent): void {
            if (event.key === 'Escape') {
                setOpenState(false)
            }
        }

        window.addEventListener('mousedown', handlePointerDown)
        window.addEventListener('keydown', handleKeyDown)

        return () => {
            window.removeEventListener('mousedown', handlePointerDown)
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [open])

    useEffect(() => {
        if (!open || !showSearch) {
            return
        }

        const nextFrame = window.requestAnimationFrame(() => {
            searchInputRef.current?.focus()
        })

        return () => window.cancelAnimationFrame(nextFrame)
    }, [open, showSearch])

    function handleOptionSelect(value: string): void {
        onSelect(value)
        setOpenState(false)
    }

    return (
        <div className="relative flex min-w-0 flex-col gap-1.5" ref={rootRef}>
            <span className={subtleLabelClass}>{label}</span>

            <button
                aria-expanded={open}
                className={cn(
                    'py-2 grid w-full items-center rounded-xl border bg-studio-panel-soft text-left text-studio-text transition duration-150 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
                    size === 'field'
                        ? 'min-h-10 grid-cols-[30px,minmax(0,1fr),16px] gap-2 px-3 py-0'
                        : 'min-h-[46px] grid-cols-[34px,minmax(0,1fr),16px] gap-2.5 px-[11px] py-[9px]',
                    open
                        ? 'border-studio-border-strong bg-[#121212]'
                        : 'border-studio-border',
                    tone === 'schema' && !open && 'border-studio-amber/20',
                    tone === 'schema' && open && 'border-studio-amber/35'
                )}
                disabled={disabled}
                onClick={() => setOpenState(!open)}
                onFocus={onTriggerFocus}
                type="button"
            >
                <span
                    className={cn(
                        'inline-flex items-center justify-center border bg-white/[0.04]',
                        size === 'field' ? 'h-[30px] w-[30px] rounded-[10px]' : 'h-[34px] w-[34px] rounded-[11px]',
                        tone === 'schema'
                            ? 'border-studio-amber/20 bg-studio-amber/10 text-studio-amber'
                            : 'border-studio-border text-studio-frost'
                    )}
                >
                    <Icon size={14} />
                </span>

                <span className="flex min-w-0 flex-col gap-0.5">
                    <span
                        className={cn(
                            'truncate text-[13px] leading-tight',
                            selectedOption ? 'font-semibold text-studio-text' : 'font-medium text-studio-muted',
                            tone === 'schema' && !open && '!text-studio-amber',
                        )}
                    >
                        {selectedOption?.value ?? placeholder}
                    </span>
                    <span className="text-[11px] text-studio-muted">{hint}</span>
                </span>

                <span className={cn('inline-flex items-center justify-center text-studio-muted transition', open && 'rotate-180')}>
                    <ChevronDown size={15} />
                </span>
            </button>

            {open ? (
                <div
                    className={cn(
                        'absolute top-full z-30 mt-2 flex max-w-[min(560px,calc(100vw-48px))] min-w-full flex-col gap-2 rounded-2xl border border-studio-border-strong bg-[#0d0d0d] p-2.5 shadow-[0_18px_40px_rgba(0,0,0,0.38)]',
                        align === 'end' ? 'right-0' : 'left-0',
                        wideMenu && 'min-w-[min(520px,calc(100vw-48px))]'
                    )}
                >
                    {showSearch ? (
                        <div>
                            <input
                                className="h-[38px] w-full rounded-[11px] border border-studio-border bg-[#121212] px-3 text-xs text-studio-text outline-none transition placeholder:text-studio-muted focus:border-studio-border-strong"
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder={searchPlaceholder}
                                ref={searchInputRef}
                                type="text"
                                value={query}
                            />
                        </div>
                    ) : null}

                    <div className={cn('pb-1 flex max-h-[260px] flex-col gap-1.5 overflow-y-auto pr-1', scrollbarClass)}>
                        {filteredOptions.length === 0 ? (
                            <div className="p-3 text-center text-xs text-studio-muted">{emptyMessage}</div>
                        ) : (
                            filteredOptions.map((option) => {
                                const isSelected = option.value === selectedValue
                                const OptionIcon = option.icon ?? optionIcon ?? Icon

                                return (
                                    <button
                                        className={cn(
                                            'flex w-full items-start justify-between gap-3 rounded-xl border border-transparent bg-white/[0.04] px-[11px] py-[9px] text-left text-studio-muted-strong transition duration-150 hover:border-studio-border-strong hover:bg-white/[0.06]',
                                            isSelected && 'border-sky-300/25 bg-studio-blue text-studio-text'
                                        )}
                                        key={option.value}
                                        onClick={() => handleOptionSelect(option.value)}
                                        title={option.value}
                                        type="button"
                                    >
                                        <span className="flex min-w-0 items-start gap-2.5">
                                            <span
                                                className={cn(
                                                    'inline-flex h-8 w-8 flex-none items-center justify-center rounded-[10px] border bg-white/[0.04]',
                                                    tone === 'schema'
                                                        ? 'border-studio-amber/20 bg-studio-amber/10 text-studio-amber'
                                                        : 'border-studio-border text-studio-frost'
                                                )}
                                            >
                                                <OptionIcon size={14} />
                                            </span>

                                            <span className="flex min-w-0 flex-col gap-0.5 pt-0.5">
                                                <span className="truncate text-[11px] font-semibold leading-tight text-inherit">
                                                    {option.value}
                                                </span>
                                                {option.meta ? (
                                                    <span className="text-[11px] text-studio-muted">{option.meta}</span>
                                                ) : null}
                                            </span>
                                        </span>

                                        {isSelected ? (
                                            <span className="mt-px inline-flex flex-none items-center justify-center text-studio-blue">
                                                <Check size={14} />
                                            </span>
                                        ) : null}
                                    </button>
                                )
                            })
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    )
}

export default TargetDropdown
