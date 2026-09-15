/*
 * REVISIÓN SEMANAL.
 *
 * El sistema solo funciona si se revisa. Aqui no se ejecuta trabajo: se mira
 * el sistema entero, se decide y se limpia. Por eso cada paso se resuelve en
 * esta misma pantalla —sin irse a otra vista y perder el hilo— y al terminar
 * el sistema esta limpio de verdad, no marcado como limpio.
 *
 * Orden de GTD: vaciar, ponerse al dia, mirar adelante. Nada de inventos.
 */

import { add, h, plural, weekStart, fmtLong, fmtDate, relDate, today, addDays, toast } from '../util.js';
import * as S from '../store.js';
import * as V from '../voice.js';
import * as focus from '../focus.js';
import * as inbox from './inbox.js';
import {
  pageHead, section, openEditor, openDelegate, openPostpone, askDelete,
  askOneThing, askCommit, confirmSheet, deadlineTag, pickTask, completeToggle,
} from '../components.js';

/**
 * Paso abierto. Vive en el modulo para sobrevivir a cada re-render.
 * `undefined` = aun no se ha decidido cual abrir; `null` = todos cerrados
 * porque el usuario los ha cerrado, y entonces no se reabre nada solo.
 */
let abierto;

const rerender = () => dispatchEvent(new CustomEvent('gsd:rerender'));

/* ---------------------------------- Pasos --------------------------------- */

const STEPS = [
  {
    key: 'capture',
    name: 'VACIAR',
    label: 'La bandeja a cero',
    pending: () => S.inbox().length,
    status: () => {
      const n = S.inbox().length;
      return n ? `${plural(n, 'cosa', 'cosas')} sin decidir qué son` : 'Bandeja vacía';
    },
    panel: panelBandeja,
  },
  {
    key: 'carried',
    name: 'DEUDA',
    label: 'Lo que dijiste y no hiciste',
    pending: () => S.carried().length,
    status: () => {
      const n = S.carried().length;
      return n ? `${plural(n, 'compromiso arrastrado', 'compromisos arrastrados')}` : 'No arrastras nada';
    },
    panel: panelDeuda,
  },
  {
    key: 'calendar',
    name: 'CALENDARIO',
    label: 'Lo que viene y lo que vence',
    pending: () => S.upcomingDeadlines(7).length,
    status: () => {
      const t = S.upcomingDeadlines(7).length;
      const f = S.laterList().filter((x) => x.dueDate && x.dueDate <= addDays(today(), 7)).length;
      return `${f} con fecha esta semana · ${t} con fecha tope encima`;
    },
    panel: panelCalendario,
  },
  {
    key: 'projects',
    name: 'PROYECTOS',
    label: 'Cada uno con siguiente acción y con resultado',
    pending: () => S.stalledProjects().length + S.projectsWithoutOutcome().length + S.pausedWithoutDate().length,
    status: () => {
      const parados = S.stalledProjects().length;
      const sin = S.projectsWithoutOutcome().length;
      const pausados = S.pausedWithoutDate().length;
      const partes = [];
      if (parados) partes.push(`${plural(parados, 'parado', 'parados')}`);
      if (sin) partes.push(`${sin} sin resultado`);
      if (pausados) partes.push(`${pausados} en pausa sin fecha`);
      return partes.length ? partes.join(' · ') : `${S.activeProjects().length} proyectos, todos en marcha`;
    },
    panel: panelProyectos,
  },
  {
    key: 'waiting',
    name: 'EN ESPERA',
    label: 'Lo que depende de otros',
    pending: () => S.waitingDue().length,
    status: () => {
      const due = S.waitingDue().length;
      return due ? `${plural(due, 'seguimiento vencido', 'seguimientos vencidos')}` : `${S.waitingList().length} en seguimiento`;
    },
    panel: panelEspera,
  },
  {
    key: 'next',
    name: 'ACCIONES',
    label: 'Siguientes acciones que siguen valiendo',
    pending: () => S.staleNextActions().length,
    status: () => {
      const n = S.staleNextActions().length;
      return n ? `${plural(n, 'acción lleva', 'acciones llevan')} tres semanas sin moverse` : `${S.nextActions().length} acciones vivas`;
    },
    panel: panelAcciones,
  },
  {
    key: 'someday',
    name: 'ALGÚN DÍA',
    label: 'Lo aparcado: activarlo o tirarlo',
    pending: () => S.somedayOld().length,
    status: () => {
      const viejas = S.somedayOld().length;
      return viejas ? `${viejas} de ${S.somedayList().length} llevan meses ahí` : `${S.somedayList().length} ideas guardadas`;
    },
    panel: panelSomeday,
  },
  {
    key: 'notes',
    name: 'ANOTACIONES',
    label: 'El archivo de referencia',
    pending: () => 0,
    status: () => {
      const n = S.noteList().length;
      const f = S.pinnedNotes().length;
      return n ? `${n} anotaciones · ${f} fijadas` : 'Archivo vacío';
    },
    panel: panelNotas,
  },
  {
    key: 'chronic',
    name: 'CRÓNICAS',
    label: 'Lo que pospones una y otra vez',
    pending: () => S.chronic().length,
    status: () => {
      const n = S.chronic().length;
      return n ? `${plural(n, 'tarea exige', 'tareas exigen')} una decisión` : 'Ninguna tarea crónica';
    },
    panel: panelCronicas,
  },
  {
    key: 'week',
    name: 'LA SEMANA',
    label: 'Decidir qué importa',
    pending: () => (S.oneThing() ? 0 : 1),
    status: () => {
      const one = S.oneThing();
      return one ? `Lo único: ${one.title}` : 'Sin lo único elegido';
    },
    panel: panelSemana,
  },
];

