#!/usr/bin/env node
/*
 * Prueba de humo del servidor: lo arranca de verdad, en un puerto libre y con
 * una carpeta de datos temporal, y comprueba lo que no puede fallar nunca:
 * que sirve la aplicación, que no sirve nada fuera de ella, y que los datos
 * se guardan, se copian y se protegen.
 *
 *   node dev/smoke.mjs
 *
 * No toca tus datos: todo ocurre en una carpeta temporal que se borra al final.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATOS = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-smoke-'));
const resultados = [];

const puertoLibre = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

/** Petición cruda: la ruta va tal cual, sin que el cliente la normalice. */
function pedir(puerto, metodo, ruta, cuerpo = null) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: puerto, method: metodo, path: ruta,
      headers: cuerpo ? { 'Content-Type': 'application/json' } : {} }, (res) => {
      const trozos = [];
      res.on('data', (c) => trozos.push(c));
      res.on('end', () => resolve({ status: res.statusCode, tipo: res.headers['content-type'] || '', texto: Buffer.concat(trozos).toString('utf8') }));
    });
    req.on('error', reject);
    req.setTimeout(10000, () => req.destroy(new Error('sin respuesta')));
    if (cuerpo) req.write(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
    req.end();
  });
}

async function prueba(nombre, fn) {
  try {
    await fn();
    resultados.push({ nombre, ok: true });
  } catch (err) {
    resultados.push({ nombre, ok: false, motivo: err && err.message ? err.message : String(err) });
  }
}

function afirma(cond, mensaje) { if (!cond) throw new Error(mensaje); }
const hoy = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };

const puerto = await puertoLibre();
const servidor = spawn(process.execPath, [path.join(RAIZ, 'server.js'), '--port', String(puerto)], {
  env: { ...process.env, GSD_DATA_DIR: DATOS },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});
let registro = '';
servidor.stdout.on('data', (c) => { registro += c; });
servidor.stderr.on('data', (c) => { registro += c; });

