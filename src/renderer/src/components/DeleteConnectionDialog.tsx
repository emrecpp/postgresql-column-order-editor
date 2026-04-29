import { useStoreValue } from '@simplestack/store/react'
import ConfirmDialog from './ConfirmDialog'
import {
  confirmDelete,
  selectSelectedConnection,
  setDeleteDialogOpen,
  workspaceStore
} from '@renderer/store/workspaceStore'

function DeleteConnectionDialog() {
  const busy = useStoreValue(workspaceStore, (state) => state.busy === 'saving')
  const open = useStoreValue(workspaceStore, (state) => state.deleteDialogOpen)
  const selectedConnection = useStoreValue(workspaceStore, selectSelectedConnection)

  return (
    <ConfirmDialog
      busy={busy}
      description={
        selectedConnection ? (
          <>
            Delete the saved connection{' '}
            <strong className="font-semibold text-studio-text">
              "{selectedConnection.name}"
            </strong>
            ?
          </>
        ) : (
          'Delete the selected saved connection?'
        )
      }
      onConfirm={confirmDelete}
      onOpenChange={setDeleteDialogOpen}
      open={open}
      title="Delete connection"
    />
  )
}

export default DeleteConnectionDialog
