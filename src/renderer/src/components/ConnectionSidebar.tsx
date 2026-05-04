import {
    buttonPrimaryClass,
    buttonSquareClass,
    cn,
    emptyStateClass,
    inputClass,
    scrollbarClass,
    shellPanelClass
} from '@renderer/lib/ui'
import {filterDatabaseSchemasByQuery, tableMeta} from '@renderer/lib/workspace'
import {
    handleConnectionPress,
    handleConnectionOrderChange,
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
import {groupSessionsByHost} from '@shared/sessionOrder'
import {
    closestCenter,
    DndContext,
    DragOverlay,
    PointerSensor,
    type DragEndEvent,
    type DragStartEvent,
    useSensor,
    useSensors
} from '@dnd-kit/core'
import {
    arrayMove,
    SortableContext,
    useSortable,
    verticalListSortingStrategy
} from '@dnd-kit/sortable'
import {CSS} from '@dnd-kit/utilities'
import {useShallow, useStoreValue} from '@simplestack/store/react'
import {
    ArrowDown,
    ArrowUp,
    Cable,
    ChevronDown,
    ChevronRight,
    Ellipsis,
    FileDown,
    FileUp,
    PencilLine,
    PlugZap,
    Plus,
    Search,
    Table2,
    Trash2,
    Unplug
} from 'lucide-react'
import {type MouseEvent, type PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState} from 'react'
import GitHubMark from './GitHubMark'

const connectionIconClass =
    'inline-flex h-7 w-7 flex-none items-center justify-center rounded-full border p-0 leading-none transition duration-150'
const connectionStatusIconClass = 'h-3.5 w-3.5'
const connectionActionIconClass = 'h-4 w-4'
const sidebarResizeHandleHeight = 18
const sidebarMinPanelHeight = 140
const sidebarDefaultConnectionsRatio = 0.44

function clampConnectionsPanelHeight(height: number, containerHeight: number): number {
    const maxHeight = containerHeight - sidebarMinPanelHeight - sidebarResizeHandleHeight

    if (maxHeight <= sidebarMinPanelHeight) {
        return Math.max(
            0,
            (containerHeight - sidebarResizeHandleHeight) / 2
        )
    }

    return Math.min(
        Math.max(height, sidebarMinPanelHeight),
        maxHeight
    )
}

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
    const actionsMenuRef = useRef<HTMLDivElement | null>(null)
    const sidebarPanelsRef = useRef<HTMLDivElement | null>(null)
    const connectionContextMenuRef = useRef<HTMLDivElement | null>(null)
    const disableConnectionActions =
        busy === 'connecting' || busy === 'applying' || busy === 'saving'
    const disableTargetTreeActions =
        busy === 'connecting' ||
        busy === 'switchingTarget' ||
        busy === 'applying' ||
        busy === 'saving'
    const [focusedSchemaName, setFocusedSchemaName] = useState<string | null>(null)
    const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
    const [appVersion, setAppVersion] = useState<string | null>(null)
    const [activeDragConnectionId, setActiveDragConnectionId] = useState<string | null>(null)
    const [connectionsPanelHeight, setConnectionsPanelHeight] = useState<number | null>(null)
    const [isCompactSidebar, setIsCompactSidebar] = useState(() => window.innerWidth <= 980)
    const [isResizingPanels, setIsResizingPanels] = useState(false)
    const [tableSearchQuery, setTableSearchQuery] = useState('')
    const [connectionContextMenu, setConnectionContextMenu] = useState<{
        connection: StoredConnection
        x: number
        y: number
    } | null>(null)
    const filteredTreeSchemas = useMemo(
        () => filterDatabaseSchemasByQuery(treeSchemas, tableSearchQuery),
        [tableSearchQuery, treeSchemas]
    )
    const connectionGroups = useMemo(() => groupSessionsByHost(connections), [connections])
    const orderedConnectionIds = useMemo(
        () => connectionGroups.flatMap((group) => group.sessions.map((connection) => connection.id)),
        [connectionGroups]
    )
    const activeDragConnection =
        connections.find((connection) => connection.id === activeDragConnectionId) ?? null
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8
            }
        })
    )
    const searchActive = tableSearchQuery.trim().length > 0

    const activeSchemaName =
        focusedSchemaName ?? snapshot?.target?.schema ?? treeSchemas[0]?.name ?? null

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
        setTableSearchQuery('')
    }, [snapshot?.session.id])

    useEffect(() => {
        const mediaQuery = window.matchMedia('(max-width: 980px)')

        const syncCompactState = (): void => {
            setIsCompactSidebar(mediaQuery.matches)
        }

        syncCompactState()
        mediaQuery.addEventListener('change', syncCompactState)

        return () => {
            mediaQuery.removeEventListener('change', syncCompactState)
        }
    }, [])

    useEffect(() => {
        if (isCompactSidebar || !sidebarPanelsRef.current) {
            return
        }

        const element = sidebarPanelsRef.current

        const syncHeight = (): void => {
            const nextContainerHeight = element.getBoundingClientRect().height

            setConnectionsPanelHeight((currentHeight) =>
                clampConnectionsPanelHeight(
                    currentHeight ?? nextContainerHeight * sidebarDefaultConnectionsRatio,
                    nextContainerHeight
                )
            )
        }

        syncHeight()

        const resizeObserver = new ResizeObserver(() => {
            syncHeight()
        })

        resizeObserver.observe(element)

        return () => {
            resizeObserver.disconnect()
        }
    }, [isCompactSidebar])

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

    function handleConnectionDragStart(event: DragStartEvent): void {
        setActiveDragConnectionId(String(event.active.id))
    }

    function handleConnectionDragEnd(event: DragEndEvent): void {
        const {active, over} = event

        setActiveDragConnectionId(null)

        if (!over || active.id === over.id) {
            return
        }

        const activeConnectionId = String(active.id)
        const overConnectionId = String(over.id)
        const activeIndex = orderedConnectionIds.indexOf(activeConnectionId)
        const overIndex = orderedConnectionIds.indexOf(overConnectionId)

        if (activeIndex === -1 || overIndex === -1) {
            return
        }

        void handleConnectionOrderChange(
            arrayMove(orderedConnectionIds, activeIndex, overIndex)
        )
    }

    function handleConnectionDragCancel(): void {
        setActiveDragConnectionId(null)
    }

    function handleConnectionGroupMove(groupKey: string, direction: 'up' | 'down'): void {
        const groupIndex = connectionGroups.findIndex((group) => group.key === groupKey)
        const nextIndex = direction === 'up' ? groupIndex - 1 : groupIndex + 1

        if (
            groupIndex === -1 ||
            nextIndex < 0 ||
            nextIndex >= connectionGroups.length ||
            disableConnectionActions
        ) {
            return
        }

        void handleConnectionOrderChange(
            arrayMove(connectionGroups, groupIndex, nextIndex).flatMap((group) =>
                group.sessions.map((connection) => connection.id)
            )
        )
    }

    function handleSidebarResizeStart(event: ReactPointerEvent<HTMLButtonElement>): void {
        if (isCompactSidebar || !sidebarPanelsRef.current) {
            return
        }

        event.preventDefault()

        const element = sidebarPanelsRef.current
        const previousCursor = document.body.style.cursor
        const previousUserSelect = document.body.style.userSelect

        const syncHeightFromClientY = (clientY: number): void => {
            const rect = element.getBoundingClientRect()
            const nextHeight = clientY - rect.top - sidebarResizeHandleHeight / 2

            setConnectionsPanelHeight(
                clampConnectionsPanelHeight(nextHeight, rect.height)
            )
        }

        setIsResizingPanels(true)
        document.body.style.cursor = 'row-resize'
        document.body.style.userSelect = 'none'
        syncHeightFromClientY(event.clientY)

        const handlePointerMove = (nextEvent: PointerEvent): void => {
            syncHeightFromClientY(nextEvent.clientY)
        }

        const stopResizing = (): void => {
            setIsResizingPanels(false)
            document.body.style.cursor = previousCursor
            document.body.style.userSelect = previousUserSelect
            window.removeEventListener('pointermove', handlePointerMove)
            window.removeEventListener('pointerup', stopResizing)
        }

        window.addEventListener('pointermove', handlePointerMove)
        window.addEventListener('pointerup', stopResizing, {once: true})
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

            <div
                className={cn(
                    'flex min-h-0 flex-1 flex-col',
                    isCompactSidebar && 'gap-3'
                )}
                ref={sidebarPanelsRef}
            >
                <section
                    className="flex min-h-0 flex-col gap-2 overflow-hidden"
                    style={
                        !isCompactSidebar && connectionsPanelHeight !== null
                            ? {height: `${connectionsPanelHeight}px`}
                            : undefined
                    }
                >
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
                            <DndContext
                                collisionDetection={closestCenter}
                                onDragCancel={handleConnectionDragCancel}
                                onDragEnd={handleConnectionDragEnd}
                                onDragStart={handleConnectionDragStart}
                                sensors={sensors}
                            >
                                <SortableContext
                                    items={orderedConnectionIds}
                                    strategy={verticalListSortingStrategy}
                                >
                                    <div className="flex flex-col gap-2">
                                        {connectionGroups.map((group, groupIndex) => (
                                            <div className="flex flex-col gap-1.5" key={group.key}>
                                                {connectionGroups.length > 1 || group.sessions.length > 1 ? (
                                                    <div className="flex items-center justify-between gap-2 px-1 pt-1">
                                                        <span className="truncate text-[10px] tracking-[0.12em] text-studio-muted">
                                                            {group.label}
                                                        </span>
                                                        <div className="flex flex-none items-center gap-1">
                                                            <span className="pr-1 text-[10px] tabular-nums text-studio-muted">
                                                                {group.sessions.length}
                                                            </span>

                                                            {connectionGroups.length > 1 ? (
                                                                <>
                                                                    <button
                                                                        aria-label={`Move ${group.label} group up`}
                                                                        className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-studio-border bg-studio-panel-soft text-studio-muted transition duration-150 hover:border-studio-border-strong hover:text-studio-text disabled:cursor-not-allowed disabled:opacity-40"
                                                                        disabled={disableConnectionActions || groupIndex === 0}
                                                                        onClick={() => handleConnectionGroupMove(group.key, 'up')}
                                                                        title="Move group up"
                                                                        type="button"
                                                                    >
                                                                        <ArrowUp size={12} />
                                                                    </button>

                                                                    <button
                                                                        aria-label={`Move ${group.label} group down`}
                                                                        className="inline-flex h-6 w-6 items-center justify-center rounded-lg border border-studio-border bg-studio-panel-soft text-studio-muted transition duration-150 hover:border-studio-border-strong hover:text-studio-text disabled:cursor-not-allowed disabled:opacity-40"
                                                                        disabled={
                                                                            disableConnectionActions ||
                                                                            groupIndex === connectionGroups.length - 1
                                                                        }
                                                                        onClick={() => handleConnectionGroupMove(group.key, 'down')}
                                                                        title="Move group down"
                                                                        type="button"
                                                                    >
                                                                        <ArrowDown size={12} />
                                                                    </button>
                                                                </>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                ) : null}

                                                <div className="flex flex-col gap-1.5">
                                                    {group.sessions.map((connection) => (
                                                        <SortableConnectionCard
                                                            connection={connection}
                                                            disableConnectionActions={disableConnectionActions}
                                                            index={orderedConnectionIds.indexOf(connection.id)}
                                                            isConnected={connection.id === connectedConnectionId}
                                                            isSelected={connection.id === selectedConnectionId}
                                                            key={connection.id}
                                                            onConnectionContextMenu={openConnectionContextMenu}
                                                            onConnectionSelect={handleConnectionSelect}
                                                            onDisconnect={(connectionId) => {
                                                                setConnectionContextMenu(null)
                                                                handleDisconnect(connectionId)
                                                            }}
                                                        />
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </SortableContext>

                                <DragOverlay>
                                    {activeDragConnection ? (
                                        <ConnectionCard
                                            connection={activeDragConnection}
                                            disableConnectionActions
                                            index={Math.max(0, orderedConnectionIds.indexOf(activeDragConnection.id))}
                                            isConnected={activeDragConnection.id === connectedConnectionId}
                                            isDragOverlay
                                            isSelected={activeDragConnection.id === selectedConnectionId}
                                            onConnectionContextMenu={() => undefined}
                                            onConnectionSelect={() => undefined}
                                            onDisconnect={() => undefined}
                                        />
                                    ) : null}
                                </DragOverlay>
                            </DndContext>
                        )}
                    </div>
                </section>

                {!isCompactSidebar ? (
                    <button
                        aria-label="Resize connections and schemas panels"
                        aria-orientation="horizontal"
                        className="group relative flex h-[18px] flex-none cursor-row-resize items-center justify-center"
                        onPointerDown={handleSidebarResizeStart}
                        title="Drag to resize panels"
                        type="button"
                    >
                        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-studio-border/70 transition duration-150 group-hover:bg-studio-border-strong" />
                        <span
                            className={cn(
                                'relative inline-flex h-5 w-14 items-center justify-center rounded-full border border-studio-border bg-[#101010] text-studio-muted transition duration-150 group-hover:border-studio-border-strong group-hover:text-studio-text',
                                isResizingPanels && 'border-studio-border-strong text-studio-text'
                            )}
                        >
                            <span className="h-1 w-6 rounded-full bg-current/70" />
                        </span>
                    </button>
                ) : null}

                <section
                    className={cn(
                        'flex min-h-0 flex-1 flex-col gap-2 overflow-hidden',
                        isCompactSidebar && 'border-t border-studio-border/80 pt-3'
                    )}
                >
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
                        <div className="flex min-h-0 flex-1 flex-col gap-2">
                            <label className="relative block">
                                <Search
                                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-studio-muted"
                                    size={14}
                                />
                                <input
                                    className={cn(inputClass, 'pl-9')}
                                    onChange={(event) => setTableSearchQuery(event.target.value)}
                                    placeholder="Search schema or table"
                                    type="text"
                                    value={tableSearchQuery}
                                />
                            </label>

                            <div
                                className={cn(
                                    'py-1 flex flex-1 flex-col gap-2 overflow-y-auto pr-1 max-[980px]:max-h-[320px]',
                                    scrollbarClass
                                )}
                            >
                                {filteredTreeSchemas.length === 0 ? (
                                    <div className="grid min-h-24 place-items-center rounded-2xl border border-studio-border bg-studio-panel-soft p-5 text-center text-studio-muted">
                                        No matching schemas or tables found.
                                    </div>
                                ) : filteredTreeSchemas.map((schemaNode) => {
                                    const isExpanded = searchActive || expandedSchemas.includes(schemaNode.name)
                                    const isFocused = activeSchemaName === schemaNode.name

                                    return (
                                        <div className="flex flex-col gap-1.5" key={schemaNode.name}>
                                            <button
                                                className={cn(
                                                    'flex min-h-10 w-full items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left font-semibold transition duration-150 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0',
                                                    isFocused
                                                        ? 'border-studio-amber/30 bg-studio-gold'
                                                        : 'border-studio-amber/15 bg-[linear-gradient(180deg,rgba(255,209,102,0.06),rgba(255,209,102,0.02))]'
                                                )}
                                                disabled={disableTargetTreeActions}
                                                onClick={() => {
                                                    setFocusedSchemaName(schemaNode.name)

                                                    if (!searchActive) {
                                                        toggleSchema(schemaNode.name)
                                                    }
                                                }}
                                                type="button"
                                            >
                                                <span className="inline-flex w-4 flex-none items-center justify-center text-studio-amber">
                                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                </span>

                                                <div className="flex min-w-0 flex-col gap-0.5">
                                                    <span className="truncate text-studio-amber">{schemaNode.name}</span>
                                                    <span className="text-xs text-studio-amber-soft">
                                                        {schemaNode.tables.length === schemaNode.totalTableCount
                                                            ? `${schemaNode.totalTableCount} tables`
                                                            : `${schemaNode.tables.length} / ${schemaNode.totalTableCount} tables`}
                                                    </span>
                                                </div>
                                            </button>

                                            {searchActive || isExpanded ? (
                                                <div className="flex flex-col gap-1.5 pl-[18px]">
                                                    {schemaNode.tables.map((table) => {
                                                        const isActive =
                                                            snapshot.target?.schema === schemaNode.name &&
                                                            snapshot.target.table === table

                                                        return (
                                                            <button
                                                                className={cn(
                                                                    'flex min-h-10 w-full items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left text-studio-muted-strong transition duration-150 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0',
                                                                    isActive
                                                                        ? 'border-studio-border-strong bg-studio-panel-strong text-studio-text'
                                                                        : 'border-studio-border bg-studio-panel-soft'
                                                                )}
                                                                disabled={disableTargetTreeActions}
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

interface ConnectionCardProps {
    connection: StoredConnection
    disableConnectionActions: boolean
    index: number
    isConnected: boolean
    isDragOverlay?: boolean
    isSelected: boolean
    onConnectionContextMenu: (
        event: MouseEvent<HTMLElement>,
        connection: StoredConnection
    ) => void
    onConnectionSelect: (connection: StoredConnection) => void
    onDisconnect: (connectionId: string) => void
}

function ConnectionCard({
    connection,
    disableConnectionActions,
    index,
    isConnected,
    isDragOverlay = false,
    isSelected,
    onConnectionContextMenu,
    onConnectionSelect,
    onDisconnect
}: ConnectionCardProps) {
    return (
        <div
            className={cn(
                'group flex w-full cursor-grab touch-none items-center gap-3 rounded-2xl border p-3 text-left text-studio-text transition duration-150 hover:-translate-y-0.5 active:cursor-grabbing',
                isConnected
                    ? 'border-studio-amber/35 bg-[linear-gradient(180deg,rgba(255,209,102,0.18),rgba(255,209,102,0.08))] shadow-[inset_0_1px_0_rgba(255,209,102,0.08)]'
                    : isSelected
                        ? 'border-studio-border-strong bg-studio-panel-strong'
                        : 'border-studio-border',
                isDragOverlay &&
                    'cursor-grabbing border-studio-amber/40 bg-[linear-gradient(180deg,rgba(255,209,102,0.18),rgba(255,209,102,0.08))] shadow-[0_18px_40px_rgba(0,0,0,0.34)] rotate-[1deg]'
            )}
            onContextMenu={(event) => onConnectionContextMenu(event, connection)}
        >
            <button
                className="grid min-w-0 flex-1 grid-cols-[38px_minmax(0,1fr)] items-center gap-2.5 text-left disabled:cursor-not-allowed disabled:opacity-50"
                disabled={disableConnectionActions}
                onClick={() => onConnectionSelect(connection)}
                type="button"
            >
                <span className="text-[11px] tabular-nums leading-none text-studio-muted">
                    #{String(index + 1).padStart(2, '0')}
                </span>

                <div className="min-w-0">
                    <div
                        className={cn(
                            'truncate font-semibold',
                            isConnected ? 'text-studio-amber' : 'text-studio-text'
                        )}
                    >
                        {connection.name}
                    </div>

                    <div
                        className={cn(
                            'mt-1.5 truncate text-xs',
                            isConnected ? 'text-studio-amber-soft' : 'text-studio-muted'
                        )}
                    >
                        {tableMeta(connection)}
                    </div>
                </div>
            </button>

            <div className="flex flex-none items-center gap-2">
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
                            onDisconnect(connection.id)
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
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
                        onClick={(event) => {
                            event.stopPropagation()
                            onConnectionSelect(connection)
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        type="button"
                    >
                        <PlugZap className={connectionActionIconClass} />
                    </button>
                )}
            </div>
        </div>
    )
}

interface SortableConnectionCardProps extends ConnectionCardProps {}

function SortableConnectionCard(props: SortableConnectionCardProps) {
    const {attributes, isDragging, listeners, setNodeRef, transform, transition} = useSortable({
        disabled: props.disableConnectionActions,
        id: props.connection.id
    })

    return (
        <div
            className={cn(isDragging && 'opacity-30')}
            ref={setNodeRef}
            style={{
                transform: CSS.Transform.toString(transform),
                transition
            }}
            {...attributes}
            {...listeners}
        >
            <ConnectionCard {...props} />
        </div>
    )
}

export default ConnectionSidebar
