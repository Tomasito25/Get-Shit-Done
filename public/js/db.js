/*
 * Almacen local. IndexedDB es la fuente de verdad en el navegador.
 * Nada de red, cuentas ni sincronizacion externa.
 */

const DB_NAME = 'gsd';
const DB_VERSION = 2;
export const STORES = ['tasks', 'projects', 'waitings', 'sessions', 'meta'];

let dbPromise = null;

/** Nunca esperar indefinidamente por el almacen: mejor un error claro. */
const ABRIR_TIMEOUT = 8000;

export function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let resuelto = false;
    const acabar = (fn, arg) => { if (!resuelto) { resuelto = true; fn(arg); } };

    const plazo = setTimeout(() => {
      acabar(reject, new Error('El almacén local no responde. Cierra las otras pestañas de GSD y recarga.'));
    }, ABRIR_TIMEOUT);

    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => {
      clearTimeout(plazo);
      const db = req.result;
      // Si otra pestaña necesita actualizar la base, soltamos la conexion
      // en lugar de bloquearla: dos pestañas abiertas no pueden colgar la app.
      db.onversionchange = () => { db.close(); dbPromise = null; };
      db.onclose = () => { dbPromise = null; };
      acabar(resolve, db);
    };
    req.onerror = () => { clearTimeout(plazo); acabar(reject, req.error); };
    req.onblocked = () => {
      // No se rechaza aun: la otra pestaña puede cerrar la conexion y seguir.
      // Si no lo hace, salta el plazo de arriba con un mensaje claro.
    };
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function tx(db, stores, mode) {
  return db.transaction(stores, mode);
}

function done(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error || new Error('transaccion abortada'));
  });
}

export async function getAll(store) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = tx(db, [store], 'readonly').objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function put(store, value) {
  const db = await open();
  const t = tx(db, [store], 'readwrite');
  t.objectStore(store).put(value);
  await done(t);
  return value;
}

export async function putMany(store, values) {
  if (!values.length) return;
  const db = await open();
  const t = tx(db, [store], 'readwrite');
  const os = t.objectStore(store);
  for (const v of values) os.put(v);
  await done(t);
}

export async function del(store, id) {
  const db = await open();
  const t = tx(db, [store], 'readwrite');
  t.objectStore(store).delete(id);
  await done(t);
}

export async function delMany(store, ids) {
  if (!ids.length) return;
  const db = await open();
  const t = tx(db, [store], 'readwrite');
  const os = t.objectStore(store);
  for (const id of ids) os.delete(id);
  await done(t);
}

/** Reemplaza todo el contenido en una sola transaccion (importar / restaurar). */
export async function replaceAll(data) {
  const db = await open();
  const t = tx(db, STORES, 'readwrite');
  for (const name of STORES) {
    const os = t.objectStore(name);
    os.clear();
    for (const item of data[name] || []) os.put(item);
  }
  await done(t);
}

export async function loadEverything() {
  const [tasks, projects, waitings, sessions, meta] = await Promise.all(STORES.map(getAll));
  return { tasks, projects, waitings, sessions, meta };
}

/** Persistencia reforzada: pide al navegador que no borre estos datos. */
export async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      if (await navigator.storage.persisted()) return true;
      return await navigator.storage.persist();
    }
  } catch { /* sin soporte: seguimos con el respaldo en disco */ }
  return false;
}
