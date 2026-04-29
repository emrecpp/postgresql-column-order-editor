import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { app, BrowserWindow, dialog } from 'electron'
import electronUpdater from 'electron-updater'
import { APP_DISPLAY_NAME } from '@shared/app'
import {
  closeUpdateProgressWindow,
  showUpdateProgressWindow
} from './update-progress-window'

const { autoUpdater } = electronUpdater

const UPDATE_CHECK_DELAY_MS = 3_000
const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1_000

type UpdaterLogLevel = 'debug' | 'info' | 'warn' | 'error'
type DownloadProgressSnapshot = {
  percent: number | null
  transferred: number | null
  total: number | null
}

let isUpdaterInitialized = false
let areUpdateChecksScheduled = false
let hasCompletedStartupCheck = false
let updateCheckTimer: NodeJS.Timeout | null = null
let updateCheckInterval: NodeJS.Timeout | null = null
let activeWindow: BrowserWindow | null = null
let isRestartPromptVisible = false
let isStartupUpdateFlow = false
let latestKnownUpdateVersion: string | null = null
let latestKnownUpdateSize: number | null = null
let latestKnownUpdateFileName: string | null = null
const trackedWindows = new WeakSet<BrowserWindow>()

function getDialogWindow(): BrowserWindow | undefined {
  if (activeWindow && !activeWindow.isDestroyed()) {
    return activeWindow
  }

  const fallbackWindow = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())
  return fallbackWindow
}

function getUpdateVersion(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const version = Reflect.get(value, 'version')
  return typeof version === 'string' && version.trim().length > 0 ? version.trim() : null
}

function getUpdateSize(value: unknown): number | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const files = Reflect.get(value, 'files')
  if (!Array.isArray(files)) {
    return null
  }

  for (const file of files) {
    if (typeof file !== 'object' || file === null) {
      continue
    }

    const size = Reflect.get(file, 'size')
    if (typeof size === 'number' && Number.isFinite(size) && size > 0) {
      return size
    }
  }

  return null
}

