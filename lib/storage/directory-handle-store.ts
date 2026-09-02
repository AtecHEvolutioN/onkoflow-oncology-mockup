const DATABASE_NAME = "onkoflow-browser-settings";
const DATABASE_VERSION = 1;
const STORE_NAME = "handles";
const DATA_DIRECTORY_KEY = "data-directory";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB není v tomto prohlížeči dostupná."));
      return;
    }

    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB se nepodařilo otevřít."));
    };
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const database = await openDatabase();

  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      let result: T;
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => {
        reject(request.error ?? new Error("Operace IndexedDB selhala."));
      };
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => {
        reject(transaction.error ?? new Error("Transakce IndexedDB selhala."));
      };
      transaction.onabort = () => {
        reject(transaction.error ?? new Error("Transakce IndexedDB byla přerušena."));
      };
    });
  } finally {
    database.close();
  }
}

export function saveDataDirectoryHandle(handle: FileSystemDirectoryHandle) {
  return withStore("readwrite", (store) => store.put(handle, DATA_DIRECTORY_KEY));
}

export async function loadDataDirectoryHandle() {
  const value = await withStore<unknown>("readonly", (store) =>
    store.get(DATA_DIRECTORY_KEY),
  );

  if (
    value &&
    typeof value === "object" &&
    "kind" in value &&
    value.kind === "directory"
  ) {
    return value as FileSystemDirectoryHandle;
  }

  return null;
}

export function forgetDataDirectoryHandle() {
  return withStore("readwrite", (store) => store.delete(DATA_DIRECTORY_KEY));
}
