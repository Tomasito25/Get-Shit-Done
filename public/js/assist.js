/*
 * Ayuda de sintaxis mientras se escribe.
 *
 * La sintaxis de captura solo sirve si no hay que recordarla. Así que:
 *
 *   - la leyenda está siempre debajo del campo, también mientras escribes;
 *   - al empezar una marca (@ # ! ^ * %) aparece la lista de opciones que
 *     caben ahí, filtrándose con cada letra;
 *   - ↑ ↓ para moverse, Enter o Tab para elegir, Esc para cerrarla.
 *
 * Pulsar una marca de la leyenda la escribe en el cursor.
 */

import { add, h, today, addDays, parseISO } from './util.js';
import * as S from './store.js';
import { parseDate, parseRecurrence, parseReminder, resolveReminder } from './parse.js';

const MARCAS = [
  { m: '@', label: 'contexto' },
  { m: '#', label: 'proyecto' },
  { m: '!', label: 'cuándo' },
  { m: '^', label: 'tope' },
  { m: '*', label: 'repite' },
  { m: '%', label: 'aviso' },
  { m: '!!', label: 'no negociar' },
];

const limpio = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '');

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function fechaHumana(isoDate) {
  const d = parseISO(isoDate);
  const diff = Math.round((d - parseISO(today())) / 86400000);
  const base = `${DIAS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  if (diff === 0) return `hoy · ${base}`;
  if (diff === 1) return `mañana · ${base}`;
  return base;
}

/* -------------------------------- Opciones -------------------------------- */

function opcionesFecha(marca, q) {
  const valores = ['hoy', 'mañana', 'pasado', '+2d', '+3d', '+1s', '+2s', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'];
  const salida = [];
  if (marca === '!' && (!q || '!'.startsWith(q))) {
    salida.push({ insert: '!!', label: 'no negociar', hint: 'compromiso del día' });
  }
  for (const v of valores) {
    if (q && !limpio(v).startsWith(limpio(q))) continue;
    const d = parseDate(v);
    if (d) salida.push({ insert: `${marca}${v}`, label: v, hint: fechaHumana(d) });
  }
  // Si lo escrito ya es una fecha válida que no está en la lista (12/09), también vale.
  if (q && !salida.some((o) => limpio(o.label) === limpio(q))) {
    const d = parseDate(q);
    if (d) salida.unshift({ insert: `${marca}${q}`, label: q, hint: fechaHumana(d) });
  }
  return salida;
}

function opcionesContexto(q) {
  const ctxs = S.allContexts();
  const salida = ctxs
    .filter((c) => !q || limpio(c).includes(limpio(q)))
    .map((c) => ({ insert: c, label: c, hint: `${S.contextUsage(c)} abiertas` }));
  const nuevo = `@${q}`;
  if (q && !ctxs.some((c) => limpio(c) === limpio(nuevo))) {
    salida.push({ insert: nuevo, label: nuevo, hint: 'contexto nuevo' });
  }
  return salida;
}

function opcionesProyecto(q) {
  const qq = limpio(q);
  const num = /^p?(\d{1,3})$/.exec(qq);
  const salida = S.selectableProjects()
    .filter((p) => {
      if (!qq) return true;
      if (num && p.code && Number(p.code.slice(1)) === Number(num[1])) return true;
      return limpio(S.projectLabel(p)).includes(qq);
    })
    .map((p) => ({
      insert: `#${p.code || p.name.replace(/\s+/g, '-')}`,
      label: p.code ? p.name : S.projectLabel(p),
      hint: p.status === 'paused' ? 'en pausa' : `${S.projectTasks(p.id).length} abiertas`,
    }));
  if (q && !num && !salida.length) {
    salida.push({ insert: `#${q}`, label: q.replace(/[-_]/g, ' '), hint: `proyecto nuevo · ${S.nextProjectCode()}` });
  }
  return salida;
}

function opcionesRepeticion(q) {
  const valores = ['diario', '2d', '3d', 'semanal', 'lun,mie,vie', 'lun,jue', 'mar,jue', 'sab', 'mes-1', 'mes-15'];
  const salida = valores
    .filter((v) => !q || limpio(v).startsWith(limpio(q)))
    .map((v) => ({ insert: `*${v}`, label: v, hint: S.recurrenceLabel(parseRecurrence(v)).toLowerCase() }));
  if (q && !salida.some((o) => o.label === q)) {
    const r = parseRecurrence(q);
    if (r) salida.unshift({ insert: `*${q}`, label: q, hint: S.recurrenceLabel(r).toLowerCase() });
  }
  return salida;
}

function opcionesAviso(q) {
  const valores = ['9:00', '12:00', '15:00', '18:00', '20:00', 'mañana-9:00', 'mañana-18:00', 'lun-9:00'];
  const salida = [];
  const describir = (v) => {
    const r = parseReminder(v);
    if (!r) return null;
    const cuando = resolveReminder(r);
    return `${fechaHumana(cuando.slice(0, 10))} · ${cuando.slice(11)}`;
  };
  if (q && !valores.includes(q)) {
    const d = describir(q);
    if (d) salida.push({ insert: `%${q}`, label: q, hint: d });
  }
  for (const v of valores) {
    if (q && !limpio(v).startsWith(limpio(q))) continue;
    const d = describir(v);
    if (d) salida.push({ insert: `%${v}`, label: v, hint: d });
  }
  return salida;
}

const CABECERA = {
  '@': 'CONTEXTO — DÓNDE O CON QUÉ',
  '#': 'PROYECTO',
  '!': 'CUÁNDO LO HACES',
  '^': 'FECHA TOPE — CUÁNDO DEJA DE SERVIR',
  '*': 'SE REPITE',
  '%': 'AVISO — NOTIFICACIÓN DE ESCRITORIO',
};

