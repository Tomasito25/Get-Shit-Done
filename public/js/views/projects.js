/*
 * PROYECTOS.
 *
 * Un proyecto es un resultado que exige varias acciones. Nada más.
 * Cada uno tiene un código —P01, P02…— que va siempre delante del nombre,
 * para citarlo en la captura (#P04) y encontrarlo sin pensar.
 *
 * Las carpetas agrupan proyectos por área: ESTUDIOS, CLUB, CASA. No son una
 * fase ni un estado; sirven para que veinte proyectos no sean una lista donde
 * no se ve nada. Un proyecto vive en una carpeta o en ninguna, nunca en dos.
 */

import { add, h, toast, plural, today, addDays, fmtDate, relDate, iso, parseISO } from '../util.js';
import * as S from '../store.js';
import * as V from '../voice.js';
import { pageHead, openSheet, closeTop, sheet, confirmSheet } from '../components.js';

/* --------------------------------- Galería -------------------------------- */

export function list() {
  const wrap = h('div', { class: 'wrap-wide' });
  const proyectos = S.activeProjects();
  const pausados = S.pausedProjects();
  const parados = S.stalledProjects();
  const carpetas = S.folders();

  add(wrap, pageHead('PROYECTOS', V.projectsLine(proyectos.length, parados.length),
    V.gritProjects({ stalled: parados.length, paused: pausados.length, total: proyectos.length })));

  add(wrap, h('div', { class: 'proj-tools' },
    h('button', { class: 'btn btn-sm', type: 'button', text: '+ CARPETA', onclick: () => nuevaCarpeta() }),
    carpetas.length
      ? h('span', { class: 'micro', text: `${carpetas.length} ${carpetas.length === 1 ? 'CARPETA' : 'CARPETAS'} · PULSA EL TÍTULO PARA PLEGARLA` })
      : h('span', { class: 'micro', text: 'AGRUPA LOS PROYECTOS POR ÁREA CUANDO EMPIECEN A NO CABER' })));

  // La tarjeta de creación va siempre arriba: crear no debe costar buscar.
  add(wrap, h('div', { class: 'gallery' }, tarjetaNueva()));

  if (!carpetas.length) {
    add(wrap, h('div', { class: 'gallery' }, ordenar(proyectos).map(tarjeta)));
  } else {
    for (const grupo of S.folderGroups({ status: 'active' })) {
      if (!grupo.folder && !grupo.projects.length) continue;
      add(wrap, bloqueCarpeta(grupo));
    }
  }

  if (pausados.length) add(wrap, seccionPausados(pausados));

  const terminados = S.state.projects.filter((p) => p.status === 'done');
  if (terminados.length) add(wrap, seccionTerminados(terminados));

  return wrap;
}

/** Primero lo que no avanza, luego lo que no sabe cómo termina, luego código. */
function ordenar(proyectos) {
  const numero = (p) => Number((p.code || 'P0').slice(1));
  return [...proyectos].sort((a, b) => {
    const pa = S.projectNext(a.id) ? 1 : 0;
    const pb = S.projectNext(b.id) ? 1 : 0;
    if (pa !== pb) return pa - pb;
    if (!a.outcome !== !b.outcome) return a.outcome ? 1 : -1;
    return numero(a) - numero(b);
  });
}

/* -------------------------------- Carpetas -------------------------------- */

