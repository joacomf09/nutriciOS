import * as E from './engine.js';
export const APP_VERSION = '1.4.2';
// ---------- actualización: compara con version.json publicado ----------
const UPD = { latest: null, checking: false };
async function checkUpdate(manual = false) {
  UPD.checking = true; if (manual) render();
  try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); const j = await r.json(); UPD.latest = j.version; }
  catch { if (manual) toast('Sin conexión: no se pudo comprobar'); }
  UPD.checking = false; render();
  if (manual && UPD.latest === APP_VERSION) toast('Ya tenés la última versión');
}
async function applyUpdate() {
  toast('Actualizando…');
  try { const regs = await navigator.serviceWorker?.getRegistrations?.() || []; for (const r of regs) await r.unregister(); } catch {}
  try { for (const k of await caches.keys()) await caches.delete(k); } catch {}
  location.replace(location.pathname + '?v=' + Date.now());
}

// ---------- persistencia: log de eventos en IndexedDB (fallback localStorage) ----------
const DB = 'nutricios', STORE = 'events';
let idb = null;
function openDB() {
  return new Promise(res => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'seq' });
      r.onsuccess = () => res(r.result); r.onerror = () => res(null);
    } catch { res(null); }
  });
}
async function loadEvents() {
  if (idb) return new Promise(res => { const out = []; const c = idb.transaction(STORE).objectStore(STORE).openCursor(); c.onsuccess = e => { const cur = e.target.result; if (cur) { out.push(cur.value); cur.continue(); } else res(out); }; c.onerror = () => res(out); });
  try { return JSON.parse(localStorage.getItem('nutricios_events') || '[]'); } catch { return []; }
}
async function saveEvent(ev) {
  if (idb) return new Promise(res => { const tx = idb.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(ev); tx.oncomplete = res; tx.onerror = res; });
  try { localStorage.setItem('nutricios_events', JSON.stringify(EVENTS)); } catch {}
}
async function clearAll() {
  if (idb) await new Promise(res => { const tx = idb.transaction(STORE, 'readwrite'); tx.objectStore(STORE).clear(); tx.oncomplete = res; tx.onerror = res; });
  try { localStorage.removeItem('nutricios_events'); } catch {}
}

let EVENTS = [], S = null;
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
async function emit(type, payload) {
  const ev = { seq: EVENTS.length + 1, id: uid(), ts: new Date().toISOString(), type, payload, v: 1 };
  EVENTS.push(ev); E.reduce(S, ev); await saveEvent(ev); render();
}
async function emitMany(list) {
  for (const [type, payload] of list) { const ev = { seq: EVENTS.length + 1, id: uid(), ts: new Date().toISOString(), type, payload, v: 1 }; EVENTS.push(ev); E.reduce(S, ev); await saveEvent(ev); }
  render();
}

