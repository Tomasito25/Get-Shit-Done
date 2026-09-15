/*
 * Estado y reglas del sistema.
 *
 * Modelo pequeño a proposito. Un campo nuevo solo entra si sirve para
 * capturar, aclarar, organizar, revisar o ejecutar.
 */

import * as db from './db.js';
import * as sync from './sync.js';
import { parseCapture } from './parse.js';
import { uid, now, today, iso, addDays, weekStart, daysBetween, parseISO } from './util.js';

export const STATUS = {
  INBOX: 'inbox',
  NEXT: 'next',
  SCHEDULED: 'scheduled',
  WAITING: 'waiting',
  SOMEDAY: 'someday',
  REFERENCE: 'reference',
  DONE: 'done',
};

/** Valores de fabrica. El usuario puede ajustarlos en CONFIGURACIÓN. */
export const COMMIT_CAP_DEFAULT = 5;
export const POSTPONE_ALERT_DEFAULT = 3;

/** Tope blando de compromisos diarios. No bloquea: obliga a confirmar. */
export const commitCap = () => {
  const n = state.settings && Number(state.settings.commitCap);
  return Number.isFinite(n) && n > 0 ? Math.min(20, n) : COMMIT_CAP_DEFAULT;
};

/** A partir de aqui, una tarea deja de ser una tarea y es una decision. */
export const postponeAlert = () => {
  const n = state.settings && Number(state.settings.postponeAlert);
  return Number.isFinite(n) && n > 0 ? Math.min(20, n) : POSTPONE_ALERT_DEFAULT;
};

export const state = {
  tasks: [],
  projects: [],
  waitings: [],
  sessions: [],
  settings: null,
  ready: false,
  restoredFromDisk: false,
};

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) fn(); }

function touched() {
  emit();
  sync.schedule();
}

/* ------------------------------ Normalizacion ---------------------------- */

const DEFAULT_CONTEXTS = ['@ordenador', '@casa', '@universidad', '@teléfono', '@calle'];

export function newTask(title, patch = {}) {
  return {
    id: uid(),
    title: String(title || '').trim(),
    status: STATUS.INBOX,
    projectId: null,
    context: null,
    dueDate: null,
    deadline: null,
    reminder: null,
    waitingFor: null,
    notes: '',
    createdAt: now(),
    completedAt: null,
    completed: false,
    isOneThing: false,
    isCommitment: false,
    postponeCount: 0,
    recurrence: null,
    pinned: false,
    ...patch,
  };
}

function normTask(raw) {
  const t = newTask(raw && raw.title);
  if (!raw || typeof raw !== 'object') return t;
  const out = {
    ...t,
    ...raw,
    id: raw.id || t.id,
    title: String(raw.title || '').trim(),
    notes: typeof raw.notes === 'string' ? raw.notes : '',
    completed: !!raw.completed,
    isOneThing: !!raw.isOneThing,
    isCommitment: !!raw.isCommitment,
    pinned: !!raw.pinned,
    postponeCount: Number.isFinite(raw.postponeCount) ? raw.postponeCount : 0,
    recurrence: normRecurrence(raw.recurrence),
    createdAt: raw.createdAt || now(),
  };
  if (!Object.values(STATUS).includes(out.status)) out.status = STATUS.INBOX;
  if (out.completed && out.status !== STATUS.DONE) out.status = STATUS.DONE;
  if (out.status === STATUS.DONE) { out.completed = true; out.isOneThing = false; }
  if (out.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(out.dueDate)) out.dueDate = null;
  if (out.deadline && !/^\d{4}-\d{2}-\d{2}$/.test(out.deadline)) out.deadline = null;
  if (out.reminder && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(out.reminder)) out.reminder = null;
  return out;
}

/* ------------------------------- Recurrencia ------------------------------ */

const DIAS_CORTO = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];

