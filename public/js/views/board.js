/*
 * TABLERO.
 *
 * Un kanban con las columnas de GTD, no con fases inventadas. Sirve para
 * decidir de un vistazo, no para jugar a mover tarjetas: cada movimiento
 * cambia el estado real de la tarea.
 *
 * Dos usos con el mismo codigo: el tablero global (con etiqueta de proyecto
 * en cada tarjeta) y el tablero de un proyecto concreto.
 *
 * Claridad antes que cantidad: se filtra escribiendo, se agrupa por proyecto o
 * contexto, y en SIGUIENTE lo que es para hoy va separado de lo que espera turno.
 */

import { add, h, relDate, toast, fmtDate, today as todayISO } from '../util.js';
import * as S from '../store.js';
import * as V from '../voice.js';
import * as focus from '../focus.js';
import { openProjectForm, openPauseSheet, openMoveToFolder } from './projects.js';
import { projectStrip } from './notes.js';
import {
  pageHead, openEditor, askDelete, askOneThing, askCommit, openSheet, closeTop, sheet, deadlineTag,
  completeToggle, openDelegate, confirmSheet,
} from '../components.js';

/** Filtros vivos del tablero: una lupa, no un ajuste. */
const filtro = { q: '', hoy: false, tope: false };

const rerender = () => dispatchEvent(new CustomEvent('gsd:rerender'));
const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/* --------------------------------- Tarjeta -------------------------------- */

/**
 * Tarjeta de tarea. Lo que enseña lo decide CONFIGURACIÓN → TARJETAS.
 * `preview` la dibuja sin comportamiento, para la vista previa de los ajustes.
 */
