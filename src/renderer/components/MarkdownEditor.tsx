import React, { useEffect, useRef, useState } from 'react';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import 'vditor/dist/js/highlight.js/styles/atom-one-light.min.css';
import { contextMenuOperations, requestAI } from '../lib/ai';
import { applyHighlight, ensureHljs } from '../lib/highlight';
import { createCodeBlockToolbar, getSelectedText, hintCodeLanguages, vditorCdn } from '../lib/vditor';
import { VDITOR_I18N } from '../lib/vditor-i18n';
import { useEditorStore } from '../stores/editorStore';
import './MarkdownEditor.css';

const EDITOR_ID = 'ai-vditor';

function isReady(editor: Vditor): boolean {
  const internal = (editor as unknown as { vditor?: { element?: HTMLElement; sv?: { element?: HTMLElement } } }).vditor;
  return Boolean(internal?.element && internal.sv?.element);
}

function safeDestroy(editor: Vditor | null): void {
  if (!editor) return;
  try {
    if (isReady(editor)) editor.destroy();
  } catch {
    // Vditor 未完成初始化时 destroy 会读空对象
  }
}

const MarkdownEditor: React.FC = () => {
  const hostRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<Vditor | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; selectedText: string } | null>(null);
  const mode = useEditorStore((state) => state.mode);
  const editorKey = useEditorStore((state) => state.editorKey);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.replaceChildren();
    const box = document.createElement('div');
    box.id = EDITOR_ID;
    box.className = 'vditor-host';
    host.appendChild(box);

    let cancelled = false;
    let ready = false;
    const cdn = vditorCdn();

    void ensureHljs(cdn);

    const editor = new Vditor(EDITOR_ID, {
      cdn,
      height: '100%',
      width: '100%',
      lang: 'zh_CN',
      i18n: VDITOR_I18N,
      mode,
      theme: 'classic',
      value: useEditorStore.getState().content,
      tab: '  ',
      typewriterMode: true,
      outline: { enable: true, position: 'left' },
      counter: { enable: true, type: 'text' },
      cache: { enable: false },
      toolbarConfig: { pin: true },
      hint: {
        extend: [{ key: '```', hint: hintCodeLanguages }],
      },
      preview: {
        delay: 200,
        markdown: {
          toc: true,
          mark: true,
          footnotes: true,
          autoSpace: true,
          listStyle: true,
          sanitize: true,
          codeBlockPreview: true,
        },
        math: { engine: 'KaTeX', inlineDigit: true },
        theme: { current: 'light' },
        hljs: {
          enable: true,
          style: 'atom-one-light',
          lineNumber: true,
          renderMenu(codeElement, menuElement) {
            const lang = [...codeElement.classList]
              .find((name) => name.startsWith('language-'))
              ?.replace('language-', '');
            if (!lang || lang === 'plaintext') return;
            const tag = document.createElement('span');
            tag.className = 'code-lang-tag';
            tag.textContent = lang;
            menuElement.appendChild(tag);
          },
        },
        render: { media: { enable: true } },
        parse(element) {
          const paint = () => applyHighlight(element);
          if (window.hljs) {
            window.setTimeout(paint, 80);
            return;
          }
          void ensureHljs(cdn).then(paint);
        },
      },
      upload: {
        accept: 'image/*',
        handler(files) {
          const file = files[0];
          if (!file) return '没有选择文件';
          const reader = new FileReader();
          reader.onload = () => {
            const url = typeof reader.result === 'string' ? reader.result : '';
            if (url) instanceRef.current?.insertValue(`![${file.name}](${url})`);
          };
          reader.readAsDataURL(file);
          return null;
        },
      },
      toolbar: [
        'emoji',
        'headings',
        'bold',
        'italic',
        'strike',
        'link',
        '|',
        'list',
        'ordered-list',
        'check',
        '|',
        'quote',
        'line',
        createCodeBlockToolbar((language) => {
          instanceRef.current?.insertValue(`\`\`\`${language}\n\n\`\`\``);
        }),
        'inline-code',
        '|',
        'upload',
        'table',
        '|',
        'undo',
        'redo',
        '|',
        'fullscreen',
        'edit-mode',
        'both',
        'outline',
        'code-theme',
      ],
      input: (value) => {
        if (!cancelled) useEditorStore.getState().setContentFromEditor(value);
      },
      after: () => {
        if (cancelled) {
          safeDestroy(editor);
          return;
        }
        ready = true;
        instanceRef.current = editor;
        useEditorStore.getState().setEditor(editor);
        try {
          editor.focus();
        } catch {
          // 焦点失败不影响编辑
        }
      },
    });

    return () => {
      cancelled = true;
      instanceRef.current = null;
      if (useEditorStore.getState().editor === editor) {
        useEditorStore.getState().setEditor(null);
      }
      if (ready) safeDestroy(editor);
    };
  }, [mode, editorKey]);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
    };
  }, [menu]);

  return (
    <div
      className="markdown-editor"
      onContextMenu={(event) => {
        event.preventDefault();
        const selectedText = getSelectedText(instanceRef.current ?? useEditorStore.getState().editor);
        const x = Math.min(event.clientX, window.innerWidth - 220);
        const y = Math.min(event.clientY, window.innerHeight - 196);
        setMenu({ x, y, selectedText });
      }}
    >
      <div ref={hostRef} className="vditor-mount" />
      {menu && (
        <div className="context-menu" style={{ left: menu.x, top: menu.y }} onClick={(event) => event.stopPropagation()}>
          {contextMenuOperations(menu.selectedText).map((operation) => (
            <button
              key={operation.id}
              type="button"
              onClick={() => {
                setMenu(null);
                requestAI(operation.id);
              }}
            >
              <span>{operation.label}</span>
              <kbd>{operation.shortcut}</kbd>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default MarkdownEditor;
