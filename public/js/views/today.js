/*
 * HOY.
 *
 * La pantalla que se abre y con la que se trabaja. Una sola pregunta manda:
 * que hago AHORA. Todo lo demas de esta pantalla esta por debajo de eso.
 *
 *   1. AHORA            una cosa, enorme, con un boton para empezarla
 *   2. el dia           un dato, no un panel
 *   3. lo que arrastras cuentas abiertas de dias anteriores
 *   4. despues          la cola del dia, numerada
 *   5. lo que aprieta   fechas tope y bandeja
 *   6. el resto         plegado, porque ahora no toca
 */

import { add, h, relDate, plural, today, fmtDate } from '../util.js';
import * as S from '../store.js';
import * as V from '../voice.js';
import * as focus from '../focus.js';
import * as inbox from './inbox.js';
import {
  pageHead, section, foldSection, taskList, pickTask, openEditor, openPostpone, captureBar,
  askOneThing, askCommit, askDelete, openDelegate, confirmSheet, deadlineTag, completeToggle,
} from '../components.js';

export function render() {
  const wrap = h('div', { class: 'wrap' });
  const one = S.oneThing();
  const lista = S.todayList();
  const later = S.laterList();
  const waiting = S.waitingList();
  const cronicas = S.chronic();
  const compromisos = S.commitments().length;
  const arrastradas = S.carried();
  const hechasHoy = S.completedToday();
  const bandeja = S.inbox();
  const profundos = S.deepMinutesToday();
  const enElDia = new Set(lista.map((t) => t.id));
  const venciendo = S.upcomingDeadlines(7).filter((t) => !enElDia.has(t.id));

  /* Lo que se hace ahora. Si no hay nada elegido, elegir es el trabajo. */
  const foco = elegirAhora({ one, lista, arrastradas });
  const resto = lista.filter((t) => !foco || t.id !== foco.tarea.id);
  const deuda = arrastradas.filter((t) => !foco || t.id !== foco.tarea.id);

  add(wrap, pageHead(
    V.todayTitle({ carried: arrastradas.length }),
    V.todaySub({
      carried: arrastradas.length,
      oneThing: one,
      commitments: compromisos,
      cap: S.commitCap(),
      doneToday: hechasHoy.length,
      inbox: bandeja.length,
    }),
    V.gritToday({
      carried: arrastradas.length,
      oneThing: one,
      doneToday: hechasHoy.length,
      deepToday: profundos,
      commitments: compromisos,
      inbox: bandeja.length,
    })));

  if (S.state.restoredFromDisk) {
    add(wrap, h('div', { class: 'notice' },
      h('div', { class: 'notice-title', text: 'DATOS RESTAURADOS' }),
      h('div', { class: 'notice-body', text: 'La base del navegador estaba vacía. Se ha restaurado la última copia guardada en disco.' }),
      h('div', { class: 'notice-acts' },
        h('button', {
          class: 'btn btn-sm', type: 'button', text: 'ENTENDIDO',
          onclick: () => { S.state.restoredFromDisk = false; dispatchEvent(new CustomEvent('gsd:rerender')); },
        }))));
  }

  add(wrap, captureBar());

  /* --------------------------------- AHORA -------------------------------- */

  add(wrap, foco ? ahora(foco, { deuda: arrastradas, resto }) : sinNada());

  /* -------------------------------- EL DÍA -------------------------------- */

  add(wrap, elDia({ lista, hechasHoy, profundos, venciendo, compromisos }));

  /* --------------------------- CUENTAS ABIERTAS --------------------------- */

  if (deuda.length) add(wrap, ledger(deuda));

  /* -------------------------------- DESPUÉS ------------------------------- */

  add(wrap, section('DESPUÉS', {
    meta: `${resto.length} EN LA COLA · ${compromisos}/${S.commitCap()} COMPROMISOS`,
    body: cola(resto, { hayFoco: !!foco }),
    micro: compromisos > S.commitCap() ? 'DO LESS. DO WHAT MATTERS.' : null,
  }));

  add(wrap.lastChild, h('div', { style: 'margin-top:14px' },
    h('button', {
      class: 'btn btn-sm', type: 'button', text: '+ COMPROMETER UNA TAREA',
      onclick: () => pickTask({
        title: 'Comprometerte para hoy',
        tasks: S.nextActions().filter((t) => !t.isCommitment && !S.isDue(t)),
        empty: 'No hay acciones libres. Aclara la bandeja.',
        onPick: (t) => askCommit(t.id),
      }),
    })));

  /* ------------------------------ VENCE PRONTO ---------------------------- */

  if (venciendo.length) {
    add(wrap, section('VENCE PRONTO', {
      meta: `${venciendo.length}`,
      body: h('div', { class: 'rows' }, venciendo.slice(0, 5).map((t) => h('div', { class: 'row' },
        h('button', {
          class: 'row-check', type: 'button', title: 'Completar',
          onclick: (e) => { e.stopPropagation(); completeToggle(t.id); },
        }),
        h('div', { class: 'row-body' },
          h('button', { class: 'row-title', style: 'text-align:left', type: 'button', text: t.title, onclick: () => openEditor(t.id) }),
          h('div', { class: 'row-sub' },
            deadlineTag(t),
            h('span', { text: fmtDate(t.deadline) }),
            (() => { const p = S.projectById(t.projectId); return p ? h('span', { text: S.projectLabel(p) }) : null; })())),
        h('div', { class: 'row-acts' },
          h('button', { class: 'row-act', type: 'button', text: 'AL DÍA DE HOY', onclick: () => askCommit(t.id) }),
          h('button', { class: 'row-act', type: 'button', text: 'ENFOCAR', onclick: () => focus.open(t.id) }))))),
      micro: 'TIENEN FECHA TOPE Y NO ESTÁN EN TU DÍA.',
    }));
  }

  /* -------------------------------- BANDEJA ------------------------------- */

  if (bandeja.length) {
    add(wrap, section('BANDEJA', {
      meta: `${bandeja.length} SIN DECIDIR`,
      body: h('div', {},
        taskList(bandeja.slice(0, 5), {
          acts: (t) => [
            { label: 'ACLARAR', fn: () => inbox.startProcessing(t.id) },
            { label: 'EDITAR', fn: () => openEditor(t.id) },
            { label: 'ELIMINAR', warn: true, fn: () => askDelete(t.id) },
          ],
        }),
        h('div', { style: 'display:flex;gap:8px;align-items:center;margin-top:14px;flex-wrap:wrap' },
          h('button', {
            class: 'btn btn-sm btn-primary', type: 'button', text: `ACLARAR (${bandeja.length})`,
            onclick: () => inbox.startProcessing(),
          }),
          bandeja.length > 5 ? h('span', { class: 'micro', text: `+${bandeja.length - 5} MÁS` }) : null)),
      micro: V.inboxLine(bandeja.length).toUpperCase(),
    }));
  }

  /* ------------------------ EL TRABAJO FÁCIL PRIMERO --------------------- */

  if (one && hechasHoy.length >= 3 && !hechasHoy.some((t) => t.id === one.id)) {
    add(wrap, h('div', { class: 'notice notice-warn', style: 'margin-top:32px' },
      h('div', { class: 'notice-title', text: 'MIRA LO QUE HAS HECHO' }),
      h('div', { class: 'notice-body', text: `${hechasHoy.length} tareas terminadas hoy. Ninguna es la que importa.` }),
      h('div', { class: 'micro', style: 'margin-top:8px', text: 'BUSY IS NOT THE SAME AS HARD.' }),
      h('div', { class: 'notice-acts' },
        h('button', { class: 'btn btn-sm btn-primary', type: 'button', text: 'EMPEZAR LA DIFÍCIL', onclick: () => focus.openDeep(one.id) }))));
  }

  /* ------------------------------ HONESTIDAD ----------------------------- */

  if (cronicas.length) add(wrap, decide(cronicas));

  /* ------------------------------- EL RESTO ------------------------------ */

  const secundario = [];
  if (waiting.length) secundario.push(enEspera(waiting));
  if (bandeja.length === 0) {
    secundario.push(h('div', { class: 'empty', style: 'padding-top:0', text: V.inboxLine(0) }));
  }
  if (later.length) {
    secundario.push(h('div', { style: 'margin-top:18px' },
      h('button', {
        class: 'btn btn-sm', type: 'button',
        text: `${later.length} ${later.length === 1 ? 'TAREA' : 'TAREAS'} FUERA DE HOY`,
        onclick: () => { location.hash = '#/tablero'; },
      })));
  }
  const notas = S.pinnedNotes();
  if (notas.length) {
    secundario.push(h('div', { style: 'margin-top:18px' },
      h('div', { class: 'micro', style: 'margin-bottom:8px', text: `${notas.length} ANOTACIÓN${notas.length === 1 ? '' : 'ES'} FIJADA${notas.length === 1 ? '' : 'S'}` }),
      h('div', { class: 'rows' }, notas.slice(0, 4).map((t) => h('div', { class: 'row' },
        h('div', { class: 'row-body' },
          h('button', { class: 'row-title', type: 'button', style: 'text-align:left', text: `≡ ${t.title}`, onclick: () => openEditor(t.id) })))))));
  }
  if (secundario.length) {
    add(wrap, foldSection('hoy-resto', 'EL RESTO DEL SISTEMA', {
      meta: `${waiting.length + later.length}`,
      body: h('div', {}, secundario),
      micro: 'NO ES PARA AHORA. POR ESO ESTÁ PLEGADO.',
    }));
  }

  return wrap;
}

