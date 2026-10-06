/* Enterprise HR · app web · Fase 1 (base, Personal, Pase de lista, Asistencia, Usuarios, Catálogos, Bitácora)
   Los permisos reales están en la base de datos (RLS). Aquí solo se decide qué botones mostrar. */
'use strict';
const CFG = window.HR_CONFIG || {};
const APP_VERSION = '0.3.0';
const TZ = 'America/Mexico_City';

// ───────────────────────── utilidades ─────────────────────────
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const todayMX = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
const addDays = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const fmtDate = (iso) => { if (!iso) return '—'; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const fmtTime = (ts) => ts ? new Intl.DateTimeFormat('es-MX', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts)) : '';
const fmtDateTime = (ts) => ts ? new Intl.DateTimeFormat('es-MX', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts)) : '—';
const dayLabel = (iso) => new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', weekday: 'short', day: '2-digit', month: 'short' }).format(new Date(iso + 'T12:00:00Z'));
const money = (n) => n == null || n === '' ? '—' : Number(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
const fullName = (e) => e ? [e.nombre, e.apellido_paterno, e.apellido_materno].filter(Boolean).join(' ') : '—';
const sortName = (a, b) => (a.apellido_paterno + ' ' + a.nombre).localeCompare(b.apellido_paterno + ' ' + b.nombre, 'es');
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sin almacenamiento */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } }
};

const ROLES = {
  developer: 'Administrador', director: 'Dirección RH (consulta)', nomina: 'Nómina', rh_general: 'RH General',
  rh_area: 'RH de área', supervisor: 'Supervisor', tl: 'Team Leader'
};
const STATUS = { alta_pendiente: ['Alta pendiente', 'b-warn'], activo: ['Activo', 'b-ok'], baja: ['Baja', 'b-mut'], rechazado: ['Rechazado', 'b-bad'] };
const ATT = { asistio: 'Asistencia', falta: 'Falta', retardo: 'Retardo', baja: 'Baja', nuevo_ingreso: 'Nuevo ingreso', permiso: 'Permiso', descanso: 'Descanso', inactividad: 'Inactividad' };
const ATT_SHORT = { asistio: 'A', falta: 'F', retardo: 'R', baja: 'B', nuevo_ingreso: 'N', permiso: 'P', descanso: 'D', inactividad: 'I' };
const ATT_COLOR = { asistio: 'var(--ok)', falta: 'var(--bad)', retardo: 'var(--warn)', baja: 'var(--ink)', nuevo_ingreso: 'var(--accent)', permiso: '#4453A8', descanso: '#6B7785', inactividad: '#B23A0A' };
const ATT_BADGE = { asistio: 'b-ok', falta: 'b-bad', retardo: 'b-warn', baja: 'b-mut', nuevo_ingreso: 'b-acc', permiso: 'b-acc', descanso: 'b-mut', inactividad: 'b-warn' };
const ATT_MAIN = ['asistio', 'falta', 'retardo'];
const ATT_MOVE = ['baja', 'nuevo_ingreso'];
const ATT_OTHER = ['permiso', 'descanso', 'inactividad'];
const ATT_NEEDS_COMMENT = ['baja', 'nuevo_ingreso', 'permiso', 'descanso', 'inactividad'];
const attCounts = () => Object.fromEntries(Object.keys(ATT).map((k) => [k, 0]));
const SOLICITUD_LIDER = { acta: 'Acta administrativa', carta: 'Carta de advertencia', cambio_equipo: 'Cambio de equipo', baja: 'Baja' };
const RIESGO = { fraude: 'Fraude', intento_fraude: 'Intento de fraude', faltas_injustificadas: 'Faltas injustificadas', abandono: 'Baja (abandono de trabajo)' };

// ───────────────────────── estado ─────────────────────────
const S = { session: null, me: null, areas: [], groups: [], profiles: [], myAreas: [], blocks: [] };
const role = () => S.me && S.me.role;
const is = (...r) => r.includes(role());
const areaName = (id) => (S.areas.find((a) => a.id === id) || {}).name || '—';
const groupName = (id) => (S.groups.find((g) => g.id === id) || {}).name || 'Sin grupo';
const profName = (id) => (S.profiles.find((p) => p.id === id) || {}).full_name || '—';
const seesAllAreas = () => is('developer', 'director', 'nomina');
const visibleAreas = () => S.areas.filter((a) => a.active && (seesAllAreas() || S.myAreas.includes(a.id) || (is('tl') && myGroups().some((g) => g.area_id === a.id))));
const myGroups = () => S.groups.filter((g) => g.tl_id === S.me.id && g.active);
const canWriteAttendance = () => is('developer', 'nomina', 'rh_general', 'rh_area', 'supervisor', 'tl');
const writableGroups = () => is('tl') ? myGroups() : (is('developer', 'nomina') ? S.groups.filter((g) => g.active) : S.groups.filter((g) => g.active && S.myAreas.includes(g.area_id)));
const canSeePrivate = (emp) => is('developer', 'director', 'rh_general', 'rh_area') || (is('nomina') && emp.status === 'activo');

