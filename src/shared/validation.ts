import { z } from 'zod'
import type {
  ColumnInfo,
  ConnectRequest,
  PreviewColumnOrderRequest,
  ReorderRequest,
  SessionFile,
  SessionDraft,
  StoredSession,
  TableTarget
} from './contracts'

const requiredText = (field: string) =>
  z.string().trim().min(1, `${field} is required.`)

const portSchema = z
  .number()
  .int('Port must be an integer.')
  .positive('Port must be greater than 0.')
  .finite('Port must be a valid number.')

export const sessionDraftSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string(),
  host: z.string(),
  port: portSchema,
  username: z.string(),
  password: z.string(),
  database: z.string(),
  schema: z.string(),
  table: z.string(),
  ssl: z.boolean()
})

export const sessionConnectionTestSchema = sessionDraftSchema.superRefine(
  (value, context) => {
    if (value.host.trim().length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Host is required.',
        path: ['host']
      })
    }

    if (value.username.trim().length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'User is required.',
        path: ['username']
      })
    }

    if (value.password.trim().length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Password is required.',
        path: ['password']
      })
    }
  }
)

export const sessionSaveSchema = sessionDraftSchema.superRefine(
  (value, context) => {
    if (value.database.trim().length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Select a database before saving.',
        path: ['database']
      })
    }
  }
)

export const storedSessionSchema = sessionDraftSchema.extend({
  id: requiredText('Session id'),
  createdAt: requiredText('Created time'),
  updatedAt: requiredText('Updated time')
})

export const tableTargetSchema = z.object({
  schema: requiredText('Schema'),
  table: requiredText('Table')
})

export const columnInfoSchema = z.object({
  name: requiredText('Column name'),
  dataType: requiredText('Data type'),
  nullable: z.boolean(),
  defaultValue: z.string().nullable(),
  isIdentity: z.boolean(),
  isGenerated: z.boolean(),
  ordinalPosition: z.number().int().positive('Column order must be positive.'),
  comment: z.string().nullable()
})

export const connectRequestSchema = z.object({
  sessionId: requiredText('Session id'),
  target: tableTargetSchema.optional()
})

export const reorderRequestSchema = z.object({
  sessionId: requiredText('Session id'),
  target: tableTargetSchema.optional(),
  orderedColumns: z.array(requiredText('Column name')).min(1, 'At least one column is required.'),
  deleteBackupTableAfterReorder: z.boolean()
})

export const previewColumnOrderRequestSchema = z.object({
  columns: z.array(columnInfoSchema),
  originalOrder: z.array(requiredText('Column name')),
  selectedColumn: z.string().nullable(),
  action: z.enum(['move_up', 'move_down', 'reset'])
})

export const sessionFileSchema = z.object({
  sessions: z.array(storedSessionSchema),
  lastSessionId: z.string().nullable()
})

export const importedSessionInputSchema = z
  .object({
    createdAt: z.string().optional(),
    database: z.string().optional(),
    host: z.string().optional(),
    name: z.string().optional(),
    password: z.string().optional(),
    port: z.number().optional(),
    schema: z.string().optional(),
    ssl: z.boolean().optional(),
    updatedAt: z.string().optional(),
    username: z.string().optional()
  })
  .passthrough()

export const importedSessionFileSchema = z.union([
  z.array(importedSessionInputSchema),
  z.object({
    sessions: z.array(importedSessionInputSchema)
  })
])

export function getValidationErrorMessage(
  error: unknown,
  fallback = 'Validation failed.'
): string {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message ?? fallback
  }

  if (error instanceof Error) {
    return error.message
  }

  return fallback
}
