import {
    DEFAULT_SESSION_DRAFT,
    DEFAULT_WORKSPACE_PREFERENCES,
    type SessionDraft,
    type SessionExportResult,
    type SessionFile,
    type SessionImportResult,
    type StoredSession,
    type WorkspacePreferences
} from '@shared/contracts'
import {
    areSessionOrdersEqual,
    normalizeSessionIdsByHost,
    normalizeSessionsByHost
} from '@shared/sessionOrder'
import {
    getValidationErrorMessage,
    importedSessionFileSchema,
    importedSessionInputSchema,
    sessionDraftSchema,
    sessionFileSchema,
    sessionSaveSchema,
    storedSessionSchema,
    workspacePreferencesSchema
} from '@shared/validation'
import {app, safeStorage} from 'electron'
import {
    createCipheriv,
    createDecipheriv,
    createHash,
    randomBytes,
    randomUUID
} from 'node:crypto'
import {mkdir, readFile, writeFile} from 'node:fs/promises'
import {dirname, join} from 'node:path'

interface PersistedSession extends Omit<StoredSession, 'password'> {
    password: string
}

interface PersistedSessionFile {
    sessions: PersistedSession[]
    lastSessionId: string | null
    preferences: WorkspacePreferences
}

type PortableSession = Omit<
    StoredSession,
    'id' | 'createdAt' | 'updatedAt' | 'schema' | 'table'
> &
    Partial<Pick<StoredSession, 'createdAt' | 'updatedAt'>> & {
        order: number
    }

interface PortableSessionFile {
    app: 'postgresql-column-order-editor'
    exportedAt: string
    version: 1
    sessions: PortableSession[]
}

const safeStoragePrefix = 'enc:v1:'
const fallbackPrefix = 'fb:v1:'

const defaultStore = (): SessionFile => ({
    sessions: [],
    lastSessionId: null,
    preferences: {...DEFAULT_WORKSPACE_PREFERENCES}
})

const getStoragePath = (): string => join(app.getPath('userData'), 'sessions.json')

const normalizeText = (value: string): string => value.trim()

function padDatePart(value: number, size = 2): string {
    return String(value).padStart(size, '0')
}

function formatLocalTimestamp(input: Date | string = new Date()): string {
    const date = input instanceof Date ? input : new Date(input)

    if (Number.isNaN(date.getTime())) {
        return typeof input === 'string' ? input : formatLocalTimestamp(new Date())
    }

    const offsetMinutes = -date.getTimezoneOffset()
    const offsetSign = offsetMinutes >= 0 ? '+' : '-'
    const absoluteOffsetMinutes = Math.abs(offsetMinutes)
    const offsetHours = Math.floor(absoluteOffsetMinutes / 60)
    const offsetRemainderMinutes = absoluteOffsetMinutes % 60

    return [
        `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`,
        'T',
        `${padDatePart(date.getHours())}:${padDatePart(date.getMinutes())}:${padDatePart(date.getSeconds())}`,
        `.${padDatePart(date.getMilliseconds(), 3)}`,
        `${offsetSign}${padDatePart(offsetHours)}:${padDatePart(offsetRemainderMinutes)}`
    ].join('')
}

const deriveName = (input: SessionDraft): string => {
    if (input.database) {
        return input.database
    }

    if (input.host && input.username) {
        return `${input.username}@${input.host}`
    }

    if (input.host) {
        return input.host
    }

    return 'Untitled connection'
}

function buildFallbackKey(): Buffer {
    const seed = [
        app.getName(),
        app.getPath('userData'),
        process.env.USERNAME ?? '',
        process.env.COMPUTERNAME ?? '',
        process.platform
    ].join('|')

    return createHash('sha256').update(seed).digest()
}

function encryptPassword(password: string): string {
    if (safeStorage.isEncryptionAvailable()) {
        return `${safeStoragePrefix}${safeStorage.encryptString(password).toString('base64')}`
    }

    // test commentoryyy
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', buildFallbackKey(), iv)
    const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()

    return `${fallbackPrefix}${Buffer.concat([iv, authTag, encrypted]).toString('base64')}`
}

function decryptPassword(password: string): string {
    if (password.startsWith(safeStoragePrefix)) {
        return safeStorage.decryptString(
            Buffer.from(password.slice(safeStoragePrefix.length), 'base64')
        )
    }

    if (password.startsWith(fallbackPrefix)) {
        const payload = Buffer.from(password.slice(fallbackPrefix.length), 'base64')
        const iv = payload.subarray(0, 12)
        const authTag = payload.subarray(12, 28)
        const encrypted = payload.subarray(28)
        const decipher = createDecipheriv('aes-256-gcm', buildFallbackKey(), iv)
        decipher.setAuthTag(authTag)

        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    }

    return password
}

