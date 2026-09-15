/*
 * GSD — GET SHIT DONE.
 *
 * Capture everything. Clarify everything. Commit to little.
 * Focus on what matters. Do the hard thing. Review the system. Repeat.
 *
 * Router, navegacion y teclado. Toda la aplicacion se puede usar sin raton.
 */

import { add, $, $$, h, isTyping, toast, iso } from './util.js';
import * as S from './store.js';
import * as focus from './focus.js';
import * as search from './search.js';
import * as viewkeys from './viewkeys.js';
import { openCapture, closeTop, anyOpen, openSheet, sheet, openEditor, pickTask, askOneThing } from './components.js';

import * as today from './views/today.js';
import * as inbox from './views/inbox.js';
import * as lists from './views/lists.js';
import * as projects from './views/projects.js';
import * as board from './views/board.js';
import * as calendar from './views/calendar.js';
import * as notes from './views/notes.js';
import * as review from './views/review.js';
import * as data from './views/data.js';
import * as config from './views/config.js';

/* --------------------------------- Rutas --------------------------------- */

const NAV = [
  { hash: '#/hoy', label: 'HOY', short: 'HOY', key: 'T', count: () => S.todayList().length + S.inbox().length },
  { hash: '#/tablero', label: 'TABLERO', short: 'TAB', key: 'B', count: () => S.nextActions().length },
  { hash: '#/proyectos', label: 'PROYECTOS', short: 'PRO', key: 'P', count: () => S.activeProjects().length },
  { sep: true },
  { hash: '#/next', label: 'SIGUIENTES ACCIONES', short: 'SIG' },
  { hash: '#/waiting', label: 'EN ESPERA', short: 'ESP', key: 'W', count: () => S.waitingList().length },
  { hash: '#/someday', label: 'ALGÚN DÍA', short: 'ALG', key: 'S', count: () => S.somedayList().length },
  { hash: '#/notas', label: 'ANOTACIONES', short: 'NOT', key: 'A', count: () => S.noteList().length },
  { hash: '#/calendario', label: 'CALENDARIO', short: 'CAL', key: 'C' },
  { sep: true },
  { hash: '#/review', label: 'REVISIÓN SEMANAL', short: 'REV', key: 'R' },
  { hash: '#/datos', label: 'DATOS', short: 'DAT' },
  { hash: '#/config', label: 'CONFIGURACIÓN', short: 'CFG' },
];

function resolve() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [head, ...rest] = raw.split('/').filter(Boolean);
  switch (head) {
    case 'inbox': return { view: inbox.render, nav: '#/hoy' };
    case 'tablero': return {
      view: () => board.render({ context: rest[0] ? decodeURIComponent(rest[0]) : null }),
      nav: '#/tablero',
    };
    case 'next': return { view: () => lists.next({ context: rest[0] ? decodeURIComponent(rest[0]) : null }), nav: '#/next' };
    case 'proyectos': return rest[0]
      ? { view: () => board.render({ projectId: rest[0] }), nav: '#/proyectos' }
      : { view: projects.list, nav: '#/proyectos' };
    case 'waiting': return { view: lists.waiting, nav: '#/waiting' };
    case 'someday': return { view: lists.someday, nav: '#/someday' };
    case 'notas': return { view: notes.render, nav: '#/notas' };
    case 'calendario': return { view: calendar.render, nav: '#/calendario' };
    case 'review': return { view: review.render, nav: '#/review' };
    case 'datos': return { view: data.render, nav: '#/datos' };
    case 'config': return { view: config.render, nav: '#/config' };
    case 'hoy':
    default: return { view: today.render, nav: '#/hoy' };
  }
}

/* ------------------------------- Renderizado ----------------------------- */

let currentNav = '#/hoy';
let cursor = -1;

