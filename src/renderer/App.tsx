import React, { useCallback, useState } from 'react';
import AIChat from './components/AIChat';
import AISuggestionHost from './components/AISuggestionHost';
import { ErrorBoundary } from './components/ErrorBoundary';
import MarkdownEditor from './components/MarkdownEditor';
import SettingsDialog from './components/SettingsDialog';
import StatusBar from './components/StatusBar';
import Toolbar from './components/Toolbar';
import { useAppMenu } from './hooks/useAppMenu';
import { useFileOperations } from './hooks/useFileOperations';
import './App.css';

const App: React.FC = () => {
  const files = useFileOperations();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  useAppMenu(files, openSettings);
  const desktop = typeof window !== 'undefined' && Boolean(window.api);

  return (
    <ErrorBoundary>
      <div className="app">
        <header className="app-header">
          <div className="brand">
            <span className="brand-mark">M</span>
            <div>
              <strong>AI Markdown</strong>
              <span>Vditor + DeepSeek</span>
            </div>
          </div>
          <Toolbar />
        </header>
        {!desktop && <div className="runtime-banner">请在 Electron 窗口中使用。只打开 Vite 页面时，文件和 AI 不可用。</div>}
        <main className="workspace">
          <section className="editor-pane">
            <MarkdownEditor />
          </section>
          <AIChat />
          <AISuggestionHost />
        </main>
        <StatusBar />
        <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </div>
    </ErrorBoundary>
  );
};

export default App;