export function taskCard(t, { showProject = false, cols = [], projectId = null, preview = false, hoyIds = null } = {}) {
  const pref = S.cardPrefs();
  const ver = pref.show;
  const estado = S.deadlineState(t);
  const edad = S.taskAge(t);
  const accionable = !t.completed && S.isActionable(t);

  const el = h('article', {
    class: [
      'card',
      pref.density === 'compact' ? 'card-compact' : '',
      pref.actions === 'always' ? 'card-acts-on' : '',
      t.isOneThing ? 'card-one' : '',
      t.isCommitment && !t.isOneThing && !t.completed ? 'card-commit' : '',
      t.completed ? 'card-done' : '',
      estado === 'late' || estado === 'today' ? 'card-dl' : '',
    ].filter(Boolean).join(' '),
    draggable: preview ? null : 'true',
    dataset: { taskId: t.id },
    tabindex: preview ? null : '0',
  });

  /* Completar: lo primero de la tarjeta, siempre a un clic. */
  const check = h('button', {
    class: `card-check${t.completed ? ' done' : ''}`,
    type: 'button',
    title: t.completed ? 'Reabrir' : 'Completar',
    'aria-label': t.completed ? 'Reabrir' : 'Completar',
    onclick: (e) => { e.stopPropagation(); if (!preview) completeToggle(t.id); },
  });

  const cuerpo = h('div', { class: 'card-body' });

  // Arriba: de dónde es y dónde se hace.
  const arriba = [];
  if (ver.project && showProject && t.projectId) {
    const p = S.projectById(t.projectId);
    if (p) arriba.push(h('span', { class: 'card-proj' }, p.code ? h('b', { text: p.code }) : null, p.name));
  }
  if (ver.context && t.context) arriba.push(h('span', { class: 'card-ctx', text: t.context }));
  if (ver.age && !t.completed && edad >= 7 && t.status !== S.STATUS.SOMEDAY) {
    const grito = V.ageLine(edad);
    arriba.push(h('span', {
      class: `card-age${grito ? ' card-age-old' : ''}`,
      text: grito ? `${grito} ${edad}D` : `${edad}D`,
      title: `Capturada hace ${edad} días`,
    }));
  }
  if (arriba.length) add(cuerpo, h('div', { class: 'card-top' }, arriba));

  add(cuerpo, h('div', { class: 'card-title', text: t.title }));

  if (ver.notes && (t.notes || '').trim()) {
    const primera = t.notes.trim().split('\n')[0];
    add(cuerpo, h('div', { class: 'card-note', text: primera.length > 90 ? `${primera.slice(0, 90)}…` : primera, title: t.notes.slice(0, 400) }));
  }

  const tags = [];
  if (t.isOneThing) tags.push(h('span', { class: 'tag tag-star', text: 'LO ÚNICO' }));
  if (t.isCommitment && !t.isOneThing && !t.completed) tags.push(h('span', { class: 'tag tag-lock', text: 'NO NEGOCIAR' }));
  if (ver.due && t.dueDate && !t.completed) {
    const dias = S.carriedDays(t);
    tags.push(t.isCommitment && dias > 0
      ? h('span', { class: 'tag tag-late', text: `ARRASTRAS ${dias}D` })
      : h('span', { class: S.isOverdue(t) ? 'tag tag-late' : 'tag', text: relDate(t.dueDate) }));
  }
  if (ver.deadline && t.deadline && !t.completed) tags.push(deadlineTag(t));
  if (ver.reminder && t.reminder && !t.completed) tags.push(h('span', { class: 'tag tag-rem', text: `◷ ${S.reminderLabel(t)}` }));
  if (ver.recurrence && t.recurrence) tags.push(h('span', { class: 'tag tag-rep', text: `↻ ${S.recurrenceLabel(t.recurrence)}` }));
  if (ver.postpone && (t.postponeCount || 0) >= S.postponeAlert()) {
    tags.push(h('span', { class: 'tag tag-warn', text: `POSPUESTA ×${t.postponeCount}` }));
  }
  if (ver.waiting && t.status === S.STATUS.WAITING) {
    const w = S.waitingByTask(t.id);
    const tarde = w && w.reviewDate && w.reviewDate <= todayISO();
    tags.push(h('span', {
      class: tarde ? 'tag tag-late' : 'tag',
      text: `→ ${t.waitingFor || 'SIN PERSONA'}${w && w.reviewDate ? ` · ${relDate(w.reviewDate)}` : ''}`,
    }));
  }
  if (!ver.notes && (t.notes || '').trim()) tags.push(h('span', { class: 'tag tag-note', text: '≡', title: t.notes.slice(0, 200) }));
  if (tags.length) add(cuerpo, h('div', { class: 'card-tags' }, tags));

  /* Barra de vencimiento: solo aparece cuando hay fecha tope y aprieta. */
  if (ver.deadline && estado && estado !== 'far') {
    add(cuerpo, h('div', { class: `card-dlbar card-dlbar-${estado}` }));
  }

  const accion = (texto, titulo, fn, warn = false) => h('button', {
    class: `card-act${warn ? ' warn' : ''}`, type: 'button', title: titulo, text: texto,
    onclick: (e) => { e.stopPropagation(); if (!preview) fn(); },
  });
  const acciones = h('div', { class: 'card-acts' },
    accionable ? accion('▶', 'Enfocar: pantalla completa con esta tarea', () => focus.open(t.id)) : null,
    accionable && !t.isCommitment && t.status !== S.STATUS.WAITING ? accion('HOY', 'Comprometerla para hoy', () => askCommit(t.id)) : null,
    accionable && !t.isOneThing && t.status !== S.STATUS.WAITING ? accion('★', 'Convertirla en lo único', () => askOneThing(t.id)) : null,
    !t.completed ? accion('MOVER', 'Mover de columna (M)', () => openMove(t, cols, projectId)) : null,
    accion('EDITAR', 'Abrir la ficha (Enter)', () => openEditor(t.id)),
    accion('✕', 'Eliminar', () => askDelete(t.id), true));
  add(cuerpo, acciones);

  add(el, check, cuerpo);
  if (preview) return el;

  el.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    openEditor(t.id);
  });
  el.addEventListener('keydown', (e) => {
    if (e.target !== el) return;
    if (e.key === 'Enter') { e.preventDefault(); openEditor(t.id); }
    if (e.key === ' ') { e.preventDefault(); completeToggle(t.id); }
    if (e.key.toLowerCase() === 'm') { e.preventDefault(); openMove(t, cols, projectId); }
  });
  el.addEventListener('dragstart', (ev) => {
    ev.dataTransfer.setData('text/plain', t.id);
    ev.dataTransfer.effectAllowed = 'move';
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));

  return el;
}

/**
 * El resultado se edita donde se lee. Un proyecto sin resultado definido no es
 * un proyecto: es una carpeta con cosas dentro, y aqui se dice sin rodeos.
 */
