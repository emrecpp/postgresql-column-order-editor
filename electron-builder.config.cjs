const { resolveGithubPublishConfig } = require('./scripts/github-publish.cjs')

const githubPublishConfig = resolveGithubPublishConfig(__dirname)

module.exports = {
  appId: 'com.postgresql-column-order-editor',
  productName: 'PostgreSQL Column Order Editor',
  directories: {
    buildResources: 'assets',
    output: 'release/${version}'
  },
  files: ['out/**/*', 'package.json'],
  win: {
    icon: 'icon.ico',
    target: ['nsis']
  },
  nsis: {
    installerHeaderIcon: 'icon.ico',
    installerIcon: 'icon.ico',
    uninstallerIcon: 'icon.ico'
  },
  publish: githubPublishConfig ? [githubPublishConfig] : undefined,
  electronUpdaterCompatibility: '>=2.16'
}
