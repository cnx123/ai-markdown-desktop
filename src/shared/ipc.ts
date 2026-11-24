export type AIInstruction = 'polish' | 'summarize' | 'expand' | 'translateToChinese' | 'translateToEnglish';

export type AIProvider = 'deepseek' | 'openai' | 'ollama' | 'custom';

export interface AIRequest {
  instruction: AIInstruction;
  text: string;
}

export interface AIResponse {
  success: boolean;
  data?: string;
  error?: string;
}

export type ASRLanguage = 'zh' | 'en' | 'auto';

export interface ASRSettings {
  /** 为空表示不调用云端，使用本机识别。 */
  baseURL: string;
  model: string;
  /** 为空时复用 AI 的 API Key。 */
  apiKey: string;
  language: ASRLanguage;
}

export interface TranscribeRequest {
  /** 16kHz / 16bit / 单声道 WAV 的 base64。 */
  audioBase64: string;
  mimeType: 'audio/wav';
  durationMs?: number;
}

export interface TranscribeResponse {
  success: boolean;
  data?: string;
  error?: string;
  engine?: 'cloud' | 'whisper' | 'local';
}

export interface LocalWhisperStatus {
  available: boolean;
  /** 已安装的模型文件名，例如 ggml-small-q5_1.bin。 */
  model?: string;
  /** 模型目录，便于提示用户在哪里放文件。 */
  modelDir?: string;
  error?: string;
}

export interface VoiceProbeResult {
  cloud: { configured: boolean; baseURL: string; model: string };
  whisper: LocalWhisperStatus;
  local: { available: boolean; cultures: string[]; error?: string };
}

export type ChatRole = 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  document?: string;
}

export interface AISettings {
  provider: AIProvider;
  baseURL: string;
  model: string;
  apiKey: string;
  asr: ASRSettings;
}

export const ASR_LANGUAGES: readonly ASRLanguage[] = ['zh', 'en', 'auto'];

export const ASR_LANGUAGE_LABELS: Record<ASRLanguage, string> = {
  zh: '中文',
  en: 'English',
  auto: '自动',
};

export function isASRLanguage(value: unknown): value is ASRLanguage {
  return typeof value === 'string' && (ASR_LANGUAGES as readonly string[]).includes(value);
}

export const DEFAULT_ASR_MODEL = 'whisper-1';

export interface FileOpenResult {
  canceled: boolean;
  filePath?: string;
  content?: string;
  error?: string;
}

export interface FileSaveRequest {
  filePath: string | null;
  content: string;
}

export interface FileSaveResult {
  canceled: boolean;
  filePath?: string;
  error?: string;
}

export interface ExportDataRequest {
  defaultPath: string;
  filters: { name: string; extensions: string[] }[];
  data: string;
  encoding: 'utf8' | 'base64';
}

export const MENU_COMMANDS = [
  'file:new',
  'file:open',
  'file:save',
  'file:save-as',
  'file:export-html',
  'file:export-pdf',
  'file:export-png',
  'file:export-jpeg',
  'file:export-docx',
  'app:settings',
  'view:mode-ir',
  'view:mode-sv',
  'ai:polish',
  'ai:summarize',
  'ai:expand',
  'ai:translateToChinese',
  'ai:translateToEnglish',
] as const;

export type MenuCommand = (typeof MENU_COMMANDS)[number];

export function isMenuCommand(value: unknown): value is MenuCommand {
  return typeof value === 'string' && (MENU_COMMANDS as readonly string[]).includes(value);
}

export interface DesktopApi {
  invokeAI: (payload: AIRequest) => Promise<AIResponse>;
  chatAI: (payload: ChatRequest) => Promise<AIResponse>;
  transcribeAudio: (payload: TranscribeRequest) => Promise<TranscribeResponse>;
  probeVoiceInput: () => Promise<VoiceProbeResult>;
  testConnection: (settings: AISettings) => Promise<AIResponse>;
  getSettings: () => Promise<AISettings>;
  setSettings: (settings: AISettings) => Promise<AISettings>;
  openFile: () => Promise<FileOpenResult>;
  saveFile: (payload: FileSaveRequest) => Promise<FileSaveResult>;
  saveFileAs: (content: string) => Promise<FileSaveResult>;
  exportData: (payload: ExportDataRequest) => Promise<FileSaveResult>;
  exportPdf: (html: string) => Promise<FileSaveResult>;
  exportDocx: (html: string) => Promise<FileSaveResult>;
  setTitle: (title: string) => Promise<void>;
  openExternal: (url: string) => Promise<void>;
  onMenuCommand: (callback: (command: MenuCommand) => void) => () => void;
}

export const AI_PRESETS: Record<AIProvider, { label: string; baseURL: string; model: string }> = {
  deepseek: {
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    model: 'deepseek-flash',
  },
  openai: {
    label: 'OpenAI 兼容',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  ollama: {
    label: 'Ollama 本地',
    baseURL: 'http://127.0.0.1:11434/v1',
    model: 'llama3.2',
  },
  custom: {
    label: '自定义',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
};

export const AI_INSTRUCTIONS: readonly AIInstruction[] = [
  'polish',
  'summarize',
  'expand',
  'translateToChinese',
  'translateToEnglish',
];

export function isAIInstruction(value: unknown): value is AIInstruction {
  return typeof value === 'string' && (AI_INSTRUCTIONS as readonly string[]).includes(value);
}

export function isAIProvider(value: unknown): value is AIProvider {
  return value === 'deepseek' || value === 'openai' || value === 'ollama' || value === 'custom';
}

export function providerNeedsApiKey(provider: AIProvider): boolean {
  return provider !== 'ollama';
}