function outcomeLine(proyecto) {
  if (proyecto.outcome) {
    return h('p', { class: 'page-sub board-outcome' },
      h('span', { class: 'proj-next-label', style: 'margin-right:8px', text: 'RESULTADO' }),
      h('button', {
        class: 'outcome-edit', type: 'button', text: proyecto.outcome,
        title: 'Editar el resultado',
        onclick: () => openProjectForm(proyecto),
      }));
  }
  return h('div', { class: 'notice notice-warn', style: 'margin-top:12px' },
    h('div', { class: 'notice-title', text: 'SIN RESULTADO DEFINIDO' }),
    h('div', { class: 'notice-body', text: '¿Cómo sabrás que está terminado? Sin respuesta, esto no se cierra nunca.' }),
    h('div', { class: 'notice-acts' },
      h('button', {
        class: 'btn btn-sm btn-primary', type: 'button', text: 'DEFINIRLO',
        onclick: () => openProjectForm(proyecto),
      })));
}

/** Llevar una tarjeta a una columna. EN ESPERA pregunta a quién: sin persona no hay espera. */
async function llevarA(t, columna, projectId) {
  if (projectId && t.projectId !== projectId) await S.updateTask(t.id, { projectId });
  if (columna === S.STATUS.WAITING) {
    if (t.completed) await S.uncomplete(t.id);
    openDelegate(t.id);
    return;
  }
  if (columna === S.STATUS.DONE) { await completeToggle(t.id); return; }
  await S.moveTo(t.id, columna);
}

/** Mover sin arrastrar: se elige la columna destino, no se empuja de una en una. */
function openMove(t, cols, projectId) {
  const actual = t.completed ? S.STATUS.DONE : (t.status === S.STATUS.SCHEDULED ? S.STATUS.NEXT : t.status);
  openSheet(sheet({
    title: 'Mover a',
    body: h('div', {},
      h('div', { class: 'hard-line', text: t.title }),
      h('div', { style: 'display:flex;flex-direction:column;gap:6px;margin-top:18px' },
        cols.map((c) => h('button', {
          class: `btn btn-block${c.key === actual ? ' btn-primary' : ''}`,
          type: 'button',
          style: 'justify-content:flex-start;padding:11px 14px',
          onclick: async () => { closeTop(); if (c.key !== actual) await llevarA(t, c.key, projectId); },
        },
          h('span', { text: c.label }),
          h('span', { class: 'micro', style: 'margin-left:auto;text-transform:none', text: c.hint }))))),
  }));
}

/* ------------------------------ Agrupar y ordenar ------------------------- */

