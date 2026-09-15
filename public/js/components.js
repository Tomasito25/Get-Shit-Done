/* Piezas de interfaz compartidas: capas, filas, editor, friccion. */

import { add, h, holdToConfirm, toast, focusSoon, relDate, fmtDate, fmtLong, today, tomorrow, addDays, iso, parseISO } from './util.js';
import * as S from './store.js';
import { parseCapture, describe, parseRecurrence, parseDate } from './parse.js';
import { withAssist } from './assist.js';

/* --------------------------------- Capas --------------------------------- */

const stack = [];

function paint() {
  const ov = document.getElementById('overlay');
  ov.textContent = '';
  if (!stack.length) {
    ov.hidden = true;
    return;
  }
  ov.hidden = false;
  add(ov, stack[stack.length - 1].node);
}

export function openSheet(node, opts = {}) {
  stack.push({ node, kind: opts.kind || null, onClose: opts.onClose || null });
  paint();
  focusSoon(node.querySelector('[data-autofocus]'));
  return node;
}

export function closeTop() {
  const top = stack.pop();
  if (top && top.onClose) top.onClose();
  paint();
  return !!top;
}

export function closeAll() {
  while (stack.length) closeTop();
}

export const anyOpen = () => stack.length > 0;

document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'overlay') closeTop();
});

/** Contenedor estandar de una capa. */
export function sheet({ title, body, foot = null, wide = false }) {
  return h('div', { class: 'sheet', style: wide ? 'max-width:720px' : '' },
    h('div', { class: 'sheet-head' },
      h('div', { class: 'sheet-title', text: title }),
      h('button', { class: 'nav-mini', style: 'margin-left:auto', type: 'button', text: 'ESC', onclick: closeTop })),
    h('div', { class: 'sheet-body' }, body),
    foot ? h('div', { class: 'sheet-foot' }, foot) : null);
}

export function confirmSheet({ title, body, confirmText = 'CONFIRMAR', hold = false, warn = false, onConfirm }) {
  const btn = h('button', {
    class: `btn ${warn ? 'btn-warn' : ''}`,
    type: 'button',
    text: hold ? `${confirmText} — MANTENER PULSADO` : confirmText,
  });
  if (hold) holdToConfirm(btn, () => { closeTop(); onConfirm(); }, 850);
  else btn.addEventListener('click', () => { closeTop(); onConfirm(); });

  return openSheet(sheet({
    title,
    body: typeof body === 'string' ? h('div', { class: 'notice-body', text: body }) : body,
    foot: [h('button', { class: 'btn btn-ghost', type: 'button', text: 'CANCELAR', onclick: closeTop }), h('div', { class: 'spacer' }), btn],
  }));
}

/* -------------------------------- Etiquetas ------------------------------ */

function metaTags(t, opts = {}) {
  const out = [];
  if (t.isOneThing) out.push(h('span', { class: 'tag tag-star', text: 'LO ÚNICO' }));
  if (t.isCommitment && !t.isOneThing) out.push(h('span', { class: 'tag tag-lock', text: 'NO NEGOCIAR' }));
  if (opts.showProject !== false && t.projectId) {
    const p = S.projectById(t.projectId);
    if (p) out.push(h('span', { text: S.projectLabel(p) }));
  }
  if (t.context) out.push(h('span', { text: t.context }));
  if (t.dueDate && opts.showDate !== false) {
    const dias = S.carriedDays(t);
    if (t.isCommitment && dias > 0) {
      out.push(h('span', { class: 'tag tag-late', text: `ARRASTRAS ${dias}D` }));
    } else {
      out.push(h('span', { class: S.isOverdue(t) ? 'tag tag-late' : '', text: relDate(t.dueDate) }));
    }
  }
  if (t.status === S.STATUS.WAITING && t.waitingFor) {
    const w = S.waitingByTask(t.id);
    out.push(h('span', { text: `→ ${t.waitingFor}${w && w.reviewDate ? ` · revisar ${relDate(w.reviewDate)}` : ''}` }));
  }
  if (t.deadline && !t.completed) out.push(deadlineTag(t));
  if (t.reminder && !t.completed) out.push(h('span', { class: 'tag tag-rem', text: `AVISO ${S.reminderLabel(t)}` }));
  if (t.recurrence) {
    out.push(h('span', { class: 'tag tag-rep', text: `↻ ${S.recurrenceLabel(t.recurrence)}` }));
  }
  if ((t.postponeCount || 0) > 0 && opts.showPostpone !== false) {
    out.push(h('span', {
      class: t.postponeCount >= S.postponeAlert() ? 'tag tag-warn' : '',
      text: `POSPUESTA ×${t.postponeCount}`,
    }));
  }
  return out;
}

/**
 * La fecha tope se lee de un vistazo: cuanto queda, y en rojo cuando aprieta.
 * Una fecha sin urgencia visible es una fecha que nadie mira.
 */
export function deadlineTag(t) {
  const estado = S.deadlineState(t);
  if (!estado) return null;
  const dias = S.deadlineDays(t);
  const texto = dias < 0
    ? `TOPE VENCIDO ${-dias}D`
    : dias === 0 ? 'TOPE HOY' : `TOPE ${dias}D`;
  return h('span', { class: `tag tag-dl tag-dl-${estado}`, text: texto, title: `Fecha tope: ${fmtDate(t.deadline)}` });
}

/* ---------------------------------- Filas -------------------------------- */

/**
 * Fila de tarea. Las acciones se muestran al pasar por encima o con el cursor:
 * la lista se lee, no se administra.
 */
