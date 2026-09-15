/*
 * BANDEJA y ACLARADO.
 *
 * Capturar es barato. Aclarar es el trabajo. Cada elemento responde a una
 * pregunta —¿que es esto?— y sale de aqui. La bandeja no es un cementerio.
 *
 * Primero de todo, la regla de los dos minutos: si cuesta menos que
 * organizarlo, no se organiza. Se hace.
 */

import { add, h, toast, tomorrow } from '../util.js';
import * as S from '../store.js';
import * as V from '../voice.js';
import * as focus from '../focus.js';
import * as viewkeys from '../viewkeys.js';
import { parseCapture, describe } from '../parse.js';
import { withAssist } from '../assist.js';
import {
  pageHead, taskList, openCapture, openDelegate, openEditor, askDelete,
} from '../components.js';

let processing = false;
let pinnedId = null;

/** Entrar directo al aclarado desde cualquier sitio, sin pasar por la lista. */
export function startProcessing(id = null) {
  processing = true;
  pinnedId = id;
  if (location.hash !== '#/inbox') location.hash = '#/inbox';
  else dispatchEvent(new CustomEvent('gsd:rerender'));
}

export function render() {
  const wrap = h('div', { class: 'wrap' });
  const items = S.inbox();

  if (processing && items.length) {
    add(wrap, clarify(items));
    return wrap;
  }
  processing = false;
  viewkeys.clear();

  add(wrap, pageHead('BANDEJA', V.inboxLine(items.length), items.length ? V.gritClarify(items.length) : 'CLEAR MIND. NOW EXECUTE.'));

  if (!items.length) {
    add(wrap,
      h('div', { class: 'sec onething', style: 'border-top-color:var(--line)' },
        h('p', { class: 'onething-ask', style: 'margin-top:6px', text: 'Clear mind. Clear system.' }),
        h('div', { class: 'micro', style: 'margin-top:10px', text: 'NADA PENDIENTE DE DECIDIR. AHORA EJECUTA.' }),
        h('div', { class: 'onething-actions' },
          h('button', { class: 'btn', type: 'button', text: 'CAPTURAR', onclick: openCapture }))));
    return wrap;
  }

  add(wrap,
    h('div', { style: 'display:flex;gap:8px;margin-bottom:22px;flex-wrap:wrap' },
      h('button', {
        class: 'btn btn-primary', type: 'button', text: `ACLARAR (${items.length})`,
        onclick: () => { processing = true; rerender(); },
      }),
      h('button', { class: 'btn', type: 'button', text: 'CAPTURAR', onclick: openCapture })),
    taskList(items, {
      acts: (t) => [
        { label: 'ACLARAR', fn: () => { processing = true; rerender(t.id); } },
        { label: 'EDITAR', fn: () => openEditor(t.id) },
        { label: 'ELIMINAR', warn: true, fn: () => askDelete(t.id) },
      ],
    }));

  return wrap;
}

function rerender(id = null) {
  pinnedId = id;
  dispatchEvent(new CustomEvent('gsd:rerender'));
}

/* ------------------------------- Aclarado -------------------------------- */

