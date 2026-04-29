import { useEffect } from 'react'
import { initializeWorkspace } from '@renderer/store/workspaceStore'

export type {
  BusyState,
  NoticeState,
  NoticeType
} from '@renderer/store/workspaceStore'

export function useReorderWorkspace(): void {
  useEffect(() => {
    initializeWorkspace()
  }, [])
}