export function taskRow(t, opts = {}) {
  const acts = (opts.acts || defaultActs)(t);
  const row = h('div', {
    class: `row${t.completed ? ' is-done' : ''}`,
    dataset: { taskId: t.id },
  },
    opts.check === false ? null : h('button', {
      class: `row-check${t.completed ? ' done' : ''}`,
      type: 'button',
      title: 'Completar (espacio)',
      'aria-label': 'Completar',
      onclick: (e) => { e.stopPropagation(); S.toggleComplete(t.id); },
    }),
    h('div', { class: 'row-body' },
      h('div', { class: 'row-title', text: t.title }),
      (() => {
        const tags = metaTags(t, opts);
        return tags.length ? h('div', { class: 'row-sub' }, tags) : null;
      })()),
    acts.length ? h('div', { class: 'row-acts' },
      acts.map((a) => h('button', {
        class: `row-act${a.warn ? ' warn' : ''}`,
        type: 'button',
        title: a.title || a.label,
        text: a.label,
        onclick: (e) => { e.stopPropagation(); a.fn(); },
      }))) : null);

  row.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    openEditor(t.id);
  });
  return row;
}

function defaultActs(t) {
  const acts = [];
  if (!t.completed && t.status !== S.STATUS.WAITING && t.status !== S.STATUS.REFERENCE) {
    if (!t.isOneThing) acts.push({ label: '★', title: 'Convertirla en lo único', fn: () => askOneThing(t.id) });
    if (!t.isCommitment) acts.push({ label: 'HOY', title: 'Comprometer para hoy', fn: () => askCommit(t.id) });
    acts.push({ label: 'POSPONER', title: 'Posponer', fn: () => openPostpone(t.id) });
  }
  acts.push({ label: 'EDITAR', fn: () => openEditor(t.id) });
  acts.push({ label: 'ELIMINAR', warn: true, fn: () => askDelete(t.id) });
  return acts;
}

export function taskList(tasks, opts = {}) {
  if (!tasks.length) return h('div', { class: 'empty', text: opts.empty || 'Nada aquí.' });
  return h('div', { class: 'rows' }, tasks.map((t) => taskRow(t, opts)));
}

/* -------------------------------- Acciones ------------------------------- */

export async function askDelete(id) {
  const t = S.byId(id);
  if (!t) return;
  const bundle = await S.remove(id);
  toast('Eliminada.', () => S.restore(bundle));
}

/** Una sola One Thing. Cambiarla es una decision, no un descuido. */
export async function askOneThing(id) {
  const current = S.oneThing();
  const t = S.byId(id);
  if (!t) return;
  if (!current || current.id === id) {
    await S.setOneThing(id);
    toast('Lo único, fijado.');
    return;
  }
  confirmSheet({
    title: 'Ya elegiste una',
    body: h('div', {},
      h('div', { class: 'hard-line', text: current.title }),
      h('div', { class: 'micro', style: 'margin:14px 0 4px', text: 'LA CAMBIAS POR' }),
      h('div', { class: 'hard-line', text: t.title }),
      h('div', { class: 'onething-ask', style: 'font-size:16px;margin-top:18px', text: '¿Es más difícil, o solo más cómoda?' })),
    confirmText: 'CAMBIARLA',
    hold: true,
    onConfirm: async () => { await S.setOneThing(id); toast('Lo único, fijado.'); },
  });
}

/** Comprometerse no es apuntar. Por eso hay un tope y una pregunta. */
export async function askCommit(id) {
  const count = S.commitments().length;
  if (count < S.commitCap()) {
    await S.commitToday(id);
    return;
  }
  confirmSheet({
    title: 'Demasiados compromisos',
    body: h('div', {},
      h('div', { class: 'notice-body', text: `Ya has comprometido ${count} tareas para hoy.` }),
      h('div', { class: 'onething-ask', style: 'font-size:16px;margin:14px 0 0', text: "You don't need more tasks. You need execution." })),
    confirmText: 'AÑADIR IGUALMENTE',
    onConfirm: () => S.commitToday(id),
  });
}

/**
 * Posponer. Libre para lo ordinario; con friccion para lo comprometido.
 * No se trata de bloquear al usuario, sino de no abaratar la renegociacion.
 */
export function openPostpone(id) {
  const t = S.byId(id);
  if (!t) return;
  const locked = t.isCommitment || t.isOneThing;
  const ms = S.holdMs(t);
  const dias = S.carriedDays(t);

  const dateInput = h('input', { class: 'input', type: 'date', value: t.dueDate || tomorrow() });

  const run = async (when) => { await S.postpone(id, when); closeTop(); toast('Pospuesta. Queda registrado.'); };

  const mk = (label, when) => {
    const b = h('button', { class: 'btn', type: 'button', text: locked ? `${label} — MANTENER` : label });
    if (locked) holdToConfirm(b, () => run(when), ms);
    else b.addEventListener('click', () => run(when));
    return b;
  };

  const body = h('div', {},
    h('div', { class: 'hard-line', text: t.title }),
    (t.postponeCount || 0) >= 1 || dias > 0
      ? h('div', { class: 'record' },
        (t.postponeCount || 0) >= 1
          ? h('span', { class: 'tag tag-warn', text: `POSPUESTA ×${t.postponeCount}` })
          : null,
        dias > 0 ? h('span', { class: 'tag tag-warn', text: `ARRASTRADA ${dias}D` }) : null)
      : null,
    locked ? h('div', { class: 'onething-ask', style: 'font-size:16px;margin:16px 0 4px', text: 'You already decided.' }) : null,
    h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:18px' },
      mk('HOY', today()),
      mk('MAÑANA', 'tomorrow'),
      mk('EN 7 DÍAS', addDays(today(), 7)),
      mk('ALGÚN DÍA', 'someday')),
    h('div', { class: 'field', style: 'margin-top:22px' },
      h('label', { class: 'label', text: 'Fecha concreta' }),
      dateInput));

  const goDate = h('button', { class: 'btn', type: 'button', text: locked ? 'PROGRAMAR — MANTENER' : 'PROGRAMAR' });
  const fire = () => { if (dateInput.value) run(dateInput.value); };
  if (locked) holdToConfirm(goDate, fire, ms);
  else goDate.addEventListener('click', fire);

  openSheet(sheet({
    title: locked ? 'Posponer un compromiso' : 'Posponer',
    body,
    foot: [h('button', { class: 'btn btn-ghost', type: 'button', text: 'CANCELAR', onclick: closeTop }), h('div', { class: 'spacer' }), goDate],
  }));
}

