const path = require('node:path')
const { loadProjectEnv, resolveGithubToken } = require('./load-project-env.cjs')

function getGithubHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'postgresql-column-order-editor-release-check',
    'X-GitHub-Api-Version': '2022-11-28'
  }
}

async function readJsonSafely(response) {
  const text = await response.text()

  if (!text) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return { message: text }
  }
}

function formatGithubPermissionError(repository, response, payload) {
  const message =
    payload && typeof payload.message === 'string' && payload.message.trim().length > 0
      ? payload.message.trim()
      : `GitHub API returned HTTP ${response.status}.`
  const acceptedPermissions = response.headers.get('x-accepted-github-permissions')
  const permissionHint = acceptedPermissions
    ? ` GitHub expected permissions: ${acceptedPermissions}.`
    : ''

  return new Error(
    `GitHub release access check failed for ${repository.owner}/${repository.repo}. ${message}.${permissionHint} ` +
      `If you use a fine-grained PAT, grant repository "Contents" permission with write access. ` +
      `If you use a classic PAT, use the "repo" scope.`
  )
}

async function validateGithubReleaseAccess(repository, projectRoot = path.resolve(__dirname, '..')) {
  loadProjectEnv(projectRoot)

  const token = resolveGithubToken()
  if (!token) {
    throw new Error(
      'Missing GitHub token. Set GH_TOKEN, GITHUB_TOKEN, or GITHUB_RELEASE_TOKEN before publishing.'
    )
  }

  const headers = getGithubHeaders(token)
  const repoResponse = await fetch(
    `https://api.github.com/repos/${repository.owner}/${repository.repo}`,
    { headers }
  )
  const repoPayload = await readJsonSafely(repoResponse)

  if (!repoResponse.ok) {
    throw formatGithubPermissionError(repository, repoResponse, repoPayload)
  }

  const targetCommitish =
    repoPayload &&
    typeof repoPayload === 'object' &&
    typeof repoPayload.default_branch === 'string' &&
    repoPayload.default_branch.trim().length > 0
      ? repoPayload.default_branch.trim()
      : 'main'

  const releaseCheckResponse = await fetch(
    `https://api.github.com/repos/${repository.owner}/${repository.repo}/releases/generate-notes`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tag_name: `v0.0.0-release-check-${Date.now()}`,
        target_commitish: targetCommitish
      })
    }
  )
  const releaseCheckPayload = await readJsonSafely(releaseCheckResponse)

  if (!releaseCheckResponse.ok) {
    throw formatGithubPermissionError(repository, releaseCheckResponse, releaseCheckPayload)
  }
}

module.exports = {
  validateGithubReleaseAccess
}