/* --------------------------------- AHORA ---------------------------------- */

/**
 * Que se hace ahora mismo. El orden no es negociable:
 *   lo unico > lo que llevas arrastrando > lo comprometido > lo que vence.
 * Si no hay nada de eso, el trabajo es elegir.
 */
function elegirAhora({ one, lista, arrastradas }) {
  if (one) return { tarea: one, razon: 'LO ÚNICO', esUnico: true };
  if (arrastradas.length) {
    const peor = arrastradas.reduce((a, b) => (S.carriedDays(a) >= S.carriedDays(b) ? a : b));
    return { tarea: peor, razon: `LO ARRASTRAS ${S.carriedDays(peor)}D`, deuda: true };
  }
  const comprometida = lista.find((t) => t.isCommitment);
  if (comprometida) return { tarea: comprometida, razon: 'TE COMPROMETISTE' };
  const vence = lista[0];
  if (vence) return { tarea: vence, razon: S.isOverdue(vence) ? 'VENCIÓ' : 'VENCE HOY' };
  return null;
}

function ahora({ tarea, razon, esUnico, deuda }, { deuda: arrastradas, resto }) {
  const t = tarea;
  const dureza = V.difficulty(t);
  const bits = [];
  const p = S.projectById(t.projectId);
  if (p) bits.push(S.projectLabel(p));
  if (t.context) bits.push(t.context);
  if (t.recurrence) bits.push(`↻ ${S.recurrenceLabel(t.recurrence)}`);
  if (t.reminder) bits.push(`AVISO ${S.reminderLabel(t)}`);
  if (t.postponeCount) bits.push(`POSPUESTA ×${t.postponeCount}`);

  const tope = S.deadlineState(t)
    ? h('div', { class: `unico-tope unico-tope-${S.deadlineState(t)}` },
      h('span', { class: 'unico-tope-l', text: 'FECHA TOPE' }),
      h('span', { text: `${fmtDate(t.deadline)} · ${S.deadlineDays(t) < 0 ? `vencida hace ${-S.deadlineDays(t)}d` : `${S.deadlineDays(t)} días`}` }))
    : null;

  // Deuda que no es la que estas a punto de hacer: se ve, pero no distrae.
  const otras = arrastradas.filter((x) => x.id !== t.id);

  return h('div', { class: `ahora${deuda ? ' ahora-deuda' : ''}` },
    h('div', { class: 'ahora-top' },
      h('span', { class: 'ahora-label', text: 'AHORA' }),
      h('span', { class: 'ahora-why', text: razon }),
      h('span', { class: 'unico-rule' }),
      h('span', { class: 'ahora-rest', text: resto.length ? `+${resto.length} después` : 'y nada más' })),
    h('h2', { class: 'ahora-title', text: t.title }),
    bits.length ? h('div', { class: 'unico-meta' }, bits.map((b) => h('span', { text: b }))) : null,
    tope,
    dureza ? h('div', { class: 'unico-hard', text: dureza }) : null,
    h('div', { class: 'unico-actions' },
      h('button', { class: 'btn btn-primary btn-big', type: 'button', text: 'EMPEZAR AHORA', onclick: () => focus.open(t.id) }),
      h('button', { class: 'btn btn-on-dark', type: 'button', text: 'TRABAJO PROFUNDO', onclick: () => focus.openDeep(t.id) }),
      h('button', { class: 'btn btn-on-dark', type: 'button', text: 'HECHA', onclick: () => completeToggle(t.id) })),
    h('div', { class: 'unico-minor' },
      esUnico
        ? h('button', { class: 'unico-link', type: 'button', text: 'CAMBIAR LO ÚNICO', onclick: chooseOneThing })
        : h('button', { class: 'unico-link', type: 'button', text: 'HACERLA LO ÚNICO', onclick: () => askOneThing(t.id) }),
      h('button', { class: 'unico-link', type: 'button', text: 'POSPONERLA', onclick: () => openPostpone(t.id) }),
      h('button', { class: 'unico-link', type: 'button', text: 'EDITAR', onclick: () => openEditor(t.id) })),
    otras.length
      ? h('div', { class: 'ahora-deudas' },
        h('span', { text: `Además arrastras ${plural(otras.length, 'tarea', 'tareas')} de días anteriores.` }),
        h('button', {
          class: 'unico-link', type: 'button', text: 'EMPEZAR POR LA PEOR',
          onclick: () => focus.open(otras.reduce((a, b) => (S.carriedDays(a) >= S.carriedDays(b) ? a : b)).id),
        }))
      : null);
}

