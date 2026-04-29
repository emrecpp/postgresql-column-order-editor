import {
    buttonPrimaryClass,
    buttonSquareClass,
    cn,
    emptyStateClass,
    scrollbarClass,
    shellPanelClass
} from '@renderer/lib/ui'
import {tableMeta} from '@renderer/lib/workspace'
import {
    handleConnectionPress,
    handleDisconnect,
    handleExportConnections,
    handleImportConnections,
    handleTableSelect,
    openCreateDialog,
    openDeleteDialog,
    openEditDialog,
    selectConnectedConnectionId,
    toggleSchema,
    workspaceStore
} from '@renderer/store/workspaceStore'
import type {StoredSession as StoredConnection} from '@shared/contracts'
import {useShallow, useStoreValue} from '@simplestack/store/react'
import {
    Cable,
    ChevronDown,
    ChevronRight,
    Ellipsis,
    FileDown,
    FileUp,
    PencilLine,
    PlugZap,
    Plus,
    Table2,
    Trash2,
    Unplug
} from 'lucide-react'
import {type MouseEvent, useEffect, useMemo, useRef, useState} from 'react'
import GitHubMark from './GitHubMark'

function ConnectionSidebar() {
    const [busy, connections, expandedSchemas, selectedConnectionId, snapshot] = useStoreValue(
        workspaceStore,
        useShallow((state) => [
            state.busy,
            state.connections,
            state.expandedSchemas,
            state.selectedConnectionId,
            state.snapshot
        ] as const)
    )
    const connectedConnectionId = useStoreValue(workspaceStore, selectConnectedConnectionId)
    const treeSchemas = snapshot?.databaseTree.schemas ?? []
    const connectionIconClass =
        'inline-flex h-7 w-7 flex-none items-center justify-center rounded-full border p-0 leading-none transition duration-150'
    const connectionStatusIconClass = 'h-3.5 w-3.5'
    const connectionActionIconClass = 'h-4 w-4'
    const actionsMenuRef = useRef<HTMLDivElement | null>(null)
    const schemaRefs = useRef<Record<string, HTMLDivElement | null>>({})
    const connectionContextMenuRef = useRef<HTMLDivElement | null>(null)
    const disableConnectionActions =
        busy === 'connecting' || busy === 'applying' || busy === 'saving'
    const [focusedSchemaName, setFocusedSchemaName] = useState<string | null>(null)
    const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
    const [appVersion, setAppVersion] = useState<string | null>(null)
    const [connectionContextMenu, setConnectionContextMenu] = useState<{
        connection: StoredConnection
        x: number
        y: number
    } | null>(null)

    const activeSchemaName =
        focusedSchemaName ?? snapshot?.target?.schema ?? treeSchemas[0]?.name ?? null

    const orderedSchemas = useMemo(() => {
        if (!activeSchemaName) {
            return treeSchemas
        }

        const activeSchema = treeSchemas.find((schemaNode) => schemaNode.name === activeSchemaName)
        const remainingSchemas = treeSchemas.filter((schemaNode) => schemaNode.name !== activeSchemaName)
        return activeSchema ? [activeSchema, ...remainingSchemas] : treeSchemas
    }, [activeSchemaName, treeSchemas])

    useEffect(() => {
        window.api
            .getAppInfo()
            .then((appInfo) => {
                setAppVersion(appInfo.version)
            })
            .catch(() => {
                setAppVersion(null)
            })
    }, [])

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
        if (!connectionContextMenu) {
            return
        }

        function handlePointerDown(event: globalThis.MouseEvent): void {
            if (connectionContextMenuRef.current?.contains(event.target as Node)) {
                return
            }

            setConnectionContextMenu(null)
        }

        function handleKeyDown(event: KeyboardEvent): void {
            if (event.key === 'Escape') {
                setConnectionContextMenu(null)
            }
        }

        function handleBlur(): void {
            setConnectionContextMenu(null)
        }

        window.addEventListener('mousedown', handlePointerDown)
        window.addEventListener('keydown', handleKeyDown)
        window.addEventListener('blur', handleBlur)

        return () => {
            window.removeEventListener('mousedown', handlePointerDown)
            window.removeEventListener('keydown', handleKeyDown)
            window.removeEventListener('blur', handleBlur)
        }
    }, [connectionContextMenu])

    function openConnectionContextMenu(
        event: MouseEvent<HTMLElement>,
        connection: StoredConnection
    ): void {
        if (disableConnectionActions) {
            return
        }

        event.preventDefault()

        setConnectionContextMenu({
            connection,
            x: Math.min(event.clientX, window.innerWidth - 196),
            y: Math.min(event.clientY, window.innerHeight - 148)
        })
    }

    function handleConnectionSelect(connection: StoredConnection): void {
        setConnectionContextMenu(null)
        handleConnectionPress(connection)
    }

    return (
        <aside
            className={`${shellPanelClass} flex min-h-0 flex-col gap-3 p-3.5 max-[720px]:p-3 max-[980px]:overflow-visible`}
        >
            <div className="flex items-center justify-between gap-3 max-[720px]:flex-col max-[720px]:items-stretch">
                <div className="min-w-0">
                    <div className="text-base font-semibold tracking-[-0.03em] text-studio-text">
                        Postgre Reorder
                    </div>
                    <div className="text-[11px] uppercase tracking-[0.12em] text-studio-muted">
                        {appVersion ? `Workspace - v${appVersion}` : 'Workspace'}
                    </div>
                    <button
                        className="mt-2 inline-flex items-center gap-2 rounded-full border border-studio-border bg-studio-panel-soft px-2.5 py-1 text-xs text-studio-muted transition duration-150 hover:border-studio-border-strong hover:text-studio-text"
                        onClick={() => window.api.openExternal('https://github.com/emrecpp')}
                        type="button"
                    >
                        <GitHubMark />
                        <span className="text-studio-muted">Creator</span>
                        <span className="font-medium text-studio-text">@emrecpp</span>
                    </button>
                </div>

                <div className="flex items-center gap-2 max-[720px]:justify-end">
                    <button className={buttonPrimaryClass} onClick={openCreateDialog} type="button">
                        <Plus size={14} />
                        <span>New</span>
                    </button>

                    <div className="relative" ref={actionsMenuRef}>
                        <button
                            aria-expanded={actionsMenuOpen}
                            aria-haspopup="menu"
                            className={buttonSquareClass}
                            disabled={disableConnectionActions}
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
                                        handleImportConnections()
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
                                        handleExportConnections()
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
            </div>

            <div className="grid min-h-0 flex-1 grid-rows-[minmax(180px,0.92fr)_minmax(240px,1.08fr)] gap-3 max-[980px]:grid-cols-1 max-[980px]:grid-rows-none">
                <section className="flex min-h-0 flex-col gap-2 overflow-hidden">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] tracking-[0.12em] text-studio-muted">CONNECTIONS</div>
                    </div>

                    <div
                        className={cn(
                            'py-0.5 flex flex-1 flex-col gap-2 overflow-y-auto pr-1 max-[980px]:max-h-[320px]',
                            scrollbarClass
                        )}
                    >
                        {connections.length === 0 ? (
                            <div className={emptyStateClass}>No saved connections.</div>
                        ) : (
                            connections.map((connection) => {
                                const isSelected = connection.id === selectedConnectionId
                                const isConnected = connection.id === connectedConnectionId

                                return (
                                    <div
                                        className={cn(
                                            'group flex w-full items-center gap-3 rounded-2xl border p-3 text-left text-studio-text transition duration-150 hover:-translate-y-0.5',
                                            isConnected
                                                ? 'border-studio-amber/35 bg-[linear-gradient(180deg,rgba(255,209,102,0.18),rgba(255,209,102,0.08))] shadow-[inset_0_1px_0_rgba(255,209,102,0.08)]'
                                                : isSelected
                                                    ? 'border-studio-border-strong bg-studio-panel-strong'
                                                    : 'border-studio-border'
                                        )}
                                        key={connection.id}
                                        onContextMenu={(event) => openConnectionContextMenu(event, connection)}
                                    >
                                        <button
                                            className="min-w-0 flex-1 text-left disabled:cursor-not-allowed disabled:opacity-50"
                                            disabled={disableConnectionActions}
                                            onClick={() => handleConnectionSelect(connection)}
                                            type="button"
                                        >
                                            <div
                                                className={cn(
                                                    'font-semibold',
                                                    isConnected ? 'text-studio-amber' : 'text-studio-text'
                                                )}
                                            >
                                                {connection.name}
                                            </div>

                                            <div
                                                className={cn(
                                                    'mt-1.5 text-xs',
                                                    isConnected ? 'text-studio-amber-soft' : 'text-studio-muted'
                                                )}
                                            >
                                                {tableMeta(connection)}
                                            </div>
                                        </button>

                                        <div className="flex flex-none items-center gap-2 ">
                                            {isConnected ? (
                                                <button
                                                    aria-label={`Disconnect ${connection.name}`}
                                                    className={cn(
                                                        connectionIconClass,
                                                        'border-red-500/35 bg-red-500/10 text-red-300 hover:border-red-500/55 hover:bg-red-500/18'
                                                    )}
                                                    disabled={disableConnectionActions}
                                                    onClick={(event) => {
                                                        event.stopPropagation()
                                                        setConnectionContextMenu(null)
                                                        handleDisconnect(connection.id)
                                                    }}
                                                    type="button"
                                                >
                                                    <Unplug className={connectionStatusIconClass} />
                                                </button>
                                            ) : null}

                                            {isConnected ? (
                                                <span
                                                    className={cn(
                                                        connectionIconClass,
                                                        'border-studio-amber/30 bg-studio-amber/10 text-studio-amber opacity-100'
                                                    )}
                                                >
                                                    <Cable className={connectionStatusIconClass} />
                                                </span>
                                            ) : (
                                                <button
                                                    aria-label={`Connect ${connection.name}`}
                                                    className={cn(
                                                        connectionIconClass,
                                                        'border-studio-border bg-[#111111] text-studio-muted opacity-0 hover:border-studio-border-strong hover:text-studio-text group-hover:opacity-100'
                                                    )}
                                                    disabled={disableConnectionActions}
                                                    onClick={() => handleConnectionSelect(connection)}
                                                    type="button"
                                                >
                                                    <PlugZap className={connectionActionIconClass} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })
                        )}
                    </div>
                </section>

                <section className="flex min-h-0 flex-col gap-2 overflow-hidden border-t border-studio-border/80 pt-3">
                    <div className="flex items-center justify-between gap-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-studio-muted">
                            Schemas & Tables
                        </div>
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
                        <div
                            className={cn(
                                'py-1 flex flex-1 flex-col gap-2 overflow-y-auto pr-1 max-[980px]:max-h-[320px]',
                                scrollbarClass
                            )}
                        >
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
                                                toggleSchema(schemaNode.name)
                                            }}
                                            type="button"
                                        >
                                            <span className="inline-flex w-4 flex-none items-center justify-center text-studio-amber">
                                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                            </span>

                                            <div className="flex min-w-0 flex-col gap-0.5">
                                                <span className="truncate text-studio-amber">{schemaNode.name}</span>
                                                <span className="text-xs text-studio-amber-soft">
                                                    {schemaNode.tables.length} tables
                                                </span>
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
                                                            onClick={() => handleTableSelect(schemaNode.name, table)}
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

            {connectionContextMenu ? (
                <div
                    className="fixed z-50 min-w-[184px] rounded-2xl border border-studio-border-strong bg-[#0d0d0d] p-1.5 shadow-[0_18px_40px_rgba(0,0,0,0.38)]"
                    ref={connectionContextMenuRef}
                    style={{
                        left: connectionContextMenu.x,
                        top: connectionContextMenu.y
                    }}
                >
                    {connectionContextMenu.connection.id === connectedConnectionId ? (
                        <button
                            className="mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-red-200 transition duration-150 hover:bg-red-500/10"
                            onClick={() => {
                                handleDisconnect(connectionContextMenu.connection.id)
                                setConnectionContextMenu(null)
                            }}
                            type="button"
                        >
                            <Unplug size={14} />
                            <span>Disconnect</span>
                        </button>
                    ) : null}

                    <button
                        className="mb-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm text-studio-text transition duration-150 hover:bg-studio-panel-strong"
                        onClick={() => {
                            openEditDialog(connectionContextMenu.connection)
                            setConnectionContextMenu(null)
                        }}
                        type="button"
                    >
                        <PencilLine size={14} />
                        <span>Edit</span>
                    </button>

                    <button
                        className="flex w-full items-center gap-2 rounded-xl bg-red-500 px-3 py-2 text-left text-sm text-studio-text transition duration-150 hover:bg-red-500/90"
                        onClick={() => {
                            openDeleteDialog(connectionContextMenu.connection.id)
                            setConnectionContextMenu(null)
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

export default ConnectionSidebar