// ---------- utilidades UI ----------
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r0 = x => E.round(x).toLocaleString('es-ES');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const DOW = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dLabel = s => { const d = E.toDate(s); return `${DOW[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const qtyLabel = it => it.unit === 'u' ? `${it.qty}×` : `${it.qty} g`;
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
function download(name, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const file = new File([blob], name, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(() => {}); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// ---------- estado de navegación ----------
const UI = { tab: 'hoy', day: null, open: {}, review: null, proposal: null, editPlan: null };

function render() {
  const T = todayStr(); if (!UI.day) UI.day = T;
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.tab));
  const f = { hoy: vHoy, semana: vSemana, plan: vPlan, datos: vDatos, ajustes: vAjustes }[UI.tab];
  const banner = UPD.latest && UPD.latest !== APP_VERSION ? `<div class="card hi row sp"><span>Nueva versión ${esc(UPD.latest)} disponible</span><button class="p s" data-a="update">Actualizar</button></div>` : '';
  $('#app').innerHTML = banner + f(T);
}

// ---------- HOY ----------
function pendingCloses(T) {
  const out = []; for (let i = 1; i <= 7; i++) { const d = E.addDays(T, -i); if (d < S.settings.startDate) break; if (!S.closes[d]) out.push(d); }
  return out.reverse();
}
function vHoy(T) {
  const d = UI.day, dv = E.dayView(S, d, T);
  const phase = E.phaseAt(S.settings, d); const week = Math.floor(E.diffDays(E.weekStart(d), E.weekStart(S.settings.startDate)) / 7) + 1;
  const pend = d === T ? pendingCloses(T) : [];
  const todayW = S.weights.filter(w => w.date === d);
  let h = `<div class="row sp"><button class="s" data-a="day" data-d="-1">‹</button><div style="text-align:center"><h1>${d === T ? 'Hoy' : dLabel(d)}</h1><div class="sub">${dLabel(d)} · semana ${week} · ${E.PHASE_LABEL[phase]} · plan ${esc(dv.version.id)}</div></div><button class="s" data-a="day" data-d="1" ${d >= T ? 'disabled' : ''}>›</button></div>`;
  if (pend.length) {
    const p = pend[pend.length - 1];
    h += `<div class="card hi"><h3>¿${p === E.addDays(T, -1) ? 'Ayer' : dLabel(p)} comiste el plan?</h3><div class="sub">${pend.length > 1 ? `${pend.length} días sin cerrar. ` : ''}Solo los días cerrados cuentan para calibrar.</div>
    <div class="row wrap" style="margin-top:10px"><button class="p" data-a="close" data-d="${p}" data-v="all_plan">✓ Sí, todo</button><button data-a="gotoday" data-d="${p}">✎ Con cambios</button><button data-a="close" data-d="${p}" data-v="not_logged">✗ No registré</button></div></div>`;
  }
  // peso
  h += `<div class="card"><div class="row sp"><div><h3>Peso en ayunas</h3><div class="sub">${todayW.length ? todayW.map(w => `${w.kg} kg${w.fatPct != null ? ' · ' + w.fatPct + ' %' : ''}`).join(' · ') : 'Opcional a diario; también se carga el lunes.'}</div></div>
    <div class="row" style="width:150px"><input id="wkg" type="number" inputmode="decimal" step="0.01" placeholder="kg"><button class="s p" data-a="addw" data-d="${d}">+</button></div></div></div>`;
  // totales
  const off_ = st => !['confirmed', 'edited', 'replaced'].includes(st);
    const E_ = dv.eatenConfirmed, TG = dv.target;
  const arc = (r, f, col) => { const C = 2 * Math.PI * r; return `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${col}" stroke-opacity=".18" stroke-width="9"/><circle cx="70" cy="70" r="${r}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C * Math.min(1, f)} ${C}" transform="rotate(-90 70 70)"/>`; };
  const ring = `<svg class="ring" width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Progreso de calorías y macros">${arc(62, E_.kcal / TG.kcal, 'var(--acc)')}${arc(50, E_.p / TG.p, 'var(--p)')}${arc(38, E_.c / TG.c, 'var(--c)')}${arc(26, E_.f / TG.f, 'var(--f)')}</svg>`;
  const tile = (lab, a, b, col) => `<div><div class="sub" style="font-size:12px">${lab}</div><div class="cond" style="font-size:22px;font-weight:700;color:${col}">${r0(a)}<span class="sub" style="font-size:13px"> /${r0(b)}</span></div></div>`;
  h += `<div class="card"><div class="row" style="gap:14px;align-items:center">${ring}<div class="grow" style="display:grid;gap:6px">${tile('KCAL', E_.kcal, TG.kcal, 'var(--acc)')}${tile('PROT g', E_.p, TG.p, 'var(--p)')}${tile('CARB g', E_.c, TG.c, 'var(--c)')}${tile('GRASA g', E_.f, TG.f, 'var(--f)')}</div></div>
    <div class="sub" style="margin-top:8px">Proyectado si comés lo pendiente: ${r0(dv.actual.kcal)} kcal</div>`;
  // gráfico por comidas: barras apiladas por macro (kcal), pendientes atenuadas
  { const ms = dv.meals.map(m => { const t = ['skipped', 'unknown'].includes(m.status) ? m.plannedTot : m.actualTot; return { m, t, done: !off_(m.status), skip: ['skipped', 'unknown'].includes(m.status) }; });
    const mx = Math.max(...ms.map(x => x.t.kcal), 1), avg = TG.kcal / ms.length, W = 350, bw = W / ms.length - 10;
    const bars = ms.map((x, i) => { const X = 5 + i * (bw + 10); let y = 120; const seg = (k, col) => { const hgt = k / mx * 104; y -= hgt; return `<rect x="${X}" y="${y}" width="${bw}" height="${hgt}" fill="${col}" ${x.done ? '' : 'fill-opacity="' + (x.skip ? '.12' : '.35') + '"'}/>`; };
      return seg(x.t.p * 4, 'var(--p)') + seg(x.t.c * 4, 'var(--c)') + seg(x.t.f * 9, 'var(--f)') + `<text x="${X + bw / 2}" y="136" text-anchor="middle" font-size="10" fill="var(--mute)">${esc(x.m.name.split(' ')[0].slice(0, 9))}</text>`; }).join('');
    const ya = 120 - avg / mx * 104;
    h += `<svg viewBox="0 0 360 140" width="100%" style="margin-top:10px" role="img" aria-label="Calorías por comida, apiladas por macro">${bars}<line x1="0" x2="360" y1="${ya}" y2="${ya}" stroke="var(--ink)" stroke-opacity=".6" stroke-dasharray="3 4"/></svg>
    <div class="row" style="gap:12px;font-size:12px;color:var(--mute)"><span><i class="dot" style="background:var(--p)"></i>Prot</span><span><i class="dot" style="background:var(--c)"></i>Carb</span><span><i class="dot" style="background:var(--f)"></i>Grasa</span><span>· · · media por comida</span></div>`; }
  h += `${dv.close ? `<div class="sub" style="margin-top:6px">Día cerrado: ${{ all_plan: 'todo según plan', with_changes: 'con cambios', not_logged: 'no registrado' }[dv.close.answer]} <button class="s" data-a="reopen" data-d="${d}">reabrir</button></div>` : ''}</div>`;
  // sugerencias
  const sug = E.redistributionSuggestion(S, d, T);
  if (d === T && !dv.close) {
    if (sug.sameDay.length) h += `<div class="card hi"><div><b>${r0(sug.delta)} kcal por colocar</b> → ${sug.sameDay.map(c => `+${E.round(c.qty - c.from)} g ${esc(S.foods[c.foodId].name.split(',')[0].toLowerCase())} (${mealName(c.mealId)})`).join(', ')}${sug.unplaced > 50 ? `. Quedan ${r0(sug.unplaced)} kcal al saldo semanal.` : ''}</div>
      <div class="row" style="margin-top:8px"><button class="p s" data-a="acceptRedist">Aceptar</button><button class="s" data-a="ignore">Ignorar</button></div></div>`;
    else if (sug.bankAllowance > 0 && sug.bankChanges?.length) h += `<div class="card hi"><div>Saldo semanal: podés sumar hasta <b>${r0(sug.bankAllowance)} kcal</b> hoy → ${sug.bankChanges.map(c => `+${E.round(c.qty - c.from)} g ${esc(S.foods[c.foodId].name.split(',')[0].toLowerCase())}`).join(', ')}. Caduca el domingo.</div>
      <div class="row" style="margin-top:8px"><button class="p s" data-a="acceptBank">Aceptar</button></div></div>`;
    if (sug.excess > 0) h += `<div class="card wn">+${r0(sug.excess)} kcal sobre la meta. Solo informativo: no se compensa.</div>`;
  }
  // comidas
  h += `<h2>Comidas</h2>`;
  for (const m of dv.meals) {
    const off = !['confirmed', 'edited', 'replaced'].includes(m.status);
    const tag = { pending: '<span class="tag">por comer</span>', assumed: '<span class="tag w">asumida</span>', confirmed: '<span class="tag ok">confirmada</span>', edited: '<span class="tag ok">editada</span>', skipped: '<span class="tag">omitida</span>', unknown: '<span class="tag">sin dato</span>', replaced: '<span class="tag ok">cambiada</span>' }[m.status] || '';
    const open = UI.open[d + m.id];
    h += `<div class="card"><div class="meal"><div class="chk ${off ? 'off' : ''}" data-a="toggle" data-m="${m.id}">${off ? '' : '✓'}</div>
      <div class="grow"><div class="row sp"><h3>${esc(m.name)}</h3><span class="num sub">${r0(off ? m.plannedTot.kcal : m.actualTot.kcal)} kcal</span></div>
      <div class="sub">${m.actualItems.map(it => `${qtyLabel(it)} ${esc(S.foods[it.foodId]?.name.split(',')[0].toLowerCase())}`).join(' · ')}</div><div class="row sp" style="margin-top:6px">${tag || '<span></span>'}<button class="mod" data-a="openm" data-m="${m.id}">${open ? 'Cerrar' : 'Modificar'}</button></div></div></div>`;
    if (open) {
      h += `<div class="items" style="margin-top:10px">`;
      m.actualItems.forEach((it, i) => {
        const pl = m.planned[i];
        const sel = pl?.choices ? `<select data-f="food" data-i="${i}">${pl.choices.map(c => `<option value="${c}" ${c === it.foodId ? 'selected' : ''}>${esc(S.foods[c].name)}</option>`).join('')}</select>` : `<span>${esc(S.foods[it.foodId].name)}</span>`;
        const stp = it.unit === 'u' ? (S.foods[it.foodId].unitName === 'scoop' ? 0.5 : 1) : (it.foodId === 'pb2' ? 12 : 5);
        h += `<div class="it" style="grid-template-columns:1fr auto">${sel}<div class="step"><button type="button" data-a="stp" data-i="${i}" data-s="${-stp}" aria-label="Menos">−</button><input type="number" inputmode="decimal" data-f="qty" data-i="${i}" value="${it.qty}" step="${stp}" aria-label="Cantidad"><button type="button" data-a="stp" data-i="${i}" data-s="${stp}" aria-label="Más">+</button></div></div>`;
      });
      h += `<div class="sub">Cantidades reales (unidades o gramos). Guardar la marca como comida; el plan original se conserva.</div>
        <div class="row" style="margin-top:8px"><select id="addf-${m.id}" class="grow">${Object.entries(S.foods).sort((a, b) => a[1].name.localeCompare(b[1].name)).map(([id, f]) => `<option value="${id}">${esc(f.name)}</option>`).join('')}</select><input id="addq-${m.id}" type="number" inputmode="decimal" placeholder="g" style="width:80px"><button class="s" data-a="addItem" data-m="${m.id}">+ Añadir</button></div>
        <div class="row" style="margin-top:8px"><button class="p s" data-a="saveMeal" data-m="${m.id}">Guardar</button><button class="s" data-a="skipMeal" data-m="${m.id}">No la comí</button><button class="s" data-a="resetMeal" data-m="${m.id}">Volver al plan</button></div></div>`;
    }
    h += `</div>`;
  }
  // extras
  h += `<h2>Extras</h2><div class="card">${dv.extras.map(x => `<div class="row sp"><span>${esc(x.name)} ${x.estimated ? '<span class="tag">estimado</span>' : ''}</span><span class="num">${r0(x.kcal)} kcal <button class="s del" data-a="delx" data-x="${x.id}">✕</button></span></div>`).join('') || '<div class="sub">Comida fuera del plan.</div>'}
    <div class="row wrap" style="margin-top:8px"><button class="s" data-a="quick" data-k="200">+200</button><button class="s" data-a="quick" data-k="500">+500</button><button class="s" data-a="quick" data-k="1000">+1.000</button><button class="s" data-a="custom">Personalizado</button></div>
    <div id="customx" class="hidden"><label>Nombre</label><input id="xn" placeholder="Ej.: pizza"><div class="row"><div class="grow"><label>kcal</label><input id="xk" type="number"></div><div class="grow"><label>P</label><input id="xp" type="number"></div><div class="grow"><label>C</label><input id="xc" type="number"></div><div class="grow"><label>G</label><input id="xf" type="number"></div></div><button class="p s" style="margin-top:8px" data-a="addx">Añadir</button></div></div>`;
  if (d <= T && !dv.close) h += `<button class="p" style="width:100%;margin-top:8px" data-a="close" data-manual="1" data-d="${d}" data-v="with_changes">Cerrar ${d === T ? 'hoy' : 'este día'}</button><div class="sub" style="text-align:center;margin-top:6px">Las comidas no marcadas cuentan como no comidas.</div>`;
  return h;
}
const mealName = id => (E.versionAt(S, UI.day).meals.find(m => m.id === id) || {}).name || id;

