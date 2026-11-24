import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAIProcessor, type AISuggestion } from '../hooks/useAIProcessor';
import { useEditorStore } from '../stores/editorStore';

const AISuggestionHost: React.FC = () => {
  const { pending, clearPending } = useAIProcessor();

  return (
    <SuggestionDialog
      pending={pending}
      onApply={(mode) => {
        if (!pending) return;
        if (applySuggestion(pending, mode)) clearPending();
      }}
      onDismiss={clearPending}
    />
  );
};

function SuggestionDialog({
  pending,
  onApply,
  onDismiss,
}: {
  pending: AISuggestion | null;
  onApply: (mode: 'replace' | 'insert') => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!pending) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pending, onDismiss]);

  if (!pending) return null;
  return createPortal(
    <div className="overlay" role="presentation" onMouseDown={onDismiss}>
      <div
        className="suggestion-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="suggestion-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="suggestion-title">{pending.label}</h2>
          <p>确认后再写入文档。替换时请保持原文仍处于选中状态。</p>
        </header>
        <div className="suggestion-columns">
          <section>
            <h3>选中原文</h3>
            <pre>{pending.original}</pre>
          </section>
          <section>
            <h3>AI 建议</h3>
            <pre>{pending.suggestion}</pre>
          </section>
        </div>
        <footer>
          <button type="button" onClick={onDismiss}>
            取消
          </button>
          <button type="button" onClick={() => onApply('insert')}>
            插入到选区后
          </button>
          <button type="button" className="primary" onClick={() => onApply('replace')}>
            替换选中文本
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

function applySuggestion(pending: AISuggestion, mode: 'replace' | 'insert'): boolean {
  const store = useEditorStore.getState();
  const editor = store.editor;
  if (!editor) return false;
  const current = editor.getSelection() || '';
  if (mode === 'replace') {
    if (current !== pending.original) {
      store.setAIError('选中内容已变化，请重新执行 AI 操作。');
      return false;
    }
    store.replaceSelection(pending.suggestion);
    store.setStatusMessage('已替换选中文本');
    return true;
  }
  store.insertAfterSelection(pending.suggestion);
  store.setStatusMessage('已插入到选区后');
  return true;
}

export default AISuggestionHost;
