/**
 * PLATAFORMA DE RUEDAS DE NEGOCIOS — SERVIDOR (Google Apps Script + Google Sheets)
 * Versión 3: inscripción, aprobación, catálogo, agenda de reuniones, logos.
 * ---------------------------------------------------------------------------
 * Gratis con una cuenta Google. La planilla donde se instala este script es la
 * base de datos. Ver LEEME.md para la instalación paso a paso.
 *
 * 1) Cambia SUPERADMINS por tu correo.
 * 2) (Opcional) Pon en SITE_URL la dirección pública de la plataforma.
 * 3) Ejecuta una vez "setup" y luego Implementar > Aplicación web.
 *    (Al actualizar desde una versión anterior, las hojas y columnas nuevas
 *    se crean solas; igual puedes ejecutar "setup" otra vez sin perder datos.)
 */

const SUPERADMINS = ['TU-MAIL@gmail.com'];
const SITE_URL = '';               // ej: 'https://tuusuario.github.io/ruedas-negocios/'
const SEND_EMAILS = true;          // aprobación, reunión confirmada/cancelada, recuperación de contraseña
const SEND_REQUEST_EMAILS = false; // aviso por cada solicitud nueva (ojo: Gmail permite ~100 correos/día)
const SESSION_DAYS = 14;
const DEFAULT_TZ = 'America/Santiago';
const MAX_PENDING = 15;            // solicitudes pendientes enviadas por empresa
const EXPIRE_HOURS = 48;           // una solicitud sin respuesta vence
const CANCEL_HOURS = 24;           // se puede cancelar hasta X horas antes

// Las columnas nuevas siempre se agregan AL FINAL para no desordenar datos existentes
const SHEETS = {
  Users: ['uid', 'email', 'salt', 'hash', 'createdAt'],
  Sessions: ['token', 'uid', 'expires'],
  Resets: ['email', 'code', 'expires', 'tries'],
  Admins: ['email', 'name', 'regionId'],
  Events: ['id', 'name', 'market', 'regionId', 'description', 'regStart', 'regEnd', 'meetingDates', 'phase', 'coverPhoto', 'createdAt', 'updatedAt', 'schedule', 'tz'],
  Registrations: ['eventId', 'uid', 'type', 'status', 'companyName', 'serviceTypes', 'destination', 'products', 'sernaturRegistry', 'targetMarket', 'description', 'website', 'shareContact', 'consentData', 'consentAt', 'lang', 'tz', 'createdAt', 'updatedAt', 'reviewedAt', 'logo'],
  Contacts: ['eventId', 'uid', 'contactName', 'email', 'phone', 'companions'],
  Meetings: ['id', 'eventId', 'slot', 'requesterUid', 'targetUid', 'sellerUid', 'buyerUid', 'status', 'note', 'createdAt', 'respondedAt', 'cancelledBy'],
  Blocks: ['eventId', 'uid', 'slot']
};
const JSON_FIELDS = ['serviceTypes', 'companions', 'schedule'];
const BOOL_FIELDS = ['shareContact', 'consentData'];
const PHASES = ['borrador', 'inscripcion', 'agenda', 'reuniones', 'cerrado'];
const STATUSES = ['pendiente', 'aprobada', 'rechazada'];
const SERVICES = ['alojamiento', 'receptivo', 'agencia', 'transporte', 'gastronomia', 'aventura', 'enoturismo', 'cultural', 'mice', 'otro'];
const REGIONS = ['arica', 'tarapaca', 'antofagasta', 'atacama', 'coquimbo', 'valparaiso', 'metropolitana', 'ohiggins', 'maule', 'nuble', 'biobio', 'araucania', 'losrios', 'loslagos', 'aysen', 'magallanes'];
const ACTIVE = ['pendiente', 'aceptada'];

// ---------------------------------------------------------------- instalación
function setup() {
  Object.keys(SHEETS).forEach(name => ensureSheet(name));
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PEPPER')) props.setProperty('PEPPER', Utilities.getUuid() + Utilities.getUuid());
  return 'Listo: hojas creadas o actualizadas.';
}
function ensureSheet(name) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  const head = SHEETS[name];
  if (!sh) sh = ss.insertSheet(name);
  const cur = sh.getLastColumn() > 0 ? sh.getRange(1, 1, 1, Math.max(sh.getLastColumn(), 1)).getValues()[0] : [];
  if (cur.length < head.length || head.some((h, i) => cur[i] !== h)) {
    sh.getRange(1, 1, 1, head.length).setNumberFormat('@').setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

// ---------------------------------------------------------------- entrada HTTP
function doGet() { return out({ ok: true, app: 'ruedas-negocios', version: 3 }); }

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return out({ ok: false, code: 'bad_request', message: 'JSON inválido' }); }
  return out(handle(req));
}
// Separado de doPost para poder reutilizarlo en el modo demo del navegador
function handle(req) {
  const fn = ACTIONS[req && req.action];
  if (!fn) return { ok: false, code: 'bad_request', message: 'Acción desconocida' };
  resetCache();
  const mutating = MUTATING.indexOf(req.action) >= 0;
  const lock = mutating ? LockService.getScriptLock() : null;
  try {
    if (lock) lock.waitLock(20000);
    const ctx = { user: req.token ? sessionUser(String(req.token)) : null, token: req.token ? String(req.token) : null };
    const data = fn(req.args || {}, ctx);
    return { ok: true, data: data === undefined ? null : data };
  } catch (ex) {
    return { ok: false, code: ex.code || 'internal', message: String(ex.message || ex) };
  } finally {
    if (lock) try { lock.releaseLock(); } catch (x) { }
  }
}
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function err(code, msg) { const e = new Error(msg || code); e.code = code; return e; }

