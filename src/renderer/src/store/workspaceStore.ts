import {cloneDraft, getErrorMessage} from '@renderer/lib/workspace'
import {
    DEFAULT_SESSION_DRAFT as DEFAULT_CONNECTION_DRAFT,
    type ColumnInfo,
    type ConnectRequest,
    type SessionDraft as ConnectionDraft,
    type StoredSession as StoredConnection,
    type TableSnapshot
} from '@shared/contracts'
import {
    sessionSaveSchema as connectionSaveSchema,
    sessionConnectionTestSchema as connectionTestSchema
} from '@shared/validation'
import {store} from '@simplestack/store'
import type {SetStateAction} from 'react'

export type BusyState =
    | 'idle'
    | 'loading'
    | 'saving'
    | 'connecting'
    | 'switchingTarget'
    | 'applying'
export type NoticeType = 'success' | 'error' | 'info'
export type DialogMode = 'create' | 'edit'

export interface NoticeState {
    type: NoticeType
    text: string
}

export interface WorkspaceState {
    availableConnectionDatabases: string[]
    availableDatabases: string[]
    busy: BusyState
    columns: ColumnInfo[]
    connectionFeedback: NoticeState | null
    connections: StoredConnection[]
    databaseAutoOpenSignal: number
    deleteBackupTableAfterReorder: boolean
    deleteDialogOpen: boolean
    deleteTargetConnectionId: string | null
    deleteTargetConnectionName: string | null
    dialogMode: DialogMode
    dialogOpen: boolean
    draft: ConnectionDraft
    expandedSchemas: string[]
    loadingConnectionDatabases: boolean
    notice: NoticeState | null
    originalOrder: string[]
    selectedColumnName: string | null
    selectedConnectionId: string | null
    snapshot: TableSnapshot | null
    testingConnection: boolean
}

const initialWorkspaceState: WorkspaceState = {
    availableConnectionDatabases: [],
    availableDatabases: [],
    busy: 'loading',
    columns: [],
    connectionFeedback: null,
    connections: [],
    databaseAutoOpenSignal: 0,
    deleteBackupTableAfterReorder: false,
    deleteDialogOpen: false,
    deleteTargetConnectionId: null,
    deleteTargetConnectionName: null,
    dialogMode: 'create',
    dialogOpen: false,
    draft: cloneDraft(DEFAULT_CONNECTION_DRAFT),
    expandedSchemas: [],
    loadingConnectionDatabases: false,
    notice: null,
    originalOrder: [],
    selectedColumnName: null,
    selectedConnectionId: null,
    snapshot: null,
    testingConnection: false
}

const runtime = {
    bootstrapPromise: null as Promise<void> | null,
    connectRequestSequence: 0,
    hasBootstrapped: false,
    connectionDatabasesSignature: null as string | null,
    databaseAutoFetchSignature: null as string | null,
    previousConnectionSignature: null as string | null
}

export const workspaceStore = store<WorkspaceState>(initialWorkspaceState)

function getDefaultExpandedSchemas(snapshot: TableSnapshot): string[] {
    const defaultSchemaName =
        snapshot.target?.schema ?? snapshot.databaseTree.schemas[0]?.name ?? null

    return defaultSchemaName ? [defaultSchemaName] : []
}

function getConnectionDraftSignature(draft: ConnectionDraft): string {
    return JSON.stringify([
        draft.host.trim(),
        draft.port,
        draft.username.trim(),
        draft.password,
        draft.ssl
    ])
}

function getResetConnectionStatePatch(): Pick<
    WorkspaceState,
    'columns' | 'expandedSchemas' | 'originalOrder' | 'selectedColumnName' | 'snapshot'
> {
    return {
        columns: [],
        expandedSchemas: [],
        originalOrder: [],
        selectedColumnName: null,
        snapshot: null
    }
}

function getResetDialogConnectionStatePatch(): Pick<
    WorkspaceState,
    'availableDatabases' | 'connectionFeedback' | 'databaseAutoOpenSignal'