/* --------------------------------- Pantalla ------------------------------- */

export function render() {
  const wrap = h('div', { class: 'wrap' });
  const rv = S.reviewState();
  const hechos = STEPS.filter((s) => rv.steps[s.key]).length;
  const completa = hechos === STEPS.length;
  const dias = S.daysSinceReview();
  const last = S.state.settings.lastReview;

  add(wrap, pageHead('REVISIÓN SEMANAL',
    last
      ? `Última revisión hace ${plural(dias === null ? 0 : dias, 'día', 'días')} · ${new Date(last).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}`
      : 'Nunca has cerrado una revisión. El sistema solo funciona si se revisa.',
    V.gritReview(S.stats().rate)));

  if (completa) {
    add(wrap, cierre());
    add(wrap, metricas());
    return wrap;
  }

  if (dias !== null && dias > 9) {
    add(wrap, h('div', { class: 'notice notice-warn' },
      h('div', { class: 'notice-title', text: `${dias} DÍAS SIN REVISAR` }),
      h('div', { class: 'notice-body', text: 'Un sistema sin revisar deja de merecer confianza, y lo que no te merece confianza no lo usas.' }),
      h('div', { class: 'micro', style: 'margin-top:8px', text: 'THE SYSTEM ONLY WORKS IF YOU WORK IT.' })));
  }

  const pendientes = STEPS.filter((s) => !rv.steps[s.key] && s.pending() > 0).length;
  add(wrap, h('div', { class: 'rv-bar' }, h('span', { style: `width:${Math.round((hechos / STEPS.length) * 100)}%` })));
  add(wrap, h('div', { class: 'rv-meta' },
    h('span', { text: `${hechos} / ${STEPS.length} PASOS` }),
    h('span', { text: `SEMANA DEL ${fmtLong(weekStart()).toUpperCase()}` }),
    pendientes ? h('span', { class: 'rv-pend', text: `${pendientes} CON TRABAJO PENDIENTE` }) : h('span', { text: 'NADA PENDIENTE' })));

  // Al entrar, se abre el primer paso sin hacer que tenga algo que resolver.
  if (abierto === undefined) {
    const primero = STEPS.find((s) => !rv.steps[s.key] && s.pending() > 0) || STEPS.find((s) => !rv.steps[s.key]);
    abierto = primero ? primero.key : null;
  }

  for (const step of STEPS) add(wrap, paso(step, rv));

  add(wrap, metricas());
  return wrap;
}

