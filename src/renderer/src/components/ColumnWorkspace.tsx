import { useStoreValue } from '@simplestack/store/react'
import {emptyStateClass} from '@renderer/lib/ui'
import ColumnDetailsPanel from './ColumnDetailsPanel'
import ColumnTreePanel from './ColumnTreePanel'
import { workspaceStore } from '@renderer/store/workspaceStore'

function ColumnWorkspace() {
    const snapshot = useStoreValue(workspaceStore, (state) => state.snapshot)

    if (!snapshot) {
        return <div className={`${emptyStateClass} flex-1 min-h-0`}>Open a connection from the left.</div>
    }

    return (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.2fr)_minmax(300px,0.8fr)] gap-3.5 overflow-hidden max-[980px]:grid-cols-1">
            <ColumnTreePanel />
            <ColumnDetailsPanel />
        </div>
    )
}

export default ColumnWorkspace