/* -------------------------------- Delegar -------------------------------- */

export function openDelegate(id, { after = null } = {}) {
  const t = S.byId(id);
  if (!t) return;
  const existing = S.waitingByTask(id);
  const person = h('input', { class: 'input', type: 'text', placeholder: 'Nombre', value: existing?.person || t.waitingFor || '', 'data-autofocus': '' });
  const desc = h('input', { class: 'input', type: 'text', placeholder: 'Qué esperas', value: existing?.description || t.title });
  const date = h('input', { class: 'input', type: 'date', value: existing?.reviewDate || addDays(today(), 7) });

  const save = async () => {
    if (!person.value.trim()) { person.focus(); return; }
    await S.delegate(id, { person: person.value, description: desc.value, reviewDate: date.value || null });
    closeTop();
    toast('Pasa a EN ESPERA.');
    if (after) after();
  };

  const form = h('div', {},
    h('div', { class: 'notice-body', style: 'margin-bottom:18px', text: t.title }),
    h('div', { class: 'field' }, h('label', { class: 'label', text: 'Persona' }), person),
    h('div', { class: 'field' }, h('label', { class: 'label', text: 'Esperando' }), desc),
    h('div', { class: 'field' }, h('label', { class: 'label', text: 'Revisar el' }), date));

  form.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });

  openSheet(sheet({
    title: 'Delegar',
    body: form,
    foot: [h('button', { class: 'btn btn-ghost', type: 'button', text: 'CANCELAR', onclick: closeTop }), h('div', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', text: 'GUARDAR', onclick: save })],
  }));
}

/* --------------------------------- Editor -------------------------------- */

/**
 * Editor de tarea. No hay boton de guardar: cada cambio se guarda solo.
 *
 * Un boton de guardar es una trampa — se cierra con ESC y se pierde lo escrito.
 * Aqui el texto se guarda al dejar de escribir y todo lo demas al instante.
 * La unica excepcion es retirar un compromiso: eso no es editar, es romperlo,
 * y sigue costando lo mismo que posponerlo.
 */
export function openEditor(id) {
  const t = S.byId(id);
  if (!t) return;
  // Una anotacion no se edita como una tarea: no tiene fechas ni compromiso.
  if (S.isNote(t)) { openNote(id); return; }

  const aviso = h('span', { class: 'saved' });
  let avisoTimer = null;
  const marcarGuardado = () => {
    aviso.textContent = 'GUARDADO';
    aviso.classList.add('on');
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => aviso.classList.remove('on'), 1400);
  };

  /** Guarda de inmediato. Todo cambio pasa por aqui. */
  const guardar = async (patch) => {
    await S.updateTask(id, patch);
    marcarGuardado();
  };

  /** Para lo que se escribe: al dejar de teclear, y sin falta al salir del campo. */
  const guardarTexto = (fn) => {
    let timer = null;
    return {
      input: () => { clearTimeout(timer); timer = setTimeout(fn, 500); },
      blur: () => { clearTimeout(timer); fn(); },
    };
  };

  /* ------------------------------- Campos -------------------------------- */

  const title = h('textarea', { class: 'textarea', style: 'min-height:52px', 'data-autofocus': '' });
  title.value = t.title;
  const tituloGuarda = guardarTexto(() => {
    const limpio = title.value.trim();
    if (limpio && limpio !== (S.byId(id) || {}).title) guardar({ title: limpio });
  });
  title.addEventListener('input', tituloGuarda.input);
  title.addEventListener('blur', tituloGuarda.blur);
  title.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); title.blur(); }
  });

  const notes = h('textarea', { class: 'textarea', placeholder: 'Notas' });
  notes.value = t.notes || '';
  const notasGuarda = guardarTexto(() => {
    if (notes.value !== (S.byId(id) || {}).notes) guardar({ notes: notes.value });
  });
  notes.addEventListener('input', notasGuarda.input);
  notes.addEventListener('blur', notasGuarda.blur);

  const project = h('select', { class: 'select' },
    h('option', { value: '', text: '— sin proyecto —' }),
    S.selectableProjects().map((p) => h('option', { value: p.id, text: `${S.projectLabel(p)}${p.status === 'paused' ? ' (en pausa)' : ''}`, selected: p.id === t.projectId })));
  project.addEventListener('change', () => guardar({ projectId: project.value || null }));

  const ctx = h('select', { class: 'select' });
  const pintarContextos = (sel) => {
    ctx.textContent = '';
    add(ctx,
      h('option', { value: '', text: '— sin contexto —' }),
      S.allContexts().map((c) => h('option', { value: c, text: c, selected: c === sel })),
      h('option', { value: '__new', text: '+ nuevo contexto…' }));
    ctx.value = sel || '';
  };
  pintarContextos(t.context);
  ctx.addEventListener('change', async () => {
    if (ctx.value === '__new') {
      const nombre = prompt('Nombre del contexto (ej. @taller)');
      const hecho = nombre ? await S.addContext(nombre) : null;
      pintarContextos(hecho || (S.byId(id) || {}).context);
      if (hecho) guardar({ context: hecho });
      return;
    }
    guardar({ context: ctx.value || null });
  });

  const due = h('input', { class: 'input', type: 'date', value: t.dueDate || '' });
  due.addEventListener('change', () => {
    const fecha = due.value || null;
    const actual = S.byId(id);
    const movible = actual && [S.STATUS.INBOX, S.STATUS.NEXT, S.STATUS.SCHEDULED].includes(actual.status);
    guardar({
      dueDate: fecha,
      // Con fecha futura queda programada; con fecha de hoy o sin fecha, lista para hacer.
      status: movible ? (fecha && fecha > today() ? S.STATUS.SCHEDULED : S.STATUS.NEXT) : undefined,
    });
  });

  const tope = h('input', { class: 'input', type: 'date', value: t.deadline || '' });
  tope.addEventListener('change', () => guardar({ deadline: tope.value || null }));

  const avisoCampo = h('input', { class: 'input', type: 'datetime-local', value: t.reminder || '' });
  avisoCampo.addEventListener('change', () => guardar({ reminder: avisoCampo.value ? avisoCampo.value.slice(0, 16) : null }));

  const rep = h('input', {
    class: 'input', type: 'text', placeholder: 'diario · 3d · lun,mie,vie · mes-1',
    value: t.recurrence ? reglaATexto(t.recurrence) : '',
  });
  const repEco = h('div', { class: 'capture-echo' });
  const pintarRep = () => {
    const r = rep.value.trim() ? parseRecurrence(rep.value.trim()) : null;
    repEco.textContent = rep.value.trim() && !r ? 'No lo entiendo' : (r ? `↻ ${S.recurrenceLabel(r)}` : '');
    repEco.classList.toggle('on', !!repEco.textContent);
    return r;
  };
  const repGuarda = guardarTexto(() => {
    const r = pintarRep();
    if (rep.value.trim() && !r) return; // no se entiende: no se toca lo guardado
    const actual = (S.byId(id) || {}).recurrence || null;
    if (JSON.stringify(actual) === JSON.stringify(r)) return; // sin cambios, sin escritura
    guardar({ recurrence: r });
  });
  rep.addEventListener('input', () => { pintarRep(); repGuarda.input(); });
  rep.addEventListener('blur', repGuarda.blur);
  pintarRep();

  /* ---------------------------- Compromisos ------------------------------ */

  const commit = h('input', { type: 'checkbox' });
  commit.checked = !!t.isCommitment;
  commit.addEventListener('change', () => {
    const actual = S.byId(id);
    if (!commit.checked && actual && actual.isCommitment && !actual.isOneThing) {
      // Retirar un compromiso no es editar: es romperlo.
      commit.checked = true;
      confirmSheet({
        title: 'Retirar el compromiso',
        body: h('div', {},
          h('div', { class: 'hard-line', text: actual.title }),
          h('div', { class: 'onething-ask', style: 'font-size:16px;margin-top:16px', text: 'Dijiste que esto no se negociaba.' })),
        confirmText: 'RETIRARLO',
        warn: true,
        hold: true,
        onConfirm: () => { commit.checked = false; guardar({ isCommitment: false }); },
      });
      return;
    }
    guardar({ isCommitment: commit.checked, dueDate: commit.checked && !due.value ? today() : undefined });
    if (commit.checked && !due.value) due.value = today();
  });

  const one = h('input', { type: 'checkbox' });
  one.checked = !!t.isOneThing;
  one.addEventListener('change', async () => {
    if (one.checked) {
      const actual = S.oneThing();
      if (actual && actual.id !== id) {
        one.checked = false;
        closeTop();
        askOneThing(id);
        return;
      }
      await S.setOneThing(id);
      commit.checked = true;
      if (!due.value) due.value = today();
    } else {
      await S.clearOneThing();
    }
    marcarGuardado();
  });

  /* -------------------------------- Cuerpo ------------------------------- */

  const body = h('div', {},
    h('div', { class: 'field' }, h('label', { class: 'label', text: 'Siguiente acción física y concreta' }), title),
    h('div', { class: 'row2' },
      h('div', { class: 'field' }, h('label', { class: 'label', text: 'Proyecto' }), project),
      h('div', { class: 'field' }, h('label', { class: 'label', text: 'Contexto' }), ctx)),
    h('div', { class: 'row2' },
      h('div', { class: 'field' },
        h('label', { class: 'label', text: 'Cuándo lo haces' }), due,
        dateChips(due, [
          { label: 'HOY', valor: today() },
          { label: 'MAÑANA', valor: addDays(today(), 1) },
          { label: '+2D', valor: addDays(today(), 2) },
          { label: '+3D', valor: addDays(today(), 3) },
          { label: '+1 SEM', valor: addDays(today(), 7) },
          { label: 'LUNES', valor: parseDate('lun') },
          { label: 'QUITAR', valor: '' },
        ]),
        h('div', { class: 'check-note', style: 'margin-top:5px', text: 'El día que piensas ponerte.' })),
      h('div', { class: 'field' },
        h('label', { class: 'label', text: 'Fecha tope' }), tope,
        dateChips(tope, [
          { label: 'MAÑANA', valor: addDays(today(), 1) },
          { label: '+2D', valor: addDays(today(), 2) },
          { label: '+3D', valor: addDays(today(), 3) },
          { label: '+1 SEM', valor: addDays(today(), 7) },
          { label: '+2 SEM', valor: addDays(today(), 14) },
          { label: 'FIN DE MES', valor: finDeMes() },
          { label: 'QUITAR', valor: '' },
        ]),
        h('div', { class: 'check-note', style: 'margin-top:5px', text: 'El día en que deja de servir hacerlo.' }))),
    h('div', { class: 'field' },
      h('label', { class: 'label', text: 'Aviso' }), avisoCampo,
      avisoChips(avisoCampo, () => due.value, () => tope.value),
      h('div', { class: 'check-note', style: 'margin-top:5px', text: 'Llega como notificación del escritorio, aunque el navegador esté cerrado, mientras GSD esté en marcha.' })),
    h('div', { class: 'field' }, h('label', { class: 'label', text: 'Se repite' }), rep, repEco),
    h('div', { class: 'field' }, h('label', { class: 'label', text: 'Notas' }), notes),
    h('label', { class: 'check' }, commit,
      h('span', { class: 'check-text' }, 'No negociar',
        h('span', { class: 'check-note', text: 'Compromiso del día. Retirarlo exigirá mantener pulsado.' }))),
    h('label', { class: 'check' }, one,
      h('span', { class: 'check-text' }, 'Lo único',
        h('span', { class: 'check-note', text: 'Solo puede haber una activa. Sustituye a la actual.' }))),
    h('div', { class: 'editor-more' },
      h('button', { class: 'btn btn-sm', type: 'button', text: 'DELEGAR', onclick: () => { closeTop(); openDelegate(id); } }),
      h('button', { class: 'btn btn-sm', type: 'button', text: 'ALGÚN DÍA', onclick: async () => { await S.makeSomeday(id); closeTop(); } }),
      h('button', { class: 'btn btn-sm', type: 'button', text: 'ES UNA ANOTACIÓN', title: 'Información, no trabajo', onclick: async () => { await S.makeReference(id); closeTop(); toast('Guardada como anotación.'); } }),
      t.status === S.STATUS.WAITING
        ? h('button', { class: 'btn btn-sm', type: 'button', text: 'RECUPERAR', onclick: async () => { await S.undelegate(id); closeTop(); } })
        : null,
      h('button', { class: 'btn btn-sm btn-warn', type: 'button', text: 'ELIMINAR', onclick: () => { closeTop(); askDelete(id); } })));

  const cabecera = sheet({
    title: 'Tarea',
    body,
    foot: [
      h('span', { class: 'micro', text: 'SE GUARDA SOLO' }),
      aviso,
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', text: 'CERRAR', onclick: closeTop }),
    ],
  });

  // Al cerrar, lo que quede a medio escribir se guarda igualmente.
  openSheet(cabecera, {
    onClose: () => { tituloGuarda.blur(); notasGuarda.blur(); repGuarda.blur(); },
  });
}

