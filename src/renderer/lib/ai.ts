import type { AIInstruction } from '../../shared/ipc';

export interface AIOperation {
  id: AIInstruction;
  label: string;
  desc: string;
  shortcut: string;
  key: string;
}

export const AI_OPERATIONS: AIOperation[] = [
  { id: 'polish', label: '润色语法', desc: '优化表达，修正错误', shortcut: 'Ctrl+Alt+1', key: '1' },
  { id: 'summarize', label: '总结内容', desc: '提取核心要点', shortcut: 'Ctrl+Alt+2', key: '2' },
  { id: 'expand', label: '扩展阐述', desc: '丰富内容细节', shortcut: 'Ctrl+Alt+3', key: '3' },
  { id: 'translateToChinese', label: '翻译成中文', desc: '识别为英文或其他语言', shortcut: 'Ctrl+Alt+4', key: '4' },
  { id: 'translateToEnglish', label: '翻译成英文', desc: '识别为中文', shortcut: 'Ctrl+Alt+5', key: '5' },
];

const CJK = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;
const LATIN = /[A-Za-z\u00C0-\u024F]/g;

export function looksLikeChinese(text: string): boolean {
  const source = text.trim();
  if (!source) return false;
  const cjk = source.match(CJK)?.length ?? 0;
  const latin = source.match(LATIN)?.length ?? 0;
  if (cjk === 0) return false;
  if (latin === 0) return true;
  return cjk >= latin;
}

export function translationForText(text: string): AIOperation {
  return looksLikeChinese(text)
    ? AI_OPERATIONS.find((item) => item.id === 'translateToEnglish')!
    : AI_OPERATIONS.find((item) => item.id === 'translateToChinese')!;
}

export function contextMenuOperations(selectedText: string): AIOperation[] {
  const translation = translationForText(selectedText);
  return [...AI_OPERATIONS.filter((item) => !item.id.startsWith('translate')), translation];
}

export const AI_RUN_EVENT = 'app:ai';

export function requestAI(instruction: AIInstruction): void {
  window.dispatchEvent(new CustomEvent<AIInstruction>(AI_RUN_EVENT, { detail: instruction }));
}

export function basename(filePath: string): string {
  const parts = filePath.split(/[/\\]/);
  return parts[parts.length - 1] || filePath;
}
