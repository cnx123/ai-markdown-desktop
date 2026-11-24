import type Vditor from 'vditor';

export type EditorMode = 'wysiwyg' | 'ir' | 'sv';

export const EDITOR_MODES: { id: EditorMode; label: string; shortcut: string }[] = [
  { id: 'ir', label: '即时渲染', shortcut: 'Ctrl+Alt+8' },
  { id: 'sv', label: '分屏预览', shortcut: 'Ctrl+Alt+9' },
];

export const CODE_FENCE_LANGUAGES: { id: string; label: string }[] = [
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'java', label: 'Java' },
  { id: 'go', label: 'Go' },
  { id: 'rust', label: 'Rust' },
  { id: 'c', label: 'C' },
  { id: 'cpp', label: 'C++' },
  { id: 'csharp', label: 'C#' },
  { id: 'json', label: 'JSON' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'sql', label: 'SQL' },
  { id: 'bash', label: 'Bash' },
  { id: 'yaml', label: 'YAML' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'plaintext', label: '纯文本' },
];

export function createCodeBlockToolbar(insertFence: (language: string) => void) {
  return {
    name: 'code',
    prefix: '',
    tip: '插入代码块（带语言高亮）',
    toolbar: CODE_FENCE_LANGUAGES.map((language) => ({
      name: `code-lang-${language.id}`,
      tip: language.label,
      icon: language.label,
      click() {
        insertFence(language.id);
      },
    })),
  };
}

export function hintCodeLanguages(value: string): { html: string; value: string }[] {
  const query = value.trim().toLowerCase();
  return CODE_FENCE_LANGUAGES.filter(
    (language) =>
      !query || language.id.startsWith(query) || language.label.toLowerCase().includes(query),
  ).map((language) => ({
    html: `${language.label} <code>${language.id}</code>`,
    value: `\`\`\`${language.id}\n`,
  }));
}

export const DRAFT_KEY = 'ai-md-draft';

export function vditorCdn(): string {
  const base = import.meta.env.BASE_URL || './';
  const path = `${base}vditor`.replace(/([^:]\/)\/+/g, '$1').replace(/\/+$/, '');
  if (typeof window === 'undefined') return path;
  return new URL(path, window.location.href).toString().replace(/\/+$/, '');
}

export function readDraft(): string | null {
  try {
    const value = localStorage.getItem(DRAFT_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

export function writeDraft(content: string): void {
  try {
    localStorage.setItem(DRAFT_KEY, content);
  } catch {
    // 配额不足时忽略
  }
}

export function getSelectedText(editor: Vditor | null): string {
  if (!editor) return '';
  try {
    return editor.getSelection() || '';
  } catch {
    return '';
  }
}
