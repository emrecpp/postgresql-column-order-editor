import {
    DEFAULT_SESSION_DRAFT,
    type SessionDraft,
    type SessionExportResult,
    type SessionFile,
    type SessionImportResult,
    type StoredSession
} from '@shared/contracts'
import {
    getValidationErrorMessage,
    importedSessionFileSchema,
    importedSessionInputSchema,
    sessionDraftSchema,
    sessionFileSchema,
    sessionSaveSchema,
    storedSessionSchema
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
}

interface PortableSessionFile {
    app: 'postgresql-column-order-editor'
    exportedAt: string
    passwordEncoding: 'app-encrypted'
    passwordsIncluded: true
    version: 1
    sessions: Array<Omit<StoredSession, 'id' | 'createdAt' | 'updatedAt'> & Partial<Pick<StoredSession, 'createdAt' | 'updatedAt'>>>
}

const safeStoragePrefix = 'enc:v1:'
const fallbackPrefix = 'fb:v1:'

const defaultStore = (): SessionFile => ({
    sessions: [],
    lastSessionId: null
})

const getStoragePath = (): string => join(app.getPath('userData'), 'sessions.json')

const normalizeText = (value: string): string => value.trim()

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
        exportedAt: new Date().toISOString(),
        passwordEncoding: 'app-encrypted',
        passwordsIncluded: true,
        version: 1,
        sessions: store.sessions.map((session) => ({
            name: session.name,
            host: session.host,
            port: session.port,
            username: session.username,
            password: session.password ? encryptPassword(session.password) : '',
            database: session.database,
            schema: '',
            table: '',
            ssl: session.ssl,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt
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

        const store: SessionFile = {
            sessions,
            lastSessionId: parsed.lastSessionId
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
    await mkdir(dirname(storagePath), {recursive: true})
    await writeFile(storagePath, JSON.stringify(toPersistedStore(store), null, 2), 'utf-8')
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

    const now = new Date().toISOString()

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

    return rawSessions
        .map((session) => normalizeImportedSession(session))
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
    return [...store.sessions].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt)
    )
}

export async function getLastSessionId(): Promise<string | null> {
    const store = await readStore()
    return store.lastSessionId
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
    const now = new Date().toISOString()

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

    const store: SessionFile = {
        sessions: importedSessions,
        lastSessionId: importedSessions[0]?.id ?? null
    }

    await writeStore(store)

    return {
        canceled: false,
        filePath,
        importedCount: importedSessions.length
    }
}
