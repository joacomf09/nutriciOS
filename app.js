import * as E from './engine.js';
export const APP_VERSION = '1.6.4';
// ---------- actualización: compara con version.json publicado ----------
const UPD = { latest: null, checking: false, dismissed: null };
async function checkUpdate(manual = false) {
  UPD.checking = true; if (manual) render();
  try { const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' }); const j = await r.json(); UPD.latest = j.version; }
  catch { if (manual) toast('Sin conexión: no se pudo comprobar'); }
  UPD.checking = false; render();
  if (manual && UPD.latest === APP_VERSION) toast('Ya tenés la última versión');
  syncUpdateModal(manual);
}
// Pop-up de actualización: vive fuera de #app (render() no lo toca). "Más tarde" lo oculta para esa versión
// hasta que se reinicie la app; el aviso de arriba y Ajustes → Actualizar siguen disponibles.
function syncUpdateModal(force = false) {
  const has = UPD.latest && UPD.latest !== APP_VERSION;
  const old = document.getElementById('updmodal');
  if (!has) { old?.remove(); return; }
  if (old) return;
  if (!force && UPD.dismissed === UPD.latest) return;
  const m = document.createElement('div'); m.id = 'updmodal'; m.className = 'modal';
  m.innerHTML = `<div class="mbox" role="dialog" aria-modal="true"><h3>Hay una actualización</h3><div class="sub" style="margin:6px 0 14px">Nueva versión ${esc(UPD.latest)} disponible (tenés la ${APP_VERSION}). Actualizar recarga la app; tus datos no se tocan.</div><div class="row"><button class="grow" data-a="updlater">Más tarde</button><button class="p grow" data-a="update">Actualizar ahora</button></div></div>`;
  document.body.appendChild(m);
}
// ---------- pantallas de actualización: negra, con logo, por pasos ----------
// 1) "Espere un momento" (comprueba lo publicado)  2) "Actualizando aplicación"  3) tras recargar: "Versión X instalada".
// El paso 3 lo muestra la app ya recargada: lo que se instaló es el APP_VERSION que está corriendo, no lo que se esperaba.
const UPD_KEY = 'nutricios_upd';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const UBTN_CLOSE = '<button class="grow" data-a="updclose">Cerrar</button>', UBTN_RETRY = '<button class="p grow" data-a="updretry">Reintentar</button>';
function updScreen(kind, o = {}) {
  let el = document.getElementById('updscreen');
  if (!el) { el = document.createElement('div'); el.id = 'updscreen'; el.className = 'upds'; document.body.appendChild(el); }
  el.innerHTML = `<div class="ulogo ${kind}"><i class="ring"></i><img src="icon-192.png" alt="NutriciOS"></div><h1 class="utt">${esc(o.title)}</h1>${o.sub ? `<div class="sub usub">${esc(o.sub)}</div>` : ''}${o.buttons ? `<div class="row ubtn">${o.buttons}</div>` : ''}`;
}
let updating = false;
async function applyUpdate() {
  if (updating) return; updating = true;
  document.getElementById('updmodal')?.remove();
  updScreen('wait', { title: 'Espere un momento', sub: 'Buscando la versión nueva…' });
  const t0 = Date.now(); let target = null;
  try {
    // GitHub Pages sirve con max-age=600: un simple recargar puede devolver el app.js viejo desde la caché y parecer que
    // "no hace nada". Se fuerzan las descargas sin caché y se comprueba qué versión está realmente publicada.
    const files = ['app.js', 'engine.js', 'index.html', 'sw.js', 'manifest.webmanifest', './'];
    const res = await Promise.all(files.map(f => fetch(f, { cache: 'reload' })));
    target = (await res[0].text()).match(/APP_VERSION = '([^']+)'/)?.[1] || null;
  } catch { updating = false; updScreen('late', { title: 'Sin conexión', sub: 'No se pudo comprobar la actualización. Probá de nuevo con internet.', buttons: UBTN_CLOSE + UBTN_RETRY }); return; }
  await sleep(Math.max(0, 1200 - (Date.now() - t0)));
  if (!target || target === APP_VERSION) {
    updating = false;
    updScreen('late', { title: 'Todavía no está lista', sub: `La versión nueva se está publicando y puede tardar hasta 10 minutos en aparecer. Seguís en la ${APP_VERSION}.`, buttons: UBTN_CLOSE + UBTN_RETRY }); return;
  }
  updScreen('work', { title: 'Actualizando aplicación', sub: `${APP_VERSION} → ${target}` });
  try { localStorage.setItem(UPD_KEY, JSON.stringify({ from: APP_VERSION, target, ts: Date.now() })); } catch {}
  await sleep(1500);
  location.replace(location.pathname + '?v=' + Date.now());
  setTimeout(() => { updating = false; updScreen('late', { title: 'No se pudo recargar', sub: 'Cerrá la app y abrila de nuevo, o reintentá.', buttons: UBTN_CLOSE + UBTN_RETRY }); }, 8000);
}
function showUpdateResult() {
  let f = null;
  try { f = JSON.parse(localStorage.getItem(UPD_KEY) || 'null'); localStorage.removeItem(UPD_KEY); } catch {}
  if (!f || Date.now() - f.ts > 120000) return;
  if (APP_VERSION === f.target) updScreen('ok', { title: `Versión ${APP_VERSION} instalada`, sub: 'Tus datos no se tocaron. Si algún cambio no se ve todavía, puede tardar hasta 10 minutos en aparecer.', buttons: '<button class="p grow" data-a="updclose">Listo</button>' });
  else updScreen('late', { title: 'Todavía no se instaló', sub: `Seguís en la versión ${APP_VERSION}. La ${f.target} puede tardar hasta 10 minutos en aparecer.`, buttons: UBTN_CLOSE + UBTN_RETRY });
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
const parseKg = v => { const t = String(v || '').trim().replace(',', '.'); let k = parseFloat(t); if (!t.includes('.') && k >= 300 && k < 3000) k = k / 10; if (!t.includes('.') && k >= 3000 && k < 30000) k = k / 100; return k; };
const r0 = x => E.round(x).toLocaleString('es-ES');
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const DOW = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];
const MON = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const dLabel = s => { const d = E.toDate(s); return `${DOW[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };
const foodUnit = id => id !== 'pb2' && S.foods[id]?.unitG ? (S.foods[id].unitName || 'u') : 'g';
const unitLbl = id => ML.includes(id) ? 'ml' : foodUnit(id);
const ML = ['icetea', 'limonada', 'naranjab']; // bebidas: se anotan en ml (1 ml ≈ 1 g) y el stepper va de a 50
const qtyLabel = it => it.unit === 'u' ? `${it.qty}×` : `${it.qty} ${ML.includes(it.foodId) ? 'ml' : 'g'}`;
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
function download(name, text, mime = 'text/plain') {
  const blob = new Blob([text], { type: mime });
  const file = new File([blob], name, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: name }).catch(() => {}); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

// ---------- estado de navegación ----------
const UI = { tab: 'hoy', day: null, open: {}, review: null, proposal: null, editPlan: null, draft: {}, skipCap: null };
const TRASH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2m-1 0v14H9V6m1 4v6m4-6v6"/></svg>';
// Borrador del panel Modificar: lo que el usuario tocó (cantidades, quitados, cambios de alimento) y aún no guardó.
// Sin esto, cualquier render() (p. ej. al "+ Añadir") volvía a dibujar el panel desde lo guardado y reaparecía lo quitado.
function captureDrafts() {
  document.querySelectorAll('.items[data-k]').forEach(box => {
    const k = box.dataset.k; if (!k.startsWith(UI.day) || UI.skipCap === k) return;
    const rows = [...box.querySelectorAll('.swipe')]; const out = {}; let any = false;
    rows.forEach((r, i) => {
      const q = r.querySelector('[data-f="qty"]'), f = r.querySelector('[data-f="food"]'); const gone = r.classList.contains('gone');
      const dq = q && q.value !== q.dataset.o, df = f && f.value !== f.dataset.o;
      if (gone || dq || df) { out[i] = { gone, qty: q ? q.value : undefined, food: f ? f.value : undefined }; any = true; }
    });
    if (any) UI.draft[k] = { n: rows.length, rows: out }; else delete UI.draft[k];
  });
}
const dropDraft = k => { delete UI.draft[k]; UI.skipCap = k; };

function render() {
  const T = todayStr(); if (!UI.day) UI.day = T; applyTheme();
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === UI.tab));
  const f = { hoy: vHoy, semana: vSemana, plan: vPlan, datos: vDatos, ajustes: vAjustes }[UI.tab];
  const banner = UPD.latest && UPD.latest !== APP_VERSION ? `<div class="card hi row sp"><span>Nueva versión ${esc(UPD.latest)} disponible</span><button class="p s" data-a="update">Actualizar</button></div>` : '';
  captureDrafts();
  const before = {}; document.querySelectorAll('[data-meal]').forEach(el => before[el.dataset.meal] = el.getBoundingClientRect().top);
  $('#app').innerHTML = banner + f(T);
  animate();
  document.querySelectorAll('[data-meal]').forEach(el => { const t0 = before[el.dataset.meal]; if (t0 == null) return; const dy = t0 - el.getBoundingClientRect().top; if (Math.abs(dy) < 4) return;
    el.style.transition = 'none'; el.style.transform = `translateY(${dy}px)`; requestAnimationFrame(() => requestAnimationFrame(() => { el.style.transition = 'transform .45s cubic-bezier(.2,.8,.2,1)'; el.style.transform = ''; })); });
}
// ---------- animaciones ----------
const PREV = {};
function animate() {
  const els = [...document.querySelectorAll('[data-k][data-to]')];
  els.forEach(el => { const k = el.dataset.k; el.style[el.dataset.p] = PREV[k] ?? el.dataset.from; });
  void document.body.offsetHeight;
  requestAnimationFrame(() => els.forEach(el => { el.style[el.dataset.p] = el.dataset.to; PREV[el.dataset.k] = el.dataset.to; }));
  document.querySelectorAll('[data-count]').forEach(el => {
    const k = 'n' + el.dataset.ck, to = +el.dataset.count, from = PREV[k] ?? 0; PREV[k] = to; if (from === to) return;
    const t0 = performance.now(), dur = 700;
    const step = t => { const x = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - x, 3); el.textContent = r0(from + (to - from) * e); if (x < 1) requestAnimationFrame(step); };
    el.textContent = r0(from); requestAnimationFrame(step);
  });
}
// Pop-up de cierre del día: anillos + sello CUMPLIDO (98–108 % de la meta) + comidas con check.
function closeSummary(date) {
  document.getElementById('closesum')?.remove();
  const T = todayStr(), v = E.dayView(S, date, T), a = v.actual, tg = v.target, pct = a.kcal / tg.kcal;
  const ok = pct >= 0.98 && pct <= 1.08, diff = E.round(a.kcal - tg.kcal);
  const ring = (r, f, col, dl) => { const C = 2 * Math.PI * r; return `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${col}" stroke-opacity=".16" stroke-width="9"/><circle class="csr" cx="70" cy="70" r="${r}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round" transform="rotate(-90 70 70)" style="--C:${C.toFixed(1)};--o:${(C * (1 - Math.min(1, f || 0))).toFixed(1)};animation-delay:${dl}s"/>`; };
  const meals = v.meals.map(m => { const eaten = ['confirmed', 'edited', 'replaced'].includes(m.status), extra = m.actualItems.some(it => it.role === 'extra' && it.qty > 0);
    return `<div class="${eaten ? '' : 'sk'}"><span class="ck ${eaten ? '' : 'x'}">${eaten ? '✓' : '–'}</span>${esc(m.name.replace(/ \(.*\)/, ''))}${!eaten ? ' <em>omitida</em>' : extra ? ' <em>+ añadido</em>' : ''}<b class="num">${r0(eaten ? m.actualTot.kcal : 0)}</b></div>`; }).join('');
  const title = ok ? '¡Felicidades!<br>Cumpliste tu día' : diff < 0 ? 'Día cerrado' : 'Día cerrado';
  const sub = ok ? '' : diff < 0 ? `<div class="sub">Te faltaron <b>${r0(-diff)} kcal</b>: se suman al saldo de la semana (se recuperan hasta +300 por día).</div>` : `<div class="sub">Te pasaste <b>${r0(diff)} kcal</b>: se descuentan del saldo de la semana.</div>`;
  const d = document.createElement('div'); d.id = 'closesum'; d.className = 'modal';
  d.innerHTML = `<div class="mbox cs"><div class="eyebrow">Día cerrado · ${dLabel(date)}</div>
    <div class="csring"><svg viewBox="0 0 140 140" width="150" height="150" role="img" aria-label="Anillos del día">${ring(62, a.kcal / tg.kcal, 'var(--kc)', 0)}${ring(50, a.p / tg.p, 'var(--p)', .15)}${ring(38, a.c / tg.c, 'var(--c)', .3)}${ring(26, a.f / tg.f, 'var(--f)', .45)}</svg>${ok ? '<div class="gstamp">CUMPLIDO</div>' : ''}</div>
    <p class="cst">${title}</p>${sub}
    <div class="sub"><span class="num" style="font-size:20px;color:var(--ink)">${r0(a.kcal)}</span> / ${r0(tg.kcal)} kcal · ${(pct * 100).toFixed(1).replace('.', ',')} %</div>
    <div class="csm"><div><b style="color:var(--p)">${r0(a.p)}</b><span>/${r0(tg.p)} prot</span></div><div><b style="color:var(--c)">${r0(a.c)}</b><span>/${r0(tg.c)} carb</span></div><div><b style="color:var(--f)">${r0(a.f)}</b><span>/${r0(tg.f)} grasa</span></div></div>
    <div class="mlist">${meals}</div>
    <div class="csbk"><div class="sub" style="color:var(--ink)">¿Hacés el backup ahora?</div><div class="row" style="gap:8px"><button class="p grow" data-a="closebk">Sí, guardar</button><button class="grow" data-a="closesum">No</button></div></div></div>`;
  document.body.appendChild(d); if (ok) burst();
}
function burst() {
  const b = document.createElement('div'); b.className = 'burst';
  const cols = ['var(--acc)', 'var(--p)', 'var(--c)', 'var(--f)'];
  for (let i = 0; i < 28; i++) { const sp = document.createElement('i'); const ang = Math.random() * Math.PI * 2, dist = 90 + Math.random() * 140;
    sp.style.cssText = `background:${cols[i % 4]};--x:${Math.cos(ang) * dist}px;--y:${Math.sin(ang) * dist}px;--r:${Math.random() * 720}deg;animation-delay:${Math.random() * 80}ms`; b.appendChild(sp); }
  const msg = document.createElement('div'); msg.className = 'burstmsg'; msg.textContent = 'Día cerrado'; b.appendChild(msg);
  document.body.appendChild(b); setTimeout(() => b.remove(), 1600);
}
const MEAL_TIME = { desayuno: '10:15', almuerzo: '15:00', merienda: '17:00', pre: '17:45', intra: '19:15', post: '19:30', cena: '20:45', recena: '22:30' };
function countdown(time) {
  if (!time) return '';
  const [hh, mm] = time.split(':').map(Number); const now = new Date(); const diff = Math.round((hh * 60 + mm) - (now.getHours() * 60 + now.getMinutes()));
  const fmtm = n => n >= 60 ? `${Math.floor(n / 60)} h${n % 60 ? ' ' + String(n % 60).padStart(2, '0') : ''}` : `${n} min`;
  const txt = diff > 5 ? `en ${fmtm(diff)}` : diff >= -30 ? 'ahora' : `hace ${fmtm(-diff)}`;
  const f = Math.max(0, Math.min(1, 1 - diff / 240)); const C = 2 * Math.PI * 6;
  return `<span class="cd ${diff < -30 ? 'late' : diff <= 5 ? 'now' : ''}"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-opacity=".25" stroke-width="2"/><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="${C * f} ${C}" transform="rotate(-90 8 8)"/></svg>${time} · ${txt}</span>`;
}
function goalBanner(T, E_, TG) {
  const st = S.settings, ph = st.phases, start = ph[0]?.from || st.startDate, planEnd = st.endDate || E.addDays(ph.at(-1).from, 13), end = st.goalDate || planEnd;
  const left = Math.max(0, E.diffDays(end, T)), total = Math.max(1, E.diffDays(end, start) + 1), done = Math.min(1, Math.max(0, (E.diffDays(T, start) + 1) / total));
  const cols = { volumen: 'var(--acc)', volumen_agresivo: 'var(--p)', mantenimiento: 'var(--f)', deficit: 'var(--c)' };
  const segs = ph.map((p, i) => { const to = i < ph.length - 1 ? ph[i + 1].from : E.addDays(Math.max(end, planEnd) === end ? end : planEnd, 1); return `<i style="flex:${Math.max(1, E.diffDays(to, p.from))};background:${cols[p.phase] || 'var(--mute)'}"></i>`; }).join('');
  // silueta que se llena con lo comido, por macro
  const f = Math.min(1, E_.kcal / TG.kcal), kp = E_.p * 4, kc = E_.c * 4, kf = E_.f * 9, kt = Math.max(1, kp + kc + kf);
  const o1 = f * kf / kt, o2 = f * (kf + kc) / kt;
  const body = `<circle cx="50" cy="17" r="13"/><path d="M33 34h34c7 0 11 4 12 11l8 50c1 5-2 8-6 8s-6-3-7-7l-6-38v54l-3 80c0 5-3 8-8 8s-7-3-7-8l-1-60h-2l-1 60c0 5-2 8-7 8s-8-3-8-8l-3-80V58l-6 38c-1 4-3 7-7 7s-7-3-6-8l8-50c1-7 5-11 12-11z"/>`;
  const sil = `<svg width="78" height="156" viewBox="0 0 100 200" role="img" aria-label="Silueta: ${Math.round(f * 100)} % del día comido">
    <defs><clipPath id="silc">${body}</clipPath><linearGradient id="silg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--f)"/><stop offset="${o1}" stop-color="var(--f)"/><stop offset="${o1}" stop-color="var(--c)"/><stop offset="${o2}" stop-color="var(--c)"/><stop offset="${o2}" stop-color="var(--p)"/><stop offset="1" stop-color="var(--p)"/></linearGradient></defs>
    <g fill="#ffffff" fill-opacity=".07">${body}</g>
    <g clip-path="url(#silc)"><rect class="tr" x="0" y="0" width="100" height="200" fill="url(#silg)" data-k="sil" data-p="transform" data-from="translateY(200px)" data-to="translateY(${(200 * (1 - f)).toFixed(1)}px)"/></g>
    <g fill="none" stroke="var(--ink)" stroke-opacity=".35" stroke-width="1.5">${body}</g></svg>`;
  return `<div class="card goal"><div class="row" style="gap:12px;align-items:center"><div class="grow">
    <div class="eyebrow">Objetivo actual</div><div class="goalt">${esc(st.goalName || 'Verano en Paraguay')}</div>
    <div class="row" style="gap:8px;align-items:baseline;margin-top:6px"><span class="big" data-count="${left}" data-ck="left">${left}</span><span class="sub">días · ${dLabel(end)}</span></div>
    <div class="phbar">${segs}<b style="left:${(done * 100).toFixed(1)}%"></b></div>
    <div class="sub" style="margin-top:6px">${E.PHASE_LABEL[E.phaseAt(st, T)]} · día ${Math.max(1, E.diffDays(T, start) + 1)} de ${total}</div>
    </div><div style="text-align:center">${sil}<div class="cond" style="font-size:15px;font-weight:700"><span data-count="${Math.round(f * 100)}" data-ck="silp">${Math.round(f * 100)}</span> %</div></div></div></div>`;
}