function bloqueCarpeta({ folder, projects }) {
  const id = folder ? folder.id : null;
  const st = S.folderStats(id);
  const plegada = folder ? S.isFolderCollapsed(folder.id) : false;

  const cabecera = h('div', { class: `folder-head${st.stalled ? ' folder-warn' : ''}` },
    h('button', {
      class: 'folder-name', type: 'button',
      title: plegada ? 'Desplegar' : 'Plegar',
      onclick: () => (folder ? S.toggleFolderCollapsed(folder.id) : null),
    },
      folder ? h('span', { class: 'folder-arrow', text: plegada ? '+' : '−' }) : null,
      h('span', { text: folder ? folder.name.toUpperCase() : 'SIN CARPETA' })),
    h('div', { class: 'folder-stats' },
      h('span', {}, h('b', { text: String(st.projects) }), st.projects === 1 ? ' proyecto' : ' proyectos'),
      h('span', {}, h('b', { text: String(st.open) }), st.open === 1 ? ' abierta' : ' abiertas'),
      st.paused ? h('span', {}, h('b', { text: String(st.paused) }), ' en pausa') : null,
      st.stalled ? h('span', { class: 'folder-alert' }, h('b', { text: String(st.stalled) }), ' sin siguiente acción') : null,
      st.nextDeadline
        ? h('span', { class: `gal-dl gal-dl-${S.deadlineState(st.nextDeadline)}`, text: topeTexto(st.nextDeadline) })
        : null),
    folder
      ? h('div', { class: 'folder-acts' },
        h('button', { class: 'card-act', type: 'button', text: 'CARPETA', onclick: () => openFolderSheet(folder) }))
      : null);

  const caja = h('section', { class: 'folder' }, cabecera);
  if (!plegada) {
    add(caja, h('div', { class: 'folder-bar' }, h('span', { style: `width:${st.pct}%` })));
    add(caja, projects.length
      ? h('div', { class: 'gallery' }, ordenar(projects).map(tarjeta))
      : h('div', { class: 'empty', text: folder ? 'Carpeta vacía. Mueve aquí un proyecto desde su tarjeta.' : 'Todos los proyectos están en una carpeta.' }));
  }
  return caja;
}

function nuevaCarpeta() {
  const campo = h('input', { class: 'input', type: 'text', placeholder: 'ESTUDIOS', 'data-autofocus': '' });
  const crear = async () => {
    const f = await S.createFolder(campo.value);
    closeTop();
    if (f) toast(`Carpeta ${f.name} creada.`);
  };
  const body = h('div', {},
    h('div', { class: 'field' }, h('label', { class: 'label', text: 'Nombre de la carpeta' }), campo),
    h('div', { class: 'check-note', text: 'Un área de responsabilidad: ESTUDIOS, CLUB, CASA. No es un proyecto ni una etiqueta de estado.' }));
  body.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); crear(); } });
  openSheet(sheet({
    title: 'Nueva carpeta',
    body,
    foot: [h('button', { class: 'btn btn-ghost', type: 'button', text: 'CANCELAR', onclick: closeTop }),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', text: 'CREAR', onclick: crear })],
  }));
}