// ---------- SEMANA ----------
function reviewWeek(T) { // semana a revisar: la última completa
  return E.addDays(E.weekStart(T), -7);
}
function vPreview(T) {
  const pv = E.weekPreview(S, T); const isPrev = !Object.keys(S.reviews).length;
  const maxK = Math.max(...pv.rows.map(r => Math.max(r.target, r.eaten || 0)));
  const bars = pv.rows.map((r, i) => { const x = 14 + i * 46, H = 110; const dvv = E.dayView(S, r.date, T); const mac = r.date === T ? dvv.eatenConfirmed : (r.closed ? dvv.actual : null);
    let y = 130; const seg = (k, col) => { const hh = k / maxK * H; y -= hh; return `<rect x="${x}" y="${y}" width="30" height="${hh}" fill="${col}"/>`; };
    return `<rect x="${x}" y="${130 - r.target / maxK * H}" width="30" height="${r.target / maxK * H}" fill="var(--line)" fill-opacity=".5"/>` + (mac ? seg(mac.p * 4, 'var(--p)') + seg(mac.c * 4, 'var(--c)') + seg(mac.f * 9, 'var(--f)') : '') + `<text x="${x + 15}" y="148" text-anchor="middle" font-size="11" fill="var(--mute)">${DOW[i]}</text>`; }).join('') + `<line x1="8" x2="342" y1="${130 - pv.plan / maxK * 110}" y2="${130 - pv.plan / maxK * 110}" stroke="var(--ink)" stroke-opacity=".6" stroke-dasharray="3 4"/>`;
  const wpts = E.dailyWeights(S, E.addDays(T, -27), T);
  let wsvg = '';
  if (wpts.length >= 2) { const ks = wpts.map(p => p.kg), lo = Math.min(...ks) - 0.3, hi = Math.max(...ks) + 0.3; const X = d => 14 + (E.diffDays(d, E.addDays(T, -27)) / 27) * 322, Y = k => 100 - (k - lo) / (hi - lo) * 84;
    wsvg = `<svg viewBox="0 0 350 120" width="100%" role="img" aria-label="Peso de los últimos 28 días"><polyline fill="none" stroke="var(--acc)" stroke-width="2.5" stroke-linejoin="round" points="${wpts.map(p => X(p.date) + ',' + Y(p.kg)).join(' ')}"/>${wpts.map(p => `<circle cx="${X(p.date)}" cy="${Y(p.kg)}" r="3" fill="var(--acc)"/>`).join('')}<text x="14" y="116" font-size="11" fill="var(--mute)">${dLabel(E.addDays(T, -27))}</text><text x="336" y="116" text-anchor="end" font-size="11" fill="var(--mute)">hoy</text><text x="336" y="12" text-anchor="end" font-size="11" fill="var(--mute)">${E.round(hi - 0.3, 1)} kg</text></svg>`; }
  const sl = pv.slopeWeek == null ? '—' : (pv.slopeWeek >= 0 ? '+' : '') + E.round(pv.slopeWeek, 2) + ' kg/sem';
  return `<div class="row sp"><h1>Semana en curso</h1>${isPrev ? '<span class="tag w">PREVIEW</span>' : ''}</div>
  <div class="sub">${dLabel(pv.weekStart)} → ${dLabel(E.addDays(pv.weekStart, 6))} · ${E.PHASE_LABEL[pv.phase]}${isPrev ? ' · datos parciales: se actualiza a medida que cargás. Los datos reales reemplazan esta vista después de la primera revisión.' : ''}</div>
  <div class="card"><div class="row sp"><h3>Comido por día</h3><span class="sub"><i class="dot" style="background:var(--p)"></i>P <i class="dot" style="background:var(--c)"></i>C <i class="dot" style="background:var(--f)"></i>G · · meta</span></div><svg viewBox="0 0 350 156" width="100%" role="img" aria-label="Calorías comidas por día">${bars}</svg></div>
  <div class="card"><div class="row sp"><h3>Peso · 28 días</h3><span class="sub cond" style="font-size:16px">${sl}</span></div>${wsvg || '<div class="sub">Faltan pesajes.</div>'}</div>
  <div class="card"><table>
   <tr><td>Días cerrados</td><td class="r num">${pv.closedDays}/7 ${pv.ready.days ? '✓' : `<small class="m">(mín. ${S.settings.params.daysClosedMin})</small>`}</td></tr>
   <tr><td>Pesajes esta semana</td><td class="r num">${pv.weighins}/7 ${pv.ready.weighins ? '✓' : `<small class="m">(mín. ${S.settings.params.weighinsMin})</small>`}</td></tr>
   <tr><td>Ingesta media (días cerrados)</td><td class="r num">${pv.intake == null ? '—' : r0(pv.intake) + ' kcal'}</td></tr>
   <tr><td>Gasto estimado actual</td><td class="r num">${r0(pv.tdeeNow)} kcal</td></tr>
   <tr><td>Gasto implícito con estos datos</td><td class="r num">${pv.implied == null ? '—' : r0(pv.implied) + ' kcal'}</td></tr>
   <tr><td>Meta de fase próxima semana</td><td class="r num">${r0(pv.goalNext)} kcal <small class="m">(plan hoy ${r0(pv.plan)})</small></td></tr></table>
   <div class="sub" style="margin-top:8px">Provisional: la propuesta real se calcula en la revisión del lunes, con la semana completa.</div></div>`;
}
function vSemana(T) {
  const ws = UI.review || reviewWeek(T); const we = E.addDays(ws, 6);
  if (ws < S.settings.startDate) return vPreview(T) + `<div class="card">La primera revisión: ${dLabel(E.addDays(E.weekStart(S.settings.startDate), 7))}.</div>${vHistory(T)}`;
  const rv = S.reviews[ws] || {};
  const days = E.range(ws, 7).map(d => E.dayView(S, d, T));
  const closed = days.filter(d => d.hasData).length;
  const wts = E.range(ws, 7).map(d => ({ d, w: S.weights.filter(x => x.date === d) }));
  let h = vPreview(T) + `<h1 style="margin-top:28px">Revisión semanal</h1><div class="sub">${dLabel(ws)} → ${dLabel(we)} · ${closed}/7 días cerrados</div>`;
  h += `<div class="card"><h3>1. Pesajes en ayunas</h3>`;
  for (const { d, w } of wts) h += `<div class="it row sp" style="margin:6px 0"><span>${dLabel(d)}</span><input style="width:110px" type="number" inputmode="decimal" step="0.01" data-wd="${d}" value="${w.length ? w[0].kg : ''}" placeholder="kg"></div>`;
  h += `</div><div class="card"><h3>2. Sesiones realizadas</h3><div class="row"><div class="grow"><label>Fuerza</label><input id="sf" type="number" value="${rv.strength ?? ''}"></div><div class="grow"><label>Natación</label><input id="sn" type="number" value="${rv.swim ?? ''}"></div></div></div>
  <div class="card"><h3>3. Contexto</h3><div class="chips" id="ctx">${['semana normal', 'viaje', 'enfermedad', 'alcohol', 'sueño malo', 'estrés'].map(c => `<button data-a="ctx" data-c="${c}" class="${(rv.context || ['semana normal']).includes(c) ? 'on' : ''}">${c}</button>`).join('')}</div><label>Nota</label><input id="note" value="${esc(rv.note || '')}">
  <label>% grasa Withings (opcional)</label><input id="fatp" type="number" step="0.1" value="${rv.fatPct ?? ''}"></div>
  <button class="p" style="width:100%" data-a="calc" data-w="${ws}">Calcular propuesta</button>`;
  const p = UI.proposal && UI.proposal.weekStart === ws ? UI.proposal : (S.reviews[ws] ? E.weeklyProposal(S, ws, T) : null);
  if (p) h += vProposal(p, T);
  return h + vHistory(T);
}
function vProposal(p, T) {
  const dec = S.decisions[p.id];
  let h = `<h2>Propuesta</h2><div class="card ${p.deltaKcal ? 'hi' : ''}">`;
  h += p.why.map(w => `<div class="sub" style="margin:3px 0">${esc(w)}</div>`).join('');
  h += `<table style="margin-top:10px"><tr><th></th><th class="r">Antes</th><th class="r">Después</th></tr>
    <tr><td>Meta</td><td class="r num">${r0(p.before.kcal)}</td><td class="r num"><b>${r0(p.after.kcal)}</b> (${p.deltaKcal >= 0 ? '+' : ''}${r0(p.deltaKcal)})</td></tr>
    <tr><td>P / C / G</td><td class="r num">${r0(p.before.p)} / ${r0(p.before.c)} / ${r0(p.before.f)}</td><td class="r num">${r0(p.after.p)} / ${r0(p.after.c)} / ${r0(p.after.f)}</td></tr>
    ${p.changes.map(c => `<tr><td>${esc(S.foods[c.foodId].name.split(',')[0])} · ${esc(mealName(c.mealId))}</td><td class="r num">${c.from}</td><td class="r num"><b>${c.qty}</b></td></tr>`).join('')}
    ${p.phaseChange ? `<tr><td>Fase</td><td class="r">${E.PHASE_LABEL[E.phaseAt(S.settings, T)]}</td><td class="r"><b>${E.PHASE_LABEL[p.phaseChange]}</b></td></tr>` : ''}</table>`;
  if (p.warnings.length) h += p.warnings.map(w => `<div class="sub" style="color:var(--warn);margin-top:6px">⚠︎ ${esc(w)}</div>`).join('');
  if (dec) h += `<div class="sub" style="margin-top:10px">Decisión: <b>${dec.decision === 'approved' ? 'aprobada' : 'rechazada'}</b>.</div>`;
  else if (p.deltaKcal || p.phaseChange) h += `<div class="row" style="margin-top:12px"><button class="p" data-a="approve">Aprobar</button><button data-a="reject">Rechazar (sigue el plan)</button></div><div class="sub" style="margin-top:6px">Al decidir se ofrece el respaldo semanal.</div>`;
  else h += `<div class="row" style="margin-top:12px"><button data-a="reject">OK, sin cambios</button></div>`;
  return h + `</div>`;
}
function vHistory(T) {
  const hist = E.calibrationHistory(S, T); if (!hist.length) return '';
  return `<h2>Historial</h2><div class="card"><table><tr><th>Semana</th><th class="r">Peso/sem</th><th class="r">Ingesta</th><th class="r">Gasto est.</th></tr>${hist.slice().reverse().map(x => `<tr><td>${dLabel(x.weekStart)}${x.calibrable ? '' : ' <span class="tag">no calib.</span>'}</td><td class="r num">${x.slopeWeek == null ? '—' : (x.slopeWeek >= 0 ? '+' : '') + E.round(x.slopeWeek, 2)}</td><td class="r num">${x.intake == null ? '—' : r0(x.intake)}</td><td class="r num">${r0(x.tdee)} ±${x.ci}</td></tr>`).join('')}</table></div>`;
}

