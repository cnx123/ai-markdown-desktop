import { contextBridge, ipcRenderer } from 'electron';
import {
  isMenuCommand,
  type AIRequest,
  type AISettings,
  type ChatRequest,
  type DesktopApi,
  type ExportDataRequest,
  type FileSaveRequest,
  type MenuCommand,
  type TranscribeRequest,
} from '../shared/ipc';

const api: DesktopApi = {
  invokeAI: (payload: AIRequest) => ipcRenderer.invoke('invoke-ai', payload),
  chatAI: (payload: ChatRequest) => ipcRenderer.invoke('ai:chat', payload),
  transcribeAudio: (payload: TranscribeRequest) => ipcRenderer.invoke('ai:transcribe', payload),
  probeVoiceInput: () => ipcRenderer.invoke('ai:voice-probe'),
  testConnection: (settings: AISettings) => ipcRenderer.invoke('ai:test', settings),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: AISettings) => ipcRenderer.invoke('settings:set', settings),
  openFile: () => ipcRenderer.invoke('file:open'),
  saveFile: (payload: FileSaveRequest) => ipcRenderer.invoke('file:save', payload),
  saveFileAs: (content: string) => ipcRenderer.invoke('file:save-as', content),
  exportData: (payload: ExportDataRequest) => ipcRenderer.invoke('file:export', payload),
  exportPdf: (html: string) => ipcRenderer.invoke('file:export-pdf', html),
  exportDocx: (html: string) => ipcRenderer.invoke('file:export-docx', html),
  setTitle: (title: string) => ipcRenderer.invoke('window:set-title', title),
  openExternal: (url: string) => ipcRenderer.invoke('shell:open-external', url),
  onMenuCommand: (callback: (command: MenuCommand) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, command: unknown) => {
      if (isMenuCommand(command)) callback(command);
    };
    ipcRenderer.on('menu:command', listener);
    return () => {
      ipcRenderer.removeListener('menu:command', listener);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