function ordenar(key, tareas) {
  const tope = (t) => t.deadline || '9999';
  return [...tareas].sort((a, b) => {
    if (key === S.STATUS.DONE) return (b.completedAt || '').localeCompare(a.completedAt || '');
    if (a.isOneThing !== b.isOneThing) return a.isOneThing ? -1 : 1;
    if (a.isCommitment !== b.isCommitment) return a.isCommitment ? -1 : 1;
    const ao = S.isOverdue(a) ? 0 : 1;
    const bo = S.isOverdue(b) ? 0 : 1;
    if (ao !== bo) return ao - bo;
    return tope(a).localeCompare(tope(b))
      || (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
      || a.createdAt.localeCompare(b.createdAt);
  });
}

/** Grupos dentro de una columna. Sin agrupar, SIGUIENTE separa lo de hoy del resto. */
function agrupar(col, tareas, modo, hoyIds) {
  const lista = ordenar(col.key, tareas);
  if (modo === 'project' || modo === 'context') {
    const mapa = new Map();
    for (const t of lista) {
      let clave = 'zzz';
      let etiqueta = modo === 'project' ? 'SIN PROYECTO' : 'SIN CONTEXTO';
      if (modo === 'project' && t.projectId) {
        const p = S.projectById(t.projectId);
        if (p) { clave = `${p.code || ''}${p.name}`; etiqueta = S.projectLabel(p); }
      }
      if (modo === 'context' && t.context) { clave = t.context; etiqueta = t.context; }
      if (!mapa.has(clave)) mapa.set(clave, { etiqueta, tareas: [] });
      mapa.get(clave).tareas.push(t);
    }
    return [...mapa.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([, g]) => g);
  }
  if (col.key === S.STATUS.NEXT) {
    const hoy = lista.filter((t) => hoyIds.has(t.id));
    const resto = lista.filter((t) => !hoyIds.has(t.id));
    if (hoy.length && resto.length) {
      return [{ etiqueta: 'PARA HOY', tareas: hoy, fuerte: true }, { etiqueta: 'CUANDO TOQUE', tareas: resto }];
    }
  }
  return [{ etiqueta: null, tareas: lista }];
}

/* --------------------------------- Columna -------------------------------- */

function column(col, tasks, { showProject, projectId, cols, modo, hoyIds, filtrando }) {
  const zona = h('div', { class: 'col-drop' });
  for (const grupo of agrupar(col, tasks, modo, hoyIds)) {
    if (grupo.etiqueta) {
      add(zona, h('div', { class: `col-group${grupo.fuerte ? ' col-group-strong' : ''}` },
        h('span', { text: grupo.etiqueta }), h('span', { class: 'col-group-n', text: String(grupo.tareas.length) })));
    }
    grupo.tareas.forEach((t) => add(zona, taskCard(t, { showProject, cols, projectId, hoyIds })));
  }
  if (!tasks.length) {
    const vacios = {
      [S.STATUS.INBOX]: 'Nada sin decidir',
      [S.STATUS.NEXT]: 'Ninguna acción lista',
      [S.STATUS.WAITING]: 'No esperas a nadie',
      [S.STATUS.SOMEDAY]: 'Nada aparcado',
      [S.STATUS.DONE]: 'Nada cerrado esta semana',
    };
    add(zona, h('div', { class: 'col-empty', text: filtrando ? 'Nada con este filtro' : (vacios[col.key] || '—') }));
  }

  const excede = col.wip > 0 && tasks.length > col.wip;
  const el = h('section', {
    class: `col col-${col.key}${excede ? ' col-over' : ''}`,
    dataset: { col: col.key },
  },
    h('header', { class: 'col-head' },
      h('span', { class: 'col-title', text: col.label }),
      h('span', {
        class: `col-count${excede ? ' over' : ''}`,
        text: col.wip > 0 ? `${tasks.length}/${col.wip}` : String(tasks.length),
      }),
      h('span', { class: 'col-hint', text: excede ? 'demasiado abierto a la vez' : col.hint })),
    zona);

  if (col.key !== S.STATUS.DONE && col.key !== S.STATUS.WAITING) {
    const nueva = h('input', {
      class: 'col-add', type: 'text', placeholder: '+ añadir aquí',
      autocomplete: 'off', dataset: { keepFocus: `col-${col.key}` },
    });
    nueva.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const valor = nueva.value.trim();
      if (!valor) return;
      e.preventDefault();
      nueva.value = '';
      const t = await S.captureSmart(valor);
      if (!t) return;
      if (projectId) await S.updateTask(t.id, { projectId });
      if (col.key !== S.STATUS.INBOX || t.status !== S.STATUS.INBOX) await S.moveTo(t.id, col.key);
    });
    add(el, nueva);
  }

  el.addEventListener('dragover', (ev) => { ev.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', (ev) => { if (!el.contains(ev.relatedTarget)) el.classList.remove('over'); });
  el.addEventListener('drop', async (ev) => {
    ev.preventDefault();
    el.classList.remove('over');
    const id = ev.dataTransfer.getData('text/plain');
    const t = id ? S.byId(id) : null;
    if (!t) return;
    const actual = t.completed ? S.STATUS.DONE : (t.status === S.STATUS.SCHEDULED ? S.STATUS.NEXT : t.status);
    if (actual === col.key && !(projectId && t.projectId !== projectId)) return;
    await llevarA(t, col.key, projectId);
  });

  return el;
}

/* ---------------------------------- Vista --------------------------------- */

export function render(params = {}) {
  const projectId = params.projectId || null;
  const contexto = params.context || null;
  const proyecto = projectId ? S.projectById(projectId) : null;
  const wrap = h('div', { class: 'wrap-board' });

  if (projectId && !proyecto) {
    add(wrap, pageHead('PROYECTO', 'No existe.'));
    return wrap;
  }

  const modo = (S.state.settings && S.state.settings.boardGroup) || 'none';
  const hoyIds = new Set(S.todayList().map((t) => t.id));
  const bruto = S.board({ projectId, context: contexto });
  const cuentas = {
    inbox: bruto[S.STATUS.INBOX].length,
    next: bruto[S.STATUS.NEXT].length,
    waiting: bruto[S.STATUS.WAITING].length,
    someday: bruto[S.STATUS.SOMEDAY].length,
    done: bruto[S.STATUS.DONE].length,
  };

  // Filtro por texto, «solo hoy» y «con fecha tope».
  const q = norm(filtro.q.trim());
  const pasa = (t) => {
    if (filtro.hoy && !hoyIds.has(t.id)) return false;
    if (filtro.tope && !t.deadline) return false;
    if (!q) return true;
    const p = S.projectById(t.projectId);
    return norm(`${t.title} ${t.notes} ${t.context || ''} ${p ? S.projectLabel(p) : ''} ${t.waitingFor || ''}`).includes(q);
  };
  const filtrando = !!(q || filtro.hoy || filtro.tope);
  const datos = {};
  for (const k of Object.keys(bruto)) datos[k] = bruto[k].filter(pasa);
  const cols = S.visibleColumns();
  const exceso = cols.some((c) => c.wip > 0 && (bruto[c.key] || []).length > c.wip);

  if (proyecto) {
    add(wrap, h('button', {
      class: 'nav-mini', style: 'margin-bottom:18px', type: 'button', text: '← PROYECTOS',
      onclick: () => { location.hash = '#/proyectos'; },
    }));
    const todas = S.projectTasks(proyecto.id, { includeDone: true }).filter((x) => !S.isNote(x));
    const abiertas = todas.filter((x) => !x.completed).length;
    const hechas = todas.length - abiertas;
    const pct = todas.length ? Math.round((hechas / todas.length) * 100) : 0;

    const carpeta = S.folderById(proyecto.folderId);
    add(wrap, h('header', { class: 'page-head' },
      h('h1', { class: 'board-name' },
        proyecto.code ? h('span', { class: 'proj-code', text: proyecto.code }) : null, proyecto.name),
      h('button', {
        class: 'board-folder', type: 'button',
        text: carpeta ? carpeta.name.toUpperCase() : 'SIN CARPETA',
        title: 'Mover a otra carpeta',
        onclick: () => openMoveToFolder(proyecto),
      }),
      proyecto.status === 'paused'
        ? h('div', { class: 'notice', style: 'margin-top:14px' },
          h('div', { class: 'notice-title', text: proyecto.pausedUntil ? `EN PAUSA HASTA EL ${fmtDate(proyecto.pausedUntil).toUpperCase()}` : 'EN PAUSA' }),
          h('div', { class: 'notice-body', text: 'Sus acciones no aparecen en HOY ni en el tablero general mientras dure la pausa.' }),
          h('div', { class: 'notice-acts' },
            h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'REANUDAR', onclick: () => S.resumeProject(proyecto.id) }),
            h('button', { class: 'btn btn-sm', type: 'button', text: 'CAMBIAR FECHA', onclick: () => openPauseSheet(proyecto) })))
        : null,
      outcomeLine(proyecto),
      h('div', { class: 'board-progress' },
        h('div', { class: 'board-progress-bar' }, h('span', { style: `width:${pct}%` })),
        h('div', { class: 'board-progress-l' },
          h('span', {}, h('b', { text: `${pct}%` }), ' completado'),
          h('span', {}, h('b', { text: String(abiertas) }), ' abiertas'),
          h('span', {}, h('b', { text: String(hechas) }), ' hechas'))),
      h('p', { class: 'page-grit', text: S.projectNext(proyecto.id) ? V.gritBoard({ ...cuentas, over: exceso }) : V.gritProjects({ stalled: 1 }) })));
  } else {
    add(wrap, pageHead('TABLERO', V.boardLine(cuentas), V.gritBoard({ ...cuentas, over: exceso })));
    add(wrap, resumen(hoyIds));
    const contextos = S.allContexts();
    if (contextos.length) {
      add(wrap, h('div', { class: 'filters' },
        h('span', { class: 'filters-l', text: 'CONTEXTO' }),
        h('button', {
          class: `chip${contexto ? '' : ' on'}`, type: 'button', text: 'TODO',
          onclick: () => { location.hash = '#/tablero'; },
        }),
        contextos.map((c) => h('button', {
          class: `chip${contexto === c ? ' on' : ''}`, type: 'button', text: c.toUpperCase(),
          onclick: () => { location.hash = `#/tablero/${encodeURIComponent(c)}`; },
        }))));
    }
  }

  /* ------------------------------- Herramientas ---------------------------- */

  const busca = h('input', {
    class: 'board-search', type: 'search', placeholder: 'Filtrar tarjetas — título, notas, proyecto, persona',
    value: filtro.q, autocomplete: 'off', dataset: { keepFocus: 'board-busca' },
  });
  busca.addEventListener('input', () => { filtro.q = busca.value; rerender(); });
  busca.addEventListener('keydown', (e) => { if (e.key === 'Escape' && busca.value) { e.stopPropagation(); filtro.q = ''; rerender(); } });

  const chip = (texto, activo, fn, titulo = null) => h('button', {
    class: `chip${activo ? ' on' : ''}`, type: 'button', text: texto, title: titulo, onclick: fn,
  });

  add(wrap, h('div', { class: 'board-tools' },
    busca,
    h('div', { class: 'board-tools-group' },
      chip('PARA HOY', filtro.hoy, () => { filtro.hoy = !filtro.hoy; rerender(); }, 'Solo lo que está en tu día'),
      chip('CON TOPE', filtro.tope, () => { filtro.tope = !filtro.tope; rerender(); }, 'Solo lo que tiene fecha tope')),
    h('div', { class: 'board-tools-group' },
      h('span', { class: 'filters-l', text: 'AGRUPAR' }),
      [['none', 'NO'], ['project', 'PROYECTO'], ['context', 'CONTEXTO']]
        .filter(([k]) => !(proyecto && k === 'project'))
        .map(([k, l]) => chip(l, modo === k, () => S.saveSettings({ boardGroup: k })))),
    h('div', { class: 'board-tools-group', style: 'margin-left:auto' },
      filtrando ? h('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: 'QUITAR FILTROS', onclick: () => { Object.assign(filtro, { q: '', hoy: false, tope: false }); rerender(); } }) : null,
      h('button', { class: 'btn btn-sm', type: 'button', text: 'COLUMNAS', onclick: openColumnEditor }),
      h('button', { class: 'btn btn-sm', type: 'button', text: 'TARJETAS', title: 'Qué enseñan las tarjetas', onclick: () => { location.hash = '#/config'; } }))));

  if (!Object.values(cuentas).some(Boolean)) {
    add(wrap, h('div', { class: 'empty', text: V.emptyBoard() }));
  }

  const board = h('div', { class: 'board' });
  for (const col of cols) {
    add(board, column(col, datos[col.key] || [], { showProject: !projectId, projectId, cols, modo, hoyIds, filtrando }));
  }
  add(wrap, board);
  add(wrap, h('div', { class: 'micro', style: 'margin-top:10px', text: 'ARRASTRA LAS TARJETAS O PULSA MOVER · ESPACIO COMPLETA · ENTER ABRE · M MUEVE' }));

  // Lo que se sabe del proyecto y no es trabajo vive aqui, no en una columna.
  if (proyecto) add(wrap, projectStrip(proyecto.id));

  if (proyecto) {
    const siguiente = S.projectNext(proyecto.id);
    add(wrap, h('div', { class: 'board-foot' },
      siguiente
        ? h('div', {},
          h('span', { class: 'proj-next-label', style: 'margin-right:10px', text: 'SIGUIENTE ACCIÓN' }),
          h('span', { text: siguiente.title }))
        : h('div', { class: 'proj-stall', text: 'Sin siguiente acción. Un proyecto sin siguiente acción es un deseo.' }),
      h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-left:auto' },
        siguiente
          ? h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'EMPEZAR', onclick: () => focus.open(siguiente.id) })
          : null,
        h('button', { class: 'btn btn-sm', type: 'button', text: 'EDITAR', onclick: () => openProjectForm(proyecto) }),
        proyecto.status === 'paused'
          ? h('button', { class: 'btn btn-sm', type: 'button', text: 'REANUDAR', onclick: () => S.resumeProject(proyecto.id) })
          : h('button', { class: 'btn btn-sm', type: 'button', text: 'PAUSAR', onclick: () => openPauseSheet(proyecto) }),
        h('button', {
          class: 'btn btn-sm', type: 'button',
          text: proyecto.status === 'done' ? 'REABRIR' : 'TERMINADO',
          onclick: () => S.updateProject(proyecto.id, { status: proyecto.status === 'done' ? 'active' : 'done' }),
        }),
        h('button', {
          class: 'btn btn-sm btn-warn', type: 'button', text: 'ELIMINAR PROYECTO',
          // Borrar un proyecto entero no puede ser un clic suelto.
          onclick: () => confirmSheet({
            title: 'Eliminar proyecto',
            body: 'Las acciones no se borran: quedan sueltas en el tablero.',
            confirmText: 'ELIMINAR',
            warn: true,
            hold: true,
            onConfirm: async () => {
              await S.removeProject(proyecto.id);
              toast('Proyecto eliminado. Sus acciones siguen vivas.');
              location.hash = '#/proyectos';
            },
          }),
        }))));
  }

  return wrap;
}

