#!/usr/bin/env node
/**
 * Servidor local de la aplicacion GSD.
 *
 * - Sin dependencias externas. Solo modulos nativos de Node.
 * - Escucha unicamente en 127.0.0.1: nada sale del dispositivo.
 * - Sirve public/ y ofrece un endpoint de snapshot para respaldo en disco.
 *
 * El almacen primario es IndexedDB en el navegador. Este servidor mantiene
 * ademas una copia en data/gsd-data.json (escritura atomica) y una copia
 * diaria en data/backups/. Prioridad 1: los datos nunca se pierden.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');

const WINDOWS = process.platform === 'win32';

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
/** Por defecto, junto a la aplicación. GSD_DATA_DIR la lleva a otro sitio. */
const DATA_DIR = process.env.GSD_DATA_DIR ? path.resolve(process.env.GSD_DATA_DIR) : path.join(ROOT, 'data');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const SNAPSHOT_FILE = path.join(DATA_DIR, 'gsd-data.json');
const argumento = (nombre) => { const i = process.argv.indexOf(nombre); return i > -1 ? process.argv[i + 1] : undefined; };

/** `node server.js --port 9000`. Ir en la línea de órdenes deja distinguir dos instancias. */
const PORT = Number(argumento('--port') || process.env.PORT || 8790);

/*
 * `--log fichero`: toda la salida del servidor va a ese fichero. En Windows el
 * arrancador lo lanza sin consola y sin heredar la de quien lo abrió (si la
 * heredara, esa ventana no podría terminar hasta que se cerrase el servidor).
 */
