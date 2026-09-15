/* Busqueda instantanea: tareas, proyectos, personas, contextos y notas. */

import { add, h, focusSoon, relDate } from './util.js';
import * as S from './store.js';
import { openSheet, closeTop, openEditor } from './components.js';

const LIMIT = 40;

const norm = (s) => String(s || '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '');

const STATUS_LABEL = {
  inbox: 'BANDEJA', next: 'SIGUIENTE', scheduled: 'AGENDA', waiting: 'ESPERA',
  someday: 'ALGÚN DÍA', reference: 'ANOTACIÓN', done: 'HECHA',
};

function collect(query) {
  const q = norm(query);
  if (!q) return [];
  const out = [];

  for (const t of S.state.tasks) {
    const hay = norm(`${t.title} ${t.notes} ${t.context || ''} ${t.waitingFor || ''}`);
    if (!hay.includes(q)) continue;
    out.push({
      kind: STATUS_LABEL[t.status] || 'TAREA',
      title: t.title,
      meta: [t.context, t.dueDate ? relDate(t.dueDate) : null].filter(Boolean).join(' · '),
      rank: t.completed ? 3 : 0,
      go: () => { closeTop(); openEditor(t.id); },
    });
  }

  for (const p of S.state.projects) {
    if (!norm(`${S.projectLabel(p)} ${p.outcome}`).includes(q)) continue;
    out.push({
      kind: 'PROYECTO',
      title: S.projectLabel(p),
      meta: p.status === 'paused' ? 'EN PAUSA' : p.outcome,
      rank: 1,
      go: () => { closeTop(); location.hash = `#/proyectos/${p.id}`; },
    });
  }

  const people = new Set();
  for (const w of S.state.waitings) {
    if (!w.person || people.has(w.person) || !norm(w.person).includes(q)) continue;
    people.add(w.person);
    out.push({
      kind: 'PERSONA',
      title: w.person,
      meta: 'En espera',
      rank: 1,
      go: () => { closeTop(); location.hash = '#/waiting'; },
    });
  }

  for (const c of S.allContexts()) {
    if (!norm(c).includes(q)) continue;
    out.push({
      kind: 'CONTEXTO',
      title: c,
      meta: `${S.nextActions({ context: c }).length} acciones`,
      rank: 2,
      go: () => { closeTop(); location.hash = `#/next/${encodeURIComponent(c)}`; },
    });
  }

  return out.sort((a, b) => a.rank - b.rank).slice(0, LIMIT);
}

export function open(initial = '') {
  let items = [];
  let cursor = 0;

  const input = h('input', {
    class: 'search-input',
    type: 'text',
    placeholder: 'Buscar…',
    'data-autofocus': '',
    autocomplete: 'off',
    spellcheck: 'false',
    value: initial,
  });
  const results = h('div', { class: 'search-results' });

  const paint = () => {
    results.textContent = '';
    if (!items.length) {
      const q = input.value.trim();
      add(results, h('div', { class: 'sr' },
        h('div', { class: 'sr-kind', text: q ? 'NADA' : '' }),
        h('div', { class: 'sr-title', text: q ? 'Sin resultados. ENTER para capturarlo en el inbox.' : 'Escribe para buscar.' })));
      return;
    }
    items.forEach((it, i) => {
      const row = h('div', { class: `sr${i === cursor ? ' on' : ''}` },
        h('div', { class: 'sr-kind', text: it.kind }),
        h('div', { class: 'sr-title', text: it.title }),
        it.meta ? h('div', { class: 'sr-meta', text: it.meta }) : null);
      row.addEventListener('click', it.go);
      add(results, row);
    });
  };

  const refresh = () => { items = collect(input.value); cursor = 0; paint(); };

  input.addEventListener('input', refresh);
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(cursor + 1, items.length - 1); paint(); scrollTo(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(cursor - 1, 0); paint(); scrollTo(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (items[cursor]) items[cursor].go();
      else if (input.value.trim()) { await S.capture(input.value.trim()); closeTop(); }
    }
  });

  const scrollTo = () => {
    const el = results.children[cursor];
    if (el) el.scrollIntoView({ block: 'nearest' });
  };

  const node = h('div', { class: 'sheet', style: 'margin-top:9vh' },
    input,
    h('div', { style: 'height:1px;background:var(--line)' }),
    results);

  openSheet(node);
  refresh();
  focusSoon(input);
}
