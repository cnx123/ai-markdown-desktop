import React, { useEffect } from 'react';
import { basename } from '../lib/ai';
import { useEditorStore } from '../stores/editorStore';
import './Toolbar.css';

const Toolbar: React.FC = () => {
  const filePath = useEditorStore((state) => state.filePath);
  const dirty = useEditorStore((state) => state.content !== state.savedContent);
  const name = filePath ? basename(filePath) : '未命名';

  useEffect(() => {
    const title = `${dirty ? '• ' : ''}${name} — AI Markdown Editor`;
    document.title = title;
    void window.api?.setTitle(title);
  }, [dirty, name]);

  return (
    <div className="toolbar">
      <div className="file-title" title={filePath ?? '尚未保存'}>
        {dirty && <i className="dirty-dot" />}
        <span>{name}</span>
      </div>
    </div>
  );
};

export default Toolbar;