// ---------- pista de carbos: bloque (Modificar, en vivo) ----------
const fname = id => esc(S.foods[id]?.name.split(',')[0].toLowerCase() || id);
function hintBlock(h) {
  if (!h) return '';
  const u = x => x.unit === 'u' ? '' : ' g';
  const lines = h.adds
    ? h.items.map(x => `＋ añadir ${E.round(x.dq)}${x.unit === 'u' ? ' scoop' : ' g'} ${fname(x.foodId)} (+${r0(x.kcal)} kcal)`)
    : h.items.map(x => x.dq > 0 ? `${fname(x.foodId)}: ↑ +${E.round(x.dq)}${u(x)} (+${r0(x.kcal)} kcal)` : x.dq < 0 ? `${fname(x.foodId)}: ↓ −${E.round(-x.dq)}${u(x)} (−${r0(-x.kcal)} kcal)` : x.atLimit === 'max' ? `${fname(x.foodId)}: ya al máximo` : x.atLimit === 'min' ? `${fname(x.foodId)}: ya al mínimo` : '').filter(Boolean);
  if (Math.abs(h.remaining) > 50) lines.push(h.dir > 0 ? `Quedan ${r0(h.remaining)} kcal sin cubrir.` : `Quedan ${r0(-h.remaining)} kcal sobre la meta.`);
  return lines.length ? `<div class="chint">${h.dir > 0 ? 'Para llegar a la meta:' : 'Para no pasarte:'}</div>` + lines.map(l => `<div class="chint">${l}</div>`).join('') : '';
}
function panelItems(card, m) {
  const items = m.actualItems.map(it => ({ ...it }));
  card.querySelectorAll('[data-f]').forEach(inp => { const i = +inp.dataset.i; if (!items[i]) return; if (inp.dataset.f === 'qty') items[i].qty = parseFloat(String(inp.value).replace(',', '.')) || 0; else items[i].foodId = inp.value; });
  card.querySelectorAll('.swipe.gone').forEach(r => { if (items[+r.dataset.i]) items[+r.dataset.i].qty = 0; });
  return items;
}
function liveHint(card) {
  const box = card?.querySelector('.livehint'); if (!box) return;
  const T = todayStr(), d = UI.day, m = E.dayView(S, d, T).meals.find(x => x.id === card.dataset.meal); if (!m) return;
  const h = E.lastMealCarbHint(S, d, T, { asPending: m.id, items: panelItems(card, m) });
  box.innerHTML = h && h.mealId === m.id ? hintBlock(h) : '';
}
document.addEventListener('input', e => { if (e.target.matches('.items [data-f]')) liveHint(e.target.closest('[data-meal]')); });

// ---------- estimado del próximo lunes (1.5.36) ----------
function liveBlock(T, full) {
  let p; try { p = E.liveProposal(S, T); } catch { return ''; } if (!p) return '';
  const h = p.hist, d = p.deltaKcal, P = S.settings.params;
  const head = d ? `${d > 0 ? '+' : ''}${r0(d)} kcal/día` : 'sin cambio';
  const miss = []; if (h.closedDays < P.daysClosedMin) miss.push(`${P.daysClosedMin - h.closedDays} días cerrados más`); if (h.weighins < P.weighinsMin) miss.push(`${P.weighinsMin - h.weighins} pesajes más`);
  if (!full) return `<div class="sub" style="margin-top:6px">Ajuste estimado para el lunes: <b style="color:var(--ink)">${head}</b>${miss.length ? ` · faltan ${miss.join(' y ')}` : ''} · detalle en Semana.</div>`;
  return `<div class="card hi"><div class="row sp"><h3>Ajuste estimado para el lunes</h3><span class="cond" style="font-size:22px;font-weight:700;color:var(--acc)">${head}</span></div>
    <div class="sub" style="margin-top:4px">Con los datos de hoy. Se recalcula cada vez que cerrás un día o cargás un peso; la decisión real es en la revisión del lunes.</div>
    <table style="margin-top:8px"><tr><td>Gasto estimado</td><td class="r num">${r0(h.tdee)} kcal</td></tr><tr><td>Ingesta media (días cerrados)</td><td class="r num">${h.intake == null ? '—' : r0(h.intake) + ' kcal'}</td></tr>
    <tr><td>Peso</td><td class="r num">${h.slopeWeek == null ? '—' : (h.slopeWeek >= 0 ? '+' : '') + E.round(h.slopeWeek, 2) + ' kg/sem'}</td></tr><tr><td>Días cerrados · pesajes</td><td class="r num">${h.closedDays}/7 · ${h.weighins}</td></tr>
    <tr><td>Meta actual → estimada</td><td class="r num">${r0(p.before.kcal)} → <b>${r0(p.after.kcal)}</b></td></tr></table>
    ${miss.length ? `<div class="sub" style="margin-top:6px;color:var(--warn)">Para que la semana cuente faltan ${miss.join(' y ')}.</div>` : ''}
    ${p.why.slice(-1).map(w => `<div class="sub" style="margin-top:6px">${esc(w)}</div>`).join('')}</div>`;
}

// ---------- restantes del día y de la semana en tiempo real (1.5.47, pedido del usuario) ----------
function weekDebt(T) {
  const ws = E.weekStart(T); let prior = 0;
  for (const d of E.range(ws, E.diffDays(T, ws))) { const v = E.dayView(S, d, T); prior += v.target.kcal - v.actual.kcal; }
  const dv = E.dayView(S, T, T), today = dv.target.kcal - dv.eatenConfirmed.kcal;
  return { prior, today, week: prior + today };
}
function debtCard(T) {
  const x = weekDebt(T), f = v => `${v < 0 ? '+' : ''}${r0(Math.abs(v))} kcal`;
  return `<div class="card" id="debtcard"><div class="row sp"><span>Restantes hoy</span><b class="num">${x.today >= 0 ? r0(x.today) + ' kcal' : 'pasado ' + r0(-x.today) + ' kcal'}</b></div>
    <div class="row sp" style="margin-top:6px"><span>Restantes de la semana</span><b class="num" style="color:var(--acc)">${x.week >= 0 ? r0(x.week) + ' kcal' : 'pasado ' + r0(-x.week) + ' kcal'}</b></div>
    <div class="sub" style="margin-top:6px">Desde el lunes: lo que faltó suma y lo que te pasaste resta (incluye hoy). De días anteriores: ${Math.abs(x.prior) < 1 ? 'al día' : x.prior > 0 ? 'faltan ' + r0(x.prior) + ' kcal' : 'a favor ' + r0(-x.prior) + ' kcal'}.</div></div>`;
}

