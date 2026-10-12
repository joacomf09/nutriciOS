// NutriciOS — motor de cálculo puro y determinista (sin DOM ni IO).
// state = reduce(events). Todas las funciones reciben el estado y una fecha "hoy" explícita.
export const CALC_VERSION = '1.0.0';

// ---------- fechas (YYYY-MM-DD, calendario civil local) ----------
export const toDate = s => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const fmt = d => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
export const diffDays = (a, b) => Math.round((toDate(a) - toDate(b)) / 864e5);
export const weekStart = s => { const d = toDate(s); const wd = (d.getUTCDay() + 6) % 7; return addDays(s, -wd); };
export const range = (a, n) => Array.from({ length: n }, (_, i) => addDays(a, i));

// ---------- catálogo y plantilla por defecto ----------
// Valores por 100 g (tablas USDA/BEDCA redondeadas; editables en la app).
export const DEFAULT_FOODS = {
  pan:      { name: 'Pan (rebanada)', per100: { kcal: 265, p: 9, c: 49, f: 3.5 }, unitG: 35, unitName: 'pan', src: 'tabla' },
  huevo:    { name: 'Huevo entero', per100: { kcal: 143, p: 12.6, c: 0.7, f: 9.5 }, unitG: 55, unitName: 'huevo', src: 'USDA' },
  pollo:    { name: 'Pechuga de pollo, cruda', per100: { kcal: 120, p: 22.5, c: 0, f: 2.6 }, src: 'USDA' },
  arroz:    { name: 'Arroz blanco, crudo', per100: { kcal: 360, p: 7, c: 79, f: 0.6 }, src: 'USDA' },
  lentejas: { name: 'Lentejas cocidas (listas)', per100: { kcal: 116, p: 9, c: 20, f: 0.4 }, src: 'USDA' },
  aceite:   { name: 'Aceite de oliva', per100: { kcal: 884, p: 0, c: 0, f: 100 }, src: 'USDA' },
  avena:    { name: 'Avena', per100: { kcal: 379, p: 13, c: 66, f: 6.5 }, src: 'USDA' },
  banana:   { name: 'Banana', per100: { kcal: 89, p: 1.1, c: 23, f: 0.3 }, unitG: 120, unitName: 'banana', src: 'USDA' },
  whey:     { name: 'Whey protein', per100: { kcal: 400, p: 80, c: 8, f: 6 }, unitG: 30, unitName: 'scoop', src: 'genérico — cargar etiqueta' },
  pasta:    { name: 'Pasta, cruda', per100: { kcal: 371, p: 13, c: 75, f: 1.5 }, src: 'USDA' },
  carne:    { name: 'Carne vacuna magra, cruda', per100: { kcal: 170, p: 20, c: 0, f: 10 }, src: 'USDA' },
  salmon:   { name: 'Salmón, crudo', per100: { kcal: 208, p: 20, c: 0, f: 13 }, src: 'USDA' },
  merluza:  { name: 'Pescado blanco (merluza), crudo', per100: { kcal: 90, p: 18, c: 0, f: 1.8 }, src: 'USDA' },
  aguacate: { name: 'Aguacate', per100: { kcal: 160, p: 2, c: 9, f: 15 }, src: 'USDA' },
};

