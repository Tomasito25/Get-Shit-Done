/*
 * CALENDARIO.
 *
 * Solo lo que tiene fecha: compromisos, tareas programadas y revisiones
 * de lo que esperas de otros. No es una agenda ni un planificador.
 */

import { add, h, iso, today, monthName, fmtLong, parseISO } from '../util.js';
import * as S from '../store.js';
import * as focus from '../focus.js';
import { pageHead, section, taskList, openEditor, openPostpone, askDelete, askCommit } from '../components.js';

const DOW = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

let cursorMonth = null;   // { y, m }
let selected = null;      // YYYY-MM-DD

export function render() {
  const t = today();
  if (!cursorMonth) {
    const d = parseISO(t);
    cursorMonth = { y: d.getFullYear(), m: d.getMonth() };
  }
  if (!selected) selected = t;

  const wrap = h('div', { class: 'wrap' });
  add(wrap, pageHead('CALENDARIO', 'Solo lo que tiene fecha. Una fecha es una promesa.'));

  const { y, m } = cursorMonth;

  add(wrap, h('div', { class: 'cal-head' },
    h('button', { class: 'btn btn-sm', type: 'button', text: '‹', onclick: () => { shift(-1); rerender(); } }),
    h('div', { class: 'cal-month', text: `${monthName(m).toUpperCase()} ${y}` }),
    h('button', { class: 'btn btn-sm', type: 'button', text: '›', onclick: () => { shift(1); rerender(); } }),
    h('button', {
      class: 'btn btn-sm', type: 'button', text: 'HOY', style: 'margin-left:auto',
      onclick: () => { const d = parseISO(t); cursorMonth = { y: d.getFullYear(), m: d.getMonth() }; selected = t; rerender(); },
    })));

  const grid = h('div', { class: 'cal-grid' }, DOW.map((d) => h('div', { class: 'cal-dow', text: d })));

  const first = new Date(y, m, 1);
  const lead = (first.getDay() + 6) % 7;              // lunes = 0
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = Math.ceil((lead + daysInMonth) / 7) * 7;

  for (let i = 0; i < cells; i += 1) {
    const dayNum = i - lead + 1;
    if (dayNum < 1 || dayNum > daysInMonth) {
      add(grid, h('div', { class: 'cal-cell void' }));
      continue;
    }
    const date = iso(new Date(y, m, dayNum));
    const tasks = S.tasksOnDate(date);
    const reviews = S.reviewsOnDate(date);
    const late = date < t && tasks.length > 0;

    const marks = h('div', { class: 'cal-marks' });
    tasks.slice(0, 5).forEach((task) => add(marks, h('span', { class: `cal-dot${task.isCommitment ? ' commit' : ''}` })));
    reviews.slice(0, 3).forEach(() => add(marks, h('span', { class: 'cal-dot wait' })));
    if (S.remindersOnDate(date).length) add(marks, h('span', { class: 'cal-rem', text: '◷' }));

    const cell = h('button', {
      class: `cal-cell${date === t ? ' today' : ''}${date === selected ? ' on' : ''}${late ? ' cal-late' : ''}`,
      type: 'button',
      onclick: () => { selected = date; rerender(); },
    },
      h('span', { class: 'cal-num', text: String(dayNum) }),
      marks);
    add(grid, cell);
  }

  add(wrap, grid);

  /* -------------------------- Detalle del día --------------------------- */

  const dayTasks = S.tasksOnDate(selected);
  const dayReviews = S.reviewsOnDate(selected);
  const dayAvisos = S.remindersOnDate(selected);

  add(wrap, section(fmtLong(selected).toUpperCase(), {
    meta: selected === t ? 'HOY' : null,
    body: h('div', {},
      taskList(dayTasks, {
        empty: 'Sin nada programado.',
        showDate: false,
        acts: (task) => [
          { label: 'ENFOCAR', fn: () => focus.open(task.id) },
          !task.isCommitment ? { label: 'HOY', fn: () => askCommit(task.id) } : null,
          { label: 'POSPONER', fn: () => openPostpone(task.id) },
          { label: 'EDITAR', fn: () => openEditor(task.id) },
          { label: 'ELIMINAR', warn: true, fn: () => askDelete(task.id) },
        ].filter(Boolean),
      }),
      dayAvisos.length
        ? h('div', { style: 'margin-top:18px' },
          h('div', { class: 'sec-title', style: 'margin-bottom:8px', text: 'AVISOS' }),
          h('div', { class: 'rows' }, dayAvisos.map((task) => h('div', { class: 'row' },
            h('div', { class: 'row-body' },
              h('div', { class: 'row-title' },
                h('b', { class: 'cal-rem-time', text: S.reminderTime(task) }), task.title))))))
        : null,
      dayReviews.length
        ? h('div', { style: 'margin-top:18px' },
          h('div', { class: 'sec-title', style: 'margin-bottom:8px', text: 'REVISAR LO QUE ESPERAS' }),
          h('div', { class: 'rows' }, dayReviews.map(({ waiting, task }) =>
            h('div', { class: 'row' },
              h('div', { class: 'row-body' },
                h('div', { class: 'row-title', text: `→ ${waiting.person} — ${waiting.description}` }),
                h('div', { class: 'row-sub' }, h('span', { text: task.title })))))))
        : null),
  }));

  return wrap;
}

function shift(n) {
  let { y, m } = cursorMonth;
  m += n;
  if (m < 0) { m = 11; y -= 1; }
  if (m > 11) { m = 0; y += 1; }
  cursorMonth = { y, m };
}

function rerender() {
  dispatchEvent(new CustomEvent('gsd:rerender'));
}
