import assert from 'node:assert/strict';
import * as E from './engine.js';

let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const init = () => ({ type: 'INIT', ts: 0, payload: { settings: E.DEFAULT_SETTINGS, foods: E.DEFAULT_FOODS, meals: E.DEFAULT_MEALS } });
let id = 0; const W = (date, kg, fatPct = null) => ({ type: 'WEIGHT', payload: { id: 'w' + (id++), date, kg, fatPct } });

t('plan base ≈ 3.000 kcal y ~240 g proteína', () => {
  const tot = E.mealsTotal(E.DEFAULT_FOODS, E.DEFAULT_MEALS);
  console.log('   plan', E.round(tot.kcal), 'P', E.round(tot.p), 'C', E.round(tot.c), 'G', E.round(tot.f));
  assert.ok(tot.kcal > 2850 && tot.kcal < 3200); assert.ok(tot.p > 220 && tot.p < 260);
});

t('días pasados sin cerrar quedan assumed y no calibran', () => {
  const s = E.replay([init()]);
  const dv = E.dayView(s, '2026-10-13', '2026-10-15');
  assert.ok(dv.meals.every(m => m.status === 'assumed')); assert.equal(dv.hasData, false);
});

t('cierre "todo según plan" confirma; "no registré" → unknown sin kcal', () => {
  const s = E.replay([init(), { type: 'DAY_CLOSE', payload: { date: '2026-10-13', answer: 'all_plan' } }, { type: 'DAY_CLOSE', payload: { date: '2026-10-14', answer: 'not_logged' } }]);
  const a = E.dayView(s, '2026-10-13', '2026-10-15'), b = E.dayView(s, '2026-10-14', '2026-10-15');
  assert.ok(a.hasData && a.meals.every(m => m.status === 'confirmed'));
  assert.ok(!b.hasData && b.actual.kcal === 0);
});

t('omitir merienda hoy propone +carbohidratos en comidas futuras', () => {
  const s = E.replay([init(), { type: 'MEAL_SET', payload: { date: '2026-10-15', mealId: 'merienda', status: 'skipped' } }]);
  const r = E.redistributionSuggestion(s, '2026-10-15', '2026-10-15');
  assert.ok(r.delta > 600); assert.ok(r.sameDay.length > 0);
  assert.ok(r.sameDay.every(c => ['arroz', 'pasta', 'pb2'].includes(c.foodId)));
  for (const c of r.sameDay) assert.ok(c.qty <= 160);
});

t('saldo semanal: tope +300 y caduca el domingo', () => {
  const ev = [init(), { type: 'MEAL_SET', payload: { date: '2026-10-16', mealId: 'merienda', status: 'skipped' } }, { type: 'MEAL_SET', payload: { date: '2026-10-16', mealId: 'post', status: 'skipped' } }, { type: 'DAY_CLOSE', payload: { date: '2026-10-16', answer: 'with_changes' } }];
  const s = E.replay(ev);
  const sat = E.redistributionSuggestion(s, '2026-10-17', '2026-10-17');
  assert.equal(sat.bankAllowance, 300);
  assert.equal(E.weekBank(s, '2026-10-19', '2026-10-19'), 0); // lunes siguiente: caducó
});

t('excesos solo informativos', () => {
  const s = E.replay([init(), { type: 'EXTRA', payload: { date: '2026-10-15', id: 'x', name: 'cena afuera', kcal: 800 } }]);
  const r = E.redistributionSuggestion(s, '2026-10-15', '2026-10-15');
  assert.ok(r.excess >= 750); assert.equal(r.sameDay.length, 0);
});

// Simulación: 3 semanas comiendo el plan (≈3.000) con ganancia +0,25 kg/sem → gasto implícito ≈ 3.000 − 0,25×5000/7 ≈ 2.820
function simulate(weeks, slope, closeAll = true, startKg = 77.7) {
  const ev = [init()]; let d = '2026-10-12', kg = startKg;
  for (let i = 0; i < weeks * 7; i++) {
    ev.push(W(d, E.round(kg + (i % 3 === 0 ? 0.3 : -0.15), 2), 19));
    if (closeAll) ev.push({ type: 'DAY_CLOSE', payload: { date: d, answer: 'all_plan' } });
    kg += slope / 7; d = E.addDays(d, 1);
  }
  for (let w = 0; w < weeks; w++) ev.push({ type: 'REVIEW', payload: { weekStart: E.addDays('2026-10-12', 7 * w), whoop30: 2180, whoop7: 2200 } });
  return ev;
}

t('semana 1: calibrando, sin cambio de meta', () => {
  const s = E.replay(simulate(1, 0.25));
  const p = E.weeklyProposal(s, '2026-10-12', '2026-10-19');
  assert.equal(p.deltaKcal, 0); assert.ok(p.why.join(' ').includes('Calibrando'));
});

