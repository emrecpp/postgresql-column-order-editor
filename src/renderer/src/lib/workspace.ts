import type {
  DatabaseSchemaNode,
  SessionDraft as ConnectionDraft
} from '@shared/contracts'
import { getValidationErrorMessage } from '@shared/validation'

const numberFormatter = new Intl.NumberFormat('en-US')

export function cloneDraft(input: ConnectionDraft): ConnectionDraft {
  return {
    ...input
  }
}

export interface FilteredDatabaseSchemaNode {
  matchesSchema: boolean
  name: string
  tables: string[]
  totalTableCount: number
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

export function filterDatabaseSchemasByQuery(
  schemas: DatabaseSchemaNode[],
  query: string
): FilteredDatabaseSchemaNode[] {
  const normalizedQuery = query.trim().toLowerCase()

  if (!normalizedQuery) {
    return schemas.map((schemaNode) => ({
      matchesSchema: false,
      name: schemaNode.name,
      tables: [...schemaNode.tables],
      totalTableCount: schemaNode.tables.length
    }))
  }

  return schemas.reduce<FilteredDatabaseSchemaNode[]>((results, schemaNode) => {
    const matchesSchema = schemaNode.name.toLowerCase().includes(normalizedQuery)
    const matchingTables = matchesSchema
      ? [...schemaNode.tables]
      : schemaNode.tables.filter((tableName) => tableName.toLowerCase().includes(normalizedQuery))

    if (!matchesSchema && matchingTables.length === 0) {
      return results
    }

    results.push({
      matchesSchema,
      name: schemaNode.name,
      tables: matchingTables,
      totalTableCount: schemaNode.tables.length
    })

    return results
  }, [])
}