/** Todo lo que se hace con una carpeta, en un sitio. */
export function openFolderSheet(f) {
  const st = S.folderStats(f.id);
  // Para borrar cuenta todo lo que hay dentro, tambien lo pausado y lo terminado.
  const dentro = S.state.projects.filter((p) => p.folderId === f.id).length;
  const nombre = h('input', { class: 'input', type: 'text', value: f.name, 'data-autofocus': '' });
  const guardarNombre = async () => {
    if (!nombre.value.trim() || nombre.value.trim() === f.name) return;
    await S.renameFolder(f.id, nombre.value);
    toast('Carpeta renombrada.');
  };
  nombre.addEventListener('blur', guardarNombre);
  nombre.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardarNombre().then(closeTop); } });

  const orden = S.folders().findIndex((x) => x.id === f.id);

  const body = h('div', {},
    h('div', { class: 'field' }, h('label', { class: 'label', text: 'Nombre' }), nombre),
    h('div', { class: 'micro', style: 'margin-bottom:18px' },
      `${plural(st.projects, 'PROYECTO', 'PROYECTOS')} · ${plural(st.open, 'ACCIÓN ABIERTA', 'ACCIONES ABIERTAS')}${st.paused ? ` · ${st.paused} EN PAUSA` : ''}${st.stalled ? ` · ${st.stalled} SIN SIGUIENTE ACCIÓN` : ''}`),
    h('div', { class: 'label', text: 'Orden en la galería' }),
    h('div', { style: 'display:flex;gap:6px;margin-bottom:20px' },
      h('button', {
        class: 'btn btn-sm', type: 'button', text: '↑ SUBIR', disabled: orden <= 0,
        onclick: async () => { await S.moveFolder(f.id, -1); closeTop(); },
      }),
      h('button', {
        class: 'btn btn-sm', type: 'button', text: '↓ BAJAR', disabled: orden < 0 || orden >= S.folders().length - 1,
        onclick: async () => { await S.moveFolder(f.id, 1); closeTop(); },
      })),
    h('div', { class: 'label', text: 'El área entera' }),
    h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
      h('button', {
        class: 'btn btn-sm', type: 'button', text: 'PAUSAR TODOS',
        onclick: () => {
          closeTop();
          confirmSheet({
            title: `Pausar ${f.name}`,
            body: `${plural(st.projects, 'proyecto activo sale', 'proyectos activos salen')} de HOY y del tablero general. Nada se borra y vuelve entero.`,
            confirmText: 'PAUSAR EL ÁREA',
            onConfirm: async () => {
              const n = await S.pauseFolder(f.id, null);
              toast(`${n} ${n === 1 ? 'proyecto en pausa' : 'proyectos en pausa'}.`);
            },
          });
        },
      }),
      st.paused
        ? h('button', {
          class: 'btn btn-sm', type: 'button', text: 'REANUDAR TODOS',
          onclick: async () => { const n = await S.resumeFolder(f.id); closeTop(); toast(`${n} de vuelta.`); },
        })
        : null),
    h('div', { class: 'micro', style: 'margin-top:20px', text: 'PLEGAR UNA CARPETA NO PAUSA NADA: SUS ACCIONES SIGUEN EN HOY Y EN EL TABLERO.' }));

  openSheet(sheet({
    title: `Carpeta · ${f.name}`,
    body,
    foot: [
      h('button', {
        class: 'btn btn-ghost btn-warn', type: 'button', text: 'ELIMINAR CARPETA',
        onclick: () => {
          closeTop();
          confirmSheet({
            title: 'Eliminar la carpeta',
            body: dentro
              ? `${plural(dentro, 'proyecto no se borra', 'proyectos no se borran')}: se ${dentro === 1 ? 'queda' : 'quedan'} sin carpeta.`
              : 'La carpeta está vacía.',
            confirmText: 'ELIMINAR',
            warn: true,
            onConfirm: async () => {
              const n = await S.removeFolder(f.id);
              toast(n ? `${n} proyectos sin carpeta.` : 'Carpeta eliminada.');
            },
          });
        },
      }),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', text: 'CERRAR', onclick: async () => { await guardarNombre(); closeTop(); } }),
    ],
  }), { onClose: guardarNombre });
}

/** Elegir carpeta para un proyecto, o crear una nueva sin salir de aquí. */
export function openMoveToFolder(p) {
  const actual = p.folderId || null;
  const opcion = (id, etiqueta, nota) => h('button', {
    class: `btn btn-block${actual === id ? ' btn-primary' : ''}`,
    type: 'button',
    style: 'justify-content:flex-start;padding:11px 14px',
    onclick: async () => { await S.setProjectFolder(p.id, id); closeTop(); toast(id ? `${S.projectLabel(p)} → ${S.folderById(id).name}` : 'Fuera de carpeta.'); },
  },
    h('span', { text: etiqueta }),
    nota ? h('span', { class: 'micro', style: 'margin-left:auto;text-transform:none', text: nota }) : null);

  openSheet(sheet({
    title: 'Mover a carpeta',
    body: h('div', {},
      h('div', { class: 'hard-line' }, h('span', { class: 'proj-code', text: p.code || '—' }), p.name),
      h('div', { style: 'display:flex;flex-direction:column;gap:6px;margin-top:18px' },
        S.folders().map((f) => {
          const st = S.folderStats(f.id);
          return opcion(f.id, f.name, `${st.projects} proyectos`);
        }),
        opcion(null, 'Sin carpeta', null)),
      h('div', { style: 'margin-top:16px' },
        h('button', { class: 'btn btn-sm', type: 'button', text: '+ NUEVA CARPETA', onclick: () => { closeTop(); nuevaCarpeta(); } }))),
  }));
}