// ───────────────────────── red / sesión ─────────────────────────
function friendly(msg) {
  if (/row-level security/i.test(msg)) return 'No tienes permiso para hacer esto.';
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
  if (/num_empleado/.test(msg) && /duplicate/i.test(msg)) return 'Ese número de empleado ya existe.';
  if (/duplicate key/i.test(msg)) return 'Ese registro ya existe.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Sin conexión. Revisa tu internet e intenta de nuevo.';
  return msg;
}
async function http(path, { method = 'GET', body, headers = {}, auth = true } = {}) {
  const h = { apikey: CFG.key, 'Content-Type': 'application/json', ...headers };
  if (auth) { await ensureFresh(); if (S.session) h.Authorization = 'Bearer ' + S.session.access_token; }
  let res;
  try { res = await fetch(CFG.url + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch (e) { throw new Error(friendly(String(e.message || e))); }
  const txt = await res.text();
  let data = null; try { data = txt ? JSON.parse(txt) : null; } catch { data = txt; }
  if (!res.ok) {
    const msg = (data && (data.message || data.msg || data.error_description || data.error)) || ('Error ' + res.status);
    if (res.status === 401 && auth) { setSession(null); setTimeout(boot, 0); }
    const e = new Error(friendly(String(msg))); e.status = res.status; e.code = data && data.code; throw e;
  }
  return data;
}
function setSession(d) {
  if (!d) { S.session = null; store.del('hr.session'); return; }
  S.session = { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600), user: d.user };
  store.set('hr.session', S.session);
}
let refreshing = null;
async function ensureFresh() {
  const s = S.session; if (!s) return;
  if (Date.now() / 1000 < s.expires_at - 60) return;
  if (!refreshing) {
    refreshing = (async () => {
      try { setSession(await http('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: s.refresh_token }, auth: false })); }
      catch (e) { setSession(null); throw new Error('Tu sesión expiró. Vuelve a entrar.'); }
      finally { refreshing = null; }
    })();
  }
  return refreshing;
}

// Consultas al estilo PostgREST
class Q {
  constructor(t) { this.t = t; this.f = []; this.sel = '*'; this.ord = []; this.lim = null; }
  select(s) { this.sel = s; return this; }
  eq(c, v) { this.f.push([c, 'eq.' + v]); return this; }
  neq(c, v) { this.f.push([c, 'neq.' + v]); return this; }
  gte(c, v) { this.f.push([c, 'gte.' + v]); return this; }
  lte(c, v) { this.f.push([c, 'lte.' + v]); return this; }
  lt(c, v) { this.f.push([c, 'lt.' + v]); return this; }
  is(c, v) { this.f.push([c, 'is.' + v]); return this; }
  in(c, arr) { this.f.push([c, 'in.(' + arr.map((v) => '"' + String(v).replace(/"/g, '\\"') + '"').join(',') + ')']); return this; }
  order(c, asc = true) { this.ord.push(c + '.' + (asc ? 'asc' : 'desc')); return this; }
  limit(n) { this.lim = n; return this; }
  qs() {
    const u = new URLSearchParams(); u.set('select', this.sel);
    for (const [c, v] of this.f) u.append(c, v);
    if (this.ord.length) u.set('order', this.ord.join(','));
    if (this.lim) u.set('limit', String(this.lim));
    return u.toString();
  }
  get() { return http(`/rest/v1/${this.t}?${this.qs()}`); }
  insert(rows, { onConflict } = {}) {
    let path = `/rest/v1/${this.t}?select=${encodeURIComponent(this.sel)}`;
    const headers = { Prefer: 'return=representation' };
    if (onConflict) { path += `&on_conflict=${onConflict}`; headers.Prefer = 'resolution=merge-duplicates,return=representation'; }
    return http(path, { method: 'POST', body: rows, headers });
  }
  update(patch) { return http(`/rest/v1/${this.t}?${this.qs()}`, { method: 'PATCH', body: patch, headers: { Prefer: 'return=representation' } }); }
  remove() { return http(`/rest/v1/${this.t}?${this.qs()}`, { method: 'DELETE', headers: { Prefer: 'return=representation' } }); }
}
const db = (t) => new Q(t);
const rpc = (fn, args) => http(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args || {} });
async function mustUpdate(promise, what = 'el registro') {
  const rows = await promise;
  if (!rows || !rows.length) throw new Error(`No se pudo actualizar ${what}: no tienes permiso o ya no existe.`);
  return rows;
}

// ───────────────────────── UI base ─────────────────────────
function toast(msg, err = false) {
  $$('.toast').forEach((x) => x.remove());
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; t.setAttribute('role', 'status');
  document.body.appendChild(t); setTimeout(() => t.remove(), err ? 5200 : 2800);
}
function modal({ title, body, actions = [], wide = false, onClose }) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" style="${wide ? 'max-width:860px' : ''}">
    <header><h2>${esc(title)}</h2><button class="x" aria-label="Cerrar">×</button></header>
    <div class="mb"></div><footer></footer></div>`;
  const mb = $('.mb', bg); if (typeof body === 'string') mb.innerHTML = body; else if (body) mb.appendChild(body);
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  $('.x', bg).onclick = close;
  bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(); });
  const ft = $('footer', bg);
  if (!actions.length) ft.remove();
  for (const a of actions) {
    const b = document.createElement('button'); b.className = 'btn ' + (a.cls || ''); b.textContent = a.label; b.type = 'button';
    b.onclick = async () => {
      if (!a.run) return close();
      b.disabled = true;
      try { const r = await a.run({ close, el: bg, btn: b }); if (r !== false) close(); }
      catch (e) { showErr(bg, e); }
      finally { b.disabled = false; }
    };
    ft.appendChild(b);
  }
  document.body.appendChild(bg);
  const first = $('input,select,textarea', mb); if (first && matchMedia('(pointer: fine)').matches) first.focus();
  return { el: bg, close, mb };
}
function showErr(scope, e) {
  let box = $('.form-err', scope);
  if (!box) { box = document.createElement('div'); box.className = 'notice n-bad form-err'; $('.mb', scope).prepend(box); }
  box.textContent = e.message || String(e); box.scrollIntoView({ block: 'nearest' });
}
function confirmBox(title, html, { okLabel = 'Confirmar', danger = false } = {}) {
  return new Promise((resolve) => {
    let done = false;
    modal({
      title, body: `<div>${html}</div>`, onClose: () => { if (!done) resolve(false); },
      actions: [{ label: 'Cancelar' }, { label: okLabel, cls: danger ? 'danger solid' : 'primary', run: () => { done = true; resolve(true); } }]
    });
  });
}
// Campos de formulario: [{k,label,type,options,req,val,full,hint}]
function fieldsHtml(fields) {
  return `<div class="grid2">${fields.map((f) => {
    const id = 'f_' + f.k; const v = f.val ?? '';
    const req = f.req ? ' required' : '';
    let ctl;
    if (f.type === 'select') ctl = `<select id="${id}" name="${f.k}"${req}>${(f.options || []).map((o) => `<option value="${esc(o[0])}"${String(o[0]) === String(v) ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select>`;
    else if (f.type === 'textarea') ctl = `<textarea id="${id}" name="${f.k}"${req}>${esc(v)}</textarea>`;
    else ctl = `<input id="${id}" name="${f.k}" type="${f.type || 'text'}" value="${esc(v)}"${req}${f.type === 'number' ? ' step="0.01" inputmode="decimal"' : ''}${f.max ? ` max="${f.max}"` : ''}${f.upper ? ' style="text-transform:uppercase"' : ''} autocomplete="${f.ac || 'off'}">`;
    return `<label class="field" style="${f.full ? 'grid-column:1/-1' : ''}">${esc(f.label)}${f.req ? ' *' : ''}${ctl}${f.hint ? `<span class="small muted" style="font-weight:400">${esc(f.hint)}</span>` : ''}</label>`;
  }).join('')}</div>`;
}
function readFields(scope, fields) {
  const out = {};
  for (const f of fields) {
    const el = $('#f_' + f.k, scope); if (!el) continue;
    let v = el.value.trim();
    if (f.upper) v = v.toUpperCase();
    if (f.req && !v) throw new Error(`Falta: ${f.label}`);
    out[f.k] = v === '' ? null : (f.type === 'number' ? Number(v) : v);
  }
  return out;
}
const statusBadge = (s) => `<span class="badge ${STATUS[s][1]}">${STATUS[s][0]}</span>`;
function faltasBadge(n) {
  if (!n || n < 3) return '';
  return n > 3 ? `<span class="badge b-bad" title="Más de 3 faltas en 30 días">${n} faltas / 30 días</span>` : `<span class="badge b-warn" title="Una falta más supera el límite">3 faltas / 30 días</span>`;
}

// ───────────────────────── arranque ─────────────────────────
async function boot() {
  if (!CFG.url || !CFG.key) { $('#app').innerHTML = `<div class="login"><div class="card"><b>Falta configurar</b><span class="muted">Edita config.js con la URL y la clave pública del proyecto.</span></div></div>`; return; }
  S.session = store.get('hr.session');
  if (!S.session) return renderLogin();
  try {
    await ensureFresh();
    const uid = S.session.user.id;
    const [me] = await db('profiles').eq('id', uid).get();
    S.me = me || null;
    if (!S.me || !S.me.role || !S.me.active) return renderNoRole();
    await loadCatalogs();
    renderShell();
    route();
  } catch (e) {
    if (!S.session) return renderLogin(e.message);
    $('#app').innerHTML = `<div class="login"><div class="card"><b>No se pudo cargar</b><span class="muted">${esc(e.message)}</span><button class="btn primary" onclick="location.reload()">Reintentar</button><button class="btn" id="lo">Cerrar sesión</button></div></div>`;
    $('#lo').onclick = logout;
  }
}
async function loadCatalogs() {
  const [areas, groups, profiles, ua, blocks, metricsRows] = await Promise.all([
    db('areas').order('name').get(),
    db('groups').order('name').get(),
    db('profiles').select('id,full_name,email,role,active').order('full_name').get(),
    db('user_areas').eq('user_id', S.me.id).get(),
    db('area_transfer_blocks').get(),
    db('area_metrics').order('sort').get()
  ]);
  Object.assign(S, { areas, groups, profiles, myAreas: ua.map((x) => x.area_id), blocks, metrics: metricsRows });
}
function renderLogin(err) {
  $('#app').innerHTML = `<form class="login" id="lf"><div class="card">
    <div class="logo">HR</div>
    <div><h1>Enterprise HR</h1><div class="muted">Entra con tu correo de trabajo</div></div>
    ${err ? `<div class="notice n-bad">${esc(err)}</div>` : ''}
    <label class="field">Correo<input name="email" type="email" required autocomplete="username" inputmode="email"></label>
    <label class="field">Contraseña<input name="password" type="password" required autocomplete="current-password"></label>
    <button class="btn primary" type="submit">Entrar</button>
    <button class="btn sm" type="button" id="forgot" style="border:0;color:var(--accent)">Olvidé mi contraseña</button>
    <div class="small muted">v${APP_VERSION}</div>
    ${CFG.demo ? `<div class="notice n-warn"><b>Demo con datos ficticios.</b> Lo que hagas se guarda solo en este navegador. Elige con quién entrar:</div>
      <div class="list" id="demoUsers">${window.HR_DEMO.users.map((u) => `<button type="button" class="item" data-em="${esc(u.email)}"><span class="grow"><span class="nm">${esc(u.name)}</span><br><span class="small muted">${esc(ROLES[u.role])}</span></span>›</button>`).join('')}</div>` : ''}
    </div></form>`;
  $('#lf').onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target); const btn = $('button[type=submit]', ev.target); btn.disabled = true;
    try {
      const d = await http('/auth/v1/token?grant_type=password', { method: 'POST', auth: false, body: { email: fd.get('email').trim(), password: fd.get('password') } });
      setSession(d); await boot();
    } catch (e) { renderLogin(e.message); }
  };
  $$('#demoUsers [data-em]').forEach((bt) => bt.onclick = () => { $('input[name=email]').value = bt.dataset.em; $('input[name=password]').value = window.HR_DEMO.password; $('#lf').requestSubmit(); });
  $('#forgot').onclick = () => modal({ title: 'Recuperar contraseña', body: '<p style="margin:0">Pídele a Daniel que te asigne una contraseña nueva desde Usuarios.</p>', actions: [{ label: 'Entendido', cls: 'primary' }] });
}
function renderNoRole() {
  $('#app').innerHTML = `<div class="login"><div class="card"><div class="logo">HR</div><b>${esc(S.me ? S.me.full_name : 'Tu usuario')}</b>
    <span class="muted">${S.me && !S.me.active ? 'Tu usuario está desactivado.' : 'Tu usuario aún no tiene un rol asignado.'} Pide a Daniel que te dé acceso.</span>
    <button class="btn" id="lo">Cerrar sesión</button></div></div>`;
  $('#lo').onclick = logout;
}
async function logout() {
  try { if (S.session) await http('/auth/v1/logout', { method: 'POST' }); } catch { /* se cierra igual */ }
  setSession(null); S.me = null; location.hash = ''; renderLogin();
}

// ───────────────────────── shell y rutas ─────────────────────────
const VIEWS = {
  lista: { label: 'Pase de lista', ic: '✓', roles: ['developer', 'nomina', 'rh_general', 'rh_area', 'supervisor', 'tl'], render: () => viewLista() },
  personal: { label: 'Personal', ic: '👥', roles: ['developer', 'director', 'nomina', 'rh_general', 'rh_area', 'supervisor', 'tl'], render: () => viewPersonal() },
  casos: { label: 'Casos', ic: '⚑', roles: ['developer', 'director', 'rh_general', 'rh_area', 'supervisor', 'tl'], render: () => viewCasos() },
  asistencia: { label: 'Asistencia', ic: '▦', roles: ['developer', 'director', 'nomina', 'rh_general', 'rh_area', 'supervisor'], render: () => viewAsistencia() },
  usuarios: { label: 'Usuarios', ic: '🔑', roles: ['developer'], render: () => viewUsuarios() },
  catalogos: { label: 'Áreas y grupos', ic: '⌂', roles: ['developer'], render: () => viewCatalogos() },
  bitacora: { label: 'Bitácora', ic: '🕘', roles: ['developer', 'director'], render: () => viewBitacora() }
};
const myViews = () => Object.entries(VIEWS).filter(([, v]) => v.roles.includes(role()));
function renderShell() {
  const nav = myViews().map(([k, v]) => `<a href="#/${k}" data-v="${k}"><span aria-hidden="true">${v.ic}</span>${esc(v.label)}</a>`).join('');
  const tabs = myViews().map(([k, v]) => `<a href="#/${k}" data-v="${k}"><span class="ic" aria-hidden="true">${v.ic}</span>${esc(v.label)}</a>`).join('');
  $('#app').innerHTML = `
    <aside class="side"><div class="brand">Enterprise HR<small>v${APP_VERSION}</small></div><nav class="nav">${nav}</nav>
      <div class="me"><b>${esc(S.me.full_name)}</b><span class="muted" style="color:#A9B6C2">${esc(ROLES[role()])}</span>
      <div class="row" style="margin-top:10px"><button class="btn sm" id="pw" style="background:none;color:#fff;border-color:#3A4B5A">Contraseña</button><button class="btn sm" id="lo" style="background:none;color:#fff;border-color:#3A4B5A">Salir</button></div></div></aside>
    <div class="main"><div class="top"><span class="t" id="ttl">Enterprise HR</span><button class="btn sm" id="menu" style="background:var(--ink2);color:#fff;border-color:#3A4B5A" aria-label="Mi cuenta">${esc(S.me.full_name.split(' ')[0])} ▾</button></div>
      ${CFG.demo ? `<div class="notice n-warn" style="border-radius:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 12px"><span class="grow"><b>Demo</b> · como <b>${esc(S.me.full_name)}</b></span><button class="btn sm" id="demoSwitch">Cambiar usuario</button><button class="btn sm" id="demoReset">Reiniciar</button></div>` : ''}
      <div class="content" id="view"></div></div>
    <nav class="tabbar">${tabs}</nav>`;
  $('#lo').onclick = logout;
  $('#pw').onclick = changePassword;
  if (CFG.demo) {
    $('#demoSwitch').onclick = logout;
    $('#demoReset').onclick = async () => { if (await confirmBox('Reiniciar demo', 'Se borran tus cambios y vuelven los datos de ejemplo.', { okLabel: 'Reiniciar' })) { window.HR_DEMO.reset(); S.me = null; location.hash = ''; renderLogin(); } };
  }
  $('#menu').onclick = () => modal({
    title: S.me.full_name, body: `<div class="kv"><span>Rol</span><span>${esc(ROLES[role()])}</span><span>Correo</span><span>${esc(S.me.email || '')}</span><span>Versión</span><span>${APP_VERSION}</span></div>`,
    actions: [{ label: 'Cambiar contraseña', run: () => { setTimeout(changePassword, 0); } }, { label: 'Cerrar sesión', cls: 'danger', run: () => { logout(); } }]
  });
}
function route() {
  const views = myViews(); if (!views.length) return renderNoRole();
  let k = (location.hash.match(/^#\/(\w+)/) || [])[1];
  if (!k || !VIEWS[k] || !VIEWS[k].roles.includes(role())) k = is('tl') ? 'lista' : 'personal';
  $$('[data-v]').forEach((a) => a.classList.toggle('on', a.dataset.v === k));
  const ttl = $('#ttl'); if (ttl) ttl.textContent = VIEWS[k].label;
  const v = $('#view'); v.innerHTML = '<div class="empty">Cargando…</div>';
  Promise.resolve(VIEWS[k].render()).catch((e) => { v.innerHTML = `<div class="notice n-bad">${esc(e.message)}</div>`; });
  if (k !== 'casos') refreshCaseBadge();
}
window.addEventListener('hashchange', () => { if (S.me) route(); });

function changePassword() {
  const fields = [{ k: 'p1', label: 'Contraseña nueva', type: 'password', req: true, ac: 'new-password', full: true, hint: 'Mínimo 8 caracteres' }, { k: 'p2', label: 'Repite la contraseña', type: 'password', req: true, ac: 'new-password', full: true }];
  modal({
    title: 'Cambiar contraseña', body: fieldsHtml(fields), actions: [{ label: 'Cancelar' }, {
      label: 'Guardar', cls: 'primary', run: async ({ el }) => {
        const v = readFields(el, fields);
        if (v.p1.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
        if (v.p1 !== v.p2) throw new Error('Las contraseñas no coinciden.');
        await http('/auth/v1/user', { method: 'PUT', body: { password: v.p1 } });
        toast('Contraseña actualizada');
      }
    }]
  });
}

// ───────────────────────── Pase de lista ─────────────────────────
const LS = { group: null, fecha: null, open: null };
async function viewLista() {
  const v = $('#view');
  const groups = writableGroups().sort((a, b) => (areaName(a.area_id) + a.name).localeCompare(areaName(b.area_id) + b.name, 'es'));
  if (!groups.length) { v.innerHTML = `<div class="card empty">${is('tl') ? 'Aún no tienes un grupo asignado. Pide a Daniel que te asigne uno.' : 'No hay grupos en tus áreas.'}</div>`; return; }
  if (!LS.group || !groups.some((g) => g.id === LS.group)) LS.group = (store.get('hr.lista.group') && groups.some((g) => g.id === store.get('hr.lista.group'))) ? store.get('hr.lista.group') : groups[0].id;
  if (!LS.fecha) LS.fecha = todayMX();
  const g = groups.find((x) => x.id === LS.group);
  const [emps, day] = await Promise.all([
    db('employees').select('id,nombre,apellido_paterno,apellido_materno,puesto,group_id,area_id,status').eq('group_id', g.id).eq('status', 'activo').get(),
    db('attendance_days').eq('group_id', g.id).eq('fecha', LS.fecha).get()
  ]);
  emps.sort(sortName);
  const ids = emps.map((e) => e.id);
  const [att, faltas] = ids.length ? await Promise.all([
    db('attendance').in('employee_id', ids).eq('fecha', LS.fecha).get(),
    db('faltas_30d').in('employee_id', ids).get()
  ]) : [[], []];
  const rec = Object.fromEntries(att.map((a) => [a.employee_id, a]));
  const fx = Object.fromEntries(faltas.map((f) => [f.employee_id, f.faltas]));
  const d = day[0] || {};
  const locked = !!d.reviewed_at && !is('developer', 'nomina');
  const metrics = metricsOf(g.area_id);
  const [acts, corrs] = ids.length ? await Promise.all([
    metrics.length ? db('activity_daily').in('employee_id', ids).eq('fecha', LS.fecha).get() : Promise.resolve([]),
    canCorrect() ? db('corrections').in('employee_id', ids).eq('fecha', LS.fecha).order('hora').get() : Promise.resolve([])
  ]) : [[], []];
  const act = Object.fromEntries(acts.map((a) => [a.employee_id, a]));
  const corr = {}; corrs.forEach((c) => { (corr[c.employee_id] = corr[c.employee_id] || []).push(c); });
  const S2 = { emps, rec, fx, d, locked, g, metrics, act, corr };
  renderLista(S2, groups);
}
function renderLista(st, groups) {
  const v = $('#view');
  const { emps, rec, fx, d, locked, g } = st;
  const done = emps.filter((e) => rec[e.id]).length, total = emps.length, pct = total ? Math.round(done * 100 / total) : 0;
  const multiArea = new Set(groups.map((x) => x.area_id)).size > 1;
  v.innerHTML = `
  <div class="att-head">
    <div class="row" style="justify-content:space-between">
      <div><div class="eyebrow" style="color:#A9B6C2">${esc(areaName(g.area_id))}${g.tl_id ? ' · TL ' + esc(profName(g.tl_id)) : ''}</div><div style="font-size:20px;font-weight:700">Pase de lista</div></div>
      <input type="date" id="lf_date" value="${LS.fecha}" max="${todayMX()}" aria-label="Fecha" class="mono">
    </div>
    ${groups.length > 1 ? `<select id="lf_group" aria-label="Grupo">${groups.map((x) => `<option value="${x.id}"${x.id === g.id ? ' selected' : ''}>${multiArea ? esc(areaName(x.area_id)) + ' · ' : ''}${esc(x.name)}${x.tl_id && !is('tl') ? ' — ' + esc(profName(x.tl_id)) : ''}</option>`).join('')}</select>` : `<div style="font-weight:600">${esc(g.name)}</div>`}
    <div class="row"><div class="prog"><i style="width:${pct}%"></i></div><span style="font-size:13px;font-weight:600">${done} de ${total}</span></div>
  </div>
  ${locked ? `<div class="notice n-warn" style="margin-bottom:10px">Nómina ya revisó este día (${fmtDateTime(d.reviewed_at)}). Para corregir, pídelo a Nómina.</div>` : ''}
  ${d.reviewed_at && !locked ? `<div class="notice n-info" style="margin-bottom:10px">Día revisado por ${esc(profName(d.reviewed_by))} · ${fmtDateTime(d.reviewed_at)}. Puedes corregir porque tienes rol de ${esc(ROLES[role()])}.</div>` : ''}
  ${total && !locked ? `<div class="row" style="margin-bottom:10px"><button class="btn ghost grow" id="allok"${done === total ? ' disabled' : ''}>Marcar pendientes como “Asistió”</button></div>` : ''}
  <div class="list" id="people">${total ? emps.map((e) => personCard(e, rec[e.id], fx[e.id], locked, st)).join('') : '<div class="card empty">No hay personal activo en este grupo.</div>'}</div>
  ${total ? `<div class="stickybar">
    <button class="btn primary" id="send" ${done < total || locked ? 'disabled' : ''} style="${d.sent_at && done === total ? 'background:var(--ok);border-color:var(--ok)' : ''}">${done < total ? `Faltan ${total - done} por registrar` : d.sent_at ? 'Reporte enviado ✓ · reenviar' : 'Enviar reporte del día'}</button>
    <span class="small muted" style="text-align:center">${d.sent_at ? `Enviado por ${esc(profName(d.sent_by))} a las ${fmtTime(d.sent_at)}. ` : ''}Cada cambio se guarda al momento y queda en la bitácora con fecha y hora.</span>
  </div>` : ''}`;
  const reload = () => viewLista().catch((e) => toast(e.message, true));
  $('#lf_date').onchange = (e) => { const val = e.target.value; if (!val || val > todayMX()) { e.target.value = LS.fecha; return toast('No se puede pasar lista a futuro', true); } LS.fecha = val; reload(); };
  if ($('#lf_group')) $('#lf_group').onchange = (e) => { LS.group = e.target.value; store.set('hr.lista.group', LS.group); LS.open = null; reload(); };
  if ($('#allok')) $('#allok').onclick = async (ev) => {
    const pend = emps.filter((e) => !rec[e.id]); if (!pend.length) return;
    ev.target.disabled = true;
    try {
      const rows = await db('attendance').insert(pend.map((e) => ({ employee_id: e.id, fecha: LS.fecha, status: 'asistio', incidencias: [] })), { onConflict: 'employee_id,fecha' });
      rows.forEach((r) => { rec[r.employee_id] = r; }); toast(`${rows.length} marcados como Asistió`); renderLista(st, groups);
    } catch (e) { toast(e.message, true); ev.target.disabled = false; }
  };
  if ($('#send')) $('#send').onclick = async (ev) => {
    ev.target.disabled = true;
    try { await rpc('send_day', { p_group: g.id, p_fecha: LS.fecha }); toast('Reporte enviado'); reload(); }
    catch (e) { toast(e.message, true); ev.target.disabled = false; }
  };
  $$('#people .person').forEach((card) => wirePerson(card, st, groups));
}
function personCard(e, r, faltas, locked, st) {
  const open = LS.open === e.id;
  const col = r ? ATT_COLOR[r.status] : null;
  const summary = r ? ATT[r.status] + (r.comentario ? ' · ' + r.comentario : '') : 'Sin registrar';
  const attBtn = (k) => `<button type="button" class="${k}${r && r.status === k ? ' on' : ''}" data-att="${k}"${locked ? ' disabled' : ''}>${ATT[k]}</button>`;
  return `<div class="person${open ? ' open' : ''}" data-id="${e.id}">
    <button type="button" class="ph" aria-expanded="${open}">
      <span class="dot" style="${col ? `background:${col};border-color:${col}` : ''}"></span>
      <span class="grow"><span style="display:block;font-weight:600">${esc(fullName(e))}</span><span class="small muted">${esc(summary.length > 90 ? summary.slice(0, 90) + '…' : summary)}</span></span>
      ${faltasBadge(faltas)}<span class="muted" aria-hidden="true">${open ? '▴' : '▾'}</span>
    </button>
    ${open ? `<div class="body">
      <div class="att3">${ATT_MAIN.map(attBtn).join('')}</div>
      <div class="att-sec"><div class="att2">${ATT_MOVE.map(attBtn).join('')}</div><div class="att3">${ATT_OTHER.map(attBtn).join('')}</div></div>
      <label class="field">Comentarios${r && ATT_NEEDS_COMMENT.includes(r.status) ? ' *' : ''}<textarea data-com rows="2" placeholder="Obligatorio en Baja, Nuevo ingreso, Permiso, Descanso e Inactividad"${!r || locked ? ' disabled' : ''}>${esc(r && r.comentario || '')}</textarea></label>
      ${r ? `<div class="small muted">Último cambio: ${esc(profName(r.updated_by))} · ${fmtDateTime(r.updated_at)}</div>` : ''}
      ${opsHtml(e, st)}
      ${canReportCase() ? `<div><div class="eyebrow" style="margin-bottom:6px">Solicitud de incidencias</div><div class="chips">${Object.entries(SOLICITUD_LIDER).map(([k, l]) => `<button type="button" class="chip" data-req="${k}">${esc(l)}</button>`).join('')}</div></div>
      <div><div class="eyebrow" style="margin-bottom:6px;color:var(--bad)">Incidencias de riesgo · directo a RH</div><div class="chips">${Object.entries(RIESGO).map(([k, l]) => `<button type="button" class="chip risk" data-req="${k}">${esc(l)}</button>`).join('')}</div></div>` : ''}
    </div>` : ''}
  </div>`;
}
function wirePerson(card, st, groups) {
  const id = card.dataset.id; const { rec } = st;
  const emp = st.emps.find((x) => x.id === id);
  $('.ph', card).onclick = () => { LS.open = LS.open === id ? null : id; renderLista(st, groups); };
  const save = async (patch) => {
    const cur = rec[id];
    const row = { employee_id: id, fecha: LS.fecha, status: patch.status || cur.status, incidencias: cur ? cur.incidencias : [], comentario: 'comentario' in patch ? patch.comentario : (cur ? cur.comentario : null) };
    const [saved] = await db('attendance').insert([row], { onConflict: 'employee_id,fecha' });
    rec[id] = saved;
  };
  $$('[data-att]', card).forEach((b) => b.onclick = async () => {
    const k = b.dataset.att; const cur = rec[id];
    if (ATT_NEEDS_COMMENT.includes(k)) {
      const f = [{ k: 'comentario', label: 'Comentarios', type: 'textarea', req: true, full: true, val: cur && cur.comentario || '', hint: k === 'baja' ? 'Marcar Baja aquí no da de baja a la persona: avisa a RH. Para pedir la baja formal usa “Solicitud de incidencias”.' : 'Explica el motivo; es obligatorio.' }];
      modal({ title: `${ATT[k]} · ${fullName(emp)}`, body: fieldsHtml(f), actions: [{ label: 'Cancelar' }, { label: 'Guardar', cls: 'primary', run: async ({ el }) => {
        const v = readFields(el, f); await save({ status: k, comentario: v.comentario }); toast('Guardado'); renderLista(st, groups);
      } }] });
      return;
    }
    $$('[data-att]', card).forEach((x) => { x.disabled = true; });
    try { await save({ status: k }); renderLista(st, groups); }
    catch (e) { toast(e.message, true); renderLista(st, groups); }
  });
  const ta = $('[data-com]', card);
  if (ta) ta.onchange = async () => {
    try { await save({ comentario: ta.value.trim() || null }); toast('Comentario guardado'); }
    catch (e) { toast(e.message, true); ta.value = (rec[id] && rec[id].comentario) || ''; }
  };
  $$('[data-req]', card).forEach((b) => b.onclick = () => requestForm({ employee: emp, tipo: b.dataset.req, fecha: LS.fecha, onDone: () => toast(RIESGO[b.dataset.req] ? 'Incidencia de riesgo enviada a RH' : 'Solicitud enviada a Supervisión') }));
  wireOps(card, st, groups);
}

// ───────────────────────── Personal ─────────────────────────
const PS = { q: '', area: '', group: '', status: 'activo' };
let EMP_CACHE = [];
async function viewPersonal() {
  const v = $('#view');
  const [emps, faltas] = await Promise.all([
    db('employees').select('id,num_empleado,nombre,apellido_paterno,apellido_materno,puesto,area_id,group_id,status,fecha_ingreso,fecha_baja,requested_by,requested_at').get(),
    db('faltas_30d').get()
  ]);
  emps.sort(sortName); EMP_CACHE = emps;
  const fx = Object.fromEntries(faltas.map((f) => [f.employee_id, f.faltas]));
  const counts = { activo: 0, alta_pendiente: 0, baja: 0, rechazado: 0 };
  emps.forEach((e) => { counts[e.status]++; });
  const areas = visibleAreas();
  const canRequest = is('developer', 'rh_general', 'rh_area');
  const statusOpts = [['activo', 'Activos'], ['alta_pendiente', 'Altas pendientes'], ['baja', 'Bajas'], ['', 'Todos']].filter(([k]) => !k || counts[k] || k === 'activo' || PS.status === k);
  v.innerHTML = `
  <div class="pagehead"><div><h1>Personal</h1><div class="muted small">${counts.activo} activos${counts.alta_pendiente ? ` · <b style="color:var(--warn)">${counts.alta_pendiente} altas pendientes</b>` : ''}</div></div>
    ${canRequest ? `<button class="btn primary" id="newEmp">${is('developer') ? '+ Nuevo ingreso' : '+ Solicitar alta'}</button>` : ''}</div>
  <div class="card pad" style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">
    <input class="inp" id="pq" type="search" placeholder="Buscar por nombre, número o puesto" value="${esc(PS.q)}" aria-label="Buscar">
    <div class="row">
      <div class="seg" role="group" aria-label="Estatus">${statusOpts.map(([k, l]) => `<button type="button" data-st="${k}" class="${PS.status === k ? 'on' : ''}">${l}${k && counts[k] ? ` (${counts[k]})` : ''}</button>`).join('')}</div>
      ${areas.length > 1 ? `<select class="inp" id="pa" aria-label="Área"><option value="">Todas las áreas</option>${areas.map((a) => `<option value="${a.id}"${PS.area === a.id ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select>` : ''}
      <select class="inp" id="pg" aria-label="Grupo"><option value="">Todos los grupos</option><option value="none"${PS.group === 'none' ? ' selected' : ''}>Sin grupo</option>${S.groups.filter((g) => !PS.area || g.area_id === PS.area).filter((g) => seesAllAreas() || S.myAreas.includes(g.area_id) || g.tl_id === S.me.id).map((g) => `<option value="${g.id}"${PS.group === g.id ? ' selected' : ''}>${areas.length > 1 && !PS.area ? esc(areaName(g.area_id)) + ' · ' : ''}${esc(g.name)}</option>`).join('')}</select>
    </div>
  </div>
  <div class="list" id="plist"></div>`;
  const draw = () => {
    const q = norm(PS.q);
    const rows = emps.filter((e) => (!PS.status || e.status === PS.status) && (!PS.area || e.area_id === PS.area)
      && (!PS.group || (PS.group === 'none' ? !e.group_id : e.group_id === PS.group))
      && (!q || norm(fullName(e) + ' ' + (e.num_empleado || '') + ' ' + (e.puesto || '')).includes(q)));
    $('#plist').innerHTML = rows.length ? rows.slice(0, 400).map((e) => `<button type="button" class="item" data-id="${e.id}">
        <span class="grow"><span class="nm">${esc(fullName(e))}</span><br><span class="small muted">${e.num_empleado ? esc(e.num_empleado) + ' · ' : ''}${esc(e.puesto || 'Sin puesto')} · ${esc(areaName(e.area_id))} · ${esc(groupName(e.group_id))}</span></span>
        ${faltasBadge(fx[e.id])} ${PS.status !== e.status || !PS.status ? statusBadge(e.status) : (e.status === 'alta_pendiente' ? statusBadge(e.status) : '')}</button>`).join('')
      + (rows.length > 400 ? `<div class="muted small">Mostrando 400 de ${rows.length}. Usa el buscador.</div>` : '')
      : '<div class="card empty">Sin resultados</div>';
    $$('#plist .item').forEach((b) => b.onclick = () => openEmployee(b.dataset.id, fx));
  };
  draw();
  $('#pq').oninput = (e) => { PS.q = e.target.value; draw(); };
  $$('[data-st]').forEach((b) => b.onclick = () => { PS.status = b.dataset.st; viewPersonal(); });
  if ($('#pa')) $('#pa').onchange = (e) => { PS.area = e.target.value; PS.group = ''; viewPersonal(); };
  $('#pg').onchange = (e) => { PS.group = e.target.value; draw(); };
  if ($('#newEmp')) $('#newEmp').onclick = () => altaForm();
}

const PRIV_FIELDS = [
  { k: 'curp', label: 'CURP', upper: true }, { k: 'rfc', label: 'RFC', upper: true }, { k: 'nss', label: 'NSS' },
  { k: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date' }, { k: 'telefono', label: 'Teléfono', type: 'tel' },
  { k: 'correo', label: 'Correo personal', type: 'email' }, { k: 'domicilio', label: 'Domicilio', full: true },
  { k: 'salario_diario', label: 'Salario diario', type: 'number' }, { k: 'salario_mensual', label: 'Salario mensual', type: 'number' }
];

async function openEmployee(id, fx = {}) {
  const [e] = await db('employees').eq('id', id).get();
  if (!e) return toast('No encontrado o sin permiso', true);
  const since = addDays(todayMX(), -29);
  const metrics = metricsOf(e.area_id);
  const seesCases = is('developer', 'director', 'rh_general', 'rh_area', 'supervisor');
  const [priv, att, acts, corrs, cases] = await Promise.all([
    canSeePrivate(e) ? db('employee_private').eq('employee_id', id).get() : Promise.resolve([]),
    db('attendance').eq('employee_id', id).gte('fecha', since).order('fecha', false).get(),
    metrics.length ? db('activity_daily').eq('employee_id', id).gte('fecha', since).get() : Promise.resolve([]),
    is('nomina') ? Promise.resolve([]) : db('corrections').eq('employee_id', id).gte('fecha', since).get(),
    seesCases ? db('cases').select('id,folio,status,fecha_hechos,decision,kind,hechos').eq('employee_id', id).order('created_at', false).get() : Promise.resolve([])
  ]);
  const p = priv[0] || null;
  const c = attCounts(); att.forEach((a) => c[a.status]++);
  const inMyArea = seesAllAreas() || S.myAreas.includes(e.area_id);
  const canMove = (is('developer') || (is('rh_general', 'rh_area', 'supervisor') && inMyArea)) && ['activo', 'alta_pendiente'].includes(e.status);
  const canEdit = is('developer') || (is('rh_general', 'rh_area') && inMyArea && e.status === 'alta_pendiente');
  const canEditPriv = is('developer') || (is('rh_general', 'rh_area') && inMyArea);
  const body = `
    <div class="row">${statusBadge(e.status)} ${faltasBadge(c.falta)}</div>
    <div class="kv">
      <span>No. empleado</span><span>${esc(e.num_empleado || '—')}</span>
      <span>Puesto</span><span>${esc(e.puesto || '—')}</span>
      <span>Área</span><span>${esc(areaName(e.area_id))}</span>
      <span>Grupo</span><span>${esc(groupName(e.group_id))}${e.group_id && (S.groups.find((g) => g.id === e.group_id) || {}).tl_id ? ' · TL ' + esc(profName(S.groups.find((g) => g.id === e.group_id).tl_id)) : ''}</span>
      <span>Ingreso</span><span>${fmtDate(e.fecha_ingreso)}</span>
      ${e.fecha_baja ? `<span>Baja</span><span>${fmtDate(e.fecha_baja)}</span>` : ''}
      <span>Solicitó alta</span><span>${esc(profName(e.requested_by))} · ${fmtDateTime(e.requested_at)}</span>
      ${e.approved_at ? `<span>Aprobó alta</span><span>${esc(profName(e.approved_by))} · ${fmtDateTime(e.approved_at)}</span>` : ''}
    </div>
    ${canSeePrivate(e) ? `<div class="card pad" style="background:var(--soft)"><div class="eyebrow" style="margin-bottom:8px">Datos sensibles · solo RH</div>${p ? `<div class="kv">
      ${PRIV_FIELDS.map((f) => `<span>${esc(f.label)}</span><span>${f.type === 'number' ? money(p[f.k]) : f.type === 'date' ? fmtDate(p[f.k]) : esc(p[f.k] || '—')}</span>`).join('')}
      ${e.status === 'baja' ? `<span>Motivo de baja</span><span>${esc(p.motivo_baja || '—')}</span><span>Recontratable</span><span>${p.recontratable === false ? '<b style="color:var(--bad)">No</b>' : p.recontratable ? 'Sí' : '—'}</span>` : ''}
    </div>` : '<span class="muted small">Sin datos capturados.</span>'}</div>` : ''}
    <div><div class="eyebrow" style="margin-bottom:6px">Asistencia · últimos 30 días</div>
      <div class="row small"><span class="badge b-ok">${c.asistio} asistencias</span><span class="badge b-bad">${c.falta} faltas</span><span class="badge b-warn">${c.retardo} retardos</span></div>
      ${att.length ? `<div class="scrollx" style="margin-top:8px"><table class="tbl"><tbody>${att.slice(0, 12).map((a) => `<tr><td class="mono">${fmtDate(a.fecha)}</td><td>${ATT[a.status]}</td><td class="small muted">${esc([...(a.incidencias || []), a.comentario].filter(Boolean).join(' · '))}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <
    ${metrics.length ? `<div><div class="eyebrow" style="margin-bottom:6px">Métricas · últimos 30 días (${acts.length} días capturados)</div>${acts.length ? `<div class="scrollx"><table class="tbl"><thead><tr><th>Métrica</th><th>Promedio diario</th><th>Meta</th><th>Días bajo meta</th></tr></thead><tbody>${metrics.map((m) => { const xs = acts.map((x) => (x.valores || {})[m.key]).filter((x) => x != null); const avg = xs.length ? Math.round(xs.reduce((s2, x) => s2 + x, 0) / xs.length) : null; const under = xs.filter((x) => x < Number(m.daily_goal)).length; return `<tr><td>${esc(m.label)}</td><td class="mono" style="color:${avg == null ? 'inherit' : avg >= Number(m.daily_goal) ? 'var(--ok)' : 'var(--bad)'}">${avg ?? '—'}</td><td class="mono">${Number(m.daily_goal)}</td><td class="mono">${under}</td></tr>`; }).join('')}</tbody></table></div>` : '<span class="small muted">Sin actividad capturada.</span>'}</div>` : ''}
    ${!is('nomina') && corrs.length ? `<div><div class="eyebrow" style="margin-bottom:6px">Correcciones operativas · últimos 30 días</div><div class="row small"><span class="badge b-mut">${corrs.length} correcciones</span><span class="badge b-ok">${corrs.filter((x) => x.resultado === 'corrigio').length} corrigió</span><span class="badge b-bad">${corrs.filter((x) => x.resultado === 'no_corrigio').length} no corrigió</span></div></div>` : ''}
    ${seesCases ? `<div><div class="eyebrow" style="margin-bottom:6px">Casos</div>${cases.length ? `<div class="list">${cases.map((k) => `<button type="button" class="item" data-opencase="${k.id}" style="padding:8px 12px"><span class="mono small muted">#${k.folio}</span><span class="grow small">${fmtDate(k.fecha_hechos)} · ${esc(k.hechos.slice(0, 60))}${k.decision ? ' · ' + esc(MEDIDAS[k.decision]) : ''}</span>${caseBadge(k.status)}</button>`).join('')}</div>` : '<span class="small muted">Sin casos.</span>'}</div>` : ''}`;
  const actions = [];
  if (is('developer') && e.status === 'alta_pendiente') {
    actions.push({ label: 'Rechazar alta', cls: 'danger', run: async () => { if (!(await confirmBox('Rechazar alta', `¿Rechazar la solicitud de <b>${esc(fullName(e))}</b>?`, { danger: true, okLabel: 'Rechazar' }))) return false; await mustUpdate(db('employees').eq('id', id).update({ status: 'rechazado' })); toast('Alta rechazada'); viewPersonal(); } });
    actions.push({ label: 'Aceptar alta', cls: 'primary', run: () => { setTimeout(() => aceptarAlta(e), 0); } });
  }
  if (canEdit || canEditPriv) actions.push({ label: 'Editar datos', run: () => { setTimeout(() => editEmployee(e, p, { basic: canEdit, priv: canEditPriv }), 0); } });
  if (canMove) actions.push({ label: 'Cambiar grupo', run: () => { setTimeout(() => moveGroup(e), 0); } });
  if (is('developer')) {
    if (e.status === 'activo') actions.push({ label: 'Cambiar área', run: () => { setTimeout(() => moveArea(e), 0); } });
    if (e.status === 'activo') actions.push({ label: 'Dar de baja', cls: 'danger', run: () => { setTimeout(() => bajaForm(e, p), 0); } });
    if (e.status === 'baja' || e.status === 'rechazado') actions.push({ label: 'Eliminar', cls: 'danger', run: async () => {
      if (!(await confirmBox('Eliminar registro', `Se eliminará <b>${esc(fullName(e))}</b> con sus datos y su asistencia. No se puede deshacer. La bitácora conserva el registro de quién lo eliminó.`, { danger: true, okLabel: 'Eliminar' }))) return false;
      const r = await db('employees').eq('id', id).remove(); if (!r.length) throw new Error('No se pudo eliminar'); toast('Eliminado'); viewPersonal();
    } });
  }
  const m = modal({ title: fullName(e), body, actions, wide: true });
  $$('[data-opencase]', m.el).forEach((b) => b.onclick = () => { m.close(); openCase(b.dataset.opencase); });
}

async function aceptarAlta(e) {
  const fields = [
    { k: 'num_empleado', label: 'Número de empleado', val: e.num_empleado || '' },
    { k: 'fecha_ingreso', label: 'Fecha de ingreso', type: 'date', req: true, val: e.fecha_ingreso || todayMX() },
    { k: 'group_id', label: 'Grupo', type: 'select', val: e.group_id || '', options: [['', 'Sin grupo'], ...S.groups.filter((g) => g.area_id === e.area_id && g.active).map((g) => [g.id, g.name])] }
  ];
  return new Promise((resolve) => modal({
    title: 'Aceptar alta · ' + fullName(e), onClose: () => resolve(),
    body: `<div class="notice n-info">Al aceptar, ${esc(fullName(e))} queda activo y aparece en el pase de lista de su grupo.</div>` + fieldsHtml(fields),
    actions: [{ label: 'Cancelar' }, { label: 'Aceptar alta', cls: 'primary', run: async ({ el }) => {
      const v = readFields(el, fields);
      await mustUpdate(db('employees').eq('id', e.id).update({ status: 'activo', num_empleado: v.num_empleado, fecha_ingreso: v.fecha_ingreso, group_id: v.group_id }));
      toast('Alta aceptada'); viewPersonal();
    } }]
  }));
}

async function altaForm() {
  const areas = is('developer') ? S.areas.filter((a) => a.active) : S.areas.filter((a) => a.active && S.myAreas.includes(a.id));
  if (!areas.length) return toast('No tienes áreas asignadas', true);
  const base = [
    { k: 'nombre', label: 'Nombre(s)', req: true }, { k: 'apellido_paterno', label: 'Apellido paterno', req: true },
    { k: 'apellido_materno', label: 'Apellido materno' }, { k: 'puesto', label: 'Puesto' },
    { k: 'area_id', label: 'Área', type: 'select', req: true, options: areas.map((a) => [a.id, a.name]), val: areas[0].id },
    { k: 'group_id', label: 'Grupo / líder', type: 'select', options: [['', 'Sin asignar']] },
    { k: 'fecha_ingreso', label: 'Fecha de ingreso propuesta', type: 'date' },
    ...(is('developer') ? [{ k: 'num_empleado', label: 'Número de empleado' }] : [])
  ];
  const priv = PRIV_FIELDS;
  const m = modal({
    title: is('developer') ? 'Nuevo ingreso' : 'Solicitar alta', wide: true,
    body: `<div class="notice n-info">${is('developer') ? 'Puedes registrar la solicitud o darla de alta directo.' : 'La solicitud llega a Daniel para aceptar el alta y generar la documentación.'} Se revisa si la persona ya trabajó aquí.</div>
      ${fieldsHtml(base)}<div class="eyebrow">Datos sensibles</div>${fieldsHtml(priv)}<div id="rehire"></div>`,
    actions: [{ label: 'Cancelar' },
      ...(is('developer') ? [{ label: 'Dar de alta directo', run: (ctx) => submit(ctx, true) }] : []),
      { label: is('developer') ? 'Guardar como pendiente' : 'Enviar solicitud', cls: 'primary', run: (ctx) => submit(ctx, false) }]
  });
  const fillGroups = () => {
    const a = $('#f_area_id', m.el).value;
    $('#f_group_id', m.el).innerHTML = '<option value="">Sin asignar</option>' + S.groups.filter((g) => g.area_id === a && g.active).map((g) => `<option value="${g.id}">${esc(g.name)}${g.tl_id ? ' — ' + esc(profName(g.tl_id)) : ''}</option>`).join('');
  };
  fillGroups(); $('#f_area_id', m.el).onchange = fillGroups;
  let confirmedKey = null;
  $$('#f_curp,#f_nombre,#f_apellido_paterno,#f_apellido_materno', m.el).forEach((i) => i.addEventListener('input', () => { confirmedKey = null; $('#rehire', m.el).innerHTML = ''; }));
  async function submit({ el }, direct) {
    const b = readFields(el, base); const pv = readFields(el, priv);
    if (pv.curp && !/^[A-Z]{4}\d{6}[HMX][A-Z]{5}[A-Z0-9]\d$/.test(pv.curp)) throw new Error('La CURP no tiene un formato válido (18 caracteres).');
    const key = JSON.stringify([pv.curp, b.nombre, b.apellido_paterno, b.apellido_materno]);
    if (confirmedKey !== key) {
      const hits = await rpc('check_rehire', { p_curp: pv.curp, p_nombre: b.nombre, p_paterno: b.apellido_paterno, p_materno: b.apellido_materno });
      if (hits.length) {
        const blocked = hits.some((h) => h.recontratable === false);
        $('#rehire', el).innerHTML = `<div class="notice ${blocked ? 'n-bad' : 'n-warn'}"><b>${blocked ? 'NO RECONTRATABLE' : 'Esta persona ya trabajó aquí'}</b>
          ${hits.map((h) => `<div style="margin-top:6px">${esc(h.nombre_completo)} · ${esc(h.area)} · ${fmtDate(h.fecha_ingreso)} → ${fmtDate(h.fecha_baja)} (coincide por ${esc(h.coincide_por)})<br>Motivo: ${esc(h.motivo_baja || 'sin registrar')} · Recontratable: ${h.recontratable === false ? 'No' : h.recontratable ? 'Sí' : 'sin definir'}</div>`).join('')}
          <div style="margin-top:6px">${blocked && !is('developer') ? 'No se puede solicitar el reingreso. Consulta con Daniel.' : 'Si es correcto, vuelve a presionar el botón para continuar.'}</div></div>`;
        $('#rehire', el).scrollIntoView({ block: 'nearest' });
        if (!(blocked && !is('developer'))) confirmedKey = key;
        return false;
      }
    }
    const row = { ...b, group_id: b.group_id || null };
    if (direct) row.status = 'activo';
    const [emp] = await db('employees').insert([row]);
    const hasPriv = Object.values(pv).some((x) => x != null);
    if (hasPriv) {
      try { await db('employee_private').insert([{ employee_id: emp.id, ...pv }]); }
      catch (err) { toast('Se guardó el alta, pero no los datos sensibles: ' + err.message, true); viewPersonal(); return; }
    }
    toast(direct ? 'Alta registrada' : 'Solicitud enviada'); PS.status = direct ? 'activo' : 'alta_pendiente'; viewPersonal();
  }
}

function editEmployee(e, p, { basic, priv }) {
  const bf = basic ? [
    { k: 'nombre', label: 'Nombre(s)', req: true, val: e.nombre }, { k: 'apellido_paterno', label: 'Apellido paterno', req: true, val: e.apellido_paterno },
    { k: 'apellido_materno', label: 'Apellido materno', val: e.apellido_materno }, { k: 'puesto', label: 'Puesto', val: e.puesto },
    { k: 'fecha_ingreso', label: 'Fecha de ingreso', type: 'date', val: e.fecha_ingreso },
    ...(is('developer') ? [{ k: 'num_empleado', label: 'Número de empleado', val: e.num_empleado }] : [])
  ] : [];
  const pf = priv ? PRIV_FIELDS.map((f) => ({ ...f, val: p ? p[f.k] : '' })) : [];
  modal({
    title: 'Editar · ' + fullName(e), wide: true,
    body: (bf.length ? fieldsHtml(bf) : '') + (pf.length ? `<div class="eyebrow">Datos sensibles</div>${fieldsHtml(pf)}` : ''),
    actions: [{ label: 'Cancelar' }, { label: 'Guardar', cls: 'primary', run: async ({ el }) => {
      if (bf.length) {
        const v = readFields(el, bf); const patch = {};
        for (const k in v) if ((v[k] ?? null) !== (e[k] ?? null)) patch[k] = v[k];
        if (Object.keys(patch).length) await mustUpdate(db('employees').eq('id', e.id).update(patch));
      }
      if (pf.length) {
        const v = readFields(el, pf);
        if (v.curp && !/^[A-Z]{4}\d{6}[HMX][A-Z]{5}[A-Z0-9]\d$/.test(v.curp)) throw new Error('La CURP no tiene un formato válido.');
        const changed = PRIV_FIELDS.some((f) => String(v[f.k] ?? '') !== String((p && p[f.k]) ?? ''));
        if (changed) await db('employee_private').insert([{ employee_id: e.id, ...v }], { onConflict: 'employee_id' });
      }
      toast('Guardado'); viewPersonal();
    } }]
  });
}

function moveGroup(e) {
  const opts = [['', 'Sin grupo'], ...S.groups.filter((g) => g.area_id === e.area_id && g.active).map((g) => [g.id, g.name + (g.tl_id ? ' — ' + profName(g.tl_id) : '')])];
  const f = [{ k: 'group_id', label: 'Grupo / líder', type: 'select', options: opts, val: e.group_id || '', full: true }];
  modal({
    title: 'Cambiar grupo · ' + fullName(e), body: fieldsHtml(f) + '<div class="small muted">Solo grupos de la misma área.</div>',
    actions: [{ label: 'Cancelar' }, { label: 'Guardar', cls: 'primary', run: async ({ el }) => {
      const v = readFields(el, f); await mustUpdate(db('employees').eq('id', e.id).update({ group_id: v.group_id || null })); toast('Grupo actualizado'); viewPersonal();
    } }]
  });
}
function moveArea(e) {
  const blocked = new Set(S.blocks.filter((b) => b.from_area === e.area_id).map((b) => b.to_area));
  const opts = S.areas.filter((a) => a.active && a.id !== e.area_id && !blocked.has(a.id)).map((a) => [a.id, a.name]);
  if (!opts.length) return toast('No hay áreas permitidas para este cambio', true);
  const f = [{ k: 'area_id', label: 'Nueva área', type: 'select', options: opts, full: true }];
  modal({
    title: 'Cambiar área · ' + fullName(e), body: fieldsHtml(f) + `<div class="small muted">Áreas bloqueadas desde ${esc(areaName(e.area_id))}: ${[...blocked].map(areaName).join(', ') || 'ninguna'}. El grupo se quita y se asigna después.</div>`,
    actions: [{ label: 'Cancelar' }, { label: 'Cambiar', cls: 'primary', run: async ({ el }) => {
      const v = readFields(el, f); await mustUpdate(db('employees').eq('id', e.id).update({ area_id: v.area_id, group_id: null })); toast('Área actualizada'); viewPersonal();
    } }]
  });
}
function bajaForm(e, p) {
  const f = [
    { k: 'fecha_baja', label: 'Fecha de baja', type: 'date', req: true, val: todayMX() },
    { k: 'recontratable', label: '¿Recontratable?', type: 'select', req: true, options: [['', 'Elegir…'], ['true', 'Sí'], ['false', 'No']] },
    { k: 'motivo_baja', label: 'Motivo (objetivo, con evidencia)', type: 'textarea', req: true, full: true, val: p && p.motivo_baja || '', hint: 'Uso interno. Ej. "Renuncia voluntaria" o "4 faltas sin justificar en 30 días; evidencia en expediente".' }
  ];
  modal({
    title: 'Dar de baja · ' + fullName(e), body: fieldsHtml(f),
    actions: [{ label: 'Cancelar' }, { label: 'Dar de baja', cls: 'danger solid', run: async ({ el }) => {
      const v = readFields(el, f);
      await db('employee_private').insert([{ employee_id: e.id, motivo_baja: v.motivo_baja, recontratable: v.recontratable === 'true' }], { onConflict: 'employee_id' });
      await mustUpdate(db('employees').eq('id', e.id).update({ status: 'baja', fecha_baja: v.fecha_baja }));
      toast('Baja registrada'); viewPersonal();
    } }]
  });
}

// ───────────────────────── Asistencia (revisión, alertas, exportación) ─────────────────────────
const AS = { fecha: null, area: '', open: null };
async function viewAsistencia() {
  const v = $('#view');
  if (!AS.fecha) AS.fecha = todayMX();
  const areas = visibleAreas();
  const groups = S.groups.filter((g) => g.active && (seesAllAreas() || S.myAreas.includes(g.area_id)) && (!AS.area || g.area_id === AS.area))
    .sort((a, b) => (areaName(a.area_id) + a.name).localeCompare(areaName(b.area_id) + b.name, 'es'));
  let ef = db('employees').select('id,nombre,apellido_paterno,apellido_materno,area_id,group_id,status').eq('status', 'activo');
  let af = db('attendance').eq('fecha', AS.fecha);
  if (AS.area) { ef = ef.eq('area_id', AS.area); af = af.eq('area_id', AS.area); }
  const [emps, att, days, faltas] = await Promise.all([ef.get(), af.get(), db('attendance_days').eq('fecha', AS.fecha).get(), db('faltas_30d').gte('faltas', 3).get()]);
  const byEmp = Object.fromEntries(att.map((a) => [a.employee_id, a]));
  const dayBy = Object.fromEntries(days.map((d) => [d.group_id, d]));
  const empById = Object.fromEntries(emps.map((e) => [e.id, e]));
  const canReview = is('developer', 'nomina');
  const rows = groups.map((g) => {
    const people = emps.filter((e) => e.group_id === g.id).sort(sortName);
    const c = attCounts(); let n = 0;
    people.forEach((e) => { const a = byEmp[e.id]; if (a) { n++; c[a.status]++; } });
    return { g, people, c, n, d: dayBy[g.id] || {} };
  });
  const noGroup = emps.filter((e) => !e.group_id).length;
  const alerts = faltas.filter((f) => empById[f.employee_id]).sort((a, b) => b.faltas - a.faltas);
  v.innerHTML = `
  <div class="pagehead"><div><h1>Asistencia</h1><div class="muted small">${dayLabel(AS.fecha)}</div></div>
    <div class="row"><input type="date" class="inp mono" id="as_date" value="${AS.fecha}" max="${todayMX()}" aria-label="Fecha">
    ${areas.length > 1 ? `<select class="inp" id="as_area" aria-label="Área"><option value="">Todas las áreas</option>${areas.map((a) => `<option value="${a.id}"${AS.area === a.id ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select>` : ''}
    <button class="btn" id="as_exp">Exportar periodo</button></div></div>
  ${alerts.length ? `<div class="card pad" style="margin-bottom:12px"><div class="eyebrow" style="margin-bottom:8px">Alertas · faltas en los últimos 30 días</div>
    <div class="list">${alerts.map((f) => { const e = empById[f.employee_id]; return `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:8px"><span><b>${esc(fullName(e))}</b><br><span class="small muted">${esc(areaName(e.area_id))} · ${esc(groupName(e.group_id))}${f.retardos ? ` · ${f.retardos} retardos` : ''}</span></span>${faltasBadge(f.faltas)}</div>`; }).join('')}</div>
    <div class="small muted" style="margin-top:8px">Rojo: más de 3 faltas en 30 días (LFT art. 47 fr. X). Ámbar: 3 faltas.</div></div>` : ''}
  <div class="card scrollx"><table class="tbl"><thead><tr><th>Grupo</th><th>Capturados</th><th>F</th><th>R</th><th>Enviado</th><th>Revisión</th></tr></thead><tbody>
    ${rows.map((r) => `<tr data-g="${r.g.id}" style="cursor:pointer">
      <td><b>${esc(r.g.name)}</b><br><span class="small muted">${esc(areaName(r.g.area_id))}${r.g.tl_id ? ' · ' + esc(profName(r.g.tl_id)) : ' · sin TL'}</span></td>
      <td class="mono">${r.n}/${r.people.length}${r.people.length && r.n === r.people.length ? ' <span class="badge b-ok">completo</span>' : ''}</td>
      <td class="mono" style="color:var(--bad)">${r.c.falta || ''}</td><td class="mono" style="color:var(--warn)">${r.c.retardo || ''}</td>
      <td class="small">${r.d.sent_at ? fmtTime(r.d.sent_at) + '<br><span class="muted">' + esc(profName(r.d.sent_by)) + '</span>' : '<span class="muted">—</span>'}</td>
      <td>${r.d.reviewed_at ? `<span class="badge b-ok">Revisado ${fmtTime(r.d.reviewed_at)}</span>` : '<span class="badge b-mut">Pendiente</span>'}
        ${canReview ? `<br><button class="btn sm" data-rev="${r.g.id}" data-on="${r.d.reviewed_at ? '0' : '1'}" style="margin-top:4px">${r.d.reviewed_at ? 'Quitar revisión' : 'Marcar revisado'}</button>` : ''}</td></tr>
      ${AS.open === r.g.id ? `<tr><td colspan="6" style="background:var(--soft)">${r.people.length ? r.people.map((e) => { const a = byEmp[e.id]; return `<div class="row small" style="padding:4px 0"><span class="grow">${esc(fullName(e))}</span>${a ? `<span class="badge ${ATT_BADGE[a.status]}">${ATT[a.status]}</span><span class="muted">${esc([...(a.incidencias || []), a.comentario].filter(Boolean).join(' · '))}</span>` : '<span class="badge b-mut">Sin registrar</span>'}</div>`; }).join('') : '<span class="muted">Sin personal</span>'}
        ${canWriteAttendance() && writableGroups().some((x) => x.id === r.g.id) ? `<button class="btn sm ghost" data-goto="${r.g.id}" style="margin-top:8px">Abrir pase de lista</button>` : ''}</td></tr>` : ''}`).join('') || '<tr><td colspan="6" class="empty">Sin grupos</td></tr>'}
  </tbody></table></div>
  ${noGroup ? `<div class="small muted" style="margin-top:8px">${noGroup} personas activas sin grupo asignado (no aparecen en ningún pase de lista).</div>` : ''}`;
  $('#as_date').onchange = (e) => { if (e.target.value && e.target.value <= todayMX()) { AS.fecha = e.target.value; viewAsistencia(); } };
  if ($('#as_area')) $('#as_area').onchange = (e) => { AS.area = e.target.value; viewAsistencia(); };
  $$('tr[data-g]').forEach((tr) => tr.onclick = (ev) => { if (ev.target.closest('button')) return; AS.open = AS.open === tr.dataset.g ? null : tr.dataset.g; viewAsistencia(); });
  $$('[data-rev]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try { await rpc('review_day', { p_group: b.dataset.rev, p_fecha: AS.fecha, p_reviewed: b.dataset.on === '1' }); viewAsistencia(); }
    catch (e) { toast(e.message, true); b.disabled = false; }
  });
  $$('[data-goto]').forEach((b) => b.onclick = () => { LS.group = b.dataset.goto; LS.fecha = AS.fecha; location.hash = '#/lista'; });
  $('#as_exp').onclick = exportPeriod;
}

function exportPeriod() {
  const t = todayMX(); const d = Number(t.slice(8));
  const from = d <= 15 ? t.slice(0, 8) + '01' : t.slice(0, 8) + '16';
  const f = [{ k: 'from', label: 'Desde', type: 'date', req: true, val: from, max: t }, { k: 'to', label: 'Hasta', type: 'date', req: true, val: t, max: t }];
  modal({
    title: 'Exportar asistencia (CSV para Excel)', body: fieldsHtml(f) + '<div class="small muted">Una fila por persona y una columna por día (A = asistió, F = falta, R = retardo), con totales. Incluye solo lo que tu rol puede ver.</div>',
    actions: [{ label: 'Cancelar' }, { label: 'Descargar', cls: 'primary', run: async ({ el }) => {
      const v = readFields(el, f);
      if (v.from > v.to) throw new Error('La fecha inicial es posterior a la final.');
      const days = []; for (let x = v.from; x <= v.to; x = addDays(x, 1)) { days.push(x); if (days.length > 62) throw new Error('Máximo 62 días por exportación.'); }
      let qa = db('attendance').select('employee_id,fecha,status,incidencias,comentario,area_id').gte('fecha', v.from).lte('fecha', v.to);
      if (AS.area) qa = qa.eq('area_id', AS.area);
      const [att, emps] = await Promise.all([qa.get(), db('employees').select('id,num_empleado,nombre,apellido_paterno,apellido_materno,area_id,group_id,status').get()]);
      const empById = Object.fromEntries(emps.map((e) => [e.id, e]));
      const per = {}; att.forEach((a) => { (per[a.employee_id] = per[a.employee_id] || {})[a.fecha] = a; });
      const ids = Object.keys(per).sort((a, b) => sortName(empById[a] || { apellido_paterno: '', nombre: '' }, empById[b] || { apellido_paterno: '', nombre: '' }));
      const q = (s) => '"' + String(s ?? '').replace(/"/g, '""') + '"';
      const lines = [['No.', 'Nombre', 'Área', 'Grupo', ...days.map(fmtDate), 'Asistencias', 'Faltas', 'Retardos', 'Incidencias'].map(q).join(',')];
      for (const id of ids) {
        const e = empById[id] || { nombre: '(sin acceso)', apellido_paterno: '' }; const r = per[id];
        const c = attCounts(); const inc = [];
        days.forEach((dd) => { if (r[dd]) { c[r[dd].status]++; if ((r[dd].incidencias || []).length || r[dd].comentario) inc.push(fmtDate(dd) + ': ' + [...(r[dd].incidencias || []), r[dd].comentario].filter(Boolean).join('/')); } });
        lines.push([e.num_empleado, fullName(e), areaName(e.area_id), groupName(e.group_id), ...days.map((dd) => r[dd] ? ATT_SHORT[r[dd].status] : ''), c.asistio, c.falta, c.retardo, inc.join(' | ')].map(q).join(','));
      }
      if (CFG.demo) {
        setTimeout(() => modal({ title: 'Vista previa del CSV', wide: true, body: `<div class="notice n-info">En la demo no se descargan archivos. En la app real se descarga este CSV para abrirlo en Excel.</div><textarea class="inp mono" style="min-height:260px;font-size:12px;white-space:pre" readonly>${esc(lines.join('\n'))}</textarea>`, actions: [{ label: 'Cerrar', cls: 'primary' }] }), 0);
        return;
      }
      const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `asistencia_${v.from}_a_${v.to}.csv`; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast(`${ids.length} personas exportadas`);
    } }]
  });
}

// ───────────────────────── Usuarios (solo Daniel) ─────────────────────────
async function viewUsuarios() {
  const v = $('#view');
  const [profiles, ua] = await Promise.all([db('profiles').order('full_name').get(), db('user_areas').get()]);
  S.profiles = profiles;
  const areasOf = (id) => ua.filter((x) => x.user_id === id).map((x) => x.area_id);
  v.innerHTML = `<div class="pagehead"><div><h1>Usuarios</h1><div class="muted small">${profiles.length} usuarios</div></div><button class="btn primary" id="nu">+ Nuevo usuario</button></div>
  <div class="notice n-info" style="margin-bottom:12px">Dirección, Nómina y Administrador ven todas las áreas. RH, Supervisores necesitan sus áreas marcadas. A los Team Leaders se les asigna su grupo en “Áreas y grupos”.</div>
  <div class="card scrollx"><table class="tbl"><thead><tr><th>Usuario</th><th>Rol</th><th>Áreas</th><th>Estado</th><th></th></tr></thead><tbody>
  ${profiles.map((p) => `<tr><td><b>${esc(p.full_name)}</b><br><span class="small muted">${esc(p.email || '')}</span></td>
    <td>${p.role ? esc(ROLES[p.role]) : '<span class="badge b-warn">Sin rol</span>'}</td>
    <td class="small">${['developer', 'director', 'nomina'].includes(p.role) ? '<span class="muted">Todas</span>' : p.role === 'tl' ? esc(S.groups.filter((g) => g.tl_id === p.id).map((g) => areaName(g.area_id) + ' · ' + g.name).join(', ') || 'Sin grupo') : esc(areasOf(p.id).map(areaName).join(', ') || '—')}</td>
    <td>${p.active ? '<span class="badge b-ok">Activo</span>' : '<span class="badge b-mut">Inactivo</span>'}</td>
    <td style="white-space:nowrap">${p.id === S.me.id ? '<span class="small muted">Tú</span>' : `<button class="btn sm" data-ed="${p.id}">Editar</button>`}</td></tr>`).join('')}
  </tbody></table></div>`;
  $('#nu').onclick = () => userForm(null, [], () => viewUsuarios());
  $$('[data-ed]').forEach((b) => b.onclick = () => { const p = profiles.find((x) => x.id === b.dataset.ed); userForm(p, areasOf(p.id), () => viewUsuarios()); });
}
function genPass() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; const a = new Uint32Array(12); crypto.getRandomValues(a);
  return [...a].map((x) => abc[x % abc.length]).join('');
}
function userForm(p, areas, done) {
  const isNew = !p;
  const f = [
    { k: 'full_name', label: 'Nombre completo', req: true, val: p ? p.full_name : '' },
    ...(isNew ? [{ k: 'email', label: 'Correo', type: 'email', req: true }, { k: 'password', label: 'Contraseña temporal', req: true, val: genPass(), hint: 'Compártela por un medio seguro; la persona la cambia al entrar.' }] : []),
    { k: 'role', label: 'Rol', type: 'select', req: true, val: p ? p.role || '' : '', options: [['', 'Elegir…'], ...Object.entries(ROLES)] },
    ...(!isNew ? [{ k: 'active', label: 'Estado', type: 'select', val: p.active ? '1' : '0', options: [['1', 'Activo'], ['0', 'Inactivo (no puede entrar a nada)']] }] : [])
  ];
  const areaBox = `<div><div class="eyebrow" style="margin-bottom:6px">Áreas (RH y Supervisores)</div><div class="chips">${S.areas.map((a) => `<label class="chip" style="display:inline-flex;align-items:center;gap:6px"><input type="checkbox" value="${a.id}"${areas.includes(a.id) ? ' checked' : ''}>${esc(a.name)}</label>`).join('')}</div></div>`;
  modal({
    title: isNew ? 'Nuevo usuario' : 'Editar · ' + p.full_name, body: fieldsHtml(f) + areaBox + (!isNew ? '<button type="button" class="btn sm" id="rp" style="align-self:flex-start">Asignar contraseña nueva…</button>' : ''),
    actions: [{ label: 'Cancelar' }, { label: 'Guardar', cls: 'primary', run: async ({ el }) => {
      const v = readFields(el, f);
      const sel = $$('.chips input:checked', el).map((i) => i.value);
      let id = p && p.id;
      if (isNew) {
        if (v.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
        const r = await http('/functions/v1/admin-users', { method: 'POST', body: { action: 'create', email: v.email, password: v.password, full_name: v.full_name } });
        id = r.id;
      }
      await mustUpdate(db('profiles').eq('id', id).update({ full_name: v.full_name, role: v.role, ...(isNew ? {} : { active: v.active === '1' }) }), 'el usuario');
      const toDel = areas.filter((a) => !sel.includes(a)); const toAdd = sel.filter((a) => !areas.includes(a));
      for (const a of toDel) await db('user_areas').eq('user_id', id).eq('area_id', a).remove();
      if (toAdd.length) await db('user_areas').insert(toAdd.map((a) => ({ user_id: id, area_id: a })));
      toast(isNew ? 'Usuario creado' : 'Usuario actualizado'); done();
    } }]
  });
  const rp = document.getElementById('rp');
  if (rp) rp.onclick = () => {
    const pf = [{ k: 'password', label: 'Contraseña nueva', req: true, val: genPass(), full: true, hint: 'Compártela por un medio seguro.' }];
    modal({ title: 'Contraseña nueva · ' + p.full_name, body: fieldsHtml(pf), actions: [{ label: 'Cancelar' }, { label: 'Asignar', cls: 'primary', run: async ({ el }) => {
      const v = readFields(el, pf); if (v.password.length < 8) throw new Error('Mínimo 8 caracteres.');
      await http('/functions/v1/admin-users', { method: 'POST', body: { action: 'set_password', user_id: p.id, password: v.password } });
      toast('Contraseña asignada');
    } }] });
  };
}

// ───────────────────────── Áreas y grupos (solo Daniel) ─────────────────────────
async function viewCatalogos() {
  await loadCatalogs();
  const v = $('#view');
  const tls = S.profiles.filter((p) => p.role === 'tl' && p.active);
  v.innerHTML = `<div class="pagehead"><h1>Áreas y grupos</h1><div class="row"><button class="btn" id="na">+ Área</button><button class="btn primary" id="ng">+ Grupo</button></div></div>
  ${S.areas.map((a) => `<div class="card" style="margin-bottom:12px"><div class="pad row" style="border-bottom:1px solid var(--line)"><b class="grow">${esc(a.name)}</b>${a.active ? '' : '<span class="badge b-mut">Inactiva</span>'}<button class="btn sm" data-ea="${a.id}">Editar</button></div>
    <table class="tbl"><tbody>${S.groups.filter((g) => g.area_id === a.id).map((g) => `<tr><td><b>${esc(g.name)}</b>${g.active ? '' : ' <span class="badge b-mut">Inactivo</span>'}</td><td>${g.tl_id ? esc(profName(g.tl_id)) : '<span class="badge b-warn">Sin TL</span>'}</td><td style="text-align:right"><button class="btn sm" data-eg="${g.id}">Editar</button></td></tr>`).join('') || '<tr><td class="muted">Sin grupos</td></tr>'}</tbody></table></div>`).join('')}
  <div class="card pad"><div class="eyebrow" style="margin-bottom:8px">Cambios de área no permitidos</div>
    ${S.blocks.map((b) => `<div class="row" style="padding:4px 0"><span class="grow">${esc(areaName(b.from_area))} → ${esc(areaName(b.to_area))}</span><button class="btn sm danger" data-db="${b.from_area}|${b.to_area}">Quitar</button></div>`).join('') || '<span class="muted small">Ninguno</span>'}
    <button class="btn sm" id="nb" style="margin-top:8px">+ Bloquear cambio</button></div>`;
  const areaOpts = S.areas.map((a) => [a.id, a.name]);
  $('#na').onclick = () => simpleForm('Nueva área', [{ k: 'name', label: 'Nombre', req: true, full: true }], (x) => db('areas').insert([x]));
  $$('[data-ea]').forEach((b) => b.onclick = () => { const a = S.areas.find((x) => x.id === b.dataset.ea); simpleForm('Editar área', [{ k: 'name', label: 'Nombre', req: true, val: a.name }, { k: 'active', label: 'Estado', type: 'select', val: a.active ? '1' : '0', options: [['1', 'Activa'], ['0', 'Inactiva']] }], (x) => mustUpdate(db('areas').eq('id', a.id).update({ name: x.name, active: x.active === '1' }))); });
  const gFields = (g) => [
    { k: 'area_id', label: 'Área', type: 'select', req: true, options: areaOpts, val: g ? g.area_id : '' },
    { k: 'name', label: 'Nombre del grupo', req: true, val: g ? g.name : '' },
    { k: 'tl_id', label: 'Team Leader', type: 'select', val: g ? g.tl_id || '' : '', options: [['', 'Sin TL'], ...tls.map((p) => [p.id, p.full_name])] },
    ...(g ? [{ k: 'active', label: 'Estado', type: 'select', val: g.active ? '1' : '0', options: [['1', 'Activo'], ['0', 'Inactivo']] }] : [])
  ];
  $('#ng').onclick = () => simpleForm('Nuevo grupo', gFields(null), (x) => db('groups').insert([{ ...x, tl_id: x.tl_id || null }]), 'Solo aparecen como TL los usuarios con rol Team Leader.');
  $$('[data-eg]').forEach((b) => b.onclick = () => { const g = S.groups.find((x) => x.id === b.dataset.eg); simpleForm('Editar grupo', gFields(g), (x) => mustUpdate(db('groups').eq('id', g.id).update({ area_id: x.area_id, name: x.name, tl_id: x.tl_id || null, active: x.active === '1' }))); });
  $('#nb').onclick = () => simpleForm('Bloquear cambio de área', [{ k: 'from_area', label: 'De', type: 'select', options: areaOpts }, { k: 'to_area', label: 'A', type: 'select', options: areaOpts }], (x) => { if (x.from_area === x.to_area) throw new Error('Elige áreas distintas'); return db('area_transfer_blocks').insert([x]); }, 'Se bloquea solo en esa dirección. Agrega también la inversa si aplica.');
  $$('[data-db]').forEach((b) => b.onclick = async () => { const [fa, ta] = b.dataset.db.split('|'); try { await db('area_transfer_blocks').eq('from_area', fa).eq('to_area', ta).remove(); viewCatalogos(); } catch (e) { toast(e.message, true); } });
}
function simpleForm(title, fields, save, note) {
  modal({ title, body: fieldsHtml(fields) + (note ? `<div class="small muted">${esc(note)}</div>` : ''), actions: [{ label: 'Cancelar' }, { label: 'Guardar', cls: 'primary', run: async ({ el }) => { await save(readFields(el, fields)); toast('Guardado'); viewCatalogos(); } }] });
}

// ───────────────────────── Bitácora ─────────────────────────
const BS = { fecha: null, user: '' };
async function viewBitacora() {
  const v = $('#view');
  if (!BS.fecha) BS.fecha = todayMX();
  const start = `${BS.fecha}T00:00:00-06:00`, end = `${addDays(BS.fecha, 1)}T00:00:00-06:00`;
  let qq = db('audit_log').gte('at', start).lt('at', end).order('at', false).limit(1000);
  if (BS.user) qq = qq.eq('user_id', BS.user);
  const [logs, emps] = await Promise.all([qq.get(), EMP_CACHE.length ? Promise.resolve(EMP_CACHE) : db('employees').select('id,nombre,apellido_paterno,apellido_materno').get()]);
  const empName = Object.fromEntries(emps.map((e) => [e.id, fullName(e)]));
  v.innerHTML = `<div class="pagehead"><div><h1>Bitácora</h1><div class="muted small">${logs.length} movimientos · ${dayLabel(BS.fecha)}</div></div>
    <div class="row"><input type="date" class="inp mono" id="bl_d" value="${BS.fecha}" max="${todayMX()}" aria-label="Fecha">
    <select class="inp" id="bl_u" aria-label="Usuario"><option value="">Todos los usuarios</option>${S.profiles.map((p) => `<option value="${p.id}"${BS.user === p.id ? ' selected' : ''}>${esc(p.full_name)}</option>`).join('')}</select></div></div>
  <div class="card pad">${logs.length ? logs.map((l) => `<div class="log"><span class="tm">${fmtTime(l.at)}</span><span class="grow"><b>${esc(l.user_name || 'Sistema')}</b>${l.user_role ? ` <span class="small muted">${esc(ROLES[l.user_role])}</span>` : ''}<br>${describeLog(l, empName)}</span></div>`).join('') : '<div class="empty">Sin movimientos este día</div>'}</div>`;
  $('#bl_d').onchange = (e) => { if (e.target.value) { BS.fecha = e.target.value; viewBitacora(); } };
  $('#bl_u').onchange = (e) => { BS.user = e.target.value; viewBitacora(); };
}
const FIELD_LABEL = { status: 'Estatus', area_id: 'Área', group_id: 'Grupo', nombre: 'Nombre', apellido_paterno: 'Apellido paterno', apellido_materno: 'Apellido materno', puesto: 'Puesto', fecha_ingreso: 'Ingreso', fecha_baja: 'Baja', num_empleado: 'No. empleado', incidencias: 'Incidencias', comentario: 'Comentario', role: 'Rol', active: 'Activo', full_name: 'Nombre', tl_id: 'TL', name: 'Nombre', reviewed_at: 'Revisión', sent_at: 'Envío' };
function fmtVal(k, v) {
  if (v == null || v === '') return '—';
  if (k === 'status') return (STATUS[v] && STATUS[v][0]) || ATT[v] || v;
  if (k === 'area_id') return areaName(v);
  if (k === 'group_id') return groupName(v);
  if (k === 'tl_id') return profName(v);
  if (k === 'role') return ROLES[v] || v;
  if (k === 'incidencias') return v.length ? v.join(', ') : 'ninguna';
  if (k.startsWith('fecha')) return fmtDate(v);
  if (k.endsWith('_at')) return fmtTime(v);
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  return String(v);
}
function describeLog(l, empName) {
  const a = l.after || {}, b = l.before || {}, act = l.action;
  const changes = () => Object.keys(a).filter((k) => !['approved_by', 'approved_at', 'reviewed_by', 'sent_by', 'updated_by', 'created_by'].includes(k))
    .map((k) => `${esc(FIELD_LABEL[k] || k)}: ${esc(fmtVal(k, b[k]))} → <b>${esc(fmtVal(k, a[k]))}</b>`).join(' · ');
  const who = (id) => esc(empName[id] || 'empleado ' + String(id).slice(0, 8));
  switch (l.entity) {
    case 'attendance': {
      const emp = a.employee_id || b.employee_id;
      if (act === 'insert') return `Pase de lista · ${who(emp)} · ${fmtDate(a.fecha)} → <b>${esc(ATT[a.status])}</b>${a.incidencias && a.incidencias.length ? ' · ' + esc(a.incidencias.join(', ')) : ''}`;
      if (act === 'update') { const [id, f] = (l.record_id || '').split('|'); return `${'status' in a ? '<span class="badge b-warn">Corrección</span> ' : 'Actualizó '}asistencia · ${who(emp || id)} · ${fmtDate(f)} · ${changes()}`; }
      return `Borró asistencia de ${who(emp)} del ${fmtDate(b.fecha)}`;
    }
    case 'attendance_days': {
      const [g, f] = (l.record_id || '').split('|');
      if (a.sent_at && (act === 'insert' || !('reviewed_at' in a))) return `Envió reporte del día · ${esc(groupName(g))} · ${fmtDate(f)}`;
      if ('reviewed_at' in a) return a.reviewed_at ? `Marcó revisado ${esc(groupName(g))} · ${fmtDate(f)}` : `Quitó revisión de ${esc(groupName(g))} · ${fmtDate(f)}`;
      return `Reporte del día · ${esc(groupName(g))} · ${fmtDate(f)}`;
    }
    case 'employees':
      if (act === 'insert') return `${a.status === 'activo' ? 'Dio de alta' : 'Solicitó alta de'} <b>${esc(fullName(a))}</b> · ${esc(areaName(a.area_id))}`;
      if (act === 'delete') return `<span class="badge b-bad">Eliminó</span> a <b>${esc(fullName(b))}</b>`;
      return `${who(l.record_id)} · ${changes()}`;
    case 'employee_private':
      return `${act === 'insert' ? 'Capturó' : 'Actualizó'} datos sensibles de ${who(l.record_id)} (${esc(Object.keys(act === 'update' ? a : a || {}).filter((k) => !['employee_id', 'updated_at'].includes(k) && (act === 'update' || a[k] != null)).map((k) => k.replace(/_/g, ' ')).join(', '))})`;
    case 'profiles': return `Usuario ${esc(b.full_name || a.full_name || profName(l.record_id))} · ${changes()}`;
    case 'user_areas': return `${act === 'insert' ? 'Dio acceso' : 'Quitó acceso'} a ${esc(areaName((a.area_id || b.area_id)))} para ${esc(profName(a.user_id || b.user_id))}`;
    case 'groups': return act === 'insert' ? `Creó grupo ${esc(a.name)} en ${esc(areaName(a.area_id))}` : act === 'delete' ? `Eliminó grupo ${esc(b.name)}` : `Grupo ${esc(groupName(l.record_id))} · ${changes()}`;
    case 'areas': return act === 'insert' ? `Creó área ${esc(a.name)}` : `Área · ${changes()}`;
    case 'activity_daily': { const e = a.employee_id || b.employee_id || (l.record_id || '').split('|')[0]; const vv = a.valores || {}; return act === 'insert' ? `Actividad · ${who(e)} · ${fmtDate(a.fecha)} · ${esc(Object.entries(vv).map(([k, x]) => k + ' ' + x).join(', '))}` : `<span class="badge b-warn">Corrección</span> actividad · ${who(e)} · ${esc(JSON.stringify(b.valores || {}))} → <b>${esc(JSON.stringify(a.valores || {}))}</b>`; }
    case 'corrections': { const e = a.employee_id || b.employee_id || (l.record_id || '').split('|')[0]; return act === 'insert' ? `Corrección operativa · ${who(e)} · ${esc(String(a.hora).slice(0, 5))} · ${esc(a.avance)}` : `Corrección operativa · ${who(e)} · resultado: <b>${esc((RESULTADO[a.resultado] || [a.resultado])[0])}</b>`; }
    case 'area_metrics': return `Métrica ${esc((a || b).label || '')} · ${changes() || esc(act)}`;
    default: return `${esc(l.entity)} · ${esc(act)}`;
  }
}


// ───────────────────────── Operación diaria: actividad y correcciones ─────────────────────────
const metricsOf = (areaId) => (S.metrics || []).filter((m) => m.area_id === areaId).sort((a, b) => a.sort - b.sort);
const canCorrect = () => is('developer', 'supervisor', 'tl');
const canReportCase = () => is('developer', 'supervisor', 'tl', 'rh_general', 'rh_area');
const RESULTADO = { pendiente: ['Pendiente', 'b-mut'], corrigio: ['Corrigió', 'b-ok'], no_corrigio: ['No corrigió', 'b-bad'] };

function opsHtml(e, st) {
  if (!st) return '';
  const { metrics, act, corr } = st;
  const a = act[e.id]; const vals = (a && a.valores) || {};
  const corrs = corr[e.id] || [];
  const metricHtml = metrics.length ? `<div><div class="eyebrow" style="margin-bottom:6px">Actividad del día${a ? ` · <span style="text-transform:none;letter-spacing:0;font-weight:400">guardado ${fmtTime(a.updated_at)}</span>` : ''}</div>
    <div class="grid2">${metrics.map((m) => { const v = vals[m.key]; const pct = v != null && Number(m.daily_goal) ? Math.round(v * 100 / Number(m.daily_goal)) : null;
      return `<label class="field">${esc(m.label)} <span style="font-weight:400">meta ${Number(m.daily_goal)}${pct != null ? ` · <b style="color:${pct >= 100 ? 'var(--ok)' : pct >= 80 ? 'var(--warn)' : 'var(--bad)'}">${pct}%</b>` : ''}</span>
        <input type="number" inputmode="numeric" min="0" step="1" data-met="${esc(m.key)}" value="${v ?? ''}" placeholder="0"></label>`; }).join('')}</div></div>` : '';
  const corrHtml = canCorrect() ? `<div><div class="eyebrow" style="margin-bottom:6px">Correcciones operativas del día</div>
    ${corrs.length ? `<div class="list">${corrs.map((c) => `<div class="card" style="padding:10px 12px;display:flex;flex-direction:column;gap:6px">
      <div class="row small"><b class="mono">${esc(String(c.hora).slice(0, 5))}</b><span class="grow">${esc(c.avance)} · ${esc(c.instruccion)}</span><span class="badge ${RESULTADO[c.resultado][1]}">${RESULTADO[c.resultado][0]}</span></div>
      ${c.resultado === 'pendiente' ? `<div class="row"><button type="button" class="btn sm" data-cres="${c.id}" data-val="corrigio">Corrigió</button><button type="button" class="btn sm danger" data-cres="${c.id}" data-val="no_corrigio">No corrigió</button></div>` : ''}
    </div>`).join('')}</div>` : '<div class="small muted">Sin correcciones hoy.</div>'}</div>` : '';
  const btns = canCorrect() ? `<div class="row">
    ${canCorrect() ? '<button type="button" class="btn sm" data-newcorr>+ Corrección operativa</button>' : ''}
</div>` : '';
  return metricHtml + corrHtml + btns;
}
function wireOps(card, st, groups) {
  const id = card.dataset.id; const emp = st.emps.find((x) => x.id === id);
  const inputs = $$('[data-met]', card);
  inputs.forEach((inp) => inp.onchange = async () => {
    const valores = {};
    for (const i of inputs) {
      if (i.value === '') continue;
      const n = Number(i.value);
      if (!Number.isInteger(n) || n < 0) { toast('Escribe números enteros de 0 o más', true); return; }
      valores[i.dataset.met] = n;
    }
    try {
      const [saved] = await db('activity_daily').insert([{ employee_id: id, fecha: LS.fecha, valores }], { onConflict: 'employee_id,fecha' });
      st.act[id] = saved; toast('Actividad guardada'); renderLista(st, groups);
    } catch (e) { toast(e.message, true); }
  });
  $$('[data-cres]', card).forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try {
      const [u] = await mustUpdate(db('corrections').eq('id', b.dataset.cres).update({ resultado: b.dataset.val }), 'la corrección');
      st.corr[id] = st.corr[id].map((c) => c.id === u.id ? u : c); renderLista(st, groups);
    } catch (e) { toast(e.message, true); b.disabled = false; }
  });
  const nc = $('[data-newcorr]', card);
  if (nc) nc.onclick = () => {
    const now = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    const f = [
      { k: 'hora', label: 'Hora', type: 'time', req: true, val: LS.fecha === todayMX() ? now : '' },
      { k: 'avance', label: 'Avance a esa hora', req: true, hint: 'Ej. 180 mensajes y 90 llamadas' },
      { k: 'instruccion', label: 'Instrucción que diste', type: 'textarea', req: true, full: true, hint: 'Ej. regularizar la actividad durante el resto de la jornada' }
    ];
    modal({ title: 'Corrección operativa · ' + fullName(emp), body: `<div class="notice n-info">Es una corrección del día, no una sanción. Queda como antecedente si la persona reincide.</div>${fieldsHtml(f)}`,
      actions: [{ label: 'Cancelar' }, { label: 'Guardar', cls: 'primary', run: async ({ el }) => {
        const v = readFields(el, f);
        const [c] = await db('corrections').insert([{ employee_id: id, fecha: LS.fecha, ...v }]);
        (st.corr[id] = st.corr[id] || []).push(c); toast('Corrección registrada'); renderLista(st, groups);
      } }] });
  };
  const nk = $('[data-newcase]', card);
  if (nk) nk.onclick = () => caseForm({ employee: emp, fecha: LS.fecha, onDone: () => { toast('Incidencia enviada'); } });
}

// ───────────────────────── Casos: incidencia formal → cierre ─────────────────────────
const CASE_ST = {
  en_validacion: ['En validación · Supervisión', 'b-warn'], regresado: ['Regresado al líder', 'b-bad'], en_rh: ['En RH', 'b-acc'],
  en_decision: ['Por decidir · Daniel', 'b-acc'], decidido: ['Decidido · por cerrar', 'b-ok'], cerrado: ['Cerrado', 'b-mut']
};
const MEDIDAS = { advertencia: 'Advertencia', acta: 'Acta administrativa', medida_disciplinaria: 'Medida disciplinaria o suspensión', seguimiento: 'Seguimiento', cambio_equipo: 'Cambio de equipo', terminacion: 'Terminación', sin_medida: 'Sin medida' };
const SOLICITUDES = { medida: 'Medida disciplinaria o suspensión', cambio_equipo: 'Cambio de equipo', baja: 'Baja' };
const CLASIF = { desempeno: 'Desempeño', disciplina: 'Disciplina', asistencia: 'Asistencia', disponibilidad: 'Disponibilidad', grave: 'Grave' };
const PREGUNTAS = ['¿Qué hizo?', '¿Cuándo?', '¿Cuál era la obligación?', '¿Cuál fue el resultado real?', '¿Se le informó?', '¿Tuvo oportunidad de justificarlo?', '¿Existe evidencia?', '¿Es reincidente?'];
const caseBadge = (s) => `<span class="badge ${CASE_ST[s][1]}">${CASE_ST[s][0]}</span>`;
function pendingForMe(c) {
  if (is('tl')) return c.status === 'regresado' && c.created_by === S.me.id;
  if (is('supervisor')) return c.status === 'en_validacion' || (c.status === 'regresado' && c.created_by === S.me.id);
  if (is('rh_general', 'rh_area')) return c.status === 'en_rh';
  if (is('developer')) return ['en_rh', 'en_decision', 'decidido'].includes(c.status);
  return false;
}

function requestForm({ employee, tipo, fecha, existing, onDone }) {
  const c = existing || {};
  const t = tipo || c.solicitud_lider || c.riesgo_tipo;
  const riesgo = !!RIESGO[t];
  const label = RIESGO[t] || SOLICITUD_LIDER[t];
  const f = [
    { k: 'razon', label: 'Razón', type: 'textarea', req: true, full: true, val: c.hechos, hint: 'Qué pasó, solo hechos.' },
    { k: 'evidencia', label: 'Evidencias', type: 'textarea', req: true, full: true, val: c.evidencia, hint: 'Qué evidencia hay y dónde está: capturas, chats, reportes, testigos.' },
    { k: 'fecha', label: 'Fecha (o desde)', type: 'date', req: true, val: c.fecha_hechos || fecha || todayMX(), max: todayMX() },
    { k: 'fecha_fin', label: 'Hasta (si fueron varios días)', type: 'date', val: c.fecha_fin || '', max: todayMX() },
    { k: 'hora_inicio', label: 'Hora desde (opcional)', type: 'time', val: c.hora_inicio ? String(c.hora_inicio).slice(0, 5) : '' },
    { k: 'hora_fin', label: 'Hora hasta (opcional)', type: 'time', val: c.hora_fin ? String(c.hora_fin).slice(0, 5) : '' }
  ];
  const isEdit = !!existing;
  modal({
    title: `${label} · ${fullName(employee)}`, wide: true,
    body: `<div class="notice ${riesgo ? 'n-bad' : 'n-info'}">${riesgo ? 'Incidencia de riesgo: va directo a RH y Supervisión no la ve.' : isEdit ? 'Supervisión la regresó con un comentario: complétala y reenvíala.' : 'La solicitud va a Supervisión para validarla y después a RH. Tú reportas hechos; la decisión la toma RH.'}</div>
      ${fieldsHtml(f)}${isEdit ? fieldsHtml([{ k: 'comentario', label: 'Qué corregiste', full: true }]) : ''}`,
    actions: [{ label: 'Cancelar' }, { label: isEdit ? 'Reenviar a Supervisión' : riesgo ? 'Enviar a RH' : 'Enviar solicitud', cls: riesgo ? 'danger solid' : 'primary', run: async ({ el }) => {
      const v = readFields(el, f);
      if (v.fecha > todayMX() || (v.fecha_fin && v.fecha_fin > todayMX())) throw new Error('Las fechas no pueden ser futuras.');
      if (v.fecha_fin && v.fecha_fin < v.fecha) throw new Error('La fecha final es anterior a la inicial.');
      const args = { p_razon: v.razon, p_evidencia: v.evidencia, p_fecha: v.fecha, p_fecha_fin: v.fecha_fin, p_hora_inicio: v.hora_inicio, p_hora_fin: v.hora_fin };
      if (isEdit) await rpc('case_request_resubmit', { p_id: c.id, ...args, p_comentario: readFields(el, [{ k: 'comentario' }]).comentario });
      else await rpc('case_request', { p_employee: employee.id, p_tipo: t, ...args });
      onDone && onDone();
    } }]
  });
}
const caseType = (c) => c.riesgo_tipo ? RIESGO[c.riesgo_tipo] : c.solicitud_lider ? SOLICITUD_LIDER[c.solicitud_lider] : (c.kind === 'grave' ? 'Riesgo' : 'Incidencia');
const caseDates = (c) => fmtDate(c.fecha_hechos) + (c.fecha_fin && c.fecha_fin !== c.fecha_hechos ? ' al ' + fmtDate(c.fecha_fin) : '');
function caseForm({ employee, fecha, existing, onDone }) {
  const c = existing || {};
  const f = [
    { k: 'hechos', label: 'Qué ocurrió', type: 'textarea', req: true, full: true, val: c.hechos, hint: 'Solo hechos. Ej. sin actividad en mensajes ni llamadas.' },
    { k: 'fecha', label: 'Fecha', type: 'date', req: true, val: c.fecha_hechos || fecha || todayMX(), max: todayMX() },
    { k: 'hora_inicio', label: 'Desde (hora)', type: 'time', val: c.hora_inicio ? String(c.hora_inicio).slice(0, 5) : '' },
    { k: 'hora_fin', label: 'Hasta (hora)', type: 'time', val: c.hora_fin ? String(c.hora_fin).slice(0, 5) : '' },
    { k: 'instruccion', label: 'Instrucción u obligación que existía', type: 'textarea', full: true, val: c.instruccion, hint: 'Obligatorio en casos ordinarios.' },
    { k: 'indicador', label: 'Indicador incumplido', full: true, val: c.indicador, hint: 'Ej. 400 mensajes: cerró con 210. Obligatorio en casos ordinarios.' },
    { k: 'evidencia', label: 'Evidencia', type: 'textarea', req: true, full: true, val: c.evidencia, hint: 'Qué existe y dónde está: reporte, capturas, mensajes, testigos.' },
    { k: 'sugerencia', label: 'Sugerencia (opcional)', full: true, val: c.sugerencia, hint: 'Qué crees que procede. La decisión la toma RH.' }
  ];
  const isEdit = !!existing;
  const m = modal({
    title: (isEdit ? 'Completar incidencia · ' : 'Incidencia formal · ') + fullName(employee), wide: true,
    body: `<div class="notice n-info">El líder reporta hechos; no decide la consecuencia. ${isEdit ? 'Supervisión la regresó con un comentario: complétala y reenvíala.' : 'Va a Supervisión para validarla antes de llegar a RH.'}</div>
      ${!isEdit ? `<label class="chip" style="display:inline-flex;align-items:center;gap:8px;align-self:flex-start;border-color:var(--bad);color:var(--bad)"><input type="checkbox" id="f_grave"> Es un caso grave (fraude, desvío de pagos, amenazas, información confidencial): va directo a RH</label>` : ''}
      ${fieldsHtml(f)}${isEdit ? fieldsHtml([{ k: 'comentario', label: 'Qué corregiste', full: true }]) : ''}`,
    actions: [{ label: 'Cancelar' }, { label: isEdit ? 'Reenviar a Supervisión' : 'Enviar', cls: 'primary', run: async ({ el }) => {
      const v = readFields(el, f);
      const grave = !isEdit && $('#f_grave', el).checked;
      if (!grave && c.kind !== 'grave' && (!v.instruccion || !v.indicador)) throw new Error('En casos ordinarios faltan: la instrucción que existía y el indicador incumplido.');
      if (v.fecha > todayMX()) throw new Error('La fecha no puede ser futura.');
      const args = { p_hechos: v.hechos, p_fecha: v.fecha, p_hora_inicio: v.hora_inicio, p_hora_fin: v.hora_fin, p_instruccion: v.instruccion, p_indicador: v.indicador, p_evidencia: v.evidencia, p_sugerencia: v.sugerencia };
      if (isEdit) await rpc('case_resubmit', { p_id: c.id, ...args, p_comentario: readFields(el, [{ k: 'comentario' }]).comentario });
      else await rpc('case_create', { p_employee: employee.id, p_kind: grave ? 'grave' : 'ordinario', ...args });
      onDone && onDone();
    } }]
  });
  return m;
}

const CS = { tab: 'pend', q: '' };
async function viewCasos() {
  const v = $('#view');
  const [cases, emps] = await Promise.all([db('cases').order('created_at', false).limit(500).get(), db('employees').select('id,nombre,apellido_paterno,apellido_materno,area_id,group_id,status').get()]);
  const empById = Object.fromEntries(emps.map((e) => [e.id, e]));
  const pend = cases.filter(pendingForMe);
  const open = cases.filter((c) => c.status !== 'cerrado');
  const list = CS.tab === 'pend' ? pend : CS.tab === 'open' ? open : cases;
  const q = norm(CS.q);
  const rows = list.filter((c) => !q || norm(fullName(empById[c.employee_id]) + ' ' + c.folio + ' ' + c.hechos).includes(q));
  v.innerHTML = `<div class="pagehead"><div><h1>Casos</h1><div class="muted small">${pend.length} pendientes para ti · ${open.length} abiertos</div></div></div>
    <div class="card pad" style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">
      <div class="seg" role="group" aria-label="Filtro"><button type="button" data-ct="pend" class="${CS.tab === 'pend' ? 'on' : ''}">Pendientes para mí (${pend.length})</button><button type="button" data-ct="open" class="${CS.tab === 'open' ? 'on' : ''}">Abiertos</button><button type="button" data-ct="all" class="${CS.tab === 'all' ? 'on' : ''}">Todos</button></div>
      <input class="inp" id="cq" type="search" placeholder="Buscar por nombre, folio o hechos" value="${esc(CS.q)}" aria-label="Buscar casos">
    </div>
    <div class="list" id="clist">${rows.length ? rows.map((c) => { const e = empById[c.employee_id]; return `<button type="button" class="item" data-case="${c.id}">
      <span class="mono small muted" style="width:44px">#${c.folio}</span>
      <span class="grow"><span class="nm">${esc(fullName(e))}</span> <span class="badge ${c.kind === 'grave' ? 'b-bad' : 'b-acc'}">${esc(caseType(c))}</span><br><span class="small muted">${esc(areaName(c.area_id))} · ${caseDates(c)} · ${esc(c.hechos.slice(0, 80))}</span></span>
      ${caseBadge(c.status)}</button>`; }).join('') : `<div class="card empty">${CS.tab === 'pend' ? 'No tienes casos pendientes.' : 'Sin casos.'}</div>`}</div>`;
  $$('[data-ct]').forEach((b) => b.onclick = () => { CS.tab = b.dataset.ct; viewCasos(); });
  $('#cq').oninput = (e) => { CS.q = e.target.value; clearTimeout(viewCasos._t); viewCasos._t = setTimeout(() => viewCasos().then(() => { const i = $('#cq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }), 300); };
  $$('[data-case]').forEach((b) => b.onclick = () => openCase(b.dataset.case));
  updateCaseBadge(pend.length);
}
function updateCaseBadge(n) {
  $$('[data-v="casos"]').forEach((a) => {
    let b = a.querySelector('.cnt'); if (!b) { b = document.createElement('span'); b.className = 'cnt badge b-bad'; b.style.marginLeft = 'auto'; a.appendChild(b); }
    b.textContent = n; b.style.display = n ? '' : 'none';
  });
}
async function refreshCaseBadge() {
  if (!VIEWS.casos.roles.includes(role())) return;
  try { const cases = await db('cases').select('id,status,created_by').neq('status', 'cerrado').get(); updateCaseBadge(cases.filter(pendingForMe).length); } catch { /* sin conexión */ }
}

async function openCase(id) {
  const [c] = await db('cases').eq('id', id).get();
  if (!c) return toast('Caso no encontrado o sin permiso', true);
  const since = addDays(c.fecha_hechos, -29);
  const [events, [emp], att, corr, prev] = await Promise.all([
    db('case_events').eq('case_id', id).order('at').get(),
    db('employees').select('id,nombre,apellido_paterno,apellido_materno,area_id,group_id,status,puesto').eq('id', c.employee_id).get(),
    db('attendance').select('fecha,status').eq('employee_id', c.employee_id).gte('fecha', since).lte('fecha', c.fecha_hechos).get(),
    is('nomina') ? Promise.resolve([]) : db('corrections').select('fecha,resultado').eq('employee_id', c.employee_id).gte('fecha', since).lte('fecha', c.fecha_hechos).get().catch(() => []),
    db('cases').select('id,folio,status,fecha_hechos,decision,kind').eq('employee_id', c.employee_id).neq('id', id).get()
  ]);
  const faltas = att.filter((a) => a.status === 'falta').length, retardos = att.filter((a) => a.status === 'retardo').length;
  const noCorr = corr.filter((x) => x.resultado === 'no_corrigio').length;
  const kv = (rows) => `<div class="kv">${rows.filter((r) => r[1] != null && r[1] !== '').map(([k, val]) => `<span>${esc(k)}</span><span>${esc(val)}</span>`).join('')}</div>`;
  const val = c.validacion || {};
  const body = `
    <div class="row">${caseBadge(c.status)}<span class="badge ${c.kind === 'grave' ? 'b-bad' : 'b-acc'}">${c.kind === 'grave' ? 'Riesgo · ' : 'Solicitud · '}${esc(caseType(c))}</span><span class="small muted">${esc(areaName(c.area_id))} · ${esc(groupName(c.group_id))}</span></div>
    <div class="card pad"><div class="eyebrow" style="margin-bottom:8px">Hechos · reportó ${esc(profName(c.created_by))}</div>${kv([
      [c.solicitud_lider || c.riesgo_tipo ? 'Razón' : 'Qué ocurrió', c.hechos], ['Cuándo', caseDates(c) + (c.hora_inicio ? ` · ${String(c.hora_inicio).slice(0, 5)} a ${String(c.hora_fin || '').slice(0, 5)}` : '')],
      ['Duración', c.duracion_min != null ? c.duracion_min + ' min' : null], ['Instrucción', c.instruccion], ['Indicador', c.indicador], ['Evidencias', c.evidencia], ['Sugerencia del líder', c.sugerencia]])}</div>
    <div class="card pad"><div class="eyebrow" style="margin-bottom:8px">Antecedentes · 30 días antes de los hechos</div>
      <div class="row small"><span class="badge ${faltas > 3 ? 'b-bad' : faltas ? 'b-warn' : 'b-mut'}">${faltas} faltas</span><span class="badge ${retardos ? 'b-warn' : 'b-mut'}">${retardos} retardos</span>${is('nomina') ? '' : `<span class="badge ${noCorr ? 'b-bad' : 'b-mut'}">${corr.length} correcciones · ${noCorr} sin corregir</span>`}<span class="badge ${prev.length ? 'b-warn' : 'b-mut'}">${prev.length} casos anteriores</span></div>
      ${prev.length ? `<div class="small muted" style="margin-top:6px">${prev.map((p) => `#${p.folio} ${fmtDate(p.fecha_hechos)} · ${CASE_ST[p.status][0]}${p.decision ? ' · ' + MEDIDAS[p.decision] : ''}`).join('<br>')}</div>` : ''}</div>
    ${c.validacion ? `<div class="card pad"><div class="eyebrow" style="margin-bottom:8px">Validación de Supervisión · solicita: ${esc(SOLICITUDES[c.solicitud_tipo] || '')}</div>${kv(PREGUNTAS.map((p, i) => [p, val['q' + (i + 1)]]))}</div>` : ''}
    ${c.analisis ? `<div class="card pad"><div class="eyebrow" style="margin-bottom:8px">Análisis de RH</div>${kv([['Clasificación', CLASIF[c.clasificacion]], ['Análisis', c.analisis], ['Propone', MEDIDAS[c.propuesta]]])}</div>` : ''}
    ${c.decision ? `<div class="card pad"><div class="eyebrow" style="margin-bottom:8px">Decisión</div>${kv([['Medida', MEDIDAS[c.decision]], ['Nota', c.decision_nota], ['Resultado', c.resultado]])}</div>` : ''}
    <div><div class="eyebrow" style="margin-bottom:6px">Seguimiento</div>${events.map((ev) => `<div class="log"><span class="tm" style="width:auto">${fmtDateTime(ev.at)}</span><span class="grow"><b>${esc(ev.user_name || '—')}</b> <span class="small muted">${esc(ROLES[ev.user_role] || '')}</span><br>${esc(ev.accion)}${ev.comentario ? `<br><span class="small muted">“${esc(ev.comentario)}”</span>` : ''}</span></div>`).join('')}</div>`;
  const reload = () => { viewCasos().catch(() => {}); };
  const actions = [];
  const area = c.area_id;
  if (c.status === 'regresado' && (c.created_by === S.me.id || is('developer'))) actions.push({ label: 'Completar y reenviar', cls: 'primary', run: () => { setTimeout(() => (c.solicitud_lider || c.riesgo_tipo ? requestForm : caseForm)({ employee: emp, existing: c, onDone: () => { toast('Reenviado a Supervisión'); reload(); } }), 0); } });
  if (c.status === 'en_validacion' && (is('developer') || (is('supervisor') && S.myAreas.includes(area)))) {
    actions.push({ label: 'Regresar al líder', cls: 'danger', run: () => { setTimeout(() => simpleCaseAction('Regresar al líder', [{ k: 'c', label: 'Qué falta para completar el expediente', type: 'textarea', req: true, full: true }], (v) => rpc('case_return', { p_id: c.id, p_comentario: v.c }), reload), 0); } });
    actions.push({ label: 'Validar y escalar a RH', cls: 'primary', run: () => { setTimeout(() => validateForm(c, reload), 0); } });
  }
  if (c.status === 'en_rh' && (is('developer') || (is('rh_general', 'rh_area') && S.myAreas.includes(area)))) actions.push({ label: 'Analizar y proponer', cls: 'primary', run: () => { setTimeout(() => simpleCaseAction('Análisis de RH', [
    { k: 'cl', label: 'Clasificación', type: 'select', req: true, val: c.kind === 'grave' ? 'grave' : '', options: [['', 'Elegir…'], ...Object.entries(CLASIF)] },
    { k: 'pr', label: 'Medida que propones', type: 'select', req: true, options: [['', 'Elegir…'], ...Object.entries(MEDIDAS)] },
    { k: 'an', label: 'Análisis laboral y documental', type: 'textarea', req: true, full: true, hint: 'Antecedentes, evidencia revisada, justificación del trabajador y fundamento.' }],
    (v) => rpc('case_analyze', { p_id: c.id, p_clasificacion: v.cl, p_analisis: v.an, p_propuesta: v.pr }), reload), 0); } });
  if (c.status === 'en_decision' && is('developer')) actions.push({ label: 'Decidir', cls: 'primary', run: () => { setTimeout(() => simpleCaseAction('Decisión', [
    { k: 'd', label: 'Medida', type: 'select', req: true, val: c.propuesta, options: Object.entries(MEDIDAS) },
    { k: 'n', label: 'Nota', type: 'textarea', full: true }], (v) => rpc('case_decide', { p_id: c.id, p_decision: v.d, p_nota: v.n }), reload), 0); } });
  if (c.status === 'decidido' && is('developer')) actions.push({ label: 'Cerrar caso', cls: 'primary', run: () => { setTimeout(() => simpleCaseAction('Cerrar caso', [{ k: 'r', label: 'Resultado que se comunica a Marketing', type: 'textarea', req: true, full: true, hint: 'Solo lo necesario para operar: cambio de equipo, periodo de seguimiento o baja.' }], (v) => rpc('case_close', { p_id: c.id, p_resultado: v.r }), reload,
    c.decision === 'terminacion' ? 'Recuerda aplicar la baja en Personal con su motivo.' : null), 0); } });
  if (is('developer')) actions.push({ label: 'Ver ficha laboral', run: () => { setTimeout(() => openEmployee(c.employee_id), 0); } });
  modal({ title: `Caso #${c.folio} · ${fullName(emp)}`, body, actions, wide: true });
}
function simpleCaseAction(title, fields, run, done, note) {
  modal({ title, body: (note ? `<div class="notice n-info">${esc(note)}</div>` : '') + fieldsHtml(fields), actions: [{ label: 'Cancelar' }, { label: 'Confirmar', cls: 'primary', run: async ({ el }) => { await run(readFields(el, fields)); toast('Listo'); done(); } }] });
}
function validateForm(c, done) {
  const qs = PREGUNTAS.map((p, i) => ({ k: 'q' + (i + 1), label: p, type: 'textarea', req: true, full: true }));
  const extra = [{ k: 'sol', label: 'Qué se solicita a RH', type: 'select', req: true, options: [['', 'Elegir…'], ...Object.entries(SOLICITUDES)] }, { k: 'com', label: 'Comentario (opcional)', full: true }];
  modal({ title: `Validar caso #${c.folio}`, wide: true,
    body: `<div class="notice n-info">Si alguna pregunta no tiene respuesta, el expediente está incompleto: regrésalo al líder.</div>${fieldsHtml(qs)}${fieldsHtml(extra)}`,
    actions: [{ label: 'Cancelar' }, { label: 'Escalar a RH', cls: 'primary', run: async ({ el }) => {
      const v = readFields(el, [...qs, ...extra]);
      const respuestas = Object.fromEntries(qs.map((q) => [q.k, v[q.k]]));
      await rpc('case_validate', { p_id: c.id, p_respuestas: respuestas, p_solicitud: v.sol, p_comentario: v.com });
      toast('Escalado a RH'); done();
    } }] });
}

// ───────────────────────── PWA ─────────────────────────
if ('serviceWorker' in navigator && location.protocol === 'https:' && !CFG.demo) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
boot();
