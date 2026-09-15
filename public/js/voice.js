/*
 * La voz de la aplicacion.
 *
 * Regla unica: nunca una frase al azar. Cada linea se deduce de lo que el
 * usuario esta haciendo o dejando de hacer. Una frase generica se vuelve
 * ruido de fondo en tres dias; una frase que te ha pillado, no.
 *
 * Y un tema que atraviesa todo: si algo cuesta, es que estas aprendiendo.
 * La dificultad no es la señal de que vas mal. Es la señal de que vas.
 */

import { greeting, plural } from './util.js';

/* ---------------------------------- HOY ---------------------------------- */

export function todayTitle({ carried = 0 } = {}) {
  if (carried >= 3) return 'SIGUES DEBIENDO TRABAJO';
  if (carried > 0) return 'TIENES CUENTAS ABIERTAS';
  return greeting();
}

export function todaySub({ carried = 0, oneThing = null, commitments = 0, cap = 5, doneToday = 0, inbox = 0 }) {
  if (carried > 0) return 'Empieza por lo que ya deberías haber hecho.';
  if (!oneThing) return 'No has elegido nada. Elegir también es el trabajo.';
  if (commitments > cap) return 'Do less. Do what matters.';
  if (doneToday > 0 && commitments === 0) return 'Has despejado el día. Elige lo siguiente.';
  if (inbox > 6) return 'Primero decide. Una lista sin decidir no es un plan.';
  return 'What must be done today?';
}

/* --------------------------------- INBOX --------------------------------- */

export function inboxLine(n) {
  if (n === 0) return 'Clear mind. Clear system.';
  if (n === 1) return 'Una decisión pendiente. Tómala.';
  if (n > 15) return `${n} decisiones sin tomar. Capturar no es trabajar.`;
  if (n > 6) return `${n} cosas esperando a que decidas qué son.`;
  return `${plural(n, 'cosa', 'cosas')} sin aclarar.`;
}

/* ------------------------------ NEXT ACTIONS ----------------------------- */

export function nextLine(n) {
  if (n === 0) return 'Ninguna acción definida. Nada avanza solo.';
  if (n > 30) return `${n} acciones. Tener la lista larga no es tenerlo controlado.`;
  if (n > 15) return `${n} acciones. Solo una importa ahora.`;
  return '¿Cuál es la siguiente acción física y concreta?';
}

/* ------------------------------ WAITING FOR ------------------------------ */

export function waitingLine(total, vencidas) {
  if (total === 0) return 'No dependes de nadie. Ninguna excusa prestada.';
  if (vencidas > 0) return `${plural(vencidas, 'seguimiento vencido', 'seguimientos vencidos')}. Delegar no es olvidar.`;
  return 'Lo que no depende de ti sigue siendo responsabilidad tuya.';
}

/* -------------------------------- SOMEDAY -------------------------------- */

export function somedayLine(n) {
  if (n === 0) return 'Nada aparcado. Todo lo que tienes, lo tienes delante.';
  if (n > 25) return `${n} cosas que dijiste que quizá. Casi todas son un no.`;
  if (n > 10) return `${n} ideas guardadas. Guardar no cuesta nada; por eso se acumulan.`;
  return 'Ideas que no reclaman acción hoy.';
}

/* ------------------------------ ANOTACIONES ------------------------------ */

export function notesLine(total, fijadas) {
  if (total === 0) return 'El archivo está vacío. Lo que no es acción también necesita un sitio.';
  if (fijadas > 0) return `${fijadas} fijada${fijadas === 1 ? '' : 's'} de ${total}. Lo que consultas, arriba.`;
  if (total > 40) return `${total} anotaciones. Guardar es fácil; consultar es lo que cuenta.`;
  return 'Información, no trabajo. Aquí no hay nada que hacer.';
}

/* ------------------------------- PROYECTOS ------------------------------- */

export function projectsLine(total, parados) {
  if (total === 0) return 'Ningún resultado en marcha.';
  if (parados > 0) return `${plural(parados, 'proyecto sin siguiente acción', 'proyectos sin siguiente acción')}. Eso no es un plan, es un deseo.`;
  return 'Todos los proyectos tienen siguiente acción. Ahora ejecútalas.';
}

/* -------------------------------- TABLERO -------------------------------- */

export function boardLine({ inbox = 0, next = 0, waiting = 0, someday = 0, done = 0 }) {
  if (inbox > next && inbox > 2) return 'Tienes más sin decidir que decidido.';
  if (next === 0 && (waiting || someday)) return 'Todo está esperando o aparcado. Nada está en marcha.';
  if (someday > next * 3 && someday > 6) return 'Aparcas más de lo que haces.';
  if (done === 0 && next > 0) return 'Nada cerrado todavía. Mueve algo a HECHO.';
  return 'Cada tarjeta que mueves es una decisión, no una animación.';
}

/* -------------------------------- REVISIÓN ------------------------------- */

export function reviewLine(rate) {
  if (rate === null) return 'Todavía no te has comprometido a nada medible.';
  if (rate === 100) return 'Cumpliste todo lo que dijiste. Sube el listón.';
  if (rate >= 80) return 'Casi todo. La diferencia está en lo que evitaste.';
  if (rate >= 50) return 'La mitad de tu palabra vale. La otra mitad, no.';
  return 'Dijiste una cosa e hiciste otra. Ese es el dato.';
}

/* --------------------------------- FOCUS --------------------------------- */

export const focusStart = () => 'Stop negotiating. Start.';

export function focusHard(t) {
  const veces = (t && t.postponeCount) || 0;
  if (veces >= 3) return 'Llevas huyendo de esto. Aquí se acaba.';
  if (veces >= 1) return 'Ya la esquivaste antes. Hoy no.';
  return 'Si cuesta, es que estás aprendiendo.';
}

export function focusDone(t) {
  const veces = (t && t.postponeCount) || 0;
  if (veces >= 3) return 'Costó semanas. Ya no está.';
  if (veces >= 1) return 'La evitaste y aun así la cerraste.';
  return 'Done. Next.';
}

/* ------------------------------ DIFICULTAD ------------------------------- */

/** Lo dificil no es la señal de que vas mal. Es la señal de que vas. */
export function difficulty(t) {
  const carga = ((t && t.postponeCount) || 0);
  if (carga >= 4) return 'Esto lleva meses ganándote. Hoy se decide.';
  if (carga >= 2) return 'Cuesta porque es la que importa.';
  if (carga >= 1) return 'Si cuesta, es que estás aprendiendo.';
  return null;
}

/* -------------------------------- VACÍOS --------------------------------- */

export const emptyToday = () => 'Nada comprometido. Un día sin decisión es un día perdido.';
export const emptyBoard = () => 'Tablero vacío. Captura algo y decide qué es.';
export const emptyCalendar = () => 'Sin nada programado.';
