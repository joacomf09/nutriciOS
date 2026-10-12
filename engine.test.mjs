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
console.log(`\n${n} pruebas OK`);