// ---------------------------------------------------------------- tablas
const _tableCache = {};
function table(name) {
  if (_tableCache[name]) return _tableCache[name];
  const sh = ensureSheet(name);
  const head = SHEETS[name];
  let rowsCache = null; // cache por petición
  const toObj = r => {
    const o = {};
    head.forEach((h, i) => {
      let v = r[i]; v = v === null || v === undefined ? '' : String(v);
      if (JSON_FIELDS.indexOf(h) >= 0) { try { v = v ? JSON.parse(v) : (h === 'schedule' ? null : []); } catch (x) { v = h === 'schedule' ? null : []; } }
      else if (BOOL_FIELDS.indexOf(h) >= 0) v = v === 'true' || v === 'TRUE';
      o[h] = v;
    });
    return o;
  };
  const toRow = o => head.map(h => {
    const v = o[h];
    if (JSON_FIELDS.indexOf(h) >= 0) return v === null || v === undefined || v === '' ? '' : JSON.stringify(v);
    if (BOOL_FIELDS.indexOf(h) >= 0) return v ? 'true' : 'false';
    return v === null || v === undefined ? '' : String(v);
  });
  const t = {
    all() {
      if (rowsCache) return rowsCache;
      const last = sh.getLastRow();
      rowsCache = last < 2 ? [] : sh.getRange(2, 1, last - 1, head.length).getValues().map((r, i) => ({ row: i + 2, obj: toObj(r) }));
      return rowsCache;
    },
    find(pred) { return this.all().filter(x => pred(x.obj)).map(x => x.obj); },
    first(pred) { const r = this.all().find(x => pred(x.obj)); return r ? r.obj : null; },
    insert(o) { const row = sh.getLastRow() + 1; sh.getRange(row, 1, 1, head.length).setNumberFormat('@').setValues([toRow(o)]); rowsCache = null; },
    update(pred, patch) {
      const r = this.all().find(x => pred(x.obj)); if (!r) throw err('not-found');
      const merged = Object.assign({}, r.obj, patch);
      sh.getRange(r.row, 1, 1, head.length).setNumberFormat('@').setValues([toRow(merged)]);
      r.obj = merged;
      return merged;
    },
    remove(pred) { const rows = this.all().filter(x => pred(x.obj)).map(x => x.row).reverse(); rows.forEach(n => sh.deleteRow(n)); rowsCache = null; return rows.length; }
  };
  _tableCache[name] = t;
  return t;
}
function resetCache() { Object.keys(_tableCache).forEach(k => delete _tableCache[k]); }