function renderNav() {
  const box = $('#nav-list');
  box.textContent = '';
  for (const item of NAV) {
    if (item.sep) { add(box, h('div', { class: 'nav-sep' })); continue; }
    const n = item.count ? item.count() : null;
    add(box, h('a', {
      class: `nav-item${currentNav === item.hash ? ' on' : ''}`,
      href: item.hash,
      title: item.label,
    },
      h('span', { class: 'nav-full', text: item.label }),
      h('span', { class: 'nav-short', text: item.short }),
      n ? h('span', { class: 'nav-count', text: String(n) }) : (item.key ? h('span', { class: 'nav-key', text: item.key }) : null)));
  }
}

function render() {
  if (focus.isOpen()) return;
  const route = resolve();
  currentNav = route.nav;
  const y = window.scrollY;

  // Un guardado no puede robar el foco a quien esta escribiendo.
  const act = document.activeElement;
  const keep = act && act.dataset ? act.dataset.keepFocus : null;
  const caret = keep && act.selectionStart !== undefined ? act.selectionStart : null;

  const main = $('#main');
  main.textContent = '';
  add(main, route.view());
  renderNav();
  window.scrollTo(0, y);

  if (keep) {
    const el = main.querySelector(`[data-keep-focus="${keep}"]`);
    if (el) {
      el.focus();
      if (caret !== null && el.setSelectionRange) {
        const at = Math.min(caret, el.value.length);
        el.setSelectionRange(at, at);
      }
    }
  }
  applyCursor();
}

/* -------------------------- Cursor de teclado ---------------------------- */

const rows = () => $$('#main .row[data-task-id]');

function applyCursor() {
  const list = rows();
  if (cursor >= list.length) cursor = list.length - 1;
  list.forEach((el, i) => el.classList.toggle('cursor', i === cursor));
}

function moveCursor(delta) {
  const list = rows();
  if (!list.length) return;
  cursor = cursor < 0
    ? (delta > 0 ? 0 : list.length - 1)
    : Math.min(list.length - 1, Math.max(0, cursor + delta));
  applyCursor();
  list[cursor].scrollIntoView({ block: 'nearest' });
}

const cursorTask = () => {
  const el = rows()[cursor];
  return el ? S.byId(el.dataset.taskId) : null;
};

/* --------------------------------- Teclado ------------------------------- */

const GO = {
  t: '#/hoy', i: '#/inbox', b: '#/tablero', p: '#/proyectos',
  w: '#/waiting', s: '#/someday', c: '#/calendario', r: '#/review',
  a: '#/notas',
};

function startFocus() {
  const one = S.oneThing();
  const target = one || S.todayList()[0] || S.nextActions()[0];
  if (!target) { toast('Nada que ejecutar. Captura algo primero.'); return; }
  focus.open(target.id);
}

function startDeep() {
  const one = S.oneThing();
  const target = one || S.todayList()[0] || S.nextActions()[0];
  if (!target) { toast('Nada que ejecutar. Captura algo primero.'); return; }
  focus.openDeep(target.id);
}

function chooseOneThing() {
  const one = S.oneThing();
  if (one) { location.hash = '#/hoy'; toast(`One Thing: ${one.title}`); return; }
  pickTask({
    title: '¿Cuál es la única cosa?',
    tasks: [...S.nextActions(), ...S.inbox()],
    empty: 'No hay nada que elegir.',
    onPick: (t) => askOneThing(t.id),
  });
}