/** Una línea que dice lo que pide atención en todo el tablero. */
function resumen(hoyIds) {
  const vivas = S.active().filter(S.isActionable);
  const vencidas = S.overdueTasks().length;
  const topes = S.upcomingDeadlines(7).length;
  const sinContexto = S.nextActions().filter((t) => !t.context).length;
  const viejas = S.staleNextActions().length;
  const partes = [
    ['PARA HOY', hoyIds.size, false],
    ['VENCIDAS', vencidas, vencidas > 0],
    ['TOPE ≤ 7 DÍAS', topes, topes > 0],
    ['SIN CONTEXTO', sinContexto, false],
    ['+21 DÍAS QUIETAS', viejas, viejas >= 5],
    ['VIVAS', vivas.length, false],
  ];
  return h('div', { class: 'board-summary' }, partes.map(([l, n, mal]) => h('span', { class: mal ? 'bad' : '' },
    h('b', { text: String(n) }), ` ${l}`)));
}

/* ---------------------------- Editor de columnas -------------------------- */

/**
 * Las columnas SON los estados de GTD: no se inventan fases nuevas porque
 * entonces el sistema deja de ser GTD. Lo que si es tuyo: como se llaman,
 * en que orden van, cuales escondes y cuantas admites abiertas a la vez.
 */
