const path = require('node:path');
const CONTROL_URL = 'tasklens://control/index.html';
const operations = new Set(['state', 'connect', 'stop', 'choose-app', 'choose-workspace', 'clear-workspace', 'choose-session-root', 'clear-session-root', 'open-panel', 'launch']);
function port(value) { if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error('CDP 端口须为 1024–65535'); return value; }
function settings(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['port', 'appPath', 'workspace', 'sessionRoot', 'sessionScanEnabled'].includes(key))) throw new Error('配置格式不支持');
  const result = { port: port(value.port ?? 9341), sessionScanEnabled: value.sessionScanEnabled !== false };
  if (value.sessionScanEnabled !== undefined && typeof value.sessionScanEnabled !== 'boolean') throw new Error('会话扫描配置无效');
  for (const key of ['appPath', 'workspace', 'sessionRoot']) if (value[key] !== undefined) {
    if (typeof value[key] !== 'string' || value[key].length > 4096 || !path.isAbsolute(value[key]) || /[\0\r\n]/.test(value[key])) throw new Error('配置路径无效');
    result[key] = value[key];
  }
  return result;
}
function message(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !['op', 'value'].includes(key)) || !operations.has(value.op)) throw new Error('不支持的操作');
  if (value.op === 'connect') port(value.value);
  else if (value.value !== undefined) throw new Error('不支持的操作参数');
  return value;
}
function senderAllowed(event, contents) {
  return !!contents && event.sender === contents && event.senderFrame === contents.mainFrame && event.senderFrame?.url === CONTROL_URL;
}
module.exports = { CONTROL_URL, port, settings, message, senderAllowed };