function paso(step, rv) {
  const on = !!rv.steps[step.key];
  const pend = step.pending();
  const activo = abierto === step.key;

  // Se elige el siguiente antes de guardar: el guardado ya repinta la pantalla.
  const marcar = async (valor) => {
    if (valor) {
      const hechos = S.reviewState().steps;
      const i = STEPS.indexOf(step);
      const orden = [...STEPS.slice(i + 1), ...STEPS.slice(0, i)];
      const siguiente = orden.find((s) => !hechos[s.key]);
      abierto = siguiente ? siguiente.key : null;
    }
    await S.setReviewStep(step.key, valor);
  };

  const caja = h('div', { class: `rv-step${on ? ' done' : ''}${activo ? ' open' : ''}` });

  const cabecera = h('div', { class: 'rv-top' },
    h('button', {
      class: `rv-box${on ? ' on' : ''}`, type: 'button', 'aria-label': step.label,
      title: on ? 'Desmarcar' : 'Marcar como revisado',
      onclick: (e) => { e.stopPropagation(); marcar(!on); },
    }),
    h('div', { style: 'flex:1;min-width:0' },
      h('div', { class: 'rv-name', text: `${step.name} — ${step.label}` }),
      h('div', { class: 'rv-desc', style: pend && !on ? 'color:var(--warn)' : '', text: step.status() })),
    pend && !on ? h('span', { class: 'rv-count', text: String(pend) }) : null,
    h('span', { class: 'rv-arrow', text: activo ? '−' : '+' }));

  cabecera.addEventListener('click', (e) => {
    if (e.target.closest('.rv-box')) return;
    abierto = activo ? null : step.key;
    rerender();
  });
  add(caja, cabecera);

  if (activo) {
    const cuerpo = h('div', { class: 'rv-detail' });
    const contenido = step.panel();
    add(cuerpo, contenido || h('div', { class: 'empty', text: 'Nada que decidir aquí. Míralo y sigue.' }));
    add(cuerpo, h('div', { class: 'rv-next' },
      h('button', {
        class: 'btn btn-sm btn-primary', type: 'button',
        text: on ? 'REVISADO' : (pend ? 'REVISADO IGUALMENTE' : 'REVISADO · SIGUIENTE'),
        onclick: () => marcar(true),
      }),
      pend ? h('span', { class: 'micro', text: `QUEDAN ${pend} SIN RESOLVER` }) : null));
    add(caja, cuerpo);
  }

  return caja;
}

/* --------------------------------- Paneles -------------------------------- */

/** Fila compacta reutilizable dentro de la revisión. */
function fila(t, acciones, extra = null) {
  const bits = [];
  const p = S.projectById(t.projectId);
  if (p) bits.push(h('span', { text: S.projectLabel(p) }));
  if (t.context) bits.push(h('span', { text: t.context }));
  if (t.dueDate) bits.push(h('span', { class: S.isOverdue(t) ? 'tag tag-late' : '', text: relDate(t.dueDate) }));
  if (t.deadline) bits.push(deadlineTag(t));
  if (extra) bits.push(extra);

  const f = h('div', { class: 'row' },
    h('div', { class: 'row-body' },
      h('button', { class: 'row-title', type: 'button', style: 'text-align:left', text: t.title, onclick: () => openEditor(t.id) }),
      bits.length ? h('div', { class: 'row-sub' }, bits) : null),
    h('div', { class: 'row-acts', style: 'opacity:1' },
      acciones.map((a) => h('button', {
        class: `row-act${a.warn ? ' warn' : ''}`, type: 'button', text: a.label, title: a.title || a.label,
        onclick: (e) => { e.stopPropagation(); a.fn(); },
      }))));
  return f;
}