// role: fixed | carb (palanca 1) | nego (palanca 2: huevos/whey) ; unit 'g' o 'u'
export const DEFAULT_MEALS = [
  { id: 'desayuno', name: 'Desayuno', items: [
    { foodId: 'pan', qty: 2, unit: 'u', role: 'fixed' },
    { foodId: 'huevo', qty: 5, unit: 'u', role: 'nego', min: 3, max: 6, step: 1 } ] },
  { id: 'almuerzo', name: 'Almuerzo', items: [
    { foodId: 'pollo', qty: 300, unit: 'g', role: 'fixed' },
    { foodId: 'arroz', qty: 80, unit: 'g', role: 'carb', min: 40, max: 160, step: 5 },
    { foodId: 'lentejas', qty: 100, unit: 'g', role: 'fixed' },
    { foodId: 'aceite', qty: 5, unit: 'g', role: 'fixed' } ] },
  { id: 'merienda', name: 'Merienda (panqueques)', items: [
    { foodId: 'avena', qty: 80, unit: 'g', role: 'carb', min: 40, max: 120, step: 5 },
    { foodId: 'huevo', qty: 4, unit: 'u', role: 'nego', min: 2, max: 5, step: 1 },
    { foodId: 'banana', qty: 1, unit: 'u', role: 'fixed' } ] },
  { id: 'post', name: 'Post-gym', items: [
    { foodId: 'whey', qty: 1, unit: 'u', role: 'nego', min: 0.5, max: 2, step: 0.5 },
    { foodId: 'banana', qty: 1, unit: 'u', role: 'fixed' } ] },
  { id: 'cena', name: 'Cena', items: [
    { foodId: 'carne', qty: 250, unit: 'g', role: 'fixed', choices: ['carne', 'salmon', 'merluza', 'pollo'] },
    { foodId: 'pasta', qty: 80, unit: 'g', role: 'carb', min: 40, max: 160, step: 5 },
    { foodId: 'aguacate', qty: 29, unit: 'g', role: 'fixed' } ] },
];

export const DEFAULT_SETTINGS = {
  startDate: '2026-10-12',
  heightCm: 183, birthDate: '1991-07-15', sex: 'M',
  phases: [ { from: '2026-10-12', phase: 'volumen' }, { from: '2026-12-07', phase: 'mantenimiento' } ],
  tdee0: 2600, tdeeCi0: 300,
  fatBaseline: null,           // si null: mediana de lecturas previas al inicio
  exitFatPoints: 2,
  params: {
    phaseDev: { deficit: -400, mantenimiento: 0, volumen: 200, volumen_agresivo: 350 },
    kcalPerKg: { deficit: 7000, mantenimiento: 7000, volumen: 5000, volumen_agresivo: 4500 },
    gBase: 0.5, tdeeUpdateCap: 250, calibrationWeeksMin: 2,
    coverageMin: 0.6, daysClosedMin: 5, weighinsMin: 4,
    deadband: 100, stepCap: 200, stepCapHyst: 350,
    carryCap: 300, redistTol: 50, kcalFloor: 1970,
    proteinFloorGkg: 1.6, proteinWarnGkg: 3.0, fatFloorGkg: 0.7,
    washoutDays: 7, washoutCarbG: 75, outlierPct: 3,
  },
};

export const PHASE_LABEL = { deficit: 'Déficit', mantenimiento: 'Mantenimiento', volumen: 'Volumen limpio', volumen_agresivo: 'Volumen agresivo' };

