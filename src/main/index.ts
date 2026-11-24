import { app, BrowserWindow, Menu, ipcMain, shell } from 'electron';
import path from 'node:path';
import dotenv from 'dotenv';
import { chatAI, invokeAI, testConnection } from './ai-handler';
import { probeVoiceInput, transcribeAudio } from './asr-handler';
import { exportData, exportDocx, exportPdf, openFile, saveFile, saveFileAs } from './files';
import { createApplicationMenu } from './menu';
import { ensureDefaultSettings, getSettings, setSettings } from './settings';
import type { AIRequest, AISettings, ChatRequest, ExportDataRequest, FileSaveRequest, TranscribeRequest } from '../shared/ipc';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#f6f5f2',
    show: false,
    autoHideMenuBar: false,
    title: 'AI Markdown Editor',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on('did-fail-load', () => {
    console.error('页面加载失败。开发时请确认 Vite 已在 http://127.0.0.1:5173 运行。');
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        void shell.openExternal(url);
      }
    } catch {
      console.error('忽略无法识别的链接');
    }
    return { action: 'deny' };
  });

  if (!app.isPackaged) {
    void mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

function assertHttpUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('只允许打开 http 或 https 链接');
  }
}

app.whenReady().then(async () => {
  await ensureDefaultSettings();
  Menu.setApplicationMenu(createApplicationMenu());

  ipcMain.handle('invoke-ai', (_event, payload: AIRequest) => invokeAI(payload));
  ipcMain.handle('ai:chat', (_event, payload: ChatRequest) => chatAI(payload));
  ipcMain.handle('ai:transcribe', (_event, payload: TranscribeRequest) => transcribeAudio(payload));
  ipcMain.handle('ai:voice-probe', () => probeVoiceInput());
  ipcMain.handle('ai:test', (_event, settings: AISettings) => testConnection(settings));
  ipcMain.handle('settings:get', () => getSettings());
  ipcMain.handle('settings:set', (_event, settings: AISettings) => setSettings(settings));
  ipcMain.handle('file:open', () => openFile());
  ipcMain.handle('file:save', (_event, payload: FileSaveRequest) => saveFile(payload));
  ipcMain.handle('file:save-as', (_event, content: string) => saveFileAs(content));
  ipcMain.handle('file:export', (_event, payload: ExportDataRequest) => exportData(payload));
  ipcMain.handle('file:export-pdf', (_event, html: string) => exportPdf(html));
  ipcMain.handle('file:export-docx', (_event, html: string) => exportDocx(html));
  ipcMain.handle('window:set-title', (_event, title: string) => {
    if (typeof title === 'string') mainWindow?.setTitle(title.slice(0, 200));
  });
  ipcMain.handle('shell:open-external', (_event, url: string) => {
    if (typeof url !== 'string') throw new Error('链接无效');
    assertHttpUrl(url);
    return shell.openExternal(url);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
