// MODO DEMO: ejecuta el mismo servidor (apps-script/Code.gs) dentro del navegador,
// con una "planilla" simulada guardada en este navegador. Así la demo se comporta
// exactamente igual que el modo real.
(function () {
  const KEY = 'rn_demo_v5';
  const TOKEN_KEY = 'rn_demo_token_v5';
  let mailListener = null;
  const outbox = [];

  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src)); document.head.appendChild(s); });
  }
  const dayPlus = n => { const d = new Date(Date.now() + n * 864e5); return d.toISOString().slice(0, 10); };

  async function seed(call) {
    window.setup();
    const sup = await call('signUp', { email: 'admin@demo.cl', password: 'demo1234' });
    const S = sup.token;
    const valpo = await call('signUp', { email: 'valpo@demo.cl', password: 'demo1234' });
    await call('setAdmin', { email: 'valpo@demo.cl', name: 'Admin Valparaíso (demo)', regionId: 'valparaiso' }, S);
    const schedule = { days: [dayPlus(7), dayPlus(8)], start: '09:00', end: '13:00', slot: 20, gap: 0, breaks: [{ start: '11:00', end: '11:20', label: 'Café' }] };
    const ev = await call('createEvent', { data: {
      name: 'Rueda de Negocios Mercado Nacional 2027', market: 'Nacional', regionId: 'valparaiso', phase: 'inscripcion',
      description: 'Encuentro online entre prestadores turísticos de la Región de Valparaíso y agencias y tour operadores de todo Chile.',
      regStart: dayPlus(-20), regEnd: dayPlus(-2), meetingDates: dayPlus(7) + ' y ' + dayPlus(8), schedule,
      format: 'online', minMeetings: 10, videoProvider: 'vdo' } }, S);
    await call('createEvent', { data: {
      name: 'Rueda de Negocios Mercado Brasil 2027', market: 'Brasil', regionId: 'valparaiso', phase: 'inscripcion',
      description: 'Prestadores de la Región de Valparaíso con operadores y agencias de Brasil.', regStart: dayPlus(0), regEnd: dayPlus(30), meetingDates: '', format: 'online', minMeetings: 10 } }, S);
    const people = [
      ['vendedor@demo.cl', 'vendedor', { companyName: 'Hotel Cerro Alegre', serviceTypes: ['alojamiento'], regions: ['valparaiso', 'metropolitana'], destination: 'Valparaíso', products: 'Hotel boutique de 18 habitaciones con vista a la bahía. Paquetes de fin de semana con tour patrimonial.', sernaturRegistry: '12345', description: 'Hotel boutique en el barrio patrimonial.', website: 'https://example.com', shareContact: true }, 'Carolina Pérez', '+56 9 1111 1111'],
      ['vinos@demo.cl', 'vendedor', { companyName: 'Ruta del Vino Casablanca', serviceTypes: ['enoturismo', 'gastronomia'], regions: ['valparaiso'], destination: 'Valle de Casablanca', products: 'Tours de día completo a 3 viñas con almuerzo maridaje.', sernaturRegistry: '23456', shareContact: false }, 'Matías Rojas', '+56 9 2222 2222'],
      ['aventura@demo.cl', 'vendedor', { companyName: 'Aventura Cerro a Mar', serviceTypes: ['aventura', 'receptivo'], regions: ['valparaiso'], destination: 'La Campana / Olmué', products: 'Trekking guiado, cabalgatas y kayak en la costa.', sernaturRegistry: '34567', shareContact: true }, 'Javiera Soto', '+56 9 3333 3333'],
      ['comprador@demo.cl', 'comprador', { companyName: 'Viajes del Sur Ltda.', targetMarket: 'Clientes de Santiago y Concepción, segmento familias', description: 'Agencia con 15 años vendiendo destinos nacionales.', shareContact: true }, 'Andrés Muñoz', '+56 9 4444 4444'],
      ['norte@demo.cl', 'comprador', { companyName: 'Norte Grande Tour Operador', targetMarket: 'Antofagasta y Calama, turismo corporativo', shareContact: false }, 'Fernanda Díaz', '+56 9 5555 5555'],
      ['pendiente@demo.cl', 'vendedor', { companyName: 'Cabañas Zapallar', serviceTypes: ['alojamiento'], regions: ['valparaiso'], destination: 'Zapallar', products: '6 cabañas frente al mar.', sernaturRegistry: '45678', shareContact: true }, 'Pedro León', '+56 9 6666 6666']
    ];
    const tok = {};
    for (const [email, type, profile, contactName, phone] of people) {
      const r = await call('signUp', { email, password: 'demo1234' }); tok[email] = r;
      await call('createRegistration', { eventId: ev, type, profile: Object.assign({ consentData: true, lang: 'es', tz: 'America/Santiago' }, profile), contact: { contactName, phone, companions: email === 'vendedor@demo.cl' ? [{ name: 'Rodrigo Silva', email: 'rsilva@demo.cl' }] : [] } }, r.token);
      if (email !== 'pendiente@demo.cl') await call('setRegistrationStatus', { eventId: ev, uid: r.user.uid, status: 'aprobada' }, S);
    }
    await call('updateEvent', { id: ev, patch: { phase: 'agenda' } }, S);
    // reuniones de ejemplo
    const d1 = schedule.days[0];
    const m1 = await call('requestMeeting', { eventId: ev, uid: tok['vendedor@demo.cl'].user.uid, slot: d1 + ' 09:00', note: 'Nos interesan paquetes de fin de semana para familias.' }, tok['comprador@demo.cl'].token);
    await call('respondMeeting', { eventId: ev, id: m1, accept: true }, tok['vendedor@demo.cl'].token);
    await call('requestMeeting', { eventId: ev, uid: tok['vendedor@demo.cl'].user.uid, slot: d1 + ' 10:20', note: 'Buscamos alojamiento para grupos corporativos.' }, tok['norte@demo.cl'].token);
    await call('requestMeeting', { eventId: ev, uid: tok['comprador@demo.cl'].user.uid, slot: d1 + ' 09:40' }, tok['vinos@demo.cl'].token);
    // salas Meet (ficticias en demo) y una reunión ya evaluada
    await call('createRooms', { eventId: ev }, S);
    await call('saveSurvey', { eventId: ev, id: m1, held: 'si', interest: 4, outcome: 'seguimiento', amount: 12000, comment: 'Enviaremos tarifas para grupos familiares.' }, tok['vendedor@demo.cl'].token);
    // evento presencial con mesas y acreditación
    const ev3 = await call('createEvent', { data: {
      name: 'Workshop Presencial Viña del Mar 2027', market: 'Nacional', regionId: 'valparaiso', phase: 'inscripcion', format: 'presencial', minMeetings: 8,
      venue: 'Centro de eventos, Viña del Mar', description: 'Rueda presencial: cada vendedor en su mesa numerada; los compradores rotan según su agenda.',
      regStart: dayPlus(-10), regEnd: dayPlus(-1), meetingDates: dayPlus(10), schedule: { days: [dayPlus(10)], start: '09:00', end: '13:00', slot: 20, gap: 0, breaks: [{ start: '11:00', end: '11:20', label: 'Café' }] } } }, S);
    for (const [email, type, profile, contactName, phone] of people.slice(0, 5)) {
      await call('createRegistration', { eventId: ev3, type, profile: Object.assign({ consentData: true, lang: 'es', tz: 'America/Santiago' }, profile), contact: { contactName, phone } }, tok[email].token);
      await call('setRegistrationStatus', { eventId: ev3, uid: tok[email].user.uid, status: 'aprobada' }, S);
    }
    await call('updateEvent', { id: ev3, patch: { phase: 'agenda' } }, S);
    await call('autoTables', { eventId: ev3 }, S);
    await call('signUp', { email: 'acreditador@demo.cl', password: 'demo1234' }).then(r => call('signOut', {}, r.token));
    await call('setStaff', { eventId: ev3, email: 'acreditador@demo.cl', name: 'Recepción (demo)' }, S);
    await call('adminAssignMeeting', { eventId: ev3, sellerUid: tok['vendedor@demo.cl'].user.uid, buyerUid: tok['comprador@demo.cl'].user.uid, slot: dayPlus(10) + ' 09:00' }, S);
    // Nivel Central
    await call('signUp', { email: 'central@demo.cl', password: 'demo1234' }).then(r => call('signOut', {}, r.token));
    await call('setAdmin', { email: 'central@demo.cl', name: 'Admin Nivel Central (demo)', regionId: 'central' }, S);
    for (const k of Object.keys(tok)) await call('signOut', {}, tok[k].token);
    await call('signOut', {}, S); await call('signOut', {}, valpo.token);
    outbox.length = 0;
  }

  async function create(cfg) {
    let fresh = false;
    const env = window.RN_GasSim.createEnv({
      load: () => { try { const s = JSON.parse(localStorage.getItem(KEY)); if (!s) fresh = true; return s; } catch (e) { fresh = true; return null; } },
      save: s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { } },
      onMail: o => { outbox.push(o); if (mailListener) mailListener(o); }
    });
    ['SpreadsheetApp', 'PropertiesService', 'Utilities', 'LockService', 'ContentService', 'MailApp', 'Calendar'].forEach(k => { window[k] = env[k]; });
    window.RN_DEMO_MODE = true;
    window.RN_DEMO_SUPERADMINS = ['admin@demo.cl'].concat(cfg.superadminEmails || []);
    await loadScript('apps-script/Code.gs');
    const transport = async req => JSON.parse(JSON.stringify(window.handle(req)));
    const call = (action, args, token) => transport({ action, args, token }).then(j => { if (!j.ok) { const e = new Error(j.message); e.code = j.code; throw e; } return j.data; });
    if (fresh || !env.state.sheets.Users) {
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) { }
      await seed(call);
    }
    const db = window.RN_createSheetsDB(cfg, { transport, tokenKey: TOKEN_KEY });
    db.mode = 'demo';
    db.resetDemo = () => { try { localStorage.removeItem(KEY); localStorage.removeItem(TOKEN_KEY); } catch (e) { } };
    db.onMail = cb => { mailListener = cb; };
    return db;
  }
  window.RN_createDemoDB = create;
})();
