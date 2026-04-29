import {APP_DISPLAY_NAME} from '@shared/app'
import {BrowserWindow} from 'electron'

export type UpdateProgressWindowState = {
    phaseLabel: string
    fileName: string | null
    currentVersion: string | null
    nextVersion: string | null
    transferredLabel: string | null
    totalLabel: string | null
    percent: number | null
    indeterminate: boolean
}

let progressWindow: BrowserWindow | null = null
let isProgressWindowReady = false
let pendingState: UpdateProgressWindowState | null = null

function buildProgressWindowHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${APP_DISPLAY_NAME}</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #07111d;
        --panel: rgba(9, 18, 31, 0.94);
        --panel-border: rgba(137, 193, 255, 0.14);
        --accent: #87d9ff;
        --accent-strong: #4ca8ff;
        --text: #f6fbff;
        --muted: #91a5be;
        --track: rgba(255, 255, 255, 0.08);
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        width: 100%;
        height: 100%;
        overflow: hidden;
        font-family: "Segoe UI", "Inter", sans-serif;
        background:
          radial-gradient(circle at top, rgba(90, 173, 255, 0.18), transparent 44%),
          linear-gradient(180deg, #0a1524 0%, var(--bg) 100%);
        color: var(--text);
      }

      body {
        display: grid;
        place-items: center;
        padding: 14px 14px 20px;
      }

      .card {
        width: 100%;
        max-width: 560px;
        background: var(--panel);
        border: 1px solid var(--panel-border);
        border-radius: 22px;
        padding: 24px 24px 28px;
        box-shadow: 0 18px 48px rgba(0, 0, 0, 0.4);
        backdrop-filter: blur(18px);
      }

      .phase-label {
        display: block;
        margin-bottom: 14px;
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }

      .progress-shell {
        margin-bottom: 10px;
        background: var(--track);
        border-radius: 999px;
        height: 10px;
        overflow: hidden;
        position: relative;
      }

      .progress-fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, var(--accent) 0%, var(--accent-strong) 100%);
        border-radius: inherit;
        transition: width 0.25s ease;
      }

      html[data-indeterminate="true"] .progress-fill {
        width: 34% !important;
        animation: slide 1.15s ease-in-out infinite;
      }

      .progress-meta {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        margin-bottom: 20px;
        font-size: 13px;
        line-height: 1.35;
        font-variant-numeric: tabular-nums;
      }

      .progress-percent {
        color: var(--text);
        font-weight: 700;
      }

      .progress-size {
        color: var(--muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        text-align: right;
      }

      .file-block {
        min-width: 0;
        margin-bottom: 16px;
        padding-bottom: 16px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }

      .summary-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 18px;
        align-items: start;
      }

      .summary-item {
        min-width: 0;
      }

      .summary-item + .summary-item {
        padding-left: 18px;
        border-left: 1px solid rgba(255, 255, 255, 0.08);
      }

      .detail-label {
        display: block;
        font-size: 11px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        color: var(--muted);
        margin-bottom: 6px;
      }

      .detail-value {
        display: block;
        font-size: 15px;
        font-weight: 600;
        color: var(--text);
        line-height: 1.35;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .file-name-value {
        white-space: normal;
        overflow: visible;
        text-overflow: clip;
        word-break: break-word;
      }

      .version-range {
        display: flex;
        align-items: center;
        gap: 8px;
        font-variant-numeric: tabular-nums;
      }

      .version-arrow {
        color: var(--accent);
        font-weight: 700;
      }

      @keyframes slide {
        0% {
          transform: translateX(-110%);
        }
        100% {
          transform: translateX(300%);
        }
      }
    </style>
  </head>
  <body>
    <main class="card">
      <span class="phase-label" id="phase-label">Downloading</span>

      <div class="progress-shell" aria-hidden="true">
        <div class="progress-fill" id="progress-fill"></div>
      </div>

      <div class="progress-meta">
        <span class="progress-percent" id="percent-label">0%</span>
        <span class="progress-size" id="progress-size">0 B / -</span>
      </div>

      <div class="file-block">
        <span class="detail-label">File name</span>
        <span class="detail-value file-name-value" id="file-name">Update package</span>
      </div>

      <section class="summary-grid">
        <div class="summary-item">
          <span class="detail-label">Version</span>
          <span class="detail-value version-range">
            <span id="current-version">-</span>
            <span class="version-arrow">-></span>
            <span id="next-version">-</span>
          </span>
        </div>
      </section>
    </main>

    <script>
      const setText = (id, value, fallback = '-') => {
        const node = document.getElementById(id)
        if (!node) {
          return
        }

        node.textContent = value || fallback
      }

      window.__applyUpdateState = (state) => {
        document.documentElement.dataset.indeterminate = state.indeterminate ? 'true' : 'false'

        setText('phase-label', state.phaseLabel, 'Updating')
        setText('file-name', state.fileName, 'Update package')
        setText('current-version', state.currentVersion)
        setText('next-version', state.nextVersion)
        const progressFill = document.getElementById('progress-fill')
        const percentLabel = document.getElementById('percent-label')
        const progressSize = document.getElementById('progress-size')

        if (percentLabel) {
          percentLabel.textContent =
            typeof state.percent === 'number' && !state.indeterminate
              ? Math.max(0, Math.min(100, state.percent)).toFixed(0) + '%'
              : '...'
        }

        if (progressSize) {
          const transferred = state.transferredLabel || '0 B'
          progressSize.textContent = state.totalLabel
            ? transferred + ' / ' + state.totalLabel
            : transferred
        }

        if (progressFill && typeof state.percent === 'number') {
          progressFill.style.width = Math.max(0, Math.min(100, state.percent)) + '%'
        }
      }
    </script>
  </body>
</html>`
}

function getProgressWindow(): BrowserWindow {
    if (progressWindow && !progressWindow.isDestroyed()) {
        return progressWindow
    }

    progressWindow = new BrowserWindow({
        title: `${APP_DISPLAY_NAME}`,
        width: 560,
        height: 286,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        closable: false,
        show: false,
        autoHideMenuBar: true,
        backgroundColor: '#07111d',
        useContentSize: true,
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true
        }
    })

    isProgressWindowReady = false
    progressWindow.on('closed', () => {
        progressWindow = null
        isProgressWindowReady = false
        pendingState = null
    })

    progressWindow.once('ready-to-show', () => {
        progressWindow?.show()
    })

    progressWindow.webContents.on('did-finish-load', () => {
        isProgressWindowReady = true
        if (pendingState) {
            applyStateToWindow(pendingState)
        }
    })

    void progressWindow.loadURL(
        `data:text/html;charset=UTF-8,${encodeURIComponent(buildProgressWindowHtml())}`
    )

    return progressWindow
}

function applyStateToWindow(state: UpdateProgressWindowState): void {
    pendingState = state

    const window = getProgressWindow()
    if (!isProgressWindowReady) {
        return
    }

    void window.webContents
        .executeJavaScript(`window.__applyUpdateState(${JSON.stringify(state)})`, true)
        .catch(() => {
            // Ignore visual sync errors; updater logic should continue regardless.
        })
}

export function showUpdateProgressWindow(state: UpdateProgressWindowState): void {
    applyStateToWindow(state)
}

export function closeUpdateProgressWindow(): void {
    if (!progressWindow || progressWindow.isDestroyed()) {
        progressWindow = null
        isProgressWindowReady = false
        pendingState = null
        return
    }

    progressWindow.destroy()
    progressWindow = null
    isProgressWindowReady = false
    pendingState = null
}
