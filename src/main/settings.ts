import { app, safeStorage } from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  AI_PRESETS,
  DEFAULT_ASR_MODEL,
  isAIProvider,
  isASRLanguage,
  type AIProvider,
  type AISettings,
  type ASRSettings,
} from '../shared/ipc';

interface StoredASR {
  baseURL?: string;
  model?: string;
  language?: string;
  apiKey?: string;
  apiKeyProtected?: string;
}

interface StoredSettings {
  provider: AIProvider;
  baseURL: string;
  model: string;
  apiKey?: string;
  apiKeyProtected?: string;
  asr?: StoredASR;
}

interface ProtectedKey {
  apiKey?: string;
  apiKeyProtected?: string;
}

function configPath(): string {
  return path.join(app.getPath('userData'), 'ai-settings.json');
}

function assertBaseUrl(baseURL: string): string {
  let parsed: URL;
  try {
    parsed = new URL(baseURL);
  } catch {
    throw new Error('接口地址不是合法的 URL。');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('接口地址只允许 http 或 https。');
  }
  return baseURL.replace(/\/+$/, '');
}

function normalizeAsr(input: Partial<ASRSettings> | undefined, fallback: ASRSettings): ASRSettings {
  const rawBaseURL = typeof input?.baseURL === 'string' ? input.baseURL.trim() : fallback.baseURL;
  const baseURL = rawBaseURL ? assertBaseUrl(rawBaseURL) : '';
  const model = (typeof input?.model === 'string' ? input.model.trim() : fallback.model) || (baseURL ? DEFAULT_ASR_MODEL : '');
  const apiKey = typeof input?.apiKey === 'string' ? input.apiKey : fallback.apiKey;
  const language = isASRLanguage(input?.language) ? input.language : fallback.language;
  return { baseURL, model, apiKey, language };
}

export function normalizeSettings(input: AISettings): AISettings {
  if (!isAIProvider(input?.provider)) throw new Error('不支持的服务类型。');
  const model = typeof input.model === 'string' ? input.model.trim() : '';
  const baseURL = typeof input.baseURL === 'string' ? input.baseURL.trim() : '';
  const apiKey = typeof input.apiKey === 'string' ? input.apiKey : '';
  if (!baseURL) throw new Error('请填写接口地址。');
  if (!model) throw new Error('请填写模型名称。');
  return {
    provider: input.provider,
    baseURL: assertBaseUrl(baseURL),
    model,
    apiKey,
    asr: normalizeAsr(input.asr, envAsrDefaults()),
  };
}

function protectKey(apiKey: string): ProtectedKey {
  if (!apiKey) return { apiKey: '' };
  if (safeStorage.isEncryptionAvailable()) {
    return { apiKeyProtected: safeStorage.encryptString(apiKey).toString('base64') };
  }
  return { apiKey };
}

function revealKey(stored: ProtectedKey): string {
  if (stored.apiKeyProtected) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.apiKeyProtected, 'base64'));
    } catch (error) {
      console.error('解密 API Key 失败');
      return '';
    }
  }
  return stored.apiKey ?? '';
}

function envProvider(): AIProvider {
  return isAIProvider(process.env.AI_PROVIDER) ? process.env.AI_PROVIDER : 'deepseek';
}

export function envAsrDefaults(): ASRSettings {
  return {
    baseURL: (process.env.ASR_BASE_URL || '').trim(),
    model: (process.env.ASR_MODEL || DEFAULT_ASR_MODEL).trim(),
    apiKey: process.env.ASR_API_KEY || '',
    language: isASRLanguage(process.env.ASR_LANGUAGE) ? process.env.ASR_LANGUAGE : 'zh',
  };
}

function envDefaults(): AISettings {
  const provider = envProvider();
  const preset = AI_PRESETS[provider];
  return {
    provider,
    baseURL: (process.env.AI_BASE_URL || process.env.OPENAI_BASE_URL || preset.baseURL).trim(),
    model: (process.env.AI_MODEL || process.env.OPENAI_MODEL || preset.model).trim(),
    apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY || '',
    asr: envAsrDefaults(),
  };
}

async function readStored(): Promise<AISettings | null> {
  try {
    const raw = await fs.readFile(configPath(), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<StoredSettings>;
    if (!isAIProvider(parsed.provider) || typeof parsed.baseURL !== 'string' || typeof parsed.model !== 'string') {
      return null;
    }
    const asrDefaults = envAsrDefaults();
    const storedAsr = parsed.asr;
    return {
      provider: parsed.provider,
      baseURL: parsed.baseURL,
      model: parsed.model,
      apiKey: revealKey(parsed),
      asr: {
        baseURL: typeof storedAsr?.baseURL === 'string' ? storedAsr.baseURL : asrDefaults.baseURL,
        model: typeof storedAsr?.model === 'string' ? storedAsr.model : asrDefaults.model,
        language: isASRLanguage(storedAsr?.language) ? storedAsr.language : asrDefaults.language,
        apiKey: storedAsr ? revealKey(storedAsr) : asrDefaults.apiKey,
      },
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') console.error('读取 AI 配置失败');
    return null;
  }
}

export async function getSettings(): Promise<AISettings> {
  return (await readStored()) ?? envDefaults();
}

export async function ensureDefaultSettings(): Promise<AISettings> {
  const stored = await readStored();
  const defaults = envDefaults();
  if (!stored || (stored.provider !== 'deepseek' && !stored.apiKey.trim())) {
    return setSettings(defaults);
  }
  return stored;
}

export async function setSettings(input: AISettings): Promise<AISettings> {
  const next = normalizeSettings(input);
  const stored: StoredSettings = {
    provider: next.provider,
    baseURL: next.baseURL,
    model: next.model,
    ...protectKey(next.apiKey),
    asr: {
      baseURL: next.asr.baseURL,
      model: next.asr.model,
      language: next.asr.language,
      ...protectKey(next.asr.apiKey),
    },
  };
  await fs.mkdir(path.dirname(configPath()), { recursive: true });
  await fs.writeFile(configPath(), JSON.stringify(stored, null, 2), 'utf-8');
  return next;
}
