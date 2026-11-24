# AI Markdown Editor

基于 Electron、React、TypeScript 和 [Vditor](https://github.com/Vanessa219/vditor) 的桌面 Markdown 编辑器。编辑能力对齐 [Arya](https://github.com/nicejade/markdown-online-editor)，AI 请求由主进程代理，默认使用 DeepSeek。

## 能力

- 所见即所得 / 即时渲染 / 分屏预览（`Ctrl+Alt+7/8/9`）
- 流程图、甘特图、时序图、任务列表、ECharts、五线谱
- 粘贴 HTML 自动转 Markdown，本地图片插入
- 导出 HTML、PDF、PNG、JPEG、Word
- PPT 预览（`---` 分页，`--` 纵向页）
- 本地草稿自动保存
- DeepSeek AI：润色、总结、扩展、中英互译（右键按语言切换）
- 语音输入：AI 对话框点麦克风说话，自动转成文字填进输入框

## 启动

```bash
npm install
npm run dev
```

默认模型是 `deepseek-flash`。密钥写在项目根目录的 `.env`（`DEEPSEEK_API_KEY`），或在窗口「设置」里填写。

## 语音输入

AI 对话框输入框左下角的麦克风支持「说话转文字」：

- 点击开始录音，再点一次结束并转写；录音时按 `Esc` 取消，单次最长 60 秒。
- 转写结果会插入到光标处，确认后点「发送」。
- 引擎优先级：云端接口 → 本机 whisper → Windows 自带识别。
- **推荐：本机 whisper（离线、不用 Key）**。首次运行一次：

  ```bash
  npm run asr:setup
  ```

  会下载 whisper.cpp 预编译包（约 5MB）与 `ggml-small-q5_1.bin`（约 180MB），装到
  `%APPDATA%\ai-markdown-desktop\models\whisper`。国内网络可用镜像：

  ```powershell
  $env:WHISPER_BIN_URL="https://gh-proxy.com/https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.0/whisper-bin-x64.zip"
  $env:WHISPER_MODEL_URL="https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin"
  npm run asr:setup
  ```

  也可以用 `WHISPER_BIN_DIR` / `WHISPER_MODEL_PATH` 指向已有资源。未安装时自动回退 Windows 自带识别引擎（中文需要系统已安装 zh-CN 语音识别组件，准确率明显偏低）。
- 想要云端识别，可在「设置 - 语音转写」或 `.env` 里配置 `ASR_BASE_URL` / `ASR_MODEL` / `ASR_API_KEY`，调用 OpenAI 兼容的 `/audio/transcriptions` 服务（如 `whisper-1`）。`ASR_API_KEY` 留空时复用 AI 的 Key。

## 快捷键

- `Ctrl+N` / `Ctrl+O` / `Ctrl+S`：新建、打开、保存
- `Ctrl+Alt+1` 到 `5`：AI 操作
- `Ctrl+Alt+7/8/9`：切换编辑模式

## 脚本

- `npm run dev`：同时启动 Vite 和 Electron
- `npm run build`：构建渲染进程和主进程
- `npm run typecheck`：类型检查
- `npm run asr:setup`：下载本机 whisper 的二进制与中文模型
