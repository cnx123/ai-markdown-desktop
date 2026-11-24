import { create } from 'zustand';
import type Vditor from 'vditor';
import type { AIInstruction } from '../../shared/ipc';
import { readDraft, writeDraft, type EditorMode } from '../lib/vditor';

export const WELCOME_DOCUMENT = `# 欢迎使用 AI Markdown 编辑器

参考 [Arya / Vditor](https://github.com/nicejade/markdown-online-editor) 重建：分屏、所见即所得、流程图、甘特图、时序图、任务列表、ECharts、五线谱，以及导出和 PPT 预览。AI 能力仍然接在侧边栏和右键菜单上。

## 编辑模式

- **所见即所得**：\`Ctrl+Alt+7\`
- **即时渲染**：\`Ctrl+Alt+8\`
- **分屏预览**：\`Ctrl+Alt+9\`

粘贴 HTML 会自动转成 Markdown。图片可直接拖进来。

## AI

选中文字后，用侧边栏或右键：

- **润色 / 总结 / 扩展**
- **中英互译**：右键会识别语言

结果要确认后才会写入。\`Ctrl+Z\` 可撤销。

## 任务列表

- [x] 接上 Vditor
- [x] 保留 DeepSeek 与文件操作
- [ ] 写完你的下一篇笔记

## 代码块

在围栏上写语言标记，预览会按语法高亮。工具栏「代码块」可直接选语言。

\`\`\`javascript
function greet(name) {
  return \`你好，\${name}\`;
}

console.log(greet("Markdown"));
\`\`\`

\`\`\`python
def fib(n: int) -> int:
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a

print(fib(10))
\`\`\`

## 流程图

\`\`\`mermaid
graph TD
  A[选中文本] --> B{调用 AI}
  B -->|确认| C[替换或插入]
  B -->|取消| D[保持原文]
\`\`\`

## 时序图

\`\`\`mermaid
sequenceDiagram
  participant 渲染进程
  participant 主进程
  participant DeepSeek
  渲染进程->>主进程: invokeAI
  主进程->>DeepSeek: chat/completions
  DeepSeek-->>主进程: 文本
  主进程-->>渲染进程: 确认后再写入
\`\`\`

## 甘特图

\`\`\`mermaid
gantt
  title 写作计划
  dateFormat  YYYY-MM-DD
  section 草稿
  大纲           :a1, 2026-09-26, 2d
  正文           :a2, after a1, 3d
  section 发布
  校对           :2026-10-01, 1d
\`\`\`

## 图表

\`\`\`echarts
{
  "title": { "text": "本周字数", "textStyle": { "color": "#2c2a26" } },
  "xAxis": { "type": "category", "data": ["一", "二", "三", "四", "五"] },
  "yAxis": { "type": "value" },
  "series": [{ "type": "bar", "data": [1200, 900, 1600, 800, 2100] }]
}
\`\`\`

## 五线谱

\`\`\`abc
X: 24
T: Spring
C: Vivaldi
M: 4/4
L: 1/16
K: E
vA/G/F/E/ ^G/F/E/D/ C/B,/A,/G,/
\`\`\`

## PPT

用 \`---\` 分页，用 \`--\` 做纵向幻灯片。打开工具栏的「PPT」即可预览。

---

## 第二页

这里是水平方向的下一张。

--

### 纵向页

按方向键向下，进入这一页。
`;

function initialContent(): string {
  return readDraft() ?? WELCOME_DOCUMENT;
}

interface EditorStore {
  content: string;
  savedContent: string;
  filePath: string | null;
  editorKey: number;
  editor: Vditor | null;
  mode: EditorMode;
  isAIProcessing: boolean;
  processingInstruction: AIInstruction | null;
  aiError: string | null;
  statusMessage: string | null;
  setContentFromEditor: (content: string) => void;
  setEditor: (editor: Vditor | null) => void;
  setMode: (mode: EditorMode) => void;
  setAIProcessing: (processing: boolean) => void;
  setProcessingInstruction: (instruction: AIInstruction | null) => void;
  setAIError: (error: string | null) => void;
  setStatusMessage: (message: string | null) => void;
  loadDocument: (content: string, filePath: string | null) => void;
  markSaved: (filePath: string) => void;
  replaceSelection: (text: string) => boolean;
  insertAfterSelection: (text: string) => boolean;
}

const first = initialContent();

export const useEditorStore = create<EditorStore>((set, get) => ({
  content: first,
  savedContent: first === WELCOME_DOCUMENT ? WELCOME_DOCUMENT : first,
  filePath: null,
  editorKey: 0,
  editor: null,
  mode: 'sv',
  isAIProcessing: false,
  processingInstruction: null,
  aiError: null,
  statusMessage: first === WELCOME_DOCUMENT ? null : '已恢复上次未保存的草稿',
  setContentFromEditor: (content) => {
    writeDraft(content);
    set({ content });
  },
  setEditor: (editor) => set({ editor }),
  setMode: (mode) =>
    set((state) => ({
      mode,
      editorKey: state.editorKey + 1,
    })),
  setAIProcessing: (isAIProcessing) => set({ isAIProcessing }),
  setProcessingInstruction: (processingInstruction) => set({ processingInstruction }),
  setAIError: (aiError) => set({ aiError }),
  setStatusMessage: (statusMessage) => set({ statusMessage }),
  loadDocument: (content, filePath) => {
    writeDraft(content);
    set((state) => ({
      content,
      savedContent: content,
      filePath,
      editorKey: state.editorKey + 1,
      aiError: null,
      statusMessage: filePath ? `已打开 ${filePath}` : '已新建文档',
    }));
  },
  markSaved: (filePath) =>
    set((state) => ({
      filePath,
      savedContent: state.content,
      statusMessage: `已保存 ${filePath}`,
    })),
  replaceSelection: (text) => {
    const editor = get().editor;
    if (!editor) return false;
    editor.updateValue(text);
    editor.focus();
    set({ content: editor.getValue() });
    writeDraft(editor.getValue());
    return true;
  },
  insertAfterSelection: (text) => {
    const editor = get().editor;
    if (!editor) return false;
    const selected = editor.getSelection() || '';
    const prefix = selected && !selected.endsWith('\n') ? '\n' : '';
    if (selected) {
      editor.updateValue(`${selected}${prefix}${text}`);
    } else {
      editor.insertValue(`${prefix}${text}`);
    }
    editor.focus();
    set({ content: editor.getValue() });
    writeDraft(editor.getValue());
    return true;
  },
}));