function opciones(marca, q) {
  if (marca === '@') return opcionesContexto(q);
  if (marca === '#') return opcionesProyecto(q);
  if (marca === '!' || marca === '^') return opcionesFecha(marca, q);
  if (marca === '*') return opcionesRepeticion(q);
  if (marca === '%') return opcionesAviso(q);
  return [];
}

/* ----------------------------- Token del cursor --------------------------- */

function tokenAt(input) {
  const v = input.value;
  const caret = input.selectionStart ?? v.length;
  let start = caret;
  while (start > 0 && !/\s/.test(v[start - 1])) start -= 1;
  const palabra = v.slice(start, caret);
  if (!palabra) return null;
  const marca = palabra[0];
  if (!'@#!^*%'.includes(marca)) return null;
  if (palabra.startsWith('!!')) return null;
  return { start, caret, marca, q: palabra.slice(1) };
}

/* ---------------------------------- API ----------------------------------- */

/**
 * Envuelve un campo con la ayuda. Devuelve el contenedor para colocarlo donde
 * iba el campo. Llamarlo ANTES de añadir al campo otros manejadores de Enter:
 * así, con la lista abierta, Enter elige opción en vez de enviar la línea.
 */
export function withAssist(input, { echo = null } = {}) {
  const lista = h('div', { class: 'assist-list', role: 'listbox' });
  lista.hidden = true;

  const marcas = MARCAS.map((x) => {
    const b = h('button', {
      class: 'assist-mark', type: 'button', tabindex: '-1',
      title: `Escribir ${x.m} (${x.label})`, dataset: { m: x.m },
    }, h('b', { text: x.m }), x.label);
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      insertarMarca(x.m);
    });
    return b;
  });
  const leyenda = h('div', { class: 'assist-legend' }, marcas);

  let items = [];
  let activo = 0;
  let tok = null;

  const marcarLeyenda = (m) => {
    marcas.forEach((b) => b.classList.toggle('on', b.dataset.m === m));
  };

  const cerrar = () => {
    lista.hidden = true;
    lista.textContent = '';
    items = [];
    tok = null;
    marcarLeyenda(null);
  };

  const pintar = () => {
    lista.textContent = '';
    add(lista, h('div', { class: 'assist-head', text: CABECERA[tok.marca] || '' }));
    items.forEach((it, i) => {
      const fila = h('div', { class: `assist-item${i === activo ? ' on' : ''}`, role: 'option' },
        h('span', { class: 'assist-ins', text: it.insert }),
        h('span', { class: 'assist-label', text: it.label === it.insert ? '' : it.label }),
        h('span', { class: 'assist-hint', text: it.hint || '' }));
      fila.addEventListener('mousedown', (e) => { e.preventDefault(); elegir(it); });
      add(lista, fila);
    });
    const vivo = lista.querySelector('.assist-item.on');
    if (vivo) vivo.scrollIntoView({ block: 'nearest' });
  };

  const actualizar = () => {
    tok = tokenAt(input);
    marcarLeyenda(tok ? tok.marca : null);
    if (!tok) { cerrar(); return; }
    items = opciones(tok.marca, tok.q).slice(0, 9);
    if (!items.length) { lista.hidden = true; lista.textContent = ''; return; }
    if (activo >= items.length) activo = 0;
    pintar();
    lista.hidden = false;
  };

  const elegir = (it) => {
    if (!tok) return;
    const v = input.value;
    let fin = tok.caret;
    while (fin < v.length && !/\s/.test(v[fin])) fin += 1;
    const antes = v.slice(0, tok.start);
    const despues = v.slice(fin).replace(/^\s*/, '');
    input.value = `${antes}${it.insert} ${despues}`;
    const pos = `${antes}${it.insert} `.length;
    cerrar();
    input.focus();
    input.setSelectionRange(pos, pos);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const insertarMarca = (m) => {
    const v = input.value;
    const pos = input.selectionStart ?? v.length;
    const antes = v.slice(0, pos);
    const sep = antes && !/\s$/.test(antes) ? ' ' : '';
    input.value = `${antes}${sep}${m}${v.slice(pos)}`;
    const p2 = `${antes}${sep}${m}`.length;
    input.focus();
    input.setSelectionRange(p2, p2);
    activo = 0;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  input.addEventListener('keydown', (e) => {
    if (lista.hidden || !items.length || !tok) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault(); e.stopImmediatePropagation();
      activo = (activo + 1) % items.length; pintar();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault(); e.stopImmediatePropagation();
      activo = (activo - 1 + items.length) % items.length; pintar();
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      // Si lo escrito ya es exactamente la opción, Enter envía la línea.
      const exacto = limpio(`${tok.marca}${tok.q}`) === limpio(items[activo].insert);
      if (e.key === 'Enter' && exacto) { cerrar(); return; }
      e.preventDefault(); e.stopImmediatePropagation();
      elegir(items[activo]);
    } else if (e.key === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      cerrar();
    }
  }, true);

  input.addEventListener('input', () => { activo = 0; actualizar(); });
  input.addEventListener('click', actualizar);
  input.addEventListener('keyup', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) actualizar();
  });
  input.addEventListener('blur', () => setTimeout(cerrar, 120));

  return h('div', { class: 'assist-wrap' },
    h('div', { class: 'assist-field' }, input, lista),
    echo,
    leyenda);
}

/** Días para chips de fecha, reutilizados por el editor. */
export const quick = { today, addDays, parseDate };