// ---------- reductor del log de eventos ----------
export function emptyState() {
  return { settings: null, foods: {}, versions: [], weights: [], mealSets: {}, overrides: {}, extras: {}, closes: {}, reviews: {}, decisions: {}, events: 0 };
}
const clone = o => JSON.parse(JSON.stringify(o));
export function reduce(state, ev) {
  const s = state; s.events++;
  const p = ev.payload || {};
  switch (ev.type) {
    case 'INIT':
      s.settings = clone(p.settings); s.foods = clone(p.foods);
      s.versions = [{ id: 'v1', effectiveFrom: p.settings.startDate, meals: clone(p.meals), reason: 'Plan inicial', ts: ev.ts }];
      break;
    case 'SETTINGS': s.settings = { ...s.settings, ...clone(p) }; break;
    case 'FOOD': s.foods[p.id] = clone(p.food); break;
    case 'WEIGHT': {
      s.weights = s.weights.filter(w => w.id !== p.id);
      if (!p.deleted) s.weights.push({ id: p.id, date: p.date, kg: p.kg, fatPct: p.fatPct ?? null, source: p.source || 'withings_body_smart' });
      s.weights.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
      break; }
    case 'MEAL_SET': (s.mealSets[p.date] ||= {})[p.mealId] = { status: p.status, items: p.items ? clone(p.items) : null }; break;
    case 'MEAL_RESET': if (s.mealSets[p.date]) delete s.mealSets[p.date][p.mealId]; break;
    case 'OVERRIDE': (s.overrides[p.date] ||= []).push(clone(p)); break;
    case 'EXTRA': (s.extras[p.date] ||= []).push({ id: p.id, name: p.name, kcal: p.kcal, p: p.p || 0, c: p.c || 0, f: p.f || 0, estimated: !!p.estimated }); break;
    case 'EXTRA_DEL': if (s.extras[p.date]) s.extras[p.date] = s.extras[p.date].filter(x => x.id !== p.id); break;
    case 'DAY_CLOSE': if (p.answer) s.closes[p.date] = { answer: p.answer, ts: ev.ts }; else delete s.closes[p.date]; break;
    case 'REVIEW': s.reviews[p.weekStart] = clone(p); break;
    case 'DECISION': s.decisions[p.proposalId] = { decision: p.decision, ts: ev.ts }; break;
    case 'VERSION': s.versions.push(clone(p)); break;
    default: break;
  }
  return s;
}
export const replay = events => events.reduce(reduce, emptyState());

// ---------- nutrición ----------
export function itemMacros(foods, it) {
  const f = foods[it.foodId]; if (!f) return { kcal: 0, p: 0, c: 0, f: 0 };
  const g = it.unit === 'u' ? it.qty * (f.unitG || 100) : it.qty;
  const k = g / 100;
  return { kcal: f.per100.kcal * k, p: f.per100.p * k, c: f.per100.c * k, f: f.per100.f * k };
}
const add = (a, b) => ({ kcal: a.kcal + b.kcal, p: a.p + b.p, c: a.c + b.c, f: a.f + b.f });
const ZERO = { kcal: 0, p: 0, c: 0, f: 0 };
export const sumItems = (foods, items) => items.reduce((acc, it) => add(acc, itemMacros(foods, it)), ZERO);
export const mealsTotal = (foods, meals) => meals.reduce((acc, m) => add(acc, sumItems(foods, m.items)), ZERO);
export const round = (x, d = 0) => { const k = 10 ** d; return Math.round(x * k) / k; };

export function versionAt(state, date) {
  let v = state.versions[0];
  for (const x of state.versions) if (x.effectiveFrom <= date) v = x;
  return v;
}
export function phaseAt(settings, date) {
  let ph = settings.phases[0].phase;
  for (const x of settings.phases) if (x.from <= date) ph = x.phase;
  return ph;
}

// Vista de un día: estado por comida, cantidades planificadas (con overrides) y reales.
export function dayView(state, date, today) {
  const v = versionAt(state, date);
  const sets = state.mealSets[date] || {};
  const ovs = state.overrides[date] || [];
  const close = state.closes[date] || null;
  const meals = v.meals.map(m => {
    const planned = m.items.map(it => ({ ...it }));
    for (const o of ovs) if (o.mealId === m.id) { const it = planned.find(x => x.foodId === o.foodId); if (it) it.qty = o.qty; }
    const set = sets[m.id];
    let status;
    if (set) status = set.status;
    else if (close) status = close.answer === 'not_logged' ? 'unknown' : 'confirmed';
    else status = date < today ? 'assumed' : 'pending';
    const actualItems = (set && set.items) ? set.items : planned;
    const eaten = !['skipped', 'unknown'].includes(status);
    return { id: m.id, name: m.name, status, planned, actualItems, plannedTot: sumItems(state.foods, planned), actualTot: eaten ? sumItems(state.foods, actualItems) : ZERO, touched: !!set };
  });
  const extras = state.extras[date] || [];
  const extraTot = extras.reduce((a, x) => add(a, x), ZERO);
  const target = mealsTotal(state.foods, v.meals);
  const planned = meals.reduce((a, m) => add(a, m.plannedTot), ZERO);
  const actual = add(meals.reduce((a, m) => add(a, m.actualTot), ZERO), extraTot);
  const eatenConfirmed = meals.filter(m => ['confirmed', 'edited', 'replaced'].includes(m.status)).reduce((a, m) => add(a, m.actualTot), extraTot);
  const hasData = !!close && close.answer !== 'not_logged';
  const unknown = !!close && close.answer === 'not_logged';
  const confirmedKcal = hasData ? actual.kcal : 0;
  return { date, version: v, meals, extras, target, planned, actual, eatenConfirmed, close, hasData, unknown, confirmedKcal };
}

