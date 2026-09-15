/*
 * TABLERO.
 *
 * Un kanban con las columnas de GTD, no con fases inventadas. Sirve para
 * decidir de un vistazo, no para jugar a mover tarjetas: cada movimiento
 * cambia el estado real de la tarea.
 *
 * Dos usos con el mismo codigo: el tablero global (con etiqueta de proyecto
 * en cada tarjeta) y el tablero de un proyecto concreto.
 */

import { add, h, relDate, toast, fmtDate, today as todayISO } from '../util.js';
import * as S from '../store.js';
import * as V from '../voice.js';
import * as focus from '../focus.js';
import { openProjectForm, openPauseSheet, openMoveToFolder } from './projects.js';
import { projectStrip } from './notes.js';
import { pageHead, openEditor, askDelete, askOneThing, openSheet, closeTop, sheet, deadlineTag } from '../components.js';

/* --------------------------------- Tarjeta -------------------------------- */

function card(t, { showProject = false, cols = [], projectId = null } = {}) {
  const el = h('article', {
    class: [
      'card',
      t.isOneThing ? 'card-one' : '',
      t.completed ? 'card-done' : '',
      S.deadlineState(t) === 'late' || S.deadlineState(t) === 'today' ? 'card-dl' : '',
    ].filter(Boolean).join(' '),
    draggable: 'true',
    dataset: { taskId: t.id },
    tabindex: '0',
  });

  /* Completar: lo primero de la tarjeta, siempre a un clic. */
  const check = h('button', {
    class: `card-check${t.completed ? ' done' : ''}`,
    type: 'button',
    title: t.completed ? 'Reabrir' : 'Completar',
    'aria-label': t.completed ? 'Reabrir' : 'Completar',
    onclick: (e) => { e.stopPropagation(); S.toggleComplete(t.id); },
  });

  const cuerpo = h('div', { class: 'card-body' });
  if (showProject && t.projectId) {
    const p = S.projectById(t.projectId);
    if (p) add(cuerpo, h('div', { class: 'card-proj', text: S.projectLabel(p) }));
  }
  add(cuerpo, h('div', { class: 'card-title', text: t.title }));

  const tags = [];
  if (t.isOneThing) tags.push(h('span', { class: 'tag tag-star', text: 'LO ÚNICO' }));
  if (t.isCommitment && !t.isOneThing) tags.push(h('span', { class: 'tag tag-lock', text: 'NO NEGOCIAR' }));
  if (t.context) tags.push(h('span', { class: 'tag', text: t.context }));
  if (t.dueDate && !t.completed) {
    const dias = S.carriedDays(t);
    tags.push(t.isCommitment && dias > 0
      ? h('span', { class: 'tag tag-late', text: `ARRASTRAS ${dias}D` })
      : h('span', { class: S.isOverdue(t) ? 'tag tag-late' : 'tag', text: relDate(t.dueDate) }));
  }
  if (t.deadline && !t.completed) tags.push(deadlineTag(t));
  if (t.reminder && !t.completed) tags.push(h('span', { class: 'tag tag-rem', text: `AVISO ${S.reminderLabel(t)}` }));
  if (t.recurrence) tags.push(h('span', { class: 'tag tag-rep', text: `↻ ${S.recurrenceLabel(t.recurrence)}` }));
  if ((t.postponeCount || 0) >= S.postponeAlert()) {
    tags.push(h('span', { class: 'tag tag-warn', text: `POSPUESTA ×${t.postponeCount}` }));
  }
  if (t.status === S.STATUS.WAITING && t.waitingFor) {
    const w = S.waitingByTask(t.id);
    const tarde = w && w.reviewDate && w.reviewDate <= todayISO();
    tags.push(h('span', { class: tarde ? 'tag tag-late' : 'tag', text: `→ ${t.waitingFor}${w && w.reviewDate ? ` · ${relDate(w.reviewDate)}` : ''}` }));
  }
  if ((t.notes || '').trim()) tags.push(h('span', { class: 'tag tag-note', text: '≡', title: t.notes.slice(0, 200) }));
  if (tags.length) add(cuerpo, h('div', { class: 'card-tags' }, tags));

  /* Barra de vencimiento: solo aparece cuando hay fecha tope y aprieta. */
  const estado = S.deadlineState(t);
  if (estado && estado !== 'far') {
    add(cuerpo, h('div', { class: `card-dlbar card-dlbar-${estado}` }));
  }

  const acciones = h('div', { class: 'card-acts' });
  if (!t.completed) {
    add(acciones,
      h('button', {
        class: 'card-act', type: 'button', title: 'Enfocar',
        onclick: (e) => { e.stopPropagation(); focus.open(t.id); }, text: 'ENFOCAR',
      }),
      !t.isOneThing ? h('button', {
        class: 'card-act', type: 'button', title: 'Convertirla en lo único',
        onclick: (e) => { e.stopPropagation(); askOneThing(t.id); }, text: '★',
      }) : null,
      h('button', {
        class: 'card-act', type: 'button', title: 'Mover de columna',
        onclick: (e) => { e.stopPropagation(); openMove(t, cols, projectId); }, text: 'MOVER',
      }));
  }
  add(acciones,
    h('button', {
      class: 'card-act', type: 'button', title: 'Editar',
      onclick: (e) => { e.stopPropagation(); openEditor(t.id); }, text: 'EDITAR',
    }),
    h('button', {
      class: 'card-act warn', type: 'button', title: 'Eliminar',
      onclick: (e) => { e.stopPropagation(); askDelete(t.id); }, text: 'ELIMINAR',
    }));
  add(cuerpo, acciones);

  add(el, check, cuerpo);

  el.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    openEditor(t.id);
  });
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); openEditor(t.id); }
    if (e.key === ' ') { e.preventDefault(); S.toggleComplete(t.id); }
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

