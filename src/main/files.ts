import { app, BrowserWindow, dialog } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ExportDataRequest, FileOpenResult, FileSaveRequest, FileSaveResult } from '../shared/ipc';

const filters = [
  { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
  { name: '所有文件', extensions: ['*'] },
];

export async function openFile(): Promise<FileOpenResult> {
  try {
    const result = await dialog.showOpenDialog({
      title: '打开 Markdown',
      filters,
      properties: ['openFile'],
    });
    if (result.canceled || !result.filePaths[0]) return { canceled: true };
    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath, 'utf-8');
    return { canceled: false, filePath, content };
  } catch (error) {
    const message = error instanceof Error ? error.message : '打开文件失败';
    return { canceled: false, error: message };
  }
}

async function write(filePath: string, content: string): Promise<FileSaveResult> {
  try {
    await fs.writeFile(filePath, content, 'utf-8');
    return { canceled: false, filePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存文件失败';
    return { canceled: false, error: message };
  }
}

export async function saveFile(payload: FileSaveRequest): Promise<FileSaveResult> {
  if (!payload || typeof payload.content !== 'string') {
    return { canceled: false, error: '没有可保存的内容。' };
  }
  if (payload.filePath) return write(payload.filePath, payload.content);
  return saveFileAs(payload.content);
}

export async function saveFileAs(content: string): Promise<FileSaveResult> {
  if (typeof content !== 'string') return { canceled: false, error: '没有可保存的内容。' };
  try {
    const result = await dialog.showSaveDialog({
      title: '保存 Markdown',
      defaultPath: '未命名.md',
      filters,
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return { canceled: true };
    return write(result.filePath, content);
  } catch (error) {
    const message = error instanceof Error ? error.message : '保存文件失败';
    return { canceled: false, error: message };
  }
}

async function pickExportPath(defaultPath: string, extraFilters: { name: string; extensions: string[] }[]): Promise<string | null> {
  const result = await dialog.showSaveDialog({
    title: '导出',
    defaultPath,
    filters: extraFilters,
    properties: ['createDirectory', 'showOverwriteConfirmation'],
  });
  if (result.canceled || !result.filePath) return null;
  return result.filePath;
}

export async function exportData(payload: ExportDataRequest): Promise<FileSaveResult> {
  if (!payload || typeof payload.data !== 'string') {
    return { canceled: false, error: '没有可导出的内容。' };
  }
  try {
    const filePath = await pickExportPath(payload.defaultPath, payload.filters);
    if (!filePath) return { canceled: true };
    const buffer = payload.encoding === 'base64' ? Buffer.from(payload.data, 'base64') : Buffer.from(payload.data, 'utf-8');
    await fs.writeFile(filePath, buffer);
    return { canceled: false, filePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : '导出失败';
    return { canceled: false, error: message };
  }
}

function wrapHtmlDocument(body: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <title>Markdown</title>
  <style>
    body { font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; max-width: 860px; margin: 32px auto; line-height: 1.7; color: #1f1b16; }
    img, svg { max-width: 100%; }
    pre { background: #f4f1ea; padding: 12px; overflow: auto; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #ccc; padding: 6px 8px; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

export async function exportPdf(html: string): Promise<FileSaveResult> {
  if (typeof html !== 'string' || !html.trim()) {
    return { canceled: false, error: '没有可导出的内容。' };
  }
  const tempFile = path.join(app.getPath('temp'), `ai-md-export-${Date.now()}.html`);
  let window: BrowserWindow | null = null;
  try {
    await fs.writeFile(tempFile, wrapHtmlDocument(html), 'utf-8');
    window = new BrowserWindow({
      show: false,
      webPreferences: { sandbox: true, contextIsolation: true },
    });
    await window.loadFile(tempFile);
    const pdf = await window.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 },
    });
    const filePath = await pickExportPath('未命名.pdf', [{ name: 'PDF', extensions: ['pdf'] }]);
    if (!filePath) return { canceled: true };
    await fs.writeFile(filePath, pdf);
    return { canceled: false, filePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : '导出 PDF 失败';
    return { canceled: false, error: message };
  } finally {
    window?.destroy();
    await fs.unlink(tempFile).catch(() => undefined);
  }
}

export async function exportDocx(html: string): Promise<FileSaveResult> {
  if (typeof html !== 'string' || !html.trim()) {
    return { canceled: false, error: '没有可导出的内容。' };
  }
  try {
    const HTMLtoDOCX = (await import('html-to-docx')).default as (
      content: string,
    ) => Promise<Buffer | ArrayBuffer | Uint8Array>;
    const buffer = await HTMLtoDOCX(wrapHtmlDocument(html));
    const filePath = await pickExportPath('未命名.docx', [{ name: 'Word', extensions: ['docx'] }]);
    if (!filePath) return { canceled: true };
    const bytes = buffer instanceof ArrayBuffer ? Buffer.from(new Uint8Array(buffer)) : Buffer.from(buffer);
    await fs.writeFile(filePath, bytes);
    return { canceled: false, filePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : '导出 Word 失败';
    return { canceled: false, error: message };
  }
}
