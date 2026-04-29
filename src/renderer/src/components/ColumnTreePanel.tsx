import {getColumnTypeIconClassName, getColumnTypeMeta} from '@renderer/lib/columnType'
import {
    badgeClass,
    buttonGhostClass,
    buttonPrimaryClass,
    buttonSquareClass,
    cardPanelClass,
    cn,
    panelSubtitleClass,
    panelTitleClass,
    pillClass,
    scrollbarClass,
    sectionEyebrowClass
} from '@renderer/lib/ui'
import {
    applyReorder,
    handleColumnMove,
    handleConnectionDatabaseSelect,
    handleRefresh,
    loadConnectionDatabases,
    selectCanApply,
    handleTableSelect as selectWorkspaceTarget,
    setDeleteBackupTableAfterReorder,
    setSelectedColumnName,
    toggleSchema,
    workspaceStore
} from '@renderer/store/workspaceStore'
import {useShallow, useStoreValue} from '@simplestack/store/react'
import {ArrowDown, ArrowUp, ChevronDown, ChevronRight, Database, Folders, RefreshCcw, Save, Table2} from 'lucide-react'
import {type KeyboardEvent, useEffect, useRef} from 'react'
import TargetDropdown from './TargetDropdown'
import {CheckboxField} from './ui/checkbox'

