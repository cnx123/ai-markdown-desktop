import { app, BrowserWindow, Menu, dialog, shell, type MenuItemConstructorOptions } from 'electron';
import { isMenuCommand, type MenuCommand } from '../shared/ipc';

function send(command: MenuCommand): void {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
  if (!window || window.isDestroyed()) return;
  if (!isMenuCommand(command)) return;
  window.webContents.send('menu:command', command);
}

function showAbout(): void {
  const window = BrowserWindow.getFocusedWindow();
  const options: Electron.MessageBoxOptions = {
    type: 'info',
    title: '关于 AI Markdown Editor',
    message: 'AI Markdown Editor',
    detail: [
      `版本 ${app.getVersion()}`,
      '基于 Electron、Vditor 与 AI 大模型的 Markdown 桌面编辑器。',
      '支持本地打开/保存、多格式导出，以及选区润色、翻译和文档对话。',
    ].join('\n'),
    buttons: ['确定'],
  };
  void (window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options));
}

function showShortcuts(): void {
  const window = BrowserWindow.getFocusedWindow();
  const options: Electron.MessageBoxOptions = {
    type: 'info',
    title: '键盘快捷键',
    message: '常用快捷键',
    detail: [
      'Ctrl+N  新建',
      'Ctrl+O  打开',
      'Ctrl+S  保存',
      'Ctrl+Shift+S  另存为',
      'Ctrl+Z / Ctrl+Y  撤销 / 重做',
      'Ctrl+Plus / Ctrl+-  放大 / 缩小',
      'F11  全屏',
      'Ctrl+Alt+1~3  润色 / 总结 / 扩写',
      'Ctrl+Alt+4~5  译成中文 / 英文',
      'Ctrl+Alt+8~9  即时渲染 / 分屏预览',
    ].join('\n'),
    buttons: ['确定'],
  };
  void (window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options));
}

export function createApplicationMenu(): Menu {
  const isMac = process.platform === 'darwin';

  const fileMenu: MenuItemConstructorOptions = {
    label: '文件',
    submenu: [
      { label: '新建', accelerator: 'CmdOrCtrl+N', click: () => send('file:new') },
      { label: '打开…', accelerator: 'CmdOrCtrl+O', click: () => send('file:open') },
      { type: 'separator' },
      { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => send('file:save') },
      { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('file:save-as') },
      { type: 'separator' },
      {
        label: '导出',
        submenu: [
          { label: 'HTML…', click: () => send('file:export-html') },
          { label: 'PDF…', click: () => send('file:export-pdf') },
          { label: 'PNG 图片…', click: () => send('file:export-png') },
          { label: 'JPEG 图片…', click: () => send('file:export-jpeg') },
          { label: 'Word…', click: () => send('file:export-docx') },
        ],
      },
      { type: 'separator' },
      { label: '设置…', accelerator: 'CmdOrCtrl+,', click: () => send('app:settings') },
      { type: 'separator' },
      isMac ? { role: 'close', label: '关闭窗口' } : { role: 'quit', label: '退出' },
    ],
  };

  const editMenu: MenuItemConstructorOptions = {
    label: '编辑',
    submenu: [
      { role: 'undo', label: '撤销' },
      { role: 'redo', label: '重做' },
      { type: 'separator' },
      { role: 'cut', label: '剪切' },
      { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' },
      { role: 'delete', label: '删除' },
      { type: 'separator' },
      { role: 'selectAll', label: '全选' },
    ],
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: '视图',
    submenu: [
      { label: '即时渲染', accelerator: 'Ctrl+Alt+8', click: () => send('view:mode-ir') },
      { label: '分屏预览', accelerator: 'Ctrl+Alt+9', click: () => send('view:mode-sv') },
      { type: 'separator' },
      { role: 'reload', label: '重新加载' },
      { role: 'forceReload', label: '强制重新加载' },
      { role: 'toggleDevTools', label: '开发者工具' },
      { type: 'separator' },
      { role: 'resetZoom', label: '实际大小' },
      { role: 'zoomIn', label: '放大' },
      { role: 'zoomOut', label: '缩小' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: '全屏' },
    ],
  };

  const aiMenu: MenuItemConstructorOptions = {
    label: 'AI',
    submenu: [
      { label: '润色语法', accelerator: 'Ctrl+Alt+1', click: () => send('ai:polish') },
      { label: '总结内容', accelerator: 'Ctrl+Alt+2', click: () => send('ai:summarize') },
      { label: '扩展阐述', accelerator: 'Ctrl+Alt+3', click: () => send('ai:expand') },
      { type: 'separator' },
      { label: '翻译成中文', accelerator: 'Ctrl+Alt+4', click: () => send('ai:translateToChinese') },
      { label: '翻译成英文', accelerator: 'Ctrl+Alt+5', click: () => send('ai:translateToEnglish') },
    ],
  };

  const windowMenu: MenuItemConstructorOptions = {
    label: '窗口',
    submenu: [
      { role: 'minimize', label: '最小化' },
      { role: 'zoom', label: '缩放' },
      ...(isMac
        ? ([{ type: 'separator' }, { role: 'front', label: '前置全部窗口' }] as MenuItemConstructorOptions[])
        : ([{ role: 'close', label: '关闭' }] as MenuItemConstructorOptions[])),
    ],
  };

  const helpMenu: MenuItemConstructorOptions = {
    label: '帮助',
    submenu: [
      { label: '键盘快捷键', click: () => showShortcuts() },
      {
        label: 'Electron 文档',
        click: () => {
          void shell.openExternal('https://www.electronjs.org/docs/latest/');
        },
      },
      { type: 'separator' },
      { label: '关于', click: () => showAbout() },
    ],
  };

  const template: MenuItemConstructorOptions[] = [];

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { label: '关于 AI Markdown Editor', click: () => showAbout() },
        { type: 'separator' },
        { label: '设置…', accelerator: 'CmdOrCtrl+,', click: () => send('app:settings') },
        { type: 'separator' },
        { role: 'hide', label: '隐藏' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    });
  }

  template.push(fileMenu, editMenu, viewMenu, aiMenu, windowMenu, helpMenu);
  return Menu.buildFromTemplate(template);
}
