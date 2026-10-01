/*
 * HÁBITOS.
 *
 * Lo que se hace —o se deja de hacer— los días que toca, sin negociarlo.
 * Tres como mucho cada día y uno por categoría: pocos, y siempre. Aquí se
 * crean, se ve cómo va cada uno y se corrige un día pasado. Se marcan sobre
 * todo desde HOY.
 *
 *   1. hoy          los de hoy (1, 2, 3 con teclado)
 *   2. la semana    cuántos lleva cada día, sobre tres
 *   3. categorías   en su orden, cada una con su hábito; las libres, al final
 *   4. en pausa     plegado: ni avisa ni cuenta ni ocupa categoría
 */

import { add, h, today, addDays, weekStart, fmtLong, parseISO } from '../util.js';
import * as S from '../store.js';
import * as V from '../voice.js';
import * as viewkeys from '../viewkeys.js';
import {
  pageHead, section, foldSection, habitTile, habitDayAction, openHabitForm, openNewHabit, openHabitCategories,
} from '../components.js';

const SEMANAS = 8;
const MES_CORTO = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

export function render() {
  const wrap = h('div', { class: 'wrap' });
  const activos = S.activeHabits();
  const pausados = S.pausedHabits();
  const deHoy = S.habitsToday();
  const cumplidos = S.keptHabitsToday().length;

  add(wrap, pageHead('HÁBITOS',
    'Lo que haces —o dejas de hacer— sin negociarlo. Tres al día como mucho y uno por categoría.',
    V.gritHabits({
      total: activos.length,
      pending: S.pendingHabitsToday().length,
      done: cumplidos,
      missedYesterday: S.missedHabitsYesterday().length,
      late: S.lateHabitsToday().length,
    })));

  viewkeys.set((e) => {
    const n = Number(e.key);
    if (!Number.isInteger(n) || n < 1 || n > deHoy.length) return false;
    habitDayAction(deHoy[n - 1].habit);
    return true;
  });

  add(wrap, h('div', { class: 'hab-tools' },
    h('button', { class: 'btn btn-primary', type: 'button', text: '+ NUEVO HÁBITO', onclick: () => openNewHabit() }),
    h('button', { class: 'btn', type: 'button', text: 'CATEGORÍAS', title: 'Ordenar, renombrar o crear categorías', onclick: openHabitCategories }),
    cargaSemana()));

  if (!activos.length && !pausados.length) {
    add(wrap, h('div', { class: 'empty', style: 'margin-top:26px' },
      'Ninguno todavía. Un hábito es algo pequeño que haces los días que toca, pase lo que pase: leer veinte páginas, entrenar, no mirar el móvil antes de las doce. ',
      'Empieza por uno. Atarlo a algo que ya haces («después de desayunar») y ponerle un aviso es lo que hace que se haga.'));
    add(wrap, libres());
    return wrap;
  }

  /* ---------------------------------- HOY --------------------------------- */

  add(wrap, section('HOY', {
    meta: deHoy.length ? `${cumplidos}/${deHoy.length} CUMPLIDOS` : null,
    body: deHoy.length
      ? h('div', { class: 'habitos-row' }, deHoy.map((x) => habitTile(x.habit)))
      : h('div', { class: 'empty', text: 'Hoy no toca ninguno. Mañana sí.' }),
    micro: deHoy.length > 1 ? `CON TECLADO: ${deHoy.map((_, i) => i + 1).join(', ')}.` : null,
  }));

  /* ------------------------------ POR CATEGORÍA --------------------------- */

  if (activos.length) {
    add(wrap, section('POR CATEGORÍA', {
      meta: `${activos.filter((hb) => hb.category).length} DE ${S.habitCategories().length} CATEGORÍAS`,
      body: h('div', {},
        h('div', { class: 'hab-list' }, activos.map(ficha)),
        libres()),
      micro: 'UN DÍA OLVIDADO SE CORRIGE PULSANDO SU CASILLA. EL FUTURO NO SE MARCA.',
    }));
  } else {
    add(wrap, libres());
  }

  if (pausados.length) {
    add(wrap, foldSection('habitos-pausa', 'EN PAUSA', {
      meta: pausados.length,
      body: h('div', { class: 'hab-list' }, pausados.map(ficha)),
      micro: 'NI AVISAN NI CUENTAN NI OCUPAN CATEGORÍA. LO APUNTADO SE QUEDA.',
    }));
  }

  return wrap;
}

/* ------------------------------- Lo que falta ------------------------------ */