function ColumnTreePanel() {
    const [
        availableDatabases,
        busy,
        columns,
        deleteBackupTableAfterReorder,
        expandedSchemas,
        loadingDatabases,
        selectedColumnName,
        selectedConnectionId,
        snapshot
    ] = useStoreValue(
        workspaceStore,
        useShallow((state) => [
            state.availableConnectionDatabases,
            state.busy,
            state.columns,
            state.deleteBackupTableAfterReorder,
            state.expandedSchemas,
            state.loadingConnectionDatabases,
            state.selectedColumnName,
            state.selectedConnectionId,
            state.snapshot
        ] as const)
    )
    const canApply = useStoreValue(workspaceStore, selectCanApply)
    const columnButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
    const focusTargetRef = useRef<string | null>(null)
    const availableSchemas = snapshot?.databaseTree.schemas ?? []
    const hasResolvedTarget = Boolean(snapshot?.target)
    const selectedSchemaNode =
        availableSchemas.find((schemaNode) => schemaNode.name === snapshot?.target?.schema) ??
        availableSchemas[0]
    const availableTables = selectedSchemaNode?.tables ?? []
    const disableMoveActions =
        busy === 'applying' ||
        busy === 'connecting' ||
        busy === 'switchingTarget' ||
        busy === 'saving'
    const disableTreeSelection = !snapshot || disableMoveActions
    const disableTargetSelection = !snapshot || !hasResolvedTarget || disableMoveActions
    const toolbarBusy = busy === 'connecting' || busy === 'switchingTarget'
    const databaseOptions = availableDatabases.map((databaseName) => ({
        meta: 'saved connection',
        value: databaseName
    }))

    const schemaOptions = availableSchemas.map((schemaNode) => ({
        meta: `${schemaNode.tables.length} tables`,
        value: schemaNode.name
    }))

    const tableOptions = availableTables.map((tableName) => ({
        meta: selectedSchemaNode?.name ?? undefined,
        value: tableName
    }))

    useEffect(() => {
        if (!selectedColumnName) {
            return
        }

        const nextTarget = focusTargetRef.current

        if (nextTarget && nextTarget === selectedColumnName) {
            const nextFrame = window.requestAnimationFrame(() => {
                columnButtonRefs.current[selectedColumnName]?.focus()
                columnButtonRefs.current[selectedColumnName]?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest'
                })
            })

            focusTargetRef.current = null
            return () => window.cancelAnimationFrame(nextFrame)
        }

        columnButtonRefs.current[selectedColumnName]?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
        })
    }, [columns, selectedColumnName])

    function focusColumn(name: string): void {
        focusTargetRef.current = name
        setSelectedColumnName(name)
    }

    function handleColumnKeyDown(
        event: KeyboardEvent<HTMLButtonElement>,
        index: number,
        columnName: string
    ): void {
        if (event.key === 'ArrowUp') {
            event.preventDefault()

            if ((event.shiftKey || event.altKey) && !disableMoveActions && index > 0) {
                focusTargetRef.current = columnName
                handleColumnMove(columnName, 'move_up')
                return
            }

            const previousColumn = columns[index - 1]

            if (previousColumn) {
                focusColumn(previousColumn.name)
            }

            return
        }

        if (event.key === 'ArrowDown') {
            event.preventDefault()

            if ((event.shiftKey || event.altKey) && !disableMoveActions && index < columns.length - 1) {
                focusTargetRef.current = columnName
                handleColumnMove(columnName, 'move_down')
                return
            }

            const nextColumn = columns[index + 1]

            if (nextColumn) {
                focusColumn(nextColumn.name)
            }

            return
        }

        if (event.key === 'Home') {
            event.preventDefault()

            const firstColumn = columns[0]

            if (firstColumn) {
                focusColumn(firstColumn.name)
            }

            return
        }

        if (event.key === 'End') {
            event.preventDefault()

            const lastColumn = columns[columns.length - 1]

            if (lastColumn) {
                focusColumn(lastColumn.name)
            }
        }
    }

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

        selectWorkspaceTarget(nextSchemaName, nextTableName)
    }

    function handleTableSelect(nextTableName: string): void {
        if (!selectedSchemaNode) {
            return
        }

        selectWorkspaceTarget(selectedSchemaNode.name, nextTableName)
    }

    return (
        <section className={cn(cardPanelClass, 'flex min-h-0 flex-col')}>
            <div className="flex items-start justify-between gap-3 border-b border-studio-border/80 p-3.5 max-[720px]:flex-col max-[720px]:items-stretch">
                <div className="flex min-w-0 flex-col gap-1">
                    <span className={sectionEyebrowClass}>COLUMN TREE</span>
                    <span className={panelTitleClass}>Column order</span>
                    <span className={panelSubtitleClass}>Arrow keys navigate, Shift + arrows reorder</span>
                </div>

                <span className={pillClass}>{columns.length}</span>
            </div>

            <div className="border-b border-studio-border/80 px-3.5 py-3">
                {snapshot && snapshot.target ? (
                    <div className="grid grid-cols-[minmax(168px,0.82fr)_minmax(168px,0.82fr)_minmax(236px,1.18fr)] gap-3 max-[980px]:grid-cols-1">
                        <TargetDropdown
                            disabled={disableTargetSelection}
                            emptyMessage={
                                loadingDatabases
                                    ? 'Loading databases...'
                                    : 'No databases loaded for this connection.'
                            }
                            hint={
                                loadingDatabases
                                    ? 'Loading databases...'
                                    : `${databaseOptions.length} database${databaseOptions.length === 1 ? '' : 's'}`
                            }
                            icon={Database}
                            label="Database"
                            onOpenChange={(open) => {
                                if (open) {
                                    loadConnectionDatabases()
                                }
                            }}
                            onSelect={(database) => handleConnectionDatabaseSelect(database)}
                            optionIcon={Database}
                            options={databaseOptions}
                            searchPlaceholder="Search database"
                            selectedValue={snapshot.session.database}
                            wideMenu
                        />

                        <TargetDropdown
                            disabled={disableTargetSelection}
                            hint={`${availableSchemas.length} schemas`}
                            icon={Folders}
                            label="Schema"
                            onSelect={handleSchemaSelect}
                            optionIcon={Folders}
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
                            optionIcon={Table2}
                            options={tableOptions}
                            searchPlaceholder="Search table"
                            selectedValue={snapshot.target.table}
                            wideMenu
                        />
                    </div>
                ) : (
                    <div className="text-center text-sm text-studio-muted">
                        Select a table from the tree below to load its columns.
                    </div>
                )}
            </div>

            <div className={cn('min-h-0 flex-1 overflow-y-auto p-3.5 pr-2 max-[980px]:max-h-[320px]', scrollbarClass)}>
                {!snapshot?.target ? (
                    availableSchemas.length === 0 ? (
                        <div className="grid min-h-full place-items-center text-center text-studio-muted">
                            No schemas or tables found.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-3">


                            <div className="flex flex-col gap-2">
                                {availableSchemas.map((schemaNode) => {
                                    const isExpanded = expandedSchemas.includes(schemaNode.name)

                                    return (
                                        <div className="flex flex-col gap-1.5" key={schemaNode.name}>
                                            <button
                                                className={cn(
                                                    'flex min-h-10 w-full items-center gap-2.5 rounded-2xl border px-3 py-2.5 text-left font-semibold transition duration-150 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0',
                                                    isExpanded
                                                        ? 'border-studio-amber/30 bg-studio-gold'
                                                        : 'border-studio-amber/15 bg-[linear-gradient(180deg,rgba(255,209,102,0.06),rgba(255,209,102,0.02))]'
                                                )}
                                                disabled={disableTreeSelection}
                                                onClick={() => toggleSchema(schemaNode.name)}
                                                type="button"
                                            >
                                                <span className="inline-flex w-4 flex-none items-center justify-center text-studio-amber">
                                                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                </span>

                                                <div className="flex min-w-0 flex-col gap-0.5">
                                                    <span className="truncate text-studio-amber">{schemaNode.name}</span>
                                                    <span className="text-xs text-studio-amber-soft">
                                                        {schemaNode.tables.length} tables
                                                    </span>
                                                </div>
                                            </button>

                                            {isExpanded ? (
                                                <div className="flex flex-col gap-1.5 pl-[18px]">
                                                    {schemaNode.tables.map((table) => (
                                                        <button
                                                            className="flex min-h-10 w-full items-center gap-2.5 rounded-2xl border border-studio-border bg-studio-panel-soft px-3 py-2.5 text-left text-studio-muted-strong transition duration-150 hover:-translate-y-0.5 hover:border-studio-border-strong hover:text-studio-text disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                                                            disabled={disableTreeSelection}
                                                            key={`${schemaNode.name}.${table}`}
                                                            onClick={() => selectWorkspaceTarget(schemaNode.name, table)}
                                                            type="button"
                                                        >
                                                            <Table2 size={13} />
                                                            <div className="flex min-w-0 flex-col gap-0.5">
                                                                <span className="truncate">{table}</span>
                                                                <span className="text-xs text-studio-muted">{schemaNode.name}</span>
                                                            </div>
                                                        </button>
                                                    ))}
                                                </div>
                                            ) : null}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                    )
                ) : columns.length === 0 ? (
                    <div className="grid min-h-full place-items-center text-studio-muted">No columns found.</div>
                ) : (
                    <div className="flex flex-col gap-1.5">
                        {columns.map((column, index) => {
                            const isSelected = column.name === selectedColumnName
                            const typeMeta = getColumnTypeMeta(column.dataType)
                            const TypeIcon = typeMeta.icon
                            const flags: string[] = []

                            if (!column.nullable) {
                                flags.push('NOT NULL')
                            }

                            if (column.isIdentity) {
                                flags.push('IDENTITY')
                            }

                            if (column.isGenerated) {
                                flags.push('GENERATED')
                            }

                            return (
                                <div
                                    className={cn(
                                        'grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 rounded-[14px] border border-transparent bg-white/[0.03] px-3 py-2.5 transition duration-150 hover:border hover:border-gray-700/50 focus-within:ring-1 focus-within:ring-inset focus-within:ring-sky-300/20 max-[720px]:grid-cols-1',
                                        isSelected && 'bg-white/[0.05]'
                                    )}
                                    key={column.name}
                                >
                                    <button
                                        aria-pressed={isSelected}
                                        className="grid w-full min-w-0 grid-cols-[42px_34px_minmax(0,1fr)] items-center gap-2.5 rounded-xl bg-transparent text-left text-studio-text outline-none"
                                        onClick={() => setSelectedColumnName(column.name)}
                                        onKeyDown={(event) => handleColumnKeyDown(event, index, column.name)}
                                        ref={(element) => {
                                            columnButtonRefs.current[column.name] = element
                                        }}
                                        type="button"
                                    >
                                        <span className="text-[11px] tabular-nums leading-none text-studio-muted">
                                            #{String(index + 1).padStart(2, '0')}
                                        </span>

                                        <span className={getColumnTypeIconClassName(typeMeta.tone)}>
                                            <TypeIcon size={14} />
                                        </span>

                                        <div className="flex min-w-0 flex-col gap-1">
                                            <span className="break-words font-semibold leading-[1.35]">{column.name}</span>
                                            <span className="break-words text-xs leading-[1.35] text-studio-muted">
                                                {column.dataType}
                                            </span>
                                        </div>
                                    </button>

                                    <div className="flex flex-wrap items-center justify-end gap-1.5 max-[720px]:ml-[52px] max-[720px]:justify-start">
                                        {flags.map((flag) => (
                                            <span className={cn(badgeClass, 'bg-white/[0.04]')} key={flag}>
                                                {flag}
                                            </span>
                                        ))}
                                    </div>

                                    <div className="flex flex-wrap items-center justify-end gap-1.5 max-[720px]:ml-[52px] max-[720px]:justify-start">
                                        <button
                                            aria-label={`Move ${column.name} up`}
                                            className={buttonSquareClass}
                                            disabled={disableMoveActions || index === 0}
                                            onClick={() => handleColumnMove(column.name, 'move_up')}
                                            type="button"
                                        >
                                            <ArrowUp size={14} />
                                        </button>

                                        <button
                                            aria-label={`Move ${column.name} down`}
                                            className={buttonSquareClass}
                                            disabled={disableMoveActions || index === columns.length - 1}
                                            onClick={() => handleColumnMove(column.name, 'move_down')}
                                            type="button"
                                        >
                                            <ArrowDown size={14} />
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-studio-border/80 p-3.5 max-[720px]:flex-col max-[720px]:items-stretch">
                <CheckboxField
                    checked={deleteBackupTableAfterReorder}
                    className="inline-flex min-h-[30px] cursor-pointer items-center gap-2 rounded-full border border-studio-border bg-[#101010] px-2.5 text-sm text-studio-muted"
                    onCheckedChange={(checked) => setDeleteBackupTableAfterReorder(checked === true)}
                    title="If enabled, the backup table created during the reorder will be deleted after the operation finishes."
                >
                    Delete backup table after reorder
                </CheckboxField>

                <div className="flex items-center justify-end gap-2 max-[720px]:flex-col max-[720px]:items-stretch">
                    <button
                        className={cn(buttonGhostClass, "h-10")}
                        disabled={!selectedConnectionId || toolbarBusy}
                        onClick={handleRefresh}
                        type="button"
                    >
                        <RefreshCcw size={14} />
                        <span>Refresh</span>
                    </button>

                    <button
                        className={buttonPrimaryClass}
                        disabled={!canApply}
                        onClick={applyReorder}
                        type="button"
                    >
                        <Save size={14} />
                        <span>Apply</span>
                    </button>
                </div>
            </div>
        </section>
    )
}

export default ColumnTreePanel