// ---------- PLAN ----------
function vPlan(T) {
  const v = E.versionAt(S, T); const tot = E.mealsTotal(S.foods, v.meals); const fat = E.fatStatus(S);
  const kg = S.weights.at(-1)?.kg;
  let h = `<h1>Plan vigente</h1><div class="sub">${esc(v.id)} · desde ${dLabel(v.effectiveFrom)} · ${esc(v.reason || '')}</div>
  <div class="card"><div class="big">${r0(tot.kcal)} kcal</div><div class="sub num">P ${r0(tot.p)} g${kg ? ` (${E.round(tot.p / kg, 1)} g/kg)` : ''} · C ${r0(tot.c)} g · G ${r0(tot.f)} g</div></div>`;
  const ed = UI.editPlan;
  for (const m of (ed || v.meals)) {
    const mt = E.sumItems(S.foods, m.items);
    h += `<div class="card"><div class="row sp"><h3>${esc(m.name)}</h3><span class="sub num">${r0(mt.kcal)} kcal</span></div>`;
    if (ed) h += `<div class="items">${m.items.map((it, i) => `<div class="it"><span>${esc(S.foods[it.foodId].name)} <small class="m">(${it.unit === 'u' ? S.foods[it.foodId].unitName : 'g'}${it.role === 'carb' ? ', palanca' : it.role === 'nego' ? ', 2ª palanca' : ''})</small></span><input type="number" data-pm="${m.id}" data-pi="${i}" value="${it.qty}"></div>`).join('')}</div>`;
    else h += `<div class="sub">${m.items.map(it => `${qtyLabel(it)} ${esc(S.foods[it.foodId].name.split(',')[0].toLowerCase())}${it.role === 'carb' ? '*' : ''}`).join(' · ')}</div>`;
    h += `</div>`;
  }
  h += ed ? `<div class="row"><button class="p" data-a="savePlan">Guardar nueva versión</button><button data-a="cancelPlan">Cancelar</button></div>` : `<div class="sub">* palanca de ajuste (carbohidratos).</div><button style="margin-top:8px" data-a="editPlan">Editar plan</button>`;
  // fases
  const ph = S.settings.phases, endD = S.settings.endDate || '2026-12-20', curPh = E.phaseAt(S.settings, T);
  h += `<h2>Fases</h2><div class="card">` + ph.map((p, i) => { const to = i < ph.length - 1 ? E.addDays(ph[i + 1].from, -1) : endD; const now = p.from <= T && T <= to; const wk = Math.max(1, Math.round((E.diffDays(to, p.from) + 1) / 7));
    return `<div style="padding:10px 0;border-bottom:1px solid var(--line)"><div class="row sp"><select data-phk="${i}" style="width:auto">${Object.entries(E.PHASE_LABEL).map(([k, l]) => `<option value="${k}" ${k === p.phase ? 'selected' : ''}>${l}</option>`).join('')}</select>${now ? '<span class="tag ok">actual</span>' : ''}${ph.length > 1 && i > 0 ? `<button class="s del" data-a="delPhase" data-i="${i}" aria-label="Quitar fase">✕</button>` : ''}</div>
      <div class="row" style="margin-top:6px"><div class="grow"><label>Desde</label><input type="date" data-phf="${i}" value="${p.from}" ${i === 0 ? 'disabled' : ''}></div><div class="grow"><label>Hasta</label><input type="date" data-pht="${i}" value="${to}"></div></div><div class="sub" style="margin-top:4px">≈ ${wk} semanas</div></div>`; }).join('') +
  `<div class="row wrap" style="margin-top:10px"><button class="p s" data-a="savePhases">Guardar fases</button><button class="s" data-a="addPhase">+ Añadir fase</button></div><div class="sub" style="margin-top:6px">El "hasta" de una fase mueve el "desde" de la siguiente. El último "hasta" es el fin del plan (viaje).</div></div>`;
  h += `<h2>Límite de salida</h2><div class="card"><div class="sub" style="margin-bottom:6px">Si durante el volumen tu % de grasa Withings sube ${S.settings.exitFatPoints} puntos sobre tu punto de partida, la app te propone pasar a mantenimiento (vos aprobás). Usa la mediana de las últimas 8 mediciones para no reaccionar a un día suelto.</div><div class="sub">Grasa Withings base ${fat.baseline == null ? '—' : E.round(fat.baseline, 1) + ' %'} · actual ${fat.current == null ? `— (faltan ${8 - fat.n} lecturas)` : E.round(fat.current, 1) + ' %'} · límite +${S.settings.exitFatPoints} puntos ${fat.exitTriggered ? '<b style="color:var(--warn)">ALCANZADO</b>' : ''}</div></div>`;
  h += `<h2>Versiones</h2><div class="card">${S.versions.slice().reverse().map(x => `<div class="row sp" style="margin:6px 0"><div><b>${esc(x.id)}</b> <small class="m">${dLabel(x.effectiveFrom)} · ${r0(E.mealsTotal(S.foods, x.meals).kcal)} kcal</small><div class="sub">${esc(x.reason || '')}</div></div>${x.id !== v.id ? `<button class="s" data-a="rollback" data-v="${x.id}">Volver</button>` : '<span class="tag ok">vigente</span>'}</div>`).join('')}</div>`;
  return h;
}

