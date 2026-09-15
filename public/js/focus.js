/*
 * ENFOQUE y TRABAJO PROFUNDO.
 *
 * Al entrar aqui la aplicacion deja de ser un gestor. No hay navegacion,
 * no hay listas, no hay estadisticas, no hay nada que reorganizar.
 *
 * Dos modos, misma pantalla:
 *
 *   ENFOQUE          una tarea, empieza ya, temporizador opcional.
 *   TRABAJO PROFUNDO un bloque protegido: duracion, definicion de terminado,
 *                    y salir cuesta. Se registra el tiempo, porque es lo unico
 *                    que merece la pena contar.
 */

import { add, h, holdToConfirm, toast } from './util.js';
import * as S from './store.js';
import * as V from './voice.js';

const layer = () => document.getElementById('focus-layer');

let taskId = null;
let mode = 'focus';        // focus | deep
let phase = 'idle';        // idle | picking | ritual | running | done
let session = null;        // { limit, startedAt, done }
let lastSession = null;    // resumen del bloque recien cerrado
let ticker = null;
let onExit = null;

export const isOpen = () => taskId !== null;
export const isDeep = () => mode === 'deep';

/* --------------------------------- Entrada -------------------------------- */

export function open(id, opts = {}) {
  const t = S.byId(id);
  if (!t) return;
  taskId = id;
  mode = 'focus';
  phase = 'idle';
  session = null;
  lastSession = null;
  onExit = opts.onExit || null;
  mount();
}

export function openDeep(id, opts = {}) {
  const t = S.byId(id);
  if (!t) return;
  taskId = id;
  mode = 'deep';
  phase = 'ritual';
  session = null;
  lastSession = null;
  onExit = opts.onExit || null;
  mount();
}

function mount() {
  document.body.classList.add('focus-on');
  layer().hidden = false;
  render();
}

export function close() {
  stopTicker();
  olvidarBloque();
  taskId = null;
  session = null;
  phase = 'idle';
  mode = 'focus';
  document.body.classList.remove('focus-on');
  const l = layer();
  l.hidden = true;
  l.textContent = '';
  document.title = 'GSD';
  if (onExit) { const fn = onExit; onExit = null; fn(); }
  dispatchEvent(new CustomEvent('gsd:rerender'));
}

/** ESC no es una puerta abierta mientras hay un bloque en marcha. */
export function requestExit() {
  if (phase === 'running') {
    toast(mode === 'deep'
      ? 'Bloque en marcha. Mantén pulsado ABANDONAR.'
      : 'Sesión en marcha. Mantén pulsado ABANDONAR.');
    const btn = layer().querySelector('[data-abandon]');
    if (btn) btn.focus();
    return false;
  }
  close();
  return true;
}

/* --------------------------- Bloque que sobrevive -------------------------- */

/*
 * Un bloque de trabajo profundo no se pierde por recargar o cerrar la pestaña:
 * se apunta al empezar y se recupera al volver. Si ya pasó de largo su duración,
 * se registra lo planificado —no las horas que estuvo la pestaña cerrada—.
 */
const CLAVE_BLOQUE = 'gsd:bloque';

function guardarBloque() {
  if (!session) return;
  try {
    localStorage.setItem(CLAVE_BLOQUE, JSON.stringify({
      taskId, mode, limit: session.limit, startedAt: session.startedAt, planned: session.planned, done: session.done,
    }));
  } catch { /* sin almacenamiento: el bloque vive solo en esta pestaña */ }
}

function olvidarBloque() {
  try { localStorage.removeItem(CLAVE_BLOQUE); } catch { /* nada que olvidar */ }
}