function panelBandeja() {
  const items = S.inbox();
  if (!items.length) return h('div', { class: 'empty', text: 'Vacía. Clear mind, clear system.' });
  return h('div', {},
    h('div', { class: 'micro', style: 'margin-bottom:10px', text: 'CADA COSA RESPONDE A UNA PREGUNTA: ¿QUÉ ES ESTO? Y SALE DE AQUÍ.' }),
    h('div', { class: 'rows' }, items.slice(0, 8).map((t) => fila(t, [
      { label: 'ACLARAR', fn: () => inbox.startProcessing(t.id) },
      { label: 'ELIMINAR', warn: true, fn: () => askDelete(t.id) },
    ]))),
    h('div', { style: 'margin-top:12px' },
      h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: `ACLARAR LAS ${items.length}`, onclick: () => inbox.startProcessing() })));
}

function panelDeuda() {
  const items = S.carried();
  if (!items.length) return h('div', { class: 'empty', text: 'Nada arrastrado. Lo que dijiste, lo hiciste.' });
  return h('div', {},
    h('div', { class: 'micro', style: 'margin-bottom:10px', text: 'NO SE ARRASTRA A LA SEMANA SIGUIENTE SIN DECIDIRLO. HAZLA, REPROGRÁMALA O TÍRALA.' }),
    h('div', { class: 'rows' }, items.map((t) => fila(t, [
      { label: 'HACERLA', fn: () => focus.open(t.id) },
      { label: 'HECHA', fn: () => completeToggle(t.id) },
      { label: 'PROGRAMAR', fn: () => openPostpone(t.id) },
      { label: 'ELIMINAR', warn: true, fn: () => askDelete(t.id) },
    ], h('span', { class: 'tag tag-late', text: `ARRASTRAS ${S.carriedDays(t)}D` })))));
}

function panelCalendario() {
  const topes = S.upcomingDeadlines(14);
  const conFecha = S.laterList()
    .filter((t) => t.dueDate && t.dueDate <= addDays(today(), 7))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

  return h('div', {},
    h('div', { class: 'micro', style: 'margin-bottom:10px', text: 'LO QUE TIENE FECHA ES UN COMPROMISO CON EL CALENDARIO, NO UNA INTENCIÓN.' }),
    topes.length
      ? h('div', {},
        h('div', { class: 'label', text: 'Fechas tope de las próximas dos semanas' }),
        h('div', { class: 'rows' }, topes.map((t) => fila(t, [
          { label: 'AL DÍA DE HOY', fn: () => askCommit(t.id) },
          { label: 'PROGRAMAR', fn: () => openPostpone(t.id) },
        ], h('span', { text: fmtDate(t.deadline) })))))
      : h('div', { class: 'empty', text: 'Ninguna fecha tope en dos semanas.' }),
    conFecha.length
      ? h('div', { style: 'margin-top:18px' },
        h('div', { class: 'label', text: 'Programado para los próximos siete días' }),
        h('div', { class: 'rows' }, conFecha.slice(0, 10).map((t) => fila(t, [
          { label: 'HOY', fn: () => askCommit(t.id) },
          { label: 'MOVER', fn: () => openPostpone(t.id) },
        ]))))
      : null,
    h('div', { style: 'margin-top:14px' },
      h('button', { class: 'btn btn-sm', type: 'button', text: 'VER EL CALENDARIO', onclick: () => { location.hash = '#/calendario'; } })));
}