// ---------- DATOS ----------
function vDatos(T) {
  const ws = S.weights.slice(-40).reverse();
  return `<h1>Datos</h1>
  <div class="card hi"><h3>Exportar para IA</h3><div class="sub">Prompt + CSV de días, pesos y semanas, listo para pegar en Claude o ChatGPT.</div><div class="row" style="margin-top:8px"><button class="p s" data-a="ai">Compartir archivo</button><button class="s" data-a="aicopy">Copiar texto</button></div></div>
  <div class="card"><h3>Respaldo</h3><div class="sub">El respaldo es la copia completa de tus datos. Hacelo cada lunes (iCloud/Archivos).</div><div class="row wrap" style="margin-top:8px"><button class="s" data-a="backup">Exportar respaldo</button><label class="s" style="margin:0"><input id="imp" type="file" accept=".json,application/json" class="hidden"><span class="tag" style="padding:9px 12px;font-size:14px">Importar respaldo</span></label></div></div>
  <div class="card"><h3>Importar Withings</h3><div class="sub">Archivo <code>weight.csv</code> del export de Withings (Health Mate → Descargar mis datos). Ignora duplicados.</div><label style="margin-top:8px"><input id="wcsv" type="file" accept=".csv,text/csv" class="hidden"><span class="tag" style="padding:9px 12px;font-size:14px">Elegir weight.csv</span></label></div>
  <h2>Pesos (${S.weights.length})</h2><div class="card"><table><tr><th>Fecha</th><th class="r">kg</th><th class="r">% grasa</th><th></th></tr>${ws.map(w => `<tr><td>${dLabel(w.date)} <small class="m">${w.date.slice(0, 4)}</small></td><td class="r num">${w.kg}</td><td class="r num">${w.fatPct ?? ''}</td><td class="r"><button class="s del" data-a="delw" data-w="${w.id}">✕</button></td></tr>`).join('')}</table></div>`;
}

