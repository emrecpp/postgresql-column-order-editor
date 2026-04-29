import type {BusyState} from '@renderer/hooks/useReorderWorkspace'
import {
    buttonGhostClass,
    buttonPrimaryClass,
    buttonSquareClass,
    cn,
    emptyStateClass,
    scrollbarClass,
    shellPanelClass
} from '@renderer/lib/ui'
import {tableMeta} from '@renderer/lib/workspace'
import type {StoredSession, TableSnapshot} from '@shared/contracts'
import {Cable, ChevronDown, ChevronRight, Ellipsis, FileDown, FileUp, PencilLine, PlugZap, Plus, Table2, Trash2, Unplug} from 'lucide-react'
import {type MouseEvent, useEffect, useMemo, useRef, useState} from 'react'

interface SessionSidebarProps {
    busy: BusyState
    connectedSessionId: string | null
    expandedSchemas: string[]
    onCreate: () => void
    onDelete: () => void
    onDisconnect: () => void
    onEdit: () => void
    onRequestEditSession: (session: StoredSession) => void
    onExportSessions: () => void
    onImportSessions: () => void
    onRequestDeleteSession: (session: StoredSession) => void
    onSelectSession: (session: StoredSession) => void
    onSelectTable: (schema: string, table: string) => void
    onToggleSchema: (schema: string) => void
    selectedSession: StoredSession | null
    selectedSessionId: string | null
    sessions: StoredSession[]
    snapshot: TableSnapshot | null
}

function GitHubMark() {
    return (
        <svg
            aria-hidden="true"
            className="h-3.5 w-3.5"
            fill="currentColor"
            viewBox="0 0 24 24"
        >
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.426 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.866-.013-1.7-2.782.605-3.369-1.344-3.369-1.344-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.071 1.531 1.032 1.531 1.032.892 1.529 2.341 1.087 2.91.832.091-.647.349-1.087.636-1.337-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.58 9.58 0 0 1 2.504.337c1.909-1.296 2.747-1.026 2.747-1.026.546 1.378.202 2.397.1 2.65.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.31.678.92.678 1.855 0 1.338-.013 2.419-.013 2.747 0 .268.18.58.688.482A10.019 10.019 0 0 0 22 12.017C22 6.484 17.523 2 12 2Z" />
        </svg>
    )
}

