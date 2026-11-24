import axios from 'axios';
import {
  isAIInstruction,
  providerNeedsApiKey,
  type AIRequest,
  type AIResponse,
  type AISettings,
  type ChatMessage,
  type ChatRequest,
} from '../shared/ipc';
import { getSettings, normalizeSettings } from './settings';

const PROMPTS: Record<AIRequest['instruction'], string> = {
  polish:
    '你是一位专业的文本编辑助手。请润色用户提供的 Markdown 文本，修正语法错误，优化表达使其更流畅、专业，但保持其原意和 Markdown 格式。直接返回润色后的文本，不要添加解释。',
  summarize:
    '你是一位专业的总结助手。请用简洁的语言总结用户提供的 Markdown 文本的核心内容。直接返回总结文本。',
  expand:
    '你是一位写作助手。请根据用户提供的 Markdown 文本片段或主题，进行合理的扩展和阐述，使其内容更丰富、完整。直接返回扩展后的文本。',
  translateToChinese:
    '你是一位翻译助手。将用户提供的 Markdown 文本准确、流畅地翻译成中文，并保留原有的 Markdown 格式。直接返回翻译后的文本，不要添加解释。',
  translateToEnglish:
    'You are a translation assistant. Translate the user Markdown into natural English. Keep the original Markdown structure and formatting. Return only the translation, with no explanation.',
};

const MAX_INPUT_CHARS = 100_000;

function chatCompletionsUrl(baseURL: string): string {
  const trimmed = baseURL.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  return `${trimmed}/chat/completions`;
}

function unwrapFence(text: string): string {
  const match = text.match(/^```(?:markdown|md)?\s*\r?\n([\s\S]*?)\r?\n```\s*$/i);
  return match ? match[1].trim() : text.trim();
}

function readContent(content: unknown): string {
  if (typeof content === 'string') return unwrapFence(content);
  if (!Array.isArray(content)) return '';
  const joined = content
    .map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part === 'object' && 'text' in part && typeof (part as { text: unknown }).text === 'string') {
        return (part as { text: string }).text;
      }
      return '';
    })
    .join('');
  return unwrapFence(joined);
}

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: { message?: string } } | undefined;
    return data?.error?.message || error.message || '网络请求失败';
  }
  if (error instanceof Error) return error.message;
  return '未知错误';
}

async function complete(
  settings: AISettings,
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>,
  maxTokens: number,
): Promise<string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (settings.apiKey.trim()) {
    headers.Authorization = `Bearer ${settings.apiKey.trim()}`;
  }

  const response = await axios.post(
    chatCompletionsUrl(settings.baseURL),
    {
      model: settings.model,
      messages,
      temperature: 0.7,
      max_tokens: maxTokens,
    },
    {
      headers,
      timeout: 120_000,
    },
  );

  const content = readContent(response.data?.choices?.[0]?.message?.content);
  if (!content) throw new Error('AI 返回内容为空');
  return content;
}

export async function invokeAI(payload: AIRequest): Promise<AIResponse> {
  if (!payload || typeof payload.text !== 'string' || !isAIInstruction(payload.instruction)) {
    return { success: false, error: '请求参数不正确。' };
  }

  const text = payload.text;
  if (!text.trim()) return { success: false, error: '输入文本不能为空。' };
  if (text.length > MAX_INPUT_CHARS) {
    return { success: false, error: `选中文本超过 ${MAX_INPUT_CHARS} 字，请缩小选区。` };
  }

  try {
    const settings = normalizeSettings(await getSettings());
    if (providerNeedsApiKey(settings.provider) && !settings.apiKey.trim()) {
      return { success: false, error: '尚未配置 API Key。请打开设置填写，或在项目根目录的 .env 中设置 DEEPSEEK_API_KEY。' };
    }
    const data = await complete(
      settings,
      [
        { role: 'system', content: PROMPTS[payload.instruction] },
        { role: 'user', content: text },
      ],
      4096,
    );
    return { success: true, data };
  } catch (error) {
    const message = errorMessage(error);
    console.error('AI 调用失败:', message);
    return { success: false, error: `AI 处理失败: ${message}` };
  }
}

const CHAT_SYSTEM = `你是桌面 Markdown 编辑器里的写作助手。用中文交流，直接给出可粘贴进编辑器的 Markdown。

要求：
- 需要成稿时，直接输出标题、列表、表格、任务清单、代码块或 mermaid，不要先说“好的”。
- 用户只是闲聊或提问时，可以简短回答，必要时用 Markdown。
- 不要用 markdown 代码围栏把整篇包起来，除非用户只要某一段代码。
- 如果提供了当前文档，优先基于它续写、改写或补全。`;

const MAX_CHAT_MESSAGES = 16;
const MAX_CHAT_CHARS = 12_000;
const MAX_DOC_CHARS = 8_000;

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const item = value as ChatMessage;
  return (item.role === 'user' || item.role === 'assistant') && typeof item.content === 'string';
}

export async function chatAI(payload: ChatRequest): Promise<AIResponse> {
  if (!payload || !Array.isArray(payload.messages) || payload.messages.length === 0) {
    return { success: false, error: '请先输入要发送的内容。' };
  }
  if (!payload.messages.every(isChatMessage)) {
    return { success: false, error: '对话内容格式不正确。' };
  }

  const messages = payload.messages
    .map((item) => ({ role: item.role, content: item.content.trim() }))
    .filter((item) => item.content.length > 0)
    .slice(-MAX_CHAT_MESSAGES);

  if (messages.length === 0) return { success: false, error: '请先输入要发送的内容。' };
  if (messages.some((item) => item.content.length > MAX_CHAT_CHARS)) {
    return { success: false, error: `单条消息不能超过 ${MAX_CHAT_CHARS} 字。` };
  }

  const document = typeof payload.document === 'string' ? payload.document.trim() : '';
  const system = document
    ? `${CHAT_SYSTEM}\n\n当前文档（可参考，不要原样复述全文）：\n${document.slice(0, MAX_DOC_CHARS)}`
    : CHAT_SYSTEM;

  try {
    const settings = normalizeSettings(await getSettings());
    if (providerNeedsApiKey(settings.provider) && !settings.apiKey.trim()) {
      return { success: false, error: '尚未配置 API Key。请打开设置填写。' };
    }
    const data = await complete(settings, [{ role: 'system', content: system }, ...messages], 4096);
    return { success: true, data };
  } catch (error) {
    const message = errorMessage(error);
    console.error('AI 对话失败:', message);
    return { success: false, error: `AI 处理失败: ${message}` };
  }
}

export async function testConnection(input: AISettings): Promise<AIResponse> {
  try {
    const settings = normalizeSettings(input);
    if (providerNeedsApiKey(settings.provider) && !settings.apiKey.trim()) {
      return { success: false, error: `${settings.provider === 'deepseek' ? 'DeepSeek' : '该接口'}需要 API Key。` };
    }
    await complete(
      settings,
      [
        { role: 'system', content: '你是连接测试助手。' },
        { role: 'user', content: '只回复 OK' },
      ],
      16,
    );
    return { success: true, data: '连接成功' };
  } catch (error) {
    return { success: false, error: errorMessage(error) };
  }
}
