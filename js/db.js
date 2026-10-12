// 로컬 저장소 (IndexedDB). 앱은 로컬에 먼저 저장하고 노션으로 동기화해요.
const DB_NAME = 'pygmy-care';
let dbp;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('entries', { keyPath: 'id' });
      const m = db.createObjectStore('media', { keyPath: 'id' });
      m.createIndex('entryId', 'entryId');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then((v) => { out = v; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
  });
}

const wrap = (req) => new Promise((res, rej) => { req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error); });

export const db = {
  get: (store, id) => tx(store, 'readonly', (s) => wrap(s.get(id))),
  put: (store, val) => tx(store, 'readwrite', (s) => wrap(s.put(val))),
  del: (store, id) => tx(store, 'readwrite', (s) => wrap(s.delete(id))),
  all: (store) => tx(store, 'readonly', (s) => wrap(s.getAll())),
  clear: (store) => tx(store, 'readwrite', (s) => wrap(s.clear())),
};
