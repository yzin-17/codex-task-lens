const path = require('node:path');
const os = require('node:os');

function effectiveSessionRoot(config) {
  if (config.sessionScanEnabled === false) return undefined;
  const codexHome = typeof process.env.CODEX_HOME === 'string' && path.isAbsolute(process.env.CODEX_HOME) ? process.env.CODEX_HOME : undefined;
  return config.sessionRoot ?? codexHome ?? path.join(os.homedir(), '.codex');
}
function monitoringOptions(config, dataDirectory, openFile) {
  const sessionRoot = effectiveSessionRoot(config);
  return {
    dataDirectory, cdpPort: config.port, appPath: config.appPath, workspace: config.workspace,
    sessionRoot, allowSessionRead: !!sessionRoot,
    sourceId: 'codex-default', openBrowser: false, openFile
  };
}
module.exports = { monitoringOptions, effectiveSessionRoot };
