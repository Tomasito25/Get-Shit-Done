/*
 * SIGUIENTES ACCIONES · EN ESPERA · ALGÚN DÍA.
 *
 * Listas planas. Sin tableros, sin columnas, sin arrastrar. Se leen y se ejecutan.
 *
 * SIGUIENTES ACCIONES se agrupa por contexto, que es la pregunta de GTD: estando
 * donde estoy y con lo que tengo, ¿qué puedo hacer ya? ALGÚN DÍA se ordena por
 * antigüedad, porque lo que lleva meses aparcado casi siempre es un no.
 */

import { add, h, relDate, today, addDays, fmtDate, fmtLong, toast, daysBetween, parseISO, iso } from '../util.js';
import * as S from '../store.js';
import * as V from '../voice.js';
import * as focus from '../focus.js';
import * as viewkeys from '../viewkeys.js';
import { parseDate } from '../parse.js';
import { openProjectForm } from './projects.js';
import {
  pageHead, section, taskList, openEditor, openPostpone, askDelete, completeToggle,
  askCommit, askOneThing, openDelegate, confirmSheet, openSheet, closeTop, sheet,
} from '../components.js';

const rerender = () => dispatchEvent(new CustomEvent('gsd:rerender'));

/** Preferencias de estas pantallas: duran lo que dura la sesión. */
const vista = {
  next: { agrupar: 'context' },
  someday: { orden: 'antiguas', decidiendo: false, saltadas: new Set() },
};

/* --------------------------- SIGUIENTES ACCIONES -------------------------- */