/** Una regla o nada. Nada de recurrencias a medias en el almacen. */
export function normRecurrence(r) {
  if (!r || typeof r !== 'object') return null;
  if (r.kind === 'daily') return { kind: 'daily' };
  if (r.kind === 'interval') {
    const n = Math.max(1, Math.min(365, Number(r.n) || 1));
    return { kind: 'interval', n };
  }
  if (r.kind === 'weekdays') {
    const days = [...new Set((r.days || []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
    return days.length ? { kind: 'weekdays', days } : null;
  }
  if (r.kind === 'monthly') {
    const day = Math.max(1, Math.min(28, Number(r.day) || 1));
    return { kind: 'monthly', day };
  }
  return null;
}

/** Siguiente fecha estrictamente posterior a `from`. */
export function nextDate(rule, from = today()) {
  const r = normRecurrence(rule);
  if (!r) return null;
  if (r.kind === 'daily') return addDays(from, 1);
  if (r.kind === 'interval') return addDays(from, r.n);
  if (r.kind === 'weekdays') {
    for (let i = 1; i <= 7; i += 1) {
      const d = addDays(from, i);
      if (r.days.includes(parseISO(d).getDay())) return d;
    }
    return addDays(from, 7);
  }
  if (r.kind === 'monthly') {
    const d = parseISO(from);
    const target = new Date(d.getFullYear(), d.getMonth(), r.day);
    if (target <= d) target.setMonth(target.getMonth() + 1);
    return iso(target);
  }
  return null;
}

export function recurrenceLabel(rule) {
  const r = normRecurrence(rule);
  if (!r) return '';
  if (r.kind === 'daily') return 'CADA DÍA';
  if (r.kind === 'interval') return r.n === 7 ? 'CADA SEMANA' : `CADA ${r.n} DÍAS`;
  if (r.kind === 'weekdays') return r.days.map((d) => DIAS_CORTO[d]).join('·');
  if (r.kind === 'monthly') return `DÍA ${r.day} DE CADA MES`;
  return '';
}

/* -------------------------------- Proyectos -------------------------------- */

/** Código con el que se nombra un proyecto: P01, P02… P100. */
const CODIGO = /^P(\d{1,3})$/i;
/** Un nombre escrito a mano como «P04- MUDANZA» trae su código dentro. */
const PREFIJO = /^\s*P(\d{1,3})\s*[-–—_:.]\s*/i;

const formatCode = (n) => `P${String(n).padStart(2, '0')}`;
const codeNumber = (code) => { const m = CODIGO.exec(code || ''); return m ? Number(m[1]) : 0; };

function normProject(raw) {
  const estado = raw && ['active', 'paused', 'done'].includes(raw.status) ? raw.status : 'active';
  return {
    id: (raw && raw.id) || uid(),
    code: raw && CODIGO.test(raw.code || '') ? formatCode(codeNumber(raw.code)) : null,
    name: String((raw && raw.name) || '').trim(),
    outcome: String((raw && raw.outcome) || '').trim(),
    folderId: (raw && raw.folderId) || null,
    status: estado,
    pausedUntil: estado === 'paused' && raw && /^\d{4}-\d{2}-\d{2}$/.test(raw.pausedUntil || '') ? raw.pausedUntil : null,
    createdAt: (raw && raw.createdAt) || now(),
  };
}

/** «P04-MUDANZA». El código va siempre delante, para citarlo y buscarlo. */
export const projectLabel = (p) => (p ? `${p.code ? `${p.code}-` : ''}${p.name}` : '');

export function nextProjectCode() {
  const max = state.projects.reduce((n, p) => Math.max(n, codeNumber(p.code)), 0);
  return formatCode(max + 1);
}

/**
 * Da código a los proyectos que no lo tienen. Si el nombre ya empezaba por
 * «P07-», ese número se respeta y se quita del nombre para no duplicarlo.
 * Devuelve los proyectos modificados.
 */
function assignProjectCodes() {
  const cambiados = [];
  const usados = new Set(state.projects.map((p) => codeNumber(p.code)).filter(Boolean));
  for (const p of state.projects) {
    const m = PREFIJO.exec(p.name);
    if (m) {
      const n = Number(m[1]);
      const limpio = p.name.slice(m[0].length).trim() || p.name;
      if (!p.code && !usados.has(n)) { p.code = formatCode(n); usados.add(n); }
      if (p.code === formatCode(n)) { p.name = limpio; cambiados.push(p); }
    }
  }
  let siguiente = Math.max(0, ...usados) + 1;
  for (const p of [...state.projects].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    if (p.code) continue;
    while (usados.has(siguiente)) siguiente += 1;
    p.code = formatCode(siguiente);
    usados.add(siguiente);
    if (!cambiados.includes(p)) cambiados.push(p);
  }
  return cambiados;
}

function normWaiting(raw) {
  return {
    id: (raw && raw.id) || uid(),
    taskId: (raw && raw.taskId) || null,
    person: String((raw && raw.person) || '').trim(),
    description: String((raw && raw.description) || '').trim(),
    reviewDate: raw && /^\d{4}-\d{2}-\d{2}$/.test(raw.reviewDate) ? raw.reviewDate : null,
  };
}

function defaultSettings() {
  return {
    id: 'settings',
    theme: 'system',
    contexts: [...DEFAULT_CONTEXTS],
    folders: [],
    collapsedFolders: [],
    lastReview: null,
    review: null,
    sidebar: 'open',
    columns: null,
    commitCap: 5,
    postponeAlert: 3,
    cards: null,
    boardGroup: 'none',
    calendarView: 'semana',
    createdAt: now(),
  };
}

/* ------------------------ Cómo se ven las tarjetas ------------------------ */

/**
 * Qué enseña una tarjeta del tablero. Por defecto, lo que sirve para decidir;
 * lo demás se enciende en CONFIGURACIÓN. Una tarjeta que lo dice todo no dice nada.
 */
export const CARD_FIELDS = [
  { key: 'project', label: 'Proyecto', hint: 'P04-NOMBRE encima del título' },
  { key: 'context', label: 'Contexto', hint: '@casa, @ordenador…' },
  { key: 'due', label: 'Cuándo lo haces', hint: 'HOY, MAÑANA, +3D' },
  { key: 'deadline', label: 'Fecha tope', hint: 'con los días que quedan' },
  { key: 'reminder', label: 'Aviso', hint: 'día y hora' },
  { key: 'recurrence', label: 'Repetición', hint: '↻ LUN·MIÉ' },
  { key: 'waiting', label: 'A quién esperas', hint: 'y cuándo revisar' },
  { key: 'notes', label: 'Notas', hint: 'la primera línea, debajo del título' },
  { key: 'age', label: 'Antigüedad', hint: 'días que lleva sin cerrarse' },
  { key: 'postpone', label: 'Aplazamientos', hint: 'POSPUESTA ×3 cuando aprieta' },
];

const CARDS_DEFAULT = {
  density: 'normal',       // normal | compact
  actions: 'hover',        // hover | always
  show: { project: true, context: true, due: true, deadline: true, reminder: true, recurrence: true, waiting: true, notes: true, age: true, postpone: true },
};

export function cardPrefs() {
  const guardadas = (state.settings && state.settings.cards) || {};
  return {
    density: guardadas.density === 'compact' ? 'compact' : 'normal',
    actions: guardadas.actions === 'always' ? 'always' : 'hover',
    show: { ...CARDS_DEFAULT.show, ...(guardadas.show || {}) },
  };
}

export async function saveCardPrefs(patch) {
  const actual = cardPrefs();
  await saveSettings({ cards: { ...actual, ...patch, show: { ...actual.show, ...(patch.show || {}) } } });
}

export const resetCardPrefs = () => saveSettings({ cards: null });

/* --------------------------- Columnas del tablero ------------------------- */

/**
 * Las columnas son los estados de GTD: eso no se toca, porque es el sistema.
 * Lo que si es tuyo: como se llaman, en que orden van, cuales escondes y
 * cuantas tarjetas admites en cada una antes de que te avise.
 */
const COLUMNS_BASE = [
  { key: STATUS.INBOX, label: 'BANDEJA', hint: 'sin decidir' },
  { key: STATUS.NEXT, label: 'SIGUIENTE', hint: 'acción concreta' },
  { key: STATUS.WAITING, label: 'EN ESPERA', hint: 'depende de otro' },
  { key: STATUS.SOMEDAY, label: 'ALGÚN DÍA', hint: 'fuera de foco' },
  { key: STATUS.DONE, label: 'HECHO', hint: 'cerrado' },
];

export const columnDefaults = () => COLUMNS_BASE.map((c) => ({ ...c, hidden: false, wip: 0 }));

/** Configuracion efectiva: la guardada, saneada contra la base. */
export function columns() {
  const guardadas = state.settings && Array.isArray(state.settings.columns) ? state.settings.columns : null;
  if (!guardadas) return columnDefaults();
  const porClave = new Map(COLUMNS_BASE.map((c) => [c.key, c]));
  const salida = [];
  for (const c of guardadas) {
    const base = porClave.get(c.key);
    if (!base || salida.some((x) => x.key === c.key)) continue;
    salida.push({
      key: base.key,
      hint: base.hint,
      label: String(c.label || base.label).slice(0, 24) || base.label,
      hidden: !!c.hidden,
      wip: Math.max(0, Math.min(99, Number(c.wip) || 0)),
    });
  }
  // Una columna nueva del sistema nunca desaparece por tener ajustes viejos.
  for (const base of COLUMNS_BASE) {
    if (!salida.some((x) => x.key === base.key)) salida.push({ ...base, hidden: false, wip: 0 });
  }
  return salida;
}

export const visibleColumns = () => columns().filter((c) => !c.hidden);

export async function saveColumns(cols) {
  await saveSettings({ columns: cols.map((c) => ({ key: c.key, label: c.label, hidden: !!c.hidden, wip: c.wip || 0 })) });
}

export const resetColumns = () => saveSettings({ columns: null });

/* --------------------------------- Arranque ------------------------------ */

export async function boot() {
  db.requestPersistence();
  let data = await db.loadEverything();

  // Si el navegador perdio la base pero el disco conserva copia, restaurar.
  if (!data.tasks.length && !data.projects.length) {
    const disk = await sync.loadDisk();
    if (disk && (disk.tasks.length || (disk.projects || []).length)) {
      await db.replaceAll({
        tasks: disk.tasks.map(normTask),
        projects: (disk.projects || []).map(normProject),
        waitings: (disk.waitings || []).map(normWaiting),
        sessions: disk.sessions || [],
        meta: disk.meta || [],
      });
      data = await db.loadEverything();
      state.restoredFromDisk = true;
    }
  }

  state.tasks = data.tasks.map(normTask);
  state.projects = data.projects.map(normProject);
  state.waitings = data.waitings.map(normWaiting);
  state.sessions = (data.sessions || []).filter((x) => x && x.id);
  state.settings = data.meta.find((m) => m.id === 'settings') || defaultSettings();
  if (!Array.isArray(state.settings.contexts)) state.settings.contexts = [...DEFAULT_CONTEXTS];
  if (!Array.isArray(state.settings.folders)) state.settings.folders = [];
  if (!Array.isArray(state.settings.collapsedFolders)) state.settings.collapsedFolders = [];

  enforceOneThing();

  const conCodigo = assignProjectCodes();
  if (conCodigo.length) await db.putMany('projects', conCodigo);
  state.wokenProjects = await wakeProjects();
  await promoteDue();

  state.ready = true;
  sync.init(snapshot);
  emit();
}

/**
 * Lo programado deja de estarlo el día que llega: pasa a siguiente acción.
 * Sin esto, una tarea con fecha de ayer seguía «programada» y no aparecía en
 * SIGUIENTES ACCIONES, y su proyecto parecía no tener siguiente acción.
 * Se llama al arrancar y cada vez que cambia el día con la app abierta.
 */
export async function promoteDue() {
  const hoy = today();
  const llegan = state.tasks.filter((t) => t.status === STATUS.SCHEDULED && !t.completed && t.dueDate && t.dueDate <= hoy);
  llegan.forEach((t) => { t.status = STATUS.NEXT; });
  if (llegan.length) {
    await db.putMany('tasks', llegan);
    if (state.ready) touched();
  }
  return llegan.length;
}

/** Invariante duro del sistema: como mucho una One Thing viva. */
function enforceOneThing() {
  const live = state.tasks.filter((t) => t.isOneThing && !t.completed);
  if (live.length <= 1) return;
  live.slice(1).forEach((t) => { t.isOneThing = false; });
  db.putMany('tasks', live.slice(1));
}

/* -------------------------------- Escritura ------------------------------ */

async function persistTask(t) { await db.put('tasks', t); }

export async function saveSettings(patch) {
  state.settings = { ...state.settings, ...patch };
  await db.put('meta', state.settings);
  touched();
  return state.settings;
}

export const byId = (id) => state.tasks.find((t) => t.id === id) || null;
export const projectById = (id) => state.projects.find((p) => p.id === id) || null;
export const waitingByTask = (taskId) => state.waitings.find((w) => w.taskId === taskId) || null;

export async function capture(title) {
  const clean = String(title || '').trim();
  if (!clean) return null;
  const t = newTask(clean);
  state.tasks.push(t);
  await persistTask(t);
  touched();
  return t;
}

/**
 * Captura con detalles dentro del propio texto.
 *
 * Si la linea trae fecha, contexto, proyecto o repeticion, ya esta decidida:
 * va directa a siguiente accion. Si es texto pelado, va al inbox a esperar
 * una decision. Capturar rapido no debe obligar a re-decidir lo ya decidido.
 */
export async function captureSmart(raw) {
  const p = parseCapture(raw, { projects: selectableProjects(), contexts: allContexts() });
  if (!p.title) return null;

  let projectId = p.projectId;
  if (!projectId && p.projectName) {
    const proyecto = await createProject({ name: p.projectName });
    projectId = proyecto ? proyecto.id : null;
  }
  if (p.context) await addContext(p.context);

  const decidida = !!(p.dueDate || p.deadline || p.reminder || p.context || projectId || p.recurrence || p.isCommitment);
  const futura = p.dueDate && p.dueDate > today();

  const t = newTask(p.title, {
    status: decidida ? (futura ? STATUS.SCHEDULED : STATUS.NEXT) : STATUS.INBOX,
    projectId,
    context: p.context,
    dueDate: p.dueDate,
    deadline: p.deadline,
    reminder: p.reminder,
    recurrence: normRecurrence(p.recurrence),
    isCommitment: !!p.isCommitment,
  });
  state.tasks.push(t);
  await persistTask(t);
  touched();
  return t;
}

export async function updateTask(id, patch) {
  const t = byId(id);
  if (!t) return null;
  const antes = t.status;
  // `undefined` significa "no tocar", no "borrar": Object.assign no distingue.
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) t[k] = v;
  }
  if (t.completed && t.status !== STATUS.DONE) t.status = STATUS.DONE;
  if (t.recurrence) t.recurrence = normRecurrence(t.recurrence);
  // Lo que deja de estar en espera (sin cerrarse) ya no espera a nadie: sin esto,
  // el calendario seguía pidiendo revisar a una persona de la que ya no dependes.
  if (antes === STATUS.WAITING && t.status !== STATUS.WAITING && t.status !== STATUS.DONE) {
    t.waitingFor = null;
    const w = waitingByTask(id);
    if (w) {
      state.waitings = state.waitings.filter((x) => x.id !== w.id);
      await db.del('waitings', w.id);
    }
  }
  await persistTask(t);
  touched();
  return t;
}

/** La última tarea cerrada, para poder deshacerlo sin dejar rastro. */
let ultimoCierre = null;

export async function complete(id) {
  const t = byId(id);
  if (!t || t.completed) return null;
  ultimoCierre = { id, isOneThing: t.isOneThing, status: t.status, spawned: null };
  Object.assign(t, {
    completed: true,
    status: STATUS.DONE,
    completedAt: now(),
    isOneThing: false,
  });
  await persistTask(t);

  // Lo que se repite vuelve solo. No hay que acordarse de nada.
  const siguiente = spawnNext(t);
  if (siguiente) {
    state.tasks.push(siguiente);
    await persistTask(siguiente);
    ultimoCierre.spawned = siguiente.id;
  }
  touched();
  return t;
}

/**
 * Deshacer un cierre por error: la tarea vuelve como estaba —también si era lo
 * único— y la repetición que nació al cerrarla desaparece, para no duplicarla.
 */
export async function undoComplete(id) {
  const cierre = ultimoCierre && ultimoCierre.id === id ? ultimoCierre : null;
  ultimoCierre = null;
  if (cierre && cierre.spawned) {
    const hija = byId(cierre.spawned);
    if (hija && !hija.completed) {
      state.tasks = state.tasks.filter((x) => x.id !== hija.id);
      await db.del('tasks', hija.id);
    }
  }
  const t = await uncomplete(id);
  if (t && cierre) {
    const patch = {};
    if (cierre.status === STATUS.WAITING || cierre.status === STATUS.INBOX || cierre.status === STATUS.SOMEDAY) patch.status = cierre.status;
    if (cierre.isOneThing && !oneThing()) patch.isOneThing = true;
    if (Object.keys(patch).length) await updateTask(id, patch);
  }
  return t;
}

/** Copia de una tarea, sin su historia: ni hecha, ni lo único, ni aplazamientos. */
export async function duplicateTask(id) {
  const t = byId(id);
  if (!t) return null;
  const copia = newTask(`${t.title}`, {
    status: t.completed ? STATUS.NEXT : (t.status === STATUS.DONE ? STATUS.NEXT : t.status),
    projectId: t.projectId,
    context: t.context,
    dueDate: t.dueDate,
    deadline: t.deadline,
    notes: t.notes,
    recurrence: t.recurrence,
    isCommitment: false,
  });
  if (copia.status === STATUS.WAITING) copia.status = STATUS.NEXT;
  state.tasks.push(copia);
  await persistTask(copia);
  touched();
  return copia;
}

/** Días que lleva viva una tarea desde que se capturó. */
export const taskAge = (t) => (t && t.createdAt ? Math.max(0, daysBetween(iso(new Date(t.createdAt)), today())) : 0);

/** La siguiente ocurrencia nace al cerrar la anterior: nunca se acumulan. */
function spawnNext(t) {
  if (!t.recurrence) return null;
  const base = t.dueDate && t.dueDate >= today() ? t.dueDate : today();
  const due = nextDate(t.recurrence, base);
  if (!due) return null;
  // El aviso y la fecha tope viajan con la repetición, a la misma distancia del día.
  const referencia = t.dueDate || base;
  const reminder = t.reminder ? `${addDays(due, daysBetween(referencia, t.reminder.slice(0, 10)))}T${t.reminder.slice(11, 16)}` : null;
  const deadline = t.deadline ? addDays(due, daysBetween(referencia, t.deadline)) : null;
  return newTask(t.title, {
    status: due <= today() ? STATUS.NEXT : STATUS.SCHEDULED,
    projectId: t.projectId,
    context: t.context,
    dueDate: due,
    deadline,
    reminder,
    notes: t.notes,
    isCommitment: t.isCommitment,
    recurrence: t.recurrence,
  });
}

export async function uncomplete(id) {
  const t = byId(id);
  if (!t || !t.completed) return null;
  Object.assign(t, {
    completed: false,
    completedAt: null,
    status: t.dueDate && t.dueDate > today() ? STATUS.SCHEDULED : STATUS.NEXT,
  });
  await persistTask(t);
  touched();
  return t;
}

export async function toggleComplete(id) {
  const t = byId(id);
  if (!t) return null;
  return t.completed ? uncomplete(id) : complete(id);
}

/** Borrado real. No organices basura: si no importa, fuera. */
export async function remove(id) {
  const idx = state.tasks.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  const [task] = state.tasks.splice(idx, 1);
  const wIdx = state.waitings.findIndex((w) => w.taskId === id);
  const waiting = wIdx >= 0 ? state.waitings.splice(wIdx, 1)[0] : null;
  await db.del('tasks', id);
  if (waiting) await db.del('waitings', waiting.id);
  touched();
  return { task, waiting };
}

export async function restore(bundle) {
  if (!bundle || !bundle.task) return;
  state.tasks.push(bundle.task);
  await db.put('tasks', bundle.task);
  if (bundle.waiting) {
    state.waitings.push(bundle.waiting);
    await db.put('waitings', bundle.waiting);
  }
  touched();
}

/* ------------------------------- Aclaracion ------------------------------ */

export async function makeNext(id, patch = {}) {
  const t = byId(id);
  const fecha = patch.dueDate !== undefined ? patch.dueDate : (t && t.dueDate);
  // Una acción con fecha futura está programada, no pendiente de hoy.
  const estado = fecha && fecha > today() ? STATUS.SCHEDULED : STATUS.NEXT;
  return updateTask(id, { status: estado, ...patch });
}

export async function makeSomeday(id) {
  return updateTask(id, {
    status: STATUS.SOMEDAY,
    isCommitment: false,
    isOneThing: false,
    dueDate: null,
    reminder: null,
  });
}

/**
 * Pasa a anotacion: informacion, no accion. Se le quita todo lo que solo
 * tiene sentido en algo que se hace —fechas, avisos, repeticion, compromiso—
 * porque una nota con fecha tope vuelve a ser una tarea disfrazada.
 */
export async function makeReference(id) {
  return updateTask(id, {
    status: STATUS.REFERENCE,
    isCommitment: false,
    isOneThing: false,
    dueDate: null,
    deadline: null,
    reminder: null,
    recurrence: null,
    waitingFor: null,
  });
}

export async function schedule(id, date) {
  const t = byId(id);
  if (!t) return null;
  const isToday = date <= today();
  return updateTask(id, {
    status: isToday ? STATUS.NEXT : STATUS.SCHEDULED,
    dueDate: date,
    isCommitment: isToday ? t.isCommitment : false,
  });
}

export async function delegate(id, { person, description = '', reviewDate = null }) {
  const t = byId(id);
  if (!t) return null;
  Object.assign(t, {
    status: STATUS.WAITING,
    waitingFor: String(person || '').trim() || null,
    isOneThing: false,
    isCommitment: false,
  });
  await persistTask(t);

  let w = waitingByTask(id);
  if (!w) {
    w = normWaiting({ taskId: id });
    state.waitings.push(w);
  }
  w.person = String(person || '').trim();
  w.description = String(description || '').trim() || t.title;
  w.reviewDate = reviewDate || null;
  await db.put('waitings', w);
  touched();
  return t;
}

/** Vuelve del limbo: lo que estaba delegado pasa a ser accion propia. */
export async function undelegate(id) {
  const w = waitingByTask(id);
  if (w) {
    state.waitings = state.waitings.filter((x) => x.id !== w.id);
    await db.del('waitings', w.id);
  }
  return updateTask(id, { status: STATUS.NEXT, waitingFor: null });
}

/* ------------------------------ Compromisos ------------------------------ */

export async function setOneThing(id) {
  const target = byId(id);
  if (!target) return null;
  const changed = [];
  for (const t of state.tasks) {
    if (t.isOneThing && t.id !== id) { t.isOneThing = false; changed.push(t); }
  }
  Object.assign(target, {
    isOneThing: true,
    isCommitment: true,
    status: target.status === STATUS.DONE ? STATUS.NEXT : STATUS.NEXT,
    completed: false,
    completedAt: target.completed ? null : target.completedAt,
    // Elegirla hoy es comprometerse hoy: con la fecha vieja nacía ya «arrastrada».
    dueDate: today(),
  });
  changed.push(target);
  await db.putMany('tasks', changed);
  touched();
  return target;
}

export async function clearOneThing() {
  const t = oneThing();
  if (!t) return null;
  return updateTask(t.id, { isOneThing: false });
}

export async function commitToday(id) {
  const t = byId(id);
  if (!t) return null;
  return updateTask(id, {
    isCommitment: true,
    dueDate: today(),
    status: t.completed ? STATUS.DONE : STATUS.NEXT,
  });
}

export async function uncommit(id) {
  return updateTask(id, { isCommitment: false, isOneThing: false });
}

/**
 * Posponer sigue siendo posible: las circunstancias cambian.
 * Pero queda registrado. La honestidad es parte del sistema.
 */
export async function postpone(id, when) {
  const t = byId(id);
  if (!t) return null;
  // Adelantar no es aplazar: solo cuenta si la fecha se va más lejos.
  const destino = when === 'someday' ? null : (when === 'tomorrow' ? addDays(today(), 1) : when);
  const referencia = t.dueDate || today();
  const aplaza = when === 'someday' || destino > referencia;
  const count = (t.postponeCount || 0) + (aplaza ? 1 : 0);

  if (when === 'someday') {
    await updateTask(id, {
      status: STATUS.SOMEDAY,
      dueDate: null,
      reminder: null,
      isCommitment: false,
      isOneThing: false,
      postponeCount: count,
    });
    return t;
  }
  const future = destino > today();
  await updateTask(id, {
    dueDate: destino,
    status: future ? STATUS.SCHEDULED : STATUS.NEXT,
    isOneThing: future ? false : t.isOneThing,
    isCommitment: future ? false : t.isCommitment,
    postponeCount: count,
  });
  return t;
}

/* -------------------------------- Proyectos ------------------------------ */

export async function createProject({ name, outcome = '' }) {
  // Si se escribe «P12-Algo», se usa ese número si está libre.
  const m = PREFIJO.exec(String(name || ''));
  const pedido = m ? formatCode(Number(m[1])) : null;
  const libre = pedido && !state.projects.some((x) => x.code === pedido);
  const p = normProject({
    name: m ? String(name).slice(m[0].length) : name,
    outcome,
    code: libre ? pedido : nextProjectCode(),
  });
  if (!p.name) return null;
  state.projects.push(p);
  await db.put('projects', p);
  touched();
  return p;
}

export async function updateProject(id, patch) {
  const p = projectById(id);
  if (!p) return null;
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) p[k] = v;
  }
  await db.put('projects', p);
  touched();
  return p;
}

