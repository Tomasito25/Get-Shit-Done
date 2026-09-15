/*
 * Captura enriquecida sin formularios.
 *
 * Se escribe una linea y ya. Los detalles van dentro del propio texto:
 *
 *   Comprar PLA @calle !mañana
 *   Revisar el analisis #fisica !!
 *   Sacar la basura *lun,mie,vie
 *   Entregar la memoria ^20/09
 *
 *   @  contexto        !  fecha planificada     #  proyecto (#P04 o nombre)
 *   *  repeticion      ^  fecha tope            %  aviso (%9:00, %mañana-18)
 *   !! no negociar
 *
 * Nada que no se entienda se queda en el titulo: aqui no se pierde texto.
 */

import { today, addDays, iso, parseISO } from './util.js';

const DIAS = {
  dom: 0, domingo: 0,
  lun: 1, lunes: 1,
  mar: 2, martes: 2,
  mie: 3, miercoles: 3,
  jue: 4, jueves: 4,
  vie: 5, viernes: 5,
  sab: 6, sabado: 6,
};

const limpio = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

/* --------------------------------- Fechas -------------------------------- */

export function parseDate(raw) {
  const v = limpio(raw);
  if (!v) return null;

  if (v === 'hoy') return today();
  if (v === 'manana' || v === 'man') return addDays(today(), 1);
  if (v === 'pasado') return addDays(today(), 2);

  // +3d  /  3d  /  +2s (semanas)
  let m = v.match(/^\+?(\d{1,3})([ds])?$/);
  if (m) return addDays(today(), Number(m[1]) * (m[2] === 's' ? 7 : 1));

  // Próximo lunes, martes…
  if (DIAS[v] !== undefined) {
    const objetivo = DIAS[v];
    for (let i = 1; i <= 7; i += 1) {
      const d = addDays(today(), i);
      if (parseISO(d).getDay() === objetivo) return d;
    }
  }

  // 2026-09-12
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const d = parseISO(v);
    return Number.isNaN(d.getTime()) ? null : v;
  }

  // 12/09  ·  12-09  ·  12/09/2026
  m = v.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (m) {
    const dia = Number(m[1]);
    const mes = Number(m[2]) - 1;
    let anio = m[3] ? Number(m[3]) : parseISO(today()).getFullYear();
    if (anio < 100) anio += 2000;
    const d = new Date(anio, mes, dia);
    if (d.getMonth() !== mes || d.getDate() !== dia) return null;
    // Sin año explícito y ya pasada: se entiende el año que viene.
    if (!m[3] && iso(d) < today()) d.setFullYear(anio + 1);
    return iso(d);
  }
  return null;
}

/* ------------------------------- Repeticion ------------------------------ */

export function parseRecurrence(raw) {
  const v = limpio(raw);
  if (!v) return null;

  if (['diario', 'dia', 'd', 'cada-dia'].includes(v)) return { kind: 'daily' };
  if (['semanal', 'semana', 's'].includes(v)) return { kind: 'interval', n: 7 };
  if (['mensual', 'mes'].includes(v)) return { kind: 'monthly', day: 1 };

  // mes-15  ·  dia-15   (día concreto de cada mes)
  let m = v.match(/^(?:mes|dia)-(\d{1,2})$/);
  if (m) return { kind: 'monthly', day: Number(m[1]) };

  // 3d  ·  cada-3d  ·  3   (cada N días)
  m = v.match(/^(?:cada-)?(\d{1,3})d?$/);
  if (m) return { kind: 'interval', n: Number(m[1]) };

  // lun,mie,vie
  const partes = v.split(/[,+]/).filter(Boolean);
  if (partes.length && partes.every((p) => DIAS[p] !== undefined)) {
    return { kind: 'weekdays', days: [...new Set(partes.map((p) => DIAS[p]))].sort() };
  }
  return null;
}

/* --------------------------------- Avisos -------------------------------- */

/**
 * «%9», «%18:30», «%mañana-9», «%lun-18», «%12/09-9:15».
 * Devuelve { day, time } sin resolver: el día definitivo depende de si la
 * línea trae fecha de acción, y eso se sabe al final del análisis.
 */
export function parseReminder(raw) {
  const v = limpio(raw);
  if (!v) return null;
  const m = v.match(/^(?:(.+)-)?(\d{1,2})(?::(\d{2}))?$/);
  if (!m) return null;
  const hh = Number(m[2]);
  const mm = m[3] ? Number(m[3]) : 0;
  if (hh > 23 || mm > 59) return null;
  const day = m[1] ? parseDate(m[1]) : null;
  if (m[1] && !day) return null;
  return { day, time: `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` };
}