export async function resume() {
  let b = null;
  try { b = JSON.parse(localStorage.getItem(CLAVE_BLOQUE) || 'null'); } catch { b = null; }
  if (!b || !b.taskId || !b.startedAt) return false;
  const t = S.byId(b.taskId);
  const pasado = Date.now() - b.startedAt;
  if (!t || t.completed) { olvidarBloque(); return false; }

  const limiteMs = b.limit === null ? null : b.limit * 1000;
  if ((limiteMs !== null && pasado > limiteMs + 30 * 60000) || (limiteMs === null && pasado > 6 * 3600000)) {
    olvidarBloque();
    if (b.mode === 'deep' && limiteMs !== null) {
      await S.logSession({
        taskId: b.taskId, kind: 'deep', plannedMin: b.planned,
        startedAt: new Date(b.startedAt).toISOString(), endedAt: new Date(b.startedAt + limiteMs).toISOString(), note: b.done || '',
      });
      toast(`Bloque de ${b.planned} min registrado. La página se cerró con él en marcha.`);
    }
    return false;
  }

  taskId = b.taskId;
  mode = b.mode === 'deep' ? 'deep' : 'focus';
  lastSession = null;
  onExit = null;
  session = { limit: b.limit, startedAt: b.startedAt, planned: b.planned || 0, done: b.done || '' };
  phase = 'running';
  mount();
  stopTicker();
  ticker = setInterval(tick, 1000);
  tick();
  toast('Bloque recuperado. El reloj siguió contando.');
  return true;
}

/* ------------------------------- Cronometro ------------------------------- */

function stopTicker() { clearInterval(ticker); ticker = null; }
const elapsed = () => (session ? Math.floor((Date.now() - session.startedAt) / 1000) : 0);

