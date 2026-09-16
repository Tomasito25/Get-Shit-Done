/*
 * CALENDARIO.
 *
 * Donde se ve la semana entera y se planifica: lo que piensas hacer cada día,
 * lo que vence, lo que te avisa, a quién toca preguntar y lo que ya hiciste.
 *
 * Tres vistas:
 *   SEMANA   siete columnas; se arrastra una tarea de un día a otro y se
 *            reparte lo que aún no tiene día.
 *   MES      la cuadrícula de siempre, con los títulos y no solo puntos.
 *   AGENDA   las próximas tres semanas en lista, día a día.
 *
 * Reglas que no cambian por mover una tarjeta:
 *   - Mover a más tarde un compromiso pasa por posponer, con su fricción.
 *   - Sacar una tarea de un día que ya pasó cuenta como aplazamiento.
 *   - La fecha tope no se arrastra: no se negocia.
 *   - El pasado no se planifica.
 */

import { add, h, iso, today, addDays, parseISO, monthName, fmtLong, fmtDate, weekStart, daysBetween, toast } from '../util.js';
import * as S from '../store.js';
import * as V from '../voice.js';
import * as viewkeys from '../viewkeys.js';
import {
  pageHead, section, openEditor, openPostpone, completeToggle, openDelegate,
  openCountdownForm, countdownCard,
} from '../components.js';

const DOW = ['LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB', 'DOM'];
const MES_CORTO = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

/** Qué periodo se ve y qué día está elegido. Vive lo que la sesión. */
const estado = { ancla: null, sel: null, verHecho: false };

const rerender = () => dispatchEvent(new CustomEvent('gsd:rerender'));
const vista = () => {
  const v = S.state.settings && S.state.settings.calendarView;
  return ['semana', 'mes', 'agenda'].includes(v) ? v : 'semana';
};

/* --------------------------------- Pantalla ------------------------------- */

export function render() {
  const hoy = today();
  if (!estado.ancla) estado.ancla = hoy;
  if (!estado.sel) estado.sel = hoy;
  const modo = vista();

  const wrap = h('div', { class: modo === 'semana' ? 'wrap-board' : 'wrap-wide' });
  const vencidas = S.overdueTasks();
  const dias = diasVisibles(modo);
  const agendas = new Map(dias.map((d) => [d, S.dayAgenda(d)]));
  const sobrecargados = dias.filter((d) => d >= hoy && agendas.get(d).due.length > S.commitCap()).length;
  const vacio = dias.filter((d) => d >= hoy).every((d) => !agendas.get(d).due.length);

  add(wrap, pageHead('CALENDARIO',
    'Lo que haces cada día, lo que vence y lo que ya hiciste. Arrastra una tarea para cambiarla de día.',
    V.gritCalendar({ overdue: vencidas.length, overloaded: sobrecargados, empty: vacio })));

  add(wrap, barra(modo));

  viewkeys.set((e) => {
    if (e.key === 'ArrowLeft') { mover(modo, -1); return true; }
    if (e.key === 'ArrowRight') { mover(modo, 1); return true; }
    return false;
  });

  if (modo === 'semana') add(wrap, semana(dias, agendas));
  if (modo === 'mes') add(wrap, mes(agendas));
  if (modo === 'agenda') add(wrap, agenda(dias, agendas, vencidas));

  if (modo !== 'agenda') add(wrap, bandejas(vencidas));
  if (modo === 'mes') add(wrap, detalleDia(estado.sel));
  add(wrap, panelCuentas());

  add(wrap, h('div', { class: 'cal-legend' },
    h('span', {}, h('i', { class: 'cal-chip-demo' }), 'lo que haces ese día'),
    h('span', {}, h('i', { class: 'cal-chip-demo commit' }), 'compromiso'),
    h('span', {}, h('i', { class: 'cal-chip-demo dl' }), 'fecha tope'),
    h('span', { text: '◷ aviso' }),
    h('span', { text: '→ revisar lo que esperas' }),
    h('span', { text: '← → cambia de periodo' })));

  return wrap;
}

