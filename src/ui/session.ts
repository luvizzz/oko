/**
 * ui/session.ts — persistência de sessão (D9) em IndexedDB:
 * guardamos o ARQUIVO ORIGINAL + a lista de ops; ao reabrir, reaplica o pipeline.
 * IndexedDB pois é o único storage de MB→GB presente em todo browser-alvo (Safari/iOS incluído).
 */
import type { Op } from "../core/pipeline";

export interface Session {
  filename: string;
  savedAt: number;
  ops: Op[];
  image: Blob; // o File original — blob é clonado estruturalmente pelo IDB
}

const DB_NAME = "oko";
const STORE = "session";
const KEY = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveSession(session: Session): Promise<void> {
  await withStore("readwrite", (s) => s.put(session, KEY) as IDBRequest<IDBValidKey>);
}

export async function loadSession(): Promise<Session | null> {
  const found = (await withStore<unknown>("readonly", (s) => s.get(KEY))) as Session | undefined;
  return found ?? null;
}

export async function clearSession(): Promise<void> {
  await withStore("readwrite", (s) => s.delete(KEY) as unknown as IDBRequest<undefined>);
}
