export type OfflineActionType = "KIOSK_ORDER" | "LIBRARY_ISSUE" | "LIBRARY_RETURN";

export interface OfflineAction {
  id: string;
  type: OfflineActionType;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
  lastError?: string;
}

type MenuCacheRecord = {
  key: string;
  items: unknown[];
  cachedAt: string;
};

const DB_NAME = "certe-offline-db";
const DB_VERSION = 1;
const ACTIONS_STORE = "offline_actions";
const MENU_STORE = "menu_cache";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB is only available in the browser."));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ACTIONS_STORE)) {
        const actions = db.createObjectStore(ACTIONS_STORE, { keyPath: "id" });
        actions.createIndex("createdAt", "createdAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(MENU_STORE)) {
        db.createObjectStore(MENU_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
  });

  return dbPromise;
}

function runTx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore, resolve: (v: T) => void, reject: (e: Error) => void) => void,
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDb();
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      fn(store, resolve, reject);
      tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed."));
    } catch (error) {
      reject(error instanceof Error ? error : new Error("IndexedDB operation failed."));
    }
  });
}

export async function enqueueOfflineAction(
  input: Omit<OfflineAction, "id" | "createdAt" | "attempts">,
): Promise<OfflineAction> {
  const action: OfflineAction = {
    id: crypto.randomUUID(),
    type: input.type,
    payload: input.payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: input.lastError,
  };

  await runTx<void>(ACTIONS_STORE, "readwrite", (store, resolve, reject) => {
    const req = store.put(action);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Failed to queue offline action."));
  });

  return action;
}

export async function getPendingOfflineActions(limit = 100): Promise<OfflineAction[]> {
  return runTx<OfflineAction[]>(ACTIONS_STORE, "readonly", (store, resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const all = (req.result ?? []) as OfflineAction[];
      const sorted = all.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      resolve(sorted.slice(0, limit));
    };
    req.onerror = () => reject(req.error ?? new Error("Failed to read offline actions."));
  });
}

export async function getOfflineQueueSize(): Promise<number> {
  const actions = await getPendingOfflineActions(5000);
  return actions.length;
}

export async function removeOfflineAction(id: string): Promise<void> {
  await runTx<void>(ACTIONS_STORE, "readwrite", (store, resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Failed to remove offline action."));
  });
}

export async function clearOfflineActions(): Promise<void> {
  await runTx<void>(ACTIONS_STORE, "readwrite", (store, resolve, reject) => {
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Failed to clear offline queue."));
  });
}

export async function markOfflineActionFailed(id: string, lastError: string): Promise<void> {
  const existing = await runTx<OfflineAction | undefined>(ACTIONS_STORE, "readonly", (store, resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result as OfflineAction | undefined);
    req.onerror = () => reject(req.error ?? new Error("Failed to read queued action."));
  });

  if (!existing) return;

  const updated: OfflineAction = {
    ...existing,
    attempts: (existing.attempts ?? 0) + 1,
    lastError,
  };

  await runTx<void>(ACTIONS_STORE, "readwrite", (store, resolve, reject) => {
    const req = store.put(updated);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Failed to update queued action."));
  });
}

export async function cacheMenuItems(items: unknown[]): Promise<void> {
  const record: MenuCacheRecord = {
    key: "menu",
    items,
    cachedAt: new Date().toISOString(),
  };

  await runTx<void>(MENU_STORE, "readwrite", (store, resolve, reject) => {
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("Failed to cache menu."));
  });
}

export async function getCachedMenuItems<T>(): Promise<T[]> {
  return runTx<T[]>(MENU_STORE, "readonly", (store, resolve, reject) => {
    const req = store.get("menu");
    req.onsuccess = () => {
      const record = req.result as MenuCacheRecord | undefined;
      resolve((record?.items ?? []) as T[]);
    };
    req.onerror = () => reject(req.error ?? new Error("Failed to read cached menu."));
  });
}
