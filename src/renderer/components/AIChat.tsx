import React, { useCallback, useEffect, useRef } from 'react';
import { CHAT_PROMPTS, useAIChat } from '../hooks/useAIChat';
import { useVoiceInput } from '../hooks/useVoiceInput';
import './AIChat.css';

function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

const AIChat: React.FC = () => {
  const { messages, draft, setDraft, busy, error, useDocument, setUseDocument, send, insert, clear } = useAIChat();
  const listRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleVoiceText = useCallback(
    (text: string) => {
      const recognized = text.trim();
      if (!recognized) return;
      const field = textareaRef.current;
      const start = field?.selectionStart ?? draft.length;
      const end = field?.selectionEnd ?? draft.length;
      const needSpace = start > 0 && !/\s/.test(draft.slice(start - 1, start));
      const snippet = `${needSpace ? ' ' : ''}${recognized}`;
      const next = `${draft.slice(0, start)}${snippet}${draft.slice(end)}`;
      setDraft(next);
      requestAnimationFrame(() => {
        const node = textareaRef.current;
        if (!node) return;
        const caret = start + snippet.length;
        node.focus();
        node.setSelectionRange(caret, caret);
      });
    },
    [draft, setDraft],
  );

  const voice = useVoiceInput({ onText: handleVoiceText, enabled: !busy });
  const { status: voiceStatus, elapsedMs, level, notice: voiceNotice, error: voiceError, toggle: toggleVoice, cancel: cancelVoice } = voice;

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, busy]);

  useEffect(() => {
    if (voiceStatus !== 'recording') return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        cancelVoice();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [voiceStatus, cancelVoice]);

  const voiceHint =
    voiceStatus === 'recording'
      ? `录音中 ${formatElapsed(elapsedMs)} · 点击结束`
      : voiceStatus === 'transcribing'
        ? '正在转写…'
        : voiceNotice ?? '';

  return (
    <aside className="ai-panel">
      <section className="ai-chat">
        <div className="ai-chat-head">
          <h2>AI 对话</h2>
          <label>
            <input type="checkbox" checked={useDocument} onChange={(event) => setUseDocument(event.target.checked)} />
            带上当前文档
          </label>
          <button type="button" onClick={clear} disabled={busy || messages.length === 0}>
            清空
          </button>
        </div>
        <p className="ai-chat-hint">直接说你要写什么，也可以点麦克风用语音输入，AI 会返回可插入的 Markdown。</p>
        <div className="ai-chat-prompts">
          {CHAT_PROMPTS.map((item) => (
            <button key={item.id} type="button" disabled={busy} onClick={() => void send(item.text)}>
              {item.label}
            </button>
          ))}
        </div>
        <div className="ai-chat-list" ref={listRef}>
          {messages.length === 0 && !busy && (
            <p className="ai-chat-empty">例如：写一份产品发布说明，带标题、要点和任务列表。</p>
          )}
          {messages.map((message, index) => (
            <article key={`${message.role}-${index}`} className={`ai-bubble is-${message.role}`}>
              <header>{message.role === 'user' ? '你' : 'AI'}</header>
              <pre>{message.content}</pre>
              {message.role === 'assistant' && (
                <button type="button" onClick={() => insert(message.content)}>
                  插入到编辑器
                </button>
              )}
            </article>
          ))}
          {busy && <p className="ai-chat-wait">正在生成 Markdown…</p>}
        </div>
        {(voiceError || error) && <p className="ai-chat-error">{voiceError ?? error}</p>}
        <form
          className="ai-chat-input"
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <div className={`ai-chat-composer is-${voiceStatus}`}>
            <textarea
              ref={textareaRef}
              value={draft}
              rows={3}
              placeholder="描述你想生成的 Markdown，或点左下角麦克风说话…"
              disabled={busy}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send();
                }
              }}
            />
            <div className="ai-chat-composer-bar">
              <button
                type="button"
                className={`voice-btn is-${voiceStatus}`}
                onClick={toggleVoice}
                disabled={busy || voiceStatus === 'transcribing'}
                aria-label={voiceStatus === 'recording' ? '结束录音并转写' : '语音输入'}
                title={voiceStatus === 'recording' ? '结束录音并转写（Esc 取消）' : '语音输入，自动转成文字'}
              >
                {voiceStatus === 'recording' ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <rect x="7.5" y="7.5" width="9" height="9" rx="2.5" fill="currentColor" />
                  </svg>
                ) : voiceStatus === 'transcribing' ? (
                  <span className="voice-spinner" aria-hidden="true" />
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 14.5a3 3 0 0 0 3-3V6.5a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <path
                      d="M6 11.5a6 6 0 0 0 12 0M12 17.5V21M9.5 21h5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                )}
              </button>
              {voiceStatus === 'recording' && (
                <span className="voice-meter" aria-hidden="true">
                  {[0.55, 1, 0.7].map((scale, index) => (
                    <i key={index} style={{ height: `${4 + level * scale * 12}px` }} />
                  ))}
                </span>
              )}
              <span className="voice-status">{voiceHint}</span>
              <button type="submit" className="ai-chat-send" disabled={busy || !draft.trim()}>
                发送
              </button>
            </div>
          </div>
        </form>
      </section>
    </aside>
  );
};

export default AIChat;