function panelProyectos() {
  const parados = S.stalledProjects();
  const sinResultado = S.projectsWithoutOutcome();
  const pausados = S.pausedWithoutDate();
  const caja = h('div', {});

  add(caja, h('div', { class: 'micro', style: 'margin-bottom:10px', text: 'UN PROYECTO SIN SIGUIENTE ACCIÓN NO ES UN PLAN: ES UN DESEO.' }));

  if (parados.length) {
    add(caja, h('div', { class: 'label', text: 'Sin siguiente acción — escríbela aquí mismo' }));
    for (const p of parados) {
      const campo = h('input', {
        class: 'input', type: 'text', placeholder: 'La siguiente acción física y concreta',
        autocomplete: 'off', dataset: { keepFocus: `rv-next-${p.id}` },
      });
      campo.addEventListener('keydown', async (e) => {
        if (e.key !== 'Enter') return;
        const valor = campo.value.trim();
        if (!valor) return;
        e.preventDefault();
        campo.value = '';
        const t = await S.captureSmart(valor);
        if (!t) return;
        await S.updateTask(t.id, { projectId: p.id });
        await S.makeNext(t.id);
      });
      add(caja, h('div', { class: 'rv-proj' },
        h('button', {
          class: 'rv-proj-name', type: 'button',
          onclick: () => { location.hash = `#/proyectos/${p.id}`; },
        }, h('span', { class: 'proj-code', text: p.code || '—' }), p.name),
        campo));
    }
  }

  if (sinResultado.length) {
    add(caja, h('div', { class: 'label', style: 'margin-top:16px', text: 'Sin resultado definido — ¿cómo sabrás que está terminado?' }),
      h('div', { class: 'rows' }, sinResultado.map((p) => h('div', { class: 'row' },
        h('div', { class: 'row-body' },
          h('div', { class: 'row-title' }, h('span', { class: 'proj-code', text: p.code || '—' }), p.name)),
        h('div', { class: 'row-acts', style: 'opacity:1' },
          h('button', {
            class: 'row-act', type: 'button', text: 'DEFINIRLO',
            onclick: () => { location.hash = `#/proyectos/${p.id}`; },
          }))))));
  }

  if (pausados.length) {
    add(caja, h('div', { class: 'label', style: 'margin-top:16px', text: 'En pausa sin fecha de vuelta — decídelo hoy' }),
      h('div', { class: 'rows' }, pausados.map((p) => h('div', { class: 'row' },
        h('div', { class: 'row-body' },
          h('div', { class: 'row-title' }, h('span', { class: 'proj-code', text: p.code || '—' }), p.name),
          h('div', { class: 'row-sub' }, h('span', { text: `${S.projectTasks(p.id).length} acciones paradas` }))),
        h('div', { class: 'row-acts', style: 'opacity:1' },
          h('button', { class: 'row-act', type: 'button', text: 'REANUDAR', onclick: () => S.resumeProject(p.id) }),
          h('button', {
            class: 'row-act', type: 'button', text: 'VUELVE EN 1 MES',
            onclick: () => S.pauseProject(p.id, addDays(today(), 30)),
          }))))));
  }

  if (!parados.length && !sinResultado.length && !pausados.length) {
    add(caja, h('div', { class: 'empty', text: 'Todos los proyectos tienen siguiente acción y resultado. Ahora ejecútalas.' }));
  }

  add(caja, h('div', { style: 'margin-top:14px' },
    h('button', { class: 'btn btn-sm', type: 'button', text: 'VER LOS PROYECTOS', onclick: () => { location.hash = '#/proyectos'; } })));
  return caja;
}

