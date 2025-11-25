export const STORAGE_KEY = "secguard.settings";

export interface SecGuardSettings {
  apiKey: string;
  authHeader: string;
  accessCode: string;
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
  accessCode: "",
  modelName: "gpt-4o-mini",
  llmEndpoint: "https://api.openai.com/v1/chat/completions",
  mcpServer: "",
  mcpTool: "security_enrichment",
  autoRun: true,
  maxSteps: 6
};

const hasChromeStorage =
  typeof chrome !== "undefined" && Boolean(chrome?.storage?.local);

async function withChromeStorage<T>(
  fn: (resolve: (v: T) => void, reject: (error: Error) => void) => void
) {
  return new Promise<T>((resolve, reject) => {
    try {
      fn(resolve, reject);
    } catch (error) {
      reject(error as Error);
    }
  });
}

function applyAccessCode(settings: SecGuardSettings): SecGuardSettings {
  const next = { ...settings };
  if (next.accessCode) {
    next.authHeader = `ACCESSCODE ${next.accessCode}`;
  } else if (next.authHeader?.startsWith("ACCESSCODE ")) {
    next.accessCode = next.authHeader.replace(/^ACCESSCODE\s+/i, "").trim();
  } else {
    next.authHeader = "";
    next.accessCode = "";
  }
  return next;
}

export class StorageService {
  static async getSettings(): Promise<SecGuardSettings> {
    const resolveSettings = async (): Promise<SecGuardSettings> => {
      if (hasChromeStorage) {
        return withChromeStorage<SecGuardSettings>((resolve, reject) => {
          chrome.storage.local.get([STORAGE_KEY], (result) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
              return;
            }
            resolve(
              applyAccessCode({
                ...DEFAULT_SETTINGS,
                ...(result?.[STORAGE_KEY] ?? {})
              })
            );
          });
        });
      }

      try {
        const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
        return applyAccessCode({
          ...DEFAULT_SETTINGS,
          ...(raw ? (JSON.parse(raw) as Partial<SecGuardSettings>) : {})
        });
      } catch {
        return applyAccessCode(DEFAULT_SETTINGS);
      }
    };

    return resolveSettings();
  }

  static async saveSettings(
    nextSettings: Partial<SecGuardSettings>
  ): Promise<SecGuardSettings> {
    const payload = applyAccessCode({
      ...DEFAULT_SETTINGS,
      ...nextSettings
    });

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

