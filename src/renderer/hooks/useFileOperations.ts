import { useCallback, useMemo } from 'react';
import { getApi } from '../lib/api';
import { useEditorStore } from '../stores/editorStore';

function confirmDiscard(): boolean {
  const { content, savedContent } = useEditorStore.getState();
  if (content === savedContent) return true;
  return window.confirm('当前文档有未保存的修改，确定放弃吗？');
}

export function useFileOperations() {
  const create = useCallback(() => {
    if (!confirmDiscard()) return;
    useEditorStore.getState().loadDocument('', null);
  }, []);

  const open = useCallback(async () => {
    if (!confirmDiscard()) return;
    try {
      const result = await getApi().openFile();
      if (result.canceled) return;
      if (result.error || result.content === undefined || !result.filePath) {
        useEditorStore.getState().setStatusMessage(result.error || '打开文件失败。');
        return;
      }
      useEditorStore.getState().loadDocument(result.content, result.filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : '打开文件失败。';
      useEditorStore.getState().setStatusMessage(message);
    }
  }, []);

  const saveAs = useCallback(async () => {
    try {
      const content = useEditorStore.getState().content;
      const result = await getApi().saveFileAs(content);
      if (result.canceled) return;
      if (result.error || !result.filePath) {
        useEditorStore.getState().setStatusMessage(result.error || '保存失败。');
        return;
      }
      useEditorStore.getState().markSaved(result.filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败。';
      useEditorStore.getState().setStatusMessage(message);
    }
  }, []);

  const save = useCallback(async () => {
    const { filePath, content } = useEditorStore.getState();
    if (!filePath) {
      await saveAs();
      return;
    }
    try {
      const result = await getApi().saveFile({ filePath, content });
      if (result.canceled) return;
      if (result.error || !result.filePath) {
        useEditorStore.getState().setStatusMessage(result.error || '保存失败。');
        return;
      }
      useEditorStore.getState().markSaved(result.filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : '保存失败。';
      useEditorStore.getState().setStatusMessage(message);
    }
  }, [saveAs]);

  return useMemo(() => ({ create, open, save, saveAs }), [create, open, save, saveAs]);
}
