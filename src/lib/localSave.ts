// Minimal IndexedDB key/value store for persisting editor progress locally.
// Kept dependency-free so it works on iPad Safari without polyfills.

const DB_NAME = "tinywisdom-editor";
const STORE = "kv";
const KEY = "editor-state-v1";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveLocal<T>(value: T, key: string = KEY): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    // Quota errors etc. — fail silently, user can keep working.
    console.warn("saveLocal failed", err);
  }
}

export async function loadLocal<T>(key: string = KEY): Promise<T | null> {
  try {
    const db = await openDb();
    const value = await new Promise<T | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return value;
  } catch (err) {
    console.warn("loadLocal failed", err);
    return null;
  }
}

export async function clearLocal(key: string = KEY): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) {
    console.warn("clearLocal failed", err);
  }
}