> {
    runtime.previousConnectionSignature = null
    runtime.databaseAutoFetchSignature = null

    return {
        availableDatabases: [],
        connectionFeedback: null,
        databaseAutoOpenSignal: 0
    }
}

function setWorkspacePatch(patch: Partial<WorkspaceState>): void {
    workspaceStore.set((state) => ({
        ...state,
        ...patch
    }))
}

export function selectSelectedConnection(state: WorkspaceState): StoredConnection | null {
    return state.connections.find((item) => item.id === state.selectedConnectionId) ?? null
}

export function selectSelectedColumn(state: WorkspaceState): ColumnInfo | null {
    return state.columns.find((column) => column.name === state.selectedColumnName) ?? null
}

export function selectResolvedSelectedColumn(state: WorkspaceState): ColumnInfo | null {
    return selectSelectedColumn(state) ?? state.columns[0] ?? null
}

export function selectSelectedColumnIndex(state: WorkspaceState): number {
    return state.columns.findIndex((column) => column.name === state.selectedColumnName)
}

export function selectResolvedSelectedColumnIndex(state: WorkspaceState): number {
    const selectedColumn = selectResolvedSelectedColumn(state)

    if (!selectedColumn) {
        return -1
    }

    return state.columns.findIndex((column) => column.name === selectedColumn.name)
}

export function selectHasOrderChanges(state: WorkspaceState): boolean {
    if (state.columns.length !== state.originalOrder.length) {
        return false
    }

    return state.columns.some((column, index) => column.name !== state.originalOrder[index])
}

export function selectCanApply(state: WorkspaceState): boolean {
    return (
        state.snapshot !== null &&
        selectHasOrderChanges(state) &&
        state.busy !== 'applying' &&
        state.busy !== 'connecting' &&
        state.busy !== 'switchingTarget' &&
        state.busy !== 'saving'
    )
}

export function selectCanTestConnection(state: WorkspaceState): boolean {
    return (
        connectionTestSchema.safeParse(state.draft).success &&
        !state.testingConnection &&
        state.busy !== 'saving'
    )
}

export function selectCanSaveConnection(state: WorkspaceState): boolean {
    return (
        connectionSaveSchema.safeParse({
            ...state.draft,
            schema: '',
            table: ''
        }).success &&
        state.busy !== 'saving' &&
        !state.testingConnection
    )
}

export function selectConnectedConnectionId(state: WorkspaceState): string | null {
    return state.snapshot?.session.id ?? null
}

function syncSelectedConnectionState(
    previousState: WorkspaceState,
    nextState: WorkspaceState
): WorkspaceState {
    const selectedConnection = selectSelectedConnection(nextState)
    const trimmedDatabase = selectedConnection?.database.trim()
    const shouldPreserveLoadedDatabases =
        previousState.selectedConnectionId === nextState.selectedConnectionId
    const preservedDatabases = shouldPreserveLoadedDatabases
        ? previousState.availableConnectionDatabases
        : []

    if (!shouldPreserveLoadedDatabases) {
        runtime.connectionDatabasesSignature = null
    }

    const nextAvailableConnectionDatabases =
        preservedDatabases.length > 0
            ? Array.from(new Set([...(trimmedDatabase ? [trimmedDatabase] : []), ...preservedDatabases]))
            : trimmedDatabase
                ? [trimmedDatabase]
                : []

    return {
        ...nextState,
        availableConnectionDatabases: nextAvailableConnectionDatabases,
        loadingConnectionDatabases: false
    }
}

function syncDraftState(
    state: WorkspaceState,
    nextDraft: ConnectionDraft
): WorkspaceState {
    let nextState: WorkspaceState = {
        ...state,
        draft: nextDraft
    }

    if (!state.dialogOpen) {
        return nextState
    }

    const previousSignature =
        runtime.previousConnectionSignature ?? getConnectionDraftSignature(state.draft)
    const nextSignature = getConnectionDraftSignature(nextDraft)

    runtime.previousConnectionSignature = nextSignature

    if (previousSignature === nextSignature) {
        return nextState
    }

    runtime.databaseAutoFetchSignature = null

    nextState = {
        ...nextState,
        availableDatabases: [],
        connectionFeedback: null
    }

    return nextState
}