/**
 * Pausar no es abandonar: el proyecto y sus acciones salen del campo de
 * atención —HOY, tablero, siguientes acciones— hasta que se reanude.
 * Con fecha, vuelve solo ese día. Sin fecha, hasta que decidas.
 */
export async function pauseProject(id, hasta = null) {
  return updateProject(id, { status: 'paused', pausedUntil: hasta || null });
}

export async function resumeProject(id) {
  return updateProject(id, { status: 'active', pausedUntil: null });
}

/** Los pausados con fecha cumplida vuelven solos. */
async function wakeProjects() {
  const hoy = today();
  const despiertan = state.projects.filter((p) => p.status === 'paused' && p.pausedUntil && p.pausedUntil <= hoy);
  despiertan.forEach((p) => { p.status = 'active'; p.pausedUntil = null; });
  if (despiertan.length) await db.putMany('projects', despiertan);
  return despiertan;
}

/** Borrar un proyecto no borra su trabajo: desvincula y deja las acciones. */
export async function removeProject(id) {
  state.projects = state.projects.filter((p) => p.id !== id);
  const orphans = state.tasks.filter((t) => t.projectId === id);
  orphans.forEach((t) => { t.projectId = null; });
  await db.del('projects', id);
  await db.putMany('tasks', orphans);
  touched();
}