function panelEspera() {
  const vencidas = S.waitingDue();
  const resto = S.waitingList().filter((t) => !vencidas.includes(t));
  if (!vencidas.length && !resto.length) return h('div', { class: 'empty', text: 'No dependes de nadie.' });

  const filaEspera = (t) => {
    const w = S.waitingByTask(t.id);
    return h('div', { class: 'row' },
      h('div', { class: 'row-body' },
        h('button', {
          class: 'row-title', type: 'button', style: 'text-align:left',
          text: `→ ${t.waitingFor || '—'} — ${w ? w.description : t.title}`,
          onclick: () => openEditor(t.id),
        }),
        h('div', { class: 'row-sub' },
          w && w.reviewDate
            ? h('span', { class: w.reviewDate <= today() ? 'tag tag-late' : '', text: `REVISAR ${relDate(w.reviewDate)}` })
            : h('span', { class: 'tag tag-warn', text: 'SIN FECHA DE REVISIÓN' }))),
      h('div', { class: 'row-acts', style: 'opacity:1' },
        h('button', { class: 'row-act', type: 'button', text: 'RECIBIDO', onclick: () => completeToggle(t.id) }),
        h('button', {
          class: 'row-act', type: 'button', text: '+7D',
          onclick: () => S.delegate(t.id, {
            person: t.waitingFor,
            description: w ? w.description : t.title,
            reviewDate: addDays(w && w.reviewDate ? w.reviewDate : today(), 7),
          }),
        }),
        h('button', { class: 'row-act', type: 'button', text: 'SEGUIMIENTO', onclick: () => openDelegate(t.id) }),
        h('button', { class: 'row-act', type: 'button', text: 'RECUPERAR', onclick: () => S.undelegate(t.id) })));
  };

  return h('div', {},
    h('div', { class: 'micro', style: 'margin-bottom:10px', text: 'DELEGAR NO ES OLVIDAR. SIGUE SIENDO TUYO HASTA QUE ESTÉ HECHO.' }),
    vencidas.length ? h('div', { class: 'label', text: 'Vencidas' }) : null,
    vencidas.length ? h('div', { class: 'rows' }, vencidas.map(filaEspera)) : null,
    resto.length ? h('div', { class: 'label', style: 'margin-top:14px', text: 'El resto' }) : null,
    resto.length ? h('div', { class: 'rows' }, resto.map(filaEspera)) : null);
}

function panelAcciones() {
  const viejas = S.staleNextActions();
  if (!viejas.length) {
    return h('div', { class: 'empty', text: `${S.nextActions().length} acciones y ninguna criando polvo.` });
  }
  return h('div', {},
    h('div', { class: 'micro', style: 'margin-bottom:10px', text: 'TRES SEMANAS SIN MOVERSE. O ES LA SIGUIENTE ACCIÓN O NO LO ES.' }),
    h('div', { class: 'rows' }, viejas.map((t) => fila(t, [
      { label: 'HOY', title: 'Comprometerla para hoy', fn: () => askCommit(t.id) },
      { label: 'ALGÚN DÍA', fn: () => S.makeSomeday(t.id) },
      { label: 'DELEGAR', fn: () => openDelegate(t.id) },
      { label: 'ELIMINAR', warn: true, fn: () => askDelete(t.id) },
    ], h('span', { class: 'tag', text: `${Math.round((Date.now() - new Date(t.createdAt)) / 86400000)}D EN LA LISTA` })))));
}

function panelSomeday() {
  const todas = S.somedayList();
  const viejas = S.somedayOld();
  if (!todas.length) return h('div', { class: 'empty', text: 'Nada aparcado.' });
  const items = viejas.length ? viejas : todas.slice(0, 10);
  return h('div', {},
    h('div', { class: 'micro', style: 'margin-bottom:10px', text: viejas.length ? 'CUATRO MESES AHÍ. CASI TODAS SON UN NO.' : 'ALGO DE AQUÍ PUEDE SER EL TRABAJO DE ESTA SEMANA.' }),
    h('div', { class: 'rows' }, items.map((t) => fila(t, [
      { label: 'ACTIVAR', fn: () => S.makeNext(t.id) },
      { label: 'ANOTAR', title: 'Es información, no trabajo', fn: () => S.makeReference(t.id) },
      { label: 'ELIMINAR', warn: true, fn: () => askDelete(t.id) },
    ]))),
    todas.length > items.length
      ? h('div', { style: 'margin-top:12px' },
        h('button', { class: 'btn btn-sm', type: 'button', text: `VER LAS ${todas.length}`, onclick: () => { location.hash = '#/someday'; } }))
      : null);
}

