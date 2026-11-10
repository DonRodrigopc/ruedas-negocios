// Capa de datos: conversa con el servidor (Google Apps Script).
// En modo real usa la "Aplicación web" publicada (config.js > apiUrl).
// En modo demo recibe un "transport" que ejecuta el mismo Code.gs dentro del navegador.
(function () {
  function create(cfg, opts) {
    opts = opts || {};
    const TOKEN_KEY = opts.tokenKey || 'rn_token_v1';
    const getTok = () => { try { return localStorage.getItem(TOKEN_KEY); } catch (e) { return null; } };
    const setTok = v => { try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch (e) { } };
    let token = getTok();
    let roles = { isSuper: false, admin: null };
    const listeners = [];

    const httpTransport = async req => {
      let res;
      try {
        // text/plain evita la consulta previa CORS que Apps Script no responde
        res = await fetch(cfg.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(req) });
      } catch (e) { return { ok: false, code: 'network' }; }
      try { return await res.json(); } catch (e) { return { ok: false, code: 'network' }; }
    };
    const transport = opts.transport || httpTransport;

    async function call(action, args) {
      const j = await transport({ action, args: args || {}, token });
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
        roles = { isSuper: !!me.isSuper, admin: me.admin, staffEvents: me.staffEvents || [], serverVersion: me.serverVersion || '' }; return me.user;
      } catch (e) { if (e.code === 'network') throw e; return null; }
    }
    async function startSession(r) { token = r.token; setTok(token); const u = await loadMe(); emit(u); return u; }

    return {
      mode: 'sheets',
      call,
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
      updateEvent: (id, patch, force) => call('updateEvent', { id, patch, force: !!force }),
      adminCancelMeeting: (eventId, id, fromSlot) => call('adminCancelMeeting', { eventId, id, fromSlot }),
      deleteEvent: id => call('deleteEvent', { id }),

      getRegistration: (eventId, uid) => call('getRegistration', { eventId, uid }),
      listRegistrations: (eventId, filter) => call('listRegistrations', { eventId, filter: filter || {} }),
      listMyRegistrations: () => call('listMyRegistrations'),
      createRegistration: (eventId, type, profile, contact) => call('createRegistration', { eventId, type, profile, contact }),
      updateRegistration: (eventId, profile, contact) => call('updateRegistration', { eventId, profile, contact }),
      setRegistrationStatus: (eventId, uid, status) => call('setRegistrationStatus', { eventId, uid, status }),
      getContact: (eventId, uid) => call('getContact', { eventId, uid }),
      listContacts: eventId => call('listContacts', { eventId }),

      // agenda
      getSchedule: eventId => call('getSchedule', { eventId }),
      getBusy: (eventId, uid) => call('getBusy', { eventId, uid }),
      listMyMeetings: eventId => call('listMyMeetings', { eventId }),
      requestMeeting: (eventId, uid, slot, note) => call('requestMeeting', { eventId, uid, slot, note }),
      respondMeeting: (eventId, id, accept) => call('respondMeeting', { eventId, id, accept }),
      cancelMeeting: (eventId, id) => call('cancelMeeting', { eventId, id }),
      setBlock: (eventId, slot, blocked) => call('setBlock', { eventId, slot, blocked }),
      listMeetings: eventId => call('listMeetings', { eventId }),
      // salas y cierre
      listRooms: eventId => call('listRooms', { eventId }),
      createRooms: eventId => call('createRooms', { eventId }),
      setRoom: (eventId, sellerUid, url) => call('setRoom', { eventId, sellerUid, url }),
      syncGuests: eventId => call('syncGuests', { eventId }),
      joinMeeting: (eventId, id) => call('joinMeeting', { eventId, id }),
      saveSurvey: (eventId, id, d) => call('saveSurvey', Object.assign({ eventId, id }, d)),
      listSurveys: eventId => call('listSurveys', { eventId }),
      // v5: acreditación, asignación, disponibilidad, monitor
      myAccreditation: eventId => call('myAccreditation', { eventId }),
      selfCheckin: eventId => call('selfCheckin', { eventId }),
      listCheckins: eventId => call('listCheckins', { eventId }),
      staffSearch: (eventId, q) => call('staffSearch', { eventId, q }),
      staffCheckin: (eventId, code, undo) => call('staffCheckin', { eventId, code, undo: !!undo }),
      listStaff: eventId => call('listStaff', { eventId }),
      setStaff: (eventId, email, name) => call('setStaff', { eventId, email, name }),
      removeStaff: (eventId, email) => call('removeStaff', { eventId, email }),
      setTable: (eventId, uid, table) => call('setTable', { eventId, uid, table }),
      autoTables: eventId => call('autoTables', { eventId }),
      markMeeting: (eventId, id, state) => call('markMeeting', { eventId, id, state }),
      heartbeat: (eventId, meetingId, leave) => call('heartbeat', { eventId, meetingId: meetingId || '', leave: !!leave }),
      getMonitor: eventId => call('getMonitor', { eventId }),
      getAvailability: eventId => call('getAvailability', { eventId }),
      getAgendas: eventId => call('getAgendas', { eventId }),
      adminSetBlock: (eventId, uid, slot, blocked) => call('adminSetBlock', { eventId, uid, slot, blocked }),
      adminMoveMeeting: (eventId, id, fromSlot, slot) => call('adminMoveMeeting', { eventId, id, fromSlot, slot }),
      adminAssignMeeting: (eventId, sellerUid, buyerUid, slot) => call('adminAssignMeeting', { eventId, sellerUid, buyerUid, slot }),
      suggestMeetings: eventId => call('suggestMeetings', { eventId })
    };
  }
  window.RN_createSheetsDB = create;
})();
