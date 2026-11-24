import { useCallback, useEffect, useState } from 'react';
import type { AIInstruction } from '../../shared/ipc';
import { AI_OPERATIONS, AI_RUN_EVENT } from '../lib/ai';
import { getApi } from '../lib/api';
import { getSelectedText } from '../lib/vditor';
import { useEditorStore } from '../stores/editorStore';

export interface AISuggestion {
  instruction: AIInstruction;
  label: string;
  original: string;
  suggestion: string;
}

export function useAIProcessor() {
  const isProcessing = useEditorStore((state) => state.isAIProcessing);
  const processingInstruction = useEditorStore((state) => state.processingInstruction);
  const error = useEditorStore((state) => state.aiError);
  const [pending, setPending] = useState<AISuggestion | null>(null);

  const processWithAI = useCallback(async (instruction: AIInstruction) => {
    const store = useEditorStore.getState();
    const editor = store.editor;
    if (!editor) {
      store.setAIError('编辑器尚未就绪。');
      return;
    }
    if (store.isAIProcessing) return;

    const text = getSelectedText(editor);
    if (!text.trim()) {
      store.setAIError('请先在编辑器中选中一些文本。');
      return;
    }

    store.setAIProcessing(true);
    store.setProcessingInstruction(instruction);
    store.setAIError(null);
    store.setStatusMessage(null);
    setPending(null);

    try {
      const result = await getApi().invokeAI({ instruction, text });
      if (result.success && result.data) {
        const operation = AI_OPERATIONS.find((item) => item.id === instruction);
        setPending({
          instruction,
          label: operation?.label ?? instruction,
          original: text,
          suggestion: result.data,
        });
      } else {
        useEditorStore.getState().setAIError(result.error || 'AI 处理失败。');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '请求失败';
      useEditorStore.getState().setAIError(message);
    } finally {
      useEditorStore.getState().setAIProcessing(false);
      useEditorStore.getState().setProcessingInstruction(null);
    }
  }, []);

  useEffect(() => {
    const onRun = (event: Event) => {
      const instruction = (event as CustomEvent<AIInstruction>).detail;
      void processWithAI(instruction);
    };
    const onKey = (event: KeyboardEvent) => {
      if (window.api) return;
      if (document.querySelector('.overlay')) return;
      if (!(event.ctrlKey && event.altKey) || event.shiftKey || event.metaKey) return;
      const operation = AI_OPERATIONS.find((item) => item.key === event.key);
      if (!operation) return;
      event.preventDefault();
      void processWithAI(operation.id);
    };
    window.addEventListener(AI_RUN_EVENT, onRun);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(AI_RUN_EVENT, onRun);
      window.removeEventListener('keydown', onKey);
    };
  }, [processWithAI]);

  return {
    processWithAI,
    isProcessing,
    processingInstruction,
    error,
    pending,
    clearPending: () => setPending(null),
    clearError: () => useEditorStore.getState().setAIError(null),
  };
}