function panelNotas() {
  const notas = S.noteList();
  if (!notas.length) {
    return h('div', { class: 'empty', text: 'Archivo vacío. Lo que no es acción tampoco es basura: anótalo.' });
  }
  const recientes = notas.slice(0, 6);
  return h('div', {},
    h('div', { class: 'micro', style: 'margin-bottom:10px', text: 'UNA REFERENCIA QUE NUNCA CONSULTAS NO ES UNA REFERENCIA.' }),
    h('div', { class: 'rows' }, recientes.map((t) => h('div', { class: 'row' },
      h('div', { class: 'row-body' },
        h('button', { class: 'row-title', type: 'button', style: 'text-align:left', text: `≡ ${t.title}`, onclick: () => openEditor(t.id) }),
        h('div', { class: 'row-sub' },
          (() => { const p = S.projectById(t.projectId); return p ? h('span', { text: S.projectLabel(p) }) : null; })(),
          t.pinned ? h('span', { class: 'tag tag-star', text: 'FIJADA' }) : null,
          h('span', { text: fmtDate(t.createdAt.slice(0, 10)) }))),
      h('div', { class: 'row-acts', style: 'opacity:1' },
        h('button', { class: 'row-act', type: 'button', text: t.pinned ? 'SOLTAR' : 'FIJAR', onclick: () => S.togglePin(t.id) }),
        h('button', { class: 'row-act', type: 'button', text: 'A ACCIÓN', onclick: () => S.noteToAction(t.id) }),
        h('button', { class: 'row-act warn', type: 'button', text: 'ELIMINAR', onclick: () => askDelete(t.id) }))))),
    h('div', { style: 'margin-top:12px' },
      h('button', { class: 'btn btn-sm', type: 'button', text: `VER LAS ${notas.length}`, onclick: () => { location.hash = '#/notas'; } })));
}

function panelCronicas() {
  const items = S.chronic();
  if (!items.length) return h('div', { class: 'empty', text: 'Ninguna tarea crónica. Lo que entra, sale.' });
  return h('div', {},
    h('div', { class: 'micro', style: 'margin-bottom:10px', text: 'DECIDE: DO IT, DELEGATE IT, SCHEDULE IT, OR DELETE IT.' }),
    h('div', { class: 'rows' }, items.map((t) => fila(t, [
      { label: 'HACER', fn: () => focus.open(t.id) },
      { label: 'DELEGAR', fn: () => openDelegate(t.id) },
      { label: 'PROGRAMAR', fn: () => openPostpone(t.id) },
      {
        label: 'ELIMINAR',
        warn: true,
        fn: () => confirmSheet({
          title: 'Eliminar',
          body: `${t.title} — pospuesta ${plural(t.postponeCount, 'vez', 'veces')}. Si no vas a hacerla, no organices basura.`,
          confirmText: 'ELIMINAR',
          warn: true,
          onConfirm: () => askDelete(t.id),
        }),
      },
    ], h('span', { class: 'tag tag-warn', text: `POSPUESTA ×${t.postponeCount}` })))));
}

function panelSemana() {
  const one = S.oneThing();
  const compromisos = S.commitments();
  return h('div', {},
    h('div', { class: 'micro', style: 'margin-bottom:10px', text: 'REVISAR NO ES ORGANIZAR PARA SIEMPRE. ES DECIDIR QUÉ SE HACE AHORA.' }),
    one
      ? h('div', { class: 'rows' }, [fila(one, [
        { label: 'CAMBIARLA', fn: () => elegirUnico() },
        { label: 'EMPEZAR', fn: () => focus.open(one.id) },
      ], h('span', { class: 'tag tag-star', text: 'LO ÚNICO' }))])
      : h('div', {},
        h('div', { class: 'notice-body', text: '¿Cuál es la única cosa que puedes hacer y que hará que todo lo demás sea más fácil o innecesario?' }),
        h('div', { style: 'margin-top:12px' },
          h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'ELEGIRLA', onclick: elegirUnico }))),
    h('div', { class: 'label', style: 'margin-top:18px', text: `Comprometido para hoy · ${compromisos.length} de ${S.commitCap()}` }),
    compromisos.length
      ? h('div', { class: 'rows' }, compromisos.map((t) => fila(t, [
        {
          label: 'RETIRAR',
          fn: () => confirmSheet({
            title: 'Retirar el compromiso',
            body: h('div', {},
              h('div', { class: 'hard-line', text: t.title }),
              h('div', { class: 'onething-ask', style: 'font-size:16px;margin-top:16px', text: 'Dijiste que esto no se negociaba.' })),
            confirmText: 'RETIRARLO',
            warn: true,
            hold: true,
            onConfirm: () => S.uncommit(t.id),
          }),
        },
      ])))
      : h('div', { class: 'empty', text: 'Nada comprometido todavía.' }));
}