// ---------- AJUSTES ----------
function vAjustes(T) {
  const P = S.settings.params;
  const f = (k, l, step = 1) => `<div class="it row sp" style="margin:6px 0"><span>${l}</span><input style="width:110px" type="number" step="${step}" data-par="${k}" value="${P[k]}"></div>`;
  return `<h1>Ajustes</h1>
  <div class="card"><div class="row sp"><div><h3>Versión ${APP_VERSION}</h3><div class="sub">${UPD.latest ? (UPD.latest === APP_VERSION ? 'Al día' : 'Disponible: ' + esc(UPD.latest)) : 'Sin comprobar'}</div></div><div class="row"><button class="s" data-a="checkupd">${UPD.checking ? 'Comprobando…' : 'Buscar'}</button><button class="p s" data-a="update">Actualizar</button></div></div><div class="sub" style="margin-top:6px">Actualizar recarga la app desde GitHub. Tus datos no se tocan.</div></div>
  <div class="card"><h3>Recordatorio diario (Atajos de iOS)</h3><div class="sub">Atajos → Automatización → Nueva → Hora del día: 22:00, diariamente, ejecutar inmediatamente → Acción "Abrir URL" → <code>${esc(location.href.split('#')[0])}</code>. Al abrir, la app te pregunta por el día.</div></div>
  <div class="card"><h3>Parámetros del motor</h3>
  ${f('stepCap', 'Paso semanal máx. (kcal)')}${f('stepCapHyst', 'Paso con histéresis (kcal)')}${f('deadband', 'Banda muerta (kcal)')}${f('carryCap', 'Tope arrastre/día (kcal)')}${f('kcalFloor', 'Piso calórico (kcal)')}${f('calibrationWeeksMin', 'Semanas de calibración')}${f('gBase', 'Velocidad de aprendizaje', 0.05)}
  <div class="it row sp" style="margin:6px 0"><span>Superávit volumen limpio</span><input style="width:110px" type="number" data-dev="volumen" value="${P.phaseDev.volumen}"></div>
  <div class="it row sp" style="margin:6px 0"><span>Superávit volumen agresivo</span><input style="width:110px" type="number" data-dev="volumen_agresivo" value="${P.phaseDev.volumen_agresivo}"></div>
  <div class="it row sp" style="margin:6px 0"><span>Límite de salida (puntos grasa)</span><input style="width:110px" type="number" step="0.5" id="exitp" value="${S.settings.exitFatPoints}"></div>
  <button class="p s" style="margin-top:8px" data-a="savePar">Guardar</button></div>
  <div class="card hi"><h3>+ Nuevo alimento</h3><div class="sub">Valores de la etiqueta. Elegí si son por 100 g o por porción.</div>
    <label>Nombre</label><input id="nf-name" placeholder="Ej.: Crema de cacahuete en polvo">
    <div class="row"><div class="grow"><label>Los valores son</label><select id="nf-base"><option value="100">por 100 g</option><option value="portion">por porción</option></select></div><div class="grow"><label>Porción (g)</label><input id="nf-pg" type="number" inputmode="decimal" placeholder="ej. 12"></div></div>
    <div class="row">${['kcal', 'p', 'c', 'f'].map(k => `<div class="grow"><label>${{ kcal: 'kcal', p: 'Prot g', c: 'Carb g', f: 'Grasa g' }[k]}</label><input id="nf-${k}" type="number" inputmode="decimal" step="0.1"></div>`).join('')}</div>
    <label>Nombre de la porción (opcional)</label><input id="nf-un" placeholder="cda, scoop, rebanada…">
    <button class="p s" style="margin-top:10px" data-a="newFood">Guardar alimento</button></div>
  <div class="card"><h3>Alimentos</h3><div class="sub">Valores por 100 g. Editá con los de tus etiquetas.</div>${Object.entries(S.foods).map(([id, fd]) => `<details style="margin:8px 0"><summary>${esc(fd.name)} <small class="m">${fd.per100.kcal} kcal${fd.unitG ? ` · ${fd.unitName} = ${fd.unitG} g` : ''}</small></summary>
    <div class="row">${['kcal', 'p', 'c', 'f'].map(k => `<div class="grow"><label>${k.toUpperCase()}</label><input type="number" step="0.1" data-food="${id}" data-k="${k}" value="${fd.per100[k]}"></div>`).join('')}${fd.unitG ? `<div class="grow"><label>g/${esc(fd.unitName)}</label><input type="number" data-food="${id}" data-k="unitG" value="${fd.unitG}"></div>` : ''}</div>
    <button class="s" style="margin-top:6px" data-a="saveFood" data-food="${id}">Guardar</button></details>`).join('')}</div>
  <div class="card"><h3>Peligro</h3><button class="s del" data-a="wipe">Borrar todos los datos</button></div>
  <div class="sub" style="text-align:center;margin:16px 0">NutriciOS ${APP_VERSION} · motor ${E.CALC_VERSION} · ${EVENTS.length} eventos</div>`;
}

