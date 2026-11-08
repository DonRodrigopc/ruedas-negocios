// Capa de datos en MODO DEMO: guarda todo en el navegador (localStorage).
// Imita las reglas de seguridad de Firestore para que la demo se comporte igual.
(function () {
  const KEY = 'rn_demo_db_v2';
  const SESSION = 'rn_demo_session_v1';
  let mem = null;          // respaldo en memoria si localStorage no está disponible
  let memSession = null;
  const listeners = [];

  function err(code) { const e = new Error(code); e.code = code; return e; }
  function now() { return new Date().toISOString(); }
  function uid() { return 'u' + Math.random().toString(36).slice(2, 10); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch (e) { if (mem) return mem; }
    if (mem) return mem;
    const db = seed(); save(db); return db;
  }
  function save(db) { mem = db; try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* memoria */ } }
  function getSession() { try { return localStorage.getItem(SESSION); } catch (e) { return memSession; } }
  function setSession(v) { memSession = v; try { v ? localStorage.setItem(SESSION, v) : localStorage.removeItem(SESSION); } catch (e) { } }

  function seed() {
    const db = { users: [], admins: {}, events: {}, regs: {}, contacts: {} };
    const add = (email, pw) => { const u = { uid: uid(), email, pw }; db.users.push(u); return u.uid; };
    add('admin@demo.cl', 'demo1234');
    add('valpo@demo.cl', 'demo1234');
    db.admins['valpo@demo.cl'] = { name: 'Admin Valparaíso (demo)', regionId: 'valparaiso' };
    const ev = 'ev-nacional-2027';
    db.events[ev] = {
      id: ev, name: 'Rueda de Negocios Mercado Nacional 2027', market: 'Nacional', regionId: 'valparaiso',
      description: 'Encuentro online entre prestadores turísticos de la Región de Valparaíso y agencias y tour operadores de todo Chile.',
      regStart: '2027-01-11', regEnd: '2027-02-05', meetingDates: '2027-03-02 al 2027-03-04', phase: 'inscripcion',
      createdAt: now(), updatedAt: now()
    };
    db.events['ev-brasil-2027'] = {
      id: 'ev-brasil-2027', name: 'Rueda de Negocios Mercado Brasil 2027', market: 'Brasil', regionId: 'valparaiso',
      description: 'Borrador: rueda con operadores brasileños.', regStart: '', regEnd: '', meetingDates: '', phase: 'borrador',
      createdAt: now(), updatedAt: now()
    };
    db.regs[ev] = {}; db.contacts[ev] = {};
    const people = [
      ['vendedor@demo.cl', 'vendedor', { companyName: 'Hotel Cerro Alegre', serviceTypes: ['alojamiento'], destination: 'Valparaíso', products: 'Hotel boutique de 18 habitaciones con vista a la bahía. Paquetes de fin de semana con tour patrimonial.', sernaturRegistry: '12345', description: 'Hotel boutique en el barrio patrimonial.', website: 'https://example.com', shareContact: true }, 'Carolina Pérez', '+56 9 1111 1111'],
      ['vinos@demo.cl', 'vendedor', { companyName: 'Ruta del Vino Casablanca', serviceTypes: ['enoturismo', 'gastronomia'], destination: 'Valle de Casablanca', products: 'Tours de día completo a 3 viñas con almuerzo maridaje.', sernaturRegistry: '23456', description: '', website: '', shareContact: false }, 'Matías Rojas', '+56 9 2222 2222'],
      ['aventura@demo.cl', 'vendedor', { companyName: 'Aventura Cerro a Mar', serviceTypes: ['aventura', 'receptivo'], destination: 'La Campana / Olmué', products: 'Trekking guiado, cabalgatas y kayak en la costa.', sernaturRegistry: '34567', description: '', website: '', shareContact: true }, 'Javiera Soto', '+56 9 3333 3333'],
      ['comprador@demo.cl', 'comprador', { companyName: 'Viajes del Sur Ltda.', targetMarket: 'Clientes de Santiago y Concepción, segmento familias', description: 'Agencia con 15 años vendiendo destinos nacionales.', website: '', shareContact: true }, 'Andrés Muñoz', '+56 9 4444 4444'],
      ['norte@demo.cl', 'comprador', { companyName: 'Norte Grande Tour Operador', targetMarket: 'Antofagasta y Calama, turismo corporativo', description: '', website: '', shareContact: false }, 'Fernanda Díaz', '+56 9 5555 5555'],
      ['pendiente@demo.cl', 'vendedor', { companyName: 'Cabañas Zapallar', serviceTypes: ['alojamiento'], destination: 'Zapallar', products: '6 cabañas frente al mar.', sernaturRegistry: '', description: '', website: '', shareContact: true }, 'Pedro León', '+56 9 6666 6666']
    ];
    people.forEach(([email, type, pub, contactName, phone]) => {
      const id = add(email, 'demo1234');
      const status = email === 'pendiente@demo.cl' ? 'pendiente' : 'aprobada';
      db.regs[ev][id] = Object.assign({ uid: id, eventId: ev, type, status, serviceTypes: [], destination: '', products: '', sernaturRegistry: '', targetMarket: '', lang: 'es', tz: 'America/Santiago', createdAt: now(), updatedAt: now() }, pub);
      db.contacts[ev][id] = { uid: id, contactName, email, phone, companions: [] };
    });
    return db;
  }

  function currentUser() {
    const s = getSession(); if (!s) return null;
    const u = load().users.find(x => x.uid === s); return u ? { uid: u.uid, email: u.email } : null;
  }
  function notify() { const u = currentUser(); listeners.forEach(cb => cb(u)); }
  function superEmails() { return (window.RN_CONFIG.superadminEmails || []).concat(['admin@demo.cl']).map(e => e.toLowerCase()); }
  function isAdminOfRegion(db, user, regionId) {
    if (!user) return false;
    const email = user.email.toLowerCase();
    if (superEmails().includes(email)) return true;
    const a = db.admins[email]; return !!(a && a.regionId === regionId);
  }
  function requireUser() { const u = currentUser(); if (!u) throw err('permission-denied'); return u; }

  const LocalDB = {
    mode: 'demo',
    onAuth(cb) { listeners.push(cb); setTimeout(() => cb(currentUser()), 0); },
    async signUp(email, pw) {
      email = String(email).trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw err('auth/invalid-email');
      if (!pw || pw.length < 6) throw err('auth/weak-password');
      const db = load();
      if (db.users.some(u => u.email === email)) throw err('auth/email-already-in-use');
      const u = { uid: uid(), email, pw }; db.users.push(u); save(db); setSession(u.uid); notify();
      return { uid: u.uid, email };
    },
    async signIn(email, pw) {
      email = String(email).trim().toLowerCase();
      const u = load().users.find(x => x.email === email && x.pw === pw);
      if (!u) throw err('auth/invalid-credential');
      setSession(u.uid); notify(); return { uid: u.uid, email: u.email };
    },
    async signOut() { setSession(null); notify(); },
    async requestReset() { /* en demo no se envían correos: el código es 123456 */ },
    async confirmReset(email, code, pw) {
      email = String(email).trim().toLowerCase();
      const db = load(); const u = db.users.find(x => x.email === email);
      if (!u || code !== '123456') throw err('auth/invalid-code');
      if (!pw || pw.length < 6) throw err('auth/weak-password');
      u.pw = pw; save(db); setSession(u.uid); notify(); return { uid: u.uid, email: u.email };
    },
    async getRoles() {
      const u = currentUser(); if (!u) return { isSuper: false, admin: null };
      const a = load().admins[u.email.toLowerCase()];
      return { isSuper: superEmails().includes(u.email.toLowerCase()), admin: a ? clone(a) : null };
    },
    async listAdmins() { const a = load().admins; return Object.keys(a).map(k => Object.assign({ email: k }, a[k])); },
    async setAdmin(email, data) { const db = load(); db.admins[email.toLowerCase()] = { name: data.name || '', regionId: data.regionId }; save(db); },
    async removeAdmin(email) { const db = load(); delete db.admins[email.toLowerCase()]; save(db); },

    async listPublicEvents() { return Object.values(load().events).filter(e => e.phase !== 'borrador').map(clone); },
    async listEventsForAdmin(regionId) {
      return Object.values(load().events).filter(e => !regionId || e.regionId === regionId).map(clone);
    },
    async getEvent(id) {
      const db = load(); const e = db.events[id]; if (!e) return null;
      if (e.phase === 'borrador' && !isAdminOfRegion(db, currentUser(), e.regionId)) throw err('permission-denied');
      return clone(e);
    },
    async createEvent(data) {
      const db = load(); if (!isAdminOfRegion(db, currentUser(), data.regionId)) throw err('permission-denied');
      const id = 'ev-' + Math.random().toString(36).slice(2, 9);
      db.events[id] = Object.assign({}, data, { id, createdAt: now(), updatedAt: now() }); db.regs[id] = {}; db.contacts[id] = {};
      save(db); return id;
    },
    async updateEvent(id, patch) {
      const db = load(); const e = db.events[id]; if (!e) throw err('not-found');
      const u = currentUser();
      if (!isAdminOfRegion(db, u, e.regionId) || !isAdminOfRegion(db, u, patch.regionId || e.regionId)) throw err('permission-denied');
      Object.assign(e, patch, { updatedAt: now() }); save(db);
    },

    async getRegistration(eventId, id) {
      const db = load(); const r = (db.regs[eventId] || {})[id]; if (!r) return null;
      const u = requireUser(); const e = db.events[eventId];
      const me = (db.regs[eventId] || {})[u.uid];
      const ok = id === u.uid || isAdminOfRegion(db, u, e.regionId) || (r.status === 'aprobada' && me && me.status === 'aprobada');
      if (!ok) throw err('permission-denied'); return clone(r);
    },
    async listRegistrations(eventId, filter) {
      filter = filter || {}; const db = load(); const u = requireUser(); const e = db.events[eventId];
      const isAdm = isAdminOfRegion(db, u, e.regionId);
      const me = (db.regs[eventId] || {})[u.uid];
      if (!isAdm && !(filter.status === 'aprobada' && me && me.status === 'aprobada')) throw err('permission-denied');
      return Object.values(db.regs[eventId] || {}).filter(r => (!filter.status || r.status === filter.status) && (!filter.type || r.type === filter.type)).map(clone);
    },
    async listMyRegistrations() {
      const db = load(); const out = []; const id = requireUser().uid;
      Object.keys(db.regs).forEach(ev => { const r = db.regs[ev][id]; if (r) out.push(clone(r)); }); return out;
    },
    async createRegistration(eventId, type, pub, contact) {
      const db = load(); const u = requireUser(); const e = db.events[eventId]; const id = u.uid;
      if (!e || e.phase !== 'inscripcion') throw err('permission-denied');
      if (!pub.consentData) throw err('invalid');
      if (db.regs[eventId][id]) throw err('already-exists');
      db.regs[eventId][id] = Object.assign({}, pub, { type, uid: id, eventId, status: 'pendiente', consentAt: now(), createdAt: now(), updatedAt: now() });
      db.contacts[eventId][id] = Object.assign({}, contact, { uid: id, email: u.email });
      save(db);
    },
    async updateRegistration(eventId, pub, contact) {
      const db = load(); const u = requireUser(); const id = u.uid; const r = db.regs[eventId][id];
      if (!r) throw err('permission-denied');
      const p = Object.assign({}, pub); ['status', 'type', 'uid', 'eventId'].forEach(k => delete p[k]);
      Object.assign(r, p, { updatedAt: now() });
      if (contact) db.contacts[eventId][id] = Object.assign({}, contact, { uid: id, email: u.email });
      save(db);
    },
    async setRegistrationStatus(eventId, id, status) {
      const db = load(); const e = db.events[eventId];
      if (!isAdminOfRegion(db, currentUser(), e.regionId)) throw err('permission-denied');
      db.regs[eventId][id].status = status; db.regs[eventId][id].reviewedAt = now(); save(db);
    },
    async getContact(eventId, id) {
      const db = load(); const u = requireUser(); const e = db.events[eventId];
      const r = db.regs[eventId][id]; const me = db.regs[eventId][u.uid];
      const ok = id === u.uid || isAdminOfRegion(db, u, e.regionId) ||
        (me && me.status === 'aprobada' && r && r.status === 'aprobada' && r.shareContact === true);
      if (!ok) throw err('permission-denied');
      return clone(db.contacts[eventId][id] || null);
    },
    async listContacts(eventId) {
      const db = load(); const e = db.events[eventId];
      if (!isAdminOfRegion(db, currentUser(), e.regionId)) throw err('permission-denied');
      return Object.values(db.contacts[eventId] || {}).map(clone);
    },

    resetDemo() { try { localStorage.removeItem(KEY); localStorage.removeItem(SESSION); } catch (e) { } mem = null; memSession = null; }
  };

  window.RN_LocalDB = LocalDB;
})();
