#!/usr/bin/env node
/*
 * Prueba del arrancador de este sistema: start.sh en Linux, GSD.cmd en Windows.
 * Arranca, comprueba, instala el acceso directo, lo quita y detiene.
 *
 *   node dev/launcher.mjs
 *
 * Usa un puerto libre y una carpeta de datos temporal, así que no toca una GSD
 * que tengas en marcha. En Linux también usa un HOME temporal para el icono;
 * en Windows el acceso directo solo se prueba dentro de CI, porque iría a tu
 * escritorio de verdad.
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WINDOWS = process.platform === 'win32';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-lanzador-'));
const resultados = [];

const puerto = await new Promise((resolve) => {
  const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

const env = { ...process.env, PORT: String(puerto), GSD_DATA_DIR: path.join(TMP, 'datos'), GSD_NO_BROWSER: '1' };
if (!WINDOWS) {
  env.HOME = path.join(TMP, 'home');
  fs.mkdirSync(env.HOME, { recursive: true });
  // Sin sesión gráfica: que los mensajes no acaben como notificaciones reales.
  delete env.DBUS_SESSION_BUS_ADDRESS;
}

function lanzar(accion) {
  const r = WINDOWS
    ? spawnSync('cmd.exe', ['/d', '/c', path.join(RAIZ, 'GSD.cmd'), accion], { env, encoding: 'utf8', windowsHide: true, timeout: 60000 })
    : spawnSync('bash', [path.join(RAIZ, 'start.sh'), accion], { env, encoding: 'utf8', timeout: 60000 });
  return { codigo: r.status, salida: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

const salud = () => new Promise((resolve) => {
  http.get(`http://127.0.0.1:${puerto}/api/health`, (res) => { res.resume(); resolve(res.statusCode === 200); })
    .on('error', () => resolve(false)).setTimeout(2000, function corta() { this.destroy(); });
});

async function prueba(nombre, fn) {
  try { await fn(); resultados.push({ nombre, ok: true }); }
  catch (err) { resultados.push({ nombre, ok: false, motivo: err.message }); }
}
const afirma = (c, m) => { if (!c) throw new Error(m); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await prueba('arranca', async () => {
    const r = lanzar('start');
    afirma(r.codigo === 0, `código ${r.codigo}: ${r.salida}`);
    afirma(await salud(), 'dice que arranca pero no responde');
    const log = path.join(env.GSD_DATA_DIR, 'server.log');
    for (let i = 0; i < 20 && !(fs.existsSync(log) && fs.readFileSync(log, 'utf8').includes('escuchando')); i++) await espera(150);
    afirma(fs.existsSync(log) && fs.readFileSync(log, 'utf8').includes('escuchando'), 'el servidor no escribe su registro en server.log');
  });

  await prueba('sobrevive a su propia ventana', async () => {
    await espera(1500);
    afirma(await salud(), 'el servidor murió al terminar el arrancador');
  });

  await prueba('status dice que está en marcha', async () => {
    const r = lanzar('status');
    afirma(r.codigo === 0, `código ${r.codigo}: ${r.salida}`);
  });

  await prueba('arrancar dos veces no duplica', async () => {
    const r = lanzar('start');
    afirma(r.codigo === 0 && /ya estaba/i.test(r.salida), `código ${r.codigo}: ${r.salida}`);
  });

  if (!WINDOWS || process.env.CI) {
    await prueba('install crea el acceso directo', async () => {
      const r = lanzar('install');
      afirma(r.codigo === 0, `código ${r.codigo}: ${r.salida}`);
      if (WINDOWS) {
        const escritorio = spawnSync('powershell.exe', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Desktop')"], { encoding: 'utf8' }).stdout.trim();
        afirma(fs.existsSync(path.join(escritorio, 'GSD.lnk')), `no está ${path.join(escritorio, 'GSD.lnk')}`);
      } else {
        const menu = path.join(env.HOME, '.local', 'share', 'applications', 'gsd.desktop');
        afirma(fs.existsSync(menu), 'no está el .desktop del menú');
        afirma(fs.readFileSync(menu, 'utf8').includes(`Exec="${path.join(RAIZ, 'start.sh')}"`), 'el .desktop no apunta a este start.sh');
      }
    });

    await prueba('uninstall lo quita', async () => {
      const r = lanzar('uninstall');
      afirma(r.codigo === 0, `código ${r.codigo}: ${r.salida}`);
      if (!WINDOWS) afirma(!fs.existsSync(path.join(env.HOME, '.local', 'share', 'applications', 'gsd.desktop')), 'sigue el .desktop');
    });
  }

  await prueba('stop lo detiene', async () => {
    const r = lanzar('stop');
    afirma(r.codigo === 0, `código ${r.codigo}: ${r.salida}`);
    for (let i = 0; i < 20 && await salud(); i++) await espera(150);
    afirma(!(await salud()), 'sigue respondiendo después de stop');
  });

  await prueba('status dice que está parado (código 3)', async () => {
    const r = lanzar('status');
    afirma(r.codigo === 3, `código ${r.codigo}: ${r.salida}`);
  });

  await prueba('con el pid perdido, stop encuentra su servidor y respeta otra instancia', async () => {
    // Otra GSD de esta misma carpeta, en otro puerto: no es asunto de este stop.
    const otroPuerto = await new Promise((resolve) => {
      const s = net.createServer().listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
    });
    const otra = spawn(process.execPath, [path.join(RAIZ, 'server.js'), '--port', String(otroPuerto)], {
      env: { ...env, GSD_DATA_DIR: path.join(TMP, 'otra') }, stdio: 'ignore', windowsHide: true,
    });
    try {
      const saludOtra = () => new Promise((resolve) => {
        http.get(`http://127.0.0.1:${otroPuerto}/api/health`, (res) => { res.resume(); resolve(res.statusCode === 200); })
          .on('error', () => resolve(false));
      });
      for (let i = 0; i < 40 && !(await saludOtra()); i++) await espera(150);
      afirma(await saludOtra(), 'la otra instancia no arrancó');

      afirma(lanzar('start').codigo === 0 && await salud(), 'no volvió a arrancar');
      fs.rmSync(path.join(env.GSD_DATA_DIR, 'server.pid'), { force: true });
      afirma(lanzar('stop').codigo === 0, 'stop falló');
      for (let i = 0; i < 20 && await salud(); i++) await espera(150);
      afirma(!(await salud()), 'no encontró su propio servidor sin el pid');
      afirma(await saludOtra(), 'mató también la instancia del otro puerto');
    } finally {
      otra.kill();
    }
  });

  await prueba('orden desconocida (código 2)', async () => {
    afirma(lanzar('volar').codigo === 2, 'no devolvió 2');
  });
} finally {
  lanzar('stop');
  fs.rmSync(TMP, { recursive: true, force: true });
}

for (const r of resultados) console.log(`${r.ok ? '  ✓' : '  ✗'} ${r.nombre}${r.ok ? '' : `\n      ${r.motivo}`}`);
const malas = resultados.filter((r) => !r.ok).length;
console.log(malas ? `\n${malas} de ${resultados.length} pruebas fallan.` : `\nARRANCADOR OK — ${resultados.length} pruebas en ${process.platform}.`);
process.exit(malas ? 1 : 0);
