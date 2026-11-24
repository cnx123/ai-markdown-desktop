import { useCallback, useState } from 'react';
import type { ChatMessage } from '../../shared/ipc';
import { getApi } from '../lib/api';
import { useEditorStore } from '../stores/editorStore';

export const CHAT_PROMPTS = [
  { id: 'outline', label: '写大纲', text: '根据当前主题，写一份结构清晰的 Markdown 文章大纲，带二级标题和要点列表。' },
  { id: 'article', label: '生成正文', text: '写一篇可直接使用的 Markdown 短文，包含标题、导语、分节和小标题。' },
  { id: 'tasks', label: '任务清单', text: '生成一份 Markdown 任务列表，覆盖准备、执行、验收三步。' },
  { id: 'continue', label: '续写文档', text: '基于当前文档继续往下写，保持原有语气和 Markdown 结构，不要重复已有内容。' },
];

export function useAIChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useDocument, setUseDocument] = useState(true);

  const send = useCallback(async (text?: string) => {
    const content = (text ?? draft).trim();
    if (!content || busy) return;

    const history = [...messages, { role: 'user' as const, content }];
    setMessages(history);
    setDraft('');
    setBusy(true);
    setError(null);

    try {
      const document = useDocument ? useEditorStore.getState().content : '';
      const result = await getApi().chatAI({ messages: history, document });
      if (result.success && result.data) {
        setMessages((current) => [...current, { role: 'assistant', content: result.data! }]);
      } else {
        setError(result.error || 'AI 没有返回内容。');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '对话失败');
    } finally {
      setBusy(false);
    }
  }, [busy, draft, messages, useDocument]);

  const insert = useCallback((content: string) => {
    const store = useEditorStore.getState();
    if (!store.editor) {
      store.setStatusMessage('编辑器尚未就绪。');
      return;
    }
    store.insertAfterSelection(content.endsWith('\n') ? content : `${content}\n`);
    store.setStatusMessage('已把 AI 内容插入编辑器');
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return { messages, draft, setDraft, busy, error, useDocument, setUseDocument, send, insert, clear };
}
