import {APP_DISPLAY_NAME, APP_ID, formatAppTitle} from '@shared/app'
import type {
    ConnectRequest,
    PreviewColumnOrderRequest,
    ReorderRequest,
    SessionDraft
} from '@shared/contracts'
import {
    connectRequestSchema,
    getValidationErrorMessage,
    previewColumnOrderRequestSchema,
    reorderRequestSchema,
    sessionConnectionTestSchema,
    sessionSaveSchema
} from '@shared/validation'
import {app, BrowserWindow, dialog, ipcMain, shell} from 'electron'
import {join} from 'node:path'
import {
    fetchTableSnapshot,
    reorderTableColumns,
    testSessionConnection
} from './db'
import {previewColumnOrder} from './preview'
import {
    deleteSession,
    exportSessionsToPath,
    getLastSessionId,
    getSessionById,
    importSessionsFromPath,
    listSessions,
    markLastSession,
    saveSession
} from './storage'
import {installStartupUpdateIfAvailable, setupAutoUpdater} from './updater'

function normalizeIpcError(error: unknown): never {
    throw new Error(getValidationErrorMessage(error, 'An unexpected error occurred.'))
}

function createWindow(): BrowserWindow {
    const window = new BrowserWindow({
        title: formatAppTitle(app.getVersion()),
        width: 1460,
        height: 980,
        minWidth: 1200,
        minHeight: 760,
        backgroundColor: '#050505',
        icon: app.isPackaged ? undefined : join(app.getAppPath(), 'assets', 'icon.ico'),
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    })

    window.once('ready-to-show', () => {
        window.show()
    })

    if (!app.isPackaged && process.env.ELECTRON_RENDERER_URL) {
        window.loadURL(process.env.ELECTRON_RENDERER_URL)
    } else {
        window.loadFile(join(__dirname, '../renderer/index.html'))
    }

    return window
}

function registerIpcHandlers(): void {
    ipcMain.handle('sessions:list', async () => {
        try {
            return await listSessions()
        } catch (error) {
            normalizeIpcError(error)
        }
    })

    ipcMain.handle('sessions:save', async (_, input: SessionDraft) => {
        try {
            return await saveSession(sessionSaveSchema.parse(input))
        } catch (error) {
            normalizeIpcError(error)
        }
    })

    ipcMain.handle('sessions:delete', async (_, id: string) => {
        try {
            await deleteSession(id)
        } catch (error) {
            normalizeIpcError(error)
        }
    })

    ipcMain.handle('sessions:last', async () => {
        try {
            return await getLastSessionId()
        } catch (error) {
            normalizeIpcError(error)
        }
    })

    ipcMain.handle('sessions:export', async () => {
        try {
            const window = BrowserWindow.getFocusedWindow()
            const result = window
                ? await dialog.showSaveDialog(window, {
                    defaultPath: `postgresql-column-order-editor-connections-${new Date().toISOString().slice(0, 10)}.json`,
                    filters: [{name: 'JSON', extensions: ['json']}],
                    title: 'Export connections'
                })
                : await dialog.showSaveDialog({
                    defaultPath: `postgresql-column-order-editor-connections-${new Date().toISOString().slice(0, 10)}.json`,
                    filters: [{name: 'JSON', extensions: ['json']}],
                    title: 'Export connections'
                })

            if (result.canceled || !result.filePath) {
                return {
                    canceled: true,
                    exportedCount: 0,
                    filePath: null
                }
            }

            return await exportSessionsToPath(result.filePath)
        } catch (error) {
            normalizeIpcError(error)
        }
    })

    ipcMain.handle('sessions:import', async () => {
        try {
            const window = BrowserWindow.getFocusedWindow()
            const result = window
                ? await dialog.showOpenDialog(window, {
                    filters: [{name: 'JSON', extensions: ['json']}],
                    properties: ['openFile'],
                    title: 'Import connections'
                })
                : await dialog.showOpenDialog({
                    filters: [{name: 'JSON', extensions: ['json']}],
                    properties: ['openFile'],
                    title: 'Import connections'
                })

            const filePath = result.filePaths[0]

            if (result.canceled || !filePath) {
                return {
                    canceled: true,
                    filePath: null,
                    importedCount: 0
                }
            }

            return await importSessionsFromPath(filePath)
        } catch (error) {
            normalizeIpcError(error)
        }
    })

    ipcMain.handle('app:open-external', async (_, url: string) => {
        try {
            await shell.openExternal(url)
        } catch (error) {
            normalizeIpcError(error)
        }
    })

    ipcMain.handle('app:get-info', async () => ({
        id: APP_ID,
        name: APP_DISPLAY_NAME,
        version: app.getVersion(),
        title: formatAppTitle(app.getVersion())
    }))

    ipcMain.handle('db:test-connection', async (_, input: SessionDraft) => {
        try {
            return await testSessionConnection(sessionConnectionTestSchema.parse(input))
        } catch (error) {
            normalizeIpcError(error)
        }
    })

    ipcMain.handle('db:connect', async (_, request: ConnectRequest) => {
        try {
            const validatedRequest = connectRequestSchema.parse(request)
            const session = await getSessionById(validatedRequest.sessionId)
            const snapshot = await fetchTableSnapshot(session, validatedRequest.target)
            await markLastSession(validatedRequest.sessionId)
            return snapshot
        } catch (error) {
            normalizeIpcError(error)
        }
    })

    ipcMain.handle('columns:preview-order', async (_, request: PreviewColumnOrderRequest) => {
        try {
            return previewColumnOrder(previewColumnOrderRequestSchema.parse(request))
        } catch (error) {
            normalizeIpcError(error)
        }
    })

    ipcMain.handle('db:reorder', async (_, request: ReorderRequest) => {
        try {
            const validatedRequest = reorderRequestSchema.parse(request)
            const session = await getSessionById(validatedRequest.sessionId)
            const result = await reorderTableColumns(
                session,
                validatedRequest.orderedColumns,
                validatedRequest.deleteBackupTableAfterReorder,
                validatedRequest.target
            )
            await markLastSession(validatedRequest.sessionId)
            return result
        } catch (error) {
            normalizeIpcError(error)
        }
    })
}

app.whenReady().then(async () => {
    app.setName(APP_DISPLAY_NAME)
    app.setAppUserModelId(APP_ID)

    const shouldLaunchCurrentVersion = await installStartupUpdateIfAvailable()
    if (!shouldLaunchCurrentVersion) {
        return
    }

    registerIpcHandlers()
    const window = createWindow()
    setupAutoUpdater(window)

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            const nextWindow = createWindow()
            setupAutoUpdater(nextWindow)
        }
    })
}).catch((error) => {
    console.error('[main] Failed to start the application.', error)
    app.quit()
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})