t('gasto converge hacia el implícito y la propuesta respeta tope ±200', () => {
  const s = E.replay(simulate(4, 0.6));  // ganando demasiado rápido → debería bajar
  const h = E.calibrationHistory(s, '2026-11-09');
  console.log('   tdee', h.map(x => x.tdee).join(' → '), 'slope', h.map(x => E.round(x.slopeWeek, 2)).join(','));
  const p = E.weeklyProposal(s, '2026-11-02', '2026-11-09');
  console.log('   propuesta', p.deltaKcal, p.changes.map(c => c.foodId + ' ' + c.from + '→' + c.qty).join(', '));
  assert.ok(p.deltaKcal < 0 && p.deltaKcal >= -230);
  assert.ok(p.changes.every(c => ['arroz', 'pasta', 'avena'].includes(c.foodId)));
});

t('sin cierres diarios: semana no calibrable', () => {
  const s = E.replay(simulate(3, 0.25, false));
  const h = E.calibrationHistory(s, '2026-11-02');
  assert.ok(h.every(x => !x.calibrable)); assert.equal(h.at(-1).tdee, 2600);
});

t('límite de salida: +2 puntos de grasa propone mantenimiento', () => {
  const ev = simulate(3, 0.25);
  for (let i = 0; i < 8; i++) ev.push(W(E.addDays('2026-08-10', i), 79, 19));     // base pre-inicio
  for (let i = 0; i < 8; i++) ev.push(W(E.addDays('2026-10-26', i), 78.5, 21.3)); // actual
  const s = E.replay(ev);
  const p = E.weeklyProposal(s, '2026-10-26', '2026-11-02');
  assert.equal(p.phaseChange, 'mantenimiento');
});

t('determinismo: misma entrada, misma propuesta', () => {
  const a = E.weeklyProposal(E.replay(simulate(3, 0.5)), '2026-10-26', '2026-11-02');
  const b = E.weeklyProposal(E.replay(simulate(3, 0.5)), '2026-10-26', '2026-11-02');
  assert.deepEqual(a, b);
});

t('Theil-Sen ignora un outlier', () => {
  const pts = [0, 1, 2, 3, 4, 5, 6].map(x => ({ x, y: 78 + x * 0.05 })); pts[3].y = 80;
  assert.ok(Math.abs(E.theilSen(pts) - 0.05) < 0.01);
});

t('export para IA incluye prompt y CSV', () => {
  const s = E.replay(simulate(2, 0.25));
  const x = E.exportForAI(s, '2026-10-26');
  assert.ok(x.text.includes('fecha,estado_dia') && x.prompt.includes('Plan vigente'));
});
t('hoy: comidas pendientes (desmarcadas) cuentan en proyección, no como comidas', () => {
  const s = E.replay([init(), { type: 'MEAL_SET', payload: { date: '2026-10-15', mealId: 'desayuno', status: 'confirmed' } }]);
  const dv = E.dayView(s, '2026-10-15', '2026-10-15');
  assert.equal(dv.meals.filter(m => m.status === 'pending').length, 4);
  assert.ok(dv.eatenConfirmed.kcal > 500 && dv.eatenConfirmed.kcal < 650);
});
t('omitir post-gym con carbos al tope usa maní en polvo antes del saldo', () => {
  const ev = [init(), { type: 'MEAL_SET', payload: { date: '2026-10-15', mealId: 'desayuno', status: 'skipped' } }, { type: 'MEAL_SET', payload: { date: '2026-10-15', mealId: 'merienda', status: 'skipped' } }];
  const r = E.redistributionSuggestion(E.replay(ev), '2026-10-15', '2026-10-15');
  assert.ok(r.sameDay.some(c => c.foodId === 'pb2')); assert.ok(r.unplaced > 0);
});

// ---------- pista de carbos en la última comida ----------
const D = '2026-10-15';
const conf = (ids, extra = []) => [init(), ...ids.map(mealId => ({ type: 'MEAL_SET', payload: { date: D, mealId, status: 'confirmed' } })), ...extra];
const prev4 = ['desayuno', 'almuerzo', 'merienda', 'post'];
const stepK = E.itemMacros(E.DEFAULT_FOODS, { foodId: 'pasta', qty: 5, unit: 'g' }).kcal;