function sinNada() {
  const candidatas = [...S.nextActions(), ...S.inbox()];
  const sugerida = S.upcomingDeadlines(7)[0] || candidatas[0] || null;

  return h('div', { class: 'ahora ahora-empty' },
    h('div', { class: 'ahora-top' },
      h('span', { class: 'ahora-label', text: 'AHORA' }),
      h('span', { class: 'unico-rule' })),
    h('p', { class: 'unico-ask', text: 'No hay nada decidido para hoy. Elegir también es el trabajo: ¿cuál es la única cosa que hará que todo lo demás sea más fácil o innecesario?' }),
    h('div', { class: 'unico-actions' },
      h('button', { class: 'btn btn-primary btn-big', type: 'button', text: 'ELEGIRLA', onclick: chooseOneThing }),
      sugerida
        ? h('button', {
          class: 'btn btn-suggest', type: 'button', title: sugerida.title,
          text: `USAR: ${sugerida.title}`,
          onclick: () => askOneThing(sugerida.id),
        })
        : null));
}

/* -------------------------------- DESPUÉS --------------------------------- */

/** La cola del dia, numerada. Se ve cuanto queda sin tener que contarlo. */
function cola(items, { hayFoco }) {
  if (!items.length) {
    return h('div', { class: 'empty', text: hayFoco ? 'Nada más para hoy. Con una basta.' : V.emptyToday() });
  }
  return h('div', { class: 'rows' }, items.map((t, i) => {
    const bits = [];
    const p = S.projectById(t.projectId);
    if (p) bits.push(h('span', { text: S.projectLabel(p) }));
    if (t.context) bits.push(h('span', { text: t.context }));
    if (t.isCommitment) bits.push(h('span', { class: 'tag tag-lock', text: 'NO NEGOCIAR' }));
    // Arrastrar es incumplir algo que prometiste; una fecha pasada, no.
    if (S.isOverdue(t)) {
      bits.push(t.isCommitment
        ? h('span', { class: 'tag tag-late', text: `ARRASTRAS ${S.carriedDays(t)}D` })
        : h('span', { class: 'tag tag-late', text: `DESDE HACE ${S.carriedDays(t)}D` }));
    }
    if (t.deadline) bits.push(deadlineTag(t));
    if (t.reminder) bits.push(h('span', { class: 'tag tag-rem', text: `AVISO ${S.reminderLabel(t)}` }));

    const fila = h('div', { class: 'row row-q', dataset: { taskId: t.id } },
      h('button', {
        class: 'row-check', type: 'button', title: 'Completar (espacio)',
        onclick: (e) => { e.stopPropagation(); completeToggle(t.id); },
      }),
      h('span', { class: 'q-num', text: String(i + 1) }),
      h('div', { class: 'row-body' },
        h('div', { class: 'row-title', text: t.title }),
        bits.length ? h('div', { class: 'row-sub' }, bits) : null),
      h('div', { class: 'row-acts' },
        h('button', { class: 'row-act', type: 'button', text: 'ENFOCAR', onclick: (e) => { e.stopPropagation(); focus.open(t.id); } }),
        h('button', { class: 'row-act', type: 'button', text: 'PROFUNDO', onclick: (e) => { e.stopPropagation(); focus.openDeep(t.id); } }),
        h('button', { class: 'row-act', type: 'button', text: 'POSPONER', onclick: (e) => { e.stopPropagation(); openPostpone(t.id); } }),
        h('button', { class: 'row-act warn', type: 'button', text: 'ELIMINAR', onclick: (e) => { e.stopPropagation(); askDelete(t.id); } })));
    fila.addEventListener('click', (e) => { if (!e.target.closest('button')) openEditor(t.id); });
    return fila;
  }));
}