const LOG_FILE = argumento('--log');
if (LOG_FILE) {
  const flujo = fs.createWriteStream(LOG_FILE, { flags: 'a' });
  const escribir = (trozo) => flujo.write(trozo);
  process.stdout.write = escribir;
  process.stderr.write = escribir;
}
const HOST = '127.0.0.1';
const MAX_BODY = 32 * 1024 * 1024; // 32 MB
const KEEP_BACKUPS = 30;
const SENT_FILE = path.join(DATA_DIR, 'avisos-enviados.json');
const ICON_FILE = path.join(PUBLIC_DIR, 'icon.svg');
const REMINDER_EVERY_MS = 30 * 1000;
/** Un aviso con más de un día de retraso ya no avisa de nada: se descarta. */
const REMINDER_MAX_LATE_MS = 24 * 60 * 60 * 1000;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function send(res, code, body, headers = {}) {
  res.writeHead(code, {
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  res.end(body);
}

function sendJson(res, code, obj) {
  send(res, code, JSON.stringify(obj), { 'Content-Type': MIME['.json'] });
}

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error('body-too-large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

/**
 * Escritura atomica: fichero temporal unico + rename. Evita ficheros a medias
 * y, con nombre unico por escritura, evita que dos guardados simultaneos se
 * pisen el temporal.
 */
let writeSeq = 0;
async function atomicWrite(file, text) {
  writeSeq += 1;
  const tmp = `${file}.${process.pid}.${writeSeq}.${Date.now().toString(36)}.tmp`;
  const fh = await fsp.open(tmp, 'w');
  try {
    await fh.writeFile(text, 'utf8');
    await fh.sync();
  } finally {
    await fh.close();
  }
  try {
    await renameWithRetry(tmp, file);
  } catch (err) {
    await fsp.unlink(tmp).catch(() => {});
    throw err;
  }
}

/**
 * En Windows, un antivirus o el indexador pueden tener el fichero abierto un
 * instante y el rename falla con EPERM/EBUSY. Se reintenta con esperas
 * crecientes (25 ms … 1,6 s) antes de dar el guardado por fallido.
 */
async function renameWithRetry(from, to) {
  for (let intento = 0; ; intento += 1) {
    try {
      await fsp.rename(from, to);
      return;
    } catch (err) {
      const pasajero = ['EPERM', 'EBUSY', 'EACCES'].includes(err && err.code);
      if (!pasajero || intento >= 6) throw err;
      await new Promise((r) => setTimeout(r, 25 * 2 ** intento));
    }
  }
}

/**
 * Cola de escritura: los guardados se aplican en orden, nunca a la vez.
 * El ultimo estado enviado es el que acaba en disco.
 */
let writeChain = Promise.resolve();
function queueWrite(fn) {
  const next = writeChain.then(fn, fn);
  writeChain = next.catch(() => {});
  return next;
}

function todayStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

async function rotateBackups() {
  let files;
  try {
    files = await fsp.readdir(BACKUP_DIR);
  } catch {
    return;
  }
  const snaps = files.filter((f) => /^gsd-\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const extra = snaps.slice(0, Math.max(0, snaps.length - KEEP_BACKUPS));
  for (const f of extra) {
    try { await fsp.unlink(path.join(BACKUP_DIR, f)); } catch { /* ignorar */ }
  }
}

/** Copia de la version anterior en cada escritura: un paso atras siempre. */
async function keepPrevious() {
  try {
    const actual = await fsp.readFile(SNAPSHOT_FILE, 'utf8');
    await atomicWrite(`${SNAPSHOT_FILE}.prev`, actual);
  } catch { /* aun no hay fichero: nada que conservar */ }
}

/**
 * Un estado vacio no puede llevarse por delante la unica copia de los datos.
 *
 * Vaciar el sistema es legitimo, asi que no se bloquea: se guarda antes una
 * copia aparte que la rotacion diaria no puede pisar. Esto cubre el caso real
 * en el que el navegador pierde su base y la aplicacion arranca en blanco.
 */
async function guardCatastrophicWrite(parsed) {
  const entranVacios = parsed.tasks.length === 0 && (parsed.projects || []).length === 0;
  if (!entranVacios) return;
  let previo;
  try {
    previo = JSON.parse(await fsp.readFile(SNAPSHOT_FILE, 'utf8'));
  } catch {
    return;
  }
  const habia = (previo.tasks || []).length + (previo.projects || []).length;
  if (!habia) return;
  const sello = new Date().toISOString().replace(/[:.]/g, '-');
  await atomicWrite(path.join(BACKUP_DIR, `gsd-antes-de-vaciar-${sello}.json`), JSON.stringify(previo));
  process.stderr.write(`aviso: se guardo copia previa (${habia} elementos) antes de escribir un estado vacio\n`);
}

/** Lista de copias disponibles, para poder recuperar desde la propia app. */
async function handleBackupsList(res) {
  let files = [];
  try {
    files = await fsp.readdir(BACKUP_DIR);
  } catch { /* sin carpeta todavia */ }

  const salida = [];
  const anadir = async (nombre, ruta, etiqueta) => {
    try {
      const st = await fsp.stat(ruta);
      const datos = JSON.parse(await fsp.readFile(ruta, 'utf8'));
      salida.push({
        name: nombre,
        label: etiqueta,
        savedAt: st.mtime.toISOString(),
        tasks: (datos.tasks || []).length,
        projects: (datos.projects || []).length,
      });
    } catch { /* fichero ilegible: no se ofrece */ }
  };

  await anadir('__prev__', `${SNAPSHOT_FILE}.prev`, 'versión anterior');
  for (const f of files.filter((x) => x.endsWith('.json')).sort().reverse()) {
    await anadir(f, path.join(BACKUP_DIR, f),
      f.startsWith('gsd-antes-de-vaciar') ? 'antes de un vaciado' : 'copia del día');
  }
  sendJson(res, 200, { backups: salida });
}

/** Contenido de una copia concreta. Solo de la carpeta de copias. */
async function handleBackupGet(res, nombre) {
  let ruta;
  if (nombre === '__prev__') ruta = `${SNAPSHOT_FILE}.prev`;
  else {
    if (!/^[A-Za-z0-9._-]+\.json$/.test(nombre)) return sendJson(res, 400, { error: 'nombre-invalido' });
    ruta = path.normalize(path.join(BACKUP_DIR, nombre));
    if (!ruta.startsWith(BACKUP_DIR + path.sep)) return sendJson(res, 403, { error: 'prohibido' });
  }
  try {
    send(res, 200, await fsp.readFile(ruta, 'utf8'), { 'Content-Type': MIME['.json'] });
  } catch {
    sendJson(res, 404, { error: 'no-existe' });
  }
}

/* ---------------------------------- Avisos ---------------------------------- */

/*
 * Los avisos los dispara este servidor, no el navegador: así llegan como
 * notificación de escritorio aunque el navegador esté cerrado, mientras GSD
 * esté en marcha. Se apuntan los ya enviados para no repetir nunca el mismo.
 *
 *   Linux    notify-send
 *   Windows  notificación nativa, lanzada con Windows PowerShell
 *
 * Si el sistema no puede, /api/health lo dice y avisa la propia página.
 */

let notifyAvailable = null;

/*
 * Notificación de Windows 10/11 sin instalar nada. El título y el texto viajan
 * en variables de entorno, nunca pegados dentro del script: así ningún texto
 * de una tarea puede convertirse en código. Se usa el identificador de Windows
 * PowerShell porque Windows solo muestra notificaciones de aplicaciones que
 * conoce, y esa viene con el sistema.
 */
const TOAST_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
  '$xml = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)',
  "$textos = $xml.GetElementsByTagName('text')",
  '$textos.Item(0).AppendChild($xml.CreateTextNode($env:GSD_AVISO_TITULO)) | Out-Null',
  '$textos.Item(1).AppendChild($xml.CreateTextNode($env:GSD_AVISO_TEXTO)) | Out-Null',
  '$aviso = [Windows.UI.Notifications.ToastNotification]::new($xml)',
  "$app = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'",
  '[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($app).Show($aviso)',
].join('\n');

const TOAST_CHECK = [
  "$ErrorActionPreference = 'Stop'",
  '[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null',
].join('\n');

/** PowerShell acepta el script en UTF-16LE y base64: sin problemas de comillas. */
const encodePs = (script) => Buffer.from(script, 'utf16le').toString('base64');

function powershell(script, env = {}, timeout = 20000) {
  return new Promise((resolve) => {
    execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePs(script)],
      { timeout, windowsHide: true, env: { ...process.env, ...env } },
      (err) => resolve(!err));
  });
}

function checkNotify() {
  if (WINDOWS) return powershell(TOAST_CHECK);
  return new Promise((resolve) => {
    execFile('notify-send', ['--version'], { timeout: 3000 }, (err) => resolve(!err));
  });
}

function notify(title, body, urgente) {
  if (WINDOWS) return powershell(TOAST_SCRIPT, { GSD_AVISO_TITULO: title, GSD_AVISO_TEXTO: body });
  return new Promise((resolve) => {
    const args = ['-a', 'GSD', '-u', urgente ? 'critical' : 'normal', '-i', ICON_FILE, title, body];
    execFile('notify-send', args, { timeout: 5000 }, (err) => resolve(!err));
  });
}

async function readSent() {
  try {
    const data = JSON.parse(await fsp.readFile(SENT_FILE, 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

/** "2026-09-12T09:00" en hora local → Date. */
function localDate(str) {
  const [d, t] = str.split('T');
  const [y, mo, da] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  return new Date(y, mo - 1, da, hh, mm, 0, 0);
}

async function checkReminders() {
  if (notifyAvailable === null) notifyAvailable = await checkNotify();
  if (!notifyAvailable) return;

  let datos;
  try {
    datos = JSON.parse(await fsp.readFile(SNAPSHOT_FILE, 'utf8'));
  } catch {
    return;
  }
  const proyectos = new Map((datos.projects || []).map((p) => [p.id, p]));
  const pausados = new Set((datos.projects || []).filter((p) => p.status === 'paused').map((p) => p.id));
  const enviados = await readSent();
  const ahora = Date.now();
  let cambios = false;

  for (const t of datos.tasks || []) {
    if (!t || t.completed || !t.reminder || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t.reminder)) continue;
    if (t.projectId && pausados.has(t.projectId)) continue;
    const clave = `${t.id}|${t.reminder}`;
    if (enviados[clave]) continue;

    const cuando = localDate(t.reminder).getTime();
    if (cuando > ahora) continue;

    enviados[clave] = new Date().toISOString();
    cambios = true;
    if (ahora - cuando > REMINDER_MAX_LATE_MS) continue;

    const p = proyectos.get(t.projectId);
    const etiqueta = p ? `${p.code ? `${p.code}-` : ''}${p.name}` : '';
    const tarde = ahora - cuando > 5 * 60 * 1000;
    const cuerpo = [
      t.title,
      etiqueta,
      t.deadline ? `Fecha tope: ${t.deadline.split('-').reverse().join('/')}` : '',
      tarde ? `(debía sonar a las ${t.reminder.slice(11, 16)})` : '',
    ].filter(Boolean).join('\n');
    const urgente = !!t.isOneThing || !!(t.deadline && t.deadline <= todayStamp());
    await notify(t.isOneThing ? 'GSD · Lo único' : 'GSD · Aviso', cuerpo, urgente);
  }

  // Limpieza: lo enviado hace más de 30 días ya no hace falta recordarlo.
  const limite = ahora - 30 * 24 * 60 * 60 * 1000;
  for (const [clave, fecha] of Object.entries(enviados)) {
    if (new Date(fecha).getTime() < limite) { delete enviados[clave]; cambios = true; }
  }
  if (cambios) {
    try { await atomicWrite(SENT_FILE, JSON.stringify(enviados)); } catch { /* reintenta en la próxima vuelta */ }
  }
}

async function handleSnapshotGet(res) {
  try {
    const text = await fsp.readFile(SNAPSHOT_FILE, 'utf8');
    send(res, 200, text, { 'Content-Type': MIME['.json'] });
  } catch {
    sendJson(res, 404, { error: 'sin-snapshot' });
  }
}

async function handleSnapshotPost(req, res) {
  let raw;
  try {
    raw = await readBody(req);
  } catch {
    return sendJson(res, 413, { error: 'cuerpo-demasiado-grande' });
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return sendJson(res, 400, { error: 'json-invalido' });
  }
  // Validacion minima: no sobrescribir un respaldo bueno con basura.
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.tasks)) {
    return sendJson(res, 400, { error: 'estructura-invalida' });
  }
  const text = JSON.stringify(parsed);
  try {
    await queueWrite(async () => {
      await fsp.mkdir(BACKUP_DIR, { recursive: true });
      await guardCatastrophicWrite(parsed);
      await keepPrevious();
      await atomicWrite(SNAPSHOT_FILE, text);
      await atomicWrite(path.join(BACKUP_DIR, `gsd-${todayStamp()}.json`), text);
      await rotateBackups();
    });
  } catch (err) {
    return sendJson(res, 500, { error: 'no-se-pudo-guardar', detail: String(err && err.message) });
  }
  sendJson(res, 200, { ok: true, savedAt: new Date().toISOString(), tasks: parsed.tasks.length });
}

async function serveStatic(req, res, urlPath) {
  let rel = decodeURIComponent(urlPath);
  if (rel === '/' || rel === '') rel = '/index.html';
  const target = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!target.startsWith(PUBLIC_DIR + path.sep) && target !== PUBLIC_DIR) {
    return send(res, 403, 'Prohibido');
  }
  try {
    const stat = await fsp.stat(target);
    if (stat.isDirectory()) return send(res, 404, 'No encontrado');
    const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
    const stream = fs.createReadStream(target);
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': stat.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    stream.pipe(res);
  } catch {
    send(res, 404, 'No encontrado');
  }
}

async function route(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (url.pathname === '/api/snapshot') {
    if (req.method === 'GET') return handleSnapshotGet(res);
    if (req.method === 'POST') return handleSnapshotPost(req, res);
    return sendJson(res, 405, { error: 'metodo-no-permitido' });
  }
  if (url.pathname === '/api/backups') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'metodo-no-permitido' });
    return handleBackupsList(res);
  }
  if (url.pathname.startsWith('/api/backups/')) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'metodo-no-permitido' });
    return handleBackupGet(res, decodeURIComponent(url.pathname.slice('/api/backups/'.length)));
  }
  if (url.pathname === '/api/health') {
    if (notifyAvailable === null) notifyAvailable = await checkNotify();
    return sendJson(res, 200, { ok: true, notify: notifyAvailable, dataDir: DATA_DIR, platform: process.platform });
  }
  if (req.method !== 'GET') return send(res, 405, 'Metodo no permitido');
  return serveStatic(req, res, url.pathname);
}

