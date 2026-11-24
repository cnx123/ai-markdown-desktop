import { app } from 'electron';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ASRSettings, LocalWhisperStatus } from '../shared/ipc';

/**
 * 本机 whisper.cpp 引擎。
 *
 * 目录约定（默认放在 app.getPath('userData')/models/whisper）：
 *   bin/Release/whisper-cli.exe   —— whisper.cpp 官方 Windows 预编译包解压后的 Release 目录
 *   ggml-small-q5_1.bin           —— 中文识别效果与体积的平衡点（约 180MB）
 *
 * 可用环境变量覆盖：
 *   WHISPER_BIN_DIR   直接指向包含 whisper-cli.exe 的目录
 *   WHISPER_MODEL_PATH 直接指向 .bin 模型文件
 */

const BINARY_NAMES = ['whisper-cli.exe', 'main.exe'];
const MODEL_CANDIDATES = ['ggml-small-q5_1.bin', 'ggml-small.bin', 'ggml-base.bin', 'ggml-base-q5_1.bin'];
const DEFAULT_TIMEOUT_MS = 90_000;

export interface WhisperPaths {
  binary: string | null;
  model: string | null;
  root: string;
}

export function whisperRoot(): string {
  return path.join(app.getPath('userData'), 'models', 'whisper');
}

/** 开发态 / 打包态 / 冒烟脚本的 userData 目录名不一样，这里并列几个常见位置。 */
function candidateRoots(): string[] {
  const roots = [whisperRoot()];
  const appData = process.env.APPDATA;
  if (appData) {
    roots.push(path.join(appData, 'ai-markdown-desktop', 'models', 'whisper'));
    roots.push(path.join(appData, 'AI Markdown Editor', 'models', 'whisper'));
  }
  return Array.from(new Set(roots));
}

function firstExisting(paths: Array<string | null>): string | null {
  for (const candidate of paths) {
    if (!candidate) continue;
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // 继续尝试下一个候选
    }
  }
  return null;
}

function binaryIn(root: string, envBinDir?: string | null): string | null {
  const dirs = [envBinDir || null, path.join(root, 'bin', 'Release'), path.join(root, 'bin'), root].filter(
    (item): item is string => Boolean(item),
  );
  return firstExisting(dirs.flatMap((dir) => BINARY_NAMES.map((name) => path.join(dir, name))));
}

function modelIn(root: string, envModel?: string | null): string | null {
  const candidates = envModel ? [envModel, ...MODEL_CANDIDATES.map((name) => path.join(root, name))] : MODEL_CANDIDATES.map((name) => path.join(root, name));
  return firstExisting(candidates);
}

export function resolveWhisperPaths(): WhisperPaths {
  const envBinDir = process.env.WHISPER_BIN_DIR?.trim() || null;
  const envModel = process.env.WHISPER_MODEL_PATH?.trim() || null;

  let fallback: WhisperPaths | null = null;
  for (const root of candidateRoots()) {
    const paths = { binary: binaryIn(root, envBinDir), model: modelIn(root, envModel), root };
    if (paths.binary && paths.model) return paths;
    if (!fallback && (paths.binary || paths.model)) fallback = paths;
  }
  return fallback ?? { binary: binaryIn(whisperRoot(), envBinDir), model: modelIn(whisperRoot(), envModel), root: whisperRoot() };
}

export function probeLocalWhisper(): LocalWhisperStatus {
  if (process.platform !== 'win32') {
    return { available: false, error: '本机 whisper 目前仅在 Windows 上可用。' };
  }
  const { binary, model, root } = resolveWhisperPaths();
  if (!binary && !model) {
    return { available: false, modelDir: root, error: '未安装本机 whisper。' };
  }
  if (!binary) {
    return { available: false, modelDir: root, error: '缺少 whisper-cli.exe，请重新解压 whisper.cpp 预编译包。' };
  }
  if (!model) {
    return { available: false, modelDir: root, error: '缺少 ggml 模型文件（如 ggml-small-q5_1.bin）。' };
  }
  return { available: true, model: path.basename(model), modelDir: root };
}

interface RunResult {
  text: string;
  stderr: string;
  code: number | null;
  timedOut: boolean;
  elapsedMs: number;
}

