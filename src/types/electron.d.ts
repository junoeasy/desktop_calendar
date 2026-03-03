import type { DesktopCalBridge } from "@shared/apiTypes";

declare global {
  interface Window {
    desktopCalApi: DesktopCalBridge;
  }
}

export {};