/* ------------------------------ Fechas rápidas ----------------------------- */

/** Último día del mes; si hoy ya lo es, el del mes siguiente. */
function finDeMes() {
  const d = parseISO(today());
  let fin = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  if (iso(fin) === today()) fin = new Date(d.getFullYear(), d.getMonth() + 2, 0);
  return iso(fin);
}

/**
 * Botones bajo un campo de fecha: un toque pone la fecha y se guarda sola.
 * Poner una fecha no debería exigir abrir un calendario y contar casillas.
 */
function dateChips(input, opciones) {
  const fila = h('div', { class: 'date-chips' });
  const pintar = () => {
    [...fila.children].forEach((b) => b.classList.toggle('on', !!b.dataset.valor && b.dataset.valor === input.value));
  };
  for (const o of opciones) {
    const valor = o.valor || '';
    const b = h('button', {
      class: 'date-chip', type: 'button', text: o.label,
      title: valor ? fmtLong(valor) : 'Quitar la fecha',
      dataset: { valor },
    });
    b.addEventListener('click', () => {
      input.value = valor;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      pintar();
    });
    add(fila, b);
  }
  input.addEventListener('change', pintar);
  pintar();
  return fila;
}

const sello = (d) => `${iso(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** Avisos rápidos. Los que dependen de otra fecha la leen al pulsar. */
function avisoChips(input, fechaAccion, fechaTope) {
  const opciones = [
    { label: 'EN 1 H', valor: () => sello(new Date(Date.now() + 60 * 60000)) },
    { label: 'HOY 18:00', valor: () => `${today()}T18:00` },
    { label: 'MAÑANA 9:00', valor: () => `${addDays(today(), 1)}T09:00` },
    { label: 'DÍA DE ACCIÓN 9:00', valor: () => (fechaAccion() ? `${fechaAccion()}T09:00` : null), falta: 'Pon antes cuándo lo haces.' },
    { label: 'VÍSPERA DEL TOPE 18:00', valor: () => (fechaTope() ? `${addDays(fechaTope(), -1)}T18:00` : null), falta: 'Pon antes la fecha tope.' },
    { label: 'QUITAR', valor: () => '' },
  ];
  const fila = h('div', { class: 'date-chips' });
  for (const o of opciones) {
    const b = h('button', { class: 'date-chip', type: 'button', text: o.label, dataset: { valor: o.label === 'QUITAR' ? '' : 'x' } });
    b.addEventListener('click', () => {
      const valor = o.valor();
      if (valor === null) { toast(o.falta); return; }
      input.value = valor;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    add(fila, b);
  }
  return fila;
}

/** La regla, en el mismo formato que se escribe. Ida y vuelta sin sorpresas. */
function reglaATexto(r) {
  if (!r) return '';
  if (r.kind === 'daily') return 'diario';
  if (r.kind === 'interval') return `${r.n}d`;
  if (r.kind === 'monthly') return `mes-${r.day}`;
  if (r.kind === 'weekdays') {
    const n = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
    return r.days.map((d) => n[d]).join(',');
  }
  return '';
}

/* ------------------------------ Anotaciones ------------------------------- */

/**
 * Una anotacion es informacion: se lee y se escribe, no se ejecuta.
 * Por eso su tarjeta no tiene casilla de completar, ni fechas, ni prioridad,
 * y el texto se edita en el sitio y se guarda solo.
 */

/** El campo crece con lo escrito: una nota no cabe en dos lineas fijas. */
function autoGrow(el, min = 0) {
  const ajustar = () => {
    el.style.height = 'auto';
    el.style.height = `${Math.max(min, el.scrollHeight)}px`;
  };
  el.addEventListener('input', ajustar);
  requestAnimationFrame(ajustar);
  return el;
}

/** Guardado con retardo + al salir del campo, igual que en el editor. */
function autosave(fn) {
  let timer = null;
  return {
    input: () => { clearTimeout(timer); timer = setTimeout(fn, 600); },
    blur: () => { clearTimeout(timer); fn(); },
  };
}

export function noteCard(t, { showProject = true } = {}) {
  const proyecto = S.projectById(t.projectId);

  const titulo = h('textarea', {
    class: 'note-title', rows: '1', spellcheck: 'false',
    placeholder: 'Título de la anotación',
    dataset: { keepFocus: `nota-t-${t.id}` },
  });
  titulo.value = t.title;
  autoGrow(titulo);
  const guardaTitulo = autosave(() => {
    const limpio = titulo.value.replace(/\n/g, ' ').trim();
    const actual = S.byId(t.id);
    if (!actual || !limpio || limpio === actual.title) return;
    S.updateTask(t.id, { title: limpio });
  });
  titulo.addEventListener('input', guardaTitulo.input);
  titulo.addEventListener('blur', guardaTitulo.blur);
  titulo.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); cuerpo.focus(); } });

  const cuerpo = h('textarea', {
    class: 'note-body', rows: '2',
    placeholder: 'Escribe aquí lo que hay que recordar.',
    dataset: { keepFocus: `nota-b-${t.id}` },
  });
  cuerpo.value = t.notes || '';
  autoGrow(cuerpo, 44);
  const guardaCuerpo = autosave(() => {
    const actual = S.byId(t.id);
    if (!actual || cuerpo.value === (actual.notes || '')) return;
    S.updateTask(t.id, { notes: cuerpo.value });
  });
  cuerpo.addEventListener('input', guardaCuerpo.input);
  cuerpo.addEventListener('blur', guardaCuerpo.blur);

  return h('article', { class: `note${t.pinned ? ' note-pin' : ''}`, dataset: { taskId: t.id } },
    h('div', { class: 'note-head' },
      h('span', { class: 'note-mark', text: '≡' }),
      h('span', { class: 'note-kind', text: t.pinned ? 'FIJADA' : 'ANOTACIÓN' }),
      showProject && proyecto
        ? h('button', {
          class: 'note-proj', type: 'button', text: S.projectLabel(proyecto),
          title: 'Abrir el proyecto',
          onclick: () => { location.hash = `#/proyectos/${proyecto.id}`; },
        })
        : null,
      t.context ? h('span', { class: 'note-ctx', text: t.context }) : null,
      h('button', {
        class: `note-pinbtn${t.pinned ? ' on' : ''}`, type: 'button',
        text: t.pinned ? '◆' : '◇',
        title: t.pinned ? 'Dejar de fijarla' : 'Fijarla: sale arriba y en su proyecto',
        onclick: () => S.togglePin(t.id),
      })),
    titulo,
    cuerpo,
    h('div', { class: 'note-acts' },
      h('span', { class: 'note-date', text: fmtDate(t.createdAt.slice(0, 10)) }),
      h('button', { class: 'card-act', type: 'button', text: 'ARCHIVO', title: 'Proyecto y contexto', onclick: () => openNote(t.id) }),
      h('button', {
        class: 'card-act', type: 'button', text: 'A ACCIÓN',
        title: 'Esto no era información: es trabajo',
        onclick: async () => { await S.noteToAction(t.id); toast('Ahora es una acción.'); },
      }),
      h('button', { class: 'card-act warn', type: 'button', text: 'ELIMINAR', onclick: () => askDelete(t.id) })));
}

