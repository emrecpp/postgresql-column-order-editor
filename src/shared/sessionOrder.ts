export interface HostGroupedSession<TSession> {
    key: string
    label: string
    sessions: TSession[]
}

interface HostSession {
    host: string
}

interface IdentifiedHostSession extends HostSession {
    id: string
}

const emptyHostKey = '__empty_host__'

export function getSessionHostKey(session: HostSession): string {
    const host = session.host.trim().toLowerCase()

    return host || emptyHostKey
}

export function getSessionHostLabel(session: HostSession): string {
    const host = session.host.trim()

    return host || 'No host'
}

export function groupSessionsByHost<TSession extends HostSession>(
    sessions: TSession[]
): Array<HostGroupedSession<TSession>> {
    const groups: Array<HostGroupedSession<TSession>> = []
    const groupMap = new Map<string, HostGroupedSession<TSession>>()

    sessions.forEach((session) => {
        const key = getSessionHostKey(session)
        const existingGroup = groupMap.get(key)

        if (existingGroup) {
            existingGroup.sessions.push(session)
            return
        }

        const group: HostGroupedSession<TSession> = {
            key,
            label: getSessionHostLabel(session),
            sessions: [session]
        }

        groupMap.set(key, group)
        groups.push(group)
    })

    return groups
}

export function normalizeSessionsByHost<TSession extends HostSession>(
    sessions: TSession[]
): TSession[] {
    return groupSessionsByHost(sessions).flatMap((group) => group.sessions)
}

export function normalizeSessionIdsByHost<TSession extends IdentifiedHostSession>(
    sessionIds: string[],
    sessions: TSession[]
): string[] {
    const sessionMap = new Map(sessions.map((session) => [session.id, session]))
    const seenIds = new Set<string>()
    const orderedSessions: TSession[] = []

    sessionIds.forEach((sessionId) => {
        if (seenIds.has(sessionId)) {
            return
        }

        const session = sessionMap.get(sessionId)

        if (!session) {
            return
        }

        seenIds.add(sessionId)
        orderedSessions.push(session)
    })

    sessions.forEach((session) => {
        if (!seenIds.has(session.id)) {
            orderedSessions.push(session)
        }
    })

    return normalizeSessionsByHost(orderedSessions).map((session) => session.id)
}

export function areSessionOrdersEqual<TSession extends {id: string}>(
    left: TSession[],
    right: TSession[]
): boolean {
    return (
        left.length === right.length &&
        left.every((session, index) => session.id === right[index]?.id)
    )
}
