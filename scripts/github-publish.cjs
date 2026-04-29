const fs = require('node:fs')
const path = require('node:path')

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function normalizeRepositoryField(repository) {
  if (typeof repository === 'string') {
    return repository.trim()
  }

  if (repository && typeof repository === 'object' && typeof repository.url === 'string') {
    return repository.url.trim()
  }

  return null
}

function parseAuthorHandle(author) {
  if (typeof author === 'string') {
    const normalized = author.trim()
    return normalized.startsWith('@') ? normalized.slice(1) : null
  }

  if (author && typeof author === 'object' && typeof author.name === 'string') {
    const normalized = author.name.trim()
    return normalized.startsWith('@') ? normalized.slice(1) : null
  }

  return null
}

function parseGithubSlug(value) {
  if (!value) {
    return null
  }

  const normalized = value
    .trim()
    .replace(/^git\+/, '')
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/^ssh:\/\/git@github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')

  const match = normalized.match(/^([^/\s]+)\/([^/\s]+)$/)
  if (!match) {
    return null
  }

  return {
    owner: match[1],
    repo: match[2]
  }
}

function readOriginUrlFromGitConfig(projectRoot) {
  const gitConfigPath = path.join(projectRoot, '.git', 'config')
  if (!fs.existsSync(gitConfigPath)) {
    return null
  }

  const contents = fs.readFileSync(gitConfigPath, 'utf8')
  const remoteMatch = contents.match(/\[remote "origin"\]([\s\S]*?)(?:\n\[|$)/)
  if (!remoteMatch) {
    return null
  }

  const urlMatch = remoteMatch[1].match(/^\s*url\s*=\s*(.+)\s*$/m)
  return urlMatch ? urlMatch[1].trim() : null
}

function readPackageMetadata(projectRoot) {
  const packageJsonPath = path.join(projectRoot, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    return null
  }

  const packageJson = readJson(packageJsonPath)
  return {
    authorHandle: parseAuthorHandle(packageJson.author),
    packageName:
      typeof packageJson.name === 'string' && packageJson.name.trim().length > 0
        ? packageJson.name.trim()
        : null,
    repositoryValue: normalizeRepositoryField(packageJson.repository)
  }
}

function resolveGithubRepository(projectRoot = process.cwd()) {
  const packageMetadata = readPackageMetadata(projectRoot)
  const fallbackOwner = packageMetadata?.authorHandle ?? null
  const fallbackRepo = packageMetadata?.packageName ?? null
  const explicitOwner = process.env.GH_OWNER?.trim()
  const explicitRepo = process.env.GH_REPO?.trim()
  if (explicitOwner && explicitRepo) {
    return {
      owner: explicitOwner,
      repo: explicitRepo,
      source: 'GH_OWNER/GH_REPO'
    }
  }

  if (explicitOwner && fallbackRepo) {
    return {
      owner: explicitOwner,
      repo: fallbackRepo,
      source: 'GH_OWNER + package.json name'
    }
  }

  if (fallbackOwner && explicitRepo) {
    return {
      owner: fallbackOwner,
      repo: explicitRepo,
      source: 'package.json author + GH_REPO'
    }
  }

  const envSlug = parseGithubSlug(process.env.GITHUB_REPOSITORY)
  if (envSlug) {
    return {
      ...envSlug,
      source: 'GITHUB_REPOSITORY'
    }
  }

  const packageSlug = parseGithubSlug(packageMetadata?.repositoryValue)
  if (packageSlug) {
    return {
      ...packageSlug,
      source: 'package.json repository'
    }
  }

  const gitOrigin = readOriginUrlFromGitConfig(projectRoot)
  const gitSlug = parseGithubSlug(gitOrigin)
  if (gitSlug) {
    return {
      ...gitSlug,
      source: '.git/config origin'
    }
  }

  if (fallbackOwner && fallbackRepo) {
    return {
      owner: fallbackOwner,
      repo: fallbackRepo,
      source: 'package.json author/name fallback'
    }
  }

  return null
}

function resolveGithubPublishConfig(projectRoot = process.cwd()) {
  const repository = resolveGithubRepository(projectRoot)
  if (!repository) {
    return null
  }

  return {
    provider: 'github',
    owner: repository.owner,
    repo: repository.repo,
    releaseType: 'release',
    publishAutoUpdate: true,
    tagNamePrefix: 'v'
  }
}

module.exports = {
  resolveGithubPublishConfig,
  resolveGithubRepository
}
