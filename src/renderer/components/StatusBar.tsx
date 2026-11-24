import React from 'react';
import { AI_OPERATIONS } from '../lib/ai';
import { useEditorStore } from '../stores/editorStore';
import './StatusBar.css';

const StatusBar: React.FC = () => {
  const content = useEditorStore((state) => state.content);
  const filePath = useEditorStore((state) => state.filePath);
  const aiError = useEditorStore((state) => state.aiError);
  const statusMessage = useEditorStore((state) => state.statusMessage);
  const processingInstruction = useEditorStore((state) => state.processingInstruction);
  const chars = content.replace(/\s/g, '').length;
  const lines = content.length === 0 ? 0 : content.split('\n').length;
  const processing = AI_OPERATIONS.find((item) => item.id === processingInstruction);
  const message = processing ? `正在${processing.label}…` : aiError || statusMessage || (filePath ?? '未保存');

  return (
    <footer className="status-bar">
      <span className={aiError ? 'is-error' : ''} title={message}>
        {message}
      </span>
      <span>
        {chars} 字 · {lines} 行
      </span>
    </footer>
  );
};

export default StatusBar;
