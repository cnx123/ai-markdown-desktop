import { useEffect } from 'react';
import { requestAI } from '../lib/ai';
import { exportDocx, exportHtml, exportImage, exportPdf } from '../lib/export';
import { isMenuCommand, type MenuCommand } from '../../shared/ipc';
import { useEditorStore } from '../stores/editorStore';

interface FileActions {
  create: () => void;
  open: () => void | Promise<void>;
  save: () => void | Promise<void>;
  saveAs: () => void | Promise<void>;
}

async function runExport(task: () => Promise<void>): Promise<void> {
  try {
    await task();
  } catch (error) {
    useEditorStore.getState().setStatusMessage(error instanceof Error ? error.message : '导出失败');
  }
}

function handleMenuCommand(command: MenuCommand, files: FileActions, onSettings: () => void): void {
  const content = () => useEditorStore.getState().content;
  switch (command) {
    case 'file:new':
      files.create();
      return;
    case 'file:open':
      void files.open();
      return;
    case 'file:save':
      void files.save();
      return;
    case 'file:save-as':
      void files.saveAs();
      return;
    case 'file:export-html':
      void runExport(() => exportHtml(content()));
      return;
    case 'file:export-pdf':
      void runExport(() => exportPdf(content()));
      return;
    case 'file:export-png':
      void runExport(() => exportImage(content(), 'png'));
      return;
    case 'file:export-jpeg':
      void runExport(() => exportImage(content(), 'jpeg'));
      return;
    case 'file:export-docx':
      void runExport(() => exportDocx(content()));
      return;
    case 'app:settings':
      onSettings();
      return;
    case 'view:mode-ir':
      useEditorStore.getState().setMode('ir');
      return;
    case 'view:mode-sv':
      useEditorStore.getState().setMode('sv');
      return;
    case 'ai:polish':
      requestAI('polish');
      return;
    case 'ai:summarize':
      requestAI('summarize');
      return;
    case 'ai:expand':
      requestAI('expand');
      return;
    case 'ai:translateToChinese':
      requestAI('translateToChinese');
      return;
    case 'ai:translateToEnglish':
      requestAI('translateToEnglish');
      return;
    default:
      return;
  }
}

export function useAppMenu(files: FileActions, onSettings: () => void): void {
  useEffect(() => {
    const api = window.api;
    if (!api?.onMenuCommand) return;
    return api.onMenuCommand((command) => {
      if (!isMenuCommand(command)) return;
      handleMenuCommand(command, files, onSettings);
    });
  }, [files, onSettings]);
}