/* --------------------------- CUENTAS ABIERTAS ----------------------------- */

function ledger(arrastradas) {
  const peor = arrastradas.reduce((a, b) => (S.carriedDays(a) >= S.carriedDays(b) ? a : b));
  return h('div', { class: 'ledger' },
    h('div', { class: 'ledger-head' },
      h('span', { class: 'ledger-title', text: 'LO QUE ARRASTRAS' }),
      h('span', { class: 'ledger-count', text: String(arrastradas.length) })),
    h('div', { class: 'ledger-body' },
      arrastradas.map((t) => h('div', { class: 'ledger-row' },
        h('span', { class: 'ledger-days', text: `${S.carriedDays(t)}D` }),
        h('button', { class: 'ledger-task', type: 'button', text: t.title, onclick: () => openEditor(t.id) }),
        h('button', {
          class: 'ledger-go', type: 'button', text: 'HACERLA', title: 'Enfocar',
          onclick: () => focus.open(t.id),
        })))),
    h('div', { class: 'ledger-foot' },
      h('span', { text: 'Dijiste que harías esto. Sigue ahí.' }),
      h('button', {
        class: 'btn btn-primary btn-sm', type: 'button', text: 'EMPEZAR POR LA PEOR',
        onclick: () => focus.open(peor.id),
      })));
}

