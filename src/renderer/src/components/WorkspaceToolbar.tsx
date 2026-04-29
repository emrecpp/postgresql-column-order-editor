import type {BusyState} from '@renderer/hooks/useReorderWorkspace'
import type {TableSnapshot} from '@shared/contracts'
import {Database, Table2} from 'lucide-react'
import TargetDropdown from './TargetDropdown'

interface WorkspaceToolbarProps {
    busy: BusyState
    onSelectTarget: (schema: string, table: string) => void
    snapshot: TableSnapshot | null
}

function WorkspaceToolbar({
    busy,
    onSelectTarget,
    snapshot
}: WorkspaceToolbarProps) {
    const availableSchemas = snapshot?.databaseTree.schemas ?? []
    const hasResolvedTarget = Boolean(snapshot?.target)
    const selectedSchemaNode =
        availableSchemas.find((schemaNode) => schemaNode.name === snapshot?.target?.schema) ??
        availableSchemas[0]
    const availableTables = selectedSchemaNode?.tables ?? []
    const disableTargetSelection =
        !snapshot || !hasResolvedTarget || busy === 'connecting' || busy === 'applying' || busy === 'saving'

    const schemaOptions = availableSchemas.map((schemaNode) => ({
        meta: `${schemaNode.tables.length} tables`,
        value: schemaNode.name
    }))

    const tableOptions = availableTables.map((tableName) => ({
        meta: selectedSchemaNode?.name ?? undefined,
        value: tableName
    }))

    function handleSchemaSelect(nextSchemaName: string): void {
        if (!snapshot) {
            return
        }

        const nextSchemaNode = availableSchemas.find((schemaNode) => schemaNode.name === nextSchemaName)

        if (!nextSchemaNode) {
            return
        }

        const nextTableName = nextSchemaNode.tables.includes(snapshot.target?.table ?? '')
            ? snapshot.target?.table ?? ''
            : nextSchemaNode.tables[0]

        if (!nextTableName) {
            return
        }

        onSelectTarget(nextSchemaName, nextTableName)
    }

    function handleTableSelect(nextTableName: string): void {
        if (!selectedSchemaNode) {
            return
        }

        onSelectTarget(selectedSchemaNode.name, nextTableName)
    }

    return (
        <div className="flex flex-wrap items-start justify-between gap-3 max-[720px]:flex-col max-[720px]:items-stretch">

            {snapshot && snapshot.target ? (
                <div className="grid min-w-[min(540px,100%)] flex-[0_1_540px] grid-cols-[minmax(168px,0.82fr)_minmax(236px,1.18fr)] gap-3 max-[720px]:min-w-0 max-[720px]:grid-cols-1">
                    <TargetDropdown
                        disabled={disableTargetSelection}
                        hint={`${availableSchemas.length} schemas`}
                        icon={Database}
                        label="Schema"
                        onSelect={handleSchemaSelect}
                        options={schemaOptions}
                        searchPlaceholder="Search schema"
                        selectedValue={selectedSchemaNode?.name ?? ''}
                        tone="schema"
                    />

                    <TargetDropdown
                        align="end"
                        disabled={disableTargetSelection}
                        hint={`${availableTables.length} tables`}
                        icon={Table2}
                        label="Table"
                        onSelect={handleTableSelect}
                        options={tableOptions}
                        searchPlaceholder="Search table"
                        selectedValue={snapshot.target.table}
                        wideMenu
                    />
                </div>
            ) : null}
        </div>
    )
}

export default WorkspaceToolbar