function yesterdayItems(d, mid, T) {
  const y = E.addDays(d, -1); let v; try { v = E.dayView(S, y, T); } catch { return null; }
  const m = v.meals.find(x => x.id === mid); if (!m || !m.touched || ['skipped', 'unknown'].includes(m.status)) return null;
  const it = m.actualItems.filter(i => i.qty > 0); return it.length ? it : null;
}
// ---------- "+ Añadir": frecuentes primero + buscador (1.5.51) ----------
let FREQ = { key: '', list: [] };
function foodFreq(T) {
  const key = T + ':' + EVENTS.length; if (FREQ.key === key) return FREQ.list;
  const c = {};
  for (const d of E.range(E.addDays(T, -21), 22)) { let v; try { v = E.dayView(S, d, T); } catch { continue; }
    for (const m of v.meals) if (m.touched && !['skipped', 'unknown'].includes(m.status)) { const pl = new Set(m.planned.filter(i => i.qty > 0).map(i => i.foodId)); for (const i of m.actualItems) if (i.qty > 0 && !pl.has(i.foodId)) c[i.foodId] = (c[i.foodId] || 0) + 1; } }
  FREQ = { key, list: Object.entries(c).filter(([id]) => S.foods[id]).sort((x, y) => y[1] - x[1]).slice(0, 8).map(([id]) => id) }; return FREQ.list;
}
function addOptions(T) {
  const fav = foodFreq(T), all = Object.entries(S.foods).sort((a, b) => a[1].name.localeCompare(b[1].name));
  const opt = id => `<option value="${id}">${esc(S.foods[id].name)}</option>`;
  return (fav.length ? `<optgroup label="Frecuentes">${fav.map(opt).join('')}</optgroup><optgroup label="Todos">` : '') + all.map(([id]) => opt(id)).join('') + (fav.length ? '</optgroup>' : '');
}
document.addEventListener('input', e => {
  if (!e.target.matches('.addsearch')) return;
  const q = e.target.value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''), sel = document.getElementById('addf-' + e.target.dataset.m); if (!sel) return;
  let first = null; const seen = new Set();
  for (const o of sel.options) { const n = o.textContent.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); const show = !q || n.includes(q);
    o.hidden = !show || (q && seen.has(o.value)); if (show) { if (!first && !(q && seen.has(o.value))) first = o; seen.add(o.value); } }
  if (first) { sel.value = first.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
});