function showNotice(type: NoticeType, text: string): void {
    setWorkspacePatch({
        notice: {
            type,
            text
        }
    })
}

async function bootstrapWorkspace(): Promise<void> {
    setWorkspacePatch({busy: 'loading'})

    try {
        const [savedConnections, lastConnectionId] = await Promise.all([
            window.api.listSessions(),
            window.api.getLastSessionId()
        ])

        const initial =
            savedConnections.find((item) => item.id === lastConnectionId) ?? savedConnections[0] ?? null

        workspaceStore.set((state) =>
            syncSelectedConnectionState(state, {
                ...state,
                busy: 'idle',
                connections: savedConnections,
                selectedConnectionId: initial?.id ?? null
            })
        )

        runtime.hasBootstrapped = true
    } catch (error) {
        showNotice('error', getErrorMessage(error))
        setWorkspacePatch({busy: 'idle'})
    }
}

export async function initializeWorkspace(): Promise<void> {
    if (runtime.hasBootstrapped) {
        return
    }

    if (runtime.bootstrapPromise) {
        return runtime.bootstrapPromise
    }

    runtime.bootstrapPromise = bootstrapWorkspace().finally(() => {
        runtime.bootstrapPromise = null
    })

    return runtime.bootstrapPromise
}

export function setDeleteBackupTableAfterReorder(checked: boolean): void {
    setWorkspacePatch({deleteBackupTableAfterReorder: checked})
}

export function setDeleteDialogOpen(open: boolean): void {
    setWorkspacePatch({deleteDialogOpen: open})
}

export function setDialogOpen(open: boolean): void {
    if (!open) {
        runtime.previousConnectionSignature = null
    }

    setWorkspacePatch({dialogOpen: open})
}

export function setDraft(updater: SetStateAction<ConnectionDraft>): void {
    workspaceStore.set((state) => {
        const nextDraft =
            typeof updater === 'function'
                ? (updater as (current: ConnectionDraft) => ConnectionDraft)(state.draft)
                : updater

        return syncDraftState(state, nextDraft)
    })
}

export function setSelectedColumnName(name: string | null): void {
    setWorkspacePatch({selectedColumnName: name})
}

export function handleColumnReorder(
    columnName: string,
    targetColumnName: string,
    position: 'before' | 'after'
): void {
    workspaceStore.set((state) => {
        if (
            !state.snapshot ||
            state.busy === 'applying' ||
            state.busy === 'connecting' ||
            state.busy === 'switchingTarget' ||
            state.busy === 'saving'
        ) {
            return state
        }

        const sourceIndex = state.columns.findIndex((column) => column.name === columnName)
        const targetIndex = state.columns.findIndex((column) => column.name === targetColumnName)

        if (sourceIndex === -1 || targetIndex === -1) {
            return state
        }

        let nextIndex = targetIndex + (position === 'after' ? 1 : 0)

        if (sourceIndex < nextIndex) {
            nextIndex -= 1
        }

        if (nextIndex === sourceIndex) {
            return {
                ...state,
                selectedColumnName: columnName
            }
        }

        const nextColumns = [...state.columns]
        const [movedColumn] = nextColumns.splice(sourceIndex, 1)

        if (!movedColumn) {
            return state
        }

        nextColumns.splice(nextIndex, 0, movedColumn)

        return {
            ...state,
            columns: nextColumns,
            selectedColumnName: columnName
        }
    })
}

export function openCreateDialog(): void {
    workspaceStore.set((state) => ({
        ...state,
        ...getResetDialogConnectionStatePatch(),
        dialogMode: 'create',
        dialogOpen: true,
        draft: cloneDraft(DEFAULT_CONNECTION_DRAFT)
    }))
}

