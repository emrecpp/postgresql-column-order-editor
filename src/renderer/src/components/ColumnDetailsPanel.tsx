import { useShallow, useStoreValue } from '@simplestack/store/react'
import {getColumnTypeIconClassName, getColumnTypeMeta} from '@renderer/lib/columnType'
import {
    badgeClass,
    cardPanelClass,
    cn,
    panelSubtitleClass,
    panelTitleClass,
    pillClass,
    sectionEyebrowClass
} from '@renderer/lib/ui'
import {
    selectResolvedSelectedColumn,
    selectResolvedSelectedColumnIndex,
    workspaceStore
} from '@renderer/store/workspaceStore'

function ColumnDetailsPanel() {
    const [column, columnIndex, hasSelectedTable, totalColumns] = useStoreValue(
        workspaceStore,
        useShallow((state) => [
            selectResolvedSelectedColumn(state),
            selectResolvedSelectedColumnIndex(state),
            Boolean(state.snapshot?.target),
            state.columns.length
        ] as const)
    )

    if (!column) {
        return (
            <section className={cn(cardPanelClass, 'flex min-h-0 flex-col')}>
                <div className="border-b border-studio-border/80 p-3.5">
                    <div className="flex min-w-0 flex-col gap-1">
                        <span className={sectionEyebrowClass}>DETAILS</span>
                        <span className={panelTitleClass}>Column details</span>
                        <span className={panelSubtitleClass}>The right panel summarizes the current selection</span>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-auto p-3.5 max-[980px]:max-h-[320px]">
                    <div className="grid min-h-full place-items-center text-center text-studio-muted">
                        {hasSelectedTable
                            ? 'Select a column from the left to inspect it.'
                            : 'Select a table from the left sidebar to inspect its columns.'}
                    </div>
                </div>
            </section>
        )
    }

    const typeMeta = getColumnTypeMeta(column.dataType)
    const TypeIcon = typeMeta.icon
    const badges: string[] = []

    if (!column.nullable) {
        badges.push('NOT NULL')
    }

    if (column.isIdentity) {
        badges.push('IDENTITY')
    }

    if (column.isGenerated) {
        badges.push('GENERATED')
    }

    return (
        <section className={cn(cardPanelClass, 'flex min-h-0 flex-col')}>
            <div className="border-b border-studio-border/80 p-3.5">
                <div className="flex min-w-0 flex-col gap-1">
                    <span className={sectionEyebrowClass}>DETAILS</span>
                    <span className={panelTitleClass}>Column details</span>
                    <span className={panelSubtitleClass}>Review field metadata before reordering</span>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-3.5 max-[980px]:max-h-[320px]">
                <div className="border-b border-studio-border pb-3.5">
                    <span className={pillClass}>
                        {String(columnIndex + 1).padStart(2, '0')} / {String(totalColumns).padStart(2, '0')}
                    </span>

                    <div className="mt-3 flex items-start gap-3">
                        <span className={getColumnTypeIconClassName(typeMeta.tone, true)}>
                            <TypeIcon size={16} />
                        </span>

                        <div className="min-w-0">
                            <h2 className="break-words text-lg font-semibold leading-tight tracking-[-0.02em] text-studio-text">
                                {column.name}
                            </h2>
                            <div className="mt-1 text-[13px] text-studio-muted-strong select-none">{column.dataType}</div>
                        </div>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {badges.length === 0 ? (
                            <span className={cn(badgeClass, 'bg-white/[0.04]')}>STANDARD</span>
                        ) : (
                            badges.map((badge) => (
                                <span
                                    className={cn(badgeClass, 'bg-white/[0.04]')}
                                    key={badge}
                                >
                                    {badge}
                                </span>
                            ))
                        )}
                    </div>
                </div>

                <div className="mt-3.5 grid grid-cols-2 gap-2.5 max-[720px]:grid-cols-1">
                    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-studio-border bg-[#101010] p-3">
                        <span className={sectionEyebrowClass}>CURRENT ORDER</span>
                        <span className="break-words text-sm leading-6 text-studio-muted-strong select-text">{columnIndex + 1}</span>
                    </div>

                    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-studio-border bg-[#101010] p-3">
                        <span className={sectionEyebrowClass}>ORIGINAL ORDER</span>
                        <span className="break-words text-sm leading-6 text-studio-muted-strong select-text">{column.ordinalPosition}</span>
                    </div>

                    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-studio-border bg-[#101010] p-3">
                        <span className={sectionEyebrowClass}>NULLABLE</span>
                        <span className="break-words text-sm leading-6 text-studio-muted-strong select-text">{column.nullable ? 'Yes' : 'No'}</span>
                    </div>

                    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-studio-border bg-[#101010] p-3">
                        <span className={sectionEyebrowClass}>IDENTITY</span>
                        <span className="break-words text-sm leading-6 text-studio-muted-strong select-text">
                            {column.isIdentity ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>

                    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-studio-border bg-[#101010] p-3">
                        <span className={sectionEyebrowClass}>GENERATED</span>
                        <span className="break-words text-sm leading-6 text-studio-muted-strong select-text">{column.isGenerated ? 'Yes' : 'No'}</span>
                    </div>

                    <div className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-studio-border bg-[#101010] p-3">
                        <span className={sectionEyebrowClass}>DEFAULT</span>
                        {column.defaultValue ? (
                            <code className="break-all whitespace-pre-wrap text-[12px] leading-5 text-studio-text select-text">
                                {column.defaultValue}
                            </code>
                        ) : (
                            <span className="break-words text-sm leading-6 text-studio-muted-strong">Not set</span>
                        )}
                    </div>
                </div>

                <div className="mt-3.5 flex flex-col gap-2 rounded-xl border border-studio-border bg-[#101010] p-3">
                    <span className={sectionEyebrowClass}>COMMENT</span>
                    <div className="break-words text-sm leading-6 text-studio-muted-strong">
                        {column.comment?.trim() || 'No comment provided.'}
                    </div>
                </div>
            </div>
        </section>
    )
}

export default ColumnDetailsPanel
