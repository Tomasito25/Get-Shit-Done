#!/usr/bin/env node
/*
 * Comprobación de sintaxis y de formato de todo el proyecto. Solo Node.
 *
 *   node dev/check.mjs
 *
 * Funciona igual en Linux y en Windows. Lo que depende de una herramienta
 * (bash, PowerShell) se comprueba si está instalada y se avisa si no.
 *
 * Por qué se copia cada módulo a .mjs: `node --check` no valida como módulo
 * ES un .js con import/export, se lo traga sin rechistar. Comprobar de verdad
 * o no comprobar.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (f) => path.relative(RAIZ, f).split(path.sep).join('/');
const fallos = [];
const avisos = [];
let revisados = 0;

function falla(fichero, motivo) { fallos.push(`${fichero}\n    ${String(motivo).trim().split('\n').join('\n    ')}`); }

function ejecutar(orden, args) {
  const r = spawnSync(orden, args, { encoding: 'utf8', windowsHide: true });
  if (r.error) return { existe: false };
  return { existe: true, ok: r.status === 0, salida: `${r.stdout || ''}${r.stderr || ''}` };
}

function recorrer(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const f = path.join(dir, e.name);
    return e.isDirectory() ? recorrer(f) : [f];
  });
}

/* ------------------------- JavaScript del navegador ------------------------ */

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gsd-check-'));
try {
  for (const f of recorrer(path.join(RAIZ, 'public', 'js')).filter((x) => x.endsWith('.js')).sort()) {
    revisados += 1;
    const copia = path.join(tmp, 'modulo.mjs');
    fs.copyFileSync(f, copia);
    const r = ejecutar(process.execPath, ['--check', copia]);
    if (!r.ok) falla(rel(f), r.salida.replaceAll(copia, rel(f)));
  }
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

/* --------------------------------- Node ----------------------------------- */

for (const f of ['server.js', ...fs.readdirSync(path.join(RAIZ, 'dev')).map((x) => path.join('dev', x))]) {
  if (!/\.(m?js)$/.test(f)) continue;
  revisados += 1;
  const r = ejecutar(process.execPath, ['--check', path.join(RAIZ, f)]);
  if (!r.ok) falla(f, r.salida);
}

/* ---------------------------- Formato de ficheros -------------------------- */

// Un start.sh con finales de línea de Windows no arranca en Linux, y un .cmd con
// BOM rompe su primera línea. .gitattributes lo evita; esto lo comprueba.
const formato = [
  { f: 'start.sh', crlf: false, bom: false },
  { f: 'start.ps1', crlf: true, bom: true },
  { f: 'GSD.cmd', crlf: true, bom: false },
  { f: 'Crear acceso directo.cmd', crlf: true, bom: false },
];
for (const { f, crlf, bom } of formato) {
  revisados += 1;
  const buf = fs.readFileSync(path.join(RAIZ, f));
  const tieneBom = buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf;
  const texto = buf.toString('utf8');
  const lineas = texto.split('\n').length - 1;
  const conCr = (texto.match(/\r\n/g) || []).length;
  if (tieneBom !== bom) falla(f, bom ? 'le falta el BOM UTF-8 (Windows PowerShell leería mal las tildes)' : 'no puede llevar BOM');
  if (crlf && conCr !== lineas) falla(f, 'debe tener finales de línea CRLF');
  if (!crlf && conCr > 0) falla(f, 'debe tener finales de línea LF (con CRLF no arranca en Linux)');
  if (f.endsWith('.cmd') && /[^\x00-\x7f]/.test(texto)) falla(f, 'solo puede llevar caracteres ASCII (cmd usa otra codificación)');
}

/* ------------------------------ Guiones de shell --------------------------- */

revisados += 1;
const bash = ejecutar('bash', ['-n', path.join(RAIZ, 'start.sh')]);
if (!bash.existe) avisos.push('bash no está instalado: start.sh sin comprobar');
else if (!bash.ok) falla('start.sh', bash.salida);

revisados += 1;
const ps1 = path.join(RAIZ, 'start.ps1').replaceAll("'", "''");
const parseo = `$e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile('${ps1}', [ref]$null, [ref]$e); if ($e) { $e | ForEach-Object { $_.ToString() }; exit 1 }`;
let ps = ejecutar('pwsh', ['-NoProfile', '-NonInteractive', '-Command', parseo]);
if (!ps.existe) ps = ejecutar('powershell', ['-NoProfile', '-NonInteractive', '-Command', parseo]);
if (!ps.existe) avisos.push('PowerShell no está instalado: start.ps1 sin comprobar');
else if (!ps.ok) falla('start.ps1', ps.salida);

/* --------------------------------- Informe --------------------------------- */

for (const a of avisos) console.log(`aviso: ${a}`);
if (fallos.length) {
  console.log(`\n${fallos.length} de ${revisados} comprobaciones fallan:\n`);
  for (const f of fallos) console.log(`  ✗ ${f}\n`);
  process.exit(1);
}
console.log(`SINTAXIS Y FORMATO OK — ${revisados} comprobaciones.`);