/* ------------------------------ Tarjeta nueva ----------------------------- */

/**
 * Crear un proyecto es escribir su nombre en la galería. El código lo pone la
 * aplicación; el resultado conviene escribirlo ya, porque luego no se escribe.
 */
function tarjetaNueva() {
  const codigo = S.nextProjectCode();
  const nombre = h('input', {
    class: 'gal-new-name', type: 'text', placeholder: 'Nombre del proyecto',
    autocomplete: 'off', dataset: { keepFocus: 'gal-new-name' },
  });
  const resultado = h('textarea', {
    class: 'gal-new-out', rows: '2',
    placeholder: '¿Cuál es el resultado? Escríbelo como si ya estuviera hecho.',
    dataset: { keepFocus: 'gal-new-out' },
  });
  const carpetas = S.folders();
  const carpeta = carpetas.length
    ? h('select', { class: 'select', style: 'margin-top:10px', dataset: { keepFocus: 'gal-new-folder' } },
      h('option', { value: '', text: '— sin carpeta —' }),
      carpetas.map((f) => h('option', { value: f.id, text: f.name })))
    : null;

  const crear = async () => {
    const n = nombre.value.trim();
    if (!n) { nombre.focus(); return; }
    const out = resultado.value.trim();
    const destino = carpeta ? carpeta.value || null : null;
    document.activeElement && document.activeElement.blur();
    const p = await S.createProject({ name: n, outcome: out });
    if (!p) return;
    if (destino) await S.setProjectFolder(p.id, destino);
    toast(`${S.projectLabel(p)} creado.${out ? '' : ' Falta su resultado.'}`);
    requestAnimationFrame(() => {
      const campo = document.querySelector('[data-keep-focus="gal-new-name"]');
      if (campo) campo.focus();
    });
  };

  nombre.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) crear();
    else resultado.focus();
  });
  resultado.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); crear(); }
  });

  return h('article', { class: 'gal gal-new' },
    h('div', { class: 'gal-head' },
      h('span', { class: 'proj-code', text: codigo }),
      h('span', { class: 'gal-new-l', text: 'NUEVO PROYECTO' })),
    nombre,
    resultado,
    carpeta,
    h('div', { class: 'gal-new-foot' },
      h('span', { class: 'micro', text: 'ENTER EN EL NOMBRE PASA AL RESULTADO · ENTER AHÍ CREA' }),
      h('button', { class: 'btn btn-sm', type: 'button', text: 'CREAR', onclick: crear })));
}

/* --------------------------------- Tarjeta -------------------------------- */

