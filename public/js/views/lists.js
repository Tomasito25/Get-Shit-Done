/*
 * SIGUIENTES ACCIONES · EN ESPERA · ALGÚN DÍA · REFERENCIA.
 *
 * Listas planas. Sin tableros, sin columnas, sin arrastrar. Se leen y se ejecutan.
 */

import { add, h, relDate, today, addDays } from '../util.js';
import * as S from '../store.js';
import * as V from '../voice.js';
import * as focus from '../focus.js';
import {
  pageHead, section, taskList, openEditor, openPostpone, askDelete,
  askCommit, askOneThing, openDelegate, openCapture, confirmSheet,
} from '../components.js';

/* --------------------------- SIGUIENTES ACCIONES -------------------------- */

export function next(params = {}) {
  const wrap = h('div', { class: 'wrap' });
  const ctx = params.context || null;
  const items = S.nextActions({ context: ctx });
  const scheduled = S.laterList().filter((t) => t.status === S.STATUS.SCHEDULED);
  const contexts = S.allContexts();

  add(wrap, pageHead('SIGUIENTES ACCIONES', V.nextLine(items.length)));

  if (contexts.length) {
    const chips = h('div', { class: 'filters' },
      h('button', { class: `chip${ctx ? '' : ' on'}`, type: 'button', text: 'TODO', onclick: () => { location.hash = '#/next'; } }),
      contexts.map((c) => h('button', {
        class: `chip${ctx === c ? ' on' : ''}`, type: 'button', text: c.toUpperCase(),
        onclick: () => { location.hash = `#/next/${encodeURIComponent(c)}`; },
      })));
    add(wrap, chips);
  }

  add(wrap, section(ctx ? `ACCIONES ${ctx.toUpperCase()}` : 'ACCIONES', {
    meta: `${items.length}`,
    body: taskList(items, {
      empty: 'Ninguna acción. Procesa el inbox o define la siguiente acción de un proyecto.',
      acts: (t) => [
        { label: 'ENFOCAR', fn: () => focus.open(t.id) },
        !t.isOneThing ? { label: '★', title: 'Lo único', fn: () => askOneThing(t.id) } : null,
        !t.isCommitment ? { label: 'HOY', title: 'Comprometer hoy', fn: () => askCommit(t.id) } : null,
        { label: 'POSPONER', fn: () => openPostpone(t.id) },
        { label: 'EDITAR', fn: () => openEditor(t.id) },
        { label: 'ELIMINAR', warn: true, fn: () => askDelete(t.id) },
      ].filter(Boolean),
    }),
  }));

  if (!ctx && scheduled.length) {
    add(wrap, section('PROGRAMADAS', {
      meta: `${scheduled.length}`,
      body: taskList(scheduled, {
        acts: (t) => [
          { label: 'HOY', fn: () => askCommit(t.id) },
          { label: 'POSPONER', fn: () => openPostpone(t.id) },
          { label: 'EDITAR', fn: () => openEditor(t.id) },
          { label: 'ELIMINAR', warn: true, fn: () => askDelete(t.id) },
        ],
      }),
    }));
  }

  add(wrap, h('div', { style: 'margin-top:26px' },
    h('button', { class: 'btn btn-sm', type: 'button', text: '+ CAPTURAR', onclick: openCapture })));

  return wrap;
}

/* --------------------------------- EN ESPERA ------------------------------ */