function toPortableStore(store: SessionFile): PortableSessionFile {
    return {
        app: 'postgresql-column-order-editor',
        exportedAt: formatLocalTimestamp(),
        version: 1,
        sessions: store.sessions.map((session, index) => ({
            name: session.name,
            host: session.host,
            order: index,
            port: session.port,
            username: session.username,
            password: session.password ? encryptPassword(session.password) : '',
            database: session.database,
            ssl: session.ssl,
            createdAt: formatLocalTimestamp(session.createdAt),
            updatedAt: formatLocalTimestamp(session.updatedAt)
        }))
    }
}

function toPersistedStore(store: SessionFile): PersistedSessionFile {
    return {
        ...store,
        sessions: store.sessions.map((session) => ({
            ...session,
            password: encryptPassword(session.password)
        }))
    }
}

const normalizeDraft = (
    input: SessionDraft,
    existing?: StoredSession | undefined
): SessionDraft => {
    const merged: SessionDraft = {
        ...DEFAULT_SESSION_DRAFT,
        ...existing,
        ...input,
        port: Number.isFinite(input.port) ? input.port : DEFAULT_SESSION_DRAFT.port
    }

    const normalized: SessionDraft = {
        ...merged,
        id: input.id ?? existing?.id,
        name: normalizeText(merged.name),
        host: normalizeText(merged.host),
        port: Math.trunc(merged.port),
        username: normalizeText(merged.username),
        password: merged.password,
        database: normalizeText(merged.database),
        schema: '',
        table: '',
        ssl: Boolean(merged.ssl)
    }

    if (!normalized.name) {
        normalized.name = deriveName(normalized)
    }

    if (normalized.port <= 0) {
        normalized.port = DEFAULT_SESSION_DRAFT.port
    }

    return normalized
}

async function readStore(): Promise<SessionFile> {
    try {
        const raw = await readFile(getStoragePath(), 'utf-8')
        const parsed = sessionFileSchema.parse(JSON.parse(raw))
        const persistedSessions = parsed.sessions
        let shouldRewrite = false

        const sessions = persistedSessions.map((session) => {
            if (
                typeof session.password === 'string' &&
                !session.password.startsWith(safeStoragePrefix) &&
                !session.password.startsWith(fallbackPrefix)
            ) {
                shouldRewrite = true
            }

            if (session.table) {
                shouldRewrite = true
            }

            if (session.schema) {
                shouldRewrite = true
            }

            return {
                ...session,
                schema: '',
                table: '',
                password: decryptPassword(session.password)
            }
        })

        const orderedSessions = normalizeSessionsByHost(sessions)

        if (!areSessionOrdersEqual(sessions, orderedSessions)) {
            shouldRewrite = true
        }

        const store: SessionFile = {
            sessions: orderedSessions,
            lastSessionId: parsed.lastSessionId,
            preferences: parsed.preferences
        }

        if (shouldRewrite) {
            await writeStore(store)
        }

        return store
    } catch (error) {
        const maybeError = error as NodeJS.ErrnoException

        if (maybeError.code === 'ENOENT') {
            return defaultStore()
        }

        throw error
    }
}

async function writeStore(store: SessionFile): Promise<void> {
    const storagePath = getStoragePath()
    const normalizedStore: SessionFile = {
        ...store,
        sessions: normalizeSessionsByHost(store.sessions)
    }

    await mkdir(dirname(storagePath), {recursive: true})
    await writeFile(storagePath, JSON.stringify(toPersistedStore(normalizedStore), null, 2), 'utf-8')
}

function normalizeImportedSession(input: unknown): StoredSession | null {
    const parsedInput = importedSessionInputSchema.safeParse(input)

    if (!parsedInput.success) {
        return null
    }

    const importedInput = parsedInput.data

    let importedPassword = importedInput.password ?? ''

    if (
        importedPassword.startsWith(safeStoragePrefix) ||
        importedPassword.startsWith(fallbackPrefix)
    ) {
        try {
            importedPassword = decryptPassword(importedPassword)
        } catch {
            throw new Error('One or more imported connection passwords could not be decrypted.')
        }
    }

    const normalizedDraft = sessionDraftSchema.parse(
        normalizeDraft({
            name: importedInput.name ?? '',
            host: importedInput.host ?? '',
            port: importedInput.port ?? DEFAULT_SESSION_DRAFT.port,
            username: importedInput.username ?? '',
            password: importedPassword,
            database: importedInput.database ?? '',
            schema: '',
            table: '',
            ssl: importedInput.ssl ?? false
        })
    )

    const now = formatLocalTimestamp()

    return storedSessionSchema.parse({
        ...normalizedDraft,
        id: randomUUID(),
        createdAt: importedInput.createdAt ?? now,
        updatedAt: importedInput.updatedAt ?? now
    })
}