function ordenAcciones(a, b) {
  if (a.isOneThing !== b.isOneThing) return a.isOneThing ? -1 : 1;
  if (a.isCommitment !== b.isCommitment) return a.isCommitment ? -1 : 1;
  const ao = S.isOverdue(a) ? 0 : 1;
  const bo = S.isOverdue(b) ? 0 : 1;
  if (ao !== bo) return ao - bo;
  return (a.deadline || '9999').localeCompare(b.deadline || '9999')
    || (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
    || a.createdAt.localeCompare(b.createdAt);
}

export function next(params = {}) {
  const wrap = h('div', { class: 'wrap' });
  const ctx = params.context || null;
  const todas = S.nextActions();
  const items = (ctx ? todas.filter((t) => t.context === ctx) : todas).slice().sort(ordenAcciones);
  const hoyIds = new Set(S.todayList().map((t) => t.id));
  const quietas = S.staleNextActions().length;
  const sinContexto = todas.filter((t) => !t.context).length;
  const conTope = todas.filter((t) => t.deadline).length;

  add(wrap, pageHead('SIGUIENTES ACCIONES', V.nextLine(items.length),
    V.gritNext({ total: todas.length, stale: quietas, noContext: sinContexto })));

  add(wrap, h('div', { class: 'list-summary' },
    h('span', {}, h('b', { text: String(todas.length) }), ' listas para hacer'),
    h('span', {}, h('b', { text: String(todas.filter((t) => hoyIds.has(t.id)).length) }), ' en tu día'),
    conTope ? h('span', {}, h('b', { text: String(conTope) }), ' con fecha tope') : null,
    sinContexto ? h('span', { class: sinContexto > todas.length / 2 ? 'bad' : '' }, h('b', { text: String(sinContexto) }), ' sin contexto') : null,
    quietas ? h('span', { class: quietas >= 5 ? 'bad' : '' }, h('b', { text: String(quietas) }), ' quietas +21 días') : null));

  /* Filtros: contexto, y cómo agrupar. */
  const contextos = S.allContexts();
  const cuenta = (c) => todas.filter((t) => t.context === c).length;
  add(wrap, h('div', { class: 'filters' },
    h('span', { class: 'filters-l', text: 'ESTOY EN' }),
    h('button', { class: `chip${ctx ? '' : ' on'}`, type: 'button', text: `TODO ${todas.length}`, onclick: () => { location.hash = '#/next'; } }),
    contextos.map((c) => h('button', {
      class: `chip${ctx === c ? ' on' : ''}${cuenta(c) ? '' : ' chip-empty'}`, type: 'button', text: `${c.toUpperCase()} ${cuenta(c)}`,
      onclick: () => { location.hash = `#/next/${encodeURIComponent(c)}`; },
    }))));

  if (!ctx) {
    add(wrap, h('div', { class: 'filters' },
      h('span', { class: 'filters-l', text: 'AGRUPAR' }),
      [['context', 'POR CONTEXTO'], ['project', 'POR PROYECTO'], ['none', 'NADA']].map(([k, l]) => h('button', {
        class: `chip${vista.next.agrupar === k ? ' on' : ''}`, type: 'button', text: l,
        onclick: () => { vista.next.agrupar = k; rerender(); },
      }))));
  }

  /* Añadir sin salir: una línea, y ya es siguiente acción. */
  const nueva = h('input', {
    class: 'bar-input', type: 'text', autocomplete: 'off', spellcheck: 'false',
    placeholder: ctx ? `Nueva acción en ${ctx} — ENTER` : 'Nueva siguiente acción — admite @ # ! ^ %',
    dataset: { keepFocus: 'next-nueva' },
  });
  nueva.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const valor = nueva.value.trim();
    if (!valor) return;
    e.preventDefault();
    nueva.value = '';
    const t = await S.captureSmart(valor);
    if (!t) return;
    await S.makeNext(t.id, ctx && !t.context ? { context: ctx } : {});
    toast('Añadida a siguientes acciones.');
  });
  add(wrap, h('div', { class: 'bar', style: 'margin:18px 0 8px' }, nueva));

  const acts = (t) => [
    { label: '▶', title: 'Enfocar', fn: () => focus.open(t.id) },
    !t.isCommitment ? { label: 'HOY', title: 'Comprometer hoy', fn: () => askCommit(t.id) } : null,
    !t.isOneThing ? { label: '★', title: 'Lo único', fn: () => askOneThing(t.id) } : null,
    { label: 'POSPONER', fn: () => openPostpone(t.id) },
    { label: 'ALGÚN DÍA', title: 'Aparcarla', fn: async () => { await S.makeSomeday(t.id); toast('Aparcada en algún día.'); } },
    { label: 'EDITAR', fn: () => openEditor(t.id) },
    { label: '✕', title: 'Eliminar', warn: true, fn: () => askDelete(t.id) },
  ].filter(Boolean);

  const lista = (tareas, extra = {}) => taskList(tareas, { acts, hoyIds, age: 'next', ...extra });

  if (!items.length) {
    add(wrap, h('div', { class: 'empty', style: 'margin-top:24px', text: ctx
      ? `Nada que hacer en ${ctx}. Cambia de sitio o de excusa.`
      : 'Ninguna acción. Aclara la bandeja o define la siguiente acción de un proyecto.' }));
  } else if (ctx || vista.next.agrupar === 'none') {
    add(wrap, section(ctx ? `EN ${ctx.toUpperCase()}` : 'ACCIONES', { meta: `${items.length}`, body: lista(items, { showProject: true, showContext: !ctx }) }));
  } else {
    const grupos = new Map();
    for (const t of items) {
      let clave;
      let titulo;
      if (vista.next.agrupar === 'context') {
        clave = t.context ? `a${t.context}` : 'z';
        titulo = t.context ? t.context.toUpperCase() : 'SIN CONTEXTO';
      } else {
        const p = S.projectById(t.projectId);
        clave = p ? `a${p.code || ''}${p.name}` : 'z';
        titulo = p ? S.projectLabel(p).toUpperCase() : 'SIN PROYECTO';
      }
      if (!grupos.has(clave)) grupos.set(clave, { titulo, tareas: [] });
      grupos.get(clave).tareas.push(t);
    }
    for (const [clave, g] of [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const sin = clave === 'z';
      add(wrap, section(g.titulo, {
        meta: `${g.tareas.length}`,
        body: lista(g.tareas, { showProject: vista.next.agrupar !== 'project', showContext: vista.next.agrupar !== 'context' }),
        micro: sin && vista.next.agrupar === 'context' ? 'SIN CONTEXTO NO SABES DÓNDE HACERLAS. PÓNSELO AL ABRIRLAS.' : null,
      }));
    }
  }

  /* Lo programado, por cuándo llega. */
  const programadas = S.laterList().filter((t) => t.status === S.STATUS.SCHEDULED && (!ctx || t.context === ctx));
  if (programadas.length) {
    const hoy = today();
    const tramo = (t) => {
      const d = daysBetween(hoy, t.dueDate);
      if (d <= 1) return ['1', 'MAÑANA'];
      if (d <= 7) return ['2', 'ESTA SEMANA'];
      if (d <= 14) return ['3', 'LA SEMANA QUE VIENE'];
      return ['4', 'MÁS ADELANTE'];
    };
    const tramos = new Map();
    for (const t of programadas.sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
      const [k, l] = tramo(t);
      if (!tramos.has(k)) tramos.set(k, { l, tareas: [] });
      tramos.get(k).tareas.push(t);
    }
    const cuerpo = h('div', {});
    for (const [, g] of [...tramos.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      add(cuerpo, h('div', { class: 'list-sub', text: `${g.l} · ${g.tareas.length}` }),
        taskList(g.tareas, {
          showProject: true,
          acts: (t) => [
            { label: 'HOY', fn: () => askCommit(t.id) },
            { label: 'POSPONER', fn: () => openPostpone(t.id) },
            { label: 'EDITAR', fn: () => openEditor(t.id) },
            { label: '✕', title: 'Eliminar', warn: true, fn: () => askDelete(t.id) },
          ],
        }));
    }
    add(wrap, section('PROGRAMADAS', {
      meta: `${programadas.length}`,
      body: cuerpo,
      micro: 'LLEGAN SOLAS A SIGUIENTES ACCIONES EL DÍA QUE TOCAN.',
    }));
  }

  return wrap;
}

/* --------------------------------- EN ESPERA ------------------------------ */

export function waiting() {
  const wrap = h('div', { class: 'wrap' });
  const items = S.waitingList();
  const vencidas = S.waitingDue().length;
  add(wrap, pageHead('EN ESPERA', V.waitingLine(items.length, vencidas), V.gritWaiting(vencidas)));

  if (!items.length) {
    add(wrap, h('div', { class: 'empty', text: 'No estás esperando nada.' }));
    return wrap;
  }

  const byPerson = new Map();
  for (const t of items) {
    const key = t.waitingFor || '— SIN PERSONA';
    if (!byPerson.has(key)) byPerson.set(key, []);
    byPerson.get(key).push(t);
  }

  for (const [person, tasks] of [...byPerson.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const rows = tasks.map((t) => {
      const w = S.waitingByTask(t.id);
      const late = w && w.reviewDate && w.reviewDate <= today();
      const row = h('div', { class: 'row', dataset: { taskId: t.id } },
        h('button', {
          class: 'row-check', type: 'button', title: 'Recibido',
          onclick: (e) => { e.stopPropagation(); completeToggle(t.id); },
        }),
        h('div', { class: 'row-body' },
          h('div', { class: 'row-title', text: w && w.description ? w.description : t.title }),
          h('div', { class: 'row-sub' },
            w && w.reviewDate
              ? h('span', { class: late ? 'tag tag-late' : '', text: `REVISAR ${relDate(w.reviewDate)}` })
              : h('span', { class: 'tag tag-warn', text: 'SIN FECHA DE REVISIÓN' }),
            (() => { const p = S.projectById(t.projectId); return p ? h('span', { text: S.projectLabel(p) }) : null; })())),
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
          h('button', { class: 'row-act warn', type: 'button', text: '✕', title: 'Eliminar', onclick: () => askDelete(t.id) })));
      row.addEventListener('click', (e) => { if (!e.target.closest('button')) openEditor(t.id); });
      return row;
    });
    add(wrap, section(person.toUpperCase(), { meta: `${tasks.length}`, body: h('div', { class: 'rows' }, rows) }));
  }

  return wrap;
}

/* -------------------------------- ALGÚN DÍA ------------------------------- */

/** Programar una idea: se elige el día y pasa a ser trabajo con fecha. */
function openProgramar(t, despues = null) {
  const fecha = h('input', { class: 'input', type: 'date', value: addDays(today(), 7) });
  const ir = async (valor) => {
    if (!valor) return;
    await S.schedule(t.id, valor);
    closeTop();
    toast(`Programada para el ${fmtDate(valor)}.`);
    if (despues) despues();
  };
  const enUnMes = () => { const d = parseISO(today()); d.setMonth(d.getMonth() + 1); return iso(d); };
  openSheet(sheet({
    title: 'Programar',
    body: h('div', {},
      h('div', { class: 'hard-line', text: t.title }),
      h('div', { class: 'pause-opts', style: 'margin-top:16px' },
        [['MAÑANA', addDays(today(), 1)], ['LUNES', parseDate('lun')], ['+1 SEMANA', addDays(today(), 7)], ['+1 MES', enUnMes()]]
          .map(([l, v]) => h('button', { class: 'btn btn-sm', type: 'button', text: l, title: fmtLong(v), onclick: () => ir(v) }))),
      h('div', { class: 'field', style: 'margin-top:16px' }, h('label', { class: 'label', text: 'O un día concreto' }), fecha)),
    foot: [h('button', { class: 'btn btn-ghost', type: 'button', text: 'CANCELAR', onclick: closeTop }), h('div', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', text: 'PROGRAMAR', onclick: () => ir(fecha.value) })],
  }));
}

/** Una idea que resulta ser un resultado con varios pasos: se convierte en proyecto. */
async function aProyecto(t) {
  const p = await S.createProject({ name: t.title.slice(0, 80) });
  if (!p) return;
  await S.remove(t.id);
  toast(`${S.projectLabel(p)} creado. Escribe su resultado.`);
  openProjectForm(p);
}

export function someday() {
  const wrap = h('div', { class: 'wrap' });
  const todas = S.somedayList();
  const viejas = S.somedayOld();

  if (vista.someday.decidiendo) {
    const pendientes = todas.filter((t) => !vista.someday.saltadas.has(t.id))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    if (pendientes.length) return decidirUnaAUna(wrap, pendientes, todas.length);
    vista.someday.decidiendo = false;
    vista.someday.saltadas.clear();
    viewkeys.clear();
    toast('Revisadas todas. Lo que queda aparcado, queda por decisión.');
  }

  add(wrap, pageHead('ALGÚN DÍA', V.somedayLine(todas.length), V.gritSomeday({ total: todas.length, old: viejas.length })));

  add(wrap, h('div', { class: 'list-summary' },
    h('span', {}, h('b', { text: String(todas.length) }), ` ${todas.length === 1 ? 'idea aparcada' : 'ideas aparcadas'}`),
    viejas.length ? h('span', { class: 'bad' }, h('b', { text: String(viejas.length) }), ' con más de 4 meses') : null,
    h('span', {}, h('b', { text: String(todas.filter((t) => t.projectId).length) }), ' de algún proyecto')));

  add(wrap, h('div', { class: 'filters', style: 'margin-top:16px' },
    todas.length
      ? h('button', {
        class: 'btn btn-sm btn-primary', type: 'button', text: `DECIDIR UNA A UNA (${todas.length})`,
        onclick: () => { vista.someday.decidiendo = true; vista.someday.saltadas.clear(); rerender(); },
      })
      : null,
    h('span', { class: 'filters-l', style: 'margin-left:12px', text: 'ORDEN' }),
    [['antiguas', 'MÁS ANTIGUAS'], ['recientes', 'MÁS RECIENTES'], ['proyecto', 'POR PROYECTO']].map(([k, l]) => h('button', {
      class: `chip${vista.someday.orden === k ? ' on' : ''}`, type: 'button', text: l,
      onclick: () => { vista.someday.orden = k; rerender(); },
    }))));

  const nueva = h('input', {
    class: 'bar-input', type: 'text', autocomplete: 'off', spellcheck: 'false',
    placeholder: 'Aparcar una idea — ENTER', dataset: { keepFocus: 'someday-nueva' },
  });
  nueva.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const valor = nueva.value.trim();
    if (!valor) return;
    e.preventDefault();
    nueva.value = '';
    const t = await S.captureSmart(valor);
    if (t) { await S.makeSomeday(t.id); toast('Aparcada.'); }
  });
  add(wrap, h('div', { class: 'bar', style: 'margin:14px 0 8px' }, nueva));

  const acts = (t) => [
    { label: 'ACTIVAR', title: 'Pasa a siguientes acciones', fn: async () => { await S.makeNext(t.id); toast('Activada. Ahora es trabajo.'); } },
    { label: 'PROGRAMAR', title: 'Ponerle un día', fn: () => openProgramar(t) },
    { label: 'PROYECTO', title: 'Es un resultado con varios pasos', fn: () => aProyecto(t) },
    { label: 'ANOTAR', title: 'Es información, no algo que hacer', fn: async () => { await S.makeReference(t.id); toast('Guardada como anotación.'); } },
    { label: 'EDITAR', fn: () => openEditor(t.id) },
    { label: '✕', title: 'Eliminar', warn: true, fn: () => askDelete(t.id) },
  ];

  if (!todas.length) {
    add(wrap, h('div', { class: 'empty', style: 'margin-top:20px', text: 'Nada aparcado. Todo lo que tienes, lo tienes delante.' }));
  } else if (vista.someday.orden === 'proyecto') {
    const grupos = new Map();
    for (const t of todas) {
      const p = S.projectById(t.projectId);
      const clave = p ? `a${p.code || ''}${p.name}` : 'z';
      if (!grupos.has(clave)) grupos.set(clave, { titulo: p ? S.projectLabel(p).toUpperCase() : 'SIN PROYECTO', tareas: [] });
      grupos.get(clave).tareas.push(t);
    }
    for (const [, g] of [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      add(wrap, section(g.titulo, { meta: `${g.tareas.length}`, body: taskList(g.tareas, { acts, age: 'someday', showProject: false }) }));
    }
  } else {
    const orden = [...todas].sort((a, b) => (vista.someday.orden === 'recientes' ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt)));
    add(wrap, section('IDEAS', { meta: `${orden.length}`, body: taskList(orden, { acts, age: 'someday' }) }));
  }

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

  if (todas.length > 20) {
    add(wrap, h('div', { class: 'notice', style: 'margin-top:30px' },
      h('div', { class: 'notice-title', text: 'LIMPIEZA' }),
      h('div', { class: 'notice-body', text: `${todas.length} ideas guardadas. Las que ya no te interesan no necesitan estar aquí.` }),
      h('div', { class: 'notice-acts' },
        h('button', {
          class: 'btn btn-sm btn-warn', type: 'button', text: 'ELIMINAR LAS DE HACE MÁS DE 6 MESES',
          onclick: () => confirmSheet({
            title: 'Eliminar ideas antiguas',
            body: 'Se eliminan las ideas de algún día capturadas hace más de 180 días. No afecta a nada más.',
            confirmText: 'ELIMINAR',
            warn: true,
            hold: true,
            onConfirm: async () => {
              const cutoff = addDays(today(), -180);
              let n = 0;
              for (const t of S.somedayList()) {
                if (t.createdAt.slice(0, 10) < cutoff) { await S.remove(t.id); n += 1; }
              }
              toast(`${n} eliminadas.`);
            },
          }),
        }))));
  }

  return wrap;
}

/**
 * Revisar algún día como se aclara la bandeja: una idea cada vez, una decisión
 * cada vez. «Sigue aparcada» es una respuesta válida, pero es una respuesta.
 */
function decidirUnaAUna(wrap, pendientes, total) {
  const t = pendientes[0];
  const hechas = total - pendientes.length;
  const dias = S.taskAge(t);
  const p = S.projectById(t.projectId);

  const salir = () => { vista.someday.decidiendo = false; vista.someday.saltadas.clear(); viewkeys.clear(); rerender(); };
  const acciones = {
    1: async () => { await S.makeNext(t.id); toast('Activada.'); },
    2: () => openProgramar(t),
    3: () => aProyecto(t),
    4: async () => { await S.makeReference(t.id); toast('Anotada.'); },
    5: () => { vista.someday.saltadas.add(t.id); rerender(); },
    6: async () => { await askDelete(t.id); },
  };
  viewkeys.set((e) => {
    if (acciones[e.key]) { acciones[e.key](); return true; }
    if (e.key === 'Escape') { salir(); return true; }
    return false;
  });

  const opcion = (n, etiqueta, pista, clase = '') => h('button', {
    class: `btn btn-block${clase}`, type: 'button', style: 'justify-content:flex-start;padding:11px 14px',
    onclick: acciones[n],
  },
    h('span', { class: 'micro', style: 'width:18px;color:var(--faint)', text: String(n) }),
    h('span', { text: etiqueta }),
    h('span', { class: 'micro', style: 'margin-left:auto;text-transform:none', text: pista }));

  add(wrap,
    pageHead('ALGÚN DÍA · DECIDIR', `${hechas + 1} de ${total} · ¿Sigue valiendo?`, dias >= 120 ? "IF IT'S BEEN MONTHS, IT'S A NO. SAY IT." : 'DECIDE. DON’T HOARD.'),
    h('div', { class: 'progress' }, h('span', { style: `width:${Math.round((hechas / Math.max(1, total)) * 100)}%` })),
    h('div', { class: 'someday-card' },
      h('div', { class: 'someday-age', text: dias === 0 ? 'APARCADA HOY' : `APARCADA HACE ${dias} DÍAS` }),
      h('h2', { class: 'someday-title', text: t.title }),
      p ? h('div', { class: 'micro', style: 'margin-top:10px', text: S.projectLabel(p) }) : null,
      (t.notes || '').trim() ? h('div', { class: 'card-note', style: 'white-space:normal;margin-top:10px', text: t.notes.slice(0, 300) }) : null),
    h('div', { style: 'display:flex;flex-direction:column;gap:6px;margin-top:20px' },
      opcion(1, 'ACTIVAR', 'pasa a siguientes acciones'),
      opcion(2, 'PROGRAMAR', 'tiene un día'),
      opcion(3, 'ES UN PROYECTO', 'resultado con varios pasos'),
      opcion(4, 'ANOTAR', 'es información'),
      opcion(5, 'SIGUE APARCADA', 'la vuelves a ver en la revisión'),
      opcion(6, 'ELIMINAR', 'no la vas a hacer', ' btn-warn')),
    h('div', { style: 'margin-top:22px;display:flex;gap:10px;align-items:center' },
      h('button', { class: 'btn btn-ghost', type: 'button', text: 'SALIR', onclick: salir }),
      h('span', { class: 'micro', text: 'TECLAS 1–6 · ESC SALE' })));
  return wrap;
}