try {
  // Espera a que escuche.
  let listo = false;
  for (let i = 0; i < 100 && !listo; i++) {
    try { listo = (await pedir(puerto, 'GET', '/api/health')).status === 200; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  afirma(listo, `el servidor no arrancó:\n${registro}`);

  await prueba('salud: responde y dice dónde guarda', async () => {
    const r = JSON.parse((await pedir(puerto, 'GET', '/api/health')).texto);
    afirma(r.ok === true, 'ok no es true');
    afirma(path.resolve(r.dataDir) === path.resolve(DATOS), `dataDir inesperado: ${r.dataDir}`);
    console.log(`  (avisos de escritorio en ${process.platform}: ${r.notify ? 'disponibles' : 'no disponibles'})`);
  });

  await prueba('sirve la aplicación', async () => {
    const r = await pedir(puerto, 'GET', '/');
    afirma(r.status === 200 && r.texto.includes('<title>GSD</title>'), `/ devolvió ${r.status}`);
    const js = await pedir(puerto, 'GET', '/js/app.js');
    afirma(js.status === 200 && js.tipo.startsWith('text/javascript'), `/js/app.js devolvió ${js.status} ${js.tipo}`);
    const ico = await pedir(puerto, 'GET', '/icon.ico');
    afirma(ico.status === 200 && ico.tipo === 'image/x-icon', `/icon.ico devolvió ${ico.status}`);
  });

  await prueba('no sirve nada fuera de public/', async () => {
    for (const ruta of ['/../server.js', '/%2e%2e/server.js', '/..%2fserver.js', '/..%5cserver.js', '/%2e%2e%5c%2e%2e%5cserver.js', '/js/../../server.js']) {
      const r = await pedir(puerto, 'GET', ruta);
      afirma(r.status !== 200 && !r.texto.includes('createServer'), `${ruta} devolvió ${r.status}`);
    }
  });

  await prueba('guarda el estado en disco', async () => {
    const r = await pedir(puerto, 'POST', '/api/snapshot', { tasks: [{ id: 'a', title: 'uno' }], projects: [] });
    afirma(r.status === 200, `POST devolvió ${r.status}: ${r.texto}`);
    const leido = JSON.parse((await pedir(puerto, 'GET', '/api/snapshot')).texto);
    afirma(leido.tasks.length === 1, 'no se lee lo guardado');
    afirma(fs.existsSync(path.join(DATOS, 'gsd-data.json')), 'falta gsd-data.json');
    afirma(fs.existsSync(path.join(DATOS, 'backups', `gsd-${hoy()}.json`)), 'falta la copia del día');
  });

  await prueba('conserva la versión anterior', async () => {
    await pedir(puerto, 'POST', '/api/snapshot', { tasks: [{ id: 'a', title: 'uno' }, { id: 'b', title: 'dos' }], projects: [] });
    const prev = JSON.parse(fs.readFileSync(path.join(DATOS, 'gsd-data.json.prev'), 'utf8'));
    afirma(prev.tasks.length === 1, `.prev tiene ${prev.tasks.length} tareas, esperaba 1`);
  });

  await prueba('un estado vacío no se lleva los datos por delante', async () => {
    await pedir(puerto, 'POST', '/api/snapshot', { tasks: [], projects: [] });
    const copia = fs.readdirSync(path.join(DATOS, 'backups')).find((f) => f.startsWith('gsd-antes-de-vaciar-'));
    afirma(copia, 'no se guardó la copia de antes del vaciado');
    const datos = JSON.parse(fs.readFileSync(path.join(DATOS, 'backups', copia), 'utf8'));
    afirma(datos.tasks.length === 2, 'la copia de antes del vaciado no tiene las 2 tareas');
  });

  await prueba('lista y entrega copias, y solo copias', async () => {
    const lista = JSON.parse((await pedir(puerto, 'GET', '/api/backups')).texto);
    afirma(Array.isArray(lista.backups) && lista.backups.length >= 2, 'lista de copias incompleta');
    afirma((await pedir(puerto, 'GET', '/api/backups/__prev__')).status === 200, 'no entrega la versión anterior');
    const fuera = await pedir(puerto, 'GET', '/api/backups/..%2f..%2fserver.js');
    afirma(fuera.status === 400 || fuera.status === 403, `una copia fuera de la carpeta devolvió ${fuera.status}`);
  });

  await prueba('rechaza lo que no es un estado', async () => {
    afirma((await pedir(puerto, 'POST', '/api/snapshot', '{roto')).status === 400, 'JSON roto aceptado');
    afirma((await pedir(puerto, 'POST', '/api/snapshot', { nada: true })).status === 400, 'estructura inválida aceptada');
    const ahora = JSON.parse(fs.readFileSync(path.join(DATOS, 'gsd-data.json'), 'utf8'));
    afirma(Array.isArray(ahora.tasks), 'lo rechazado estropeó el fichero');
  });

  await prueba('guardados simultáneos no se pisan', async () => {
    const envios = Array.from({ length: 12 }, (_, i) => pedir(puerto, 'POST', '/api/snapshot', { tasks: Array.from({ length: i + 1 }, (_, k) => ({ id: `t${k}` })), projects: [] }));
    const r = await Promise.all(envios);
    afirma(r.every((x) => x.status === 200), 'algún guardado simultáneo falló');
    const final = JSON.parse(fs.readFileSync(path.join(DATOS, 'gsd-data.json'), 'utf8'));
    afirma(final.tasks.length === 12, `quedaron ${final.tasks.length} tareas, esperaba 12 (el último)`);
    const restos = fs.readdirSync(DATOS).filter((f) => f.endsWith('.tmp'));
    afirma(!restos.length, `quedaron temporales: ${restos.join(', ')}`);
  });
} finally {
  servidor.kill();
  await new Promise((r) => setTimeout(r, 300));
  fs.rmSync(DATOS, { recursive: true, force: true });
}

/* --------------------------- Avisos de hábitos ---------------------------- */

// Se sustituye notify-send por un guion que apunta cada aviso en un fichero:
// así se comprueba qué avisaría el servidor sin mandar nada al escritorio.
// En Windows el aviso va por PowerShell y no se puede interceptar así.
if (process.platform !== 'win32') {
  const caja = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-avisos-'));
  const bin = path.join(caja, 'bin');
  const datos = path.join(caja, 'datos');
  const registroAvisos = path.join(caja, 'avisos.log');
  fs.mkdirSync(bin);
  fs.mkdirSync(datos);
  fs.writeFileSync(path.join(bin, 'notify-send'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${registroAvisos}'\n`, { mode: 0o755 });

  const d = hoy();
  const dia = new Date().getDay();
  const otroDia = (dia + 1) % 7;
  const manana = (() => { const x = new Date(); x.setDate(x.getDate() + 1); const p = (n) => String(n).padStart(2, '0'); return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`; })();
  const base = { cue: '', start: d, kind: 'check', log: {}, pauses: [], createdAt: new Date().toISOString() };
  const habitos = [
    { ...base, id: 'h1', title: 'TOCA-Y-AVISA', cue: 'después de comer', days: [dia], time: '00:00' },
    { ...base, id: 'h2', title: 'YA-HECHO', days: [dia], time: '00:00', log: { [d]: 1 } },
    { ...base, id: 'h3', title: 'EN-PAUSA', days: [dia], time: '00:00', pauses: [{ from: d, to: null }] },
    { ...base, id: 'h4', title: 'OTRO-DIA', days: [otroDia], time: '00:00' },
    { ...base, id: 'h5', title: 'EMPIEZA-MANANA', days: [dia], time: '00:00', start: manana },
    { ...base, id: 'h6', title: 'SIN-HORA', days: [dia], time: null },
    // Formato de la primera versión: la lista de días hechos.
    { ...base, id: 'h7', title: 'HECHO-FORMATO-VIEJO', days: [dia], time: '00:00', log: undefined, done: [d] },
    { ...base, id: 'h8', title: 'CANTIDAD-A-MEDIAS', kind: 'amount', target: 20, unit: 'páginas', days: [dia], time: '00:00', log: { [d]: 12 } },
    { ...base, id: 'h9', title: 'CANTIDAD-CUMPLIDA', kind: 'amount', target: 20, days: [dia], time: '00:00', log: { [d]: 20 } },
    { ...base, id: 'h10', title: 'LIMITE-AGUANTANDO', kind: 'limit', target: 2, unit: 'cafés', days: [dia], time: '00:00', log: { [d]: 1 } },
    { ...base, id: 'h11', title: 'LIMITE-PASADO', kind: 'limit', target: 2, days: [dia], time: '00:00', log: { [d]: 3 } },
    { ...base, id: 'h12', title: 'DEJARLO-LIMPIO', kind: 'quit', days: [dia], time: '00:00' },
    { ...base, id: 'h13', title: 'DEJARLO-CAIDO', kind: 'quit', days: [dia], time: '00:00', log: { [d]: 1 } },
  ];
  fs.writeFileSync(path.join(datos, 'gsd-data.json'), JSON.stringify({ version: 1, tasks: [], projects: [], meta: [{ id: 'settings', habits: habitos }] }));

  const puertoAvisos = await puertoLibre();
  const conAvisos = spawn(process.execPath, [path.join(RAIZ, 'server.js'), '--port', String(puertoAvisos)], {
    env: { ...process.env, GSD_DATA_DIR: datos, PATH: `${bin}${path.delimiter}${process.env.PATH}` },
    stdio: 'ignore',
  });
  const leer = () => (fs.existsSync(registroAvisos) ? fs.readFileSync(registroAvisos, 'utf8') : '');
  try {
    await prueba('avisa de un hábito a su hora, solo los días que toca y si queda algo por hacer', async () => {
      // La primera vuelta de avisos es a los 3 s de arrancar.
      for (let i = 0; i < 100 && !leer().includes('DEJARLO-LIMPIO'); i++) await new Promise((r) => setTimeout(r, 100));
      await new Promise((r) => setTimeout(r, 500));
      const avisos = leer();
      afirma(avisos.includes('GSD · Hábito') && avisos.includes('TOCA-Y-AVISA'), `no avisó del hábito que tocaba:\n${avisos}`);
      afirma(avisos.includes('después de comer'), 'el aviso no lleva el cuándo y dónde');
      afirma(avisos.includes('Llevas 12 de 20 páginas'), `el aviso de cantidad no dice cuánto llevas:\n${avisos}`);
      afirma(avisos.includes('Como mucho 2 cafés · llevas 1'), `el aviso de límite no dice cuánto llevas:\n${avisos}`);
      afirma(avisos.includes('Hoy no: DEJARLO-LIMPIO'), `el aviso de dejarlo no dice «hoy no»:\n${avisos}`);
      for (const nombre of ['YA-HECHO', 'EN-PAUSA', 'OTRO-DIA', 'EMPIEZA-MANANA', 'SIN-HORA', 'HECHO-FORMATO-VIEJO', 'CANTIDAD-CUMPLIDA', 'LIMITE-PASADO', 'DEJARLO-CAIDO']) {
        afirma(!avisos.includes(nombre), `avisó de ${nombre}, que no tocaba`);
      }
      const enviados = JSON.parse(fs.readFileSync(path.join(datos, 'avisos-enviados.json'), 'utf8'));
      afirma(Object.keys(enviados).some((k) => k.startsWith('habito|h1|')), 'no apuntó el aviso enviado: lo repetiría');
    });
  } finally {
    conAvisos.kill();
    await new Promise((r) => setTimeout(r, 300));
    fs.rmSync(caja, { recursive: true, force: true });
  }
}

for (const r of resultados) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.nombre}${r.ok ? '' : `\n      ${r.motivo}`}`);
const malas = resultados.filter((r) => !r.ok).length;
console.log(malas ? `\n${malas} de ${resultados.length} pruebas fallan.` : `\nSERVIDOR OK — ${resultados.length} pruebas en ${process.platform}.`);
process.exit(malas ? 1 : 0);
