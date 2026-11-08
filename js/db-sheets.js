// Capa de datos en MODO REAL: Google Apps Script + Google Sheets (gratis).
// Envía cada operación al script publicado como "Aplicación web" (config.js > apiUrl).
(function () {
  const TOKEN_KEY = 'rn_token_v1';
  function getTok() { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } }
  function setTok(v) { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch (e) { } }

  function create(cfg) {
    const url = cfg.apiUrl;
    let token = getTok();
    let roles = { isSuper: false, admin: null };
    const listeners = [];

    async function call(action, args) {
      let res;
      try {
        // text/plain evita la consulta previa CORS que Apps Script no responde
        res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, args: args || {}, token }) });
      } catch (e) { const x = new Error('network'); x.code = 'network'; throw x; }
      let j; try { j = await res.json(); } catch (e) { const x = new Error('bad_response'); x.code = 'network'; throw x; }
      if (!j.ok) {
        const x = new Error(j.message || j.code); x.code = j.code;
        if (j.code === 'unauthenticated') { token = null; setTok(null); emit(null); }
        throw x;
      }
      return j.data;
    }
    function emit(u) { listeners.forEach(cb => cb(u)); }
    async function loadMe() {
      if (!token) { roles = { isSuper: false, admin: null }; return null; }
      try {
        const me = await call('me');
        if (!me) { token = null; setTok(null); return null; }
        roles = { isSuper: !!me.isSuper, admin: me.admin }; return me.user;
      } catch (e) { if (e.code === 'network') throw e; return null; }
    }
    async function startSession(r) { token = r.token; setTok(token); const u = await loadMe(); emit(u); return u; }

    return {
      mode: 'sheets',
      onAuth(cb) { listeners.push(cb); loadMe().then(cb, () => cb(null)); },
      async signUp(email, pw) { return startSession(await call('signUp', { email, password: pw })); },
      async signIn(email, pw) { return startSession(await call('signIn', { email, password: pw })); },
      async signOut() { try { await call('signOut'); } catch (e) { } token = null; setTok(null); roles = { isSuper: false, admin: null }; emit(null); },
      async requestReset(email) { await call('requestReset', { email }); },
      async confirmReset(email, code, pw) { return startSession(await call('confirmReset', { email, code, password: pw })); },
      async getRoles() { return roles; },

      listAdmins: () => call('listAdmins'),
      setAdmin: (email, d) => call('setAdmin', { email, name: d.name, regionId: d.regionId }),
      removeAdmin: email => call('removeAdmin', { email }),

      listPublicEvents: () => call('listPublicEvents'),
      listEventsForAdmin: regionId => call('listEventsForAdmin', { regionId }),
      getEvent: id => call('getEvent', { id }),
      createEvent: data => call('createEvent', { data }),
      updateEvent: (id, patch) => call('updateEvent', { id, patch }),

      getRegistration: (eventId, uid) => call('getRegistration', { eventId, uid }),
      listRegistrations: (eventId, filter) => call('listRegistrations', { eventId, filter: filter || {} }),
      listMyRegistrations: () => call('listMyRegistrations'),
      createRegistration: (eventId, type, profile, contact) => call('createRegistration', { eventId, type, profile, contact }),
      updateRegistration: (eventId, profile, contact) => call('updateRegistration', { eventId, profile, contact }),
      setRegistrationStatus: (eventId, uid, status) => call('setRegistrationStatus', { eventId, uid, status }),
      getContact: (eventId, uid) => call('getContact', { eventId, uid }),
      listContacts: eventId => call('listContacts', { eventId })
    };
  }
  window.RN_createSheetsDB = create;
})();