// ---------- saldo semanal y redistribución (solo carbohidratos, +300/día, caduca el domingo) ----------
export function weekBank(state, date, today) {
  const ws = weekStart(date); let bank = 0;
  for (const d of range(ws, 7)) {
    if (d >= date) break;
    const dv = dayView(state, d, today);
    if (dv.hasData) bank += Math.max(0, dv.target.kcal - dv.actual.kcal);
    for (const o of state.overrides[d] || []) if (o.fromBank) bank -= o.kcal || 0;
  }
  for (const o of state.overrides[date] || []) if (o.fromBank) bank -= o.kcal || 0;
  return Math.max(0, round(bank));
}

// Reparte deltaKcal (>0 subir, <0 bajar) sobre ingredientes de rol dado, round-robin por pasos.
function distribute(foods, meals, deltaKcal, roles, mealFilter = () => true) {
  const slots = [];
  for (const m of meals) if (mealFilter(m)) for (const it of m.items) if (roles.includes(it.role)) slots.push({ m, it });
  const changes = new Map(); let remaining = deltaKcal; let guard = 0;
  const stepK = s => itemMacros(foods, { ...s.it, qty: s.it.step || 5 }).kcal;
  while (slots.length && guard++ < 500) {
    let moved = false;
    for (const s of slots) {
      const sk = stepK(s); if (Math.abs(remaining) < sk / 2) continue;
      const dir = Math.sign(remaining); const cur = changes.has(s) ? changes.get(s) : s.it.qty;
      const next = round(cur + dir * (s.it.step || 5), 2);
      if (next < (s.it.min ?? 0) || next > (s.it.max ?? Infinity)) continue;
      changes.set(s, next); remaining -= dir * sk; moved = true;
    }
    if (!moved) break;
  }
  return { changes: [...changes].map(([s, qty]) => ({ mealId: s.m.id, foodId: s.it.foodId, from: s.it.qty, qty })), remaining };
}

export function redistributionSuggestion(state, date, today) {
  const P = state.settings.params; const dv = dayView(state, date, today);
  const delta = dv.target.kcal - dv.actual.kcal; // >0: falta energía
  const out = { delta: round(delta), sameDay: [], bankAllowance: 0, excess: 0 };
  if (delta < -P.redistTol) { out.excess = round(-delta); return out; }
  if (delta > P.redistTol) {
    const future = dv.meals.filter(m => m.status === 'pending' && !m.touched).map(m => ({ id: m.id, items: m.planned }));
    const r = distribute(state.foods, future, delta, ['carb']);
    out.sameDay = r.changes.map(c => ({ ...c, kcal: round(itemMacros(state.foods, { foodId: c.foodId, qty: c.qty - c.from, unit: 'g' }).kcal) }));
    out.unplaced = round(Math.max(0, r.remaining));
  }
  const bank = weekBank(state, date, today);
  if (bank > P.redistTol && date === today) {
    const allow = Math.min(P.carryCap, bank);
    const future = dv.meals.filter(m => m.status === 'pending' && !m.touched).map(m => ({ id: m.id, items: m.planned }));
    const r = distribute(state.foods, future, allow, ['carb']);
    out.bankAllowance = round(allow);
    out.bankChanges = r.changes.map(c => ({ ...c, kcal: round(itemMacros(state.foods, { foodId: c.foodId, qty: c.qty - c.from, unit: 'g' }).kcal) }));
  }
  return out;
}