const server = http.createServer((req, res) => {
  route(req, res).catch((err) => {
    process.stderr.write(`error: ${err && err.stack ? err.stack : err}\n`);
    if (!res.headersSent) sendJson(res, 500, { error: String(err && err.message) });
    else res.end();
  });
});

// El servidor guarda los datos del usuario: no puede morirse por un fallo suelto.
process.on('uncaughtException', (err) => {
  process.stderr.write(`excepcion no capturada: ${err && err.stack ? err.stack : err}\n`);
});
process.on('unhandledRejection', (err) => {
  process.stderr.write(`promesa rechazada: ${err && err.stack ? err.stack : err}\n`);
});

fs.mkdirSync(BACKUP_DIR, { recursive: true });
/*
 * Si el puerto está ocupado, este proceso sobra: se cierra. Seguir vivo sin
 * escuchar dejaría un proceso fantasma disparando avisos en paralelo.
 */
server.on('error', (err) => {
  process.stderr.write(`no se puede escuchar en ${HOST}:${PORT}: ${err && err.code ? err.code : err}\n`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  // Los avisos solo empiezan cuando este proceso es de verdad el servidor.
  setInterval(() => { checkReminders().catch(() => {}); }, REMINDER_EVERY_MS);
  setTimeout(() => { checkReminders().catch(() => {}); }, 3000);
  process.stdout.write(`GSD escuchando en http://${HOST}:${PORT}\n`);
  process.stdout.write(`Datos en ${DATA_DIR}\n`);
});