// ---------- escáner de código de barras + Open Food Facts (1.5.51) ----------
const SCAN = { stream: null, raf: 0, ctrl: null };
async function offLookup(code) {
  const msg = $('#nf-offmsg'); if (!code || code.length < 8) { toast('Código no válido'); return; }
  if ($('#nf-code')) $('#nf-code').value = code; msg.textContent = 'Buscando ' + code + '…';
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json?fields=product_name,product_name_es,brands,nutriments,serving_quantity,quantity`);
    const j = await r.json(); if (j.status !== 1 || !j.product) { msg.textContent = `No está en Open Food Facts (${code}). Cargalo a mano con la etiqueta.`; return; }
    const p = j.product, n = p.nutriments || {}, kcal = n['energy-kcal_100g'] ?? (n.energy_100g ? n.energy_100g / 4.184 : null);
    const name = [p.product_name_es || p.product_name, p.brands && p.brands.split(',')[0]].filter(Boolean).join(' ');
    $('#nf-name').value = name; $('#nf-name').dataset.src = 'Open Food Facts ' + code + ' (revisar con la etiqueta)';
    $('#nf-base').value = '100';
    const set = (k, v) => { $('#nf-' + k).value = v == null || isNaN(v) ? '' : E.round(+v, 1); };
    set('kcal', kcal); set('p', n.proteins_100g); set('c', n.carbohydrates_100g); set('f', n.fat_100g);
    if (p.serving_quantity > 0) $('#nf-pg').value = E.round(+p.serving_quantity, 1);
    const chk = kcal ? Math.abs((4 * (+n.proteins_100g || 0) + 4 * (+n.carbohydrates_100g || 0) + 9 * (+n.fat_100g || 0)) - kcal) / kcal : 1;
    msg.innerHTML = `<b>${esc(name || 'Producto')}</b>${p.quantity ? ' · ' + esc(p.quantity) : ''}. <span style="color:var(--warn)">Revisá que coincida con tu etiqueta antes de guardar${chk > 0.15 ? ': los macros no cuadran con las kcal' : ''}.</span>`;
  } catch { msg.textContent = 'Sin conexión con Open Food Facts. Probá de nuevo o cargalo a mano.'; }
}
function scanStop() { cancelAnimationFrame(SCAN.raf); try { SCAN.ctrl?.stop(); } catch {} SCAN.stream?.getTracks().forEach(t => t.stop()); SCAN.stream = null; SCAN.ctrl = null; document.getElementById('scanmodal')?.remove(); }
async function scanStart() {
  scanStop();
  const m = document.createElement('div'); m.id = 'scanmodal'; m.className = 'modal';
  m.innerHTML = '<div class="mbox"><h3>Apuntá al código de barras</h3><video id="scanv" playsinline muted style="width:100%;border-radius:2px;background:#000;margin-top:8px"></video><div class="sub" id="scanmsg" style="margin-top:6px">Abriendo cámara…</div><button class="s" data-a="scanStop" style="margin-top:10px;width:100%">Cancelar</button></div>';
  document.body.appendChild(m);
  const v = document.getElementById('scanv'), done = code => { scanStop(); offLookup(code); };
  try {
    if ('BarcodeDetector' in window) {
      SCAN.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }); v.srcObject = SCAN.stream; await v.play();
      const det = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] }); document.getElementById('scanmsg').textContent = 'Buscando código…';
      const tick = async () => { if (!SCAN.stream) return; try { const r = await det.detect(v); if (r[0]) return done(r[0].rawValue); } catch {} SCAN.raf = requestAnimationFrame(tick); }; tick();
    } else {
      const { BrowserMultiFormatReader } = await import('./zxing.js');
      document.getElementById('scanmsg').textContent = 'Buscando código…';
      SCAN.ctrl = await new BrowserMultiFormatReader().decodeFromConstraints({ video: { facingMode: 'environment' } }, v, res => { if (res) done(res.getText()); });
    }
  } catch (err) { const s = document.getElementById('scanmsg'); if (s) s.textContent = 'No se pudo abrir la cámara (' + (err?.name || 'error') + '). Escribí el código a mano.'; }
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
  if (d === T) h += goalBanner(T, dv.eatenConfirmed, dv.target);
  // peso
  h += `<div class="card"><div class="row sp"><div><h3>Peso en ayunas</h3><div class="sub">${todayW.length ? todayW.map(w => `${w.kg} kg${w.fatPct != null ? ' · ' + w.fatPct + ' %' : ''}`).join(' · ') : 'Opcional a diario; también se carga el lunes.'}</div></div>
    <div class="row" style="width:150px"><input id="wkg" type="text" inputmode="decimal" step="0.01" placeholder="kg"><button class="s p" data-a="addw" data-d="${d}">+</button></div></div></div>`;
  // totales
  const off_ = st => !['confirmed', 'edited', 'replaced'].includes(st);
    const E_ = dv.eatenConfirmed, TG = dv.target;
  const arc = (r, f, col) => { const C = 2 * Math.PI * r; return `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${col}" stroke-opacity=".18" stroke-width="9"/><circle cx="70" cy="70" r="${r}" fill="none" stroke="${col}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${C} ${C}" class="tr" data-k="ring${r}" data-p="strokeDashoffset" data-from="${C}" data-to="${C * (1 - Math.min(1, f || 0))}" transform="rotate(-90 70 70)"/>`; };
  const ring = `<svg class="ring" width="140" height="140" viewBox="0 0 140 140" role="img" aria-label="Progreso de calorías y macros">${arc(62, E_.kcal / TG.kcal, 'var(--kc)')}${arc(50, E_.p / TG.p, 'var(--p)')}${arc(38, E_.c / TG.c, 'var(--c)')}${arc(26, E_.f / TG.f, 'var(--f)')}</svg>`;
  const tile = (lab, a, b, col) => `<div><div class="sub" style="font-size:12px">${lab}</div><div class="cond" style="font-size:22px;font-weight:700;color:${col}"><span data-count="${E.round(a)}" data-ck="${lab}">${r0(a)}</span><span class="sub" style="font-size:13px"> /${r0(b)}</span></div></div>`;
  h += `<div class="card"><div class="row" style="gap:14px;align-items:center">${ring}<div class="grow" style="display:grid;gap:6px">${tile('KCAL', E_.kcal, TG.kcal, 'var(--kc)')}${tile('PROT g', E_.p, TG.p, 'var(--p)')}${tile('CARB g', E_.c, TG.c, 'var(--c)')}${tile('GRASA g', E_.f, TG.f, 'var(--f)')}</div></div>
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
    if (sug.excess > 0) h += `<div class="card wn">+${r0(sug.excess)} kcal sobre la meta. Al cerrar el día se descuentan del saldo de la semana.${E.lastMealCarbHint(S, d, T)?.dir < 0 ? ' En la última comida pendiente ves cuánto podrías bajar el carbo.' : ''}</div>`;
  }
  // comidas
  h += `<h2>Comidas</h2>`;
  // Si la última comida marcada tiene el panel Modificar abierto, la pista la sigue tratando como pendiente
  // (así no desaparece al añadir un ingrediente).
  const lastMarked = dv.meals.filter(m => m.markedOrd != null && m.status !== 'skipped').sort((a, b) => b.markedOrd - a.markedOrd)[0];
  const hint = E.lastMealCarbHint(S, d, T, lastMarked && !dv.close && (UI.open[d + lastMarked.id] || (['edited', 'replaced'].includes(lastMarked.status) && !dv.meals.some(m => m.status === 'pending'))) && !dv.meals.some(m => m.status === 'pending' && m.planned.some(it => it.role === 'carb' && it.qty > 0)) ? { asPending: lastMarked.id } : {}) || null;
  const hintTxt = x => x.dq > 0 ? `↑ +${E.round(x.dq)}${x.unit === 'u' ? '' : ' g'} para llegar a la meta (+${r0(x.kcal)} kcal)` : x.dq < 0 ? `↓ −${E.round(-x.dq)}${x.unit === 'u' ? '' : ' g'} para no pasarte (−${r0(-x.kcal)} kcal)` : x.atLimit === 'max' ? 'ya al máximo' : x.atLimit === 'min' ? 'ya al mínimo' : '';
  const addLines = () => hint?.adds ? hint.items.map(x => `<div class="chint">＋ añadir ${E.round(x.dq)}${x.unit === 'u' ? ' scoop' : ' g'} ${esc(S.foods[x.foodId].name.split(',')[0].toLowerCase())} para llegar a la meta (+${r0(x.kcal)} kcal)</div>`).join('') : '';
  const hintFor = (m, foodId) => { if (!hint || hint.mealId !== m.id || hint.adds) return ''; const x = hint.items.find(y => y.foodId === foodId); const t = x && hintTxt(x); return t ? `<div class="chint">${t}</div>` : ''; };
  const hintRest = () => addLines() + (Math.abs(hint.remaining) > 50 ? `<div class="chint">${hint.dir > 0 ? `Quedan ${r0(hint.remaining)} kcal que el carbo no cubre.` : `Quedan ${r0(-hint.remaining)} kcal sobre la meta que el carbo no compensa.`}</div>` : '');
  // Marcadas arriba, en el orden en que se marcaron; pendientes abajo, en el orden del plan.
  const ordered = [...dv.meals.filter(m => m.markedOrd != null).sort((a, b) => a.markedOrd - b.markedOrd), ...dv.meals.filter(m => m.markedOrd == null)];
  for (const m of ordered) {
    const off = !['confirmed', 'edited', 'replaced'].includes(m.status);
    const tag = { pending: '<span class="tag">por comer</span>', assumed: '<span class="tag w">asumida</span>', confirmed: '<span class="tag ok">confirmada</span>', edited: '<span class="tag ok">editada</span>', skipped: '<span class="tag">omitida</span>', unknown: '<span class="tag">sin dato</span>', replaced: '<span class="tag ok">cambiada</span>' }[m.status] || '';
    const open = UI.open[d + m.id];
    const mt = (E.versionAt(S, d).meals.find(x => x.id === m.id) || {}).time || MEAL_TIME[m.id];
    const cdn = d === T && m.status === 'pending' ? countdown(mt) : '';
    h += `<div class="card" data-meal="${m.id}"><div class="meal"><div class="chk ${off ? 'off' : ''}" data-a="toggle" data-m="${m.id}">${off ? '' : '✓'}</div>
      <div class="grow"><div class="row sp"><h3>${esc(m.name)}</h3><span class="num sub">${r0(off ? m.plannedTot.kcal : m.actualTot.kcal)} kcal</span></div>
      ${hint && hint.mealId === m.id && !open
        ? `<div class="sub">${m.actualItems.filter(it => it.qty > 0).map(it => `<div>${qtyLabel(it)} ${esc(S.foods[it.foodId]?.name.split(',')[0].toLowerCase())}</div>${it.role === 'carb' ? hintFor(m, it.foodId) : ''}`).join('')}${hintRest()}</div>`
        : `<div class="sub">${m.actualItems.filter(it => it.qty > 0).map(it => `${qtyLabel(it)} ${esc(S.foods[it.foodId]?.name.split(',')[0].toLowerCase())}`).join(' · ')}</div>`}<div class="row sp" style="margin-top:6px"><span class="row" style="gap:6px">${tag}${cdn}</span><button class="mod" data-a="openm" data-m="${m.id}">${open ? 'Cerrar' : 'Modificar'}</button></div></div></div>`;
    if (open) {
      const dr = UI.draft[d + m.id], drok = dr && dr.n === m.actualItems.length;
      h += `<div class="items" data-k="${d + m.id}" style="margin-top:10px">`;
      m.actualItems.forEach((it, i) => {
        const x = drok && dr.rows[i] || {}; const fid = x.food || it.foodId, qv = x.qty !== undefined ? x.qty : it.qty, gone = !!x.gone;
        const pl = m.planned.find(p => p.choices ? p.choices.includes(it.foodId) : p.foodId === it.foodId);
        const sel = pl?.choices ? `<select data-f="food" data-i="${i}" data-o="${it.foodId}" data-r="${pl.role || ''}">${pl.choices.map(c => `<option value="${c}" ${c === fid ? 'selected' : ''}>${esc(S.foods[c].name)}</option>`).join('')}</select>` : `<span>${esc(S.foods[it.foodId].name)}</span>`;
        const stp = it.unit === 'u' ? (['scoop', 'rodaja'].includes(S.foods[it.foodId].unitName) ? 0.5 : 1) : (ML.includes(it.foodId) ? 50 : it.foodId === 'pb2' ? 6 : 5);
        h += `<div class="swipe${gone ? ' gone' : ''}" data-i="${i}"${gone ? ' style="display:none"' : ''}><div class="swbg" aria-hidden="true">${TRASH}${TRASH}</div><div class="it swc" style="grid-template-columns:1fr auto">${sel}<div class="step"><button type="button" data-a="stp" data-i="${i}" data-s="${-stp}" aria-label="Menos">−</button><input type="text" inputmode="decimal" data-f="qty" data-i="${i}" data-o="${it.qty}" value="${qv}" step="${stp}" aria-label="Cantidad"><button type="button" data-a="stp" data-i="${i}" data-s="${stp}" aria-label="Más">+</button></div></div></div>`;
      });
      { const lh = d <= T && !dv.close ? E.lastMealCarbHint(S, d, T, { asPending: m.id }) : null; h += `<div class="livehint" style="text-align:right;margin:4px 0 8px">${lh && lh.mealId === m.id ? hintBlock(lh) : ''}</div>`; }
      h += `<div class="sub">Deslizá un ingrediente hacia cualquier lado para quitarlo (o poné 0). Guardar la marca como comida; el plan original se conserva.</div>
        <input class="addsearch" data-m="${m.id}" placeholder="Buscar alimento…" style="margin-top:8px"><div class="row" style="margin-top:8px"><select id="addf-${m.id}" class="grow">${addOptions(T)}</select><input id="addq-${m.id}" type="text" inputmode="decimal" placeholder="${unitLbl(Object.entries(S.foods).sort((a, b) => a[1].name.localeCompare(b[1].name))[0][0])}" style="width:80px"><button class="s" data-a="addItem" data-m="${m.id}">+ Añadir</button></div>
        <div class="row" style="margin-top:8px"><button class="p s" data-a="saveMeal" data-m="${m.id}">Guardar</button><button class="s" data-a="skipMeal" data-m="${m.id}">No la comí</button><button class="s" data-a="resetMeal" data-m="${m.id}">Volver al plan</button>${yesterdayItems(d, m.id, T) ? `<button class="s" data-a="repeatMeal" data-m="${m.id}">Igual que ayer</button>` : ""}</div></div>`;
    }
    h += `</div>`;
  }
  // extras
  h += `<h2>Extras</h2><div class="card">${dv.extras.map(x => `<div class="row sp"><span>${esc(x.name)} ${x.estimated ? '<span class="tag">estimado</span>' : ''}</span><span class="num">${r0(x.kcal)} kcal <button class="s del" data-a="delx" data-x="${x.id}">✕</button></span></div>`).join('') || '<div class="sub">Comida fuera del plan.</div>'}
    <div class="row wrap" style="margin-top:8px"><button class="s" data-a="quick" data-k="200">+200</button><button class="s" data-a="quick" data-k="500">+500</button><button class="s" data-a="quick" data-k="1000">+1.000</button><button class="s" data-a="custom">Personalizado</button></div>
    <div id="customx" class="hidden"><label>Nombre</label><input id="xn" placeholder="Ej.: pizza"><div class="row"><div class="grow"><label>kcal</label><input id="xk" type="number"></div><div class="grow"><label>P</label><input id="xp" type="number"></div><div class="grow"><label>C</label><input id="xc" type="number"></div><div class="grow"><label>G</label><input id="xf" type="number"></div></div><button class="p s" style="margin-top:8px" data-a="addx">Añadir</button></div></div>`;
  if (d === T) h += debtCard(T);
  // Día ya cerrado: el saldo que queda incluyendo el cierre de hoy (1.5.34)
  if (d === T && dv.close) { const nx = E.addDays(d, 1), same = E.weekStart(nx) === E.weekStart(d), rest = same ? E.weekBank(S, nx, T) : 0;
    h += `<div class="card" id="bankcard"><div class="sub">Saldo semanal con el cierre de hoy: ${same ? (rest > 50 ? `<b style="color:var(--ink)">${r0(rest)} kcal</b> por compensar (hasta +300 por día).` : 'al día.') : 'se reinicia el lunes.'}</div>${liveBlock(T, false)}</div>`; }
  // Saldo semanal: tarjeta persistente al final del día (1.5.25)
  if (d === T && !dv.close) { const remaining = E.weekBank(S, d, T), applied = (S.overrides[d] || []).filter(o => o.fromBank);
    const hasOpt = sug.bankAllowance > 0 && (sug.bankChanges?.length || sug.bankPb?.length || sug.bankEgg?.length);
    if (remaining > 50 || applied.length) { const lab = cs => cs.map(c => `+${E.round(c.qty - c.from)}${c.foodId === 'huevo' ? '' : ' g'} ${esc(S.foods[c.foodId].name.split(',')[0].toLowerCase())} (${mealName(c.mealId)})`).join(', ');
      h += `<div class="card hi" id="bankcard"><div>${remaining > 50 ? `Saldo semanal: te faltan <b>${r0(remaining)} kcal</b> de días anteriores.${sug.bankAllowance > 0 ? ` Hoy podés sumar hasta <b>${r0(sug.bankAllowance)} kcal</b>.` : ''}` : 'Saldo semanal al día.'}</div>${applied.length ? `<div class="sub" style="margin-top:6px">✓ Aplicado hoy: +${r0(applied.reduce((a, o) => a + (o.kcal || 0), 0))} kcal (${applied.map(o => `${fname(o.foodId)} ${mealName(o.mealId)}`).join(', ')})</div>` : ''}${hasOpt ? '<div class="sub" style="margin-top:6px">Elegí cómo:</div>' : sug.bankAllowance > 0 ? '<div class="sub" style="margin-top:6px">Ya no quedan comidas por comer: si querés compensar, sumalo con + Añadir.</div>' : ''}
      ${sug.bankChanges?.length ? `<div class="row sp" style="margin-top:8px;gap:8px"><span class="sub grow">Carbos: ${lab(sug.bankChanges)}</span><button class="p s" data-a="acceptBank" data-o="carb">Aceptar</button></div>` : ''}
      ${sug.bankEgg?.length ? `<div class="row sp" style="margin-top:8px;gap:8px"><span class="sub grow">Huevos: ${lab(sug.bankEgg)} · ${r0(sug.bankEgg.reduce((a, c) => a + c.kcal, 0))} kcal</span><button class="p s" data-a="acceptBank" data-o="egg">Aceptar</button></div>` : ''}
      ${sug.bankPb?.length ? `<div class="row sp" style="margin-top:8px;gap:8px"><span class="sub grow">Cacahuete en polvo: ${lab(sug.bankPb)} · ${r0(sug.bankPb.reduce((a, c) => a + c.kcal, 0))} kcal</span><button class="p s" data-a="acceptBank" data-o="pb">Aceptar</button></div>` : ''}
      <div class="sub" style="margin-top:6px">Caduca el domingo.</div></div>`; } }
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
  return liveBlock(T, true) + `<div class="row sp"><h1>Semana en curso</h1>${isPrev ? '<span class="tag w">PREVIEW</span>' : ''}</div>
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
  h += weekReport(ws, days, T);
  h += `<div class="card"><h3>1. Pesajes en ayunas</h3>`;
  for (const { d, w } of wts) h += `<div class="it row sp" style="margin:6px 0"><span>${dLabel(d)}</span><input style="width:110px" type="text" inputmode="decimal" step="0.01" data-wd="${d}" value="${w.length ? w[0].kg : ''}" placeholder="kg"></div>`;
  h += `</div><div class="card"><h3>2. Sesiones realizadas</h3><div class="row"><div class="grow"><label>Fuerza</label><input id="sf" type="number" value="${rv.strength ?? ''}"></div><div class="grow"><label>Natación</label><input id="sn" type="number" value="${rv.swim ?? ''}"></div></div></div>
  <div class="card"><h3>3. Contexto</h3><div class="chips" id="ctx">${['semana normal', 'viaje', 'enfermedad', 'alcohol', 'sueño malo', 'estrés'].map(c => `<button data-a="ctx" data-c="${c}" class="${(rv.context || ['semana normal']).includes(c) ? 'on' : ''}">${c}</button>`).join('')}</div><label>Nota</label><input id="note" value="${esc(rv.note || '')}">
  <label>% grasa Withings (opcional)</label><input id="fatp" type="text" inputmode="decimal" value="${rv.fatPct ?? ''}"></div>
  <button class="p" style="width:100%" data-a="calc" data-w="${ws}">Calcular propuesta</button>`;
  const p = UI.proposal && UI.proposal.weekStart === ws ? UI.proposal : (S.reviews[ws] ? E.weeklyProposal(S, ws, T) : null);
  if (p) h += vProposal(p, T);
  return h + vHistory(T);
}
// ---------- informe de la semana cerrada (1.5.46) ----------
function weekReport(ws, days, T) {
  const cl = days.filter(d => d.hasData && d.close && d.close.answer !== 'not_logged');
  if (!cl.length) return '';
  const avg = k => cl.reduce((s, d) => s + d.actual[k], 0) / cl.length;
  const tgt = cl.reduce((s, d) => s + d.target.kcal, 0) / cl.length;
  const ok = cl.filter(d => d.actual.kcal >= 0.98 * d.target.kcal && d.actual.kcal <= 1.08 * d.target.kcal).length;
  const wd = E.range(ws, 7).map(d => S.weights.filter(x => x.date === d && !x.deleted)).filter(x => x.length);
  const w0 = wd.length ? wd[0][0].kg : null, w1 = wd.length ? wd.at(-1).at(-1).kg : null;
  const fats = wd.flat().filter(x => x.fatPct != null); const fat = fats.length ? fats.at(-1).fatPct : null;
  const hist = E.calibrationHistory(S, T).find(x => x.weekStart === ws);
  const skip = {}, add = {};
  for (const d of cl) for (const m of d.meals) {
    if (m.status === 'skipped') skip[m.name] = (skip[m.name] || 0) + 1;
    const pl = new Set(m.planned.filter(i => i.qty > 0).map(i => i.foodId));
    if (!['skipped', 'unknown'].includes(m.status)) for (const i of m.actualItems) if (i.qty > 0 && !pl.has(i.foodId)) add[i.foodId] = (add[i.foodId] || 0) + 1;
  }
  const top = (o, n) => Object.entries(o).sort((x, y) => y[1] - x[1]).slice(0, n);
  const sk = top(skip, 2), ad = top(add, 3);
  const row = (k, v) => `<tr><td>${k}</td><td class="r num">${v}</td></tr>`;
  let h = `<div class="card"><h3>Informe de la semana</h3><table style="margin-top:6px">`;
  h += row('<b>Comés por día (real)</b>', `<b>${r0(avg('kcal'))} kcal</b>`) + row('Meta media del plan', `${r0(tgt)} kcal`);
  if (hist && hist.implied != null) h += row('<b>Gastás por día (según tus datos)</b>', `<b>${r0(hist.implied)} kcal</b>`);
  h += row('P / C / G media', `${r0(avg('p'))} / ${r0(avg('c'))} / ${r0(avg('f'))} g`);
  h += row('Días cumplidos (98–108 %)', `${ok}/${cl.length} ${ok ? '✅' : ''}`);
  h += row('Peso inicio → fin', w0 == null ? '—' : `${E.round(w0, 2)} → ${E.round(w1, 2)} kg`);
  if (hist && hist.slopeWeek != null) h += row('Tendencia', `${hist.slopeWeek >= 0 ? '+' : ''}${E.round(hist.slopeWeek, 2)} kg/sem`);
  if (fat != null) h += row('% grasa (último)', `${E.round(fat, 1)} %`);
  h += row('Días cerrados · pesajes', `${cl.length}/7 · ${wd.length}`);
  if (hist && hist.implied != null) h += row('Gasto que usa la app', `${r0(hist.tdeePrev)} → <b>${r0(hist.tdee)}</b> kcal`);
  h += `</table>`;
  if (hist && hist.implied != null) h += `<div class="sub" style="margin-top:6px"><b>¿Por qué?</b> Comiste ${r0(hist.intake)} kcal por día y tu peso ${hist.slopeWeek >= 0 ? 'subió' : 'bajó'} ${E.round(Math.abs(hist.slopeWeek), 2)} kg/sem, así que tu gasto real ronda ${r0(hist.implied)} kcal. La app no salta de golpe: mueve su estimación solo una parte (de ${r0(hist.tdeePrev)} a ${r0(hist.tdee)}) para no reaccionar a una semana rara. ${hist.implied > hist.tdee + 100 ? 'Si las próximas semanas confirman el mismo número, la estimación lo va a ir alcanzando.' : ''}</div>`;
  else if (hist) h += `<div class="sub" style="margin-top:6px">Semana no calibrable: ${esc(hist.reasons.join(', '))}.</div>`;
  if (sk.length) h += `<div class="sub" style="margin-top:6px">Más omitida: ${sk.map(([n, c]) => `${esc(n)} (${c})`).join(', ')}.</div>`;
  if (ad.length) h += `<div class="sub" style="margin-top:4px">Agregado más seguido: ${ad.map(([f, c]) => `${esc((S.foods[f]?.name || f).split(/[,:]/)[0])} (${c})`).join(', ')}.</div>`;
  return h + `</div>`;
}
function vProposal(p, T) {
  const dec = S.decisions[p.id];
  let h = `<h2>Propuesta</h2><div class="card ${p.deltaKcal ? 'hi' : ''}">`;
  h += p.why.map(w => `<div class="sub" style="margin:3px 0">${esc(w)}</div>`).join('');
  h += `<table style="margin-top:10px"><tr><th></th><th class="r">Antes</th><th class="r">Después</th></tr>
    <tr><td>Meta</td><td class="r num">${r0(p.before.kcal)}</td><td class="r num"><b>${r0(p.after.kcal)}</b> (${p.deltaKcal >= 0 ? '+' : ''}${r0(p.deltaKcal)})</td></tr>
    <tr><td>P / C / G</td><td class="r num">${r0(p.before.p)} / ${r0(p.before.c)} / ${r0(p.before.f)}</td><td class="r num">${r0(p.after.p)} / ${r0(p.after.c)} / ${r0(p.after.f)}</td></tr>
    ${[...new Set(p.changes.map(c => c.mealId))].map(mid => `<tr><td colspan="3" style="padding-top:8px"><b>${esc(mealName(mid))}</b></td></tr>` + p.changes.filter(c => c.mealId === mid).map(c => `<tr><td style="padding-left:12px">${esc(S.foods[c.foodId].name.split(/[,:]/)[0])}</td><td class="r num">${c.from}${c.unit === 'u' ? '' : ' g'}</td><td class="r num"><b>${c.qty}${c.unit === 'u' ? '' : ' g'}</b></td></tr>`).join('')).join('')}
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
    if (ed) h += `<div class="items">${m.items.map((it, i) => `<div class="it"><span>${esc(S.foods[it.foodId].name)} <small class="m">(${it.unit === 'u' ? S.foods[it.foodId].unitName : 'g'}${it.role === 'carb' ? ', palanca' : it.role === 'nego' ? ', 2ª palanca' : ''})</small></span><input type="text" inputmode="decimal" data-pm="${m.id}" data-pi="${i}" value="${it.qty}"></div>`).join('')}</div>`;
    else h += `<div class="sub">${m.items.filter(it => it.qty > 0).map(it => `${qtyLabel(it)} ${esc(S.foods[it.foodId].name.split(',')[0].toLowerCase())}${it.role === 'carb' ? '*' : ''}`).join(' · ')}</div>`;
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
  <div class="card hi"><h3>Importar plan nutricional</h3><div class="sub">1) Copiá el prompt y pegalo en ChatGPT junto con tu plan (PDF, foto o texto). 2) Pegá acá el JSON que te devuelva. 3) Revisá el antes/después y aplicalo como nueva versión del plan.</div>
    <div class="row wrap" style="margin-top:8px"><button class="p s" data-a="planPrompt">Copiar prompt para ChatGPT</button></div>
    <label>JSON de ChatGPT</label><textarea id="planjson" rows="5" placeholder='{"foods":[…],"meals":[…]}'>${esc(UI.planJson || '')}</textarea>
    <button class="s" style="margin-top:8px" data-a="planPreview">Previsualizar</button>${UI.planImport ? planPreviewHtml(T) : ''}</div>
  <div class="card"><h3>Respaldo</h3><div class="sub">El respaldo es la copia completa de tus datos. Hacelo cada lunes (iCloud/Archivos).</div><div class="row wrap" style="margin-top:8px"><button class="s" data-a="backup">Exportar respaldo</button><label class="s" style="margin:0"><input id="imp" type="file" accept=".json,application/json" class="hidden"><span class="tag" style="padding:9px 12px;font-size:14px">Importar respaldo</span></label></div></div>
  <div class="card"><h3>Importar Withings</h3><div class="sub">Archivo <code>weight.csv</code> del export de Withings (Health Mate → Descargar mis datos). Ignora duplicados.</div><label style="margin-top:8px"><input id="wcsv" type="file" accept=".csv,text/csv" class="hidden"><span class="tag" style="padding:9px 12px;font-size:14px">Elegir weight.csv</span></label></div>
  <h2>Pesos (${S.weights.length})</h2><div class="card"><table><tr><th>Fecha</th><th class="r">kg</th><th class="r">% grasa</th><th></th></tr>${ws.map(w => `<tr><td>${dLabel(w.date)} <small class="m">${w.date.slice(0, 4)}</small></td><td class="r num">${w.kg}</td><td class="r num">${w.fatPct ?? ''}</td><td class="r"><button class="s del" data-a="delw" data-w="${w.id}">✕</button></td></tr>`).join('')}</table></div>`;
}