export function noteGrid(notas, { empty = 'Ninguna anotación.', showProject = true } = {}) {
  if (!notas.length) return h('div', { class: 'empty', text: empty });
  return h('div', { class: 'notes' }, notas.map((t) => noteCard(t, { showProject })));
}

/**
 * Campo de anotacion rapida. Una linea, ENTER, y ya esta guardada.
 * Admite #proyecto y @contexto: archivar no debe costar mas que escribir.
 */
export function noteBar({ projectId = null, key = 'nota-nueva' } = {}) {
  const input = h('input', {
    class: 'bar-input', type: 'text', autocomplete: 'off', spellcheck: 'false',
    placeholder: projectId ? 'Anotar en este proyecto — ENTER guarda' : 'Anotar algo — #proyecto para archivarlo',
    dataset: { keepFocus: key },
  });
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const valor = input.value.trim();
    if (!valor) return;
    e.preventDefault();
    input.value = '';
    const nota = await S.createNote(valor, { projectId });
    if (nota) toast('Anotada.');
  });
  return h('div', { class: 'bar' }, input);
}

/** Ficha de la anotacion: donde se archiva y que hacer con ella. */
export function openNote(id) {
  const t = S.byId(id);
  if (!t) return;

  const aviso = h('span', { class: 'saved' });
  let avisoTimer = null;
  const marcar = () => {
    aviso.textContent = 'GUARDADO';
    aviso.classList.add('on');
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => aviso.classList.remove('on'), 1400);
  };
  const guardar = async (patch) => { await S.updateTask(id, patch); marcar(); };

  const titulo = h('textarea', { class: 'textarea', style: 'min-height:52px', 'data-autofocus': '' });
  titulo.value = t.title;
  const gt = autosave(() => {
    const limpio = titulo.value.replace(/\n/g, ' ').trim();
    if (limpio && limpio !== (S.byId(id) || {}).title) guardar({ title: limpio });
  });
  titulo.addEventListener('input', gt.input);
  titulo.addEventListener('blur', gt.blur);
  titulo.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); titulo.blur(); } });

  const cuerpo = h('textarea', { class: 'textarea', placeholder: 'El contenido de la anotación', style: 'min-height:180px' });
  cuerpo.value = t.notes || '';
  const gc = autosave(() => {
    if (cuerpo.value !== (S.byId(id) || {}).notes) guardar({ notes: cuerpo.value });
  });
  cuerpo.addEventListener('input', gc.input);
  cuerpo.addEventListener('blur', gc.blur);

  const proyecto = h('select', { class: 'select' },
    h('option', { value: '', text: '— sin proyecto —' }),
    S.selectableProjects().map((p) => h('option', {
      value: p.id, text: `${S.projectLabel(p)}${p.status === 'paused' ? ' (en pausa)' : ''}`, selected: p.id === t.projectId,
    })));
  proyecto.addEventListener('change', () => guardar({ projectId: proyecto.value || null }));

  const ctx = h('select', { class: 'select' },
    h('option', { value: '', text: '— sin contexto —' }),
    S.allContexts().map((c) => h('option', { value: c, text: c, selected: c === t.context })));
  ctx.addEventListener('change', () => guardar({ context: ctx.value || null }));

  const fijar = h('input', { type: 'checkbox' });
  fijar.checked = !!t.pinned;
  fijar.addEventListener('change', () => guardar({ pinned: fijar.checked }));

  const body = h('div', {},
    h('div', { class: 'field' }, h('label', { class: 'label', text: 'Título' }), titulo),
    h('div', { class: 'field' }, h('label', { class: 'label', text: 'Contenido' }), cuerpo),
    h('div', { class: 'row2' },
      h('div', { class: 'field' }, h('label', { class: 'label', text: 'Proyecto' }), proyecto),
      h('div', { class: 'field' }, h('label', { class: 'label', text: 'Contexto' }), ctx)),
    h('label', { class: 'check' }, fijar,
      h('span', { class: 'check-text' }, 'Fijada',
        h('span', { class: 'check-note', text: 'Sale la primera y aparece en la cabecera de su proyecto.' }))),
    h('div', { class: 'editor-more' },
      h('button', {
        class: 'btn btn-sm', type: 'button', text: 'CONVERTIR EN ACCIÓN',
        onclick: async () => { gt.blur(); gc.blur(); await S.noteToAction(id); closeTop(); toast('Ahora es una acción.'); },
      }),
      h('button', { class: 'btn btn-sm', type: 'button', text: 'ALGÚN DÍA', onclick: async () => { await S.makeSomeday(id); closeTop(); } }),
      h('button', { class: 'btn btn-sm btn-warn', type: 'button', text: 'ELIMINAR', onclick: () => { closeTop(); askDelete(id); } })));

  openSheet(sheet({
    title: 'Anotación',
    body,
    foot: [
      h('span', { class: 'micro', text: 'INFORMACIÓN, NO TRABAJO · SE GUARDA SOLO' }),
      aviso,
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', text: 'CERRAR', onclick: closeTop }),
    ],
  }), { onClose: () => { gt.blur(); gc.blur(); } });
}

