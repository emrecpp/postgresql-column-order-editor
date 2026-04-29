export interface SessionDraft {
    id?: string
    name: string
    host: string
    port: number
    username: string
    password: string
    database: string
    schema: string
    table: string
    ssl: boolean
}

export interface StoredSession extends SessionDraft {
    id: string
    createdAt: string
    updatedAt: string
}

export interface ColumnInfo {
    name: string
    dataType: string
    nullable: boolean
    defaultValue: string | null
    isIdentity: boolean
    isGenerated: boolean
    ordinalPosition: number
    comment: string | null
}

export interface TableTarget {
    schema: string
    table: string
}

export interface DatabaseSchemaNode {
    name: string
    tables: string[]
}

export interface DatabaseTree {
    schemas: DatabaseSchemaNode[]
}

export interface TableSnapshot {
    session: StoredSession
    target: TableTarget | null
    databaseTree: DatabaseTree
    qualifiedName: string | null
    estimatedRowCount: number | null
    columns: ColumnInfo[]
    lastConnectedAt: string
}

export interface ConnectRequest {
    sessionId: string
    target?: TableTarget
}

export interface ConnectionTestResult {
    connectedDatabase: string
    databases: string[]
}

export interface ReorderRequest {
    sessionId: string
    target?: TableTarget
    orderedColumns: string[]
    deleteBackupTableAfterReorder: boolean
}

export interface ReorderResult {
    qualifiedName: string
    backupTableName: string | null
    message: string
}

export type PreviewColumnOrderAction = 'move_up' | 'move_down' | 'reset'

export interface PreviewColumnOrderRequest {
    columns: ColumnInfo[]
    originalOrder: string[]
    selectedColumn: string | null
    action: PreviewColumnOrderAction
}

export interface PreviewColumnOrderResult {
    columns: ColumnInfo[]
    selectedColumn: string | null
}

export interface SessionFile {
    sessions: StoredSession[]
    lastSessionId: string | null
}

export interface SessionExportResult {
    canceled: boolean
    exportedCount: number
    filePath: string | null
}

export interface SessionImportResult {
    canceled: boolean
    filePath: string | null
    importedCount: number
}

export interface AppInfo {
    id: string
    name: string
    version: string
    title: string
}

export interface DesktopApi {
    getAppInfo: () => Promise<AppInfo>
    listSessions: () => Promise<StoredSession[]>
    saveSession: (input: SessionDraft) => Promise<StoredSession>
    deleteSession: (id: string) => Promise<void>
    getLastSessionId: () => Promise<string | null>
    exportSessions: () => Promise<SessionExportResult>
    importSessions: () => Promise<SessionImportResult>
    openExternal: (url: string) => Promise<void>
    testConnection: (input: SessionDraft) => Promise<ConnectionTestResult>
    connect: (request: ConnectRequest) => Promise<TableSnapshot>
    previewColumnOrder: (
        request: PreviewColumnOrderRequest
    ) => Promise<PreviewColumnOrderResult>
    reorderColumns: (request: ReorderRequest) => Promise<ReorderResult>
}

export const DEFAULT_SESSION_DRAFT: SessionDraft = {
    name: '',
    host: '',
    port: 5432,
    username: '',
    password: '',
    database: '',
    schema: '',
    table: '',
    ssl: false
}