// ---------- importar plan ----------
function planPrompt() {
  const foods = Object.entries(S.foods).map(([id, f]) => `${id}: ${f.name} (${f.per100.kcal} kcal/100 g${f.unitG ? `, 1 ${f.unitName} = ${f.unitG} g` : ''})`).join('\n');
  return `Sos un asistente que convierte planes nutricionales al formato de mi app NutriciOS.
Te paso mi plan (adjunto o pegado abajo). Devolveme SOLO un bloque JSON válido, sin texto antes ni después, con este esquema:

{
  "foods": [ { "id": "snake_case_unico", "name": "Nombre", "per100": { "kcal": 0, "p": 0, "c": 0, "f": 0 }, "unitG": 50, "unitName": "u" } ],
  "meals": [ { "name": "Desayuno", "time": "08:00", "items": [ { "food": "id", "qty": 2, "unit": "u", "role": "fixed" } ] } ]
}

Reglas:
- Usá estos alimentos existentes por su id cuando coincidan:
${foods}
- Solo agregá a "foods" los alimentos que NO estén en esa lista. Valores por 100 g (crudo o cocido según cómo se pese en el plan; aclaralo en el nombre). "unitG"/"unitName" solo si se cuenta por unidades (huevo, rebanada, scoop).
- "unit": "g" para gramos, "u" para unidades (requiere unitG en el alimento).
- "role": "carb" para la fuente principal de carbohidratos ajustable de la comida (arroz, avena, pasta, papa), "nego" para huevos o whey, "fixed" para el resto (proteína animal siempre "fixed").
- "time" en formato HH:MM, si el plan lo indica; si no, estimalo.
- Respetá las cantidades del plan; si da rangos, usá el punto medio.
- Al final del JSON no agregues comentarios.

Mi plan:
`;
}
function parsePlan(txt) {
  const m = txt.match(/\{[\s\S]*\}/); if (!m) throw new Error('No encontré JSON');
  const j = JSON.parse(m[0]); if (!Array.isArray(j.meals) || !j.meals.length) throw new Error('Falta "meals"');
  const foods = { ...S.foods }, newFoods = [];
  for (const f of j.foods || []) { if (!f.id || !f.per100 || foods[f.id]) continue; const food = { name: String(f.name || f.id), per100: { kcal: +f.per100.kcal || 0, p: +f.per100.p || 0, c: +f.per100.c || 0, f: +f.per100.f || 0 }, src: 'plan importado' }; if (f.unitG > 0) { food.unitG = +f.unitG; food.unitName = f.unitName || 'u'; } foods[f.id] = food; newFoods.push([f.id, food]); }
  const used = {};
  const meals = j.meals.map((m, i) => { let id = String(m.name || 'comida').toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'comida' + i; if (/post/.test(id)) id = 'post'; while (used[id]) id += '_'; used[id] = 1;
    const items = (m.items || []).map(it => { const fid = it.food || it.foodId; if (!foods[fid]) throw new Error(`Alimento desconocido: ${fid}`); const unit = it.unit === 'u' && foods[fid].unitG ? 'u' : 'g'; const qty = +it.qty || 0; const role = ['carb', 'nego'].includes(it.role) ? it.role : 'fixed';
      const o = { foodId: fid, qty, unit, role }; if (role === 'carb') Object.assign(o, { min: E.round(qty * 0.5 / 5) * 5, max: E.round(qty * 2 / 5) * 5, step: 5 }); if (role === 'nego') Object.assign(o, unit === 'u' ? { min: Math.max(0, qty - 2), max: qty + 2, step: 1 } : { min: E.round(qty * 0.5), max: E.round(qty * 1.5), step: 5 }); return o; });
    const out = { id, name: String(m.name || 'Comida ' + (i + 1)), items }; if (/^\d{1,2}:\d{2}$/.test(m.time || '')) out.time = m.time.padStart(5, '0'); return out; });
  return { foods, newFoods, meals };
}
function planPreviewHtml(T) {
  const P = UI.planImport, cur = E.versionAt(S, T).meals;
  const a = E.mealsTotal(S.foods, cur), b = E.mealsTotal(P.foods, P.meals);
  const line = (l, x, y) => `<tr><td>${l}</td><td class="r num">${r0(x)}</td><td class="r num">${r0(y)}</td><td class="r num" style="color:${y - x >= 0 ? 'var(--acc)' : 'var(--warn)'}">${y - x >= 0 ? '+' : ''}${r0(y - x)}</td></tr>`;
  return `<h2>Antes → después</h2><table><tr><th></th><th class="r">Actual</th><th class="r">Importado</th><th class="r">Δ</th></tr>${line('kcal', a.kcal, b.kcal)}${line('Prot g', a.p, b.p)}${line('Carb g', a.c, b.c)}${line('Grasa g', a.f, b.f)}</table>
    ${P.meals.map(m => `<div style="margin-top:8px"><b>${esc(m.name)}</b> <small class="m">${m.time || ''} · ${r0(E.sumItems(P.foods, m.items).kcal)} kcal</small><div class="sub">${m.items.map(it => `${qtyLabel(it)} ${esc(P.foods[it.foodId].name.split(',')[0].toLowerCase())}${it.role !== 'fixed' ? ` <small>(${it.role})</small>` : ''}`).join(' · ')}</div></div>`).join('')}
    ${P.newFoods.length ? `<div class="sub" style="margin-top:8px">Alimentos nuevos: ${P.newFoods.map(([, f]) => esc(f.name)).join(', ')}</div>` : ''}
    <div class="row" style="margin-top:10px"><button class="p s" data-a="planApply">Aplicar como nueva versión</button><button class="s" data-a="planCancel">Descartar</button></div>
    <div class="sub" style="margin-top:6px">Empieza hoy si no marcaste nada; si no, mañana. Podés volver atrás desde Plan → versiones.</div>`;
}