function runWhisper(binary: string, args: string[], timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    let stderr = '';
    let stdout = '';
    let timedOut = false;
    let pump: ReturnType<typeof spawn>;

    try {
      pump = spawn(binary, args, { windowsHide: true });
    } catch (error) {
      resolve({ text: '', stderr: String(error), code: null, timedOut: false, elapsedMs: 0 });
      return;
    }

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
      resolve({ text: stdout, stderr: String(error), code: null, timedOut, elapsedMs: Date.now() - started });
    });
    pump.on('close', (code) => {
      clearTimeout(timer);
      resolve({ text: stdout, stderr, code, timedOut, elapsedMs: Date.now() - started });
    });
  });
}

/** whisper 偶尔输出空白行与时间戳残留，这里统一清洗成单行文本。 */
function normalizeTranscript(raw: string): string {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\[[^\]]*\]\s*/, '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const ASCII_TO_FULLWIDTH: Record<string, string> = {
  ',': '，',
  '.': '。',
  '?': '？',
  '!': '！',
  ':': '：',
  ';': '；',
  '(': '（',
  ')': '）',
};

/** whisper 中文输出常见半角标点，紧贴汉字时换成全角更符合书写习惯。 */
function normalizeChinesePunctuation(text: string): string {
  return text
    .replace(/([\u4e00-\u9fff])\s*([,;:!?])/g, (_match, han: string, mark: string) => han + ASCII_TO_FULLWIDTH[mark])
    .replace(/([,;:!?])\s*([\u4e00-\u9fff])/g, (_match, mark: string, han: string) => ASCII_TO_FULLWIDTH[mark] + han);
}

type Converter = (text: string) => string;
let simplifiedConverter: Converter | null = null;

/** whisper 对中文经常输出繁体，加载 opencc 做繁→简（首次调用才载入字典，避免拖慢启动）。 */
async function toSimplified(text: string): Promise<string> {
  if (!simplifiedConverter) {
    try {
      const opencc = await import('opencc-js');
      simplifiedConverter = opencc.Converter({ from: 't', to: 'cn' });
    } catch (error) {
      console.warn(`繁简转换不可用，返回原始文本：${String(error)}`);
      return text;
    }
  }
  return simplifiedConverter(text);
}

export interface WhisperTranscription {
  ok: boolean;
  text?: string;
  error?: string;
  elapsedMs?: number;
}

export async function transcribeWithWhisper(buffer: Buffer, language: ASRSettings['language']): Promise<WhisperTranscription> {
  const { binary, model } = resolveWhisperPaths();
  if (!binary || !model) {
    return { ok: false, error: '本机 whisper 未安装完成，请运行 npm run asr:setup 下载模型。' };
  }

  const workId = crypto.randomUUID();
  const wavPath = path.join(app.getPath('temp'), `ai-markdown-voice-${workId}.wav`);
  const outBase = path.join(app.getPath('temp'), `ai-markdown-voice-${workId}`);
  await fsPromises.writeFile(wavPath, buffer);

  // whisper.cpp 在 8 线程左右接近边际收益，留一半给 UI 进程。
  const threads = Math.max(2, Math.min(8, Math.floor(os.cpus().length / 2)));
  const args = [
    '-m', model,
    '-f', wavPath,
    '-l', language === 'auto' ? 'auto' : language,
    '-t', String(threads),
    '-nt',
    '-np',
    '-otxt',
    '-of', outBase,
    '--temperature', '0',
    // 引导模型输出简体中文 + 标点，明显减少断句和漏标点。
    '--prompt', language === 'en' ? 'Transcribe the following English speech with punctuation.' : '以下是普通话的句子，请使用简体中文并加上标点。',
  ];

  try {
    const result = await runWhisper(binary, args, DEFAULT_TIMEOUT_MS);
    if (result.timedOut) {
      return { ok: false, error: '本机 whisper 转写超时，请缩短录音后重试。' };
    }
    if (result.code !== 0) {
      const detail = result.stderr.trim().split(/\r?\n/).slice(-1)[0]?.slice(0, 200) ?? '';
      return { ok: false, error: `本机 whisper 运行失败${detail ? `：${detail}` : '。'}` };
    }

    let text = '';
    try {
      text = normalizeTranscript(await fsPromises.readFile(`${outBase}.txt`, 'utf8'));
    } catch {
      text = normalizeTranscript(result.text);
    }
    if (!text) return { ok: false, error: '没听清，请靠近麦克风再说一次。' };
    if (language !== 'en') {
      text = normalizeChinesePunctuation(await toSimplified(text));
    }
    return { ok: true, text, elapsedMs: result.elapsedMs };
  } finally {
    await fsPromises.unlink(wavPath).catch(() => undefined);
    await fsPromises.unlink(`${outBase}.txt`).catch(() => undefined);
  }
}
