import { useShallow, useStoreValue } from '@simplestack/store/react'
import {
  buttonGhostClass,
  buttonPrimaryClass,
  cn,
  inputClass
} from '@renderer/lib/ui'
import { DEFAULT_SESSION_DRAFT as DEFAULT_CONNECTION_DRAFT } from '@shared/contracts'
import { Database, PlugZap, RotateCcw, Save, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import TargetDropdown from './TargetDropdown'
import { CheckboxField } from './ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from './ui/dialog'
import {
  handleDatabaseFieldFocus,
  handleSaveConnection,
  handleTestConnection,
  selectCanSaveConnection,
  selectCanTestConnection,
  setDialogOpen,
  setDraft,
  workspaceStore
} from '@renderer/store/workspaceStore'
import type { SessionDraft as ConnectionDraft } from '@shared/contracts'

function ConnectionDialog() {
  const [
    availableDatabases,
    connectionFeedback,
    databaseAutoOpenSignal,
    dialogMode,
    dialogOpen,
    draft,
    testingConnection,
    savingBusy
  ] = useStoreValue(
    workspaceStore,
    useShallow((state) => [
      state.availableDatabases,
      state.connectionFeedback,
      state.databaseAutoOpenSignal,
      state.dialogMode,
      state.dialogOpen,
      state.draft,
      state.testingConnection,
      state.busy === 'saving'
    ] as const)
  )
  const canSaveConnection = useStoreValue(workspaceStore, selectCanSaveConnection)
  const canTestConnection = useStoreValue(workspaceStore, selectCanTestConnection)

  function updateDraft<K extends keyof ConnectionDraft>(key: K, value: ConnectionDraft[K]): void {
    setDraft((current) => ({
      ...current,
      [key]: value
    }))
  }

  const [portInput, setPortInput] = useState(
    Number.isFinite(draft.port) && draft.port > 0 ? String(draft.port) : ''
  )

  useEffect(() => {
    setPortInput(Number.isFinite(draft.port) && draft.port > 0 ? String(draft.port) : '')
  }, [dialogOpen, draft.port])

  function resetToDefaults(): void {
    setDraft({
      ...DEFAULT_CONNECTION_DRAFT
    })
  }

  const fieldClass = 'flex flex-col gap-1.5'
  const labelClass = 'text-xs text-studio-muted'
  const databaseOptions = availableDatabases.map((value) => ({ value }))
  const disableDialogActions = savingBusy || testingConnection
  const connectionFeedbackClass = connectionFeedback
    ? cn(
        'pointer-events-none absolute left-[18px] right-[18px] top-full z-10 mt-[-6px] rounded-[16px] border px-3 py-2.5 text-xs shadow-[0_18px_40px_rgba(0,0,0,0.32)]',
        connectionFeedback.type === 'success' &&
          'border-studio-green/25 bg-[#0f1712] text-studio-green',
        connectionFeedback.type === 'error' &&
          'border-studio-orange/25 bg-[#1a120d] text-studio-orange',
        connectionFeedback.type === 'info' &&
          'border-studio-border-strong bg-[#121212] text-studio-muted-strong'
      )
    : ''
  const databaseEmptyMessage = testingConnection
    ? 'Loading databases...'
    : databaseOptions.length === 0
      ? canTestConnection
        ? 'No databases loaded yet. Open the menu again in a moment or use Test connection.'
        : 'Fill host, port, user and password to load databases.'
      : 'No matching databases found.'

  return (
    <Dialog onOpenChange={setDialogOpen} open={dialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{dialogMode === 'create' ? 'New connection' : 'Edit connection'}</DialogTitle>
          <DialogDescription>Save connection details.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className={fieldClass}>
            <span className={labelClass}>Name</span>
            <input
              className={inputClass}
              onChange={(event) => updateDraft('name', event.target.value)}
              type="text"
              value={draft.name}
            />
          </label>

          <div className="flex items-stretch gap-2 max-[720px]:flex-col">
            <label className={cn(fieldClass, 'flex-1')}>
              <span className={labelClass}>Host</span>
              <input
                className={inputClass}
                onChange={(event) => updateDraft('host', event.target.value)}
                placeholder="localhost"
                type="text"
                value={draft.host}
              />
            </label>

            <label className={cn(fieldClass, 'flex-1')}>
              <span className={labelClass}>Port</span>
              <input
                className={inputClass}
                inputMode="numeric"
                onChange={(event) => {
                  const digitsOnly = event.target.value.replace(/\D+/g, '')
                  const normalizedValue = digitsOnly.replace(/^0+(?=\d)/, '')

                  setPortInput(normalizedValue)

                  if (!normalizedValue) {
                    updateDraft('port', Number.NaN)
                    return
                  }

                  updateDraft('port', Number.parseInt(normalizedValue, 10))
                }}
                placeholder={String(DEFAULT_CONNECTION_DRAFT.port)}
                type="text"
                value={portInput}
              />
            </label>
          </div>

          <div className="flex items-stretch gap-2 max-[720px]:flex-col">
            <label className={cn(fieldClass, 'flex-1')}>
              <span className={labelClass}>User</span>
              <input
                className={inputClass}
                onChange={(event) => updateDraft('username', event.target.value)}
                type="text"
                value={draft.username}
              />
            </label>

            <label className={cn(fieldClass, 'flex-1')}>
              <span className={labelClass}>Password</span>
              <input
                className={inputClass}
                onChange={(event) => updateDraft('password', event.target.value)}
                type="password"
                value={draft.password}
              />
            </label>
          </div>

          <TargetDropdown
            autoOpenSignal={databaseAutoOpenSignal}
            disabled={disableDialogActions}
            emptyMessage={databaseEmptyMessage}
            hint={testingConnection ? 'Loading databases...' : `${databaseOptions.length} databases available`}
            icon={Database}
            label="Database"
            onOpenChange={(nextOpen) => {
              if (nextOpen) {
                handleDatabaseFieldFocus()
              }
            }}
            onSelect={(value) => updateDraft('database', value)}
            onTriggerFocus={handleDatabaseFieldFocus}
            options={databaseOptions}
            placeholder="Load and select a database"
            searchPlaceholder="Search database"
            selectedValue={draft.database}
            size="field"
            wideMenu
          />

          <div className="text-[11px] text-studio-muted">
            Select a database before saving this connection.
          </div>

          <CheckboxField
            checked={draft.ssl}
            onCheckedChange={(checked) => updateDraft('ssl', checked === true)}
          >
            SSL
          </CheckboxField>
        </div>

        <DialogFooter>
          <div className="w-full">
            <button
              className={buttonGhostClass}
              disabled={!canTestConnection || disableDialogActions}
              onClick={handleTestConnection}
              type="button"
            >
              <PlugZap size={14} />
              <span>{testingConnection ? 'Testing...' : 'Test connection'}</span>
            </button>
          </div>

          {dialogMode === 'create' ? (
            <button
              className={buttonGhostClass}
              disabled={disableDialogActions}
              onClick={resetToDefaults}
              type="button"
            >
              <RotateCcw size={14} />
              <span>Reset</span>
            </button>
          ) : (
            <button
              className={buttonGhostClass}
              disabled={disableDialogActions}
              onClick={() => setDialogOpen(false)}
              type="button"
            >
              <X size={14} />
              <span>Close</span>
            </button>
          )}

          <button
            className={buttonPrimaryClass}
            disabled={disableDialogActions || !canSaveConnection}
            onClick={handleSaveConnection}
            type="button"
          >
            <Save size={14} />
            <span>Save</span>
          </button>
        </DialogFooter>

        {connectionFeedback ? (
          <div aria-live="polite" className={connectionFeedbackClass}>
            {connectionFeedback.text}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

export default ConnectionDialog
