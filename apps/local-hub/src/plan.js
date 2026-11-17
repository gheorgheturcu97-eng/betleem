// Planning: upcoming services (each with its own program), departments with positions,
// volunteers, and who serves where. One plan per church. Personal data (phones) is only
// served over HTTP to leaders, never broadcast to the screens or phones.

import crypto from 'node:crypto';

const id = () => crypto.randomUUID();
const KINDS = ['song', 'sermon', 'prayer', 'announcement', 'reading', 'other'];
const STATUS = ['pending', 'confirmed', 'declined'];

export function defaultPlan() {
  const dept = (name, color, positions) => ({ id: id(), name, color, positions: positions.map(([n, needed = 1]) => ({ id: id(), name: n, needed })) });
  return {
    services: [],
    departments: [
      dept('Închinare', '#f5b301', [['Lider închinare'], ['Vocal', 2], ['Chitară'], ['Clape'], ['Bas'], ['Tobe']]),
      dept('Media', '#3fa7ff', [['Proiecție'], ['Sunet'], ['Live stream']]),
      dept('Program', '#c58cff', [['Moderator'], ['Predicator']]),
      dept('Ospitalitate', '#2ecc71', [['Primire la ușă', 2], ['Cafea']]),
      dept('Copii', '#ff7a59', [['Învățător școala duminicală']]),
      dept('Follow-up', '#ff5aa5', [['Contactare oaspeți noi']]),
    ],
    volunteers: [],
  };
}

/** Next `n` Sundays at `time` starting from `from` (local time). */
export function nextSundays(from = new Date(), n = 8, time = '10:00') {
  const [h, m] = time.split(':').map(Number);
  const d = new Date(from); d.setHours(h, m, 0, 0);
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
  if (d < from) d.setDate(d.getDate() + 7);
  const out = [];
  for (let i = 0; i < n; i++) { out.push(new Date(d)); d.setDate(d.getDate() + 7); }
  return out;
}

const str = (v, max = 120) => String(v ?? '').trim().slice(0, max);

function cleanItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 80).map(it => ({
    id: it.id || id(),
    kind: KINDS.includes(it.kind) ? it.kind : 'other',
    songId: it.kind === 'song' ? str(it.songId, 40) : undefined,
    title: str(it.title), key: str(it.key, 8), leader: str(it.leader, 60), notes: str(it.notes, 300),
    minutes: Math.min(240, Math.max(0, Number(it.minutes) || 0)),
    ...(Array.isArray(it.arrangement) ? { arrangement: it.arrangement.map(x => str(x, 40)) } : {}),
    ...(it.maxLines ? { maxLines: it.maxLines } : {}), ...(it.background ? { background: str(it.background, 200) } : {}),
  }));
}

/**
 * Apply one planning change. Returns an error message or null.
 * plan is mutated in place.
 */
export function applyPlanOp(plan, op) {
  const svc = () => plan.services.find(s => s.id === op.id);
  switch (op.op) {
    case 'addSundays': {
      const have = new Set(plan.services.map(s => s.date.slice(0, 10)));
      for (const d of nextSundays(new Date(), Math.min(26, Number(op.count) || 8), op.time || '10:00')) {
        const iso = d.toISOString();
        if (!have.has(iso.slice(0, 10))) plan.services.push({ id: id(), date: iso, title: 'Serviciu duminică', status: 'draft', items: [], assignments: {} });
      }
      break;
    }
    case 'addService': {
      const date = new Date(op.date); if (isNaN(date)) return 'Dată invalidă';
      plan.services.push({ id: id(), date: date.toISOString(), title: str(op.title) || 'Serviciu', status: 'draft', items: [], assignments: {} });
      break;
    }
    case 'updateService': {
      const s = svc(); if (!s) return 'Serviciul nu există';
      if (op.title !== undefined) s.title = str(op.title) || s.title;
      if (op.date !== undefined) { const d = new Date(op.date); if (!isNaN(d)) s.date = d.toISOString(); }
      if (STATUS.concat(['draft', 'published']).includes(op.status)) s.status = op.status;
      if (op.notes !== undefined) s.notes = str(op.notes, 1000);
      break;
    }
    case 'deleteService': plan.services = plan.services.filter(s => s.id !== op.id); break;
    case 'copyItems': {                                  // copy the program from another service
      const s = svc(), from = plan.services.find(x => x.id === op.from); if (!s || !from) return 'Serviciul nu există';
      s.items = cleanItems(from.items.map(i => ({ ...i, id: undefined })));
      break;
    }
    case 'setItems': { const s = svc(); if (!s) return 'Serviciul nu există'; s.items = cleanItems(op.items); break; }
    case 'assign': {
      const s = svc(); if (!s) return 'Serviciul nu există';
      const key = `${str(op.position, 40)}#${Number(op.slot) || 0}`;
      if (!op.volunteer) delete s.assignments[key];
      else s.assignments[key] = { volunteer: str(op.volunteer, 40), status: STATUS.includes(op.status) ? op.status : 'pending' };
      break;
    }
    case 'saveDepartment': {
      const d = op.department || {};
      const clean = { id: d.id || id(), name: str(d.name) || 'Departament', color: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#8c929a',
        positions: (d.positions || []).slice(0, 30).map(p => ({ id: p.id || id(), name: str(p.name) || 'Poziție', needed: Math.min(10, Math.max(1, Number(p.needed) || 1)) })) };
      const i = plan.departments.findIndex(x => x.id === clean.id);
      if (i >= 0) plan.departments[i] = clean; else plan.departments.push(clean);
      break;
    }
    case 'deleteDepartment': plan.departments = plan.departments.filter(d => d.id !== op.id); break;
    case 'saveVolunteer': {
      const v = op.volunteer || {};
      if (!str(v.name)) return 'Scrie numele';
      const clean = { id: v.id || id(), name: str(v.name, 80), phone: str(v.phone, 30), email: str(v.email, 120),
        positions: (v.positions || []).map(p => str(p, 40)).slice(0, 40),
        away: (v.away || []).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)).slice(0, 60) };
      const i = plan.volunteers.findIndex(x => x.id === clean.id);
      if (i >= 0) plan.volunteers[i] = clean; else plan.volunteers.push(clean);
      break;
    }
    case 'deleteVolunteer': {
      plan.volunteers = plan.volunteers.filter(v => v.id !== op.id);
      for (const s of plan.services) for (const k of Object.keys(s.assignments)) if (s.assignments[k].volunteer === op.id) delete s.assignments[k];
      break;
    }
    default: return 'Operație necunoscută';
  }
  plan.services.sort((a, b) => a.date.localeCompare(b.date));
  return null;
}

/** Warnings for a service: same person twice, people marked away, empty positions. */
export function serviceWarnings(plan, s) {
  const out = [];
  const day = s.date.slice(0, 10);
  const seen = new Map();
  for (const [key, a] of Object.entries(s.assignments)) {
    const v = plan.volunteers.find(x => x.id === a.volunteer); if (!v) continue;
    if (seen.has(v.id)) out.push(`${v.name} e pus de două ori`);
    seen.set(v.id, key);
    if ((v.away || []).includes(day)) out.push(`${v.name} a spus că lipsește în ziua asta`);
  }
  let empty = 0;
  for (const d of plan.departments) for (const p of d.positions) for (let i = 0; i < p.needed; i++) if (!s.assignments[`${p.id}#${i}`]) empty++;
  if (empty) out.push(`${empty} poziții neocupate`);
  return out;
}