/* -------------------------------- Carpetas -------------------------------- */

/*
 * Una carpeta agrupa proyectos por area de responsabilidad: ESTUDIOS, CASA,
 * CLUB. No es una fase ni un estado: los proyectos siguen siendo proyectos y
 * las acciones siguen siendo acciones. Solo evita que la galeria sea una
 * lista infinita donde no se ve nada.
 *
 * Van en los ajustes, no en un almacen nuevo: el modelo no crece por esto.
 */

export const folders = () => (state.settings && Array.isArray(state.settings.folders) ? state.settings.folders : []);

export const folderById = (id) => folders().find((f) => f.id === id) || null;

export const folderLabel = (f) => (f ? f.name : 'SIN CARPETA');

export async function createFolder(name) {
  const limpio = String(name || '').trim().slice(0, 40);
  if (!limpio) return null;
  const existe = folders().find((f) => f.name.toLowerCase() === limpio.toLowerCase());
  if (existe) return existe;
  const f = { id: uid(), name: limpio, createdAt: now() };
  await saveSettings({ folders: [...folders(), f] });
  return f;
}

export async function renameFolder(id, name) {
  const limpio = String(name || '').trim().slice(0, 40);
  if (!limpio) return null;
  await saveSettings({ folders: folders().map((f) => (f.id === id ? { ...f, name: limpio } : f)) });
  return folderById(id);
}

