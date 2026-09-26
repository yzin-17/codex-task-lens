const { contextBridge, ipcRenderer } = require('electron');
const call = (op, value) => ipcRenderer.invoke('task-lens:control', { op, value });
contextBridge.exposeInMainWorld('taskLens', Object.freeze({
  state: () => call('state'), connect: port => call('connect', port), stop: () => call('stop'),
  chooseApp: () => call('choose-app'), chooseWorkspace: () => call('choose-workspace'),
  clearWorkspace: () => call('clear-workspace'), openPanel: () => call('open-panel'), launch: () => call('launch')
}));