/** Día del aviso: el escrito, o el de acción, o hoy (mañana si la hora ya pasó). */
export function resolveReminder(r, dueDate = null) {
  if (!r) return null;
  if (r.day) return `${r.day}T${r.time}`;
  if (dueDate) return `${dueDate}T${r.time}`;
  const ahora = new Date();
  const hhmm = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
  return `${r.time > hhmm ? today() : addDays(today(), 1)}T${r.time}`;
}

/* -------------------------------- Contexto ------------------------------- */

function normContext(valor, contextos) {
  const bruto = `@${String(valor).replace(/^@+/, '')}`;
  const encontrado = contextos.find((c) => limpio(c) === limpio(bruto));
  return encontrado || bruto.toLowerCase();
}

function matchProject(valor, proyectos) {
  const codigo = /^p(\d{1,3})$/i.exec(String(valor).trim());
  if (codigo) {
    const n = Number(codigo[1]);
    const exacto = proyectos.find((p) => p.code && Number(p.code.slice(1)) === n);
    if (exacto) return exacto;
  }
  const v = limpio(valor).replace(/[-_]/g, ' ');
  if (!v) return null;
  return proyectos.find((p) => limpio(p.name) === v)
    || proyectos.find((p) => limpio(p.name).startsWith(v))
    || proyectos.find((p) => limpio(p.name).includes(v))
    || null;
}

/* --------------------------------- Parser -------------------------------- */

export function parseCapture(raw, { projects = [], contexts = [] } = {}) {
  const out = {
    title: '',
    context: null,
    projectId: null,
    projectName: null,
    dueDate: null,
    deadline: null,
    reminder: null,
    recurrence: null,
    isCommitment: false,
  };
  let aviso = null;

  const resto = [];
  for (const palabra of String(raw || '').split(/\s+/).filter(Boolean)) {
    if (palabra === '!!') { out.isCommitment = true; continue; }

    const marca = palabra[0];
    const valor = palabra.slice(1);
    if (!valor) { resto.push(palabra); continue; }

    if (marca === '@') { out.context = normContext(valor, contexts); continue; }
    if (marca === '#') {
      const p = matchProject(valor, projects);
      if (p) out.projectId = p.id;
      else out.projectName = valor.replace(/[-_]/g, ' ');
      continue;
    }
    if (marca === '!') {
      const d = parseDate(valor);
      if (d) { out.dueDate = d; continue; }
      resto.push(palabra);
      continue;
    }
    if (marca === '*') {
      const r = parseRecurrence(valor);
      if (r) { out.recurrence = r; continue; }
      resto.push(palabra);
      continue;
    }
    if (marca === '^') {
      const d = parseDate(valor);
      if (d) { out.deadline = d; continue; }
      resto.push(palabra);
      continue;
    }
    if (marca === '%') {
      const r = parseReminder(valor);
      if (r) { aviso = r; continue; }
      resto.push(palabra);
      continue;
    }
    resto.push(palabra);
  }

  out.title = resto.join(' ').trim();
  out.reminder = resolveReminder(aviso, out.dueDate);
  return out;
}

/** Lo entendido, en una linea, para que el usuario lo vea antes de guardar. */
export function describe(parsed, { projects = [], recurrenceLabel = () => '' } = {}) {
  const bits = [];
  if (parsed.dueDate) bits.push(fechaCorta(parsed.dueDate));
  if (parsed.deadline) bits.push(`TOPE ${fechaCorta(parsed.deadline)}`);
  if (parsed.context) bits.push(parsed.context);
  if (parsed.projectId) {
    const p = projects.find((x) => x.id === parsed.projectId);
    if (p) bits.push(`${p.code ? `${p.code}-` : ''}${p.name}`);
  } else if (parsed.projectName) {
    bits.push(`${parsed.projectName} (proyecto nuevo)`);
  }
  if (parsed.reminder) bits.push(`AVISO ${fechaCorta(parsed.reminder.slice(0, 10))} ${parsed.reminder.slice(11, 16)}`);
  if (parsed.recurrence) bits.push(recurrenceLabel(parsed.recurrence));
  if (parsed.isCommitment) bits.push('NO NEGOCIAR');
  return bits.join('  ·  ');
}

function fechaCorta(d) {
  const diff = Math.round((parseISO(d) - parseISO(today())) / 86400000);
  if (diff === 0) return 'HOY';
  if (diff === 1) return 'MAÑANA';
  if (diff < 0) return `HACE ${-diff}D`;
  if (diff <= 7) return `+${diff}D`;
  return d;
}
