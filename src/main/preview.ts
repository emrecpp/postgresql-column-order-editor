import type {
  ColumnInfo,
  PreviewColumnOrderRequest,
  PreviewColumnOrderResult
} from '@shared/contracts'

function cloneColumns(columns: ColumnInfo[]): ColumnInfo[] {
  return columns.map((column) => ({ ...column }))
}

function moveSelectedColumn(
  columns: ColumnInfo[],
  selectedColumn: string,
  direction: -1 | 1
): ColumnInfo[] {
  const currentIndex = columns.findIndex((column) => column.name === selectedColumn)
  const nextIndex = currentIndex + direction

  if (currentIndex === -1 || nextIndex < 0 || nextIndex >= columns.length) {
    return columns
  }

  const nextColumns = [...columns]
  const [column] = nextColumns.splice(currentIndex, 1)
  nextColumns.splice(nextIndex, 0, column)
  return nextColumns
}

function restoreOriginalOrder(
  columns: ColumnInfo[],
  originalOrder: string[]
): ColumnInfo[] {
  const byName = new Map(columns.map((column) => [column.name, column]))

  return originalOrder
    .map((name) => byName.get(name))
    .filter((column): column is ColumnInfo => Boolean(column))
}

export function previewColumnOrder(
  request: PreviewColumnOrderRequest
): PreviewColumnOrderResult {
  const columns = cloneColumns(request.columns)

  if (request.action === 'reset') {
    return {
      columns: restoreOriginalOrder(columns, request.originalOrder),
      selectedColumn: request.selectedColumn
    }
  }

  if (!request.selectedColumn) {
    return {
      columns,
      selectedColumn: null
    }
  }

  return {
    columns:
      request.action === 'move_up'
        ? moveSelectedColumn(columns, request.selectedColumn, -1)
        : moveSelectedColumn(columns, request.selectedColumn, 1),
    selectedColumn: request.selectedColumn
  }
}