/** Mover sin arrastrar: se elige la columna destino, no se empuja de una en una. */
function openMove(t, cols, projectId) {
  const actual = t.status === S.STATUS.SCHEDULED ? S.STATUS.NEXT : t.status;
  openSheet(sheet({
    title: 'Mover a',
    body: h('div', {},
      h('div', { class: 'hard-line', text: t.title }),
      h('div', { style: 'display:flex;flex-direction:column;gap:6px;margin-top:18px' },
        cols.map((c) => h('button', {
          class: `btn btn-block${c.key === actual ? ' btn-primary' : ''}`,
          type: 'button',
          style: 'justify-content:flex-start;padding:11px 14px',
          onclick: async () => {
            closeTop();
            if (projectId && t.projectId !== projectId) await S.updateTask(t.id, { projectId });
            await S.moveTo(t.id, c.key);
          },
        },
          h('span', { text: c.label }),
          h('span', { class: 'micro', style: 'margin-left:auto;text-transform:none', text: c.hint }))))),
  }));
}

/* --------------------------------- Columna -------------------------------- */

function column(col, tasks, { showProject, projectId, cols }) {
  const zona = h('div', { class: 'col-drop' });
  tasks.forEach((t) => add(zona, card(t, { showProject, cols, projectId })));
  if (!tasks.length) {
    const vacios = {
      [S.STATUS.INBOX]: 'Nada sin decidir',
      [S.STATUS.NEXT]: 'Ninguna acción lista',
      [S.STATUS.WAITING]: 'No esperas a nadie',
      [S.STATUS.SOMEDAY]: 'Nada aparcado',
      [S.STATUS.DONE]: 'Nada cerrado aún',
    };
    add(zona, h('div', { class: 'col-empty', text: vacios[col.key] || '—' }));
  }

  const excede = col.wip > 0 && tasks.length > col.wip;
  const el = h('section', {
    class: `col${excede ? ' col-over' : ''}`,
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

  if (col.key !== S.STATUS.DONE) {
    const nueva = h('input', {
      class: 'col-add', type: 'text', placeholder: '+ añadir',
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
      const patch = projectId ? { projectId } : {};
      await S.updateTask(t.id, patch);
      if (col.key !== S.STATUS.INBOX || t.status !== S.STATUS.INBOX) await S.moveTo(t.id, col.key);
    });
    add(el, nueva);
  }

  el.addEventListener('dragover', (ev) => { ev.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', async (ev) => {
    ev.preventDefault();
    el.classList.remove('over');
    const id = ev.dataTransfer.getData('text/plain');
    if (!id) return;
    const t = S.byId(id);
    if (!t) return;
    if (projectId && t.projectId !== projectId) await S.updateTask(id, { projectId });
    await S.moveTo(id, col.key);
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

  const datos = S.board({ projectId, context: contexto });
  const cuentas = {
    inbox: datos[S.STATUS.INBOX].length,
    next: datos[S.STATUS.NEXT].length,
    waiting: datos[S.STATUS.WAITING].length,
    someday: datos[S.STATUS.SOMEDAY].length,
    done: datos[S.STATUS.DONE].length,
  };

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
          h('span', {}, h('b', { text: String(hechas) }), ' hechas')))));
  } else {
    add(wrap, pageHead('TABLERO', V.boardLine(cuentas)));
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
    const activos = S.activeProjects();
    if (activos.length) {
      add(wrap, h('div', { class: 'filters' },
        h('span', { class: 'filters-l', text: 'PROYECTO' }),
        activos.map((pr) => h('button', {
          class: 'chip', type: 'button', text: S.projectLabel(pr).toUpperCase(),
          onclick: () => { location.hash = `#/proyectos/${pr.id}`; },
        }))));
    }
  }

  add(wrap, h('div', { class: 'board-tools' },
    h('button', { class: 'btn btn-sm', type: 'button', text: 'COLUMNAS', onclick: openColumnEditor }),
    h('span', { class: 'micro', text: 'ARRASTRA LAS TARJETAS, O PULSA MOVER' })));

  if (!Object.values(cuentas).some(Boolean)) {
    add(wrap, h('div', { class: 'empty', text: V.emptyBoard() }));
  }

  const board = h('div', { class: 'board' });
  const cols = S.visibleColumns();
  for (const col of cols) {
    add(board, column(col, datos[col.key] || [], { showProject: !projectId, projectId, cols }));
  }
  add(wrap, board);

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
          class: 'btn btn-sm', type: 'button', text: 'ELIMINAR PROYECTO',
          onclick: async () => {
            await S.removeProject(proyecto.id);
            toast('Proyecto eliminado. Sus acciones siguen vivas.');
            location.hash = '#/proyectos';
          },
        }))));
  }

  return wrap;
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