function diasVisibles(modo) {
  if (modo === 'semana') {
    const lunes = weekStart(estado.ancla);
    return Array.from({ length: 7 }, (_, i) => addDays(lunes, i));
  }
  if (modo === 'agenda') {
    return Array.from({ length: 21 }, (_, i) => addDays(today(), i));
  }
  const d = parseISO(estado.ancla);
  const primero = new Date(d.getFullYear(), d.getMonth(), 1);
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return Array.from({ length: ultimo.getDate() }, (_, i) => iso(new Date(primero.getFullYear(), primero.getMonth(), i + 1)));
}

function mover(modo, n) {
  if (modo === 'semana') estado.ancla = addDays(estado.ancla, 7 * n);
  else if (modo === 'mes') {
    const d = parseISO(estado.ancla);
    estado.ancla = iso(new Date(d.getFullYear(), d.getMonth() + n, 1));
  } else estado.ancla = today();
  rerender();
}

function etiquetaPeriodo(modo) {
  if (modo === 'agenda') return 'PRÓXIMAS 3 SEMANAS';
  if (modo === 'mes') {
    const d = parseISO(estado.ancla);
    return `${monthName(d.getMonth()).toUpperCase()} ${d.getFullYear()}`;
  }
  const lunes = parseISO(weekStart(estado.ancla));
  const domingo = parseISO(addDays(weekStart(estado.ancla), 6));
  const mismo = lunes.getMonth() === domingo.getMonth();
  return `${lunes.getDate()}${mismo ? '' : ` ${MES_CORTO[lunes.getMonth()]}`} — ${domingo.getDate()} ${MES_CORTO[domingo.getMonth()]} ${domingo.getFullYear()}`;
}

function barra(modo) {
  const chip = (texto, activo, fn) => h('button', { class: `chip${activo ? ' on' : ''}`, type: 'button', text: texto, onclick: fn });
  return h('div', { class: 'cal-head' },
    h('div', { class: 'board-tools-group' },
      [['semana', 'SEMANA'], ['mes', 'MES'], ['agenda', 'AGENDA']].map(([k, l]) => chip(l, modo === k, () => S.saveSettings({ calendarView: k })))),
    modo !== 'agenda' ? h('button', { class: 'btn btn-sm', type: 'button', text: '‹', title: 'Anterior (←)', onclick: () => mover(modo, -1) }) : null,
    h('div', { class: 'cal-month', text: etiquetaPeriodo(modo) }),
    modo !== 'agenda' ? h('button', { class: 'btn btn-sm', type: 'button', text: '›', title: 'Siguiente (→)', onclick: () => mover(modo, 1) }) : null,
    h('div', { class: 'board-tools-group', style: 'margin-left:auto' },
      chip('VER LO HECHO', estado.verHecho, () => { estado.verHecho = !estado.verHecho; rerender(); }),
      h('button', {
        class: 'btn btn-sm', type: 'button', text: 'HOY',
        onclick: () => { estado.ancla = today(); estado.sel = today(); rerender(); },
      })));
}

/* ----------------------------------- Fichas ------------------------------- */

/** Una tarea en el calendario. Las que tienen día se pueden arrastrar a otro. */
function ficha(t, tipo = 'due') {
  const p = S.projectById(t.projectId);
  const tarde = tipo === 'due' && S.isOverdue(t);
  const clases = ['cal-chip', `cal-chip-${tipo}`];
  if (t.isOneThing) clases.push('one');
  else if (t.isCommitment && tipo === 'due') clases.push('commit');
  if (tarde) clases.push('late');
  if (t.completed) clases.push('done');

  const arrastrable = (tipo === 'due' || tipo === 'tray') && !t.completed && t.status !== S.STATUS.WAITING;
  let prefijo = null;
  if (tipo === 'deadline') prefijo = h('b', { text: 'TOPE' });
  if (tipo === 'reminder') prefijo = h('b', { text: `◷ ${S.reminderTime(t)}` });

  const el = h('div', {
    class: clases.join(' '),
    draggable: arrastrable ? 'true' : null,
    title: `${p ? `${S.projectLabel(p)} · ` : ''}${t.title}${t.context ? ` · ${t.context}` : ''}`,
    dataset: { taskId: t.id },
  },
    tipo === 'due' || tipo === 'tray'
      ? h('button', {
        class: `cal-check${t.completed ? ' done' : ''}`, type: 'button', title: t.completed ? 'Reabrir' : 'Completar',
        onclick: (e) => { e.stopPropagation(); completeToggle(t.id); },
      })
      : null,
    prefijo,
    p && p.code ? h('span', { class: 'cal-code', text: p.code }) : null,
    h('span', { class: 'cal-t', text: t.title }),
    tipo === 'tray' && t.dueDate ? h('span', { class: 'cal-when', text: `${daysBetween(t.dueDate, today())}D` }) : null);

  el.addEventListener('click', () => openEditor(t.id));
  if (arrastrable) {
    el.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('text/plain', t.id);
      ev.dataTransfer.effectAllowed = 'move';
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
  }
  return el;
}