export function openDeleteDialog(connectionId?: string): void {
    const currentState = workspaceStore.get()
    const nextConnectionId = connectionId ?? currentState.selectedConnectionId
    const targetConnection =
        currentState.connections.find((item) => item.id === nextConnectionId) ?? null

    if (!nextConnectionId || !targetConnection) {
        return
    }

    workspaceStore.set((state) =>
        syncSelectedConnectionState(state, {
            ...state,
            deleteDialogOpen: true,
            deleteTargetConnectionId: targetConnection.id,
            deleteTargetConnectionName: targetConnection.name,
            selectedConnectionId: nextConnectionId
        })
    )
}

export function openEditDialog(connectionOverride?: StoredConnection): void {
    const state = workspaceStore.get()
    const connection = connectionOverride ?? selectSelectedConnection(state)

    if (!connection) {
        return
    }

    workspaceStore.set((currentState) => ({
        ...currentState,
        ...getResetDialogConnectionStatePatch(),
        dialogMode: 'edit',
        dialogOpen: true,
        draft: cloneDraft(connection)
    }))
}

export function selectConnection(connectionId: string): void {
    workspaceStore.set((state) =>
        syncSelectedConnectionState(state, {
            ...state,
            selectedConnectionId: connectionId
        })
    )
}

export async function refreshConnections(preferredConnectionId?: string): Promise<void> {
    const savedConnections = await window.api.listSessions()
    const currentState = workspaceStore.get()
    const nextSelection =
        savedConnections.find((item) => item.id === preferredConnectionId) ??
        savedConnections.find((item) => item.id === currentState.selectedConnectionId) ??
        savedConnections[0] ??
        null

    workspaceStore.set((state) =>
        syncSelectedConnectionState(state, {
            ...state,
            connections: savedConnections,
            selectedConnectionId: nextSelection?.id ?? null
        })
    )
}

export async function handleSaveConnection(): Promise<void> {
    const state = workspaceStore.get()
    const parsedDraft = connectionSaveSchema.safeParse({
        ...state.draft,
        schema: '',
        table: ''
    })

    if (!parsedDraft.success) {
        setWorkspacePatch({
            connectionFeedback: {
                text: getErrorMessage(parsedDraft.error),
                type: 'error'
            }
        })
        return
    }

    setWorkspacePatch({busy: 'saving'})

    try {
        const saved = await window.api.saveSession(parsedDraft.data)
        await refreshConnections(saved.id)
        setWorkspacePatch({dialogOpen: false})
        showNotice('success', 'Connection saved.')

        if (state.snapshot?.session.id === saved.id) {
            await handleConnect(saved.id, state.snapshot.target ?? undefined)
        }
    } catch (error) {
        showNotice('error', getErrorMessage(error))
    } finally {
        setWorkspacePatch({busy: 'idle'})
    }
}

export async function handleExportConnections(): Promise<void> {
    const state = workspaceStore.get()

    if (state.busy !== 'idle') {
        return
    }

    setWorkspacePatch({busy: 'saving'})

    try {
        const result = await window.api.exportSessions()

        if (!result.canceled) {
            showNotice(
                'success',
                `${result.exportedCount} connection${result.exportedCount === 1 ? '' : 's'} exported.`
            )
        }
    } catch (error) {
        showNotice('error', getErrorMessage(error))
    } finally {
        setWorkspacePatch({busy: 'idle'})
    }
}

export async function handleImportConnections(): Promise<void> {
    const state = workspaceStore.get()

    if (state.busy !== 'idle') {
        return
    }

    setWorkspacePatch({busy: 'saving'})

    try {
        const result = await window.api.importSessions()

        if (result.canceled) {
            return
        }

        workspaceStore.set((currentState) => ({
            ...currentState,
            ...getResetConnectionStatePatch()
        }))

        await refreshConnections(state.selectedConnectionId ?? undefined)
        showNotice(
            'success',
            `${result.importedCount} connection${result.importedCount === 1 ? '' : 's'} imported.`
        )
    } catch (error) {
        showNotice('error', getErrorMessage(error))
    } finally {
        setWorkspacePatch({busy: 'idle'})
    }
}

