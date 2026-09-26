module.exports = {
  appId: 'dev.yzin.codex-task-lens', productName: 'Codex Task Lens',
  electronVersion: '44.4.5', asar: true, npmRebuild: false,
  directories: { output: 'release', buildResources: 'build' },
  files: ['desktop/**/*', 'dist/node/**/*.js', 'dist/ui/**/*', 'dist/inject/*', 'build/icon.png', 'package.json', '!**/*.map', '!**/*.test.*'],
  artifactName: 'Codex-Task-Lens-${version}-${os}-${arch}.${ext}',
  mac: { target: ['dmg', 'zip'], category: 'public.app-category.developer-tools', identity: '-', hardenedRuntime: false },
  win: { target: ['nsis', 'zip'] },
  nsis: { oneClick: false, perMachine: false, allowToChangeInstallationDirectory: true, createDesktopShortcut: true, artifactName: 'Codex-Task-Lens-${version}-win-${arch}-Setup.${ext}' },
  publish: null
};
