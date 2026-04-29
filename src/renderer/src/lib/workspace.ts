import type { SessionDraft as ConnectionDraft } from '@shared/contracts'
import { getValidationErrorMessage } from '@shared/validation'

const numberFormatter = new Intl.NumberFormat('en-US')

export function cloneDraft(input: ConnectionDraft): ConnectionDraft {
  return {
    ...input
  }
}

export function tableMeta(connection: Pick<ConnectionDraft, 'host' | 'username'>): string {
  if (connection.username && connection.host) {
    return `${connection.username}@${connection.host}`
  }

  if (connection.host) {
    return connection.host
  }

  if (connection.username) {
    return connection.username
  }

  return 'Database connection'
}

export function formatRowCount(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return '-'
  }

  return numberFormatter.format(value)
}

export function getErrorMessage(error: unknown): string {
  return getValidationErrorMessage(error, 'An unexpected error occurred.')
}