document.addEventListener('keydown', (e) => {
  // Dentro de Focus no hay navegacion. Solo trabajar o salir.
  if (focus.isOpen()) {
    if (e.key === 'Escape') { e.preventDefault(); focus.requestExit(); }
    return;
  }

  if (e.key === 'Escape') {
    if (anyOpen()) { e.preventDefault(); closeTop(); return; }
    if (viewkeys.run(e)) { e.preventDefault(); return; }
    if (cursor >= 0) { cursor = -1; applyCursor(); }
    return;
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (anyOpen()) closeTop();
    search.open();
    return;
  }

  if (isTyping() || anyOpen() || e.ctrlKey || e.metaKey || e.altKey) return;
  if (viewkeys.run(e)) { e.preventDefault(); return; }

  const k = e.key.toLowerCase();

  if (k === 'arrowdown' || k === 'j') { e.preventDefault(); moveCursor(1); return; }
  if (k === 'arrowup' || k === 'k') { e.preventDefault(); moveCursor(-1); return; }

  if (e.key === ' ') {
    const t = cursorTask();
    if (t) { e.preventDefault(); S.toggleComplete(t.id); }
    return;
  }
  if (e.key === 'Enter') {
    const t = cursorTask();
    if (t) { e.preventDefault(); openEditor(t.id); }
    return;
  }

  if (e.key === '\\') { e.preventDefault(); toggleSidebar(); return; }
  if (k === 'n') { e.preventDefault(); openCapture(); return; }
  if (k === 'd') { e.preventDefault(); startDeep(); return; }
  if (k === 'f') { e.preventDefault(); startFocus(); return; }
  if (k === 'o') { e.preventDefault(); chooseOneThing(); return; }
  if (k === '/') { e.preventDefault(); search.open(); return; }
  if (k === '?') { e.preventDefault(); openHelp(); return; }
  if (GO[k]) { e.preventDefault(); location.hash = GO[k]; }
});

/* ---------------------------------- Ayuda -------------------------------- */

const KEYS = [
  ['N', 'Nueva tarea (captura rápida)'],
  ['T', 'Hoy · bandeja y compromisos'],
  ['B', 'Tablero'],
  ['I', 'Aclarar la bandeja'],
  ['F', 'Enfoque sobre lo único'],
  ['D', 'Trabajo profundo'],
  ['O', 'Elegir lo único'],
  ['P', 'Proyectos'],
  ['W', 'En espera'],
  ['S', 'Algún día'],
  ['A', 'Anotaciones · información, no trabajo'],
  ['C', 'Calendario'],
  ['R', 'Revisión semanal'],
  ['\\', 'Plegar la barra lateral'],
  ['/', 'Buscar'],
  ['Ctrl K', 'Buscar'],
  ['↑ ↓ · J K', 'Mover el cursor por la lista'],
  ['Espacio', 'Completar la tarea del cursor'],
  ['Enter', 'Abrir / confirmar'],
  ['1 – 6', 'Aclarar la bandeja'],
  ['← →', 'Mover la tarjeta de columna'],
  ['Esc', 'Salir'],
];

/** La sintaxis de captura, junto a los atajos: se aprende una vez. */
const SINTAXIS = [
  ['@casa', 'contexto'],
  ['#P04', 'proyecto por código, o por nombre (#fisica); lo crea si no existe'],
  ['!mañana', 'cuándo lo haces — hoy · mañana · lun · +3d · 12/09'],
  ['^20/09', 'fecha tope — el día en que deja de servir'],
  ['%18:00', 'aviso — %9 · %mañana-9 · %lun-18:30'],
  ['*lun,jue', 'repetición — diario · 3d · lun,jue · mes-1'],
  ['!!', 'no negociar: compromiso del día'],
];

function openHelp() {
  openSheet(sheet({
    title: 'Atajos y captura',
    body: h('div', {},
      h('div', { class: 'keys' }, KEYS.map(([k, d]) => [h('kbd', { text: k }), h('span', { text: d })])),
      h('div', { class: 'sec-head', style: 'margin-top:26px' },
        h('div', { class: 'sec-title', text: 'ESCRIBIR AL CAPTURAR' })),
      h('div', { class: 'keys' }, SINTAXIS.map(([k, d]) => [h('kbd', { text: k }), h('span', { text: d })])),
      h('div', { class: 'micro', style: 'margin-top:16px', text: 'SIN DETALLES VA AL INBOX. CON DETALLES, YA ESTÁ DECIDIDA.' })),
  }));
}

/* ---------------------------------- Tema --------------------------------- */

function applyTheme() {
  document.documentElement.dataset.theme = (S.state.settings && S.state.settings.theme) || 'system';
}

function applySidebar() {
  const plegada = S.state.settings && S.state.settings.sidebar === 'collapsed';
  document.body.classList.toggle('nav-collapsed', !!plegada);
  const btn = $('#btn-nav');
  if (btn) btn.title = plegada ? 'Desplegar la barra (\\)' : 'Plegar la barra (\\)';
}