export async function handleTestConnection(options?: {
    autoOpenDatabaseSelect?: boolean
}): Promise<void> {
    const state = workspaceStore.get()
    const shouldAutoOpenDatabaseSelect = options?.autoOpenDatabaseSelect === true

    if (!selectCanTestConnection(state)) {
        return
    }

    setWorkspacePatch({testingConnection: true})

    try {
        const result = await window.api.testConnection(state.draft)
        const trimmedDatabase = state.draft.database.trim()
        const nextDatabase = result.databases.includes(trimmedDatabase) ? trimmedDatabase : ''
        const hostLabel = state.draft.host.trim() || result.connectedDatabase

        workspaceStore.set((currentState) => ({
            ...currentState,
            availableDatabases: result.databases,
            connectionFeedback: {
                text:
                    result.databases.length > 0
                        ? `Connection successful. ${result.databases.length} database${result.databases.length === 1 ? '' : 's'} loaded from host "${hostLabel}". Choose a database to continue.`
                        : `Connection successful, but no databases were returned from host "${hostLabel}".`,
                type: 'success'
            },
            databaseAutoOpenSignal:
                shouldAutoOpenDatabaseSelect && result.databases.length > 0
                    ? currentState.databaseAutoOpenSignal + 1
                    : currentState.databaseAutoOpenSignal,
            draft:
                nextDatabase !== currentState.draft.database
                    ? {
                        ...currentState.draft,
                        database: nextDatabase
                    }
                    : currentState.draft
        }))
    } catch (error) {
        setWorkspacePatch({
            availableDatabases: [],
            connectionFeedback: {
                text: getErrorMessage(error),
                type: 'error'
            }
        })
    } finally {
        setWorkspacePatch({testingConnection: false})
    }
}

export function handleDatabaseFieldFocus(): void {
    const state = workspaceStore.get()
    const canAutoFetch =
        state.draft.host.trim().length > 0 &&
        state.draft.username.trim().length > 0 &&
        state.draft.password.trim().length > 0 &&
        Number.isFinite(state.draft.port) &&
        state.draft.port > 0 &&
        !state.testingConnection &&
        state.busy !== 'saving' &&
        state.availableDatabases.length === 0

    if (!canAutoFetch) {
        return
    }

    const connectionDraftSignature = getConnectionDraftSignature(state.draft)

    if (runtime.databaseAutoFetchSignature === connectionDraftSignature) {
        return
    }

    runtime.databaseAutoFetchSignature = connectionDraftSignature
    void handleTestConnection({
        autoOpenDatabaseSelect: true
    })
}

export async function loadConnectionDatabases(force = false): Promise<void> {
    const state = workspaceStore.get()
    const selectedConnection = selectSelectedConnection(state)

    if (!selectedConnection) {
        return
    }

    const signature = JSON.stringify([
        selectedConnection.host.trim(),
        selectedConnection.port,
        selectedConnection.username.trim(),
        selectedConnection.password,
        selectedConnection.ssl
    ])

    if (
        !force &&
        runtime.connectionDatabasesSignature === signature &&
        state.availableConnectionDatabases.length > 0
    ) {
        return
    }

    setWorkspacePatch({loadingConnectionDatabases: true})

    try {
        const result = await window.api.testConnection(selectedConnection)
        const currentDatabase = selectedConnection.database.trim()
        const nextDatabases = Array.from(
            new Set([...(currentDatabase ? [currentDatabase] : []), ...result.databases])
        )

        runtime.connectionDatabasesSignature = signature
        setWorkspacePatch({availableConnectionDatabases: nextDatabases})
    } catch (error) {
        showNotice('error', getErrorMessage(error))
    } finally {
        setWorkspacePatch({loadingConnectionDatabases: false})
    }
}