/** Borrar la carpeta no borra proyectos: salen de ella y siguen vivos. */
export async function removeFolder(id) {
  const dentro = state.projects.filter((p) => p.folderId === id);
  dentro.forEach((p) => { p.folderId = null; });
  if (dentro.length) await db.putMany('projects', dentro);
  await saveSettings({
    folders: folders().filter((f) => f.id !== id),
    collapsedFolders: (state.settings.collapsedFolders || []).filter((x) => x !== id),
  });
  return dentro.length;
}

export async function moveFolder(id, delta) {
  const lista = [...folders()];
  const i = lista.findIndex((f) => f.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= lista.length) return null;
  [lista[i], lista[j]] = [lista[j], lista[i]];
  await saveSettings({ folders: lista });
  return lista;
}

export async function setProjectFolder(projectId, folderId) {
  return updateProject(projectId, { folderId: folderId || null });
}

export const isFolderCollapsed = (id) => ((state.settings && state.settings.collapsedFolders) || []).includes(id);

export async function toggleFolderCollapsed(id) {
  const actual = (state.settings && state.settings.collapsedFolders) || [];
  const nueva = actual.includes(id) ? actual.filter((x) => x !== id) : [...actual, id];
  await saveSettings({ collapsedFolders: nueva });
}

/**
 * Proyectos agrupados por carpeta, en el orden de las carpetas.
 * Los que no tienen carpeta van al final, juntos: no se pierden.
 */
export function folderGroups({ status = 'active' } = {}) {
  const dentro = (fid) => state.projects
    .filter((p) => p.status === status && (p.folderId || null) === fid)
    .sort((a, b) => codeNumber(a.code) - codeNumber(b.code));
  const grupos = folders().map((f) => ({ folder: f, projects: dentro(f.id) }));
  const conocidas = new Set(folders().map((f) => f.id));
  // Un proyecto con carpeta borrada a mano no desaparece de la galeria.
  const sueltos = state.projects
    .filter((p) => p.status === status && (!p.folderId || !conocidas.has(p.folderId)))
    .sort((a, b) => codeNumber(a.code) - codeNumber(b.code));
  grupos.push({ folder: null, projects: sueltos });
  return grupos;
}

/** Lo que hay que saber de una carpeta sin abrirla. */
export function folderStats(id) {
  const dentro = state.projects.filter((p) => (p.folderId || null) === id && p.status !== 'done');
  const activos = dentro.filter((p) => p.status === 'active');
  const enPausa = dentro.filter((p) => p.status === 'paused');
  // Lo pausado esta fuera del campo de atencion: no cuenta como trabajo vivo.
  const ids = new Set(activos.map((p) => p.id));
  const tareas = state.tasks.filter((t) => t.projectId && ids.has(t.projectId) && !isNote(t));
  const abiertas = tareas.filter((t) => !t.completed);
  const hechas = tareas.length - abiertas.length;
  const parados = activos.filter((p) => !projectNext(p.id)).length;
  const tope = abiertas.filter((t) => t.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline))[0] || null;
  return {
    projects: activos.length,
    open: abiertas.length,
    done: hechas,
    stalled: parados,
    paused: enPausa.length,
    pct: tareas.length ? Math.round((hechas / tareas.length) * 100) : 0,
    nextDeadline: tope,
  };
}

/** Pausar una carpeta entera: un area completa sale del campo de atencion. */
export async function pauseFolder(id, hasta = null) {
  const dentro = state.projects.filter((p) => p.folderId === id && p.status === 'active');
  dentro.forEach((p) => { p.status = 'paused'; p.pausedUntil = hasta || null; });
  if (dentro.length) await db.putMany('projects', dentro);
  touched();
  return dentro.length;
}

export async function resumeFolder(id) {
  const dentro = state.projects.filter((p) => p.folderId === id && p.status === 'paused');
  dentro.forEach((p) => { p.status = 'active'; p.pausedUntil = null; });
  if (dentro.length) await db.putMany('projects', dentro);
  touched();
  return dentro.length;
}

/* -------------------------------- Contextos ------------------------------ */

export async function addContext(name) {
  let clean = String(name || '').trim();
  if (!clean) return null;
  if (!clean.startsWith('@')) clean = `@${clean}`;
  if (!state.settings.contexts.includes(clean)) {
    await saveSettings({ contexts: [...state.settings.contexts, clean] });
  }
  return clean;
}

/** Renombrar arrastra a todas las tareas que lo usaban: nada queda huerfano. */
export async function renameContext(viejo, nuevo) {
  let limpio = String(nuevo || '').trim();
  if (!limpio) return null;
  if (!limpio.startsWith('@')) limpio = `@${limpio}`;
  if (limpio === viejo) return limpio;

  const afectadas = state.tasks.filter((t) => t.context === viejo);
  afectadas.forEach((t) => { t.context = limpio; });
  await db.putMany('tasks', afectadas);

  const lista = state.settings.contexts.map((c) => (c === viejo ? limpio : c));
  await saveSettings({ contexts: [...new Set(lista)] });
  return limpio;
}

/** Borrar un contexto no borra trabajo: solo deja las tareas sin etiqueta. */
export async function removeContext(nombre) {
  const afectadas = state.tasks.filter((t) => t.context === nombre);
  afectadas.forEach((t) => { t.context = null; });
  await db.putMany('tasks', afectadas);
  await saveSettings({ contexts: state.settings.contexts.filter((c) => c !== nombre) });
  return afectadas.length;
}

export const contextUsage = (nombre) => state.tasks.filter((t) => t.context === nombre && !t.completed).length;

