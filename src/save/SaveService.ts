/**
 * 存檔服務介面。所有系統只能透過這個介面存取持久化資料，
 * 不可直接呼叫 localStorage。第二階段可換成 ServerSaveService。
 * 目前是同步介面（LocalSaveService 本地即時）；伺服器版以記憶體快取 + 背景同步實作即可。
 */
export interface SaveService {
  /** 讀取；沒有或損毀時回傳 fallback */
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

const PREFIX = 'chronoraid.';

export class LocalSaveService implements SaveService {
  private memory = new Map<string, string>(); // localStorage 不可用時的備援

  get<T>(key: string, fallback: T): T {
    try {
      const raw = this.read(PREFIX + key);
      if (raw === null) return fallback;
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  set<T>(key: string, value: T): void {
    const raw = JSON.stringify(value);
    this.memory.set(PREFIX + key, raw);
    try { localStorage.setItem(PREFIX + key, raw); } catch { /* 隱私模式或容量已滿：只留記憶體 */ }
  }

  remove(key: string): void {
    this.memory.delete(PREFIX + key);
    try { localStorage.removeItem(PREFIX + key); } catch { /* ignore */ }
  }

  private read(k: string): string | null {
    try {
      const v = localStorage.getItem(k);
      if (v !== null) return v;
    } catch { /* ignore */ }
    return this.memory.get(k) ?? null;
  }
}