/** Una cuenta atrás en el calendario: la fecha con nombre y lo que queda. */
function fichaCuenta(info) {
  const el = h('div', {
    class: `cal-chip cal-chip-count${info.dias !== null && info.dias <= 3 && !info.past ? ' late' : ''}`,
    title: `${info.title} · ${S.countdownLabel(info)}`,
  },
    h('b', { text: '◆' }),
    h('span', { class: 'cal-t', text: info.title }),
    h('span', { class: 'cal-when', text: info.dias === 0 ? 'HOY' : `${info.dias}D` }));
  el.addEventListener('click', () => openCountdownForm(S.countdownById(info.id)));
  return el;
}

function fichaEspera({ waiting, task }) {
  const el = h('div', { class: 'cal-chip cal-chip-review', title: `${waiting.person}: ${waiting.description}` },
    h('b', { text: `→ ${waiting.person || '—'}` }), h('span', { class: 'cal-t', text: waiting.description || task.title }));
  el.addEventListener('click', () => openDelegate(task.id));
  return el;
}

/** Soltar una tarea en un día. Las reglas de arriba, aplicadas. */
async function soltar(id, fecha) {
  const t = S.byId(id);
  if (!t || t.completed || t.dueDate === fecha) return;
  if (fecha < today()) { toast('El pasado no se planifica.'); return; }
  const antes = t.dueDate;
  if ((t.isCommitment || t.isOneThing) && fecha > (antes || today())) {
    openPostpone(id, { fecha });
    return;
  }
  // Una fecha que ya pasó y se mueve adelante es un aplazamiento, se llame como se llame.
  if (antes && antes < today()) {
    await S.postpone(id, fecha);
    toast(`Movida al ${fmtLong(fecha)}. Cuenta como aplazamiento.`);
    return;
  }
  await S.schedule(id, fecha);
  toast(antes && fecha < antes ? `Adelantada al ${fmtLong(fecha)}.` : `Para el ${fmtLong(fecha)}.`);
}

function zonaSoltar(el, fecha) {
  if (fecha < today()) return el;
  el.addEventListener('dragover', (ev) => { ev.preventDefault(); el.classList.add('drop'); });
  el.addEventListener('dragleave', (ev) => { if (!el.contains(ev.relatedTarget)) el.classList.remove('drop'); });
  el.addEventListener('drop', (ev) => {
    ev.preventDefault();
    el.classList.remove('drop');
    const id = ev.dataTransfer.getData('text/plain');
    if (id) soltar(id, fecha);
  });
  return el;
}

/** Escribir una tarea directamente en un día. Si la línea trae su propia fecha, manda esa. */
function campoDia(fecha, clave) {
  const input = h('input', {
    class: 'cal-add', type: 'text', placeholder: '+ añadir', autocomplete: 'off',
    dataset: { keepFocus: `cal-add-${clave}-${fecha}` },
    title: `Nueva tarea para el ${fmtLong(fecha)}`,
  });
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const valor = input.value.trim();
    if (!valor) return;
    e.preventDefault();
    input.value = '';
    const t = await S.captureSmart(valor);
    if (!t) return;
    if (!t.dueDate) await S.schedule(t.id, fecha);
  });
  return input;
}