export async function handleConnectionDatabaseSelect(nextDatabase: string): Promise<void> {
    const state = workspaceStore.get()
    const selectedConnection = selectSelectedConnection(state)

    if (!selectedConnection) {
        return
    }

    const currentDatabase = selectedConnection.database.trim()
    const normalizedDatabase = nextDatabase.trim()

    if (!normalizedDatabase || normalizedDatabase === currentDatabase) {
        return
    }

    setWorkspacePatch({busy: 'saving'})

    try {
        const saved = await window.api.saveSession({
            ...selectedConnection,
            database: normalizedDatabase,
            schema: '',
            table: ''
        })

        await refreshConnections(saved.id)
        await handleConnect(saved.id)
        showNotice('success', `Switched to "${normalizedDatabase}".`)
    } catch (error) {
        showNotice('error', getErrorMessage(error))
    } finally {
        setWorkspacePatch({busy: 'idle'})
    }
}

export async function handleConnect(
    connectionId: string,
    target?: ConnectRequest['target'],
    options?: {
        busyState?: Extract<BusyState, 'connecting' | 'switchingTarget'>
    }
): Promise<void> {
    const requestSequence = ++runtime.connectRequestSequence
    const busyState = options?.busyState ?? 'connecting'

    setWorkspacePatch({busy: busyState})

    try {
        const nextSnapshot = await window.api.connect({
            sessionId: connectionId,
            target
        })

        if (requestSequence !== runtime.connectRequestSequence) {
            return
        }

        workspaceStore.set((state) =>
            syncSelectedConnectionState(state, {
                ...state,
                columns: nextSnapshot.columns,
                expandedSchemas: (() => {
                    const schemaNames = new Set(
                        nextSnapshot.databaseTree.schemas.map((schemaNode) => schemaNode.name)
                    )
                    const nextExpanded = state.expandedSchemas.filter((schemaName) =>
                        schemaNames.has(schemaName)
                    )

                    if (nextExpanded.length > 0) {
                        return nextExpanded
                    }

                    return getDefaultExpandedSchemas(nextSnapshot)
                })(),
                originalOrder: nextSnapshot.columns.map((column) => column.name),
                selectedColumnName: nextSnapshot.columns[0]?.name ?? null,
                selectedConnectionId: connectionId,
                snapshot: nextSnapshot
            })
        )

        const hasAvailableTables = nextSnapshot.databaseTree.schemas.length > 0
        const noticeText = nextSnapshot.qualifiedName
            ? nextSnapshot.qualifiedName
            : target
                ? hasAvailableTables
                    ? `Connected to "${nextSnapshot.session.database}". The requested table is no longer available. Choose another table from the tree.`
                    : `Connected to "${nextSnapshot.session.database}". No tables are available in this database.`
                : hasAvailableTables
                    ? `Connected to "${nextSnapshot.session.database}". Choose a table from the tree.`
                    : `Connected to "${nextSnapshot.session.database}". No tables are available in this database.`

        showNotice(
            'success',
            noticeText
        )

        void loadConnectionDatabases()
    } catch (error) {
        if (requestSequence !== runtime.connectRequestSequence) {
            return
        }

        workspaceStore.set((state) => ({
            ...state,
            ...getResetConnectionStatePatch()
        }))
        showNotice('error', getErrorMessage(error))
    } finally {
        if (requestSequence === runtime.connectRequestSequence) {
            setWorkspacePatch({busy: 'idle'})
        }
    }
}

export async function handleRefresh(): Promise<void> {
    const state = workspaceStore.get()

    if (!state.selectedConnectionId) {
        return
    }

    const connection =
        state.connections.find((item) => item.id === state.selectedConnectionId) ?? null

    if (connection && !connection.database.trim()) {
        showNotice('info', 'Choose a database for this connection before refreshing.')
        return
    }

    await handleConnect(
        state.selectedConnectionId,
        state.snapshot?.session.id === state.selectedConnectionId
            ? state.snapshot.target ?? undefined
            : undefined,
        {
            busyState:
                state.snapshot?.session.id === state.selectedConnectionId
                    ? 'switchingTarget'
                    : 'connecting'
        }
    )
}