/* ---------------------------- Captura rapida ----------------------------- */

/**
 * Capturar sigue costando segundos: una linea y ENTER.
 * Los detalles caben en la propia linea, y se muestra lo entendido
 * antes de guardar para que nadie tenga que fiarse.
 */
export function openCapture() {
  // Una sola captura abierta a la vez.
  if (stack.some((x) => x.kind === 'capture')) return;

  const input = h('input', {
    class: 'capture-input',
    type: 'text',
    placeholder: '¿Qué tienes en la cabeza?',
    'data-autofocus': '',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const eco = h('div', { class: 'capture-echo' });
  const log = h('div', { class: 'capture-log' });
  let n = 0;
  // Antes que cualquier otro manejador: con la lista abierta, Enter elige.
  const conAyuda = withAssist(input, { echo: eco });

  const refrescar = () => {
    const p = parseCapture(input.value, {
      projects: S.selectableProjects(),
      contexts: S.allContexts(),
    });
    const linea = describe(p, { projects: S.selectableProjects(), recurrenceLabel: S.recurrenceLabel });
    eco.textContent = linea;
    eco.classList.toggle('on', !!linea);
  };

  input.addEventListener('input', refrescar);
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const valor = input.value.trim();
    if (!valor) { closeTop(); return; }
    input.value = '';
    refrescar();
    const t = await S.captureSmart(valor);
    if (!t) return;
    n += 1;
    log.prepend(h('div', {},
      h('span', { text: `→ ${t.title}` }),
      t.status !== S.STATUS.INBOX ? h('span', { class: 'capture-tag', text: 'DECIDIDA' }) : null));
    while (log.children.length > 6) log.lastChild.remove();
  });

  const node = h('div', { class: 'capture' },
    conAyuda,
    h('div', { class: 'capture-hint' },
      h('span', { text: 'ENTER GUARDA Y SIGUE' }),
      h('span', { text: 'ESC CIERRA' }),
      h('span', { text: 'SIN DETALLES VA AL INBOX' })),
    log);

  openSheet(node, { kind: 'capture', onClose: () => { if (n) toast(`${n} capturada${n === 1 ? '' : 's'}.`); } });
}