/* ---------------------------------- Semana -------------------------------- */

function semana(dias, agendas) {
  const hoy = today();
  const rejilla = h('div', { class: 'cal-week' });
  for (const [i, fecha] of dias.entries()) {
    const a = agendas.get(fecha);
    const pasado = fecha < hoy;
    const carga = a.due.length;
    const exceso = !pasado && carga > S.commitCap();
    const d = parseISO(fecha);

    const cabeza = h('button', {
      class: 'cal-day-head', type: 'button', title: 'Ver este día en el mes',
      onclick: () => { estado.sel = fecha; estado.ancla = fecha; S.saveSettings({ calendarView: 'mes' }); },
    },
      h('span', { class: 'cal-dow-l', text: DOW[i] }),
      h('span', { class: 'cal-day-n', text: String(d.getDate()) }),
      carga ? h('span', { class: `cal-load${exceso ? ' over' : ''}`, text: exceso ? `${carga} · DEMASIADO` : String(carga) }) : null,
      a.deep ? h('span', { class: 'cal-deep', text: `${a.deep}′`, title: `${a.deep} minutos de trabajo profundo` }) : null);

    const cuerpo = h('div', { class: 'cal-day-body' },
      S.countdownsOnDate(fecha).map(fichaCuenta),
      a.deadlines.map((t) => ficha(t, 'deadline')),
      a.reminders.filter((t) => t.dueDate !== fecha).map((t) => ficha(t, 'reminder')),
      a.due.map((t) => ficha(t, 'due')),
      a.reviews.map(fichaEspera),
      estado.verHecho ? a.done.map((t) => ficha(t, 'done')) : null,
      !carga && !a.deadlines.length && !a.reviews.length && !pasado ? h('div', { class: 'cal-free', text: 'libre' }) : null,
      pasado && a.done.length && !estado.verHecho ? h('div', { class: 'cal-free', text: `${a.done.length} hecha${a.done.length === 1 ? '' : 's'}` }) : null);

    const col = h('section', {
      class: `cal-day${fecha === hoy ? ' today' : ''}${pasado ? ' past' : ''}${exceso ? ' over' : ''}`,
      dataset: { date: fecha },
    }, cabeza, cuerpo, pasado ? null : campoDia(fecha, 'semana'));
    add(rejilla, zonaSoltar(col, fecha));
  }
  return rejilla;
}

/* ------------------------------------ Mes --------------------------------- */

function mes(agendas) {
  const hoy = today();
  const d = parseISO(estado.ancla);
  const y = d.getFullYear();
  const m = d.getMonth();
  const grid = h('div', { class: 'cal-grid' }, DOW.map((x) => h('div', { class: 'cal-dow', text: x })));
  const lead = (new Date(y, m, 1).getDay() + 6) % 7;
  const total = new Date(y, m + 1, 0).getDate();
  const celdas = Math.ceil((lead + total) / 7) * 7;

  for (let i = 0; i < celdas; i += 1) {
    const n = i - lead + 1;
    if (n < 1 || n > total) { add(grid, h('div', { class: 'cal-cell void' })); continue; }
    const fecha = iso(new Date(y, m, n));
    const a = agendas.get(fecha) || S.dayAgenda(fecha);
    const pasado = fecha < hoy;
    const exceso = !pasado && a.due.length > S.commitCap();
    const tarde = pasado && a.due.length > 0;

    const lineas = [
      ...S.countdownsOnDate(fecha).map(fichaCuenta),
      ...a.deadlines.map((t) => ficha(t, 'deadline')),
      ...a.due.map((t) => ficha(t, 'due')),
    ];
    const cabe = 3;
    const celda = h('div', {
      class: `cal-cell${fecha === hoy ? ' today' : ''}${fecha === estado.sel ? ' on' : ''}${tarde ? ' cal-late' : ''}${exceso ? ' over' : ''}${pasado ? ' past' : ''}`,
      role: 'button', tabindex: '0',
      onclick: (e) => { if (e.target.closest('.cal-chip')) return; estado.sel = fecha; rerender(); },
    },
      h('div', { class: 'cal-cell-head' },
        h('span', { class: 'cal-num', text: String(n) }),
        a.reminders.length ? h('span', { class: 'cal-rem', text: '◷', title: `${a.reminders.length} aviso(s)` }) : null,
        a.reviews.length ? h('span', { class: 'cal-rem', text: '→', title: 'Revisar lo que esperas' }) : null,
        a.done.length ? h('span', { class: 'cal-donecount', text: `✓${a.done.length}` }) : null),
      lineas.slice(0, cabe),
      lineas.length > cabe ? h('div', { class: 'cal-more', text: `+${lineas.length - cabe} más` }) : null);
    add(grid, zonaSoltar(celda, fecha));
  }
  return grid;
}

