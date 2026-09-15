/*
 * DATOS.
 *
 * Los datos de productividad son personales. No salen del dispositivo:
 * ni telemetria, ni analitica, ni cuentas, ni nube. Y deben poder recuperarse.
 */

import { add, h, iso, toast } from '../util.js';
import * as S from '../store.js';
import * as sync from '../sync.js';
import { pageHead, section, confirmSheet } from '../components.js';

function download(filename, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function render() {
  const wrap = h('div', { class: 'wrap' });
  add(wrap, pageHead('DATOS', 'Todo se guarda en este equipo.'));

  /* ------------------------------- Respaldo ----------------------------- */

  const st = sync.status();
  const line = h('div', { class: 'notice-body' });
  const paint = (ok, when) => {
    line.textContent = ok
      ? `Copia en disco: gsd/data/gsd-data.json${when ? ` · guardada ${when.toLocaleTimeString('es-ES')}` : ''}`
      : 'Sin copia en disco. Los datos viven solo en este navegador: exporta un JSON.';
  };
  paint(st.available, st.lastSaved);

  add(wrap, h('div', { class: `notice${st.available ? '' : ' notice-warn'}` },
    h('div', { class: 'notice-title', text: 'RESPALDO AUTOMÁTICO' }),
    line,
    h('div', { class: 'notice-acts' },
      h('button', {
        class: 'btn btn-sm', type: 'button', text: 'GUARDAR AHORA',
        onclick: async () => {
          const ok = await sync.flush();
          paint(ok, new Date());
          toast(ok ? 'Copia guardada en disco.' : 'El servidor local no responde.');
        },
      }))));

  /* ------------------------------- Exportar ----------------------------- */

  add(wrap, section('EXPORTAR', {
    body: h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
      h('button', {
        class: 'btn', type: 'button', text: 'JSON',
        onclick: () => download(`gsd-${iso()}.json`, JSON.stringify(S.snapshot(), null, 2), 'application/json'),
      }),
      h('button', {
        class: 'btn', type: 'button', text: 'CSV',
        onclick: () => download(`gsd-${iso()}.csv`, S.toCSV(), 'text/csv'),
      })),
    micro: 'EL JSON CONTIENE TODO Y SE PUEDE VOLVER A IMPORTAR. EL CSV ES SOLO LECTURA.',
  }));

  /* ------------------------------- Importar ----------------------------- */

  const file = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
  let pending = null;
  const chosen = h('div', { class: 'micro', style: 'margin-top:10px' });

  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    try {
      pending = JSON.parse(await f.text());
      const n = Array.isArray(pending.tasks) ? pending.tasks.length : 0;
      chosen.textContent = `${f.name.toUpperCase()} · ${n} TAREAS`;
    } catch {
      pending = null;
      chosen.textContent = 'FICHERO ILEGIBLE';
    }
  });

  const run = (merge) => {
    if (!pending) { toast('Elige primero un fichero.'); return; }
    confirmSheet({
      title: merge ? 'Fusionar datos' : 'Reemplazar todo',
      body: merge
        ? 'Se añadirán únicamente los elementos que no existan ya. Nada se borra.'
        : 'Se borrará todo lo que hay ahora y se sustituirá por el contenido del fichero.',
      confirmText: merge ? 'FUSIONAR' : 'REEMPLAZAR',
      warn: !merge,
      hold: !merge,
      onConfirm: async () => {
        try {
          const res = await S.importData(pending, { merge });
          toast(`Importadas ${res.tasks} tareas.`);
          pending = null;
          chosen.textContent = '';
        } catch (err) {
          toast(err.message || 'No se pudo importar.');
        }
      },
    });
  };

  add(wrap, section('IMPORTAR', {
    body: h('div', {},
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
        h('button', { class: 'btn', type: 'button', text: 'ELEGIR FICHERO', onclick: () => file.click() }),
        h('button', { class: 'btn', type: 'button', text: 'FUSIONAR', onclick: () => run(true) }),
        h('button', { class: 'btn btn-warn', type: 'button', text: 'REEMPLAZAR TODO', onclick: () => run(false) })),
      file,
      chosen),
  }));

  /* ------------------------------- Recuperar ---------------------------- */

  /*
   * Las copias del disco, accesibles desde aqui. Que recuperar los datos
   * dependa de saber moverse por carpetas no es un respaldo: es un examen.
   */
  const listaCopias = h('div', { class: 'empty', text: 'Buscando copias…' });

  const pintarCopias = async () => {
    let copias = [];
    try {
      const r = await fetch('/api/backups', { cache: 'no-store' });
      copias = r.ok ? (await r.json()).backups || [] : [];
    } catch { copias = []; }

    listaCopias.textContent = '';
    listaCopias.className = copias.length ? 'rows' : 'empty';
    if (!copias.length) {
      listaCopias.textContent = 'No hay copias en disco todavía.';
      return;
    }
    for (const c of copias) {
      const cuando = new Date(c.savedAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
      add(listaCopias, h('div', { class: 'row' },
        h('div', { class: 'row-body' },
          h('div', { class: 'row-title', text: `${c.tasks} ${c.tasks === 1 ? 'tarea' : 'tareas'}${c.projects ? ` · ${c.projects} proyectos` : ''}` }),
          h('div', { class: 'row-sub' },
            h('span', { text: c.label }),
            h('span', { text: cuando }))),
        h('div', { class: 'row-acts' },
          h('button', {
            class: 'row-act', type: 'button', text: 'RECUPERAR',
            onclick: () => confirmSheet({
              title: 'Recuperar esta copia',
              body: `Se sustituirá todo lo que hay ahora por la copia de ${cuando} (${c.tasks} tareas). Lo actual quedará guardado como copia previa.`,
              confirmText: 'RECUPERAR',
              hold: true,
              onConfirm: async () => {
                try {
                  const r = await fetch(`/api/backups/${encodeURIComponent(c.name)}`, { cache: 'no-store' });
                  if (!r.ok) throw new Error('no se pudo leer la copia');
                  const datos = await r.json();
                  const res = await S.importData(datos, { merge: false });
                  toast(`Recuperadas ${res.tasks} tareas.`);
                } catch (err) {
                  toast(err.message || 'No se pudo recuperar.');
                }
              },
            }),
          }))));
    }
  };
  pintarCopias();

  add(wrap, section('RECUPERAR UNA COPIA', {
    body: listaCopias,
    micro: 'SE GUARDA UNA COPIA DIARIA, LA VERSIÓN ANTERIOR Y UNA COPIA ANTES DE CUALQUIER VACIADO.',
  }));

  /* -------------------------------- Sistema ----------------------------- */

  add(wrap, section('SISTEMA', {
    body: h('div', {},
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('div', { class: 'stat-n', text: String(S.state.tasks.length) }), h('div', { class: 'stat-l', text: 'tareas' })),
        h('div', { class: 'stat' }, h('div', { class: 'stat-n', text: String(S.state.projects.length) }), h('div', { class: 'stat-l', text: 'proyectos' })),
        h('div', { class: 'stat' }, h('div', { class: 'stat-n', text: String(S.state.waitings.length) }), h('div', { class: 'stat-l', text: 'delegaciones' }))),
      h('div', { style: 'margin-top:18px' },
        h('button', {
          class: 'btn btn-sm btn-warn', type: 'button', text: 'BORRAR TODO',
          onclick: () => confirmSheet({
            title: 'Borrar todo',
            body: 'Se elimina cada tarea, proyecto y delegación de este equipo. Exporta antes si dudas.',
            confirmText: 'BORRAR TODO',
            warn: true,
            hold: true,
            onConfirm: async () => { await S.wipe(); toast('Sistema vacío.'); },
          }),
        }))),
    micro: 'SIN CUENTAS. SIN NUBE. SIN TELEMETRÍA. SIN SEGUIMIENTO.',
  }));

  return wrap;
}
