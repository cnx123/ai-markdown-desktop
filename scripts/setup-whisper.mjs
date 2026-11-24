#!/usr/bin/env node
/**
 * 一键安装「本机 whisper」语音识别资源（Windows）。
 *
 *   npm run asr:setup
 *
 * 会做两件事：
 *   1. 下载 whisper.cpp 官方 Windows 预编译包，解压到 models/whisper/bin
 *   2. 下载 ggml 中文模型（默认 small-q5_1，约 180MB）到 models/whisper
 *
 * 国内网络可直接用镜像：
 *   set WHISPER_MODEL_URL=https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin
 *   set WHISPER_BIN_URL=https://gh-proxy.com/https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.0/whisper-bin-x64.zip
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';

const APP_DIR_NAME = 'ai-markdown-desktop';
const DEFAULT_MODEL = 'ggml-small-q5_1.bin';
const BIN_ZIP = 'whisper-bin-x64.zip';

const DEFAULT_BIN_URL = 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.0/whisper-bin-x64.zip';
const MODEL_URLS = process.env.WHISPER_MODEL_URL
  ? [process.env.WHISPER_MODEL_URL]
  : [
      'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin',
      'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin',
    ];

function targetDir() {
  const base = process.platform === 'win32' ? process.env.APPDATA : process.env.HOME;
  if (!base) throw new Error('无法确定用户目录（APPDATA/HOME 为空）。');
  return path.join(base, APP_DIR_NAME, 'models', 'whisper');
}

function download(url, destination, attempt = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'ai-markdown-desktop' } }, (response) => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode) && response.headers.location) {
        response.resume();
        const next = new URL(response.headers.location, url).toString();
        download(next, destination, attempt + 1).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      const total = Number(response.headers['content-length'] ?? 0);
      const temp = `${destination}.part`;
      const stream = fs.createWriteStream(temp);
      let received = 0;
      let lastPercent = -1;

      response.on('data', (chunk) => {
        received += chunk.length;
        if (total > 0) {
          const percent = Math.floor((received / total) * 100);
          if (percent >= lastPercent + 10) {
            lastPercent = percent;
            process.stdout.write(`\r  下载 ${path.basename(destination)} ${percent}% (${(received / 1048576).toFixed(1)}/${(total / 1048576).toFixed(1)} MB)`);
          }
        }
      });
      response.pipe(stream);
      stream.on('finish', () => {
        stream.close(() => {
          process.stdout.write('\n');
          fs.renameSync(temp, destination);
          resolve(destination);
        });
      });
      stream.on('error', reject);
    });
    request.on('error', reject);
    request.setTimeout(60_000, () => request.destroy(new Error('连接超时')));
  });
}

async function downloadWithFallback(urls, destination) {
  let lastError = null;
  for (const url of urls) {
    try {
      console.log(`  来源：${url}`);
      await download(url, destination);
      return;
    } catch (error) {
      lastError = error;
      console.warn(`  失败：${error.message}，尝试下一个来源…`);
      fs.rmSync(`${destination}.part`, { force: true });
    }
  }
  throw lastError ?? new Error('没有可用的下载地址');
}

async function main() {
  if (process.platform !== 'win32') {
    console.log('本机 whisper 目前只支持 Windows，macOS / Linux 请改用云端转写接口。');
    return;
  }

  const dir = targetDir();
  fs.mkdirSync(dir, { recursive: true });
  console.log(`安装目录：${dir}`);

  // 1. 二进制
  const binDir = path.join(dir, 'bin');
  const cliCandidates = [path.join(binDir, 'Release', 'whisper-cli.exe'), path.join(binDir, 'whisper-cli.exe')];
  if (cliCandidates.some((item) => fs.existsSync(item))) {
    console.log('✓ whisper-cli.exe 已存在，跳过下载');
  } else {
    const zipPath = path.join(dir, BIN_ZIP);
    console.log('· 下载 whisper.cpp 预编译包');
    await downloadWithFallback([process.env.WHISPER_BIN_URL || DEFAULT_BIN_URL], zipPath);
    console.log('· 解压…');
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${binDir}' -Force`],
      { stdio: 'inherit' },
    );
    if (result.status !== 0) throw new Error('解压失败，请手动解压 zip 到 bin 目录。');
    fs.rmSync(zipPath, { force: true });
    console.log('✓ whisper-cli.exe 就绪');
  }

  // 2. 模型
  const modelPath = path.join(dir, process.env.WHISPER_MODEL_FILE || DEFAULT_MODEL);
  if (fs.existsSync(modelPath) && fs.statSync(modelPath).size > 100 * 1024 * 1024) {
    console.log(`✓ 模型已存在：${path.basename(modelPath)}`);
  } else {
    console.log('· 下载 ggml 模型（约 180MB，视网络可能几分钟）');
    await downloadWithFallback(MODEL_URLS, modelPath);
    console.log(`✓ 模型就绪：${path.basename(modelPath)}`);
  }

  console.log('\n完成。重启应用后，「设置 - 语音转写」会显示：当前使用：本机 whisper。');
}

main().catch((error) => {
  console.error(`\n安装失败：${error.message}`);
  console.error('可手动下载后放到上述目录：whisper-bin-x64.zip 解压到 bin/，ggml-*.bin 放在模型根目录。');
  process.exitCode = 1;
});
