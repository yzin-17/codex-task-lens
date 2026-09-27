function monitoringOptions(config, dataDirectory, openFile) {
  return {
    dataDirectory, cdpPort: config.port, appPath: config.appPath, workspace: config.workspace,
    sessionRoot: config.sessionRoot, allowSessionRead: !!config.sessionRoot,
    sourceId: 'codex-default', openBrowser: false, openFile
  };
}
module.exports = { monitoringOptions };
