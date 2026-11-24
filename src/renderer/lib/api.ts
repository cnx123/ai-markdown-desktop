export function getApi() {
  if (!window.api) {
    throw new Error('请使用 npm run dev 启动桌面窗口。浏览器页面无法调用系统能力。');
  }
  return window.api;
}