/**
 * Barra de captura fija: en HOY se escribe sin abrir nada.
 * Devuelve el elemento; el router conserva el foco al re-renderizar.
 */
export function captureBar() {
  const input = h('input', {
    class: 'bar-input',
    type: 'text',
    placeholder: 'Captura aquí — escribe @ # ! ^ * % para ver opciones',
    autocomplete: 'off',
    spellcheck: 'false',
    dataset: { keepFocus: 'capture-bar' },
  });
  const eco = h('div', { class: 'capture-echo' });
  const conAyuda = withAssist(input, { echo: eco });

  const refrescar = () => {
    const p = parseCapture(input.value, {
      projects: S.selectableProjects(),
      contexts: S.allContexts(),
    });
    const linea = describe(p, { projects: S.selectableProjects(), recurrenceLabel: S.recurrenceLabel });
    eco.textContent = linea;
    eco.classList.toggle('on', !!linea);
  };

  input.addEventListener('input', refrescar);
  input.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const valor = input.value.trim();
    if (!valor) return;
    e.preventDefault();
    input.value = '';
    eco.textContent = '';
    eco.classList.remove('on');
    await S.captureSmart(valor);
  });

  return h('div', { class: 'bar' }, conAyuda);
}

/* -------------------------------- Secciones ------------------------------ */