// ---------- peso: tendencia robusta ----------
export function theilSen(points) { // points: [{x: día, y: kg}]
  const s = [];
  for (let i = 0; i < points.length; i++) for (let j = i + 1; j < points.length; j++)
    if (points[j].x !== points[i].x) s.push((points[j].y - points[i].y) / (points[j].x - points[i].x));
  if (!s.length) return null; s.sort((a, b) => a - b);
  const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}
export const median = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
export function dailyWeights(state, from, to) { // media por día dentro de [from,to]
  const by = {};
  for (const w of state.weights) if (w.date >= from && w.date <= to) (by[w.date] ||= []).push(w.kg);
  return Object.entries(by).map(([d, ks]) => ({ date: d, kg: median(ks) })).sort((a, b) => a.date < b.date ? -1 : 1);
}
export function weightTrend(state, endDate, excludeFrom = null) {
  let pts = dailyWeights(state, addDays(endDate, -20), endDate);
  if (pts.length < 10) pts = dailyWeights(state, addDays(endDate, -13), endDate);
  if (excludeFrom) pts = pts.filter(p => !(p.date >= excludeFrom.from && p.date <= excludeFrom.to));
  const xs = pts.map(p => ({ x: diffDays(p.date, endDate), y: p.kg }));
  const slopeDay = theilSen(xs);
  let ewma = null; for (const p of pts) ewma = ewma == null ? p.kg : 0.3 * p.kg + 0.7 * ewma;
  return { n: pts.length, slopeWeek: slopeDay == null ? null : slopeDay * 7, trendKg: ewma, points: pts };
}

// ---------- BMR ----------
export function bmrMifflin(settings, kg, date) {
  const age = (toDate(date) - toDate(settings.birthDate)) / (365.25 * 864e5);
  return 10 * kg + 6.25 * settings.heightCm - 5 * age + (settings.sex === 'M' ? 5 : -161);
}

// ---------- revisión semanal: calibración + propuesta ----------
function washoutWindow(state, ws) {
  const P = state.settings.params;
  for (let i = state.versions.length - 1; i > 0; i--) {
    const v = state.versions[i], prev = state.versions[i - 1];
    const dc = Math.abs(mealsTotal(state.foods, v.meals).c - mealsTotal(state.foods, prev.meals).c);
    const end = addDays(v.effectiveFrom, P.washoutDays - 1);
    if (dc > P.washoutCarbG && end >= ws && v.effectiveFrom <= addDays(ws, 6)) return { from: v.effectiveFrom, to: end };
  }
  return null;
}