export function openColumnEditor() {
  let cols = S.columns().map((c) => ({ ...c }));
  const lista = h('div', { class: 'colcfg' });

  const pintar = () => {
    lista.textContent = '';
    cols.forEach((c, i) => {
      const nombre = h('input', { class: 'input', type: 'text', value: c.label, maxlength: '24' });
      nombre.addEventListener('input', () => { c.label = nombre.value; });

      const tope = h('input', { class: 'input', type: 'number', min: '0', max: '99', value: String(c.wip || 0) });
      tope.addEventListener('input', () => { c.wip = Number(tope.value) || 0; });

      const ver = h('input', { type: 'checkbox' });
      ver.checked = !c.hidden;
      ver.addEventListener('change', () => { c.hidden = !ver.checked; });

      add(lista, h('div', { class: 'colcfg-row' },
        h('div', { class: 'colcfg-order' },
          h('button', {
            class: 'cfg-arrow', type: 'button', text: '↑', disabled: i === 0,
            onclick: () => { [cols[i - 1], cols[i]] = [cols[i], cols[i - 1]]; pintar(); },
          }),
          h('button', {
            class: 'cfg-arrow', type: 'button', text: '↓', disabled: i === cols.length - 1,
            onclick: () => { [cols[i + 1], cols[i]] = [cols[i], cols[i + 1]]; pintar(); },
          })),
        h('div', { class: 'colcfg-main' },
          nombre,
          h('div', { class: 'colcfg-sub', text: `estado: ${c.key}  ·  ${c.hint}` })),
        h('label', { class: 'colcfg-wip' }, h('span', { class: 'label', text: 'TOPE' }), tope),
        h('label', { class: 'colcfg-see' }, ver, h('span', { class: 'check-text', text: 'Ver' }))));
    });
  };
  pintar();

  const guardar = async () => {
    await S.saveColumns(cols);
    closeTop();
  };

  openSheet(sheet({
    title: 'Columnas del tablero',
    wide: true,
    body: h('div', {},
      lista,
      h('div', { class: 'micro', style: 'margin-top:16px', text: 'EL TOPE A 0 SIGNIFICA SIN LÍMITE. AL PASARTE, LA COLUMNA TE AVISA.' })),
    foot: [
      h('button', {
        class: 'btn btn-ghost', type: 'button', text: 'RESTAURAR',
        onclick: async () => { await S.resetColumns(); closeTop(); },
      }),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn btn-ghost', type: 'button', text: 'CANCELAR', onclick: closeTop }),
      h('button', { class: 'btn', type: 'button', text: 'GUARDAR', onclick: guardar }),
    ],
  }));
}
