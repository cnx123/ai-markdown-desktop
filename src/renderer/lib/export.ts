import html2canvas from 'html2canvas';
import Vditor from 'vditor';
import { useEditorStore } from '../stores/editorStore';
import { getApi } from './api';
import { vditorCdn } from './vditor';

export async function renderPreviewHtml(markdown: string): Promise<string> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;background:#fff;color:#111;';
  document.body.appendChild(host);
  try {
    await Vditor.preview(host, markdown, {
      cdn: vditorCdn(),
      mode: 'light',
      theme: { current: 'light' },
      hljs: { enable: true, style: 'atom-one-light', lineNumber: true },
      markdown: { toc: true, mark: true, footnotes: true, sanitize: true },
    });
    await waitForPreview(host);
    return host.innerHTML;
  } finally {
    host.remove();
  }
}

function waitForPreview(host: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, 400);
    const images = Array.from(host.querySelectorAll('img'));
    if (images.length === 0) return;
    let left = images.length;
    const done = () => {
      left -= 1;
      if (left <= 0) resolve();
    };
    images.forEach((image) => {
      if (image.complete) done();
      else {
        image.addEventListener('load', done, { once: true });
        image.addEventListener('error', done, { once: true });
      }
    });
  });
}

export async function exportHtml(markdown: string): Promise<void> {
  const html = await renderPreviewHtml(markdown);
  const result = await getApi().exportData({
    defaultPath: '未命名.html',
    filters: [{ name: 'HTML', extensions: ['html'] }],
    data: html,
    encoding: 'utf8',
  });
  report(result, '已导出 HTML');
}

export async function exportPdf(markdown: string): Promise<void> {
  const html = await renderPreviewHtml(markdown);
  const result = await getApi().exportPdf(html);
  report(result, '已导出 PDF');
}

export async function exportDocx(markdown: string): Promise<void> {
  const html = await renderPreviewHtml(markdown);
  const result = await getApi().exportDocx(html);
  report(result, '已导出 Word');
}

export async function exportImage(markdown: string, type: 'png' | 'jpeg'): Promise<void> {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;width:800px;padding:32px;background:#fff;color:#111;';
  document.body.appendChild(host);
  try {
    await Vditor.preview(host, markdown, {
      cdn: vditorCdn(),
      mode: 'light',
      theme: { current: 'light' },
      hljs: { enable: true, style: 'atom-one-light', lineNumber: true },
    });
    await waitForPreview(host);
    const canvas = await html2canvas(host, { backgroundColor: '#ffffff', scale: 2 });
    const dataUrl = canvas.toDataURL(type === 'png' ? 'image/png' : 'image/jpeg', 0.92);
    const base64 = dataUrl.split(',')[1] || '';
    const result = await getApi().exportData({
      defaultPath: type === 'png' ? '未命名.png' : '未命名.jpg',
      filters: [{ name: type.toUpperCase(), extensions: [type === 'png' ? 'png' : 'jpg', 'jpeg'] }],
      data: base64,
      encoding: 'base64',
    });
    report(result, `已导出 ${type.toUpperCase()}`);
  } finally {
    host.remove();
  }
}

function report(result: { canceled: boolean; filePath?: string; error?: string }, ok: string): void {
  if (result.canceled) return;
  if (result.error || !result.filePath) {
    useEditorStore.getState().setStatusMessage(result.error || '导出失败。');
    return;
  }
  useEditorStore.getState().setStatusMessage(`${ok} ${result.filePath}`);
}
