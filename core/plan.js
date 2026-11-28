// Planning: upcoming services (each with its own program), departments with positions,
// volunteers, and who serves where. One plan per church. Personal data (phones) is only
// served over HTTP to leaders, never broadcast to the screens or phones.

// No Node-only imports: the same file runs in the browser too (Reverb online copies it to apps/web/core/plan.js).
const id = () => globalThis.crypto.randomUUID();
const KINDS = ['song', 'sermon', 'prayer', 'announcement', 'reading', 'other', 'media', 'bible'];
const STATUS = ['pending', 'confirmed', 'declined', 'leave'];   // leave = confirmed, asked to be taken off (the leader decides)
const YSTATUS = ['realizat', 'in_curs', 'planificat', 'propunere', 'de_confirmat'];
/** A personal link for each volunteer (no password): long, random, can be replaced to cancel the old one. */
export const newToken = () => btoa(String.fromCharCode(...globalThis.crypto.getRandomValues(new Uint8Array(18))))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ym = iso => String(iso).slice(0, 7);
/** Why this person cannot serve in this service (blocked day, monthly limit), or '' if they can. */
export function cannotServe(plan, s, volunteerId, exceptKey) {
  const v = plan.volunteers.find(x => x.id === volunteerId); if (!v) return '';
  if ((v.away || []).includes(s.date.slice(0, 10))) return `${v.name} a blocat ziua asta`;
  if (v.maxPerMonth > 0) {
    const days = new Set();
    for (const x of plan.services) if (ym(x.date) === ym(s.date) && x.id !== s.id && Object.values(x.assignments).some(a => a.volunteer === v.id && a.status !== 'declined')) days.add(x.id);
    if (Object.entries(s.assignments).some(([k, a]) => k !== exceptKey && a.volunteer === v.id)) return '';   // already serves in this service: same day
    if (days.size >= v.maxPerMonth) return `${v.name} slujește maxim ${v.maxPerMonth} ${v.maxPerMonth === 1 ? 'dată' : 'ori'} pe lună (limita lui)`;
  }
  return '';
}

/** How many people this position needs in this service: the service's own choice (✕ = 0, + = more),
 *  else the department's standard (an optional position, e.g. „Chitară 2”, is 0 until it is added). */
export const needFor = (s, p) => s?.need && s.need[p.id] !== undefined ? s.need[p.id] : (p.optional ? 0 : p.needed);
/** Every place of a service: [{ d, p, k: 'positionId#slot' }] */
export const placesOf = (plan, s) => plan.departments.flatMap(d => d.positions.flatMap(p => Array.from({ length: needFor(s, p) }, (_, i) => ({ d, p, k: `${p.id}#${i}` }))));
/** 🔔 how urgent an unanswered place is: 0 calm · 1 yellow (3 days before) · 2 orange (2 days) · 3 red (the day before / the day) */
export function urgency(serviceDate, now = new Date()) {
  const a = new Date(serviceDate), b = new Date(now); a.setHours(0, 0, 0, 0); b.setHours(0, 0, 0, 0);
  const days = Math.round((a - b) / 864e5);
  return days < 0 ? 0 : days <= 1 ? 3 : days === 2 ? 2 : days === 3 ? 1 : 0;
}
/** ⏱ the same colours for time everywhere: 0 fine · 1 yellow (75 % used) · 2 orange (90 %) · 3 red (over) */
export const timeLevel = (usedSec, plannedSec) => !plannedSec ? 0 : usedSec > plannedSec ? 3 : usedSec >= plannedSec * 0.9 ? 2 : usedSec >= plannedSec * 0.75 ? 1 : 0;