export function section(title, { meta = null, body = null, micro = null }) {
  return h('section', { class: 'sec' },
    h('div', { class: 'sec-head' },
      h('div', { class: 'sec-title', text: title }),
      meta ? h('div', { class: 'sec-meta', text: meta }) : null),
    body,
    micro ? h('div', { class: 'micro', style: 'margin-top:12px', text: micro }) : null);
}

/**
 * Seccion plegable. Lo secundario ocupa una linea hasta que se pide verlo:
 * lo que importa ahora no puede competir con una lista de lo que no.
 * El estado vive en este navegador, no en los datos.
 */
export function foldSection(id, title, { meta = null, body = null, micro = null, abierta = false } = {}) {
  const clave = `gsd:fold:${id}`;
  let visible = abierta;
  try {
    const guardado = localStorage.getItem(clave);
    if (guardado !== null) visible = guardado === '1';
  } catch { /* sin almacenamiento: se usa el valor por defecto */ }

  const caja = h('div', { class: 'fold-body' }, body);
  caja.hidden = !visible;

  const flecha = h('span', { class: 'fold-arrow', text: visible ? '−' : '+' });
  const cabecera = h('button', { class: 'fold-head', type: 'button' },
    flecha,
    h('span', { class: 'fold-title', text: title }),
    meta ? h('span', { class: 'fold-meta', text: String(meta) }) : null);

  cabecera.addEventListener('click', () => {
    visible = !visible;
    caja.hidden = !visible;
    flecha.textContent = visible ? '−' : '+';
    try { localStorage.setItem(clave, visible ? '1' : '0'); } catch { /* da igual */ }
  });

  return h('section', { class: 'fold' }, cabecera, caja,
    micro && visible ? h('div', { class: 'micro', style: 'margin:10px 0 0 22px', text: micro }) : null);
}

export function pageHead(title, sub = null) {
  return h('header', { class: 'page-head' },
    h('h1', { class: 'page-title', text: title }),
    sub ? h('p', { class: 'page-sub', text: sub }) : null);
}


/* ------------------------------ Selector ---------------------------------- */

/** Elegir una tarea existente sin salir de la pantalla actual. */
export function pickTask({ title, tasks, empty = 'No hay candidatas.', onPick }) {
  const list = tasks.length
    ? h('div', { class: 'rows' }, tasks.map((t) => {
      const row = h('div', { class: 'row' },
        h('div', { class: 'row-body' },
          h('div', { class: 'row-title', text: t.title }),
          (() => {
            const bits = [];
            if (t.projectId) { const p = S.projectById(t.projectId); if (p) bits.push(S.projectLabel(p)); }
            if (t.context) bits.push(t.context);
            if (t.status === S.STATUS.INBOX) bits.push('BANDEJA');
            return bits.length ? h('div', { class: 'row-sub' }, bits.map((b) => h('span', { text: b }))) : null;
          })()));
      row.addEventListener('click', () => { closeTop(); onPick(t); });
      return row;
    }))
    : h('div', { class: 'empty', text: empty });

  return openSheet(sheet({ title, body: list }));
}
