import {cn, scrollbarClass, subtleLabelClass} from '@renderer/lib/ui'
import {Check, ChevronDown, type LucideIcon} from 'lucide-react'
import {type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState} from 'react'

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
    const [activeValue, setActiveValue] = useState<string | null>(null)
    const preferredMenuMaxHeight = size === 'field' ? 300 : 364
    const [menuMaxHeight, setMenuMaxHeight] = useState<number>(preferredMenuMaxHeight)
    const [menuPlacement, setMenuPlacement] = useState<'bottom' | 'top'>('bottom')
    const anchorRef = useRef<HTMLDivElement | null>(null)
    const menuRef = useRef<HTMLDivElement | null>(null)
    const optionRefs = useRef<Record<string, HTMLButtonElement | null>>({})
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

    function getDefaultActiveValue(preferredBoundary: 'first' | 'last' = 'first'): string | null {
        const selectedFilteredOption =
            filteredOptions.find((option) => option.value === selectedValue) ?? null

        if (selectedFilteredOption) {
            return selectedFilteredOption.value
        }

        if (filteredOptions.length === 0) {
            return null
        }

        return preferredBoundary === 'last'
            ? filteredOptions[filteredOptions.length - 1].value
            : filteredOptions[0].value
    }

    function moveActive(direction: -1 | 1): void {
        if (filteredOptions.length === 0) {
            return
        }

        const currentIndex = filteredOptions.findIndex((option) => option.value === activeValue)

        if (currentIndex === -1) {
            setActiveValue(getDefaultActiveValue(direction === -1 ? 'last' : 'first'))
            return
        }

        const nextIndex =
            (currentIndex + direction + filteredOptions.length) % filteredOptions.length

        setActiveValue(filteredOptions[nextIndex].value)
    }

    function handleDropdownKeyDown(event: ReactKeyboardEvent<HTMLInputElement | HTMLButtonElement>): void {
        if (event.key === 'ArrowDown') {
            event.preventDefault()

            if (!open) {
                setOpenState(true)
                setActiveValue(getDefaultActiveValue('first'))
                return
            }

            moveActive(1)
            return
        }

        if (event.key === 'ArrowUp') {
            event.preventDefault()

            if (!open) {
                setOpenState(true)
                setActiveValue(getDefaultActiveValue('last'))
                return
            }

            moveActive(-1)
            return
        }

        if (event.key === 'Home' && open) {
            event.preventDefault()
            setActiveValue(filteredOptions[0]?.value ?? null)
            return
        }

        if (event.key === 'End' && open) {
            event.preventDefault()
            setActiveValue(filteredOptions[filteredOptions.length - 1]?.value ?? null)
            return
        }

        if (event.key === 'Enter') {
            if (!open) {
                event.preventDefault()
                setOpenState(true)
                setActiveValue(getDefaultActiveValue('first'))
                return
            }

            if (activeValue) {
                event.preventDefault()
                handleOptionSelect(activeValue)
            }

            return
        }

        if (event.key === 'Escape' && open) {
            event.preventDefault()
            setOpenState(false)
        }
    }

    useEffect(() => {
        setMenuMaxHeight(preferredMenuMaxHeight)
    }, [preferredMenuMaxHeight])

    useEffect(() => {
        if (disabled) {
            setOpenState(false)
        }
    }, [disabled])

    useEffect(() => {
        if (
            autoOpenSignal === undefined ||
            autoOpenSignal <= 0 ||
            autoOpenSignal === handledAutoOpenSignalRef.current
        ) {
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
            setActiveValue(null)
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
        if (!open) {
            return
        }

        const activeStillVisible =
            activeValue !== null &&
            filteredOptions.some((option) => option.value === activeValue)

        if (activeStillVisible) {
            return
        }

        setActiveValue(getDefaultActiveValue())
    }, [activeValue, filteredOptions, open, selectedValue])

    useEffect(() => {
        if (!open) {
            return
        }

        function updateMenuLayout(): void {
            if (!anchorRef.current || !menuRef.current) {
                return
            }

            const viewportPadding = 16
            const menuGap = 8
            const anchorRect = anchorRef.current.getBoundingClientRect()
            const menuHeight = menuRef.current.offsetHeight
            const availableAbove = Math.max(anchorRect.top - viewportPadding - menuGap, 0)
            const availableBelow = Math.max(
                window.innerHeight - anchorRect.bottom - viewportPadding - menuGap,
                0
            )
            const shouldOpenUpward =
                availableBelow < menuHeight && availableAbove > availableBelow
            const nextPlacement = shouldOpenUpward ? 'top' : 'bottom'
            const nextMaxHeight = Math.min(
                shouldOpenUpward ? availableAbove : availableBelow,
                preferredMenuMaxHeight
            )

            setMenuPlacement(nextPlacement)
            setMenuMaxHeight(nextMaxHeight)
        }

        const nextFrame = window.requestAnimationFrame(updateMenuLayout)

        window.addEventListener('resize', updateMenuLayout)
        window.addEventListener('scroll', updateMenuLayout, true)

        return () => {
            window.cancelAnimationFrame(nextFrame)
            window.removeEventListener('resize', updateMenuLayout)
            window.removeEventListener('scroll', updateMenuLayout, true)
        }
    }, [filteredOptions.length, open, preferredMenuMaxHeight, showSearch])

    useEffect(() => {
        if (!open || !showSearch) {
            return
        }

        const nextFrame = window.requestAnimationFrame(() => {
            searchInputRef.current?.focus()
        })

        return () => window.cancelAnimationFrame(nextFrame)
    }, [open, showSearch])

    useEffect(() => {
        if (!open || !activeValue) {
            return
        }

        const nextFrame = window.requestAnimationFrame(() => {
            optionRefs.current[activeValue]?.scrollIntoView({
                block: 'nearest'
            })
        })

        return () => window.cancelAnimationFrame(nextFrame)
    }, [activeValue, open])

    function handleOptionSelect(value: string): void {
        onSelect(value)
        setOpenState(false)
    }

    return (
        <div className="flex min-w-0 flex-col gap-1.5" ref={rootRef}>
            <span className={subtleLabelClass}>{label}</span>

            <div className="relative min-w-0" ref={anchorRef}>
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
                    onKeyDown={handleDropdownKeyDown}
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
                            'absolute z-30 flex max-w-[min(560px,calc(100vw-48px))] min-w-full flex-col gap-2 rounded-2xl border border-studio-border-strong bg-[#0d0d0d] p-2.5 shadow-[0_18px_40px_rgba(0,0,0,0.38)]',
                            menuPlacement === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2',
                            align === 'end' ? 'right-0' : 'left-0',
                            wideMenu && 'min-w-[min(520px,calc(100vw-48px))]'
                        )}
                        ref={menuRef}
                        style={{
                            maxHeight: `${menuMaxHeight}px`
                        }}
                    >
                        {showSearch ? (
                            <div>
                                <input
                                    className="h-[38px] w-full rounded-[11px] border border-studio-border bg-[#121212] px-3 text-xs text-studio-text outline-none transition placeholder:text-studio-muted focus:border-studio-border-strong"
                                    onChange={(event) => setQuery(event.target.value)}
                                    onKeyDown={handleDropdownKeyDown}
                                    placeholder={searchPlaceholder}
                                    ref={searchInputRef}
                                    type="text"
                                    value={query}
                                />
                            </div>
                        ) : null}

                        <div className={cn('py-1.5 min-h-0 flex-1 flex flex-col gap-1.5 overflow-y-auto pr-1', scrollbarClass)}>
                            {filteredOptions.length === 0 ? (
                                <div className="p-3 text-center text-xs text-studio-muted">{emptyMessage}</div>
                            ) : (
                            filteredOptions.map((option, index) => {
                                const isActive = option.value === activeValue
                                const isSelected = option.value === selectedValue
                                const OptionIcon = option.icon ?? optionIcon ?? Icon
                                const orderLabel = String(index + 1).padStart(2, '0')

                                return (
                                    <button
                                        aria-selected={isSelected}
                                            className={cn(
                                                'flex w-full items-start justify-between gap-3 rounded-xl border border-transparent bg-white/[0.04] px-[11px] py-[9px] text-left text-studio-muted-strong transition duration-150 hover:border-studio-border-strong hover:bg-white/[0.06]',
                                                isActive && 'border-studio-amber/45 bg-white/[0.08] text-studio-text',
                                                isSelected && 'border-sky-300/25 bg-studio-blue text-studio-text'
                                            )}
                                            key={option.value}
                                            onFocus={() => setActiveValue(option.value)}
                                            onMouseEnter={() => setActiveValue(option.value)}
                                            onClick={() => handleOptionSelect(option.value)}
                                            onKeyDown={handleDropdownKeyDown}
                                            ref={(element) => {
                                                optionRefs.current[option.value] = element
                                            }}
                                            role="option"
                                        title={option.value}
                                        type="button"
                                    >
                                        <span className="flex min-w-0 items-start gap-2.5">
                                            <span className="w-6 flex-none pt-2 text-center text-[10px] font-medium tabular-nums leading-none text-studio-muted">
                                                {orderLabel}
                                            </span>

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
                                                <span
                                                    className={cn(
                                                        'mt-px inline-flex flex-none items-center justify-center',
                                                        isActive ? 'text-studio-text' : 'text-studio-blue'
                                                    )}
                                                >
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
        </div>
    )
}

export default TargetDropdown
