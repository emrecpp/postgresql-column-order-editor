import type { LucideIcon } from 'lucide-react'
import {
  Binary,
  Braces,
  CalendarDays,
  Clock3,
  Database,
  FileJson2,
  Hash,
  KeyRound,
  ToggleLeft,
  Type
} from 'lucide-react'

export type ColumnTypeTone =
  | 'text'
  | 'number'
  | 'date'
  | 'time'
  | 'boolean'
  | 'json'
  | 'binary'
  | 'key'
  | 'default'

export interface ColumnTypeMeta {
  icon: LucideIcon
  tone: ColumnTypeTone
}

const toneClassMap: Record<ColumnTypeTone, string> = {
  text: 'border-sky-400/25 bg-sky-400/10 text-studio-blue',
  number: 'border-studio-amber/25 bg-studio-amber/10 text-studio-amber',
  date: 'border-emerald-400/25 bg-emerald-400/10 text-studio-green',
  time: 'border-cyan-400/25 bg-cyan-400/10 text-studio-cyan',
  boolean: 'border-orange-300/25 bg-orange-300/10 text-studio-orange',
  json: 'border-amber-300/25 bg-amber-300/10 text-studio-sand',
  binary: 'border-slate-300/20 bg-slate-300/10 text-studio-frost',
  key: 'border-yellow-200/25 bg-yellow-200/10 text-studio-amber',
  default: 'border-white/10 bg-white/5 text-[#d4d4d4]'
}

export function getColumnTypeIconClassName(tone: ColumnTypeTone, large = false): string {
  return [
    'inline-flex items-center justify-center rounded-xl border',
    large ? 'h-[38px] w-[38px]' : 'h-[34px] w-[34px]',
    toneClassMap[tone]
  ].join(' ')
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle))
}

export function getColumnTypeMeta(dataType: string): ColumnTypeMeta {
  const normalized = dataType.trim().toLowerCase()

  if (normalized.includes('uuid')) {
    return {
      icon: KeyRound,
      tone: 'key'
    }
  }

  if (
    includesAny(normalized, [
      'varchar',
      'character varying',
      'char',
      'character',
      'text',
      'citext'
    ])
  ) {
    return {
      icon: Type,
      tone: 'text'
    }
  }

  if (
    includesAny(normalized, [
      'smallint',
      'integer',
      'bigint',
      'decimal',
      'numeric',
      'real',
      'double',
      'serial',
      'money'
    ])
  ) {
    return {
      icon: Hash,
      tone: 'number'
    }
  }

  if (includesAny(normalized, ['timestamp', 'time'])) {
    return {
      icon: Clock3,
      tone: 'time'
    }
  }

  if (normalized.includes('date')) {
    return {
      icon: CalendarDays,
      tone: 'date'
    }
  }

  if (includesAny(normalized, ['bool'])) {
    return {
      icon: ToggleLeft,
      tone: 'boolean'
    }
  }

  if (includesAny(normalized, ['json', 'jsonb', 'xml', 'hstore'])) {
    return {
      icon: FileJson2,
      tone: 'json'
    }
  }

  if (includesAny(normalized, ['bytea', 'binary', 'varbinary', 'blob', 'bit'])) {
    return {
      icon: Binary,
      tone: 'binary'
    }
  }

  if (includesAny(normalized, ['array', '[]', 'record'])) {
    return {
      icon: Braces,
      tone: 'json'
    }
  }

  return {
    icon: Database,
    tone: 'default'
  }
}
