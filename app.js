/* Enterprise HR · app web · Fase 1 (base, Personal, Pase de lista, Asistencia, Usuarios, Catálogos, Bitácora)
   Los permisos reales están en la base de datos (RLS). Aquí solo se decide qué botones mostrar. */
'use strict';
const CFG = window.HR_CONFIG || {};
const APP_VERSION = '0.16.1';
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
// Pase de lista: estatus (A/F/R) + aviso opcional (Nuevo ingreso / Baja) + incidencia del día (Permiso / Descanso / Inactividad, con comentario)
const ATT = { asistio: 'Asistencia', falta: 'Falta', retardo: 'Retardo' };
const ATT_PM = { asistio: 'Presente', falta: 'Ausente', salida: 'Salida anticipada' };   // pase de la tarde (cierre)
const TURNO = { manana: 'Mañana · Entrada', tarde: 'Tarde · Cierre' };
const stLabel = (a) => a && a.status ? (a.turno === 'tarde' ? ATT_PM : ATT)[a.status] : null;
const AVISO = { nuevo_ingreso: 'Nuevo ingreso', baja: 'Baja' };
const INC = { permiso: 'Permiso', descanso: 'Descanso', inactividad: 'Inactividad', vacaciones: 'Vacaciones' };
const INC_TL = ['permiso', 'descanso', 'inactividad'];   // las vacaciones las registra RH
const ATT_SHORT = { asistio: 'A', falta: 'F', retardo: 'R', salida: 'S', permiso: 'P', descanso: 'D', inactividad: 'I', vacaciones: 'V' };
const ATT_COLOR = { asistio: 'var(--ok)', falta: 'var(--bad)', retardo: 'var(--warn)', salida: 'var(--warn)', permiso: '#4453A8', descanso: '#6B7785', inactividad: '#B23A0A', vacaciones: '#0E7C86' };
const ATT_BADGE = { asistio: 'b-ok', falta: 'b-bad', retardo: 'b-warn', salida: 'b-warn', permiso: 'b-acc', descanso: 'b-mut', inactividad: 'b-warn', vacaciones: 'b-ok', nuevo_ingreso: 'b-acc', baja: 'b-mut' };
const attCounts = () => Object.fromEntries([...Object.keys(ATT), 'salida', ...Object.keys(INC), ...Object.keys(AVISO)].map((k) => [k, 0]));
// Asistencia/Falta/Retardo cuentan solo en la mañana; en la tarde solo cuenta la salida anticipada
const countAtt = (c, a) => { if (!a) return; if (a.status && (a.turno !== 'tarde' || a.status === 'salida')) c[a.status]++; if (a.incidencia) c[a.incidencia]++; if (a.aviso) c[a.aviso]++; };
const attParts = (a) => a ? [stLabel(a), a.aviso && 'Aviso: ' + AVISO[a.aviso], INC[a.incidencia]].filter(Boolean) : [];
// Diferencia entre la entrada y el cierre del mismo día
function attMismatch(m, t) {
  if (!t) return null;
  if (!m) return 'Sin registro en la mañana';
  const presentM = m.status === 'asistio' || m.status === 'retardo';
  if (presentM && t.status === 'falta') return 'Asistió en la mañana; ausente al cierre';
  if (m.status === 'falta' && (t.status === 'asistio' || t.status === 'salida')) return 'Faltó en la mañana; presente al cierre';
  if (!m.status && m.incidencia === 'descanso' && t.status && t.status !== 'falta') return 'Descanso en la mañana; presente al cierre';
  return null;
}
const nowHM = () => new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
const areaCierre = (areaId) => String(((S.areas || []).find((a) => a.id === areaId) || {}).hora_cierre || '16:00').slice(0, 5);
const pmOpen = (areaId, fecha) => fecha < todayMX() || is('developer') || nowHM() >= areaCierre(areaId);
const attLabel = (a) => attParts(a).join(' · ');
const attShort = (a) => a ? (ATT_SHORT[a.status] || '') + (a.incidencia ? (a.status ? '+' : '') + ATT_SHORT[a.incidencia] : '') : '';
const groupLabel = (g) => (g.tipo === 'lideres' ? 'Líderes' : g.name);
const attKey = (a) => a ? (a.status || a.incidencia) : null;
const attBadges = (a) => [a.status && `<span class="badge ${ATT_BADGE[a.status]}">${stLabel(a)}</span>`, a.incidencia && `<span class="badge ${ATT_BADGE[a.incidencia]}">${INC[a.incidencia]}</span>`, a.aviso && `<span class="badge ${ATT_BADGE[a.aviso]}">Aviso: ${AVISO[a.aviso]}</span>`].filter(Boolean).join(' ');
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
      catch (e) {
        // Solo si el servidor rechaza el token se cierra la sesión; sin internet se conserva para reintentar
        if (e.status === 400 || e.status === 401 || e.status === 403) { setSession(null); throw new Error('Tu sesión expiró. Vuelve a entrar.'); }
        throw new Error('Sin conexión. Revisa tu internet e intenta de nuevo.');
      }
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
  offset(n) { this.off = n; return this; }
  // Todas las filas en páginas de 1000 (límite del servidor)
  async getAll(page = 1000) { const out = []; for (let o = 0; ; o += page) { this.lim = page; this.off = o; const r = await this.get(); out.push(...r); if (r.length < page) return out; } }
  qs() {
    const u = new URLSearchParams(); u.set('select', this.sel);
    for (const [c, v] of this.f) u.append(c, v);
    if (this.ord.length) u.set('order', this.ord.join(','));
    if (this.lim) u.set('limit', String(this.lim));
    if (this.off) u.set('offset', String(this.off));
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
// Últimos errores que vio la persona: se adjuntan (si quiere) al reportar un error
const ERRLOG = [];
function logErr(m) { ERRLOG.push({ at: new Date().toISOString(), msg: String(m).slice(0, 300), vista: (location.hash || '').replace(/^#\//, '') }); if (ERRLOG.length > 8) ERRLOG.shift(); }
window.addEventListener('error', (e) => logErr(e.message || 'Error de la página'));
window.addEventListener('unhandledrejection', (e) => logErr((e.reason && e.reason.message) || String(e.reason)));
function toast(msg, err = false) {
  if (err) logErr(msg);
  $$('.toast').forEach((x) => x.remove());
  const t = document.createElement('div'); t.className = 'toast' + (err ? ' err' : ''); t.textContent = msg; t.setAttribute('role', 'status');
  document.body.appendChild(t); setTimeout(() => t.remove(), err ? 5200 : 2800);
}
function modal({ title, body, actions = [], wide = false, onClose, sheet = false }) {
  const bg = document.createElement('div'); bg.className = 'modal-bg' + (sheet ? ' sheet' : '');
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}" style="${wide ? 'max-width:860px' : ''}">
    <header><h2>${esc(title)}</h2><button class="x" aria-label="Cerrar">×</button></header>
    <div class="mb"></div><footer></footer></div>`;
  const mb = $('.mb', bg); if (typeof body === 'string') mb.innerHTML = body; else if (body) mb.appendChild(body);
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape' && bg === [...document.querySelectorAll('.modal-bg')].pop()) { e.stopImmediatePropagation(); close(); } };
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
    if (f.type === 'select' && v !== '' && v != null && !(f.options || []).some((o) => String(o[0]) === String(v))) f = { ...f, options: [...(f.options || []), [v, (f.missing || 'Valor actual') + ' (no disponible)']] };
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
  setSession(null); S.me = null; location.hash = '';
  // La siguiente persona en este dispositivo empieza limpia
  Object.assign(LS, { group: null, fecha: null, open: null, turno: null }); store.del('hr.lista.group');
  // Filtros y memoria de la sesión anterior: se recarga la página para empezar de cero
  location.reload();
}

// ───────────────────────── shell y rutas ─────────────────────────
const VIEWS = {
  lista: { label: 'Pase de lista', short: 'Lista', ic: '✓', grupo: 'Operación', roles: ['developer', 'nomina', 'rh_general', 'rh_area', 'supervisor', 'tl'], render: () => viewLista() },
  personal: { label: 'Personal', ic: '👥', grupo: 'Personal', roles: ['developer', 'director', 'nomina', 'rh_general', 'rh_area', 'supervisor', 'tl'], render: () => viewPersonal() },
  casos: { label: 'Casos', ic: '⚑', grupo: 'Operación', roles: ['developer', 'director', 'rh_general', 'rh_area', 'supervisor', 'tl'], render: () => viewCasos() },
  reclutamiento: { label: 'Reclutamiento', short: 'Reclut.', ic: '＋', grupo: 'Personal', roles: ['developer', 'director', 'rh_general', 'rh_area', 'supervisor'], render: () => viewReclutamiento() },
  documentos: { label: 'Documentos', short: 'Docs', ic: '📄', grupo: 'Personal', roles: ['developer', 'director', 'nomina', 'rh_general', 'rh_area', 'supervisor', 'tl'], render: () => viewDocumentos() },
  operacion: { label: 'Actividad', ic: '◔', grupo: 'Operación', roles: ['developer', 'supervisor'], render: () => viewOperacion() },
  asistencia: { label: 'Asistencia', ic: '▦', grupo: 'Operación', roles: ['developer', 'director', 'nomina', 'rh_general', 'rh_area', 'supervisor'], render: () => viewAsistencia() },
  chat: { label: 'Mensajes', short: 'Chat', ic: '💬', grupo: 'Comunicación', roles: ['developer', 'director', 'nomina', 'rh_general', 'rh_area', 'supervisor', 'tl'], render: () => viewChat() },
  prenomina: { label: 'Pre-nómina', short: 'Nómina', ic: '$', grupo: 'Nómina', roles: ['developer', 'director', 'nomina'], render: () => viewPrenomina() },
  usuarios: { label: 'Usuarios', ic: '🔑', grupo: 'Administración', roles: ['developer'], render: () => viewUsuarios() },
  catalogos: { label: 'Áreas y grupos', ic: '⌂', grupo: 'Administración', roles: ['developer'], render: () => viewCatalogos() },
  plantillas: { label: 'Plantillas', ic: '✎', grupo: 'Administración', roles: ['developer'], render: () => viewPlantillas() },
  buzon: { label: 'Buzón', ic: '✉', grupo: 'Administración', roles: ['developer'], render: () => viewBuzon() },
  bitacora: { label: 'Bitácora', ic: '🕘', grupo: 'Administración', roles: ['developer', 'director'], render: () => viewBitacora() }
};
const myViews = () => Object.entries(VIEWS).filter(([, v]) => v.roles.includes(role()));
// Íconos de línea uniformes (24×24, trazo)
const ICONS = {
  lista: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  personal: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 3-4.8 5.5-4.8s4.9 1.8 5.5 4.8"/><circle cx="16.5" cy="9" r="2.6"/><path d="M15.5 14.4c2.3-.3 4.4 1.2 5 4.6"/>',
  casos: '<path d="M6 21V4"/><path d="M6 4h11l-2.5 4 2.5 4H6"/>',
  reclutamiento: '<circle cx="10" cy="8" r="3.5"/><path d="M3.5 20c.7-3.7 3.4-5.8 6.5-5.8 1.4 0 2.7.4 3.8 1.2"/><path d="M18 14v6M15 17h6"/>',
  documentos: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/><path d="M10 12h5M10 15.5h5"/>',
  operacion: '<path d="M3 12h4l2.5-6 4 12 2.5-6H21"/>',
  asistencia: '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  usuarios: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 7l2 2M14 9l2 2"/>',
  catalogos: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  plantillas: '<path d="M6 3h8l4 4v6"/><path d="M6 3v18h6"/><path d="M14 3v4h4"/><path d="M14.5 21l1-3.5 5-5 2.5 2.5-5 5z"/>',
  buzon: '<path d="M3 13l2.5-7h13L21 13v6H3z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>',
  bitacora: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  chat: '<path d="M4 5.5h16v10.5H10l-4.5 3.5V16H4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  prenomina: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v5M17.5 9.5v5"/>',
  mas: '<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>',
  fb: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
  cuenta: '<circle cx="12" cy="8.5" r="3.5"/><path d="M5 20c.8-3.6 3.6-5.5 7-5.5s6.2 1.9 7 5.5"/>'
};
const icon = (k, sz = 22) => `<svg viewBox="0 0 24 24" width="${sz}" height="${sz}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[k] || ''}</svg>`;
// En el celular: máximo 4 secciones abajo + "Más" (el resto en un panel agrupado)
const TAB_PRIO = ['lista', 'personal', 'chat', 'casos', 'documentos', 'reclutamiento', 'asistencia', 'prenomina', 'operacion', 'buzon', 'usuarios', 'catalogos', 'plantillas', 'bitacora'];
// Supervisión: su trabajo diario es la lista y la actividad; documentos va en "Más"
const TAB_PRIO_SUP = ['lista', 'personal', 'casos', 'operacion', 'chat', 'asistencia', 'reclutamiento', 'documentos'];
// Nómina: su trabajo diario es la pre-nómina
const TAB_PRIO_NOM = ['lista', 'prenomina', 'chat', 'personal', 'asistencia', 'documentos'];
const navCount = (k) => Number(($(`.nav a[data-v="${k}"] .cnt`) || {}).textContent || 0);
function refreshMoreBadge() {
  const t = $('#tabMore'); if (!t) return;
  const n = (S.moreKeys || []).reduce((a, k) => a + navCount(k), 0);
  let b = t.querySelector('.cnt'); if (!b) { b = document.createElement('span'); b.className = 'cnt badge b-bad'; t.appendChild(b); }
  b.textContent = n; b.style.display = n ? '' : 'none';
}
function openMore() {
  const keys = S.moreKeys || []; const groups = {};
  keys.forEach((k) => { (groups[VIEWS[k].grupo] = groups[VIEWS[k].grupo] || []).push(k); });
  const m = modal({ title: 'Más secciones', sheet: true, body: `
    ${Object.entries(groups).map(([g, ks]) => `<div class="eyebrow">${esc(g)}</div><div class="tiles">${ks.map((k) => `<a class="tile" href="#/${k}" data-v="${k}">${icon(k, 26)}<span>${esc(VIEWS[k].label)}</span>${navCount(k) ? `<span class="cnt badge b-bad">${navCount(k)}</span>` : ''}</a>`).join('')}</div>`).join('')}
    <div class="eyebrow">Cuenta</div><div class="tiles">
      <button type="button" class="tile" id="more_fb">${icon('fb', 26)}<span>Sugerencias y errores</span></button>
      <button type="button" class="tile" id="more_me">${icon('cuenta', 26)}<span>Mi cuenta</span></button></div>` });
  $$('.tile[data-v]', m.el).forEach((a) => a.onclick = () => m.close());
  $('#more_fb', m.el).onclick = () => { m.close(); openFeedback(); };
  $('#more_me', m.el).onclick = () => { m.close(); $('#menu').click(); };
}
function renderShell() {
  const nav = myViews().map(([k, v]) => `<a href="#/${k}" data-v="${k}">${icon(k, 20)}${esc(v.label)}</a>`).join('');
  const prio = is('supervisor') ? TAB_PRIO_SUP : is('nomina') ? TAB_PRIO_NOM : TAB_PRIO;
  const byPrio = myViews().sort((a, b) => prio.indexOf(a[0]) - prio.indexOf(b[0]));
  const primary = byPrio.length <= 5 ? byPrio : byPrio.slice(0, 4);
  S.moreKeys = byPrio.length <= 5 ? [] : byPrio.slice(4).map(([k]) => k);
  const tabs = primary.map(([k, v]) => `<a href="#/${k}" data-v="${k}"><span class="ic">${icon(k)}</span><span class="lb">${esc(v.short || v.label)}</span></a>`).join('')
    + (S.moreKeys.length ? `<a href="#" id="tabMore" role="button" aria-label="Más secciones"><span class="ic">${icon('mas')}</span><span class="lb">Más</span></a>` : '');
  $('#app').innerHTML = `
    <aside class="side"><div class="brand">Enterprise HR<small>v${APP_VERSION}</small></div><nav class="nav">${nav}</nav>
      <div class="me"><button class="btn sm fb-btn" id="fb">💬 Sugerencias y errores</button><b>${esc(S.me.full_name)}</b><span class="muted" style="color:#A9B6C2">${esc(ROLES[role()])}</span>
      <div class="row" style="margin-top:10px"><button class="btn sm" id="pw" style="background:none;color:#fff;border-color:#3A4B5A">Contraseña</button><button class="btn sm" id="lo" style="background:none;color:#fff;border-color:#3A4B5A">Salir</button></div></div></aside>
    <div class="main"><div class="top"><span class="t" id="ttl">Enterprise HR</span><button class="btn sm" id="fbTop" style="background:var(--ink2);color:#fff;border-color:#3A4B5A" aria-label="Sugerencias y reportar errores">💬</button><button class="btn sm" id="menu" style="background:var(--ink2);color:#fff;border-color:#3A4B5A" aria-label="Mi cuenta">${esc(S.me.full_name.split(' ')[0])} ▾</button></div>
      ${CFG.demo ? `<div class="notice n-warn" style="border-radius:0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 12px"><span class="grow"><b>Demo</b> · como <b>${esc(S.me.full_name)}</b></span><button class="btn sm" id="demoSwitch">Cambiar usuario</button><button class="btn sm" id="demoReset">Reiniciar</button></div>` : ''}
      <div class="content" id="view"></div></div>
    <nav class="tabbar">${tabs}</nav>`;
  if ($('#tabMore')) $('#tabMore').onclick = (e) => { e.preventDefault(); openMore(); };
  $('#lo').onclick = logout;
  $('#pw').onclick = changePassword;
  $('#fb').onclick = () => openFeedback();
  $('#fbTop').onclick = () => openFeedback();
  if (CFG.demo) {
    $('#demoSwitch').onclick = logout;
    $('#demoReset').onclick = async () => { if (await confirmBox('Reiniciar demo', 'Se borran tus cambios y vuelven los datos de ejemplo.', { okLabel: 'Reiniciar' })) { window.HR_DEMO.reset(); S.me = null; location.hash = ''; renderLogin(); } };
  }
  $('#menu').onclick = () => modal({
    title: S.me.full_name, body: `<div class="kv"><span>Rol</span><span>${esc(ROLES[role()])}</span><span>Correo</span><span>${esc(S.me.email || '')}</span><span>Versión</span><span>${APP_VERSION}</span></div>`,
    actions: [{ label: 'Sugerencias y errores', run: () => { setTimeout(() => openFeedback(), 0); } }, { label: 'Cambiar contraseña', run: () => { setTimeout(changePassword, 0); } }, { label: 'Cerrar sesión', cls: 'danger', run: () => { logout(); } }]
  });
}
function route() {
  const views = myViews(); if (!views.length) return renderNoRole();
  const exp = location.hash.match(/^#\/expediente\/([0-9a-f-]{36})/i);
  if (exp && (canSeeExp() || is('nomina'))) {
    $$('[data-v]').forEach((a) => a.classList.toggle('on', a.dataset.v === 'personal'));
    if ($('#tabMore')) $('#tabMore').classList.toggle('on', (S.moreKeys || []).includes('personal'));
    const ttl = $('#ttl'); if (ttl) ttl.textContent = 'Perfil';
    S.prevView = S.view; S.view = 'expediente'; rollWorkday();
    $('#view').innerHTML = '<div class="empty">Cargando…</div>'; window.scrollTo(0, 0);
    viewExpediente(exp[1]).catch((e) => { $('#view').innerHTML = `<div class="notice n-bad">${esc(e.message)}</div>`; });
    return;
  }
  let k = (location.hash.match(/^#\/(\w+)/) || [])[1];
  if (!k || !VIEWS[k] || !VIEWS[k].roles.includes(role())) k = is('tl', 'supervisor') ? 'lista' : 'personal';
  $$('[data-v]').forEach((a) => a.classList.toggle('on', a.dataset.v === k));
  if ($('#tabMore')) $('#tabMore').classList.toggle('on', (S.moreKeys || []).includes(k));
  const ttl = $('#ttl'); if (ttl) ttl.textContent = VIEWS[k].label;
  const v = $('#view'); v.innerHTML = '<div class="empty">Cargando…</div>';
  S.prevView = S.view; S.view = k;
  Promise.resolve(VIEWS[k].render()).catch((e) => { v.innerHTML = `<div class="notice n-bad">${esc(e.message)}</div>`; });
  rollWorkday();
  if (k !== 'casos') refreshCaseBadge();
  if (k !== 'documentos') refreshDocBadge();
  if (k !== 'buzon') refreshBuzonBadge();
  if (k !== 'chat') refreshChatBadge();
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
const LS = { group: null, fecha: null, open: null, turno: null };
// Si la app quedó abierta de un día para otro, las fechas de trabajo vuelven a "hoy"
let WORKDAY = todayMX();
function rollWorkday() {
  const t = todayMX(); if (t === WORKDAY) return;
  WORKDAY = t; LS.fecha = null; LS.turno = null;
  if (typeof AS !== 'undefined') AS.fecha = null; if (typeof OP !== 'undefined') OP.fecha = null; if (typeof BS !== 'undefined') BS.fecha = null;
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && S.me && todayMX() !== WORKDAY) { rollWorkday(); route(); } });
const sortGroups = (gs) => gs.sort((a, b) => ((is('supervisor') && a.tipo === 'lideres' ? '0' : '1') + areaName(a.area_id) + (a.tipo === 'lideres' ? '0' : '1') + a.name)
  .localeCompare((is('supervisor') && b.tipo === 'lideres' ? '0' : '1') + areaName(b.area_id) + (b.tipo === 'lideres' ? '0' : '1') + b.name, 'es'));
async function viewLista() {
  const v = $('#view');
  const groups = sortGroups(writableGroups());
  if (!groups.length) { v.innerHTML = `<div class="card empty">${is('tl') ? 'Aún no tienes un grupo asignado. Pide a Daniel que te asigne uno.' : 'No hay grupos en tus áreas.'}</div>`; return; }
  if (!LS.group || !groups.some((g) => g.id === LS.group)) LS.group = (store.get('hr.lista.group') && groups.some((g) => g.id === store.get('hr.lista.group'))) ? store.get('hr.lista.group') : groups[0].id;
  if (!LS.fecha) LS.fecha = todayMX();
  const g = groups.find((x) => x.id === LS.group);
  const [emps, day] = await Promise.all([
    db('employees').select('id,nombre,apellido_paterno,apellido_materno,puesto,group_id,area_id,status,origen').eq('group_id', g.id).in('status', ['activo', 'alta_pendiente']).get(),
    db('attendance_days').eq('group_id', g.id).eq('fecha', LS.fecha).get()
  ]);
  emps.sort(sortName);
  const ids = emps.map((e) => e.id);
  const [att, faltas] = ids.length ? await Promise.all([
    db('attendance').in('employee_id', ids).eq('fecha', LS.fecha).get(),
    db('faltas_30d').in('employee_id', ids).get()
  ]) : [[], []];
  const recM = {}, recT = {};
  att.forEach((a) => { (a.turno === 'tarde' ? recT : recM)[a.employee_id] = a; });
  const fx = Object.fromEntries(faltas.map((f) => [f.employee_id, f.faltas]));
  const d = day[0] || {};
  // Turno inicial: la tarde si la mañana ya se envió y el cierre está habilitado
  if (!LS.turno) LS.turno = d.sent_at && !d.sent_pm_at && pmOpen(g.area_id, LS.fecha) ? 'tarde' : (d.sent_pm_at ? 'tarde' : 'manana');
  const lockedDay = !!d.reviewed_at && !is('developer', 'nomina');
  // Vacaciones aprobadas que cubren este día: se registran solas (mañana) y no se pueden cambiar
  const vacs = ids.length ? await db('vacaciones').select('employee_id,fechas').in('employee_id', ids).eq('estado', 'aprobada').eq('tipo', 'disfrute').get().catch(() => []) : [];
  const vac = new Set(vacs.filter((x) => (x.fechas || []).includes(LS.fecha)).map((x) => x.employee_id));
  const falta = [...vac].filter((id) => !recM[id]);
  if (falta.length && !lockedDay && LS.fecha <= todayMX()) {
    try { (await db('attendance').insert(falta.map((id) => ({ employee_id: id, fecha: LS.fecha, turno: 'manana', status: null, aviso: null, incidencia: 'vacaciones', comentario: 'Vacaciones autorizadas por RH', incidencias: [] })), { onConflict: 'employee_id,fecha,turno' })).forEach((r) => { recM[r.employee_id] = r; }); } catch { /* lo registra el pase normal */ }
  }
  renderLista({ emps, recM, recT, fx, d, lockedDay, g, vac }, groups);
}
function renderLista(st, groups) {
  const v = $('#view');
  const { emps, recM, recT, fx, d, lockedDay, g } = st;
  const tarde = LS.turno === 'tarde';
  const rec = st.rec = tarde ? recT : recM;
  const open = !tarde || pmOpen(g.area_id, LS.fecha);
  const locked = lockedDay || !open;
  st.locked = locked;
  const done = emps.filter((e) => rec[e.id]).length, total = emps.length, pct = total ? Math.round(done * 100 / total) : 0;
  const diffs = tarde ? emps.filter((e) => attMismatch(recM[e.id], recT[e.id])).length : 0;
  const multiArea = new Set(groups.map((x) => x.area_id)).size > 1;
  const sentAt = tarde ? d.sent_pm_at : d.sent_at, sentBy = tarde ? d.sent_pm_by : d.sent_by;
  const lider = g.tipo === 'lideres';
  const segBtn = (k) => { const sa = k === 'tarde' ? d.sent_pm_at : d.sent_at; return `<button type="button" data-turno="${k}" class="${LS.turno === k ? 'on' : ''}" aria-pressed="${LS.turno === k}">${TURNO[k]}<span>${sa ? '✓ enviado ' + fmtTime(sa) : k === 'tarde' && !pmOpen(g.area_id, LS.fecha) ? 'desde las ' + areaCierre(g.area_id) : 'pendiente'}</span></button>`; };
  v.innerHTML = `
  <div class="att-head">
    <div class="row" style="justify-content:space-between">
      <div><div class="eyebrow" style="color:#A9B6C2">${esc(areaName(g.area_id))}${g.tl_id ? ' · TL ' + esc(profName(g.tl_id)) : ''}${lider ? ' · Supervisión' : ''}</div><div style="font-size:20px;font-weight:700">${lider ? 'Pase de lista de líderes' : 'Pase de lista'}</div></div>
      <input type="date" id="lf_date" value="${LS.fecha}" max="${todayMX()}" aria-label="Fecha" class="mono">
    </div>
    ${groups.length > 1 ? `<select id="lf_group" aria-label="Grupo">${groups.map((x) => `<option value="${x.id}"${x.id === g.id ? ' selected' : ''}>${multiArea ? esc(areaName(x.area_id)) + ' · ' : ''}${esc(groupLabel(x))}${x.tl_id && !is('tl') ? ' — ' + esc(profName(x.tl_id)) : ''}</option>`).join('')}</select>` : `<div style="font-weight:600">${esc(groupLabel(g))}</div>`}
    <div class="turnos" role="group" aria-label="Turno">${segBtn('manana')}${segBtn('tarde')}</div>
    <div class="row"><div class="prog"><i style="width:${pct}%"></i></div><span style="font-size:13px;font-weight:600">${done} de ${total}</span></div>
  </div>
  ${lockedDay ? `<div class="notice n-warn" style="margin-bottom:10px">Nómina ya revisó este día (${fmtDateTime(d.reviewed_at)}). Para corregir, pídelo a Nómina.</div>` : ''}
  ${d.reviewed_at && !lockedDay ? `<div class="notice n-info" style="margin-bottom:10px">Día revisado por ${esc(profName(d.reviewed_by))} · ${fmtDateTime(d.reviewed_at)}. Puedes corregir porque tienes rol de ${esc(ROLES[role()])}.</div>` : ''}
  ${tarde && !open ? `<div class="notice n-info" style="margin-bottom:10px">El pase de la tarde (cierre) se habilita a partir de las <b>${areaCierre(g.area_id)}</b>.</div>` : ''}
  ${tarde && open && diffs ? `<div class="notice n-warn" style="margin-bottom:10px"><b>${diffs}</b> ${diffs === 1 ? 'persona no coincide' : 'personas no coinciden'} con el pase de la mañana. Revísalas antes de enviar el cierre.</div>` : ''}
  ${total && !locked ? `<div class="row" style="margin-bottom:10px"><button class="btn ghost grow" id="allok"${done === total ? ' disabled' : ''}>${tarde ? 'Marcar pendientes igual que en la mañana' : 'Marcar pendientes como “Asistencia”'}</button></div>` : ''}
  <div class="list" id="people">${total ? emps.map((e) => personCard(e, rec[e.id], fx[e.id], locked, tarde ? recM[e.id] : null, st.vac && st.vac.has(e.id))).join('') : `<div class="card empty">${lider ? 'Aún no hay líderes en este grupo. Asígnalos desde Personal (grupo “Líderes”).' : 'No hay personal activo en este grupo.'}</div>`}</div>
  ${canAddToList(g) && !lockedDay ? '<button type="button" class="btn ghost add-person" id="addPerson">+ Agregar persona que no aparece en la lista</button>' : ''}
  ${total ? `<div class="stickybar">
    <button class="btn primary" id="send" ${done < total || locked ? 'disabled' : ''} style="${sentAt && done === total ? 'background:var(--ok);border-color:var(--ok)' : ''}">${done < total ? `Faltan ${total - done} por registrar` : sentAt ? `${tarde ? 'Cierre enviado' : 'Entrada enviada'} ✓ · reenviar` : tarde ? 'Enviar cierre (tarde)' : 'Enviar entrada (mañana)'}</button>
    <span class="small muted" style="text-align:center">${sentAt ? `Enviado por ${esc(profName(sentBy))} a las ${fmtTime(sentAt)}. ` : ''}Se envía dos veces al día: entrada por la mañana y cierre al final de la jornada.</span>
  </div>` : ''}`;
  const reload = () => viewLista().catch((e) => toast(e.message, true));
  $('#lf_date').onchange = (e) => { const val = e.target.value; if (!val || val > todayMX()) { e.target.value = LS.fecha; return toast('No se puede pasar lista a futuro', true); } LS.fecha = val; LS.turno = null; reload(); };
  if ($('#lf_group')) $('#lf_group').onchange = (e) => { LS.group = e.target.value; store.set('hr.lista.group', LS.group); LS.open = null; LS.turno = null; reload(); };
  if ($('#addPerson')) $('#addPerson').onclick = () => addPersonForm(g, reload);
  $$('[data-turno]').forEach((b) => b.onclick = () => { if (LS.turno === b.dataset.turno) return; LS.turno = b.dataset.turno; renderLista(st, groups); });
  if ($('#allok')) $('#allok').onclick = async (ev) => {
    const pend = emps.filter((e) => !rec[e.id]); if (!pend.length) return;
    let rows;
    if (tarde) {   // Copia la entrada: presente → Presente, falta → Ausente; incidencias del día se conservan
      rows = pend.filter((e) => recM[e.id]).map((e) => { const m = recM[e.id];
        return { employee_id: e.id, fecha: LS.fecha, turno: 'tarde', status: m.status ? (m.status === 'falta' ? 'falta' : 'asistio') : null, aviso: null, incidencia: m.incidencia || null, comentario: m.incidencia ? m.comentario : null, incidencias: [] }; });
      if (!rows.length) return toast('Nadie pendiente tiene registro en la mañana', true);
    } else rows = pend.map((e) => ({ employee_id: e.id, fecha: LS.fecha, turno: 'manana', status: 'asistio', aviso: null, incidencia: null, comentario: null, incidencias: [] }));
    ev.target.disabled = true;
    try {
      const saved = await db('attendance').insert(rows, { onConflict: 'employee_id,fecha,turno' });
      saved.forEach((r) => { rec[r.employee_id] = r; }); toast(`${saved.length} registrados`); renderLista(st, groups);
    } catch (e) { toast(e.message, true); ev.target.disabled = false; }
  };
  if ($('#send')) $('#send').onclick = async (ev) => {
    ev.target.disabled = true;
    try { await rpc('send_turno', { p_group: g.id, p_fecha: LS.fecha, p_turno: LS.turno }); toast(tarde ? 'Cierre enviado' : 'Entrada enviada'); reload(); }
    catch (e) { toast(e.message, true); ev.target.disabled = false; }
  };
  $$('#people .person').forEach((card) => wirePerson(card, st, groups));
}
// El líder agrega a alguien que RH no ha dado de alta: queda como alta pendiente en su grupo
const canAddToList = (g) => g.tipo !== 'lideres' && (is('developer') || (is('tl') && g.tl_id === S.me.id));
function addPersonForm(g, onDone) {
  const f = [
    { k: 'nombre', label: 'Nombre(s)', req: true },
    { k: 'apellido_paterno', label: 'Apellido paterno', req: true },
    { k: 'apellido_materno', label: 'Apellido materno' },
    { k: 'puesto', label: 'Puesto', val: (areaName(g.area_id) === 'Cobranza' ? 'Ejecutivo de cobranza' : areaName(g.area_id) === 'Marketing' ? 'Asesor de marketing' : '') },
    { k: 'fecha_ingreso', label: 'Fecha en que empezó', type: 'date', req: true, val: LS.fecha || todayMX(), max: todayMX() }
  ];
  modal({ title: `Agregar a ${groupLabel(g)} · ${areaName(g.area_id)}`,
    body: `<div class="notice n-info">Úsalo solo si la persona ya está trabajando y RH no la ha dado de alta. Queda como <b>Alta pendiente</b>: RH completa sus datos y Daniel confirma el alta. Mientras tanto puedes pasarle lista.</div>${fieldsHtml(f)}`,
    actions: [{ label: 'Cancelar' }, { label: 'Agregar a mi lista', cls: 'primary', run: async ({ el }) => {
      const v = readFields(el, f);
      if (v.fecha_ingreso > todayMX()) throw new Error('La fecha no puede ser futura.');
      await db('employees').insert([{ ...v, area_id: g.area_id, group_id: g.id, status: 'alta_pendiente' }]);
      toast('Agregada · RH debe completar su alta'); onDone && onDone();
    } }] });
}
const pendBadge = (e) => e.status === 'alta_pendiente' ? `<span class="badge b-warn">${e.origen === 'lider' ? 'Agregado por líder · falta alta' : 'Alta pendiente'}</span>` : '';
function personCard(e, r, faltas, locked, morning, vac) {
  if (vac) locked = true;   // vacaciones aprobadas por RH: el día queda fijo
  const open = LS.open === e.id;
  const col = r ? ATT_COLOR[attKey(r)] : null;
  const summary = r ? attLabel(r) : 'Sin registrar';
  const dis = locked ? ' disabled' : '';
  const tarde = LS.turno === 'tarde'; const ST = tarde ? ATT_PM : ATT;
  const diff = tarde ? attMismatch(morning, r) : null;
  const stBtn = (k) => `<button type="button" class="${k}${r && r.status === k ? ' on' : ''}" data-att="${k}" aria-pressed="${!!(r && r.status === k)}"${dis}>${ST[k]}</button>`;
  const avBtn = (k) => `<button type="button" class="aviso${r && r.aviso === k ? ' on' : ''}" data-aviso="${k}" aria-pressed="${!!(r && r.aviso === k)}"${dis}>${AVISO[k]}</button>`;
  const incBtn = (k) => `<button type="button" class="${k}${r && r.incidencia === k ? ' on' : ''}" data-inc="${k}" aria-pressed="${!!(r && r.incidencia === k)}"${dis}>${INC[k]}</button>`;
  const reqRow = (k, l, risk) => `<button type="button" class="req-row${risk ? ' risk' : ''}" data-req="${k}"><b class="grow">${esc(l)}</b><span class="go" aria-hidden="true">›</span></button>`;
  return `<div class="person${open ? ' open' : ''}" data-id="${e.id}">
    <button type="button" class="ph" aria-expanded="${open}">
      <span class="dot" style="${col ? `background:${col};border-color:${col}` : ''}"></span>
      <span class="grow"><span style="display:block;font-weight:600">${esc(fullName(e))}</span><span class="small muted">${esc(summary.length > 90 ? summary.slice(0, 90) + '…' : summary)}</span></span>
      ${vac ? '<span class="badge b-ok">Vacaciones</span>' : ''}${pendBadge(e)}${diff ? '<span class="badge b-warn">No coincide</span>' : ''}${faltasBadge(faltas)}<span class="more" aria-hidden="true">${open ? 'Cerrar ▴' : 'Detalle ▾'}</span>
    </button>
    ${open ? '' : `<div class="quick" role="group" aria-label="Asistencia rápida de ${esc(fullName(e))}">${Object.keys(ST).map((k) => `<button type="button" class="${k}${r && r.status === k ? ' on' : ''}" data-att="${k}" aria-pressed="${!!(r && r.status === k)}"${dis}>${k === 'salida' ? 'Salida' : ST[k]}</button>`).join('')}</div>`}
    ${open ? `<div class="body">
      ${vac ? '<div class="notice n-info">De vacaciones autorizadas por RH. El día queda registrado como Vacaciones y no cuenta como falta.</div>' : ''}
      ${tarde ? `<div class="morning-ref${diff ? ' diff' : ''}"><span class="small muted">En la mañana</span><span>${morning ? attBadges(morning) : '<span class="badge b-mut">Sin registro</span>'}</span>${diff ? `<span class="small" style="color:var(--warn);font-weight:600">${esc(diff)}</span>` : ''}</div>` : ''}
      <section class="fbox">
        <header>${tarde ? 'Asistencia al cierre' : 'Asistencia'}</header>
        <div class="fbody">
          <div class="att3">${Object.keys(ST).map(stBtn).join('')}</div>
          ${tarde ? '' : `<div class="aviso-row"><span class="small muted">Aviso a RH <span class="hint">(opcional, si sigue en lista)</span></span><div class="att2">${Object.keys(AVISO).map(avBtn).join('')}</div></div>`}
        </div>
      </section>
      <section class="fbox">
        <header>Incidencias del día</header>
        <div class="fbody">
          <div class="att3">${INC_TL.map(incBtn).join('')}</div>
          ${r && r.incidencia ? `<div class="inc-note"><div class="small muted">Comentarios</div><div>${esc(r.comentario || '')}</div>${locked ? '' : '<button type="button" class="btn sm ghost" data-inc-edit>Editar comentario</button>'}</div>` : '<div class="small muted">Si eliges una incidencia se pide un comentario obligatorio.</div>'}
        </div>
      </section>
      ${r ? `<div class="small muted">Último cambio: ${esc(profName(r.updated_by))} · ${fmtDateTime(r.updated_at)}</div>` : ''}
      ${e.status === 'alta_pendiente' ? '<div class="notice n-warn">Esta persona aún no tiene alta confirmada. Las solicitudes e incidencias de riesgo se habilitan cuando Daniel acepte el alta.</div>' : ''}
      ${canReportCase() && e.status === 'activo' ? `<section class="fbox">
        <header>Solicitud de incidencias<span>Se envía a Supervisión</span></header>
        <div class="req-list">${Object.entries(SOLICITUD_LIDER).map(([k, l]) => reqRow(k, l)).join('')}</div>
        <footer>Cada solicitud pide razón, evidencias y fechas.</footer>
      </section>
      <section class="fbox risk">
        <header>Incidencias de riesgo<span>Directo a RH</span></header>
        <div class="req-list">${Object.entries(RIESGO).map(([k, l]) => reqRow(k, l, true)).join('')}</div>
        <footer>Razón, evidencias y fechas. No pasa por Supervisión.</footer>
      </section>` : ''}
    </div>` : ''}
  </div>`;
}
function wirePerson(card, st, groups) {
  const id = card.dataset.id; const { rec } = st;
  const emp = st.emps.find((x) => x.id === id);
  const redraw = () => renderLista(st, groups);
  $('.ph', card).onclick = () => { LS.open = LS.open === id ? null : id; redraw(); };
  const save = async (patch) => {
    const cur = rec[id] || {};
    const row = { employee_id: id, fecha: LS.fecha, turno: LS.turno, status: cur.status || null, aviso: cur.aviso || null, incidencia: cur.incidencia || null, comentario: cur.comentario || null, incidencias: cur.incidencias || [], ...patch };
    if (!row.incidencia) row.comentario = null;
    const [saved] = await db('attendance').insert([row], { onConflict: 'employee_id,fecha,turno' });
    rec[id] = saved;
  };
  const run = async (patch, msg) => {
    $$('[data-att],[data-aviso],[data-inc]', card).forEach((x) => { x.disabled = true; });
    try { await save(patch); if (msg) toast(msg); } catch (e) { toast(e.message, true); }
    redraw();
  };
  $$('[data-att]', card).forEach((b) => b.onclick = () => {
    const k = b.dataset.att; const cur = rec[id];
    if (cur && cur.status === k) {   // tocar de nuevo: solo se quita si queda una incidencia registrada
      if (!cur.incidencia) return;
      return run({ status: null, aviso: null });
    }
    run({ status: k });
  });
  $$('[data-aviso]', card).forEach((b) => b.onclick = () => {
    const k = b.dataset.aviso; const cur = rec[id];
    if (!cur || !cur.status) return toast('Primero marca Asistencia, Falta o Retardo', true);
    if (cur.aviso === k) return run({ aviso: null }, 'Aviso quitado');
    run({ aviso: k }, k === 'baja' ? 'Aviso de baja registrado (no da de baja: RH lo revisa)' : 'Aviso de nuevo ingreso registrado');
  });
  const incModal = (k) => {
    const cur = rec[id] || {};
    const f = [{ k: 'comentario', label: 'Comentarios', type: 'textarea', req: true, full: true, val: cur.incidencia === k ? cur.comentario || '' : '', hint: 'Obligatorio. Explica el motivo de la incidencia.' }];
    const actions = [{ label: 'Cancelar' }];
    if (cur.incidencia === k) actions.push({ label: 'Quitar incidencia', cls: 'danger', run: async () => {
      if (!cur.status) throw new Error('Primero marca Asistencia, Falta o Retardo; el registro no puede quedar vacío.');
      await save({ incidencia: null, comentario: null }); toast('Incidencia quitada'); redraw();
    } });
    actions.push({ label: 'Guardar', cls: 'primary', run: async ({ el }) => {
      const v = readFields(el, f); await save({ incidencia: k, comentario: v.comentario }); toast('Incidencia guardada'); redraw();
    } });
    modal({ title: `${INC[k]} · ${fullName(emp)}`, body: fieldsHtml(f), actions });
  };
  $$('[data-inc]', card).forEach((b) => b.onclick = () => incModal(b.dataset.inc));
  const ie = $('[data-inc-edit]', card);
  if (ie) ie.onclick = () => incModal(rec[id].incidencia);
  $$('[data-req]', card).forEach((b) => b.onclick = () => requestForm({ employee: emp, tipo: b.dataset.req, fecha: LS.fecha, onDone: () => toast(RIESGO[b.dataset.req] ? 'Incidencia de riesgo enviada a RH' : 'Solicitud enviada a Supervisión') }));
}

// ───────────────────────── Personal ─────────────────────────
const PS = { q: '', area: '', group: '', status: 'activo' };
let EMP_CACHE = [];
async function viewPersonal() {
  if (S.view === 'expediente' && EXP.id) return viewExpediente(EXP.id);   // tras editar desde el perfil, se queda en el perfil
  const v = $('#view');
  const [emps, faltas] = await Promise.all([
    db('employees').select('id,num_empleado,nombre,apellido_paterno,apellido_materno,puesto,area_id,group_id,status,fecha_ingreso,fecha_baja,requested_by,requested_at,origen').get(),
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
        ${e.origen === 'lider' && e.status === 'alta_pendiente' ? '<span class="badge b-acc">Agregado por líder</span>' : ''}${faltasBadge(fx[e.id])} ${PS.status !== e.status || !PS.status ? statusBadge(e.status) : (e.status === 'alta_pendiente' ? statusBadge(e.status) : '')}</button>`).join('')
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
  { k: 'salario_diario', label: 'Salario diario', type: 'number' }, { k: 'salario_mensual', label: 'Salario mensual', type: 'number' },
  { k: 'clabe', label: 'CLABE interbancaria', hint: '18 dígitos' }, { k: 'banco', label: 'Banco', upper: true }, { k: 'beneficiario', label: 'Beneficiario de la cuenta', upper: true, full: true, hint: 'Vacío si la cuenta es del trabajador' }
];
// Valida y normaliza los datos bancarios capturados en la ficha
function checkBanco(pv) {
  if (!pv.clabe) return pv;
  const d = clabeDigits(pv.clabe);
  if (!clabeOk(d)) throw new Error('La CLABE no es válida: deben ser 18 dígitos y el dígito verificador debe cuadrar.');
  return { ...pv, clabe: d, banco: pv.banco || bancoDeClabe(d) || null };
}

// Eliminar a una persona y todo su historial (solo Daniel). Para quien dejó de trabajar se usa Baja.
async function storageRemove(bucket, paths) {
  if (!paths.length) return;
  await http(`/storage/v1/object/${bucket}`, { method: 'DELETE', body: { prefixes: paths } });
}
async function deleteEmployeeForm(e) {
  const [att, cases, acts, corrs, docs] = await Promise.all([
    db('attendance').select('id').eq('employee_id', e.id).get(), db('cases').select('id').eq('employee_id', e.id).get(),
    db('activity_daily').select('id').eq('employee_id', e.id).get().catch(() => []), db('corrections').select('id').eq('employee_id', e.id).get().catch(() => []),
    db('documents').select('id,firmado_path').eq('employee_id', e.id).get().catch(() => [])]);
  const files = cases.length ? await db('case_files').select('path').in('case_id', cases.map((c) => c.id)).get() : [];
  const items = [[att.length, 'registros de asistencia'], [cases.length, 'casos (con su seguimiento)'], [files.length, 'archivos de evidencia'], [acts.length + corrs.length, 'registros de actividad y correcciones'], [docs.length, 'documentos laborales (y sus copias firmadas)']].filter((x) => x[0]);
  const f = [{ k: 'conf', label: 'Escribe ELIMINAR para confirmar', req: true, full: true }];
  modal({ title: 'Eliminar a ' + fullName(e), body: `
    ${e.status === 'activo' || e.status === 'alta_pendiente' ? `<div class="notice n-warn"><b>¿Dejó de trabajar?</b> Usa <b>Dar de baja</b>: conserva su historial y el control de reingreso. Eliminar es solo para registros de prueba, duplicados o capturados por error.</div>` : ''}
    <div class="notice n-bad">Se borrará para siempre <b>${esc(fullName(e))}</b>${e.num_empleado ? ` (${esc(e.num_empleado)})` : ''}, sus datos personales${items.length ? ' y también:<ul style="margin:6px 0 0 18px">' + items.map(([n, t]) => `<li><b>${n}</b> ${t}</li>`).join('') + '</ul>' : ', sin historial.'}
    <div class="small" style="margin-top:6px">No se puede deshacer. La bitácora guarda quién lo eliminó y cuándo.</div></div>
    ${fieldsHtml(f)}`,
    actions: [{ label: 'Cancelar' }, { label: 'Eliminar para siempre', cls: 'danger solid', run: async ({ el }) => {
      const v = readFields(el, f);
      if (v.conf.trim().toUpperCase() !== 'ELIMINAR') throw new Error('Escribe ELIMINAR para confirmar.');
      try { await storageRemove('evidencias', files.map((x) => x.path)); } catch { /* si falla, los archivos quedan huérfanos pero inaccesibles */ }
      try { await storageRemove('documentos', docs.map((x) => x.firmado_path).filter(Boolean)); } catch { /* idem */ }
      try { const ex = await db('expediente_archivos').select('path').eq('employee_id', e.id).get(); await storageRemove(EXP_BUCKET, ex.map((x) => x.path)); } catch { /* idem */ }
      const r = await db('employees').eq('id', e.id).remove();
      if (!r || !r.length) throw new Error('No se pudo eliminar.');
      $$('.modal-bg').forEach((x) => x.remove());
      toast('Eliminado'); if (S.view === 'expediente') { location.hash = '#/personal'; } else viewPersonal();
    } }] });
}
// ───────────────────────── Perfil y expediente del trabajador ─────────────────────────
// Página completa con pestañas. Expediente completo: Daniel, Dirección y RH de su área.
// Nómina ve el perfil laboral, pago, asistencia y su historial de nómina. Supervisión y TL solo una tarjeta breve.
const EXP_BUCKET = 'expedientes';
const EXP_DOCS = [
  ['ine', 'INE (identificación oficial)'], ['curp', 'CURP'], ['acta_nacimiento', 'Acta de nacimiento'],
  ['comprobante_domicilio', 'Comprobante de domicilio'], ['nss', 'Número de Seguridad Social (NSS)'],
  ['rfc', 'Constancia de situación fiscal (RFC)'], ['estudios', 'Comprobante de estudios'], ['cv', 'CV / solicitud de empleo']
];
const EXP_LABEL = Object.fromEntries([...EXP_DOCS, ['foto', 'Foto'], ['otro', 'Otro']]);
const EXP = { id: null, tab: 'resumen', mes: null };
const canSeeExp = () => is('developer', 'director', 'rh_general', 'rh_area');
const canEditExp = (e) => is('developer') || (is('rh_general', 'rh_area') && S.myAreas.includes(e.area_id));
function antiguedad(desde, hasta) {
  if (!desde) return '—';
  const [y1, m1, d1] = desde.split('-').map(Number); const [y2, m2, d2] = (hasta || todayMX()).split('-').map(Number);
  let meses = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (meses < 0) return 'Aún no ingresa';
  const a = Math.floor(meses / 12); meses %= 12;
  if (!a && !meses) { const dias = Math.round((Date.parse((hasta || todayMX()) + 'T12:00:00Z') - Date.parse(desde + 'T12:00:00Z')) / 86400000); return `${dias} día${dias === 1 ? '' : 's'}`; }
  return [a && `${a} año${a === 1 ? '' : 's'}`, meses && `${meses} mes${meses === 1 ? '' : 'es'}`].filter(Boolean).join(' y ');
}
const edad = (n) => { if (!n) return ''; const [y, m, d] = n.split('-').map(Number); const [ty, tm, td] = todayMX().split('-').map(Number); return ty - y - ((tm < m || (tm === m && td < d)) ? 1 : 0); };
const iniciales = (e) => ((e.nombre || '')[0] || '') + ((e.apellido_paterno || '')[0] || '');

// Punto de entrada desde Personal, Casos, Documentos y Reclutamiento
async function openEmployee(id, fx = {}) {
  if (canSeeExp() || is('nomina')) {
    if (location.hash === '#/expediente/' + id) { $$('.modal-bg').forEach((x) => x.remove()); return viewExpediente(id); }
    location.hash = '#/expediente/' + id; return;
  }
  const [e] = await db('employees').eq('id', id).get();
  if (!e) return toast('No encontrado o sin permiso', true);
  const g = S.groups.find((x) => x.id === e.group_id);
  const canMove = is('supervisor') && S.myAreas.includes(e.area_id) && ['activo', 'alta_pendiente'].includes(e.status);
  modal({
    title: fullName(e), body: `<div class="row">${statusBadge(e.status)} ${faltasBadge(fx[e.id])}</div>
      <div class="kv" style="margin-top:10px"><span>No. empleado</span><span>${esc(e.num_empleado || '—')}</span><span>Puesto</span><span>${esc(e.puesto || '—')}</span>
      <span>Área</span><span>${esc(areaName(e.area_id))}</span><span>Grupo</span><span>${esc(groupName(e.group_id))}${g && g.tl_id ? ' · TL ' + esc(profName(g.tl_id)) : ''}</span>
      <span>Ingreso</span><span>${fmtDate(e.fecha_ingreso)}${e.fecha_ingreso ? ' · ' + esc(antiguedad(e.fecha_ingreso)) : ''}</span></div>`,
    actions: [{ label: 'Cerrar' }, ...(canMove ? [{ label: 'Cambiar grupo', cls: 'primary', run: () => { setTimeout(() => moveGroup(e), 0); } }] : [])]
  });
}

async function viewExpediente(id) {
  const v = $('#view');
  if (EXP.id !== id) Object.assign(EXP, { id, tab: 'resumen', mes: null });
  const [e] = await db('employees').eq('id', id).get();
  if (!e) { v.innerHTML = `<div class="card empty">No se encontró a la persona o no tienes permiso.<br><br><a class="btn" href="#/personal">← Personal</a></div>`; return; }
  const full = canSeeExp(); const edit = canEditExp(e);
  const seesNomina = is('developer', 'director', 'nomina');
  const since = addDays(todayMX(), -29);
  const metrics = metricsOf(e.area_id);
  const [priv, att30, archivos, docs, cases, cand, acts30] = await Promise.all([
    canSeePrivate(e) ? db('employee_private').eq('employee_id', id).get() : Promise.resolve([]),
    db('attendance').select('fecha,turno,status,incidencia').eq('employee_id', id).gte('fecha', since).get().catch(() => []),
    full ? db('expediente_archivos').eq('employee_id', id).order('created_at', false).get().catch(() => []) : Promise.resolve([]),
    full ? db('documents').select('id,folio,tipo,fecha,estado,datos,firmado_path').eq('employee_id', id).order('created_at', false).get().catch(() => []) : Promise.resolve([]),
    full ? db('cases').select('id,folio,status,fecha_hechos,decision,kind,hechos').eq('employee_id', id).order('created_at', false).get().catch(() => []) : Promise.resolve([]),
    full ? db('candidatos').select('id,folio,fuente,contrato_tipo,fecha_ingreso').eq('employee_id', id).get().catch(() => []) : Promise.resolve([]),
    metrics.length ? db('activity_daily').eq('employee_id', id).gte('fecha', since).get().catch(() => []) : Promise.resolve([])
  ]);
  const p = priv[0] || {};
  const g = S.groups.find((x) => x.id === e.group_id);
  const foto = archivos.find((a) => a.tipo === 'foto');
  const contrato = docs.find((d) => d.tipo === 'contrato' && d.estado !== 'anulado');
  const c30 = attCounts(); att30.filter((a) => a.turno !== 'tarde').forEach((a) => countAtt(c30, a));
  const faltan = EXP_DOCS.filter(([k]) => !archivos.some((a) => a.tipo === k));
  const tabs = [['resumen', 'Resumen'], ['asistencia', 'Asistencia'], ...(full ? [['incidencias', 'Casos y actas'], ['documentos', 'Documentos'], ['expediente', `Expediente${faltan.length ? ` (${EXP_DOCS.length - faltan.length}/${EXP_DOCS.length})` : ' ✓'}`]] : []),
    ...(seesNomina ? [['nomina', 'Nómina']] : []), ...(full || seesNomina ? [['vacaciones', 'Vacaciones']] : []), ...(full ? [['historial', 'Historial']] : [])];
  if (!tabs.some(([k]) => k === EXP.tab)) EXP.tab = 'resumen';

  // Acciones (las mismas reglas que antes)
  const inMyArea = seesAllAreas() || S.myAreas.includes(e.area_id);
  const acts = [];
  if (is('developer') && e.status === 'alta_pendiente') { acts.push(['rechazar', 'Rechazar alta', 'danger']); acts.push(['aceptar', 'Aceptar alta', 'primary']); }
  if (is('developer') || (is('rh_general', 'rh_area') && inMyArea)) acts.push(['editar', 'Editar datos', '']);
  if ((is('developer') || (is('rh_general', 'rh_area') && inMyArea)) && ['activo', 'alta_pendiente'].includes(e.status)) acts.push(['grupo', 'Cambiar grupo', '']);
  if (is('nomina') && e.status === 'activo') acts.push(['banco', 'Datos bancarios', '']);
  if (!is('developer') && canDocFin(e.area_id) && ['activo', 'baja'].includes(e.status)) acts.push(['finiq', 'Finiquito / liquidación', '']);
  if (is('developer')) {
    if (e.status === 'activo') acts.push(['area', 'Cambiar área', '']);
    if (['activo', 'baja', 'alta_pendiente'].includes(e.status)) acts.push(['doc', 'Generar documento', '']);
    if (e.status === 'activo') acts.push(['baja', 'Dar de baja', 'danger']);
    acts.push(['eliminar', 'Eliminar', 'danger']);
  }

  v.innerHTML = `
    <div class="row" style="margin-bottom:10px"><a class="btn sm" href="#/personal" id="ex_back">← Personal</a></div>
    <div class="card pad ex-head">
      <div class="ex-ava" id="ex_ava">${esc(iniciales(e).toUpperCase())}${edit ? '<button type="button" class="ex-cam" id="ex_foto" title="Cambiar foto" aria-label="Cambiar foto">📷</button>' : ''}</div>
      <div class="grow" style="min-width:0">
        <h1 style="margin:0;font-size:22px">${esc(fullName(e))}</h1>
        <div class="muted small" style="margin-top:2px">${esc(e.puesto || 'Sin puesto')} · ${esc(areaName(e.area_id))} · ${esc(groupName(e.group_id))}${g && g.tl_id ? ' · TL ' + esc(profName(g.tl_id)) : ''}</div>
        <div class="row" style="gap:6px;margin-top:8px">${statusBadge(e.status)}${e.num_empleado ? `<span class="badge b-mut mono">${esc(e.num_empleado)}</span>` : ''}
          <span class="badge b-acc">${e.fecha_ingreso ? 'Ingreso ' + fmtDate(e.fecha_ingreso) + ' · ' + esc(antiguedad(e.fecha_ingreso, e.status === 'baja' ? e.fecha_baja : null)) : 'Sin fecha de ingreso'}</span>
          ${contrato && contrato.datos ? `<span class="badge b-mut">${esc(CONTRATOS[contrato.datos.contrato_tipo] || 'Contrato')}${contrato.datos.fecha_fin ? ' · hasta ' + fmtDate(contrato.datos.fecha_fin) : ''}</span>` : ''}
          ${faltasBadge(c30.falta)}</div>
      </div>
      ${acts.length ? `<div class="row ex-acts" style="gap:6px">${acts.map(([k, l, c]) => `<button type="button" class="btn sm ${c}" data-act="${k}">${esc(l)}</button>`).join('')}</div>` : ''}
    </div>
    ${e.origen === 'lider' && e.status === 'alta_pendiente' ? `<div class="notice n-warn" style="margin-bottom:12px">Agregado al pase de lista por ${esc(profName(e.requested_by))} el ${fmtDateTime(e.requested_at)}. RH debe completar datos y Daniel confirmar el alta.</div>` : ''}
    <div class="ex-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" data-tab="${k}" class="${EXP.tab === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>
    <div id="ex_body"><div class="empty">Cargando…</div></div>
    <input type="file" id="ex_file" accept="image/*,application/pdf" hidden>`;
  if (foto) storageUrl(EXP_BUCKET, foto.path).then((u) => { const a = $('#ex_ava'); if (a) { a.style.backgroundImage = `url("${u}")`; a.classList.add('img'); } }).catch(() => {});
  $('#ex_back').onclick = (ev) => { if (history.length > 1 && document.referrer !== '' && S.prevView === 'personal') { ev.preventDefault(); history.back(); } };
  $$('[data-tab]').forEach((b) => b.onclick = () => { EXP.tab = b.dataset.tab; viewExpediente(id); });
  const ctx = { e, p, g, full, edit, archivos, docs, cases, cand, c30, faltan, contrato, metrics, acts30 };
  $$('[data-act]').forEach((b) => b.onclick = () => expAction(b.dataset.act, ctx));
  const fb = $('#ex_foto'); if (fb) fb.onclick = () => pickFile('image/*', (f) => subirArchivo(e, 'foto', f, {}));
  const body = $('#ex_body');
  try { await EXP_TABS[EXP.tab](body, ctx); } catch (er) { body.innerHTML = `<div class="notice n-bad">${esc(er.message)}</div>`; }
}

async function expAction(k, { e, p }) {
  const done = () => viewExpediente(e.id);
  if (k === 'aceptar') return aceptarAlta(e);
  if (k === 'rechazar') { if (!(await confirmBox('Rechazar alta', `¿Rechazar la solicitud de <b>${esc(fullName(e))}</b>?`, { danger: true, okLabel: 'Rechazar' }))) return; await mustUpdate(db('employees').eq('id', e.id).update({ status: 'rechazado' })); toast('Alta rechazada'); return done(); }
  if (k === 'editar') return editEmployee(e, priv0(p), { basic: is('developer') || (is('rh_general', 'rh_area') && e.status === 'alta_pendiente'), priv: true });
  if (k === 'grupo') return moveGroup(e);
  if (k === 'banco') return bancoForm(e, priv0(p));
  if (k === 'area') return moveArea(e);
  if (k === 'doc') return newDocPicker({ employee: e });
  if (k === 'finiq') return newDocPicker({ employee: e });
  if (k === 'baja') return bajaForm(e, priv0(p));
  if (k === 'eliminar') return deleteEmployeeForm(e);
}
const priv0 = (p) => (p && Object.keys(p).length ? p : null);

function pickFile(accept, cb) {
  const i = $('#ex_file'); i.accept = accept; i.value = '';
  i.onchange = () => { const f = i.files[0]; if (f) cb(f); };
  i.click();
}
async function subirArchivo(e, tipo, f, { nombre = null, fecha = null, nota = null } = {}) {
  const mime = mimeOf(f);
  if (f.size > 10 * 1024 * 1024) return toast('El archivo pasa de 10 MB', true);
  if (!/^image\/|^application\/pdf$/.test(mime)) return toast('Solo fotos o PDF', true);
  if (tipo === 'foto' && !/^image\//.test(mime)) return toast('La foto debe ser una imagen', true);
  const ext = (f.name.match(/\.([a-z0-9]{1,6})$/i) || [])[1];
  const key = `${e.id}/${tipo}_${newId()}${ext ? '.' + ext.toLowerCase() : ''}`;
  toast('Subiendo…');
  try {
    await storageUpload(EXP_BUCKET, key, f);
    try { await db('expediente_archivos').insert([{ employee_id: e.id, tipo, nombre, fecha, nota, archivo: f.name.slice(0, 200), path: key, mime, tamano: f.size }]); }
    catch (er) { await storageRemove(EXP_BUCKET, [key]).catch(() => {}); throw er; }
    toast(tipo === 'foto' ? 'Foto actualizada' : 'Archivo guardado');
    viewExpediente(e.id);
  } catch (er) { toast('No se pudo subir: ' + er.message, true); }
}
async function verArchivo(path, bucket = EXP_BUCKET) {
  const w = window.open('about:blank', '_blank');
  try { const u = await storageUrl(bucket, path); if (w) w.location = u; else location.href = u; }
  catch (er) { if (w) w.close(); toast(er.message, true); }
}
async function quitarArchivo(a, e) {
  if (!(await confirmBox('Quitar archivo', `¿Quitar <b>${esc(a.nombre || EXP_LABEL[a.tipo])}</b> (${esc(a.archivo)}) del expediente?`, { danger: true, okLabel: 'Quitar' }))) return;
  try { await db('expediente_archivos').eq('id', a.id).remove(); await storageRemove(EXP_BUCKET, [a.path]).catch(() => {}); toast('Archivo quitado'); viewExpediente(e.id); }
  catch (er) { toast(er.message, true); }
}

const card = (title, html, extra = '') => `<div class="card pad ex-card"><div class="eyebrow" style="margin-bottom:8px;display:flex;align-items:center;gap:8px">${title}${extra}</div>${html}</div>`;
const kvRows = (rows) => `<div class="kv">${rows.filter((r) => r).map(([k, val]) => `<span>${esc(k)}</span><span>${val == null || val === '' ? '—' : val}</span>`).join('')}</div>`;

const EXP_TABS = {
  async vacaciones(body, { e }) {
    const [s, hist] = await Promise.all([rpc('vacaciones_saldo', { p_emp: e.id }), db('vacaciones').eq('employee_id', e.id).order('fecha_inicio', false).get()]);
    body.innerHTML = `<div class="card pad">${canEditVac(e) && e.status === 'activo' ? '<div class="row" style="justify-content:flex-end;margin-bottom:8px"><button class="btn sm primary" id="ex_vac">+ Registrar vacaciones</button></div>' : ''}${vacSaldoHtml(s)}</div>
      <div class="eyebrow" style="margin:14px 0 8px">Registros (${hist.length})</div><div class="list">${hist.length ? hist.map((x) => `<button type="button" class="item" data-vh="${x.id}"><span class="grow small">${esc(vacRango(x))}${x.nota ? ' · ' + esc(x.nota) : ''}</span>${x.estado === 'cancelada' ? '<span class="badge b-mut">Cancelada</span>' : `<span class="badge ${x.tipo === 'ajuste' ? 'b-mut' : 'b-ok'}">${num(x.dias)} días</span>`}</button>`).join('') : '<div class="card empty small">Sin vacaciones registradas.</div>'}</div>`;
    const re = () => viewExpediente(e.id);
    const b = $('#ex_vac', body); if (b) b.onclick = () => vacForm({ emps: [e], employee: e, onDone: re });
    $$('[data-vh]', body).forEach((x) => x.onclick = () => vacDetalle(hist.find((y) => y.id === x.dataset.vh), e, re));
  },
  async resumen(body, { e, p, g, full, cand, c30, faltan, contrato, cases, docs, archivos, metrics, acts30 }) {
    const pagos = canSeePrivate(e);
    const abiertos = cases.filter((k) => k.status !== 'cerrado').length;
    const porFirmar = docs.filter((d) => ['emitido', 'con_lider'].includes(d.estado)).length;
    body.innerHTML = `<div class="ex-grid">
      ${card('Perfil laboral', kvRows([
        ['No. empleado', esc(e.num_empleado || '')], ['Puesto', esc(e.puesto || '')], ['Área', esc(areaName(e.area_id))],
        ['Grupo', esc(groupName(e.group_id))], ['Líder (TL)', g && g.tl_id ? esc(profName(g.tl_id)) : ''],
        ['Fecha de ingreso', fmtDate(e.fecha_ingreso)], ['Antigüedad', esc(antiguedad(e.fecha_ingreso, e.status === 'baja' ? e.fecha_baja : null))],
        contrato && contrato.datos ? ['Contrato', esc(CONTRATOS[contrato.datos.contrato_tipo] || '—') + (contrato.datos.fecha_fin ? ' · periodo a prueba hasta ' + fmtDate(contrato.datos.fecha_fin) : '')] : null,
        cand[0] ? ['Reclutamiento', `Candidato #${cand[0].folio}${cand[0].fuente ? ' · ' + esc(cand[0].fuente) : ''}`] : null,
        ['Estatus', statusBadge(e.status)], e.fecha_baja ? ['Fecha de baja', fmtDate(e.fecha_baja)] : null,
        ['Solicitó alta', esc(profName(e.requested_by)) + ' · ' + fmtDateTime(e.requested_at)], e.approved_at ? ['Aprobó alta', esc(profName(e.approved_by)) + ' · ' + fmtDateTime(e.approved_at)] : null]))}
      ${full ? card('Datos personales', kvRows([
        ['CURP', `<span class="mono">${esc(p.curp || '')}</span>`], ['RFC', `<span class="mono">${esc(p.rfc || '')}</span>`], ['NSS', `<span class="mono">${esc(p.nss || '')}</span>`],
        ['Nacimiento', p.fecha_nacimiento ? `${fmtDate(p.fecha_nacimiento)} · ${edad(p.fecha_nacimiento)} años` : ''], ['Teléfono', esc(p.telefono || '')],
        ['Correo', esc(p.correo || '')], ['Domicilio', esc(p.domicilio || '')],
        e.status === 'baja' && (is('developer', 'director')) ? ['Motivo de baja', esc(p.motivo_baja || '')] : null,
        e.status === 'baja' && (is('developer', 'director')) ? ['Recontratable', p.recontratable === false ? '<b style="color:var(--bad)">No</b>' : p.recontratable ? 'Sí' : '—'] : null])) : ''}
      ${pagos ? card('Pago', kvRows([['Salario diario', money(p.salario_diario)], ['Salario mensual', money(p.salario_mensual)],
        ['CLABE', `<span class="mono">${esc(p.clabe || '')}</span>`], ['Banco', esc(p.banco || '')], ['Beneficiario', esc(p.beneficiario || (p.clabe ? 'El trabajador' : ''))]])) : ''}
      ${card('Últimos 30 días', `<div class="row small" style="gap:6px"><span class="badge b-ok">${c30.asistio} asistencias</span><span class="badge b-bad">${c30.falta} faltas</span><span class="badge b-warn">${c30.retardo} retardos</span>${c30.permiso ? `<span class="badge b-acc">${c30.permiso} permisos</span>` : ''}</div>
        ${metrics.length ? `<div class="small" style="margin-top:10px">${acts30.length} días con actividad capturada</div><div class="scrollx"><table class="tbl sub" style="margin-top:6px"><thead><tr><th>Métrica</th><th>Promedio diario</th><th>Meta</th><th>Días bajo meta</th></tr></thead><tbody>${metrics.map((m) => { const xs = acts30.map((x) => (x.valores || {})[m.key]).filter((x) => x != null); const avg = xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null; return `<tr><td>${esc(m.label)}</td><td class="mono" style="color:${avg == null ? 'inherit' : avg >= Number(m.daily_goal) ? 'var(--ok)' : 'var(--bad)'}">${avg ?? '—'}</td><td class="mono">${Number(m.daily_goal)}</td><td class="mono">${xs.filter((x) => x < Number(m.daily_goal)).length}</td></tr>`; }).join('')}</tbody></table></div>` : ''}
        ${full ? `<div class="row small" style="gap:6px;margin-top:8px">${abiertos ? `<span class="badge b-warn">${abiertos} casos abiertos</span>` : '<span class="badge b-mut">Sin casos abiertos</span>'}${porFirmar ? `<span class="badge b-warn">${porFirmar} documentos por firmar</span>` : ''}</div>` : ''}`)}
      ${full ? card('Expediente digital', `<div class="ex-bar"><span style="width:${Math.round((EXP_DOCS.length - faltan.length) / EXP_DOCS.length * 100)}%"></span></div>
        <div class="small" style="margin:6px 0">${EXP_DOCS.length - faltan.length} de ${EXP_DOCS.length} documentos personales · ${archivos.filter((a) => a.tipo === 'otro').length} archivos adicionales</div>
        ${faltan.length ? `<div class="row" style="gap:4px">${faltan.map(([, l]) => `<span class="badge b-warn">Falta: ${esc(l)}</span>`).join('')}</div>` : '<span class="badge b-ok">Completo</span>'}
        <button type="button" class="btn sm" style="margin-top:10px" data-goto="expediente">Ver expediente</button>`) : ''}
    </div>`;
    $$('[data-goto]', body).forEach((b) => b.onclick = () => { EXP.tab = b.dataset.goto; viewExpediente(e.id); });
  },

  async asistencia(body, { e }) {
    const mes = EXP.mes || todayMX().slice(0, 7);
    const [y, m] = mes.split('-').map(Number); const ini = `${mes}-01`, fin = `${mes}-${String(lastDay(y, m)).padStart(2, '0')}`;
    const att = await db('attendance').select('fecha,turno,status,incidencia,aviso,comentario').eq('employee_id', e.id).gte('fecha', ini).lte('fecha', fin).order('fecha').get();
    const byDay = {}; att.forEach((a) => (byDay[a.fecha] = byDay[a.fecha] || []).push(a));
    const c = attCounts(); att.filter((a) => a.turno !== 'tarde').forEach((a) => countAtt(c, a));
    const firstDow = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;   // lunes = 0
    const cells = []; for (let i = 0; i < firstDow; i++) cells.push('<div></div>');
    for (let d = 1; d <= lastDay(y, m); d++) {
      const f = `${mes}-${String(d).padStart(2, '0')}`; const xs = byDay[f] || [];
      const am = xs.find((a) => a.turno !== 'tarde'), pm = xs.find((a) => a.turno === 'tarde');
      const k = am ? attKey(am) : null;
      const fuera = (e.fecha_ingreso && f < e.fecha_ingreso) || (e.fecha_baja && f > e.fecha_baja) || f > todayMX();
      cells.push(`<div class="ex-day${f === todayMX() ? ' hoy' : ''}${fuera ? ' off' : ''}" style="${k ? `background:${ATT_COLOR[k]};color:#fff` : ''}" title="${esc([am && attLabel(am), pm && pm.status && 'Tarde: ' + attLabel(pm), am && am.comentario].filter(Boolean).join(' · '))}">
        <span>${d}</span><b>${am ? esc(attShort(am)) : ''}${pm && pm.status && pm.status !== 'asistio' ? '<i>ᵗ</i>' : ''}</b></div>`);
    }
    const notas = att.filter((a) => a.incidencia || a.aviso || (a.turno === 'tarde' && a.status && a.status !== 'asistio'));
    body.innerHTML = card(`Asistencia · ${MESES[m - 1]} ${y}`, `
      <div class="row" style="gap:6px;margin-bottom:10px"><button type="button" class="btn sm" id="ex_prev">‹ Anterior</button><input type="month" class="inp" id="ex_mes" value="${mes}" max="${todayMX().slice(0, 7)}" style="max-width:170px"><button type="button" class="btn sm" id="ex_next"${mes >= todayMX().slice(0, 7) ? ' disabled' : ''}>Siguiente ›</button></div>
      <div class="row small" style="gap:6px;margin-bottom:10px"><span class="badge b-ok">${c.asistio} asistencias</span><span class="badge b-bad">${c.falta} faltas</span><span class="badge b-warn">${c.retardo} retardos</span><span class="badge b-acc">${c.permiso || 0} permisos</span><span class="badge b-mut">${c.descanso || 0} descansos</span></div>
      <div class="ex-cal">${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d) => `<div class="ex-dow">${d}</div>`).join('')}${cells.join('')}</div>
      <div class="small muted" style="margin-top:8px">A asistió · F falta · R retardo · P permiso · D descanso · I inactividad · ᵗ incidencia en el pase de la tarde</div>
      ${notas.length ? `<div class="scrollx" style="margin-top:12px"><table class="tbl sub"><tbody>${notas.map((a) => `<tr><td class="mono small">${fmtDate(a.fecha)}${a.turno === 'tarde' ? ' tarde' : ''}</td><td class="small">${attBadges(a)}</td><td class="small muted">${esc(a.comentario || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}`);
    const go = (n) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); EXP.mes = d.toISOString().slice(0, 7); viewExpediente(e.id); };
    $('#ex_prev').onclick = () => go(-1); $('#ex_next').onclick = () => go(1);
    $('#ex_mes').onchange = (ev) => { if (ev.target.value) { EXP.mes = ev.target.value; viewExpediente(e.id); } };
  },

  async incidencias(body, { cases, docs }) {
    const actas = docs.filter((d) => ['acta', 'advertencia'].includes(d.tipo));
    body.innerHTML = card(`Casos (${cases.length})`, cases.length ? `<div class="list">${cases.map((k) => `<button type="button" class="item" data-opencase="${k.id}" style="padding:8px 12px"><span class="mono small muted">#${k.folio}</span><span class="grow small">${fmtDate(k.fecha_hechos)} · ${esc((k.hechos || '').slice(0, 90))}${k.decision ? ' · ' + esc(MEDIDAS[k.decision]) : ''}</span>${caseBadge(k.status)}</button>`).join('')}</div>` : '<span class="small muted">Sin casos.</span>')
      + card(`Actas administrativas y cartas de advertencia (${actas.length})`, docListHtml(actas));
    $$('[data-opencase]', body).forEach((b) => b.onclick = () => openCase(b.dataset.opencase));
    $$('[data-opendoc]', body).forEach((b) => b.onclick = () => openDocument(b.dataset.opendoc));
  },

  async documentos(body, { e, docs }) {
    body.innerHTML = card(`Documentos laborales (${docs.length})`, docListHtml(docs),
      `${docs.length ? '<button type="button" class="btn sm" id="ex_zip" style="margin-left:auto">Descargar todo (ZIP)</button>' : ''}${is('developer') && ['activo', 'baja', 'alta_pendiente'].includes(e.status) ? `<button type="button" class="btn sm primary" id="ex_newdoc"${docs.length ? '' : ' style="margin-left:auto"'}>+ Generar</button>` : ''}`);
    $$('[data-opendoc]', body).forEach((b) => b.onclick = () => openDocument(b.dataset.opendoc));
    const z = $('#ex_zip', body); if (z) z.onclick = async () => { z.disabled = true; try { await exportDocsZip({ employeeId: e.id, titulo: 'Expediente ' + fullName(e) }, z); } catch (er) { toast(er.message, true); } finally { z.disabled = false; z.textContent = 'Descargar todo (ZIP)'; } };
    const n = $('#ex_newdoc', body); if (n) n.onclick = () => (e.status === 'baja' ? docForm({ tipo: 'constancia_baja', employee: e }) : newDocPicker({ employee: e }));
  },

  async expediente(body, { e, edit, archivos, docs }) {
    const ult = (t) => archivos.filter((a) => a.tipo === t);
    const fila = (a, label) => `<div class="ex-file"><span class="ex-ic ok">✓</span><span class="grow"><b>${esc(label)}</b><br><span class="small muted">${esc(a.archivo)} · ${fmtDate(a.created_at)} · ${esc(profName(a.created_by))}${a.fecha ? ' · fecha del documento ' + fmtDate(a.fecha) : ''}${a.nota ? ' · ' + esc(a.nota) : ''}</span></span>
      <button type="button" class="btn sm" data-ver="${a.id}">Ver</button>${edit ? `<button type="button" class="btn sm ghost" data-quitar="${a.id}" aria-label="Quitar">✕</button>` : ''}</div>`;
    const contr = ['contrato', 'reglamento', 'confidencialidad'].map((t) => [t, docs.find((d) => d.tipo === t && d.estado !== 'anulado')]);
    const otros = ult('otro');
    body.innerHTML = card('Documentos personales', EXP_DOCS.map(([t, label]) => {
      const xs = ult(t);
      return xs.length ? fila(xs[0], label) + (xs.length > 1 ? `<div class="small muted" style="margin:-4px 0 8px 40px">${xs.length - 1} versión(es) anterior(es): ${xs.slice(1).map((a) => `<a href="#" data-ver="${a.id}">${fmtDate(a.created_at)}</a>`).join(', ')}</div>` : '') + (edit ? `<div style="margin:-4px 0 8px 40px"><button type="button" class="btn sm ghost" data-subir="${t}">Reemplazar</button></div>` : '')
        : `<div class="ex-file"><span class="ex-ic">○</span><span class="grow"><b>${esc(label)}</b><br><span class="small" style="color:var(--warn)">Falta</span></span>${edit ? `<button type="button" class="btn sm primary" data-subir="${t}">Subir</button>` : ''}</div>`;
    }).join(''), `<span class="badge ${EXP_DOCS.every(([t]) => ult(t).length) ? 'b-ok' : 'b-warn'}" style="margin-left:auto">${EXP_DOCS.filter(([t]) => ult(t).length).length}/${EXP_DOCS.length}</span>`)
      + card('Contratación', contr.map(([t, d]) => `<div class="ex-file"><span class="ex-ic${d && d.estado === 'firmado' ? ' ok' : ''}">${d && d.estado === 'firmado' ? '✓' : '○'}</span><span class="grow"><b>${esc(DOC_TIPOS[t].label)}</b><br><span class="small muted">${d ? esc(docFolio(d)) + ' · ' + fmtDate(d.fecha) : 'No generado'}</span></span>
          ${d ? docBadge(d.estado) : ''}${d && d.firmado_path ? `<button type="button" class="btn sm" data-verdoc="${esc(d.firmado_path)}">Ver firmado</button>` : ''}${d ? `<button type="button" class="btn sm ghost" data-opendoc="${d.id}">Abrir</button>` : ''}</div>`).join(''))
      + card(`Otros archivos (${otros.length})`, (otros.length ? otros.map((a) => fila(a, a.nombre)).join('') : '<span class="small muted">Constancias, incapacidades, recetas, cartas, etc.</span>'),
        edit ? '<button type="button" class="btn sm primary" id="ex_otro" style="margin-left:auto">+ Agregar archivo</button>' : '')
      + (edit ? '<div class="small muted">Fotos o PDF de hasta 10 MB. Solo RH de su área, Dirección y Daniel ven este expediente.</div>' : '');
    $$('[data-ver]', body).forEach((b) => b.onclick = (ev) => { ev.preventDefault(); const a = archivos.find((x) => x.id === b.dataset.ver); if (a) verArchivo(a.path); });
    $$('[data-verdoc]', body).forEach((b) => b.onclick = () => verArchivo(b.dataset.verdoc, 'documentos'));
    $$('[data-opendoc]', body).forEach((b) => b.onclick = () => openDocument(b.dataset.opendoc));
    $$('[data-quitar]', body).forEach((b) => b.onclick = () => quitarArchivo(archivos.find((x) => x.id === b.dataset.quitar), e));
    $$('[data-subir]', body).forEach((b) => b.onclick = () => pickFile('image/*,application/pdf', (f) => subirArchivo(e, b.dataset.subir, f)));
    const o = $('#ex_otro', body); if (o) o.onclick = () => {
      const fields = [{ k: 'nombre', label: '¿Qué documento es?', req: true, full: true, hint: 'Ej. Incapacidad IMSS, constancia de estudios, receta médica' }, { k: 'fecha', label: 'Fecha del documento', type: 'date' }, { k: 'nota', label: 'Nota', full: true }];
      modal({ title: 'Agregar archivo', body: fieldsHtml(fields) + '<label class="field" style="margin-top:10px">Archivo (foto o PDF) *<input type="file" id="ao_f" accept="image/*,application/pdf"></label>',
        actions: [{ label: 'Cancelar' }, { label: 'Subir', cls: 'primary', run: async ({ el }) => { const v = readFields(el, fields); const f = $('#ao_f', el).files[0]; if (!f) throw new Error('Elige el archivo.'); await subirArchivo(e, 'otro', f, v); } }] });
    };
  },

  async nomina(body, { e }) {
    const ls = await db('nomina_lineas').select('periodo_id,dias_pagados,salario_diario,nomina,total_percepciones,faltas,faltas_monto,otras_deducciones,permisos_monto,multas_disciplina,multas_retardo,neto,ajustados,notas').eq('employee_id', e.id).get();
    const ps = ls.length ? await db('nomina_periodos').select('id,numero,fecha_inicio,fecha_fin,estado').in('id', [...new Set(ls.map((l) => l.periodo_id))]).get() : [];
    const pm = Object.fromEntries(ps.map((x) => [x.id, x]));
    const rows = ls.filter((l) => pm[l.periodo_id]).sort((a, b) => pm[b.periodo_id].fecha_inicio.localeCompare(pm[a.periodo_id].fecha_inicio));
    const tot = rows.filter((l) => pm[l.periodo_id].estado === 'autorizado').reduce((s, l) => s + num(l.neto), 0);
    body.innerHTML = card(`Historial de nómina (${rows.length})`, rows.length ? `<div class="scrollx"><table class="tbl"><thead><tr><th>Periodo</th><th>Estado</th><th style="text-align:right">Días</th><th style="text-align:right">Sal. diario</th><th style="text-align:right">Percepciones</th><th style="text-align:right">Deducciones</th><th style="text-align:right">Neto</th></tr></thead><tbody>
      ${rows.map((l) => { const p = pm[l.periodo_id]; const ded = r2(num(l.faltas_monto) + num(l.otras_deducciones) + num(l.permisos_monto) + num(l.multas_disciplina) + num(l.multas_retardo));
        return `<tr><td class="small">${esc(periodoTitulo(p))}${(l.ajustados || []).length ? ' <span class="badge b-acc">ajustado</span>' : ''}${l.notas ? `<br><span class="muted">${esc(l.notas)}</span>` : ''}</td><td>${p.estado === 'autorizado' ? '<span class="badge b-ok">Autorizada</span>' : '<span class="badge b-warn">Borrador</span>'}</td>
          <td class="mono" style="text-align:right">${l.dias_pagados}</td><td class="mono" style="text-align:right">${money(l.salario_diario)}</td><td class="mono" style="text-align:right">${money(l.total_percepciones)}</td><td class="mono" style="text-align:right">${ded ? money(ded) : ''}</td><td class="mono" style="text-align:right"><b>${money(l.neto)}</b></td></tr>`; }).join('')}
      </tbody></table></div><div class="small muted" style="margin-top:8px">Total neto en pre-nóminas autorizadas: <b>${money(r2(tot))}</b></div>` : '<span class="small muted">Todavía no aparece en ninguna pre-nómina.</span>');
  },

  async historial(body, { e }) {
    const hs = await rpc('empleado_historial', { p_emp: e.id });
    const ST = (s) => (STATUS[s] || [s])[0];
    const desc = (h) => {
      const b = h.before || {}, a = h.after || {}, out = [];
      if (h.entity === 'employees' && h.action === 'insert') return [a.status === 'activo' ? 'Alta directa' : 'Solicitud de alta registrada'];
      if (h.entity === 'employees' && h.action === 'delete') return ['Registro eliminado'];
      if (h.entity === 'employee_private' && h.action === 'insert') return ['Datos personales capturados'];
      for (const k of Object.keys(a)) {
        if (k === 'status') out.push(a.status === 'activo' && b.status === 'alta_pendiente' ? 'Alta aceptada' : a.status === 'baja' ? 'Baja' : a.status === 'activo' && b.status === 'baja' ? 'Reingreso' : `Estatus: ${ST(b.status)} → ${ST(a.status)}`);
        else if (k === 'group_id') out.push(`Cambio de grupo: ${groupName(b.group_id)} → ${groupName(a.group_id)}`);
        else if (k === 'area_id') out.push(`Cambio de área: ${areaName(b.area_id)} → ${areaName(a.area_id)}`);
        else if (k === 'puesto') out.push(`Puesto: ${b.puesto || '—'} → ${a.puesto || '—'}`);
        else if (k === 'fecha_ingreso') out.push(`Fecha de ingreso: ${fmtDate(b.fecha_ingreso)} → ${fmtDate(a.fecha_ingreso)}`);
        else if (k === 'fecha_baja' && a.fecha_baja) out.push(`Fecha de baja: ${fmtDate(a.fecha_baja)}`);
        else if (k === 'num_empleado') out.push(`Número de empleado: ${b.num_empleado || '—'} → ${a.num_empleado || '—'}`);
        else if (k === 'salario_diario') out.push(`Salario diario: ${money(b.salario_diario)} → ${money(a.salario_diario)}`);
        else if (k === 'salario_mensual') out.push(`Salario mensual: ${money(b.salario_mensual)} → ${money(a.salario_mensual)}`);
        else if (['nombre', 'apellido_paterno', 'apellido_materno'].includes(k)) { if (!out.includes('Nombre corregido')) out.push('Nombre corregido'); }
        else if (['clabe', 'banco', 'beneficiario'].includes(k)) { if (!out.includes('Datos bancarios actualizados')) out.push('Datos bancarios actualizados'); }
        else if (k === 'motivo_baja' && is('developer', 'director')) out.push('Motivo de baja: ' + (a.motivo_baja || '—'));
        else if (['curp', 'rfc', 'nss', 'fecha_nacimiento', 'telefono', 'correo', 'domicilio'].includes(k)) { if (!out.includes('Datos personales actualizados')) out.push('Datos personales actualizados'); }
      }
      return out;
    };
    const items = hs.map((h) => ({ h, d: desc(h) })).filter((x) => x.d.length);
    body.innerHTML = card(`Historial de movimientos (${items.length})`, items.length ? `<div class="ex-tl">${items.map(({ h, d }) => `<div class="ex-ev"><div class="small muted">${fmtDateTime(h.at)} · ${esc(h.user_name || 'Sistema')}${h.user_role ? ' (' + esc(ROLES[h.user_role] || h.user_role) + ')' : ''}</div>${d.map((x) => `<div>${esc(x)}</div>`).join('')}</div>`).join('')}</div>` : '<span class="small muted">Sin movimientos registrados.</span>');
  }
};

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
    const b = readFields(el, base); const pv = checkBanco(readFields(el, priv));
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
        const v = checkBanco(readFields(el, pf));
        if (v.curp && !/^[A-Z]{4}\d{6}[HMX][A-Z]{5}[A-Z0-9]\d$/.test(v.curp)) throw new Error('La CURP no tiene un formato válido.');
        const changed = PRIV_FIELDS.some((f) => String(v[f.k] ?? '') !== String((p && p[f.k]) ?? ''));
        if (changed) await db('employee_private').insert([{ employee_id: e.id, ...v }], { onConflict: 'employee_id' });
      }
      toast('Guardado'); viewPersonal();
    } }]
  });
}

// Nómina: solo los datos bancarios de la ficha
function bancoForm(e, p) {
  const fields = PRIV_FIELDS.filter((f) => ['clabe', 'banco', 'beneficiario'].includes(f.k)).map((f) => ({ ...f, val: p ? p[f.k] : '' }));
  const m = modal({
    title: 'Datos bancarios · ' + fullName(e), body: fieldsHtml(fields) + '<div id="bf_h" class="small" style="margin-top:6px"></div>',
    actions: [{ label: 'Cancelar' }, { label: 'Guardar', cls: 'primary', run: async ({ el }) => {
      const v = checkBanco(readFields(el, fields));
      await rpc('set_datos_bancarios', { p_emp: e.id, p_clabe: v.clabe, p_banco: v.banco, p_beneficiario: v.beneficiario });
      toast('Datos bancarios guardados'); openEmployee(e.id);
    } }]
  });
  const cl = $('#f_clabe', m.el), h = $('#bf_h', m.el);
  const paint = () => { const d = clabeDigits(cl.value); h.innerHTML = !d ? '' : clabeOk(d) ? `<span style="color:var(--ok)">CLABE válida${bancoDeClabe(d) ? ' · ' + esc(bancoDeClabe(d)) : ''}</span>` : `<span style="color:var(--bad)">CLABE no válida (${d.length} dígitos)</span>`; };
  cl.addEventListener('input', paint); paint();
}

function moveGroup(e, done) {
  const opts = [['', 'Sin grupo'], ...S.groups.filter((g) => g.area_id === e.area_id && g.active).map((g) => [g.id, g.name + (g.tl_id ? ' — ' + profName(g.tl_id) : '')])];
  const f = [{ k: 'group_id', label: 'Grupo / líder', type: 'select', options: opts, val: e.group_id || '', full: true }];
  modal({
    title: 'Cambiar grupo · ' + fullName(e), body: fieldsHtml(f) + '<div class="small muted">Solo grupos de la misma área.</div>',
    actions: [{ label: 'Cancelar' }, { label: 'Guardar', cls: 'primary', run: async ({ el }) => {
      const v = readFields(el, f); await mustUpdate(db('employees').eq('id', e.id).update({ group_id: v.group_id || null })); toast('Grupo actualizado'); (done || viewPersonal)();
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
// ───── Vacaciones: RH registra, se marcan solas en el pase de lista y se descuentan del saldo (Art. 76 LFT) ─────
const VS = { q: '', area: '', ver: 'actuales' };
const canEditVac = (e) => is('developer') || (is('rh_general', 'rh_area') && e && S.myAreas.includes(e.area_id));
const canSaldoVac = (e) => canEditVac(e) || is('director', 'nomina');
const DOW_L = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const dowOf = (iso) => new Date(iso + 'T12:00:00Z').getUTCDay();
const vacRango = (x) => x.tipo === 'ajuste' ? `Ajuste · ${fmtDate(x.fecha_inicio)}` : x.fecha_inicio === x.fecha_fin ? fmtDate(x.fecha_inicio) : `${fmtDate(x.fecha_inicio)} al ${fmtDate(x.fecha_fin)}`;
function vacSaldoHtml(s, { compact } = {}) {
  if (!s) return '';
  const disp = num(s.disponibles);
  const chips = `<div class="row" style="gap:16px;flex-wrap:wrap">
    <div><div class="eyebrow">Disponibles</div><b style="font-size:22px;color:${disp < 0 ? 'var(--bad)' : 'var(--ok)'}">${disp}</b> <span class="small muted">días</span></div>
    <div><div class="eyebrow">Derecho (${s.anios_cumplidos} año${s.anios_cumplidos === 1 ? '' : 's'})</div><b style="font-size:18px">${num(s.derecho)}</b></div>
    <div><div class="eyebrow">Tomados</div><b style="font-size:18px">${num(s.tomados)}</b></div>
    <div><div class="eyebrow">Programados</div><b style="font-size:18px">${num(s.programados)}</b></div>
    <div><div class="eyebrow">Año en curso (${s.anio_actual || 1}º)</div><b style="font-size:18px">${num(s.proporcional).toFixed(2)}</b> <span class="small muted">de ${s.dias_anio_actual} · se generan completos el ${fmtDate(s.aniversario)}</span></div></div>
    ${num(s.adelantados) > 0 ? `<div class="notice n-warn" style="margin-top:8px">${num(s.adelantados)} días adelantados: se tomaron antes de generarse.</div>` : ''}`;
  if (compact || !(s.anios || []).length) return chips + (s.ingreso ? '' : '<div class="notice n-warn" style="margin-top:8px">Sin fecha de ingreso: no se puede calcular el saldo.</div>');
  return chips + `<div class="scrollx" style="margin-top:10px"><table class="tbl sub"><thead><tr><th>Año</th><th>Periodo</th><th style="text-align:right">Días de ley</th><th style="text-align:right">Tomados</th><th style="text-align:right">Disponibles</th></tr></thead><tbody>
    ${s.anios.map((a) => `<tr><td>${a.anio}º</td><td class="small">${fmtDate(a.desde)} – ${fmtDate(a.hasta)}</td><td class="mono" style="text-align:right">${a.dias}</td><td class="mono" style="text-align:right">${num(a.tomados)}</td><td class="mono" style="text-align:right"><b>${num(a.disponibles)}</b></td></tr>`).join('')}
  </tbody></table></div><div class="small muted" style="margin-top:6px">Los días tomados se descuentan primero del año más antiguo. Tabla del Art. 76 LFT: 12 días el primer año, +2 por año hasta 20, y +2 cada 5 años.</div>`;
}
async function vacEmpleados() {
  return (await db('employees').select('id,nombre,apellido_paterno,apellido_materno,num_empleado,area_id,group_id,status,fecha_ingreso').eq('status', 'activo').get()).sort(sortName);
}
async function viewVacaciones(v) {
  const hoy = todayMX();
  const [vacs, emps] = await Promise.all([db('vacaciones').eq('estado', 'aprobada').order('fecha_inicio', false).getAll(), vacEmpleados()]);
  const empById = Object.fromEntries(emps.map((e) => [e.id, e]));
  const areas = visibleAreas();
  const q = norm(VS.q);
  const vis = vacs.filter((x) => empById[x.employee_id] && (!VS.area || empById[x.employee_id].area_id === VS.area) && (!q || norm(fullName(empById[x.employee_id]) + ' ' + (empById[x.employee_id].num_empleado || '')).includes(q)));
  const hoyV = vis.filter((x) => x.tipo === 'disfrute' && (x.fechas || []).includes(hoy));
  const prox = vis.filter((x) => x.tipo === 'disfrute' && x.fecha_inicio > hoy).sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio));
  const pas = vis.filter((x) => !hoyV.includes(x) && !prox.includes(x));
  const puede = is('developer', 'rh_general', 'rh_area');
  const row = (x) => { const e = empById[x.employee_id];
    return `<button type="button" class="item" data-vac="${x.id}"><span class="grow"><span class="nm">${esc(fullName(e))}</span><br><span class="small muted">${esc(areaName(e.area_id))} · ${esc(groupName(e.group_id))} · ${esc(vacRango(x))}${x.nota ? ' · ' + esc(x.nota) : ''}</span></span>
      ${x.adelanto ? '<span class="badge b-warn">Adelanto</span>' : ''}<span class="badge ${x.tipo === 'ajuste' ? 'b-mut' : 'b-ok'}">${num(x.dias)} día${num(x.dias) === 1 ? '' : 's'}</span></button>`; };
  const sec = (t, xs, empty) => `<div class="eyebrow" style="margin:14px 0 8px">${t} (${xs.length})</div><div class="list">${xs.length ? xs.map(row).join('') : `<div class="card empty small">${empty}</div>`}</div>`;
  v.insertAdjacentHTML('beforeend', `
    <div class="card pad" style="display:flex;flex-direction:column;gap:10px;margin-bottom:6px">
      <div class="row" style="gap:8px"><input class="inp grow" id="vq" type="search" placeholder="Buscar persona" value="${esc(VS.q)}" aria-label="Buscar">
        ${areas.length > 1 ? `<select class="inp" id="varea" aria-label="Área" style="max-width:220px"><option value="">Todas las áreas</option>${areas.map((a) => `<option value="${a.id}"${VS.area === a.id ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select>` : ''}
        <button class="btn" id="vsaldo">Ver saldo de una persona</button>${puede ? '<button class="btn primary" id="vnew">+ Registrar vacaciones</button>' : ''}</div>
      <div class="small muted">RH registra las vacaciones aprobadas. Esos días aparecen solos como <b>Vacaciones</b> en el pase de lista, no cuentan como falta, se pagan normal y suman prima vacacional del 25 % en la pre-nómina.</div>
    </div>
    ${sec('De vacaciones hoy', hoyV, 'Nadie está de vacaciones hoy.')}
    ${sec('Próximas', prox, 'Sin vacaciones programadas.')}
    ${sec('Anteriores y ajustes', pas.slice(0, 60), 'Sin registros.')}`);
  const re = () => viewAsistencia();
  $('#vq').oninput = (e) => { VS.q = e.target.value; clearTimeout(viewVacaciones._t); viewVacaciones._t = setTimeout(() => re().then(() => { const i = $('#vq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }), 300); };
  if ($('#varea')) $('#varea').onchange = (e) => { VS.area = e.target.value; re(); };
  if ($('#vnew')) $('#vnew').onclick = () => vacForm({ emps: emps.filter((e) => canEditVac(e)), onDone: re });
  $('#vsaldo').onclick = () => elegirPersona('Saldo de vacaciones · ¿de quién?', emps.filter(canSaldoVac).map((e) => ({ ...e, nombre: fullName(e), sub: `${areaName(e.area_id)} · ingreso ${fmtDate(e.fecha_ingreso)}` })), '', async (e, m) => { m.close(); vacSaldoModal(empById[e.id], re); });
  $$('[data-vac]').forEach((b) => b.onclick = () => { const x = vacs.find((y) => y.id === b.dataset.vac); vacDetalle(x, empById[x.employee_id], re); });
}
async function vacSaldoModal(e, onDone) {
  const [s, hist] = await Promise.all([rpc('vacaciones_saldo', { p_emp: e.id }), db('vacaciones').eq('employee_id', e.id).order('fecha_inicio', false).get()]);
  const m = modal({ title: 'Vacaciones · ' + fullName(e), wide: true, body: `${vacSaldoHtml(s)}
    <div class="eyebrow" style="margin:14px 0 8px">Registros</div><div class="list">${hist.length ? hist.map((x) => `<button type="button" class="item" data-vh="${x.id}"><span class="grow small">${esc(vacRango(x))}${x.nota ? ' · ' + esc(x.nota) : ''}</span>${x.estado === 'cancelada' ? '<span class="badge b-mut">Cancelada</span>' : `<span class="badge ${x.tipo === 'ajuste' ? 'b-mut' : 'b-ok'}">${num(x.dias)} días</span>`}</button>`).join('') : '<div class="card empty small">Sin registros.</div>'}</div>`,
    actions: canEditVac(e) && e.status === 'activo' ? [{ label: 'Cerrar' }, { label: '+ Registrar vacaciones', cls: 'primary', run: () => { setTimeout(() => vacForm({ emps: [e], employee: e, onDone }), 0); } }] : [{ label: 'Cerrar' }] });
  $$('[data-vh]', m.el).forEach((b) => b.onclick = () => { const x = hist.find((y) => y.id === b.dataset.vh); m.close(); vacDetalle(x, e, onDone); });
}
function vacDetalle(x, e, onDone) {
  const hoy = todayMX(), fut = (x.fechas || []).filter((f) => f > hoy).length;
  const puede = canEditVac(e) && x.estado === 'aprobada' && (x.tipo === 'ajuste' || fut > 0);
  modal({ title: (x.tipo === 'ajuste' ? 'Ajuste de saldo · ' : 'Vacaciones · ') + fullName(e), wide: true,
    body: `<div class="kv"><span>Estado</span><span>${x.estado === 'aprobada' ? '<span class="badge b-ok">Aprobada</span>' : '<span class="badge b-mut">Cancelada</span>'}</span>
      <span>${x.tipo === 'ajuste' ? 'Fecha del ajuste' : 'Periodo'}</span><span>${esc(vacRango(x))}</span><span>Días</span><span class="mono">${num(x.dias)}${x.adelanto ? ' · adelantados' : ''}</span>
      ${x.nota ? `<span>Nota</span><span>${esc(x.nota)}</span>` : ''}<span>Registró</span><span>${esc(profName(x.created_by))} · ${fmtDateTime(x.created_at)}</span>
      ${x.cancelado_motivo ? `<span>Cancelación</span><span>${esc(x.cancelado_motivo)} · ${esc(profName(x.cancelado_by))}</span>` : ''}</div>
      ${x.tipo === 'disfrute' ? `<div class="row" style="gap:4px;margin-top:10px;flex-wrap:wrap">${(x.fechas || []).map((f) => `<span class="badge ${f <= hoy ? 'b-mut' : 'b-ok'}">${DOW_L[dowOf(f)]} ${fmtDate(f)}</span>`).join('')}</div>` : ''}
      ${puede && x.tipo === 'disfrute' && fut < (x.fechas || []).length ? `<div class="notice n-info" style="margin-top:10px">Ya empezaron: al cancelar solo se quitan los ${fut} días que faltan.</div>` : ''}`,
    actions: puede ? [{ label: 'Cerrar' }, { label: x.tipo === 'ajuste' ? 'Cancelar ajuste' : 'Cancelar días que faltan', cls: 'danger', run: () => { setTimeout(() => simpleCaseAction('Cancelar vacaciones', [{ k: 'm', label: 'Motivo', type: 'textarea', req: true, full: true }],
      async (v) => { const r = await rpc('vacaciones_cancelar', { p_id: x.id, p_motivo: v.m }); toast(r === 'recortada' ? 'Se quitaron los días que faltaban' : 'Vacaciones canceladas'); }, () => onDone && onDone(), 'Los días cancelados regresan al saldo.'), 0); } }] : [{ label: 'Cerrar' }] });
}
async function vacForm({ emps, employee, onDone }) {
  if (!employee) {
    if (!emps.length) return toast('No hay personal activo en tus áreas', true);
    return elegirPersona('Registrar vacaciones · ¿para quién?', emps.map((e) => ({ ...e, nombre: fullName(e), sub: `${areaName(e.area_id)} · ${groupName(e.group_id)} · ingreso ${fmtDate(e.fecha_ingreso)}` })), '', async (e, m) => { m.close(); vacForm({ emps, employee: emps.find((x) => x.id === e.id), onDone }); });
  }
  const e = employee; const s = await rpc('vacaciones_saldo', { p_emp: e.id });
  const t = todayMX();
  const fs = [{ k: 'ini', label: 'Del', type: 'date', req: true, val: addDays(t, 1) }, { k: 'fin', label: 'Al', type: 'date', req: true, val: addDays(t, 5) }];
  const m = modal({ title: 'Vacaciones · ' + fullName(e), wide: true,
    body: `<div class="card pad" style="background:var(--soft);margin-bottom:12px">${vacSaldoHtml(s, { compact: true })}</div>
      <div class="seg" role="group" aria-label="Tipo" style="margin-bottom:10px"><button type="button" data-vt="disfrute" class="on">Vacaciones</button><button type="button" data-vt="ajuste">Ajuste de saldo</button></div>
      <div id="vt_disfrute">${fieldsHtml(fs)}<div class="eyebrow" style="margin:12px 0 6px">Días que se descuentan <span id="v_n"></span></div>
        <div id="v_dias" class="row" style="gap:6px;flex-wrap:wrap"></div><div class="small muted" style="margin-top:6px">Los domingos y días festivos vienen sin marcar; toca un día para incluirlo o quitarlo.</div>
        <label class="row small" style="gap:6px;margin-top:10px"><input type="checkbox" id="v_adel"> Adelantar días (la empresa autoriza tomar días que todavía no se generan)</label></div>
      <div id="vt_ajuste" hidden>${fieldsHtml([{ k: 'adias', label: 'Días ya disfrutados', type: 'number' }, { k: 'afecha', label: 'Fecha de registro', type: 'date', val: t }])}
        <div class="small muted" style="margin-top:6px">Para días que la persona ya disfrutó antes de registrar vacaciones en la app. Se restan de su saldo.</div></div>
      ${fieldsHtml([{ k: 'nota', label: 'Nota', type: 'textarea', full: true, hint: 'Ej. "Aprobadas por su supervisor" o, en un ajuste, de qué periodo son los días.' }])}`,
    actions: [{ label: 'Cancelar' }, { label: 'Registrar', cls: 'primary', run: async ({ el }) => {
      const tipo = $('[data-vt].on', el).dataset.vt; const nota = $('#f_nota', el).value.trim() || null;
      if (tipo === 'ajuste') {
        const d = num($('#f_adias', el).value); if (!(d > 0)) throw new Error('Escribe cuántos días ya disfrutó.');
        if (!nota) throw new Error('Escribe en la nota de qué periodo son esos días.');
        await db('vacaciones').insert([{ employee_id: e.id, tipo: 'ajuste', dias: d, fecha_inicio: $('#f_afecha', el).value || t, nota }]);
      } else {
        const fechas = $$('[data-vd].on', el).map((b) => b.dataset.vd);
        if (!fechas.length) throw new Error('Elige al menos un día.');
        await db('vacaciones').insert([{ employee_id: e.id, tipo: 'disfrute', fechas, dias: fechas.length, adelanto: $('#v_adel', el).checked, nota }]);
      }
      toast('Vacaciones registradas'); onDone && onDone();
    } }] });
  const paint = () => {
    const a = $('#f_ini', m.el).value, b = $('#f_fin', m.el).value; const box = $('#v_dias', m.el);
    if (!a || !b || b < a) { box.innerHTML = '<span class="small muted">Elige el rango.</span>'; $('#v_n', m.el).textContent = ''; return; }
    const prev = new Map($$('[data-vd]', m.el).map((x) => [x.dataset.vd, x.classList.contains('on')]));
    const fest = new Set(festivosEn(a, b).map(([d]) => d)); const ds = [];
    for (let d = a; d <= b && ds.length < 63; d = addDays(d, 1)) ds.push(d);
    box.innerHTML = ds.map((d) => { const on = prev.has(d) ? prev.get(d) : !(dowOf(d) === 0 || fest.has(d)); return `<button type="button" class="btn sm${on ? ' on primary' : ''}" data-vd="${d}" style="min-height:34px">${DOW_L[dowOf(d)]} ${Number(d.slice(8))}/${Number(d.slice(5, 7))}${fest.has(d) ? ' ★' : ''}</button>`; }).join('');
    $$('[data-vd]', m.el).forEach((x) => x.onclick = () => { x.classList.toggle('on'); x.classList.toggle('primary'); count(); });
    count();
  };
  const count = () => { const n = $$('[data-vd].on', m.el).length; const disp = num(s.disponibles); $('#v_n', m.el).innerHTML = `· <b>${n}</b> día${n === 1 ? '' : 's'}${n > disp ? ` <span class="badge b-warn">pasa de ${Math.max(disp, 0)} disponibles</span>` : ''}`; };
  $$('#f_ini,#f_fin', m.el).forEach((i) => i.addEventListener('change', paint)); paint();
  $$('[data-vt]', m.el).forEach((b) => b.onclick = () => { $$('[data-vt]', m.el).forEach((x) => x.classList.toggle('on', x === b)); $('#vt_disfrute', m.el).hidden = b.dataset.vt !== 'disfrute'; $('#vt_ajuste', m.el).hidden = b.dataset.vt !== 'ajuste'; });
}

const AS = { fecha: null, area: '', open: null, tab: 'dia' };
const asTabs = () => `<div class="seg" role="tablist" aria-label="Vista" style="margin-bottom:12px"><button type="button" data-astab="dia" class="${AS.tab === 'dia' ? 'on' : ''}">Pase del día</button><button type="button" data-astab="vac" class="${AS.tab === 'vac' ? 'on' : ''}">Vacaciones</button></div>`;
const bindAsTabs = () => $$('[data-astab]').forEach((b) => b.onclick = () => { AS.tab = b.dataset.astab; viewAsistencia(); });
async function viewAsistencia() {
  const v = $('#view');
  if (AS.tab === 'vac') {
    v.innerHTML = `<div class="pagehead"><div><h1>Asistencia</h1><div class="muted small">Vacaciones</div></div></div>${asTabs()}`;
    bindAsTabs(); return viewVacaciones(v);
  }
  if (!AS.fecha) AS.fecha = todayMX();
  const areas = visibleAreas();
  const groups = S.groups.filter((g) => g.active && (seesAllAreas() || S.myAreas.includes(g.area_id)) && (!AS.area || g.area_id === AS.area))
    .sort((a, b) => (areaName(a.area_id) + a.name).localeCompare(areaName(b.area_id) + b.name, 'es'));
  let ef = db('employees').select('id,nombre,apellido_paterno,apellido_materno,area_id,group_id,status,origen').in('status', ['activo', 'alta_pendiente']);
  let af = db('attendance').eq('fecha', AS.fecha);
  if (AS.area) { ef = ef.eq('area_id', AS.area); af = af.eq('area_id', AS.area); }
  const [emps, att, days, faltas] = await Promise.all([ef.get(), af.get(), db('attendance_days').eq('fecha', AS.fecha).get(), db('faltas_30d').gte('faltas', 3).get()]);
  const byEmp = {}, byEmpT = {};
  att.forEach((a) => { (a.turno === 'tarde' ? byEmpT : byEmp)[a.employee_id] = a; });
  const dayBy = Object.fromEntries(days.map((d) => [d.group_id, d]));
  const empById = Object.fromEntries(emps.map((e) => [e.id, e]));
  const canReview = is('developer', 'nomina');
  const rows = groups.map((g) => {
    const people = emps.filter((e) => e.group_id === g.id).sort(sortName);
    const c = attCounts(); let n = 0, nT = 0, dif = 0;
    people.forEach((e) => { const a = byEmp[e.id], t = byEmpT[e.id]; if (a) { n++; countAtt(c, a); } if (t) { nT++; countAtt(c, t); } if (attMismatch(a, t)) dif++; });
    return { g, people, c, n, nT, dif, d: dayBy[g.id] || {} };
  });
  const noGroup = emps.filter((e) => !e.group_id).length;
  const alerts = faltas.filter((f) => empById[f.employee_id]).sort((a, b) => b.faltas - a.faltas);
  v.innerHTML = `
  <div class="pagehead"><div><h1>Asistencia</h1><div class="muted small">${dayLabel(AS.fecha)}</div></div>
    <div class="row"><input type="date" class="inp mono" id="as_date" value="${AS.fecha}" max="${todayMX()}" aria-label="Fecha">
    ${areas.length > 1 ? `<select class="inp" id="as_area" aria-label="Área"><option value="">Todas las áreas</option>${areas.map((a) => `<option value="${a.id}"${AS.area === a.id ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select>` : ''}
    <button class="btn" id="as_exp">Exportar periodo</button></div></div>
  ${asTabs()}
  ${alerts.length ? `<div class="card pad" style="margin-bottom:12px"><div class="eyebrow" style="margin-bottom:8px">Alertas · faltas en los últimos 30 días</div>
    <div class="list">${alerts.map((f) => { const e = empById[f.employee_id]; return `<div class="row" style="justify-content:space-between;border-bottom:1px solid var(--line);padding-bottom:8px"><span><b>${esc(fullName(e))}</b><br><span class="small muted">${esc(areaName(e.area_id))} · ${esc(groupName(e.group_id))}${f.retardos ? ` · ${f.retardos} retardos` : ''}</span></span>${faltasBadge(f.faltas)}</div>`; }).join('')}</div>
    <div class="small muted" style="margin-top:8px">Rojo: más de 3 faltas en 30 días (LFT art. 47 fr. X). Ámbar: 3 faltas.</div></div>` : ''}
  <div class="card scrollx"><table class="tbl"><thead><tr><th>Grupo</th><th>Mañana</th><th>F</th><th>R</th><th>Tarde</th><th>S</th><th>Dif.</th><th>Revisión</th></tr></thead><tbody>
    ${rows.map((r) => `<tr data-g="${r.g.id}" style="cursor:pointer">
      <td><b>${esc(groupLabel(r.g))}</b><br><span class="small muted">${esc(areaName(r.g.area_id))}${r.g.tl_id ? ' · ' + esc(profName(r.g.tl_id)) : r.g.tipo === 'lideres' ? ' · pasa lista Supervisión' : ' · sin TL'}</span></td>
      <td class="mono small">${r.n}/${r.people.length}<br>${r.d.sent_at ? `<span class="badge b-ok">✓ ${fmtTime(r.d.sent_at)}</span>` : '<span class="badge b-mut">sin enviar</span>'}</td>
      <td class="mono" style="color:var(--bad)">${r.c.falta || ''}</td><td class="mono" style="color:var(--warn)">${r.c.retardo || ''}</td>
      <td class="mono small">${r.nT}/${r.people.length}<br>${r.d.sent_pm_at ? `<span class="badge b-ok">✓ ${fmtTime(r.d.sent_pm_at)}</span>` : '<span class="badge b-mut">sin enviar</span>'}</td>
      <td class="mono" style="color:var(--warn)">${r.c.salida || ''}</td>
      <td>${r.dif ? `<span class="badge b-warn">${r.dif}</span>` : r.nT ? '<span class="small muted">0</span>' : ''}</td>
      <td>${r.d.reviewed_at ? `<span class="badge b-ok">Revisado ${fmtTime(r.d.reviewed_at)}</span>` : '<span class="badge b-mut">Pendiente</span>'}
        ${canReview ? `<br><button class="btn sm" data-rev="${r.g.id}" data-on="${r.d.reviewed_at ? '0' : '1'}" style="margin-top:4px">${r.d.reviewed_at ? 'Quitar revisión' : 'Marcar revisado'}</button>` : ''}</td></tr>
      ${AS.open === r.g.id ? `<tr><td colspan="8" style="background:var(--soft)">${r.people.length ? `<table class="tbl sub"><thead><tr><th>Persona</th><th>Mañana</th><th>Tarde</th></tr></thead><tbody>${r.people.map((e) => { const a = byEmp[e.id], t = byEmpT[e.id]; const dif = attMismatch(a, t);
          const cell = (x) => x ? `${attBadges(x)}${x.comentario ? `<br><span class="small muted">${esc(x.comentario)}</span>` : ''}` : '<span class="badge b-mut">Sin registrar</span>';
          return `<tr${dif ? ' class="dif"' : ''}><td>${esc(fullName(e))}${e.status === 'alta_pendiente' ? ' <span class="badge b-warn">alta pendiente</span>' : ''}${dif ? `<br><span class="small" style="color:var(--warn);font-weight:600">${esc(dif)}</span>` : ''}</td><td>${cell(a)}</td><td>${cell(t)}</td></tr>`; }).join('')}</tbody></table>` : '<span class="muted">Sin personal</span>'}
        ${canWriteAttendance() && writableGroups().some((x) => x.id === r.g.id) ? `<button class="btn sm ghost" data-goto="${r.g.id}" style="margin-top:8px">Abrir pase de lista</button>` : ''}</td></tr>` : ''}`).join('') || '<tr><td colspan="8" class="empty">Sin grupos</td></tr>'}
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
  bindAsTabs();
}

function exportPeriod() {
  const t = todayMX(); const d = Number(t.slice(8));
  const from = d <= 15 ? t.slice(0, 8) + '01' : t.slice(0, 8) + '16';
  const f = [{ k: 'from', label: 'Desde', type: 'date', req: true, val: from, max: t }, { k: 'to', label: 'Hasta', type: 'date', req: true, val: t, max: t }];
  modal({
    title: 'Exportar asistencia (CSV para Excel)', body: fieldsHtml(f) + '<div class="small muted">Una fila por persona y una columna por día (mañana/tarde: A = asistió/presente, F = falta/ausente, R = retardo, S = salida anticipada, P = permiso, D = descanso, I = inactividad), con totales. Incluye solo lo que tu rol puede ver.</div>',
    actions: [{ label: 'Cancelar' }, { label: 'Descargar', cls: 'primary', run: async ({ el }) => {
      const v = readFields(el, f);
      if (v.from > v.to) throw new Error('La fecha inicial es posterior a la final.');
      const days = []; for (let x = v.from; x <= v.to; x = addDays(x, 1)) { days.push(x); if (days.length > 62) throw new Error('Máximo 62 días por exportación.'); }
      let qa = db('attendance').select('employee_id,fecha,turno,status,aviso,incidencia,incidencias,comentario,area_id').gte('fecha', v.from).lte('fecha', v.to);
      if (AS.area) qa = qa.eq('area_id', AS.area);
      const [att, emps] = await Promise.all([qa.order('fecha').order('employee_id').getAll(), db('employees').select('id,num_empleado,nombre,apellido_paterno,apellido_materno,area_id,group_id,status').get()]);
      const empById = Object.fromEntries(emps.map((e) => [e.id, e]));
      const per = {}, perT = {}; att.forEach((a) => { const m = a.turno === 'tarde' ? perT : per; (m[a.employee_id] = m[a.employee_id] || {})[a.fecha] = a; if (!per[a.employee_id]) per[a.employee_id] = {}; });
      const ids = Object.keys(per).sort((a, b) => sortName(empById[a] || { apellido_paterno: '', nombre: '' }, empById[b] || { apellido_paterno: '', nombre: '' }));
      const q = (s) => { let t = String(s ?? ''); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return '"' + t.replace(/"/g, '""') + '"'; };
      const lines = [['No.', 'Nombre', 'Área', 'Grupo', ...days.map(fmtDate), 'Asistencias', 'Faltas', 'Retardos', 'Salidas anticipadas', 'Permisos', 'Descansos', 'Inactividad', 'Vacaciones', 'Diferencias mañana/tarde', 'Avisos', 'Comentarios'].map(q).join(',')];
      for (const id of ids) {
        const e = empById[id] || { nombre: '(sin acceso)', apellido_paterno: '' }; const r = per[id]; const rt = perT[id] || {}; let dif = 0;
        const c = attCounts(); const inc = [];
        const av = [];
        days.forEach((dd) => { for (const [a, tt] of [[r[dd], ''], [rt[dd], ' tarde']]) { if (!a) continue; countAtt(c, a); if (a.aviso) av.push(fmtDate(dd) + ': ' + AVISO[a.aviso]); if ((a.incidencias || []).length || a.comentario) inc.push(fmtDate(dd) + tt + ': ' + [INC[a.incidencia], ...(a.incidencias || []), a.comentario].filter(Boolean).join('/')); } if (attMismatch(r[dd], rt[dd])) dif++; });
        lines.push([e.num_empleado, fullName(e), areaName(e.area_id), groupName(e.group_id), ...days.map((dd) => (r[dd] || rt[dd]) ? attShort(r[dd]) + '/' + attShort(rt[dd]) : ''), c.asistio, c.falta, c.retardo, c.salida, c.permiso, c.descanso, c.inactividad, c.vacaciones, dif, av.join(' | '), inc.join(' | ')].map(q).join(','));
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
  const empsG = await db('employees').select('group_id,status').get().catch(() => []);
  const perG = {}, allG = {}; empsG.forEach((e) => { if (!e.group_id) return; allG[e.group_id] = (allG[e.group_id] || 0) + 1; if (e.status !== 'baja' && e.status !== 'rechazado') perG[e.group_id] = (perG[e.group_id] || 0) + 1; });
  const tls = S.profiles.filter((p) => p.role === 'tl' && p.active);
  v.innerHTML = `<div class="pagehead"><h1>Áreas y grupos</h1><div class="row"><button class="btn" id="na">+ Área</button><button class="btn primary" id="ng">+ Grupo</button></div></div>
  ${S.areas.map((a) => `<div class="card" style="margin-bottom:12px"><div class="pad row" style="border-bottom:1px solid var(--line)"><b class="grow">${esc(a.name)}</b><span class="small muted">Cierre desde ${String(a.hora_cierre || '16:00').slice(0, 5)}</span>${a.active ? '' : '<span class="badge b-mut">Inactiva</span>'}<button class="btn sm" data-ea="${a.id}">Editar</button></div>
    <table class="tbl"><tbody>${S.groups.filter((g) => g.area_id === a.id).map((g) => `<tr><td><b>${esc(g.name)}</b>${g.tipo === 'lideres' ? ' <span class="badge b-acc">Líderes</span>' : ''}${g.active ? '' : ' <span class="badge b-mut">Inactivo</span>'}</td><td>${g.tipo === 'lideres' ? '<span class="small muted">Pasa lista: Supervisión</span>' : g.tl_id ? esc(profName(g.tl_id)) : '<span class="badge b-warn">Sin TL</span>'}</td><td class="small muted">${perG[g.id] ? perG[g.id] + (perG[g.id] === 1 ? ' persona' : ' personas') : 'Vacío'}</td><td style="text-align:right;white-space:nowrap"><button class="btn sm primary" data-ag="${g.id}">+ Agregar personal</button> <button class="btn sm" data-eg="${g.id}">Editar</button> <button class="btn sm danger" data-dg="${g.id}" aria-label="Eliminar ${esc(g.name)}">Eliminar</button></td></tr>`).join('') || '<tr><td class="muted">Sin grupos</td></tr>'}</tbody></table></div>`).join('')}
  <div class="card pad"><div class="eyebrow" style="margin-bottom:8px">Cambios de área no permitidos</div>
    ${S.blocks.map((b) => `<div class="row" style="padding:4px 0"><span class="grow">${esc(areaName(b.from_area))} → ${esc(areaName(b.to_area))}</span><button class="btn sm danger" data-db="${b.from_area}|${b.to_area}">Quitar</button></div>`).join('') || '<span class="muted small">Ninguno</span>'}
    <button class="btn sm" id="nb" style="margin-top:8px">+ Bloquear cambio</button></div>`;
  const areaOpts = S.areas.map((a) => [a.id, a.name]);
  $('#na').onclick = () => simpleForm('Nueva área', [{ k: 'name', label: 'Nombre', req: true, full: true }], (x) => db('areas').insert([x]));
  $$('[data-ea]').forEach((b) => b.onclick = () => { const a = S.areas.find((x) => x.id === b.dataset.ea); simpleForm('Editar área', [{ k: 'name', label: 'Nombre', req: true, val: a.name }, { k: 'hora_cierre', label: 'Pase de la tarde desde', type: 'time', req: true, val: String(a.hora_cierre || '16:00').slice(0, 5) }, { k: 'active', label: 'Estado', type: 'select', val: a.active ? '1' : '0', options: [['1', 'Activa'], ['0', 'Inactiva']] }], (x) => mustUpdate(db('areas').eq('id', a.id).update({ name: x.name, hora_cierre: x.hora_cierre, active: x.active === '1' })), 'Hora de Ciudad de México. Antes de esa hora no se puede capturar ni enviar el cierre del día.'); });
  const gFields = (g) => [
    { k: 'area_id', label: 'Área', type: 'select', req: true, options: areaOpts, val: g ? g.area_id : '' },
    { k: 'name', label: 'Nombre del grupo', req: true, val: g ? g.name : '' },
    { k: 'tipo', label: 'Tipo', type: 'select', val: g ? g.tipo || 'agentes' : 'agentes', options: [['agentes', 'Agentes (lo pasa su TL)'], ['lideres', 'Líderes (lo pasa Supervisión)']] },
    { k: 'tl_id', label: 'Team Leader', type: 'select', val: g ? g.tl_id || '' : '', options: [['', 'Sin TL'], ...tls.map((p) => [p.id, p.full_name])] },
    ...(g ? [{ k: 'active', label: 'Estado', type: 'select', val: g.active ? '1' : '0', options: [['1', 'Activo'], ['0', 'Inactivo']] }] : [])
  ];
  $('#ng').onclick = () => simpleForm('Nuevo grupo', gFields(null), (x) => db('groups').insert([{ ...x, tl_id: x.tipo === 'lideres' ? null : x.tl_id || null }]), 'Solo aparecen como TL los usuarios con rol Team Leader. Un grupo de Líderes no lleva TL.');
  $$('[data-ag]').forEach((b) => b.onclick = () => addToGroupForm(S.groups.find((x) => x.id === b.dataset.ag)));
  $$('[data-dg]').forEach((b) => b.onclick = async () => {
    const g = S.groups.find((x) => x.id === b.dataset.dg);
    const n = perG[g.id] || 0, nb = (allG[g.id] || 0) - n;
    if (n) return toast(`“${g.name}” tiene ${n} persona(s). Muévelas a otro grupo antes de eliminarlo.`, true);
    if (nb) return toast(`“${g.name}” conserva ${nb} baja(s) o rechazo(s) en su historial: desactívalo desde Editar en lugar de eliminarlo.`, true);
    if (!(await confirmBox('Eliminar grupo', `Se eliminará <b>${esc(g.name)}</b> de ${esc(areaName(g.area_id))}. Solo se puede si no tiene historial; si lo tiene, desactívalo desde Editar.`, { okLabel: 'Eliminar', danger: true }))) return;
    try {
      const rows = await db('groups').eq('id', g.id).remove();
      if (!rows || !rows.length) throw new Error('No se pudo eliminar el grupo.');
      toast('Grupo eliminado'); viewCatalogos();
    } catch (e) { toast(e.message, true); }
  });
  $$('[data-eg]').forEach((b) => b.onclick = () => { const g = S.groups.find((x) => x.id === b.dataset.eg); simpleForm('Editar grupo', gFields(g), (x) => mustUpdate(db('groups').eq('id', g.id).update({ area_id: x.area_id, name: x.name, tipo: x.tipo, tl_id: x.tipo === 'lideres' ? null : x.tl_id || null, active: x.active === '1' }))); });
  $('#nb').onclick = () => simpleForm('Bloquear cambio de área', [{ k: 'from_area', label: 'De', type: 'select', options: areaOpts }, { k: 'to_area', label: 'A', type: 'select', options: areaOpts }], (x) => { if (x.from_area === x.to_area) throw new Error('Elige áreas distintas'); return db('area_transfer_blocks').insert([x]); }, 'Se bloquea solo en esa dirección. Agrega también la inversa si aplica.');
  $$('[data-db]').forEach((b) => b.onclick = async () => { const [fa, ta] = b.dataset.db.split('|'); try { await db('area_transfer_blocks').eq('from_area', fa).eq('to_area', ta).remove(); viewCatalogos(); } catch (e) { toast(e.message, true); } });
}
// Agregar varias personas a un grupo (misma área). Por defecto muestra a quienes no tienen grupo.
async function addToGroupForm(g) {
  const emps = (await db('employees').select('id,num_empleado,nombre,apellido_paterno,apellido_materno,puesto,group_id,status').eq('area_id', g.area_id).in('status', ['activo', 'alta_pendiente']).get()).sort(sortName);
  const sel = new Set(); let q = '', todos = false;
  const list = () => emps.filter((e) => e.group_id !== g.id && (todos || !e.group_id) && (!q || norm(fullName(e) + ' ' + (e.num_empleado || '')).includes(q)));
  const draw = (el) => {
    const rows = list();
    $('#ag_list', el).innerHTML = rows.length ? rows.map((e) => `<label class="pick${sel.has(e.id) ? ' on' : ''}"><input type="checkbox" data-pk="${e.id}"${sel.has(e.id) ? ' checked' : ''}>
      <span class="grow"><b>${esc(fullName(e))}</b><span class="small muted">${e.num_empleado ? esc(e.num_empleado) + ' · ' : ''}${e.group_id ? 'ahora en ' + esc(groupName(e.group_id)) : 'sin grupo'}${e.status === 'alta_pendiente' ? ' · alta pendiente' : ''}</span></span></label>`).join('')
      : `<div class="empty">${todos ? 'No hay más personas activas en esta área.' : 'No hay personas sin grupo en esta área.'}</div>`;
    $('#ag_n', el).textContent = sel.size ? `${sel.size} seleccionada(s)` : 'Ninguna seleccionada';
    $('#ag_all', el).textContent = rows.length && rows.every((e) => sel.has(e.id)) ? 'Quitar selección' : `Seleccionar ${rows.length}`;
    $$('[data-pk]', el).forEach((c) => c.onchange = () => { c.checked ? sel.add(c.dataset.pk) : sel.delete(c.dataset.pk); draw(el); });
  };
  const m = modal({ title: `Agregar personal a ${groupLabel(g)} · ${areaName(g.area_id)}`, wide: true, body: `
    <div class="row" style="gap:8px;flex-wrap:wrap"><input class="inp grow" id="ag_q" placeholder="Buscar por nombre o número" aria-label="Buscar">
      <label class="row small" style="gap:6px"><input type="checkbox" id="ag_todos"> Mostrar también personas de otros grupos</label></div>
    <div class="row small"><span class="grow muted" id="ag_n"></span><button type="button" class="btn sm ghost" id="ag_all"></button></div>
    <div class="pick-list" id="ag_list"></div>`,
    actions: [{ label: 'Cancelar' }, { label: 'Agregar al grupo', cls: 'primary', run: async () => {
      if (!sel.size) throw new Error('Selecciona al menos una persona.');
      const ids = [...sel];
      const moved = emps.filter((e) => sel.has(e.id) && e.group_id).length;
      if (moved && !(await confirmBox('Cambiar de grupo', `${moved} de las personas seleccionadas ya están en otro grupo y se moverán a <b>${esc(groupLabel(g))}</b>.`, { okLabel: 'Mover' }))) return false;
      const done = await db('employees').in('id', ids).update({ group_id: g.id });
      toast(`${done.length} persona(s) agregada(s) a ${groupLabel(g)}`); viewCatalogos();
    } }] });
  $('#ag_q', m.el).oninput = (e) => { q = norm(e.target.value); draw(m.el); };
  $('#ag_todos', m.el).onchange = (e) => { todos = e.target.checked; draw(m.el); };
  $('#ag_all', m.el).onclick = () => { const rows = list(); const all = rows.length && rows.every((e) => sel.has(e.id)); rows.forEach((e) => all ? sel.delete(e.id) : sel.add(e.id)); draw(m.el); };
  draw(m.el);
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
const FIELD_LABEL = { status: 'Estatus', area_id: 'Área', group_id: 'Grupo', nombre: 'Nombre', apellido_paterno: 'Apellido paterno', apellido_materno: 'Apellido materno', puesto: 'Puesto', fecha_ingreso: 'Ingreso', fecha_baja: 'Baja', num_empleado: 'No. empleado', incidencias: 'Incidencias', comentario: 'Comentario', aviso: 'Aviso', incidencia: 'Incidencia', role: 'Rol', active: 'Activo', full_name: 'Nombre', tl_id: 'TL', name: 'Nombre', reviewed_at: 'Revisión', sent_at: 'Envío', turno: 'Turno', hora_cierre: 'Hora de cierre', tipo: 'Tipo' };
function fmtVal(k, v) {
  if (v == null || v === '') return '—';
  if (k === 'status') return (STATUS[v] && STATUS[v][0]) || ATT[v] || v;
  if (k === 'area_id') return areaName(v);
  if (k === 'group_id') return groupName(v);
  if (k === 'tl_id') return profName(v);
  if (k === 'role') return ROLES[v] || v;
  if (k === 'incidencias') return v.length ? v.join(', ') : 'ninguna';
  if (k === 'aviso') return AVISO[v] || v;
  if (k === 'incidencia') return INC[v] || v;
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
      if (act === 'insert') return `Pase de lista${a.turno === 'tarde' ? ' (tarde)' : ''} · ${who(emp)} · ${fmtDate(a.fecha)} → <b>${esc(attLabel(a))}</b>${a.incidencias && a.incidencias.length ? ' · ' + esc(a.incidencias.join(', ')) : ''}`;
      if (act === 'update') { const [id, f] = (l.record_id || '').split('|'); return `${'status' in a ? '<span class="badge b-warn">Corrección</span> ' : 'Actualizó '}asistencia · ${who(emp || id)} · ${fmtDate(f)} · ${changes()}`; }
      return `Borró asistencia de ${who(emp)} del ${fmtDate(b.fecha)}`;
    }
    case 'attendance_days': {
      const [g, f] = (l.record_id || '').split('|');
      if (a.sent_pm_at && !('reviewed_at' in a)) return `Envió cierre (tarde) · ${esc(groupName(g))} · ${fmtDate(f)}`;
      if (a.sent_at && (act === 'insert' || !('reviewed_at' in a))) return `Envió entrada (mañana) · ${esc(groupName(g))} · ${fmtDate(f)}`;
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
const canCorrect = () => is('developer', 'supervisor');
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
function wireOps(card, st, redraw) {
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
      const [saved] = await db('activity_daily').insert([{ employee_id: id, fecha: OP.fecha, valores }], { onConflict: 'employee_id,fecha' });
      st.act[id] = saved; toast('Actividad guardada'); redraw();
    } catch (e) { toast(e.message, true); }
  });
  $$('[data-cres]', card).forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try {
      const [u] = await mustUpdate(db('corrections').eq('id', b.dataset.cres).update({ resultado: b.dataset.val }), 'la corrección');
      st.corr[id] = st.corr[id].map((c) => c.id === u.id ? u : c); redraw();
    } catch (e) { toast(e.message, true); b.disabled = false; }
  });
  const nc = $('[data-newcorr]', card);
  if (nc) nc.onclick = () => {
    const now = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
    const f = [
      { k: 'hora', label: 'Hora', type: 'time', req: true, val: OP.fecha === todayMX() ? now : '' },
      { k: 'avance', label: 'Avance a esa hora', req: true, hint: 'Ej. 180 mensajes y 90 llamadas' },
      { k: 'instruccion', label: 'Instrucción que diste', type: 'textarea', req: true, full: true, hint: 'Ej. regularizar la actividad durante el resto de la jornada' }
    ];
    modal({ title: 'Corrección operativa · ' + fullName(emp), body: `<div class="notice n-info">Es una corrección del día, no una sanción. Queda como antecedente si la persona reincide.</div>${fieldsHtml(f)}`,
      actions: [{ label: 'Cancelar' }, { label: 'Guardar', cls: 'primary', run: async ({ el }) => {
        const v = readFields(el, f);
        const [c] = await db('corrections').insert([{ employee_id: id, fecha: OP.fecha, ...v }]);
        (st.corr[id] = st.corr[id] || []).push(c); toast('Corrección registrada'); redraw();
      } }] });
  };
}

// Vista de Supervisión: actividad del día y correcciones operativas (no va en el pase de lista del líder)
const OP = { group: null, fecha: null };
async function viewOperacion() {
  const v = $('#view');
  const groups = writableGroups().filter((g) => g.tipo !== 'lideres').sort((a, b) => (areaName(a.area_id) + a.name).localeCompare(areaName(b.area_id) + b.name, 'es'));
  if (!groups.length) { v.innerHTML = '<div class="card empty">No hay grupos en tus áreas.</div>'; return; }
  if (!OP.group || !groups.some((g) => g.id === OP.group)) OP.group = groups[0].id;
  if (!OP.fecha) OP.fecha = todayMX();
  const g = groups.find((x) => x.id === OP.group);
  const emps = (await db('employees').select('id,nombre,apellido_paterno,apellido_materno,puesto,group_id,area_id,status').eq('group_id', g.id).eq('status', 'activo').get()).sort(sortName);
  const ids = emps.map((e) => e.id); const metrics = metricsOf(g.area_id);
  const [acts, corrs] = ids.length ? await Promise.all([
    metrics.length ? db('activity_daily').in('employee_id', ids).eq('fecha', OP.fecha).get() : Promise.resolve([]),
    db('corrections').in('employee_id', ids).eq('fecha', OP.fecha).order('hora').get()
  ]) : [[], []];
  const act = Object.fromEntries(acts.map((a) => [a.employee_id, a]));
  const corr = {}; corrs.forEach((c) => { (corr[c.employee_id] = corr[c.employee_id] || []).push(c); });
  renderOperacion({ emps, metrics, act, corr, g }, groups);
}
function renderOperacion(st, groups) {
  const v = $('#view'); const { emps, metrics, g } = st;
  const multiArea = new Set(groups.map((x) => x.area_id)).size > 1;
  v.innerHTML = `
  <div class="pagehead"><div><h1>Actividad del día</h1><div class="muted small">Supervisión · ${esc(areaName(g.area_id))}${metrics.length ? ' · metas: ' + metrics.map((m) => `${esc(m.label)} ${Number(m.daily_goal)}`).join(', ') : ''}</div></div>
    <div class="row"><input type="date" class="inp mono" id="op_date" value="${OP.fecha}" max="${todayMX()}" aria-label="Fecha">
    ${groups.length > 1 ? `<select class="inp" id="op_group" aria-label="Grupo">${groups.map((x) => `<option value="${x.id}"${x.id === g.id ? ' selected' : ''}>${multiArea ? esc(areaName(x.area_id)) + ' · ' : ''}${esc(x.name)}</option>`).join('')}</select>` : `<b>${esc(g.name)}</b>`}</div></div>
  <div class="list" id="ops">${emps.length ? emps.map((e) => `<div class="card pad" data-id="${e.id}" style="display:flex;flex-direction:column;gap:10px"><div style="font-weight:700">${esc(fullName(e))}<span class="small muted" style="font-weight:400"> · ${esc(e.puesto || '')}</span></div>${opsHtml(e, st)}</div>`).join('') : '<div class="card empty">No hay personal activo en este grupo.</div>'}</div>`;
  $('#op_date').onchange = (e) => { const val = e.target.value; if (!val || val > todayMX()) { e.target.value = OP.fecha; return; } OP.fecha = val; viewOperacion().catch((x) => toast(x.message, true)); };
  if ($('#op_group')) $('#op_group').onchange = (e) => { OP.group = e.target.value; viewOperacion().catch((x) => toast(x.message, true)); };
  $$('#ops [data-id]').forEach((card) => wireOps(card, st, () => renderOperacion(st, groups)));
}

// ───────────────────────── Buzón: sugerencias y reporte de errores ─────────────────────────
const FB_TIPO = { error: 'Reportar un error', sugerencia: 'Sugerencia' };
const FB_ESTADO = { nuevo: ['Nuevo', 'b-warn'], en_revision: ['En revisión', 'b-acc'], resuelto: ['Resuelto', 'b-ok'], descartado: ['Descartado', 'b-mut'] };
const fbBadge = (e) => `<span class="badge ${FB_ESTADO[e][1]}">${FB_ESTADO[e][0]}</span>`;
const imgOk = (f) => /^image\//.test(f.type || '');
function techDetail() {
  return { vista: (location.hash || '').replace(/^#\//, '') || 'inicio', version: APP_VERSION, dispositivo: navigator.userAgent, pantalla_px: `${innerWidth}x${innerHeight}`,
    en_linea: navigator.onLine, pase_de_lista: LS.group ? { grupo: groupName(LS.group), fecha: LS.fecha, turno: LS.turno } : null, errores: ERRLOG.slice() };
}
function openFeedback(tipo = 'error') {
  const fb = fileBox('fb_img', { title: 'Capturas de pantalla', label: 'Adjuntar captura', hint: 'Solo imágenes · hasta 5 MB · máximo 3', accept: 'image/*', ok: imgOk, max: 3, maxSize: 5 * 1048576 });
  let t = tipo;
  const body = () => `
    <div class="seg fb-seg" role="group" aria-label="Tipo">${Object.entries(FB_TIPO).map(([k, l]) => `<button type="button" data-fbt="${k}" class="${t === k ? 'on' : ''}" aria-pressed="${t === k}">${l}</button>`).join('')}</div>
    <label class="field">${t === 'error' ? '¿Qué estabas haciendo y qué pasó?' : '¿Qué te gustaría mejorar o agregar?'} *
      <textarea id="f_fbm" rows="5" maxlength="4000" placeholder="${t === 'error' ? 'Ej. Al enviar el cierre de la tarde me salió un error y no se guardó.' : 'Ej. Que el pase de lista muestre primero a quienes faltan.'}"></textarea></label>
    ${fb.html}
    <label class="row small" style="gap:8px;align-items:flex-start"><input type="checkbox" id="f_fbtech" checked style="margin-top:3px"><span>Incluir datos técnicos: pantalla, versión (${APP_VERSION}), dispositivo y los últimos mensajes de error${ERRLOG.length ? ` (${ERRLOG.length})` : ''}. Ayuda a encontrar el problema.</span></label>
    <button type="button" class="btn sm ghost" id="fb_mine" style="align-self:flex-start">Ver mis reportes</button>`;
  const m = modal({ title: 'Sugerencias y errores', body: body(),
    actions: [{ label: 'Cancelar' }, { label: 'Enviar', cls: 'primary', run: async ({ el, btn }) => {
      const msg = ($('#f_fbm', el).value || '').trim();
      if (msg.length < 5) throw new Error('Escribe al menos una frase.');
      const paths = []; const failed = [];
      for (let i = 0; i < fb.files.length; i++) {
        const f = fb.files[i]; btn.textContent = `Subiendo captura ${i + 1} de ${fb.files.length}…`;
        const ext = (f.name.match(/\.([a-z0-9]{1,5})$/i) || [, 'png'])[1].toLowerCase();
        const key = `${S.me.id}/${newId()}.${ext}`;
        try { await storageUpload('buzon', key, f); paths.push(key); } catch (e) { failed.push(f.name); }
      }
      const tech = $('#f_fbtech', el).checked;
      const [row] = await db('feedback').insert([{ user_id: S.me.id, tipo: t, mensaje: msg, pantalla: tech ? techDetail().vista : null, app_version: APP_VERSION, detalle: tech ? techDetail() : null, adjuntos: paths }]);
      toast(`Gracias. Quedó registrado con folio #${row.folio}${failed.length ? ` (no se subieron: ${failed.join(', ')})` : ''}`, !!failed.length);
    } }] });
  const wire = () => {
    fb.wire(m.el);
    $$('[data-fbt]', m.el).forEach((b) => b.onclick = () => { const txt = $('#f_fbm', m.el).value; t = b.dataset.fbt; const keep = fb.files.splice(0); m.mb.innerHTML = body(); fb.files.push(...keep); wire(); $('#f_fbm', m.el).value = txt; $('#fb_img .flist', m.el) && keep.length && $('#fb_img input', m.el).dispatchEvent(new Event('change')); });
    $('#fb_mine', m.el).onclick = () => myFeedback();
  };
  wire();
}
async function myFeedback() {
  const rows = await db('feedback').eq('user_id', S.me.id).order('created_at', false).limit(50).get();
  modal({ title: 'Mis reportes', body: rows.length ? `<div class="list">${rows.map((f) => `<div class="card" style="padding:10px 12px;display:flex;flex-direction:column;gap:6px">
      <div class="row small"><b class="mono">#${f.folio}</b><span class="badge ${f.tipo === 'error' ? 'b-bad' : 'b-acc'}">${f.tipo === 'error' ? 'Error' : 'Sugerencia'}</span><span class="grow muted">${fmtDateTime(f.created_at)}</span>${fbBadge(f.estado)}</div>
      <div>${esc(f.mensaje)}</div>
      ${f.respuesta ? `<div class="inc-note"><div class="small muted">Respuesta${f.atendido_at ? ' · ' + fmtDateTime(f.atendido_at) : ''}</div><div>${esc(f.respuesta)}</div></div>` : ''}
    </div>`).join('')}</div>` : '<div class="empty">Aún no has enviado reportes.</div>', actions: [{ label: 'Cerrar', cls: 'primary' }] });
}
// Vista de Daniel
const BZ = { estado: 'nuevo', tipo: '' };
function updateBuzonBadge(n) {
  $$('[data-v="buzon"]').forEach((a) => {
    let b = a.querySelector('.cnt'); if (!b) { b = document.createElement('span'); b.className = 'cnt badge b-bad'; b.style.marginLeft = 'auto'; a.appendChild(b); }
    b.textContent = n; b.style.display = n ? '' : 'none';
  });
  refreshMoreBadge();
}
async function refreshBuzonBadge() {
  if (!is('developer')) return;
  try { updateBuzonBadge((await db('feedback').select('id').eq('estado', 'nuevo').get()).length); } catch { /* sin conexión */ }
}
async function viewBuzon() {
  const v = $('#view');
  let q = db('feedback').order('created_at', false).limit(300);
  if (BZ.estado) q = q.eq('estado', BZ.estado);
  if (BZ.tipo) q = q.eq('tipo', BZ.tipo);
  const [rows, all] = await Promise.all([q.get(), db('feedback').select('id,estado').get()]);
  const cnt = {}; all.forEach((f) => { cnt[f.estado] = (cnt[f.estado] || 0) + 1; });
  updateBuzonBadge(cnt.nuevo || 0);
  v.innerHTML = `<div class="pagehead"><div><h1>Buzón</h1><div class="muted small">Sugerencias y errores reportados por los usuarios</div></div>
    <div class="row"><select class="inp" id="bz_t" aria-label="Tipo"><option value="">Todos los tipos</option><option value="error"${BZ.tipo === 'error' ? ' selected' : ''}>Errores</option><option value="sugerencia"${BZ.tipo === 'sugerencia' ? ' selected' : ''}>Sugerencias</option></select></div></div>
  <div class="seg" role="group" aria-label="Estado" style="margin-bottom:12px">${[['nuevo', 'Nuevos'], ['en_revision', 'En revisión'], ['resuelto', 'Resueltos'], ['descartado', 'Descartados'], ['', 'Todos']].map(([k, l]) => `<button type="button" data-bz="${k}" class="${BZ.estado === k ? 'on' : ''}">${l}${k && cnt[k] ? ` (${cnt[k]})` : ''}</button>`).join('')}</div>
  <div class="list" id="bzlist">${rows.length ? rows.map((f) => `<button type="button" class="item" data-fb="${f.id}">
      <span class="grow"><span class="row small" style="gap:6px"><b class="mono">#${f.folio}</b><span class="badge ${f.tipo === 'error' ? 'b-bad' : 'b-acc'}">${f.tipo === 'error' ? 'Error' : 'Sugerencia'}</span>${f.adjuntos.length ? `<span class="small muted">📎 ${f.adjuntos.length}</span>` : ''}</span>
      <span style="display:block;margin-top:2px">${esc(f.mensaje.length > 140 ? f.mensaje.slice(0, 140) + '…' : f.mensaje)}</span>
      <span class="small muted">${esc(f.user_name || '—')} · ${esc(ROLES[f.user_role] || '')} · ${fmtDateTime(f.created_at)}${f.pantalla ? ' · ' + esc(f.pantalla) : ''}</span></span>${fbBadge(f.estado)}</button>`).join('') : '<div class="card empty">Sin reportes en este filtro.</div>'}</div>`;
  $$('[data-bz]').forEach((b) => b.onclick = () => { BZ.estado = b.dataset.bz; viewBuzon(); });
  $('#bz_t').onchange = (e) => { BZ.tipo = e.target.value; viewBuzon(); };
  $$('[data-fb]').forEach((b) => b.onclick = () => openFeedbackAdmin(rows.find((x) => x.id === b.dataset.fb)));
}
function openFeedbackAdmin(f) {
  const d = f.detalle || {};
  const f2 = [{ k: 'estado', label: 'Estado', type: 'select', val: f.estado === 'nuevo' ? 'en_revision' : f.estado, options: Object.entries(FB_ESTADO).map(([k, x]) => [k, x[0]]) },
    { k: 'respuesta', label: 'Respuesta para la persona', type: 'textarea', full: true, val: f.respuesta || '', hint: 'La verá en “Mis reportes”.' }];
  const m = modal({ title: `#${f.folio} · ${f.tipo === 'error' ? 'Error' : 'Sugerencia'}`, wide: true, body: `
    <div class="row">${fbBadge(f.estado)}<span class="small muted">${esc(f.user_name || '—')} · ${esc(ROLES[f.user_role] || '')} · ${fmtDateTime(f.created_at)}</span></div>
    <div class="card pad" style="white-space:pre-wrap">${esc(f.mensaje)}</div>
    ${f.adjuntos.length ? `<div class="evid-list" style="padding:0">${f.adjuntos.map((p) => `<a class="evid-item" data-bzp="${esc(p)}" target="_blank" rel="noopener" aria-disabled="true"><img alt="" class="thumb"><span class="grow"><b>Captura</b></span><span class="go" aria-hidden="true">↗</span></a>`).join('')}</div>` : ''}
    ${f.detalle ? `<details class="card pad"><summary><b>Datos técnicos</b> · ${esc(d.vista || '')} · v${esc(f.app_version || '')}</summary>
      <div class="kv" style="margin-top:8px"><span>Pantalla</span><span>${esc(d.vista || '—')}</span><span>Versión</span><span>${esc(d.version || f.app_version || '—')}</span><span>Tamaño</span><span>${esc(d.pantalla_px || '—')}</span><span>En línea</span><span>${d.en_linea === false ? 'No' : 'Sí'}</span>
      ${d.pase_de_lista ? `<span>Pase de lista</span><span>${esc(d.pase_de_lista.grupo || '')} · ${esc(d.pase_de_lista.fecha || '')} · ${esc(d.pase_de_lista.turno || '')}</span>` : ''}<span>Dispositivo</span><span class="small">${esc(d.dispositivo || '—')}</span></div>
      ${(d.errores || []).length ? `<div class="eyebrow" style="margin:10px 0 4px">Últimos errores que vio</div>${d.errores.map((x) => `<div class="small"><span class="mono muted">${esc(fmtTime(x.at))}</span> · ${esc(x.vista || '')} · ${esc(x.msg)}</div>`).join('')}` : '<div class="small muted" style="margin-top:8px">Sin mensajes de error registrados.</div>'}
    </details>` : '<div class="small muted">La persona no incluyó datos técnicos.</div>'}
    ${fieldsHtml(f2)}`,
    actions: [{ label: 'Cerrar' }, { label: 'Guardar', cls: 'primary', run: async ({ el }) => {
      const v = readFields(el, f2);
      await mustUpdate(db('feedback').eq('id', f.id).update({ estado: v.estado, respuesta: v.respuesta }), 'el reporte');
      toast('Guardado'); viewBuzon();
    } }] });
  $$('[data-bzp]', m.el).forEach(async (a) => {
    try { const url = await storageUrl('buzon', a.dataset.bzp); a.href = url; a.removeAttribute('aria-disabled'); $('img', a).src = url; } catch (e) { a.classList.add('err'); }
  });
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

// ───────────────────────── Evidencias en archivo (Supabase Storage, bucket privado) ─────────────────────────
const EVID_BUCKET = 'evidencias';
const EVID_MAX = 10 * 1024 * 1024, EVID_MAX_FILES = 10;
const EVID_ACCEPT = 'image/*,application/pdf,audio/*,video/mp4,video/quicktime,text/plain,.docx,.xlsx';
const fmtSize = (n) => n == null ? '' : n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
const mimeOf = (f) => f.type || (/\.docx$/i.test(f.name) ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : /\.xlsx$/i.test(f.name) ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : /\.txt$/i.test(f.name) ? 'text/plain' : '');
const evidOk = (f) => /^(image\/|audio\/)|^application\/pdf$|^video\/(mp4|quicktime)$|^text\/plain$|officedocument\.(wordprocessingml|spreadsheetml)/.test(mimeOf(f));
const fileIcon = (t) => /^image\//.test(t || '') ? 'IMG' : /pdf/.test(t || '') ? 'PDF' : /^audio\//.test(t || '') ? 'AUD' : /^video\//.test(t || '') ? 'VID' : 'DOC';
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => { const r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); }));
const canAddEvidence = (c) => c.status !== 'cerrado' && !is('director', 'nomina');
function fileBox(id, o = {}) {
  const opt = { title: 'Archivos de evidencia', label: 'Adjuntar archivos', hint: 'Fotos, capturas, PDF, audios o documentos · hasta 10 MB cada uno · máximo 10', accept: EVID_ACCEPT, ok: evidOk, max: EVID_MAX_FILES, maxSize: EVID_MAX, ...o };
  const files = [];
  const html = `<div class="filebox" id="${id}">
    <div class="fb-title">${esc(opt.title)} <span class="small muted">(opcional)</span></div>
    <label class="drop"><input type="file" multiple accept="${opt.accept}" class="sr-only">
      <span class="drop-ic" aria-hidden="true">⇪</span><b>${esc(opt.label)}</b>
      <span class="small muted">${esc(opt.hint)}</span></label>
    <div class="flist"></div></div>`;
  const wire = (root) => {
    const box = $('#' + id, root); const inp = $('input[type=file]', box); const list = $('.flist', box);
    const draw = () => { list.innerHTML = files.map((f, i) => `<div class="fitem"><span class="fic">${fileIcon(mimeOf(f))}</span><span class="grow"><b>${esc(f.name)}</b><span class="small muted">${fmtSize(f.size)}</span></span><button type="button" class="x" data-rm="${i}" aria-label="Quitar ${esc(f.name)}">×</button></div>`).join(''); };
    const add = (picked) => {
      for (const f of picked) {
        if (files.length >= opt.max) { toast(`Máximo ${opt.max} archivos`, true); break; }
        if (!opt.ok(f)) { toast(`${f.name}: tipo de archivo no permitido`, true); continue; }
        if (f.size > opt.maxSize) { toast(`${f.name} pasa de ${Math.round(opt.maxSize / 1048576)} MB`, true); continue; }
        if (!files.some((x) => x.name === f.name && x.size === f.size)) files.push(f);
      }
      draw();
    };
    inp.onchange = () => { add([...inp.files]); inp.value = ''; };
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('over'); });
    box.addEventListener('dragleave', () => box.classList.remove('over'));
    box.addEventListener('drop', (e) => { e.preventDefault(); box.classList.remove('over'); add([...e.dataTransfer.files]); });
    list.onclick = (e) => { const b = e.target.closest('[data-rm]'); if (b) { files.splice(Number(b.dataset.rm), 1); draw(); } };
  };
  return { html, wire, files };
}
async function storageUpload(bucket, key, f) {
  await ensureFresh();
  let r;
  try { r = await fetch(`${CFG.url}/storage/v1/object/${bucket}/${key}`, { method: 'POST', headers: { apikey: CFG.key, Authorization: 'Bearer ' + S.session.access_token, 'Content-Type': mimeOf(f) || 'application/octet-stream', 'x-upsert': 'false' }, body: f }); }
  catch (e) { throw new Error(friendly(String(e.message || e))); }
  if (!r.ok) {
    const d = await r.json().catch(() => ({}));
    throw new Error(r.status === 413 || /maximum allowed size/i.test(d.message || '') ? 'archivo demasiado grande' : r.status === 415 || /mime/i.test(d.message || '') ? 'tipo de archivo no permitido' : friendly(d.message || 'Error ' + r.status));
  }
}
async function storageUrl(bucket, path) {
  const d = await http(`/storage/v1/object/sign/${bucket}/${path}`, { method: 'POST', body: { expiresIn: 900 } });
  const u = d.signedURL || d.signedUrl;
  return /^(https?:|blob:|data:)/.test(u) ? u : CFG.url + '/storage/v1' + u;
}
async function uploadEvidence(caseId, files, onProgress) {
  const failed = [];
  for (let i = 0; i < files.length; i++) {
    const f = files[i]; onProgress && onProgress(i + 1, files.length);
    const ext = (f.name.match(/\.([a-z0-9]{1,6})$/i) || [])[1];
    const key = `${caseId}/${newId()}${ext ? '.' + ext.toLowerCase() : ''}`;
    try {
      await ensureFresh();
      let r;
      try { r = await fetch(`${CFG.url}/storage/v1/object/${EVID_BUCKET}/${key}`, { method: 'POST', headers: { apikey: CFG.key, Authorization: 'Bearer ' + S.session.access_token, 'Content-Type': mimeOf(f), 'x-upsert': 'false' }, body: f }); }
      catch (e) { throw new Error(friendly(String(e.message || e))); }
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        const msg = r.status === 413 || /maximum allowed size/i.test(d.message || '') ? 'pasa de 10 MB' : r.status === 415 || /mime/i.test(d.message || '') ? 'tipo de archivo no permitido' : friendly(d.message || 'Error ' + r.status);
        throw new Error(msg);
      }
      await db('case_files').insert([{ case_id: caseId, path: key, nombre: f.name.slice(0, 200), tipo: mimeOf(f), tamano: f.size }]);
    } catch (e) { failed.push(`${f.name} (${e.message})`); }
  }
  return failed;
}
async function evidenceUrl(path) {
  const d = await http(`/storage/v1/object/sign/${EVID_BUCKET}/${path}`, { method: 'POST', body: { expiresIn: 900 } });
  const u = d.signedURL || d.signedUrl;
  return /^(https?:|blob:|data:)/.test(u) ? u : CFG.url + '/storage/v1' + u;
}
function evidenceAddForm(c, onDone) {
  const fb = fileBox('evid_add');
  const m = modal({ title: `Adjuntar evidencia · caso #${c.folio}`, body: `<div class="notice n-info">Los archivos quedan en el expediente del caso. No se pueden borrar después; solo Daniel puede quitarlos.</div>${fb.html}`,
    actions: [{ label: 'Cancelar' }, { label: 'Subir archivos', cls: 'primary', run: async ({ btn }) => {
      if (!fb.files.length) throw new Error('Elige al menos un archivo.');
      const failed = await uploadEvidence(c.id, fb.files, (i, n) => { btn.textContent = `Subiendo ${i} de ${n}…`; });
      if (failed.length === fb.files.length) { btn.textContent = 'Subir archivos'; throw new Error('No se subió ningún archivo: ' + failed.join('; ')); }
      onDone && onDone();
      if (failed.length) toast('No se subieron: ' + failed.join('; '), true); else toast('Evidencia adjuntada');
    } }] });
  fb.wire(m.el);
}

function requestForm({ employee, tipo, fecha, existing, onDone }) {
  const c = existing || {};
  const t = tipo || c.solicitud_lider || c.riesgo_tipo;
  const riesgo = !!RIESGO[t];
  const label = RIESGO[t] || SOLICITUD_LIDER[t];
  const f = [
    { k: 'razon', label: 'Razón', type: 'textarea', req: true, full: true, val: c.hechos, hint: 'Qué pasó, solo hechos.' },
    { k: 'evidencia', label: 'Evidencias', type: 'textarea', full: true, val: c.evidencia, hint: 'Describe la evidencia (capturas, chats, reportes, testigos) y/o adjunta los archivos abajo.' },
    { k: 'fecha', label: 'Fecha (o desde)', type: 'date', req: true, val: c.fecha_hechos || fecha || todayMX(), max: todayMX() },
    { k: 'fecha_fin', label: 'Hasta (si fueron varios días)', type: 'date', val: c.fecha_fin || '', max: todayMX() },
    { k: 'hora_inicio', label: 'Hora desde (opcional)', type: 'time', val: c.hora_inicio ? String(c.hora_inicio).slice(0, 5) : '' },
    { k: 'hora_fin', label: 'Hora hasta (opcional)', type: 'time', val: c.hora_fin ? String(c.hora_fin).slice(0, 5) : '' }
  ];
  const isEdit = !!existing;
  const fb = fileBox('evid_req');
  const m = modal({
    title: `${label} · ${fullName(employee)}`, wide: true,
    body: `<div class="notice ${riesgo ? 'n-bad' : 'n-info'}">${riesgo ? 'Incidencia de riesgo: va directo a RH y Supervisión no la ve.' : isEdit ? 'Supervisión la regresó con un comentario: complétala y reenvíala.' : 'La solicitud va a Supervisión para validarla y después a RH. Tú reportas hechos; la decisión la toma RH.'}</div>
      ${fieldsHtml(f.slice(0, 2))}${fb.html}${fieldsHtml(f.slice(2))}${isEdit ? fieldsHtml([{ k: 'comentario', label: 'Qué corregiste', full: true }]) : ''}`,
    actions: [{ label: 'Cancelar' }, { label: isEdit ? 'Reenviar a Supervisión' : riesgo ? 'Enviar a RH' : 'Enviar solicitud', cls: riesgo ? 'danger solid' : 'primary', run: async ({ el, btn }) => {
      const v = readFields(el, f);
      if (!v.evidencia && !fb.files.length) throw new Error('Falta: Evidencias. Descríbelas o adjunta al menos un archivo.');
      if (!v.evidencia) v.evidencia = 'Archivos adjuntos: ' + fb.files.map((x) => x.name).join(', ');
      if (v.fecha > todayMX() || (v.fecha_fin && v.fecha_fin > todayMX())) throw new Error('Las fechas no pueden ser futuras.');
      if (v.fecha_fin && v.fecha_fin < v.fecha) throw new Error('La fecha final es anterior a la inicial.');
      const args = { p_razon: v.razon, p_evidencia: v.evidencia, p_fecha: v.fecha, p_fecha_fin: v.fecha_fin, p_hora_inicio: v.hora_inicio, p_hora_fin: v.hora_fin };
      let id = c.id;
      if (isEdit) await rpc('case_request_resubmit', { p_id: c.id, ...args, p_comentario: readFields(el, [{ k: 'comentario' }]).comentario });
      else { const r = await rpc('case_request', { p_employee: employee.id, p_tipo: t, ...args }); id = Array.isArray(r) ? r[0] : r; }
      // El caso ya quedó registrado: un archivo que falle no debe repetir el envío
      const failed = fb.files.length ? await uploadEvidence(id, fb.files, (i, n) => { btn.textContent = `Subiendo archivo ${i} de ${n}…`; }) : [];
      onDone && onDone();
      if (failed.length) toast(`Se envió, pero no se subieron: ${failed.join('; ')}. Agrégalos desde Casos.`, true);
    } }]
  });
  fb.wire(m.el);
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
  if (S.view === 'expediente' && EXP.id) return viewExpediente(EXP.id);
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
  refreshMoreBadge();
}
async function refreshCaseBadge() {
  if (!VIEWS.casos.roles.includes(role())) return;
  try { const cases = await db('cases').select('id,status,created_by').neq('status', 'cerrado').get(); updateCaseBadge(cases.filter(pendingForMe).length); } catch { /* sin conexión */ }
}

async function openCase(id) {
  const [c] = await db('cases').eq('id', id).get();
  if (!c) return toast('Caso no encontrado o sin permiso', true);
  const since = addDays(c.fecha_hechos, -29);
  const [events, [emp], att, corr, prev, files, cdocs] = await Promise.all([
    db('case_events').eq('case_id', id).order('at').get(),
    db('employees').select('id,nombre,apellido_paterno,apellido_materno,num_empleado,area_id,group_id,status,puesto,fecha_ingreso').eq('id', c.employee_id).get(),
    db('attendance').select('fecha,status,turno').eq('employee_id', c.employee_id).eq('turno', 'manana').gte('fecha', since).lte('fecha', c.fecha_hechos).get(),
    is('nomina') ? Promise.resolve([]) : db('corrections').select('fecha,resultado').eq('employee_id', c.employee_id).gte('fecha', since).lte('fecha', c.fecha_hechos).get().catch(() => []),
    db('cases').select('id,folio,status,fecha_hechos,decision,kind').eq('employee_id', c.employee_id).neq('id', id).get(),
    db('case_files').eq('case_id', id).order('created_at').get().catch(() => []),
    db('documents').select('id,folio,tipo,fecha,estado').eq('case_id', id).order('created_at').get().catch(() => [])
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
    <section class="fbox evid">
      <header>Evidencias adjuntas (${files.length})${canAddEvidence(c) ? '<button type="button" class="btn sm" id="evid_add">+ Adjuntar</button>' : ''}</header>
      ${files.length ? `<div class="evid-list">${files.map((x) => `<a class="evid-item" data-path="${esc(x.path)}" target="_blank" rel="noopener" aria-disabled="true">
        ${/^image\//.test(x.tipo || '') ? '<img alt="" class="thumb">' : `<span class="fic">${fileIcon(x.tipo)}</span>`}
        <span class="grow"><b>${esc(x.nombre)}</b><span class="small muted">${fmtSize(x.tamano)}${x.tamano ? ' · ' : ''}${esc(profName(x.uploaded_by))} · ${fmtDateTime(x.created_at)}</span></span><span class="go" aria-hidden="true">↗</span></a>`).join('')}</div>`
      : '<div class="fbody small muted">Sin archivos. Las evidencias descritas están en Hechos.</div>'}
    </section>
    <div class="card pad"><div class="eyebrow" style="margin-bottom:8px">Antecedentes · 30 días antes de los hechos</div>
      <div class="row small"><span class="badge ${faltas > 3 ? 'b-bad' : faltas ? 'b-warn' : 'b-mut'}">${faltas} faltas</span><span class="badge ${retardos ? 'b-warn' : 'b-mut'}">${retardos} retardos</span>${is('nomina') ? '' : `<span class="badge ${noCorr ? 'b-bad' : 'b-mut'}">${corr.length} correcciones · ${noCorr} sin corregir</span>`}<span class="badge ${prev.length ? 'b-warn' : 'b-mut'}">${prev.length} casos anteriores</span></div>
      ${prev.length ? `<div class="small muted" style="margin-top:6px">${prev.map((p) => `#${p.folio} ${fmtDate(p.fecha_hechos)} · ${CASE_ST[p.status][0]}${p.decision ? ' · ' + MEDIDAS[p.decision] : ''}`).join('<br>')}</div>` : ''}</div>
    ${c.validacion ? `<div class="card pad"><div class="eyebrow" style="margin-bottom:8px">Validación de Supervisión · solicita: ${esc(SOLICITUDES[c.solicitud_tipo] || '')}</div>${kv(PREGUNTAS.map((p, i) => [p, val['q' + (i + 1)]]))}</div>` : ''}
    ${c.analisis ? `<div class="card pad"><div class="eyebrow" style="margin-bottom:8px">Análisis de RH</div>${kv([['Clasificación', CLASIF[c.clasificacion]], ['Análisis', c.analisis], ['Propone', MEDIDAS[c.propuesta]]])}</div>` : ''}
    ${c.decision ? `<div class="card pad"><div class="eyebrow" style="margin-bottom:8px">Decisión</div>${kv([['Medida', MEDIDAS[c.decision]], ['Nota', c.decision_nota], ['Resultado', c.resultado]])}</div>` : ''}
    ${cdocs.length ? `<div><div class="eyebrow" style="margin-bottom:6px">Documentos del caso</div>${docListHtml(cdocs)}</div>` : ''}
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
    c.decision === 'terminacion' ? 'Genera el aviso de rescisión desde este caso: al registrarse firmado o con negativa, la baja se aplica sola.' : null), 0); } });
  if (is('developer') && ['decidido', 'cerrado'].includes(c.status) && CASE_DOC[c.decision] && emp && emp.status === 'activo') actions.push({ label: 'Generar ' + DOC_TIPOS[CASE_DOC[c.decision]].label.toLowerCase(), cls: 'primary', run: () => { setTimeout(() => docForm({ tipo: CASE_DOC[c.decision], employee: emp, caseRow: c }), 0); } });
  if (is('developer')) actions.push({ label: 'Ver ficha laboral', run: () => { setTimeout(() => openEmployee(c.employee_id), 0); } });
  const cm = modal({ title: `Caso #${c.folio} · ${fullName(emp)}`, body, actions, wide: true });
  const add = $('#evid_add', cm.el);
  if (add) add.onclick = () => evidenceAddForm(c, () => { cm.close(); openCase(c.id); });
  $$('[data-opendoc]', cm.el).forEach((b) => b.onclick = () => { cm.close(); openDocument(b.dataset.opendoc); });
  // Enlaces firmados (15 min) para ver/descargar cada archivo privado
  $$('.evid-item', cm.el).forEach(async (a) => {
    try {
      const url = await evidenceUrl(a.dataset.path);
      a.href = url; a.removeAttribute('aria-disabled');
      const img = $('img.thumb', a); if (img) img.src = url;
    } catch (e) { a.classList.add('err'); a.title = e.message; }
  });
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

// ───────────────────────── Documentos laborales ─────────────────────────
// Actas, cartas de advertencia, renuncias, avisos de rescisión (despido), convenios de terminación y constancias de baja.
// Solo Daniel genera. Actas y cartas se envían al líder para entregar; el líder sube la copia firmada o registra la negativa.
// Renuncia, convenio y rescisión firmados (o rescisión con negativa) → la base de datos da de baja al trabajador.
const EMPRESA = CFG.empresa || 'CRP COMUNICACIONES S.A. DE C.V.';
const DOC_BUCKET = 'documentos';
const DOC_TIPOS = {
  acta: { label: 'Acta administrativa', code: 'ACT', grupo: 'Disciplinarios', desc: 'Hechos, manifestación del trabajador y firmas. La entrega el líder.' },
  advertencia: { label: 'Carta de advertencia', code: 'ADV', grupo: 'Disciplinarios', desc: 'Advertencia formal con acción correctiva y seguimiento. La entrega el líder.' },
  renuncia: { label: 'Renuncia voluntaria', code: 'REN', grupo: 'Bajas', desc: 'Manifestación libre de separación. Firmada, da de baja al trabajador.' },
  rescision: { label: 'Aviso de rescisión', code: 'RES', grupo: 'Bajas', desc: 'Despido con causal del art. 47 LFT, hechos, fechas y antecedentes.' },
  convenio: { label: 'Convenio de terminación', code: 'CNV', grupo: 'Bajas', desc: 'Acuerdo de terminación por mutuo consentimiento (art. 53-I LFT).' },
  constancia_baja: { label: 'Constancia de baja', code: 'BAJ', grupo: 'Bajas', desc: 'Cierre administrativo de la baja, ligado al documento que la origina.' },
  contrato: { label: 'Contrato de trabajo', code: 'CON', grupo: 'Contratación', desc: '15 días, 30 días o tiempo indeterminado. Se genera solo al contratar desde Reclutamiento.' },
  reglamento: { label: 'Reglamento interior', code: 'RIT', grupo: 'Contratación', desc: 'Reglamento Interior de Trabajo con constancia de recepción.' },
  confidencialidad: { label: 'Acuerdo de confidencialidad', code: 'ACF', grupo: 'Contratación', desc: 'Obligaciones de confidencialidad y manejo de información.' },
  finiquito: { label: 'Recibo de finiquito', code: 'FIN', grupo: 'Finiquitos', desc: 'Desglose del finiquito de la pre-nómina, total con letra, firma y huella; con carta de no adeudo.' },
  liquidacion: { label: 'Recibo de liquidación', code: 'LIQ', grupo: 'Finiquitos', desc: 'Finiquito + indemnización de 3 meses, 20 días por año y prima de antigüedad con salario integrado.' },
  ratificacion: { label: 'Convenio para ratificar', code: 'RAT', grupo: 'Finiquitos', desc: 'Convenio de terminación para ratificarse ante el Centro de Conciliación (Art. 33 LFT).' }
};
const DOC_FIN = ['finiquito', 'liquidacion', 'ratificacion'];
const canDocFin = (areaId) => is('developer', 'nomina') || (is('rh_general', 'rh_area') && S.myAreas.includes(areaId));
const DOC_BAJA = ['renuncia', 'rescision', 'convenio'];
const DOC_CONTRATA = ['contrato', 'reglamento', 'confidencialidad'];
const CONTRATOS = { '15_dias': 'Periodo a prueba · 15 días', '30_dias': 'Periodo a prueba · 30 días', indeterminado: 'Tiempo indeterminado' };
const docTipoBadge = (t) => t.grupo === 'Bajas' ? 'b-bad' : t.grupo === 'Contratación' ? 'b-ok' : t.grupo === 'Finiquitos' ? 'b-warn' : 'b-acc';
const DOC_LIDER = ['acta', 'advertencia'];
const DOC_ST = { emitido: ['Emitido', 'b-acc'], con_lider: ['Con el líder', 'b-warn'], firmado: ['Firmado', 'b-ok'], negativa: ['Negativa de firma', 'b-bad'], anulado: ['Anulado', 'b-mut'] };
const docBadge = (s) => `<span class="badge ${DOC_ST[s][1]}">${DOC_ST[s][0]}</span>`;
const docFolio = (d) => d.folio ? `${DOC_TIPOS[d.tipo].code}-${String(d.folio).padStart(4, '0')}` : 'BORRADOR';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const fechaLarga = (iso) => { if (!iso) return '________________'; const [y, m, d] = String(iso).slice(0, 10).split('-'); return `${Number(d)} de ${MESES[Number(m) - 1]} de ${y}`; };

// Número a letras (pesos mexicanos)
function numLetras(n) {
  const U = ['', 'un', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho', 'diecinueve', 'veinte', 'veintiún', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco', 'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];
  const D = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];
  const C = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos', 'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];
  const cien = (x) => { if (x === 100) return 'cien'; const c = Math.floor(x / 100), r = x % 100; let s = C[c]; if (r) s += (s ? ' ' : '') + (r < 30 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' y ' + U[r % 10] : '')); return s; };
  const mil = (x) => { const m = Math.floor(x / 1000), r = x % 1000; return [m ? (m === 1 ? 'mil' : cien(m) + ' mil') : '', r ? cien(r) : ''].filter(Boolean).join(' '); };
  if (n === 0) return 'cero';
  const mill = Math.floor(n / 1e6), r = n % 1e6;
  return [mill ? (mill === 1 ? 'un millón' : mil(mill) + ' millones') : '', r ? mil(r) : ''].filter(Boolean).join(' ');
}
const montoLetras = (v) => { const n = Math.round(Number(v || 0) * 100) / 100, ent = Math.floor(n), c = Math.round((n - ent) * 100); return `${money(n)} (${numLetras(ent).toUpperCase()} PESOS ${String(c).padStart(2, '0')}/100 M.N.)`; };

const ACT_REASONS = {
  'Incumplimiento de métricas': 'Se hace constar que, conforme a los registros disponibles, se detectó un incumplimiento de los indicadores o métricas de trabajo aplicables al periodo señalado. Deberán asentarse los resultados concretos y la evidencia que los sustenta.',
  'Falta injustificada sin previo aviso': 'Se hace constar la inasistencia del trabajador en la fecha indicada, sin aviso previo ni justificación acreditada al momento de elaborar el acta.',
  'Incumplimiento en envío de evidencias': 'Se hace constar que no fueron remitidas las evidencias de trabajo requeridas para el periodo señalado. Deberá precisarse cuáles evidencias faltaron y el medio por el que fueron solicitadas.',
  'Desconexión durante jornada': 'Se hace constar una interrupción o ausencia de actividad durante la jornada. Deberán registrarse el horario, duración y evidencia disponible, evitando conclusiones no acreditadas.',
  'Incumplimiento de horario': 'Se hace constar el incumplimiento del horario asignado en la fecha indicada, conforme a los registros de asistencia disponibles.',
  'Incumplimiento de instrucciones de trabajo': 'Se hace constar el presunto incumplimiento de una instrucción de trabajo previamente comunicada. Deberá identificarse la instrucción, cuándo fue comunicada y la evidencia correspondiente.',
  'Ausencia prolongada de actividad': 'Se hace constar que los registros disponibles muestran un periodo prolongado sin actividad laboral. Deberán precisarse horarios y evidencia.',
  'Incumplimiento de políticas internas': 'Se hace constar un posible incumplimiento de una política interna aplicable. Deberá identificarse la política concreta y describirse objetivamente la conducta observada.',
  'Otro / Personalizado': ''
};
const WARNING_FORMATS = {
  'Bajo desempeño / incumplimiento de métricas': ['CARTA DE ADVERTENCIA POR BAJO DESEMPEÑO', 'Durante el periodo evaluado se identificaron resultados inferiores a los indicadores, metas o niveles de cumplimiento comunicados para las funciones asignadas. La valoración deberá sustentarse en métricas y evidencia objetiva disponibles.'],
  'Incumplimiento de horario': ['CARTA DE ADVERTENCIA POR INCUMPLIMIENTO DE HORARIO', 'Se identificó un incumplimiento del horario de trabajo asignado. La situación deberá documentarse con los registros de asistencia o conexión correspondientes y considerando cualquier justificación presentada.'],
  'Retardos recurrentes': ['CARTA DE ADVERTENCIA POR RETARDOS RECURRENTES', 'Se identificaron retardos recurrentes respecto del horario de entrada asignado. Deberán precisarse las fechas y registros que sustenten la advertencia, así como las justificaciones que, en su caso, se hubieran presentado.'],
  'Falta injustificada': ['CARTA DE ADVERTENCIA POR FALTA INJUSTIFICADA', 'Se registró una inasistencia respecto de la cual, al momento de emitir la presente carta, no obra justificación acreditada. Deberá identificarse la fecha correspondiente y conservarse el registro de asistencia aplicable.'],
  'Incumplimiento en envío de evidencias': ['CARTA DE ADVERTENCIA POR INCUMPLIMIENTO EN ENVÍO DE EVIDENCIAS', 'No fueron remitidas en la forma o periodo requerido las evidencias de trabajo previamente solicitadas. Deberá precisarse qué evidencia faltó, cuándo fue requerida y el medio utilizado para comunicar la instrucción.'],
  'Desconexiones o ausencia de actividad durante la jornada': ['CARTA DE ADVERTENCIA POR DESCONEXIÓN O AUSENCIA DE ACTIVIDAD', 'Se identificaron periodos de desconexión o ausencia de actividad dentro de la jornada asignada. Deberán asentarse horarios, duración y registros objetivos, sin considerar periodos fuera de jornada ni descansos autorizados.'],
  'Incumplimiento de instrucciones de trabajo': ['CARTA DE ADVERTENCIA POR INCUMPLIMIENTO DE INSTRUCCIONES DE TRABAJO', 'Se identificó el incumplimiento de una instrucción de trabajo previamente comunicada. La carta deberá identificar la instrucción, quién la comunicó, cuándo se comunicó y la evidencia relacionada.'],
  'Incumplimiento de funciones o responsabilidades del puesto': ['CARTA DE ADVERTENCIA POR INCUMPLIMIENTO DE FUNCIONES', 'Se identificaron incumplimientos concretos respecto de funciones o responsabilidades asignadas al puesto. Deberán describirse las actividades involucradas, el resultado esperado y los hechos objetivamente acreditados.'],
  'Incumplimiento de políticas o Reglamento Interior de Trabajo': ['CARTA DE ADVERTENCIA POR INCUMPLIMIENTO DE DISPOSICIONES INTERNAS', 'Se identificó una conducta posiblemente contraria a disposiciones internas aplicables. Deberá señalarse la disposición concreta, los hechos y la evidencia, evitando atribuir automáticamente una sanción distinta de la que corresponda conforme al procedimiento aplicable.'],
  'Conducta o comportamiento inadecuado en el entorno laboral': ['CARTA DE ADVERTENCIA POR CONDUCTA INADECUADA EN EL ENTORNO LABORAL', 'Se documenta una situación de conducta o comportamiento ocurrida en el entorno laboral que requiere corrección. La descripción deberá limitarse a hechos observables y evitar calificativos o conclusiones no acreditadas.'],
  'Uso inadecuado de herramientas, sistemas o recursos de trabajo': ['CARTA DE ADVERTENCIA POR USO INADECUADO DE RECURSOS DE TRABAJO', 'Se identificó un uso inadecuado de herramientas, sistemas o recursos destinados al trabajo. Deberá precisarse el recurso, la conducta observada y la evidencia disponible.'],
  'Falta de seguimiento a indicaciones previamente comunicadas': ['CARTA DE ADVERTENCIA POR FALTA DE SEGUIMIENTO', 'Se identificó falta de seguimiento a indicaciones previamente comunicadas. Deberán asentarse las indicaciones, fechas, medios de comunicación y resultado esperado.'],
  'Reincidencia de una conducta previamente advertida': ['CARTA DE ADVERTENCIA POR REINCIDENCIA', 'Se documenta la repetición de una conducta que había sido previamente comunicada al trabajador. Deberá identificarse el antecedente documental y describirse el nuevo hecho de manera independiente.'],
  'Otro / Personalizado': ['CARTA DE ADVERTENCIA', 'Se documenta formalmente una situación laboral que requiere ser comunicada a la persona trabajadora. El motivo y los hechos deberán describirse de manera objetiva y sustentarse en la evidencia disponible.']
};
const RESCISSION_CAUSES = {
  'Fracción I — Engaño con certificados o referencias falsas': 'Engaño mediante certificados falsos o referencias que atribuyan capacidades, aptitudes o facultades de las que carezca; esta causa deja de surtir efecto después de treinta días de prestar servicios.',
  'Fracción II — Falta de probidad/honradez, violencia, amenazas, injurias o malos tratamientos': 'Conductas durante las labores contra el patrón, sus familiares, personal directivo o administrativo, clientes o proveedores, salvo provocación o defensa propia.',
  'Fracción III — Conductas graves contra compañeros que alteren la disciplina': 'Actos contra compañeros de trabajo de la naturaleza prevista legalmente, cuando alteren la disciplina del lugar de trabajo.',
  'Fracción IV — Conductas graves fuera del servicio contra patrón/directivos': 'Actos fuera del servicio contra el patrón, familiares o personal directivo/administrativo, cuando sean de tal gravedad que hagan imposible continuar la relación.',
  'Fracción V — Daños materiales intencionales': 'Perjuicios materiales ocasionados intencionalmente durante las labores o con motivo de ellas a bienes relacionados con el trabajo.',
  'Fracción VI — Daños graves por negligencia': 'Perjuicios materiales graves ocasionados sin dolo, pero con negligencia de tal gravedad que sea causa única del perjuicio.',
  'Fracción VII — Comprometer la seguridad por imprudencia o descuido inexcusable': 'Comprometer, por imprudencia o descuido inexcusable, la seguridad del establecimiento o de las personas que se encuentren en él.',
  'Fracción VIII — Actos inmorales, hostigamiento o acoso sexual': 'Actos inmorales o de hostigamiento y/o acoso sexual contra cualquier persona en el establecimiento o lugar de trabajo.',
  'Fracción IX — Revelación de secretos o asuntos reservados': 'Revelar secretos de fabricación o dar a conocer asuntos de carácter reservado, con perjuicio de la empresa.',
  'Fracción X — Más de tres faltas de asistencia en 30 días': 'Más de tres faltas de asistencia en un periodo de treinta días, sin permiso del patrón o sin causa justificada.',
  'Fracción XI — Desobediencia relacionada con el trabajo contratado': 'Desobedecer al patrón o a sus representantes, sin causa justificada, siempre que se trate del trabajo contratado.',
  'Fracción XII — Negativa a adoptar medidas preventivas o procedimientos de seguridad': 'Negarse a adoptar medidas preventivas o seguir procedimientos indicados para evitar accidentes o enfermedades.',
  'Fracción XIII — Presentarse en estado de embriaguez o bajo narcóticos/drogas': 'Concurrir a las labores en estado de embriaguez o bajo influencia de narcótico o droga enervante, salvo prescripción médica y cumplimiento de los avisos legalmente exigibles.',
  'Fracción XIV — Sentencia ejecutoriada que impida cumplir la relación': 'Sentencia ejecutoriada que imponga una pena de prisión que impida el cumplimiento de la relación de trabajo.',
  'Fracción XIV Bis — Falta imputable de documentos legalmente necesarios': 'Falta de documentos exigidos por leyes y reglamentos, necesarios para prestar el servicio, cuando sea imputable al trabajador y exceda el periodo legal aplicable.',
  'Fracción XV — Causas análogas igualmente graves': 'Causas análogas a las anteriores, de igual manera graves y de consecuencias semejantes en lo que al trabajo se refiere.'
};
const SALIDAS = ['Renuncia voluntaria', 'Rescisión (despido justificado)', 'Terminación por mutuo consentimiento', 'Abandono de empleo', 'Término de contrato', 'Otro'];
const yesNo = [['', 'Elegir…'], ['true', 'Sí'], ['false', 'No']];
const opts = (arr) => arr.map((x) => [x, x]);

// Campos de cada formato. d = datos guardados (al editar) o sugeridos (desde un caso)
function docFields(tipo, d = {}) {
  const t = todayMX();
  switch (tipo) {
    case 'acta': return [
      { k: 'fecha_hechos', label: 'Fecha de los hechos', type: 'date', req: true, val: d.fecha_hechos || t, max: t },
      { k: 'motivo', label: 'Motivo', type: 'select', req: true, full: true, val: d.motivo || '', options: [['', 'Elegir…'], ...opts(Object.keys(ACT_REASONS))] },
      { k: 'motivo_texto', label: 'Descripción del motivo', type: 'textarea', full: true, val: d.motivo_texto || '', hint: 'Se llena con el texto base del motivo; ajústalo.' },
      { k: 'hechos', label: 'Relación circunstanciada de hechos', type: 'textarea', req: true, full: true, val: d.hechos || '', hint: 'Qué pasó, cuándo, cómo; solo hechos comprobables.' },
      { k: 'evidencia', label: 'Evidencia o referencia', type: 'textarea', full: true, val: d.evidencia || '' },
      { k: 'manifestacion', label: 'Manifestación del trabajador (si ya la dio)', type: 'textarea', full: true, val: d.manifestacion || '', hint: 'Si la deja en blanco, el formato trae renglones para escribirla a mano.' }];
    case 'advertencia': return [
      { k: 'motivo', label: 'Motivo', type: 'select', req: true, full: true, val: d.motivo || '', options: [['', 'Elegir…'], ...opts(Object.keys(WARNING_FORMATS))] },
      { k: 'motivo_otro', label: 'Motivo personalizado', full: true, val: d.motivo_otro || '', hint: 'Solo si elegiste "Otro / Personalizado".' },
      { k: 'fecha_hechos', label: 'Fecha del hecho', type: 'date', req: true, val: d.fecha_hechos || t, max: t },
      { k: 'rh_nombre', label: 'Firma por la empresa', val: d.rh_nombre || S.me.full_name || '' },
      { k: 'periodo_inicio', label: 'Periodo evaluado · desde', type: 'date', val: d.periodo_inicio || '' },
      { k: 'periodo_fin', label: 'Periodo evaluado · hasta', type: 'date', val: d.periodo_fin || '' },
      { k: 'hechos', label: 'Hechos concretos', type: 'textarea', req: true, full: true, val: d.hechos || '' },
      { k: 'evidencia', label: 'Evidencia y antecedentes', type: 'textarea', full: true, val: d.evidencia || '' },
      { k: 'accion', label: 'Acción correctiva esperada', type: 'textarea', full: true, val: d.accion || '' },
      { k: 'seguimiento', label: 'Seguimiento', type: 'textarea', full: true, val: d.seguimiento || '', hint: 'Ej. revisión semanal de métricas durante 30 días.' }];
    case 'renuncia': return [
      { k: 'fecha_entrega', label: 'Fecha de entrega', type: 'date', req: true, val: d.fecha_entrega || t },
      { k: 'fecha_efectiva', label: 'Último día de trabajo', type: 'date', req: true, val: d.fecha_efectiva || t },
      { k: 'rh_nombre', label: 'Recibe por RH', val: d.rh_nombre || S.me.full_name || '' },
      { k: 'recontratable', label: '¿Recontratable?', type: 'select', req: true, val: d.recontratable == null ? '' : String(d.recontratable), options: yesNo }];
    case 'rescision': return [
      { k: 'causal', label: 'Causal (art. 47 LFT)', type: 'select', req: true, full: true, val: d.causal || '', options: [['', 'Elegir…'], ...opts(Object.keys(RESCISSION_CAUSES))] },
      { k: 'fecha_efectiva', label: 'Fecha efectiva', type: 'date', req: true, val: d.fecha_efectiva || t },
      { k: 'hechos', label: 'Conducta o conductas que motivan la rescisión', type: 'textarea', req: true, full: true, val: d.hechos || '' },
      { k: 'fechas_hechos', label: 'Fecha o fechas de los hechos', type: 'textarea', req: true, full: true, val: d.fechas_hechos || '' },
      { k: 'evidencia', label: 'Elementos y evidencia', type: 'textarea', req: true, full: true, val: d.evidencia || '' },
      { k: 'antecedentes_texto', label: 'Otros antecedentes (opcional)', type: 'textarea', full: true, val: d.antecedentes_texto || '', hint: 'Las actas y cartas registradas en la app se eligen abajo.' },
      { k: 'rh_nombre', label: 'Firma por la empresa', val: d.rh_nombre || S.me.full_name || '' },
      { k: 'recontratable', label: '¿Recontratable?', type: 'select', req: true, val: d.recontratable == null ? 'false' : String(d.recontratable), options: yesNo }];
    case 'convenio': return [
      { k: 'fecha_efectiva', label: 'Fecha de terminación', type: 'date', req: true, val: d.fecha_efectiva || t },
      { k: 'representante', label: 'Representante de la empresa', req: true, val: d.representante || S.me.full_name || '' },
      { k: 'monto', label: 'Cantidad total a pagar (MXN)', type: 'number', req: true, val: d.monto ?? '' },
      { k: 'forma_pago', label: 'Forma de pago', type: 'select', req: true, val: d.forma_pago || 'Transferencia', options: opts(['Transferencia', 'Efectivo', 'Cheque']) },
      { k: 'recontratable', label: '¿Recontratable?', type: 'select', req: true, val: d.recontratable == null ? '' : String(d.recontratable), options: yesNo },
      { k: 'conceptos', label: 'Desglose de conceptos', type: 'textarea', req: true, full: true, val: d.conceptos || '', hint: 'Un concepto por renglón. Ej. "Aguinaldo proporcional: $1,250.00". Usa el cálculo del finiquito.' },
      { k: 'antecedentes', label: 'Antecedentes (opcional)', type: 'textarea', full: true, val: d.antecedentes || '', hint: 'Breve relación de por qué las partes acuerdan terminar.' }];
    case 'contrato': return [
      { k: 'contrato_tipo', label: 'Tipo de contrato', type: 'select', req: true, val: d.contrato_tipo || '', options: [['', 'Elegir…'], ...Object.entries(CONTRATOS)] },
      { k: 'fecha_ingreso', label: 'Fecha de ingreso', type: 'date', req: true, val: d.fecha_ingreso || t },
      { k: 'sueldo', label: 'Sueldo mensual (MXN)', type: 'number', req: true, val: d.sueldo ?? '' },
      { k: 'horario', label: 'Horario', val: d.horario || '', hint: 'Ej. Lunes a viernes 08:00 a 17:00' },
      { k: 'representante', label: 'Firma por la empresa', val: d.representante || S.me.full_name || '' }];
    case 'reglamento': case 'confidencialidad': return [];
    case 'constancia_baja': return [
      { k: 'tipo_salida', label: 'Tipo de salida', type: 'select', req: true, val: d.tipo_salida || '', options: [['', 'Elegir…'], ...opts(SALIDAS)] },
      { k: 'rh_nombre', label: 'Firma por RH', val: d.rh_nombre || S.me.full_name || '' },
      { k: 'ultimo_dia', label: 'Último día laborado', type: 'date', req: true, val: d.ultimo_dia || t },
      { k: 'fecha_efectiva', label: 'Fecha efectiva de baja', type: 'date', req: true, val: d.fecha_efectiva || t },
      { k: 'observaciones', label: 'Observaciones', type: 'textarea', full: true, val: d.observaciones || '' }];
  }
  return [];
}

function empSnapshot(e) {
  const g = S.groups.find((x) => x.id === e.group_id) || {};
  return { nombre: fullName(e), num: e.num_empleado || '', puesto: e.puesto || '', area: areaName(e.area_id), grupo: e.group_id ? g.name || '' : '', lider: g.tl_id ? profName(g.tl_id) : '', ingreso: e.fecha_ingreso || '' };
}


// Textos base de contratación (de la versión de escritorio M02); editables en Plantillas
const TXT_CLAUSULAS = "**TERCERA. Modalidad y lugar de prestación.** La modalidad de trabajo (presencial, home office o híbrida) será la que asigne EL PATRÓN conforme al puesto. LA PERSONA TRABAJADORA deberá contar con las condiciones operativas necesarias para conectarse y desempeñar sus funciones conforme a los procedimientos internos. La modalidad y sus condiciones específicas se sujetarán en todo momento a las disposiciones legales aplicables.\n\n**CUARTA. Jornada, asistencia y descansos.** La jornada será de ocho horas efectivas conforme al horario asignado, además de una hora para alimentos. El descanso semanal será el indicado en las condiciones de trabajo aplicables. La asistencia, puntualidad y permanencia durante la jornada serán obligatorias, salvo permiso o causa justificada.\n\n**QUINTA. Salario y pago.** EL PATRÓN pagará el salario señalado en la carátula, en la periodicidad y forma convenidas. Los descuentos únicamente procederán en los casos permitidos por la legislación aplicable.\n\n**SEXTA. Obligaciones de desempeño.** LA PERSONA TRABAJADORA se obliga a cumplir las funciones, instrucciones lícitas, procesos, horarios, reportes y requisitos mínimos de desempeño correspondientes a su puesto y área. Los indicadores serán objetivos, medibles, verificables y previamente comunicados.\n\n**SÉPTIMA. Cumplimiento mínimo y bajo rendimiento.** El cumplimiento sostenido de los requisitos mínimos del puesto constituye una obligación laboral esencial. Cuando exista bajo rendimiento o incumplimiento, EL PATRÓN podrá documentar los hechos y aplicar las medidas internas que correspondan. Cuando los hechos acreditados actualicen una causa legal de rescisión o hagan procedente la terminación conforme a la legislación aplicable, podrán ejercerse las acciones correspondientes respetando el procedimiento y formalidades legales.\n\n**OCTAVA. Medición, evidencias y seguimiento.** LA PERSONA TRABAJADORA deberá registrar su actividad y resultados en los sistemas, bases, enlaces, reportes o medios autorizados. La ausencia o insuficiencia de actividad deberá analizarse junto con las demás evidencias disponibles antes de determinar una medida laboral.\n\n**NOVENA. Asistencia, conexión y disponibilidad.** Durante su jornada, LA PERSONA TRABAJADORA deberá mantenerse disponible para el desempeño de sus funciones y registrar su asistencia conforme al mecanismo vigente.\n\n**DÉCIMA. Confidencialidad y datos.** LA PERSONA TRABAJADORA guardará confidencialidad sobre bases de datos, clientes, prospectos, cartera, estrategias, procesos, accesos, contraseñas, métricas y demás información no pública. Esta obligación se complementará con el acuerdo de confidencialidad suscrito por separado.\n\n**DÉCIMA PRIMERA. Reglamento y políticas internas.** LA PERSONA TRABAJADORA deberá observar el Reglamento Interior de Trabajo y demás protocolos que le sean comunicados, siempre que sean compatibles con la legislación aplicable.\n\n**DÉCIMA SEGUNDA. Capacitación, retroalimentación y mejora.** La empresa podrá impartir capacitación y retroalimentación. Cuando se detecten desviaciones de desempeño, podrán establecerse compromisos o planes de mejora con indicadores, periodo de seguimiento y evidencia de resultados.\n\n**DÉCIMA TERCERA. Medidas disciplinarias y documentación.** Las incidencias laborales podrán documentarse mediante reportes, actas administrativas, cartas de advertencia, constancias de retroalimentación y demás medios de prueba pertinentes, sin sustituir los requisitos legales para una rescisión o terminación.\n\n**DÉCIMA CUARTA. Rescisión y terminación.** La relación laboral podrá rescindirse o terminarse cuando se actualice alguno de los supuestos previstos por la Ley Federal del Trabajo y se cumplan las formalidades correspondientes.\n\n**DÉCIMA QUINTA. Modificaciones y prevalencia legal.** Toda modificación relevante de las condiciones de trabajo se documentará cuando corresponda. Ninguna disposición interna podrá interpretarse como renuncia a derechos irrenunciables; en caso de contradicción prevalecerá la legislación aplicable.\n\n## METAS E INDICADORES DE DESEMPEÑO\n\nLA PERSONA TRABAJADORA deberá cumplir con las metas, métricas e indicadores de desempeño correspondientes a su puesto y área. Dichos parámetros serán establecidos y comunicados por EL PATRÓN al inicio de cada periodo mensual de evaluación, a través de los medios internos autorizados. Las metas e indicadores deberán ser objetivos, medibles, verificables y acordes con las funciones del puesto, y servirán como referencia para el seguimiento y evaluación del desempeño durante el periodo correspondiente. Cualquier modificación aplicable al periodo deberá ser comunicada por los medios internos autorizados.";
const TXT_RIT = "Aplicable al personal en México | Modalidades: teletrabajo, presencial/coworking e híbrida\n\n## FUNDAMENTO Y OBJETO\n\nEl presente Reglamento tiene por objeto establecer disposiciones obligatorias para la persona empleadora y las personas trabajadoras durante el desarrollo del trabajo, de conformidad con los artículos 422 a 425 de la Ley Federal del Trabajo (LFT), sin perjuicio de las condiciones de trabajo pactadas individual o colectivamente y de los derechos irrenunciables previstos en la legislación aplicable.\n\nPara las personas que laboren bajo la modalidad de teletrabajo serán además aplicables el Capítulo XII Bis de la LFT y la NOM-037-STPS-2023, Teletrabajo-Condiciones de seguridad y salud en el trabajo, cuando legalmente corresponda.\n\n## CAPÍTULO I. DISPOSICIONES GENERALES\n\n**Artículo 1. Ámbito personal.** El Reglamento será aplicable a todas las personas trabajadoras sujetas a una relación laboral con la empresa en México, cualquiera que sea su puesto, área, modalidad o lugar autorizado de prestación de servicios.\n\n**Artículo 2. Modalidades.** La prestación de servicios podrá desarrollarse en modalidad presencial/coworking, híbrida o de teletrabajo, conforme al contrato individual, convenio o documento aplicable. La modalidad no modifica por sí misma la subordinación, jornada, obligaciones ni derechos legales.\n\n**Artículo 3. Principios.** La interpretación y aplicación de este Reglamento deberá respetar la dignidad, igualdad, no discriminación, privacidad, protección de datos, seguridad y salud, debido procedimiento disciplinario y derechos laborales irrenunciables.\n\n## CAPÍTULO II. JORNADAS, HORARIOS Y ASISTENCIA \n\n**Artículo 4. Horarios ordinarios.** La empresa podrá operar, según puesto y asignación documentada, con jornadas de 07:00 a 16:00 horas o de 08:00 a 17:00 horas. Cualquier cambio deberá ser comunicado por los canales autorizados y respetar los límites legales y contractuales.\n\n**Artículo 5. Comida.** La jornada contempla un periodo de comida de una hora, que podrá asignarse de 13:00 a 14:00 o de 14:00 a 15:00 horas, conforme a la operación y asignación comunicada.\n\n**Artículo 6. Pausas durante la jornada.** No se establecen descansos adicionales fijos de quince minutos. Las pausas adicionales podrán ser autorizadas y organizadas por el Team Leader (TL) o Supervisor, atendiendo a la carga de trabajo, continuidad de la operación y necesidades del servicio. Su autorización en una jornada determinada no genera un derecho permanente para jornadas posteriores. En todo caso deberán respetarse los periodos de descanso, seguridad y salud que resulten obligatorios conforme a la legislación y normas aplicables, particularmente en la modalidad de teletrabajo.\n\n**Artículo 7. Registro de asistencia.** La asistencia podrá verificarse mediante Teams, Meet, Lark u otra plataforma autorizada, además de registros objetivos del CRM o sistemas corporativos. La persona trabajadora deberá participar en el pase de lista y, cuando sea requerido para identificación o interacción directa, encender cámara durante dicho pase, con respeto a la privacidad y proporcionalidad.\n\n**Artículo 8. Retardos.** No existe periodo interno de tolerancia. La conexión posterior a la hora asignada podrá registrarse como retardo. La empresa documentará por separado retardos, ausencias parciales, interrupciones no autorizadas y faltas completas, atendiendo a la duración y circunstancias reales; una regla interna no sustituirá los supuestos legales de rescisión.\n\n**Artículo 9. Disponibilidad.** Durante la jornada la persona trabajadora deberá mantenerse disponible y desempeñando las actividades asignadas, salvo comida, pausas autorizadas, permisos, incapacidades, contingencias justificadas o causas legales. Registrar asistencia y posteriormente abandonar o suspender las actividades sin autorización constituye una incidencia distinta al simple retardo.\n\n**Artículo 10. Descanso semanal.** Se otorgará al menos el descanso semanal que corresponda conforme a la LFT. En la operación con descanso rolado, la selección o asignación se documentará conforme al esquema operativo vigente, sin afectar derechos mínimos legales.\n\n## CAPÍTULO III. TELETRABAJO Y CONTINUIDAD OPERATIVA\n\n**Artículo 11. Teletrabajo.** Cuando se actualice legalmente la modalidad de teletrabajo, la empresa y la persona trabajadora observarán las obligaciones previstas en los artículos 330-A y siguientes de la LFT y la NOM-037-STPS-2023.\n\n**Artículo 12. Lugar de teletrabajo.** El teletrabajo se realizará en el lugar o lugares acordados o informados conforme a los instrumentos aplicables. Podrán admitirse ubicaciones alternativas cuando resulten compatibles con la seguridad, confidencialidad, conectividad y condiciones de seguridad y salud requeridas.\n\n**Artículo 13. Equipos y costos.** La empresa regularizará y documentará, cuando resulte aplicable el régimen legal de teletrabajo, la provisión, instalación, mantenimiento de equipos y la asunción de costos que correspondan conforme a la LFT, incluidos los servicios de telecomunicación y la parte proporcional de electricidad en los términos legalmente procedentes. Este Reglamento no transfiere al trabajador obligaciones patronales irrenunciables.\n\n**Artículo 14. Fallas de conectividad.** Ante falla de internet, energía, equipo o plataforma que impida laborar, la persona trabajadora deberá informar tan pronto como sea posible al Team Leader (TL) o a Recursos Humanos (RH) asignado, explicar la incidencia, aportar evidencia razonable cuando exista y mantener comunicación para reanudar actividades. La incidencia será valorada según sus circunstancias y no se presumirá injustificada automáticamente.\n\n**Artículo 15. Supervisión.** La empresa podrá utilizar registros de conexión, desconexión, tiempo de actividad, llamadas, mensajes, registros, operaciones, CRM y evidencias generadas por sistemas de trabajo, siempre bajo criterios de necesidad, proporcionalidad, finalidad laboral, privacidad y protección de datos.\n\n## CAPÍTULO IV. SEGURIDAD DE INFORMACIÓN, DATOS Y ACCESOS \n\n**Artículo 16. Información protegida.** La información de clientes, teléfonos, cuentas, datos financieros, bases de datos, contraseñas, códigos, expedientes, estrategias, métricas y demás información no pública sólo podrá utilizarse para fines laborales autorizados.\n\n**Artículo 17. Descargas y capturas.** Cuando las funciones permitan descargar información o realizar capturas en equipos personales, su uso se limitará estrictamente a fines laborales autorizados. Queda prohibida su conservación, explotación, difusión, transferencia o utilización para beneficio personal o de terceros.\n\n**Artículo 18. WhatsApp y dispositivos personales.** El uso autorizado de WhatsApp o dispositivos personales para actividades de trabajo no autoriza el uso personal de la información de clientes ni su envío a personas ajenas a la operación.\n\n**Artículo 19. Credenciales.** Los usuarios, contraseñas y accesos son personales. Queda prohibido prestarlos, compartirlos, intercambiarlos, utilizar credenciales ajenas o permitir que terceros operen con ellas, salvo mecanismos institucionales expresamente autorizados.\n\n## CAPÍTULO V. COBRANZA, PAGOS Y PREVENCIÓN DE DESVÍOS \n\n**Artículo 20. Medios de pago.** Las personas que realicen cobranza únicamente podrán proporcionar a clientes los medios, cuentas, CLABE, referencias, enlaces o mecanismos de pago expresamente autorizados por la empresa.\n\n**Artículo 21. Prohibición absoluta de desvío.** Queda prohibido proporcionar cuentas bancarias personales, de familiares, compañeros o terceros no autorizados; recibir, solicitar, redirigir o intentar redirigir pagos de clientes a medios distintos de los autorizados; apropiarse de pagos; ocultar operaciones; alterar comprobantes; o inducir al cliente a pagar fuera de los canales autorizados.\n\n**Artículo 22. Preservación de evidencia.** Ante indicios de desvío, manipulación o apropiación de recursos, deberán preservarse logs, mensajes, grabaciones, comprobantes, CRM y demás evidencia disponible. RH realizará el análisis laboral correspondiente, sin perjuicio de que la empresa determine otras acciones legales procedentes.\n\n## CAPÍTULO VI. MÉTRICAS Y DESEMPEÑO\n\n**Artículo 23. Métricas objetivas.** Las personas trabajadoras deberán cumplir las funciones y parámetros de desempeño lícitos, objetivos, razonables y previamente comunicados que correspondan a su puesto. Las cifras y metas específicas podrán constar en políticas, anexos, tableros o comunicaciones operativas, para permitir su actualización sin alterar indebidamente el Reglamento.\n\n**Artículo 24. Marketing.** Entre los indicadores de Marketing podrán considerarse número de llamadas, mensajes y registros, además de otros indicadores objetivos comunicados previamente.\n\n**Artículo 25. Cobranza.** Entre los indicadores de Cobranza podrán considerarse número de llamadas, mensajes y pagos efectuados, además de otros indicadores objetivos comunicados previamente.\n\n**Artículo 26. Validación.** El TL realizará la medición operativa; el Supervisor validará la información y RH podrá corroborar evidencia y consistencia antes de utilizarla en un procedimiento disciplinario o de terminación.\n\n**Artículo 27. Distinción de conductas.** El bajo rendimiento, incumplimiento de jornada, abandono de actividades, falsificación de evidencias, manipulación, desvío de pagos y faltas de asistencia serán analizados como conductas diferentes y no se presumirán equivalentes.\n\n## CAPÍTULO VII. PERMISOS, AUSENCIAS E INCAPACIDADES \n\n**Artículo 28. Permisos.** Los permisos previsibles deberán solicitarse al TL con al menos dos días de anticipación cuando las circunstancias lo permitan. El TL canalizará la solicitud y RH resolverá conforme a las políticas, necesidades operativas y derechos legales.\n\n**Artículo 29. Justificación.** Las ausencias podrán acreditarse mediante documentación idónea, incluyendo constancias médicas, incapacidades legalmente reconocidas, citatorios o constancias de comparecencia ante autoridad u organismo jurisdiccional, según corresponda. RH valorará la suficiencia y autenticidad de la documentación.\n\n**Artículo 30. Faltas injustificadas.** Las faltas se documentarán individualmente. Cuando se actualice el supuesto legal de más de tres faltas de asistencia en un periodo de treinta días, sin permiso o causa justificada, RH analizará la procedencia de la rescisión conforme a la LFT; no operará una baja automática sin revisión y procedimiento.\n\n**Artículo 31. Incomunicación.** Cuando una persona deje de conectarse o presentarse y no responda, TL y RH deberán documentar intentos razonables de contacto, días de ausencia y evidencia disponible antes de determinar la medida procedente.\n\n## CAPÍTULO VIII. CONDUCTAS PROHIBIDAS\n\n**Artículo 32. Prohibiciones generales.** Se prohíben, entre otras conductas: falsificar o alterar registros; simular llamadas o actividades; manipular capturas o evidencias; registrar operaciones inexistentes; extraer o utilizar indebidamente bases de datos; compartir información confidencial; desviar pagos; usar credenciales ajenas; acosar, hostigar o discriminar; presentarse o laborar bajo efectos que comprometan la seguridad o desempeño; abandonar actividades; dormir durante la jornada cuando implique incumplimiento; realizar actividades personales prolongadas incompatibles con la jornada; y desobedecer instrucciones lícitas relacionadas con el trabajo.\n\n**Artículo 33. Otro empleo durante jornada.** No podrá prestarse simultáneamente un servicio para otra empresa o tercero durante la jornada comprometida con la empresa cuando ello implique incumplimiento de horario, disponibilidad, confidencialidad, conflicto de interés o afectación de las funciones. Esta regla no constituye una prohibición general de actividades lícitas fuera de la jornada.\n\n**Artículo 34. Conducta en reuniones.** En videollamadas, reuniones con clientes o juntas internas se mantendrá una conducta profesional, respetuosa y compatible con la función. Las reglas de presentación deberán ser razonables y no discriminatorias.\n\n**Artículo 35. Grabaciones.** Las grabaciones de llamadas o videollamadas se realizarán únicamente cuando exista finalidad laboral legítima, información previa o base aplicable y medidas de protección de datos. Queda prohibida su difusión o utilización para fines personales.\n\n## CAPÍTULO IX. RESPONSABILIDADES Y LÍMITES DE MANDO\n\n**Artículo 36. Cadena de reporte.** Los TL reportarán a su Supervisor y los Supervisores al RH asignado, conforme a la estructura vigente.\n\n**Artículo 37. Límites.** Ningún TL o Supervisor podrá por decisión unilateral cambiar horarios en contravención de las condiciones aplicables, amenazar con despidos, ejecutar una baja sin intervención de RH, exigir trabajo fuera de jornada sin el tratamiento legal correspondiente, modificar métricas retroactivamente, ordenar alterar evidencia, ocultar irregularidades o tolerar conscientemente un posible desvío o fraude sin reportarlo.\n\n**Artículo 38. Bajas.** Toda propuesta de terminación o rescisión deberá canalizarse a RH. La decisión y comunicación deberán realizarse por las personas facultadas y conforme a la LFT y documentación aplicable.\n\n## CAPÍTULO X. PROCEDIMIENTO DISCIPLINARIO\n\n**Artículo 39. Principios.** Las medidas disciplinarias deberán guardar relación con la conducta acreditada, gravedad, intencionalidad cuando resulte demostrable, afectación, reincidencia, antecedentes y demás circunstancias objetivas. No podrán imponerse sanciones prohibidas por la ley.\n\n**Artículo 40. Flujo.** El procedimiento ordinario será: (1) TL detecta y solicita; (2) Supervisor revisa y valida; (3) RH analiza la evidencia; (4) se informa a la persona trabajadora la conducta atribuida; (5) se le permite manifestar lo que a su derecho convenga y aportar elementos; (6) RH documenta el resultado; y (7) se determina, en su caso, la medida procedente.\n\n**Artículo 41. Acta administrativa.** Cuando corresponda, RH elaborará el acta administrativa describiendo hechos objetivos, fechas, sistemas o evidencias, manifestaciones de la persona trabajadora, personas intervinientes y conclusión. La negativa a firmar podrá asentarse y no equivaldrá por sí sola a aceptación de los hechos.\n\n**Artículo 42. Derecho de audiencia.** Antes de aplicar una suspensión disciplinaria, la persona trabajadora tendrá derecho a ser oída, conforme al artículo 423, fracción X, de la LFT.\n\n## CAPÍTULO XI. SISTEMA DE MEDIDAS DISCIPLINARIAS\n\n**Artículo 43. Escala orientativa.** La siguiente escala establece rangos máximos internos y no sustituye el análisis individual. La reincidencia no será el único criterio y la empresa podrá aplicar una medida menor cuando las circunstancias lo justifiquen. Cuando los hechos pudieran constituir una causa legal de rescisión, RH realizará el análisis correspondiente en lugar de presumir que procede una suspensión.\n\n- **I - Menor** · Ejemplos: Retardo aislado; incumplimiento operativo menor; omisión subsanable sin daño relevante. · Medidas posibles: Amonestación verbal documentada o escrita; capacitación; acta cuando proceda. · Control: Evidencia + registro.\n- **II - Relevante** · Ejemplos: Reincidencia; desconexión no autorizada; ausencia parcial; incumplimiento relevante de procedimiento. · Medidas posibles: Amonestación escrita, acta y/o suspensión de 1 a 2 días sin goce de salario. · Control: Audiencia previa.\n- **III - Grave** · Ejemplos: Abandono significativo de jornada; falsificación o manipulación relevante sin perjuicio mayor acreditado; reincidencia grave. · Medidas posibles: Suspensión de 3 a 5 días sin goce de salario. · Control: Audiencia + resolución de RH.\n- **IV - Muy grave** · Ejemplos: Conductas de alta afectación que, tras análisis, no se encaucen directamente a rescisión; reincidencia especialmente grave. · Medidas posibles: Suspensión de 6 a 8 días sin goce de salario. · Control: Máximo reglamentario: 8 días.\n- **Especial** · Ejemplos: Hechos que pudieran actualizar causas de rescisión, desvío de pagos, apropiación, violencia, revelación grave de información u otros supuestos legales. · Medidas posibles: Preservación de evidencia y análisis jurídico-laboral; no se aplica automáticamente la escala progresiva. · Control: RH + representante facultado.\n\n**Artículo 44. Suspensión disciplinaria.** Cuando proceda conforme a este Reglamento, podrá imponerse suspensión temporal sin goce de salario hasta por un máximo de ocho días, previa audiencia de la persona trabajadora. La duración concreta se determinará atendiendo a la gravedad de la conducta, reincidencia, antecedentes, afectación y demás circunstancias objetivas, y deberá quedar justificada por escrito.\n\n**Artículo 45. No duplicidad automática.** Una medida disciplinaria aplicada respecto de determinados hechos deberá considerarse al analizar cualquier actuación posterior relacionada con los mismos, evitando decisiones automáticas o contradictorias y sujetando cualquier rescisión al marco legal aplicable.\n\n## CAPÍTULO XII. DISPOSICIONES FINALES Y FORMALIZACIÓN\n\n**Artículo 46. Comisión Mixta.** El Reglamento deberá formularse por una comisión mixta de representantes de las personas trabajadoras y de la persona empleadora, conforme al artículo 424 de la LFT.\n\n**Artículo 47. Depósito.** Una vez acordado y firmado, se realizarán las gestiones de depósito ante el Centro Federal de Conciliación y Registro Laboral dentro del plazo legal aplicable.\n\n**Artículo 48. Difusión.** Una vez que resulte jurídicamente aplicable, deberá entregarse o difundirse a las personas trabajadoras y mantenerse visible o accesible por los medios correspondientes, conforme a la LFT.\n\n**Artículo 49. Jerarquía normativa.** Cualquier disposición de este Reglamento contraria a la LFT, normas oficiales, contrato colectivo aplicable o demás normas imperativas se tendrá por no puesta en la medida de la contradicción.\n\n**Artículo 50. Vigencia.** El presente Reglamento surtirá efectos a partir de su depósito ante el Centro Federal de Conciliación y Registro Laboral, conforme al procedimiento legal aplicable, y deberá difundirse entre las personas trabajadoras por los medios correspondientes.\n\n**Artículo 51. Modificaciones.** La Empresa podrá proponer revisiones o modificaciones al presente Reglamento cuando existan necesidades operativas, organizacionales o cambios normativos, sin que sea necesario un aviso previo para iniciar su revisión. Ninguna modificación surtirá efectos por la sola decisión unilateral de la Empresa: deberá observarse el procedimiento legal aplicable, incluida la intervención de la Comisión Mixta y el depósito correspondiente cuando proceda. Una vez formalizada, la modificación será comunicada al personal por los medios autorizados.\n\n## ANEXO A. MATRIZ OPERATIVA DE INCIDENCIAS\n\n- **Retardo** · Evidencia mínima: Registro de pase de lista/conexión · TL: Reporta · Supervisor: Valida · RH: Registra/decide\n- **Desconexión o ausencia parcial** · Evidencia mínima: Logs + comunicaciones · TL: Documenta · Supervisor: Valida · RH: Escucha y resuelve\n- **Bajo rendimiento** · Evidencia mínima: Métricas comunicadas + periodo · TL: Mide · Supervisor: Valida · RH: Corrobora\n- **Falta injustificada** · Evidencia mínima: Asistencia + intentos de contacto · TL: Reporta · Supervisor: Valida · RH: Califica\n- **Falsificación** · Evidencia mínima: Originales, logs y comparativo · TL: Preserva · Supervisor: Valida · RH: Investiga\n- **Desvío de pago** · Evidencia mínima: CRM + conversación + cuenta + comprobante · TL: Escala · Supervisor: Escala · RH: Investigación prioritaria\n\n## ANEXO B. BASE LEGAL DE REFERENCIA\n\nLey Federal del Trabajo, artículos 422 a 425: Reglamento Interior de Trabajo, contenido, formulación, depósito y vigencia.\n\nLey Federal del Trabajo, artículo 423, fracción X: disposiciones disciplinarias, audiencia previa y suspensión disciplinaria hasta por ocho días.\n\nLey Federal del Trabajo, artículo 47: causas de rescisión de la relación de trabajo sin responsabilidad para el patrón.\n\nLey Federal del Trabajo, artículos 330-A a 330-K: régimen especial de teletrabajo.\n\nNOM-037-STPS-2023: condiciones de seguridad y salud aplicables al teletrabajo.";
const TXT_CONF = "## DECLARACIÓN\n\nLa persona firmante reconoce que, por razón de sus funciones, servicios, capacitación, acceso a sistemas o herramientas de trabajo, puede conocer información no pública de {empresa}, sus operaciones, clientes, personal, proveedores y procesos. Se obliga a utilizar dicha información únicamente para fines autorizados relacionados con sus funciones y a conservar su confidencialidad.\n\n## 1. INFORMACIÓN CONFIDENCIAL\n\nPodrá considerarse información confidencial, cuando no sea pública y su naturaleza justifique su reserva: bases de datos y datos de clientes; información de cobranza, marketing, telesales y operaciones; carteras, métricas, indicadores, estrategias, guiones, procedimientos, manuales y reportes; accesos, usuarios, contraseñas y configuraciones; información financiera o comercial; información de personal y Recursos Humanos; expedientes, incidencias, compensaciones y datos personales; información de proveedores; planes, proyectos, métodos de trabajo y demás información interna conocida por razón de las funciones.\n\n## 2. OBLIGACIONES DE CONFIDENCIALIDAD\n\nLa persona se obliga a no divulgar, compartir, publicar, reenviar, copiar, extraer o utilizar información confidencial para fines no autorizados; no proporcionar accesos o credenciales a terceros no autorizados; adoptar medidas razonables para evitar pérdida, filtración o acceso indebido; reportar de inmediato cualquier incidente de seguridad o divulgación; y, al terminar su relación con la empresa, devolver o poner a disposición de ésta la información y materiales de trabajo correspondientes, sin conservar copias no autorizadas.\n\n## 3. TRABAJO REMOTO Y DISPOSITIVOS\n\nLa obligación de confidencialidad se mantiene cuando las funciones se realicen desde casa, coworking u otros lugares autorizados, así como cuando se utilicen dispositivos propios o proporcionados para el trabajo. Deberá evitarse el acceso visual, físico o digital de terceros no autorizados y utilizarse los canales, cuentas y sistemas autorizados por la empresa.\n\n## 4. DATOS PERSONALES\n\nLos datos personales de clientes, candidatos, trabajadores u otras personas deberán tratarse únicamente conforme a las funciones autorizadas y las instrucciones aplicables, evitando su consulta, uso, transferencia o divulgación para fines ajenos al trabajo.\n\n## 5. EXCLUSIONES\n\nNo se considerará confidencial la información que sea legítimamente pública; que la persona pueda acreditar que conocía lícitamente sin obligación de reserva; que obtenga legítimamente de un tercero sin deber de confidencialidad; o cuya revelación sea exigida por ley o autoridad competente. Cuando legalmente sea posible, deberá informarse previamente a la empresa sobre este último supuesto.\n\n## 6. VIGENCIA\n\nLa obligación se mantendrá durante la relación con la empresa y continuará, después de su terminación, respecto de la información que legalmente conserve carácter confidencial. Este acuerdo no pretende impedir el ejercicio de derechos laborales ni restringir comunicaciones, quejas o denuncias protegidas por la ley.\n\n## 7. INCUMPLIMIENTO, MEDIDAS Y CONSECUENCIAS\n\nCualquier posible incumplimiento será investigado y valorado individualmente, atendiendo a la naturaleza y grado de confidencialidad de la información involucrada, la conducta realizada, su intencionalidad o negligencia, el alcance de la divulgación o acceso no autorizado, la reincidencia, el daño o riesgo generado, las pruebas disponibles y la legislación aplicable. La firma de este acuerdo no produce por sí sola una sanción automática ni la terminación automática de la relación de trabajo.\n\n### 7.1 Incumplimientos de menor gravedad\n\nCuando la conducta represente un incumplimiento a las medidas de protección de información, pero no exista evidencia de divulgación intencional, apropiación, aprovechamiento indebido o afectación grave, podrán adoptarse, según corresponda y conforme al Reglamento Interior de Trabajo y demás disposiciones aplicables:\n\na) Amonestación verbal documentada;\nb) Amonestación escrita;\nc) Levantamiento de acta administrativa;\nd) Capacitación o reentrenamiento obligatorio en materia de confidencialidad, protección de datos o seguridad de la información; y\ne) Las medidas disciplinarias válidamente previstas en el Reglamento Interior de Trabajo.\n\nLa aplicación de estas medidas no será automática y deberá respetar el derecho de la persona trabajadora a manifestar lo que a su interés corresponda.\n\n### 7.2 Incumplimientos graves\n\nPodrán considerarse de especial gravedad, sujeto a la acreditación de los hechos y al análisis jurídico del caso concreto, entre otras conductas:\n\na) Compartir deliberadamente bases de datos, carteras de clientes, información de cobranza, marketing, telesales u operaciones con personas no autorizadas;\nb) Entregar, publicar, vender, transferir o utilizar información confidencial para beneficio propio o de terceros;\nc) Compartir usuarios, contraseñas, accesos o credenciales que permitan a terceros ingresar a sistemas de la empresa;\nd) Extraer, descargar, copiar o conservar deliberadamente información confidencial fuera de los medios autorizados, especialmente después de terminar la relación con la empresa;\ne) Revelar secretos técnicos, comerciales, de fabricación o asuntos de carácter reservado cuando la conducta actualice los supuestos previstos por la legislación laboral aplicable;\nf) Alterar, eliminar, ocultar o destruir evidencia relacionada con un incidente de confidencialidad;\ng) Utilizar datos personales de clientes, candidatos, trabajadores o terceros para fines distintos de los autorizados; y\nh) Reincidir en conductas previamente documentadas relacionadas con el manejo indebido de información.\n\nCuando los hechos acreditados actualicen una causa legal de rescisión, la empresa podrá proceder a la rescisión de la relación de trabajo sin responsabilidad para el patrón, particularmente cuando resulte aplicable el artículo 47, fracción IX, de la Ley Federal del Trabajo. La procedencia deberá analizarse caso por caso y documentarse conforme a la ley.\n\nAntes de ejecutar una baja por esta causa, Recursos Humanos deberá preservar las evidencias disponibles, identificar la conducta y la disposición presuntamente infringida, recabar la manifestación de la persona involucrada cuando corresponda y verificar que los hechos acreditados actualicen una causa legal.\n\n### 7.3 Responsabilidades adicionales\n\nCuando la conducta pudiera constituir una infracción administrativa, responsabilidad civil, delito, vulneración de datos personales, apropiación indebida de secretos industriales u otra conducta jurídicamente sancionable, la empresa podrá ejercer las acciones que legalmente correspondan ante las autoridades competentes. Estas acciones serán independientes de las consecuencias laborales que, en su caso, procedan.\n\n### 7.4 Prohibición de sanciones económicas automáticas\n\nLa firma del presente Acuerdo no autoriza a la empresa a imponer multas económicas, retener salarios, descontar unilateralmente cantidades del finiquito o efectuar deducciones no permitidas por la Ley Federal del Trabajo. La existencia de daños o perjuicios deberá acreditarse y, cuando corresponda, reclamarse mediante los procedimientos legalmente aplicables.\n\n### 7.5 Procedimiento interno\n\nAnte un posible incumplimiento, Recursos Humanos deberá, según la naturaleza del caso:\n\n- Recibir, identificar y preservar la evidencia disponible.\n- Identificar la información presuntamente comprometida y las personas o sistemas involucrados.\n- Documentar objetivamente los hechos mediante reporte, acta administrativa u otro medio idóneo.\n- Recabar la manifestación de la persona involucrada cuando corresponda.\n- Evaluar gravedad, intencionalidad o negligencia, reincidencia, daño y riesgo generado.\n- Determinar la medida procedente conforme a la Ley Federal del Trabajo, al Reglamento Interior de Trabajo vigente y demás normativa aplicable.\n- Cuando pudiera existir responsabilidad distinta de la laboral, remitir el caso para valoración jurídica.\n\nNinguna medida disciplinaria o rescisión deberá sustentarse exclusivamente en presunciones; deberá existir documentación y elementos objetivos que permitan acreditar los hechos correspondientes.\n\n## 8. BASE LEGAL Y FINALIDAD\n\nEste acuerdo se apoya, entre otras disposiciones aplicables, en el artículo 134, fracción XIII, de la Ley Federal del Trabajo, relativo al deber de guardar secretos técnicos, comerciales, de fabricación y asuntos administrativos reservados; en el artículo 47, fracción IX, de la misma Ley, respecto de la revelación de secretos o asuntos reservados con perjuicio de la empresa como posible causa de rescisión; y en el artículo 423, fracción X, respecto de las disposiciones disciplinarias y su procedimiento dentro del Reglamento Interior de Trabajo.\n\nAsimismo, se apoya en la Ley Federal de Protección a la Propiedad Industrial, particularmente en las disposiciones relativas a secretos industriales, su confidencialidad y el deber de abstenerse de divulgarlos cuando se tenga acceso a ellos por motivo del trabajo, empleo, cargo o puesto; y en la legislación federal aplicable en materia de protección de datos personales en posesión de particulares.\n\nSu finalidad es delimitar y documentar el deber de reserva, establecer reglas claras para el manejo de información y definir un marco interno para valorar posibles incumplimientos, sin sustituir los procedimientos y requisitos exigidos por la legislación laboral aplicable.\n\n## 9. ACEPTACIÓN\n\nDeclaro haber leído y comprendido el presente acuerdo; conocer las obligaciones de confidencialidad relacionadas con la información a la que tenga acceso por razón de mis funciones; y haber sido informado de las posibles consecuencias laborales y legales derivadas de un incumplimiento, las cuales deberán determinarse conforme a los hechos acreditados y a la legislación aplicable.";

// ── Plantillas (HTML carta) ──
// Los textos fijos de cada formato son "bloques" editables en Plantillas (con campos como {nombre}); la estructura
// (tablas, títulos de sección, firmas) está aquí. Cada documento guarda los bloques vigentes al emitirse (texto congelado).
// Sin versión guardada se usa el texto base de abajo (versión 0). **texto** = negritas; renglón en blanco = párrafo nuevo.
const CIUDAD = 'Ciudad de México';
const TPL_VARS = {
  empresa: 'Nombre de la empresa', ciudad: 'Ciudad de México', nombre: 'Nombre completo', num: 'No. de empleado', puesto: 'Puesto', area: 'Área', grupo: 'Equipo', lider: 'Líder del equipo',
  ingreso: 'Fecha de ingreso', fecha: 'Fecha del documento', fecha_efectiva: 'Fecha efectiva / último día', fecha_hechos: 'Fecha de los hechos', representante: 'Firma por la empresa', monto_letra: 'Monto con letra (convenio)', forma_pago: 'Forma de pago (convenio)',
  fecha_ingreso: 'Fecha de ingreso (contrato)', fecha_fin: 'Fin del periodo a prueba (contrato)', sueldo: 'Sueldo mensual (contrato)', horario: 'Horario (contrato)', supervisor: 'Supervisor asignado',
  salario_diario: 'Salario diario (finiquito)', sdi: 'Salario diario integrado (liquidación)', antiguedad: 'Antigüedad en años (finiquito)', causa: 'Causa de terminación (liquidación)', centro: 'Centro de Conciliación (convenio)'
};
const DOC_BLOCKS = {
  general: [
    { k: 'empresa', label: 'Nombre de la empresa (encabezado y textos)', def: EMPRESA }
  ],
  acta: [
    { k: 'titulo', label: 'Título', def: 'ACTA ADMINISTRATIVA' },
    { k: 'intro', label: 'Párrafo inicial', def: 'En {ciudad}, el {fecha}, el área de Recursos Humanos hace constar los hechos que se describen en el presente documento respecto de la persona trabajadora identificada a continuación, con el propósito de documentarlos objetivamente, recibir su manifestación y conservar los elementos correspondientes en su expediente laboral.' },
    { k: 'fundamento', label: 'IV. Fundamento y alcance', def: 'La presente acta tiene naturaleza documental y no implica por sí misma la imposición automática de una sanción ni la actualización de una causa de rescisión. Conforme al artículo 423, fracción X, de la Ley Federal del Trabajo, las disposiciones disciplinarias y su procedimiento forman parte del Reglamento Interior de Trabajo, y la persona trabajadora tiene derecho a ser oída antes de que se aplique una medida disciplinaria. Cualquier análisis de rescisión se realizará por separado, conforme a los hechos acreditados y al artículo 47 de la Ley Federal del Trabajo.' },
    { k: 'cierre', label: 'V. Cierre', def: 'Leído el presente documento, se deja constancia de la oportunidad otorgada a la persona trabajadora para manifestar lo que a su derecho convenga. La firma acredita recepción y participación en el levantamiento del acta, sin que por sí sola implique conformidad con los hechos asentados. En caso de negativa a firmar, se asentará ante testigos y no equivaldrá por sí misma a aceptación de los hechos.' }
  ],
  advertencia: [
    { k: 'intro', label: 'Párrafo inicial', def: 'En {ciudad}, el {fecha}, por medio de la presente se comunica formalmente a **{nombre}** la situación que se describe a continuación, con el objeto de dejar constancia de su comunicación y establecer las acciones de corrección y seguimiento correspondientes.' },
    { k: 'alcance', label: 'Alcance de la carta', def: 'La presente carta tiene carácter preventivo y documental. No determina por sí misma una causa de rescisión ni sustituye el procedimiento que resulte aplicable conforme a la Ley Federal del Trabajo y al Reglamento Interior de Trabajo.' }
  ],
  renuncia: [
    { k: 'titulo', label: 'Título', def: 'RENUNCIA VOLUNTARIA' },
    { k: 'subtitulo', label: 'Subtítulo', def: 'Manifestación personal de terminación de la relación de trabajo' },
    { k: 'destinatario', label: 'Destinatario', def: '**{ciudad}, a {fecha}**\n\n**A QUIEN CORRESPONDA\n{empresa}\nPRESENTE**' },
    { k: 'cuerpo', label: 'Manifestación', def: 'Por medio de la presente, yo, **{nombre}**, manifiesto de forma libre, personal, expresa y voluntaria, sin presión, coacción, engaño ni violencia, mi decisión de dar por terminada la relación de trabajo que mantengo con {empresa}, por así convenir a mis intereses.\n\nMi último día de trabajo será el **{fecha_efectiva}**, y la terminación surtirá efectos al concluir la jornada de esa fecha.' },
    { k: 'solicitud', label: 'Solicitud de pago', def: 'Solicito que se me entregue el cálculo desglosado y el pago de las cantidades que legal o contractualmente correspondan, incluyendo, en su caso, salarios pendientes, aguinaldo proporcional, vacaciones no disfrutadas o proporcionales, prima vacacional, comisiones u otras prestaciones devengadas y prima de antigüedad cuando resulte aplicable.' },
    { k: 'aclaracion', label: 'Aclaración', def: '**La firma de esta carta acredita únicamente mi decisión de separarme voluntariamente y la fecha en que la comunico. No constituye recibo de pago, convenio de finiquito ni renuncia a salarios, prestaciones o derechos adquiridos.**' },
    { k: 'acuse', label: 'Nota del acuse de RH', def: 'Este acuse acredita la recepción del escrito; no implica por sí mismo que el finiquito haya sido pagado.' }
  ],
  rescision: [
    { k: 'titulo', label: 'Título', def: 'AVISO DE RESCISIÓN DE LA RELACIÓN DE TRABAJO' },
    { k: 'subtitulo', label: 'Subtítulo', def: 'Sin responsabilidad para el patrón · Artículo 47 de la Ley Federal del Trabajo' },
    { k: 'intro', label: 'Párrafo inicial', def: 'En {ciudad}, el {fecha}, por medio del presente se comunica a **{nombre}** la rescisión de la relación de trabajo, sin responsabilidad para la empresa. El presente aviso identifica la causal legal invocada y refiere las conductas y fechas que la empresa documenta como fundamento de la decisión.' },
    { k: 'efectos', label: 'VI. Efectos y entrega del aviso', def: 'La rescisión surte efectos a partir del {fecha_efectiva}. Conforme al artículo 47 de la Ley Federal del Trabajo, este aviso se entrega personalmente a la persona trabajadora o, si se niega a recibirlo, la empresa podrá hacerlo del conocimiento de la autoridad laboral dentro de los cinco días hábiles siguientes. Las cantidades que correspondan por la terminación se determinan y documentan por separado.' }
  ],
  convenio: [
    { k: 'titulo', label: 'Título', def: 'CONVENIO DE TERMINACIÓN DE LA RELACIÓN DE TRABAJO' },
    { k: 'subtitulo', label: 'Subtítulo', def: 'Por mutuo consentimiento · Artículos 33 y 53, fracción I, de la Ley Federal del Trabajo' },
    { k: 'proemio', label: 'Comparecencia', def: 'En {ciudad}, el {fecha}, comparecen por una parte **{empresa}**, representada en este acto por **{representante}** (en adelante "la Empresa"), y por la otra **{nombre}** (en adelante "la Persona Trabajadora"), quienes celebran el presente convenio al tenor de lo siguiente:' },
    { k: 'antecedentes', label: 'Antecedentes (si no se capturan en el documento)', def: 'Las partes han mantenido una relación de trabajo desde la fecha de ingreso señalada y, por así convenir a sus intereses, han decidido darla por terminada de común acuerdo.' },
    { k: 'primera', label: 'Cláusula primera', def: '**PRIMERA.** Las partes convienen en dar por terminada la relación de trabajo por mutuo consentimiento, con fundamento en el artículo 53, fracción I, de la Ley Federal del Trabajo, con efectos a partir del **{fecha_efectiva}**.' },
    { k: 'segunda', label: 'Cláusula segunda (antes del desglose)', def: '**SEGUNDA.** La Empresa pagará a la Persona Trabajadora la cantidad total de **{monto_letra}**, mediante **{forma_pago}**, que comprende los siguientes conceptos:' },
    { k: 'resto', label: 'Cláusulas siguientes (después del desglose)', def: '**TERCERA.** Este convenio contiene una relación circunstanciada de los hechos que lo motivan y de los derechos comprendidos en él, conforme al artículo 33 de la Ley Federal del Trabajo, y no implica renuncia de la Persona Trabajadora a los salarios devengados, indemnizaciones y demás prestaciones que deriven de los servicios prestados.\n\n**CUARTA.** La Persona Trabajadora manifiesta que celebra el presente convenio de manera libre y voluntaria, sin coacción, error ni violencia. Las partes podrán ratificarlo ante el Centro de Conciliación o la autoridad laboral competente para su aprobación.\n\n**QUINTA.** Una vez cubierta la cantidad señalada, la Persona Trabajadora otorgará el recibo correspondiente.' }
  ],
  contrato: [
    { k: 'titulo_15', label: 'Título · 15 días', def: 'CONTRATO INDIVIDUAL DE TRABAJO CON PERIODO A PRUEBA DE 15 DÍAS' },
    { k: 'titulo_30', label: 'Título · 30 días', def: 'CONTRATO INDIVIDUAL DE TRABAJO CON PERIODO A PRUEBA DE 30 DÍAS' },
    { k: 'titulo_indet', label: 'Título · indeterminado', def: 'CONTRATO INDIVIDUAL DE TRABAJO POR TIEMPO INDETERMINADO' },
    { k: 'proemio', label: 'Párrafo inicial', def: 'En {ciudad}, el {fecha}, celebran el presente contrato **{empresa}**, en lo sucesivo "EL PATRÓN", y **{nombre}**, en lo sucesivo "LA PERSONA TRABAJADORA", conforme a las siguientes declaraciones y cláusulas.' },
    { k: 'declaraciones', label: 'Declaraciones', def: '**I.** EL PATRÓN declara ser una sociedad legalmente constituida conforme a las leyes mexicanas, con domicilio en {ciudad}, y que requiere los servicios de LA PERSONA TRABAJADORA para el puesto de {puesto}.\n\n**II.** LA PERSONA TRABAJADORA declara que los datos asentados en este contrato son correctos y que cuenta con capacidad para obligarse.\n\n**III.** Las partes reconocen una relación de trabajo personal, remunerada y subordinada para desempeñar las funciones correspondientes al puesto contratado.' },
    { k: 'duracion_15', label: 'Cláusula primera · 15 días', def: '**PRIMERA. Relación de trabajo.** Las partes acuerdan sujetar la relación de trabajo a un periodo a prueba de quince días, del {fecha_ingreso} al {fecha_fin}, con el único fin de verificar que LA PERSONA TRABAJADORA cumple con los requisitos y conocimientos necesarios para desarrollar el trabajo solicitado. El periodo a prueba no será prorrogado, renovado ni aplicado sucesivamente.' },
    { k: 'duracion_30', label: 'Cláusula primera · 30 días', def: '**PRIMERA. Relación de trabajo.** Las partes acuerdan sujetar la relación de trabajo a un periodo a prueba de treinta días, del {fecha_ingreso} al {fecha_fin}, con el único fin de verificar que LA PERSONA TRABAJADORA cumple con los requisitos y conocimientos necesarios para desarrollar el trabajo solicitado. El periodo a prueba no será prorrogado, renovado ni aplicado sucesivamente.' },
    { k: 'duracion_indet', label: 'Cláusula primera · indeterminado', def: '**PRIMERA. Relación de trabajo.** LA PERSONA TRABAJADORA prestará servicios personales subordinados para EL PATRÓN por tiempo indeterminado, a partir del {fecha_ingreso}.' },
    { k: 'funciones_marketing', label: 'Cláusula segunda · funciones (Marketing)', def: '**SEGUNDA. Puesto y funciones.** El puesto será {puesto}. Sus funciones incluyen contacto y prospección, llamadas y mensajes mediante canales autorizados, generación y seguimiento de registros, actualización de bases, participación en campañas, reportes de actividad y demás funciones compatibles con el puesto.' },
    { k: 'funciones_cobranza', label: 'Cláusula segunda · funciones (Cobranza)', def: '**SEGUNDA. Puesto y funciones.** El puesto será {puesto}. Sus funciones incluyen gestión y seguimiento de cartera, contacto con clientes por canales autorizados, llamadas y mensajes, registro de gestiones, seguimiento de compromisos, actualización de bases, reportes de actividad y demás funciones compatibles con el puesto.' },
    { k: 'funciones_general', label: 'Cláusula segunda · funciones (otras áreas)', def: '**SEGUNDA. Puesto y funciones.** El puesto será {puesto}. Las funciones, actividades y responsabilidades serán las especificadas en el perfil y descripción de puesto vigente, así como las actividades lícitas directamente relacionadas con la naturaleza de dicho puesto.' },
    { k: 'clausulas', label: 'Cláusulas tercera en adelante', def: TXT_CLAUSULAS }
  ],
  reglamento: [
    { k: 'cuerpo', label: 'Texto del reglamento (## para títulos, - para listas)', def: TXT_RIT },
    { k: 'constancia', label: 'Constancia de recepción', def: 'Declaro que recibí y tuve acceso al presente Reglamento Interior de Trabajo de {empresa} para su conocimiento y observancia, sin que esta constancia implique renuncia a derechos laborales irrenunciables.' }
  ],
  confidencialidad: [
    { k: 'cuerpo', label: 'Texto del acuerdo (## para títulos, - para listas)', def: TXT_CONF }
  ],
  finiquito: [
    { k: 'titulo', label: 'Título', def: 'RECIBO DE FINIQUITO' },
    { k: 'intro', label: 'Párrafo inicial', def: 'En {ciudad}, el {fecha}, yo, **{nombre}**, recibo de **{empresa}** la cantidad de **{monto_letra}**, mediante {forma_pago}, por concepto de finiquito con motivo de la terminación de mi relación de trabajo con efectos a partir del **{fecha_efectiva}**, conforme al siguiente desglose:' },
    { k: 'declaracion', label: 'Declaración', def: 'Manifiesto que el cálculo de las cantidades anteriores me fue explicado y entregado por escrito, y que corresponden a las prestaciones devengadas a mi favor hasta la fecha de terminación, que recibo a mi entera satisfacción.\n\nEste recibo acredita el pago de los conceptos desglosados. Conforme al artículo 33 de la Ley Federal del Trabajo, no implica renuncia a derechos que no estén comprendidos en él.' },
    { k: 'no_adeudo', label: 'Carta de no adeudo', def: 'En {ciudad}, el {fecha}, yo, **{nombre}**, manifiesto que con el pago recibido en esta fecha por la cantidad de **{monto_letra}**, {empresa} me cubrió los salarios devengados, las partes proporcionales de aguinaldo, vacaciones y prima vacacional, y las demás prestaciones generadas a mi favor durante la relación de trabajo que concluyó el {fecha_efectiva}, por lo que no tengo adeudo pendiente que reclamar por esos conceptos.\n\nFirmo este documento de manera libre y voluntaria, después de haberlo leído y comprendido.' }
  ],
  liquidacion: [
    { k: 'titulo', label: 'Título', def: 'RECIBO DE LIQUIDACIÓN' },
    { k: 'intro', label: 'Párrafo inicial', def: 'En {ciudad}, el {fecha}, yo, **{nombre}**, recibo de **{empresa}** la cantidad de **{monto_letra}**, mediante {forma_pago}, por concepto de liquidación con motivo de la terminación de mi relación de trabajo con efectos a partir del **{fecha_efectiva}** ({causa}), que comprende la indemnización y las prestaciones devengadas conforme al siguiente desglose:' },
    { k: 'declaracion', label: 'Declaración', def: 'La indemnización se calculó con un salario diario integrado de {sdi} y una antigüedad de {antiguedad}, conforme a los artículos 48, 50, 84 y 89 de la Ley Federal del Trabajo; la prima de antigüedad, conforme a los artículos 162, 485 y 486 de la misma Ley.\n\nManifiesto que el cálculo me fue explicado y entregado por escrito y que recibo las cantidades a mi entera satisfacción. Conforme al artículo 33 de la Ley Federal del Trabajo, este recibo no implica renuncia a derechos que no estén comprendidos en él.' },
    { k: 'no_adeudo', label: 'Carta de no adeudo', def: 'En {ciudad}, el {fecha}, yo, **{nombre}**, manifiesto que con el pago recibido en esta fecha por la cantidad de **{monto_letra}**, {empresa} me cubrió la indemnización, los salarios devengados, las partes proporcionales de aguinaldo, vacaciones y prima vacacional, la prima de antigüedad y las demás prestaciones generadas a mi favor durante la relación de trabajo que concluyó el {fecha_efectiva}, por lo que no tengo adeudo pendiente que reclamar por esos conceptos.\n\nFirmo este documento de manera libre y voluntaria, después de haberlo leído y comprendido.' }
  ],
  ratificacion: [
    { k: 'titulo', label: 'Título', def: 'CONVENIO DE TERMINACIÓN DE LA RELACIÓN DE TRABAJO' },
    { k: 'subtitulo', label: 'Subtítulo', def: 'Para su ratificación ante el Centro de Conciliación · Artículos 33 y 53 de la Ley Federal del Trabajo' },
    { k: 'proemio', label: 'Comparecencia', def: 'En {ciudad}, el {fecha}, comparecen ante el **{centro}** por una parte **{empresa}**, representada en este acto por **{representante}** (en adelante "la Empresa"), y por la otra **{nombre}** (en adelante "la Persona Trabajadora"), quienes celebran el presente convenio al tenor de las siguientes declaraciones y cláusulas:' },
    { k: 'declaraciones', label: 'Declaraciones', def: '**I.** La Persona Trabajadora declara que prestó sus servicios a la Empresa desde el {ingreso} en el puesto de {puesto}, con un salario diario de {salario_diario}, y que la relación de trabajo terminó el {fecha_efectiva}.\n\n**II.** Ambas partes declaran que es su voluntad celebrar el presente convenio, que contiene una relación circunstanciada de los hechos que lo motivan y de los derechos comprendidos en él, conforme al artículo 33 de la Ley Federal del Trabajo.' },
    { k: 'primera', label: 'Cláusula primera', def: '**PRIMERA.** Las partes reconocen la terminación de la relación de trabajo con efectos a partir del **{fecha_efectiva}**.' },
    { k: 'segunda', label: 'Cláusula segunda (antes del desglose)', def: '**SEGUNDA.** La Empresa entrega en este acto a la Persona Trabajadora la cantidad de **{monto_letra}**, mediante {forma_pago}, por los conceptos siguientes:' },
    { k: 'resto', label: 'Cláusulas siguientes (después del desglose)', def: '**TERCERA.** La Persona Trabajadora recibe la cantidad señalada a su entera satisfacción y manifiesta que con ella le quedan cubiertos los conceptos desglosados en la cláusula anterior, cuyo cálculo le fue explicado.\n\n**CUARTA.** Las partes solicitan al Centro de Conciliación que apruebe el presente convenio por no contener renuncia de derechos de la Persona Trabajadora y que, una vez ratificado, le otorgue los efectos legales que correspondan conforme a la Ley Federal del Trabajo.\n\n**QUINTA.** Leído el presente convenio y enteradas las partes de su contenido y alcance, lo firman de conformidad.' }
  ],
  constancia_baja: [
    { k: 'titulo', label: 'Título', def: 'CONSTANCIA ADMINISTRATIVA DE BAJA DE PERSONAL' },
    { k: 'constancia', label: 'Texto de la constancia', def: 'En {ciudad}, a {fecha}, se hace constar que Recursos Humanos registró administrativamente la baja de la persona trabajadora identificada en este documento, con efectos a partir del {fecha_efectiva}.\n\nLa presente constancia tiene exclusivamente fines de control, trazabilidad y cierre administrativo del expediente laboral. No sustituye la renuncia voluntaria, aviso de rescisión, convenio, recibo de finiquito, comprobante de pago o cualquier otro documento que resulte aplicable conforme a la naturaleza de la terminación.' }
  ]
};
const blockDefaults = (tipo) => Object.fromEntries([...DOC_BLOCKS.general, ...(DOC_BLOCKS[tipo] || [])].map((b) => [b.k, b.def]));
// Plantillas vigentes (última versión de cada tipo), para vista previa y el editor
const TPL = { rows: null };
async function loadTemplates(force) {
  if (TPL.rows && !force) return TPL.rows;
  TPL.rows = await db('doc_templates').select('id,tipo,version,bloques,nota,created_by,created_at').order('version', false).get().catch(() => []);
  return TPL.rows;
}
const latestTpl = (tipo) => (TPL.rows || []).find((t) => t.tipo === tipo) || null;
// Daniel: si un formato aún no tiene versión, se guarda su texto base como versión 1 (así todo documento queda con su texto)
async function ensureBaseTemplates() {
  if (!is('developer')) return;
  await loadTemplates(true);
  const faltan = Object.keys(DOC_BLOCKS).filter((t) => !latestTpl(t));
  if (!faltan.length) return;
  for (const t of faltan) {
    const bloques = Object.fromEntries(DOC_BLOCKS[t].map((b) => [b.k, b.def]));
    try { await db('doc_templates').insert([{ tipo: t, bloques, nota: 'Texto base' }]); } catch { /* sin conexión: se intenta la próxima vez */ }
  }
  await loadTemplates(true);
}
// Texto que llevaría un documento nuevo hoy (igual que lo congela la base de datos al emitir)
const currentPlantilla = (tipo) => { const g = latestTpl('general'), t = latestTpl(tipo); return g || t ? { ...(g ? g.bloques : {}), ...(t ? t.bloques : {}) } : null; };
function tplVars(d, B) {
  const s = d.snapshot || {}, x = d.datos || {};
  return { empresa: B.empresa, ciudad: CIUDAD, nombre: s.nombre, num: s.num || 's/n', puesto: s.puesto, area: s.area, grupo: s.grupo, lider: s.lider, ingreso: fechaLarga(s.ingreso),
    fecha: fechaLarga(d.fecha), fecha_efectiva: fechaLarga(x.fecha_efectiva), fecha_hechos: fechaLarga(x.fecha_hechos), representante: x.representante || x.rh_nombre || 'Recursos Humanos',
    monto_letra: x.monto != null ? montoLetras(x.monto) : '________', forma_pago: String(x.forma_pago || '________').toLowerCase(),
    fecha_ingreso: fechaLarga(x.fecha_ingreso || s.ingreso), fecha_fin: fechaLarga(x.fecha_fin), sueldo: x.sueldo != null ? money(x.sueldo) + ' mensuales' : '________', horario: x.horario || 'el asignado por EL PATRÓN', supervisor: s.supervisor || s.lider || '',
    salario_diario: x.salario_diario != null ? money(x.salario_diario) : '________', sdi: x.sdi != null ? money(x.sdi) : '________', antiguedad: x.antiguedad_anios != null ? num(x.antiguedad_anios).toFixed(2) + ' años' : '________',
    causa: x.causa || '________', centro: x.centro || 'Centro de Conciliación competente' };
}
// Texto de bloque → HTML seguro: {campo} se sustituye, **negritas**, renglón en blanco = párrafo
function fillInline(text, vars) {
  return esc(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? esc(vars[k] ?? '') : m)).replace(/\*\*([\s\S]+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
}
// "## " título · "### " subtítulo · renglones con "- " = lista
const paras = (text, vars) => String(text || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).map((p) => {
  if (/^### /.test(p)) return `<h3 style="font-size:10pt;margin:10px 0 4px">${fillInline(p.slice(4), vars)}</h3>`;
  if (/^## /.test(p)) return h2(fillInline(p.slice(3), vars));
  if (/^# /.test(p)) return `<h2 style="font-size:12pt;text-align:center;margin:14px 0 8px">${fillInline(p.slice(2), vars)}</h2>`;
  const ls = p.split('\n');
  if (ls.every((l) => /^- /.test(l.trim()))) return `<ul style="margin:4px 0 8px 18px;padding:0">${ls.map((l) => `<li>${fillInline(l.trim().slice(2), vars)}</li>`).join('')}</ul>`;
  return `<p>${fillInline(p, vars)}</p>`;
}).join('');

const P_TD = 'border:1px solid #bbb;padding:6px 8px;vertical-align:top';
const nl = (s) => esc(s || '').replace(/\n/g, '<br>');
const lines = (n) => Array.from({ length: n }, () => '<div style="border-bottom:1px solid #999;height:24px"></div>').join('');
function docHead(d, B, title, sub) {
  return `<div style="border-bottom:3px solid #172033;padding-bottom:10px;margin-bottom:16px;display:flex;justify-content:space-between;gap:20px">
    <div><div style="font-size:15pt;font-weight:700">${esc(B.empresa)}</div><div style="font-size:9pt;color:#555">Recursos Humanos · ${esc(CIUDAD)}</div></div>
    <div style="text-align:right;font-size:9pt;white-space:nowrap"><b>Folio:</b> ${esc(docFolio(d))}<br><b>Fecha:</b> ${fmtDate(d.fecha)}</div></div>
    <h1 style="text-align:center;font-size:14.5pt;letter-spacing:.4px;margin:14px 0 ${sub ? 4 : 18}px">${esc(title)}</h1>${sub ? `<p style="text-align:center;margin:0 0 16px;font-size:10pt"><b>${esc(sub)}</b></p>` : ''}`;
}
function empTable(s, extra = []) {
  const rows = [['Nombre', s.nombre, 'No. empleado', s.num || '—'], ['Puesto', s.puesto || '—', 'Área', s.area || '—'], ...extra];
  return `<table style="width:100%;border-collapse:collapse;margin:10px 0 16px;font-size:10pt">${rows.map((r) => `<tr>${r.map((c, i) => `<td style="${P_TD}${i % 2 ? '' : ';width:19%'}"${r.length === 2 && i === 1 ? ' colspan="3"' : ''}>${i % 2 ? esc(c) : `<b>${esc(c)}</b>`}</td>`).join('')}</tr>`).join('')}</table>`;
}
const h2 = (t) => `<h2 style="font-size:10.5pt;text-transform:uppercase;border-bottom:1px solid #777;padding-bottom:3px;margin:16px 0 6px">${t}</h2>`;
const firmas = (a, b) => `<div style="display:grid;grid-template-columns:1fr 1fr;gap:50px;margin-top:56px;text-align:center;page-break-inside:avoid">${[a, b].map(([n, r]) => `<div style="border-top:1px solid #222;padding-top:6px">${esc(n)}<br><span style="font-size:8.5pt">${esc(r)}</span></div>`).join('')}</div>`;
const pie = (d) => `<div style="margin-top:34px;border-top:1px solid #bbb;padding-top:6px;font-size:8pt;color:#555">Documento generado por Enterprise HR · ${esc(DOC_TIPOS[d.tipo].label)} · Folio ${esc(docFolio(d))} · Plantilla v${d.plantilla_version || 0}</div>`;

function docHtml(d, extra = {}) {
  const s = d.snapshot || {}, x = d.datos || {};
  const B = { ...blockDefaults(d.tipo), ...(d.plantilla || {}) };
  const V = tplVars(d, B);
  const P = (k) => paras(B[k], V);
  let b = '';
  if (d.tipo === 'acta') {
    b = docHead(d, B, B.titulo) + P('intro') +
      empTable(s, [['Equipo', s.grupo || '—', 'Líder', s.lider || '—']]) +
      h2('I. Motivo y fecha de los hechos') + `<p><b>Motivo:</b> ${esc(x.motivo)}<br><b>Fecha de los hechos:</b> ${fechaLarga(x.fecha_hechos)}</p>${x.motivo_texto ? `<p>${nl(x.motivo_texto)}</p>` : ''}` +
      h2('II. Relación circunstanciada de hechos') + `<p>${nl(x.hechos)}</p><p><b>Evidencia o referencia:</b> ${nl(x.evidencia || 'No especificada.')}</p>` +
      h2('III. Manifestación de la persona trabajadora') + (x.manifestacion ? `<p>${nl(x.manifestacion)}</p>` : lines(5)) +
      h2('IV. Fundamento y alcance') + P('fundamento') + h2('V. Cierre y firmas') + P('cierre') +
      firmas([s.nombre, 'Persona trabajadora'], [s.lider || 'Líder de equipo', 'Entrega · Líder de equipo']) + firmas(['Testigo', 'Nombre y firma'], ['Testigo', 'Nombre y firma']) + pie(d);
  } else if (d.tipo === 'advertencia') {
    const [title, base] = WARNING_FORMATS[x.motivo] || WARNING_FORMATS['Otro / Personalizado'];
    const t = x.motivo === 'Otro / Personalizado' && x.motivo_otro ? 'CARTA DE ADVERTENCIA — ' + x.motivo_otro.toUpperCase() : title;
    b = docHead(d, B, t) + empTable(s, [['Motivo', x.motivo === 'Otro / Personalizado' ? x.motivo_otro || x.motivo : x.motivo, 'Fecha del hecho', fmtDate(x.fecha_hechos)], ['Periodo evaluado', x.periodo_inicio && x.periodo_fin ? `Del ${fmtDate(x.periodo_inicio)} al ${fmtDate(x.periodo_fin)}` : 'No aplica / hecho puntual']]) +
      P('intro') + `<p>${esc(base)}</p>` +
      h2('Hechos concretos / situación observada') + `<p>${nl(x.hechos)}</p>` +
      h2('Evidencia y antecedentes') + `<p>${nl(x.evidencia || 'No especificada.')}</p>` +
      h2('Acción correctiva y seguimiento') + `<p><b>Acción esperada:</b> ${nl(x.accion || 'Corregir la situación comunicada y mantener el cumplimiento de las obligaciones y funciones aplicables.')}</p><p><b>Seguimiento:</b> ${nl(x.seguimiento || 'Se dará seguimiento conforme a la naturaleza de la situación y a los registros disponibles.')}</p>` +
      P('alcance') + h2('Observaciones o manifestación de la persona trabajadora') + lines(3) +
      firmas([s.nombre, 'Firma de recibido'], [x.rh_nombre || 'Representante de la empresa', 'Por la empresa']) + pie(d);
  } else if (d.tipo === 'renuncia') {
    b = docHead(d, B, B.titulo, B.subtitulo) + empTable(s, [['Fecha de ingreso', fmtDate(s.ingreso), 'Fecha de entrega', fmtDate(x.fecha_entrega)]]) +
      P('destinatario') + P('cuerpo') + P('solicitud') + P('aclaracion') +
      `<div style="width:55%;margin:56px auto 0;border-top:1px solid #222;padding-top:6px;text-align:center;page-break-inside:avoid">${esc(s.nombre)}<br><span style="font-size:8.5pt">Firma de la persona trabajadora</span></div>` +
      h2('Acuse de recibido por Recursos Humanos') + `<p>Nombre: <b>${esc(x.rh_nombre || '________________')}</b> &nbsp; Firma: ____________________ &nbsp; Fecha y hora: ____________________</p><div style="font-size:9pt;color:#444">${P('acuse')}</div>` + pie(d);
  } else if (d.tipo === 'rescision') {
    const ants = extra.antecedentes || [];
    b = docHead(d, B, B.titulo, B.subtitulo) + empTable(s, [['Fecha de ingreso', fmtDate(s.ingreso), 'Fecha efectiva', fmtDate(x.fecha_efectiva)]]) + P('intro') +
      h2('I. Causal legal invocada') + `<p><b>Artículo 47, ${esc(x.causal)}</b></p><p>${esc(RESCISSION_CAUSES[x.causal] || '')}</p>` +
      h2('II. Conducta o conductas que motivan la rescisión') + `<p>${nl(x.hechos)}</p>` +
      h2('III. Fecha o fechas de los hechos') + `<p>${nl(x.fechas_hechos)}</p>` +
      h2('IV. Elementos y evidencia') + `<p>${nl(x.evidencia)}</p>` +
      h2('V. Antecedentes documentales') + (ants.length || x.antecedentes_texto ? `${ants.length ? `<ul style="margin:4px 0 8px 18px;padding:0">${ants.map((a) => `<li>${esc(DOC_TIPOS[a.tipo].label)} ${esc(docFolio(a))} del ${fmtDate(a.fecha)}${a.datos && a.datos.motivo ? ' — ' + esc(a.datos.motivo) : ''}</li>`).join('')}</ul>` : ''}${x.antecedentes_texto ? `<p>${nl(x.antecedentes_texto)}</p>` : ''}` : '<p>Sin antecedentes documentales relacionados.</p>') +
      h2('VI. Efectos y entrega del aviso') + P('efectos') +
      firmas([x.rh_nombre || 'Recursos Humanos', 'Por ' + B.empresa], [s.nombre, 'Acuse de recepción · persona trabajadora']) + firmas(['Testigo', 'Nombre y firma'], ['Testigo', 'Nombre y firma']) + pie(d);
  } else if (d.tipo === 'convenio') {
    const conceptos = String(x.conceptos || '').split('\n').map((l) => l.trim()).filter(Boolean);
    b = docHead(d, B, B.titulo, B.subtitulo) + P('proemio') +
      empTable(s, [['Fecha de ingreso', fmtDate(s.ingreso), 'Fecha de terminación', fmtDate(x.fecha_efectiva)]]) +
      h2('Antecedentes') + (x.antecedentes ? `<p>${nl(x.antecedentes)}</p>` : P('antecedentes')) +
      h2('Cláusulas') + P('primera') + P('segunda') +
      (conceptos.length ? `<table style="width:100%;border-collapse:collapse;margin:6px 0 10px;font-size:10pt">${conceptos.map((c) => { const m = c.match(/^(.*?)[:\t]\s*(.+)$/); return `<tr><td style="${P_TD}">${esc(m ? m[1] : c)}</td><td style="${P_TD};text-align:right;width:30%">${esc(m ? m[2] : '')}</td></tr>`; }).join('')}<tr><td style="${P_TD}"><b>Total</b></td><td style="${P_TD};text-align:right"><b>${money(x.monto)}</b></td></tr></table>` : '') +
      P('resto') +
      firmas([x.representante || 'Representante', 'Por ' + B.empresa], [s.nombre, 'Persona trabajadora']) + firmas(['Testigo', 'Nombre y firma'], ['Testigo', 'Nombre y firma']) + pie(d);
  } else if (d.tipo === 'contrato') {
    const k = { '15_dias': '15', '30_dias': '30' }[x.contrato_tipo] || 'indet';
    const fun = /market/i.test(s.area || '') ? 'funciones_marketing' : /cobran/i.test(s.area || '') ? 'funciones_cobranza' : 'funciones_general';
    b = docHead(d, B, B['titulo_' + k]) +
      empTable(s, [['CURP / RFC', [s.curp, s.rfc].filter(Boolean).join(' / ') || '—', 'Fecha de ingreso', fmtDate(x.fecha_ingreso || s.ingreso)],
        ['Sueldo mensual', x.sueldo != null ? money(x.sueldo) : '—', 'Horario', x.horario || '—'],
        ['Tipo de contrato', CONTRATOS[x.contrato_tipo] || '—', x.fecha_fin ? 'Fin del periodo a prueba' : 'Supervisor', x.fecha_fin ? fmtDate(x.fecha_fin) : (s.supervisor || '—')]]) +
      P('proemio') + h2('Declaraciones') + P('declaraciones') + h2('Cláusulas') + P('duracion_' + k) + P(fun) + P('clausulas') +
      firmas([x.representante || 'Representante de la empresa', 'EL PATRÓN · ' + B.empresa], [s.nombre, 'LA PERSONA TRABAJADORA']) + firmas(['Testigo', 'Nombre y firma'], ['Testigo', 'Nombre y firma']) + pie(d);
  } else if (d.tipo === 'reglamento') {
    b = docHead(d, B, 'REGLAMENTO INTERIOR DE TRABAJO') + P('cuerpo') +
      `<div style="page-break-before:always"></div>` + h2('Constancia de recepción y conocimiento') + empTable(s, [['Fecha', fechaLarga(d.fecha)]]) + P('constancia') +
      `<div style="width:55%;margin:56px auto 0;border-top:1px solid #222;padding-top:6px;text-align:center;page-break-inside:avoid">${esc(s.nombre)}<br><span style="font-size:8.5pt">Nombre y firma de la persona trabajadora</span></div>` + pie(d);
  } else if (d.tipo === 'confidencialidad') {
    b = docHead(d, B, 'ACUERDO DE CONFIDENCIALIDAD') + empTable(s, [['Fecha', fechaLarga(d.fecha)]]) + P('cuerpo') +
      firmas([s.nombre, 'Nombre y firma de la persona trabajadora'], [x.representante || 'Recursos Humanos', 'Por ' + B.empresa]) + pie(d);
  } else if (d.tipo === 'finiquito' || d.tipo === 'liquidacion') {
    b = docHead(d, B, B.titulo) + empTable(s, [['Fecha de ingreso', fmtDate(s.ingreso), 'Fecha de terminación', fmtDate(x.fecha_efectiva)], ['Salario diario', money(x.salario_diario), x.sdi ? 'Salario diario integrado' : 'Antigüedad', x.sdi ? money(x.sdi) : num(x.antiguedad_anios).toFixed(2) + ' años']]) +
      P('intro') + finConceptosTabla(x) + P('declaracion') + huella(s.nombre) +
      firmas([x.representante || 'Representante de la empresa', 'Entrega por ' + B.empresa], ['Testigo', 'Nombre y firma']) +
      (x.no_adeudo ? `<div style="page-break-before:always"></div>` + docHead(d, B, 'CARTA DE NO ADEUDO') + empTable(s, [['Fecha de terminación', fmtDate(x.fecha_efectiva), 'Monto recibido', money(x.monto)]]) + P('no_adeudo') + huella(s.nombre) : '') + pie(d);
  } else if (d.tipo === 'ratificacion') {
    b = docHead(d, B, B.titulo, B.subtitulo) + P('proemio') + empTable(s, [['Fecha de ingreso', fmtDate(s.ingreso), 'Fecha de terminación', fmtDate(x.fecha_efectiva)]]) +
      h2('Declaraciones') + P('declaraciones') + h2('Cláusulas') + P('primera') + P('segunda') + finConceptosTabla(x) + P('resto') +
      firmas([x.representante || 'Representante', 'Por ' + B.empresa], [s.nombre, 'Persona trabajadora']) + pie(d);
  } else if (d.tipo === 'constancia_baja') {
    const o = extra.origen;
    b = docHead(d, B, B.titulo) + empTable(s, [['Fecha de ingreso', fmtDate(s.ingreso), 'Equipo', s.grupo || '—']]) +
      h2('Datos de la baja') + `<table style="width:100%;border-collapse:collapse;font-size:10pt"><tr><td style="${P_TD};width:19%"><b>Último día laborado</b></td><td style="${P_TD}">${fmtDate(x.ultimo_dia)}</td><td style="${P_TD};width:19%"><b>Fecha efectiva</b></td><td style="${P_TD}">${fmtDate(x.fecha_efectiva)}</td></tr><tr><td style="${P_TD}"><b>Tipo de salida</b></td><td style="${P_TD}" colspan="3">${esc(x.tipo_salida)}</td></tr></table>` +
      h2('Documento de origen') + `<p>${o ? `${esc(DOC_TIPOS[o.tipo].label)} · ${esc(docFolio(o))} · ${fmtDate(o.fecha)}` : 'No vinculado.'}</p>` +
      h2('Constancia') + P('constancia') +
      `<p><b>Observaciones:</b><br>${nl(x.observaciones || 'Sin observaciones adicionales.')}</p>` +
      `<div style="width:55%;margin:56px auto 0;border-top:1px solid #222;padding-top:6px;text-align:center">${esc(x.rh_nombre || 'Recursos Humanos')}<br><span style="font-size:8.5pt">Recursos Humanos</span></div>` + pie(d);
  }
  return `<article class="docpaper" style="font-family:Arial,Helvetica,sans-serif;color:#111;font-size:10.5pt;line-height:1.45">${d.estado === 'anulado' ? '<div style="border:2px solid #b42318;color:#b42318;font-weight:700;text-align:center;padding:6px;margin-bottom:10px">DOCUMENTO ANULADO</div>' : ''}${b}</article>`;
}

// Datos que necesita la plantilla además del documento (antecedentes / documento de origen)
async function docExtra(d) {
  const x = d.datos || {}, out = {};
  if (d.tipo === 'rescision' && (x.antecedentes_ids || []).length) out.antecedentes = await db('documents').select('id,tipo,folio,fecha,datos').in('id', x.antecedentes_ids).order('fecha').get().catch(() => []);
  if (d.tipo === 'constancia_baja' && d.origen_id) out.origen = (await db('documents').select('id,tipo,folio,fecha').eq('id', d.origen_id).get().catch(() => []))[0];
  return out;
}

// Imprimir / guardar como PDF (tamaño carta/A4 desde el diálogo del navegador)
function printDoc(d, extra) {
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(docFolio(d) + ' ' + DOC_TIPOS[d.tipo].label + ' ' + (d.snapshot || {}).nombre)}</title>
    <style>@page{size:letter;margin:16mm 17mm}body{margin:0}h1,h2{page-break-after:avoid}p{orphans:3;widows:3}</style></head><body>${docHtml(d, extra)}</body></html>`;
  const w = window.open('', '_blank');
  if (w) { w.document.open(); w.document.write(html); w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch { /* el usuario imprime desde el menú */ } }, 350); return; }
  // Si el navegador bloquea la ventana: imprimir desde un marco oculto
  const f = document.createElement('iframe'); f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0'; document.body.appendChild(f);
  f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
  setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 350);
}

// ── Vista ──
const DS = { tab: null, q: '', tipo: '' };
const docPending = (d) => is('developer') ? d.estado === 'emitido' : is('tl', 'supervisor') ? d.estado === 'con_lider' : false;
async function viewDocumentos() {
  if (S.view === 'expediente' && EXP.id) return viewExpediente(EXP.id);
  const v = $('#view');
  const [docs, emps] = await Promise.all([
    db('documents').select('id,folio,tipo,employee_id,area_id,group_id,case_id,fecha,estado,snapshot,enviado_at,entregado_at,baja_aplicada').order('created_at', false).getAll(),
    db('employees').select('id,nombre,apellido_paterno,apellido_materno,num_empleado,puesto,area_id,group_id,status,fecha_ingreso').get()
  ]);
  const pend = docs.filter(docPending);
  if (!DS.tab) DS.tab = pend.length ? 'pend' : 'all';
  const q = norm(DS.q);
  const rows = (DS.tab === 'pend' ? pend : docs).filter((d) => (!DS.tipo || d.tipo === DS.tipo) && (!q || norm(`${d.snapshot.nombre} ${docFolio(d)} ${d.snapshot.num}`).includes(q)));
  const pendLabel = is('developer') ? 'Por firmar' : 'Por entregar';
  v.innerHTML = `<div class="pagehead"><div><h1>Documentos</h1><div class="muted small">${is('developer') ? `${pend.length} emitidos sin firma · ${docs.filter((d) => d.estado === 'con_lider').length} con el líder` : is('tl', 'supervisor') ? `${pend.length} por entregar` : `${docs.length} documentos`}</div></div>
      <div class="row" style="gap:8px">${is('developer') ? '<button class="btn" id="zipall" title="ZIP con todos los documentos, copias firmadas e índice">Respaldo ZIP</button><button class="btn primary" id="newdoc">+ Nuevo documento</button>' : is('nomina', 'rh_general', 'rh_area') ? '<button class="btn primary" id="newdoc">+ Finiquito / liquidación</button>' : ''}</div></div>
    <div class="card pad" style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">
      ${is('developer', 'tl', 'supervisor') ? `<div class="seg" role="group" aria-label="Filtro"><button type="button" data-dt="pend" class="${DS.tab === 'pend' ? 'on' : ''}">${pendLabel} (${pend.length})</button><button type="button" data-dt="all" class="${DS.tab === 'all' ? 'on' : ''}">Todos</button></div>` : ''}
      <div class="row" style="gap:8px"><input class="inp grow" id="dq" type="search" placeholder="Buscar por nombre, número o folio" value="${esc(DS.q)}" aria-label="Buscar documentos">
      <select class="inp" id="dtipo" aria-label="Tipo" style="max-width:220px"><option value="">Todos los tipos</option>${Object.entries(DOC_TIPOS).map(([k, t]) => `<option value="${k}"${DS.tipo === k ? ' selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div>
    </div>
    ${is('tl', 'supervisor') && DS.tab === 'pend' && pend.length ? '<div class="notice n-info" style="margin-bottom:10px">Imprime el documento, entrégalo a la persona y sube la foto o PDF de la hoja firmada. Si se niega a firmar, regístralo con los nombres de quienes estuvieron presentes.</div>' : ''}
    <div class="list">${rows.length ? rows.map((d) => `<button type="button" class="item" data-doc="${d.id}">
      <span class="mono small muted" style="width:72px">${esc(docFolio(d))}</span>
      <span class="grow"><span class="nm">${esc(d.snapshot.nombre || '—')}</span> <span class="badge ${docTipoBadge(DOC_TIPOS[d.tipo])}">${esc(DOC_TIPOS[d.tipo].label)}</span><br><span class="small muted">${fmtDate(d.fecha)} · ${esc(areaName(d.area_id))}${d.group_id ? ' · ' + esc(groupName(d.group_id)) : ''}${d.baja_aplicada ? ' · baja aplicada' : ''}</span></span>
      ${docBadge(d.estado)}</button>`).join('') : `<div class="card empty">${DS.tab === 'pend' ? 'Nada pendiente.' : 'Sin documentos.'}</div>`}</div>`;
  $$('[data-dt]').forEach((b) => b.onclick = () => { DS.tab = b.dataset.dt; viewDocumentos(); });
  $('#dtipo').onchange = (e) => { DS.tipo = e.target.value; viewDocumentos(); };
  $('#dq').oninput = (e) => { DS.q = e.target.value; clearTimeout(viewDocumentos._t); viewDocumentos._t = setTimeout(() => viewDocumentos().then(() => { const i = $('#dq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }), 300); };
  $$('[data-doc]').forEach((b) => b.onclick = () => openDocument(b.dataset.doc));
  const nb = $('#newdoc'); if (nb) nb.onclick = () => newDocPicker({ emps });
  const zb = $('#zipall'); if (zb) zb.onclick = async () => { zb.disabled = true; try { await exportDocsZip({ titulo: 'Respaldo documentos' }, zb); } catch (e) { toast(e.message, true); } finally { zb.disabled = false; zb.textContent = 'Respaldo ZIP'; } };
  updateDocBadge(pend.length);
}
function updateDocBadge(n) {
  $$('[data-v="documentos"]').forEach((a) => {
    let b = a.querySelector('.cnt'); if (!b) { b = document.createElement('span'); b.className = 'cnt badge b-bad'; b.style.marginLeft = 'auto'; a.appendChild(b); }
    b.textContent = n; b.style.display = n ? '' : 'none';
  });
  refreshMoreBadge();
}
async function refreshDocBadge() {
  if (!VIEWS.documentos || !VIEWS.documentos.roles.includes(role()) || !is('developer', 'tl', 'supervisor')) return;
  try { const ds = await db('documents').select('id,estado').in('estado', ['emitido', 'con_lider']).get(); updateDocBadge(ds.filter(docPending).length); } catch { /* sin conexión */ }
}

// Paso 1: tipo de documento · Paso 2: trabajador · Paso 3: formato
function newDocPicker({ emps, employee, caseRow, tipo } = {}) {
  if (tipo) return pickEmployee({ tipo, emps, employee, caseRow });
  const groups = {};
  const okFor = (k) => (is('developer') || DOC_FIN.includes(k)) && (!employee || (employee.status === 'alta_pendiente' ? DOC_CONTRATA.includes(k) : employee.status === 'baja' ? k === 'constancia_baja' || DOC_FIN.includes(k) : k !== 'constancia_baja'));
  Object.entries(DOC_TIPOS).filter(([k]) => okFor(k)).forEach(([k, t]) => { (groups[t.grupo] = groups[t.grupo] || []).push([k, t]); });
  const m = modal({ title: employee ? 'Nuevo documento · ' + fullName(employee) : 'Nuevo documento', wide: true,
    body: Object.entries(groups).map(([g, items]) => `<div class="eyebrow" style="margin:4px 0 8px">${esc(g)}</div><div class="doc-tiles">${items.map(([k, t]) => `<button type="button" class="doc-tile" data-nt="${k}"><span class="dt-code">${t.code}</span><b>${esc(t.label)}</b><span class="small muted">${esc(t.desc)}</span></button>`).join('')}</div>`).join('') });
  $$('[data-nt]', m.el).forEach((b) => b.onclick = () => { m.close(); pickEmployee({ tipo: b.dataset.nt, emps, employee, caseRow }); });
}
async function pickEmployee({ tipo, emps, employee, caseRow }) {
  if (DOC_FIN.includes(tipo)) return finPickEmployee(tipo, employee);
  if (employee) return docForm({ tipo, employee, caseRow });
  emps = emps || await db('employees').select('id,nombre,apellido_paterno,apellido_materno,num_empleado,puesto,area_id,group_id,status,fecha_ingreso').get();
  const pool = emps.filter((e) => tipo === 'constancia_baja' ? e.status === 'baja' : DOC_CONTRATA.includes(tipo) ? ['activo', 'alta_pendiente'].includes(e.status) : e.status === 'activo').sort(sortName);
  const m = modal({ title: DOC_TIPOS[tipo].label + ' · ¿para quién?',
    body: `<input class="inp" id="pq" type="search" placeholder="Escribe nombre o número" aria-label="Buscar trabajador"><div class="list pick-list" id="pl" style="margin-top:8px;max-height:52vh;overflow:auto"></div>` });
  const draw = () => {
    const q = norm($('#pq', m.el).value);
    const xs = pool.filter((e) => !q || norm(fullName(e) + ' ' + (e.num_empleado || '')).includes(q)).slice(0, 60);
    $('#pl', m.el).innerHTML = xs.length ? xs.map((e) => `<button type="button" class="item" data-pe="${e.id}" style="padding:8px 12px"><span class="grow"><span class="nm">${esc(fullName(e))}</span><br><span class="small muted">${esc(e.num_empleado || 's/n')} · ${esc(areaName(e.area_id))} · ${esc(groupName(e.group_id))}</span></span></button>`).join('') : `<div class="empty small muted">${tipo === 'constancia_baja' ? 'Sin personas dadas de baja con ese nombre.' : 'Sin coincidencias.'}</div>`;
    $$('[data-pe]', m.el).forEach((b) => b.onclick = () => { m.close(); docForm({ tipo, employee: pool.find((e) => e.id === b.dataset.pe), caseRow }); });
  };
  $('#pq', m.el).oninput = draw; draw();
}

// Formulario del documento (nuevo o edición mientras no esté firmado)
async function docForm({ tipo, employee, caseRow, existing }) {
  if (DOC_FIN.includes(tipo)) return finDocForm({ tipo, employee, existing });
  const e = employee;
  let d0 = existing ? { ...existing.datos } : {};
  if (!existing && caseRow) {   // sugerencias desde el caso
    d0 = { fecha_hechos: caseRow.fecha_hechos, hechos: caseRow.hechos, evidencia: caseRow.evidencia, fechas_hechos: fmtDate(caseRow.fecha_hechos) + (caseRow.fecha_fin ? ' al ' + fmtDate(caseRow.fecha_fin) : '') };
  }
  const fields = docFields(tipo, d0);
  await loadTemplates(true);
  // Antecedentes del mismo trabajador (rescisión) y documento de origen (constancia)
  let prev = [];
  if (tipo === 'rescision' || tipo === 'constancia_baja') {
    prev = await db('documents').select('id,tipo,folio,fecha,estado,datos').eq('employee_id', e.id).neq('estado', 'anulado').order('fecha').get().catch(() => []);
  }
  const ants = prev.filter((p) => DOC_LIDER.includes(p.tipo));
  const origins = prev.filter((p) => DOC_BAJA.includes(p.tipo));
  const sel = new Set(existing ? (existing.datos.antecedentes_ids || []) : ants.map((a) => a.id));
  const extraHtml = tipo === 'rescision'
    ? `<div class="fbox" style="margin-top:12px"><header>Actas y cartas registradas en la app (${ants.length})</header><div class="fbody">${ants.length ? ants.map((a) => `<label class="chk"><input type="checkbox" data-ant="${a.id}"${sel.has(a.id) ? ' checked' : ''}> ${esc(DOC_TIPOS[a.tipo].label)} ${esc(docFolio(a))} · ${fmtDate(a.fecha)}${a.datos.motivo ? ' · ' + esc(a.datos.motivo) : ''} <span class="small muted">(${DOC_ST[a.estado][0]})</span></label>`).join('') : '<span class="small muted">No hay actas ni cartas de esta persona.</span>'}</div></div>`
    : tipo === 'constancia_baja'
      ? `<label class="field" style="margin-top:12px">Documento que origina la baja<select id="f_origen"><option value="">Sin documento en la app</option>${origins.map((o) => `<option value="${o.id}"${(existing ? existing.origen_id : origins[origins.length - 1] && origins[origins.length - 1].id) === o.id ? ' selected' : ''}>${esc(DOC_TIPOS[o.tipo].label)} ${esc(docFolio(o))} · ${fmtDate(o.fecha)} (${DOC_ST[o.estado][0]})</option>`).join('')}</select></label>`
      : '';
  const fechaF = { k: '_fecha', label: 'Fecha del documento', type: 'date', req: true, val: existing ? existing.fecha : todayMX() };
  const intro = `<div class="notice n-info"><b>${esc(fullName(e))}</b> · ${esc(e.num_empleado || 's/n')} · ${esc(e.puesto || 'sin puesto')} · ${esc(areaName(e.area_id))} · ${esc(groupName(e.group_id))}${caseRow ? `<br>Desde el caso #${caseRow.folio}` : ''}</div>`;
  const m = modal({ title: (existing ? 'Editar · ' : '') + DOC_TIPOS[tipo].label, wide: true,
    body: intro + fieldsHtml([fechaF]) + fieldsHtml(fields) + extraHtml,
    actions: [{ label: 'Cancelar' }, { label: 'Vista previa', run: async ({ el }) => { const doc = build(el); printDoc(doc, await docExtra(doc)); return false; } },
      { label: existing ? 'Guardar cambios' : 'Generar documento', cls: 'primary', run: async ({ el }) => {
        const doc = build(el);
        if (tipo === 'convenio' && !(Number(doc.datos.monto) > 0)) throw new Error('La cantidad total debe ser mayor a 0.');
        if (tipo === 'advertencia' && doc.datos.motivo === 'Otro / Personalizado' && !doc.datos.motivo_otro) throw new Error('Escribe el motivo personalizado.');
        if (doc.datos.periodo_inicio && doc.datos.periodo_fin && doc.datos.periodo_fin < doc.datos.periodo_inicio) throw new Error('El periodo evaluado termina antes de empezar.');
        const row = { fecha: doc.fecha, datos: doc.datos, snapshot: doc.snapshot, origen_id: doc.origen_id || null };
        let id;
        if (existing) { await mustUpdate(db('documents').eq('id', existing.id).update(row), 'el documento'); id = existing.id; }
        else { const [r] = await db('documents').insert([{ ...row, plantilla: blockDefaults(tipo), tipo, employee_id: e.id, case_id: caseRow ? caseRow.id : null }]); id = Array.isArray(r) ? r[0].id : r.id; }
        toast(existing ? 'Documento actualizado' : 'Documento generado');
        if (S.view === 'documentos') viewDocumentos().catch(() => {});
        setTimeout(() => openDocument(id), 0);
      } }] });
  // El motivo del acta llena el texto base
  const mot = $('#f_motivo', m.el), mt = $('#f_motivo_texto', m.el);
  if (tipo === 'acta' && mot && mt) mot.addEventListener('change', () => { if (!mt.value.trim() || Object.values(ACT_REASONS).includes(mt.value.trim())) mt.value = ACT_REASONS[mot.value] || ''; });
  function build(el) {
    const v = readFields(el, [fechaF, ...fields]);
    const datos = Object.fromEntries(Object.entries(v).filter(([k, x]) => k !== '_fecha' && x != null));
    if ('recontratable' in datos) datos.recontratable = datos.recontratable === 'true';
    if (tipo === 'contrato') { const n = { '15_dias': 14, '30_dias': 29 }[datos.contrato_tipo]; if (n) datos.fecha_fin = addDays(datos.fecha_ingreso, n); else delete datos.fecha_fin; }
    if (tipo === 'rescision') datos.antecedentes_ids = $$('[data-ant]', el).filter((c) => c.checked).map((c) => c.dataset.ant);
    if (tipo === 'constancia_baja' && datos.ultimo_dia && datos.fecha_efectiva && datos.fecha_efectiva < datos.ultimo_dia) throw new Error('La fecha efectiva no puede ser antes del último día laborado.');
    if (datos.fecha_efectiva && DOC_BAJA.includes(tipo)) datos.motivo_baja = tipo === 'rescision' ? datos.causal : tipo === 'convenio' ? 'Mutuo consentimiento' : '';
    const origen = tipo === 'constancia_baja' ? ($('#f_origen', el) || {}).value || null : null;
    const tv = latestTpl(tipo);
    return { id: existing && existing.id, folio: existing ? existing.folio : 0, tipo, fecha: v._fecha, estado: existing ? existing.estado : 'emitido', datos, snapshot: existing ? { ...existing.snapshot, ...empSnapshot(e) } : empSnapshot(e), origen_id: origen,
      plantilla: existing ? existing.plantilla : currentPlantilla(tipo), plantilla_version: existing ? existing.plantilla_version : tv && tv.version };
  }
}

// ───── Finiquito, liquidación y convenio para ratificar ─────
// Los montos salen del finiquito de la pre-nómina (o del mismo cálculo al vuelo) y se pueden ajustar antes de emitir.
// Liquidación: indemnización de 90 días y 20 días por año con salario diario integrado (Arts. 48, 50, 84 y 89 LFT)
// y prima de antigüedad siempre (Art. 162, tope de 2 salarios mínimos).
// Calculadora de finiquito / liquidación (como M07 del Sandbox): tipo de terminación → conceptos que marca la LFT,
// casillas para incluir cada concepto, días/base editables, importes en base al salario. Si se marca algo que no
// corresponde (o se quita algo obligatorio) se pide justificación. El PDF es el mismo formato de Documentos.
const TERM_RULES = {
  'Renuncia': { sen: '15y', m3: 'no', d20: 'no', hint: 'Art. 162 fr. III: prima de antigüedad solo con 15 años o más. Sin indemnización.' },
  'Despido justificado (rescisión art. 47)': { sen: 'yes', m3: 'no', d20: 'no', hint: 'Finiquito + prima de antigüedad (Art. 162 fr. III: se paga aunque el despido sea justificado). Sin indemnización.' },
  'Despido injustificado': { sen: 'yes', m3: 'yes', d20: 'opt', hint: 'Finiquito + prima de antigüedad + 3 meses (Art. 48). 20 días por año solo si la empresa se niega a reinstalar (Arts. 49 y 50).' },
  'Rescisión por el trabajador (art. 51)': { sen: 'yes', m3: 'yes', d20: 'yes', hint: 'Art. 52 → Art. 50: 3 meses + 20 días por año + prima de antigüedad.' },
  'Mutuo consentimiento': { sen: '15y', m3: 'opt', d20: 'opt', hint: 'Art. 53 fr. I. Prima obligatoria solo con 15 años o más; cualquier pago adicional es convenido.' },
  'Término de contrato': { sen: 'yes', m3: 'no', d20: 'no', hint: 'Art. 53 fr. III. Finiquito + prima de antigüedad por separación.' },
  'Otro': { sen: 'opt', m3: 'opt', d20: 'opt', hint: 'Revisa el supuesto jurídico; los conceptos se marcan manualmente.' }
};
const CENTROS = ['Centro Federal de Conciliación y Registro Laboral', 'Centro de Conciliación Laboral del Estado de México', 'Centro de Conciliación Laboral de la Ciudad de México'];
const vacLFT = (k) => k <= 0 ? 0 : k <= 5 ? 10 + 2 * k : 22 + 2 * Math.floor((k - 6) / 5);
const addYearsISO = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const last = new Date(Date.UTC(y + n, m, 0)).getUTCDate(); return `${y + n}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`; };
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
function terminoDe(motivo, tipo) {
  const m = norm(motivo || '');
  if (/renuncia/.test(m)) return 'Renuncia';
  if (/rescision por el trabajador|art\.? 51/.test(m)) return 'Rescisión por el trabajador (art. 51)';
  if (/rescision|abandono|despido justificado/.test(m)) return 'Despido justificado (rescisión art. 47)';
  if (/mutuo|convenio/.test(m)) return 'Mutuo consentimiento';
  if (/contrato/.test(m)) return 'Término de contrato';
  if (/injustificado/.test(m)) return 'Despido injustificado';
  return tipo === 'liquidacion' ? 'Despido injustificado' : 'Renuncia';
}
// Base del cálculo para una fecha de baja
function finBase(data, fb, diario) {
  const ing = (data.empleado || {}).fecha_ingreso;
  const out = { ing, fb, anios: 0, n: 0, vacProp: 0, diasAnio: 0, diasQuincena: 0 };
  if (!fb) return out;
  const q0 = fb.slice(0, 8) + (Number(fb.slice(8)) <= 15 ? '01' : '16');
  out.diasQuincena = diasEntre(ing && ing > q0 ? ing : q0, fb) + 1;
  if (!ing || ing > fb) return out;
  let n = 0; const fb1 = addDays(fb, 1); while (addYearsISO(ing, n + 1) <= fb1) n++;
  out.n = n; out.anios = Math.round((diasEntre(ing, fb) + 1) / 365 * 1000) / 1000;
  out.vacProp = r2(vacLFT(n + 1) * (diasEntre(addYearsISO(ing, n), fb) + 1) / 365);
  const y0 = fb.slice(0, 4) + '-01-01'; out.diasAnio = diasEntre(ing > y0 ? ing : y0, fb) + 1;
  out.vacAnual = vacLFT(n + 1);
  return out;
}
async function finPickEmployee(tipo, employee) {
  if (employee) return finDocForm({ tipo, employee });
  const xs = await rpc('finiquito_personas', {});
  elegirPersona(DOC_TIPOS[tipo].label + ' · ¿para quién?', xs.map((e) => ({ id: e.id, nombre: fullName(e), num_empleado: e.num_empleado, sub: `${areaName(e.area_id)}${e.status === 'baja' ? ' · baja ' + fmtDate(e.fecha_baja) : ' · activo'}`, badge: statusBadge(e.status) })),
    'Normalmente es para personas ya dadas de baja; también puedes prepararlo para alguien activo con la fecha de terminación.', async (p, m) => { m.close(); finDocForm({ tipo, employee: { id: p.id } }); });
}
async function finDocForm({ tipo, employee, existing }) {
  const x0 = existing ? existing.datos || {} : {};
  let data = await rpc('finiquito_documento', { p_emp: employee.id, p_fecha: x0.fecha_efectiva || null });
  const e = data.empleado; const baja = e.status === 'baja'; const c0 = data.calculo || {};
  await loadTemplates(true);
  const k0 = x0.calc || null;
  const fields = [
    ...(existing ? [] : [{ k: 'doc', label: 'Documento', type: 'select', req: true, val: tipo, options: DOC_FIN.map((t) => [t, DOC_TIPOS[t].label]) }]),
    { k: 'term', label: 'Tipo de terminación', type: 'select', req: true, val: (k0 && k0.term) || terminoDe(e.motivo, tipo), options: opts(Object.keys(TERM_RULES)) },
    { k: '_fecha', label: 'Fecha del documento', type: 'date', req: true, val: existing ? existing.fecha : todayMX() },
    { k: 'fecha_efectiva', label: baja ? 'Fecha de baja' : 'Fecha de terminación', type: 'date', req: true, val: x0.fecha_efectiva || data.fecha_baja },
    { k: 'diario', label: 'Salario diario', type: 'number', req: true, val: (k0 && k0.diario) ?? c0.salario_diario, hint: 'Del expediente; ajústalo si cambió' },
    { k: 'forma_pago', label: 'Forma de pago', type: 'select', req: true, val: x0.forma_pago || 'Transferencia', options: opts(['Transferencia', 'Efectivo', 'Cheque']) },
    { k: 'representante', label: 'Por la empresa', req: true, val: x0.representante || S.me.full_name || '' },
    { k: 'centro', label: 'Centro de Conciliación (convenio)', full: true, val: x0.centro || CENTROS[0] }];
  const R = (k) => (k0 && k0.rows && k0.rows[k]) || {};
  const pre = c0.fuente === 'prenomina';
  const vac0 = pre ? r2(num(c0.vac_dias) + num(c0.vac_pendientes) - num(c0.vac_tomadas)) : null;
  const m = modal({ title: (existing ? 'Editar · ' : '') + 'Finiquito / liquidación · ' + fullName(e), wide: true,
    body: `<div class="notice n-info"><b>${esc(fullName(e))}</b> · ${esc(e.num_empleado || 's/n')} · ${esc(e.puesto || 'sin puesto')} · ${esc(e.area || '')} · ingreso ${fmtDate(e.fecha_ingreso)}${baja ? ' · baja ' + fmtDate(e.fecha_baja) : ''}
      <br><span class="small">${pre ? 'Toma vacaciones, otras percepciones y deducciones del finiquito de la pre-nómina.' : 'Calculado con salario, fecha de ingreso y fecha de terminación.'}</span></div>
      ${fieldsHtml(fields)}
      <div id="fc_hint" class="notice n-warn" style="margin-top:10px"></div>
      <div class="fbox" style="margin-top:10px"><header>Finiquito base</header><div class="fbody">
        <div class="fc-grid">
          <span></span><b class="small muted">Concepto</b><b class="small muted">Días / base</b><b class="small muted" style="text-align:right">Importe</b>
          ${[['dias', 'Días laborados pendientes de pago', `<input class="inp mono" id="fc_dias" type="number" step="0.5" min="0" value="${R('dias').v ?? ''}">`],
            ['agui', 'Aguinaldo proporcional', `<span class="row" style="gap:4px"><input class="inp mono" id="fc_agui" type="number" step="1" min="15" value="${R('agui').v ?? 15}" title="Días de aguinaldo al año"><span class="small muted" id="fc_agui_d"></span></span>`],
            ['vac', 'Vacaciones', `<input class="inp mono" id="fc_vac" type="number" step="0.01" min="0" value="${R('vac').v ?? ''}">`],
            ['pv', 'Prima vacacional', `<span class="row" style="gap:4px"><input class="inp mono" id="fc_pv" type="number" step="1" min="25" value="${R('pv').v ?? 25}"><span class="small muted">%</span></span>`],
            ['com', 'Comisiones / bonos pendientes', '<span></span>'],
            ['otro', 'Otros adeudos', `<input class="inp" id="fc_otro_c" placeholder="Concepto" value="${esc(R('otro').c || c0.otras_percepciones_concepto || '')}">`]]
            .map(([k, l, inp]) => `<input type="checkbox" data-fc="${k}"><span>${l}<br><span class="small muted" id="fc_${k}_h"></span></span>${inp}${k === 'com' || k === 'otro' ? `<input class="inp mono" id="fc_${k}_m" type="number" step="0.01" min="0" value="${k === 'com' ? (R('com').m ?? '') : (R('otro').m ?? (num(c0.otras_percepciones) || ''))}" style="text-align:right">` : `<b class="mono" id="fc_${k}_i" style="text-align:right"></b>`}`).join('')}
        </div></div></div>
      <div class="fbox" style="margin-top:10px"><header>Salario diario integrado (SDI)</header><div class="fbody">
        <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center"><label class="field" style="max-width:200px">SDI<input id="fc_sdi" type="number" step="0.01" value="${k0 && k0.sdi_manual ? k0.sdi : ''}"></label>
        <span class="small muted" id="fc_sdi_h"></span></div></div></div>
      <div class="fbox" style="margin-top:10px"><header>Indemnizaciones / conceptos sujetos a procedencia</header><div class="fbody">
        <div class="fc-grid">
          ${[['sen', 'Prima de antigüedad — 12 días por año, tope 2 salarios mínimos (Art. 162)'], ['m3', 'Indemnización de 3 meses — 90 días de SDI (Art. 48)'], ['d20', '20 días por año de SDI (Art. 50 fr. II, cuando corresponda)']]
            .map(([k, l]) => `<input type="checkbox" data-fc="${k}"><span>${l}<br><span class="small muted" id="fc_${k}_h"></span></span><span></span><b class="mono" id="fc_${k}_i" style="text-align:right"></b>`).join('')}
          <input type="checkbox" data-fc="ded"><span>Deducciones autorizadas<br><span class="small muted">ISR retenido, préstamos, adeudos documentados</span></span><input class="inp" id="fc_ded_c" placeholder="Concepto" value="${esc(R('ded').c || c0.deducciones_concepto || '')}"><input class="inp mono" id="fc_ded_m" type="number" step="0.01" min="0" value="${R('ded').m ?? (num(c0.deducciones) || '')}" style="text-align:right">
        </div></div></div>
      <div class="fc-tot" style="margin-top:12px" id="fc_tot"></div>
      <div id="fc_just_box" hidden>${fieldsHtml([{ k: 'just', label: 'Justificación', type: 'textarea', full: true, val: (k0 && k0.just) || '', hint: 'Obligatoria: marcaste un concepto que no corresponde a este tipo de terminación, o quitaste uno obligatorio.' }])}</div>
      <label class="row small" style="gap:6px;margin-top:10px"><input type="checkbox" id="fc_noadeudo"${x0.no_adeudo === false ? '' : ' checked'}> Agregar carta de no adeudo (recibos)</label>`,
    actions: [{ label: 'Cancelar' }, { label: 'Vista previa', run: async ({ el }) => { const doc = build(el); printDoc(doc, {}); return false; } },
      { label: existing ? 'Guardar cambios' : 'Generar documento', cls: 'primary', run: async ({ el }) => {
        const doc = build(el);
        if (!(doc.datos.monto > 0)) throw new Error('El total a pagar debe ser mayor a cero.');
        const iss = issues();
        if ((iss.extra.length || iss.missing.length) && !doc.datos.calc.just) throw new Error('Escribe la justificación: ' + [iss.extra.length ? 'no corresponde: ' + iss.extra.join(', ') : '', iss.missing.length ? 'falta: ' + iss.missing.join(', ') : ''].filter(Boolean).join(' · ') + '.');
        const row = { fecha: doc.fecha, datos: doc.datos, snapshot: doc.snapshot };
        let id;
        if (existing) { await mustUpdate(db('documents').eq('id', existing.id).update(row), 'el documento'); id = existing.id; }
        else { const [r] = await db('documents').insert([{ ...row, plantilla: blockDefaults(doc.tipo), tipo: doc.tipo, employee_id: e.id }]); id = Array.isArray(r) ? r[0].id : r.id; }
        toast(existing ? 'Documento actualizado' : 'Documento generado');
        if (S.view === 'documentos') viewDocumentos().catch(() => {});
        setTimeout(() => openDocument(id), 0);
      } }] });
  const el = m.el, $f = (s) => $(s, el);
  const docTipo = () => existing ? existing.tipo : $f('#f_doc').value;
  const chk = (k) => $f(`[data-fc="${k}"]`);
  // Estado inicial de las casillas
  const ini = (k, def) => { chk(k).checked = R(k).on != null ? !!R(k).on : def; };
  let B = finBase(data, $f('#f_fecha_efectiva').value, num($f('#f_diario').value));
  const lineaCubre = !!data.linea;
  if ($f('#fc_dias').value === '') $f('#fc_dias').value = lineaCubre ? 0 : B.diasQuincena;
  if ($f('#fc_vac').value === '') $f('#fc_vac').value = vac0 != null ? vac0 : B.vacProp;
  ini('dias', !lineaCubre && B.diasQuincena > 0); ini('agui', true); ini('vac', true); ini('pv', true);
  ini('com', num($f('#fc_com_m').value) > 0); ini('otro', num($f('#fc_otro_m').value) > 0); ini('ded', num($f('#fc_ded_m').value) > 0);
  const applyRule = (fromUser) => {
    const r = TERM_RULES[$f('#f_term').value]; if (!r) return;
    if (fromUser || !k0) { chk('sen').checked = r.sen === 'yes' || (r.sen === '15y' && B.anios >= 15); chk('m3').checked = r.m3 === 'yes'; chk('d20').checked = r.d20 === 'yes'; }
  };
  if (k0) { ini('sen', false); ini('m3', false); ini('d20', false); } else applyRule(false);
  function issues() {
    const r = TERM_RULES[$f('#f_term').value] || TERM_RULES.Otro, extra = [], missing = [];
    if (chk('m3').checked && r.m3 === 'no') extra.push('3 meses'); if (chk('d20').checked && r.d20 === 'no') extra.push('20 días por año');
    const senReq = r.sen === 'yes' || (r.sen === '15y' && B.anios >= 15);
    if (chk('sen').checked && (r.sen === 'no' || (r.sen === '15y' && B.anios < 15))) extra.push('prima de antigüedad');
    if (senReq && !chk('sen').checked) missing.push('prima de antigüedad'); if (r.m3 === 'yes' && !chk('m3').checked) missing.push('3 meses'); if (r.d20 === 'yes' && !chk('d20').checked) missing.push('20 días por año');
    return { extra, missing };
  }
  function calc() {
    const diario = num($f('#f_diario').value); B = finBase(data, $f('#f_fecha_efectiva').value, diario);
    const aguAnual = num($f('#fc_agui').value) || 15, pvPct = num($f('#fc_pv').value) || 25;
    const aguDias = r2(aguAnual * B.diasAnio / 365), vacDias = num($f('#fc_vac').value), dias = num($f('#fc_dias').value);
    const sdiSug = r2(diario * (1 + (aguAnual + (B.vacAnual || 12) * pvPct / 100) / 365));
    const sdi = num($f('#fc_sdi').value) || sdiSug, sm = num(data.salario_minimo) || 315.04, tope = Math.min(diario, r2(2 * sm));
    const v = { dias: r2(diario * dias), agui: r2(diario * aguDias), vac: r2(diario * vacDias), pv: r2(diario * vacDias * pvPct / 100),
      com: r2(num($f('#fc_com_m').value)), otro: r2(num($f('#fc_otro_m').value)), sen: r2(12 * B.anios * tope), m3: r2(90 * sdi), d20: r2(20 * B.anios * sdi), ded: r2(num($f('#fc_ded_m').value)) };
    const on = (k) => chk(k).checked;
    const fin = r2(['dias', 'agui', 'vac', 'pv', 'com', 'otro', 'sen'].reduce((s, k) => s + (on(k) ? v[k] : 0), 0)), ind = r2((on('m3') ? v.m3 : 0) + (on('d20') ? v.d20 : 0)), ded = on('ded') ? v.ded : 0, total = r2(fin + ind - ded);
    return { diario, aguAnual, pvPct, aguDias, vacDias, dias, sdi, sdiSug, sm, tope, v, on, fin, ind, ded, total };
  }
  function paint() {
    const k = calc(); const set = (id, t) => { const x = $f(id); if (x) x.textContent = t; };
    for (const key of ['dias', 'agui', 'vac', 'pv', 'sen', 'm3', 'd20']) set(`#fc_${key}_i`, k.on(key) ? money(k.v[key]) : '—');
    set('#fc_dias_h', lineaCubre ? `La quincena ${data.linea.periodo} ya los paga en la pre-nómina (${data.linea.dias_pagados} días)` : `${B.diasQuincena} días de la quincena hasta la baja × ${money(k.diario)}`);
    set('#fc_agui_d', `al año → ${k.aguDias.toFixed(2)} días`); set('#fc_agui_h', `${B.diasAnio} días trabajados en el año`);
    set('#fc_vac_h', `Proporcional ${B.vacProp} de ${B.vacAnual || 12} días del ${B.n + 1}º año${pre && (num(c0.vac_pendientes) || num(c0.vac_tomadas)) ? ` · pendientes ${num(c0.vac_pendientes)} · tomados ${num(c0.vac_tomadas)}` : ''}`);
    set('#fc_pv_h', `${k.pvPct}% de las vacaciones`);
    set('#fc_sen_h', `${B.anios.toFixed(3)} años × 12 días × ${money(k.tope)} (tope ${money(2 * k.sm)})`);
    set('#fc_m3_h', `90 × ${money(k.sdi)}`); set('#fc_d20_h', `20 × ${B.anios.toFixed(3)} años × ${money(k.sdi)}`);
    set('#fc_sdi_h', `Sugerido ${money(k.sdiSug)} = salario + partes proporcionales de aguinaldo (${k.aguAnual} días) y prima vacacional (${B.vacAnual || 12} días × ${k.pvPct}%) ÷ 365. Déjalo vacío para usar el sugerido.`);
    const r = TERM_RULES[$f('#f_term').value]; $f('#fc_hint').textContent = r ? r.hint : '';
    const iss = issues(); $f('#fc_just_box').hidden = !(iss.extra.length || iss.missing.length);
    if (!existing) { const d = $f('#f_doc'); if (d.value !== 'ratificacion') d.value = k.on('m3') || k.on('d20') ? 'liquidacion' : 'finiquito'; }
    $f('#f_centro').closest('label').hidden = docTipo() !== 'ratificacion';
    $f('#fc_tot').innerHTML = `<div class="fc-k"><span>Finiquito</span><b>${money(k.fin)}</b></div><div class="fc-k"><span>Indemnizaciones</span><b>${money(k.ind)}</b></div><div class="fc-k"><span>Deducciones</span><b>${money(k.ded)}</b></div><div class="fc-k"><span>Total a pagar</span><b style="color:${k.total > 0 ? 'var(--ok)' : 'var(--bad)'}">${money(k.total)}</b><span class="small muted">${esc(montoLetras(k.total))}</span></div>`;
  }
  $$('input,select,textarea', el).forEach((i) => { i.addEventListener('input', paint); i.addEventListener('change', paint); });
  $f('#f_term').addEventListener('change', () => { applyRule(true); paint(); });
  if (!baja) $f('#f_fecha_efectiva').addEventListener('change', async (ev) => { try { data = await rpc('finiquito_documento', { p_emp: e.id, p_fecha: ev.target.value }); B = finBase(data, ev.target.value, num($f('#f_diario').value)); $f('#fc_vac').value = B.vacProp; $f('#fc_dias').value = data.linea ? 0 : B.diasQuincena; paint(); } catch (er) { toast(er.message, true); } });
  else $f('#f_fecha_efectiva').readOnly = true;
  paint();
  function build(el2) {
    const v = readFields(el2, fields); const k = calc(); const t = docTipo();
    const rows = [];
    const add = (key, c, mnt) => { if (k.on(key) && mnt) rows.push({ c, m: r2(mnt) }); };
    add('dias', `Días laborados pendientes de pago (${k.dias} días × ${money(k.diario)})`, k.v.dias);
    add('vac', `Vacaciones (${k.vacDias.toFixed(2)} días)`, k.v.vac);
    add('pv', `Prima vacacional ${k.pvPct}%`, k.v.pv);
    add('agui', `Aguinaldo proporcional (${k.aguDias.toFixed(2)} días)`, k.v.agui);
    add('com', 'Comisiones / bonos pendientes', k.v.com);
    add('otro', ($f('#fc_otro_c').value.trim() || 'Otros adeudos'), k.v.otro);
    add('sen', `Prima de antigüedad (12 días × ${B.anios.toFixed(3)} años × ${money(k.tope)})`, k.v.sen);
    add('m3', `Indemnización constitucional (90 días × SDI ${money(k.sdi)})`, k.v.m3);
    add('d20', `20 días por año de servicio (20 × ${B.anios.toFixed(3)} años × SDI ${money(k.sdi)})`, k.v.d20);
    if (k.on('ded') && k.ded) rows.push({ c: ($f('#fc_ded_c').value.trim() || 'Deducciones') + ' (deducción)', m: -r2(k.ded) });
    if (k.on('otro') && k.v.otro && !$f('#fc_otro_c').value.trim()) throw new Error('Escribe el concepto de "Otros adeudos".');
    const liq = k.on('m3') || k.on('d20');
    const calcSave = { term: v.term, diario: k.diario, sdi: k.sdi, sdi_manual: !!num($f('#fc_sdi').value), just: ($f('#f_just').value || '').trim() || null,
      rows: { dias: { on: k.on('dias'), v: k.dias }, agui: { on: k.on('agui'), v: k.aguAnual }, vac: { on: k.on('vac'), v: k.vacDias }, pv: { on: k.on('pv'), v: k.pvPct }, sen: { on: k.on('sen') }, m3: { on: k.on('m3') }, d20: { on: k.on('d20') },
        com: { on: k.on('com'), m: k.v.com }, otro: { on: k.on('otro'), c: $f('#fc_otro_c').value.trim(), m: k.v.otro }, ded: { on: k.on('ded'), c: $f('#fc_ded_c').value.trim(), m: k.ded } } };
    const datos = { fecha_efectiva: v.fecha_efectiva, forma_pago: v.forma_pago, representante: v.representante, causa: v.term, base: liq ? 'liquidacion' : 'finiquito', centro: t === 'ratificacion' ? v.centro : null,
      no_adeudo: t === 'ratificacion' ? false : $f('#fc_noadeudo').checked, conceptos_tabla: rows, monto: r2(rows.reduce((s, r) => s + r.m, 0)),
      salario_diario: k.diario, sdi: liq ? k.sdi : null, antiguedad_anios: B.anios, fuente: c0.fuente, calc: calcSave };
    const snap = { ...empSnapshot(e), area: e.area || areaName(e.area_id) };
    const tv = latestTpl(t);
    return { id: existing && existing.id, folio: existing ? existing.folio : 0, tipo: t, fecha: v._fecha, estado: existing ? existing.estado : 'emitido', datos, snapshot: existing ? { ...existing.snapshot, ...snap } : snap,
      plantilla: existing ? existing.plantilla : currentPlantilla(t), plantilla_version: existing ? existing.plantilla_version : tv && tv.version };
  }
}
function finConceptosTabla(x) {
  const rs = x.conceptos_tabla || []; const per = rs.filter((r) => r.m > 0), ded = rs.filter((r) => r.m < 0);
  const tr = (r) => `<tr><td style="${P_TD}">${esc(r.c)}</td><td style="${P_TD};text-align:right;width:28%">${money(Math.abs(r.m))}</td></tr>`;
  return `<table style="width:100%;border-collapse:collapse;margin:6px 0 10px;font-size:10pt">
    <tr><td style="${P_TD};background:#eef1f5" colspan="2"><b>Percepciones</b></td></tr>${per.map(tr).join('')}
    ${ded.length ? `<tr><td style="${P_TD}"><b>Total percepciones</b></td><td style="${P_TD};text-align:right"><b>${money(per.reduce((s, r) => s + r.m, 0))}</b></td></tr><tr><td style="${P_TD};background:#eef1f5" colspan="2"><b>Deducciones</b></td></tr>${ded.map(tr).join('')}` : ''}
    <tr><td style="${P_TD}"><b>TOTAL A PAGAR</b></td><td style="${P_TD};text-align:right"><b>${money(x.monto)}</b></td></tr></table>`;
}
const huella = (n) => `<div style="display:grid;grid-template-columns:1fr 130px;gap:30px;margin-top:50px;align-items:end;page-break-inside:avoid"><div style="border-top:1px solid #222;padding-top:6px;text-align:center">${esc(n)}<br><span style="font-size:8.5pt">Nombre y firma de la persona trabajadora</span></div><div style="border:1px solid #999;height:110px;text-align:center;font-size:8pt;color:#666;padding-top:94px;box-sizing:border-box">Huella digital</div></div>`;

async function docFileUrl(path) { return storageUrl(DOC_BUCKET, path); }

async function openDocument(id) {
  const [d] = await db('documents').eq('id', id).get();
  if (!d) return toast('Documento no encontrado o sin permiso', true);
  const extra = await docExtra(d);
  const s = d.snapshot || {}, t = DOC_TIPOS[d.tipo];
  const g = S.groups.find((x) => x.id === d.group_id) || {};
  const responsable = g.tipo === 'lideres' || !g.tl_id ? 'Supervisión del área' : profName(g.tl_id);
  const fin = DOC_FIN.includes(d.tipo) && canDocFin(d.area_id);
  const canDeliver = (d.estado === 'con_lider' && (is('developer') || (is('tl') && g.tl_id === S.me.id) || (is('supervisor') && S.myAreas.includes(d.area_id))))
    || (d.estado === 'emitido' && DOC_CONTRATA.includes(d.tipo) && is('rh_general', 'rh_area') && S.myAreas.includes(d.area_id))
    || (fin && d.estado === 'emitido');
  const kv = [['Persona', `${s.nombre || '—'} · ${s.num || 's/n'}`], ['Área / equipo', `${areaName(d.area_id)}${d.group_id ? ' · ' + groupName(d.group_id) : ''}`], ['Fecha', fmtDate(d.fecha)],
    d.enviado_at ? ['Enviado al líder', `${fmtDateTime(d.enviado_at)} · entrega: ${responsable}`] : null,
    d.entregado_at ? [d.estado === 'negativa' ? 'Negativa registrada' : 'Firmado', `${fmtDateTime(d.entregado_at)} · ${profName(d.entregado_by)}`] : null,
    d.entrega_nota ? ['Nota de entrega', d.entrega_nota] : null,
    d.baja_aplicada ? ['Baja', 'Aplicada automáticamente en Personal'] : null,
    d.anulado_motivo ? ['Motivo de anulación', d.anulado_motivo] : null,
    d.case_id ? ['Caso', 'Ligado a un caso'] : null, ['Texto', `Plantilla v${d.plantilla_version || 0} (congelado al emitir)`]].filter(Boolean);
  const body = `<div class="row">${docBadge(d.estado)}<span class="badge ${docTipoBadge(t)}">${esc(t.label)}</span><span class="mono small muted">${esc(docFolio(d))}</span></div>
    <div class="kv">${kv.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>
    ${d.firmado_path ? `<a class="evid-item" id="docfile" target="_blank" rel="noopener" aria-disabled="true"><span class="fic">${fileIcon(d.firmado_tipo)}</span><span class="grow"><b>Copia firmada</b><span class="small muted">${esc(d.firmado_nombre || '')}</span></span><span class="go" aria-hidden="true">↗</span></a>` : ''}
    ${d.estado === 'emitido' && DOC_BAJA.includes(d.tipo) && is('developer') ? `<div class="notice n-warn">Al registrar ${d.tipo === 'rescision' ? 'la firma o la negativa de firma' : 'la firma'}, la persona pasa a <b>Baja</b> en Personal con fecha ${fmtDate(d.datos.fecha_efectiva)} y sale del pase de lista.</div>` : ''}
    <div class="docframe">${docHtml(d, extra)}</div>`;
  const reload = () => { if (S.view === 'documentos') viewDocumentos().catch(() => {}); };
  const actions = [{ label: 'Imprimir / PDF', run: () => { printDoc(d, extra); return false; } }];
  if ((is('developer') || fin) && d.estado === 'emitido') {
    actions.push({ label: 'Editar', run: async () => { if (DOC_FIN.includes(d.tipo)) { setTimeout(() => finDocForm({ tipo: d.tipo, employee: { id: d.employee_id }, existing: d }), 0); return; } const [e] = await db('employees').eq('id', d.employee_id).get(); setTimeout(() => docForm({ tipo: d.tipo, employee: e, existing: d }), 0); } });
    if (DOC_LIDER.includes(d.tipo)) actions.push({ label: 'Enviar al líder', cls: 'primary', run: async () => {
      if (!(await confirmBox('Enviar al líder', `El documento aparecerá a <b>${esc(responsable)}</b> para imprimirlo, entregarlo y subir la copia firmada.`, { okLabel: 'Enviar' }))) return false;
      await mustUpdate(db('documents').eq('id', d.id).update({ estado: 'con_lider' }), 'el documento'); toast('Enviado al líder'); reload(); setTimeout(() => openDocument(d.id), 0);
    } });
  }
  if ((is('developer') && d.estado === 'emitido' && d.tipo !== 'constancia_baja') || canDeliver) actions.push({ label: d.estado === 'con_lider' ? 'Registrar entrega' : 'Registrar firma', cls: d.estado === 'emitido' && DOC_LIDER.includes(d.tipo) ? '' : 'primary', run: () => { setTimeout(() => deliveryForm(d), 0); } });
  if (is('developer') && d.tipo === 'constancia_baja' && d.estado === 'emitido') actions.push({ label: 'Marcar firmada', cls: 'primary', run: () => { setTimeout(() => deliveryForm(d), 0); } });
  if (is('developer') && DOC_BAJA.includes(d.tipo) && ['firmado', 'negativa'].includes(d.estado)) actions.push({ label: 'Constancia de baja', run: async () => { const [e] = await db('employees').eq('id', d.employee_id).get(); setTimeout(() => docForm({ tipo: 'constancia_baja', employee: e }), 0); } });
  if ((is('developer') || fin) && d.estado !== 'anulado') actions.push({ label: 'Anular', cls: 'danger', run: () => { setTimeout(() => simpleCaseAction('Anular ' + docFolio(d), [{ k: 'm', label: 'Motivo de la anulación', type: 'textarea', req: true, full: true }],
    async (v) => { await mustUpdate(db('documents').eq('id', d.id).update({ estado: 'anulado', anulado_motivo: v.m }), 'el documento'); }, () => { reload(); setTimeout(() => openDocument(d.id), 0); },
    d.baja_aplicada ? 'La baja ya se aplicó en Personal; anular el documento no la revierte.' : 'El documento queda visible como anulado; no se borra.'), 0); } });
  if (is('developer')) actions.push({ label: 'Ver ficha', run: () => { setTimeout(() => openEmployee(d.employee_id), 0); } });
  if (d.case_id && is('developer', 'director', 'rh_general', 'rh_area', 'supervisor')) actions.push({ label: 'Ver caso', run: () => { setTimeout(() => openCase(d.case_id), 0); } });
  const m = modal({ title: `${t.label} · ${s.nombre || ''}`, body, actions, wide: true });
  const a = $('#docfile', m.el);
  if (a) docFileUrl(d.firmado_path).then((u) => { a.href = u; a.removeAttribute('aria-disabled'); }).catch((e) => { a.classList.add('err'); a.title = e.message; });
}

// Registrar entrega: copia firmada (foto o PDF) o negativa de firma
function deliveryForm(d) {
  const canRefuse = DOC_LIDER.includes(d.tipo) || d.tipo === 'rescision';   // contratación y bajas firmadas: sin negativa
  const needsFile = d.tipo !== 'constancia_baja';   // en la constancia el archivo es opcional
  const fb = fileBox('docsign', { title: 'Copia firmada', label: 'Tomar foto o elegir archivo', hint: 'Foto clara de la hoja firmada o PDF escaneado · hasta 10 MB', accept: 'image/*,application/pdf', ok: (f) => /^image\/|^application\/pdf$/.test(mimeOf(f)), max: 1 });
  const m = modal({ title: `${d.estado === 'con_lider' ? 'Entrega' : 'Firma'} · ${docFolio(d)} · ${(d.snapshot || {}).nombre || ''}`,
    body: `${canRefuse ? `<div class="seg" role="group" aria-label="Resultado" style="margin-bottom:10px"><button type="button" data-res="firmado" class="on">Firmó</button><button type="button" data-res="negativa">Se negó a firmar</button></div>` : ''}
      <div id="r_firmado">${needsFile ? fb.html : '<div class="notice n-info">La constancia es un documento interno: puedes marcarla como firmada sin archivo, o subir aquí la copia firmada si la tienes.</div>' + fb.html}</div>
      <div id="r_negativa" hidden>${fieldsHtml([{ k: 'nota', label: 'Cómo ocurrió y quiénes estuvieron presentes', type: 'textarea', req: true, full: true, hint: 'Ej. "Se le leyó el acta el 06/10 a las 10:30; se negó a firmar. Presentes: TL Juan Pérez y Sup. Ana Ruiz."' }])}</div>
      ${DOC_BAJA.includes(d.tipo) ? `<div class="notice n-warn" style="margin-top:10px">Al confirmar, la persona pasa a Baja con fecha ${fmtDate(d.datos.fecha_efectiva)}.</div>` : ''}`,
    actions: [{ label: 'Cancelar' }, { label: 'Confirmar', cls: 'primary', run: async ({ el, btn }) => {
      const res = ($('[data-res].on', el) || { dataset: { res: 'firmado' } }).dataset.res;
      if (res === 'negativa') {
        const v = readFields(el, [{ k: 'nota', label: 'Cómo ocurrió y quiénes estuvieron presentes', req: true }]);
        await rpc('doc_entrega', { p_id: d.id, p_resultado: 'negativa', p_path: null, p_nombre: null, p_tipo: null, p_nota: v.nota });
      } else if (!needsFile && !fb.files.length) {
        await mustUpdate(db('documents').eq('id', d.id).update({ estado: 'firmado' }), 'el documento');
      } else {
        const f = fb.files[0]; if (!f) throw new Error('Sube la foto o PDF de la hoja firmada.');
        const ext = (f.name.match(/\.([a-z0-9]{1,6})$/i) || [])[1];
        const key = `${d.id}/${newId()}${ext ? '.' + ext.toLowerCase() : ''}`;
        btn.textContent = 'Subiendo…';
        try { await storageUpload(DOC_BUCKET, key, f); } finally { btn.textContent = 'Confirmar'; }
        await rpc('doc_entrega', { p_id: d.id, p_resultado: 'firmado', p_path: key, p_nombre: f.name.slice(0, 200), p_tipo: mimeOf(f), p_nota: null });
      }
      toast(res === 'negativa' ? 'Negativa registrada' : DOC_BAJA.includes(d.tipo) ? 'Firmado · baja aplicada' : 'Entrega registrada');
      if (S.view === 'documentos') viewDocumentos().catch(() => {});
      refreshDocBadge();
      setTimeout(() => openDocument(d.id), 0);
    } }] });
  fb.wire(m.el);
  $$('[data-res]', m.el).forEach((b) => b.onclick = () => {
    $$('[data-res]', m.el).forEach((x) => x.classList.toggle('on', x === b));
    $('#r_firmado', m.el).hidden = b.dataset.res !== 'firmado'; $('#r_negativa', m.el).hidden = b.dataset.res !== 'negativa';
  });
}

// Documentos en la ficha del trabajador y en el caso
function docListHtml(docs) {
  return docs.length ? `<div class="list">${docs.map((k) => `<button type="button" class="item" data-opendoc="${k.id}" style="padding:8px 12px"><span class="mono small muted">${esc(docFolio(k))}</span><span class="grow small">${esc(DOC_TIPOS[k.tipo].label)} · ${fmtDate(k.fecha)}</span>${docBadge(k.estado)}</button>`).join('')}</div>` : '<span class="small muted">Sin documentos.</span>';
}
const CASE_DOC = { acta: 'acta', advertencia: 'advertencia', terminacion: 'rescision' };


// ── Plantillas: editor con versiones (solo Daniel) ──
const TPL_TIPOS = { general: { label: 'Datos generales', desc: 'Nombre de la empresa que aparece en todos los documentos.' }, ...Object.fromEntries(Object.entries(DOC_TIPOS).map(([k, t]) => [k, { label: t.label, desc: t.desc }])) };
// Datos de ejemplo para la vista previa
const TPL_SAMPLE = {
  snapshot: { nombre: 'María Fernanda López Ruiz', num: 'M-123', puesto: 'Asesor de marketing', area: 'Marketing', grupo: 'Equipo 1', lider: 'Juan Pérez Gómez', ingreso: '2025-03-10' },
  datos: { fecha_hechos: '2026-10-01', fecha_efectiva: '2026-10-15', fecha_entrega: '2026-10-08', motivo: 'Falta injustificada sin previo aviso', motivo_texto: 'Se hace constar la inasistencia del trabajador en la fecha indicada.', hechos: 'Ejemplo de hechos capturados en el documento.', evidencia: 'Pase de lista de la app.', fechas_hechos: '15, 18, 22 y 29 de septiembre de 2026', causal: 'Fracción X — Más de tres faltas de asistencia en 30 días', representante: 'Daniel Reyes', rh_nombre: 'Daniel Reyes', monto: 12500, forma_pago: 'Transferencia', conceptos: 'Aguinaldo proporcional: $3,000.00\nVacaciones y prima: $2,500.00\nGratificación: $7,000.00', tipo_salida: 'Renuncia voluntaria', ultimo_dia: '2026-10-15' }
};
function tplSampleDoc(tipo, bloques, version) {
  const t = tipo === 'general' ? 'renuncia' : tipo;
  const extra = tipo === 'general' ? currentPlantilla('renuncia') || {} : {};
  return { tipo: t, folio: 1, fecha: todayMX(), estado: 'emitido', snapshot: TPL_SAMPLE.snapshot, datos: TPL_SAMPLE.datos, plantilla: { ...(latestTpl('general') || {}).bloques, ...extra, ...bloques }, plantilla_version: version };
}
async function viewPlantillas() {
  const v = $('#view');
  await ensureBaseTemplates();
  v.innerHTML = `<div class="pagehead"><div><h1>Plantillas</h1><div class="muted small">Textos de los documentos · cada cambio crea una versión nueva; los documentos ya emitidos conservan su texto</div></div></div>
    <div class="notice n-info" style="margin-bottom:12px">Todos los documentos se emiten en <b>${esc(CIUDAD)}</b>. Los datos de cada caso (hechos, fechas, montos) se capturan al generar el documento; aquí cambias los párrafos fijos.</div>
    <div class="list">${Object.entries(TPL_TIPOS).map(([k, t]) => { const l = latestTpl(k); const n = (TPL.rows || []).filter((r) => r.tipo === k).length; return `<button type="button" class="item" data-tpl="${k}">
      <span class="grow"><span class="nm">${esc(t.label)}</span><br><span class="small muted">${l ? `v${l.version} · ${fmtDateTime(l.created_at)} · ${esc(l.nota)}` : 'Texto base (v0)'}</span></span>
      <span class="badge ${l ? 'b-acc' : 'b-mut'}">${l ? n + (n === 1 ? ' versión' : ' versiones') : 'Base'}</span></button>`; }).join('')}</div>`;
  $$('[data-tpl]').forEach((b) => b.onclick = () => openTemplate(b.dataset.tpl));
}
function openTemplate(tipo, from) {
  const blocks = DOC_BLOCKS[tipo];
  const cur = latestTpl(tipo);
  const base = from ? from.bloques : cur ? cur.bloques : {};
  const val = (b) => base[b.k] ?? b.def;
  const hist = (TPL.rows || []).filter((r) => r.tipo === tipo);
  const vars = tipo === 'general' ? [] : Object.entries(TPL_VARS);
  const m = modal({ title: `Plantilla · ${TPL_TIPOS[tipo].label}`, wide: true,
    body: `${from ? `<div class="notice n-warn">Cargaste el texto de la versión ${from.version}. Al guardar se crea una versión nueva con ese texto.</div>` : ''}
      ${vars.length ? `<div class="fbox"><header>Campos automáticos <span class="small muted" style="font-weight:400">· toca uno para insertarlo donde está el cursor</span></header><div class="fbody tpl-vars">${vars.map(([k, l]) => `<button type="button" class="chipvar" data-var="${k}" title="${esc(l)}">{${k}}</button>`).join('')}</div>
        <div class="fbody small muted" style="padding-top:0">Usa <b>**texto**</b> para negritas y deja un renglón en blanco para separar párrafos.</div></div>` : ''}
      ${blocks.map((b) => `<label class="field" style="margin-top:10px">${esc(b.label)}<textarea data-blk="${b.k}" rows="${Math.min(10, Math.max(2, Math.ceil(val(b).length / 90) + (val(b).match(/\n/g) || []).length))}">${esc(val(b))}</textarea>
        ${val(b) !== b.def ? `<button type="button" class="btn sm" data-reset="${b.k}" style="align-self:flex-start;min-height:32px">Usar texto base</button>` : ''}</label>`).join('')}
      ${fieldsHtml([{ k: 'nota', label: '¿Qué cambiaste? (queda en el historial)', req: true, full: true }])}
      <div class="eyebrow" style="margin:14px 0 6px">Vista previa</div><div class="docframe" id="tplprev"></div>
      ${hist.length ? `<div class="eyebrow" style="margin:14px 0 6px">Historial</div><div class="list">${hist.map((h) => `<div class="item" style="padding:8px 12px"><span class="mono small muted">v${h.version}</span><span class="grow small">${fmtDateTime(h.created_at)} · ${esc(profName(h.created_by))}<br><span class="muted">${esc(h.nota)}</span></span>${h === cur && !from ? '<span class="badge b-ok">Vigente</span>' : `<button type="button" class="btn sm" data-load="${h.version}">Cargar</button>`}</div>`).join('')}</div>` : ''}`,
    actions: [{ label: 'Cancelar' }, { label: 'Guardar versión ' + ((hist[0] ? hist[0].version : 0) + 1), cls: 'primary', run: async ({ el }) => {
      const v = readFields(el, [{ k: 'nota', label: '¿Qué cambiaste?', req: true }]);
      const bloques = read(el);
      if (cur && Object.keys(bloques).every((k) => bloques[k] === cur.bloques[k] || (cur.bloques[k] == null && bloques[k] === (blocks.find((b) => b.k === k) || {}).def))) throw new Error('No hay cambios respecto a la versión vigente.');
      for (const [k, t] of Object.entries(bloques)) if (!t.trim()) throw new Error(`El texto "${blocks.find((b) => b.k === k).label}" está vacío.`);
      await db('doc_templates').insert([{ tipo, bloques, nota: v.nota }]);
      toast('Versión guardada · los documentos nuevos usarán este texto');
      await loadTemplates(true); if (S.view === 'plantillas') viewPlantillas().catch(() => {});
    } }] });
  const read = (el) => Object.fromEntries($$('[data-blk]', el).map((t) => [t.dataset.blk, t.value.replace(/\r/g, '')]));
  let last = null;
  const preview = () => { $('#tplprev', m.el).innerHTML = docHtml(tplSampleDoc(tipo, read(m.el), (hist[0] ? hist[0].version : 0) + 1)); };
  $$('[data-blk]', m.el).forEach((t) => { t.addEventListener('focus', () => { last = t; }); t.addEventListener('input', () => { clearTimeout(preview._t); preview._t = setTimeout(preview, 250); }); });
  $$('[data-var]', m.el).forEach((b) => b.onclick = () => {
    const t = last || $('[data-blk]', m.el); const ins = '{' + b.dataset.var + '}';
    const a = t.selectionStart ?? t.value.length, z = t.selectionEnd ?? a;
    t.value = t.value.slice(0, a) + ins + t.value.slice(z); t.focus(); t.setSelectionRange(a + ins.length, a + ins.length); preview();
  });
  $$('[data-reset]', m.el).forEach((b) => b.onclick = (e) => { e.preventDefault(); const t = $(`[data-blk="${b.dataset.reset}"]`, m.el); t.value = blocks.find((x) => x.k === b.dataset.reset).def; b.remove(); preview(); });
  $$('[data-load]', m.el).forEach((b) => b.onclick = () => { m.close(); openTemplate(tipo, hist.find((h) => String(h.version) === b.dataset.load)); });
  preview();
}

// ── Expediente / respaldo en ZIP: copias firmadas + documentos imprimibles + índice ──
const CRC_T = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zipStore(files) {
  const te = new TextEncoder(), parts = [], central = []; let off = 0;
  const u16 = (n) => [n & 255, (n >>> 8) & 255], u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  const d = new Date(), dt = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)), dd = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate());
  for (const f of files) {
    const name = te.encode(f.name), data = typeof f.data === 'string' ? te.encode(f.data) : f.data, crc = crc32(data);
    const head = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(dt), ...u16(dd), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)];
    const local = new Uint8Array([...u32(0x04034b50), ...head]);
    parts.push(local, name, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...head, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), name);
    off += local.length + name.length + data.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(csize), ...u32(off), ...u16(0)]);
  return new Blob([...parts, ...central, end], { type: 'application/zip' });
}
const safeName = (s) => norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'documento';
function docExtraFrom(all, d) {
  const x = d.datos || {}, out = {};
  if (d.tipo === 'rescision') out.antecedentes = all.filter((a) => (x.antecedentes_ids || []).includes(a.id));
  if (d.tipo === 'constancia_baja' && d.origen_id) out.origen = all.find((a) => a.id === d.origen_id);
  return out;
}
async function exportDocsZip({ employeeId, titulo }, btn) {
  let q = db('documents').order('fecha').order('folio');
  if (employeeId) q = q.eq('employee_id', employeeId);
  const docs = await q.order('id').getAll();
  if (!docs.length) throw new Error('No hay documentos para descargar.');
  const files = [], faltan = [];
  for (let i = 0; i < docs.length; i++) {
    const d = docs[i]; if (!d.firmado_path) continue;
    if (btn) btn.textContent = `Descargando firmados ${i + 1}/${docs.length}…`;
    try {
      const r = await fetch(await storageUrl(DOC_BUCKET, d.firmado_path)); if (!r.ok) throw new Error(r.status);
      const ext = (d.firmado_path.match(/\.([a-z0-9]{1,6})$/i) || [, 'bin'])[1];
      files.push({ name: `firmados/${docFolio(d)}_${safeName(d.snapshot.nombre)}.${ext}`, data: new Uint8Array(await r.arrayBuffer()) });
    } catch { faltan.push(docFolio(d)); }
  }
  const pages = docs.map((d) => `<section class="pg">${docHtml(d, docExtraFrom(docs, d))}</section>`).join('');
  files.unshift({ name: 'documentos.html', data: `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>@page{size:letter;margin:16mm 17mm}body{margin:0;background:#eee}.pg{background:#fff;max-width:760px;margin:16px auto;padding:28px 32px}@media print{body{background:#fff}.pg{margin:0;padding:0;max-width:none;page-break-after:always}}</style></head><body>${pages}</body></html>` });
  const csv = [['Folio', 'Tipo', 'Fecha', 'Nombre', 'No. empleado', 'Área', 'Estado', 'Entregado', 'Copia firmada', 'Plantilla'].join(','),
    ...docs.map((d) => [docFolio(d), DOC_TIPOS[d.tipo].label, d.fecha, d.snapshot.nombre, d.snapshot.num, d.snapshot.area, DOC_ST[d.estado][0], d.entregado_at ? fmtDateTime(d.entregado_at) : '', d.firmado_path ? (faltan.includes(docFolio(d)) ? 'NO SE PUDO DESCARGAR' : 'sí') : '', 'v' + (d.plantilla_version || 0)].map((v) => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(','))].join('\r\n');
  files.splice(1, 0, { name: 'indice.csv', data: '﻿' + csv }, { name: 'datos.json', data: JSON.stringify(docs, null, 1) });
  const blob = zipStore(files);
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = safeName(titulo) + '_' + todayMX() + '.zip';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  toast(faltan.length ? `ZIP listo; no se pudieron bajar: ${faltan.join(', ')}` : `ZIP listo · ${docs.length} documentos`, !!faltan.length);
}


// ───────────────────────── Reclutamiento y selección ─────────────────────────
// Vacante (Supervisión/RH la piden, Daniel aprueba) → candidatos (RH del área) → 1er filtro → 2º filtro → seleccionado →
// hoja de datos → contratar y asignar a supervisor (tipo de contrato) → alta pendiente + contrato, reglamento y
// confidencialidad para firmar. Sin hoja de datos o si no pasa un filtro, queda en "No pasaron".
const CV_BUCKET = 'cvs';
const ETAPAS = { registrado: ['Por entrevistar', 'b-acc'], segundo_filtro: ['2º filtro', 'b-warn'], seleccionado: ['Seleccionado', 'b-ok'], asignado: ['Contratado', 'b-ok'], descartado: ['No pasó', 'b-mut'] };
const RESULT = { paso: 'Pasó', no_paso: 'No pasó', no_se_presento: 'No se presentó' };
const VAC_ST = { solicitada: ['Por aprobar', 'b-warn'], abierta: ['Abierta', 'b-acc'], rechazada: ['Rechazada', 'b-bad'], cubierta: ['Cubierta', 'b-ok'], cancelada: ['Cancelada', 'b-mut'] };
const FUENTES = ['Indeed', 'Facebook', 'Computrabajo', 'OCC', 'LinkedIn', 'Referido', 'Bolsa de trabajo', 'Volante / visita', 'Otro'];
const DESCARTES = ['No entregó hoja de datos', 'Desistió / no le interesó', 'No cumple el perfil', 'No localizable', 'Otro'];
const RS = { tab: null, etapa: 'registrado', q: '', vac: '', lote: '', sel: new Set() };
const candName = (c) => [c.nombre, c.apellido_paterno, c.apellido_materno].filter(Boolean).join(' ');
const canRecruit = () => is('developer', 'rh_general', 'rh_area');
const etapaBadge = (e) => `<span class="badge ${ETAPAS[e][1]}">${ETAPAS[e][0]}</span>`;
const vacLabel = (v) => v ? `#${v.folio} ${v.puesto} · ${areaName(v.area_id)}` : 'Sin vacante';

async function viewReclutamiento() {
  if (S.view === 'expediente' && EXP.id) return viewExpediente(EXP.id);
  const v = $('#view');
  if (is('developer') && !viewReclutamiento._tpl) { viewReclutamiento._tpl = true; ensureBaseTemplates().catch(() => {}); }
  const [vacs, cands] = await Promise.all([
    db('vacantes').order('created_at', false).get(),
    db('candidatos').order('created_at', false).order('id').getAll()
  ]);
  const vacById = Object.fromEntries(vacs.map((x) => [x.id, x]));
  if (!RS.tab) RS.tab = is('supervisor') ? 'asignados' : is('developer') && vacs.some((x) => x.estado === 'solicitada') ? 'vacantes' : 'candidatos';
  const tabs = is('supervisor') ? [['asignados', 'Asignados a mí'], ['vacantes', 'Vacantes']] : [['candidatos', 'Candidatos'], ['nopasaron', 'No pasaron'], ['vacantes', 'Vacantes']];
  const head = `<div class="pagehead"><div><h1>Reclutamiento</h1><div class="muted small">${vacs.filter((x) => x.estado === 'abierta').length} vacantes abiertas · ${cands.filter((c) => ['registrado', 'segundo_filtro', 'seleccionado'].includes(c.etapa)).length} candidatos en proceso</div></div>
    <div class="row" style="gap:8px">${canRecruit() && RS.tab === 'candidatos' ? '<button class="btn" id="cbulk">+ Varios</button><button class="btn primary" id="cnew">+ Candidato</button>' : ''}${RS.tab === 'vacantes' && is('developer', 'rh_general', 'rh_area', 'supervisor') ? '<button class="btn primary" id="vnew">+ Solicitar vacante</button>' : ''}</div></div>
    <div class="seg" role="group" aria-label="Sección" style="margin-bottom:12px">${tabs.map(([k, l]) => `<button type="button" data-rt="${k}" class="${RS.tab === k ? 'on' : ''}">${l}${k === 'vacantes' && is('developer') && vacs.some((x) => x.estado === 'solicitada') ? ` (${vacs.filter((x) => x.estado === 'solicitada').length} por aprobar)` : ''}</button>`).join('')}</div>`;
  let body = '';
  if (RS.tab === 'vacantes') body = vacantesHtml(vacs, cands);
  else if (RS.tab === 'asignados') body = await asignadosHtml();
  else body = candidatosHtml(cands, vacs, vacById);
  v.innerHTML = head + body;
  $$('[data-rt]').forEach((b) => b.onclick = () => { RS.tab = b.dataset.rt; RS.sel.clear(); viewReclutamiento(); });
  const cn = $('#cnew'); if (cn) cn.onclick = () => candidatoForm({ vacs });
  const cb = $('#cbulk'); if (cb) cb.onclick = () => bulkCandidatos(vacs);
  const vn = $('#vnew'); if (vn) vn.onclick = () => vacanteForm();
  $$('[data-vac]').forEach((b) => b.onclick = () => openVacante(vacById[b.dataset.vac], cands));
  $$('[data-cand]').forEach((b) => b.onclick = (e) => { if (e.target.closest('input')) return; openCandidato(b.dataset.cand); });
  $$('[data-ret]').forEach((b) => b.onclick = () => { RS.etapa = b.dataset.ret; RS.sel.clear(); viewReclutamiento(); });
  const q = $('#rq'); if (q) q.oninput = (e) => { RS.q = e.target.value; clearTimeout(viewReclutamiento._t); viewReclutamiento._t = setTimeout(() => viewReclutamiento().then(() => { const i = $('#rq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }), 300); };
  const fv = $('#rvac'); if (fv) fv.onchange = (e) => { RS.vac = e.target.value; RS.sel.clear(); viewReclutamiento(); };
  const fl = $('#rlote'); if (fl) fl.onchange = (e) => { RS.lote = e.target.value; RS.sel.clear(); viewReclutamiento(); };
  // Selección para acciones en bloque
  const sync = () => { const n = RS.sel.size; const bar = $('#rbulk'); if (bar) { bar.hidden = !n; $('#rbn').textContent = n + (n === 1 ? ' seleccionado' : ' seleccionados'); } };
  $$('[data-csel]').forEach((c) => c.onchange = () => { c.checked ? RS.sel.add(c.dataset.csel) : RS.sel.delete(c.dataset.csel); sync(); });
  const all = $('#rall'); if (all) all.onchange = () => { $$('[data-csel]').forEach((c) => { c.checked = all.checked; c.checked ? RS.sel.add(c.dataset.csel) : RS.sel.delete(c.dataset.csel); }); sync(); };
  sync();
  const pick = () => cands.filter((c) => RS.sel.has(c.id));
  $$('[data-bulk]').forEach((b) => b.onclick = () => {
    const xs = pick(); if (!xs.length) return toast('Selecciona al menos un candidato', true);
    const [act, val] = b.dataset.bulk.split(':');
    if (act === 'f1' || act === 'f2') resultadoForm(xs, act, val);
    else if (act === 'asignar') asignarForm(xs);
    else if (act === 'descartar') descartarForm(xs);
  });
  const pg = $('#purge'); if (pg) pg.onclick = () => purgeCandidatos(cands);
  updateReclBadge(vacs, cands);
}

function candidatosHtml(cands, vacs, vacById) {
  const nopas = RS.tab === 'nopasaron';
  const q = norm(RS.q);
  const base = cands.filter((c) => (!RS.vac || c.vacante_id === RS.vac) && (!RS.lote || c.lote === RS.lote) && (!q || norm(candName(c) + ' ' + (c.telefono || '') + ' ' + c.folio).includes(q)));
  const counts = Object.fromEntries(Object.keys(ETAPAS).map((k) => [k, base.filter((c) => c.etapa === k).length]));
  const rows = base.filter((c) => nopas ? c.etapa === 'descartado' : c.etapa === RS.etapa);
  const lotes = [...new Set(cands.map((c) => c.lote).filter(Boolean))].sort();
  const selectable = canRecruit() && !nopas && RS.etapa !== 'asignado';
  const bulk = {
    registrado: [['f1:paso', 'Pasó 1er filtro', 'primary'], ['f1:no_paso', 'No pasó', ''], ['f1:no_se_presento', 'No se presentó', '']],
    segundo_filtro: [['f2:paso', 'Pasó 2º filtro', 'primary'], ['f2:no_paso', 'No pasó', ''], ['f2:no_se_presento', 'No se presentó', '']],
    seleccionado: [['asignar', 'Contratar y asignar', 'primary'], ['descartar', 'Sin hoja de datos / descartar', '']]
  }[RS.etapa] || [];
  return `<div class="card pad" style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">
      ${nopas ? '' : `<div class="seg" role="group" aria-label="Etapa">${['registrado', 'segundo_filtro', 'seleccionado', 'asignado'].map((k) => `<button type="button" data-ret="${k}" class="${RS.etapa === k ? 'on' : ''}">${ETAPAS[k][0]} (${counts[k]})</button>`).join('')}</div>`}
      <div class="row" style="gap:8px;flex-wrap:wrap"><input class="inp grow" id="rq" type="search" placeholder="Buscar por nombre, teléfono o folio" value="${esc(RS.q)}" aria-label="Buscar candidatos" style="min-width:180px">
        <select class="inp" id="rvac" aria-label="Vacante" style="max-width:260px"><option value="">Todas las vacantes</option>${vacs.filter((x) => ['abierta', 'cubierta'].includes(x.estado)).map((x) => `<option value="${x.id}"${RS.vac === x.id ? ' selected' : ''}>${esc(vacLabel(x))}</option>`).join('')}</select>
        ${lotes.length ? `<select class="inp" id="rlote" aria-label="Grupo de reclutamiento" style="max-width:200px"><option value="">Todos los grupos</option>${lotes.map((l) => `<option${RS.lote === l ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>` : ''}</div>
    </div>
    ${nopas ? `<div class="notice n-info" style="margin-bottom:10px">Entrevistados que no pasaron un filtro, no se presentaron, no entregaron hoja de datos o desistieron. Se pueden reactivar desde su ficha.${is('developer') ? ' <button type="button" class="btn sm" id="purge" style="margin-left:8px;min-height:32px">Depurar mayores a 6 meses</button>' : ''}</div>` : ''}
    ${!nopas && RS.etapa === 'seleccionado' && rows.length ? '<div class="notice n-info" style="margin-bottom:10px">Abre a cada seleccionado y llena su <b>hoja de datos</b>. Sin ella no se puede contratar; si no la entrega, márcalo como "Sin hoja de datos" y pasa a No pasaron.</div>' : ''}
    ${selectable && bulk.length && rows.length ? `<div class="card pad bulkbar" id="rbulk" hidden><b id="rbn"></b><span class="grow"></span>${bulk.map(([k, l, c]) => `<button type="button" class="btn ${c}" data-bulk="${k}">${l}</button>`).join('')}</div>` : ''}
    <div class="list">${selectable && rows.length && bulk.length ? `<label class="item chk" style="padding:8px 12px"><input type="checkbox" id="rall"> <span class="small muted">Seleccionar todos (${rows.length})</span></label>` : ''}
    ${rows.length ? rows.map((c) => `<div role="button" tabindex="0" class="item" data-cand="${c.id}">
      ${selectable && bulk.length ? `<input type="checkbox" data-csel="${c.id}" ${RS.sel.has(c.id) ? 'checked' : ''} aria-label="Seleccionar ${esc(candName(c))}" style="width:20px;height:20px">` : ''}
      <span class="mono small muted" style="width:44px">#${c.folio}</span>
      <span class="grow"><span class="nm">${esc(candName(c))}</span>${c.alerta ? ' <span class="badge b-bad">No recontratable</span>' : ''}${c.etapa === 'seleccionado' ? (c.hoja_at ? ' <span class="badge b-ok">Hoja de datos ✓</span>' : ' <span class="badge b-warn">Falta hoja de datos</span>') : ''}
        <br><span class="small muted">${esc(c.telefono || 's/tel')} · ${esc(c.fuente || '—')}${c.lote ? ' · ' + esc(c.lote) : ''} · ${esc(vacById[c.vacante_id] ? vacById[c.vacante_id].puesto : areaName(c.area_id))}${c.etapa === 'descartado' ? ' · ' + esc(c.descarte_motivo || (c.f2_resultado && c.f2_resultado !== 'paso' ? '2º filtro: ' + RESULT[c.f2_resultado] : c.f1_resultado ? '1er filtro: ' + RESULT[c.f1_resultado] : '')) : ''}${c.etapa === 'asignado' ? ` · ingreso ${fmtDate(c.fecha_ingreso)} · ${esc(profName(c.supervisor_id))}` : ''}</span></span>
      ${etapaBadge(c.etapa)}</div>`).join('') : `<div class="card empty">${nopas ? 'Nadie en esta lista.' : 'Sin candidatos en esta etapa.'}</div>`}</div>`;
}

function vacantesHtml(vacs, cands) {
  return `<div class="list">${vacs.length ? vacs.map((x) => { const n = cands.filter((c) => c.vacante_id === x.id && c.etapa === 'asignado').length, p = cands.filter((c) => c.vacante_id === x.id && ['registrado', 'segundo_filtro', 'seleccionado'].includes(c.etapa)).length; return `<button type="button" class="item" data-vac="${x.id}">
    <span class="mono small muted" style="width:44px">#${x.folio}</span>
    <span class="grow"><span class="nm">${esc(x.puesto)}</span> <span class="small muted">× ${x.cantidad}</span><br><span class="small muted">${esc(areaName(x.area_id))} · ${x.motivo === 'reemplazo' ? 'Reemplazo de ' + esc(x.reemplazo_de || '') : 'Crecimiento'} · ${n}/${x.cantidad} contratados · ${p} en proceso · pidió ${esc(profName(x.solicitada_by))}</span></span>
    <span class="badge ${VAC_ST[x.estado][1]}">${VAC_ST[x.estado][0]}</span></button>`; }).join('') : '<div class="card empty">Sin vacantes.</div>'}</div>`;
}

async function asignadosHtml() {
  const mine = await rpc('mis_asignados').catch(() => []);
  const emps = mine.length ? await db('employees').select('id,nombre,apellido_paterno,apellido_materno,area_id,group_id,status,puesto').in('id', mine.map((c) => c.employee_id).filter(Boolean)).get() : [];
  const byId = Object.fromEntries(emps.map((e) => [e.id, e]));
  setTimeout(() => $$('[data-ubicar]').forEach((b) => b.onclick = () => { const e = byId[b.dataset.ubicar]; if (e) moveGroup(e, () => viewReclutamiento()); }), 0);
  return `<div class="notice n-info" style="margin-bottom:10px">Personas contratadas que RH te asignó. Ubícalas en un grupo para que aparezcan en el pase de lista cuando Daniel acepte su alta.</div>
    <div class="list">${mine.length ? mine.map((c) => { const e = byId[c.employee_id]; return `<div class="item">
      <span class="grow"><span class="nm">${esc(candName(c))}</span><br><span class="small muted">Ingreso ${fmtDate(c.fecha_ingreso)} · ${esc(CONTRATOS[c.contrato_tipo] || '')} · ${e ? esc(groupName(e.group_id)) : '—'}</span></span>
      ${e ? statusBadge(e.status) : ''}${e && ['activo', 'alta_pendiente'].includes(e.status) ? `<button type="button" class="btn sm" data-ubicar="${e.id}" style="min-height:36px">${e.group_id ? 'Cambiar grupo' : 'Ubicar en grupo'}</button>` : ''}</div>`; }).join('') : '<div class="card empty">Aún no te han asignado personal.</div>'}</div>`;
}

function updateReclBadge(vacs, cands) {
  const n = is('developer') ? vacs.filter((x) => x.estado === 'solicitada').length : 0;
  $$('[data-v="reclutamiento"]').forEach((a) => {
    let b = a.querySelector('.cnt'); if (!b) { b = document.createElement('span'); b.className = 'cnt badge b-bad'; b.style.marginLeft = 'auto'; a.appendChild(b); }
    b.textContent = n; b.style.display = n ? '' : 'none';
  });
  refreshMoreBadge();
}

// ── Vacantes ──
function vacanteForm(x) {
  const areas = S.areas.filter((a) => a.active && (seesAllAreas() || S.myAreas.includes(a.id)));
  const f = [
    { k: 'area_id', label: 'Área', type: 'select', req: true, val: x ? x.area_id : areas.length === 1 ? areas[0].id : '', options: [['', 'Elegir…'], ...areas.map((a) => [a.id, a.name])] },
    { k: 'puesto', label: 'Puesto', req: true, val: x ? x.puesto : '' },
    { k: 'cantidad', label: 'Cuántas personas', type: 'number', req: true, val: x ? x.cantidad : 1 },
    { k: 'motivo', label: 'Motivo', type: 'select', req: true, val: x ? x.motivo : '', options: [['', 'Elegir…'], ['reemplazo', 'Reemplazo de una baja'], ['crecimiento', 'Crecimiento / nueva posición']] },
    { k: 'reemplazo_de', label: 'Reemplaza a (si es reemplazo)', val: x ? x.reemplazo_de || '' : '', full: true },
    { k: 'horario', label: 'Horario', val: x ? x.horario || '' : '', hint: 'Ej. L-V 08:00 a 17:00' },
    { k: 'sueldo', label: 'Sueldo mensual ofrecido', type: 'number', val: x ? x.sueldo ?? '' : '' },
    { k: 'perfil', label: 'Perfil requerido', type: 'textarea', full: true, val: x ? x.perfil || '' : '', hint: 'Escolaridad, experiencia, habilidades, disponibilidad.' }
  ];
  modal({ title: x ? `Editar vacante #${x.folio}` : 'Solicitar vacante', wide: true,
    body: (is('developer') || x ? '' : '<div class="notice n-info">La solicitud queda "Por aprobar" hasta que Daniel la autorice.</div>') + fieldsHtml(f),
    actions: [{ label: 'Cancelar' }, { label: x ? 'Guardar' : is('developer') ? 'Abrir vacante' : 'Enviar solicitud', cls: 'primary', run: async ({ el }) => {
      const v = readFields(el, f);
      if (!(v.cantidad >= 1 && Number.isInteger(v.cantidad))) throw new Error('La cantidad debe ser un número entero de 1 o más.');
      if (x) { delete v.area_id; await mustUpdate(db('vacantes').eq('id', x.id).update(v), 'la vacante'); } else await db('vacantes').insert([v]);
      toast(x ? 'Vacante actualizada' : is('developer') ? 'Vacante abierta' : 'Solicitud enviada'); RS.tab = 'vacantes'; viewReclutamiento();
    } }] });
}
function openVacante(x, cands) {
  const mine = cands.filter((c) => c.vacante_id === x.id);
  const kv = [['Área', areaName(x.area_id)], ['Puesto', `${x.puesto} × ${x.cantidad}`], ['Motivo', x.motivo === 'reemplazo' ? 'Reemplazo de ' + (x.reemplazo_de || '') : 'Crecimiento'], ['Horario', x.horario], ['Sueldo', x.sueldo != null ? money(x.sueldo) + ' mensuales' : null], ['Perfil', x.perfil],
    ['Solicitó', `${profName(x.solicitada_by)} · ${fmtDateTime(x.created_at)}`], x.decidida_at ? [x.estado === 'rechazada' ? 'Rechazó' : 'Aprobó', `${profName(x.decidida_by)} · ${fmtDateTime(x.decidida_at)}`] : null, ['Nota', x.nota_decision]].filter((r) => r && r[1]);
  const body = `<div class="row"><span class="badge ${VAC_ST[x.estado][1]}">${VAC_ST[x.estado][0]}</span></div>
    <div class="kv">${kv.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>
    <div class="row small">${Object.keys(ETAPAS).map((k) => `<span class="badge ${ETAPAS[k][1]}">${ETAPAS[k][0]}: ${mine.filter((c) => c.etapa === k).length}</span>`).join('')}</div>`;
  const reload = () => viewReclutamiento().catch(() => {});
  const actions = [];
  if (x.estado === 'solicitada' && is('developer')) {
    actions.push({ label: 'Rechazar', cls: 'danger', run: () => { setTimeout(() => simpleCaseAction('Rechazar vacante #' + x.folio, [{ k: 'n', label: 'Motivo', type: 'textarea', req: true, full: true }], (v) => mustUpdate(db('vacantes').eq('id', x.id).update({ estado: 'rechazada', nota_decision: v.n }), 'la vacante'), reload), 0); } });
    actions.push({ label: 'Aprobar', cls: 'primary', run: async () => { await mustUpdate(db('vacantes').eq('id', x.id).update({ estado: 'abierta' }), 'la vacante'); toast('Vacante abierta'); reload(); } });
  }
  if (['solicitada', 'abierta'].includes(x.estado) && (is('developer', 'rh_general', 'rh_area') || (is('supervisor') && x.estado === 'solicitada' && x.solicitada_by === S.me.id))) {
    actions.push({ label: 'Editar', run: () => { setTimeout(() => vacanteForm(x), 0); } });
    actions.push({ label: 'Cancelar vacante', cls: 'danger', run: async () => { if (!(await confirmBox('Cancelar vacante', `¿Cancelar la vacante <b>#${x.folio} ${esc(x.puesto)}</b>?`, { danger: true, okLabel: 'Cancelar vacante' }))) return false; await mustUpdate(db('vacantes').eq('id', x.id).update({ estado: 'cancelada' }), 'la vacante'); toast('Vacante cancelada'); reload(); } });
  }
  if (x.estado === 'abierta' && is('developer', 'rh_general', 'rh_area')) {
    actions.push({ label: 'Marcar cubierta', run: async () => { await mustUpdate(db('vacantes').eq('id', x.id).update({ estado: 'cubierta' }), 'la vacante'); toast('Vacante cubierta'); reload(); } });
    actions.push({ label: 'Ver candidatos', cls: 'primary', run: () => { RS.tab = 'candidatos'; RS.vac = x.id; viewReclutamiento(); } });
  }
  modal({ title: `Vacante #${x.folio} · ${x.puesto}`, body, actions, wide: true });
}

// ── Candidatos ──
function candFields(c = {}, vacs = []) {
  const areas = S.areas.filter((a) => a.active && (seesAllAreas() || S.myAreas.includes(a.id)));
  const open = vacs.filter((v) => (v.estado === 'abierta' || v.id === c.vacante_id) && (seesAllAreas() || S.myAreas.includes(v.area_id)));
  return [
    { k: 'vacante_id', label: 'Vacante', type: 'select', val: c.vacante_id || (RS.vac && open.some((v) => v.id === RS.vac) ? RS.vac : open.length === 1 ? open[0].id : ''), options: [['', 'Sin vacante (solo área)'], ...open.map((v) => [v.id, vacLabel(v)])], full: true },
    { k: 'area_id', label: 'Área (si no hay vacante)', type: 'select', val: c.area_id || (areas.length === 1 ? areas[0].id : ''), options: [['', 'Elegir…'], ...areas.map((a) => [a.id, a.name])] },
    { k: 'fuente', label: 'Fuente', type: 'select', val: c.fuente || '', options: [['', 'Elegir…'], ...FUENTES.map((x) => [x, x])] },
    { k: 'nombre', label: 'Nombre(s)', req: true, val: c.nombre || '' },
    { k: 'apellido_paterno', label: 'Apellido paterno', req: true, val: c.apellido_paterno || '' },
    { k: 'apellido_materno', label: 'Apellido materno', val: c.apellido_materno || '' },
    { k: 'telefono', label: 'Teléfono', type: 'tel', val: c.telefono || '' },
    { k: 'correo', label: 'Correo', type: 'email', val: c.correo || '' },
    { k: 'curp', label: 'CURP (si la tienes)', val: c.curp || '', upper: true },
    { k: 'lote', label: 'Grupo de reclutamiento (opcional)', val: c.lote || RS.lote || '', hint: 'Ej. "Entrevista grupal 14/10" para mover a todos juntos.' }
  ];
}
function resolveArea(v, vacs) {
  const vac = vacs.find((x) => x.id === v.vacante_id);
  if (vac) return vac.area_id;
  if (!v.area_id) throw new Error('Elige la vacante o el área.');
  return v.area_id;
}
async function candidatoForm({ vacs, existing }) {
  vacs = vacs || await db('vacantes').get();
  const f = candFields(existing || {}, vacs);
  const fb = fileBox('cvbox', { title: 'CV o solicitud', label: 'Subir CV (PDF, Word o foto)', hint: 'Hasta 10 MB', accept: 'image/*,application/pdf,.doc,.docx', ok: (x) => /^image\/|^application\/pdf$|wordprocessingml|msword/.test(mimeOf(x) || (/\.doc$/i.test(x.name) ? 'application/msword' : '')), max: 1 });
  const m = modal({ title: existing ? `Editar candidato #${existing.folio}` : 'Nuevo candidato', wide: true,
    body: `<div id="calert"></div>${fieldsHtml(f)}${existing && existing.cv_path ? '' : fb.html}`,
    actions: [{ label: 'Cancelar' }, { label: existing ? 'Guardar' : 'Registrar', cls: 'primary', run: async ({ el, btn }) => {
      const v = readFields(el, f); v.area_id = resolveArea(v, vacs);
      if (v.curp && !/^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/.test(v.curp)) throw new Error('CURP inválida.');
      let row;
      if (existing) { delete v.area_id; if (v.vacante_id === existing.vacante_id) delete v.vacante_id; [row] = await mustUpdate(db('candidatos').eq('id', existing.id).update(v), 'el candidato'); }
      else [row] = await db('candidatos').insert([v]);
      if (fb.files.length) { btn.textContent = 'Subiendo CV…'; await uploadCv(row, fb.files[0]).catch((e) => toast('Se registró, pero el CV no se subió: ' + e.message, true)); }
      toast(existing ? 'Candidato actualizado' : row.alerta ? 'Registrado · ATENCIÓN: coincide con una baja no recontratable' : 'Candidato registrado', !!row.alerta);
      viewReclutamiento().catch(() => {});
    } }] });
  if (!existing || !existing.cv_path) fb.wire(m.el);
  // Aviso inmediato de no recontratable
  const check = async () => {
    const g = (k) => ($('#f_' + k, m.el) || {}).value || '';
    if (!g('nombre') || !g('apellido_paterno')) return;
    try {
      const a = await rpc('cand_alerta', { p_curp: g('curp').toUpperCase(), p_nombre: g('nombre'), p_paterno: g('apellido_paterno'), p_materno: g('apellido_materno') });
      $('#calert', m.el).innerHTML = a ? `<div class="notice n-bad"><b>No recontratable:</b> ${esc(a)}. Solo Daniel puede contratarlo.</div>` : '';
    } catch { /* sin conexión */ }
  };
  ['nombre', 'apellido_paterno', 'apellido_materno', 'curp'].forEach((k) => { const i = $('#f_' + k, m.el); if (i) i.addEventListener('change', check); });
}
async function uploadCv(c, f) {
  const ext = (f.name.match(/\.([a-z0-9]{1,6})$/i) || [])[1];
  const key = `${c.id}/${newId()}${ext ? '.' + ext.toLowerCase() : ''}`;
  await storageUpload(CV_BUCKET, key, f);
  await mustUpdate(db('candidatos').eq('id', c.id).update({ cv_path: key, cv_nombre: f.name.slice(0, 200) }), 'el candidato');
}
// Varios a la vez (entrevista grupal): un renglón por persona "Nombre Apellido Apellido, teléfono"
function splitName(full) {
  const t = full.trim().split(/\s+/).filter(Boolean);
  if (t.length <= 1) return null;
  if (t.length === 2) return { nombre: t[0], apellido_paterno: t[1], apellido_materno: null };
  if (t.length === 3) return { nombre: t[0], apellido_paterno: t[1], apellido_materno: t[2] };
  return { nombre: t.slice(0, -2).join(' '), apellido_paterno: t[t.length - 2], apellido_materno: t[t.length - 1] };
}
function bulkCandidatos(vacs) {
  const f = candFields({}, vacs).filter((x) => ['vacante_id', 'area_id', 'fuente', 'lote'].includes(x.k));
  f.find((x) => x.k === 'lote').val = RS.lote || `Entrevista ${fmtDate(todayMX())}`;
  const m = modal({ title: 'Registrar varios candidatos', wide: true,
    body: `${fieldsHtml(f)}<label class="field" style="margin-top:10px">Un renglón por persona: nombre y apellidos, coma, teléfono<textarea id="blines" rows="8" placeholder="María Fernanda López Ruiz, 55 1234 5678&#10;Juan Pérez Gómez, 5598765432"></textarea></label><div id="bprev" class="small"></div>`,
    actions: [{ label: 'Cancelar' }, { label: 'Registrar', cls: 'primary', run: async ({ el, btn }) => {
      const v = readFields(el, f); const area = resolveArea(v, vacs);
      const rows = parse(); if (!rows.length) throw new Error('Escribe al menos un renglón.');
      const bad = rows.filter((r) => !r.n); if (bad.length) throw new Error('Revisa los renglones: ' + bad.map((r) => r.line).join(' | '));
      const fails = []; let ok = 0;
      for (let i = 0; i < rows.length; i++) {
        btn.textContent = `Registrando ${i + 1}/${rows.length}…`;
        try { await db('candidatos').insert([{ ...rows[i].n, telefono: rows[i].tel, vacante_id: v.vacante_id, area_id: area, fuente: v.fuente, lote: v.lote }]); ok++; }
        catch (e) { fails.push(`${rows[i].line} (${e.message})`); rows[i].fail = true; }
      }
      btn.textContent = 'Registrar';
      RS.lote = v.lote || ''; viewReclutamiento().catch(() => {});
      if (fails.length) { $('#blines', el).value = rows.filter((r) => r.fail).map((r) => r.line).join('\n'); toast(`${ok} registrados; quedan en el cuadro los ${fails.length} con error`, true); $('#bprev', el).innerHTML = `<div class="notice n-bad">${fails.map(esc).join('<br>')}</div>`; return false; }
      toast(`${ok} candidatos registrados`);
    } }] });
  // "Nombre Apellidos, teléfono" o "Nombre Apellidos 55 1234 5678" (el teléfono al final, con o sin coma)
  const parse = () => $('#blines', m.el).value.split('\n').map((l) => l.trim()).filter(Boolean).map((line) => {
    let nm = line, tel = null; const c = line.indexOf(',');
    if (c >= 0) { nm = line.slice(0, c); tel = line.slice(c + 1).trim() || null; }
    else { const mm = line.match(/^(.*?)[\s:]+((?:\+?\d[\d\s-]{8,}\d))$/); if (mm) { nm = mm[1]; tel = mm[2]; } }
    return { line, n: splitName(nm || ''), tel };
  });
  $('#blines', m.el).oninput = () => { const rs = parse(); $('#bprev', m.el).innerHTML = rs.length ? `<div class="scrollx"><table class="tbl"><thead><tr><th>Nombre(s)</th><th>Paterno</th><th>Materno</th><th>Teléfono</th></tr></thead><tbody>${rs.map((r) => r.n ? `<tr><td>${esc(r.n.nombre)}</td><td>${esc(r.n.apellido_paterno)}</td><td>${esc(r.n.apellido_materno || '')}</td><td>${esc(r.tel || '')}</td></tr>` : `<tr><td colspan="4" style="color:var(--bad)">Falta apellido: ${esc(r.line)}</td></tr>`).join('')}</tbody></table></div>` : ''; };
}

async function openCandidato(id) {
  const [c] = await db('candidatos').eq('id', id).get();
  if (!c) return toast('Candidato no encontrado o sin permiso', true);
  const [vac] = c.vacante_id ? await db('vacantes').eq('id', c.vacante_id).get().catch(() => []) : [];
  const docs = c.employee_id ? await db('documents').select('id,folio,tipo,fecha,estado').eq('employee_id', c.employee_id).order('folio').get().catch(() => []) : [];
  const [emp] = c.employee_id ? await db('employees').select('id,status,group_id,num_empleado').eq('id', c.employee_id).get().catch(() => []) : [];
  const filtro = (n) => { const r = c[`f${n}_resultado`]; return r ? `${RESULT[r]} · ${fmtDate(c[`f${n}_fecha`])} · ${profName(c[`f${n}_por`])}${c[`f${n}_comentarios`] ? ' — ' + c[`f${n}_comentarios`] : ''}` : null; };
  const kv = [['Teléfono', c.telefono], ['Correo', c.correo], ['CURP', c.curp], ['Fuente', c.fuente], ['Grupo de reclutamiento', c.lote], ['Vacante', vac ? vacLabel(vac) : areaName(c.area_id)],
    ['1er filtro', filtro(1)], ['2º filtro', filtro(2)], ['No pasó', c.etapa === 'descartado' ? c.descarte_motivo || 'Por resultado de filtro' : null],
    ['Registró', `${profName(c.created_by)} · ${fmtDateTime(c.created_at)}`]].filter((r) => r[1]);
  const hoja = c.hoja_at ? [['RFC', c.rfc], ['NSS', c.nss], ['Nacimiento', fmtDate(c.fecha_nacimiento)], ['Domicilio', c.domicilio], ['Contacto de emergencia', c.contacto_emergencia], ['Llenó', `${profName(c.hoja_por)} · ${fmtDateTime(c.hoja_at)}`]].filter((r) => r[1]) : null;
  const contratados = docs.filter((d) => DOC_CONTRATA.includes(d.tipo));
  const firm = contratados.filter((d) => d.estado === 'firmado').length;
  const body = `<div class="row">${etapaBadge(c.etapa)}${c.alerta ? '<span class="badge b-bad">No recontratable</span>' : ''}<span class="mono small muted">#${c.folio}</span></div>
    ${c.alerta ? `<div class="notice n-bad"><b>Coincide con una baja no recontratable:</b> ${esc(c.alerta)}. Solo Daniel puede contratarlo.</div>` : ''}
    <div class="kv">${kv.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>
    ${c.cv_path ? `<a class="evid-item" id="cvlink" target="_blank" rel="noopener" aria-disabled="true"><span class="fic">CV</span><span class="grow"><b>CV / solicitud</b><span class="small muted">${esc(c.cv_nombre || '')}</span></span><span class="go" aria-hidden="true">↗</span></a>` : ''}
    ${['seleccionado', 'asignado'].includes(c.etapa) ? `<section class="fbox"><header>Hoja de datos para el alta ${c.hoja_at ? '<span class="badge b-ok">Completa</span>' : '<span class="badge b-warn">Pendiente</span>'}</header>
      <div class="fbody">${hoja ? `<div class="kv">${hoja.map(([k, v]) => `<span>${esc(k)}</span><span>${esc(v)}</span>`).join('')}</div>` : '<span class="small muted">Sin hoja de datos no se puede contratar. Si no la entrega, márcalo como "Sin hoja de datos".</span>'}</div></section>` : ''}
    ${c.etapa === 'asignado' ? `<section class="fbox"><header>Contratación · ${esc(CONTRATOS[c.contrato_tipo] || '')} · ${firm}/3 firmados</header><div class="fbody">
      <div class="small muted" style="margin-bottom:8px">Ingreso ${fmtDate(c.fecha_ingreso)} · asignado a ${esc(profName(c.supervisor_id))} · alta en Personal: ${emp ? STATUS[emp.status][0] : '—'}${firm < 3 ? '. Imprime los 3 documentos, recaba firmas y sube cada uno firmado; Daniel acepta el alta cuando estén los 3.' : ''}</div>
      ${docListHtml(contratados)}</div></section>` : ''}`;
  const reload = () => { viewReclutamiento().catch(() => {}); };
  const again = () => { reload(); setTimeout(() => openCandidato(id), 0); };
  const actions = [];
  if (canRecruit()) {
    if (c.etapa === 'registrado') actions.push({ label: 'Resultado 1er filtro', cls: 'primary', run: () => { setTimeout(() => resultadoForm([c], 'f1', null, again), 0); } });
    if (c.etapa === 'segundo_filtro') actions.push({ label: 'Resultado 2º filtro', cls: 'primary', run: () => { setTimeout(() => resultadoForm([c], 'f2', null, again), 0); } });
    if (c.etapa === 'seleccionado') {
      actions.push({ label: c.hoja_at ? 'Editar hoja de datos' : 'Llenar hoja de datos', cls: c.hoja_at ? '' : 'primary', run: () => { setTimeout(() => hojaForm(c, again), 0); } });
      if (c.hoja_at) actions.push({ label: 'Contratar y asignar', cls: 'primary', run: () => { setTimeout(() => asignarForm([c], again), 0); } });
    }
    if (['registrado', 'segundo_filtro', 'seleccionado'].includes(c.etapa)) actions.push({ label: c.etapa === 'seleccionado' ? 'Sin hoja de datos / descartar' : 'Descartar', cls: 'danger', run: () => { setTimeout(() => descartarForm([c], again), 0); } });
    if (c.etapa === 'descartado') actions.push({ label: 'Reactivar', run: async () => { await mustUpdate(db('candidatos').eq('id', c.id).update({ etapa: 'registrado' }), 'el candidato'); toast('Reactivado: vuelve a Por entrevistar'); again(); } });
    if (c.etapa !== 'asignado') actions.push({ label: 'Editar datos', run: async () => { setTimeout(() => candidatoForm({ existing: c }), 0); } });
    if (!c.cv_path && c.etapa !== 'asignado') actions.push({ label: 'Subir CV', run: () => { setTimeout(() => cvForm(c, again), 0); } });
  }
  if (c.employee_id && is('developer')) actions.push({ label: 'Ver ficha', run: () => { setTimeout(() => openEmployee(c.employee_id), 0); } });
  const m = modal({ title: candName(c), body, actions, wide: true });
  const a = $('#cvlink', m.el);
  if (a) storageUrl(CV_BUCKET, c.cv_path).then((u) => { a.href = u; a.removeAttribute('aria-disabled'); }).catch((e) => { a.classList.add('err'); a.title = e.message; });
  $$('[data-opendoc]', m.el).forEach((b) => b.onclick = () => { m.close(); openDocument(b.dataset.opendoc); });
}
function cvForm(c, done) {
  const fb = fileBox('cvbox2', { title: 'CV o solicitud', label: 'Subir CV (PDF, Word o foto)', hint: 'Hasta 10 MB', accept: 'image/*,application/pdf,.doc,.docx', ok: (x) => /^image\/|^application\/pdf$|wordprocessingml|msword/.test(mimeOf(x)), max: 1 });
  const m = modal({ title: 'CV · ' + candName(c), body: fb.html, actions: [{ label: 'Cancelar' }, { label: 'Subir', cls: 'primary', run: async () => { if (!fb.files.length) throw new Error('Elige el archivo.'); await uploadCv(c, fb.files[0]); toast('CV guardado'); done && done(); } }] });
  fb.wire(m.el);
}
// Resultado de filtro (uno o varios). res = null → elegir en el formulario
function resultadoForm(cs, filtro, res, done) {
  const f = [
    ...(res ? [] : [{ k: 'r', label: 'Resultado', type: 'select', req: true, options: [['', 'Elegir…'], ...Object.entries(RESULT)] }]),
    { k: 'fecha', label: 'Fecha de la entrevista', type: 'date', req: true, val: todayMX(), max: todayMX() },
    { k: 'com', label: 'Comentarios (opcional)', type: 'textarea', full: true }];
  const n = filtro === 'f1' ? '1er' : '2º';
  modal({ title: `${n} filtro · ${cs.length === 1 ? candName(cs[0]) : cs.length + ' candidatos'}${res ? ' · ' + RESULT[res] : ''}`,
    body: (cs.length > 1 ? `<div class="notice n-info">${cs.map((c) => esc(candName(c))).join(', ')}</div>` : '') + fieldsHtml(f),
    actions: [{ label: 'Cancelar' }, { label: 'Guardar', cls: 'primary', run: async ({ el }) => {
      const v = readFields(el, f); const r = res || v.r; const fails = [];
      for (const c of cs) {
        try { await mustUpdate(db('candidatos').eq('id', c.id).update({ [filtro + '_resultado']: r, [filtro + '_fecha']: v.fecha, [filtro + '_comentarios']: v.com }), 'el candidato'); }
        catch (e) { fails.push(`${candName(c)} (${e.message})`); }
      }
      RS.sel.clear();
      if (fails.length) toast('No se guardaron: ' + fails.join('; '), true); else toast(r === 'paso' ? (filtro === 'f1' ? 'Pasan al 2º filtro' : 'Seleccionados') : 'Pasan a No pasaron');
      (done || (() => viewReclutamiento()))();
    } }] });
}
function descartarForm(cs, done) {
  const f = [{ k: 'm', label: 'Motivo', type: 'select', req: true, val: cs.every((c) => c.etapa === 'seleccionado') ? DESCARTES[0] : '', options: [['', 'Elegir…'], ...DESCARTES.map((x) => [x, x])] }, { k: 'o', label: 'Detalle (opcional)', full: true }];
  modal({ title: `No pasó · ${cs.length === 1 ? candName(cs[0]) : cs.length + ' candidatos'}`, body: fieldsHtml(f),
    actions: [{ label: 'Cancelar' }, { label: 'Mover a No pasaron', cls: 'danger solid', run: async ({ el }) => {
      const v = readFields(el, f); const motivo = v.o ? `${v.m}: ${v.o}` : v.m; const fails = [];
      for (const c of cs) { try { await mustUpdate(db('candidatos').eq('id', c.id).update({ etapa: 'descartado', descarte_motivo: motivo }), 'el candidato'); } catch (e) { fails.push(`${candName(c)} (${e.message})`); } }
      RS.sel.clear(); if (fails.length) toast('No se movieron: ' + fails.join('; '), true); else toast('Movidos a No pasaron');
      (done || (() => viewReclutamiento()))();
    } }] });
}
function hojaForm(c, done) {
  const f = [
    { k: 'curp', label: 'CURP', req: true, val: c.curp || '', upper: true },
    { k: 'rfc', label: 'RFC (con homoclave)', req: true, val: c.rfc || '', upper: true },
    { k: 'nss', label: 'NSS (11 dígitos)', req: true, val: c.nss || '' },
    { k: 'fecha_nacimiento', label: 'Fecha de nacimiento', type: 'date', req: true, val: c.fecha_nacimiento || '' },
    { k: 'telefono', label: 'Teléfono', type: 'tel', req: true, val: c.telefono || '' },
    { k: 'correo', label: 'Correo', type: 'email', val: c.correo || '' },
    { k: 'domicilio', label: 'Domicilio completo', type: 'textarea', req: true, full: true, val: c.domicilio || '' },
    { k: 'contacto_emergencia', label: 'Contacto de emergencia (nombre y teléfono)', full: true, val: c.contacto_emergencia || '' }];
  modal({ title: 'Hoja de datos · ' + candName(c), wide: true,
    body: '<div class="notice n-info">Con estos datos se hace el alta en Personal al contratar. Son datos sensibles: solo los ve RH.</div>' + fieldsHtml(f),
    actions: [{ label: 'Cancelar' }, { label: 'Guardar hoja de datos', cls: 'primary', run: async ({ el }) => {
      const v = readFields(el, f);
      if (!/^[A-Z]{4}\d{6}[HM][A-Z]{5}[0-9A-Z]\d$/.test(v.curp)) throw new Error('CURP inválida.');
      if (!/^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/.test(v.rfc)) throw new Error('RFC inválido (incluye homoclave).');
      if (!/^\d{11}$/.test(String(v.nss).replace(/\D/g, ''))) throw new Error('El NSS debe tener 11 dígitos.');
      await mustUpdate(db('candidatos').eq('id', c.id).update({ ...v, hoja_at: new Date().toISOString() }), 'el candidato');
      toast('Hoja de datos guardada'); (done || (() => viewReclutamiento()))();
    } }] });
}
async function asignarForm(cs, done) {
  const sin = cs.filter((c) => !c.hoja_at);
  if (sin.length) return toast('Falta la hoja de datos de: ' + sin.map(candName).join(', '), true);
  const areas = [...new Set(cs.map((c) => c.area_id))];
  if (areas.length > 1) return toast('Asigna por separado a candidatos de áreas distintas', true);
  const sups = await rpc('supervisores_de', { p_area: areas[0] }).catch(() => []);
  if (!sups.length) return toast('No hay supervisores activos en ' + areaName(areas[0]), true);
  const alert = cs.filter((c) => c.alerta);
  const f = [
    { k: 'sup', label: 'Supervisor que lo recibe', type: 'select', req: true, val: sups.length === 1 ? sups[0].id : '', options: [['', 'Elegir…'], ...sups.map((s) => [s.id, s.full_name])] },
    { k: 'ing', label: 'Fecha de ingreso', type: 'date', req: true, val: todayMX() },
    { k: 'ct', label: 'Tipo de contrato', type: 'select', req: true, options: [['', 'Elegir…'], ...Object.entries(CONTRATOS)], full: true }];
  modal({ title: `Contratar · ${cs.length === 1 ? candName(cs[0]) : cs.length + ' candidatos'}`, wide: true,
    body: `${alert.length ? `<div class="notice n-bad">${alert.map((c) => `<b>${esc(candName(c))}</b>: ${esc(c.alerta)}`).join('<br>')}${is('developer') ? '<br>Puedes continuar bajo tu responsabilidad.' : '<br>Solo Daniel puede contratarlo.'}</div>` : ''}
      <div class="notice n-info">Se hará el alta pendiente en Personal con la hoja de datos y se generarán <b>contrato, reglamento interior y acuerdo de confidencialidad</b> para imprimir y firmar. Daniel acepta el alta cuando los 3 estén firmados y subidos.</div>${fieldsHtml(f)}`,
    actions: [{ label: 'Cancelar' }, { label: 'Contratar', cls: 'primary', run: async ({ el }) => {
      const v = readFields(el, f);
      const n = await rpc('cand_asignar', { p_ids: cs.map((c) => c.id), p_supervisor: v.sup, p_fecha_ingreso: v.ing, p_contrato: v.ct });
      RS.sel.clear(); RS.etapa = 'asignado';
      toast(`${Array.isArray(n) ? n[0] : n} contratado(s) · imprime y sube los documentos firmados`);
      (done || (() => viewReclutamiento()))();
    } }] });
}
async function purgeCandidatos(cands) {
  const lim = addDays(todayMX(), -183);
  const old = cands.filter((c) => c.etapa === 'descartado' && String(c.updated_at).slice(0, 10) < lim);
  if (!old.length) return toast('No hay registros de más de 6 meses');
  if (!(await confirmBox('Depurar candidatos', `Se borrarán definitivamente <b>${old.length}</b> candidatos que no pasaron hace más de 6 meses, con sus CV. Esto cumple con no conservar datos personales más tiempo del necesario.`, { danger: true, okLabel: 'Borrar' }))) return;
  const paths = old.map((c) => c.cv_path).filter(Boolean);
  if (paths.length) await storageRemove(CV_BUCKET, paths).catch(() => {});
  await db('candidatos').in('id', old.map((c) => c.id)).remove();
  toast(`${old.length} candidatos depurados`); viewReclutamiento();
}

// ───────────────────────── Pre-nómina ─────────────────────────
// Nómina arma el periodo y lo autoriza; Daniel y Dirección (Wendy y Emma) solo consultan.
// Base: salario diario × días pagados. Faltas, retardos, permisos y festivos trabajados salen del pase de lista.
// Todos los importes los calcula la base de datos; aquí solo se capturan y se muestran.
const BANCOS = {
  '002': 'BANAMEX', '012': 'BBVA', '014': 'SANTANDER', '021': 'HSBC', '030': 'BAJIO', '036': 'INBURSA', '044': 'SCOTIABANK',
  '058': 'BANREGIO', '072': 'BANORTE', '127': 'BANCO AZTECA', '130': 'COMPARTAMOS', '137': 'BANCOPPEL', '167': 'HEY BANCO',
  '638': 'NU MEXICO', '646': 'STP', '722': 'MERCADO PAGO', '728': 'SPIN BY OXXO'
};
const clabeDigits = (c) => String(c || '').replace(/[\s.\-]/g, '');
const clabeOk = (c) => {
  const d = clabeDigits(c); if (!/^\d{18}$/.test(d)) return false;
  const w = [3, 7, 1]; let s = 0; for (let i = 0; i < 17; i++) s += (Number(d[i]) * w[i % 3]) % 10;
  return (10 - (s % 10)) % 10 === Number(d[17]);
};
const bancoDeClabe = (c) => BANCOS[clabeDigits(c).slice(0, 3)] || '';
const NOM_PERC = [['chips', 'Pago de chips'], ['pendiente', 'Pendiente de pago'], ['com_admin', 'Comisión administrativo'], ['bono_referido', 'Bono de referido'],
  ['com_asesores', 'Comisión asesores'], ['com_lideres', 'Comisión líderes'], ['hrs_dobles', 'Horas dobles'], ['horas_extras', 'Horas extras']];
const NOM_DED = [['otras_deducciones', 'Otras deducciones'], ['multas_disciplina', 'Multas por disciplina'], ['multas_retardo', 'Multas por retardo']];
const NOM_AUTO = { salario_diario: 'Salario diario', dias_no_lab: 'Días no laborados', faltas: 'Faltas', festivo: 'Pago día festivo', prima_vacacional: 'Prima vacacional', clabe: 'CLABE', banco: 'Banco', beneficiario: 'Beneficiario' };
const NS = { periodo: null, q: '', filtro: '', tab: null, sec: 'nomina' };
const num = (n) => Number(n || 0);
const r2 = (n) => Math.round((num(n) + Number.EPSILON) * 100) / 100;
const hhmm = (min) => { const m = num(min); return m ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}` : ''; };
function parseHHMM(s) {
  s = String(s || '').trim(); if (!s) return 0;
  const m = s.match(/^(\d{1,3})(?::(\d{1,2}))?$/); if (!m || Number(m[2] || 0) > 59) throw new Error('Permisos: escribe horas:minutos, por ejemplo 2:30');
  return Number(m[1]) * 60 + Number(m[2] || 0);
}
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();   // m: 1-12
function periodoTitulo(p) {
  const [y1, m1, d1] = p.fecha_inicio.split('-').map(Number); const [y2, m2, d2] = p.fecha_fin.split('-').map(Number);
  const rango = m1 === m2 && y1 === y2 ? `${d1} al ${d2} de ${MESES[m2 - 1]} ${y2}` : `${d1} de ${MESES[m1 - 1]}${y1 !== y2 ? ' ' + y1 : ''} al ${d2} de ${MESES[m2 - 1]} ${y2}`;
  return (p.numero ? `Periodo ${p.numero} · ` : '') + rango;
}
// Días de descanso obligatorio (Art. 74 LFT)
function festivosLFT(y) {
  const nthMon = (m, n) => { const d = new Date(Date.UTC(y, m - 1, 1)); const off = (8 - d.getUTCDay()) % 7; return `${y}-${String(m).padStart(2, '0')}-${String(1 + off + (n - 1) * 7).padStart(2, '0')}`; };
  const out = [[`${y}-01-01`, 'Año Nuevo'], [nthMon(2, 1), 'Día de la Constitución'], [nthMon(3, 3), 'Natalicio de Benito Juárez'], [`${y}-05-01`, 'Día del Trabajo'],
    [`${y}-09-16`, 'Independencia'], [nthMon(11, 3), 'Revolución Mexicana'], [`${y}-12-25`, 'Navidad']];
  if ((y - 2024) % 6 === 0) out.push([`${y}-10-01`, 'Transmisión del Poder Ejecutivo']);
  return out;
}
function festivosEn(ini, fin) {
  if (!ini || !fin) return [];
  const ys = new Set([Number(ini.slice(0, 4)), Number(fin.slice(0, 4))]);
  return [...ys].flatMap(festivosLFT).filter(([d]) => d >= ini && d <= fin).sort();
}
const festivoNombre = (d) => (festivosLFT(Number(d.slice(0, 4))).find(([x]) => x === d) || [null, 'Día festivo'])[1];
function siguientePeriodo(last) {
  let y, m, half;
  if (last) {
    const [ly, lm, ld] = last.fecha_fin.split('-').map(Number);
    if (ld <= 15) { y = ly; m = lm; half = 2; } else { y = lm === 12 ? ly + 1 : ly; m = lm === 12 ? 1 : lm + 1; half = 1; }
  } else {
    const [ty, tm, td] = todayMX().split('-').map(Number); y = ty; m = tm; half = td <= 15 ? 1 : 2;
  }
  const mm = String(m).padStart(2, '0');
  return { numero: last && last.numero ? last.numero + 1 : null, fecha_inicio: `${y}-${mm}-${half === 1 ? '01' : '16'}`, fecha_fin: `${y}-${mm}-${half === 1 ? '15' : lastDay(y, m)}`, dias: 15 };
}
// Revisión automática de cada línea: [nivel, clave, texto]
const normTok = (s) => norm(s).replace(/[^a-z ]/g, ' ').split(/\s+/).filter((t) => t.length > 2);
function lineaAlertas(l) {
  const a = [];
  if (!num(l.salario_diario)) a.push(['bad', 'sinsal', 'Sin salario diario']);
  if (!l.clabe) a.push(['bad', 'sinclabe', 'Sin CLABE']);
  if (l.beneficiario) {
    const n = normTok(l.nombre), b = normTok(l.beneficiario);
    const comunes = b.filter((t) => n.includes(t)).length;
    if (comunes < 2) a.push(['warn', 'tercero', 'Cuenta a nombre de otra persona']);
    else if (n.join(' ') !== b.join(' ')) a.push(['info', 'benef', 'Beneficiario escrito distinto al nombre']);
  }
  if (!l.fecha_ingreso) a.push(['warn', 'sining', 'Sin fecha de ingreso en la app']);
  if (num(l.dias_no_lab)) a.push(['info', 'parcial', `${l.dias_no_lab} días no laborados (${l.fecha_baja ? 'baja ' + fmtDate(l.fecha_baja) : 'ingreso ' + fmtDate(l.fecha_ingreso)})`]);
  if (num(l.faltas) > 3) a.push(['warn', 'faltas', `${l.faltas} faltas en el periodo`]);
  if (num(l.vacaciones_dias)) a.push(['info', 'vacaciones', `${l.vacaciones_dias} días de vacaciones`]);
  if ((l.ajustados || []).length) a.push(['info', 'ajuste', 'Ajustado a mano: ' + l.ajustados.map((k) => NOM_AUTO[k] || k).join(', ')]);
  if (num(l.neto) <= 0) a.push(['bad', 'neto', 'Neto en cero o negativo']);
  return a;
}
const ALERTA_FILTROS = [['sinsal', 'Sin salario'], ['sinclabe', 'Sin CLABE'], ['tercero', 'Cuenta de tercero'], ['sining', 'Sin fecha de ingreso'], ['parcial', 'Ingreso/baja en el periodo'], ['faltas', 'Más de 3 faltas'], ['ajuste', 'Ajustes manuales'], ['vacaciones', 'Con vacaciones'], ['neto', 'Neto en cero']];
const nivelBadge = { bad: 'b-bad', warn: 'b-warn', info: 'b-acc' };

// ───── Pre-nómina al día: calendario de la quincena con lo devengado en tiempo real ─────
// Devengado por día = salario diario × (días a pagar ÷ días del periodo); una falta del pase de lista descuenta el
// salario diario; un día festivo trabajado suma el doble. Hoy hacia atrás es real; mañana en adelante es proyección.
const kMoney = (v) => { const a = Math.abs(num(v)), sg = num(v) < 0 ? '−' : ''; return a >= 1e6 ? `${sg}$${(a / 1e6).toFixed(2)} M` : a >= 1e3 ? `${sg}$${(a / 1e3).toFixed(a >= 1e5 ? 0 : 1)}k` : `${sg}$${Math.round(a)}`; };
const AD = { ini: null, area: '', grupo: '', timer: null, sel: null };
function quincenaDe(iso) {
  const [y, m, d] = iso.split('-').map(Number); const mm = String(m).padStart(2, '0');
  return d <= 15 ? { ini: `${y}-${mm}-01`, fin: `${y}-${mm}-15` } : { ini: `${y}-${mm}-16`, fin: `${y}-${mm}-${lastDay(y, m)}` };
}
function quincenaMover(ini, n) {
  const [y, m, d] = ini.split('-').map(Number);
  let k = (y * 12 + (m - 1)) * 2 + (d > 15 ? 1 : 0) + n;
  const yy = Math.floor(k / 24); k -= yy * 24; const mm = Math.floor(k / 2) + 1; const half = k % 2;
  return quincenaDe(`${yy}-${String(mm).padStart(2, '0')}-${half ? '16' : '01'}`).ini;
}
const prnTabs = (on) => `<div class="ex-tabs" role="tablist" style="margin-bottom:14px"><button type="button" role="tab" data-ptab="dia" class="${on === 'dia' ? 'on' : ''}">Al día</button><button type="button" role="tab" data-ptab="periodos" class="${on === 'periodos' ? 'on' : ''}">Periodos y autorización</button></div>`;
function bindPrnTabs() { $$('[data-ptab]').forEach((b) => b.onclick = () => { NS.tab = b.dataset.ptab; viewPrenomina(); }); }
async function viewPrenomina() {
  clearInterval(AD.timer);
  if ((NS.tab || 'dia') === 'periodos') { await viewPrenominaPeriodos(); $('#view').insertAdjacentHTML('afterbegin', prnTabs('periodos')); bindPrnTabs(); return; }
  return viewPrenominaDia();
}

function calcAlDia(rows, ini, fin) {
  const hoy = todayMX();
  const dias = []; for (let d = ini; d <= fin; d = addDays(d, 1)) dias.push(d);
  const factor = 15 / dias.length;                 // la quincena se paga a 15 días
  const fest = new Set(festivosEn(ini, fin).map(([d]) => d));
  const porDia = dias.map((d) => ({ d, real: d <= hoy, monto: 0, faltas: [], altas: [], bajas: [], festivoLab: 0, activos: 0 }));
  const personas = rows.map((r) => {
    const sal = num(r.salario_diario), fs = new Set(r.faltas || []), as = new Set(r.asistencias || []);
    let acum = 0, proy = 0, faltasHoy = 0, diasTrans = 0, ahorro = 0;
    dias.forEach((d, i) => {
      const activo = (!r.fecha_ingreso || d >= r.fecha_ingreso) && (!r.fecha_baja || d <= r.fecha_baja);
      const pd = porDia[i];
      if (r.fecha_ingreso === d) pd.altas.push(r.nombre);
      if (r.fecha_baja === d) pd.bajas.push(r.nombre);
      if (!activo) return;
      pd.activos++;
      let m = sal * factor;
      if (pd.real) {
        diasTrans++;
        if (fs.has(d) && !fest.has(d)) { m -= sal; ahorro += sal; faltasHoy++; pd.faltas.push(r.nombre); }
        if (fest.has(d) && as.has(d)) { m += sal * 2; pd.festivoLab++; }
        acum += m;
      }
      proy += m;
      pd.monto += m;
    });
    return { ...r, sal, acum: r2(acum), proy: r2(proy), faltasHoy, diasTrans, ahorro: r2(ahorro) };
  });
  let run = 0; porDia.forEach((p) => { p.monto = r2(p.monto); run += p.monto; p.acum = r2(run); });
  const real = porDia.filter((p) => p.real);
  return { dias, porDia, personas, factor, fest, hoy,
    acumulado: real.length ? real[real.length - 1].acum : 0, proyeccion: porDia.length ? porDia[porDia.length - 1].acum : 0,
    ahorro: r2(personas.reduce((s, p) => s + p.ahorro, 0)), faltas: personas.reduce((s, p) => s + p.faltasHoy, 0),
    sinSalario: personas.filter((p) => !p.sal).length };
}

async function viewPrenominaDia() {
  const v = $('#view');
  if (!AD.ini) AD.ini = quincenaDe(todayMX()).ini;
  const { ini, fin } = quincenaDe(AD.ini);
  const all = await rpc('nomina_al_dia', { p_ini: ini, p_fin: fin });
  const rows = all.filter((r) => (!AD.area || r.area_id === AD.area) && (!AD.grupo || (AD.grupo === 'none' ? !r.group_id : r.group_id === AD.grupo)));
  const c = calcAlDia(rows, ini, fin);
  const enCurso = ini <= c.hoy && c.hoy <= fin, pasada = fin < c.hoy;
  const areas = [...new Set(all.map((r) => r.area_id))].map((id) => [id, areaName(id)]).sort((a, b) => a[1].localeCompare(b[1], 'es'));
  const grupos = S.groups.filter((g) => all.some((r) => r.group_id === g.id) && (!AD.area || g.area_id === AD.area));
  const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const pad = (new Date(ini + 'T12:00:00Z').getUTCDay() + 6) % 7;
  const titulo = periodoTitulo({ fecha_inicio: ini, fecha_fin: fin });
  v.innerHTML = prnTabs('dia') + `
    <div class="pagehead"><div><h1>Pre-nómina al día</h1><div class="muted small">${esc(titulo)} · ${enCurso ? `al ${fmtDate(c.hoy)}, se actualiza sola cada minuto` : pasada ? 'quincena cerrada' : 'quincena por iniciar (todo es proyección)'}</div></div>
      <div class="row" style="gap:6px"><button type="button" class="btn sm" id="ad_prev">‹ Anterior</button>${enCurso ? '' : '<button type="button" class="btn sm" id="ad_hoy">Quincena actual</button>'}<button type="button" class="btn sm" id="ad_next">Siguiente ›</button></div></div>
    <div class="card pad" style="margin-bottom:12px">
      <div class="row" style="gap:8px;margin-bottom:12px">
        ${areas.length > 1 ? `<select class="inp" id="ad_area" aria-label="Área"><option value="">Todas las áreas</option>${areas.map(([id, n]) => `<option value="${id}"${AD.area === id ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select>` : ''}
        <select class="inp" id="ad_grupo" aria-label="Grupo"><option value="">Todos los grupos</option>${grupos.map((g) => `<option value="${g.id}"${AD.grupo === g.id ? ' selected' : ''}>${!AD.area && areas.length > 1 ? esc(areaName(g.area_id)) + ' · ' : ''}${esc(g.name)}</option>`).join('')}<option value="none"${AD.grupo === 'none' ? ' selected' : ''}>Sin grupo</option></select>
        <span class="small muted grow" style="text-align:right">${rows.length} personas</span>
      </div>
      <div class="ad-kpis">
        <div><div class="eyebrow">Acumulado a hoy</div><div class="ad-big">${money(c.acumulado)}</div><div class="small muted">${c.porDia.filter((p) => p.real).length} de ${c.dias.length} días</div></div>
        <div><div class="eyebrow">Proyección al cierre</div><div class="ad-big" style="color:var(--muted)">${money(c.proyeccion)}</div><div class="small muted">si nadie falta más</div></div>
        <div><div class="eyebrow">Descontado por faltas</div><div class="ad-big" style="color:var(--bad)">${money(c.ahorro)}</div><div class="small muted">${c.faltas} falta${c.faltas === 1 ? '' : 's'} a hoy</div></div>
      </div>
      ${c.sinSalario ? `<div class="notice n-warn" style="margin-top:10px">${c.sinSalario} persona${c.sinSalario === 1 ? '' : 's'} sin salario diario en su ficha: no suman al acumulado.</div>` : ''}
    </div>
    <div class="card pad" style="margin-bottom:12px"><div class="eyebrow" style="margin-bottom:8px">Avance del acumulado</div><div id="ad_chart"></div></div>
    <div class="card pad" style="margin-bottom:12px">
      <div class="eyebrow" style="margin-bottom:8px">Calendario · toca un día para ver el detalle</div>
      <div class="ad-cal">${DOW.map((d) => `<div class="ex-dow">${d}</div>`).join('')}${'<div></div>'.repeat(pad)}
        ${c.porDia.map((p) => `<button type="button" class="ad-day${p.real ? '' : ' fut'}${p.d === c.hoy ? ' hoy' : ''}" data-day="${p.d}">
          <span class="row" style="justify-content:space-between;flex-wrap:nowrap"><b>${Number(p.d.slice(8))}</b>${c.fest.has(p.d) ? '<span title="Día festivo">★</span>' : ''}${p.faltas.length ? `<span class="ad-f" title="Faltas">${p.faltas.length} F</span>` : ''}</span>
          <span class="ad-m" title="Generado ese día: ${esc(money(p.monto))}">${kMoney(p.monto)}</span><span class="ad-a" title="Acumulado: ${esc(money(p.acum))}">Σ ${kMoney(p.acum)}</span></button>`).join('')}</div>
      <div class="small muted" style="margin-top:8px">Cada día: lo generado ese día y el acumulado (Σ), en miles (k = mil pesos). Los días después de hoy son proyección. ${c.factor !== 1 ? `Esta quincena tiene ${c.dias.length} días y se paga a 15: cada día vale ${(c.factor).toFixed(3)} del salario diario.` : ''}</div>
    </div>
    <div class="card scrollx"><table class="tbl" id="ad_tbl"><thead><tr><th>Nombre</th><th>Depto.</th><th style="text-align:right">Sal. diario</th><th style="text-align:right">Días</th><th style="text-align:right">Faltas</th><th style="text-align:right">Acumulado</th><th style="text-align:right">Proyección</th></tr></thead><tbody>
      ${c.personas.slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')).map((p) => `<tr><td style="min-width:170px"><b>${esc(p.nombre)}</b>${p.fecha_ingreso && p.fecha_ingreso >= ini ? `<br><span class="small muted">Ingresó ${fmtDate(p.fecha_ingreso)}</span>` : ''}${p.fecha_baja ? `<br><span class="small" style="color:var(--bad)">Baja ${fmtDate(p.fecha_baja)}</span>` : ''}</td>
        <td class="small">${esc(p.departamento || '')}</td><td class="mono" style="text-align:right">${p.sal ? money(p.sal) : '<span style="color:var(--warn)">Sin salario</span>'}</td>
        <td class="mono" style="text-align:right">${p.diasTrans}</td><td class="mono" style="text-align:right;${p.faltasHoy ? 'color:var(--bad);font-weight:700' : ''}">${p.faltasHoy || ''}</td>
        <td class="mono" style="text-align:right"><b>${money(p.acum)}</b></td><td class="mono muted" style="text-align:right">${money(p.proy)}</td></tr>`).join('')}
      <tr class="ad-tot"><td colspan="5"><b>Total</b></td><td class="mono" style="text-align:right"><b>${money(c.acumulado)}</b></td><td class="mono" style="text-align:right">${money(c.proyeccion)}</td></tr>
      </tbody></table></div>`;
  bindPrnTabs();
  dibujarAvance($('#ad_chart'), c);
  $('#ad_prev').onclick = () => { AD.ini = quincenaMover(ini, -1); viewPrenomina(); };
  $('#ad_next').onclick = () => { AD.ini = quincenaMover(ini, 1); viewPrenomina(); };
  const h = $('#ad_hoy'); if (h) h.onclick = () => { AD.ini = null; viewPrenomina(); };
  const sa = $('#ad_area'); if (sa) sa.onchange = (e) => { AD.area = e.target.value; AD.grupo = ''; viewPrenomina(); };
  $('#ad_grupo').onchange = (e) => { AD.grupo = e.target.value; viewPrenomina(); };
  $$('[data-day]').forEach((b) => b.onclick = () => detalleDia(c, c.porDia.find((p) => p.d === b.dataset.day)));
  if (enCurso) AD.timer = setInterval(() => { if (S.view !== 'prenomina' || (NS.tab || 'dia') !== 'dia' || !$('#ad_tbl')) { clearInterval(AD.timer); return; } if (!document.hidden && !$('.modal-bg')) viewPrenominaDia().catch(() => {}); }, 60000);
}

function detalleDia(c, p) {
  modal({ title: `${dayLabel(p.d)}${c.fest.has(p.d) ? ' · ' + festivoNombre(p.d) : ''}`, body: `
    <div class="kv"><span>Estado</span><span>${p.real ? (p.d === c.hoy ? 'Hoy' : 'Día transcurrido') : 'Proyección'}</span>
      <span>Personas activas</span><span>${p.activos}</span><span>Generado ese día</span><span class="mono">${money(p.monto)}</span><span>Acumulado</span><span class="mono"><b>${money(p.acum)}</b></span>
      ${p.festivoLab ? `<span>Festivo trabajado</span><span>${p.festivoLab} personas (pago doble)</span>` : ''}</div>
    ${p.faltas.length ? `<div class="eyebrow" style="margin:12px 0 6px">Faltas (${p.faltas.length})</div><div class="list">${p.faltas.map((n) => `<div class="item small">${esc(n)}</div>`).join('')}</div>` : p.real ? '<div class="small muted" style="margin-top:10px">Sin faltas registradas ese día.</div>' : ''}
    ${p.altas.length ? `<div class="eyebrow" style="margin:12px 0 6px">Ingresos</div><div class="small">${p.altas.map(esc).join(', ')}</div>` : ''}
    ${p.bajas.length ? `<div class="eyebrow" style="margin:12px 0 6px">Último día (baja)</div><div class="small">${p.bajas.map(esc).join(', ')}</div>` : ''}`,
    actions: [{ label: 'Cerrar' }] });
}

// Gráfica: acumulado real (línea sólida) y proyección (punteada), un solo eje de pesos, con detalle al pasar el dedo/ratón
function dibujarAvance(box, c) {
  if (!box || !c.porDia.length) return;
  const W = Math.max(280, box.clientWidth || 600), H = 190, L = 64, R = 14, T = 12, B = 26;
  const max = Math.max(1, ...c.porDia.map((p) => p.acum)) * 1.08;
  const n = c.porDia.length, x = (i) => L + (n === 1 ? 0 : i * (W - L - R) / (n - 1)), y = (v) => T + (H - T - B) * (1 - v / max);
  const realIdx = c.porDia.map((p, i) => (p.real ? i : -1)).filter((i) => i >= 0); const last = realIdx.length ? realIdx[realIdx.length - 1] : -1;
  const path = (idx) => idx.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(c.porDia[i].acum).toFixed(1)}`).join(' ');
  const proyIdx = c.porDia.map((_, i) => i).filter((i) => i >= Math.max(last, 0));
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max / 1.08 * f);
  const kfmt = (v) => v >= 1e6 ? '$' + (v / 1e6).toFixed(1) + ' M' : v >= 1e3 ? '$' + Math.round(v / 1e3) + ' mil' : '$' + Math.round(v);
  box.innerHTML = `<div class="row small" style="gap:14px;margin-bottom:6px"><span><i class="ad-lg real"></i> Acumulado real</span><span><i class="ad-lg proy"></i> Proyección</span></div>
    <svg width="100%" viewBox="0 0 ${W} ${H}" role="img" aria-label="Acumulado de la quincena: ${money(c.acumulado)} a hoy, proyección ${money(c.proyeccion)}" style="display:block;overflow:visible">
    ${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 8}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="var(--muted)">${kfmt(t)}</text>`).join('')}
    ${c.porDia.map((p, i) => (i % Math.ceil(n / 8) === 0 || i === n - 1) ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" font-size="11" fill="var(--muted)">${Number(p.d.slice(8))}</text>` : '').join('')}
    ${proyIdx.length > 1 ? `<path d="${path(proyIdx)}" fill="none" stroke="var(--muted)" stroke-width="2" stroke-dasharray="5 4"/>` : ''}
    ${realIdx.length ? `<path d="${path(realIdx)}" fill="none" stroke="var(--accent)" stroke-width="2.5"/><circle cx="${x(last)}" cy="${y(c.porDia[last].acum)}" r="5" fill="var(--accent)" stroke="var(--card)" stroke-width="2"/>` : ''}
    <line id="ad_x" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="var(--line2)" stroke-width="1" visibility="hidden"/>
    <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" id="ad_hit"/></svg><div class="ad-tip" id="ad_tip" hidden></div>`;
  const hit = $('#ad_hit', box), tip = $('#ad_tip', box), cx = $('#ad_x', box), svg = $('svg', box);
  const show = (ev) => {
    const r = svg.getBoundingClientRect(); const px = (ev.clientX - r.left) * W / r.width;
    const i = Math.max(0, Math.min(n - 1, Math.round((px - L) / ((W - L - R) / Math.max(1, n - 1)))));
    const p = c.porDia[i];
    cx.setAttribute('x1', x(i)); cx.setAttribute('x2', x(i)); cx.setAttribute('visibility', 'visible');
    tip.hidden = false; tip.innerHTML = `<b>${esc(dayLabel(p.d))}</b>${p.real ? '' : ' · proyección'}<br>Acumulado <b>${money(p.acum)}</b><br>Ese día ${money(p.monto)}${p.faltas.length ? ` · ${p.faltas.length} faltas` : ''}`;
    const left = Math.min(r.width - 170, Math.max(0, x(i) * r.width / W - 80)); tip.style.left = left + 'px';
  };
  hit.addEventListener('pointermove', show); hit.addEventListener('pointerdown', show);
  hit.addEventListener('pointerleave', () => { tip.hidden = true; cx.setAttribute('visibility', 'hidden'); });
}

async function viewPrenominaPeriodos() {
  const v = $('#view'); NOM_PERSONAS = null;
  const periodos = await db('nomina_periodos').order('fecha_inicio', false).get();
  const canEdit = is('nomina');
  if (!periodos.length) {
    v.innerHTML = `<div class="pagehead"><div><h1>Pre-nómina</h1><div class="muted small">Aún no hay periodos</div></div>${canEdit ? '<button class="btn primary" id="np_new">+ Nuevo periodo</button>' : ''}</div>
      <div class="card empty">${canEdit ? 'Crea el primer periodo: la app toma a todo el personal activo, su salario y las faltas del pase de lista.' : 'Nómina todavía no ha armado ninguna pre-nómina.'}</div>`;
    const b = $('#np_new'); if (b) b.onclick = () => periodoForm(null, periodos);
    return;
  }
  if (!NS.periodo || !periodos.some((p) => p.id === NS.periodo)) NS.periodo = periodos[0].id;
  const p = periodos.find((x) => x.id === NS.periodo);
  const [lineas, fins, pagos, pendFin] = await Promise.all([
    db('nomina_lineas').eq('periodo_id', p.id).order('nombre').getAll(),
    db('nomina_finiquitos').eq('periodo_id', p.id).order('nombre').getAll(),
    db('nomina_pagos').eq('periodo_id', p.id).order('nombre').getAll(),
    db('nomina_finiquitos').is('periodo_id', 'null').eq('cancelado', false).order('fecha_baja').getAll()]);
  const borr = p.estado === 'borrador', edit = canEdit && borr;
  const sec = ['nomina', 'fin', 'pagos'].includes(NS.sec) ? NS.sec : 'nomina';
  const totFin = r2(fins.reduce((s, f) => s + num(f.total), 0)), totPag = r2(pagos.reduce((s, x) => s + num(x.monto), 0));
  const tot = (k) => r2(lineas.reduce((s, l) => s + num(l[k]), 0));
  const deducc = r2(tot('faltas_monto') + tot('otras_deducciones') + tot('permisos_monto') + tot('multas_disciplina') + tot('multas_retardo'));
  const al = new Map(lineas.map((l) => [l.id, lineaAlertas(l)]));
  const cuenta = {}; for (const xs of al.values()) for (const [, k] of xs) cuenta[k] = (cuenta[k] || 0) + 1;
  const bad = [...al.values()].filter((xs) => xs.some((x) => x[0] === 'bad')).length;
  const q = norm(NS.q);
  const rows = lineas.map((l, i) => ({ l, i })).filter(({ l }) => (!q || norm(`${l.nombre} ${l.num_empleado || ''} ${l.departamento || ''}`).includes(q))
    && (!NS.filtro || al.get(l.id).some((x) => x[1] === NS.filtro)));
  v.innerHTML = `<div class="pagehead"><div><h1>Pre-nómina</h1><div class="muted small">${esc(periodoTitulo(p))}</div></div>
      <div class="row" style="gap:8px">
        <select class="inp" id="np_sel" aria-label="Periodo">${periodos.map((x) => `<option value="${x.id}"${x.id === p.id ? ' selected' : ''}>${esc(periodoTitulo(x))}${x.estado === 'autorizado' ? ' ✓' : ''}</option>`).join('')}</select>
        ${canEdit ? '<button class="btn" id="np_new">+ Nuevo periodo</button>' : ''}
        <button class="btn primary" id="np_xls">Descargar Excel</button></div></div>
    <div class="card pad" style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">
      <div class="row" style="gap:8px;align-items:center">
        ${borr ? '<span class="badge b-warn">Borrador</span>' : '<span class="badge b-ok">Autorizada</span>'}
        <span class="small muted grow">${p.dias} días a pagar${p.festivos.length ? ' · festivo: ' + p.festivos.map((d) => `${fmtDate(d)} (${esc(festivoNombre(d))})`).join(', ') : ''}${p.generado_at ? ' · calculada ' + fmtDateTime(p.generado_at) : ''}
          ${!borr ? ` · autorizó ${esc(profName(p.autorizado_by))} el ${fmtDateTime(p.autorizado_at)}` : ''}</span>
        ${edit ? `<button class="btn sm" id="np_edit">Editar periodo</button><button class="btn sm" id="np_add">+ Agregar persona</button><button class="btn sm" id="np_calc">Recalcular</button><button class="btn sm primary" id="np_auth">Autorizar</button>` : ''}
        ${canEdit && !borr ? '<button class="btn sm" id="np_open">Reabrir</button>' : ''}
      </div>
      ${p.reabierto_motivo && borr ? `<div class="notice n-warn">Reabierta: ${esc(p.reabierto_motivo)}</div>` : ''}
      ${p.notas ? `<div class="small muted">Notas: ${esc(p.notas)}</div>` : ''}
      ${edit ? '<div class="notice n-info">Las faltas, retardos, días festivos trabajados, altas y bajas salen solos del pase de lista. Toca a una persona para capturar comisiones o corregir algo; los cambios a mano quedan marcados y el recálculo los respeta.</div>' : ''}
      <div class="row" style="gap:18px;flex-wrap:wrap">
        <div><div class="eyebrow">Personas</div><b style="font-size:20px">${lineas.length}</b></div>
        <div><div class="eyebrow">Percepciones</div><b style="font-size:20px">${money(tot('total_percepciones'))}</b></div>
        <div><div class="eyebrow">Deducciones</div><b style="font-size:20px">${money(deducc)}</b></div>
        <div><div class="eyebrow">Neto nómina</div><b style="font-size:20px">${money(tot('neto'))}</b></div>
        <div><div class="eyebrow">Finiquitos (${fins.length})</div><b style="font-size:20px">${money(totFin)}</b></div>
        <div><div class="eyebrow">Pagos pendientes (${pagos.length})</div><b style="font-size:20px">${money(totPag)}</b></div>
        <div><div class="eyebrow">Total a dispersar</div><b style="font-size:20px;color:var(--ok)">${money(r2(tot('neto') + totFin + totPag))}</b></div>
      </div>
      ${edit && pendFin.length ? `<div class="notice n-warn">${pendFin.length === 1 ? 'Hay 1 finiquito pendiente' : `Hay ${pendFin.length} finiquitos pendientes`} sin quincena (${pendFin.slice(0, 4).map((f) => esc(f.nombre)).join(', ')}${pendFin.length > 4 ? '…' : ''}). Agrégalos desde la pestaña Finiquitos.</div>` : ''}
    </div>
    <div class="row" style="gap:6px;margin-bottom:12px">
      <button type="button" class="btn sm${sec === 'nomina' ? ' primary' : ''}" data-nsec="nomina">Nómina (${lineas.length})</button>
      <button type="button" class="btn sm${sec === 'fin' ? ' primary' : ''}" data-nsec="fin">Finiquitos (${fins.length})</button>
      <button type="button" class="btn sm${sec === 'pagos' ? ' primary' : ''}" data-nsec="pagos">Pagos pendientes (${pagos.length})</button>
    </div>
    ${sec === 'fin' ? finiquitosHtml(fins, edit) : sec === 'pagos' ? pagosHtml(pagos, edit) : `<div class="card pad" style="display:flex;flex-direction:column;gap:10px;margin-bottom:12px">
      ${Object.keys(cuenta).length ? `<div><div class="eyebrow" style="margin-bottom:6px">Revisión automática${bad ? ` · <span style="color:var(--bad)">${bad} con pendientes</span>` : ''}</div><div class="row" style="gap:6px">
        <button type="button" class="btn sm${NS.filtro ? '' : ' primary'}" data-nf="">Todos (${lineas.length})</button>
        ${ALERTA_FILTROS.filter(([k]) => cuenta[k]).map(([k, t]) => `<button type="button" class="btn sm${NS.filtro === k ? ' primary' : ''}" data-nf="${k}">${esc(t)} (${cuenta[k]})</button>`).join('')}</div></div>` : ''}
      <input class="inp" id="np_q" type="search" placeholder="Buscar por nombre, número o departamento" value="${esc(NS.q)}" aria-label="Buscar">
    </div>
    ${lineas.length ? `<div class="card scrollx"><table class="tbl" id="np_tbl"><thead><tr><th>#</th><th>Nombre</th><th>Depto.</th><th style="text-align:right">Sal. diario</th><th style="text-align:right">Días</th><th style="text-align:right">Nómina</th><th style="text-align:right">Otras percep.</th><th style="text-align:right">Faltas</th><th style="text-align:right">Deducc.</th><th style="text-align:right">Neto</th><th>Revisión</th></tr></thead><tbody>
      ${rows.map(({ l, i }) => { const xs = al.get(l.id); const ded = r2(num(l.faltas_monto) + num(l.otras_deducciones) + num(l.permisos_monto) + num(l.multas_disciplina) + num(l.multas_retardo));
        return `<tr data-nl="${l.id}" style="cursor:pointer"><td class="mono small muted">${i + 1}</td><td style="min-width:170px"><b>${esc(l.nombre)}</b>${l.num_empleado ? `<br><span class="small muted mono">${esc(l.num_empleado)}</span>` : ''}</td><td class="small">${esc(l.departamento || '—')}</td>
          <td class="mono" style="text-align:right">${money(l.salario_diario)}</td><td class="mono" style="text-align:right">${l.dias_pagados}</td><td class="mono" style="text-align:right">${money(l.nomina)}</td>
          <td class="mono" style="text-align:right">${money(r2(num(l.total_percepciones) - num(l.nomina)))}</td><td class="mono" style="text-align:right">${l.faltas || ''}</td><td class="mono" style="text-align:right">${ded ? money(ded) : ''}</td>
          <td class="mono" style="text-align:right"><b>${money(l.neto)}</b></td>
          <td style="min-width:200px;white-space:normal">${xs.filter((x) => x[0] !== 'info').map(([n, , t]) => `<span class="badge ${nivelBadge[n]}" style="margin:1px">${esc(t)}</span>`).join('')}${(l.ajustados || []).length ? '<span class="badge b-acc" style="margin:1px">Ajustado</span>' : ''}</td></tr>`; }).join('')}
      </tbody></table></div>${rows.length ? '' : '<div class="card empty">Nadie coincide con el filtro.</div>'}` : `<div class="card empty">${edit ? 'Sin personas. Presiona Recalcular.' : 'Sin personas.'}</div>`}`}`;
  $('#np_sel').onchange = (e) => { NS.periodo = e.target.value; NS.filtro = ''; viewPrenomina(); };
  $$('[data-nsec]').forEach((b) => b.onclick = () => { NS.sec = b.dataset.nsec; viewPrenomina(); });
  $$('[data-nfin]').forEach((tr) => tr.onclick = () => finiquitoForm(p, fins.find((f) => f.id === tr.dataset.nfin), periodos));
  $$('[data-npag]').forEach((tr) => tr.onclick = () => pagoForm(p, pagos.find((x) => x.id === tr.dataset.npag)));
  { const b = $('#nf_add'); if (b) b.onclick = () => agregarFiniquito(p, fins, pendFin); }
  { const b = $('#npg_add'); if (b) b.onclick = () => pagoForm(p, null); }
  if ($('#np_q')) $('#np_q').oninput = (e) => { NS.q = e.target.value; clearTimeout(viewPrenomina._t); viewPrenomina._t = setTimeout(() => viewPrenomina().then(() => { const i = $('#np_q'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }), 300); };
  $$('[data-nf]').forEach((b) => b.onclick = () => { NS.filtro = b.dataset.nf; viewPrenomina(); });
  $$('[data-nl]').forEach((tr) => tr.onclick = () => lineaForm(p, lineas.find((l) => l.id === tr.dataset.nl)));
  const on = (id, fn) => { const b = $(id); if (b) b.onclick = fn; };
  on('#np_new', () => periodoForm(null, periodos));
  on('#np_edit', () => periodoForm(p, periodos));
  on('#np_calc', async (ev) => { const b = ev.currentTarget; b.disabled = true; try { const [r] = await rpc('nomina_generar', { p_periodo: p.id }); toast(`Recalculada · ${r.lineas} personas${r.nuevas ? ` · ${r.nuevas} nuevas` : ''}${r.quitadas ? ` · ${r.quitadas} quitadas` : ''}`); viewPrenomina(); } catch (e) { toast(e.message, true); b.disabled = false; } });
  on('#np_add', () => agregarPersona(p, lineas));
  on('#np_auth', () => autorizarPeriodo(p, lineas, al, fins, pagos));
  on('#np_open', () => modal({ title: 'Reabrir pre-nómina', body: fieldsHtml([{ k: 'motivo', label: 'Motivo', type: 'textarea', req: true, full: true }]),
    actions: [{ label: 'Cancelar' }, { label: 'Reabrir', cls: 'primary', run: async ({ el }) => { const { motivo } = readFields(el, [{ k: 'motivo', label: 'Motivo', req: true }]); await rpc('nomina_reabrir', { p_periodo: p.id, p_motivo: motivo }); toast('Pre-nómina reabierta'); viewPrenomina(); } }] }));
  on('#np_xls', async (ev) => { const b = ev.currentTarget; b.disabled = true; try { await exportPrenomina(p, lineas, fins, pagos); } catch (e) { toast(e.message, true); } finally { b.disabled = false; } });
}

function periodoForm(p, periodos) {
  const def = p || siguientePeriodo(periodos[0]);
  const locked = !!(p && p.generado_at);
  const fields = [
    { k: 'numero', label: 'Número de periodo', type: 'number', val: def.numero ?? '', hint: 'Como lo numeran en nómina (opcional)' },
    { k: 'dias', label: 'Días a pagar', type: 'number', req: true, val: def.dias, hint: 'Normalmente 15 en cada quincena' },
    ...(locked ? [] : [{ k: 'fecha_inicio', label: 'Del', type: 'date', req: true, val: def.fecha_inicio }, { k: 'fecha_fin', label: 'Al', type: 'date', req: true, val: def.fecha_fin }]),
    { k: 'notas', label: 'Notas', type: 'textarea', full: true, val: (p && p.notas) || '' }
  ];
  const m = modal({
    title: p ? 'Editar periodo' : 'Nuevo periodo', wide: true,
    body: `${locked ? `<div class="notice n-info">${esc(periodoTitulo(p))}. Las fechas ya no se cambian porque el periodo está calculado.</div>` : ''}${fieldsHtml(fields)}
      <div class="eyebrow" style="margin:12px 0 6px">Días de descanso obligatorio en el periodo</div><div id="np_fest" class="list"></div>
      <div class="small muted" style="margin-top:6px">Quien trabaje un día festivo marcado recibe su pago doble además del salario (Art. 75 LFT). Ese día no cuenta como falta.</div>`,
    actions: [{ label: 'Cancelar' }, { label: p ? 'Guardar y recalcular' : 'Crear y calcular', cls: 'primary', run: async ({ el }) => {
      const v = readFields(el, fields);
      const ini = locked ? p.fecha_inicio : v.fecha_inicio, fin = locked ? p.fecha_fin : v.fecha_fin;
      if (fin < ini) throw new Error('La fecha final es anterior a la inicial.');
      if (!Number.isInteger(v.dias) || v.dias < 1 || v.dias > 31) throw new Error('Días a pagar: un número entero de 1 a 31.');
      const festivos = $$('[data-fd]:checked', el).map((c) => c.value).filter((d) => d >= ini && d <= fin);
      const row = { numero: v.numero == null ? null : Math.trunc(v.numero), dias: v.dias, notas: v.notas, festivos };
      let id = p && p.id;
      if (p) await mustUpdate(db('nomina_periodos').eq('id', p.id).update(locked ? row : { ...row, fecha_inicio: ini, fecha_fin: fin }), 'el periodo');
      else { const [n] = await db('nomina_periodos').insert([{ ...row, fecha_inicio: ini, fecha_fin: fin }]); id = n.id; }
      const [r] = await rpc('nomina_generar', { p_periodo: id });
      NS.periodo = id; NS.filtro = '';
      toast(`${p ? 'Periodo actualizado' : 'Periodo creado'} · ${r.lineas} personas`); viewPrenomina();
    } }]
  });
  const paint = () => {
    const ini = locked ? p.fecha_inicio : $('#f_fecha_inicio', m.el).value, fin = locked ? p.fecha_fin : $('#f_fecha_fin', m.el).value;
    const marcados = new Set(p ? p.festivos : festivosEn(ini, fin).map(([d]) => d));
    const lista = festivosEn(ini, fin);
    for (const d of (p ? p.festivos : [])) if (!lista.some(([x]) => x === d)) lista.push([d, 'Día festivo']);
    $('#np_fest', m.el).innerHTML = lista.length ? lista.map(([d, n]) => `<label class="item" style="gap:10px"><input type="checkbox" data-fd value="${d}"${marcados.has(d) ? ' checked' : ''}><span class="grow">${fmtDate(d)} · ${esc(n)}</span></label>`).join('') : '<span class="small muted">Ninguno en estas fechas.</span>';
  };
  paint();
  if (!locked) $$('#f_fecha_inicio,#f_fecha_fin', m.el).forEach((i) => i.addEventListener('change', paint));
}

async function agregarPersona(p, lineas) {
  const ya = new Set(lineas.map((l) => l.employee_id));
  const emps = (await nominaPersonas()).filter((e) => !ya.has(e.id));
  const m = modal({ title: 'Agregar persona', body: `<div class="notice n-info">Solo hace falta para casos especiales (por ejemplo, un pago pendiente a alguien que ya se fue). El personal activo entra solo al recalcular.</div>
    <input class="inp" id="ap_q" type="search" placeholder="Buscar" style="width:100%;margin:8px 0"><div class="list" id="ap_l"></div>` });
  const paint = () => {
    const q = norm($('#ap_q', m.el).value);
    const xs = emps.filter((e) => !q || norm(e.nombre + ' ' + (e.num_empleado || '')).includes(q)).slice(0, 40);
    $('#ap_l', m.el).innerHTML = xs.length ? xs.map((e) => `<button type="button" class="item" data-ap="${e.id}"><span class="grow"><span class="nm">${esc(e.nombre)}</span><br><span class="small muted">${esc(areaName(e.area_id))} · ingreso ${fmtDate(e.fecha_ingreso)}</span></span>${statusBadge(e.status)}</button>`).join('') : '<div class="card empty">Nadie disponible.</div>';
    $$('[data-ap]', m.el).forEach((b) => b.onclick = async () => { b.disabled = true; try { await rpc('nomina_agregar', { p_periodo: p.id, p_emp: b.dataset.ap }); m.close(); toast('Agregado'); viewPrenomina(); } catch (e) { toast(e.message, true); b.disabled = false; } });
  };
  $('#ap_q', m.el).oninput = paint; paint();
}

// ───── Finiquitos y pagos pendientes de la quincena ─────
// El finiquito lo calcula la base para cada baja de la quincena (vacaciones y prima vacacional proporcionales,
// aguinaldo proporcional y prima de antigüedad cuando aplica). Los días trabajados van en la línea de NOMINA.
const FIN_AUTO = { salario_diario: 'Salario diario', vac_dias: 'Días de vacaciones proporcionales', aguinaldo_dias: 'Días de aguinaldo', prima_antig_aplica: 'Prima de antigüedad', clabe: 'CLABE', banco: 'Banco', beneficiario: 'Beneficiario' };
const SM_LFT = (iso) => Number(iso.slice(0, 4)) >= 2026 ? 315.04 : Number(iso.slice(0, 4)) === 2025 ? 278.80 : 248.93;
const finVacNetos = (f) => Math.max(num(f.vac_dias) + num(f.vac_pendientes) - num(f.vac_tomadas), 0);
const anios = (n) => `${num(n).toFixed(2)} año${num(n) >= 1 && num(n) < 1.005 ? '' : 's'}`;
function finiquitoAlertas(f) {
  const a = [];
  if (!num(f.salario_diario)) a.push(['bad', 'Sin salario diario']);
  if (!f.fecha_ingreso) a.push(['bad', 'Sin fecha de ingreso: no se pudo calcular']);
  if (!f.clabe) a.push(['bad', 'Sin CLABE']);
  if (num(f.total) < 0) a.push(['bad', 'Total negativo']);
  if (f.monto_convenio != null && Math.abs(num(f.monto_convenio) - num(f.total)) >= 1) a.push(['warn', `Convenio firmado por ${money(f.monto_convenio)}`]);
  if ((f.ajustados || []).length) a.push(['info', 'Ajustado: ' + f.ajustados.map((k) => FIN_AUTO[k] || k).join(', ')]);
  return a;
}
function finiquitosHtml(fins, edit) {
  const head = `<div class="row" style="gap:8px;align-items:center;margin-bottom:10px"><span class="small muted grow">Bajas cuya fecha cae en esta quincena. Los días trabajados se pagan en su línea de Nómina; aquí van vacaciones, prima vacacional, aguinaldo y, si aplica, prima de antigüedad.</span>${edit ? '<button class="btn sm primary" id="nf_add">+ Agregar finiquito</button>' : ''}</div>`;
  if (!fins.length) return head + `<div class="card empty">${edit ? 'No hay bajas en esta quincena. Si se debe un finiquito de otra fecha, usa Agregar finiquito.' : 'Sin finiquitos en esta quincena.'}</div>`;
  const t = (k) => r2(fins.reduce((s, f) => s + num(typeof k === 'function' ? k(f) : f[k]), 0));
  return head + `<div class="card scrollx"><table class="tbl"><thead><tr><th>#</th><th>Nombre</th><th>Baja</th><th style="text-align:right">Antigüedad</th><th style="text-align:right">Vacaciones + prima</th><th style="text-align:right">Aguinaldo</th><th style="text-align:right">Prima antig.</th><th style="text-align:right">Otros</th><th style="text-align:right">Total</th><th>Revisión</th></tr></thead><tbody>
    ${fins.map((f, i) => `<tr data-nfin="${f.id}" style="cursor:pointer"><td class="mono small muted">${i + 1}</td><td style="min-width:170px"><b>${esc(f.nombre)}</b><br><span class="small muted">${esc(f.motivo || 'Sin motivo registrado')}</span></td>
      <td class="mono small">${fmtDate(f.fecha_baja)}</td><td class="mono" style="text-align:right">${anios(f.antiguedad_anios)}</td>
      <td class="mono" style="text-align:right">${money(r2(num(f.vacaciones) + num(f.prima_vacacional)))}<br><span class="small muted">${finVacNetos(f).toFixed(2)} días</span></td>
      <td class="mono" style="text-align:right">${money(f.aguinaldo)}<br><span class="small muted">${num(f.aguinaldo_dias).toFixed(2)} días</span></td>
      <td class="mono" style="text-align:right">${f.prima_antig_aplica ? money(f.prima_antiguedad) : '<span class="muted">No aplica</span>'}</td>
      <td class="mono" style="text-align:right">${num(f.otras_percepciones) || num(f.deducciones) ? money(r2(num(f.otras_percepciones) - num(f.deducciones))) : ''}</td>
      <td class="mono" style="text-align:right"><b>${money(f.total)}</b></td>
      <td style="min-width:180px;white-space:normal">${finiquitoAlertas(f).map(([n, tx]) => `<span class="badge ${nivelBadge[n]}" style="margin:1px">${esc(tx)}</span>`).join('')}</td></tr>`).join('')}
    <tr><td></td><td><b>Totales</b></td><td></td><td></td><td class="mono" style="text-align:right"><b>${money(t((f) => num(f.vacaciones) + num(f.prima_vacacional)))}</b></td><td class="mono" style="text-align:right"><b>${money(t('aguinaldo'))}</b></td><td class="mono" style="text-align:right"><b>${money(t('prima_antiguedad'))}</b></td><td class="mono" style="text-align:right"><b>${money(t((f) => num(f.otras_percepciones) - num(f.deducciones)))}</b></td><td class="mono" style="text-align:right"><b>${money(t('total'))}</b></td><td></td></tr>
  </tbody></table></div>`;
}
function pagosHtml(pagos, edit) {
  const head = `<div class="row" style="gap:8px;align-items:center;margin-bottom:10px"><span class="small muted grow">Pagos sueltos que se deben y salen en esta quincena: ajustes de quincenas anteriores, reembolsos, comisiones atrasadas… A personal activo o de baja.</span>${edit ? '<button class="btn sm primary" id="npg_add">+ Pago pendiente</button>' : ''}</div>`;
  if (!pagos.length) return head + `<div class="card empty">Sin pagos pendientes en esta quincena.</div>`;
  return head + `<div class="card scrollx"><table class="tbl"><thead><tr><th>#</th><th>Nombre</th><th>Concepto</th><th style="text-align:right">Monto</th><th>CLABE</th><th>Notas</th></tr></thead><tbody>
    ${pagos.map((x, i) => `<tr data-npag="${x.id}" style="cursor:pointer"><td class="mono small muted">${i + 1}</td><td style="min-width:170px"><b>${esc(x.nombre)}</b><br><span class="small muted">${esc(x.departamento || '')}</span></td><td>${esc(x.concepto)}</td>
      <td class="mono" style="text-align:right"><b>${money(x.monto)}</b></td><td class="mono small">${x.clabe ? esc(x.clabe) : '<span class="badge b-bad">Sin CLABE</span>'}</td><td class="small muted" style="white-space:normal">${esc(x.notas || '')}</td></tr>`).join('')}
    <tr><td></td><td><b>Total</b></td><td></td><td class="mono" style="text-align:right"><b>${money(r2(pagos.reduce((s, x) => s + num(x.monto), 0)))}</b></td><td></td><td></td></tr>
  </tbody></table></div>`;
}
let NOM_PERSONAS = null;
async function nominaPersonas() { if (!NOM_PERSONAS) NOM_PERSONAS = await rpc('nomina_personas', {}); return NOM_PERSONAS; }
function elegirPersona(title, xs, notice, onPick) {
  const m = modal({ title, body: `${notice ? `<div class="notice n-info">${notice}</div>` : ''}<input class="inp" id="ep_q" type="search" placeholder="Buscar" style="width:100%;margin:8px 0"><div class="list" id="ep_l"></div>` });
  const paint = () => {
    const q = norm($('#ep_q', m.el).value);
    const ys = xs.filter((e) => !q || norm(e.nombre + ' ' + (e.num_empleado || '')).includes(q)).slice(0, 50);
    $('#ep_l', m.el).innerHTML = ys.length ? ys.map((e) => `<button type="button" class="item" data-ep="${e.id}"><span class="grow"><span class="nm">${esc(e.nombre)}</span><br><span class="small muted">${esc(e.sub || '')}</span></span>${e.badge || ''}</button>`).join('') : '<div class="card empty">Nadie disponible.</div>';
    $$('[data-ep]', m.el).forEach((b) => b.onclick = async () => { b.disabled = true; try { await onPick(xs.find((e) => e.id === b.dataset.ep), m); } catch (e) { toast(e.message, true); b.disabled = false; } });
  };
  $('#ep_q', m.el).oninput = paint; paint();
  return m;
}
async function agregarFiniquito(p, fins, pendFin) {
  const ya = new Set(fins.map((f) => f.employee_id));
  const pend = pendFin.map((f) => ({ id: f.employee_id, nombre: f.nombre, num_empleado: f.num_empleado, sub: `Pendiente · baja ${fmtDate(f.fecha_baja)} · ${money(f.total)}`, badge: '<span class="badge b-warn">Pendiente</span>' }));
  const pendIds = new Set(pend.map((x) => x.id));
  const bajas = (await nominaPersonas()).filter((e) => e.status === 'baja' && !ya.has(e.id) && !pendIds.has(e.id))
    .map((e) => ({ ...e, sub: `${areaName(e.area_id)} · baja ${fmtDate(e.fecha_baja)}`, badge: statusBadge('baja') }));
  elegirPersona('Agregar finiquito', [...pend, ...bajas], 'Las bajas de esta quincena entran solas al recalcular. Aquí se agregan los pendientes o una baja de otra fecha que se paga ahora.', async (e, m) => {
    await rpc('nomina_finiquito_agregar', { p_periodo: p.id, p_emp: e.id }); m.close(); toast('Finiquito agregado'); NS.sec = 'fin'; viewPrenomina();
  });
}
async function finiquitoForm(p, f, periodos) {
  const edit = is('nomina') && p.estado === 'borrador';
  const aj = new Set(f.ajustados || []);
  const tag = (k) => aj.has(k) ? ` <span class="badge b-acc">ajustado</span>${edit ? ` <button type="button" class="btn sm ghost" data-frest="${k}" style="min-height:24px;padding:0 6px">restaurar</button>` : ''}` : ' <span class="small muted">(automático)</span>';
  const baseF = [
    { k: 'salario_diario', label: 'Salario diario', type: 'number', val: f.salario_diario },
    { k: 'vac_dias', label: 'Vacaciones proporcionales (días)', type: 'number', val: f.vac_dias, hint: 'Del año de servicio en curso (Art. 76 LFT)' },
    { k: 'aguinaldo_dias', label: 'Aguinaldo proporcional (días)', type: 'number', val: f.aguinaldo_dias, hint: '15 días × días trabajados en el año ÷ 365' },
    { k: 'prima_antig_aplica', label: 'Prima de antigüedad', type: 'select', val: String(!!f.prima_antig_aplica), options: [['true', 'Sí se paga'], ['false', 'No aplica']], hint: 'Renuncia: solo con 15 años o más. Rescisión, despido o convenio: siempre (Art. 162).' }];
  const capF = [
    { k: 'vac_pendientes', label: 'Vacaciones de años anteriores no disfrutadas (días)', type: 'number', val: num(f.vac_pendientes) || '' },
    { k: 'vac_tomadas', label: 'Días de vacaciones ya disfrutados este año', type: 'number', val: num(f.vac_tomadas) || '' },
    { k: 'otras_percepciones', label: 'Otras percepciones', type: 'number', val: num(f.otras_percepciones) || '' },
    { k: 'otras_percepciones_concepto', label: 'Concepto', val: f.otras_percepciones_concepto || '', hint: 'Ej. comisiones devengadas, bono' },
    { k: 'deducciones', label: 'Deducciones', type: 'number', val: num(f.deducciones) || '' },
    { k: 'deducciones_concepto', label: 'Concepto', val: f.deducciones_concepto || '', hint: 'Ej. préstamo, adeudo' }];
  const pagoF = [{ k: 'clabe', label: 'CLABE', val: f.clabe || '' }, { k: 'banco', label: 'Banco', val: f.banco || '', upper: true }, { k: 'beneficiario', label: 'Beneficiario', val: f.beneficiario || '', upper: true, full: true }];
  const notaF = [{ k: 'notas', label: 'Notas / motivo del ajuste', type: 'textarea', full: true, val: f.notas || '' }];
  const otros = periodos.filter((x) => x.estado === 'borrador' && x.id !== p.id);
  const ro = (fs) => `<div class="kv">${fs.map((x) => `<span>${esc(x.label)}</span><span class="mono">${x.k === 'prima_antig_aplica' ? (f.prima_antig_aplica ? 'Sí se paga' : 'No aplica') : x.type === 'number' ? (x.k === 'salario_diario' || x.k === 'otras_percepciones' || x.k === 'deducciones' ? money(x.val || 0) : num(x.val).toFixed(2)) : esc(x.val || '—')}${aj.has(x.k) ? ' <span class="badge b-acc">ajustado</span>' : ''}</span>`).join('')}</div>`;
  const al = finiquitoAlertas(f);
  const body = `<div class="kv"><span>Departamento</span><span>${esc(f.departamento || '—')}</span><span>Ingreso</span><span>${fmtDate(f.fecha_ingreso)}</span><span>Baja</span><span>${fmtDate(f.fecha_baja)}</span>
      <span>Antigüedad</span><span class="mono">${anios(f.antiguedad_anios)}</span><span>Motivo</span><span>${esc(f.motivo || 'Sin registrar')}</span>${f.monto_convenio != null ? `<span>Convenio firmado</span><span class="mono">${money(f.monto_convenio)}</span>` : ''}</div>
    ${al.length ? `<div class="row" style="gap:4px;margin-top:8px">${al.map(([n, t]) => `<span class="badge ${nivelBadge[n]}">${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="notice n-info" style="margin-top:10px">Los días trabajados de la quincena se pagan en su línea de Nómina. El tope de la prima de antigüedad es 2 salarios mínimos (${money(2 * SM_LFT(f.fecha_baja))} diarios).</div>
    <div class="eyebrow" style="margin:14px 0 6px">Cálculo</div>${edit ? fieldsHtml(baseF) : ro(baseF)}
    <div class="eyebrow" style="margin:14px 0 6px">Capturas de Nómina</div>${edit ? fieldsHtml(capF) + '<div id="nf_vac" class="small" style="margin-top:6px"></div>' : ro(capF)}
    <div class="eyebrow" style="margin:14px 0 6px">Pago</div>${edit ? fieldsHtml(pagoF) + '<div id="fc_hint" class="small" style="margin-top:4px"></div>' : ro(pagoF)}
    ${edit ? fieldsHtml(notaF) : f.notas ? `<div class="notice n-info" style="margin-top:12px">${esc(f.notas)}</div>` : ''}
    <div class="card pad" style="margin-top:12px;background:var(--soft)" id="nf_prev"></div>`;
  const allF = [...baseF, ...capF, ...pagoF, ...notaF];
  const collect = (el) => {
    const v = readFields(el, allF); const out = {};
    for (const k of ['salario_diario', 'vac_dias', 'aguinaldo_dias', 'vac_pendientes', 'vac_tomadas', 'otras_percepciones', 'deducciones']) out[k] = num(v[k]);
    out.prima_antig_aplica = v.prima_antig_aplica === 'true';
    for (const k of ['otras_percepciones_concepto', 'deducciones_concepto', 'banco', 'beneficiario', 'notas']) out[k] = v[k];
    out.clabe = v.clabe ? clabeDigits(v.clabe) : null;
    return out;
  };
  const calc = (x) => {
    const vac = r2(x.salario_diario * Math.max(x.vac_dias + x.vac_pendientes - x.vac_tomadas, 0)), pv = r2(vac * 0.25), ag = r2(x.salario_diario * x.aguinaldo_dias);
    const tope = Math.min(x.salario_diario, r2(2 * SM_LFT(f.fecha_baja))), pa = x.prima_antig_aplica ? r2(12 * num(f.antiguedad_anios) * tope) : 0;
    return { vac, pv, ag, pa, total: r2(vac + pv + ag + pa + x.otras_percepciones - x.deducciones) };
  };
  const preview = (el) => {
    let x; try { x = edit ? collect(el) : f; } catch { return; }
    const c = edit ? calc(x) : { vac: num(f.vacaciones), pv: num(f.prima_vacacional), ag: num(f.aguinaldo), pa: num(f.prima_antiguedad), total: num(f.total) };
    $('#nf_prev', el).innerHTML = `<div class="kv"><span>Vacaciones (${finVacNetos(x).toFixed(2)} días)</span><span class="mono">${money(c.vac)}</span><span>Prima vacacional 25 %</span><span class="mono">${money(c.pv)}</span>
      <span>Aguinaldo (${num(x.aguinaldo_dias).toFixed(2)} días)</span><span class="mono">${money(c.ag)}</span><span>Prima de antigüedad</span><span class="mono">${x.prima_antig_aplica ? money(c.pa) : 'No aplica'}</span>
      ${num(x.otras_percepciones) ? `<span>${esc(x.otras_percepciones_concepto || 'Otras percepciones')}</span><span class="mono">${money(x.otras_percepciones)}</span>` : ''}
      ${num(x.deducciones) ? `<span>${esc(x.deducciones_concepto || 'Deducciones')}</span><span class="mono">−${money(x.deducciones)}</span>` : ''}
      <span><b>Total del finiquito</b></span><span class="mono"><b style="color:${c.total >= 0 ? 'var(--ok)' : 'var(--bad)'}">${money(c.total)}</b></span></div>`;
    const cl = $('#f_clabe', el); if (cl) { const d = clabeDigits(cl.value), h = $('#fc_hint', el); h.innerHTML = !d ? '' : clabeOk(d) ? `<span style="color:var(--ok)">CLABE válida${bancoDeClabe(d) ? ' · ' + esc(bancoDeClabe(d)) : ''}</span>` : `<span style="color:var(--bad)">CLABE no válida (${d.length} dígitos)</span>`; }
  };
  const m = modal({
    title: 'Finiquito · ' + f.nombre, wide: true, body,
    actions: edit ? [
      { label: 'Pasar a otra quincena', run: async () => {
        const fs = [{ k: 'destino', label: 'Pasar a', type: 'select', req: true, full: true, val: '', options: [['', 'Elegir…'], ...otros.map((x) => [x.id, periodoTitulo(x)]), ['pend', 'Pendiente (sin quincena todavía)']] }];
        modal({ title: 'Pasar finiquito', body: `<p style="margin-top:0">${esc(f.nombre)} · ${money(f.total)}</p>${fieldsHtml(fs)}<div class="small muted" style="margin-top:8px">Si eliges pendiente, aparece como aviso en cualquier quincena en borrador para agregarlo cuando se pague.</div>`,
          actions: [{ label: 'Cancelar' }, { label: 'Pasar', cls: 'primary', run: async ({ el }) => { const { destino } = readFields(el, fs); await mustUpdate(db('nomina_finiquitos').eq('id', f.id).update({ periodo_id: destino === 'pend' ? null : destino }), 'el finiquito'); m.close(); toast('Finiquito movido'); viewPrenomina(); } }] });
        return false; } },
      { label: 'Cancelar' },
      { label: 'Guardar', cls: 'primary', run: async ({ el }) => {
        const x = collect(el);
        if (x.clabe && !clabeOk(x.clabe)) throw new Error('La CLABE no es válida: deben ser 18 dígitos y el dígito verificador debe cuadrar.');
        if (x.clabe && !x.banco) x.banco = bancoDeClabe(x.clabe) || null;
        const cambiaAuto = Object.keys(FIN_AUTO).filter((k) => !aj.has(k) && String(x[k] ?? '') !== String(typeof x[k] === 'number' ? num(f[k]) : typeof x[k] === 'boolean' ? !!f[k] : (f[k] ?? '')));
        if (cambiaAuto.length && !x.notas) throw new Error(`Escribe en Notas el motivo del ajuste (${cambiaAuto.map((k) => FIN_AUTO[k]).join(', ')}).`);
        const patch = {}; for (const k in x) { const o = typeof x[k] === 'number' ? num(f[k]) : typeof x[k] === 'boolean' ? !!f[k] : (f[k] ?? null); if (x[k] !== o && String(x[k] ?? '') !== String(o ?? '')) patch[k] = x[k]; }
        if (Object.keys(patch).length) await mustUpdate(db('nomina_finiquitos').eq('id', f.id).update(patch), 'el finiquito');
        toast('Guardado'); viewPrenomina();
      } }] : [{ label: 'Cerrar' }]
  });
  if (edit) {
    for (const x of baseF) { const lab = $('#f_' + x.k, m.el).closest('label'); lab.insertBefore(document.createRange().createContextualFragment(tag(x.k)), lab.querySelector('input,select')); }
    $$('input,textarea,select', m.el).forEach((i) => { i.addEventListener('input', () => preview(m.el)); i.addEventListener('change', () => preview(m.el)); });
    // Registro de vacaciones de la app: días pendientes de años anteriores o tomados de más en el año en curso
    rpc('vacaciones_saldo', { p_emp: f.employee_id, p_hasta: f.fecha_baja }).then((sv) => {
      const box = $('#nf_vac', m.el); if (!box || !sv) return;
      const disp = num(sv.disponibles), pend = Math.max(disp, 0), tom = Math.max(-disp, 0);
      box.innerHTML = `Registro de vacaciones: derecho ${num(sv.derecho)} días · tomados ${num(sv.tomados) + num(sv.programados)} → <b>${pend} pendientes</b>${tom ? ` · <b>${tom} adelantados</b>` : ''}. <button type="button" class="btn sm" id="nf_usar">Usar estos datos</button>`;
      $('#nf_usar', m.el).onclick = () => { $('#f_vac_pendientes', m.el).value = pend || ''; $('#f_vac_tomadas', m.el).value = tom || ''; preview(m.el); };
    }).catch(() => {});
    $$('[data-frest]', m.el).forEach((b) => b.onclick = async (ev) => { ev.preventDefault(); b.disabled = true; try { await rpc('nomina_finiquito_restaurar', { p_id: f.id, p_campo: b.dataset.frest }); m.close(); toast('Valor automático restaurado'); await viewPrenomina(); const [nf] = await db('nomina_finiquitos').eq('id', f.id).get(); if (nf) finiquitoForm(p, nf, periodos); } catch (e) { toast(e.message, true); b.disabled = false; } });
  }
  preview(m.el);
}
async function pagoForm(p, x) {
  const edit = is('nomina') && p.estado === 'borrador';
  const fs = [{ k: 'concepto', label: 'Concepto', req: true, full: true, val: x ? x.concepto : '', hint: 'Ej. Diferencia de la quincena anterior, comisión de agosto, reembolso' },
    { k: 'monto', label: 'Monto (MXN)', type: 'number', req: true, val: x ? x.monto : '' },
    { k: 'clabe', label: 'CLABE', val: x ? x.clabe || '' : '', hint: x ? '' : 'Vacía = la de su ficha' }, { k: 'banco', label: 'Banco', upper: true, val: x ? x.banco || '' : '' },
    { k: 'beneficiario', label: 'Beneficiario', upper: true, val: x ? x.beneficiario || '' : '' },
    { k: 'notas', label: 'Notas', type: 'textarea', full: true, val: x ? x.notas || '' : '' }];
  const guardar = async (el, emp) => {
    const v = readFields(el, fs);
    if (!(v.monto > 0)) throw new Error('El monto debe ser mayor a cero.');
    const clabe = v.clabe ? clabeDigits(v.clabe) : null;
    if (clabe && !clabeOk(clabe)) throw new Error('La CLABE no es válida: deben ser 18 dígitos y el dígito verificador debe cuadrar.');
    const row = { concepto: v.concepto, monto: r2(v.monto), clabe, banco: v.banco || (clabe ? bancoDeClabe(clabe) || null : null), beneficiario: v.beneficiario, notas: v.notas };
    if (x) await mustUpdate(db('nomina_pagos').eq('id', x.id).update(row), 'el pago');
    else await db('nomina_pagos').insert([{ ...row, periodo_id: p.id, employee_id: emp.id }]);
    toast('Pago guardado'); NS.sec = 'pagos'; viewPrenomina();
  };
  if (x) {
    if (!edit) return modal({ title: 'Pago pendiente · ' + x.nombre, body: `<div class="kv"><span>Concepto</span><span>${esc(x.concepto)}</span><span>Monto</span><span class="mono">${money(x.monto)}</span><span>CLABE</span><span class="mono">${esc(x.clabe || '—')}</span><span>Banco</span><span>${esc(x.banco || '—')}</span><span>Beneficiario</span><span>${esc(x.beneficiario || '—')}</span><span>Capturó</span><span>${esc(profName(x.created_by))} · ${fmtDateTime(x.created_at)}</span></div>${x.notas ? `<div class="notice n-info" style="margin-top:10px">${esc(x.notas)}</div>` : ''}`, actions: [{ label: 'Cerrar' }] });
    return modal({ title: 'Pago pendiente · ' + x.nombre, body: fieldsHtml(fs), actions: [
      { label: 'Quitar', cls: 'danger', run: async () => { if (!(await confirmBox('Quitar pago', `¿Quitar el pago de <b>${esc(x.nombre)}</b> por ${money(x.monto)}?`, { danger: true, okLabel: 'Quitar' }))) return false; await db('nomina_pagos').eq('id', x.id).remove(); toast('Pago quitado'); viewPrenomina(); } },
      { label: 'Cancelar' }, { label: 'Guardar', cls: 'primary', run: ({ el }) => guardar(el) }] });
  }
  const xs = (await nominaPersonas()).map((e) => ({ ...e, sub: `${areaName(e.area_id)}${e.status === 'baja' ? ' · baja ' + fmtDate(e.fecha_baja) : ''}`, badge: statusBadge(e.status) }));
  elegirPersona('Pago pendiente · ¿a quién?', xs, '', async (emp, sel) => {
    sel.close();
    modal({ title: 'Pago pendiente · ' + emp.nombre.toUpperCase(), body: fieldsHtml(fs), actions: [{ label: 'Cancelar' }, { label: 'Guardar', cls: 'primary', run: ({ el }) => guardar(el, emp) }] });
  });
}

async function autorizarPeriodo(p, lineas, al, fins = [], pagos = []) {
  const bad = lineas.filter((l) => al.get(l.id).some((x) => x[0] === 'bad'));
  const neto = r2(lineas.reduce((s, l) => s + num(l.neto), 0)), tf = r2(fins.reduce((s, f) => s + num(f.total), 0)), tp = r2(pagos.reduce((s, x) => s + num(x.monto), 0));
  const finBad = fins.filter((f) => finiquitoAlertas(f).some((x) => x[0] === 'bad'));
  const ok = await confirmBox('Autorizar pre-nómina', `<p style="margin-top:0"><b>${esc(periodoTitulo(p))}</b><br>${lineas.length} personas · neto nómina <b>${money(neto)}</b>${fins.length ? `<br>${fins.length} finiquito${fins.length === 1 ? '' : 's'} · <b>${money(tf)}</b>` : ''}${pagos.length ? `<br>${pagos.length} pago${pagos.length === 1 ? '' : 's'} pendiente${pagos.length === 1 ? '' : 's'} · <b>${money(tp)}</b>` : ''}${fins.length || pagos.length ? `<br>Total a dispersar <b>${money(r2(neto + tf + tp))}</b>` : ''}</p>
    ${finBad.length ? `<div class="notice n-warn">Finiquitos por revisar: ${finBad.map((f) => esc(f.nombre)).join(', ')}</div>` : ''}
    ${bad.length ? `<div class="notice n-warn">${bad.length} personas tienen pendientes (sin CLABE, sin salario o neto en cero): ${bad.slice(0, 8).map((l) => esc(l.nombre)).join(', ')}${bad.length > 8 ? '…' : ''}</div>` : '<div class="notice n-info">La revisión automática no encontró pendientes graves.</div>'}
    <p class="small muted">Ya autorizada no se puede modificar; si hace falta, se reabre con un motivo.</p>`, { okLabel: 'Autorizar' });
  if (!ok) return;
  try { await rpc('nomina_autorizar', { p_periodo: p.id }); toast('Pre-nómina autorizada'); viewPrenomina(); } catch (e) { toast(e.message, true); }
}

async function lineaForm(p, l) {
  const edit = is('nomina') && p.estado === 'borrador';
  const att = l.employee_id ? await db('attendance').select('fecha,turno,status,incidencia,comentario').eq('employee_id', l.employee_id).gte('fecha', p.fecha_inicio).lte('fecha', p.fecha_fin).order('fecha').get().catch(() => []) : [];
  const aj = new Set(l.ajustados || []);
  const tag = (k) => aj.has(k) ? ` <span class="badge b-acc">ajustado</span>${edit ? ` <button type="button" class="btn sm ghost" data-rest="${k}" style="min-height:24px;padding:0 6px">restaurar</button>` : ''}` : ' <span class="small muted">(automático)</span>';
  const baseF = [
    { k: 'salario_diario', label: 'Salario diario', type: 'number', val: l.salario_diario },
    { k: 'dias_no_lab', label: 'Días no laborados (ingreso / baja)', type: 'number', val: l.dias_no_lab },
    { k: 'faltas', label: 'Faltas', type: 'number', val: l.faltas },
    { k: 'festivo', label: 'Pago día festivo', type: 'number', val: l.festivo },
    { k: 'prima_vacacional', label: `Prima vacacional 25 % (${num(l.vacaciones_dias)} días de vacaciones)`, type: 'number', val: l.prima_vacacional }
  ];
  const percF = NOM_PERC.map(([k, label]) => ({ k, label, type: 'number', val: num(l[k]) || '' }));
  const dedF = [{ k: 'permisos', label: 'Permisos sin goce (horas:minutos)', val: hhmm(l.permisos_min), hint: 'Ej. 2:30 = dos horas y media' }, ...NOM_DED.map(([k, label]) => ({ k, label, type: 'number', val: num(l[k]) || '' }))];
  const pagoF = [{ k: 'clabe', label: 'CLABE', val: l.clabe || '', ac: 'off' }, { k: 'banco', label: 'Banco', val: l.banco || '', upper: true }, { k: 'beneficiario', label: 'Beneficiario', val: l.beneficiario || '', upper: true, full: true }];
  const notaF = [{ k: 'notas', label: 'Notas / motivo del ajuste', type: 'textarea', full: true, val: l.notas || '' }];
  const ro = (fs) => `<div class="kv">${fs.map((f) => `<span>${esc(f.label)}</span><span class="mono">${f.type === 'number' ? (f.k === 'faltas' || f.k === 'dias_no_lab' ? esc(f.val || 0) : money(f.val || 0)) : esc(f.val || '—')}${NOM_AUTO[f.k] ? (aj.has(f.k) ? ' <span class="badge b-acc">ajustado</span>' : '') : ''}</span>`).join('')}</div>`;
  const alerts = lineaAlertas(l);
  const attHtml = att.length ? `<div class="scrollx"><table class="tbl sub"><tbody>${att.map((a) => `<tr><td class="mono small">${fmtDate(a.fecha)}${a.turno === 'tarde' ? ' tarde' : ''}${p.festivos.includes(a.fecha) ? ' <span class="badge b-acc">festivo</span>' : ''}</td><td class="small">${attBadges(a)}</td><td class="small muted">${esc(a.comentario || '')}</td></tr>`).join('')}</tbody></table></div>` : '<span class="small muted">Sin registros del pase de lista en el periodo.</span>';
  const body = `
    <div class="kv"><span>Departamento</span><span>${esc(l.departamento || '—')}</span><span>Ingreso</span><span>${fmtDate(l.fecha_ingreso)}</span>${l.fecha_baja ? `<span>Baja</span><span>${fmtDate(l.fecha_baja)}</span>` : ''}
      <span>Días pagados</span><span class="mono">${l.dias_pagados} de ${p.dias}</span><span>Del pase de lista</span><span>${l.retardos} retardos · ${l.dias_permiso} días con permiso · ${l.festivos_lab} festivos trabajados${num(l.vacaciones_dias) ? ` · ${l.vacaciones_dias} días de vacaciones` : ''}</span></div>
    ${alerts.length ? `<div class="row" style="gap:4px;margin-top:8px">${alerts.map(([n, , t]) => `<span class="badge ${nivelBadge[n]}">${esc(t)}</span>`).join('')}</div>` : ''}
    <div class="eyebrow" style="margin:14px 0 6px">Base</div>
    ${edit ? fieldsHtml(baseF) : ro(baseF)}
    <div class="eyebrow" style="margin:14px 0 6px">Percepciones</div>${edit ? fieldsHtml(percF) : ro(percF)}
    <div class="eyebrow" style="margin:14px 0 6px">Deducciones</div>${edit ? fieldsHtml(dedF) : ro(dedF.map((f) => f.k === 'permisos' ? { ...f, val: f.val || '—' } : f))}
    <div class="eyebrow" style="margin:14px 0 6px">Pago</div>${edit ? fieldsHtml(pagoF) + `<div id="cl_hint" class="small" style="margin-top:4px"></div>${l.employee_id ? '<label class="row small" style="gap:6px;margin-top:6px"><input type="checkbox" id="cl_ficha"> Guardar también estos datos bancarios en la ficha del trabajador</label>' : ''}` : ro(pagoF)}
    ${edit ? fieldsHtml(notaF) : l.notas ? `<div class="notice n-info" style="margin-top:12px">${esc(l.notas)}</div>` : ''}
    <div class="card pad" style="margin-top:12px;background:var(--soft)" id="nl_prev"></div>
    <details style="margin-top:12px"><summary class="small" style="cursor:pointer">Pase de lista del periodo (${att.length} registros)</summary><div style="margin-top:8px">${attHtml}</div></details>`;
  const allF = [...baseF, ...percF, ...NOM_DED.map(([k, label]) => ({ k, label, type: 'number' })), ...pagoF, ...notaF];
  const collect = (el) => {
    const v = readFields(el, allF.filter((f) => f.k !== 'permisos'));
    const out = { notas: v.notas, clabe: v.clabe ? clabeDigits(v.clabe) : null, banco: v.banco, beneficiario: v.beneficiario, permisos_min: parseHHMM($('#f_permisos', el).value) };
    for (const f of [...baseF, ...percF, ...NOM_DED.map(([k]) => ({ k }))]) out[f.k] = num(v[f.k]);
    for (const k of ['dias_no_lab', 'faltas']) if (!Number.isInteger(out[k])) throw new Error(`${k === 'faltas' ? 'Faltas' : 'Días no laborados'}: escribe un número entero.`);
    return out;
  };
  const preview = (el) => {
    let x; try { x = collect(el); } catch { return; }
    const dias = p.dias - x.dias_no_lab, nom = r2(x.salario_diario * dias);
    const perc = r2(nom + x.festivo + x.prima_vacacional + NOM_PERC.reduce((s, [k]) => s + x[k], 0));
    const fm = r2(x.salario_diario * x.faltas), pm = r2(x.salario_diario / 8 * x.permisos_min / 60);
    const neto = r2(perc - fm - pm - NOM_DED.reduce((s, [k]) => s + x[k], 0));
    $('#nl_prev', el).innerHTML = `<div class="kv"><span>Nómina (${dias} días)</span><span class="mono">${money(nom)}</span><span>Total percepciones</span><span class="mono">${money(perc)}</span>
      <span>Faltas (${x.faltas})</span><span class="mono">−${money(fm)}</span><span>Permisos (${hhmm(x.permisos_min) || '0:00'} h)</span><span class="mono">−${money(pm)}</span>
      <span><b>Neto</b></span><span class="mono"><b style="color:${neto > 0 ? 'var(--ok)' : 'var(--bad)'}">${money(neto)}</b></span></div>`;
    const cl = $('#f_clabe', el); if (cl) {
      const d = clabeDigits(cl.value), h = $('#cl_hint', el);
      h.innerHTML = !d ? '' : clabeOk(d) ? `<span style="color:var(--ok)">CLABE válida${bancoDeClabe(d) ? ' · ' + esc(bancoDeClabe(d)) : ''}</span>` : `<span style="color:var(--bad)">CLABE no válida (${d.length} dígitos)</span>`;
    }
  };
  const m = modal({
    title: l.nombre, wide: true, body,
    actions: edit ? [
      { label: 'Quitar de la pre-nómina', cls: 'danger', run: async () => { if (!(await confirmBox('Quitar persona', `¿Quitar a <b>${esc(l.nombre)}</b> de esta pre-nómina? Si sigue activa, volverá a entrar al recalcular.`, { danger: true, okLabel: 'Quitar' }))) return false; await db('nomina_lineas').eq('id', l.id).remove(); toast('Quitada'); viewPrenomina(); } },
      { label: 'Cancelar' },
      { label: 'Guardar', cls: 'primary', run: async ({ el }) => {
        const x = collect(el);
        if (x.clabe && !clabeOk(x.clabe)) throw new Error('La CLABE no es válida: deben ser 18 dígitos y el dígito verificador debe cuadrar.');
        if (x.clabe && !x.banco) x.banco = bancoDeClabe(x.clabe) || null;
        const cambiaAuto = Object.keys(NOM_AUTO).filter((k) => !aj.has(k) && String(x[k] ?? '') !== String(k === 'clabe' || k === 'banco' || k === 'beneficiario' ? (l[k] ?? '') : num(l[k])));
        if (cambiaAuto.length && !x.notas) throw new Error(`Escribe en Notas el motivo del ajuste (${cambiaAuto.map((k) => NOM_AUTO[k]).join(', ')}).`);
        const patch = {}; for (const k in x) if (String(x[k] ?? '') !== String(l[k] ?? '') && !(typeof x[k] === 'number' && x[k] === num(l[k]))) patch[k] = x[k];
        if (Object.keys(patch).length) await mustUpdate(db('nomina_lineas').eq('id', l.id).update(patch), 'la línea');
        const ficha = $('#cl_ficha', el);
        if (ficha && ficha.checked) await rpc('set_datos_bancarios', { p_emp: l.employee_id, p_clabe: x.clabe, p_banco: x.banco, p_beneficiario: x.beneficiario });
        toast('Guardado'); viewPrenomina();
      } }] : [{ label: 'Cerrar' }]
  });
  if (edit) {
    for (const f of baseF) { const lab = $('#f_' + f.k, m.el).closest('label'); lab.insertBefore(document.createRange().createContextualFragment(tag(f.k)), lab.querySelector('input')); }
    $$('input,textarea', m.el).forEach((i) => i.addEventListener('input', () => preview(m.el)));
    const cl = $('#f_clabe', m.el), bc = $('#f_banco', m.el);
    if (cl && bc) cl.addEventListener('change', () => { const b = bancoDeClabe(cl.value); if (b && !bc.value.trim()) bc.value = b; });
    $$('[data-rest]', m.el).forEach((b) => b.onclick = async (ev) => { ev.preventDefault(); b.disabled = true; try { await rpc('nomina_restaurar', { p_linea: l.id, p_campo: b.dataset.rest }); m.close(); toast('Valor automático restaurado'); await viewPrenomina(); const [nl] = await db('nomina_lineas').eq('id', l.id).get(); if (nl) lineaForm(p, nl); } catch (e) { toast(e.message, true); b.disabled = false; } });
  }
  preview(m.el);
}

// ───── Excel (.xlsx) en el formato de pre-nómina de la empresa ─────
// Escritor mínimo de SpreadsheetML: celdas con valor, fórmula (con su resultado ya calculado) y estilos fijos.
const XS = { base: 0, head: 1, money: 2, text: 3, date: 4, int: 5, title: 6, total: 7, time: 8, bold: 9, adj: 10, wrap: 11, sub: 12, warn: 13, dec: 14 };
const xmlEsc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
const colL = (n) => { let s = ''; for (n++; n; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const xlDate = (iso) => iso ? (Date.UTC(...iso.split('-').map((x, i) => Number(x) - (i === 1 ? 1 : 0))) - Date.UTC(1899, 11, 30)) / 86400000 : null;
function xlsxSheet(sh) {
  const rows = sh.rows.map((r, ri) => `<row r="${ri + 1}"${sh.heights && sh.heights[ri] ? ` ht="${sh.heights[ri]}" customHeight="1"` : ''}>${r.map((c, ci) => {
    if (c == null || c === '') return '';
    const cell = typeof c === 'object' ? c : { v: c }; const ref = colL(ci) + (ri + 1); const s = cell.s != null ? ` s="${cell.s}"` : '';
    if (cell.f) return `<c r="${ref}"${s}${typeof cell.v === 'string' ? ' t="str"' : ''}><f>${xmlEsc(cell.f)}</f>${cell.v != null ? `<v>${xmlEsc(cell.v)}</v>` : ''}</c>`;
    if (cell.v == null || cell.v === '') return cell.s != null ? `<c r="${ref}"${s}/>` : '';
    if (typeof cell.v === 'number') return `<c r="${ref}"${s}><v>${cell.v}</v></c>`;
    return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(cell.v)}</t></is></c>`;
  }).join('')}</row>`).join('');
  const cols = sh.cols ? `<cols>${sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  const pane = sh.freeze ? `<pane xSplit="${sh.freeze[0]}" ySplit="${sh.freeze[1]}" topLeftCell="${colL(sh.freeze[0])}${sh.freeze[1] + 1}" activePane="bottomRight" state="frozen"/>` : '';
  const merges = sh.merges && sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0"${sh.zoom ? ` zoomScale="${sh.zoom}"` : ''}>${pane}</sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData>${merges}<pageMargins left="0.4" right="0.4" top="0.5" bottom="0.5" header="0.3" footer="0.3"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`;
}
function xlsxBuild(sheets) {
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="3"><numFmt numFmtId="164" formatCode="&quot;$&quot;#,##0.00;\\-&quot;$&quot;#,##0.00;&quot;-&quot;"/><numFmt numFmtId="165" formatCode="dd/mm/yyyy"/><numFmt numFmtId="166" formatCode="[h]:mm"/></numFmts>
<fonts count="5"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="13"/><name val="Arial"/></font><font><b/><sz val="10"/><name val="Arial"/></font><font><i/><sz val="9"/><color rgb="FF595959"/><name val="Arial"/></font></fonts>
<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0070C0"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF8CBAD"/></patternFill></fill></fills>
<borders count="3"><border/><border><left style="thin"><color rgb="FFBFBFBF"/></left><right style="thin"><color rgb="FFBFBFBF"/></right><top style="thin"><color rgb="FFBFBFBF"/></top><bottom style="thin"><color rgb="FFBFBFBF"/></bottom></border><border><top style="medium"/><bottom style="double"/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="15">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="164" fontId="3" fillId="0" borderId="2" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="49" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="49" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="4" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
    { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: styles },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: xlsxSheet(s) }))
  ];
  return new Blob([zipStore(files)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Mismas columnas que la pre-nómina en Excel (A…AB) + DÍAS PAGADOS y NOTAS al final.
// Todas las filas usan la misma fórmula y los totales cubren todas las filas.
function prenominaSheets(p, lineas, att, fins = [], pagos = []) {
  const first = 4, last = first + lineas.length - 1, tr = last + 1;
  const titulo = `PERIODO ${p.numero ? p.numero + ' ' : ''}DEL ${periodoTitulo({ ...p, numero: null }).toUpperCase()}`;
  const H = ['#', 'NOMBRE', 'Salario diario', 'Nomina \nquincenal', `PAGO DIA FESTIVO${p.festivos.length ? ' ' + p.festivos.map((d) => Number(d.slice(8)) + ' ' + MESES[Number(d.slice(5, 7)) - 1].toUpperCase()).join(', ') : ''}`, 'PAGO DE CHIPS ', 'FECHA DE INGRESO', 'PENDIENTE DE PAGO',
    'COMISION ADMINISTRATIVO', 'BONO DE REFERIDO', 'COMISION ASESORES', 'COMISION LIDERES', 'TOTAL', 'Hrs\nDobles', 'HORAS \nEXTRAS', '#', 'FALTAS', 'OTRAS\nDEDUCCIONES', 'TOTAL',
    'PERMISOS EN LA QUINCENA', 'HRS / MINUTOS', 'MULTAS POR DISCIPLINA', 'MULTAS POR RETARDO', 'DEPARTAMENTO', 'CLAVE', 'BANCO', 'BENEFICIARIO', 'FIRMA DEL EMPLEADO', 'DÍAS PAGADOS', 'DÍAS DE VACACIONES', 'PRIMA VACACIONAL', 'NOTAS / AJUSTES'];
  const rows = [[null, { v: titulo, s: XS.title }], [], H.map((h) => ({ v: h, s: XS.head }))];
  rows[1][12] = { v: 'PERCEP', s: XS.bold }; rows[1][16] = { v: 'DEDUCC', s: XS.bold };
  lineas.forEach((l, i) => {
    const r = first + i, aj = new Set(l.ajustados || []);
    const mon = (v, k) => ({ v: num(v), s: aj.has(k) ? XS.adj : XS.money });
    const notas = [(l.ajustados || []).length ? 'Ajustado: ' + l.ajustados.map((k) => NOM_AUTO[k] || k).join(', ') : '', num(l.dias_no_lab) ? `${l.dias_no_lab} días no laborados (${l.fecha_baja ? 'baja ' + fmtDate(l.fecha_baja) : 'ingreso ' + fmtDate(l.fecha_ingreso)})` : '', l.notas || ''].filter(Boolean).join(' · ');
    rows.push([
      { v: i + 1, s: XS.int }, { v: l.nombre, s: XS.text }, mon(l.salario_diario, 'salario_diario'),
      { f: `ROUND(C${r}*AC${r},2)`, v: num(l.nomina), s: XS.money }, mon(l.festivo, 'festivo'), mon(l.chips),
      l.fecha_ingreso ? { v: xlDate(l.fecha_ingreso), s: XS.date } : { v: '', s: XS.text }, mon(l.pendiente), mon(l.com_admin), mon(l.bono_referido), mon(l.com_asesores), mon(l.com_lideres),
      { f: `D${r}+E${r}+F${r}+H${r}+I${r}+J${r}+K${r}+L${r}+N${r}+O${r}+AE${r}`, v: num(l.total_percepciones), s: XS.money }, mon(l.hrs_dobles), mon(l.horas_extras),
      { v: num(l.faltas), s: aj.has('faltas') ? XS.adj : XS.int }, { f: `ROUND(C${r}*P${r},2)`, v: num(l.faltas_monto), s: XS.money }, mon(l.otras_deducciones),
      { f: `M${r}-Q${r}-R${r}-T${r}-V${r}-W${r}`, v: num(l.neto), s: XS.money },
      { f: `ROUND(C${r}/8*U${r}*24,2)`, v: num(l.permisos_monto), s: XS.money }, { v: num(l.permisos_min) / 1440, s: XS.time },
      mon(l.multas_disciplina), mon(l.multas_retardo), { v: l.departamento || '', s: XS.text }, { v: l.clabe || '', s: l.clabe ? XS.text : XS.warn },
      { v: l.banco || '', s: XS.text }, { v: l.beneficiario || '', s: XS.text }, { v: '', s: XS.text }, { v: num(l.dias_pagados), s: aj.has('dias_no_lab') ? XS.adj : XS.int }, { v: num(l.vacaciones_dias), s: XS.int }, mon(l.prima_vacacional, 'prima_vacacional'), { v: notas, s: XS.wrap }
    ]);
  });
  const sum = (c, k) => ({ f: `SUM(${c}${first}:${c}${last})`, v: r2(lineas.reduce((s, l) => s + num(typeof k === 'function' ? k(l) : l[k]), 0)), s: XS.total });
  if (lineas.length) {
    const t = []; t[1] = { v: 'TOTALES', s: XS.bold };
    const cols = { D: 'nomina', E: 'festivo', F: 'chips', H: 'pendiente', I: 'com_admin', J: 'bono_referido', K: 'com_asesores', L: 'com_lideres', M: 'total_percepciones', N: 'hrs_dobles', O: 'horas_extras', Q: 'faltas_monto', R: 'otras_deducciones', S: 'neto', T: 'permisos_monto', V: 'multas_disciplina', W: 'multas_retardo' };
    for (const [c, k] of Object.entries(cols)) t[c.charCodeAt(0) - 65] = sum(c, k);
    t[30] = sum('AE', 'prima_vacacional');
    t[15] = { f: `SUM(P${first}:P${last})`, v: lineas.reduce((s, l) => s + num(l.faltas), 0), s: XS.int };
    rows.push(t);
    rows.push([]); rows.push([null, { v: 'NETO A PAGAR', s: XS.bold }, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, { f: `S${tr}`, v: r2(lineas.reduce((s, l) => s + num(l.neto), 0)), s: XS.total }]);
    rows.push([]); rows.push([null, { v: `Generado en Enterprise HR el ${fmtDateTime(new Date().toISOString())} · ${p.estado === 'autorizado' ? `Autorizado por ${profName(p.autorizado_by)} el ${fmtDateTime(p.autorizado_at)}` : 'BORRADOR (sin autorizar)'} · Celdas amarillas = ajustadas a mano. Permisos en horas:minutos. Salario diario × días pagados.`, s: XS.sub }]);
  }
  const nomina = { name: 'NOMINA', rows, freeze: [2, 3], zoom: 90, merges: ['B1:S1', 'Q2:R2'], heights: { 2: 45 },
    cols: [5, 38, 12, 12, 12, 11, 12, 12, 13, 11, 13, 12, 12, 8, 9, 6, 11, 12, 13, 13, 10, 11, 11, 23, 22, 15, 36, 26, 9, 11, 13, 48] };
  // INCIDENCIAS: pase de lista del periodo (fuente de faltas, retardos y permisos)
  const dias = []; for (let d = p.fecha_inicio; d <= p.fecha_fin; d = addDays(d, 1)) dias.push(d);
  const byEmp = {}; for (const a of att) ((byEmp[a.employee_id] = byEmp[a.employee_id] || {})[a.fecha] = byEmp[a.employee_id][a.fecha] || []).push(a);
  const DOW = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const code = (xs) => { if (!xs) return ''; const m = xs.find((a) => a.turno !== 'tarde'), t = xs.find((a) => a.turno === 'tarde'); return [m && attShort(m), t && t.status && t.status !== 'asistio' ? (t.status === 'salida' ? 'S' : 'F') + 'ᵗ' : ''].filter(Boolean).join(' '); };
  const inc = { name: 'INCIDENCIAS', freeze: [2, 3], cols: [5, 38, ...dias.map(() => 5), 8, 8, 8, 8],
    rows: [[null, { v: `INCIDENCIAS · ${periodoTitulo(p).toUpperCase()}`, s: XS.title }],
      [null, { v: 'A asistió · F falta · R retardo · P permiso · D descanso · I inactividad · Sᵗ salida anticipada (tarde) · Fᵗ ausente en la tarde · ★ día festivo', s: XS.sub }],
      [{ v: '#', s: XS.head }, { v: 'NOMBRE', s: XS.head }, ...dias.map((d) => ({ v: `${DOW[new Date(d + 'T12:00:00Z').getUTCDay()]} ${Number(d.slice(8))}${p.festivos.includes(d) ? ' ★' : ''}`, s: XS.head })), { v: 'FALTAS', s: XS.head }, { v: 'RETARDOS', s: XS.head }, { v: 'PERMISOS', s: XS.head }, { v: 'FALTAS EN NÓMINA', s: XS.head }],
      ...lineas.map((l, i) => { const m = byEmp[l.employee_id] || {}; const cs = dias.map((d) => code(m[d]));
        const fuera = (d) => (l.fecha_ingreso && d < l.fecha_ingreso) || (l.fecha_baja && d > l.fecha_baja);
        return [{ v: i + 1, s: XS.int }, { v: l.nombre, s: XS.text }, ...dias.map((d, j) => ({ v: fuera(d) ? '—' : cs[j], s: XS.int })),
          { v: dias.filter((d) => (m[d] || []).some((a) => a.turno !== 'tarde' && a.status === 'falta') && !p.festivos.includes(d)).length, s: XS.int },
          { v: num(l.retardos), s: XS.int }, { v: num(l.dias_permiso), s: XS.int }, { v: num(l.faltas), s: (l.ajustados || []).includes('faltas') ? XS.adj : XS.int }]; })] };
  // REVISIÓN: la misma revisión automática que se ve en la app
  const rev = { name: 'REVISION', freeze: [0, 3], cols: [5, 38, 14, 70],
    rows: [[null, { v: 'REVISIÓN AUTOMÁTICA', s: XS.title }], [null, { v: 'Revisión generada por la app; no sustituye la revisión de Nómina.', s: XS.sub }],
      [{ v: '#', s: XS.head }, { v: 'NOMBRE', s: XS.head }, { v: 'NIVEL', s: XS.head }, { v: 'OBSERVACIÓN', s: XS.head }]] };
  let n = 0;
  lineas.forEach((l) => lineaAlertas(l).forEach(([lv, , t]) => rev.rows.push([{ v: ++n, s: XS.int }, { v: l.nombre, s: XS.text }, { v: lv === 'bad' ? 'Pendiente' : lv === 'warn' ? 'Revisar' : 'Aviso', s: lv === 'bad' ? XS.warn : XS.text }, { v: t + (t.startsWith('Ajustado') && l.notas ? ' — ' + l.notas : ''), s: XS.wrap }])));
  if (!n) rev.rows.push([null, { v: 'Sin observaciones.', s: XS.text }]);
  return fins.length || pagos.length ? [nomina, finiquitosSheet(p, fins, pagos, lineas.length ? `NOMINA!S${tr}` : null, r2(lineas.reduce((s, l) => s + num(l.neto), 0))), inc, rev] : [nomina, inc, rev];
}
// FINIQUITOS: desglose de cada finiquito, pagos pendientes y el total a dispersar de la quincena
function finiquitosSheet(p, fins, pagos, netoRef, neto) {
  const rows = [[null, { v: `FINIQUITOS Y PAGOS PENDIENTES · ${periodoTitulo(p).toUpperCase()}`, s: XS.title }],
    [null, { v: 'Los días trabajados de la quincena se pagan en la hoja NOMINA. Vacaciones Art. 76, prima vacacional 25 % Art. 80, aguinaldo 15 días Art. 87, prima de antigüedad 12 días por año con tope de 2 salarios mínimos Art. 162 LFT.', s: XS.sub }],
    ['#', 'NOMBRE', 'DEPARTAMENTO', 'FECHA DE INGRESO', 'FECHA DE BAJA', 'MOTIVO', 'ANTIGÜEDAD (AÑOS)', 'SALARIO DIARIO', 'DÍAS DE VACACIONES', 'VACACIONES', 'PRIMA VACACIONAL', 'DÍAS DE AGUINALDO', 'AGUINALDO', 'SALARIO TOPE', 'PRIMA DE ANTIGÜEDAD', 'OTRAS PERCEPCIONES', 'DEDUCCIONES', 'TOTAL FINIQUITO', 'CLAVE', 'BANCO', 'BENEFICIARIO', 'FIRMA', 'NOTAS'].map((h) => ({ v: h, s: XS.head }))];
  const f0 = 4;
  fins.forEach((f, i) => {
    const r = f0 + i, aj = new Set(f.ajustados || []);
    const notas = [aj.size ? 'Ajustado: ' + [...aj].map((k) => FIN_AUTO[k] || k).join(', ') : '', num(f.vac_pendientes) ? `${num(f.vac_pendientes)} días de vacaciones de años anteriores` : '', num(f.vac_tomadas) ? `${num(f.vac_tomadas)} días ya disfrutados` : '',
      num(f.otras_percepciones) ? `Otras percepciones: ${f.otras_percepciones_concepto}` : '', num(f.deducciones) ? `Deducciones: ${f.deducciones_concepto}` : '', f.prima_antig_aplica ? '' : 'Prima de antigüedad: no aplica',
      f.monto_convenio != null ? `Convenio firmado: ${money(f.monto_convenio)}` : '', f.notas || ''].filter(Boolean).join(' · ');
    rows.push([{ v: i + 1, s: XS.int }, { v: f.nombre, s: XS.text }, { v: f.departamento || '', s: XS.text },
      f.fecha_ingreso ? { v: xlDate(f.fecha_ingreso), s: XS.date } : { v: '', s: XS.warn }, { v: xlDate(f.fecha_baja), s: XS.date }, { v: f.motivo || '', s: XS.wrap },
      { v: num(f.antiguedad_anios), s: XS.dec }, { v: num(f.salario_diario), s: aj.has('salario_diario') ? XS.adj : XS.money },
      { v: finVacNetos(f), s: aj.has('vac_dias') ? XS.adj : XS.dec }, { f: `ROUND(H${r}*I${r},2)`, v: num(f.vacaciones), s: XS.money }, { f: `ROUND(J${r}*0.25,2)`, v: num(f.prima_vacacional), s: XS.money },
      { v: num(f.aguinaldo_dias), s: aj.has('aguinaldo_dias') ? XS.adj : XS.dec }, { f: `ROUND(H${r}*L${r},2)`, v: num(f.aguinaldo), s: XS.money },
      { v: num(f.salario_tope), s: XS.money }, f.prima_antig_aplica ? { f: `ROUND(12*G${r}*N${r},2)`, v: num(f.prima_antiguedad), s: aj.has('prima_antig_aplica') ? XS.adj : XS.money } : { v: 0, s: aj.has('prima_antig_aplica') ? XS.adj : XS.money },
      { v: num(f.otras_percepciones), s: XS.money }, { v: num(f.deducciones), s: XS.money }, { f: `J${r}+K${r}+M${r}+O${r}+P${r}-Q${r}`, v: num(f.total), s: XS.money },
      { v: f.clabe || '', s: f.clabe ? XS.text : XS.warn }, { v: f.banco || '', s: XS.text }, { v: f.beneficiario || '', s: XS.text }, { v: '', s: XS.text }, { v: notas, s: XS.wrap }]);
  });
  const fl = f0 + fins.length - 1;
  const sumF = (c, k) => ({ f: `SUM(${c}${f0}:${c}${fl})`, v: r2(fins.reduce((s, f) => s + num(f[k]), 0)), s: XS.total });
  let finTot = null;
  if (fins.length) { const t = []; t[1] = { v: 'TOTAL FINIQUITOS', s: XS.bold }; for (const [c, k] of [['J', 'vacaciones'], ['K', 'prima_vacacional'], ['M', 'aguinaldo'], ['O', 'prima_antiguedad'], ['P', 'otras_percepciones'], ['Q', 'deducciones'], ['R', 'total']]) t[c.charCodeAt(0) - 65] = sumF(c, k); rows.push(t); finTot = `R${rows.length}`; }
  else rows.push([null, { v: 'Sin finiquitos en esta quincena.', s: XS.text }]);
  rows.push([]); rows.push([null, { v: 'PAGOS PENDIENTES', s: XS.bold }]);
  rows.push(['#', 'NOMBRE', 'DEPARTAMENTO', 'CONCEPTO', 'MONTO', 'CLAVE', 'BANCO', 'BENEFICIARIO', 'NOTAS'].map((h) => ({ v: h, s: XS.head })));
  const p0 = rows.length + 1;
  pagos.forEach((x, i) => rows.push([{ v: i + 1, s: XS.int }, { v: x.nombre, s: XS.text }, { v: x.departamento || '', s: XS.text }, { v: x.concepto, s: XS.wrap }, { v: num(x.monto), s: XS.money },
    { v: x.clabe || '', s: x.clabe ? XS.text : XS.warn }, { v: x.banco || '', s: XS.text }, { v: x.beneficiario || '', s: XS.text }, { v: x.notas || '', s: XS.wrap }]));
  let pagTot = null;
  if (pagos.length) { const t = []; t[1] = { v: 'TOTAL PAGOS PENDIENTES', s: XS.bold }; t[4] = { f: `SUM(E${p0}:E${rows.length})`, v: r2(pagos.reduce((s, x) => s + num(x.monto), 0)), s: XS.total }; rows.push(t); pagTot = `E${rows.length}`; }
  else rows.push([null, { v: 'Sin pagos pendientes en esta quincena.', s: XS.text }]);
  const tf = r2(fins.reduce((s, f) => s + num(f.total), 0)), tp = r2(pagos.reduce((s, x) => s + num(x.monto), 0));
  rows.push([]); rows.push([null, { v: 'RESUMEN DE LA QUINCENA', s: XS.bold }]);
  const r0 = rows.length + 1;
  rows.push([null, { v: 'Neto nómina', s: XS.text }, netoRef ? { f: netoRef, v: neto, s: XS.money } : { v: 0, s: XS.money }]);
  rows.push([null, { v: 'Finiquitos', s: XS.text }, finTot ? { f: finTot, v: tf, s: XS.money } : { v: 0, s: XS.money }]);
  rows.push([null, { v: 'Pagos pendientes', s: XS.text }, pagTot ? { f: pagTot, v: tp, s: XS.money } : { v: 0, s: XS.money }]);
  rows.push([null, { v: 'TOTAL A DISPERSAR', s: XS.bold }, { f: `SUM(C${r0}:C${r0 + 2})`, v: r2(neto + tf + tp), s: XS.total }]);
  return { name: 'FINIQUITOS', rows, freeze: [2, 3], zoom: 90, merges: ['B1:R1'], heights: { 2: 45 },
    cols: [5, 34, 22, 12, 12, 30, 11, 12, 11, 13, 13, 11, 13, 12, 13, 13, 13, 14, 22, 15, 30, 22, 50] };
}
async function exportPrenomina(p, lineas, fins = [], pagos = []) {
  if (!lineas.length) throw new Error('La pre-nómina no tiene personas.');
  const att = await db('attendance').select('employee_id,fecha,turno,status,incidencia').gte('fecha', p.fecha_inicio).lte('fecha', p.fecha_fin).order('fecha').order('id').getAll();
  const blob = xlsxBuild(prenominaSheets(p, lineas, att, fins, pagos));
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `Prenomina_${p.numero ? 'P' + p.numero + '_' : ''}${p.fecha_inicio}_al_${p.fecha_fin}${p.estado === 'autorizado' ? '' : '_BORRADOR'}.xlsx`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  toast('Excel listo');
}

// ───────────────────────── Mensajes internos ─────────────────────────
// Directos (cualquiera con cualquiera), grupos por área (automáticos) y grupos manuales.
// Los mensajes no se editan ni se borran; solo Daniel puede ocultar uno. Se actualiza solo cada pocos segundos.
const CHAT_BUCKET = 'chat';
const CH = { conv: null, info: null, msgs: [], members: [], lastId: 0, synced: false, timer: null, unread: null, list: [], q: '' };
const canCreateGroup = () => is('developer', 'director', 'rh_general', 'rh_area', 'supervisor');
const convName = (c) => c.tipo === 'directo' ? profName(c.otro_id) : c.nombre || 'Grupo';
const convIcon = (c) => c.tipo === 'directo' ? `<span class="ch-av">${esc(initialsOf(profName(c.otro_id)))}</span>` : `<span class="ch-av grp">${c.tipo === 'area' ? '⌂' : '👥'}</span>`;
const initialsOf = (n) => String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
const hora = (ts) => fmtTime(ts);
const diaChat = (ts) => { const d = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts)); return d === todayMX() ? 'Hoy' : d === addDays(todayMX(), -1) ? 'Ayer' : dayLabel(d); };
const cuando = (ts) => { if (!ts) return ''; const d = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(ts)); return d === todayMX() ? hora(ts) : d === addDays(todayMX(), -1) ? 'Ayer' : fmtDate(d).slice(0, 5); };

async function viewChat() {
  const v = $('#view');
  const id = (location.hash.match(/^#\/chat\/([0-9a-f-]{36})/i) || [])[1] || null;
  if (!CH.synced) { try { await rpc('chat_sync_areas'); } catch { /* sin conexión */ } CH.synced = true; }
  CH.conv = id; CH.msgs = []; CH.lastId = 0; CH.info = null;
  v.innerHTML = `<div class="chat${id ? ' has-conv' : ''}">
    <aside class="ch-list">
      <div class="ch-lh"><b style="font-size:18px">Mensajes</b><span class="grow"></span>
        ${'Notification' in window && Notification.permission === 'default' ? '<button type="button" class="btn sm" id="ch_notif" title="Recibir aviso cuando llegue un mensaje">🔔 Avisos</button>' : ''}
        <button type="button" class="btn sm primary" id="ch_new">+ Nuevo</button></div>
      <input class="inp" id="ch_q" type="search" placeholder="Buscar conversación" value="${esc(CH.q)}" aria-label="Buscar conversación" style="margin:0 12px 8px">
      <div id="ch_items" class="ch-items"><div class="empty">Cargando…</div></div>
    </aside>
    <section class="ch-main" id="ch_main">${id ? '<div class="empty">Cargando…</div>' : '<div class="ch-empty"><div style="font-size:40px">💬</div><b>Elige una conversación</b><span class="muted small">o empieza una nueva con “+ Nuevo”.</span></div>'}</section>
  </div>`;
  $('#ch_new').onclick = () => nuevoChat();
  $('#ch_q').oninput = (e) => { CH.q = e.target.value; pintarLista(); };
  const nb = $('#ch_notif'); if (nb) nb.onclick = async () => { try { await Notification.requestPermission(); } catch { /* */ } nb.remove(); if (Notification.permission === 'granted') toast('Avisos activados'); };
  await cargarLista();
  if (id) await abrirConv(id);
  clearInterval(CH.timer);
  let n = 0;
  CH.timer = setInterval(async () => {
    if (S.view !== 'chat' || !$('#ch_items')) { clearInterval(CH.timer); return; }
    if (document.hidden) return;
    n++;
    try { if (CH.conv) await nuevosMensajes(); if (n % 3 === 0 || !CH.conv) await cargarLista(); } catch { /* reintenta */ }
  }, 3000);
}

async function cargarLista() {
  CH.list = await rpc('chat_resumen');
  pintarLista();
  updateChatBadge(CH.list.reduce((s, c) => s + (c.no_leidos || 0), 0));
}
function pintarLista() {
  const box = $('#ch_items'); if (!box) return;
  const q = norm(CH.q);
  const xs = CH.list.filter((c) => !q || norm(convName(c)).includes(q));
  box.innerHTML = xs.length ? xs.map((c) => `<a class="ch-item${c.id === CH.conv ? ' on' : ''}" href="#/chat/${c.id}">
      ${convIcon(c)}
      <span class="grow" style="min-width:0"><span class="row" style="gap:6px;flex-wrap:nowrap"><b class="ch-nm">${esc(convName(c))}</b><span class="small muted" style="margin-left:auto;flex-shrink:0">${cuando(c.last_msg_at)}</span></span>
      <span class="row" style="gap:6px;flex-wrap:nowrap"><span class="small muted ch-prev">${c.tipo === 'area' ? '<span class="badge b-mut" style="font-size:10px;padding:0 5px">Área</span> ' : c.tipo === 'grupo' ? `<span class="badge b-mut" style="font-size:10px;padding:0 5px">${c.miembros}</span> ` : ''}${c.ultimo_texto ? (c.ultimo_autor === S.me.id ? 'Tú: ' : c.tipo !== 'directo' && c.ultimo_autor ? esc(profName(c.ultimo_autor).split(' ')[0]) + ': ' : '') + esc(c.ultimo_texto) : '<i>Sin mensajes</i>'}</span>
      ${c.no_leidos ? `<span class="cnt badge b-bad" style="margin-left:auto">${c.no_leidos}</span>` : ''}</span></span></a>`).join('')
    : `<div class="empty small">${CH.list.length ? 'Nada coincide.' : 'Aún no tienes conversaciones. Toca “+ Nuevo”.'}</div>`;
}

async function abrirConv(id) {
  const main = $('#ch_main');
  const [info] = CH.list.filter((c) => c.id === id);
  if (!info) { main.innerHTML = '<div class="ch-empty"><b>No encontrada</b><span class="muted small">Ya no participas en esta conversación.</span><a class="btn sm" href="#/chat">Volver</a></div>'; return; }
  CH.info = info;
  const sub = info.tipo === 'directo' ? esc(ROLES[(S.profiles.find((p) => p.id === info.otro_id) || {}).role] || '') : `${info.miembros} integrantes${info.tipo === 'area' ? ' · grupo del área (automático)' : ''}`;
  main.innerHTML = `<header class="ch-head"><a class="btn sm ch-back" href="#/chat" aria-label="Volver">‹</a>${convIcon(info)}
      <div class="grow" style="min-width:0"><b class="ch-nm">${esc(convName(info))}</b><div class="small muted">${sub}</div></div>
      <button type="button" class="btn sm" id="ch_info">${info.tipo === 'directo' ? 'Info' : 'Integrantes'}</button></header>
    <div class="ch-msgs" id="ch_msgs"><div class="empty">Cargando…</div></div>
    <form class="ch-comp" id="ch_form" autocomplete="off">
      <button type="button" class="btn sm ch-clip" id="ch_att" title="Adjuntar foto o PDF" aria-label="Adjuntar">📎</button>
      <textarea id="ch_txt" rows="1" maxlength="4000" placeholder="Escribe un mensaje" aria-label="Mensaje"></textarea>
      <button type="submit" class="btn primary" id="ch_send" aria-label="Enviar">Enviar</button>
      <input type="file" id="ch_file" accept="image/*,application/pdf" hidden>
    </form>`;
  $('#ch_info').onclick = () => infoConv(info);
  const ta = $('#ch_txt');
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && matchMedia('(pointer: fine)').matches) { e.preventDefault(); $('#ch_form').requestSubmit(); } });
  $('#ch_form').onsubmit = async (e) => { e.preventDefault(); await enviar(id, ta.value); };
  $('#ch_att').onclick = () => $('#ch_file').click();
  $('#ch_file').onchange = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) await enviarArchivo(id, f); };
  const [msgs, members] = await Promise.all([
    db('chat_mensajes').eq('conversacion_id', id).order('id', false).limit(200).get(),
    db('chat_miembros').eq('conversacion_id', id).eq('activo', true).get()
  ]);
  CH.msgs = msgs.reverse(); CH.members = members; CH.lastId = CH.msgs.length ? CH.msgs[CH.msgs.length - 1].id : 0;
  pintarMensajes(true);
  if (matchMedia('(pointer: fine)').matches) ta.focus();
  if (info.no_leidos) { await rpc('chat_marcar_leido', { p_conv: id }).catch(() => {}); info.no_leidos = 0; pintarLista(); refreshChatBadge(); }
}

async function nuevosMensajes() {
  const id = CH.conv; if (!id || !$('#ch_msgs')) return;
  const [nuevos, members] = await Promise.all([
    db('chat_mensajes').eq('conversacion_id', id).gte('id', CH.lastId + 1).order('id').get(),
    db('chat_miembros').eq('conversacion_id', id).eq('activo', true).get()
  ]);
  if (id !== CH.conv) return;
  const vistoAntes = JSON.stringify(CH.members.map((m) => [m.user_id, m.last_read_at]));
  CH.members = members;
  if (nuevos.length) {
    CH.msgs.push(...nuevos.filter((m) => !CH.msgs.some((x) => x.id === m.id))); CH.lastId = CH.msgs[CH.msgs.length - 1].id;
    pintarMensajes(false);
    if (nuevos.some((m) => m.user_id !== S.me.id) && !document.hidden) { await rpc('chat_marcar_leido', { p_conv: id }).catch(() => {}); }
  } else if (vistoAntes !== JSON.stringify(members.map((m) => [m.user_id, m.last_read_at]))) pintarMensajes(false);
}

function pintarMensajes(forceBottom) {
  const box = $('#ch_msgs'); if (!box) return;
  const nearBottom = forceBottom || box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  const info = CH.info; const others = CH.members.filter((m) => m.user_id !== S.me.id);
  let lastDay = null, lastUser = null; const out = [];
  if (!CH.msgs.length) out.push(`<div class="ch-empty"><span class="muted small">${info.tipo === 'directo' ? 'Escribe el primer mensaje.' : 'Nadie ha escrito en este grupo.'}</span><span class="muted small">Los mensajes no se pueden borrar.</span></div>`);
  CH.msgs.forEach((m, i) => {
    const d = diaChat(m.created_at);
    if (d !== lastDay) { out.push(`<div class="ch-day"><span>${esc(d)}</span></div>`); lastDay = d; lastUser = null; }
    const mine = m.user_id === S.me.id;
    const showName = !mine && info.tipo !== 'directo' && lastUser !== m.user_id;
    lastUser = m.user_id;
    let estado = '';
    if (mine) {
      const vistos = others.filter((o) => o.last_read_at && new Date(o.last_read_at) >= new Date(m.created_at)).length;
      estado = info.tipo === 'directo' ? (vistos ? '<span class="ch-tick seen" title="Visto">✓✓</span>' : '<span class="ch-tick" title="Enviado">✓</span>')
        : (i === CH.msgs.length - 1 || CH.msgs.slice(i + 1).every((x) => x.user_id !== S.me.id)) ? `<span class="ch-tick${vistos ? ' seen' : ''}">${vistos ? `Visto por ${vistos}${vistos === others.length ? ' (todos)' : ''}` : '✓'}</span>` : '';
    }
    const body = m.oculto
      ? `<i class="muted">Mensaje oculto por ${esc(profName(m.oculto_por))}${m.oculto_motivo ? ': ' + esc(m.oculto_motivo) : ''}</i>${is('developer') && m.texto ? `<div class="small muted" style="text-decoration:line-through">${esc(m.texto)}</div>` : ''}`
      : `${m.adjunto_path ? (/^image\//.test(m.adjunto_tipo || '') ? `<button type="button" class="ch-img" data-img="${esc(m.adjunto_path)}" aria-label="Ver imagen"><span class="small muted">Cargando imagen…</span></button>` : `<button type="button" class="ch-file" data-file="${esc(m.adjunto_path)}">📄 ${esc(m.adjunto_nombre || 'archivo')}</button>`) : ''}${m.texto ? `<div class="ch-txt">${linkify(esc(m.texto))}</div>` : ''}`;
    out.push(`<div class="ch-row${mine ? ' me' : ''}" data-mid="${m.id}"><div class="ch-bub${m.oculto ? ' hid' : ''}">${showName ? `<div class="ch-who">${esc(profName(m.user_id))}</div>` : ''}${body}
      <div class="ch-meta">${hora(m.created_at)} ${estado}${is('developer') && !m.oculto ? ` <button type="button" class="ch-hide" data-hide="${m.id}" title="Ocultar mensaje">ocultar</button>` : ''}</div></div></div>`);
  });
  box.innerHTML = out.join('');
  $$('[data-img]', box).forEach((b) => { storageUrl(CHAT_BUCKET, b.dataset.img).then((u) => { b.innerHTML = `<img src="${u}" alt="Imagen adjunta" loading="lazy">`; b.onclick = () => window.open(u, '_blank'); }).catch(() => { b.innerHTML = '<span class="small muted">No se pudo cargar la imagen</span>'; }); });
  $$('[data-file]', box).forEach((b) => b.onclick = async () => { const w = window.open('about:blank', '_blank'); try { const u = await storageUrl(CHAT_BUCKET, b.dataset.file); if (w) w.location = u; else location.href = u; } catch (e) { if (w) w.close(); toast(e.message, true); } });
  $$('[data-hide]', box).forEach((b) => b.onclick = () => ocultarMensaje(Number(b.dataset.hide)));
  if (nearBottom) box.scrollTop = box.scrollHeight;
}
const linkify = (h) => h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>').replace(/\n/g, '<br>');

async function enviar(id, texto) {
  const t = String(texto || '').trim(); if (!t) return;
  const btn = $('#ch_send'); btn.disabled = true;
  try {
    await db('chat_mensajes').insert([{ conversacion_id: id, texto: t }]);
    const ta = $('#ch_txt'); if (ta) { ta.value = ''; ta.style.height = 'auto'; }
    await nuevosMensajes(); const box = $('#ch_msgs'); if (box) box.scrollTop = box.scrollHeight;
    cargarLista().catch(() => {});
  } catch (e) { toast(e.message, true); }
  finally { btn.disabled = false; }
}
async function enviarArchivo(id, f) {
  const mime = mimeOf(f);
  if (f.size > 10 * 1024 * 1024) return toast('El archivo pasa de 10 MB', true);
  if (!/^image\/|^application\/pdf$/.test(mime)) return toast('Solo fotos o PDF', true);
  const ext = (f.name.match(/\.([a-z0-9]{1,6})$/i) || [])[1];
  const key = `${id}/${newId()}${ext ? '.' + ext.toLowerCase() : ''}`;
  const ta = $('#ch_txt'); const texto = ta ? ta.value.trim() : '';
  toast('Enviando archivo…');
  try {
    await storageUpload(CHAT_BUCKET, key, f);
    await db('chat_mensajes').insert([{ conversacion_id: id, texto: texto || null, adjunto_path: key, adjunto_nombre: f.name.slice(0, 200), adjunto_tipo: mime, adjunto_tamano: f.size }]);
    if (ta) ta.value = '';
    await nuevosMensajes(); cargarLista().catch(() => {});
    toast('Archivo enviado');
  } catch (e) { toast('No se pudo enviar: ' + e.message, true); }
}
function ocultarMensaje(mid) {
  const f = [{ k: 'motivo', label: 'Motivo', req: true, full: true, hint: 'El mensaje no se borra: queda oculto con quién y por qué.' }];
  modal({ title: 'Ocultar mensaje', body: fieldsHtml(f), actions: [{ label: 'Cancelar' }, { label: 'Ocultar', cls: 'danger', run: async ({ el }) => {
    const v = readFields(el, f); await rpc('chat_ocultar', { p_msg: mid, p_motivo: v.motivo });
    const m = CH.msgs.find((x) => x.id === mid); if (m) Object.assign(m, { oculto: true, oculto_por: S.me.id, oculto_motivo: v.motivo });
    pintarMensajes(false); toast('Mensaje oculto');
  } }] });
}

const personasActivas = () => S.profiles.filter((p) => p.active && p.role && p.id !== S.me.id).sort((a, b) => a.full_name.localeCompare(b.full_name, 'es'));
function selectorPersonas(xs, { multi, pre = [] } = {}) {
  return `<input class="inp" id="sp_q" type="search" placeholder="Buscar persona" style="width:100%;margin-bottom:8px">
    <div class="list" id="sp_l" style="max-height:46vh;overflow:auto">${xs.map((p) => `<label class="item sp-it" data-n="${esc(norm(p.full_name + ' ' + (ROLES[p.role] || '')))}" style="gap:10px">
      ${multi ? `<input type="checkbox" value="${p.id}"${pre.includes(p.id) ? ' checked' : ''}>` : ''}<span class="ch-av">${esc(initialsOf(p.full_name))}</span>
      <span class="grow"><span class="nm">${esc(p.full_name)}</span><br><span class="small muted">${esc(ROLES[p.role] || '')}</span></span>${multi ? '' : `<button type="button" class="btn sm primary" data-dm="${p.id}">Escribir</button>`}</label>`).join('') || '<div class="empty small">Nadie disponible.</div>'}</div>`;
}
function filtrarSelector(el) { const i = $('#sp_q', el); if (i) i.oninput = () => { const q = norm(i.value); $$('.sp-it', el).forEach((x) => { x.style.display = !q || x.dataset.n.includes(q) ? '' : 'none'; }); }; }

async function nuevoChat() {
  const m = modal({ title: 'Nueva conversación', body: `${canCreateGroup() ? '<div class="seg" style="margin-bottom:10px"><button type="button" class="on" data-nt="dm">Mensaje directo</button><button type="button" data-nt="grp">Nuevo grupo</button></div>' : ''}<div id="nc_b"></div>` });
  const dm = () => {
    $('#nc_b', m.el).innerHTML = selectorPersonas(personasActivas());
    filtrarSelector(m.el);
    $$('[data-dm]', m.el).forEach((b) => b.onclick = async () => { b.disabled = true; try { const id = await rpc('chat_directo', { p_user: b.dataset.dm }); m.close(); CH.list = []; location.hash = '#/chat/' + id; } catch (e) { toast(e.message, true); b.disabled = false; } });
  };
  const grp = async () => {
    const ok = new Set(await rpc('chat_agregables').then((r) => r.map((x) => (typeof x === 'string' ? x : x.chat_agregables || Object.values(x)[0]))));
    $('#nc_b', m.el).innerHTML = fieldsHtml([{ k: 'nombre', label: 'Nombre del grupo', req: true, full: true }]) + `<div class="eyebrow" style="margin:10px 0 6px">Integrantes</div>` + selectorPersonas(personasActivas().filter((p) => ok.has(p.id)), { multi: true })
      + `<div class="small muted" style="margin-top:6px">${is('developer', 'director') ? 'Puedes agregar a cualquier persona.' : 'Puedes agregar a gente de tus áreas, a Daniel y a Dirección.'}</div>
      <div class="row" style="justify-content:flex-end;margin-top:10px"><button type="button" class="btn primary" id="nc_ok">Crear grupo</button></div>`;
    filtrarSelector(m.el);
    $('#nc_ok', m.el).onclick = async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try {
        const { nombre } = readFields(m.el, [{ k: 'nombre', label: 'Nombre del grupo', req: true }]);
        const ids = $$('#sp_l input:checked', m.el).map((c) => c.value);
        if (!ids.length) throw new Error('Elige al menos a una persona.');
        const id = await rpc('chat_crear_grupo', { p_nombre: nombre, p_miembros: ids });
        m.close(); location.hash = '#/chat/' + id;
      } catch (e) { showErr(m.el, e); b.disabled = false; }
    };
  };
  $$('[data-nt]', m.el).forEach((b) => b.onclick = () => { $$('[data-nt]', m.el).forEach((x) => x.classList.toggle('on', x === b)); (b.dataset.nt === 'dm' ? dm : grp)(); });
  dm();
}

async function infoConv(info) {
  const members = await db('chat_miembros').eq('conversacion_id', info.id).eq('activo', true).get();
  const admin = info.tipo === 'grupo' && (info.admin || is('developer'));
  const lista = members.map((x) => S.profiles.find((p) => p.id === x.user_id) || { id: x.user_id, full_name: profName(x.user_id) }).sort((a, b) => a.full_name.localeCompare(b.full_name, 'es'));
  const m = modal({
    title: convName(info), wide: false, body: `
      ${info.tipo === 'area' ? '<div class="notice n-info">Grupo automático del área: entran y salen solos Supervisión, TL y RH asignados al área.</div>' : ''}
      ${admin ? fieldsHtml([{ k: 'nombre', label: 'Nombre del grupo', val: info.nombre, full: true }]) : ''}
      <div class="eyebrow" style="margin:10px 0 6px">${lista.length} integrantes</div>
      <div class="list">${lista.map((p) => { const mm = members.find((x) => x.user_id === p.id); return `<div class="item" style="gap:10px"><span class="ch-av">${esc(initialsOf(p.full_name))}</span>
        <span class="grow"><span class="nm">${esc(p.full_name)}${p.id === S.me.id ? ' (tú)' : ''}</span><br><span class="small muted">${esc(ROLES[p.role] || '')}${mm && mm.admin ? ' · creó el grupo' : ''}</span></span>
        ${p.id !== S.me.id && info.tipo !== 'directo' ? `<button type="button" class="btn sm" data-dm="${p.id}">Escribir</button>` : ''}
        ${admin && mm && !mm.admin ? `<button type="button" class="btn sm ghost" data-rm="${p.id}" aria-label="Quitar">✕</button>` : ''}</div>`; }).join('')}</div>`,
    actions: [
      ...(info.tipo === 'grupo' ? [{ label: 'Salir del grupo', cls: 'danger', run: async () => { if (!(await confirmBox('Salir del grupo', `¿Salir de <b>${esc(convName(info))}</b>?`, { danger: true, okLabel: 'Salir' }))) return false; await rpc('chat_salir', { p_conv: info.id }); location.hash = '#/chat'; } }] : []),
      ...(admin ? [{ label: 'Agregar personas', run: () => { setTimeout(() => agregarAGrupo(info, members), 0); } }, { label: 'Guardar nombre', cls: 'primary', run: async ({ el }) => { const { nombre } = readFields(el, [{ k: 'nombre', label: 'Nombre', req: true }]); await rpc('chat_editar_grupo', { p_conv: info.id, p_nombre: nombre, p_agregar: [], p_quitar: [] }); toast('Guardado'); viewChat(); } }] : [{ label: 'Cerrar' }])
    ]
  });
  $$('[data-dm]', m.el).forEach((b) => b.onclick = async () => { try { const id = await rpc('chat_directo', { p_user: b.dataset.dm }); m.close(); location.hash = '#/chat/' + id; } catch (e) { toast(e.message, true); } });
  $$('[data-rm]', m.el).forEach((b) => b.onclick = async () => { if (!(await confirmBox('Quitar del grupo', `¿Quitar a <b>${esc(profName(b.dataset.rm))}</b>?`, { danger: true, okLabel: 'Quitar' }))) return; try { await rpc('chat_editar_grupo', { p_conv: info.id, p_nombre: null, p_agregar: [], p_quitar: [b.dataset.rm] }); m.close(); toast('Quitado'); viewChat(); } catch (e) { toast(e.message, true); } });
}
async function agregarAGrupo(info, members) {
  const ok = new Set(await rpc('chat_agregables').then((r) => r.map((x) => (typeof x === 'string' ? x : x.chat_agregables || Object.values(x)[0]))));
  const ya = new Set(members.map((x) => x.user_id));
  modal({ title: 'Agregar a ' + convName(info), body: selectorPersonas(personasActivas().filter((p) => ok.has(p.id) && !ya.has(p.id)), { multi: true }),
    actions: [{ label: 'Cancelar' }, { label: 'Agregar', cls: 'primary', run: async ({ el }) => { const ids = $$('#sp_l input:checked', el).map((c) => c.value); if (!ids.length) throw new Error('Elige al menos a una persona.'); await rpc('chat_editar_grupo', { p_conv: info.id, p_nombre: null, p_agregar: ids, p_quitar: [] }); toast('Agregados'); viewChat(); } }] });
  setTimeout(() => filtrarSelector($$('.modal-bg').pop()), 0);
}

// Contador de no leídos en el menú y aviso del sistema (si la persona lo activó)
function updateChatBadge(n) {
  $$('[data-v="chat"]').forEach((a) => {
    let b = a.querySelector('.cnt'); if (!b) { b = document.createElement('span'); b.className = 'cnt badge b-bad'; b.style.marginLeft = 'auto'; a.appendChild(b); }
    b.textContent = n; b.style.display = n ? '' : 'none';
  });
  refreshMoreBadge();
  if (CH.unread != null && n > CH.unread && (document.hidden || S.view !== 'chat')) avisoMensaje(n - CH.unread);
  CH.unread = n;
}
async function refreshChatBadge() {
  if (!S.me || !VIEWS.chat || !VIEWS.chat.roles.includes(role())) return;
  try { updateChatBadge(await rpc('chat_no_leidos')); } catch { /* sin conexión */ }
}
async function avisoMensaje(n) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const title = n === 1 ? 'Nuevo mensaje' : `${n} mensajes nuevos`;
  const opt = { body: 'Enterprise HR · Mensajes', icon: 'icon-192.png', badge: 'icon-192.png', tag: 'ehr-chat', renotify: true, data: { url: location.pathname + '#/chat' } };
  try { const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration(); if (reg) await reg.showNotification(title, opt); else new Notification(title, opt); } catch { /* sin permiso */ }
}
setInterval(() => { if (S.me && S.view !== 'chat') refreshChatBadge(); }, 20000);

// ───────────────────────── PWA ─────────────────────────
if ('serviceWorker' in navigator && location.protocol === 'https:' && !CFG.demo) {
  // Actualización automática: busca versión nueva al abrir y al volver a la app; al activarse, recarga una sola vez
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloading) { reloading = true; location.reload(); } });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {}));
}
boot();
