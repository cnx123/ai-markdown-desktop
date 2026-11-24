import React, { useEffect, useState } from 'react';
import {
  AI_PRESETS,
  ASR_LANGUAGES,
  ASR_LANGUAGE_LABELS,
  DEFAULT_ASR_MODEL,
  type AIProvider,
  type AISettings,
  type ASRSettings,
  type VoiceProbeResult,
} from '../../shared/ipc';
import { getApi } from '../lib/api';
import { useEditorStore } from '../stores/editorStore';
import './SettingsDialog.css';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
}

const emptySettings: AISettings = {
  provider: 'deepseek',
  baseURL: AI_PRESETS.deepseek.baseURL,
  model: AI_PRESETS.deepseek.model,
  apiKey: '',
  asr: {
    baseURL: '',
    model: DEFAULT_ASR_MODEL,
    apiKey: '',
    language: 'zh',
  },
};

const SettingsDialog: React.FC<SettingsDialogProps> = ({ open, onClose }) => {
  const [form, setForm] = useState<AISettings>(emptySettings);
  const [showKey, setShowKey] = useState(false);
  const [showAsrKey, setShowAsrKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<string | null>(null);
  const [probe, setProbe] = useState<VoiceProbeResult | null>(null);
  const [probeLoading, setProbeLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    setTestMessage(null);
    void getApi()
      .getSettings()
      .then((settings) => {
        if (!cancelled) setForm(settings);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '读取设置失败');
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setProbe(null);
    setProbeLoading(true);
    void getApi()
      .probeVoiceInput()
      .then((result) => {
        if (!cancelled) setProbe(result);
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setProbeLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const update = (patch: Partial<AISettings>) => {
    setForm((current) => ({ ...current, ...patch }));
    setTestMessage(null);
  };

  const updateAsr = (patch: Partial<ASRSettings>) => {
    setForm((current) => ({ ...current, asr: { ...current.asr, ...patch } }));
    setTestMessage(null);
  };

  const onProvider = (provider: AIProvider) => {
    if (provider === 'custom') {
      update({ provider });
      return;
    }
    update({
      provider,
      baseURL: AI_PRESETS[provider].baseURL,
      model: AI_PRESETS[provider].model,
    });
  };

  const save = async () => {
    setError(null);
    try {
      await getApi().setSettings(form);
      useEditorStore.getState().setStatusMessage('AI 设置已保存到本机');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    }
  };

  const test = async () => {
    setTesting(true);
    setError(null);
    setTestMessage(null);
    try {
      const result = await getApi().testConnection(form);
      if (result.success) setTestMessage('连接成功');
      else setError(result.error || '连接失败');
    } catch (err) {
      setError(err instanceof Error ? err.message : '连接失败');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="overlay" role="presentation" onMouseDown={onClose}>
      <div
        className="settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="settings-title">模型设置</h2>
          <p>默认使用 DeepSeek（deepseek-flash）。也可切换 OpenAI 兼容接口或本机 Ollama。</p>
        </header>
        <div className="settings-form">
          <label>
            服务
            <select value={form.provider} onChange={(event) => onProvider(event.target.value as AIProvider)}>
              {(Object.keys(AI_PRESETS) as AIProvider[]).map((provider) => (
                <option key={provider} value={provider}>
                  {AI_PRESETS[provider].label}
                </option>
              ))}
            </select>
          </label>
          <label>
            接口地址
            <input value={form.baseURL} onChange={(event) => update({ baseURL: event.target.value })} spellCheck={false} />
          </label>
          <label>
            模型
            <input value={form.model} onChange={(event) => update({ model: event.target.value })} spellCheck={false} />
          </label>
          <label>
            API Key
            <span className="key-row">
              <input
                type={showKey ? 'text' : 'password'}
                value={form.apiKey}
                onChange={(event) => update({ apiKey: event.target.value })}
                spellCheck={false}
                autoComplete="off"
              />
              <button type="button" onClick={() => setShowKey((value) => !value)}>
                {showKey ? '隐藏' : '显示'}
              </button>
            </span>
          </label>
          <p className="settings-note">密钥保存在本机用户目录，系统支持时会加密。DeepSeek / OpenAI 需要密钥，Ollama 可以留空。测试不会自动保存。</p>

          <div className="settings-divider" />
          <div className="settings-sub-head">
            <strong>语音转写</strong>
            <span
              className={
                probe?.cloud.configured || probe?.whisper.available ? 'settings-ok' : probe?.local.available ? 'settings-ok' : 'settings-note'
              }
            >
              {probeLoading
                ? '检测中…'
                : probe
                  ? probe.cloud.configured
                    ? '当前使用：云端接口'
                    : probe.whisper.available
                      ? `当前使用：本机 whisper（${probe.whisper.model}）`
                      : probe.local.available
                        ? `当前使用：Windows 本机（${probe.local.cultures.join(' / ')}）`
                        : '没有可用的识别引擎'
                  : ''}
            </span>
          </div>
          <p className="settings-note">
            引擎优先级：云端接口 → 本机 whisper → Windows 本机识别。
            {probe && !probe.whisper.available
              ? ` 本机 whisper 未就绪：${probe.whisper.error ?? '未安装'}${probe.whisper.modelDir ? `（模型目录 ${probe.whisper.modelDir}）` : ''}`
              : ''}
          </p>
          <label>
            转写接口地址（可选）
            <input
              value={form.asr.baseURL}
              placeholder="留空使用本机识别；如 https://api.openai.com/v1"
              onChange={(event) => updateAsr({ baseURL: event.target.value })}
              spellCheck={false}
            />
          </label>
          <label>
            转写模型
            <input
              value={form.asr.model}
              placeholder={DEFAULT_ASR_MODEL}
              onChange={(event) => updateAsr({ model: event.target.value })}
              spellCheck={false}
            />
          </label>
          <label>
            识别语言
            <select
              value={form.asr.language}
              onChange={(event) => updateAsr({ language: event.target.value as ASRSettings['language'] })}
            >
              {ASR_LANGUAGES.map((language) => (
                <option key={language} value={language}>
                  {ASR_LANGUAGE_LABELS[language]}
                </option>
              ))}
            </select>
          </label>
          <label>
            转写 API Key（可选）
            <span className="key-row">
              <input
                type={showAsrKey ? 'text' : 'password'}
                value={form.asr.apiKey}
                placeholder="留空复用上面的 AI Key"
                onChange={(event) => updateAsr({ apiKey: event.target.value })}
                spellCheck={false}
                autoComplete="off"
              />
              <button type="button" onClick={() => setShowAsrKey((value) => !value)}>
                {showAsrKey ? '隐藏' : '显示'}
              </button>
            </span>
          </label>
          <p className="settings-note">
            留空接口地址时优先用本机 whisper（需要先运行 <code>npm run asr:setup</code> 下载模型），没有模型时回退 Windows
            自带识别引擎（中文需要系统安装 zh-CN 语音包）。填写 OpenAI 兼容的
            <code> /audio/transcriptions </code>
            接口（如 OpenAI whisper-1、硅基流动等）可显著提升准确率，Key 留空则复用上面的 AI Key。
          </p>
          {error && <p className="settings-error">{error}</p>}
          {testMessage && <p className="settings-ok">{testMessage}</p>}
        </div>
        <footer>
          <button type="button" onClick={() => void test()} disabled={testing}>
            {testing ? '测试中…' : '测试连接'}
          </button>
          <button type="button" onClick={onClose}>
            取消
          </button>
          <button type="button" className="primary" onClick={() => void save()}>
            保存
          </button>
        </footer>
      </div>
    </div>
  );
};

export default SettingsDialog;