function tarjeta(p) {
  const todas = S.projectTasks(p.id, { includeDone: true });
  const abiertas = todas.filter((t) => !t.completed && !S.isNote(t));
  const notas = todas.filter((t) => !t.completed && S.isNote(t)).length;
  const hechas = todas.filter((t) => t.completed).length;
  const total = abiertas.length + hechas;
  const pct = total ? Math.round((hechas / total) * 100) : 0;
  const siguiente = S.projectNext(p.id);
  const esperando = abiertas.filter((t) => t.status === S.STATUS.WAITING).length;
  const arrastradas = abiertas.filter((t) => t.isCommitment && S.isOverdue(t)).length;
  const tope = abiertas.filter((t) => t.deadline).sort((a, b) => a.deadline.localeCompare(b.deadline))[0] || null;
  const abrir = () => { location.hash = `#/proyectos/${p.id}`; };

  // Añadir la siguiente acción sin entrar: lo que desatasca un proyecto parado.
  const campo = h('input', {
    class: 'gal-add', type: 'text',
    placeholder: siguiente ? '+ otra acción' : '+ define la siguiente acción',
    autocomplete: 'off', dataset: { keepFocus: `gal-add-${p.id}` },
  });
  campo.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const valor = campo.value.trim();
    if (!valor) return;
    e.preventDefault();
    campo.value = '';
    const nueva = await S.captureSmart(valor);
    if (!nueva) return;
    await S.updateTask(nueva.id, { projectId: p.id });
    await S.makeNext(nueva.id);
  });

  return h('article', { class: `gal${siguiente ? '' : ' gal-stall'}${p.outcome ? '' : ' gal-noout'}` },
    h('div', { class: 'gal-head' },
      h('button', { class: 'gal-name', type: 'button', onclick: abrir, title: 'Abrir el tablero' },
        h('span', { class: 'proj-code', text: p.code || '—' }), p.name),
      h('span', { class: 'gal-pct', text: `${pct}%` })),
    p.outcome
      ? h('div', { class: 'gal-outcome', text: p.outcome })
      : h('button', {
        class: 'gal-outcome gal-outcome-missing', type: 'button',
        text: 'Sin resultado definido — pulsa para escribirlo',
        onclick: () => openProjectForm(p),
      }),
    h('div', { class: 'gal-bar' }, h('span', { style: `width:${pct}%` })),
    siguiente
      ? h('button', { class: 'gal-next', type: 'button', onclick: abrir },
        h('span', { class: 'proj-next-label', text: 'SIGUE' }),
        h('span', { class: 'gal-next-t', text: siguiente.title }))
      : h('div', { class: 'gal-next gal-warn', text: 'SIN SIGUIENTE ACCIÓN' }),
    h('div', { class: 'gal-foot' },
      h('span', { text: `${abiertas.length} abiertas` }),
      hechas ? h('span', { text: `${hechas} hechas` }) : null,
      esperando ? h('span', { text: `${esperando} en espera` }) : null,
      notas ? h('span', { text: `${notas} ≡` }) : null,
      arrastradas ? h('span', { class: 'gal-alert', text: `${arrastradas} arrastradas` }) : null,
      tope ? h('span', { class: `gal-dl gal-dl-${S.deadlineState(tope)}`, text: topeTexto(tope) }) : null),
    campo,
    h('div', { class: 'gal-acts' },
      h('button', { class: 'card-act', type: 'button', text: 'ABRIR', onclick: abrir }),
      h('button', { class: 'card-act', type: 'button', text: 'EDITAR', onclick: () => openProjectForm(p) }),
      h('button', { class: 'card-act', type: 'button', text: 'CARPETA', onclick: () => openMoveToFolder(p) }),
      h('button', { class: 'card-act', type: 'button', text: 'PAUSAR', onclick: () => openPauseSheet(p) }),
      h('button', {
        class: 'card-act', type: 'button', text: 'TERMINADO',
        onclick: () => S.updateProject(p.id, { status: 'done' }),
      })));
}

function topeTexto(t) {
  const d = S.deadlineDays(t);
  if (d < 0) return `TOPE VENCIDO ${-d}D`;
  if (d === 0) return 'TOPE HOY';
  return `TOPE ${d}D`;
}

/* --------------------------------- Pausa ---------------------------------- */

