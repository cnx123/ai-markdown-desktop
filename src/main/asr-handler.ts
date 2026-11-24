import { app } from 'electron';
import axios from 'axios';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_ASR_MODEL,
  type ASRSettings,
  type TranscribeRequest,
  type TranscribeResponse,
  type VoiceProbeResult,
} from '../shared/ipc';
import { envAsrDefaults, getSettings, normalizeSettings } from './settings';
import { probeLocalWhisper, transcribeWithWhisper } from './local-whisper';

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const MAX_DURATION_MS = 120_000;
const LOCAL_TIMEOUT_MS = 30_000;
const PROBE_TTL_MS = 5 * 60_000;

const ASR_SCRIPT = `param(
  [string]$WavPath,
  [string]$Culture = "zh-CN",
  [switch]$List
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

Add-Type -AssemblyName System.Speech
$recognizers = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()

if ($List) {
  foreach ($item in $recognizers) {
    [Console]::Out.WriteLine($item.Culture.Name + "|" + $item.Name)
  }
  exit 0
}

$target = $null
if (-not [string]::IsNullOrWhiteSpace($Culture)) {
  $target = $recognizers | Where-Object { $_.Culture.Name -eq $Culture } | Select-Object -First 1
  if ($null -eq $target) {
    $prefix = $Culture.Split("-")[0] + "-"
    $target = $recognizers | Where-Object { $_.Culture.Name -like $prefix } | Select-Object -First 1
  }
}
if ($null -eq $target) {
  $target = $recognizers | Where-Object { $_.Culture.Name -eq "zh-CN" } | Select-Object -First 1
}
if ($null -eq $target) {
  $target = $recognizers | Select-Object -First 1
}
if ($null -eq $target) {
  [Console]::Error.Write("NO_RECOGNIZER")
  exit 2
}

$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($target)
try {
  $engine.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
  $engine.SetInputToWaveFile($WavPath)
  $result = $engine.Recognize()
  while ($null -ne $result) {
    [Console]::Out.WriteLine($result.Text)
    $result = $engine.Recognize()
  }
}
finally {
  $engine.Dispose()
}
`;

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

let scriptPath: string | null = null;
let localProbeCache: { at: number; value: VoiceProbeResult['local'] } | null = null;

async function ensureScript(): Promise<string> {
  if (scriptPath) return scriptPath;
  const file = path.join(app.getPath('temp'), 'ai-markdown-asr.ps1');
  await fs.writeFile(file, ASR_SCRIPT, 'utf-8');
  scriptPath = file;
  return file;
}

function runAsrScript(args: string[], timeoutMs: number): Promise<SpawnResult> {
  return new Promise((resolve) => {
    void (async () => {
      let pump: ReturnType<typeof spawn>;
      try {
        const script = await ensureScript();
        pump = spawn(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, ...args],
          { windowsHide: true },
        );
      } catch (error) {
        resolve({ code: null, stdout: '', stderr: String(error), timedOut: false });
        return;
      }

      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        pump.kill();
      }, timeoutMs);

      pump.stdout?.setEncoding('utf8');
      pump.stderr?.setEncoding('utf8');
      pump.stdout?.on('data', (chunk: string) => {
        stdout += chunk;
      });
      pump.stderr?.on('data', (chunk: string) => {
        stderr += chunk;
      });
      pump.on('error', (error) => {
        clearTimeout(timer);
        resolve({ code: null, stdout, stderr: stderr || String(error), timedOut });
      });
      pump.on('close', (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr, timedOut });
      });
    })();
  });
}