function toggleSidebar() {
  const plegada = S.state.settings && S.state.settings.sidebar === 'collapsed';
  S.saveSettings({ sidebar: plegada ? 'open' : 'collapsed' }).then(applySidebar);
}

/* ---------------------------------- Avisos -------------------------------- */

/**
 * Los avisos los lanza el servidor local como notificación de escritorio.
 * Solo si el sistema no lo permite, avisa la propia página mientras está
 * abierta. Nunca las dos cosas a la vez: un aviso repetido se ignora.
 */
async function vigilarAvisos() {
  let servidorAvisa = true;
  try {
    const r = await fetch('/api/health', { cache: 'no-store' });
    servidorAvisa = !!(await r.json()).notify;
  } catch { servidorAvisa = true; }
  if (servidorAvisa) return;

  const vistos = new Set();
  const yaVisto = (clave) => {
    if (vistos.has(clave)) return true;
    try { return localStorage.getItem(`aviso:${clave}`) === '1'; } catch { return false; }
  };
  const marcar = (clave) => {
    vistos.add(clave);
    try { localStorage.setItem(`aviso:${clave}`, '1'); } catch { /* sin almacenamiento */ }
  };

  const revisar = () => {
    const ahora = new Date();
    const sello = `${iso(ahora)}T${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
    for (const t of S.active()) {
      if (!t.reminder || t.reminder > sello) continue;
      const clave = `${t.id}|${t.reminder}`;
      if (yaVisto(clave)) continue;
      marcar(clave);
      const [d, hm] = t.reminder.split('T');
      const [y, mo, da] = d.split('-').map(Number);
      const [hh, mm] = hm.split(':').map(Number);
      if (Date.now() - new Date(y, mo - 1, da, hh, mm).getTime() > 24 * 3600 * 1000) continue;
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('GSD · Aviso', { body: t.title });
      } else {
        toast(`Aviso: ${t.title}`);
      }
    }
  };
  if ('Notification' in window && Notification.permission === 'default') {
    document.addEventListener('pointerdown', () => { Notification.requestPermission().catch(() => {}); }, { once: true });
  }
  revisar();
  setInterval(revisar, 30 * 1000);
}

/* --------------------------------- Arranque ------------------------------ */

async function main() {
  try {
    await S.boot();
  } catch (err) {
    $('#main').append(h('div', { class: 'wrap' },
      h('div', { class: 'notice notice-warn' },
        h('div', { class: 'notice-title', text: 'NO SE PUEDE ABRIR EL ALMACÉN' }),
        h('div', { class: 'notice-body', text: String(err && err.message ? err.message : err) }),
        h('div', { class: 'notice-body', style: 'margin-top:8px', text: 'Cierra las demás pestañas de GSD y vuelve a intentarlo. Tus datos siguen en disco.' }),
        h('div', { class: 'notice-acts' },
          h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'REINTENTAR', onclick: () => location.reload() })))));
    return;
  }

  applyTheme();
  applySidebar();
  S.subscribe(() => { applyTheme(); applySidebar(); render(); });
  addEventListener('hashchange', () => { viewkeys.clear(); cursor = -1; render(); });
  addEventListener('gsd:rerender', render);

  $('#btn-theme').addEventListener('click', () => { location.hash = '#/config'; });
  $('#btn-help').addEventListener('click', openHelp);
  $('#btn-nav').addEventListener('click', toggleSidebar);

  if (!location.hash) location.hash = '#/hoy';
  render();

  if (S.state.restoredFromDisk) toast('Datos restaurados desde la copia en disco.');
  else if (S.state.wokenProjects && S.state.wokenProjects.length) {
    toast(`Vuelve${S.state.wokenProjects.length === 1 ? '' : 'n'} de la pausa: ${S.state.wokenProjects.map((p) => S.projectLabel(p)).join(', ')}.`);
  }
  vigilarAvisos();
}

main();