/* ----------------------------------- Agenda ------------------------------- */

function agenda(dias, agendas, vencidas) {
  const caja = h('div', { class: 'cal-agenda' });
  if (vencidas.length) {
    add(caja, section('VENCIDAS', {
      meta: `${vencidas.length}`,
      body: h('div', { class: 'cal-agenda-list' }, vencidas.map((t) => ficha(t, 'tray'))),
      micro: 'DECIDE HOY: HACERLA, MOVERLA O SOLTARLA. MOVERLA CUENTA COMO APLAZAMIENTO.',
    }));
  }
  const hoy = today();
  for (const fecha of dias) {
    const a = agendas.get(fecha);
    const hay = a.due.length || a.deadlines.length || a.reminders.length || a.reviews.length || (estado.verHecho && a.done.length);
    if (!hay && fecha !== hoy) continue;
    const diff = daysBetween(hoy, fecha);
    const titulo = diff === 0 ? `HOY · ${fmtLong(fecha).toUpperCase()}` : diff === 1 ? `MAÑANA · ${fmtLong(fecha).toUpperCase()}` : fmtLong(fecha).toUpperCase();
    const exceso = a.due.length > S.commitCap();
    const bloque = h('section', { class: `cal-agenda-day${exceso ? ' over' : ''}` },
      h('div', { class: 'sec-head' },
        h('div', { class: 'sec-title', text: titulo }),
        h('div', { class: 'sec-meta', text: exceso ? `${a.due.length} · DEMASIADO PARA UN DÍA` : (a.due.length ? `${a.due.length}` : '') })),
      h('div', { class: 'cal-agenda-list' },
        S.countdownsOnDate(fecha).map(fichaCuenta),
        a.deadlines.map((t) => ficha(t, 'deadline')),
        a.reminders.map((t) => ficha(t, 'reminder')),
        a.due.map((t) => ficha(t, 'due')),
        a.reviews.map(fichaEspera),
        estado.verHecho ? a.done.map((t) => ficha(t, 'done')) : null,
        !hay ? h('div', { class: 'cal-free', text: 'Nada con fecha hoy. Elige qué hacer en HOY o en SIGUIENTES ACCIONES.' }) : null),
      campoDia(fecha, 'agenda'));
    add(caja, zonaSoltar(bloque, fecha));
  }
  return caja;
}

/* ---------------------------------- Bandejas ------------------------------ */

/** Lo que hay que colocar: lo vencido, y lo que aún no tiene día. */
function bandejas(vencidas) {
  const sinDia = S.unscheduledActions();
  if (!vencidas.length && !sinDia.length) return null;
  return h('div', { class: 'cal-trays' },
    vencidas.length
      ? h('section', { class: 'cal-tray late' },
        h('div', { class: 'sec-head' }, h('div', { class: 'sec-title', text: 'VENCIDAS' }), h('div', { class: 'sec-meta', text: String(vencidas.length) })),
        h('div', { class: 'cal-tray-list' }, vencidas.map((t) => ficha(t, 'tray'))),
        h('div', { class: 'micro', style: 'margin-top:8px', text: 'ARRÁSTRALAS A UN DÍA. MOVERLAS CUENTA COMO APLAZAMIENTO.' }))
      : null,
    sinDia.length
      ? h('section', { class: 'cal-tray' },
        h('div', { class: 'sec-head' }, h('div', { class: 'sec-title', text: 'SIN DÍA' }), h('div', { class: 'sec-meta', text: String(sinDia.length) })),
        h('div', { class: 'cal-tray-list' }, sinDia.slice(0, 40).map((t) => ficha(t, 'tray'))),
        h('div', { class: 'micro', style: 'margin-top:8px', text: sinDia.length > 40 ? `+${sinDia.length - 40} MÁS. REPARTE LA SEMANA: ARRASTRA UNA ACCIÓN A UN DÍA.` : 'REPARTE LA SEMANA: ARRASTRA UNA ACCIÓN A UN DÍA.' }))
      : null);
}

