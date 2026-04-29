const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { loadProjectEnv } = require('./load-project-env.cjs')

const projectRoot = loadProjectEnv(path.resolve(__dirname, '..'))
const releaseItCliPath = path.join(projectRoot, 'node_modules', 'release-it', 'bin', 'release-it.js')

execFileSync(process.execPath, [releaseItCliPath, ...process.argv.slice(2)], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env
})
