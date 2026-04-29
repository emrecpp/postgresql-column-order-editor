import ColumnWorkspace from './components/ColumnWorkspace'
import ConnectionDialog from './components/ConnectionDialog'
import ConnectionSidebar from './components/ConnectionSidebar'
import DeleteConnectionDialog from './components/DeleteConnectionDialog'
import { useReorderWorkspace } from './hooks/useReorderWorkspace'
import { shellPanelClass } from './lib/ui'

function App() {
  useReorderWorkspace()

  return (
    <>
      <div className="grid h-dvh grid-cols-[minmax(288px,328px)_minmax(0,1fr)] gap-4 overflow-hidden p-4 max-[980px]:min-h-dvh max-[980px]:grid-cols-1 max-[980px]:overflow-visible max-[980px]:p-3">
        <ConnectionSidebar />

        <main className={`${shellPanelClass} flex min-w-0 flex-col gap-3.5 p-[18px] max-[720px]:p-3 max-[980px]:overflow-visible`}>
          <ColumnWorkspace />
        </main>
      </div>

      <ConnectionDialog />
      <DeleteConnectionDialog />
    </>
  )
}

export default App