export async function handleConnectionPress(connection: StoredConnection): Promise<void> {
    workspaceStore.set((state) =>
        syncSelectedConnectionState(state, {
            ...state,
            selectedConnectionId: connection.id
        })
    )

    if (!connection.database.trim()) {
        workspaceStore.set((state) => ({
            ...state,
            ...getResetDialogConnectionStatePatch(),
            dialogMode: 'edit',
            dialogOpen: true,
            draft: cloneDraft(connection)
        }))
        showNotice('info', 'Choose a database for this connection before connecting.')
        return
    }

    if (workspaceStore.get().snapshot?.session.id === connection.id) {
        return
    }

    await handleConnect(connection.id)
}

export function handleDisconnect(connectionId?: string): void {
    const state = workspaceStore.get()

    if (!state.snapshot) {
        return
    }

    if (connectionId && state.snapshot.session.id !== connectionId) {
        return
    }

    workspaceStore.set((currentState) => ({
        ...currentState,
        ...getResetConnectionStatePatch()
    }))
    showNotice('info', `Disconnected from "${state.snapshot.session.name}".`)
}

export function toggleSchema(schemaName: string): void {
    workspaceStore.set((state) => ({
        ...state,
        expandedSchemas: state.expandedSchemas.includes(schemaName)
            ? state.expandedSchemas.filter((name) => name !== schemaName)
            : [...state.expandedSchemas, schemaName]
    }))
}

export async function handleTableSelect(schema: string, table: string): Promise<void> {
    const state = workspaceStore.get()

    if (!state.selectedConnectionId) {
        return
    }

    if (state.snapshot?.target?.schema === schema && state.snapshot.target.table === table) {
        return
    }

    await handleConnect(state.selectedConnectionId, {schema, table}, {
        busyState: 'switchingTarget'
    })
}

export async function confirmDelete(): Promise<void> {
    const state = workspaceStore.get()
    const targetConnectionId = state.deleteTargetConnectionId ?? state.selectedConnectionId

    if (!targetConnectionId) {
        return
    }

    setWorkspacePatch({busy: 'saving'})

    try {
        await window.api.deleteSession(targetConnectionId)

        workspaceStore.set((currentState) => ({
            ...currentState,
            ...(
                currentState.snapshot?.session.id === targetConnectionId
                    ? getResetConnectionStatePatch()
                    : {}
            ),
            deleteDialogOpen: false
        }))

        await refreshConnections()
        showNotice('info', 'Connection deleted.')
    } catch (error) {
        showNotice('error', getErrorMessage(error))
    } finally {
        setWorkspacePatch({busy: 'idle'})
    }
}

export async function handlePreviewAction(
    action: 'move_up' | 'move_down' | 'reset',
    selectedColumnOverride?: string | null
): Promise<void> {
    const state = workspaceStore.get()

    try {
        const result = await window.api.previewColumnOrder({
            action,
            columns: state.columns,
            originalOrder: state.originalOrder,
            selectedColumn: selectedColumnOverride ?? state.selectedColumnName
        })

        workspaceStore.set((currentState) => ({
            ...currentState,
            columns: result.columns,
            selectedColumnName: result.selectedColumn
        }))
    } catch (error) {
        showNotice('error', getErrorMessage(error))
    }
}

export async function handleColumnMove(
    columnName: string,
    direction: 'move_up' | 'move_down'
): Promise<void> {
    await handlePreviewAction(direction, columnName)
}

export async function applyReorder(): Promise<void> {
    const state = workspaceStore.get()

    if (!state.snapshot) {
        return
    }

    setWorkspacePatch({busy: 'applying'})

    try {
        const result = await window.api.reorderColumns({
            deleteBackupTableAfterReorder: state.deleteBackupTableAfterReorder,
            orderedColumns: state.columns.map((column) => column.name),
            sessionId: state.snapshot.session.id,
            target: state.snapshot.target ?? undefined
        })

        await handleConnect(state.snapshot.session.id, state.snapshot.target ?? undefined)
        showNotice('success', result.message)
    } catch (error) {
        showNotice('error', getErrorMessage(error))
    } finally {
        setWorkspacePatch({busy: 'idle'})
    }
}