/* -------------------------------- EL DÍA ---------------------------------- */

/**
 * Un dato, no un panel de control. Solo responde a: ¿voy cumpliendo hoy
 * lo que dije, y he trabajado de verdad en algo?
 */
function elDia({ lista, hechasHoy, profundos, venciendo, compromisos }) {
  const totalDia = lista.length + hechasHoy.filter((t) => t.isCommitment).length;
  const hechos = hechasHoy.filter((t) => t.isCommitment).length;
  const pct = totalDia ? Math.round((hechos / totalDia) * 100) : 0;

  const partes = [];
  partes.push(h('span', {}, h('b', { text: `${hechos}/${totalDia || compromisos}` }), ' compromisos'));
  partes.push(h('span', {}, h('b', { text: profundos ? `${profundos} min` : '0 min' }), ' de trabajo profundo'));
  if (venciendo.length) partes.push(h('span', { class: 'dia-warn' }, h('b', { text: String(venciendo.length) }), ' con fecha tope encima'));
  const avisos = S.remindersToday();
  if (avisos.length) {
    const t = avisos[0];
    partes.push(h('button', { class: 'dia-rem', type: 'button', onclick: () => openEditor(t.id), title: t.title },
      h('b', { text: S.reminderTime(t) }),
      ` aviso · ${t.title.length > 38 ? `${t.title.slice(0, 38)}…` : t.title}${avisos.length > 1 ? ` (+${avisos.length - 1})` : ''}`));
  }

  return h('section', { class: 'dia' },
    h('div', { class: 'dia-bar' }, h('span', { style: `width:${pct}%` })),
    h('div', { class: 'dia-line' }, partes));
}