export function waiting() {
  const wrap = h('div', { class: 'wrap' });
  const items = S.waitingList();
  add(wrap, pageHead('EN ESPERA', V.waitingLine(items.length, S.waitingDue().length)));

  if (!items.length) {
    add(wrap, h('div', { class: 'empty', text: 'No estás esperando nada.' }));
    return wrap;
  }

  const byPerson = new Map();
  for (const t of items) {
    const key = t.waitingFor || '—';
    if (!byPerson.has(key)) byPerson.set(key, []);
    byPerson.get(key).push(t);
  }

  for (const [person, tasks] of [...byPerson.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const rows = tasks.map((t) => {
      const w = S.waitingByTask(t.id);
      const late = w && w.reviewDate && w.reviewDate <= today();
      return h('div', { class: 'row', dataset: { taskId: t.id } },
        h('button', {
          class: 'row-check', type: 'button', title: 'Recibido',
          onclick: (e) => { e.stopPropagation(); S.complete(t.id); },
        }),
        h('div', { class: 'row-body' },
          h('div', { class: 'row-title', text: w && w.description ? w.description : t.title }),
          h('div', { class: 'row-sub' },
            w && w.reviewDate
              ? h('span', { class: late ? 'tag tag-late' : '', text: `REVISAR ${relDate(w.reviewDate)}` })
              : h('span', { text: 'sin fecha de revisión' }))),
        h('div', { class: 'row-acts' },
          h('button', { class: 'row-act', type: 'button', text: 'SEGUIMIENTO', onclick: () => openDelegate(t.id) }),
          h('button', {
            class: 'row-act', type: 'button', text: '+7D',
            title: 'Aplazar la revisión una semana',
            onclick: async () => {
              const cur = S.waitingByTask(t.id);
              await S.delegate(t.id, {
                person: t.waitingFor,
                description: cur ? cur.description : t.title,
                reviewDate: addDays(cur && cur.reviewDate ? cur.reviewDate : today(), 7),
              });
            },
          }),
          h('button', { class: 'row-act', type: 'button', text: 'RECUPERAR', title: 'Vuelve a ser acción propia', onclick: () => S.undelegate(t.id) }),
          h('button', { class: 'row-act warn', type: 'button', text: 'ELIMINAR', onclick: () => askDelete(t.id) })));
    });
    add(wrap, section(person.toUpperCase(), { meta: `${tasks.length}`, body: h('div', { class: 'rows' }, rows) }));
  }

  return wrap;
}

/* -------------------------------- ALGÚN DÍA ------------------------------- */

export function someday() {
  const wrap = h('div', { class: 'wrap' });
  const items = S.somedayList();
  add(wrap, pageHead('ALGÚN DÍA', V.somedayLine(items.length)));

  add(wrap, taskList(items, {
    empty: 'Vacío.',
    acts: (t) => [
      { label: 'ACTIVAR', title: 'Pasar a next actions', fn: () => S.makeNext(t.id) },
      { label: 'EDITAR', fn: () => openEditor(t.id) },
      { label: 'ELIMINAR', warn: true, fn: () => askDelete(t.id) },
    ],
  }));

  const ref = S.noteList();
  if (ref.length) {
    add(wrap, section('ANOTACIONES', {
      meta: `${ref.length}`,
      body: h('div', {},
        h('div', { class: 'empty', style: 'padding-top:0', text: 'Información, no trabajo. Viven en su propia pantalla.' }),
        h('div', { style: 'margin-top:12px' },
          h('button', {
            class: 'btn btn-sm', type: 'button', text: `VER LAS ${ref.length} ANOTACIONES`,
            onclick: () => { location.hash = '#/notas'; },
          }))),
    }));
  }

  if (items.length > 20) {
    add(wrap, h('div', { class: 'notice', style: 'margin-top:30px' },
      h('div', { class: 'notice-title', text: 'LIMPIEZA' }),
      h('div', { class: 'notice-body', text: `${items.length} ideas guardadas. Las que ya no te interesan no necesitan estar aquí.` }),
      h('div', { class: 'notice-acts' },
        h('button', {
          class: 'btn btn-sm btn-warn', type: 'button', text: 'REVISAR Y VACIAR ANTIGUAS',
          onclick: () => confirmSheet({
            title: 'Eliminar ideas antiguas',
            body: 'Se eliminarán las ideas de Someday capturadas hace más de 180 días. No afecta a nada más.',
            confirmText: 'ELIMINAR',
            warn: true,
            hold: true,
            onConfirm: async () => {
              const cutoff = addDays(today(), -180);
              for (const t of S.somedayList()) {
                if (t.createdAt.slice(0, 10) < cutoff) await S.remove(t.id);
              }
            },
          }),
        }))));
  }

  return wrap;
}
