/*
 * ANOTACIONES.
 *
 * El material de referencia de GTD: informacion que no se hace, se consulta.
 * Aqui no hay fechas, ni casillas, ni prioridad. Se escribe y se archiva.
 *
 * Que esto exista es lo que permite que la bandeja se vacie de verdad: lo que
 * no es una accion tiene un sitio al que ir que no es «ya lo miro».
 */

import { add, h, toast } from '../util.js';
import * as S from '../store.js';
import * as V from '../voice.js';
import { pageHead, noteGrid, noteBar, confirmSheet } from '../components.js';

/** Filtro vivo de la pantalla. No se guarda: es una lupa, no un ajuste. */
let filtro = { proyecto: undefined, soloFijadas: false, q: '' };

const rerender = () => dispatchEvent(new CustomEvent('gsd:rerender'));

export function render() {
  const wrap = h('div', { class: 'wrap-wide' });
  const todas = S.noteList();
  const fijadas = todas.filter((t) => t.pinned).length;

  add(wrap, pageHead('ANOTACIONES', V.notesLine(todas.length, fijadas)));
  add(wrap, noteBar({ projectId: filtro.proyecto || null }));

  /* -------------------------------- Filtros ------------------------------- */

  const conProyecto = new Map();
  for (const t of todas) {
    if (!t.projectId) continue;
    conProyecto.set(t.projectId, (conProyecto.get(t.projectId) || 0) + 1);
  }
  const sueltas = todas.filter((t) => !t.projectId).length;

  const chip = (texto, activo, alPulsar) => h('button', {
    class: `chip${activo ? ' on' : ''}`, type: 'button', text: texto,
    onclick: () => { alPulsar(); rerender(); },
  });

  add(wrap, h('div', { class: 'filters' },
    h('span', { class: 'filters-l', text: 'ARCHIVO' }),
    chip('TODAS', filtro.proyecto === undefined && !filtro.soloFijadas, () => { filtro.proyecto = undefined; filtro.soloFijadas = false; }),
    fijadas ? chip(`FIJADAS ${fijadas}`, filtro.soloFijadas, () => { filtro.soloFijadas = !filtro.soloFijadas; }) : null,
    sueltas ? chip(`SIN PROYECTO ${sueltas}`, filtro.proyecto === null, () => { filtro.proyecto = filtro.proyecto === null ? undefined : null; }) : null,
    [...conProyecto.entries()].map(([id, n]) => {
      const p = S.projectById(id);
      if (!p) return null;
      return chip(`${S.projectLabel(p).toUpperCase()} ${n}`, filtro.proyecto === id,
        () => { filtro.proyecto = filtro.proyecto === id ? undefined : id; });
    })));

  const busca = h('input', {
    class: 'input', type: 'search', placeholder: 'Buscar dentro de las anotaciones',
    value: filtro.q, autocomplete: 'off', dataset: { keepFocus: 'nota-busca' },
  });
  busca.addEventListener('input', () => { filtro.q = busca.value; rerender(); });
  add(wrap, h('div', { style: 'margin-bottom:22px' }, busca));

  /* --------------------------------- Lista -------------------------------- */

  let items = S.noteList({ projectId: filtro.proyecto, q: filtro.q });
  if (filtro.soloFijadas) items = items.filter((t) => t.pinned);

  add(wrap, noteGrid(items, {
    empty: filtro.q || filtro.soloFijadas || filtro.proyecto !== undefined
      ? 'Nada con ese filtro.'
      : 'Ninguna anotación. Lo que no es una acción tampoco es basura: archívalo aquí.',
    showProject: filtro.proyecto === undefined || filtro.proyecto === null,
  }));

  if (items.length) {
    add(wrap, h('div', { class: 'micro', style: 'margin-top:26px' },
      `${items.length} DE ${todas.length} · SE GUARDAN SOLAS AL ESCRIBIR`));
  }

  /* ------------------------------- Limpieza ------------------------------- */

  if (todas.length > 40) {
    add(wrap, h('div', { class: 'notice', style: 'margin-top:34px' },
      h('div', { class: 'notice-title', text: 'ARCHIVO, NO DESVÁN' }),
      h('div', { class: 'notice-body', text: `${todas.length} anotaciones. Una referencia que nunca consultas no es una referencia.` }),
      h('div', { class: 'notice-acts' },
        h('button', {
          class: 'btn btn-sm btn-warn', type: 'button', text: 'ELIMINAR LAS NO FIJADAS DE HACE MÁS DE UN AÑO',
          onclick: () => confirmSheet({
            title: 'Limpiar el archivo',
            body: 'Se eliminan las anotaciones sin fijar creadas hace más de 365 días. Las fijadas no se tocan.',
            confirmText: 'ELIMINAR',
            warn: true,
            hold: true,
            onConfirm: async () => {
              const corte = new Date(Date.now() - 365 * 86400000).toISOString();
              const viejas = S.noteList().filter((t) => !t.pinned && t.createdAt < corte);
              for (const t of viejas) await S.remove(t.id);
              toast(`${viejas.length} eliminadas.`);
            },
          }),
        }))));
  }

  return wrap;
}

/** Tira de anotaciones de un proyecto, para su tablero. */
export function projectStrip(projectId) {
  const notas = S.projectNotes(projectId);
  const nueva = h('input', {
    class: 'gal-add', type: 'text', placeholder: '+ anotar algo de este proyecto',
    autocomplete: 'off', dataset: { keepFocus: `nota-proj-${projectId}` },
  });
  nueva.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const valor = nueva.value.trim();
    if (!valor) return;
    e.preventDefault();
    nueva.value = '';
    await S.createNote(valor, { projectId });
  });

  return h('section', { class: 'sec' },
    h('div', { class: 'sec-head' },
      h('div', { class: 'sec-title', text: 'ANOTACIONES' }),
      h('div', { class: 'sec-meta', text: String(notas.length) })),
    noteGrid(notas, {
      empty: 'Sin anotaciones. Lo que sepas de este proyecto y no sea trabajo, escríbelo aquí.',
      showProject: false,
    }),
    h('div', { style: 'margin-top:12px' }, nueva));
}