/* ------------------------------- EN ESPERA -------------------------------- */

function enEspera(waiting) {
  const vencidas = S.waitingDue();
  const filas = [...vencidas, ...waiting.filter((t) => !vencidas.includes(t))].slice(0, 5).map((t) => {
    const w = S.waitingByTask(t.id);
    const tarde = w && w.reviewDate && w.reviewDate <= today();
    return h('div', { class: 'row' },
      h('div', { class: 'row-body' },
        h('button', {
          class: 'row-title', style: 'text-align:left', type: 'button',
          text: `→ ${t.waitingFor || '—'} — ${w ? w.description : t.title}`,
          onclick: () => openEditor(t.id),
        }),
        w && w.reviewDate
          ? h('div', { class: 'row-sub' }, h('span', { class: tarde ? 'tag tag-late' : '', text: `REVISAR ${relDate(w.reviewDate)}` }))
          : null),
      tarde
        ? h('div', { class: 'row-acts', style: 'opacity:1' },
          h('button', { class: 'row-act', type: 'button', text: 'RECIBIDO', onclick: () => completeToggle(t.id) }),
          h('button', { class: 'row-act', type: 'button', text: 'SEGUIMIENTO', onclick: () => openDelegate(t.id) }))
        : null);
  });

  return h('div', {},
    h('div', { class: 'micro', style: 'margin-bottom:8px', text: `EN ESPERA · ${waiting.length}${vencidas.length ? ` · ${vencidas.length} VENCIDAS` : ''}` }),
    h('div', { class: 'rows' }, filas));
}

/* ------------------------------- HONESTIDAD ------------------------------- */

function decide(cronicas) {
  const t = cronicas[0];
  return h('div', { class: 'notice notice-warn', style: 'margin-top:32px' },
    h('div', { class: 'notice-title', text: 'DECIDE' }),
    h('div', { class: 'notice-body', text: `${t.title} — pospuesta ${plural(t.postponeCount, 'vez', 'veces')}.` }),
    h('div', { class: 'micro', style: 'margin-top:8px', text: 'DECIDE: DO IT, DELEGATE IT, SCHEDULE IT, OR DELETE IT.' }),
    h('div', { class: 'notice-acts' },
      h('button', { class: 'btn btn-sm', type: 'button', text: 'HACERLA AHORA', onclick: () => focus.open(t.id) }),
      h('button', { class: 'btn btn-sm', type: 'button', text: 'DELEGAR', onclick: () => openDelegate(t.id) }),
      h('button', { class: 'btn btn-sm', type: 'button', text: 'PROGRAMAR', onclick: () => openPostpone(t.id) }),
      h('button', {
        class: 'btn btn-sm btn-warn', type: 'button', text: 'ELIMINAR',
        onclick: () => confirmSheet({
          title: 'Eliminar',
          body: `${t.title}\n\nSi no vas a hacerlo, no necesita estar aquí.`,
          confirmText: 'ELIMINAR',
          warn: true,
          onConfirm: () => askDelete(t.id),
        }),
      }),
      cronicas.length > 1
        ? h('button', { class: 'btn btn-sm btn-ghost', type: 'button', text: `+${cronicas.length - 1} MÁS`, onclick: () => { location.hash = '#/review'; } })
        : null));
}

function chooseOneThing() {
  pickTask({
    title: '¿Cuál es la única cosa?',
    tasks: [...S.nextActions().filter((t) => !t.isOneThing), ...S.inbox()],
    empty: 'No hay nada que elegir. Captura o aclara la bandeja.',
    onPick: (t) => askOneThing(t.id),
  });
}