export async function probeLocalRecognizers(force = false): Promise<VoiceProbeResult['local']> {
  if (process.platform !== 'win32') {
    return { available: false, cultures: [], error: '当前系统不支持 Windows 本机识别，请配置云端转写接口。' };
  }
  if (!force && localProbeCache && Date.now() - localProbeCache.at < PROBE_TTL_MS) {
    return localProbeCache.value;
  }

  const result = await runAsrScript(['-List'], 20_000);
  const cultures = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split('|')[0]?.trim() ?? '')
    .filter(Boolean);

  const value: VoiceProbeResult['local'] = result.timedOut
    ? { available: false, cultures: [], error: '检测本机识别引擎超时。' }
    : cultures.length > 0
      ? { available: true, cultures }
      : {
          available: false,
          cultures: [],
          error:
            result.code === 2
              ? '本机没有安装语音识别引擎，请配置云端转写接口。'
              : '本机识别引擎不可用，可在「设置 - 语音转写」里配置云端接口。',
        };

  localProbeCache = { at: Date.now(), value };
  return value;
}

function transcribeUrl(baseURL: string): string {
  const trimmed = baseURL.trim().replace(/\/+$/, '');
  if (trimmed.endsWith('/audio/transcriptions')) return trimmed;
  return `${trimmed}/audio/transcriptions`;
}