t('pista carbos: todo según plan → sin pista (|Δ| ≤ 50)', () => {
  assert.equal(E.lastMealCarbHint(E.replay(conf(prev4)), D, D), null);
});
t('pista carbos: me falta → ↑ pasta y la suma coincide con el faltante', () => {
  const almu = E.DEFAULT_MEALS.find(m => m.id === 'almuerzo').items.map(i => ({ ...i, qty: i.foodId === 'arroz' ? 50 : i.qty }));
  const ev = conf(['desayuno', 'merienda', 'post'], [{ type: 'MEAL_SET', payload: { date: D, mealId: 'almuerzo', status: 'edited', items: almu } }]);
  const h = E.lastMealCarbHint(E.replay(ev), D, D);
  assert.ok(h && h.dir === 1 && h.delta > 50); assert.equal(h.mealId, 'cena');
  assert.deepEqual(h.items.map(x => x.foodId), ['pasta']);
  assert.ok(h.items[0].dq > 0 && h.items[0].dq % 5 === 0);
  assert.ok(Math.abs(h.covered - h.delta) <= stepK / 2 + 1, `cubre ${h.covered} de ${h.delta}`);
});
t('pista carbos: me pasé → ↓ pasta, sin bajar del mínimo', () => {
  const h = E.lastMealCarbHint(E.replay(conf(prev4, [{ type: 'EXTRA', payload: { date: D, id: 'x1', name: 'x', kcal: 150, p: 0, c: 0, f: 0 } }])), D, D);
  assert.ok(h && h.dir === -1 && h.items[0].dq < 0); assert.ok(h.items[0].qty >= 40);
  assert.ok(Math.abs(h.covered - h.delta) <= stepK / 2 + 1);
});
const withPasta = q => ({ type: 'VERSION', payload: { id: 'v2', effectiveFrom: '2026-10-12', meals: E.DEFAULT_MEALS.map(m => m.id !== 'cena' ? m : { ...m, items: m.items.map(i => i.foodId === 'pasta' ? { ...i, qty: q } : i) }) } });
t('pista carbos: pasta en el mínimo y me pasé → "min", sin cambio', () => {
  const ev = [init(), withPasta(40), ...prev4.map(mealId => ({ type: 'MEAL_SET', payload: { date: D, mealId, status: 'confirmed' } })), { type: 'EXTRA', payload: { date: D, id: 'x1', name: 'x', kcal: 300, p: 0, c: 0, f: 0 } }];
  const h = E.lastMealCarbHint(E.replay(ev), D, D);
  assert.equal(h.items[0].dq, 0); assert.equal(h.items[0].atLimit, 'min'); assert.equal(h.covered, 0);
});
t('pista carbos: pasta en el máximo y me falta → "max"', () => {
  const ev = [init(), withPasta(160), ...['desayuno', 'post'].map(mealId => ({ type: 'MEAL_SET', payload: { date: D, mealId, status: 'confirmed' } })), ...['almuerzo', 'merienda'].map(mealId => ({ type: 'MEAL_SET', payload: { date: D, mealId, status: 'skipped' } }))];
  const h = E.lastMealCarbHint(E.replay(ev), D, D);
  assert.equal(h.dir, 1); assert.equal(h.items[0].atLimit, 'max');
});
t('pista carbos: cena ya marcada → sin pista; no modifica el estado', () => {
  const s = E.replay(conf([...prev4, 'cena'], [{ type: 'EXTRA', payload: { date: D, id: 'x1', name: 'x', kcal: 400, p: 0, c: 0, f: 0 } }]));
  assert.equal(E.lastMealCarbHint(s, D, D), null);
  const s2 = E.replay(conf(prev4)); const before = JSON.stringify(s2); E.lastMealCarbHint(s2, D, D); assert.equal(JSON.stringify(s2), before);
});
t('pista carbos: cena comida antes → la pista va a la merienda (última pendiente con carbos) y cuenta lo pendiente', () => {
  const ev = conf(['desayuno', 'almuerzo', 'cena'], [{ type: 'EXTRA', payload: { date: D, id: 'x1', name: 'x', kcal: 200, p: 0, c: 0, f: 0 } }]);
  const h = E.lastMealCarbHint(E.replay(ev), D, D);
  assert.equal(h.mealId, 'merienda'); assert.equal(h.dir, -1); assert.deepEqual(h.items.map(x => x.foodId), ['avena']);
  assert.ok(Math.abs(h.delta + 200) <= 5, `delta ${h.delta}`); // lo planificado de merienda y post-gym cuenta
});
t('pista: solo queda post-gym y me pasé → sin pista (no se toca el whey)', () => {
  assert.equal(E.lastMealCarbHint(E.replay(conf(['desayuno', 'almuerzo', 'merienda', 'cena'], [{ type: 'EXTRA', payload: { date: D, id: 'x1', name: 'x', kcal: 300, p: 0, c: 0, f: 0 } }])), D, D), null);
});
t('pista: merienda omitida y solo queda post-gym → añadir cacahuete en polvo y avena al post-gym', () => {
  const ev = conf(['desayuno', 'almuerzo', 'cena'], [{ type: 'MEAL_SET', payload: { date: D, mealId: 'merienda', status: 'skipped' } }]);
  const h = E.lastMealCarbHint(E.replay(ev), D, D);
  assert.equal(h.mealId, 'post'); assert.ok(h.adds); assert.equal(h.dir, 1);
  assert.deepEqual(h.items.map(x => x.foodId), ['pb2', 'avena']); assert.equal(h.items[0].qty, 36);
  assert.ok(h.items[1].qty % 5 === 0 && h.items[1].qty <= 120);
  assert.ok(h.covered <= h.delta + 20, `cubre ${h.covered} de ${h.delta}`);
});
t('pista: falta poco y solo queda post-gym → solo cacahuete en polvo', () => {
  const ev = conf(['desayuno', 'almuerzo', 'merienda', 'cena'], [{ type: 'MEAL_SET', payload: { date: D, mealId: 'cena', status: 'edited', items: [{ foodId: 'carne', qty: 250, unit: 'g', role: 'fixed' }, { foodId: 'pasta', qty: 55, unit: 'g', role: 'carb' }] } }]);
  const h = E.lastMealCarbHint(E.replay(ev), D, D);
  assert.equal(h.mealId, 'post'); assert.deepEqual(h.items.map(x => x.foodId), ['pb2']);
});
t('orden de marcado: markedOrd sigue el orden en que se marcan y no cambia al editar', () => {
  const s = E.replay(conf(['cena', 'desayuno'], [{ type: 'MEAL_SET', payload: { date: D, mealId: 'cena', status: 'skipped' } }]));
  const dv = E.dayView(s, D, D); const o = id => dv.meals.find(m => m.id === id).markedOrd;
  assert.ok(o('cena') < o('desayuno')); assert.equal(o('almuerzo'), null);
});
t('pista asPending: post-gym ya editado con 40 g de avena → sigue sugiriendo el resto (cacahuete)', () => {
  const post = [{ foodId: 'whey', qty: 1, unit: 'u', role: 'nego' }, { foodId: 'banana', qty: 1, unit: 'u', role: 'fixed' }, { foodId: 'avena', qty: 40, unit: 'g', role: 'extra' }];
  const ev = conf(['desayuno', 'almuerzo', 'cena'], [{ type: 'MEAL_SET', payload: { date: D, mealId: 'merienda', status: 'skipped' } }, { type: 'MEAL_SET', payload: { date: D, mealId: 'post', status: 'edited', items: post } }]);
  const s = E.replay(ev);
  assert.equal(E.lastMealCarbHint(s, D, D), null); // sin opción: no hay pendientes
  const h = E.lastMealCarbHint(s, D, D, { asPending: 'post' });
  assert.equal(h.mealId, 'post'); assert.ok(h.adds); assert.equal(h.items[0].foodId, 'pb2');
  const plain = E.lastMealCarbHint(E.replay(conf(['desayuno', 'almuerzo', 'cena'], [{ type: 'MEAL_SET', payload: { date: D, mealId: 'merienda', status: 'skipped' } }])), D, D);
  const post2 = [...post, { foodId: 'pb2', qty: 30, unit: 'g', role: 'extra' }];
  const h2 = E.lastMealCarbHint(E.replay([...ev, { type: 'MEAL_SET', payload: { date: D, mealId: 'post', status: 'edited', items: post2 } }]), D, D, { asPending: 'post' });
  assert.ok(!h2 || !h2.items.some(x => x.foodId === 'pb2'), 'no vuelve a sugerir cacahuete si ya hay 30 g (tope 36)');
  assert.ok(Math.abs((plain.delta - h.delta) - E.itemMacros(E.DEFAULT_FOODS, { foodId: 'avena', qty: 40, unit: 'g' }).kcal) < 2);
});
t('pista en vivo: post-gym pendiente con 2 scoops y sin banana (opts.items) recalcula sin grabar', () => {
  const ev = conf(['desayuno', 'almuerzo', 'cena'], [{ type: 'MEAL_SET', payload: { date: D, mealId: 'merienda', status: 'skipped' } }]);
  const s = E.replay(ev); const base = E.lastMealCarbHint(s, D, D);
  const live = E.lastMealCarbHint(s, D, D, { asPending: 'post', items: [{ foodId: 'whey', qty: 2, unit: 'u', role: 'nego' }, { foodId: 'banana', qty: 0, unit: 'u', role: 'fixed' }] });
  const dWhey = E.itemMacros(E.DEFAULT_FOODS, { foodId: 'whey', qty: 1, unit: 'u' }).kcal, dBan = E.itemMacros(E.DEFAULT_FOODS, { foodId: 'banana', qty: 1, unit: 'u' }).kcal;
  assert.ok(Math.abs((base.delta - live.delta) - (dWhey - dBan)) < 2, `${base.delta} → ${live.delta}`);
  assert.equal(E.dayView(s, D, D).meals.find(m => m.id === 'post').status, 'pending');
});
console.log(`\n${n} pruebas OK`);
