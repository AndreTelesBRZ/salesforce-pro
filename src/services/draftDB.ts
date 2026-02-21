import { OrderDraft } from '../types/orderDraft';

const DB_NAME = 'salesforce_pwa';
const STORE_NAME = 'order_drafts';

const openDatabase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB não está disponível neste ambiente.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const dbPromise = openDatabase();

const buildError = (context: string, error: unknown): Error => {
  const message = error instanceof Error ? error.message : 'Erro desconhecido';
  return new Error(`IndexedDB (${context}) falhou: ${message}`);
};

const withStore = async <T>(
  mode: IDBTransactionMode,
  callback: (store: IDBObjectStore) => Promise<T>
): Promise<T> => {
  const db = await dbPromise;
  const transaction = db.transaction(STORE_NAME, mode);
  const store = transaction.objectStore(STORE_NAME);
  try {
    const result = await callback(store);
    return await new Promise<T>((resolve, reject) => {
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(transaction.error || new Error('Transação abortada'));
      transaction.onerror = () => reject(transaction.error || new Error('Erro na transação'));
    });
  } catch (error) {
    transaction.abort();
    throw error;
  }
};

export async function saveDraft(order: OrderDraft): Promise<void> {
  try {
    await withStore('readwrite', (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.add(order);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  } catch (error) {
    throw buildError('saveDraft', error);
  }
}

export async function getDraft(id: string): Promise<OrderDraft | undefined> {
  try {
    return await withStore('readonly', (store) => {
      return new Promise<OrderDraft | undefined>((resolve, reject) => {
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result as OrderDraft | undefined);
        request.onerror = () => reject(request.error);
      });
    });
  } catch (error) {
    throw buildError('getDraft', error);
  }
}

export async function getAllDrafts(): Promise<OrderDraft[]> {
  try {
    return await withStore('readonly', (store) => {
      return new Promise<OrderDraft[]>((resolve, reject) => {
        const request = store.getAll();
        request.onsuccess = () => {
          const drafts = (request.result as OrderDraft[]).sort(
            (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
          );
          resolve(drafts);
        };
        request.onerror = () => reject(request.error);
      });
    });
  } catch (error) {
    throw buildError('getAllDrafts', error);
  }
}

export async function updateDraft(order: OrderDraft): Promise<void> {
  try {
    await withStore('readwrite', (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.put(order);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  } catch (error) {
    throw buildError('updateDraft', error);
  }
}

export async function deleteDraft(id: string): Promise<void> {
  try {
    await withStore('readwrite', (store) => {
      return new Promise<void>((resolve, reject) => {
        const request = store.delete(id);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    });
  } catch (error) {
    throw buildError('deleteDraft', error);
  }
}