// ---------- acciones ----------
document.addEventListener('click', async e => {
  const nb = e.target.closest('nav button'); if (nb) { UI.tab = nb.dataset.tab; UI.proposal = null; render(); scrollTo(0, 0); return; }
  const el = e.target.closest('[data-a]'); if (!el) return;
  const a = el.dataset.a, T = todayStr(), d = UI.day;
  const dv = () => E.dayView(S, d, T);
  switch (a) {
    case 'day': { const n = E.addDays(d, +el.dataset.d); if (n <= T) { UI.day = n; render(); } break; }
    case 'gotoday': UI.day = el.dataset.d; render(); break;
    case 'close': {
      const cd = el.dataset.d, ans = el.dataset.v;
      if (el.dataset.manual) { const v = E.dayView(S, cd, T); const list = v.meals.filter(m => ['pending', 'assumed'].includes(m.status)).map(m => ['MEAL_SET', { date: cd, mealId: m.id, status: 'skipped' }]); list.push(['DAY_CLOSE', { date: cd, answer: 'with_changes' }]); await emitMany(list); }
      else await emit('DAY_CLOSE', { date: cd, answer: ans });
      toast('Día cerrado'); break; }
    case 'reopen': await emit('DAY_CLOSE', { date: d, answer: null }); break;
    case 'addw': { const kg = parseFloat($('#wkg').value.replace(',', '.')); if (kg > 30 && kg < 250) { await emit('WEIGHT', { id: uid(), date: el.dataset.d, kg }); toast('Peso guardado'); } break; }
    case 'toggle': {
      const m = dv().meals.find(x => x.id === el.dataset.m);
      if (['confirmed', 'edited', 'replaced'].includes(m.status) && m.touched) await emit('MEAL_RESET', { date: d, mealId: m.id });
      else await emit('MEAL_SET', { date: d, mealId: m.id, status: 'confirmed' });
      break; }
    case 'addItem': { const mid = el.dataset.m; const fid = $('#addf-' + mid).value, q = parseFloat(($('#addq-' + mid).value || '').replace(',', '.'));
      if (!(q > 0)) { toast('Indicá los gramos'); break; }
      const m = dv().meals.find(x => x.id === mid); const items = m.actualItems.map(i => ({ ...i })).concat([{ foodId: fid, qty: q, unit: 'g', role: 'extra' }]);
      await emit('MEAL_SET', { date: d, mealId: mid, status: 'edited', items }); UI.open[d + mid] = true; render(); toast('Añadido'); break; }
    case 'stp': { const inp = el.closest('.it').querySelector('input'); inp.value = Math.max(0, E.round((parseFloat(inp.value) || 0) + parseFloat(el.dataset.s), 2)); break; }
    case 'openm': UI.open[d + el.dataset.m] = !UI.open[d + el.dataset.m]; render(); break;
    case 'saveMeal': {
      const m = dv().meals.find(x => x.id === el.dataset.m); const card = el.closest('.card');
      const items = m.actualItems.map((it, i) => ({ ...it }));
      card.querySelectorAll('[data-f]').forEach(inp => { const i = +inp.dataset.i; if (inp.dataset.f === 'qty') items[i].qty = parseFloat(inp.value.replace(',', '.')) || 0; else items[i].foodId = inp.value; });
      const changedFood = items.some((it, i) => it.foodId !== m.planned[i].foodId);
      UI.open[d + m.id] = false;
      await emit('MEAL_SET', { date: d, mealId: m.id, status: changedFood ? 'replaced' : 'edited', items }); toast('Guardado'); break; }
    case 'skipMeal': UI.open[d + el.dataset.m] = false; await emit('MEAL_SET', { date: d, mealId: el.dataset.m, status: 'skipped' }); break;
    case 'resetMeal': UI.open[d + el.dataset.m] = false; await emit('MEAL_RESET', { date: d, mealId: el.dataset.m }); break;
    case 'acceptRedist': { const s = E.redistributionSuggestion(S, d, T); await emitMany(s.sameDay.map(c => ['OVERRIDE', { date: d, mealId: c.mealId, foodId: c.foodId, qty: c.qty, kcal: c.kcal, fromBank: false }])); toast('Redistribución aplicada'); break; }
    case 'acceptBank': { const s = E.redistributionSuggestion(S, d, T); await emitMany(s.bankChanges.map(c => ['OVERRIDE', { date: d, mealId: c.mealId, foodId: c.foodId, qty: c.qty, kcal: c.kcal, fromBank: true }])); toast('Saldo aplicado'); break; }
    case 'ignore': el.closest('.card').remove(); break;
    case 'quick': await emit('EXTRA', { date: d, id: uid(), name: `Extra rápido +${el.dataset.k}`, kcal: +el.dataset.k, p: +el.dataset.k * 0.15 / 4, c: +el.dataset.k * 0.45 / 4, f: +el.dataset.k * 0.4 / 9, estimated: true }); break;
    case 'custom': $('#customx').classList.toggle('hidden'); break;
    case 'addx': { const k = +$('#xk').value; if (k > 0) await emit('EXTRA', { date: d, id: uid(), name: $('#xn').value || 'Comida', kcal: k, p: +$('#xp').value || 0, c: +$('#xc').value || 0, f: +$('#xf').value || 0 }); break; }
    case 'delx': await emit('EXTRA_DEL', { date: d, id: el.dataset.x }); break;
    case 'ctx': el.classList.toggle('on'); break;
    case 'calc': {
      const ws = el.dataset.w; const list = [];
      document.querySelectorAll('[data-wd]').forEach(inp => { const kg = parseFloat(inp.value.replace(',', '.')); const day = inp.dataset.wd; const ex = S.weights.find(w => w.date === day);
        if (kg > 30 && kg < 250 && (!ex || ex.kg !== kg)) list.push(['WEIGHT', { id: ex ? ex.id : uid(), date: day, kg, fatPct: ex?.fatPct ?? null }]); });
      const fatp = parseFloat($('#fatp').value); if (fatp > 3 && fatp < 60) { const last = E.addDays(ws, 6); const ex = S.weights.filter(w => w.date <= last).at(-1); if (ex) list.push(['WEIGHT', { ...ex, fatPct: fatp }]); }
      list.push(['REVIEW', { weekStart: ws, strength: +$('#sf').value || 0, swim: +$('#sn').value || 0, context: [...document.querySelectorAll('#ctx .on')].map(b => b.dataset.c), note: $('#note').value, fatPct: fatp || null }]);
      await emitMany(list); UI.proposal = E.weeklyProposal(S, ws, T); render(); break; }
    case 'approve': {
      const p = UI.proposal || E.weeklyProposal(S, UI.review || reviewWeek(T), T);
      const today = E.dayView(S, T, T); const eff = today.meals.some(m => m.touched) || today.close ? E.addDays(T, 1) : T;
      const list = [['VERSION', { id: 'v' + (S.versions.length + 1), effectiveFrom: eff, meals: p.meals, reason: `Revisión semana ${dLabel(p.weekStart)}: ${p.deltaKcal >= 0 ? '+' : ''}${p.deltaKcal} kcal`, proposalId: p.id, deltaKcal: p.deltaKcal, calcVersion: p.calcVersion }], ['DECISION', { proposalId: p.id, decision: 'approved' }]];
      if (p.phaseChange) list.push(['SETTINGS', { phases: [...S.settings.phases, { from: eff, phase: p.phaseChange }] }]);
      await emitMany(list); toast('Aprobada · vigente desde ' + dLabel(eff)); backup(); break; }
    case 'reject': { const p = UI.proposal || E.weeklyProposal(S, UI.review || reviewWeek(T), T); await emit('DECISION', { proposalId: p.id, decision: 'rejected' }); backup(); break; }
    case 'editPlan': UI.editPlan = JSON.parse(JSON.stringify(E.versionAt(S, T).meals)); render(); break;
    case 'cancelPlan': UI.editPlan = null; render(); break;
    case 'savePlan': {
      document.querySelectorAll('[data-pm]').forEach(inp => { const m = UI.editPlan.find(x => x.id === inp.dataset.pm); m.items[+inp.dataset.pi].qty = parseFloat(inp.value.replace(',', '.')) || 0; });
      const today = E.dayView(S, T, T); const eff = today.meals.some(m => m.touched) || today.close ? E.addDays(T, 1) : T;
      const meals = UI.editPlan; UI.editPlan = null;
      await emit('VERSION', { id: 'v' + (S.versions.length + 1), effectiveFrom: eff, meals, reason: 'Edición manual' }); toast('Nueva versión desde ' + dLabel(eff)); break; }
    case 'rollback': { const old = S.versions.find(x => x.id === el.dataset.v); const today = E.dayView(S, T, T); const eff = today.meals.some(m => m.touched) || today.close ? E.addDays(T, 1) : T;
      await emit('VERSION', { id: 'v' + (S.versions.length + 1), effectiveFrom: eff, meals: old.meals, reason: `Vuelta a ${old.id}`, restores: old.id }); break; }
    case 'savePhases': case 'addPhase': {
      const n = S.settings.phases.length; const rows = [];
      for (let i = 0; i < n; i++) rows.push({ phase: document.querySelector(`[data-phk="${i}"]`).value, from: document.querySelector(`[data-phf="${i}"]`).value, to: document.querySelector(`[data-pht="${i}"]`).value });
      for (let i = 1; i < n; i++) if (rows[i - 1].to) rows[i].from = E.addDays(rows[i - 1].to, 1);
      let endDate = rows[n - 1].to;
      if (a === 'addPhase') { const from = E.addDays(endDate, 1); rows.push({ phase: 'mantenimiento', from }); endDate = E.addDays(from, 13); }
      const phases = rows.map(r => ({ from: r.from, phase: r.phase })).filter((r, i, arr) => i === 0 || r.from > arr[i - 1].from);
      await emit('SETTINGS', { phases, endDate }); toast('Fases guardadas'); break; }
    case 'delPhase': { const i = +el.dataset.i; const phases = S.settings.phases.filter((_, j) => j !== i); await emit('SETTINGS', { phases }); break; }
    case 'setPhase': { const from = $('#phd').value, ph = $('#php').value; if (from) { const phases = S.settings.phases.filter(p => p.from < from).concat([{ from, phase: ph }]); await emit('SETTINGS', { phases }); } break; }
    case 'savePar': { const params = JSON.parse(JSON.stringify(S.settings.params));
      document.querySelectorAll('[data-par]').forEach(i => params[i.dataset.par] = parseFloat(i.value));
      document.querySelectorAll('[data-dev]').forEach(i => params.phaseDev[i.dataset.dev] = parseFloat(i.value));
      await emit('SETTINGS', { params, exitFatPoints: parseFloat($('#exitp').value) }); toast('Guardado'); break; }
    case 'newFood': {
      const name = $('#nf-name').value.trim(); const v = k => parseFloat(($('#nf-' + k).value || '').replace(',', '.'));
      const pg = v('pg'), byPortion = $('#nf-base').value === 'portion';
      if (!name || !(v('kcal') >= 0) || (byPortion && !(pg > 0))) { toast('Completá nombre, kcal y la porción'); break; }
      const k = byPortion ? 100 / pg : 1; const per100 = { kcal: E.round(v('kcal') * k, 1), p: E.round((v('p') || 0) * k, 1), c: E.round((v('c') || 0) * k, 1), f: E.round((v('f') || 0) * k, 1) };
      const id = 'u_' + name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_').slice(0, 30) + '_' + Date.now().toString(36).slice(-4);
      const food = { name, per100, src: 'usuario ' + T }; if (pg > 0) { food.unitG = pg; food.unitName = $('#nf-un').value.trim() || 'porción'; }
      await emit('FOOD', { id, food }); toast('Alimento guardado'); break; }
    case 'saveFood': { const id = el.dataset.food; const fd = JSON.parse(JSON.stringify(S.foods[id]));
      document.querySelectorAll(`[data-food="${id}"][data-k]`).forEach(i => { const v = parseFloat(i.value); if (i.dataset.k === 'unitG') fd.unitG = v; else fd.per100[i.dataset.k] = v; });
      fd.src = 'editado ' + T; await emit('FOOD', { id, food: fd }); toast('Alimento actualizado'); break; }
    case 'delw': await emit('WEIGHT', { id: el.dataset.w, deleted: true }); break;
    case 'ai': { const x = E.exportForAI(S, T); download(`nutricios-ia-${T}.txt`, x.text); break; }
    case 'aicopy': { const x = E.exportForAI(S, T); try { await navigator.clipboard.writeText(x.text); toast('Copiado: pegalo en Claude'); } catch { download(`nutricios-ia-${T}.txt`, x.text); } break; }
    case 'backup': backup(); break;
    case 'update': applyUpdate(); break;
    case 'checkupd': checkUpdate(true); break;
    case 'wipe': if (confirmWipe()) { await clearAll(); EVENTS = []; S = E.emptyState(); await boot(); } break;
  }
});
let wipeArmed = 0;
function confirmWipe() { if (Date.now() - wipeArmed < 4000) return true; wipeArmed = Date.now(); toast('Tocá otra vez para borrar todo (tenés respaldo?)'); return false; }
function backup() { download(`nutricios-respaldo-${todayStr()}.json`, JSON.stringify({ app: 'nutricios', schema: 1, calc: E.CALC_VERSION, exported: new Date().toISOString(), events: EVENTS }), 'application/json'); }