function clock(seconds) {
  const s = Math.abs(seconds);
  const pad = (n) => String(n).padStart(2, '0');
  const hh = Math.floor(s / 3600);
  return `${hh ? `${hh}:` : ''}${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

function tick() {
  const el = layer().querySelector('[data-timer]');
  if (!el || !session) return;
  const secs = session.limit === null ? elapsed() : session.limit - elapsed();
  const over = session.limit !== null && secs <= 0;
  el.textContent = `${over ? '+' : ''}${clock(secs)}`;
  el.classList.toggle('over', over);
  document.title = `${over ? '+' : ''}${clock(secs)} · ${(S.byId(taskId) || {}).title || 'GSD'}`;
}

function startSession(limitMinutes, done = '') {
  session = {
    limit: limitMinutes === null ? null : limitMinutes * 60,
    startedAt: Date.now(),
    planned: limitMinutes || 0,
    done,
  };
  phase = 'running';
  guardarBloque();
  render();
  stopTicker();
  ticker = setInterval(tick, 1000);
  tick();
}

/** Cerrar el bloque: se registra el tiempo real, se haya terminado o no. */
async function endSession({ abandoned = false } = {}) {
  if (!session) return;
  const minutos = Math.round(elapsed() / 60);
  const inicio = new Date(session.startedAt).toISOString();
  const fin = new Date().toISOString();
  const planned = session.planned;
  stopTicker();
  olvidarBloque();
  document.title = 'GSD';

  if (mode === 'deep') {
    await S.logSession({
      taskId, kind: 'deep', plannedMin: planned, startedAt: inicio, endedAt: fin, note: session.done,
    });
  }
  lastSession = { minutos, planned, abandoned };
  session = null;
}

/* -------------------------------- Acciones -------------------------------- */

async function completeTask() {
  const id = taskId;
  if (session) await endSession();
  await S.complete(id);
  phase = 'done';
  render();
}

async function abandon() {
  await endSession({ abandoned: true });
  phase = mode === 'deep' ? 'done' : 'idle';
  render();
}

/* ------------------------------- Renderizado ------------------------------ */

function render() {
  const t = S.byId(taskId);
  if (!t) { close(); return; }
  const l = layer();
  l.textContent = '';
  add(l, phase === 'done' ? doneView(t) : mainView(t));
}

function mainView(t) {
  const inner = h('div', { class: `focus-inner${mode === 'deep' ? ' deep' : ''}` });

  add(inner,
    h('div', { class: 'focus-rule' }),
    h('div', { class: 'focus-label' },
      mode === 'deep' && phase === 'ritual' ? 'TRABAJO PROFUNDO' : null,
      mode === 'deep' && phase === 'running' ? 'BLOQUE PROTEGIDO' : null,
      mode === 'focus' && phase === 'running' ? 'EN CURSO' : null,
      mode === 'focus' && phase !== 'running' ? V.focusStart() : null),
    h('h1', { class: 'focus-title', text: t.title }),
    h('div', { class: 'focus-rule' }));

  if (phase !== 'running') {
    const dura = V.focusHard(t);
    if (dura) add(inner, h('div', { class: 'focus-hard', text: dura }));
  }

  if (phase === 'idle') {
    add(inner, h('div', { class: 'focus-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', text: 'TRABAJAR', onclick: () => { phase = 'picking'; render(); } }),
      h('button', { class: 'btn', type: 'button', text: 'COMPLETAR', onclick: completeTask }),
      h('button', {
        class: 'btn', type: 'button', text: 'TRABAJO PROFUNDO',
        onclick: () => { mode = 'deep'; phase = 'ritual'; render(); },
      })));
  }

  if (phase === 'picking') {
    add(inner,
      h('div', { class: 'focus-label', style: 'margin-top:30px', text: 'SESIÓN DE TRABAJO' }),
      h('div', { class: 'focus-durs' },
        [25, 50, 90].map((m) => h('button', { class: 'btn', type: 'button', text: `${m} MIN`, onclick: () => startSession(m) })),
        h('button', { class: 'btn', type: 'button', text: 'SIN LÍMITE', onclick: () => startSession(null) })),
      h('div', { class: 'micro', text: 'EL TEMPORIZADOR ES SECUNDARIO. LA TAREA ES LO IMPORTANTE.' }),
      h('div', { class: 'focus-exit' },
        h('button', { class: 'btn btn-ghost', type: 'button', text: 'VOLVER', onclick: () => { phase = 'idle'; render(); } })));
  }

  if (phase === 'ritual') add(inner, ritual(t));

  if (phase === 'running') {
    add(inner,
      h('div', { class: 'focus-timer', dataset: { timer: '1' }, text: '00:00' }),
      h('div', { class: 'focus-note', text: session.limit === null ? 'SIN LÍMITE' : `BLOQUE DE ${session.limit / 60} MIN` }),
      h('div', { class: 'micro', style: 'margin-top:8px', text: mode === 'deep' ? 'THE URGE TO QUIT IS THE WORKOUT.' : 'STAY ON IT.' }),
      session.done ? h('div', { class: 'focus-done-def' },
        h('span', { class: 'focus-done-label', text: 'TERMINAR ES' }),
        h('span', { text: session.done })) : null,
      h('div', { class: 'focus-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', text: 'COMPLETAR', onclick: completeTask })),
      h('div', { class: 'focus-exit' },
        holdToConfirm(
          h('button', { class: 'btn btn-ghost', type: 'button', 'data-abandon': '', text: 'ABANDONAR — MANTENER PULSADO' }),
          abandon,
          mode === 'deep' ? 2500 : 1100)));
  }

  return inner;
}

/* --------------------------- Ritual de entrada ---------------------------- */

/**
 * Antes de un bloque profundo se decide una sola cosa: que significa terminar.
 * Sin eso, "trabajar en ello" es una excusa con cronometro.
 */
function ritual(t) {
  let minutos = 90;
  const def = h('input', {
    class: 'focus-input', type: 'text',
    placeholder: '¿Qué tendrá que estar hecho al acabar el bloque?',
    autocomplete: 'off',
  });

  const botones = [60, 90, 120].map((m) => h('button', {
    class: `btn${m === minutos ? ' btn-primary' : ''}`, type: 'button', text: `${m} MIN`,
  }));
  botones.push(h('button', { class: 'btn', type: 'button', text: 'SIN LÍMITE' }));

  const marcar = (idx) => {
    botones.forEach((b, i) => b.classList.toggle('btn-primary', i === idx));
    minutos = [60, 90, 120, null][idx];
  };
  botones.forEach((b, i) => b.addEventListener('click', () => marcar(i)));

  const empezar = () => startSession(minutos, def.value.trim());
  def.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); empezar(); } });

  return h('div', { class: 'ritual' },
    h('div', { class: 'focus-label', style: 'margin-bottom:14px', text: 'DURACIÓN DEL BLOQUE' }),
    h('div', { class: 'focus-durs', style: 'margin:0 0 26px' }, botones),
    h('div', { class: 'focus-label', style: 'margin-bottom:10px', text: 'DEFINE TERMINADO' }),
    def,
    h('div', { class: 'micro', style: 'margin-top:10px', text: 'SIN DEFINICIÓN DE TERMINADO, TRABAJAR ES SOLO ESTAR SENTADO.' }),
    h('div', { class: 'micro', style: 'margin-top:6px;color:var(--ink)', text: 'CALLOUS THE MIND. ONE BLOCK AT A TIME.' }),
    h('div', { class: 'focus-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', text: 'EMPEZAR EL BLOQUE', onclick: empezar })),
    h('div', { class: 'focus-exit' },
      h('button', { class: 'btn btn-ghost', type: 'button', text: 'VOLVER', onclick: () => { mode = 'focus'; phase = 'idle'; render(); } })));
}

/* --------------------------------- Cierre --------------------------------- */

function doneView(t) {
  const hechaAhora = t.completed;
  const inner = h('div', { class: 'focus-inner' });

  add(inner,
    h('div', { class: 'focus-rule' }),
    h('div', { class: 'focus-label', style: 'margin:30px 0', text: hechaAhora ? V.focusDone(t) : 'BLOQUE CERRADO' }),
    h('div', { class: 'focus-rule' }));

  if (lastSession && lastSession.minutos) {
    const hoy = Math.round(S.deepMinutesToday());
    add(inner, h('div', { class: 'focus-tally' },
      h('div', { class: 'focus-tally-n', text: `${lastSession.minutos} MIN` }),
      h('div', { class: 'focus-tally-l', text: lastSession.abandoned ? 'TRABAJADOS ANTES DE SOLTAR' : 'DE TRABAJO PROFUNDO' }),
      hoy ? h('div', { class: 'micro', style: 'margin-top:12px', text: `HOY LLEVAS ${hoy} MINUTOS PROFUNDOS` }) : null));
  }

  if (!hechaAhora) {
    add(inner,
      h('div', { style: 'font-size:19px;line-height:1.35;margin:22px 0', text: t.title }),
      h('div', { class: 'focus-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', text: 'COMPLETAR', onclick: completeTask }),
        h('button', {
          class: 'btn', type: 'button', text: 'OTRO BLOQUE',
          onclick: () => { lastSession = null; phase = 'ritual'; mode = 'deep'; render(); },
        }),
        h('button', { class: 'btn btn-ghost', type: 'button', text: 'SALIR', onclick: close })));
    return inner;
  }

  const siguiente = S.todayList().find((x) => x.id !== t.id) || S.nextActions()[0] || null;
  if (siguiente) {
    add(inner,
      h('div', { class: 'focus-label', style: 'margin-top:30px;margin-bottom:6px', text: 'SIGUIENTE' }),
      h('div', { style: 'font-size:20px;line-height:1.35;margin-bottom:24px', text: siguiente.title }),
      h('div', { class: 'focus-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', text: 'EMPEZAR', onclick: () => open(siguiente.id, { onExit }) }),
        h('button', { class: 'btn', type: 'button', text: 'BLOQUE PROFUNDO', onclick: () => openDeep(siguiente.id, { onExit }) }),
        h('button', { class: 'btn btn-ghost', type: 'button', text: 'SALIR', onclick: close })));
  } else {
    add(inner,
      h('div', { style: 'margin:30px 0;color:var(--muted)', text: 'No queda nada comprometido para hoy.' }),
      h('div', { class: 'focus-actions' },
        h('button', { class: 'btn btn-primary', type: 'button', text: 'SALIR', onclick: close })));
  }
  return inner;
}
