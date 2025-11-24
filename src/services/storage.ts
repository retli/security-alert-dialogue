const STORAGE_KEY = "secguard.settings";

export interface SecGuardSettings {
  apiKey: string;
  authHeader: string;
  modelName: string;
  llmEndpoint: string;
  mcpServer: string;
  mcpTool: string;
  autoRun: boolean;
  maxSteps: number;
}

const DEFAULT_SETTINGS: SecGuardSettings = {
  apiKey: "",
  authHeader: "",
  modelName: "gpt-4o-mini",
  llmEndpoint: "https://api.openai.com/v1/chat/completions",
  mcpServer: "",
  mcpTool: "security_enrichment",
  autoRun: true,
  maxSteps: 6
};

const hasChromeStorage =
  typeof chrome !== "undefined" && Boolean(chrome?.storage?.local);

async function withChromeStorage<T>(fn: (resolve: (v: T) => void, reject: (error: Error) => void) => void) {
  return new Promise<T>((resolve, reject) => {
    try {
      fn(resolve, reject);
    } catch (error) {
      reject(error as Error);
    }
  });
}

export class StorageService {
  static async getSettings(): Promise<SecGuardSettings> {
    if (hasChromeStorage) {
      return withChromeStorage<SecGuardSettings>((resolve, reject) => {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve({
            ...DEFAULT_SETTINGS,
            ...(result?.[STORAGE_KEY] ?? {})
          });
        });
      });
    }

    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      return {
        ...DEFAULT_SETTINGS,
        ...(raw ? (JSON.parse(raw) as Partial<SecGuardSettings>) : {})
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  static async saveSettings(nextSettings: Partial<SecGuardSettings>) {
    const payload: SecGuardSettings = {
      ...DEFAULT_SETTINGS,
      ...nextSettings
    };

    if (hasChromeStorage) {
      await withChromeStorage<boolean>((resolve, reject) => {
        chrome.storage.local.set({ [STORAGE_KEY]: payload }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }
          resolve(true);
        });
      });
      return payload;
    }

    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(payload));
    return payload;
  }
}