function normalizeUpdateFileName(value: string): string | null {
  const trimmed = value.trim()
  if (trimmed.length === 0) {
    return null
  }

  const normalizedPath = trimmed.split(/[?#]/, 1)[0] ?? trimmed
  const segments = normalizedPath.split(/[\\/]/).filter((segment) => segment.length > 0)

  return segments.at(-1) ?? normalizedPath
}

function getUpdateFileName(value: unknown): string | null {
  if (typeof value !== 'object' || value === null) {
    return null
  }

  const files = Reflect.get(value, 'files')
  if (Array.isArray(files)) {
    for (const file of files) {
      if (typeof file !== 'object' || file === null) {
        continue
      }

      const url = Reflect.get(file, 'url')
      if (typeof url === 'string') {
        const fileName = normalizeUpdateFileName(url)
        if (fileName) {
          return fileName
        }
      }
    }
  }

  const path = Reflect.get(value, 'path')
  return typeof path === 'string' ? normalizeUpdateFileName(path) : null
}

function formatBytes(value: number | null): string | null {
  if (value === null || !Number.isFinite(value) || value < 0) {
    return null
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let amount = value
  let unitIndex = 0

  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024
    unitIndex += 1
  }

  const precision = amount >= 100 || unitIndex === 0 ? 0 : amount >= 10 ? 1 : 2
  return `${amount.toFixed(precision)} ${units[unitIndex]}`
}

function serializeLogArgs(args: unknown[]): string {
  return args
    .map((value) => {
      if (value instanceof Error) {
        return value.stack ?? `${value.name}: ${value.message}`
      }

      if (typeof value === 'string') {
        return value
      }

      try {
        return JSON.stringify(value)
      } catch {
        return String(value)
      }
    })
    .join(' ')
}

function formatErrorDetails(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`
  }

  if (typeof error === 'string') {
    return error
  }

  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function getUpdaterLogPath(): string | null {
  try {
    const logDirectoryPath = join(app.getPath('userData'), 'logs')
    mkdirSync(logDirectoryPath, { recursive: true })
    return join(logDirectoryPath, 'updater.log')
  } catch {
    return null
  }
}

function logUpdater(level: UpdaterLogLevel, message: string, error?: unknown): void {
  const timestamp = new Date().toISOString()
  const normalizedLevel = level.toUpperCase()
  const errorDetails = error ? `\n${formatErrorDetails(error)}` : ''
  const logLine = `${timestamp} [${normalizedLevel}] ${message}${errorDetails}`

  switch (level) {
    case 'debug':
      console.debug(message, ...(error ? [error] : []))
      break
    case 'info':
      console.info(message, ...(error ? [error] : []))
      break
    case 'warn':
      console.warn(message, ...(error ? [error] : []))
      break
    case 'error':
      console.error(message, ...(error ? [error] : []))
      break
  }

  const logPath = getUpdaterLogPath()
  if (!logPath) {
    return
  }

  try {
    appendFileSync(logPath, `${logLine}\n`, 'utf8')
  } catch {
    // Ignore secondary log write failures so update checks can continue.
  }
}

function getCurrentVersionLabel(): string {
  return `v${app.getVersion()}`
}

function updateProgressWindow(progress?: DownloadProgressSnapshot): void {
  const nextVersionLabel = latestKnownUpdateVersion ? `v${latestKnownUpdateVersion}` : null
  const totalBytes = progress?.total ?? latestKnownUpdateSize
  const transferredBytes = progress?.transferred ?? (latestKnownUpdateSize ? 0 : null)
  const percent =
    typeof progress?.percent === 'number' && Number.isFinite(progress.percent)
      ? progress.percent
      : totalBytes
        ? transferredBytes === null
          ? null
          : Math.min(100, (transferredBytes / totalBytes) * 100)
        : null

  showUpdateProgressWindow({
    phaseLabel: 'Downloading',
    fileName: latestKnownUpdateFileName,
    currentVersion: getCurrentVersionLabel(),
    nextVersion: nextVersionLabel,
    transferredLabel: formatBytes(transferredBytes),
    totalLabel: formatBytes(totalBytes),
    percent,
    indeterminate: percent === null
  })
}

function showInstallingWindow(): void {
  showUpdateProgressWindow({
    phaseLabel: 'Installing',
    fileName: latestKnownUpdateFileName,
    currentVersion: getCurrentVersionLabel(),
    nextVersion: latestKnownUpdateVersion ? `v${latestKnownUpdateVersion}` : null,
    transferredLabel: formatBytes(latestKnownUpdateSize),
    totalLabel: formatBytes(latestKnownUpdateSize),
    percent: null,
    indeterminate: true
  })
}

function resetTrackedUpdateState(): void {
  latestKnownUpdateVersion = null
  latestKnownUpdateSize = null
  latestKnownUpdateFileName = null
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds)
  })
}

function trackWindow(window: BrowserWindow): void {
  activeWindow = window

  if (trackedWindows.has(window)) {
    return
  }

  trackedWindows.add(window)

  window.on('focus', () => {
    activeWindow = window
  })

  window.on('closed', () => {
    if (activeWindow === window) {
      activeWindow = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed()) ?? null
    }
  })
}

function scheduleUpdateChecks(): void {
  if (areUpdateChecksScheduled) {
    return
  }

  areUpdateChecksScheduled = true

  const checkForUpdates = () => {
    autoUpdater.checkForUpdates().catch((error: unknown) => {
      closeUpdateProgressWindow()
      resetTrackedUpdateState()
      logUpdater('error', '[updater] Failed to check for updates.', error)
    })
  }

  const initialDelay = hasCompletedStartupCheck ? UPDATE_CHECK_INTERVAL_MS : UPDATE_CHECK_DELAY_MS
  updateCheckTimer = setTimeout(checkForUpdates, initialDelay)
  updateCheckInterval = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS)
}

function ensureAutoUpdaterInitialized(): boolean {
  if (!app.isPackaged) {
    return false
  }

  if (isUpdaterInitialized) {
    return true
  }

  isUpdaterInitialized = true
  autoUpdater.logger = {
    info: (...args: unknown[]) => logUpdater('info', serializeLogArgs(args)),
    warn: (...args: unknown[]) => logUpdater('warn', serializeLogArgs(args)),
    error: (...args: unknown[]) => logUpdater('error', serializeLogArgs(args)),
    debug: (...args: unknown[]) => logUpdater('debug', serializeLogArgs(args))
  } as typeof autoUpdater.logger
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    logUpdater('info', `[updater] Checking for updates for ${APP_DISPLAY_NAME}...`)
  })

  autoUpdater.on('update-available', (info) => {
    latestKnownUpdateVersion = getUpdateVersion(info) ?? latestKnownUpdateVersion
    latestKnownUpdateSize = getUpdateSize(info) ?? latestKnownUpdateSize
    latestKnownUpdateFileName = getUpdateFileName(info) ?? latestKnownUpdateFileName

    logUpdater(
      'info',
      latestKnownUpdateVersion
        ? `[updater] Update available: v${latestKnownUpdateVersion}`
        : '[updater] Update available.'
    )

    updateProgressWindow()
  })

  autoUpdater.on('update-not-available', () => {
    closeUpdateProgressWindow()
    resetTrackedUpdateState()
    logUpdater('info', '[updater] No updates are currently available.')
  })

  autoUpdater.on('download-progress', (progress) => {
    latestKnownUpdateSize = progress.total > 0 ? progress.total : latestKnownUpdateSize
    updateProgressWindow({
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total > 0 ? progress.total : latestKnownUpdateSize
    })

    logUpdater(
      'info',
      `[updater] Download progress: ${Math.round(progress.percent)}% (${formatBytes(progress.transferred) ?? '0 B'} / ${formatBytes(progress.total) ?? 'unknown'})`
    )
  })

  autoUpdater.on('error', (error) => {
    closeUpdateProgressWindow()
    logUpdater('error', '[updater] Update flow failed.', error)
  })

  autoUpdater.on('update-downloaded', async (info) => {
    latestKnownUpdateVersion = getUpdateVersion(info) ?? latestKnownUpdateVersion
    latestKnownUpdateSize = getUpdateSize(info) ?? latestKnownUpdateSize
    latestKnownUpdateFileName = getUpdateFileName(info) ?? latestKnownUpdateFileName

    if (isStartupUpdateFlow) {
      logUpdater(
        'info',
        latestKnownUpdateVersion
          ? `[updater] Startup update downloaded: v${latestKnownUpdateVersion}. Installing before launch...`
          : '[updater] Startup update downloaded. Installing before launch...'
      )
      return
    }

    if (isRestartPromptVisible) {
      return
    }

    showUpdateProgressWindow({
      phaseLabel: 'Ready to install',
      fileName: latestKnownUpdateFileName,
      currentVersion: getCurrentVersionLabel(),
      nextVersion: latestKnownUpdateVersion ? `v${latestKnownUpdateVersion}` : null,
      transferredLabel: formatBytes(latestKnownUpdateSize),
      totalLabel: formatBytes(latestKnownUpdateSize),
      percent: 100,
      indeterminate: false
    })

    isRestartPromptVisible = true
    const currentVersion = app.getVersion()
    const nextVersion = latestKnownUpdateVersion
    const message = nextVersion
      ? `${APP_DISPLAY_NAME} v${nextVersion} has been downloaded.`
      : `A new version of ${APP_DISPLAY_NAME} has been downloaded.`
    const detail = nextVersion
      ? `Restart the app to finish installing the update. Current version: v${currentVersion}`
      : 'Restart the app to finish installing the update.'

    try {
      const dialogWindow = getDialogWindow()
      const result = dialogWindow
        ? await dialog.showMessageBox(dialogWindow, {
            type: 'info',
            buttons: ['Restart now', 'Later'],
            defaultId: 0,
            cancelId: 1,
            title: 'Update ready',
            message,
            detail
          })
        : await dialog.showMessageBox({
            type: 'info',
            buttons: ['Restart now', 'Later'],
            defaultId: 0,
            cancelId: 1,
            title: 'Update ready',
            message,
            detail
          })

      if (result.response === 0) {
        showInstallingWindow()
        await delay(350)
        autoUpdater.quitAndInstall()
        return
      }

      closeUpdateProgressWindow()
    } finally {
      isRestartPromptVisible = false
    }
  })

  return true
}

export async function installStartupUpdateIfAvailable(): Promise<boolean> {
  if (!ensureAutoUpdaterInitialized()) {
    return true
  }

  isStartupUpdateFlow = true
  resetTrackedUpdateState()

  try {
    const result = await autoUpdater.checkForUpdates()

    if (!result || !result.isUpdateAvailable) {
      hasCompletedStartupCheck = true
      isStartupUpdateFlow = false
      closeUpdateProgressWindow()
      resetTrackedUpdateState()
      logUpdater('info', '[updater] Launching current version because no startup update is required.')
      return true
    }

    latestKnownUpdateVersion = getUpdateVersion(result.updateInfo) ?? latestKnownUpdateVersion
    latestKnownUpdateSize = getUpdateSize(result.updateInfo) ?? latestKnownUpdateSize
    latestKnownUpdateFileName = getUpdateFileName(result.updateInfo) ?? latestKnownUpdateFileName
    updateProgressWindow()

    logUpdater(
      'info',
      latestKnownUpdateVersion
        ? `[updater] Downloading v${latestKnownUpdateVersion} before opening the app...`
        : '[updater] Downloading update before opening the app...'
    )

    const downloadPromise = result.downloadPromise ?? autoUpdater.downloadUpdate(result.cancellationToken)
    await downloadPromise

    logUpdater('info', '[updater] Installing downloaded update before launch...')
    hasCompletedStartupCheck = true
    isStartupUpdateFlow = false
    showInstallingWindow()
    await delay(350)
    autoUpdater.quitAndInstall(true, true)
    return false
  } catch (error) {
    hasCompletedStartupCheck = true
    isStartupUpdateFlow = false
    closeUpdateProgressWindow()
    resetTrackedUpdateState()
    logUpdater('error', '[updater] Startup update flow failed. Launching the current version.', error)
    return true
  }
}

export function setupAutoUpdater(window: BrowserWindow): void {
  trackWindow(window)

  if (!ensureAutoUpdaterInitialized()) {
    return
  }

  scheduleUpdateChecks()
}

app.on('before-quit', () => {
  if (updateCheckTimer) {
    clearTimeout(updateCheckTimer)
  }

  if (updateCheckInterval) {
    clearInterval(updateCheckInterval)
  }

  closeUpdateProgressWindow()
  areUpdateChecksScheduled = false
})