function seccionPausados(pausados) {
  const filas = pausados.map((p) => {
    const abiertas = S.projectTasks(p.id).length;
    const carpeta = S.folderById(p.folderId);
    return h('div', { class: 'row' },
      h('div', { class: 'row-body' },
        h('button', {
          class: 'row-title', type: 'button', style: 'text-align:left',
          onclick: () => { location.hash = `#/proyectos/${p.id}`; },
        }, h('span', { class: 'proj-code', text: p.code || '—' }), p.name),
        h('div', { class: 'row-sub' },
          h('span', { class: 'tag', text: p.pausedUntil ? `VUELVE ${relDate(p.pausedUntil)}` : 'SIN FECHA DE VUELTA' }),
          carpeta ? h('span', { text: carpeta.name }) : null,
          h('span', { text: `${abiertas} ${abiertas === 1 ? 'acción parada' : 'acciones paradas'}` }))),
      h('div', { class: 'row-acts', style: 'opacity:1' },
        h('button', { class: 'row-act', type: 'button', text: 'CAMBIAR FECHA', onclick: () => openPauseSheet(p) }),
        h('button', {
          class: 'row-act', type: 'button', text: 'REANUDAR',
          onclick: async () => { await S.resumeProject(p.id); toast(`${S.projectLabel(p)} vuelve a estar activo.`); },
        })));
  });

  return h('section', { class: 'sec' },
    h('div', { class: 'sec-head' },
      h('div', { class: 'sec-title', text: 'EN PAUSA' }),
      h('div', { class: 'sec-meta', text: String(pausados.length) })),
    h('div', { class: 'rows' }, filas),
    h('div', { class: 'micro', style: 'margin-top:12px', text: 'PAUSADO NO ES OLVIDADO. SIN FECHA DE VUELTA, DECÍDELO EN CADA REVISIÓN SEMANAL.' }));
}

/**
 * Pausar es decidirlo. Dejar un proyecto parado sin decir nada no lo es.
 * Sus acciones salen de HOY y del tablero general hasta que vuelva.
 */
export function openPauseSheet(p) {
  const abiertas = S.projectTasks(p.id);
  const unico = abiertas.find((t) => t.isOneThing);
  const compromisos = abiertas.filter((t) => t.isCommitment && !t.isOneThing && S.isDue(t)).length;

  const enUnMes = () => { const d = parseISO(today()); d.setMonth(d.getMonth() + 1); return iso(d); };
  const fecha = h('input', { class: 'input', type: 'date', value: p.pausedUntil || addDays(today(), 14) });

  const pausar = async (hasta) => {
    await S.pauseProject(p.id, hasta);
    closeTop();
    toast(hasta ? `${S.projectLabel(p)} en pausa hasta el ${fmtDate(hasta)}.` : `${S.projectLabel(p)} en pausa.`);
  };

  const aviso = [];
  if (unico) aviso.push('contiene LO ÚNICO de hoy');
  if (compromisos) aviso.push(`tiene ${compromisos} ${compromisos === 1 ? 'compromiso' : 'compromisos'} para hoy`);

  openSheet(sheet({
    title: p.status === 'paused' ? 'Cambiar la pausa' : 'Pausar proyecto',
    body: h('div', {},
      h('div', { class: 'hard-line' }, h('span', { class: 'proj-code', text: p.code || '—' }), p.name),
      h('div', { class: 'notice-body', style: 'margin-top:12px', text: `Sus ${abiertas.length} acciones abiertas saldrán de HOY y del tablero general. Nada se borra y vuelve entero.` }),
      aviso.length
        ? h('div', { class: 'notice notice-warn', style: 'margin-top:14px' },
          h('div', { class: 'notice-body', text: `Ojo: ${aviso.join(' y ')}. Saldrá de tu día mientras esté en pausa.` }))
        : null,
      h('div', { class: 'label', style: 'margin-top:18px', text: 'Vuelve solo' }),
      h('div', { class: 'pause-opts' },
        h('button', { class: 'btn btn-sm', type: 'button', text: 'EN 1 SEMANA', onclick: () => pausar(addDays(today(), 7)) }),
        h('button', { class: 'btn btn-sm', type: 'button', text: 'EN 2 SEMANAS', onclick: () => pausar(addDays(today(), 14)) }),
        h('button', { class: 'btn btn-sm', type: 'button', text: 'EN 1 MES', onclick: () => pausar(enUnMes()) })),
      h('div', { class: 'field', style: 'margin-top:16px' },
        h('label', { class: 'label', text: 'O una fecha concreta' }),
        h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
          h('div', { style: 'flex:1;min-width:160px' }, fecha),
          h('button', { class: 'btn', type: 'button', text: 'PAUSAR HASTA ESA FECHA', onclick: () => { if (fecha.value) pausar(fecha.value); } }))),
      h('div', { class: 'micro', style: 'margin-top:14px', text: 'PAUSAR ES DECIDIRLO. DEJARLO PARADO SIN DECIR NADA NO LO ES.' })),
    foot: [
      h('button', { class: 'btn btn-ghost', type: 'button', text: 'CANCELAR', onclick: closeTop }),
      h('div', { class: 'spacer' }),
      h('button', { class: 'btn', type: 'button', text: 'PAUSAR SIN FECHA', onclick: () => pausar(null) }),
    ],
  }));
}

