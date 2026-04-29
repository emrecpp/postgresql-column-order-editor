import { useStoreValue } from '@simplestack/store/react'
import ConfirmDialog from './ConfirmDialog'
import {
  confirmDelete,
  setDeleteDialogOpen,
  workspaceStore
} from '@renderer/store/workspaceStore'

function DeleteConnectionDialog() {
  const busy = useStoreValue(workspaceStore, (state) => state.busy === 'saving')
  const open = useStoreValue(workspaceStore, (state) => state.deleteDialogOpen)
  const deleteTargetConnectionName = useStoreValue(
    workspaceStore,
    (state) => state.deleteTargetConnectionName
  )

  return (
    <ConfirmDialog
      busy={busy}
      description={
        deleteTargetConnectionName ? (
          <>
            Delete the saved connection{' '}
            <strong className="font-semibold text-studio-text">
              "{deleteTargetConnectionName}"
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
