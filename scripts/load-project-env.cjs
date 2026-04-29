const path = require('node:path')

function loadProjectEnv(projectRoot = path.resolve(__dirname, '..')) {
  if (typeof process.loadEnvFile !== 'function') {
    return projectRoot
  }

  const envPath = path.join(projectRoot, '.env')

  try {
    process.loadEnvFile(envPath)
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      throw error
    }
  }

  return projectRoot
}

function resolveGithubToken() {
  const tokenSources = [process.env.GH_TOKEN, process.env.GITHUB_TOKEN, process.env.GITHUB_RELEASE_TOKEN]
  const token = tokenSources.find((value) => typeof value === 'string' && value.trim().length > 0)?.trim() ?? null

  if (token) {
    process.env.GH_TOKEN ??= token
    process.env.GITHUB_TOKEN ??= token
  }

  return token
}

module.exports = {
  loadProjectEnv,
  resolveGithubToken
}