function parseImportedSessions(payload: unknown): StoredSession[] {
    const parsedPayload = importedSessionFileSchema.safeParse(payload)

    if (!parsedPayload.success) {
        throw new Error(getValidationErrorMessage(parsedPayload.error, 'Invalid session file format.'))
    }

    const rawSessions = Array.isArray(parsedPayload.data)
        ? parsedPayload.data
        : parsedPayload.data.sessions

    const orderedRawSessions = rawSessions
        .map((session, index) => ({
            index,
            order: session.order ?? index,
            session
        }))
        .sort((left, right) => left.order - right.order || left.index - right.index)

    return orderedRawSessions
        .map((item) => normalizeImportedSession(item.session))
        .filter((session): session is StoredSession => session !== null)
}

function validateNormalizedDraft(input: SessionDraft): SessionDraft {
    return sessionDraftSchema.parse(input)
}

function validateSavableDraft(input: SessionDraft): SessionDraft {
    return sessionSaveSchema.parse(input)
}

export async function listSessions(): Promise<StoredSession[]> {
    const store = await readStore()
    return store.sessions
}

export async function getLastSessionId(): Promise<string | null> {
    const store = await readStore()
    return store.lastSessionId
}

export async function getWorkspacePreferences(): Promise<WorkspacePreferences> {
    const store = await readStore()
    return store.preferences
}

export async function saveWorkspacePreferences(
    input: WorkspacePreferences
): Promise<WorkspacePreferences> {
    const store = await readStore()
    const preferences = workspacePreferencesSchema.parse(input)

    store.preferences = preferences
    await writeStore(store)

    return preferences
}

export async function getSessionById(id: string): Promise<StoredSession> {
    const store = await readStore()
    const session = store.sessions.find((item) => item.id === id)

    if (!session) {
        throw new Error('Saved connection not found.')
    }

    return session
}

export async function markLastSession(id: string | null): Promise<void> {
    const store = await readStore()
    store.lastSessionId = id
    await writeStore(store)
}

export async function saveSession(input: SessionDraft): Promise<StoredSession> {
    const store = await readStore()
    const existingIndex = input.id
        ? store.sessions.findIndex((item) => item.id === input.id)
        : -1
    const existing = existingIndex >= 0 ? store.sessions[existingIndex] : undefined
    const normalized = validateSavableDraft(validateNormalizedDraft(normalizeDraft(input, existing)))
    const now = formatLocalTimestamp()

    const session: StoredSession = existing
        ? storedSessionSchema.parse({
            ...existing,
            ...normalized,
            createdAt: existing.createdAt,
            updatedAt: now
        })
        : storedSessionSchema.parse({
            ...normalized,
            id: randomUUID(),
            createdAt: now,
            updatedAt: now
        })

    if (existingIndex >= 0) {
        store.sessions[existingIndex] = session
    } else {
        store.sessions.unshift(session)
    }

    store.lastSessionId = session.id
    await writeStore(store)
    return session
}

export async function reorderSessions(sessionIds: string[]): Promise<StoredSession[]> {
    const store = await readStore()
    const normalizedIds = normalizeSessionIdsByHost(sessionIds, store.sessions)
    const sessionMap = new Map(store.sessions.map((session) => [session.id, session]))
    const nextSessions = normalizedIds
        .map((sessionId) => sessionMap.get(sessionId))
        .filter((session): session is StoredSession => session !== undefined)

    if (nextSessions.length !== store.sessions.length) {
        throw new Error('Connection order could not be saved.')
    }

    store.sessions = nextSessions
    await writeStore(store)
    return store.sessions
}

export async function deleteSession(id: string): Promise<void> {
    const store = await readStore()
    const nextSessions = store.sessions.filter((item) => item.id !== id)

    if (nextSessions.length === store.sessions.length) {
        throw new Error('Connection to delete was not found.')
    }

    store.sessions = nextSessions

    if (store.lastSessionId === id) {
        store.lastSessionId = nextSessions[0]?.id ?? null
    }

    await writeStore(store)
}

export async function exportSessionsToPath(filePath: string): Promise<SessionExportResult> {
    const store = await readStore()
    const portableStore = toPortableStore(store)

    await mkdir(dirname(filePath), {recursive: true})
    await writeFile(filePath, JSON.stringify(portableStore, null, 2), 'utf-8')

    return {
        canceled: false,
        exportedCount: portableStore.sessions.length,
        filePath
    }
}

export async function importSessionsFromPath(filePath: string): Promise<SessionImportResult> {
    const raw = await readFile(filePath, 'utf-8')
    const importedSessions = parseImportedSessions(JSON.parse(raw))

    if (importedSessions.length === 0) {
        throw new Error('No valid connections were found in the selected file.')
    }

    const currentStore = await readStore()
    const store: SessionFile = {
        sessions: importedSessions,
        lastSessionId: importedSessions[0]?.id ?? null,
        preferences: currentStore.preferences
    }

    await writeStore(store)

    return {
        canceled: false,
        filePath,
        importedCount: importedSessions.length
    }
}
