import { useCallback, useEffect, useRef, useState } from 'react';
import { getApi } from '../lib/api';
import { encodeWavBase64, mergeChunks, resampleTo16k, rms } from '../lib/wav';

export type VoiceStatus = 'idle' | 'recording' | 'transcribing';

interface UseVoiceInputOptions {
  onText: (text: string) => void;
  enabled?: boolean;
}

const MAX_RECORD_MS = 60_000;
const MIN_RECORD_MS = 700;
const SILENCE_RMS = 0.0016;
const TARGET_RATE = 16_000;

const WORKLET_SOURCE = `
class PcmCaptureProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length) {
      this.port.postMessage(new Float32Array(channel));
    }
    return true;
  }
}
registerProcessor('ai-pcm-capture', PcmCaptureProcessor);
`;

function describeMicError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return '没有麦克风权限。请在系统设置中允许应用访问麦克风后重试。';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return '没有检测到麦克风，请先连接麦克风设备。';
      case 'NotReadableError':
        return '麦克风被其他程序占用，请关闭占用它的应用后重试。';
      case 'OverconstrainedError':
        return '麦克风不支持当前录音参数，请更换设备后重试。';
      default:
        return error.message || '麦克风启动失败。';
    }
  }
  if (error instanceof Error) return error.message;
  return '麦克风启动失败。';
}

export function useVoiceInput({ onText, enabled = true }: UseVoiceInputOptions) {
  const [status, setStatus] = useState<VoiceStatus>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const statusRef = useRef<VoiceStatus>('idle');
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const nodeRef = useRef<AudioWorkletNode | null>(null);
  const chunksRef = useRef<Float32Array[]>([]);
  const levelRef = useRef(0);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const noticeTimerRef = useRef<number | null>(null);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice(null);
      noticeTimerRef.current = null;
    }, 3200);
  }, []);

  const stopTick = useCallback(() => {
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const closeAudio = useCallback(async () => {
    const node = nodeRef.current;
    nodeRef.current = null;
    if (node) {
      node.port.onmessage = null;
      try {
        node.disconnect();
      } catch {
        /* 已经断开时忽略 */
      }
    }
    const context = contextRef.current;
    contextRef.current = null;
    if (context) {
      try {
        await context.close();
      } catch {
        /* 关闭失败不影响后续 */
      }
    }
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
  }, []);

  const resetMeter = useCallback(() => {
    levelRef.current = 0;
    setLevel(0);
    setElapsedMs(0);
  }, []);

  const finish = useCallback(async () => {
    if (statusRef.current !== 'recording') return;
    statusRef.current = 'transcribing';
    setStatus('transcribing');
    stopTick();

    const startedAt = startedAtRef.current;
    const durationMs = startedAt ? Date.now() - startedAt : 0;
    const sampleRate = contextRef.current?.sampleRate ?? TARGET_RATE;
    await closeAudio();
    const chunks = chunksRef.current;
    chunksRef.current = [];
    resetMeter();

    const merged = mergeChunks(chunks);
    if (durationMs < MIN_RECORD_MS || merged.length < sampleRate * 0.2) {
      setError('录音太短了，请点击麦克风后多说一会儿。');
      statusRef.current = 'idle';
      setStatus('idle');
      return;
    }
    if (rms(merged) < SILENCE_RMS) {
      setError('没有采集到声音，请确认麦克风没被静音后再试。');
      statusRef.current = 'idle';
      setStatus('idle');
      return;
    }

    const resampled = resampleTo16k(merged, sampleRate);
    const { base64, durationMs: wavDuration } = encodeWavBase64(resampled, TARGET_RATE);

    try {
      const result = await getApi().transcribeAudio({
        audioBase64: base64,
        mimeType: 'audio/wav',
        durationMs: Math.round(wavDuration),
      });
      if (result.success && result.data) {
        setError(null);
        onTextRef.current(result.data);
        showNotice(
          result.engine === 'cloud' ? '已转写 · 云端识别' : result.engine === 'whisper' ? '已转写 · 本机 whisper' : '已转写 · 本机识别',
        );
      } else {
        setError(result.error || '语音转写失败，请再试一次。');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '语音转写失败，请再试一次。');
    } finally {
      statusRef.current = 'idle';
      setStatus('idle');
      setElapsedMs(0);
    }
  }, [closeAudio, resetMeter, showNotice, stopTick]);

  const start = useCallback(async () => {
    if (statusRef.current !== 'idle' || !enabled) return;
    setError(null);
    setNotice(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('当前环境不支持录音，请通过 Electron 窗口运行应用。');
      return;
    }
    if (typeof getApi().transcribeAudio !== 'function') {
      setError('当前窗口还没有加载语音能力，请重启应用。');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const context = new AudioContext();
      await context.resume();
      const workletUrl = URL.createObjectURL(new Blob([WORKLET_SOURCE], { type: 'application/javascript' }));
      try {
        await context.audioWorklet.addModule(workletUrl);
      } finally {
        URL.revokeObjectURL(workletUrl);
      }

      const source = context.createMediaStreamSource(stream);
      const node = new AudioWorkletNode(context, 'ai-pcm-capture', {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        channelCount: 1,
      });
      node.port.onmessage = (event: MessageEvent<Float32Array>) => {
        const samples = event.data;
        if (!samples || samples.length === 0) return;
        chunksRef.current.push(samples);
        const next = Math.min(1, rms(samples) * 8);
        if (next > levelRef.current) levelRef.current = next;
      };

      source.connect(node);
      // 处理器不写输出，接到 destination 只会得到静音，但能保证节点持续被调度。
      node.connect(context.destination);

      streamRef.current = stream;
      contextRef.current = context;
      nodeRef.current = node;
      chunksRef.current = [];
      levelRef.current = 0;
      startedAtRef.current = Date.now();
      statusRef.current = 'recording';
      setStatus('recording');
      setElapsedMs(0);

      stopTick();
      tickRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startedAtRef.current;
        setElapsedMs(elapsed);
        setLevel(levelRef.current);
        levelRef.current *= 0.6;
        if (elapsed >= MAX_RECORD_MS) void finish();
      }, 110);
    } catch (err) {
      await closeAudio();
      chunksRef.current = [];
      resetMeter();
      statusRef.current = 'idle';
      setStatus('idle');
      setError(describeMicError(err));
    }
  }, [closeAudio, enabled, finish, resetMeter, stopTick]);

  const toggle = useCallback(() => {
    if (statusRef.current === 'idle') {
      void start();
    } else if (statusRef.current === 'recording') {
      void finish();
    }
  }, [finish, start]);

  const cancel = useCallback(() => {
    if (statusRef.current !== 'recording') return;
    stopTick();
    void closeAudio();
    chunksRef.current = [];
    resetMeter();
    statusRef.current = 'idle';
    setStatus('idle');
    setNotice(null);
  }, [closeAudio, resetMeter, stopTick]);

  useEffect(() => {
    return () => {
      stopTick();
      if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
      statusRef.current = 'idle';
      void closeAudio();
    };
  }, [closeAudio, stopTick]);

  return {
    status,
    elapsedMs,
    level,
    error,
    notice,
    toggle,
    cancel,
    clearError: () => setError(null),
  };
}
