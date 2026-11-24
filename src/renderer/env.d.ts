/// <reference types="vite/client" />

import type { DesktopApi } from '../shared/ipc';

declare global {
  interface Window {
    api?: DesktopApi;
    hljs?: {
      getLanguage(name: string): unknown;
      highlight(
        code: string,
        options: { language: string; ignoreIllegals: boolean },
      ): { value: string };
    };
  }
}

export {};


export {};