export function calibrationHistory(state, today) {
  const S = state.settings, P = S.params;
  let tdee = S.tdee0, ci = S.tdeeCi0, weeks = 0, prevDelta = 0; const out = [];
  const wss = Object.keys(state.reviews).sort();
  for (const ws of wss) {
    const days = range(ws, 7).map(d => dayView(state, d, today));
    const closed = days.filter(d => d.hasData);
    const planKcal = days.reduce((a, d) => a + d.target.kcal, 0);
    const confKcal = closed.reduce((a, d) => a + d.target.kcal, 0);
    const coverage = planKcal ? confKcal / planKcal : 0;
    const intake = closed.length ? closed.reduce((a, d) => a + d.actual.kcal, 0) / closed.length : null;
    const weekEnd = addDays(ws, 6);
    const wo = washoutWindow(state, ws);
    const tr = weightTrend(state, weekEnd, wo);
    const weighins = dailyWeights(state, ws, weekEnd).length;
    const phase = phaseAt(S, ws);
    const reasons = [];
    if (closed.length < P.daysClosedMin) reasons.push(`${closed.length}/7 días cerrados (mín. ${P.daysClosedMin})`);
    if (coverage < P.coverageMin) reasons.push(`cobertura ${round(coverage * 100)} % (mín. ${P.coverageMin * 100} %)`);
    if (weighins < P.weighinsMin) reasons.push(`${weighins} pesajes (mín. ${P.weighinsMin})`);
    if (tr.slopeWeek == null) reasons.push('sin tendencia de peso');
    const calibrable = reasons.length === 0;
    const r = { weekStart: ws, phase, closedDays: closed.length, coverage, intake, weighins, slopeWeek: tr.slopeWeek, trendKg: tr.trendKg, washout: wo, calibrable, reasons, tdeePrev: tdee };
    if (calibrable) {
      const kpk = P.kcalPerKg[phase] || 7000;
      const implied = intake + (-tr.slopeWeek) * kpk / 7;
      const fCob = Math.min(1, Math.max(0.25, (coverage - P.coverageMin) / (1 - P.coverageMin)));
      const fPes = Math.min(1, Math.max(0.5, weighins / 7));
      const g = P.gBase * fCob * fPes;
      const d = Math.max(-P.tdeeUpdateCap, Math.min(P.tdeeUpdateCap, g * (implied - tdee)));
      tdee += d; weeks++;
      ci = Math.max(100, 400 / Math.sqrt(1 + weeks));
      Object.assign(r, { implied, gain: g });
    }
    const rv = state.reviews[ws];
    const ratio = rv && rv.whoop7 && rv.whoop30 ? rv.whoop7 / rv.whoop30 : null;
    const ciOut = ratio && Math.abs(ratio - 1) > 0.1 ? ci + 100 : ci;
    Object.assign(r, { tdee: round(tdee), ci: round(ciOut), weeksCalibrated: weeks, whoopRatio: ratio, prevDelta });
    out.push(r);
    const dec = Object.entries(state.decisions).find(([id]) => id === 'w' + ws);
    if (dec && dec[1].decision === 'approved') { const pv = state.versions.find(v => v.proposalId === 'w' + ws); prevDelta = pv ? pv.deltaKcal || 0 : 0; } else prevDelta = 0;
  }
  return out;
}

export function adjustMeals(foods, meals, deltaKcal) {
  const m2 = clone(meals);
  let r = distribute(foods, m2, deltaKcal, ['carb']);
  const all = [...r.changes]; let remaining = r.remaining; let usedNego = false;
  const apply = chs => { for (const c of chs) { const it = m2.find(m => m.id === c.mealId).items.find(i => i.foodId === c.foodId && i.qty === c.from); if (it) it.qty = c.qty; } };
  apply(r.changes);
  if (Math.abs(remaining) > 60) {
    const r2 = distribute(foods, m2, remaining, ['nego']);
    apply(r2.changes); all.push(...r2.changes); remaining = r2.remaining; usedNego = r2.changes.length > 0;
  }
  return { meals: m2, changes: all, remaining: round(remaining), leverExhausted: Math.abs(remaining) > 60, usedNego };
}

export function fatStatus(state) {
  const S = state.settings;
  const withFat = state.weights.filter(w => w.fatPct != null);
  const base = S.fatBaseline ?? median(withFat.filter(w => w.date < S.startDate).slice(-8).map(w => w.fatPct));
  const after = withFat.filter(w => w.date >= S.startDate);
  const current = after.length >= 8 ? median(after.slice(-8).map(w => w.fatPct)) : null;
  const delta = base != null && current != null ? current - base : null;
  return { baseline: base, current, delta, n: after.length, exitTriggered: delta != null && delta >= S.exitFatPoints };
}

