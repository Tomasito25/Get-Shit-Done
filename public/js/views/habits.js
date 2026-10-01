/*
 * HÁBITOS.
 *
 * Lo que se hace los días que toca, sin negociarlo. Tres como mucho cada día:
 * pocos, y siempre. Aquí se crean, se ve cómo va cada uno y se corrige un día
 * pasado que se olvidó marcar. Se marcan sobre todo desde HOY.
 *
 *   1. hoy          los de hoy, con un toque se marcan (1, 2, 3 con teclado)
 *   2. la semana    cuántos lleva cada día, sobre tres
 *   3. cada hábito  racha, cumplimiento y las últimas ocho semanas
 *   4. en pausa     plegado: ni avisa ni cuenta
 */

import { add, h, today, addDays, weekStart, fmtLong, parseISO } from '../util.js';
import * as S from '../store.js';
import * as V from '../voice.js';
import * as viewkeys from '../viewkeys.js';
import { pageHead, section, foldSection, habitTile, markHabit, openHabitForm, openNewHabit } from '../components.js';

const SEMANAS = 8;
const MES_CORTO = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

export function render() {
  const wrap = h('div', { class: 'wrap' });
  const activos = S.activeHabits();
  const pausados = S.pausedHabits();
  const deHoy = S.habitsToday();
  const pendientes = deHoy.filter((x) => x.state === 'pending');

  add(wrap, pageHead('HÁBITOS',
    'Lo que haces sin negociarlo. Tres al día como mucho: pocos, y siempre.',
    V.gritHabits({
      total: activos.length,
      pending: pendientes.length,
      done: deHoy.filter((x) => x.state === 'done').length,
      missedYesterday: S.missedHabitsYesterday().length,
      late: S.lateHabitsToday().length,
    })));

  viewkeys.set((e) => {
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > deHoy.length) return false;
    markHabit(deHoy[n - 1].habit.id);
    return true;
  });

  add(wrap, h('div', { class: 'hab-tools' },
    h('button', { class: 'btn btn-primary', type: 'button', text: '+ NUEVO HÁBITO', onclick: openNewHabit }),
    cargaSemana()));

  if (!activos.length && !pausados.length) {
    add(wrap, h('div', { class: 'empty', style: 'margin-top:26px' },
      'Ninguno todavía. Un hábito es algo pequeño que haces los días que toca, pase lo que pase: leer veinte minutos, entrenar, repasar inglés. ',
      'Empieza por uno. Atarlo a algo que ya haces («después de desayunar») y ponerle un aviso es lo que hace que se haga.'));
    return wrap;
  }

  /* ---------------------------------- HOY --------------------------------- */

  add(wrap, section('HOY', {
    meta: deHoy.length ? `${deHoy.length - pendientes.length}/${deHoy.length} HECHOS` : null,
    body: deHoy.length
      ? h('div', { class: 'habitos-row' }, deHoy.map((x) => habitTile(x.habit)))
      : h('div', { class: 'empty', text: 'Hoy no toca ninguno. Mañana sí.' }),
    micro: deHoy.length > 1 ? `PULSA PARA MARCARLO. CON TECLADO: ${deHoy.map((_, i) => i + 1).join(', ')}.` : null,
  }));

  /* ------------------------------ CADA HÁBITO ----------------------------- */

  if (activos.length) {
    add(wrap, section('TUS HÁBITOS', {
      meta: String(activos.length),
      body: h('div', { class: 'hab-list' }, activos.map(ficha)),
      micro: 'UN DÍA OLVIDADO SE CORRIGE PULSANDO SU CASILLA. EL FUTURO NO SE MARCA.',
    }));
  }

  if (pausados.length) {
    add(wrap, foldSection('habitos-pausa', 'EN PAUSA', {
      meta: pausados.length,
      body: h('div', { class: 'hab-list' }, pausados.map(ficha)),
      micro: 'NI AVISAN NI CUENTAN. LO APUNTADO SE QUEDA.',
    }));
  }

  return wrap;
}

/* -------------------------------- La semana ------------------------------- */

