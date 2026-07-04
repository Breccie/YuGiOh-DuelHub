export {};

declare global {
  interface Window {
    desktopShell?: {
      platform: string;
      minimizeWindow?: () => Promise<boolean>;
      toggleMaximizeWindow?: () => Promise<boolean>;
      closeWindow?: () => Promise<boolean>;
      saveTextFile?: (payload: {
        defaultPath?: string;
        content: string;
        filters?: Array<{ name: string; extensions: string[] }>;
      }) => Promise<{ canceled: boolean; filePath: string | null }>;
      openPath?: (targetPath: string) => Promise<boolean>;
      revealPath?: (targetPath: string) => Promise<boolean>;
    };
  }
}