document.addEventListener('change', async e => {
  if (e.target.id === 'imp') {
    const f = e.target.files[0]; if (!f) return;
    try { const j = JSON.parse(await f.text()); if (j.app !== 'nutricios' || !Array.isArray(j.events)) throw 0;
      await clearAll(); EVENTS = []; S = E.emptyState();
      for (const ev of j.events) { const x = { ...ev, seq: EVENTS.length + 1 }; EVENTS.push(x); E.reduce(S, x); await saveEvent(x); }
      if (!idb) try { localStorage.setItem('nutricios_events', JSON.stringify(EVENTS)); } catch {}
      toast(`Importado: ${EVENTS.length} eventos`); render();
    } catch { toast('Archivo no válido'); }
  }
  if (e.target.id === 'wcsv') {
    const f = e.target.files[0]; if (!f) return;
    const lines = (await f.text()).trim().split(/\r?\n/); const head = lines.shift().toLowerCase();
    if (!head.includes('weight')) { toast('No parece weight.csv de Withings'); return; }
    const list = [];
    for (const ln of lines) { const c = ln.split(',').map(x => x.replace(/"/g, '')); const date = c[0].slice(0, 10), kg = parseFloat(c[1]), fm = parseFloat(c[2]);
      if (!(kg > 30)) continue; if (S.weights.some(w => w.date === date && Math.abs(w.kg - kg) < 0.005)) continue;
      list.push(['WEIGHT', { id: uid(), date, kg, fatPct: fm > 0 ? E.round(fm / kg * 100, 1) : null, source: 'withings_body_smart', raw: ln }]); }
    await emitMany(list); toast(`${list.length} mediciones importadas`);
  }
});

// ---------- arranque ----------
async function boot() {
  idb = await openDB();
  EVENTS = (await loadEvents()).sort((a, b) => a.seq - b.seq);
  S = E.replay(EVENTS);
  if (!S.settings) await emit('INIT', { settings: E.DEFAULT_SETTINGS, foods: E.DEFAULT_FOODS, meals: E.DEFAULT_MEALS });
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch {}
  render();
  checkUpdate();
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S) { checkUpdate(); if (UI.day > todayStr()) UI.day = todayStr(); render(); } });
boot();
