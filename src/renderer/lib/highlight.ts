const SKIP_LANGS = new Set([
  'mermaid',
  'flowchart',
  'echarts',
  'mindmap',
  'plantuml',
  'smiles',
  'abc',
  'graphviz',
  'math',
  'markmap',
]);

function loadScript(src: string, id: string): Promise<void> {
  if (document.getElementById(id)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.id = id;
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`无法加载 ${src}`));
    document.head.appendChild(script);
  });
}

export async function ensureHljs(cdn: string): Promise<void> {
  if (window.hljs) return;
  await loadScript(`${cdn}/dist/js/highlight.js/highlight.min.js?v=11.7.0`, 'vditorHljsScript');
  await loadScript(`${cdn}/dist/js/highlight.js/third-languages.js?v=1.0.1`, 'vditorHljsThirdScript');
}

export function applyHighlight(root: ParentNode): void {
  const hljs = window.hljs;
  if (!hljs) return;

  root.querySelectorAll('pre > code').forEach((block) => {
    const parent = block.parentElement;
    if (!parent) return;
    if (
      parent.classList.contains('vditor-ir__marker--pre') ||
      parent.classList.contains('vditor-wysiwyg__pre')
    ) {
      return;
    }

    const lang =
      [...block.classList].find((name) => name.startsWith('language-'))?.slice('language-'.length) ??
      '';
    if (SKIP_LANGS.has(lang)) return;

    const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
    block.innerHTML = hljs.highlight(block.textContent ?? '', {
      language,
      ignoreIllegals: true,
    }).value;
    block.classList.add('hljs');
  });
}
