/*
 * Respaldo en disco a traves del servidor local (127.0.0.1).
 * IndexedDB puede ser borrada por el navegador; el fichero en disco no.
 * Nada sale del dispositivo: el destino es siempre el propio equipo.
 */

const ENDPOINT = '/api/snapshot';
const DEBOUNCE_MS = 1200;

let timer = null;
let snapshotFn = null;
let lastSaved = null;
let available = true;

export function init(getSnapshot) {
  snapshotFn = getSnapshot;
  // Ultimo intento al cerrar: sendBeacon sobrevive al unload.
  // Solo al cerrar. Cambiar de pestaña no necesita escribir en disco: cada
  // cambio real ya se guarda solo, y escribir de mas es escribir sin motivo.
  addEventListener('pagehide', flushBeacon);
  addEventListener('beforeunload', flushBeacon);
}

export function schedule() {
  if (!snapshotFn) return;
  clearTimeout(timer);
  timer = setTimeout(flush, DEBOUNCE_MS);
}

export async function flush() {
  if (!snapshotFn) return false;
  clearTimeout(timer);
  const body = JSON.stringify(snapshotFn());
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    available = res.ok;
    if (res.ok) lastSaved = new Date();
    return res.ok;
  } catch {
    available = false;
    return false;
  }
}

function flushBeacon() {
  if (!snapshotFn) return;
  try {
    const blob = new Blob([JSON.stringify(snapshotFn())], { type: 'application/json' });
    navigator.sendBeacon(ENDPOINT, blob);
  } catch { /* nada que hacer al cerrar */ }
}

/** Snapshot guardado en disco, o null si no hay ninguno. */
export async function loadDisk() {
  try {
    const res = await fetch(ENDPOINT, { cache: 'no-store' });
    if (!res.ok) return null;
    const data = await res.json();
    return data && Array.isArray(data.tasks) ? data : null;
  } catch {
    return null;
  }
}

export const status = () => ({ available, lastSaved });