function buildMultipart(fields: Record<string, string>, file: { name: string; type: string; data: Buffer }) {
  const boundary = `----aimarkdown${crypto.randomBytes(12).toString('hex')}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`, 'utf8'));
  }
  chunks.push(
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`,
      'utf8',
    ),
  );
  chunks.push(file.data);
  chunks.push(Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8'));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

function readTranscript(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const record = data as Record<string, unknown>;
  for (const key of ['text', 'transcript', 'result']) {
    if (typeof record[key] === 'string' && (record[key] as string).trim()) {
      return (record[key] as string).trim();
    }
  }
  if (record.data && typeof record.data === 'object') return readTranscript(record.data);
  return '';
}

function errorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as Record<string, unknown> | string | undefined;
    if (typeof data === 'string' && data.trim()) return data.trim().slice(0, 300);
    if (data && typeof data === 'object') {
      const nested = data.error as { message?: string } | undefined;
      if (nested?.message) return nested.message;
      if (typeof data.message === 'string') return data.message;
    }
    if (error.response?.status === 404) return '接口不存在，请检查转写接口地址，确认服务支持 /audio/transcriptions。';
    if (error.response?.status === 401 || error.response?.status === 403) return '鉴权失败，请检查转写 API Key。';
    return error.message || '网络请求失败';
  }
  if (error instanceof Error) return error.message;
  return '未知错误';
}

async function transcribeInCloud(buffer: Buffer, asr: ASRSettings, aiApiKey: string): Promise<TranscribeResponse> {
  const apiKey = (asr.apiKey || aiApiKey).trim();
  if (!apiKey) {
    return {
      success: false,
      engine: 'cloud',
      error: '云端转写需要 API Key：请在「设置 - 语音转写」里填写，或留空复用上面的 AI Key。',
    };
  }

  const fields: Record<string, string> = {
    model: asr.model || DEFAULT_ASR_MODEL,
    response_format: 'json',
    temperature: '0',
  };
  if (asr.language !== 'auto') fields.language = asr.language;

  const { body, contentType } = buildMultipart(fields, {
    name: 'audio.wav',
    type: 'audio/wav',
    data: buffer,
  });

  try {
    const response = await axios.post(transcribeUrl(asr.baseURL), body, {
      headers: {
        'Content-Type': contentType,
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 90_000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    const text = readTranscript(response.data);
    if (!text) {
      return {
        success: false,
        engine: 'cloud',
        error: '云端没有返回文字，请确认模型是否支持语音转写（如 whisper-1）。',
      };
    }
    return { success: true, data: text, engine: 'cloud' };
  } catch (error) {
    return { success: false, engine: 'cloud', error: `云端转写失败：${errorMessage(error)}` };
  }
}

async function transcribeLocally(buffer: Buffer, language: ASRSettings['language']): Promise<TranscribeResponse> {
  const probe = await probeLocalRecognizers();
  if (!probe.available) {
    return {
      success: false,
      engine: 'local',
      error:
        probe.error ??
        '本机没有可用的语音识别引擎，请在「设置 - 语音转写」里配置云端接口。',
    };
  }

  const wavPath = path.join(app.getPath('temp'), `ai-markdown-voice-${crypto.randomUUID()}.wav`);
  await fs.writeFile(wavPath, buffer);
  try {
    const culture = language === 'zh' ? 'zh-CN' : language === 'en' ? 'en-US' : '';
    const result = await runAsrScript(['-WavPath', wavPath, '-Culture', culture], LOCAL_TIMEOUT_MS);

    if (result.timedOut) {
      return { success: false, engine: 'local', error: '本机识别超时，请缩短录音后重试。' };
    }
    if (result.code === 2) {
      return {
        success: false,
        engine: 'local',
        error: '本机缺少对应语言的识别引擎，请在「设置 - 语音转写」里改用云端接口。',
      };
    }
    if (result.code !== 0) {
      const detail = result.stderr.trim().slice(0, 200);
      return { success: false, engine: 'local', error: `本机识别失败${detail ? `：${detail}` : '。'}` };
    }

    const text = result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join(language === 'en' ? ' ' : '')
      .trim();

    if (!text) {
      return { success: false, engine: 'local', error: '没听清，请靠近麦克风再说一次。' };
    }
    return { success: true, data: text, engine: 'local' };
  } finally {
    await fs.unlink(wavPath).catch(() => undefined);
  }
}

export async function transcribeAudio(payload: TranscribeRequest): Promise<TranscribeResponse> {
  try {
    if (!payload || typeof payload.audioBase64 !== 'string' || !payload.audioBase64.trim()) {
      return { success: false, error: '没有收到音频数据。' };
    }
    if (payload.mimeType !== 'audio/wav') {
      return { success: false, error: '音频格式不正确，请使用 WAV。' };
    }
    if (typeof payload.durationMs === 'number' && payload.durationMs > MAX_DURATION_MS) {
      return { success: false, error: '单次录音请不要超过 2 分钟。' };
    }

    const encoded = payload.audioBase64.replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/=]+$/.test(encoded)) {
      return { success: false, error: '音频数据格式不正确。' };
    }
    const buffer = Buffer.from(encoded, 'base64');
    if (buffer.length < 1000) {
      return { success: false, error: '录音太短了，请按住多说一会儿。' };
    }
    if (buffer.length > MAX_AUDIO_BYTES) {
      return { success: false, error: '录音文件过大，请缩短录音后重试。' };
    }
    if (buffer.length < 44 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF') {
      return { success: false, error: '音频数据损坏，请重新录音。' };
    }

    let asr: ASRSettings;
    let aiApiKey = '';
    try {
      const settings = normalizeSettings(await getSettings());
      asr = settings.asr;
      aiApiKey = settings.apiKey;
    } catch {
      asr = envAsrDefaults();
    }

    if (asr.baseURL) return transcribeInCloud(buffer, asr, aiApiKey);

    // 本机 whisper 的准确率远高于 Windows 自带 SAPI，装了就用它。
    const whisper = probeLocalWhisper();
    if (whisper.available) {
      const result = await transcribeWithWhisper(buffer, asr.language);
      if (result.ok && result.text) {
        console.log(`本机 whisper 转写完成：${result.elapsedMs ?? 0}ms`);
        return { success: true, data: result.text, engine: 'whisper' };
      }
      console.warn(`本机 whisper 转写失败，回退 Windows 识别：${result.error ?? '未知原因'}`);
    }

    return transcribeLocally(buffer, asr.language);
  } catch (error) {
    console.error('语音转写失败:', errorMessage(error));
    return { success: false, error: `语音转写失败：${errorMessage(error)}` };
  }
}

export async function probeVoiceInput(): Promise<VoiceProbeResult> {
  let asr: ASRSettings;
  let aiApiKey = '';
  try {
    const settings = normalizeSettings(await getSettings());
    asr = settings.asr;
    aiApiKey = settings.apiKey;
  } catch {
    asr = envAsrDefaults();
  }

  const local = await probeLocalRecognizers();
  return {
    cloud: {
      configured: Boolean(asr.baseURL && (asr.apiKey.trim() || aiApiKey.trim())),
      baseURL: asr.baseURL,
      model: asr.model,
    },
    whisper: probeLocalWhisper(),
    local,
  };
}