function elegirUnico() {
  pickTask({
    title: '¿Cuál es la única cosa?',
    tasks: [...S.nextActions().filter((t) => !t.isOneThing), ...S.inbox()],
    empty: 'No hay nada que elegir.',
    onPick: (t) => askOneThing(t.id),
  });
}

/* ---------------------------------- Cierre -------------------------------- */

function cierre() {
  const sucio = STEPS.filter((s) => s.pending() > 0);
  return h('div', { class: 'rv-done' },
    h('div', { class: 'rv-done-title', text: sucio.length ? 'REVISADO' : 'SISTEMA LIMPIO' }),
    h('div', { class: 'page-sub', style: 'margin-top:14px', text: sucio.length
      ? `Lo has mirado todo, pero quedan cosas sin resolver: ${sucio.map((s) => s.name.toLowerCase()).join(', ')}.`
      : 'Todo está capturado, aclarado y decidido. Ahora ejecuta.' }),
    h('div', { style: 'display:flex;gap:10px;justify-content:center;margin-top:30px;flex-wrap:wrap' },
      h('button', {
        class: 'btn btn-primary', type: 'button', text: 'CERRAR LA REVISIÓN',
        onclick: async () => { abierto = undefined; await S.finishReview(); toast('Revisión cerrada. Ahora se ejecuta.'); location.hash = '#/hoy'; },
      }),
      h('button', {
        class: 'btn btn-ghost', type: 'button', text: 'VOLVER A REPASAR',
        onclick: async () => { abierto = undefined; await S.resetReview(); },
      })));
}

/* --------------------------------- Métricas ------------------------------- */

function metricas() {
  const st = S.stats();
  return section('ESTA SEMANA', {
    body: h('div', {},
      h('div', { class: 'score' },
        h('div', { class: `score-n${st.rate !== null && st.rate < 60 ? ' bad' : ''}`, text: st.rate === null ? '—' : `${st.rate}%` }),
        h('div', { class: 'score-l' },
          h('div', { text: 'DE LO QUE DIJISTE QUE HARÍAS' }),
          h('div', { class: 'micro', style: 'margin-top:6px', text: st.rate === null
            ? 'AÚN NO TE HAS COMPROMETIDO A NADA'
            : `${st.kept} CUMPLIDOS · ${st.broken} SIN HACER` }))),
      h('div', { class: 'stats', style: 'margin-top:20px' },
        h('div', { class: 'stat' }, h('div', { class: 'stat-n', text: horas(S.deepMinutes()) }), h('div', { class: 'stat-l', text: 'trabajo profundo' })),
        h('div', { class: 'stat' }, h('div', { class: 'stat-n', text: String(st.completed) }), h('div', { class: 'stat-l', text: 'completadas' })),
        h('div', { class: 'stat' }, h('div', { class: 'stat-n', text: String(st.postponed) }), h('div', { class: 'stat-l', text: 'aplazamientos' })))),
    micro: V.reviewLine(st.rate).toUpperCase(),
  });
}

/** Minutos en horas legibles: 0h · 45m · 3h 20m. */
function horas(min) {
  if (!min) return '0h';
  const h1 = Math.floor(min / 60);
  const m = min % 60;
  if (!h1) return `${m}m`;
  return m ? `${h1}h ${m}m` : `${h1}h`;
}