// ---------------------------------------------------------------- utilidades
function now() { return new Date().toISOString(); }
function lc(s) { return String(s || '').trim().toLowerCase(); }
function str(v, max) { return String(v === null || v === undefined ? '' : v).trim().slice(0, max || 500); }
function isEmail(s) { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s); }
function hashPw(pw, salt) {
  const pepper = PropertiesService.getScriptProperties().getProperty('PEPPER') || '';
  let h = salt + '|' + pw + '|' + pepper;
  for (let i = 0; i < 300; i++) h = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h + salt, Utilities.Charset.UTF_8));
  return h;
}
function newToken() { return Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''); }
function sessionUser(token) {
  const s = table('Sessions').first(x => x.token === token);
  if (!s || s.expires < now()) return null;
  const u = table('Users').first(x => x.uid === s.uid);
  return u ? { uid: u.uid, email: u.email } : null;
}
function startSession(u) {
  const token = newToken();
  table('Sessions').insert({ token, uid: u.uid, expires: new Date(Date.now() + SESSION_DAYS * 864e5).toISOString() });
  return { token, user: { uid: u.uid, email: u.email } };
}
function requireUser(ctx) { if (!ctx.user) throw err('unauthenticated', 'Sesión expirada'); return ctx.user; }
function superList() { return SUPERADMINS.concat(typeof RN_DEMO_SUPERADMINS !== 'undefined' ? RN_DEMO_SUPERADMINS : []).map(lc); }
function isSuper(user) { return !!user && superList().indexOf(lc(user.email)) >= 0; }
function adminOf(user) { return user ? table('Admins').first(x => x.email === lc(user.email)) : null; }
function isAdminOfRegion(user, regionId) { if (!user) return false; if (isSuper(user)) return true; const a = adminOf(user); return !!a && a.regionId === regionId; }
function getEventRaw(id) { return table('Events').first(x => x.id === String(id)); }
function eventOrThrow(id) { const e = getEventRaw(id); if (!e) throw err('not-found'); return e; }
function regOf(eventId, uid) { return table('Registrations').first(x => x.eventId === eventId && x.uid === uid); }
function myReg(eventId, user) { return user ? regOf(eventId, user.uid) : null; }
function isApproved(eventId, user) { const r = myReg(eventId, user); return !!r && r.status === 'aprobada'; }
function sendMail(to, subject, body) {
  if (!SEND_EMAILS || !to) return;
  try { MailApp.sendEmail({ to: to, subject: subject, body: body, name: 'Ruedas de Negocios' }); } catch (x) { /* sin cuota o error: no bloquear */ }
}
function contactOf(eventId, uid) { return table('Contacts').first(x => x.eventId === eventId && x.uid === uid); }

