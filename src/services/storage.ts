export const STORAGE_KEY = "secguard.settings";

export interface McpServerConfig {
  id: string;
  name: string;
  url: string;
  tools: string[];
}

export interface SecGuardSettings {
  apiKey: string;
  authHeader: string;
  accessCode: string;
  modelName: string;
  llmEndpoint: string;
  mcpServers: McpServerConfig[];
  activeMcpServerId: string | null;
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
  mcpServers: [],
  activeMcpServerId: null,
  mcpTool: "",
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
    next.authHeader = next.accessCode.startsWith("Bearer")
      ? next.accessCode
      : `ACCESSCODE ${next.accessCode}`;
  } else if (next.authHeader?.startsWith("ACCESSCODE ")) {
    next.accessCode = next.authHeader.replace(/^ACCESSCODE\s+/i, "").trim();
  } else {
    next.authHeader = "";
    next.accessCode = "";
  }
  return next;
}

function generateId() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `mcp-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
}

function normalizeServers(settings: Partial<SecGuardSettings>) {
  const next = { ...settings };
  if (!next.mcpServers) {
    next.mcpServers = [];
  }

  if (
    next.mcpServers.length === 0 &&
    (settings as any)?.mcpServer &&
    typeof (settings as any).mcpServer === "string"
  ) {
    next.mcpServers = [
      {
        id: generateId(),
        name: "默认 Server",
        url: (settings as any).mcpServer,
        tools: next.mcpTool ? [next.mcpTool] : []
      }
    ];
    next.activeMcpServerId = next.mcpServers[0].id;
  }

  if (!next.activeMcpServerId && next.mcpServers.length) {
    next.activeMcpServerId = next.mcpServers[0].id;
  }

  return next as SecGuardSettings;
}

function normalizeSettings(raw: Partial<SecGuardSettings>): SecGuardSettings {
  const merged = {
    ...DEFAULT_SETTINGS,
    ...raw
  };
  return applyAccessCode(normalizeServers(merged));
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
          resolve(normalizeSettings(result?.[STORAGE_KEY] ?? {}));
        });
      });
    }

    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      return normalizeSettings(raw ? JSON.parse(raw) : {});
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  static async saveSettings(
    nextSettings: Partial<SecGuardSettings>
  ): Promise<SecGuardSettings> {
    const payload = normalizeSettings(nextSettings);

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