export function weeklyProposal(state, ws, today) {
  const S = state.settings, P = S.params;
  const hist = calibrationHistory(state, today);
  const h = hist.find(x => x.weekStart === ws); if (!h) return null;
  const nextWs = addDays(ws, 7);
  const v = versionAt(state, today > nextWs ? today : nextWs);
  const cur = mealsTotal(state.foods, v.meals);
  let phase = phaseAt(S, nextWs);
  const fat = fatStatus(state);
  const phaseChange = fat.exitTriggered && phase.startsWith('volumen') ? 'mantenimiento' : null;
  if (phaseChange) phase = phaseChange;
  const goal = h.tdee + (P.phaseDev[phase] ?? 0);
  let delta = goal - cur.kcal; const why = [];
  why.push(`Gasto estimado ${h.tdee} ± ${h.ci} kcal${h.calibrable ? ` (semana ${h.weeksCalibrated} de calibración)` : ''}.`);
  if (h.slopeWeek != null) why.push(`Peso ${h.slopeWeek >= 0 ? '+' : ''}${round(h.slopeWeek, 2)} kg/semana (${h.weighins} pesajes, ${h.closedDays}/7 días cerrados).`);
  if (!h.calibrable) why.push('Semana no calibrable: ' + h.reasons.join('; ') + '.');
  if (phaseChange) why.push(`Grasa Withings +${round(fat.delta, 1)} puntos sobre la base (${round(fat.baseline, 1)} %): se propone pasar a mantenimiento.`);
  let reason = '';
  if (h.weeksCalibrated < P.calibrationWeeksMin && !phaseChange) { delta = 0; reason = `Calibrando (${h.weeksCalibrated}/${P.calibrationWeeksMin} semanas): sin cambio de meta.`; }
  else if (!h.calibrable && !phaseChange) { delta = 0; reason = 'Sin cambio: datos insuficientes esta semana.'; }
  else if (Math.abs(delta) < P.deadband) { reason = `Cambio calculado ${round(delta)} kcal < banda muerta ${P.deadband}: sin cambio.`; delta = 0; }
  else {
    const cap = Math.sign(delta) === Math.sign(h.prevDelta) && h.prevDelta !== 0 ? P.stepCapHyst : P.stepCap;
    const raw = delta; delta = Math.max(-cap, Math.min(cap, delta));
    reason = `Meta de fase ${round(goal)} kcal (${PHASE_LABEL[phase]} ${P.phaseDev[phase] >= 0 ? '+' : ''}${P.phaseDev[phase]}); vigente ${round(cur.kcal)}; cambio ${round(raw)} → ${round(delta)} (tope ${cap}).`;
  }
  if (cur.kcal + delta < P.kcalFloor) delta = P.kcalFloor - cur.kcal;
  why.push(reason);
  const adj = delta ? adjustMeals(state.foods, v.meals, delta) : { meals: clone(v.meals), changes: [], remaining: 0, leverExhausted: false };
  const after = mealsTotal(state.foods, adj.meals);
  const kg = state.weights.length ? state.weights[state.weights.length - 1].kg : 78;
  const warnings = [];
  if (after.p / kg > P.proteinWarnGkg) warnings.push(`Proteína ${round(after.p / kg, 1)} g/kg (> ${P.proteinWarnGkg}): informativo.`);
  if (after.f / kg < P.fatFloorGkg) warnings.push(`Grasa ${round(after.f / kg, 2)} g/kg bajo el piso ${P.fatFloorGkg}.`);
  if (adj.leverExhausted) warnings.push('Palanca agotada: los carbohidratos y huevos/whey llegaron a su límite; faltan ' + adj.remaining + ' kcal. Decidí vos (cambiar fase o editar el plan).');
  if (adj.usedNego) warnings.push('Se usaron huevos/whey como segunda palanca.');
  return { id: 'w' + ws, weekStart: ws, hist: h, phase, phaseChange, before: cur, after, deltaKcal: round(after.kcal - cur.kcal), changes: adj.changes, meals: adj.meals, why, warnings, calcVersion: CALC_VERSION };
}