function clarify(items) {
  const item = (pinnedId && items.find((t) => t.id === pinnedId)) || items[0];
  pinnedId = null;
  const index = items.indexOf(item) + 1;
  const total = S.inbox().length;

  const titulo = h('input', {
    class: 'input', type: 'text', value: item.title,
    style: 'font-size:18px;padding:12px 14px',
    dataset: { keepFocus: 'clarify-title' },
  });
  const eco = h('div', { class: 'capture-echo' });
  const conAyuda = withAssist(titulo, { echo: eco });

  const proyecto = h('select', { class: 'select' },
    h('option', { value: '', text: '— sin proyecto —' }),
    S.selectableProjects().map((p) => h('option', { value: p.id, text: S.projectLabel(p), selected: p.id === item.projectId })));
  const contexto = h('select', { class: 'select' },
    h('option', { value: '', text: '— sin contexto —' }),
    S.allContexts().map((c) => h('option', { value: c, text: c, selected: c === item.context })));
  const fecha = h('input', { class: 'input', type: 'date', value: tomorrow() });

  /** El titulo admite la misma sintaxis que la captura: @ # ! * !! */
  const leer = () => parseCapture(titulo.value, {
    projects: S.selectableProjects(),
    contexts: S.allContexts(),
  });

  const pintarEco = () => {
    const linea = describe(leer(), { projects: S.selectableProjects(), recurrenceLabel: S.recurrenceLabel });
    eco.textContent = linea;
    eco.classList.toggle('on', !!linea);
  };
  titulo.addEventListener('input', pintarEco);
  pintarEco();

  /** Aplica lo escrito antes de decidir el destino. */
  const aplicar = async () => {
    const p = leer();
    let projectId = proyecto.value || p.projectId || null;
    if (!projectId && p.projectName) {
      const nuevo = await S.createProject({ name: p.projectName });
      projectId = nuevo ? nuevo.id : null;
    }
    if (p.context) await S.addContext(p.context);
    await S.updateTask(item.id, {
      title: p.title || item.title,
      projectId,
      context: p.context || contexto.value || null,
      dueDate: p.dueDate || item.dueDate,
      deadline: p.deadline || item.deadline,
      reminder: p.reminder || item.reminder,
      recurrence: p.recurrence || item.recurrence,
      isCommitment: p.isCommitment || item.isCommitment,
    });
    return p;
  };

  let ocupado = false;
  const guard = (fn) => async () => {
    if (ocupado) return;
    ocupado = true;
    try { await fn(); } finally { ocupado = false; }
  };

  const avanzar = () => rerender();

  const acciones = {
    // Regla de los dos minutos: si cuesta menos que archivarlo, se hace y punto.
    now: guard(async () => {
      await aplicar();
      await S.makeNext(item.id);
      focus.open(item.id, { onExit: () => { processing = true; rerender(); } });
    }),
    delete: guard(async () => { await S.remove(item.id); toast('Eliminada.'); avanzar(); }),
    reference: guard(async () => { await aplicar(); await S.makeReference(item.id); avanzar(); }),
    someday: guard(async () => { await aplicar(); await S.makeSomeday(item.id); avanzar(); }),
    delegate: guard(async () => { await aplicar(); openDelegate(item.id, { after: avanzar }); }),
    schedule: guard(async () => {
      const p = await aplicar();
      await S.schedule(item.id, p.dueDate || fecha.value || tomorrow());
      avanzar();
    }),
    next: guard(async () => { await aplicar(); await S.makeNext(item.id); avanzar(); }),
  };

  const opcion = (clave, num, etiqueta, pista, destacada = false) => h('button', {
    class: `btn btn-block${destacada ? ' btn-primary' : ''}`,
    type: 'button',
    style: 'justify-content:flex-start;padding:11px 14px',
    onclick: acciones[clave],
  },
    h('span', { class: 'micro', style: `width:18px;${destacada ? '' : 'color:var(--faint)'}`, text: String(num) }),
    h('span', { text: etiqueta }),
    pista ? h('span', { class: 'micro', style: 'margin-left:auto;text-transform:none', text: pista }) : null);

  viewkeys.set((e) => {
    const mapa = { 0: 'now', 1: 'delete', 2: 'reference', 3: 'someday', 4: 'delegate', 5: 'schedule', 6: 'next' };
    if (mapa[e.key]) { acciones[mapa[e.key]](); return true; }
    if (e.key === 'Escape') { processing = false; rerender(); return true; }
    return false;
  });

  const avance = Math.round(((total - items.length) / Math.max(1, total)) * 100);

  return h('div', {},
    pageHead('ACLARAR', `${index} de ${items.length} · ¿Qué es esto?`, V.gritClarify(items.length)),
    h('div', { class: 'progress' }, h('span', { style: `width:${avance}%` })),
    h('div', { class: 'field' },
      h('label', { class: 'label', text: 'Reescríbelo como una acción física y concreta' }),
      conAyuda),
    h('div', { class: 'row2' },
      h('div', { class: 'field' }, h('label', { class: 'label', text: 'Proyecto' }), proyecto),
      h('div', { class: 'field' }, h('label', { class: 'label', text: 'Contexto' }), contexto)),
    h('div', { style: 'display:flex;flex-direction:column;gap:6px;margin-top:20px' },
      opcion('now', 0, 'HAZLA AHORA', 'menos de dos minutos', true),
      h('div', { class: 'clarify-sep' }),
      opcion('delete', 1, 'ELIMINAR', 'no organices basura'),
      opcion('reference', 2, 'ANOTAR', 'información, no acción'),
      opcion('someday', 3, 'ALGÚN DÍA', 'fuera del campo de atención'),
      opcion('delegate', 4, 'DELEGAR', 'pasa a en espera'),
      opcion('schedule', 5, 'PROGRAMAR', 'tiene fecha'),
      opcion('next', 6, 'SIGUIENTE ACCIÓN', 'se hace y punto')),
    h('div', { class: 'field', style: 'margin-top:16px' },
      h('label', { class: 'label', text: 'Fecha (para programar)' }),
      fecha),
    h('div', { style: 'margin-top:24px;display:flex;gap:10px;align-items:center;flex-wrap:wrap' },
      h('button', { class: 'btn btn-ghost', type: 'button', text: 'SALIR', onclick: () => { processing = false; rerender(); } }),
      h('span', { class: 'micro', text: 'TECLAS 0–6' })));
}
