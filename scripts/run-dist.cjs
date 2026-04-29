const path = require('node:path')
const fs = require('node:fs')
const { execFileSync } = require('node:child_process')
const { loadProjectEnv } = require('./load-project-env.cjs')
const { resolveGithubRepository } = require('./github-publish.cjs')
const { validateGithubReleaseAccess } = require('./github-release-preflight.cjs')

const projectRoot = loadProjectEnv(path.resolve(__dirname, '..'))
const electronBuilderCliPath = path.join(projectRoot, 'node_modules', 'electron-builder', 'cli.js')

function resolveNpmCliPath() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(path.dirname(path.dirname(process.execPath)), 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
  ].filter(Boolean)

  const match = candidates.find((candidate) => fs.existsSync(candidate))
  if (!match) {
    throw new Error('npm CLI could not be resolved from the current Node.js installation.')
  }

  return match
}

const npmCliPath = resolveNpmCliPath()

function getPublishMode(argv) {
  const publishIndex = argv.indexOf('--publish')
  const publishMode = publishIndex >= 0 ? argv[publishIndex + 1] : 'never'
  const supportedModes = new Set(['always', 'never', 'onTag', 'onTagOrDraft'])

  if (!supportedModes.has(publishMode)) {
    throw new Error(
      `Unsupported publish mode: ${publishMode}. Use one of: ${Array.from(supportedModes).join(', ')}.`
    )
  }

  return publishMode
}

function runNpm(args) {
  execFileSync(process.execPath, [npmCliPath, ...args], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env
  })
}

function runElectronBuilder(args) {
  execFileSync(process.execPath, [electronBuilderCliPath, ...args], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env
  })
}

async function main() {
  const publishMode = getPublishMode(process.argv.slice(2))

  if (publishMode !== 'never') {
    const repository = resolveGithubRepository(projectRoot)

    if (!repository) {
      throw new Error(
        'GitHub repository could not be resolved before publish. Set GH_OWNER and GH_REPO or configure package.json repository.'
      )
    }

    console.log('[dist] 1/3 Validating GitHub release permissions...')
    await validateGithubReleaseAccess(repository, projectRoot)
  }

  console.log('[dist] 2/3 Building TypeScript and Electron bundles...')
  runNpm(['run', 'build'])

  console.log(
    publishMode === 'never'
      ? '[dist] 3/3 Packaging Windows installer with electron-builder...'
      : '[dist] 3/3 Packaging Windows installer and uploading release assets...'
  )
  runElectronBuilder([
    '--config',
    'electron-builder.config.cjs',
    '--publish',
    publishMode
  ])
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