function SessionSidebar({
    busy,
    connectedSessionId,
    expandedSchemas,
    onCreate,
    onDelete,
    onDisconnect,
    onEdit,
    onRequestEditSession,
    onExportSessions,
    onImportSessions,
    onRequestDeleteSession,
    onSelectSession,
    onSelectTable,
    onToggleSchema,
    selectedSession,
    selectedSessionId,
    sessions,
    snapshot
}: SessionSidebarProps) {
    const treeSchemas = snapshot?.databaseTree.schemas ?? []
    const actionsMenuRef = useRef<HTMLDivElement | null>(null)
    const schemaRefs = useRef<Record<string, HTMLDivElement | null>>({})
    const sessionContextMenuRef = useRef<HTMLDivElement | null>(null)
    const disableSessionActions =
        busy === 'connecting' || busy === 'applying' || busy === 'saving'
    const canDisconnect = connectedSessionId !== null && !disableSessionActions
    const [focusedSchemaName, setFocusedSchemaName] = useState<string | null>(null)
    const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
    const [sessionContextMenu, setSessionContextMenu] = useState<{
        session: StoredSession
        x: number
        y: number
    } | null>(null)

    const activeSchemaName = focusedSchemaName ?? snapshot?.target?.schema ?? treeSchemas[0]?.name ?? null

    const orderedSchemas = useMemo(() => {
        if (!activeSchemaName) {
            return treeSchemas
        }

        const activeSchema = treeSchemas.find((schemaNode) => schemaNode.name === activeSchemaName)
        const remainingSchemas = treeSchemas.filter((schemaNode) => schemaNode.name !== activeSchemaName)
        return activeSchema ? [activeSchema, ...remainingSchemas] : treeSchemas
    }, [activeSchemaName, treeSchemas])

    useEffect(() => {
        if (!snapshot) {
            setFocusedSchemaName(null)
            return
        }

        setFocusedSchemaName(snapshot.target?.schema ?? treeSchemas[0]?.name ?? null)
    }, [snapshot?.target?.schema, snapshot, treeSchemas])

    useEffect(() => {
        if (!activeSchemaName) {
            return
        }

        const nextFrame = window.requestAnimationFrame(() => {
            schemaRefs.current[activeSchemaName]?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            })
        })

        return () => window.cancelAnimationFrame(nextFrame)
    }, [activeSchemaName, expandedSchemas])

    useEffect(() => {
        if (!actionsMenuOpen) {
            return
        }

        function handlePointerDown(event: globalThis.MouseEvent): void {
            if (actionsMenuRef.current?.contains(event.target as Node)) {
                return
            }

            setActionsMenuOpen(false)
        }

        function handleKeyDown(event: KeyboardEvent): void {
            if (event.key === 'Escape') {
                setActionsMenuOpen(false)
            }
        }

        window.addEventListener('mousedown', handlePointerDown)
        window.addEventListener('keydown', handleKeyDown)

        return () => {
            window.removeEventListener('mousedown', handlePointerDown)
            window.removeEventListener('keydown', handleKeyDown)
        }
    }, [actionsMenuOpen])

    useEffect(() => {
        if (!sessionContextMenu) {
            return
        }

        function handlePointerDown(event: globalThis.MouseEvent): void {
            if (sessionContextMenuRef.current?.contains(event.target as Node)) {
                return
            }

            setSessionContextMenu(null)
        }

        function handleKeyDown(event: KeyboardEvent): void {
            if (event.key === 'Escape') {
                setSessionContextMenu(null)
            }
        }

        function handleBlur(): void {
            setSessionContextMenu(null)
        }

        window.addEventListener('mousedown', handlePointerDown)
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('blur', handleBlur)

        return () => {
            window.removeEventListener('mousedown', handlePointerDown)
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('blur', handleBlur)
        }
    }, [sessionContextMenu])

    function openSessionContextMenu(event: MouseEvent<HTMLButtonElement>, session: StoredSession): void {
        if (disableSessionActions) {
            return
        }

        event.preventDefault()

        setSessionContextMenu({
            session,
            x: Math.min(event.clientX, window.innerWidth - 184),
            y: Math.min(event.clientY, window.innerHeight - 76)
        })
    }

    return (
        <aside className={`${shellPanelClass} flex min-h-0 flex-col gap-3 p-3.5 max-[720px]:p-3 max-[980px]:overflow-visible`}>
            <div className="flex items-center justify-between gap-3 max-[720px]:flex-col max-[720px]:items-stretch">
                <div className="min-w-0">
                    <div className="text-base font-semibold tracking-[-0.03em] text-studio-text">Postgre Reorder</div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-studio-muted">Workspace</div>
                    <button
                        className="mt-2 inline-flex items-center gap-2 rounded-full border border-studio-border bg-studio-panel-soft px-2.5 py-1 text-xs text-studio-muted transition duration-150 hover:border-studio-border-strong hover:text-studio-text"
                        onClick={() => void window.api.openExternal('https://github.com/emrecpp')}
                        type="button"
                    >
                        <GitHubMark />
                        <span className="text-studio-muted">Creator</span>
                        <span className="font-medium text-studio-text">@emrecpp</span>
                    </button>
                </div>

                <button className={buttonPrimaryClass} onClick={onCreate} type="button">
                    <Plus size={14} />
                    <span>New</span>
                </button>
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2 max-[720px]:grid-cols-1">


                <button
                    className={cn(
                        buttonGhostClass,
                        'border-studio-amber/25 bg-studio-amber/10 text-studio-amber hover:border-studio-amber/40'
                    )}
                    disabled={!canDisconnect}
                    onClick={onDisconnect}
                    type="button"
                >
                    <Unplug size={14} />
                    <span>Disconnect</span>
                </button>

                <div className="relative" ref={actionsMenuRef}>
                    <button
                        aria-expanded={actionsMenuOpen}
                        aria-haspopup="menu"
                        className={buttonSquareClass}
                        disabled={disableSessionActions}
                        onClick={() => setActionsMenuOpen((current) => !current)}
                        type="button"
                    >
                        <Ellipsis size={16} />
                    </button>

                    {actionsMenuOpen ? (
                        <div className="absolute right-0 top-[calc(100%+8px)] z-40 min-w-[190px] rounded-2xl border border-studio-border-strong bg-[#0d0d0d] p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.38)]">
                            <button
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-studio-text transition duration-150 hover:bg-studio-panel-strong"
                                onClick={() => {
                                    setActionsMenuOpen(false)
                                    onImportSessions()
                                }}
                                type="button"
                            >
                                <FileUp size={14} />
                                <span>Import connections</span>
                            </button>

                            <button
                                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-studio-text transition duration-150 hover:bg-studio-panel-strong"
                                onClick={() => {
                                    setActionsMenuOpen(false)
                                    onExportSessions()
                                }}
                                type="button"
                            >
                                <FileDown size={14} />
                                <span>Export connections</span>
                            </button>
                        </div>
                    ) : null}
                </div>
            </div>

            <div className="grid min-h-0 flex-1 grid-rows-[minmax(180px,0.92fr)_minmax(240px,1.08fr)] gap-3 max-[980px]:grid-cols-1 max-[980px]:grid-rows-none">
                <section className="flex min-h-0 flex-col gap-2 overflow-hidden">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] tracking-[0.12em] text-studio-muted">CONNECTIONS</div>
                    </div>

                    <div className={cn('py-0.5 flex flex-1 flex-col gap-2 overflow-y-auto pr-1 max-[980px]:max-h-[320px]', scrollbarClass)}>
                        {sessions.length === 0 ? (
                            <div className={emptyStateClass}>No saved connections.</div>
                        ) : (
                            sessions.map((session) => {
                                const isSelected = session.id === selectedSessionId
                                const isConnected = session.id === connectedSessionId

                                return (
                                    <button
                                        className={cn(
                                            'group w-full rounded-2xl border p-3 text-left text-studio-text transition duration-150 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0',
                                            isConnected
                                                ? 'border-studio-amber/35 bg-[linear-gradient(180deg,rgba(255,209,102,0.18),rgba(255,209,102,0.08))] shadow-[inset_0_1px_0_rgba(255,209,102,0.08)]'
                                                : isSelected
                                                    ? 'border-studio-border-strong bg-studio-panel-strong'
                                                    : 'border-studio-border'
                                        )}
                                        disabled={disableSessionActions}
                                        key={session.id}
                                        onClick={() => {
                                            setSessionContextMenu(null)
                                            onSelectSession(session)
                                        }}
                                        onContextMenu={(event) => openSessionContextMenu(event, session)}
                                        type="button"
                                    >
                                        <div className="flex items-center justify-between gap-2.5">
                                            <span className={cn('font-semibold', isConnected ? 'text-studio-amber' : 'text-studio-text')}>
                                                {session.name}
                                            </span>

                                            <div className="flex items-center gap-2">

                                                <span
                                                    className={cn(
                                                        'inline-flex h-7 w-7 items-center justify-center rounded-full border transition duration-150',
                                                        isConnected
                                                            ? 'border-studio-amber/30 bg-studio-amber/10 text-studio-amber opacity-100'
                                                            : 'border-studio-border bg-[#111111] text-studio-muted opacity-0 group-hover:opacity-100'
                                                    )}
                                                >
                                                    {isConnected ? <Cable size={14} /> : <PlugZap size={14} />}
                                                </span>
                                            </div>
                                        </div>
                                        <div className={cn('mt-1.5 text-xs', isConnected ? 'text-studio-amber-soft' : 'text-studio-muted')}>
                                            {tableMeta(session)}
                                        </div>
                                    </button>
                                )
                            })
                        )}
                    </div>
                </section>

                <section className="flex min-h-0 flex-col gap-2 overflow-hidden border-t border-studio-border/80 pt-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-studio-muted">Schemas & Tables</div>
                        <span className="inline-flex min-h-[28px] items-center justify-center rounded-full border border-studio-border bg-[#101010] px-2.5 text-xs text-studio-muted-strong">
                            {treeSchemas.length}
                        </span>
                    </div>

                    {!snapshot ? (
                        <div className="grid min-h-24 place-items-center rounded-2xl border border-studio-border bg-studio-panel-soft p-5 text-center text-studio-muted">
                            Open a connection first.
                        </div>
                    ) : treeSchemas.length === 0 ? (
                        <div className="grid min-h-24 place-items-center rounded-2xl border border-studio-border bg-studio-panel-soft p-5 text-center text-studio-muted">
                            No schemas or tables found.
                        </div>
                    ) : (
                        <div className={cn('py-1 flex flex-1 flex-col gap-2 overflow-y-auto pr-1 max-[980px]:max-h-[320px]', scrollbarClass)}>
                            {orderedSchemas.map((schemaNode) => {
                                const isExpanded = expandedSchemas.includes(schemaNode.name)
                                const isFocused = activeSchemaName === schemaNode.name

                                return (
                                    <div
                                        className="flex flex-col gap-1.5"
                                        key={schemaNode.name}
                                        ref={(element) => {
                                            schemaRefs.current[schemaNode.name] = element
                                        }}
                                    >
                                        <button
                                            className={cn(
                                                'flex min-h-10 w-full items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left font-semibold transition duration-150 hover:-translate-y-0.5',
                                                isFocused
                                                    ? 'border-studio-amber/30 bg-studio-gold'
                                                    : 'border-studio-amber/15 bg-[linear-gradient(180deg,rgba(255,209,102,0.06),rgba(255,209,102,0.02))]'
                                            )}
                                            onClick={() => {
                                                setFocusedSchemaName(schemaNode.name)
                                                onToggleSchema(schemaNode.name)
                                            }}
                                            type="button"
                                        >
                                            <span className="inline-flex w-4 flex-none items-center justify-center text-studio-amber">
                                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            </span>

                                            <div className="flex min-w-0 flex-col gap-0.5">
                                                <span className="truncate text-studio-amber">{schemaNode.name}</span>
                                                <span className="text-xs text-studio-amber-soft">{schemaNode.tables.length} tables</span>
                                            </div>
                                        </button>

                                        {isExpanded ? (
                                            <div className="flex flex-col gap-1.5 pl-[18px]">
                                                {schemaNode.tables.map((table) => {
                                                    const isActive =
                                                        snapshot.target?.schema === schemaNode.name &&
                                                        snapshot.target.table === table

                                                    return (
                                                        <button
                                                            className={cn(
                                                                'flex min-h-10 w-full items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left text-studio-muted-strong transition duration-150 hover:-translate-y-0.5',
                                                                isActive
                                                                    ? 'border-studio-border-strong bg-studio-panel-strong text-studio-text'
                                                                    : 'border-studio-border bg-studio-panel-soft'
                                                            )}
                                                            key={`${schemaNode.name}.${table}`}
                                                            onClick={() => onSelectTable(schemaNode.name, table)}
                                                            type="button"
                                                        >
                                                            <Table2 size={13} />
                                                            <div className="flex min-w-0 flex-col gap-0.5">
                                                                <span className="truncate">{table}</span>
                                                                <span className="text-xs text-studio-muted">{schemaNode.name}</span>
                                                            </div>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        ) : null}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </section>
            </div>

            {sessionContextMenu ? (
                <div
                    className="fixed z-50 min-w-[168px] rounded-2xl border border-studio-border-strong bg-[#0d0d0d] p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.38)]"
                    ref={sessionContextMenuRef}
                    style={{
                        left: sessionContextMenu.x,
                        top: sessionContextMenu.y
                    }}
                >
                    <button
                        className="mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-studio-text transition duration-150 hover:bg-studio-panel-strong"
                        onClick={() => {
                            onRequestEditSession(sessionContextMenu.session)
                            setSessionContextMenu(null)
                        }}
                        type="button"
                    >
                        <PencilLine size={14} />
                        <span>Edit</span>
                    </button>

                    <button
                        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-studio-text transition duration-150 bg-red-500 hover:bg-red-500/90"
                        onClick={() => {
                            onRequestDeleteSession(sessionContextMenu.session)
                            setSessionContextMenu(null)
                        }}
                        type="button"
                    >
                        <Trash2 className="text-studio-orange" size={14} />
                        <span>Delete</span>
                    </button>
                </div>
            ) : null}
        </aside>
    )
}

export default SessionSidebar