/** Cuántos hábitos tiene cada día, sobre tres. Un día lleno no admite otro. */
function cargaSemana() {
  return h('div', { class: 'hab-load', title: `Como mucho ${S.HABITS_PER_DAY} hábitos por día` },
    S.WEEK.map((d) => {
      const n = S.habitLoad(d);
      return h('div', {
        class: `hab-load-d${n >= S.HABITS_PER_DAY ? ' full' : ''}`,
        title: `${S.DAY_NAME[d]}: ${n} de ${S.HABITS_PER_DAY}${n >= S.HABITS_PER_DAY ? ' · lleno' : ''}`,
      },
        h('b', { text: S.DAY_LETTER[d] }),
        h('span', { class: 'hab-load-bar' },
          Array.from({ length: S.HABITS_PER_DAY }, (_, i) => h('i', { class: i < n ? 'on' : '' }))));
    }));
}

/* --------------------------------- La ficha ------------------------------- */

function ficha(hb) {
  const pausado = S.isHabitPaused(hb);
  const racha = S.habitStreak(hb);
  const tasa = S.habitRate(hb, 30);

  return h('article', { class: `hab-card${pausado ? ' paused' : ''}` },
    h('div', { class: 'hab-card-head' },
      h('div', { class: 'hab-card-main' },
        h('button', { class: 'hab-card-t', type: 'button', text: hb.title, title: 'Editar', onclick: () => openHabitForm(S.habitById(hb.id)) }),
        hb.cue ? h('div', { class: 'hab-card-cue', text: hb.cue }) : null,
        h('div', { class: 'hab-card-meta' },
          h('span', { text: S.habitDaysLabel(hb.days) }),
          h('span', { text: hb.time ? `◷ AVISO ${hb.time}` : 'SIN AVISO' }),
          pausado ? h('span', { class: 'hab-paused', text: 'EN PAUSA' }) : null)),
      h('button', { class: 'btn btn-sm', type: 'button', text: 'EDITAR', onclick: () => openHabitForm(S.habitById(hb.id)) })),
    h('div', { class: 'hab-nums' },
      h('div', { class: 'hab-num' },
        h('div', { class: 'hab-num-n', text: String(racha) }),
        h('div', { class: 'hab-num-l', text: racha === 1 ? 'DÍA DE RACHA' : 'DÍAS DE RACHA' })),
      h('div', { class: `hab-num${tasa.pct !== null && tasa.pct < 60 ? ' bad' : ''}` },
        h('div', { class: 'hab-num-n', text: tasa.pct === null ? '—' : `${tasa.pct}%` }),
        h('div', { class: 'hab-num-l', text: tasa.due ? `ÚLTIMOS 30 DÍAS · ${tasa.done} DE ${tasa.due}` : 'AÚN SIN DÍAS QUE CONTAR' }))),
    rejilla(hb));
}

/**
 * Las últimas ocho semanas, de lunes a domingo. Cada casilla es un día:
 * hecho, fallado, hoy, o un día que no tocaba. Las que tocaban se pueden pulsar.
 */
function rejilla(hb) {
  const hoy = today();
  const desde = addDays(weekStart(hoy), -7 * (SEMANAS - 1));
  const caja = h('div', { class: 'hab-grid' },
    h('span', { class: 'hab-grid-l' }),
    S.WEEK.map((d) => h('span', { class: 'hab-grid-dow', text: S.DAY_LETTER[d] })));

  for (let w = 0; w < SEMANAS; w += 1) {
    const lunes = addDays(desde, 7 * w);
    const dl = parseISO(lunes);
    add(caja, h('span', { class: 'hab-grid-l', text: `${dl.getDate()} ${MES_CORTO[dl.getMonth()]}` }));
    for (let i = 0; i < 7; i += 1) {
      const fecha = addDays(lunes, i);
      const estado = S.habitState(hb, fecha);
      const clase = estado || (fecha > hoy ? 'future' : 'off');
      const marcable = fecha <= hoy && (estado === 'done' || estado === 'missed' || estado === 'pending');
      const texto = { done: 'hecho', missed: 'no se hizo', pending: 'hoy, sin hacer', future: 'aún no ha llegado', off: 'no tocaba' }[clase];
      add(caja, h(marcable ? 'button' : 'span', {
        class: `hab-cell ${clase}${fecha === hoy ? ' today' : ''}`,
        type: marcable ? 'button' : null,
        title: `${fmtLong(fecha)} · ${texto}`,
        onclick: marcable ? () => markHabit(hb.id, fecha) : null,
      }));
    }
  }
  return caja;
}
