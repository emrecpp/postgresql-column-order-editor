const path = require('node:path')
const { resolveGithubRepository } = require('./github-publish.cjs')
const { loadProjectEnv, resolveGithubToken } = require('./load-project-env.cjs')
const { validateGithubReleaseAccess } = require('./github-release-preflight.cjs')

async function main() {
  const projectRoot = loadProjectEnv(path.resolve(__dirname, '..'))
  const repository = resolveGithubRepository(projectRoot)

  if (!repository) {
    throw new Error(
      'GitHub repository could not be resolved. Set GH_OWNER and GH_REPO, add package.json repository, or configure a git origin remote.'
    )
  }

  if (!resolveGithubToken()) {
    throw new Error(
      'Missing GitHub token. Set GH_TOKEN, GITHUB_TOKEN, or GITHUB_RELEASE_TOKEN before running npm run deploy.'
    )
  }

  console.log(
    `[deploy] Release target resolved: ${repository.owner}/${repository.repo} (${repository.source}).`
  )
  console.log('[deploy] Validating GitHub release permissions...')
  await validateGithubReleaseAccess(repository, projectRoot)
  console.log('[deploy] GitHub release permissions look good.')
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
