import type {
    ConnectRequest,
    DesktopApi,
    PreviewColumnOrderRequest,
    ReorderRequest,
    SessionDraft,
    WorkspacePreferences
} from '@shared/contracts'
import {contextBridge, ipcRenderer} from 'electron'

const api: DesktopApi = {
    getAppInfo: () => ipcRenderer.invoke('app:get-info'),
    listSessions: () => ipcRenderer.invoke('sessions:list'),
    saveSession: (input: SessionDraft) => ipcRenderer.invoke('sessions:save', input),
    deleteSession: (id: string) => ipcRenderer.invoke('sessions:delete', id),
    reorderSessions: (sessionIds: string[]) => ipcRenderer.invoke('sessions:reorder', sessionIds),
    getLastSessionId: () => ipcRenderer.invoke('sessions:last'),
    getWorkspacePreferences: () => ipcRenderer.invoke('workspace:preferences:get'),
    saveWorkspacePreferences: (input: WorkspacePreferences) =>
        ipcRenderer.invoke('workspace:preferences:save', input),
    exportSessions: () => ipcRenderer.invoke('sessions:export'),
    importSessions: () => ipcRenderer.invoke('sessions:import'),
    openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
    testConnection: (input: SessionDraft) => ipcRenderer.invoke('db:test-connection', input),
    connect: (request: ConnectRequest) => ipcRenderer.invoke('db:connect', request),
    previewColumnOrder: (request: PreviewColumnOrderRequest) =>
        ipcRenderer.invoke('columns:preview-order', request),
    reorderColumns: (request: ReorderRequest) => ipcRenderer.invoke('db:reorder', request)
}

contextBridge.exposeInMainWorld('api', api)