// ---------------------------------------------------------------- horarios
function tzOffsetMin(ms, tz) {
  const s = Utilities.formatDate(new Date(ms), tz, 'Z'); // ej: -0300
  const sign = s.charAt(0) === '-' ? -1 : 1;
  return sign * (Number(s.substr(1, 2)) * 60 + Number(s.substr(3, 2)));
}
function zonedToUtcMs(date, time, tz) {
  const d = date.split('-').map(Number), t = time.split(':').map(Number);
  const guess = Date.UTC(d[0], d[1] - 1, d[2], t[0], t[1]);
  const off = tzOffsetMin(guess, tz);
  let ms = guess - off * 60000;
  const off2 = tzOffsetMin(ms, tz);
  if (off2 !== off) ms = guess - off2 * 60000;
  return ms;
}
function hm(min) { return ('0' + Math.floor(min / 60)).slice(-2) + ':' + ('0' + (min % 60)).slice(-2); }
function toMin(s) { const p = String(s || '').split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); }
function cleanSchedule(s) {
  if (!s || typeof s !== 'object') return null;
  const days = (Array.isArray(s.days) ? s.days : []).map(d => str(d, 10)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
  const uniq = days.filter((d, i) => days.indexOf(d) === i).sort().slice(0, 10);
  const start = /^\d{2}:\d{2}$/.test(s.start) ? s.start : '09:00';
  const end = /^\d{2}:\d{2}$/.test(s.end) ? s.end : '13:00';
  const slot = Math.min(120, Math.max(5, Number(s.slot) || 20));
  const gap = Math.min(60, Math.max(0, Number(s.gap) || 0));
  if (!uniq.length || toMin(end) <= toMin(start)) return null;
  return { days: uniq, start, end, slot, gap };
}
// Lista de bloques del evento: { id: 'AAAA-MM-DD HH:MM', start, end (ISO UTC), day, time }
function slotsOf(ev) {
  const s = ev.schedule; if (!s) return [];
  const tz = ev.tz || DEFAULT_TZ; const out = [];
  s.days.forEach(day => {
    for (let m = toMin(s.start); m + s.slot <= toMin(s.end); m += s.slot + s.gap) {
      const st = zonedToUtcMs(day, hm(m), tz);
      out.push({ id: day + ' ' + hm(m), day, time: hm(m), start: new Date(st).toISOString(), end: new Date(st + s.slot * 60000).toISOString() });
    }
  });
  return out;
}
function slotById(ev, id) { return slotsOf(ev).find(s => s.id === id) || null; }

// ---------------------------------------------------------------- reuniones
function meetingsOf(eventId) {
  const t = table('Meetings');
  const ev = getEventRaw(eventId);
  const limit = Date.now() - EXPIRE_HOURS * 3600000;
  t.all().forEach(x => {
    const m = x.obj;
    if (m.eventId !== eventId || m.status !== 'pendiente') return;
    const sl = ev ? slotById(ev, m.slot) : null;
    if (Date.parse(m.createdAt) < limit || !sl || Date.parse(sl.start) <= Date.now()) {
      t.update(y => y.id === m.id, { status: 'vencida', respondedAt: now() });
    }
  });
  return t.find(m => m.eventId === eventId);
}
function busySlots(eventId, uid, meetings) {
  const busy = {};
  meetings.forEach(m => { if (m.status === 'aceptada' && (m.sellerUid === uid || m.buyerUid === uid)) busy[m.slot] = 'meeting'; });
  table('Blocks').find(b => b.eventId === eventId && b.uid === uid).forEach(b => { if (!busy[b.slot]) busy[b.slot] = 'blocked'; });
  return busy;
}
function publicCompany(r) { return r ? { uid: r.uid, companyName: r.companyName, type: r.type, logo: r.logo || '' } : null; }
function requireAgendaParticipant(eventId, user) {
  const ev = eventOrThrow(eventId);
  const me = myReg(ev.id, user);
  if (!me || me.status !== 'aprobada') throw err('permission-denied');
  return { ev, me };
}
function fmtSlotText(ev, slot) { return slot ? slot.day + ' ' + slot.time + ' (hora de Chile)' : ''; }
function mailMeeting(ev, m, kind, byUid) {
  const seller = regOf(ev.id, m.sellerUid), buyer = regOf(ev.id, m.buyerUid);
  const slot = slotById(ev, m.slot);
  const link = SITE_URL ? '\n\n' + SITE_URL + '#/evento/' + ev.id + '/agenda' : '';
  [[m.sellerUid, buyer], [m.buyerUid, seller]].forEach(([uid, other]) => {
    if (kind === 'cancelada' && uid === byUid) return;
    const c = contactOf(ev.id, uid); const r = regOf(ev.id, uid); if (!c || !other) return;
    const L = { es: 0, en: 1, pt: 2 }[r && r.lang] || 0;
    const subj = kind === 'aceptada'
      ? ['Reunión confirmada', 'Meeting confirmed', 'Reunião confirmada'][L]
      : kind === 'cancelada' ? ['Reunión cancelada', 'Meeting cancelled', 'Reunião cancelada'][L]
        : ['Nueva solicitud de reunión', 'New meeting request', 'Nova solicitação de reunião'][L];
    const body = [
      'Hola ' + c.contactName + ',\n\n' + subj + ' con ' + other.companyName + ' en "' + ev.name + '": ' + fmtSlotText(ev, slot) + '.',
      'Hello ' + c.contactName + ',\n\n' + subj + ' with ' + other.companyName + ' at "' + ev.name + '": ' + fmtSlotText(ev, slot).replace('hora de Chile', 'Chile time') + '.',
      'Olá ' + c.contactName + ',\n\n' + subj + ' com ' + other.companyName + ' em "' + ev.name + '": ' + fmtSlotText(ev, slot).replace('hora de Chile', 'horário do Chile') + '.'
    ][L] + link;
    sendMail(c.email, subj + ' · ' + ev.name, body);
  });
}

// ---------------------------------------------------------------- limpieza de datos
function cleanEvent(a) {
  const d = {
    name: str(a.name, 150), market: str(a.market, 60), regionId: str(a.regionId, 30), description: str(a.description, 1500),
    regStart: str(a.regStart, 10), regEnd: str(a.regEnd, 10), meetingDates: str(a.meetingDates, 120),
    phase: PHASES.indexOf(a.phase) >= 0 ? a.phase : 'borrador', coverPhoto: str(a.coverPhoto, 300),
    schedule: cleanSchedule(a.schedule), tz: str(a.tz, 60) || DEFAULT_TZ
  };
  if (!d.name || !d.market || REGIONS.indexOf(d.regionId) < 0) throw err('invalid', 'Faltan datos del evento');
  return d;
}
function cleanLogo(v) {
  v = String(v || '');
  if (!v) return '';
  if (v.length > 48000 || !/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(v)) throw err('invalid', 'Logo no válido');
  return v;
}
function cleanProfile(type, p) {
  const d = {
    companyName: str(p.companyName, 120), description: str(p.description, 800), website: str(p.website, 200),
    shareContact: p.shareContact === true, lang: ['es', 'en', 'pt'].indexOf(p.lang) >= 0 ? p.lang : 'es', tz: str(p.tz, 60),
    serviceTypes: [], destination: '', products: '', sernaturRegistry: '', targetMarket: '', logo: cleanLogo(p.logo)
  };
  if (d.website && !/^https?:\/\//i.test(d.website)) d.website = 'https://' + d.website.replace(/^\/+/, '');
  if (type === 'vendedor') {
    d.serviceTypes = (Array.isArray(p.serviceTypes) ? p.serviceTypes : []).filter(s => SERVICES.indexOf(s) >= 0).slice(0, 10);
    d.destination = str(p.destination, 120); d.products = str(p.products, 1500); d.sernaturRegistry = str(p.sernaturRegistry, 40);
    if (!d.serviceTypes.length || !d.destination || !d.products || !d.sernaturRegistry) throw err('invalid', 'Faltan datos obligatorios');
  } else {
    d.targetMarket = str(p.targetMarket, 200);
    if (!d.targetMarket) throw err('invalid', 'Faltan datos obligatorios');
  }
  if (!d.companyName) throw err('invalid', 'Falta el nombre de la empresa');
  return d;
}
function cleanContact(c, email) {
  const comps = (Array.isArray(c.companions) ? c.companions : []).slice(0, 2)
    .map(x => ({ name: str(x && x.name, 120), email: lc(x && x.email).slice(0, 120) })).filter(x => x.name || x.email);
  const d = { contactName: str(c.contactName, 120), phone: str(c.phone, 40), email: email, companions: comps };
  if (!d.contactName || !d.phone) throw err('invalid', 'Faltan datos de contacto');
  return d;
}

// ---------------------------------------------------------------- acciones
const MUTATING = ['signUp', 'signIn', 'signOut', 'requestReset', 'confirmReset', 'setAdmin', 'removeAdmin', 'createEvent', 'updateEvent', 'deleteEvent',
  'createRegistration', 'updateRegistration', 'setRegistrationStatus', 'requestMeeting', 'respondMeeting', 'cancelMeeting', 'setBlock',
  'listMyMeetings', 'listMeetings', 'getBusy'];

const ACTIONS = {
  // --- cuentas
  signUp(a) {
    const email = lc(a.email), pw = String(a.password || '');
    if (!isEmail(email)) throw err('auth/invalid-email');
    if (pw.length < 6) throw err('auth/weak-password');
    if (table('Users').first(x => x.email === email)) throw err('auth/email-already-in-use');
    const salt = Utilities.getUuid();
    const u = { uid: 'u' + Utilities.getUuid().replace(/-/g, '').slice(0, 20), email, salt, hash: hashPw(pw, salt), createdAt: now() };
    table('Users').insert(u);
    return startSession(u);
  },
  signIn(a) {
    const email = lc(a.email);
    const u = table('Users').first(x => x.email === email);
    if (!u || hashPw(String(a.password || ''), u.salt) !== u.hash) throw err('auth/invalid-credential');
    table('Sessions').remove(x => x.expires < now());
    return startSession(u);
  },
  signOut(a, ctx) { if (ctx.token) table('Sessions').remove(x => x.token === ctx.token); return true; },
  me(a, ctx) {
    if (!ctx.user) return null;
    const ad = adminOf(ctx.user);
    return { user: ctx.user, isSuper: isSuper(ctx.user), admin: ad ? { name: ad.name, regionId: ad.regionId } : null };
  },
  requestReset(a) {
    const email = lc(a.email);
    const u = table('Users').first(x => x.email === email);
    if (u) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      table('Resets').remove(x => x.email === email);
      table('Resets').insert({ email, code, expires: new Date(Date.now() + 30 * 60000).toISOString(), tries: '0' });
      sendMail(email, 'Código para restablecer tu contraseña',
        'Tu código para restablecer la contraseña es: ' + code + '\n\nVence en 30 minutos. Si no lo pediste, ignora este correo.\n\nYour password reset code is: ' + code);
    }
    return true; // misma respuesta exista o no la cuenta
  },
  confirmReset(a) {
    const email = lc(a.email), code = str(a.code, 10), pw = String(a.password || '');
    if (pw.length < 6) throw err('auth/weak-password');
    const r = table('Resets').first(x => x.email === email);
    if (!r || r.expires < now() || Number(r.tries) >= 5) throw err('auth/invalid-code');
    if (r.code !== code) { table('Resets').update(x => x.email === email, { tries: String(Number(r.tries) + 1) }); throw err('auth/invalid-code'); }
    const u = table('Users').first(x => x.email === email); if (!u) throw err('auth/invalid-code');
    const salt = Utilities.getUuid();
    table('Users').update(x => x.uid === u.uid, { salt, hash: hashPw(pw, salt) });
    table('Sessions').remove(x => x.uid === u.uid);
    table('Resets').remove(x => x.email === email);
    return startSession(u);
  },

  // --- administradores regionales
  listAdmins(a, ctx) { if (!isSuper(requireUser(ctx))) throw err('permission-denied'); return table('Admins').find(() => true); },
  setAdmin(a, ctx) {
    if (!isSuper(requireUser(ctx))) throw err('permission-denied');
    const email = lc(a.email); if (!isEmail(email) || REGIONS.indexOf(a.regionId) < 0) throw err('invalid');
    const t = table('Admins'); const d = { email, name: str(a.name, 120), regionId: a.regionId };
    if (t.first(x => x.email === email)) t.update(x => x.email === email, d); else t.insert(d);
    return true;
  },
  removeAdmin(a, ctx) { if (!isSuper(requireUser(ctx))) throw err('permission-denied'); table('Admins').remove(x => x.email === lc(a.email)); return true; },

  // --- eventos
  listPublicEvents() { return table('Events').find(e => e.phase !== 'borrador'); },
  listEventsForAdmin(a, ctx) {
    const u = requireUser(ctx);
    if (isSuper(u)) return table('Events').find(e => !a.regionId || e.regionId === a.regionId);
    const ad = adminOf(u); if (!ad) throw err('permission-denied');
    return table('Events').find(e => e.regionId === ad.regionId);
  },
  getEvent(a, ctx) {
    const e = getEventRaw(a.id); if (!e) return null;
    if (e.phase === 'borrador' && !isAdminOfRegion(ctx.user, e.regionId)) throw err('permission-denied');
    return e;
  },
  createEvent(a, ctx) {
    const u = requireUser(ctx); const d = cleanEvent(a.data || {});
    if (!isAdminOfRegion(u, d.regionId)) throw err('permission-denied');
    const id = 'ev-' + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
    table('Events').insert(Object.assign(d, { id, createdAt: now(), updatedAt: now() }));
    return id;
  },
  updateEvent(a, ctx) {
    const u = requireUser(ctx); const e = eventOrThrow(a.id); const d = cleanEvent(Object.assign({}, e, a.patch || {}));
    if (!isAdminOfRegion(u, e.regionId) || !isAdminOfRegion(u, d.regionId)) throw err('permission-denied');
    if (d.phase === 'agenda' && !d.schedule) throw err('invalid', 'Configura la grilla de reuniones antes de abrir la agenda');
    table('Events').update(x => x.id === e.id, Object.assign(d, { updatedAt: now() }));
    return true;
  },
  deleteEvent(a, ctx) {
    const u = requireUser(ctx); const e = eventOrThrow(a.id);
    if (!isAdminOfRegion(u, e.regionId)) throw err('permission-denied');
    ['Registrations', 'Contacts', 'Meetings', 'Blocks'].forEach(n => table(n).remove(x => x.eventId === e.id));
    table('Events').remove(x => x.id === e.id);
    return true;
  },

  // --- inscripciones
  getRegistration(a, ctx) {
    const u = requireUser(ctx); const e = eventOrThrow(a.eventId);
    const r = regOf(e.id, String(a.uid)); if (!r) return null;
    const ok = r.uid === u.uid || isAdminOfRegion(u, e.regionId) || (r.status === 'aprobada' && isApproved(e.id, u));
    if (!ok) throw err('permission-denied');
    return r;
  },
  listRegistrations(a, ctx) {
    const u = requireUser(ctx); const e = eventOrThrow(a.eventId); const f = a.filter || {};
    const admin = isAdminOfRegion(u, e.regionId);
    if (!admin && !(f.status === 'aprobada' && isApproved(e.id, u))) throw err('permission-denied');
    return table('Registrations').find(r => r.eventId === e.id && (!f.status || r.status === f.status) && (!f.type || r.type === f.type));
  },
  listMyRegistrations(a, ctx) { const u = requireUser(ctx); return table('Registrations').find(r => r.uid === u.uid); },
  createRegistration(a, ctx) {
    const u = requireUser(ctx); const e = eventOrThrow(a.eventId);
    if (e.phase !== 'inscripcion') throw err('permission-denied', 'Inscripciones cerradas');
    const type = a.type === 'comprador' ? 'comprador' : (a.type === 'vendedor' ? 'vendedor' : null);
    if (!type) throw err('invalid');
    if ((a.profile || {}).consentData !== true) throw err('invalid', 'Falta el consentimiento');
    if (myReg(e.id, u)) throw err('already-exists');
    const p = cleanProfile(type, a.profile || {}); const c = cleanContact(a.contact || {}, u.email);
    table('Registrations').insert(Object.assign(p, { eventId: e.id, uid: u.uid, type, status: 'pendiente', consentData: true, consentAt: now(), createdAt: now(), updatedAt: now(), reviewedAt: '' }));
    table('Contacts').insert(Object.assign(c, { eventId: e.id, uid: u.uid }));
    return true;
  },
  updateRegistration(a, ctx) {
    const u = requireUser(ctx); const e = eventOrThrow(a.eventId);
    const r = myReg(e.id, u); if (!r) throw err('permission-denied');
    const p = cleanProfile(r.type, a.profile || {});
    table('Registrations').update(x => x.eventId === e.id && x.uid === u.uid, Object.assign(p, { updatedAt: now() }));
    if (a.contact) {
      const c = cleanContact(a.contact, u.email); const t = table('Contacts');
      if (t.first(x => x.eventId === e.id && x.uid === u.uid)) t.update(x => x.eventId === e.id && x.uid === u.uid, c);
      else t.insert(Object.assign(c, { eventId: e.id, uid: u.uid }));
    }
    return true;
  },
  setRegistrationStatus(a, ctx) {
    const u = requireUser(ctx); const e = eventOrThrow(a.eventId);
    if (!isAdminOfRegion(u, e.regionId)) throw err('permission-denied');
    if (STATUSES.indexOf(a.status) < 0) throw err('invalid');
    const r = table('Registrations').update(x => x.eventId === e.id && x.uid === String(a.uid), { status: a.status, reviewedAt: now() });
    if (a.status === 'aprobada') {
      const c = contactOf(e.id, r.uid);
      if (c && c.email) {
        const link = SITE_URL ? '\n\n' + SITE_URL + '#/evento/' + e.id + '/catalogo' : '';
        const msg = {
          es: ['Tu inscripción fue aprobada', 'Hola ' + c.contactName + ',\n\nTu inscripción de ' + r.companyName + ' en "' + e.name + '" fue aprobada. Ya puedes ingresar y ver el catálogo de participantes.' + link],
          en: ['Your registration was approved', 'Hello ' + c.contactName + ',\n\nThe registration of ' + r.companyName + ' for "' + e.name + '" was approved. You can now sign in and browse the participants.' + link],
          pt: ['Sua inscrição foi aprovada', 'Olá ' + c.contactName + ',\n\nA inscrição de ' + r.companyName + ' em "' + e.name + '" foi aprovada. Você já pode entrar e ver o catálogo de participantes.' + link]
        }[r.lang] || null;
        if (msg) sendMail(c.email, msg[0], msg[1]);
      }
    }
    return true;
  },
  getContact(a, ctx) {
    const u = requireUser(ctx); const e = eventOrThrow(a.eventId); const uid = String(a.uid);
    const r = regOf(e.id, uid);
    const ok = uid === u.uid || isAdminOfRegion(u, e.regionId) ||
      (isApproved(e.id, u) && r && r.status === 'aprobada' && r.shareContact === true);
    if (!ok) throw err('permission-denied');
    return contactOf(e.id, uid);
  },
  listContacts(a, ctx) {
    const u = requireUser(ctx); const e = eventOrThrow(a.eventId);
    if (!isAdminOfRegion(u, e.regionId)) throw err('permission-denied');
    return table('Contacts').find(x => x.eventId === e.id);
  },

  // --- agenda (etapa 2)
  getSchedule(a, ctx) {
    const u = requireUser(ctx); const e = eventOrThrow(a.eventId);
    if (!isAdminOfRegion(u, e.regionId) && !isApproved(e.id, u)) throw err('permission-denied');
    return { tz: e.tz || DEFAULT_TZ, schedule: e.schedule, slots: slotsOf(e), rules: { maxPending: MAX_PENDING, expireHours: EXPIRE_HOURS, cancelHours: CANCEL_HOURS } };
  },
  getBusy(a, ctx) {
    const u = requireUser(ctx); const { ev } = requireAgendaParticipant(a.eventId, u);
    const target = regOf(ev.id, String(a.uid));
    if (!target || target.status !== 'aprobada') throw err('permission-denied');
    const ms = meetingsOf(ev.id);
    return Object.keys(busySlots(ev.id, target.uid, ms));
  },
  listMyMeetings(a, ctx) {
    const u = requireUser(ctx); const { ev } = requireAgendaParticipant(a.eventId, u);
    const ms = meetingsOf(ev.id).filter(m => m.sellerUid === u.uid || m.buyerUid === u.uid);
    const blocks = table('Blocks').find(b => b.eventId === ev.id && b.uid === u.uid).map(b => b.slot);
    return {
      meetings: ms.map(m => {
        const otherUid = m.sellerUid === u.uid ? m.buyerUid : m.sellerUid;
        return Object.assign({}, m, { incoming: m.targetUid === u.uid, other: publicCompany(regOf(ev.id, otherUid)) });
      }),
      blocks: blocks
    };
  },
  requestMeeting(a, ctx) {
    const u = requireUser(ctx); const { ev, me } = requireAgendaParticipant(a.eventId, u);
    if (ev.phase !== 'agenda') throw err('closed', 'La agenda no está abierta');
    const target = regOf(ev.id, String(a.uid));
    if (!target || target.status !== 'aprobada' || target.type === me.type) throw err('permission-denied');
    const slot = slotById(ev, String(a.slot));
    if (!slot || Date.parse(slot.start) <= Date.now()) throw err('slot-invalid', 'Horario no válido');
    const ms = meetingsOf(ev.id);
    const pair = m => (m.sellerUid === u.uid || m.buyerUid === u.uid) && (m.sellerUid === target.uid || m.buyerUid === target.uid);
    if (ms.some(m => pair(m) && ACTIVE.indexOf(m.status) >= 0)) throw err('pair-exists', 'Ya hay una reunión o solicitud con esta empresa');
    if (ms.filter(m => m.requesterUid === u.uid && m.status === 'pendiente').length >= MAX_PENDING) throw err('too-many', 'Límite de solicitudes pendientes');
    if (busySlots(ev.id, u.uid, ms)[slot.id]) throw err('me-busy', 'Ya tienes ese horario ocupado');
    if (busySlots(ev.id, target.uid, ms)[slot.id]) throw err('slot-taken', 'Ese horario ya no está disponible');
    const seller = me.type === 'vendedor' ? u.uid : target.uid, buyer = me.type === 'comprador' ? u.uid : target.uid;
    const m = { id: 'm' + Utilities.getUuid().replace(/-/g, '').slice(0, 12), eventId: ev.id, slot: slot.id, requesterUid: u.uid, targetUid: target.uid,
      sellerUid: seller, buyerUid: buyer, status: 'pendiente', note: str(a.note, 300), createdAt: now(), respondedAt: '', cancelledBy: '' };
    table('Meetings').insert(m);
    if (SEND_REQUEST_EMAILS) {
      const c = contactOf(ev.id, target.uid);
      if (c) sendMail(c.email, 'Nueva solicitud de reunión · ' + ev.name, 'Hola ' + c.contactName + ',\n\n' + me.companyName + ' te solicitó una reunión: ' + fmtSlotText(ev, slot) + '.' + (SITE_URL ? '\n\n' + SITE_URL + '#/evento/' + ev.id + '/agenda' : ''));
    }
    return m.id;
  },
  respondMeeting(a, ctx) {
    const u = requireUser(ctx); const { ev } = requireAgendaParticipant(a.eventId, u);
    if (ev.phase !== 'agenda') throw err('closed', 'La agenda no está abierta');
    const ms = meetingsOf(ev.id);
    const m = ms.find(x => x.id === String(a.id));
    if (!m || m.targetUid !== u.uid) throw err('permission-denied');
    if (m.status !== 'pendiente') throw err('not-pending', 'La solicitud ya no está pendiente');
    if (!a.accept) { table('Meetings').update(x => x.id === m.id, { status: 'rechazada', respondedAt: now() }); return 'rechazada'; }
    if (busySlots(ev.id, m.sellerUid, ms)[m.slot] || busySlots(ev.id, m.buyerUid, ms)[m.slot]) throw err('slot-taken', 'Ese horario ya está ocupado');
    table('Meetings').update(x => x.id === m.id, { status: 'aceptada', respondedAt: now() });
    // anula otras solicitudes pendientes de cualquiera de las dos empresas en ese mismo horario
    ms.filter(x => x.id !== m.id && x.status === 'pendiente' && x.slot === m.slot &&
      [x.sellerUid, x.buyerUid].some(z => z === m.sellerUid || z === m.buyerUid))
      .forEach(x => table('Meetings').update(y => y.id === x.id, { status: 'anulada', respondedAt: now() }));
    mailMeeting(ev, m, 'aceptada');
    return 'aceptada';
  },
  cancelMeeting(a, ctx) {
    const u = requireUser(ctx); const { ev } = requireAgendaParticipant(a.eventId, u);
    const m = meetingsOf(ev.id).find(x => x.id === String(a.id));
    if (!m || (m.sellerUid !== u.uid && m.buyerUid !== u.uid)) throw err('permission-denied');
    if (m.status === 'pendiente') {
      if (m.requesterUid !== u.uid) throw err('permission-denied');
      table('Meetings').update(x => x.id === m.id, { status: 'cancelada', respondedAt: now(), cancelledBy: u.uid });
      return true;
    }
    if (m.status !== 'aceptada') throw err('not-active');
    const slot = slotById(ev, m.slot);
    if (slot && Date.parse(slot.start) - Date.now() < CANCEL_HOURS * 3600000) throw err('too-late', 'Ya no se puede cancelar');
    table('Meetings').update(x => x.id === m.id, { status: 'cancelada', respondedAt: now(), cancelledBy: u.uid });
    mailMeeting(ev, m, 'cancelada', u.uid);
    return true;
  },
  setBlock(a, ctx) {
    const u = requireUser(ctx); const { ev } = requireAgendaParticipant(a.eventId, u);
    const slot = slotById(ev, String(a.slot)); if (!slot) throw err('slot-invalid');
    const t = table('Blocks');
    t.remove(b => b.eventId === ev.id && b.uid === u.uid && b.slot === slot.id);
    if (a.blocked) {
      if (busySlots(ev.id, u.uid, meetingsOf(ev.id))[slot.id] === 'meeting') throw err('me-busy');
      t.insert({ eventId: ev.id, uid: u.uid, slot: slot.id });
    }
    return true;
  },
  listMeetings(a, ctx) {
    const u = requireUser(ctx); const e = eventOrThrow(a.eventId);
    if (!isAdminOfRegion(u, e.regionId)) throw err('permission-denied');
    return meetingsOf(e.id);
  }
};