/* ------------------------------- Terminados ------------------------------- */

function seccionTerminados(terminados) {
  const filas = terminados.map((p) => h('div', { class: 'row' },
    h('div', { class: 'row-body' },
      h('div', { class: 'row-title', style: 'color:var(--faint)' },
        h('span', { class: 'proj-code', text: p.code || '—' }), p.name)),
    h('div', { class: 'row-acts' },
      h('button', {
        class: 'row-act', type: 'button', text: 'REABRIR',
        onclick: () => S.updateProject(p.id, { status: 'active' }),
      }),
      h('button', {
        class: 'row-act warn', type: 'button', text: 'ELIMINAR',
        onclick: () => confirmSheet({
          title: 'Eliminar proyecto',
          body: 'Las acciones no se borran: quedan sueltas en el tablero.',
          confirmText: 'ELIMINAR',
          warn: true,
          onConfirm: () => S.removeProject(p.id),
        }),
      }))));

  return h('section', { class: 'sec' },
    h('div', { class: 'sec-head' },
      h('div', { class: 'sec-title', text: 'TERMINADOS' }),
      h('div', { class: 'sec-meta', text: String(terminados.length) })),
    h('div', { class: 'rows' }, filas));
}

/* ------------------------------- Formulario ------------------------------- */

export function openProjectForm(existing = null) {
  const codigo = existing ? existing.code : S.nextProjectCode();
  const name = h('input', {
    class: 'input', type: 'text', value: existing ? existing.name : '',
    placeholder: 'Terminar EI de Física', 'data-autofocus': '',
  });
  const outcome = h('textarea', {
    class: 'textarea', placeholder: 'EI terminada, revisada y entregada',
    style: 'min-height:88px',
  });
  outcome.value = existing ? existing.outcome : '';

  const carpeta = h('select', { class: 'select' },
    h('option', { value: '', text: '— sin carpeta —' }),
    S.folders().map((f) => h('option', { value: f.id, text: f.name, selected: existing && existing.folderId === f.id })),
    h('option', { value: '__new', text: '+ nueva carpeta…' }));

  const avisoGuardado = h('span', { class: 'saved' });
  let avisoTimer = null;
  const marcar = () => {
    avisoGuardado.textContent = 'GUARDADO';
    avisoGuardado.classList.add('on');
    clearTimeout(avisoTimer);
    avisoTimer = setTimeout(() => avisoGuardado.classList.remove('on'), 1400);
  };

  /** Quita un «P04-» escrito a mano si coincide con su propio código. */
  const nombreLimpio = () => {
    const v = name.value.trim();
    if (!codigo) return v;
    return v.replace(new RegExp(`^${codigo}\\s*[-–—_:.]\\s*`, 'i'), '').trim() || v;
  };

  carpeta.addEventListener('change', async () => {
    if (carpeta.value === '__new') {
      const nombre = prompt('Nombre de la carpeta (ej. ESTUDIOS)');
      const f = nombre ? await S.createFolder(nombre) : null;
      carpeta.textContent = '';
      add(carpeta,
        h('option', { value: '', text: '— sin carpeta —' }),
        S.folders().map((x) => h('option', { value: x.id, text: x.name })),
        h('option', { value: '__new', text: '+ nueva carpeta…' }));
      carpeta.value = f ? f.id : '';
    }
    if (existing) { await S.setProjectFolder(existing.id, carpeta.value || null); marcar(); }
  });

  /* Editar guarda solo; crear necesita un acto explícito. */
  const autoguardar = () => {
    if (!existing || !name.value.trim()) return;
    const cambios = { name: nombreLimpio(), outcome: outcome.value.trim() };
    const actual = S.projectById(existing.id);
    if (actual && actual.name === cambios.name && actual.outcome === cambios.outcome) return;
    S.updateProject(existing.id, cambios).then(marcar);
  };
  if (existing) {
    let timer = null;
    const alEscribir = () => { clearTimeout(timer); timer = setTimeout(autoguardar, 500); };
    name.addEventListener('input', alEscribir);
    outcome.addEventListener('input', alEscribir);
    name.addEventListener('blur', () => { clearTimeout(timer); autoguardar(); });
    outcome.addEventListener('blur', () => { clearTimeout(timer); autoguardar(); });
  }

  const save = async () => {
    if (!name.value.trim()) { name.focus(); return; }
    if (existing) { autoguardar(); closeTop(); return; }
    const p = await S.createProject({ name: name.value.trim(), outcome: outcome.value.trim() });
    if (p && carpeta.value && carpeta.value !== '__new') await S.setProjectFolder(p.id, carpeta.value);
    closeTop();
    if (p) location.hash = `#/proyectos/${p.id}`;
  };

  const body = h('div', {},
    h('div', { class: 'field' },
      h('label', { class: 'label', text: 'Nombre' }),
      h('div', { class: 'name-with-code' }, h('span', { class: 'proj-code', text: codigo || '—' }), name),
      h('div', { class: 'check-note', style: 'margin-top:6px', text: 'El código lo asigna la aplicación y no cambia. Se cita al capturar como #' + (codigo || 'P01') + '.' })),
    h('div', { class: 'field' },
      h('label', { class: 'label', text: '¿Cuál es el resultado?' }),
      outcome,
      h('div', { class: 'check-note', style: 'margin-top:6px', text: 'Escríbelo como si ya estuviera hecho. Si no sabes cómo termina, no es un proyecto: es una idea.' })),
    h('div', { class: 'field' },
      h('label', { class: 'label', text: 'Carpeta' }),
      carpeta,
      h('div', { class: 'check-note', style: 'margin-top:6px', text: 'El área a la que pertenece. Sirve para ordenar la galería, no cambia nada del trabajo.' })));

  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); outcome.focus(); } });
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); }
  });

  const pie = [
    existing
      ? h('button', {
        class: 'btn btn-ghost btn-warn', type: 'button', text: 'ELIMINAR',
        onclick: () => {
          closeTop();
          confirmSheet({
            title: 'Eliminar proyecto',
            body: 'Las acciones no se borran: quedan sueltas en el tablero.',
            confirmText: 'ELIMINAR',
            warn: true,
            hold: true,
            onConfirm: async () => {
              await S.removeProject(existing.id);
              toast('Proyecto eliminado. Sus acciones siguen vivas.');
              if (location.hash.includes(existing.id)) location.hash = '#/proyectos';
            },
          });
        },
      })
      : null,
    existing ? h('span', { class: 'micro', text: 'SE GUARDA SOLO' }) : null,
    avisoGuardado,
    h('div', { class: 'spacer' }),
    existing
      ? h('button', { class: 'btn', type: 'button', text: 'CERRAR', onclick: save })
      : h('button', { class: 'btn btn-ghost', type: 'button', text: 'CANCELAR', onclick: closeTop }),
    existing ? null : h('button', { class: 'btn', type: 'button', text: 'CREAR', onclick: save }),
  ];

  openSheet(sheet({ title: existing ? `Editar proyecto · ${codigo}` : `Nuevo proyecto · ${codigo}`, body, foot: pie }),
    { onClose: autoguardar });
}