/* ----------------------------- Detalle de un día -------------------------- */

function detalleDia(fecha) {
  const a = S.dayAgenda(fecha);
  const hoy = today();
  const pasado = fecha < hoy;
  const bloque = (titulo, hijos) => (hijos.length
    ? h('div', { style: 'margin-top:14px' }, h('div', { class: 'list-sub', text: titulo }), h('div', { class: 'cal-agenda-list' }, hijos))
    : null);

  return section(fmtLong(fecha).toUpperCase(), {
    meta: fecha === hoy ? 'HOY' : (pasado ? `HACE ${daysBetween(fecha, hoy)} DÍAS` : `EN ${daysBetween(hoy, fecha)} DÍAS`),
    body: h('div', {},
      pasado ? null : campoDia(fecha, 'detalle'),
      bloque('LO QUE HACES ESE DÍA', a.due.map((t) => ficha(t, 'due'))),
      bloque('CUENTA ATRÁS', S.countdownsOnDate(fecha).map(fichaCuenta)),
      bloque('VENCE', a.deadlines.map((t) => ficha(t, 'deadline'))),
      bloque('AVISOS', a.reminders.map((t) => ficha(t, 'reminder'))),
      bloque('REVISAR LO QUE ESPERAS', a.reviews.map(fichaEspera)),
      bloque(`HECHO${a.deep ? ` · ${a.deep} MIN DE TRABAJO PROFUNDO` : ''}`, a.done.map((t) => ficha(t, 'done'))),
      !a.due.length && !a.deadlines.length && !a.reminders.length && !a.reviews.length && !a.done.length
        ? h('div', { class: 'empty', style: 'margin-top:10px', text: pasado ? 'Nada registrado ese día.' : 'Día libre. Arrastra aquí algo de SIN DÍA o escríbelo arriba.' })
        : null),
    micro: pasado && a.done.length ? `${a.done.length} CERRADAS. ${a.done.length >= 5 ? 'THAT WAS A DAY.' : 'EVERY DAY COUNTS.'}` : null,
  });
}

/* ----------------------------- Cuentas atrás ------------------------------ */

/**
 * Las fechas que no se mueven: exámenes, entregas, viajes. No son tareas, no se
 * completan y no ensucian ninguna lista; solo dicen cuánto queda.
 */
function panelCuentas() {
  const lista = S.countdownList();
  const pasadas = lista.filter((c) => c.past || c.done);

  return section('CUENTAS ATRÁS', {
    meta: lista.length ? String(lista.length) : null,
    body: h('div', {},
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:14px' },
        h('button', {
          class: 'btn btn-sm btn-primary', type: 'button', text: '+ NUEVA CUENTA ATRÁS',
          onclick: () => openCountdownForm(),
        }),
        pasadas.length
          ? h('button', {
            class: 'btn btn-sm btn-ghost', type: 'button', text: `QUITAR LAS ${pasadas.length} PASADAS`,
            onclick: async () => { for (const c of pasadas) await S.removeCountdown(c.id); toast('Quitadas.'); },
          })
          : null),
      lista.length
        ? h('div', { class: 'cuentas-row' }, lista.map(countdownCard))
        : h('div', { class: 'empty', text: 'Ninguna. Sirven para lo que no se mueve: un examen, una entrega, un viaje. También se crean desde la ficha de una tarea, y entonces siguen a su fecha tope.' })),
    micro: lista.length ? 'PULSA UNA PARA CAMBIARLA O BORRARLA. NO SE COMPLETAN: LA FECHA LLEGA SOLA.' : null,
  });
}