export function defaultPlan() {
  const dept = (name, color, positions) => ({ id: id(), name, color, positions: positions.map(([n, needed = 1, optional]) => ({ id: id(), name: n, needed, ...(optional ? { optional: true } : {}) })) });
  return {
    services: [],
    departments: [
      dept('Închinare', '#f5b301', [['Lider închinare'], ['Vocal', 2], ['Chitară acustică'], ['Chitară electrică'], ['Pian / clape'], ['Bas'], ['Tobe'],
        ['Chitară 2', 1, true], ['Vocal 3', 1, true], ['Vioară', 1, true], ['Pad / synth', 1, true]]),
      dept('Media', '#3fa7ff', [['Sunet'], ['Live stream'], ['Versuri (proiecție)'], ['Camera 1'], ['Camera 2', 1, true]]),
      dept('Social media', '#ff5aa5', [['Foto'], ['Reels / video', 1, true], ['Postări', 1, true]]),
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

const SHOWS = it => it.kind !== 'song' && it.kind !== 'bible';
function cleanItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 80).map(it => ({
    id: it.id || id(),
    kind: KINDS.includes(it.kind) ? it.kind : 'other',
    songId: it.kind === 'song' ? str(it.songId, 40) : undefined,
    title: str(it.title), key: str(it.key, 8), leader: str(it.leader, 60), notes: str(it.notes, 300),
    minutes: Math.min(240, Math.max(0, Number(it.minutes) || 0)),
    ...(Array.isArray(it.arrangement) ? { arrangement: it.arrangement.map(x => str(x, 40)) } : {}),
    ...(Array.isArray(it.stages) ? { stages: it.stages.map(x => str(x, 4)).slice(0, 4) } : {}),
    ...(it.maxLines ? { maxLines: it.maxLines } : {}), ...(it.background ? { background: str(it.background, 200) } : {}),
    ...(it.kind === 'bible' && it.ref ? { ref: { book: +it.ref.book || 0, chapter: +it.ref.chapter || 1, from: +it.ref.from || 0, to: +it.ref.to || 0 }, versions: (it.versions || []).slice(0, 2).map(x => str(x, 12)) } : {}),
    ...(it.autoAdvance ? { autoAdvance: Math.min(600, Math.max(2, +it.autoAdvance || 0)), loop: !!it.loop } : {}),
    // slides: a presentation, or one attached to a sermon / announcements / other moment
    ...(SHOWS(it) && Array.isArray(it.slides) ? { slides: it.slides.slice(0, 400).map(x => str(x, 200)).filter(x => x.startsWith('/media/')) } : {}),
    ...(SHOWS(it) && Array.isArray(it.transitions) && it.transitions.length === it.slides?.length ? { transitions: it.transitions } : {}),
    ...(SHOWS(it) && Array.isArray(it.advance) && it.advance.length === it.slides?.length ? { advance: it.advance } : {}),
  }));
}

/**
 * Apply one planning change. Returns an error message or null.
 * plan is mutated in place.
 */
export function applyPlanOp(plan, op) {
  const svc = () => plan.services.find(s => s.id === op.id);
  plan.meetings ||= []; plan.tasks ||= [];
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
      if (from.need) s.need = { ...from.need }; else delete s.need;          // the same posts as there (✕ / + per service)
      break;
    }
    case 'setItems': { const s = svc(); if (!s) return 'Serviciul nu există'; s.items = cleanItems(op.items); break; }
    case 'assign': {
      const s = svc(); if (!s) return 'Serviciul nu există';
      const key = `${str(op.position, 40)}#${Number(op.slot) || 0}`;
      if (op.volunteer && s.assignments[key]?.volunteer !== op.volunteer) { const why = cannotServe(plan, s, op.volunteer, key); if (why) return why; }
      if (!op.volunteer) delete s.assignments[key];
      else s.assignments[key] = { volunteer: str(op.volunteer, 40), status: STATUS.includes(op.status) ? op.status : 'pending' };
      break;
    }
    case 'saveDepartment': {
      const d = op.department || {};
      const clean = { id: d.id || id(), name: str(d.name) || 'Departament', color: /^#[0-9a-f]{6}$/i.test(d.color) ? d.color : '#8c929a',
        positions: (d.positions || []).slice(0, 30).map(p => ({ id: p.id || id(), name: str(p.name) || 'Poziție', needed: Math.min(10, Math.max(1, Number(p.needed) || 1)), ...(p.optional ? { optional: true } : {}) })) };
      const i = plan.departments.findIndex(x => x.id === clean.id);
      if (i >= 0) plan.departments[i] = clean; else plan.departments.push(clean);
      break;
    }
    // ✕ / + a position in ONE service (the church's standard stays): „only acoustic and piano tonight”, „Camera 2 this time”.
    // A new name („Chitară 2”) becomes an optional position of the department, ready for other services too.
    case 'setNeed': {
      const s = svc(); if (!s) return 'Serviciul nu există';
      let p = plan.departments.flatMap(d => d.positions).find(x => x.id === op.position);
      if (!p && op.name) {
        const d = plan.departments.find(x => x.id === op.department); if (!d) return 'Departamentul nu există';
        p = d.positions.find(x => str(x.name).toLowerCase() === str(op.name).toLowerCase());
        if (!p) { if (d.positions.length >= 30) return 'Prea multe posturi'; p = { id: id(), name: str(op.name, 40), needed: 1, optional: true }; d.positions.push(p); }
      }
      if (!p) return 'Postul nu există';
      const n = Math.min(10, Math.max(0, Math.round(Number(op.needed) || 0)));
      s.need ||= {};
      if (n === (p.optional ? 0 : p.needed)) delete s.need[p.id]; else s.need[p.id] = n;
      if (!Object.keys(s.need).length) delete s.need;
      for (const k of Object.keys(s.assignments)) { const [pid, slot] = k.split('#'); if (pid === p.id && +slot >= n) delete s.assignments[k]; }   // the people of a removed place are freed
      op.position = p.id;
      break;
    }
    // 🔒 the lyrics code (Reverb online): only its fingerprint is kept; musicians type it before changing words / slides
    case 'setLyricsPin': {
      const k = op.pin;
      if (k && /^[0-9a-f-]{36}$/.test(k.salt) && /^[0-9a-f]{64}$/.test(k.hash)) plan.lyricsPin = { salt: k.salt, hash: k.hash }; else delete plan.lyricsPin;
      break;
    }
    // 👁 someone who only looks (Reverb online): sees the program, answers his own place; no Proiectez / MD & Track, no editing
    case 'setViewOnly': {
      const u = str(op.user, 40); if (!u) return 'Lipsește omul';
      const set = new Set(plan.viewOnly || []); op.on ? set.add(u) : set.delete(u);
      if (set.size) plan.viewOnly = [...set]; else delete plan.viewOnly;
      break;
    }
    case 'deleteDepartment': plan.departments = plan.departments.filter(d => d.id !== op.id); break;
    case 'saveVolunteer': {
      const v = op.volunteer || {};
      if (!str(v.name)) return 'Scrie numele';
      const old = plan.volunteers.find(x => x.id === v.id);
      const clean = { id: v.id || id(), name: str(v.name, 80), phone: str(v.phone, 30), email: str(v.email, 120),
        positions: (v.positions || []).map(p => str(p, 40)).slice(0, 40),
        away: [...new Set((v.away || []).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)))].sort().slice(0, 120),
        maxPerMonth: Math.min(8, Math.max(0, Math.round(Number(v.maxPerMonth) || 0))),     // 0 = no limit
        ...(old?.offer ? { offer: old.offer, offerFrom: old.offerFrom, offerTo: old.offerTo } : {}),   // 🗓 what he said he can do (Reverb online)
        leader: !!v.leader,                                                                   // sees the leaders' meetings and tasks on his page
        photographer: !!v.photographer,                                                       // 📷 may upload event photos from his page
        token: old?.token || newToken() };
      const i = plan.volunteers.findIndex(x => x.id === clean.id);
      if (i >= 0) plan.volunteers[i] = clean; else plan.volunteers.push(clean);
      break;
    }
    case 'newLink': { const v = plan.volunteers.find(x => x.id === op.volunteer); if (!v) return 'Voluntarul nu există'; v.token = newToken(); break; }
    // 🗓 the leaders' meeting (e.g. Tuesday): an agenda everyone sees before, notes, and tasks with who / until when
    case 'saveMeeting': {
      const m = op.meeting || {}, d = new Date(m.date); if (isNaN(d)) return 'Dată invalidă';
      const clean = { id: m.id || id(), title: str(m.title) || 'Întâlnirea liderilor', date: d.toISOString(), notes: str(m.notes, 5000),
        agenda: (m.agenda || []).slice(0, 60).map(a => ({ id: a.id || id(), text: str(a.text, 300), done: !!a.done })).filter(a => a.text) };
      const i = plan.meetings.findIndex(x => x.id === clean.id);
      if (i >= 0) plan.meetings[i] = clean; else plan.meetings.push(clean);
      plan.meetings.sort((a, b) => a.date.localeCompare(b.date));
      break;
    }
    case 'deleteMeeting': plan.meetings = plan.meetings.filter(m => m.id !== op.id); break;
    case 'saveTask': {
      const t = op.task || {}; if (!str(t.text)) return 'Scrie ce e de făcut';
      const old = plan.tasks.find(x => x.id === t.id);
      const clean = { id: t.id || id(), text: str(t.text, 300), who: str(t.who, 40), due: /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : '',
        done: !!t.done, meeting: str(t.meeting, 40), code: str(t.code, 20), period: str(t.period, 10), when: str(t.when, 20), status: YSTATUS.includes(t.status) ? t.status : '', focus: ['oameni', 'programe'].includes(t.focus) ? t.focus : '', goal: str(t.goal, 40), at: old?.at || new Date().toISOString(), doneAt: t.done ? old?.doneAt || new Date().toISOString() : '' };
      const i = plan.tasks.findIndex(x => x.id === clean.id);
      if (i >= 0) plan.tasks[i] = clean; else plan.tasks.push(clean);
      break;
    }
    case 'deleteTask': plan.tasks = plan.tasks.filter(t => t.id !== op.id); break;
    case 'autoAssign': { const s = svc(); if (!s) return 'Serviciul nu există'; op.filled = autoAssign(plan, s, op.department || ''); break; }
    // 📣 a word from the pastor / leader to the team: everyone, the people of one service, or one department.
    // It shows on each person's own page; the WhatsApp sending stays a click of the leader (free).
    case 'saveMessage': {
      plan.messages ||= [];
      const m = op.message || {}; if (!str(m.text, 2000)) return 'Scrie mesajul';
      const to = ['all', 'service', 'dept'].includes(m.to) ? m.to : 'all';
      plan.messages.unshift({ id: id(), text: str(m.text, 2000), from: str(m.from, 80), to, ref: str(m.ref, 40), at: new Date().toISOString() });
      plan.messages = plan.messages.slice(0, 100);
      break;
    }
    // 🎯 the year's goals: a number to reach (e.g. 52 people told about Jesus), how far we are, and whether it is about people or programs
    case 'saveGoal': {
      plan.goals ||= []; const g = op.goal || {}; if (!str(g.text)) return 'Scrie obiectivul';
      const clean = { id: g.id || id(), text: str(g.text, 200), target: g.target === null || g.target === '' || g.target === undefined ? null : Math.max(1, Math.min(100000, Number(g.target) || 1)),
        done: Math.max(0, Math.min(100000, Number(g.done) || 0)), unit: str(g.unit, 30), focus: ['oameni', 'programe'].includes(g.focus) ? g.focus : '', year: Number(g.year) || new Date().getFullYear(),
        code: str(g.code, 20), period: str(g.period, 10), indicator: str(g.indicator, 200), status: YSTATUS.includes(g.status) ? g.status : '', stages: (g.stages || []).map(x => str(x, 4)).slice(0, 4) };
      const i = plan.goals.findIndex(x => x.id === clean.id); if (i >= 0) plan.goals[i] = clean; else plan.goals.push(clean);
      break;
    }
    // 📅 the church's year plan (theme, periods, stages, series, goals, activities): imported from the pastor's document
    case 'importYear': {
      const d = op.data || {}; if (!d.perioade || !d.obiective) return 'Nu recunosc planul anului (lipsește partea JSON).';
      const L = (a, n = 40) => (Array.isArray(a) ? a : []).slice(0, n);
      plan.year = {
        church: str(d.biserica, 120).replace(/\s+Pe[șs]tera$/i, ''), year: str(d.an, 20), theme: str(d.tema, 120), vision: str(d.viziune, 600), mission: str(d.misiune, 300),
        service: { day: str(d.serviciu?.zi, 20), time: /^\d{1,2}:\d{2}$/.test(d.serviciu?.ora) ? d.serviciu.ora : '' },
        stages: L(d.etape, 8).map(e => ({ id: str(e.id, 4), name: str(e.nume, 40), desc: str(e.descriere, 80), color: /^#[0-9a-f]{6}$/i.test(e.culoare) ? e.culoare : '#888888' })),
        values: L(d.valori, 20).map(v => str(v, 60)),
        periods: L(d.perioade, 12).map(p => ({ id: str(p.id, 6), name: str(p.nume, 80), start: str(p.start, 10), end: str(p.sfarsit, 10), stages: L(p.etape, 4).map(x => str(x, 4)) })),
        series: d.serie_discipline ? { name: str(d.serie_discipline.nume, 80), period: str(d.serie_discipline.perioada, 6), link: /^https:\/\//.test(d.serie_discipline.jurnal_online || '') ? str(d.serie_discipline.jurnal_online, 200) : '',
          weeks: L(d.serie_discipline.saptamani, 60).map(w => ({ n: Number(w.nr) || 0, date: str(w.data, 10), discipline: str(w.disciplina, 80), title: str(w.titlu, 120), text: str(w.text, 60), verse: str(w.verset, 60),
            memory: str(w.verset_memorat, 60), motto: str(w.de_tinut_minte, 120), stages: L(w.etape, 4).map(x => str(x, 4)), status: YSTATUS.includes(w.status) ? w.status : '' })) } : null,
        rhythm: L(d.ritm_saptamanal, 12).map(r => ({ day: str(r.zi, 40), what: str(r.ce, 200) })),
        prayer: L(d.grupuri_rugaciune, 14).map(x => str(x, 60)),
        questions: L(d.intrebari_deschise, 30).map(x => str(x, 300)),
        importedAt: new Date().toISOString(),
      };
      // goals and activities keep their codes (OBJ-1.2, ACT-1.07): a second import updates them instead of doubling
      plan.goals ||= [];
      for (const o of L(d.obiective, 60)) {
        const old = plan.goals.find(g => g.code === o.id), per = plan.year.periods.find(p => p.id === o.perioada);
        applyPlanOp(plan, { op: 'saveGoal', goal: { ...(old || {}), id: old?.id, text: o.titlu, target: o.tinta ?? old?.target ?? null, done: old?.done || 0, unit: old?.unit || '',
          code: o.id, period: o.perioada, indicator: o.indicator, status: o.status, stages: per?.stages || [], focus: old?.focus || (per?.stages || []).some(x => x === 'C' || x === 'T') ? 'oameni' : old?.focus || '' } });
      }
      for (const a of L(d.activitati, 120)) {
        const old = plan.tasks.find(t => t.code === a.id), goal = plan.goals.find(g => g.code === a.obiectiv);
        applyPlanOp(plan, { op: 'saveTask', task: { ...(old || {}), id: old?.id, text: a.titlu, code: a.id, period: a.perioada, status: a.status, when: str(a.data, 20),
          due: /^\d{4}-\d{2}-\d{2}$/.test(a.data || '') ? a.data : old?.due || '', done: a.status === 'realizat' || !!old?.done, goal: goal?.id || '', focus: old?.focus || '' } });
      }
      // the coming Sundays of the series become services with the sermon ready (past ones stay history)
      const [hh, mm] = (plan.year.service.time || '10:00').split(':').map(Number), today = new Date().toISOString().slice(0, 10);
      op.created = 0;
      for (const w of plan.year.series?.weeks || []) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(w.date) || w.date < today) continue;
        const notes = [w.text && 'Text: ' + w.text, w.verse && 'Versetul: ' + w.verse, w.memory && 'De memorat: ' + w.memory, w.motto && 'De ținut minte: ' + w.motto].filter(Boolean).join('\n');
        const title = `${w.discipline}${w.title ? ': ' + w.title : ''}`;
        let sv = plan.services.find(x => x.date.slice(0, 10) === w.date);
        if (!sv) {
          const at = localTime(w.date, hh, mm, op.tz || 'Europe/Bucharest');
          sv = { id: id(), date: at.toISOString(), title: `Duminică · ${w.discipline}`, status: 'draft', items: [], assignments: {}, series: w.n };
          sv.items = [{ id: id(), kind: 'other', title: 'Închinare (cântările se aleg)', minutes: 20 }, { id: id(), kind: 'sermon', title, minutes: 35, notes, stages: w.stages },
            { id: id(), kind: 'other', title: 'Momentul „În sală”', minutes: 10 }, { id: id(), kind: 'announcement', title: 'Foaia de jurnal și provocarea săptămânii', minutes: 5 }];
          plan.services.push(sv); op.created++;
        } else {
          const it = sv.items.find(x => x.kind === 'sermon');
          if (it) { if (!it.notes) it.notes = notes; if (!it.title || /^predic/i.test(it.title)) it.title = title; it.stages = w.stages; }
        }
      }
      plan.services.sort((a, b) => a.date.localeCompare(b.date));
      break;
    }
    case 'deleteGoal': plan.goals = (plan.goals || []).filter(g => g.id !== op.id); break;
    case 'deleteMessage': plan.messages = (plan.messages || []).filter(m => m.id !== op.id); break;
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

/** 🗓 What someone said for a day in "Când pot sluji" (he picks departments; the department's leader picks the post):
 *  'yes' (that department), 'other' (he offered another department that day), 'no' (inside the period he filled, not that day),
 *  '' (he said nothing about it). */
export function offerFor(v, day, departmentId, serviceId = '') {
  if (!v?.offerFrom || day < v.offerFrom || day > v.offerTo) return '';
  // one Sunday can hold several programs (10:00, 18:00…): his answer for that program first, else for the day
  const o = serviceId && v.offer?.['s:' + serviceId] !== undefined ? v.offer['s:' + serviceId] : v.offer?.[day];
  if (o === undefined) return '';                       // a program added after he answered: he said nothing about it
  return !o.length ? 'no' : o.includes(departmentId) ? 'yes' : 'other';
}

/** 🔋 Who serves on every Sunday of a month (no Sunday to just sit and be filled): [{ id, name, sundays }] for "YYYY-MM". */
export function noBreak(plan, ym) {
  const sundays = [...new Set(plan.services.filter(s => s.date.slice(0, 7) === ym && new Date(s.date).getDay() === 0).map(s => s.date.slice(0, 10)))];
  if (sundays.length < 3) return [];
  const on = {};
  for (const s of plan.services) {
    const d = s.date.slice(0, 10); if (!sundays.includes(d)) continue;
    for (const a of Object.values(s.assignments || {})) if (a.status !== 'declined' && a.status !== 'leave') (on[a.volunteer] ||= new Set()).add(d);
  }
  return Object.entries(on).filter(([, days]) => days.size === sundays.length)
    .map(([id]) => ({ id, name: plan.volunteers.find(v => v.id === id)?.name || '', sundays: sundays.length }));
}

/** ✦ Fill the empty places of a service fairly: people who can serve there, didn't block the day, are under their
 *  monthly limit and aren't already in this service; whoever served least in the last 8 weeks comes first.
 *  Returns the number of places filled. Nobody already placed is moved. */
export function autoAssign(plan, s, onlyDept = '') {
  const since = new Date(new Date(s.date).getTime() - 56 * 864e5).toISOString();
  const load = {};
  for (const x of plan.services) if (x.date >= since && x.date <= s.date) for (const a of Object.values(x.assignments)) load[a.volunteer] = (load[a.volunteer] || 0) + 1;
  let n = 0;
  for (const d of plan.departments) {
    if (onlyDept && d.id !== onlyDept && d.name !== onlyDept) continue;
    for (const p of d.positions) for (let slot = 0; slot < needFor(s, p); slot++) {
      const key = `${p.id}#${slot}`; if (s.assignments[key]) continue;
      const inHere = new Set(Object.values(s.assignments).map(a => a.volunteer));
      // 🗓 who offered himself for this day in this department first; who said this day is not his, never; then the one who served least
      const day = s.date.slice(0, 10), rank = v => ({ yes: 0, '': 1, other: 2 }[offerFor(v, day, d.id, s.id)]);
      const pick = plan.volunteers.filter(v => v.positions.includes(p.id) && !inHere.has(v.id) && !cannotServe(plan, s, v.id, key) && offerFor(v, day, d.id, s.id) !== 'no')
        .sort((a, b) => rank(a) - rank(b) || (load[a.id] || 0) - (load[b.id] || 0) || a.name.localeCompare(b.name, 'ro'))[0];
      if (!pick) continue;
      s.assignments[key] = { volunteer: pick.id, status: 'pending', auto: true }; load[pick.id] = (load[pick.id] || 0) + 1; n++;
    }
  }
  return n;
}

/** 📊 the last months: tasks done, split into "oameni" (people) and "programe" (programs), plus how many were left open */
export function focusByMonth(plan, months = 6) {
  const out = [], now = new Date();
  for (let k = months - 1; k >= 0; k--) {
    const d = new Date(now.getFullYear(), now.getMonth() - k, 1), ym = d.toISOString().slice(0, 7);
    const t = (plan.tasks || []).filter(x => (x.doneAt || x.due || x.at || '').slice(0, 7) === ym);
    out.push({ month: ym, oameni: t.filter(x => x.done && x.focus === 'oameni').length, programe: t.filter(x => x.done && x.focus === 'programe').length,
      altele: t.filter(x => x.done && !x.focus).length, deschise: t.filter(x => !x.done).length });
  }
  return out;
}

/** a wall-clock time in a time zone (e.g. 17:00 in Bucharest, summer or winter) as a real moment */
export function localTime(day, h, m, tz) {
  const guess = new Date(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(guess).map(p => [p.type, p.value]));
  const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
  return new Date(guess.getTime() - (shown - guess.getTime()));
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
    else { const why = cannotServe(plan, s, v.id, key); if (why) out.push(why); }
    if (a.status === 'declined') out.push(`${v.name} a spus că nu poate`);
    if (a.status === 'leave') out.push(`${v.name} cere să fie scos (aprobă sau refuză)`);
  }
  let empty = 0;
  for (const { k } of placesOf(plan, s)) if (!s.assignments[k]) empty++;
  if (empty) out.push(`${empty} poziții neocupate`);
  return out;
}