// ---------- export para IA ----------
export function exportForAI(state, today) {
  const S = state.settings; const lines = [];
  const days = []; for (let d = S.startDate; d <= today; d = addDays(d, 1)) days.push(dayView(state, d, today));
  const csvDays = ['fecha,estado_dia,meta_kcal,real_kcal,prot_g,carb_g,grasa_g,comidas_omitidas,extras_kcal']
    .concat(days.map(d => [d.date, d.close ? d.close.answer : 'abierto', round(d.target.kcal), round(d.actual.kcal), round(d.actual.p), round(d.actual.c), round(d.actual.f), d.meals.filter(m => m.status === 'skipped').map(m => m.id).join('|'), round(d.extras.reduce((a, x) => a + x.kcal, 0))].join(',')));
  const csvW = ['fecha,peso_kg,grasa_pct,fuente'].concat(state.weights.map(w => [w.date, w.kg, w.fatPct ?? '', w.source].join(',')));
  const hist = calibrationHistory(state, today);
  const csvH = ['semana,fase,dias_cerrados,cobertura,ingesta_media,pendiente_kg_sem,pesajes,tdee_est,ic,whoop_7d_30d'].concat(hist.map(h => [h.weekStart, h.phase, h.closedDays, round(h.coverage, 2), h.intake == null ? '' : round(h.intake), h.slopeWeek == null ? '' : round(h.slopeWeek, 2), h.weighins, h.tdee, h.ci, h.whoopRatio == null ? '' : round(h.whoopRatio, 2)].join(',')));
  const v = versionAt(state, today); const tot = mealsTotal(state.foods, v.meals);
  const fat = fatStatus(state);
  const plan = v.meals.map(m => `- ${m.name}: ` + m.items.map(it => `${it.qty}${it.unit === 'u' ? ' ' + (state.foods[it.foodId].unitName || 'u') : ' g'} ${state.foods[it.foodId].name}`).join(', ')).join('\n');
  const prompt = `Sos mi analista de nutrición deportiva. Abajo van los datos de mi app NutriciOS (motor ${CALC_VERSION}).
Contexto: hombre, ${S.heightCm} cm, fase actual ${PHASE_LABEL[phaseAt(S, today)]}. Calendario de fases: ${S.phases.map(p => p.from + ' ' + PHASE_LABEL[p.phase]).join(' → ')}.
Reglas de mi app: el gasto se estima con ingesta confirmada + tendencia de peso (WHOOP solo como contexto); la grasa de Withings solo decide la fase (límite de salida +${S.exitFatPoints} puntos); la proteína de carnes/pescado/pollo es fija; la palanca son carbohidratos y luego huevos/whey; cambios semanales de ±${S.params.stepCap} kcal con banda muerta de ${S.params.deadband}.
Plan vigente (${round(tot.kcal)} kcal, P ${round(tot.p)} / C ${round(tot.c)} / G ${round(tot.f)}):
${plan}
Grasa Withings: base ${fat.baseline == null ? 's/d' : round(fat.baseline, 1) + ' %'}, actual ${fat.current == null ? 's/d' : round(fat.current, 1) + ' %'}.

Decime, con números: (1) si mi tendencia de peso es coherente con la fase; (2) si la estimación de gasto es razonable o está sesgada por días no confirmados; (3) dónde ajustar concretamente (qué ingrediente, cuántos gramos) y por qué; (4) qué dato me falta registrar mejor. Distinguí hechos de supuestos.`;
  return { prompt, csvDays: csvDays.join('\n'), csvWeights: csvW.join('\n'), csvWeeks: csvH.join('\n'),
    text: `${prompt}\n\n### Días\n${csvDays.join('\n')}\n\n### Pesos\n${csvW.join('\n')}\n\n### Semanas\n${csvH.join('\n')}\n` };
}
