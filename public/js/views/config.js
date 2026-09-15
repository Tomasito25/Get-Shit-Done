/*
 * CONFIGURACIÓN.
 *
 * Lo justo para que el sistema sea tuyo: contextos, columnas, los dos topes
 * que aprietan y el aspecto. Nada de preferencias por tener preferencias:
 * cada opcion de aqui cambia como te comporta la aplicacion, no como se ve.
 */

import { add, h, toast, plural } from '../util.js';
import * as S from '../store.js';
import { pageHead, section, openSheet, closeTop, sheet, confirmSheet } from '../components.js';
import { openColumnEditor } from './board.js';
import { openFolderSheet } from './projects.js';

export function render() {
  const wrap = h('div', { class: 'wrap' });
  add(wrap, pageHead('CONFIGURACIÓN', 'Poco que tocar, y todo cambia cómo te exige.'));

  /* -------------------------------- Contextos ---------------------------- */

  const lista = h('div', { class: 'rows' });
  const pintar = () => {
    lista.textContent = '';
    const ctxs = S.allContexts();
    if (!ctxs.length) {
      add(lista, h('div', { class: 'empty', text: 'Ningún contexto.' }));
      return;
    }
    for (const c of ctxs) {
      const uso = S.contextUsage(c);
      add(lista, h('div', { class: 'row' },
        h('div', { class: 'row-body' },
          h('div', { class: 'row-title', text: c }),
          h('div', { class: 'row-sub' },
            h('span', { text: uso ? `${uso} ${uso === 1 ? 'acción abierta' : 'acciones abiertas'}` : 'sin usar' }))),
        h('div', { class: 'row-acts', style: 'opacity:1' },
          h('button', { class: 'row-act', type: 'button', text: 'RENOMBRAR', onclick: () => renombrar(c) }),
          h('button', { class: 'row-act warn', type: 'button', text: 'ELIMINAR', onclick: () => eliminar(c, uso) }))));
    }
  };

  const renombrar = (c) => {
    const campo = h('input', { class: 'input', type: 'text', value: c, 'data-autofocus': '' });
    const guardar = async () => {
      const nuevo = await S.renameContext(c, campo.value);
      closeTop();
      if (nuevo) toast(`Ahora es ${nuevo}.`);
    };
    const body = h('div', {},
      h('div', { class: 'field' }, h('label', { class: 'label', text: 'Nombre del contexto' }), campo),
      h('div', { class: 'check-note', text: 'Las tareas que lo usan pasan solas al nombre nuevo.' }));
    body.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); guardar(); } });
    openSheet(sheet({
      title: 'Renombrar contexto',
      body,
      foot: [h('button', { class: 'btn btn-ghost', type: 'button', text: 'CANCELAR', onclick: closeTop }),
        h('div', { class: 'spacer' }),
        h('button', { class: 'btn', type: 'button', text: 'GUARDAR', onclick: guardar })],
    }));
  };

  const eliminar = (c, uso) => confirmSheet({
    title: 'Eliminar contexto',
    body: uso
      ? `${uso} ${uso === 1 ? 'acción se queda' : 'acciones se quedan'} sin contexto. No se borra ninguna tarea.`
      : 'No lo usa ninguna tarea.',
    confirmText: 'ELIMINAR',
    warn: true,
    onConfirm: async () => {
      const n = await S.removeContext(c);
      toast(n ? `${n} tareas sin contexto.` : 'Contexto eliminado.');
    },
  });

  const nuevo = h('input', {
    class: 'input', type: 'text', placeholder: '@taller', autocomplete: 'off',
    dataset: { keepFocus: 'ctx-nuevo' },
  });
  nuevo.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const v = nuevo.value.trim();
    if (!v) return;
    e.preventDefault();
    nuevo.value = '';
    const hecho = await S.addContext(v);
    if (hecho) toast(`${hecho} añadido.`);
  });

  pintar();
  add(wrap, section('CONTEXTOS', {
    meta: `${S.allContexts().length}`,
    body: h('div', {}, lista, h('div', { style: 'margin-top:14px' }, nuevo)),
    micro: 'DÓNDE O CON QUÉ PUEDES HACER ALGO. SI NO CAMBIA LO QUE HACES, NO ES UN CONTEXTO.',
  }));

  /* -------------------------------- Carpetas ------------------------------ */

  const carpetas = S.folders();
  const filasCarpetas = carpetas.length
    ? h('div', { class: 'rows' }, carpetas.map((f) => {
      const st = S.folderStats(f.id);
      return h('div', { class: 'row' },
        h('div', { class: 'row-body' },
          h('div', { class: 'row-title', text: f.name }),
          h('div', { class: 'row-sub' },
            h('span', { text: plural(st.projects, 'proyecto', 'proyectos') }),
            h('span', { text: `${plural(st.open, 'acción abierta', 'acciones abiertas')}` }),
            st.stalled ? h('span', { class: 'tag tag-warn', text: `${st.stalled} SIN SIGUIENTE ACCIÓN` }) : null)),
        h('div', { class: 'row-acts', style: 'opacity:1' },
          h('button', {
            class: 'row-act', type: 'button', text: '↑', title: 'Subir',
            onclick: () => S.moveFolder(f.id, -1),
          }),
          h('button', {
            class: 'row-act', type: 'button', text: '↓', title: 'Bajar',
            onclick: () => S.moveFolder(f.id, 1),
          }),
          h('button', { class: 'row-act', type: 'button', text: 'ABRIR', onclick: () => openFolderSheet(f) })));
    }))
    : h('div', { class: 'empty', text: 'Ninguna carpeta. Los proyectos van todos juntos.' });

  const carpetaNueva = h('input', {
    class: 'input', type: 'text', placeholder: 'ESTUDIOS', autocomplete: 'off',
    dataset: { keepFocus: 'carpeta-nueva' },
  });
  carpetaNueva.addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const v = carpetaNueva.value.trim();
    if (!v) return;
    e.preventDefault();
    carpetaNueva.value = '';
    const f = await S.createFolder(v);
    if (f) toast(`Carpeta ${f.name} creada.`);
  });

  add(wrap, section('CARPETAS DE PROYECTOS', {
    meta: `${carpetas.length}`,
    body: h('div', {}, filasCarpetas, h('div', { style: 'margin-top:14px' }, carpetaNueva)),
    micro: 'UN ÁREA DE RESPONSABILIDAD, NO UNA FASE. AGRUPAN LA GALERÍA; NO CAMBIAN NADA DEL TRABAJO.',
  }));

  /* --------------------------------- Topes ------------------------------- */

  const cap = h('input', {
    class: 'input', type: 'number', min: '1', max: '20', value: String(S.commitCap()),
  });
  cap.addEventListener('change', () => S.saveSettings({ commitCap: Number(cap.value) || 5 }));

  const alerta = h('input', {
    class: 'input', type: 'number', min: '1', max: '20', value: String(S.postponeAlert()),
  });
  alerta.addEventListener('change', () => S.saveSettings({ postponeAlert: Number(alerta.value) || 3 }));

  add(wrap, section('LO QUE TE APRIETA', {
    body: h('div', { class: 'row2' },
      h('div', { class: 'field' },
        h('label', { class: 'label', text: 'Compromisos máximos por día' }), cap,
        h('div', { class: 'check-note', style: 'margin-top:6px', text: 'Al pasarte, la aplicación te lo dice y te obliga a confirmar.' })),
      h('div', { class: 'field' },
        h('label', { class: 'label', text: 'Aplazamientos antes de exigir decisión' }), alerta,
        h('div', { class: 'check-note', style: 'margin-top:6px', text: 'A partir de ahí la tarea deja de pedir fecha y pide una decisión.' }))),
    micro: 'SUBIRLOS ES MÁS FÁCIL QUE CUMPLIRLOS. PIÉNSALO.',
  }));

  /* -------------------------------- Tablero ------------------------------ */

  add(wrap, section('TABLERO', {
    body: h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;align-items:center' },
      h('button', { class: 'btn', type: 'button', text: 'EDITAR COLUMNAS', onclick: openColumnEditor }),
      h('span', { class: 'micro', text: S.visibleColumns().map((c) => c.label).join('  ·  ') })),
  }));

  /* -------------------------------- Aspecto ------------------------------ */

  const temas = [['system', 'Del sistema'], ['light', 'Claro'], ['dark', 'Oscuro']];
  const actual = (S.state.settings && S.state.settings.theme) || 'system';
  add(wrap, section('ASPECTO', {
    body: h('div', {},
      h('div', { class: 'filters' }, temas.map(([k, etiqueta]) => h('button', {
        class: `chip${actual === k ? ' on' : ''}`, type: 'button', text: etiqueta.toUpperCase(),
        onclick: () => S.saveSettings({ theme: k }),
      }))),
      h('label', { class: 'check' },
        (() => {
          const c = h('input', { type: 'checkbox' });
          c.checked = S.state.settings.sidebar === 'collapsed';
          c.addEventListener('change', () => S.saveSettings({ sidebar: c.checked ? 'collapsed' : 'open' }));
          return c;
        })(),
        h('span', { class: 'check-text' }, 'Barra lateral plegada',
          h('span', { class: 'check-note', text: 'También se pliega con la tecla \\\\.' })))),
  }));

  /* --------------------------------- Datos ------------------------------- */

  add(wrap, section('DATOS', {
    body: h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
      h('button', {
        class: 'btn', type: 'button', text: 'COPIAS, EXPORTAR E IMPORTAR',
        onclick: () => { location.hash = '#/datos'; },
      })),
    micro: 'TODO SE GUARDA EN ESTE EQUIPO. SIN CUENTAS, SIN NUBE, SIN SEGUIMIENTO.',
  }));

  return wrap;
}