export function allContexts() {
  const used = new Set(state.tasks.map((t) => t.context).filter(Boolean));
  return [...new Set([...state.settings.contexts, ...used])].sort();
}

/* -------------------------------- Consultas ------------------------------ */

const pausados = () => new Set(state.projects.filter((p) => p.status === 'paused').map((p) => p.id));

/** En pausa = fuera del campo de atención. Solo su propio tablero lo muestra. */
export const isPausedTask = (t) => !!t.projectId && pausados().has(t.projectId);

export const active = () => {
  const fuera = pausados();
  return state.tasks.filter((t) => !t.completed && !(t.projectId && fuera.has(t.projectId)));
};

export const inbox = () =>
  state.tasks.filter((t) => t.status === STATUS.INBOX && !t.completed)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export const oneThing = () => state.tasks.find((t) => t.isOneThing && !t.completed && !isPausedTask(t)) || null;

/** Vence hoy o antes: lo programado llega y se convierte en trabajo de hoy. */
export const isDue = (t) => !!t.dueDate && t.dueDate <= today();

/** Un compromiso con fecha futura es de ese día, no de hoy. */
const commitmentForToday = (t) => t.isCommitment && (!t.dueDate || t.dueDate <= today());

export function todayList() {
  return active()
    .filter((t) =>
      (t.status === STATUS.NEXT || t.status === STATUS.SCHEDULED) &&
      (commitmentForToday(t) || isDue(t)))
    .sort((a, b) => {
      if (a.isOneThing !== b.isOneThing) return a.isOneThing ? -1 : 1;
      const ao = isOverdue(a) ? 0 : 1;
      const bo = isOverdue(b) ? 0 : 1;
      if (ao !== bo) return ao - bo;
      if (a.isCommitment !== b.isCommitment) return a.isCommitment ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
}

export const isOverdue = (t) => !!t.dueDate && t.dueDate < today() && !t.completed;

/*
 * Fecha tope. No es lo mismo que la fecha planificada: `dueDate` es cuando
 * piensas hacerlo, `deadline` es cuando deja de servir hacerlo. Mezclarlas
 * es como se acaba con veinte tareas "urgentes" que no vencen nada.
 */
export const deadlineDays = (t) => (t.deadline && !t.completed ? daysBetween(today(), t.deadline) : null);

export function deadlineState(t) {
  const d = deadlineDays(t);
  if (d === null) return null;
  if (d < 0) return 'late';
  if (d === 0) return 'today';
  if (d <= 3) return 'soon';
  return 'far';
}

/** Lo que vence pronto y sigue vivo, lo mas apretado primero. */
/** Lo aparcado o archivado no aprieta: algún día y anotaciones no cuentan. */
const ACCIONABLE = new Set([STATUS.INBOX, STATUS.NEXT, STATUS.SCHEDULED, STATUS.WAITING]);
export const isActionable = (t) => ACCIONABLE.has(t.status) && !t.completed;

export const upcomingDeadlines = (dias = 14) => active()
  .filter(isActionable)
  .filter((t) => t.deadline && daysBetween(today(), t.deadline) <= dias)
  .sort((a, b) => a.deadline.localeCompare(b.deadline));

/**
 * Lo que arrastras: dijiste que lo harías un día concreto y sigue ahí.
 * No es un aplazamiento declarado. Es lo que se escapó sin decir nada.
 */
export const carriedDays = (t) => (t.dueDate && !t.completed ? Math.max(0, daysBetween(t.dueDate, today())) : 0);

export const carried = () => todayList().filter((t) => t.isCommitment && isOverdue(t));

/** Lo terminado hoy, para poder contrastarlo con lo que no se ha tocado. */
export function completedToday() {
  const d = today();
  return state.tasks.filter((t) => t.completed && t.completedAt && iso(new Date(t.completedAt)) === d);
}

/**
 * Escapar cuesta más cada vez que escapas. La friccion crece con el historial:
 * aplazamientos declarados mas dias arrastrados en silencio.
 */
export function holdMs(t) {
  const n = (t.postponeCount || 0) + carriedDays(t);
  if (n >= 6) return 3000;
  if (n >= 3) return 2000;
  if (n >= 1) return 1300;
  return 900;
}

export function commitments() {
  return todayList().filter((t) => t.isCommitment);
}

export function nextActions({ context = null, projectId = null } = {}) {
  return active()
    .filter((t) => t.status === STATUS.NEXT || (t.status === STATUS.SCHEDULED && isDue(t)))
    .filter((t) => (context ? t.context === context : true))
    .filter((t) => (projectId ? t.projectId === projectId : true))
    .sort((a, b) => {
      if (a.isOneThing !== b.isOneThing) return a.isOneThing ? -1 : 1;
      if (a.isCommitment !== b.isCommitment) return a.isCommitment ? -1 : 1;
      return a.createdAt.localeCompare(b.createdAt);
    });
}

export function laterList() {
  const todayIds = new Set(todayList().map((t) => t.id));
  return active()
    .filter((t) => (t.status === STATUS.NEXT || t.status === STATUS.SCHEDULED) && !todayIds.has(t.id))
    .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'));
}

export const waitingList = () =>
  active().filter((t) => t.status === STATUS.WAITING)
    .sort((a, b) => {
      const aw = waitingByTask(a.id);
      const bw = waitingByTask(b.id);
      return (aw?.reviewDate || '9999').localeCompare(bw?.reviewDate || '9999');
    });

export const somedayList = () =>
  active().filter((t) => t.status === STATUS.SOMEDAY)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export const referenceList = () =>
  active().filter((t) => t.status === STATUS.REFERENCE)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export const activeProjects = () => state.projects
  .filter((p) => p.status === 'active')
  .sort((a, b) => codeNumber(a.code) - codeNumber(b.code));

export const pausedProjects = () => state.projects
  .filter((p) => p.status === 'paused')
  .sort((a, b) => codeNumber(a.code) - codeNumber(b.code));

/** Para elegir proyecto al editar: activos primero, pausados después. */
export const selectableProjects = () => [...activeProjects(), ...pausedProjects()];

export function projectTasks(projectId, { includeDone = false } = {}) {
  return state.tasks
    .filter((t) => t.projectId === projectId && (includeDone || !t.completed))
    .sort((a, b) => Number(a.completed) - Number(b.completed) || a.createdAt.localeCompare(b.createdAt));
}

/** Un proyecto sin siguiente accion no avanza: es una intencion, no un plan. */
export function projectNext(projectId) {
  return projectTasks(projectId).find((t) => t.status === STATUS.NEXT || (t.status === STATUS.SCHEDULED && isDue(t))) || null;
}

export const stalledProjects = () => activeProjects().filter((p) => !projectNext(p.id));

/** Lo pospuesto muchas veces no es una tarea: es una decision pendiente. */
export const chronic = () =>
  active()
    .filter((t) => (t.postponeCount || 0) >= postponeAlert() && t.status !== STATUS.SOMEDAY)
    .sort((a, b) => b.postponeCount - a.postponeCount);

export function waitingDue() {
  const t = today();
  return waitingList().filter((task) => {
    const w = waitingByTask(task.id);
    return w && w.reviewDate && w.reviewDate <= t;
  });
}

export function tasksOnDate(date) {
  return state.tasks.filter((t) => !t.completed && t.dueDate === date);
}

export function reviewsOnDate(date) {
  return state.waitings
    .filter((w) => w.reviewDate === date)
    .map((w) => ({ waiting: w, task: byId(w.taskId) }))
    .filter((x) => x.task && !x.task.completed && x.task.status === STATUS.WAITING && !isPausedTask(x.task));
}

/* ------------------------------- Calendario ------------------------------- */

const ordenDia = (a, b) => {
  if (a.isOneThing !== b.isOneThing) return a.isOneThing ? -1 : 1;
  if (a.isCommitment !== b.isCommitment) return a.isCommitment ? -1 : 1;
  return (a.reminder || '99').localeCompare(b.reminder || '99') || a.createdAt.localeCompare(b.createdAt);
};

/**
 * Todo lo que ocurre un día, separado por lo que significa: lo que piensas
 * hacer, lo que vence, lo que te avisa, a quién toca preguntar, lo que hiciste
 * y cuánto trabajaste de verdad. Lo pausado no ocupa sitio.
 */
export function dayAgenda(date) {
  const fuera = pausados();
  const vivas = state.tasks.filter((t) => !t.completed && !(t.projectId && fuera.has(t.projectId)));
  return {
    due: vivas.filter((t) => t.dueDate === date && isActionable(t)).sort(ordenDia),
    deadlines: vivas.filter((t) => t.deadline === date && isActionable(t)).sort(ordenDia),
    reminders: vivas.filter((t) => t.reminder && reminderDate(t) === date && isActionable(t))
      .sort((a, b) => a.reminder.localeCompare(b.reminder)),
    reviews: reviewsOnDate(date),
    done: state.tasks.filter((t) => t.completed && t.completedAt && iso(new Date(t.completedAt)) === date)
      .sort((a, b) => (a.completedAt || '').localeCompare(b.completedAt || '')),
    deep: deepMinutesOn(date),
  };
}

/** Lo que tenía fecha y ya pasó sin hacerse. */
export const overdueTasks = () => active()
  .filter(isActionable)
  .filter((t) => t.status !== STATUS.WAITING && t.dueDate && t.dueDate < today())
  .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

/** Siguientes acciones sin día: lo que se reparte al planificar la semana. */
export const unscheduledActions = () => nextActions().filter((t) => !t.dueDate);

export function deepMinutesOn(date) {
  return state.sessions
    .filter((x) => x.kind === 'deep' && x.startedAt && iso(new Date(x.startedAt)) === date)
    .reduce((n, x) => n + (x.minutes || 0), 0);
}

/* ------------------------------- Anotaciones ------------------------------ */

/*
 * Una anotacion es informacion, no trabajo: un dato, una referencia, algo que
 * hay que poder consultar. En GTD es material de referencia, y por eso no pisa
 * el tablero, no pide fecha y no cuenta como nada pendiente.
 *
 * Fijarla (pinned) es decir "esta la consulto": sale arriba y aparece en la
 * cabecera del proyecto al que pertenece.
 */

export const isNote = (t) => !!t && t.status === STATUS.REFERENCE;

const ordenNotas = (a, b) => {
  if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1;
  return (b.createdAt || '').localeCompare(a.createdAt || '');
};

/** Anotaciones vivas. `projectId` null = sueltas; undefined = todas. */
export function noteList({ projectId = undefined, q = '' } = {}) {
  const texto = String(q || '').trim().toLowerCase();
  return active()
    .filter(isNote)
    .filter((t) => (projectId === undefined ? true : (t.projectId || null) === projectId))
    .filter((t) => (texto ? `${t.title} ${t.notes || ''}`.toLowerCase().includes(texto) : true))
    .sort(ordenNotas);
}

/** Las de un proyecto, aunque este en pausa: su tablero si las muestra. */
export const projectNotes = (projectId) => state.tasks
  .filter((t) => !t.completed && isNote(t) && t.projectId === projectId)
  .sort(ordenNotas);

export const pinnedNotes = () => noteList().filter((t) => t.pinned);

/** Anotar es escribir una linea. Admite #proyecto y @contexto, nada mas. */
export async function createNote(raw, { projectId = null, body = '' } = {}) {
  const p = parseCapture(raw, { projects: selectableProjects(), contexts: allContexts() });
  if (!p.title) return null;
  let destino = projectId || p.projectId || null;
  if (!destino && p.projectName) {
    const proyecto = await createProject({ name: p.projectName });
    destino = proyecto ? proyecto.id : null;
  }
  if (p.context) await addContext(p.context);
  const t = newTask(p.title, {
    status: STATUS.REFERENCE,
    projectId: destino,
    context: p.context,
    notes: String(body || ''),
  });
  state.tasks.push(t);
  await persistTask(t);
  touched();
  return t;
}

export async function togglePin(id) {
  const t = byId(id);
  if (!t) return null;
  return updateTask(id, { pinned: !t.pinned });
}

/** Lo que resulto ser trabajo deja de ser nota y entra en el sistema. */
export async function noteToAction(id) {
  await updateTask(id, { pinned: false });
  return makeNext(id);
}

/* --------------------------------- Tablero -------------------------------- */

/**
 * Columnas del tablero. Son los estados de GTD, no fases inventadas:
 * lo capturado, lo que toca, lo que espera a otro, lo aparcado y lo hecho.
 */
/** Lo programado no es otra fase: es la siguiente acción con fecha. */
const columnOf = (t) => (t.status === STATUS.SCHEDULED ? STATUS.NEXT : t.status);

/** Tareas del tablero agrupadas por columna. `projectId` null = tablero global. */
export function board({ projectId = null, context = null } = {}) {
  const hoy = today();
  const fuera = pausados();
  const pool = state.tasks
    .filter((t) => t.status !== STATUS.REFERENCE)
    .filter((t) => (projectId ? t.projectId === projectId : !(t.projectId && fuera.has(t.projectId))))
    .filter((t) => (context ? t.context === context : true))
    // Lo hecho no se acumula para siempre: solo lo cerrado en los ultimos 7 dias.
    .filter((t) => !t.completed || (t.completedAt && iso(new Date(t.completedAt)) >= addDays(hoy, -7)));

  const out = {};
  const cols = columns();
  for (const c of cols) out[c.key] = [];
  for (const t of pool) {
    const k = columnOf(t);
    if (out[k]) out[k].push(t);
  }
  for (const c of cols) {
    out[c.key].sort((a, b) => {
      if (a.isOneThing !== b.isOneThing) return a.isOneThing ? -1 : 1;
      if (a.isCommitment !== b.isCommitment) return a.isCommitment ? -1 : 1;
      if (c.key === STATUS.DONE) return (b.completedAt || '').localeCompare(a.completedAt || '');
      return (a.dueDate || '9999').localeCompare(b.dueDate || '9999');
    });
  }
  return out;
}

/** Mover una tarjeta de columna. Cada movimiento es una decisión de GTD. */
export async function moveTo(id, column) {
  const t = byId(id);
  if (!t) return null;
  if (column === STATUS.DONE) return complete(id);
  if (t.completed) await uncomplete(id);

  if (column === STATUS.WAITING) {
    return updateTask(id, { status: STATUS.WAITING, isOneThing: false, isCommitment: false });
  }
  if (column === STATUS.SOMEDAY) return makeSomeday(id);
  if (column === STATUS.INBOX) {
    return updateTask(id, {
      status: STATUS.INBOX, isOneThing: false, isCommitment: false, dueDate: null,
    });
  }
  // SIGUIENTE: conserva la fecha; si es futura sigue siendo programada.
  const future = t.dueDate && t.dueDate > today();
  return updateTask(id, { status: future ? STATUS.SCHEDULED : STATUS.NEXT });
}

/* --------------------------------- Avisos --------------------------------- */

/**
 * Un aviso es fecha y hora locales: «2026-09-12T09:00». Lo dispara el servidor
 * local con una notificación de escritorio, así que llega aunque el navegador
 * esté cerrado.
 */
export const reminderDate = (t) => (t.reminder ? t.reminder.slice(0, 10) : null);
export const reminderTime = (t) => (t.reminder ? t.reminder.slice(11, 16) : null);

export function reminderLabel(t) {
  if (!t.reminder) return '';
  const d = reminderDate(t);
  const diff = daysBetween(today(), d);
  const dia = diff === 0 ? 'HOY' : diff === 1 ? 'MAÑANA' : diff === -1 ? 'AYER' : d.slice(8, 10) + '/' + d.slice(5, 7);
  return `${dia} ${reminderTime(t)}`;
}

/** Avisos de hoy que aún no han sonado, en orden. */
export function remindersToday() {
  const hoy = today();
  const ahora = new Date();
  const hhmm = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
  return active()
    .filter(isActionable)
    .filter((t) => t.reminder && reminderDate(t) === hoy && reminderTime(t) >= hhmm)
    .sort((a, b) => a.reminder.localeCompare(b.reminder));
}

export const remindersOnDate = (date) => state.tasks
  .filter((t) => !t.completed && t.reminder && reminderDate(t) === date)
  .sort((a, b) => a.reminder.localeCompare(b.reminder));

/* -------------------------- Sesiones de trabajo --------------------------- */

/**
 * Lo unico que merece la pena contar: horas de trabajo profundo.
 * No cuantas veces abriste la aplicacion ni cuantas tareas tocaste.
 */
export async function logSession({ taskId, kind = 'deep', plannedMin = 0, startedAt, endedAt, note = '' }) {
  const minutos = Math.max(0, Math.round((new Date(endedAt) - new Date(startedAt)) / 60000));
  if (minutos < 1) return null;
  const s = {
    id: uid(),
    taskId: taskId || null,
    kind,
    plannedMin: Number(plannedMin) || 0,
    startedAt,
    endedAt,
    minutes: minutos,
    note: String(note || '').slice(0, 500),
  };
  state.sessions.push(s);
  await db.put('sessions', s);
  touched();
  return s;
}

export function sessionsSince(fromDate = weekStart()) {
  return state.sessions.filter((s) => s.startedAt && iso(new Date(s.startedAt)) >= fromDate);
}

export function deepMinutes(fromDate = weekStart()) {
  return sessionsSince(fromDate).filter((s) => s.kind === 'deep').reduce((n, s) => n + s.minutes, 0);
}

export const deepMinutesToday = () => deepMinutes(today());

/* -------------------------------- Metricas ------------------------------- */

/** Solo responden a una pregunta: ¿estoy haciendo el trabajo importante? */
export function stats(fromDate = weekStart()) {
  const done = state.tasks.filter((t) => t.completed && t.completedAt && iso(new Date(t.completedAt)) >= fromDate);
  const kept = done.filter((t) => t.isCommitment).length;
  const broken = carried().length;
  return {
    completed: done.length,
    kept,
    broken,
    postponed: active().reduce((n, t) => n + (t.postponeCount || 0), 0),
    // Lo unico que mide algo: de lo que dijiste que harias, cuanto hiciste.
    rate: kept + broken > 0 ? Math.round((kept / (kept + broken)) * 100) : null,
  };
}

/* ------------------------- Exportar / importar ---------------------------- */

export function snapshot() {
  return {
    version: 1,
    app: 'gsd',
    exportedAt: now(),
    tasks: state.tasks,
    projects: state.projects,
    waitings: state.waitings,
    sessions: state.sessions,
    meta: state.settings ? [state.settings] : [],
  };
}

export function toCSV() {
  const cols = ['id','title','status','project','context','dueDate','waitingFor','notes',
    'createdAt','completedAt','completed','isOneThing','isCommitment','postponeCount','recurrence','deadline','reminder'];
  const cell = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [cols.join(',')];
  for (const t of state.tasks) {
    const p = projectById(t.projectId);
    lines.push([
      t.id, t.title, t.status, p ? projectLabel(p) : '', t.context || '', t.dueDate || '',
      t.waitingFor || '', t.notes || '', t.createdAt, t.completedAt || '',
      t.completed, t.isOneThing, t.isCommitment, t.postponeCount, recurrenceLabel(t.recurrence),
      t.deadline || '', t.reminder || '',
    ].map(cell).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}

export async function importData(raw, { merge = false } = {}) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.tasks)) {
    throw new Error('El fichero no tiene la estructura esperada.');
  }
  const tasks = raw.tasks.map(normTask);
  const projects = (raw.projects || []).map(normProject);
  const waitings = (raw.waitings || []).map(normWaiting);
  const meta = Array.isArray(raw.meta) ? raw.meta : [];

  if (merge) {
    const known = new Set(state.tasks.map((t) => t.id));
    const knownP = new Set(state.projects.map((p) => p.id));
    const knownW = new Set(state.waitings.map((w) => w.id));
    const newTasks = tasks.filter((t) => !known.has(t.id));
    const newProjects = projects.filter((p) => !knownP.has(p.id));
    const newWaitings = waitings.filter((w) => !knownW.has(w.id));
    state.tasks.push(...newTasks);
    state.projects.push(...newProjects);
    state.waitings.push(...newWaitings);
    await db.putMany('tasks', newTasks);
    await db.putMany('projects', newProjects);
    await db.putMany('waitings', newWaitings);
    enforceOneThing();
    touched();
    return { tasks: newTasks.length, projects: newProjects.length };
  }

  const settings = meta.find((m) => m.id === 'settings') || defaultSettings();
  const sessions = Array.isArray(raw.sessions) ? raw.sessions.filter((x) => x && x.id) : [];
  await db.replaceAll({ tasks, projects, waitings, sessions, meta: [settings] });
  state.tasks = tasks;
  state.projects = projects;
  state.waitings = waitings;
  state.sessions = sessions;
  state.settings = { ...defaultSettings(), ...settings, id: 'settings' };
  enforceOneThing();
  touched();
  await sync.flush();
  return { tasks: tasks.length, projects: projects.length };
}

export async function wipe() {
  await db.replaceAll({ tasks: [], projects: [], waitings: [], sessions: [], meta: [defaultSettings()] });
  state.tasks = [];
  state.projects = [];
  state.waitings = [];
  state.sessions = [];
  state.settings = defaultSettings();
  touched();
  await sync.flush();
}

/* ------------------------------ Weekly review ---------------------------- */

/** Dias desde la ultima revision cerrada. null si nunca se cerro ninguna. */
export function daysSinceReview() {
  const last = state.settings && state.settings.lastReview;
  if (!last) return null;
  return daysBetween(iso(new Date(last)), today());
}

/**
 * Acciones que llevan semanas quietas: sin fecha, sin tocarse y sin cerrarse.
 * No son urgentes; son sospechosas. En la revision se confirman o se tiran.
 */
export const staleNextActions = (dias = 21) => nextActions()
  .filter((t) => !t.dueDate && !t.isCommitment && daysBetween(iso(new Date(t.createdAt)), today()) >= dias)
  .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export const projectsWithoutOutcome = () => activeProjects().filter((p) => !p.outcome);

/** En pausa sin fecha de vuelta: hay que decidirlo en cada revision. */
export const pausedWithoutDate = () => pausedProjects().filter((p) => !p.pausedUntil);

export const somedayOld = (dias = 120) => somedayList()
  .filter((t) => daysBetween(iso(new Date(t.createdAt)), today()) >= dias);

export function reviewState() {
  const wk = weekStart();
  const r = state.settings && state.settings.review;
  if (!r || r.week !== wk) return { week: wk, steps: {} };
  return r;
}

export async function setReviewStep(key, value) {
  const r = reviewState();
  const steps = { ...r.steps, [key]: value };
  await saveSettings({ review: { week: r.week, steps } });
}

export async function finishReview() {
  await saveSettings({ lastReview: now(), review: { week: weekStart(), steps: {} } });
}

export async function resetReview() {
  await saveSettings({ review: { week: weekStart(), steps: {} } });
}
