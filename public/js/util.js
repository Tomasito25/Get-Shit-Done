/* Utilidades minimas: DOM, fechas, friccion, avisos. */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(4)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

/**
 * Monta hijos ignorando null/undefined/false. Element.append() los convertiria
 * en el texto "null"; esto evita esa clase entera de fallo.
 */
export function add(el, ...kids) {
  for (const kid of kids.flat(4)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

export const now = () => new Date().toISOString();

/* --------------------------------- Fechas -------------------------------- */

const pad = (n) => String(n).padStart(2, '0');

/** Fecha local en formato YYYY-MM-DD (nunca UTC: el dia del usuario es local). */
export function iso(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const today = () => iso();
export function addDays(isoDate, n) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return iso(dt);
}
export const tomorrow = () => addDays(today(), 1);
export function parseISO(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
const DIAS = ['domingo','lunes','martes','miércoles','jueves','viernes','sábado'];

export function fmtDate(isoDate) {
  if (!isoDate) return '';
  const d = parseISO(isoDate);
  return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
}
export function fmtLong(isoDate) {
  const d = parseISO(isoDate);
  return `${DIAS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
}
export const monthName = (i) => MESES[i];

/** Etiqueta relativa corta: HOY, MAÑANA, +3D, HACE 2D. */
export function relDate(isoDate) {
  if (!isoDate) return '';
  const diff = daysBetween(today(), isoDate);
  if (diff === 0) return 'HOY';
  if (diff === 1) return 'MAÑANA';
  if (diff === -1) return 'AYER';
  if (diff < 0) return `HACE ${-diff}D`;
  if (diff <= 7) return `+${diff}D`;
  return fmtDate(isoDate).toUpperCase();
}

export const isPast = (isoDate) => !!isoDate && isoDate < today();
export const isTodayOrPast = (isoDate) => !!isoDate && isoDate <= today();

/** Lunes de la semana de una fecha. */
export function weekStart(isoDate = today()) {
  const d = parseISO(isoDate);
  const shift = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - shift);
  return iso(d);
}

export function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return 'STILL AWAKE';
  if (hour < 13) return 'GOOD MORNING';
  if (hour < 20) return 'GOOD AFTERNOON';
  return 'GOOD EVENING';
}

/* ------------------------------- Interaccion ------------------------------ */

let toastTimer = null;

/** Aviso breve. Con `undo` muestra una accion para deshacer. */
export function toast(msg, undo = null, ms = 4200) {
  const box = document.getElementById('toast');
  box.textContent = '';
  box.append(document.createTextNode(msg));
  if (undo) {
    const b = h('button', { type: 'button', text: 'DESHACER' });
    b.addEventListener('click', () => { hideToast(); undo(); });
    box.append(b);
  }
  box.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, ms);
}
export function hideToast() {
  clearTimeout(toastTimer);
  const box = document.getElementById('toast');
  if (box) { box.hidden = true; box.textContent = ''; }
}

/**
 * Friccion deliberada: la accion solo ocurre si se mantiene pulsado.
 * No es un castigo. Impide que renegociar sea tan barato como un clic.
 */
export function holdToConfirm(btn, onDone, ms = 800) {
  let timer = null;
  btn.classList.add('hold');
  btn.style.setProperty('--hold-ms', `${ms}ms`);

  const stop = () => {
    clearTimeout(timer);
    timer = null;
    btn.classList.remove('holding');
  };
  const begin = (ev) => {
    if (ev.type === 'pointerdown' && ev.button !== 0) return;
    ev.preventDefault();
    if (timer) return;
    btn.classList.add('holding');
    timer = setTimeout(() => { stop(); onDone(); }, ms);
  };

  btn.addEventListener('pointerdown', begin);
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointerleave', stop);
  btn.addEventListener('pointercancel', stop);
  btn.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') begin(e); });
  btn.addEventListener('keyup', stop);
  btn.addEventListener('blur', stop);
  return btn;
}

export const isTyping = (el = document.activeElement) =>
  !!el && (el.matches('input, textarea, select') || el.isContentEditable);

/** Foco inmediato y de nuevo en el siguiente frame: escribir no debe esperar. */
export function focusSoon(el) {
  if (!el) return;
  const grab = () => {
    if (!el.isConnected) return;
    el.focus();
    if (el.select) el.select();
  };
  grab();
  requestAnimationFrame(grab);
}

export function plural(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}