// ---------- AJUSTES ----------
// ---------- tema claro / oscuro (1.6.1) ----------
function applyTheme() {
  const m = S?.settings?.theme || 'auto', h = new Date().getHours();
  const t = m === 'horario' ? (h >= 8 && h < 20 ? 'light' : 'dark') : m;
  if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#1A1A1A' : '#F5F3EE');
}
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (S) applyTheme(); }); } catch {}
setInterval(() => { if (S && S.settings.theme === 'horario') applyTheme(); }, 60000);
function vAjustes(T) {
  const P = S.settings.params;
  const f = (k, l, step = 1) => `<div class="it row sp" style="margin:6px 0"><span>${l}</span><input style="width:110px" type="number" step="${step}" data-par="${k}" value="${P[k]}"></div>`;
  return `<h1>Ajustes</h1>
  <div class="card"><div class="row sp"><div><h3>Versión ${APP_VERSION}</h3><div class="sub">${UPD.latest ? (UPD.latest === APP_VERSION ? 'Al día' : 'Disponible: ' + esc(UPD.latest)) : 'Sin comprobar'}</div></div><div class="row"><button class="s" data-a="checkupd">${UPD.checking ? 'Comprobando…' : 'Buscar'}</button><button class="p s" data-a="update">Actualizar</button></div></div><div class="sub" style="margin-top:6px">Actualizar recarga la app desde GitHub. Tus datos no se tocan.</div></div>
  <div class="card"><h3>Apariencia</h3><div class="sub">Automático sigue al iPhone (si en Ajustes del iPhone → Pantalla elegís "Automático", es claro de día y oscuro de noche).</div>
    <div class="chips" style="margin-top:8px">${[['auto', 'Automático (iPhone)'], ['horario', 'Por horario (8–20 h claro)'], ['light', 'Claro'], ['dark', 'Oscuro']].map(([k, l]) => `<button data-a="theme" data-v="${k}" class="${(S.settings.theme || 'auto') === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
  <div class="card hi"><h3>Objetivo</h3><div class="sub">Lo que se muestra arriba en Hoy, con la cuenta regresiva.</div>
    <label>Nombre del objetivo</label><input id="gname" value="${esc(S.settings.goalName || 'Verano en Paraguay')}">
    <div class="row"><div class="grow"><label>Fecha objetivo</label><input id="gdate" type="date" value="${S.settings.goalDate || S.settings.endDate || ''}"></div><div class="grow"><label>o días desde hoy</label><input id="gdays" type="number" inputmode="numeric" placeholder="ej. 70"></div></div>
    <button class="p s" style="margin-top:8px" data-a="saveGoal">Guardar objetivo</button><div class="sub" style="margin-top:6px">Cambia solo la cuenta regresiva. Las fases del plan se ajustan en Plan.</div></div>
  <div class="card"><h3>Recordatorio diario (Atajos de iOS)</h3><div class="sub">Atajos → Automatización → Nueva → Hora del día: 22:00, diariamente, ejecutar inmediatamente → Acción "Abrir URL" → <code>${esc(location.href.split('#')[0])}</code>. Al abrir, la app te pregunta por el día.</div></div>
  <div class="card"><h3>Parámetros del motor</h3>
  ${f('stepCap', 'Paso semanal máx. (kcal)')}${f('stepCapHyst', 'Paso con histéresis (kcal)')}${f('deadband', 'Banda muerta (kcal)')}${f('carryCap', 'Tope arrastre/día (kcal)')}${f('kcalFloor', 'Piso calórico (kcal)')}${f('calibrationWeeksMin', 'Semanas de calibración')}${f('gBase', 'Velocidad de aprendizaje', 0.05)}
  <div class="it row sp" style="margin:6px 0"><span>Superávit volumen limpio</span><input style="width:110px" type="number" data-dev="volumen" value="${P.phaseDev.volumen}"></div>
  <div class="it row sp" style="margin:6px 0"><span>Superávit volumen agresivo</span><input style="width:110px" type="number" data-dev="volumen_agresivo" value="${P.phaseDev.volumen_agresivo}"></div>
  <div class="it row sp" style="margin:6px 0"><span>Límite de salida (puntos grasa)</span><input style="width:110px" type="number" step="0.5" id="exitp" value="${S.settings.exitFatPoints}"></div>
  <button class="p s" style="margin-top:8px" data-a="savePar">Guardar</button></div>
  <div class="card hi"><h3>+ Nuevo alimento</h3><div class="sub">Valores de la etiqueta. Elegí si son por 100 g o por porción.</div>
    <div class="row" style="margin-top:8px"><button class="s" data-a="scanStart">📷 Escanear código</button><input id="nf-code" type="text" inputmode="numeric" placeholder="o escribí el código" class="grow"><button class="s" data-a="scanLookup">Buscar</button></div>
    <div id="nf-offmsg" class="sub" style="margin-top:6px"></div>
    <label>Nombre</label><input id="nf-name" placeholder="Ej.: Crema de cacahuete en polvo">
    <div class="row"><div class="grow"><label>Los valores son</label><select id="nf-base"><option value="100">por 100 g</option><option value="portion">por porción</option></select></div><div class="grow"><label>Porción (g)</label><input id="nf-pg" type="text" inputmode="decimal" placeholder="ej. 12"></div></div>
    <div class="row">${['kcal', 'p', 'c', 'f'].map(k => `<div class="grow"><label>${{ kcal: 'kcal', p: 'Prot g', c: 'Carb g', f: 'Grasa g' }[k]}</label><input id="nf-${k}" type="text" inputmode="decimal" step="0.1"></div>`).join('')}</div>
    <label>Nombre de la porción (opcional)</label><input id="nf-un" placeholder="cda, scoop, rebanada…">
    <button class="p s" style="margin-top:10px" data-a="newFood">Guardar alimento</button></div>
  <div class="card"><h3>Alimentos</h3><div class="sub">Valores por 100 g. Editá con los de tus etiquetas.</div>${Object.entries(S.foods).map(([id, fd]) => `<details style="margin:8px 0"><summary>${esc(fd.name)} <small class="m">${fd.per100.kcal} kcal${fd.unitG ? ` · ${fd.unitName} = ${fd.unitG} g` : ''}</small></summary>
    <div class="row">${['kcal', 'p', 'c', 'f'].map(k => `<div class="grow"><label>${k.toUpperCase()}</label><input type="text" inputmode="decimal" data-food="${id}" data-k="${k}" value="${fd.per100[k]}"></div>`).join('')}${fd.unitG ? `<div class="grow"><label>g/${esc(fd.unitName)}</label><input type="number" data-food="${id}" data-k="unitG" value="${fd.unitG}"></div>` : ''}</div>
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
    case 'day': { const n = E.addDays(d, +el.dataset.d); if (n <= T) { UI.day = n; UI.draft = {}; render(); } break; }
    case 'gotoday': UI.day = el.dataset.d; UI.draft = {}; render(); break;
    case 'close': {
      const cd = el.dataset.d, ans = el.dataset.v;
      if (el.dataset.manual) { const v = E.dayView(S, cd, T); const list = v.meals.filter(m => ['pending', 'assumed'].includes(m.status)).map(m => ['MEAL_SET', { date: cd, mealId: m.id, status: 'skipped' }]); list.push(['DAY_CLOSE', { date: cd, answer: 'with_changes' }]); await emitMany(list); }
      else await emit('DAY_CLOSE', { date: cd, answer: ans });
      if (el.dataset.manual) closeSummary(cd); else burst(); break; }
    case 'closesum': document.getElementById('closesum')?.remove(); break;
    case 'closebk': document.getElementById('closesum')?.remove(); backup(); break;
    case 'reopen': await emit('DAY_CLOSE', { date: d, answer: null }); break;
    case 'addw': { const kg = parseKg($('#wkg').value); if (kg > 30 && kg < 250) { await emit('WEIGHT', { id: uid(), date: el.dataset.d, kg }); toast(`Peso guardado: ${kg} kg`); } else toast('Peso no válido');  break; }
    case 'toggle': {
      const m = dv().meals.find(x => x.id === el.dataset.m);
      // Con Modificar abierto, el check guarda lo que está en el panel (antes desmarcaba y borraba los cambios).
      if (UI.open[d + m.id]) { el.closest('.card')?.querySelector(`[data-a="saveMeal"][data-m="${m.id}"]`)?.click(); break; }
      if (['confirmed', 'edited', 'replaced'].includes(m.status) && m.touched) { await emit('MEAL_RESET', { date: d, mealId: m.id }); if (m.status !== 'confirmed') toast('Desmarcada: se quitaron los cambios de esta comida'); }
      else await emit('MEAL_SET', { date: d, mealId: m.id, status: 'confirmed' });
      break; }
    case 'addItem': { const mid = el.dataset.m; const fid = $('#addf-' + mid).value, q = parseFloat(($('#addq-' + mid).value || '').replace(',', '.'));
      const fu = foodUnit(fid), isU = fu !== 'g';
      if (!(q > 0)) { toast(isU ? `Indicá cuántos (${fu})` : 'Indicá los gramos'); break; }
      const m = dv().meals.find(x => x.id === mid);
      // Se parte de lo que hay en el panel (cantidades, quitados y cambios sin guardar), no de lo último guardado:
      // antes, al añadir, reaparecía lo que habías quitado y se perdían las cantidades tocadas.
      const cur = panelItems(el.closest('.card'), m);
      const items = cur.filter((it, i) => it.qty > 0 || m.actualItems[i].qty === 0);   // quitados fuera; opciones en 0 del plan se conservan
      const zero = items.find(i => i.foodId === fid && i.qty === 0);   // opción en 0 del plan (p. ej. natilla): se completa en vez de duplicar
      if (zero) zero.qty = q; else items.push({ foodId: fid, qty: q, unit: isU ? 'u' : 'g', role: 'extra' });
      const changedFood = m.status === 'replaced' || cur.some((it, i) => it.foodId !== m.actualItems[i].foodId);
      const k = d + mid; dropDraft(k);
      await emit('MEAL_SET', { date: d, mealId: mid, status: changedFood ? 'replaced' : 'edited', items }); UI.open[k] = true; render(); UI.skipCap = null; toast('Añadido'); break; }
    case 'stp': { const inp = el.closest('.it').querySelector('input'); inp.value = Math.max(0, E.round((parseFloat(String(inp.value).replace(',', '.')) || 0) + parseFloat(el.dataset.s), 2)); liveHint(el.closest('[data-meal]')); break; }
    case 'openm': { const k = d + el.dataset.m; UI.open[k] = !UI.open[k]; if (!UI.open[k]) dropDraft(k); render(); UI.skipCap = null; break; }
    case 'saveMeal': {
      const m = dv().meals.find(x => x.id === el.dataset.m); const card = el.closest('.card');
      const items = m.actualItems.map((it, i) => ({ ...it }));
      card.querySelectorAll('[data-f]').forEach(inp => { const i = +inp.dataset.i; if (inp.dataset.f === 'qty') items[i].qty = parseFloat(inp.value.replace(',', '.')) || 0; else items[i].foodId = inp.value; });
      card.querySelectorAll('.swipe.gone').forEach(r => { items[+r.dataset.i].qty = 0; });
      const changedFood = m.status === 'replaced' || items.some((it, i) => it.foodId !== m.actualItems[i].foodId);
      const kept = items.filter(it => it.qty > 0);
      dropDraft(d + m.id);
      if (!kept.length) { UI.open[d + m.id] = false; await emit('MEAL_SET', { date: d, mealId: m.id, status: 'skipped' }); toast('Sin ingredientes: marcada como no comida'); break; }
      items.length = 0; items.push(...kept);
      UI.open[d + m.id] = false;
      await emit('MEAL_SET', { date: d, mealId: m.id, status: changedFood ? 'replaced' : 'edited', items }); UI.skipCap = null; toast('Guardado'); break; }
    case 'skipMeal': UI.open[d + el.dataset.m] = false; dropDraft(d + el.dataset.m); await emit('MEAL_SET', { date: d, mealId: el.dataset.m, status: 'skipped' }); UI.skipCap = null; break;
    case 'repeatMeal': { const its = yesterdayItems(d, el.dataset.m, T); if (!its) break; UI.open[d + el.dataset.m] = false; dropDraft(d + el.dataset.m);
      await emit('MEAL_SET', { date: d, mealId: el.dataset.m, status: 'edited', items: JSON.parse(JSON.stringify(its)) }); UI.skipCap = null; toast('Copiada de ayer'); break; }
    case 'resetMeal': UI.open[d + el.dataset.m] = false; dropDraft(d + el.dataset.m); await emit('MEAL_RESET', { date: d, mealId: el.dataset.m }); UI.skipCap = null; break;
    case 'acceptRedist': { const s = E.redistributionSuggestion(S, d, T); await emitMany(s.sameDay.map(c => ['OVERRIDE', { date: d, mealId: c.mealId, foodId: c.foodId, qty: c.qty, kcal: c.kcal, fromBank: false }])); toast('Redistribución aplicada'); break; }
    case 'acceptBank': { const s = E.redistributionSuggestion(S, d, T); await emitMany(({ pb: s.bankPb, egg: s.bankEgg }[el.dataset.o] || s.bankChanges).map(c => ['OVERRIDE', { date: d, mealId: c.mealId, foodId: c.foodId, qty: c.qty, kcal: c.kcal, fromBank: true }])); toast('Saldo aplicado'); break; }
    case 'ignore': el.closest('.card').remove(); break;
    case 'quick': await emit('EXTRA', { date: d, id: uid(), name: `Extra rápido +${el.dataset.k}`, kcal: +el.dataset.k, p: +el.dataset.k * 0.15 / 4, c: +el.dataset.k * 0.45 / 4, f: +el.dataset.k * 0.4 / 9, estimated: true }); break;
    case 'custom': $('#customx').classList.toggle('hidden'); break;
    case 'addx': { const k = +$('#xk').value; if (k > 0) await emit('EXTRA', { date: d, id: uid(), name: $('#xn').value || 'Comida', kcal: k, p: +$('#xp').value || 0, c: +$('#xc').value || 0, f: +$('#xf').value || 0 }); break; }
    case 'delx': await emit('EXTRA_DEL', { date: d, id: el.dataset.x }); break;
    case 'ctx': el.classList.toggle('on'); break;
    case 'calc': {
      const ws = el.dataset.w; const list = [];
      document.querySelectorAll('[data-wd]').forEach(inp => { const kg = parseKg(inp.value); const day = inp.dataset.wd; const ex = S.weights.find(w => w.date === day);
        if (kg > 30 && kg < 250 && (!ex || ex.kg !== kg)) list.push(['WEIGHT', { id: ex ? ex.id : uid(), date: day, kg, fatPct: ex?.fatPct ?? null }]); });
      const fatp = parseFloat(($('#fatp').value || '').replace(',', '.')); if (fatp > 3 && fatp < 60) { const last = E.addDays(ws, 6); const ex = S.weights.filter(w => w.date <= last).at(-1); if (ex) list.push(['WEIGHT', { ...ex, fatPct: fatp }]); }
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
      const food = { name, per100, src: ($('#nf-name').dataset.src || 'usuario') + ' ' + T }; if (pg > 0) { food.unitG = pg; food.unitName = $('#nf-un').value.trim() || 'porción'; }
      await emit('FOOD', { id, food }); $('#nf-name').dataset.src = ''; toast('Alimento guardado'); break; }
    case 'scanStart': scanStart(); break;
    case 'scanStop': scanStop(); break;
    case 'scanLookup': offLookup(($('#nf-code').value || '').replace(/\D/g, '')); break;
    case 'saveFood': { const id = el.dataset.food; const fd = JSON.parse(JSON.stringify(S.foods[id]));
      document.querySelectorAll(`[data-food="${id}"][data-k]`).forEach(i => { const v = parseFloat(String(i.value).replace(',', '.')); if (i.dataset.k === 'unitG') fd.unitG = v; else fd.per100[i.dataset.k] = v; });
      fd.src = 'editado ' + T; await emit('FOOD', { id, food: fd }); toast('Alimento actualizado'); break; }
    case 'delw': await emit('WEIGHT', { id: el.dataset.w, deleted: true }); break;
    case 'ai': { const x = E.exportForAI(S, T); download(`nutricios-ia-${T}.txt`, x.text); break; }
    case 'aicopy': { const x = E.exportForAI(S, T); try { await navigator.clipboard.writeText(x.text); toast('Copiado: pegalo en Claude'); } catch { download(`nutricios-ia-${T}.txt`, x.text); } break; }
    case 'planPrompt': { const t = planPrompt(); try { await navigator.clipboard.writeText(t); toast('Prompt copiado: pegalo en ChatGPT'); } catch { download('nutricios-prompt-plan.txt', t); } break; }
    case 'planPreview': { UI.planJson = $('#planjson').value; try { UI.planImport = parsePlan(UI.planJson); } catch (err) { UI.planImport = null; toast('JSON no válido: ' + err.message); } render(); break; }
    case 'planCancel': UI.planImport = null; UI.planJson = ''; render(); break;
    case 'planApply': { const P = UI.planImport; if (!P) break; const today = E.dayView(S, T, T); const eff = today.meals.some(m => m.touched) || today.close ? E.addDays(T, 1) : T;
      const list = P.newFoods.map(([id, food]) => ['FOOD', { id, food }]); list.push(['VERSION', { id: 'v' + (S.versions.length + 1), effectiveFrom: eff, meals: P.meals, reason: 'Plan importado' }]);
      UI.planImport = null; UI.planJson = ''; await emitMany(list); toast('Plan importado · desde ' + dLabel(eff)); backup(); break; }
    case 'theme': await emit('SETTINGS', { theme: el.dataset.v }); toast('Apariencia guardada'); break;
    case 'saveGoal': { const n = +$('#gdays').value; const goalDate = n > 0 ? E.addDays(T, n) : $('#gdate').value; const goalName = $('#gname').value.trim() || 'Verano en Paraguay';
      if (!goalDate) { toast('Indicá fecha o días'); break; } await emit('SETTINGS', { goalName, goalDate }); toast(`Objetivo: ${E.diffDays(goalDate, T)} días`); break; }
    case 'backup': backup(); break;
    case 'update': applyUpdate(); break;
    case 'updclose': document.getElementById('updscreen')?.remove(); break;
    case 'updretry': document.getElementById('updscreen')?.remove(); applyUpdate(); break;
    case 'updlater': UPD.dismissed = UPD.latest; document.getElementById('updmodal')?.remove(); break;
    case 'checkupd': checkUpdate(true); break;
    case 'wipe': if (confirmWipe()) { await clearAll(); EVENTS = []; S = E.emptyState(); await boot(); } break;
  }
});
let wipeArmed = 0;
function confirmWipe() { if (Date.now() - wipeArmed < 4000) return true; wipeArmed = Date.now(); toast('Tocá otra vez para borrar todo (tenés respaldo?)'); return false; }
function backup() { download(`nutricios-respaldo-${todayStr()}.json`, JSON.stringify({ app: 'nutricios', schema: 1, calc: E.CALC_VERSION, exported: new Date().toISOString(), events: EVENTS }), 'application/json'); }

document.addEventListener('change', async e => {
  // 1.5.49: al cambiar alimento en Modificar, ajustar gramos para mantener carbos (carbos) o proteína (proteínas)
  if (e.target.matches('select[data-f="food"]')) {
    const row = e.target.closest('.swipe') || e.target.closest('.it'), q = row && row.querySelector('[data-f="qty"]');
    const from = S.foods[e.target.dataset.prev || e.target.dataset.o], to = S.foods[e.target.value];
    if (q && from && to) { const k = e.target.dataset.r === 'carb' ? 'c' : 'p', a0 = from.per100[k], a1 = to.per100[k], v = parseFloat(String(q.value).replace(',', '.'));
      if (a0 > 0 && a1 > 0 && v > 0) q.value = Math.max(10, Math.round(v * a0 / a1 / 10) * 10); }
    e.target.dataset.prev = e.target.value; liveHint(e.target.closest('[data-meal]')); return;
  }
  if (e.target.id?.startsWith('addf-')) { const q = $('#addq-' + e.target.id.slice(5)); if (q) q.placeholder = unitLbl(e.target.value); return; }
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

// ---------- deslizar (a cualquier lado) para quitar ingrediente ----------
let SW = null;
document.addEventListener('touchstart', e => { const r = e.target.closest('.swipe'); if (!r || e.target.closest('input,select,button')) return; SW = { r, c: r.querySelector('.swc'), bg: r.querySelector('.swbg'), x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, lock: null }; }, { passive: true });
document.addEventListener('touchmove', e => { if (!SW) return; const t = e.touches[0]; const dx = t.clientX - SW.x, dy = t.clientY - SW.y;
  if (SW.lock === null && Math.abs(dx) + Math.abs(dy) > 8) SW.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  if (SW.lock !== 'x') return; SW.dx = dx; SW.c.style.transition = 'none'; SW.c.style.transform = `translateX(${dx}px)`;
  SW.bg.style.transition = 'none'; SW.bg.style.opacity = String(Math.min(1, Math.abs(dx) / 50)); SW.bg.classList.toggle('ready', Math.abs(dx) > 90); }, { passive: true });
document.addEventListener('touchend', () => { if (!SW) return; const { r, c, bg, dx } = SW; SW = null; c.style.transition = 'transform .2s'; bg.style.transition = 'opacity .2s';
  if (Math.abs(dx) > 90) {
    c.style.transform = `translateX(${dx < 0 ? -110 : 110}%)`;
    setTimeout(() => { r.style.height = r.offsetHeight + 'px'; r.style.transition = 'height .18s, margin .18s'; requestAnimationFrame(() => { r.style.height = '0'; r.style.margin = '0'; }); }, 180);
    setTimeout(() => { r.classList.add('gone'); r.style.display = 'none'; liveHint(r.closest('[data-meal]')); }, 380);
    toast('Ingrediente quitado · tocá Guardar'); }
  else { c.style.transform = ''; bg.style.opacity = '0'; bg.classList.remove('ready'); } });

// ---------- arranque ----------
async function migrate() {
  // 1.5.36: calibrar desde la 1ª semana (pedido del usuario) con primer paso máx. ±100
  if (!S.settings.mig1536) { const params = { ...JSON.parse(JSON.stringify(S.settings.params)), firstStepCap: 100 }; if (params.calibrationWeeksMin === 2) params.calibrationWeeksMin = 1;
    await emitMany([['SETTINGS', { params }], ['SETTINGS', { mig1536: true }]]); }
  // etiquetas reales: actualiza alimentos que cambiaron en DEFAULT_FOODS
  const upd = ['guacamole', 'pb2', 'lentejas', 'natilla', 'pan', 'pina'].filter(id => S.foods[id] && (S.foods[id].name !== E.DEFAULT_FOODS[id].name || S.foods[id].per100.kcal !== E.DEFAULT_FOODS[id].per100.kcal || S.foods[id].unitName !== E.DEFAULT_FOODS[id].unitName) && !String(S.foods[id].src || '').startsWith('editado'));
  if (upd.length) await emitMany(upd.map(id => ['FOOD', { id, food: E.DEFAULT_FOODS[id] }]));
  // 1.5.4: guacamole diario en el desayuno (200 g/semana = 29 g/día), reemplaza el aguacate de la cena
  const T = todayStr();
  if (!S.settings.mig154 && !E.versionAt(S, T).meals.some(m => m.items.some(it => it.foodId === 'guacamole'))) {
    const cur = JSON.parse(JSON.stringify(E.versionAt(S, T).meals));
    for (const m of cur) m.items = m.items.filter(it => it.foodId !== 'aguacate');
    const des = cur.find(m => m.id === 'desayuno'); if (des && !des.items.some(it => it.foodId === 'guacamole')) des.items.push({ foodId: 'guacamole', qty: 29, unit: 'g', role: 'fixed' });
    await emitMany([['FOOD', { id: 'guacamole', food: E.DEFAULT_FOODS.guacamole }], ['VERSION', { id: 'v' + (S.versions.length + 1), effectiveFrom: T, meals: cur, reason: 'Guacamole 29 g/día en el desayuno (reemplaza aguacate de la cena)' }], ['SETTINGS', { mig154: true }]]);
  }
  // 1.5.10: natilla proteica Hacendado como opción en 0 en almuerzo y cena (se parte del plan vigente del usuario, sin tocar nada más)
  if (!S.settings.mig1510 && !E.versionAt(S, T).meals.some(m => m.items.some(it => it.foodId === 'natilla'))) {
    const cur = JSON.parse(JSON.stringify(E.versionAt(S, T).meals));
    const tg = cur.filter(m => ['almuerzo', 'cena'].includes(m.id));
    for (const m of tg) m.items.push({ foodId: 'natilla', qty: 0, unit: 'u', role: 'fixed' });
    const list = [['FOOD', { id: 'natilla', food: E.DEFAULT_FOODS.natilla }]];
    if (tg.length) list.push(['VERSION', { id: 'v' + (S.versions.length + 1), effectiveFrom: T, meals: cur, reason: 'Natilla +Proteínas Hacendado como opción (0) en almuerzo y cena' }]);
    list.push(['SETTINGS', { mig1510: true }]);
    await emitMany(list);
  }
  // 1.5.18: psyllium (fibra) 1 cda de 2 g en desayuno y cena, sobre el plan vigente del usuario
  if (!S.settings.mig1518 && !E.versionAt(S, T).meals.some(m => m.items.some(it => it.foodId === 'psyllium'))) {
    const cur = JSON.parse(JSON.stringify(E.versionAt(S, T).meals));
    const tg = cur.filter(m => ['desayuno', 'cena'].includes(m.id));
    for (const m of tg) m.items.push({ foodId: 'psyllium', qty: 1, unit: 'u', role: 'fixed' });
    const list = [['FOOD', { id: 'psyllium', food: E.DEFAULT_FOODS.psyllium }]];
    if (tg.length) list.push(['VERSION', { id: 'v' + (S.versions.length + 1), effectiveFrom: T, meals: cur, reason: 'Psyllium (fibra) 1 cda de 2 g en desayuno y cena' }]);
    list.push(['SETTINGS', { mig1518: true }]);
    await emitMany(list);
  }
  // 1.5.19: 2 kiwis en la cena (a veces 1: se ajusta en Modificar)
  if (!S.settings.mig1519 && !E.versionAt(S, T).meals.some(m => m.items.some(it => it.foodId === 'kiwi'))) {
    const cur = JSON.parse(JSON.stringify(E.versionAt(S, T).meals));
    const tg = cur.filter(m => m.id === 'cena');
    for (const m of tg) m.items.push({ foodId: 'kiwi', qty: 2, unit: 'u', role: 'fixed' });
    const list = [];
    if (tg.length) list.push(['VERSION', { id: 'v' + (S.versions.length + 1), effectiveFrom: T, meals: cur, reason: '2 kiwis en la cena' }]);
    list.push(['SETTINGS', { mig1519: true }]);
    await emitMany(list);
  }
  // 1.5.28: mozzarella rallada en el desayuno (paquete de 200 g ÷ 7 días = 28,6 g; se ajusta por gramo en Modificar)
  if (!S.settings.mig1528 && !E.versionAt(S, T).meals.some(m => m.items.some(it => it.foodId === 'mozza'))) {
    const cur = JSON.parse(JSON.stringify(E.versionAt(S, T).meals));
    const tg = cur.filter(m => m.id === 'desayuno');
    for (const m of tg) m.items.push({ foodId: 'mozza', qty: 28.6, unit: 'g', role: 'fixed' });
    const list = [];
    if (tg.length) list.push(['VERSION', { id: 'v' + (S.versions.length + 1), effectiveFrom: T, meals: cur, reason: 'Mozzarella rallada en el desayuno (28,6 g)' }]);
    list.push(['SETTINGS', { mig1528: true }]);
    await emitMany(list);
  }
  // 1.5.37: comida Intra-entreno (50 g dextrosa + 100 ml bebida de naranja) desde MAÑANA; días anteriores sin cambios
  if (!S.settings.mig1537) {
    const from = E.addDays(T, 1), base = E.versionAt(S, from);
    const list = [];
    if (!base.meals.some(m => m.id === 'intra')) {
      const cur = JSON.parse(JSON.stringify(base.meals));
      const i = cur.findIndex(m => m.id === 'post'); const at = i < 0 ? cur.length : i;
      cur.splice(at, 0, { id: 'intra', name: 'Intra-entreno', items: [
        { foodId: 'dextrosa', qty: 50, unit: 'g', role: 'fixed' }, { foodId: 'naranjab', qty: 100, unit: 'g', role: 'fixed' } ] });
      list.push(['VERSION', { id: 'v' + (S.versions.length + 1), effectiveFrom: from, meals: cur, reason: 'Intra-entreno: 50 g dextrosa + 100 ml bebida de naranja' }]);
    }
    list.push(['SETTINGS', { mig1537: true }]);
    await emitMany(list);
  }
  // 1.5.40: el Intra-entreno rige desde HOY (la 1.5.37 lo dejó desde mañana); días anteriores sin cambios
  if (!S.settings.mig1540) {
    const base = E.versionAt(S, T);
    const list = [];
    if (S.settings.mig1537 && !base.meals.some(m => m.id === 'intra')) {
      const cur = JSON.parse(JSON.stringify(base.meals));
      const i = cur.findIndex(m => m.id === 'post'); const at = i < 0 ? cur.length : i;
      cur.splice(at, 0, { id: 'intra', name: 'Intra-entreno', items: [
        { foodId: 'dextrosa', qty: 50, unit: 'g', role: 'fixed' }, { foodId: 'naranjab', qty: 100, unit: 'g', role: 'fixed' } ] });
      list.push(['VERSION', { id: 'v' + (S.versions.length + 1), effectiveFrom: T, meals: cur, reason: 'Intra-entreno desde hoy: 50 g dextrosa + 100 ml jugo de naranja' }]);
    }
    list.push(['SETTINGS', { mig1540: true }]);
    await emitMany(list);
  }
  // 1.5.44: pan 5 semillas Hacendado (2 rebanadas de 50 g) por defecto en el desayuno DESDE MAÑANA; días anteriores sin cambios
  if (!S.settings.mig1544) {
    const from = E.addDays(T, 1), base = E.versionAt(S, from);
    const cur = JSON.parse(JSON.stringify(base.meals));
    const des = cur.find(m => m.id === 'desayuno');
    const list = [];
    if (des && des.items.some(it => it.foodId === 'pan')) {
      des.items = des.items.map(it => it.foodId === 'pan' ? { foodId: 'pan5s', qty: 2, unit: 'u', role: 'fixed' } : it);
      list.push(['VERSION', { id: 'v' + (S.versions.length + 1), effectiveFrom: from, meals: cur, reason: 'Desayuno: pan 5 semillas Hacendado (2 rebanadas de 50 g) en lugar del pan integral chico' }]);
    }
    list.push(['SETTINGS', { mig1544: true }]);
    await emitMany(list);
  }
  // 1.5.46: plan nuevo desde MAÑANA con horarios reales (pedido del usuario el 19-10): meta ≈ 3.250; primer paso del motor ±200
  if (!S.settings.mig1546) {
    const from = E.addDays(T, 1), list = [];
    const I = (foodId, qty, unit = 'g', x = {}) => ({ foodId, qty, unit, role: 'fixed', ...x });
    const C = (foodId, qty, min, max) => ({ foodId, qty, unit: 'g', role: 'carb', min, max, step: 5 });
    const ok = ['pan5s', 'huevo', 'guacamole', 'mozza', 'psyllium', 'naranjab', 'pollo', 'arroz', 'lentejas', 'aceite', 'natilla', 'caseina', 'avena', 'banana', 'pb2', 'dextrosa', 'carne', 'pasta', 'tomate', 'kiwi'].every(f => S.foods[f]);
    if (ok) {
      const meals = [
        { id: 'desayuno', name: 'Desayuno', items: [I('pan5s', 2, 'u'), { foodId: 'huevo', qty: 3, unit: 'u', role: 'nego', min: 2, max: 5, step: 1 }, I('guacamole', 29), I('mozza', 28.6), I('psyllium', 1, 'u'), I('naranjab', 100)] },
        { id: 'almuerzo', name: 'Almuerzo', items: [I('pollo', 300), C('arroz', 100, 40, 160), I('lentejas', 100), I('aceite', 5), I('natilla', 1, 'u')] },
        { id: 'pre', name: 'Pre-entreno', items: [I('caseina', 1, 'u'), C('avena', 75, 30, 120), I('banana', 1, 'u'), I('pb2', 12)] },
        { id: 'intra', name: 'Intra-entreno', items: [I('dextrosa', 40), I('naranjab', 100)] },
        { id: 'cena', name: 'Cena (post-entreno)', items: [I('carne', 250, 'g', { choices: ['carne', 'salmon', 'merluza', 'pollo'] }), C('pasta', 105, 40, 160), I('tomate', 90), I('natilla', 0, 'u')] },
        { id: 'recena', name: 'Recena (opcional)', items: [I('pb2', 0), I('avena', 0), I('caseina', 0, 'u'), I('kiwi', 0, 'u'), I('psyllium', 0, 'u'), I('natilla', 0, 'u')] } ];
      list.push(['VERSION', { id: 'v' + (S.versions.length + 1), effectiveFrom: from, meals, reason: 'Plan 1.6: horarios reales, pre-entreno + intra, recena opcional; meta ≈ 3.250' }]);
    }
    const params = { ...JSON.parse(JSON.stringify(S.settings.params)), firstStepCap: 200 };
    list.push(['SETTINGS', { params }], ['SETTINGS', { mig1546: true }]);
    await emitMany(list);
  }
  // 1.5.50: redondeo a 10 g y palancas acordadas con el usuario (hoy y versiones futuras); escalón máx. 300
  if (!S.settings.mig1550) {
    const set = { mozza: { qty: 30, role: 'nego', min: 20, max: 40, step: 10 }, arroz: { step: 10 }, pasta: { qty: 110, step: 10 }, avena: { qty: 80, step: 10 },
      tomate: { qty: 100 }, dextrosa: { role: 'carb', min: 30, max: 50, step: 10 } };
    const list = [], dates = [T, ...S.versions.filter(v => v.effectiveFrom > T).map(v => v.effectiveFrom)];
    for (const d of dates) { const meals = JSON.parse(JSON.stringify(E.versionAt(S, d).meals)); let ch = false;
      for (const m of meals) for (const it of m.items) { const s = set[it.foodId];
        if (s && it.qty > 0 && (it.foodId !== 'mozza' || m.id === 'desayuno') && Object.keys(s).some(k => it[k] !== s[k])) { Object.assign(it, s); ch = true; } }
      if (ch) list.push(['VERSION', { id: 'v' + (S.versions.length + list.length + 1), effectiveFrom: d, meals, reason: 'Redondeo a 10 g: pasta 110, avena 80, tomate 100, mozzarella 30 (palanca 20–40)' }]); }
    const params = { ...JSON.parse(JSON.stringify(S.settings.params)), stepCapHyst: 300 };
    list.push(['SETTINGS', { params }], ['SETTINGS', { mig1550: true }]);
    await emitMany(list);
  }
  // 1.6.4: aceite de oliva por defecto 3 g en toda comida que lo lleve (pedido del usuario el 20-10, "de ahora en más": hoy y versiones futuras)
  if (!S.settings.mig1551) {
    const list = [], dates = [...new Set([T, ...S.versions.filter(v => v.effectiveFrom > T).map(v => v.effectiveFrom)])];
    for (const d of dates) { const meals = JSON.parse(JSON.stringify(E.versionAt(S, d).meals)); let ch = false;
      for (const m of meals) for (const it of m.items) if (it.foodId === 'aceite' && it.qty > 0 && it.qty !== 3) { it.qty = 3; ch = true; }
      if (ch) list.push(['VERSION', { id: 'v' + (S.versions.length + list.length + 1), effectiveFrom: d, meals, reason: 'Aceite de oliva por defecto: 3 g por comida' }]); }
    list.push(['SETTINGS', { mig1551: true }]);
    await emitMany(list);
  }
  // 1.5.49: opciones de proteína y carbo en almuerzo y cena (hoy y versiones futuras)
  if (!S.settings.mig1549) {
    const P = ['pollo', 'carne', 'salmon', 'salmonrosado', 'merluza', 'atun', 'atunlata', 'burger', 'polloasado'].filter(f => S.foods[f]);
    const Cc = ['arroz', 'pasta', 'fusilli', 'papaasada'].filter(f => S.foods[f]);
    const patch = v => { const meals = JSON.parse(JSON.stringify(v.meals)); let ch = false;
      for (const m of meals) if (m.id === 'almuerzo' || m.id === 'cena') for (const it of m.items) {
        if (P.includes(it.foodId) && it.unit === 'g' && it.qty > 0) { it.choices = [it.foodId, ...P.filter(f => f !== it.foodId)]; ch = true; }
        if (Cc.includes(it.foodId) && it.role === 'carb') { it.choices = [it.foodId, ...Cc.filter(f => f !== it.foodId)]; ch = true; } }
      return ch ? meals : null; };
    const list = [], dates = [T, ...S.versions.filter(v => v.effectiveFrom > T).map(v => v.effectiveFrom)];
    for (const d of dates) { const m = patch(E.versionAt(S, d)); if (m) list.push(['VERSION', { id: 'v' + (S.versions.length + list.length + 1), effectiveFrom: d, meals: m, reason: 'Opciones de proteína y carbo en almuerzo y cena' }]); }
    list.push(['SETTINGS', { mig1549: true }]);
    await emitMany(list);
  }
  // 1.5.47: el usuario pidió que el plan 1.6 rija desde HOY (19-10)
  if (!S.settings.mig1547) {
    const list = [], nx = E.versionAt(S, E.addDays(T, 1));
    if (!E.versionAt(S, T).meals.some(m => m.id === 'pre') && nx.meals.some(m => m.id === 'pre'))
      list.push(['VERSION', { id: 'v' + (S.versions.length + 1), effectiveFrom: T, meals: JSON.parse(JSON.stringify(nx.meals)), reason: 'Plan 1.6 desde hoy' }]);
    list.push(['SETTINGS', { mig1547: true }]);
    await emitMany(list);
  }

}
async function boot() {
  idb = await openDB();
  EVENTS = (await loadEvents()).sort((a, b) => a.seq - b.seq);
  S = E.replay(EVENTS);
  if (!S.settings) await emit('INIT', { settings: E.DEFAULT_SETTINGS, foods: E.DEFAULT_FOODS, meals: E.DEFAULT_MEALS });
  await migrate();
  try { if (navigator.storage?.persist) await navigator.storage.persist(); } catch {}
  render();
  checkUpdate();
}
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S) { checkUpdate(); if (UI.day > todayStr()) UI.day = todayStr(); render(); } });
showUpdateResult();
boot();