/** Las categorías sin hábito: un toque y se crea uno ahí. */
function libres() {
  const cats = S.habitCategories().filter((c) => !S.categoryOwner(c.id));
  if (!cats.length) return null;
  return h('div', { class: 'hab-free' },
    h('span', { class: 'hab-free-l', text: 'CATEGORÍAS LIBRES' }),
    cats.map((c) => h('button', {
      class: 'chip', type: 'button', text: `+ ${c.name}`, title: `Nuevo hábito de ${c.name}`,
      onclick: () => openNewHabit({ category: c.id }),
    })));
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

const RACHA = {
  check: ['DÍA DE RACHA', 'DÍAS DE RACHA'],
  amount: ['DÍA DE RACHA', 'DÍAS DE RACHA'],
  limit: ['DÍA SIN PASARTE', 'DÍAS SIN PASARTE'],
  quit: ['DÍA SIN CAER', 'DÍAS SIN CAER'],
};

function ficha(hb) {
  const pausado = S.isHabitPaused(hb);
  const racha = S.habitStreak(hb);
  const tasa = S.habitRate(hb, 30);
  const meta = S.habitGoalLabel(hb);

  return h('article', { class: `hab-card${pausado ? ' paused' : ''}${hb.category ? '' : ' nocat'}` },
    h('div', { class: 'hab-card-cat' },
      h('span', { text: S.habitCategoryLabel(hb.category) }),
      h('span', { class: 'hab-card-kind', text: S.HABIT_KIND_LABEL[hb.kind] })),
    h('div', { class: 'hab-card-head' },
      h('div', { class: 'hab-card-main' },
        h('button', { class: 'hab-card-t', type: 'button', text: hb.title, title: 'Editar', onclick: () => openHabitForm(S.habitById(hb.id)) }),
        hb.cue ? h('div', { class: 'hab-card-cue', text: hb.cue }) : null,
        h('div', { class: 'hab-card-meta' },
          meta && hb.kind !== 'quit' ? h('span', { text: meta.toUpperCase() }) : null,
          h('span', { text: S.habitDaysLabel(hb.days) }),
          h('span', { text: hb.time ? `◷ AVISO ${hb.time}` : 'SIN AVISO' }),
          pausado ? h('span', { class: 'hab-paused', text: 'EN PAUSA' }) : null,
          hb.category ? null : h('span', { class: 'hab-paused', text: 'ELIGE CATEGORÍA' }))),
      h('button', { class: 'btn btn-sm', type: 'button', text: 'EDITAR', onclick: () => openHabitForm(S.habitById(hb.id)) })),
    h('div', { class: 'hab-nums' },
      h('div', { class: 'hab-num' },
        h('div', { class: 'hab-num-n', text: String(racha) }),
        h('div', { class: 'hab-num-l', text: RACHA[hb.kind][racha === 1 ? 0 : 1] })),
      h('div', { class: `hab-num${tasa.pct !== null && tasa.pct < 60 ? ' bad' : ''}` },
        h('div', { class: 'hab-num-n', text: tasa.pct === null ? '—' : `${tasa.pct}%` }),
        h('div', { class: 'hab-num-l', text: tasa.due ? `ÚLTIMOS 30 DÍAS · ${tasa.done} DE ${tasa.due}` : 'AÚN SIN DÍAS QUE CONTAR' }))),
    rejilla(hb));
}

const TEXTO_ESTADO = {
  done: null, holding: 'hoy, de momento sin caer', partial: null, pending: 'hoy, sin hacer',
  missed: null, future: 'aún no ha llegado', off: 'no tocaba',
};

/**
 * Las últimas ocho semanas, de lunes a domingo. Cada casilla es un día:
 * lleno es cumplido, medio lleno es que te quedaste corto, borde rojo es que
 * tocaba y no se cumplió, gris es que no tocaba. Las que tocaban se pulsan.
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
      const marcable = fecha <= hoy && estado !== null && estado !== 'future';
      const texto = TEXTO_ESTADO[clase] || S.habitDayLabel(hb, fecha);
      add(caja, h(marcable ? 'button' : 'span', {
        class: `hab-cell ${clase}${fecha === hoy ? ' today' : ''}${fecha < hoy ? ' past' : ''}`,
        type: marcable ? 'button' : null,
        title: `${fmtLong(fecha)} · ${texto}`,
        onclick: marcable ? () => habitDayAction(S.habitById(hb.id), fecha) : null,
      }));
    }
  }
  return caja;
}
