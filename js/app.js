// Plataforma de Ruedas de Negocios Turísticos — versión 5
// Eventos presenciales y online, inscripción, aprobación, catálogo con disponibilidad, agenda,
// asignación por el administrador, acreditación con QR, salas de video integradas y resultados.
(function () {
  'use strict';
  const CFG = window.RN_CONFIG;
  const I = window.RN_I18N;

  const REGIONES = {
    arica: 'Arica y Parinacota', tarapaca: 'Tarapacá', antofagasta: 'Antofagasta', atacama: 'Atacama',
    coquimbo: 'Coquimbo', valparaiso: 'Valparaíso', metropolitana: 'Metropolitana', ohiggins: "O'Higgins",
    maule: 'Maule', nuble: 'Ñuble', biobio: 'Biobío', araucania: 'La Araucanía', losrios: 'Los Ríos',
    loslagos: 'Los Lagos', aysen: 'Aysén', magallanes: 'Magallanes', central: 'Nivel Central'
  };
  const SELLER_REGIONS = Object.keys(REGIONES).filter(k => k !== 'central');
  const ORG_OPTIONS = ['central'].concat(SELLER_REGIONS);
  const PHASES = ['borrador', 'inscripcion', 'agenda', 'reuniones', 'cerrado'];
  const PHASE_ADMIN = {
    borrador: 'Borrador (no visible al público)', inscripcion: 'Inscripciones abiertas',
    agenda: 'Agenda abierta (solicitud de reuniones)', reuniones: 'Día de reuniones (agenda cerrada)', cerrado: 'Cerrado'
  };
  const MARKETS = ['Nacional', 'Brasil', 'Argentina', 'Europa', 'Estados Unidos', 'Asia', 'Otro'];
  const STATUS_ADMIN = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' };
  const TYPES = ['vendedor', 'comprador'];
  const ICON = {
    vendedor: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h16l-1 11H5L4 9z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>',
    comprador: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg>',
    check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };

  let DB = null;
  const S = { user: null, admin: null, isSuper: false, staffEvents: [], ready: false, busy: false, lang: 'es', flash: null, next: null, toast: null, adminTab: {} };
  let cleanup = null; // se ejecuta al salir de una vista (ej. salir de la sala)

  // ---------- utilidades ----------
  function store(k, v) {
    try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; }
    return null;
  }
  function detectLang() {
    const s = store('rn_lang'); if (I.langs.includes(s)) return s;
    const n = (navigator.language || 'es').slice(0, 2).toLowerCase(); return I.langs.includes(n) ? n : 'es';
  }
  const li = () => Math.max(0, I.langs.indexOf(S.lang));
  function t(k) { const v = I.T[k]; return v ? (v[li()] || v[0]) : k; }
  function svc(k) { const v = I.services[k]; return v ? (v[li()] || v[0]) : k; }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const enc = encodeURIComponent;
  function go(hash) { if (location.hash === hash) render(); else location.hash = hash; }
  function fmtDate(d) { if (!d) return '—'; const p = String(d).slice(0, 10).split('-'); return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : d; }
  function isAdminOf(regionId) { return S.isSuper || !!(S.admin && S.admin.regionId === regionId); }
  function isAnyAdmin() { return S.isSuper || !!S.admin; }
  function errMsg(e) {
    const c = (e && e.code) || '';
    if (c.includes('email-already-in-use')) return t('err_email_used');
    if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return t('err_credentials');
    if (c.includes('weak-password')) return t('err_weak');
    if (c.includes('invalid-email')) return t('err_email');
    if (c.includes('invalid-code')) return t('err_code');
    if (c === 'network') return t('err_network');
    if (c.includes('permission-denied') || c === 'unauthenticated') return t('no_access');
    if (c === 'invalid') return t('required');
    const map = { 'slot-taken': 'err_slot_taken', 'slot-invalid': 'err_slot_taken', 'pair-exists': 'err_pair', 'too-many': 'err_too_many', 'me-busy': 'err_me_busy', 'too-late': 'too_late', closed: 'agenda_closed', 'not-pending': 'err_not_pending', 'not-yet': 'err_not_yet', 'no-room': 'no_room', 'not-accredited': 'err_not_accredited' };
    if (map[c]) return t(map[c]);
    console.error(e); return t('err_generic');
  }
  // En administración mostramos el mensaje del servidor (siempre en español)
  function adminErr(e) { return (e && e.message && e.message !== e.code) ? e.message : errMsg(e); }

  // ---------- horarios ----------
  const USER_TZ = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'America/Santiago';
  const LOCALES = { es: 'es-CL', en: 'en-US', pt: 'pt-BR' };
  const loc = () => LOCALES[S.lang] || 'es-CL';
  function fmtTime(iso, tz) { return new Intl.DateTimeFormat(loc(), { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: tz || USER_TZ }).format(new Date(iso)); }
  function fmtDay(iso, tz) { const s = new Intl.DateTimeFormat(loc(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz || USER_TZ }).format(new Date(iso)); return s.charAt(0).toUpperCase() + s.slice(1); }
  function slotText(slot, evTz) {
    if (!slot) return '';
    const local = `${fmtDay(slot.start)} · ${fmtTime(slot.start)}–${fmtTime(slot.end)}`;
    const ch = fmtTime(slot.start, evTz);
    return ch !== fmtTime(slot.start) || USER_TZ !== evTz ? `${local} (${ch} ${t('chile_time')})` : local;
  }
  function groupByDay(slots) {
    const g = []; const idx = {};
    slots.forEach(s => { const k = fmtDay(s.start); if (!(k in idx)) { idx[k] = g.length; g.push({ day: k, slots: [] }); } g[idx[k]].slots.push(s); });
    return g;
  }
  const meetingBadge = st => `<span class="badge mt-${esc(st)}">${esc(t('m_' + st))}</span>`;

  // ---------- logos ----------
  function logoHtml(r, cls) {
    const logo = r && r.logo && /^data:image\/(webp|png|jpeg);base64,/.test(r.logo) ? r.logo : '';
    return logo ? `<img class="avatar logo-img ${cls || ''}" src="${esc(logo)}" alt="">` : `<div class="avatar ${cls || ''}">${initials(r && r.companyName)}</div>`;
  }
  function resizeLogo(file) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => {
        const encode = (max, opaque) => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          const g = c.getContext('2d');
          if (opaque) { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); }
          g.drawImage(img, 0, 0, c.width, c.height);
          if (opaque) return c.toDataURL('image/jpeg', 0.82);
          const w = c.toDataURL('image/webp', 0.85);
          return w.indexOf('data:image/webp') === 0 ? w : c.toDataURL('image/png');
        };
        let out = encode(200, false);
        if (out.length > 46000) out = encode(160, true);
        if (out.length > 46000) out = encode(110, true);
        URL.revokeObjectURL(url);
        out.length > 46000 ? rej(new Error('big')) : res(out);
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); };
      img.src = url;
    });
  }
  function showError(form, msg) { const box = $('.form-msg', form); if (box) { box.className = 'form-msg error'; box.textContent = msg; box.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }
  function showOk(form, msg) { const box = $('.form-msg', form); if (box) { box.className = 'form-msg ok'; box.textContent = msg; } }
  function phaseLabel(p) { return t('phase_' + p); }
  function statusBadge(s, admin) { return `<span class="badge st-${esc(s)}">${esc(admin ? STATUS_ADMIN[s] : t('st_' + s))}</span>`; }
  function needLogin() { S.next = location.hash; return { html: '', bind() { go('#/ingresar'); } }; }
  function denied() { return { html: `<div class="container page"><div class="card narrow"><p class="error">${t('no_access')}</p></div></div>` }; }
  function notFound() { return { html: `<div class="container page"><div class="card narrow"><p>${t('not_found')}</p><a href="#/">${t('back')}</a></div></div>` }; }
  function val(form, name) { const el = form.elements[name]; return el ? String(el.value || '').trim() : ''; }
  function page(inner) { return `<div class="container page">${inner}</div>`; }
  function pageHead(kicker, title, sub) {
    return `<header class="page-head">${kicker ? `<p class="kicker">${kicker}</p>` : ''}<h1>${esc(title)}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</header>`;
  }

  // ---------- fotos y logos por región ----------
  function regionCfg(id) { return (CFG.regions || {})[id] || null; }
  function regionName(id) { if (id === 'central') return 'SERNATUR Nivel Central'; const r = regionCfg(id); return r && r.name ? r.name : (REGIONES[id] ? 'Región de ' + REGIONES[id] : ''); }
  function photosFor(ev) {
    const list = [];
    if (ev && ev.coverPhoto) list.push(ev.coverPhoto);
    const r = regionCfg(ev ? ev.regionId : CFG.homeRegion) || regionCfg(CFG.homeRegion);
    if (r && r.photos) r.photos.forEach(p => { if (!list.includes(p)) list.push(p); });
    return list;
  }
  function logoFor(regionId) { const r = regionCfg(regionId) || regionCfg(CFG.homeRegion); return r && r.logo ? r.logo : ''; }
  const photoOk = {};
  function probe(src) {
    if (src in photoOk) return Promise.resolve(photoOk[src]);
    return new Promise(res => { const i = new Image(); i.onload = () => { photoOk[src] = true; res(true); }; i.onerror = () => { photoOk[src] = false; res(false); }; i.src = src; });
  }
  let heroTimers = [];
  let agendaTimer = null;
  function bindPhotos(root) {
    heroTimers.forEach(clearInterval); heroTimers = []; if (agendaTimer) { clearInterval(agendaTimer); agendaTimer = null; }
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    $$('.hero-media', root).forEach(async m => {
      const list = JSON.parse(m.getAttribute('data-photos') || '[]'); const ok = [];
      for (const p of list) { if (await probe(p)) ok.push(p); }
      if (!ok.length) return;
      m.classList.add('has-photos');
      ok.forEach((p, i) => { const d = document.createElement('div'); d.className = 'slide' + (i === 0 ? ' on' : ''); d.style.backgroundImage = `url("${encodeURI(p)}")`; m.appendChild(d); });
      if (ok.length > 1 && !still) {
        let k = 0;
        heroTimers.push(setInterval(() => { const s = $$('.slide', m); if (!s.length) return; s[k].classList.remove('on'); k = (k + 1) % s.length; s[k].classList.add('on'); }, 6500));
      }
    });
    $$('[data-photo]', root).forEach(async el => {
      const list = JSON.parse(el.getAttribute('data-photo') || '[]');
      for (const p of list) { if (await probe(p)) { el.style.backgroundImage = `url("${encodeURI(p)}")`; el.classList.add('has-photo'); break; } }
    });
  }
  function hero(o) {
    const photos = o.photos || [];
    return `<section class="hero hero-${o.size || 'lg'}">
      <div class="hero-media" data-photos="${esc(JSON.stringify(photos))}"><div class="hero-ph"><span>Espacio para fotografía${photos[0] ? ' · ' + esc(photos[0]) : ''}</span></div></div>
      <div class="hero-shade"></div>
      <div class="container hero-inner">
        ${o.logo ? `<img class="hero-logo" src="${esc(o.logo)}" alt="${esc(o.logoAlt || '')}">` : ''}
        ${o.kicker ? `<p class="kicker kicker-light">${o.kicker}</p>` : ''}
        <h1>${esc(o.title)}</h1>
        ${o.lead ? `<p class="lead">${esc(o.lead)}</p>` : ''}
        ${o.extra || ''}
        ${o.actions ? `<div class="hero-actions">${o.actions}</div>` : ''}
      </div></section>`;
  }

  // ---------- encabezado y pie ----------
  function renderHeader() {
    const h = $('#header');
    const links = [`<a href="#/">${t('nav_events')}</a>`];
    if (S.user) {
      links.push(`<a href="#/mi">${t('nav_mine')}</a>`);
      if (isAnyAdmin()) links.push(`<a href="#/admin">${t('nav_admin')}</a>`);
      if ((S.staffEvents || []).length) links.push(`<a href="#/acreditacion/${enc(S.staffEvents[0])}">Acreditación</a>`);
      links.push(`<button class="link nav-btn" id="btn-logout">${t('nav_logout')}</button>`);
    } else links.push(`<a class="btn btn-small btn-primary" href="#/ingresar">${t('nav_login')}</a>`);
    const langSel = `<select id="lang-sel" class="lang" aria-label="Idioma / Language">${I.langs.map(l => `<option value="${l}"${l === S.lang ? ' selected' : ''}>${l.toUpperCase()}</option>`).join('')}</select>`;
    h.innerHTML = `
      ${DB && DB.mode === 'demo' ? `<div class="demo-bar">Modo demo: los datos se guardan solo en este navegador. <button class="link" id="btn-reset-demo">Reiniciar datos de prueba</button></div>` : ''}
      <div class="site-header"><div class="container hdr">
        <a class="brand" href="#/"><img class="brand-logo" src="img/logo-marca-chile.png" alt="Marca Chile"><span class="brand-text"><strong>${esc(CFG.appName)}</strong><small>${esc(CFG.appTagline || '')}</small></span></a>
        <button class="menu-btn" id="menu-btn" aria-label="Menú" aria-expanded="false"><span></span><span></span><span></span></button>
        <nav id="main-nav">${links.join('')}${langSel}</nav>
      </div></div>
      ${S.user ? `<div class="userline"><div class="container">${esc(S.user.email)}${S.isSuper ? ' · superadministrador' : (S.admin ? ' · administrador ' + esc(S.admin.regionId === 'central' ? 'Nivel Central' : REGIONES[S.admin.regionId] || '') : '') + ((S.staffEvents || []).length ? ' · acreditación' : '')}</div></div>` : ''}`;
    $('#lang-sel').onchange = e => { S.lang = e.target.value; store('rn_lang', S.lang); document.documentElement.lang = S.lang; render(); };
    const mb = $('#menu-btn'); mb.onclick = () => { const open = $('#main-nav').classList.toggle('open'); mb.setAttribute('aria-expanded', open); };
    $$('#main-nav a').forEach(a => a.addEventListener('click', () => $('#main-nav').classList.remove('open')));
    const lo = $('#btn-logout');
    if (lo) lo.onclick = async () => { S.next = null; S.busy = true; try { await DB.signOut(); } finally { S.busy = false; } await refreshAuth(null); go('#/'); };
    const rd = $('#btn-reset-demo'); if (rd) rd.onclick = () => { DB.resetDemo(); location.hash = '#/'; location.reload(); };
  }
  function renderFooter() {
    const logo = logoFor(CFG.homeRegion);
    $('#footer').innerHTML = `<div class="container ftr">
      <div class="ftr-logos">${logo ? `<img src="${esc(logo)}" alt="${esc(regionName(CFG.homeRegion))}" class="ftr-region">` : ''}<img src="img/logo-marca-chile.png" alt="Marca Chile" class="ftr-chile"></div>
      <div class="ftr-text"><strong>${esc(CFG.appName)}</strong><br>${t('organized_by')}: ${esc(CFG.organizer || '')}</div></div>`;
  }

  // ---------- router ----------
  const routes = [
    [/^#?\/?$/, viewHome],
    [/^#\/evento\/([^/]+)$/, viewEvent],
    [/^#\/evento\/([^/]+)\/(vendedores|compradores)$/, viewRoleLanding],
    [/^#\/evento\/([^/]+)\/inscripcion\/(vendedor|comprador)$/, viewRegister],
    [/^#\/evento\/([^/]+)\/inscripcion$/, id => ({ html: '', bind() { go('#/evento/' + enc(id)); } })],
    [/^#\/evento\/([^/]+)\/perfil$/, viewProfile],
    [/^#\/evento\/([^/]+)\/catalogo$/, viewCatalog],
    [/^#\/evento\/([^/]+)\/agenda$/, viewAgenda],
    [/^#\/evento\/([^/]+)\/empresa\/([^/]+)$/, viewCompany],
    [/^#\/evento\/([^/]+)\/sala\/([^/]+)$/, viewRoom],
    [/^#\/acreditacion\/([^/]+)$/, viewAccreditation],
    [/^#\/ingresar$/, viewLogin],
    [/^#\/mi$/, viewMine],
    [/^#\/admin$/, viewAdmin],
    [/^#\/admin\/evento\/([^/]+)$/, viewAdminEvent]
  ];
  let seq = 0;
  async function render() {
    if (!S.ready) return;
    const my = ++seq;
    if (cleanup) { try { cleanup(); } catch (e) { } cleanup = null; }
    renderHeader(); renderFooter();
    const main = $('#main');
    main.innerHTML = `<div class="container page"><p class="muted">${t('loading')}</p></div>`;
    const hash = location.hash || '#/';
    let view = viewHome, args = [];
    for (const [re, fn] of routes) { const m = hash.match(re); if (m) { view = fn; args = m.slice(1).map(decodeURIComponent); break; } }
    try {
      const out = await view.apply(null, args);
      if (my !== seq) return;
      const flash = S.flash ? `<div class="container"><div class="flash ${S.flash.type}">${esc(S.flash.msg)}</div></div>` : '';
      S.flash = null;
      main.innerHTML = flash + (out.html || '');
      window.scrollTo(0, 0);
      bindPhotos(main);
      if (out.bind) out.bind(main);
      if (S.toast) { showToast(S.toast); S.toast = null; }
    } catch (e) {
      if (my !== seq) return;
      main.innerHTML = page(`<div class="card narrow"><p class="error">${esc(errMsg(e))}</p><p><a href="#/">${t('back')}</a></p></div>`);
    }
  }

  // ---------- vistas públicas ----------
  function eventCard(ev) {
    return `<a class="ev-card" href="#/evento/${enc(ev.id)}">
      <div class="ev-photo" data-photo="${esc(JSON.stringify(photosFor(ev)))}"><span class="badge ph-${esc(ev.phase)}">${esc(phaseLabel(ev.phase))}</span></div>
      <div class="ev-body">
        <p class="kicker">${t('market')} ${esc(ev.market)} · ${esc(REGIONES[ev.regionId] || '')}</p>
        <h3>${esc(ev.name)}</h3>
        <p class="small muted">${t('reg_period')}: ${fmtDate(ev.regStart)} → ${fmtDate(ev.regEnd)}<br>${t('meeting_dates')}: ${esc(ev.meetingDates || '—')}</p>
        <span class="more">${t('view_event')} →</span>
      </div></a>`;
  }
  function steps() {
    return `<section class="steps">${[1, 2, 3].map(n => `<div class="step"><span class="step-n">${n}</span><div><h3>${t('step' + n + '_t')}</h3><p class="muted">${t('step' + n + '_d')}</p></div></div>`).join('')}</section>`;
  }

  async function viewHome() {
    const evs = (await DB.listPublicEvents()).sort((a, b) => {
      const o = p => p === 'inscripcion' ? 0 : p === 'cerrado' ? 2 : 1;
      return o(a.phase) - o(b.phase) || String(b.regStart || '').localeCompare(String(a.regStart || ''));
    });
    const open = evs.find(e => e.phase === 'inscripcion');
    const actions = open
      ? `<a class="btn btn-primary btn-lg" href="#/evento/${enc(open.id)}/vendedores">${t('i_am_seller')}</a><a class="btn btn-light btn-lg" href="#/evento/${enc(open.id)}/compradores">${t('i_am_buyer')}</a>`
      : `<a class="btn btn-primary btn-lg" href="#eventos" id="to-events">${t('see_all_events')}</a>`;
    return {
      html: hero({
        size: 'lg', photos: photosFor(null), logo: logoFor(CFG.homeRegion), logoAlt: regionName(CFG.homeRegion),
        kicker: t('home_kicker'), title: t('home_title'), lead: t('home_lead'), actions,
        extra: open ? `<p class="hero-event">${esc(open.name)} · ${t('reg_period')}: ${fmtDate(open.regStart)} → ${fmtDate(open.regEnd)}</p>` : ''
      }) + `<div class="container page">
        <h2 class="section-title">${t('how_title')}</h2>${steps()}
        <h2 class="section-title" id="eventos">${t('events_title')}</h2>
        <div class="grid">${evs.length ? evs.map(eventCard).join('') : `<p class="muted">${t('no_events')}</p>`}</div>
      </div>`,
      bind(root) { const te = $('#to-events', root); if (te) te.onclick = e => { e.preventDefault(); $('#eventos').scrollIntoView({ behavior: 'smooth' }); }; }
    };
  }

  async function myRegFor(eventId) {
    if (!S.user) return null;
    try { return await DB.getRegistration(eventId, S.user.uid); } catch (e) { return null; }
  }
  function eventFacts(ev) {
    return `<div class="chips"><span class="chip">${t('market')}: <strong>${esc(ev.market)}</strong></span>
      <span class="chip">${t('reg_period')}: <strong>${fmtDate(ev.regStart)} → ${fmtDate(ev.regEnd)}</strong></span>
      <span class="chip">${t('meeting_dates')}: <strong>${esc(ev.meetingDates || '—')}</strong></span></div>`;
  }
  function myStatusBox(mine, ev) {
    const agenda = ev && mine.status === 'aprobada' && ['agenda', 'reuniones', 'cerrado'].includes(ev.phase);
    return `<div class="card status-box"><div><p class="kicker">${t('my_status')}</p><p><strong>${esc(mine.companyName)}</strong> · ${t('role_' + mine.type)} ${statusBadge(mine.status)}</p></div>
      ${agenda ? `<a class="btn btn-primary" href="#/evento/${enc(ev.id)}/agenda">${t('agenda')}</a>` : `<a class="btn" href="#/mi">${t('go_account')}</a>`}</div>`;
  }

  async function viewEvent(id) {
    const ev = await DB.getEvent(id);
    if (!ev) return notFound();
    const mine = await myRegFor(id);
    const roleCard = type => `<div class="role-card">
        <div class="role-icon">${ICON[type]}</div>
        <p class="kicker">${t('for_' + type)}</p>
        <h3>${t('i_am_' + (type === 'vendedor' ? 'seller' : 'buyer'))}</h3>
        <p class="muted">${t(type === 'vendedor' ? 'seller_pitch' : 'buyer_pitch')}</p>
        <a class="btn ${type === 'vendedor' ? 'btn-primary' : ''}" href="#/evento/${enc(id)}/${type}es">${ev.phase === 'inscripcion' ? t('reg_as_' + type) : t('view_event')} →</a>
      </div>`;
    return {
      html: hero({ size: 'md', photos: photosFor(ev), kicker: `<span class="badge ph-${esc(ev.phase)}">${esc(phaseLabel(ev.phase))}</span> ${esc(regionName(ev.regionId))}`, title: ev.name, extra: eventFacts(ev) })
        + `<div class="container page">
          ${mine ? myStatusBox(mine, ev) : ''}
          ${ev.description ? `<p class="intro pre">${esc(ev.description)}</p>` : ''}
          ${ev.phase !== 'inscripcion' && !mine ? `<p class="notice">${t('reg_closed')}</p>` : ''}
          <div class="roles">${roleCard('vendedor')}${roleCard('comprador')}</div>
          ${isAdminOf(ev.regionId) ? `<p class="small"><a href="#/admin/evento/${enc(id)}">Gestionar este evento →</a></p>` : ''}
        </div>`
    };
  }

  async function viewRoleLanding(id, plural) {
    const type = plural === 'vendedores' ? 'vendedor' : 'comprador';
    const ev = await DB.getEvent(id);
    if (!ev) return notFound();
    const mine = await myRegFor(id);
    const benefits = t('benefits_' + type).split('|');
    let cta;
    if (mine) cta = myStatusBox(mine, ev);
    else if (ev.phase === 'inscripcion') cta = `<a class="btn btn-primary btn-lg" href="#/evento/${enc(id)}/inscripcion/${type}">${t('reg_as_' + type)}</a>
        ${S.user ? '' : `<p class="small muted">${t('have_account')} <a href="#/ingresar" id="lnk-login">${t('nav_login')}</a></p>`}`;
    else cta = `<p class="notice">${t('reg_closed')}</p>`;
    return {
      html: hero({ size: 'md', photos: photosFor(ev), kicker: `${t('for_' + type)} · ${esc(regionName(ev.regionId))}`, title: ev.name, lead: t(type === 'vendedor' ? 'seller_pitch' : 'buyer_pitch'), extra: eventFacts(ev) })
        + `<div class="container page"><div class="landing">
          <div class="card">
            <ul class="benefits">${benefits.map(b => `<li>${ICON.check}<span>${esc(b)}</span></li>`).join('')}</ul>
            <p class="needs">${t('needs_' + type)}</p>
            <div class="cta">${cta}</div>
          </div>
          <div><h2 class="section-title">${t('how_title')}</h2>${steps()}</div>
        </div></div>`,
      bind(root) { const ll = $('#lnk-login', root); if (ll) ll.onclick = () => { S.next = `#/evento/${enc(id)}/inscripcion/${type}`; }; }
    };
  }

  // Formulario de perfil (inscripción y edición). El tipo viene dado por el link.
  function profileFields(type, reg, contact) {
    reg = reg || {}; contact = contact || {};
    const comps = contact.companions || [];
    const tz = reg.tz || (Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Santiago');
    const seller = type === 'vendedor';
    const services = Object.keys(I.services).map(k => `<label class="check"><input type="checkbox" name="serviceTypes" value="${k}"${(reg.serviceTypes || []).includes(k) ? ' checked' : ''}> ${esc(svc(k))}</label>`).join('');
    return `
      <fieldset><legend>${t('company_section')}</legend>
        <label>${t('company_name')} *<input name="companyName" maxlength="120" value="${esc(reg.companyName)}"></label>
        <div class="label">${t('logo')}</div>
        <div class="logo-field">
          <div class="logo-preview">${logoHtml(reg, 'avatar-lg')}</div>
          <div>
            <label class="btn btn-small">${t('logo_upload')}<input type="file" accept="image/png,image/jpeg,image/webp" class="logo-file" hidden></label>
            <button type="button" class="link logo-remove"${reg.logo ? '' : ' hidden'}>${t('logo_remove')}</button>
            <p class="small muted">${t('logo_hint')}</p>
          </div>
          <input type="hidden" name="logo" value="${esc(reg.logo)}">
        </div>
        ${seller ? `
          <div class="label">${t('service_types')} *</div><div class="checks">${services}</div>
          <div class="label">${t('regions_sold')} *</div>
          <div class="checks checks-regions">${SELLER_REGIONS.map(k => `<label class="check"><input type="checkbox" name="regions" value="${k}"${(reg.regions || []).includes(k) ? ' checked' : ''}> ${esc(REGIONES[k])}</label>`).join('')}</div>
          <label>${t('destination')} *<input name="destination" maxlength="120" placeholder="${esc(t('destination_ph'))}" value="${esc(reg.destination)}"></label>
          <label>${t('products')} *<textarea name="products" rows="4" maxlength="1500" placeholder="${esc(t('products_ph'))}">${esc(reg.products)}</textarea></label>
          <label>${t('sernatur_reg')} *<input name="sernaturRegistry" maxlength="40" value="${esc(reg.sernaturRegistry)}"></label>`
        : `<label>${t('target_market')} *<input name="targetMarket" maxlength="200" placeholder="${esc(t('target_market_ph'))}" value="${esc(reg.targetMarket)}"></label>`}
        <label>${t('description')}<textarea name="description" rows="3" maxlength="800">${esc(reg.description)}</textarea></label>
        <label>${t('website')}<input name="website" maxlength="200" placeholder="https://" value="${esc(reg.website)}"></label>
      </fieldset>
      <fieldset><legend>${t('contact_section')}</legend>
        <div class="two">
          <label>${t('contact_name')} *<input name="contactName" maxlength="120" value="${esc(contact.contactName)}"></label>
          <label>${t('phone')} *<input name="phone" maxlength="40" value="${esc(contact.phone)}"></label>
        </div>
        <div class="label">${t('companions')}</div>
        ${[0].map(i => `<div class="two"><input name="comp${i}name" placeholder="${esc(t('companion_name'))}" aria-label="${esc(t('companion_name'))}" maxlength="120" value="${esc((comps[i] || {}).name)}"><input name="comp${i}email" type="email" placeholder="${esc(t('email'))}" aria-label="${esc(t('email'))}" maxlength="120" value="${esc((comps[i] || {}).email)}"></div>`).join('')}
        <div class="two">
          <label>${t('lang_pref')}<select name="lang">${I.langs.map(l => `<option value="${l}"${(reg.lang || S.lang) === l ? ' selected' : ''}>${l.toUpperCase()}</option>`).join('')}</select></label>
          <label>${t('timezone')}<input name="tz" value="${esc(tz)}" readonly></label>
        </div>
      </fieldset>
      <fieldset><legend>${t('consent_section')}</legend>
        <label class="check"><input type="checkbox" name="consentData"${reg.consentData ? ' checked disabled' : ''}> <span>${t('consent_data')} *</span></label>
        <p class="small muted">${t('contact_private')}</p>
      </fieldset>`;
  }
  // Lee y valida el formulario. Devuelve {pub, contact} o {error}
  function readProfile(form, type, existing) {
    const pub = {
      companyName: val(form, 'companyName'), logo: val(form, 'logo'), description: val(form, 'description'), website: val(form, 'website'),
      shareContact: false, lang: val(form, 'lang') || S.lang, tz: val(form, 'tz'),
      serviceTypes: [], destination: '', products: '', sernaturRegistry: '', targetMarket: '', regions: []
    };
    if (type === 'vendedor') {
      pub.serviceTypes = $$('input[name=serviceTypes]:checked', form).map(x => x.value);
      pub.regions = $$('input[name=regions]:checked', form).map(x => x.value);
      pub.destination = val(form, 'destination'); pub.products = val(form, 'products'); pub.sernaturRegistry = val(form, 'sernaturRegistry');
    } else pub.targetMarket = val(form, 'targetMarket');
    const companions = [0].map(i => ({ name: val(form, `comp${i}name`), email: val(form, `comp${i}email`).toLowerCase() })).filter(c => c.name || c.email);
    const contact = { contactName: val(form, 'contactName'), phone: val(form, 'phone'), companions };
    if (!pub.companyName || !contact.contactName || !contact.phone) return { error: t('required') };
    if (type === 'vendedor') {
      if (!pub.serviceTypes.length) return { error: t('choose_service') };
      if (!pub.regions.length) return { error: t('choose_region') };
      if (!pub.destination || !pub.products || !pub.sernaturRegistry) return { error: t('required') };
    } else if (!pub.targetMarket) return { error: t('required') };
    if (!existing) {
      if (!form.elements.consentData.checked) return { error: t('consent_required') };
      pub.consentData = true;
    }
    return { pub, contact };
  }

  function bindLogo(form) {
    const file = $('.logo-file', form), hidden = form.elements.logo, prev = $('.logo-preview', form), rm = $('.logo-remove', form);
    const show = () => { prev.innerHTML = logoHtml({ logo: hidden.value, companyName: val(form, 'companyName') }, 'avatar-lg'); rm.hidden = !hidden.value; };
    file.onchange = async () => {
      const f = file.files && file.files[0]; if (!f) return;
      try { hidden.value = await resizeLogo(f); show(); } catch (e) { showError(form, t('logo_err')); }
      file.value = '';
    };
    rm.onclick = () => { hidden.value = ''; show(); };
    form.elements.companyName.addEventListener('input', () => { if (!hidden.value) show(); });
  }

  async function viewRegister(id, type) {
    const ev = await DB.getEvent(id);
    if (!ev) return notFound();
    const head = `<p class="small"><a href="#/evento/${enc(id)}/${type}es">← ${esc(ev.name)}</a></p>` + pageHead(`<span class="role-dot">${ICON[type]}</span> ${t('for_' + type)}`, t('reg_title_' + type), esc(ev.name));
    if (ev.phase !== 'inscripcion') return { html: page(head + `<div class="card narrow"><p>${t('reg_closed')}</p></div>`) };
    const mine = await myRegFor(id);
    if (mine) return { html: page(head + myStatusBox(mine, ev)) };
    const account = S.user ? `<p class="muted small">${t('email')}: <strong>${esc(S.user.email)}</strong></p>` : `
      <fieldset><legend>${t('account_section')}</legend>
        <p class="small">${t('have_account')} <a href="#/ingresar" id="lnk-login">${t('nav_login')}</a></p>
        <label>${t('email')} *<input name="email" type="email" autocomplete="email" maxlength="120"></label>
        <div class="two"><label>${t('password')} *<input name="pw" type="password" autocomplete="new-password"></label>
        <label>${t('password2')} *<input name="pw2" type="password" autocomplete="new-password"></label></div>
      </fieldset>`;
    return {
      html: page(head + `<div class="card form-card"><p class="needs">${t('needs_' + type)}</p>
        <form id="f-reg" novalidate>${account}${profileFields(type, null, null)}
        <div class="form-msg" role="alert"></div><button class="btn btn-primary btn-lg" type="submit">${t('submit_reg')}</button></form></div>`),
      bind(root) {
        const form = $('#f-reg', root); bindLogo(form);
        const ll = $('#lnk-login', root); if (ll) ll.onclick = () => { S.next = location.hash; };
        form.onsubmit = async e => {
          e.preventDefault();
          const data = readProfile(form, type, null); if (data.error) return showError(form, data.error);
          const btn = $('button[type=submit]', form);
          if (!S.user) {
            const email = val(form, 'email'); const pw = form.elements.pw.value;
            if (!email || !pw) return showError(form, t('required'));
            if (pw !== form.elements.pw2.value) return showError(form, t('pw_mismatch'));
          }
          btn.disabled = true; btn.textContent = t('sending'); S.busy = true;
          try {
            if (!S.user) { const u = await DB.signUp(val(form, 'email'), form.elements.pw.value); await refreshAuth(u); }
            await DB.createRegistration(id, type, data.pub, data.contact);
            S.flash = { type: 'ok', msg: t('reg_ok') }; S.busy = false; go('#/mi');
          } catch (err) {
            showError(form, errMsg(err));
          } finally { S.busy = false; btn.disabled = false; btn.textContent = t('submit_reg'); renderHeader(); }
        };
      }
    };
  }

  async function viewProfile(id) {
    if (!S.user) return needLogin();
    const [ev, reg] = await Promise.all([DB.getEvent(id), DB.getRegistration(id, S.user.uid)]);
    if (!ev || !reg) return notFound();
    const contact = await DB.getContact(id, S.user.uid);
    return {
      html: page(pageHead(`${t('role_' + reg.type)} · ${esc(ev.name)}`, t('edit_profile')) + `<div class="card form-card">
        <p>${statusBadge(reg.status)}</p>
        <form id="f-prof" novalidate>${profileFields(reg.type, reg, contact)}
        <div class="form-msg" role="alert"></div><div class="actions"><button class="btn btn-primary" type="submit">${t('save')}</button>
        <a class="btn btn-ghost" href="#/mi">${t('back')}</a></div></form></div>`),
      bind(root) {
        const form = $('#f-prof', root); bindLogo(form);
        form.onsubmit = async e => {
          e.preventDefault();
          const data = readProfile(form, reg.type, reg); if (data.error) return showError(form, data.error);
          const btn = $('button[type=submit]', form); btn.disabled = true;
          try { await DB.updateRegistration(id, data.pub, data.contact); showOk(form, t('saved')); }
          catch (err) { showError(form, errMsg(err)); }
          finally { btn.disabled = false; }
        };
      }
    };
  }

  async function viewLogin() {
    if (S.user) return { html: '', bind() { go(S.next || '#/mi'); } };
    const demo = DB.mode === 'demo' ? `<div class="demo-box"><strong>Cuentas de prueba</strong> (contraseña <code>demo1234</code>):
      <div class="demo-accounts">${[['admin@demo.cl', 'Superadministrador'], ['valpo@demo.cl', 'Admin regional Valparaíso'], ['vendedor@demo.cl', 'Vendedor aprobado'], ['comprador@demo.cl', 'Comprador aprobado'], ['pendiente@demo.cl', 'Vendedor pendiente'], ['central@demo.cl', 'Admin Nivel Central'], ['acreditador@demo.cl', 'Acreditador (recepción)']]
        .map(([e, l]) => `<button type="button" class="btn btn-small" data-demo="${e}">${l}</button>`).join('')}</div></div>` : '';
    return {
      html: `<div class="auth">
        <div class="auth-photo hero-media" data-photos="${esc(JSON.stringify(photosFor(null)))}"><div class="hero-ph"></div>
          <div class="auth-photo-text">${logoFor(CFG.homeRegion) ? `<img src="${esc(logoFor(CFG.homeRegion))}" alt="${esc(regionName(CFG.homeRegion))}">` : ''}</div></div>
        <div class="auth-panel">
          <div id="login-box">
            <h1>${t('login_title')}</h1>
            <form id="f-login" novalidate>
              <label>${t('email')}<input name="email" type="email" autocomplete="email"></label>
              <label>${t('password').replace(/\s*\(.*\)/, '')}<input name="pw" type="password" autocomplete="current-password"></label>
              <div class="form-msg" role="alert"></div>
              <button class="btn btn-primary btn-block" type="submit">${t('login_btn')}</button>
              <p class="small"><button class="link" type="button" id="btn-forgot">${t('forgot')}</button></p>
              <p class="small muted">${t('admin_signup')} <button class="link" type="button" id="btn-signup">${t('create_account')}</button></p>
            </form>
            <p class="small muted">${t('no_account')}</p>${demo}
          </div>
          <div id="reset-box" hidden>
            <h1>${t('reset_title')}</h1>
            <form id="f-reset" novalidate>
              <label>${t('email')}<input name="email" type="email" autocomplete="email"></label>
              <button class="btn" type="button" id="btn-send-code">${t('reset_send')}</button>
              ${DB.mode === 'demo' ? `<p class="small muted">${t('reset_demo')}</p>` : ''}
              <label>${t('reset_code')}<input name="code" inputmode="numeric" maxlength="6" autocomplete="one-time-code"></label>
              <label>${t('reset_new')}<input name="pw" type="password" autocomplete="new-password"></label>
              <div class="form-msg" role="alert"></div>
              <button class="btn btn-primary btn-block" type="submit">${t('reset_confirm')}</button>
              <p class="small"><button class="link" type="button" id="btn-back-login">← ${t('login_title')}</button></p>
            </form>
          </div>
        </div></div>`,
      bind(root) {
        const form = $('#f-login', root), rform = $('#f-reset', root);
        const after = () => { const next = S.next; S.next = null; S.busy = false; go(next || (isAnyAdmin() ? '#/admin' : '#/mi')); };
        const doAuth = async (fn, f) => {
          S.busy = true;
          try { const u = await fn(); await refreshAuth(u); after(); }
          catch (err) { S.busy = false; showError(f, errMsg(err)); }
        };
        form.onsubmit = e => { e.preventDefault(); doAuth(() => DB.signIn(val(form, 'email'), form.elements.pw.value), form); };
        $('#btn-signup', root).onclick = () => doAuth(() => DB.signUp(val(form, 'email'), form.elements.pw.value), form);
        $$('[data-demo]', root).forEach(b => b.onclick = () => doAuth(() => DB.signIn(b.getAttribute('data-demo'), 'demo1234'), form));
        $('#btn-forgot', root).onclick = () => { $('#login-box', root).hidden = true; $('#reset-box', root).hidden = false; rform.elements.email.value = val(form, 'email'); };
        $('#btn-back-login', root).onclick = () => { $('#login-box', root).hidden = false; $('#reset-box', root).hidden = true; };
        $('#btn-send-code', root).onclick = async () => {
          const email = val(rform, 'email'); if (!email) return showError(rform, t('err_email'));
          try { await DB.requestReset(email); showOk(rform, t('reset_sent')); } catch (err) { showError(rform, errMsg(err)); }
        };
        rform.onsubmit = e => { e.preventDefault(); doAuth(() => DB.confirmReset(val(rform, 'email'), val(rform, 'code'), rform.elements.pw.value), rform); };
      }
    };
  }

  // ---------- utilidades v5 ----------
  function fmtBadge(f) { f = f || 'online'; return `<span class="badge fmt-${esc(f)}">${esc(t('fmt_' + f))}</span>`; }
  function abs(path) { try { return new URL(path, location.href).href; } catch (e) { return path; } }
  function showToast(o) {
    let box = $('#toast');
    if (!box) { box = document.createElement('div'); box.id = 'toast'; box.className = 'toast'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    box.innerHTML = `<span class="toast-msg">${esc(o.msg)}</span>${o.undo ? `<button class="btn btn-small toast-undo">${t('undo')}</button>` : ''}<button class="link toast-x" aria-label="Cerrar">×</button>`;
    box.classList.add('on');
    clearTimeout(showToast.tm); showToast.tm = setTimeout(() => box.classList.remove('on'), o.undo ? 15000 : 5000);
    $('.toast-x', box).onclick = () => box.classList.remove('on');
    const u = $('.toast-undo', box);
    if (u) u.onclick = async () => {
      u.disabled = true;
      try { await o.undo(); box.classList.remove('on'); S.toast = { msg: t('undone') }; render(); }
      catch (e) { $('.toast-msg', box).textContent = adminErr(e); }
    };
  }
  const loadedScripts = {};
  function loadScriptOnce(src) {
    if (!loadedScripts[src]) loadedScripts[src] = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = res;
      s.onerror = () => { delete loadedScripts[src]; rej(new Error('cdn')); }; document.head.appendChild(s);
    });
    return loadedScripts[src];
  }
  const QR_LIB = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js';
  const JSQR_LIB = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
  function qrText(eventId, code) { return 'RN:' + eventId + ':' + code; }
  async function qrSvg(text) {
    try { await loadScriptOnce(QR_LIB); const q = window.qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag(4, 2); }
    catch (e) { return ''; }
  }
  function liveLabel(st) { return st ? t('ls_' + st) : ''; }
  function ctxBar(ev, mine, admin) {
    return `<div class="ctxbar"><div class="ctx-main"><span class="ctx-label">${admin ? 'Administrando' : t('you_are_in')}</span>
      <strong>${esc(ev.name)}</strong> ${fmtBadge(ev.format)} <span class="badge ph-${esc(ev.phase)}">${esc(phaseLabel(ev.phase))}</span>
      ${mine ? `<span class="ctx-role">${t('role_' + mine.type)} · ${esc(mine.companyName)} ${statusBadge(mine.status)}</span>` : ''}</div>
      <a class="small" href="${admin ? '#/admin' : '#/mi'}">${t('switch_event')} →</a></div>`;
  }
  function youtubeEmbed(url) {
    const m = String(url).match(/(?:youtube\.com\/(?:watch\?v=|live\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
    return m ? 'https://www.youtube.com/embed/' + m[1] + '?autoplay=1&mute=1' : url;
  }

  // ---------- impresión: agendas y credenciales ----------
  const PRINT_CSS = `
    @page { size: A4; margin: 14mm; }
    body { font-family: Montserrat, Arial, sans-serif; color: #1E2023; margin: 0; }
    .sheet { page-break-after: always; }
    .sheet:last-child { page-break-after: auto; }
    .ph { display: flex; align-items: center; gap: 14px; border-bottom: 3px solid #E4002B; padding-bottom: 10px; margin-bottom: 14px; }
    .ph img { width: 52px; height: 52px; }
    .ph h1 { font-size: 20px; margin: 0; }
    .ph p { margin: 2px 0; font-size: 12px; color: #53565A; }
    .tag { display: inline-block; background: #E4002B; color: #fff; font-weight: 700; font-size: 11px; padding: 2px 8px; border-radius: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
    th, td { border-bottom: 1px solid #D0D0CE; padding: 7px 6px; text-align: left; }
    th { font-size: 11px; text-transform: uppercase; color: #53565A; }
    tr.brk td { background: #F0F0EE; font-style: italic; color: #53565A; }
    tr.day td { background: #1E2023; color: #fff; font-weight: 700; }
    td.chk { width: 70px; }
    .free { color: #A7A8AA; }
    .foot { margin-top: 10px; font-size: 10px; color: #53565A; }
    .badges { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm; }
    .badge-card { border: 1px dashed #A7A8AA; height: 128mm; display: flex; flex-direction: column; break-inside: avoid; overflow: hidden; }
    .band { padding: 10px 12px; color: #fff; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; font-size: 15px; display: flex; justify-content: space-between; align-items: center; }
    .band img { width: 34px; height: 34px; }
    .band.vendedor { background: #E4002B; } .band.comprador { background: #1E2023; }
    .bc-body { flex: 1; padding: 12px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 4px; }
    .bc-name { font-size: 22px; font-weight: 800; margin-top: 6px; line-height: 1.15; }
    .bc-comp { font-size: 14px; font-weight: 600; color: #53565A; }
    .bc-person { font-size: 11px; color: #53565A; text-transform: uppercase; letter-spacing: .06em; }
    .bc-table { font-size: 18px; font-weight: 800; color: #E4002B; }
    .bc-qr { width: 34mm; margin-top: auto; } .bc-qr svg { width: 100%; height: auto; }
    .bc-code { font-family: monospace; font-size: 12px; letter-spacing: .1em; }
    .bc-ev { font-size: 10px; color: #53565A; border-top: 1px solid #D0D0CE; padding: 6px; text-align: center; }
    .hint { font-size: 12px; color: #53565A; margin-bottom: 8px; }
    @media screen { body { background: #eee; } .wrap { max-width: 210mm; margin: 0 auto; background: #fff; padding: 12mm; } .noprint { text-align: center; padding: 10px; } }
    @media print { .noprint { display: none; } }`;
  function printWindow(title, body) {
    const w = window.open('', '_blank');
    if (!w) { S.flash = { type: 'error', msg: 'El navegador bloqueó la ventana de impresión. Permite ventanas emergentes para este sitio.' }; render(); return; }
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>
      <div class="noprint"><button onclick="window.print()">Imprimir / Guardar como PDF</button></div><div class="wrap">${body}</div>
      <script>window.onload = function () { setTimeout(function () { window.print(); }, 500); };<\/script></body></html>`);
    w.document.close();
  }
  // data: { slots, breaks, format }; people: [{ companyName, type, table, contactName, companion, meetings:[{slot, otherName, otherTable}] }]
  function agendaSheets(ev, data, people) {
    const byDay = {};
    data.slots.forEach(s => { (byDay[s.day] = byDay[s.day] || []).push({ kind: 'slot', time: s.time, id: s.id, start: s.start }); });
    (data.breaks || []).forEach(b => { (byDay[b.day] = byDay[b.day] || []).push({ kind: 'break', time: b.time, end: b.endTime, label: b.label }); });
    const days = Object.keys(byDay).sort();
    days.forEach(d => byDay[d].sort((a, b) => a.time.localeCompare(b.time)));
    const presencial = (ev.format || 'online') === 'presencial';
    const logo = abs('img/logo-marca-chile.png');
    return people.map(p => {
      const mm = {}; (p.meetings || []).forEach(m => { mm[m.slot] = m; });
      const seller = p.type === 'vendedor';
      const rows = days.map(d => `<tr class="day"><td colspan="${presencial && !seller ? 4 : 3}">${esc(fmtDay(byDay[d].find(x => x.start) ? byDay[d].find(x => x.start).start : d + 'T12:00:00Z', ev.tz || 'America/Santiago'))}</td></tr>` +
        byDay[d].map(x => {
          if (x.kind === 'break') return `<tr class="brk"><td>${esc(x.time)}–${esc(x.end)}</td>${presencial && !seller ? '<td></td>' : ''}<td>${esc(x.label)}</td><td></td></tr>`;
          const m = mm[x.id];
          return `<tr><td>${esc(x.time)}</td>${presencial && !seller ? `<td>${m && m.otherTable ? 'Mesa ' + esc(m.otherTable) : ''}</td>` : ''}<td>${m ? '<strong>' + esc(m.otherName) + '</strong>' : '<span class="free">Libre</span>'}</td><td class="chk">${m ? '☐ Sí ☐ No' : ''}</td></tr>`;
        }).join('')).join('');
      return `<section class="sheet"><div class="ph"><img src="${logo}" alt=""><div>
          <h1>${esc(p.companyName)}</h1>
          <p><span class="tag">${seller ? 'VENDEDOR' : 'COMPRADOR'}</span>${seller && presencial && p.table ? ` &nbsp;<strong>Mesa ${esc(p.table)}</strong>` : ''} · ${esc(p.contactName || '')}${p.companion ? ' + ' + esc(p.companion) : ''}</p>
          <p>${esc(ev.name)}${ev.venue ? ' · ' + esc(ev.venue) : ''} · Horario de Chile</p></div></div>
        <table><thead><tr><th>Hora</th>${presencial && !seller ? '<th>Mesa</th>' : ''}<th>${seller ? 'Comprador' : 'Vendedor'}</th><th>Realizada</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="foot">${(p.meetings || []).length} reuniones confirmadas al ${esc(new Date().toLocaleString('es-CL'))}.</p></section>`;
    }).join('');
  }
  async function credentialSheets(ev, people) {
    const logo = abs('img/logo-marca-chile.png');
    const cards = [];
    for (const p of people) {
      const svg = await qrSvg(qrText(ev.id, p.code));
      cards.push(`<div class="badge-card"><div class="band ${esc(p.type)}"><span>${p.type === 'vendedor' ? 'Vendedor' : 'Comprador'}</span><img src="${logo}" alt=""></div>
        <div class="bc-body"><div class="bc-person">${p.person === 'titular' ? 'Titular' : 'Acompañante'}</div>
        <div class="bc-name">${esc(p.name)}</div><div class="bc-comp">${esc(p.companyName)}</div>
        ${p.type === 'vendedor' && p.table ? `<div class="bc-table">Mesa ${esc(p.table)}</div>` : ''}
        <div class="bc-qr">${svg}</div><div class="bc-code">${esc(p.code)}</div></div>
        <div class="bc-ev">${esc(ev.name)}</div></div>`);
    }
    const pages = [];
    for (let i = 0; i < cards.length; i += 4) pages.push(`<section class="sheet"><div class="badges">${cards.slice(i, i + 4).join('')}</div></section>`);
    return `<p class="hint noprint">${people.length} credenciales · 4 por hoja A4 · cortar por la línea punteada.</p>` + pages.join('');
  }

  // ---------- mis eventos ----------
  async function viewMine() {
    if (!S.user) return needLogin();
    const [regs, pub] = await Promise.all([DB.listMyRegistrations(S.user.uid), DB.listPublicEvents()]);
    const rows = await Promise.all(regs.map(async r => { let ev = null; try { ev = await DB.getEvent(r.eventId); } catch (e) { } return { r, ev }; }));
    const mineIds = {}; regs.forEach(r => { mineIds[r.eventId] = 1; });
    const items = rows.filter(x => x.ev).map(({ r, ev }) => {
      const eid = enc(ev.id);
      const canCatalog = r.status === 'aprobada' && ev.phase !== 'borrador';
      const canAgenda = r.status === 'aprobada' && ['agenda', 'reuniones', 'cerrado'].includes(ev.phase);
      return `<article class="card mine">
        <div class="mine-photo" data-photo="${esc(JSON.stringify(photosFor(ev)))}"></div>
        <div class="mine-body">
          <div class="row-between"><span>${fmtBadge(ev.format)} <span class="badge ph-${esc(ev.phase)}">${esc(phaseLabel(ev.phase))}</span></span>${statusBadge(r.status)}</div>
          <h3>${esc(ev.name)}</h3>
          <p class="muted">${esc(r.companyName)} · ${t('as')} ${t('role_' + r.type).toLowerCase()}${ev.venue && ev.format === 'presencial' ? ' · ' + esc(ev.venue) : ''}</p>
          ${r.status === 'pendiente' ? `<p class="small">${t('pending_note')}</p>` : ''}
          ${canAgenda && ev.phase === 'agenda' ? `<p class="small ok-note">${t('agenda_open_cta')}</p>` : ''}
          <div class="actions">
            ${canAgenda ? `<a class="btn btn-primary" href="#/evento/${eid}/agenda">${t('agenda')}</a>` : ''}
            ${canCatalog ? `<a class="btn ${canAgenda ? '' : 'btn-primary'}" href="#/evento/${eid}/catalogo">${t('catalog')}</a>` : ''}
            <a class="btn" href="#/evento/${eid}/perfil">${t('edit_profile')}</a>
          </div></div></article>`;
    });
    const open = pub.filter(e => e.phase === 'inscripcion' && !mineIds[e.id]);
    return {
      html: page(pageHead('', t('mine_title'), esc(S.user.email))
        + (isAnyAdmin() ? `<p><a class="btn" href="#/admin">${t('nav_admin')} →</a></p>` : '')
        + ((S.staffEvents || []).length ? `<div class="card status-box"><p><strong>Eres acreditador</strong> en ${S.staffEvents.length} evento(s) presencial(es).</p><a class="btn btn-primary" href="#/acreditacion/${enc(S.staffEvents[0])}">Abrir recepción →</a></div>` : '')
        + `<h2 class="section-title">${t('mine_registered')}</h2>`
        + `<div class="stack">${items.length ? items.join('') : `<div class="card"><p class="muted">${t('mine_empty')}</p></div>`}</div>`
        + (open.length ? `<h2 class="section-title">${t('mine_open')}</h2><div class="grid">${open.map(eventCard).join('')}</div>` : ''))
    };
  }

  // ---------- catálogo ----------
  function companySummary(r) {
    if (r.type === 'vendedor') {
      const regs = (r.regions || []).map(k => REGIONES[k]).filter(Boolean);
      return `<div class="tags">${(r.serviceTypes || []).map(k => `<span class="tag">${esc(svc(k))}</span>`).join('')}</div>
        <p class="small">${t('destination')}: <strong>${esc(r.destination)}</strong>${regs.length ? `<br><span class="muted">${esc(regs.join(', '))}</span>` : ''}</p>`;
    }
    return `<p class="small">${t('target_market')}: <strong>${esc(r.targetMarket)}</strong></p>`;
  }
  function initials(name) { return esc(String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase()); }
  async function viewCatalog(id) {
    if (!S.user) return needLogin();
    const ev = await DB.getEvent(id);
    if (!ev) return notFound();
    const admin = isAdminOf(ev.regionId);
    const me = await myRegFor(id);
    const approved = me && me.status === 'aprobada';
    if (!admin && !approved) return { html: page(ctxBar(ev, me) + `<div class="card narrow"><p>${t('pending_note')}</p><a class="btn" href="#/mi">${t('go_account')}</a></div>`) };
    const booking = approved && ev.phase === 'agenda';
    const [list0, avail, sched] = await Promise.all([
      DB.listRegistrations(id, { status: 'aprobada' }),
      booking ? DB.getAvailability(id) : Promise.resolve(null),
      booking ? DB.getSchedule(id) : Promise.resolve(null)
    ]);
    const all = list0.filter(r => r.uid !== S.user.uid);
    const slotMap = {}; if (sched) sched.slots.forEach(s => { slotMap[s.id] = s; });
    let showType = approved ? (me.type === 'vendedor' ? 'comprador' : 'vendedor') : 'vendedor';
    const eid = enc(id);
    return {
      html: page(ctxBar(ev, me, false) + pageHead(t('catalog'), '', '') +
        (booking ? `<div class="card status-box"><p>${t('agenda_open_cta')}</p><a class="btn btn-primary" href="#/evento/${eid}/agenda">${t('agenda')}</a></div>` : '') + `
        <div class="filters card">
          ${!approved ? `<select id="cat-type" aria-label="Tipo"><option value="vendedor">${t('catalog_sellers')}</option><option value="comprador">${t('catalog_buyers')}</option></select>` : ''}
          <input id="cat-q" type="search" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}">
          <select id="cat-svc" aria-label="${esc(t('service_types'))}"><option value="">${t('all_services')}</option>${Object.keys(I.services).map(k => `<option value="${k}">${esc(svc(k))}</option>`).join('')}</select>
          <select id="cat-reg" aria-label="${esc(t('region'))}"><option value="">${t('all_regions')}</option>${SELLER_REGIONS.map(k => `<option value="${k}">${esc(REGIONES[k])}</option>`).join('')}</select>
          ${avail ? `<label class="check inline-check"><input type="checkbox" id="cat-av" checked> ${t('only_available')}</label>` : ''}
        </div>
        <p class="muted small" id="cat-count"></p>
        <div class="grid" id="cat-list"></div>
        ${booking ? '' : `<p class="notice">${ev.phase === 'inscripcion' ? t('agenda_soon') : t('agenda_closed')}</p>`}`),
      bind(root) {
        const draw = () => {
          const q = ($('#cat-q', root).value || '').toLowerCase().trim();
          const sv = $('#cat-svc', root).value, rg = $('#cat-reg', root).value;
          const onlyAv = avail && $('#cat-av', root).checked;
          $('#cat-svc', root).hidden = showType !== 'vendedor'; $('#cat-reg', root).hidden = showType !== 'vendedor';
          $('.page-head h1', root).textContent = showType === 'vendedor' ? t('catalog_sellers') : t('catalog_buyers');
          const list = all.filter(r => r.type === showType)
            .filter(r => showType !== 'vendedor' || !sv || (r.serviceTypes || []).includes(sv))
            .filter(r => showType !== 'vendedor' || !rg || (r.regions || []).includes(rg))
            .filter(r => !q || [r.companyName, r.destination, r.products, r.targetMarket, r.description, (r.regions || []).map(k => REGIONES[k]).join(' ')].join(' ').toLowerCase().includes(q))
            .filter(r => !onlyAv || (avail.companies[r.uid] && avail.companies[r.uid].common.length && !avail.companies[r.uid].paired))
            .sort((a, b) => a.companyName.localeCompare(b.companyName));
          $('#cat-count', root).textContent = `${list.length} ${t('results')}`;
          $('#cat-list', root).innerHTML = list.length ? list.map(r => {
            const a = avail && avail.companies[r.uid];
            const times = a ? (a.paired ? `<p class="small muted">${t('already_paired')}</p>` : a.common.length
              ? `<div class="label small">${t('common_times')}</div><div class="time-chips">${a.common.slice(0, 6).map(sid => `<button type="button" class="time-chip" data-uid="${esc(r.uid)}" data-slot="${esc(sid)}">${esc(slotMap[sid] ? fmtDay(slotMap[sid].start).split(',')[0].slice(0, 3) + ' ' + fmtTime(slotMap[sid].start) : sid)}</button>`).join('')}${a.common.length > 6 ? `<span class="small muted">+${a.common.length - 6}</span>` : ''}</div>`
              : `<p class="small muted">${t('no_common')}</p>`) : '';
            return `<div class="card company">
              <a class="company-link" href="#/evento/${eid}/empresa/${enc(r.uid)}">${logoHtml(r)}<h3>${esc(r.companyName)}</h3></a>${companySummary(r)}${times}
              <a class="more" href="#/evento/${eid}/empresa/${enc(r.uid)}">${booking && a && !a.paired && a.common.length ? t('request_meeting') : t('view_company')} →</a></div>`;
          }).join('') : `<p class="muted">${t('no_results')}</p>`;
          $$('.company', root).forEach(c => { c.style.cursor = 'pointer'; c.onclick = e => { if (e.target.closest('a,button')) return; const l = $('.company-link', c); if (l) go(l.getAttribute('href')); }; });
          $$('.time-chip', root).forEach(b => b.onclick = () => { S.preselectSlot = b.getAttribute('data-slot'); go(`#/evento/${eid}/empresa/${enc(b.getAttribute('data-uid'))}`); });
        };
        ['#cat-q', '#cat-svc', '#cat-reg', '#cat-av'].forEach(sel => { const el = $(sel, root); if (el) el.addEventListener(el.type === 'search' ? 'input' : 'change', draw); });
        const ts = $('#cat-type', root); if (ts) ts.onchange = () => { showType = ts.value; draw(); };
        draw();
      }
    };
  }

  async function viewCompany(id, uid) {
    if (!S.user) return needLogin();
    const ev = await DB.getEvent(id);
    const r = await DB.getRegistration(id, uid);
    if (!ev || !r) return notFound();
    const me = await myRegFor(id);
    const canBook = ev.phase === 'agenda' && me && me.status === 'aprobada' && me.type !== r.type;
    let booking = '';
    let sched = null, mine = null, busyT = [];
    if (canBook) {
      [sched, mine, busyT] = await Promise.all([DB.getSchedule(id), DB.listMyMeetings(id), DB.getBusy(id, uid)]);
      const active = mine.meetings.find(m => m.other && m.other.uid === uid && (m.status === 'pendiente' || m.status === 'aceptada'));
      const slotMap = {}; sched.slots.forEach(s => { slotMap[s.id] = s; });
      if (active) {
        const msg = active.status === 'aceptada' ? t('existing_confirmed') : active.incoming ? t('existing_incoming') : t('existing_pending');
        booking = `<div class="booking card"><h2>${t('request_meeting')}</h2><p>${msg}</p><p><strong>${esc(slotText(slotMap[active.slot], sched.tz))}</strong> ${meetingBadge(active.status)}</p>
          <a class="btn btn-primary" href="#/evento/${enc(id)}/agenda">${t('agenda')}</a></div>`;
      } else if (!sched.slots.length) {
        booking = `<div class="booking card"><h2>${t('request_meeting')}</h2><p class="muted">${t('no_slots')}</p></div>`;
      } else {
        const myBusy = {}; mine.meetings.forEach(m => { if (m.status === 'aceptada') myBusy[m.slot] = 1; }); mine.blocks.forEach(b => { myBusy[b] = 1; });
        const theirs = {}; busyT.forEach(b => { theirs[b] = 1; });
        const sentPending = mine.meetings.filter(m => !m.incoming && m.status === 'pendiente').length;
        const nowMs = Date.now();
        const free = s => !(Date.parse(s.start) <= nowMs || theirs[s.id] || myBusy[s.id]);
        const days = groupByDay(sched.slots).map(g => ({ day: g.day, slots: g.slots.filter(free) })).filter(g => g.slots.length);
        booking = `<div class="booking card" id="booking"><h2>${t('request_meeting')}</h2>
          <p class="small muted">${t('common_times')} · ${t('your_tz_note')}: <strong>${esc(USER_TZ)}</strong></p>
          ${days.length ? `<div class="slot-days">${days.map(g => `<div class="slot-day"><h3>${esc(g.day)}</h3><div class="slot-grid">${g.slots.map(s =>
            `<button type="button" class="slot" data-slot="${esc(s.id)}">${fmtTime(s.start)}</button>`).join('')}</div></div>`).join('')}</div>` : `<p class="notice">${t('no_common')}</p>`}
          <form id="f-book" hidden novalidate>
            <p class="selected-slot"><span class="kicker">${t('selected')}</span><strong id="sel-slot"></strong></p>
            <label>${t('note_ph')}<textarea name="note" rows="2" maxlength="300"></textarea></label>
            <div class="form-msg" role="alert"></div>
            <button class="btn btn-primary" type="submit">${t('send_request')}</button>
          </form>
          <p class="small muted">${t('pending_count')}: ${sentPending} / ${sched.rules.maxPending}. ${t('rules_note')}</p></div>`;
      }
    }
    return {
      html: page(ctxBar(ev, me) + `<p class="small"><a href="#/evento/${enc(id)}/catalogo">← ${t('catalog')}</a></p>
      <div class="company-layout">
      <article class="card company-detail">
        <div class="row-start">${logoHtml(r, 'avatar-lg')}
        <div><span class="badge">${t('role_' + r.type)}</span><h1>${esc(r.companyName)}</h1></div></div>
        ${companySummary(r)}
        ${r.type === 'vendedor' ? `<h3>${t('products')}</h3><p class="pre">${esc(r.products)}</p>` : ''}
        ${r.description ? `<p class="pre">${esc(r.description)}</p>` : ''}
        ${r.website && /^https?:\/\//i.test(r.website) ? `<p><a href="${esc(r.website)}" target="_blank" rel="noopener">${esc(r.website)}</a></p>` : ''}
        ${canBook ? '' : `<p class="notice">${ev.phase === 'inscripcion' ? t('agenda_soon') : t('agenda_closed')}</p>`}
      </article>
      ${booking}
      </div>`),
      bind(root) {
        const form = $('#f-book', root); if (!form) return;
        let chosen = null;
        const pick = b => {
          $$('.slot.on', root).forEach(x => x.classList.remove('on')); b.classList.add('on');
          chosen = b.getAttribute('data-slot');
          $('#sel-slot', root).textContent = slotText(sched.slots.find(s => s.id === chosen), sched.tz);
          form.hidden = false; form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        };
        $$('.slot[data-slot]', root).forEach(b => b.onclick = () => pick(b));
        if (S.preselectSlot) { const b = $(`.slot[data-slot="${S.preselectSlot}"]`, root); S.preselectSlot = null; if (b) pick(b); }
        form.onsubmit = async e => {
          e.preventDefault(); if (!chosen) return;
          const btn = $('button[type=submit]', form); btn.disabled = true; btn.textContent = t('sending');
          try { await DB.requestMeeting(id, uid, chosen, val(form, 'note')); S.flash = { type: 'ok', msg: t('request_sent') }; render(); }
          catch (err) { showError(form, errMsg(err)); btn.disabled = false; btn.textContent = t('send_request'); }
        };
      }
    };
  }

  // ---------- agenda del participante ----------
  async function viewAgenda(id) {
    if (!S.user) return needLogin();
    const ev = await DB.getEvent(id);
    if (!ev) return notFound();
    const me = await myRegFor(id);
    if (!me || me.status !== 'aprobada') {
      if (isAdminOf(ev.regionId)) return { html: '', bind() { go('#/admin/evento/' + enc(id)); } };
      return { html: page(ctxBar(ev, me) + `<div class="card narrow"><p>${t('pending_note')}</p></div>`) };
    }
    const online = (ev.format || 'online') === 'online';
    if (online && ev.phase === 'reuniones') { try { await DB.selfCheckin(id); } catch (e) { } }
    const [sched, mine, acc] = await Promise.all([DB.getSchedule(id), DB.listMyMeetings(id), DB.myAccreditation(id).catch(() => null)]);
    const slotMap = {}; sched.slots.forEach(s => { slotMap[s.id] = s; });
    const open = ev.phase === 'agenda';
    const rooms = online && ['agenda', 'reuniones'].includes(ev.phase);
    const embedRooms = (ev.videoProvider || 'vdo') !== 'meet';
    const seller = me.type === 'vendedor';
    const bySlot = (a, b) => String(a.slot).localeCompare(String(b.slot));
    const ms = mine.meetings.slice().sort(bySlot);
    const received = ms.filter(m => m.incoming && m.status === 'pendiente');
    const sent = ms.filter(m => !m.incoming && m.status === 'pendiente');
    const confirmed = ms.filter(m => m.status === 'aceptada');
    const past = ms.filter(m => ['rechazada', 'cancelada', 'vencida', 'anulada'].includes(m.status));
    const cancelMs = sched.rules.cancelHours * 3600000;
    const eid = enc(id);
    const who = m => `<a class="who" href="#/evento/${eid}/empresa/${enc(m.other ? m.other.uid : '')}">${logoHtml(m.other)}<span><strong>${esc(m.other ? m.other.companyName : '—')}</strong><small>${m.other ? t('role_' + m.other.type) : ''}</small></span></a>`;
    const when = m => `<div class="when">${esc(slotText(slotMap[m.slot], sched.tz)) || esc(m.slot)}${!online && m.sellerTable ? ` · <span class="table-tag">${t('table_label')} ${esc(m.sellerTable)}</span>` : ''}</div>`;
    const note = m => m.note ? `<p class="m-note">“${esc(m.note)}”</p>` : '';
    const row = (m, actions) => `<div class="m-row">${who(m)}<div class="m-info">${when(m)}${note(m)}</div><div class="m-act">${actions}</div></div>`;
    const section = (title, list, rend, extra) => `<section class="card"><div class="row-between"><h2>${title} <span class="count">${list.length}</span></h2></div>${extra || ''}${list.length ? list.map(rend).join('') : `<p class="muted">${t('none_yet')}</p>`}</section>`;
    const upcoming = confirmed.filter(m => !m.joinUntil || Date.parse(m.joinUntil) > Date.now());
    const nextId = upcoming.length ? upcoming[0].id : null;
    const joinState = m => { if (!m.joinFrom) return 'open'; const n = Date.now(); if (n < Date.parse(m.joinFrom)) return 'soon'; if (n > Date.parse(m.joinUntil)) return 'ended'; return 'open'; };
    const joinArea = m => {
      if (!rooms) return '';
      if (!m.hasRoom) return `<p class="small muted">${t('no_room')}</p>`;
      const st = joinState(m);
      if (st === 'ended') return `<p class="small muted">${t('join_ended')}</p>`;
      return `<button class="btn btn-primary btn-join" data-join="${esc(m.id)}" data-from="${esc(m.joinFrom || '')}" data-until="${esc(m.joinUntil || '')}"${st === 'soon' ? ' disabled' : ''}>${st === 'soon' ? `${t('join_from')} ${fmtTime(m.joinFrom)}` : '▶ ' + t('join')}</button>`;
    };
    const myHeld = m => seller ? m.held : m.buyerHeld;
    const markArea = m => {
      if (!m.canMark) return '';
      const h = myHeld(m);
      const status = seller && m.liveStatus ? `<span class="badge mt-${m.held === 'si' ? 'aceptada' : 'cancelada'}">${esc(liveLabel(m.liveStatus))}</span>` : h ? `<span class="badge mt-${h === 'si' ? 'aceptada' : 'cancelada'}">${h === 'si' ? t('mark_done') : seller ? t('mark_noshow') : t('mark_not_done')}</span>` : '';
      return `<div class="mark-row">${status}<button class="btn btn-small${h === 'si' ? ' btn-ok' : ''}" data-mark="realizada" data-id="${esc(m.id)}">✓ ${t('mark_done')}</button><button class="btn btn-small${h === 'no' ? ' btn-danger' : ''}" data-mark="${seller ? 'no_show' : 'no_realizada'}" data-id="${esc(m.id)}">✕ ${seller ? t('mark_noshow') : t('mark_not_done')}</button></div>`;
    };
    const surveyForm = m => {
      const v = m.survey || {};
      return `<form class="survey" data-survey="${esc(m.id)}" hidden novalidate>
        <div class="label">${t('q_held')}</div>
        <div class="pills"><label><input type="radio" name="held" value="si"${v.held === 'si' ? ' checked' : ''}><span>${t('yes')}</span></label><label><input type="radio" name="held" value="no"${v.held === 'no' ? ' checked' : ''}><span>${t('no')}</span></label></div>
        <div class="held-yes"${v.held === 'si' ? '' : ' hidden'}>
          <div class="label">${t('q_interest')}</div>
          <div class="pills">${[1, 2, 3, 4, 5].map(n => `<label><input type="radio" name="interest" value="${n}"${String(v.interest) === String(n) ? ' checked' : ''}><span>${n}</span></label>`).join('')}</div>
          <label>${t('q_outcome')}<select name="outcome"><option value="">—</option>${['negocio', 'seguimiento', 'sin_interes'].map(o => `<option value="${o}"${v.outcome === o ? ' selected' : ''}>${t('o_' + o)}</option>`).join('')}</select></label>
          <label>${t('q_amount')}<input type="number" name="amount" min="0" step="100" inputmode="numeric" value="${esc(v.amount && v.amount !== '0' ? v.amount : '')}"></label>
        </div>
        <label>${t('q_comment')}<textarea name="comment" rows="2" maxlength="500">${esc(v.comment)}</textarea></label>
        <div class="form-msg" role="alert"></div>
        <button class="btn btn-primary btn-small" type="submit">${t('save_eval')}</button>
      </form>`;
    };
    const blocks = {}; mine.blocks.forEach(b => { blocks[b] = 1; });
    const meetAt = {}; confirmed.forEach(m => { meetAt[m.slot] = m; });
    const nowMs = Date.now();
    const brkByDay = {}; (sched.breaks || []).forEach(b => { (brkByDay[fmtDay(b.start)] = brkByDay[fmtDay(b.start)] || []).push(b); });
    const grid = sched.slots.length ? groupByDay(sched.slots).map(g => `<div class="slot-day"><h3>${esc(g.day)}</h3><div class="slot-grid">${g.slots.map((s, si) => {
      const pre = (brkByDay[g.day] || []).filter(x => Date.parse(x.start) <= Date.parse(s.start) && (si === 0 || Date.parse(x.start) > Date.parse(g.slots[si - 1].start))).map(x => `<div class="slot slot-break">${fmtTime(x.start)}<small>${esc(x.label)}</small></div>`).join('');
      return pre + (() => {
      const m = meetAt[s.id], b = blocks[s.id], isPast = Date.parse(s.start) <= nowMs;
      if (m) return `<div class="slot slot-meet" title="${esc(m.other ? m.other.companyName : '')}">${fmtTime(s.start)}<small>${esc(m.other ? m.other.companyName : '')}</small></div>`;
      return `<button type="button" class="slot ${b ? 'slot-blocked' : ''}" data-block="${esc(s.id)}" data-on="${b ? 1 : 0}"${isPast || !open ? ' disabled' : ''}>${fmtTime(s.start)}<small>${b ? t('blocked') : t('free')}</small></button>`;
      })();
    }).join('')}${(brkByDay[g.day] || []).filter(x => g.slots.length && Date.parse(x.start) > Date.parse(g.slots[g.slots.length - 1].start)).map(b => `<div class="slot slot-break">${fmtTime(b.start)}<small>${esc(b.label)}</small></div>`).join('')}</div></div>`).join('') : `<p class="muted">${t('no_slots')}</p>`;
    // acreditación (presencial: QR; online: ingreso registrado)
    let accCard = '';
    if (acc && !online) {
      accCard = `<section class="card acc-card"><h2>${t('my_qr')}</h2><p class="small muted">${t('my_qr_help')}</p><div class="qr-list">${acc.people.map(p => `
        <div class="qr-item"><div class="qr-box" data-qr="${esc(qrText(id, p.code))}"><span class="qr-fallback">${esc(p.code)}</span></div>
        <div><strong>${esc(p.name)}</strong><br><small>${p.person === 'titular' ? t('holder') : t('companion')}</small><br>
        ${p.checkedAt ? `<span class="badge st-aprobada">✓ ${t('accredited_ok')}</span>` : `<span class="badge st-pendiente">${t('not_accredited')}</span>`}
        <p class="small mono">${esc(p.code)}</p></div></div>`).join('')}</div>
        ${seller && mine.table ? `<p class="table-big">${t('table_label')} ${esc(mine.table)}</p>` : ''}</section>`;
    } else if (acc && online && ev.phase === 'reuniones' && acc.people[0] && acc.people[0].checkedAt) {
      accCard = `<p class="small ok-note">✓ ${t('checkin_online_done')}</p>`;
    }
    const welcome = online && ev.phase === 'reuniones' && ev.welcomeUrl ? `<section class="card welcome-card"><div class="row-between"><h2>${t('welcome_title')}</h2><button class="link small" id="welcome-toggle">▾</button></div>
      <div class="video-frame" id="welcome-frame"><iframe src="${esc(youtubeEmbed(ev.welcomeUrl))}" title="${esc(t('welcome_title'))}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen></iframe></div></section>` : '';
    const myRoomCard = seller && mine.room && rooms ? `<div class="card room-card"><div><p class="kicker">${t('my_room')}</p><p class="small muted">${t('my_room_help')}</p></div>
      <a class="btn btn-primary" href="${esc(mine.room.url)}" target="_blank" rel="noopener">${t('open_room')}</a></div>` : '';
    return {
      html: page(ctxBar(ev, me) + pageHead(esc(ev.name), t('agenda'), `${esc(me.companyName)} · ${t('your_tz_note')}: ${esc(USER_TZ)}`) + `
        <div class="stats">
          <div class="stat stat-ok"><span>${confirmed.length}</span>${t('confirmed')}</div>
          <div class="stat stat-warn"><span>${received.length}</span>${t('received')}</div>
          <div class="stat"><span>${sent.length}/${sched.rules.maxPending}</span>${t('pending_count')}</div>
        </div>
        ${welcome}${accCard}
        ${open ? `<div class="card status-box"><p>${t('agenda_open_cta')}</p><a class="btn btn-primary" href="#/evento/${eid}/catalogo">${t('catalog')}</a></div>` : ev.phase === 'reuniones' ? `<div class="card status-box"><p><strong>${t('meetings_day')}</strong></p></div>` : `<p class="notice">${t('agenda_closed')}</p>`}
        ${myRoomCard}
        ${section(t('confirmed'), confirmed, m => {
          const sl = slotMap[m.slot]; const can = open && sl && Date.parse(sl.start) - nowMs >= cancelMs;
          const isNext = nextId === m.id;
          return `<div class="meet-card${isNext ? ' is-next' : ''}">` + row(m, `${isNext ? `<span class="badge ph-inscripcion">${t('next_meeting')}</span>` : meetingBadge('aceptada')}
            ${joinArea(m)}${markArea(m)}
            ${m.canSurvey ? (m.survey ? `<span class="badge mt-aceptada">${t('evaluated')} ✓</span><button class="link small" data-eval="${esc(m.id)}">${t('edit_eval')}</button>` : `<button class="btn btn-small" data-eval="${esc(m.id)}">${t('evaluate')}</button>`) : ''}
            ${can ? `<button class="btn btn-small btn-ghost" data-cancel="${esc(m.id)}">${t('cancel_meeting')}</button>` : ''}`) + (m.canSurvey ? surveyForm(m) : '') + `</div>`;
        }, `<div class="actions"><button class="btn btn-small" id="btn-print-mine">🖨 ${t('print_my_agenda')}</button></div>` + (confirmed.length && rooms && embedRooms ? `<p class="small muted meet-hint">${t('cam_hint')}${DB.mode === 'demo' ? ' (Demo)' : ''}</p>` : confirmed.length && rooms ? `<p class="small muted meet-hint">${esc(t('meet_hint').replace('{email}', S.user.email))}</p>` : ''))}
        ${section(t('received'), received, m => row(m, open ? `<button class="btn btn-small btn-primary" data-resp="1" data-id="${esc(m.id)}">${t('accept')}</button><button class="btn btn-small" data-resp="0" data-id="${esc(m.id)}">${t('reject')}</button>` : meetingBadge(m.status)))}
        ${section(t('sent'), sent, m => row(m, `${meetingBadge('pendiente')}<button class="btn btn-small btn-ghost" data-cancel="${esc(m.id)}">${t('withdraw')}</button>`))}
        <section class="card"><h2>${t('availability')}</h2><p class="small muted">${t('availability_help')}</p><div class="slot-days">${grid}</div></section>
        ${past.length ? `<details class="card history"><summary><h2>${t('history')} <span class="count">${past.length}</span></h2></summary>${past.map(m => row(m, meetingBadge(m.status))).join('')}</details>` : ''}
        <p class="small muted">${t('rules_note')}</p>
        <div class="form-msg" id="agenda-msg" role="alert"></div>`),
      bind(root) {
        const fail = err => { const b = $('#agenda-msg', root); b.className = 'form-msg error'; b.textContent = errMsg(err); b.scrollIntoView({ block: 'center' }); };
        const busy = el => { $$('button', root).forEach(x => { x.disabled = true; }); el.textContent = t('sending'); };
        $$('.qr-box[data-qr]', root).forEach(async el => { const svg = await qrSvg(el.getAttribute('data-qr')); if (svg) el.innerHTML = svg; });
        const wt = $('#welcome-toggle', root); if (wt) wt.onclick = () => { const f = $('#welcome-frame', root); f.hidden = !f.hidden; wt.textContent = f.hidden ? '▸' : '▾'; };
        $$('[data-resp]', root).forEach(b => b.onclick = async () => {
          busy(b);
          try { await DB.respondMeeting(id, b.getAttribute('data-id'), b.getAttribute('data-resp') === '1'); render(); } catch (err) { await render(); fail(err); }
        });
        $$('[data-cancel]', root).forEach(b => b.onclick = async () => {
          busy(b);
          try { await DB.cancelMeeting(id, b.getAttribute('data-cancel')); render(); } catch (err) { await render(); fail(err); }
        });
        $$('[data-mark]', root).forEach(b => b.onclick = async () => {
          busy(b);
          try { await DB.markMeeting(id, b.getAttribute('data-id'), b.getAttribute('data-mark')); render(); }
          catch (err) { await render(); fail(err); }
        });
        $$('[data-join]', root).forEach(b => b.onclick = async () => {
          const mid = b.getAttribute('data-join');
          if (embedRooms) return go(`#/evento/${eid}/sala/${enc(mid)}`);
          const w = window.open('', '_blank');
          try {
            const r = await DB.joinMeeting(id, mid);
            if (w && !w.closed) { try { w.opener = null; } catch (x) { } w.location.href = r.url; }
            else { const box = $('#agenda-msg', root); box.className = 'form-msg ok'; box.innerHTML = `${esc(t('popup_blocked'))} <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url)}</a>`; }
          } catch (err) { if (w) w.close(); fail(err); }
        });
        const tick = () => $$('[data-join]', root).forEach(b => {
          const f = b.getAttribute('data-from'), u = b.getAttribute('data-until'); if (!f) return;
          const n = Date.now();
          if (n >= Date.parse(f) && n <= Date.parse(u)) { b.disabled = false; b.textContent = '▶ ' + t('join'); }
          else if (n > Date.parse(u)) { b.outerHTML = `<p class="small muted">${t('join_ended')}</p>`; }
        });
        agendaTimer = setInterval(tick, 20000);
        $$('[data-eval]', root).forEach(b => b.onclick = () => { const f = $(`form[data-survey="${b.getAttribute('data-eval')}"]`, root); f.hidden = !f.hidden; if (!f.hidden) f.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); });
        $$('form[data-survey]', root).forEach(f => {
          const yes = $('.held-yes', f);
          $$('input[name=held]', f).forEach(r => r.onchange = () => { yes.hidden = r.value !== 'si' || !r.checked; });
          f.onsubmit = async e => {
            e.preventDefault();
            const pick = n => (($$(`input[name=${n}]:checked`, f)[0]) || {}).value || '';
            const d = { held: pick('held'), interest: Number(pick('interest')) || 0, outcome: val(f, 'outcome'), amount: Number(val(f, 'amount')) || 0, comment: val(f, 'comment') };
            if (!d.held || (d.held === 'si' && (!d.interest || !d.outcome))) return showError(f, t('required'));
            const btn = $('button[type=submit]', f); btn.disabled = true;
            try { await DB.saveSurvey(id, f.getAttribute('data-survey'), d); S.flash = { type: 'ok', msg: t('eval_saved') }; render(); }
            catch (err) { btn.disabled = false; showError(f, errMsg(err)); }
          };
        });
        $$('[data-block]', root).forEach(b => b.onclick = async () => {
          const on = b.getAttribute('data-on') === '1'; b.disabled = true;
          try {
            await DB.setBlock(id, b.getAttribute('data-block'), !on);
            b.setAttribute('data-on', on ? '0' : '1'); b.classList.toggle('slot-blocked', !on);
            $('small', b).textContent = on ? t('free') : t('blocked');
          } catch (err) { fail(err); }
          b.disabled = false;
        });
        $('#btn-print-mine', root).onclick = async () => {
          const c = await DB.getContact(id, S.user.uid).catch(() => ({}));
          printWindow(t('agenda') + ' · ' + me.companyName, agendaSheets(ev, { slots: sched.slots, breaks: sched.breaks }, [{
            companyName: me.companyName, type: me.type, table: mine.table, contactName: c.contactName, companion: ((c.companions || [])[0] || {}).name,
            meetings: confirmed.map(m => ({ slot: m.slot, otherName: m.other ? m.other.companyName : '', otherTable: m.sellerTable }))
          }]));
        };
      }
    };
  }

  // ---------- sala de reunión con panel de control ----------
  async function viewRoom(id, mid) {
    if (!S.user) return needLogin();
    const ev = await DB.getEvent(id);
    if (!ev) return notFound();
    const me = await myRegFor(id);
    if (!me || me.status !== 'aprobada') return denied();
    const [sched, mine] = await Promise.all([DB.getSchedule(id), DB.listMyMeetings(id)]);
    const m = mine.meetings.find(x => x.id === mid && x.status === 'aceptada');
    if (!m) return notFound();
    const slot = sched.slots.find(s => s.id === m.slot);
    let join = null, joinErr = null;
    try { join = await DB.joinMeeting(id, mid); } catch (e) { joinErr = e; }
    const seller = me.type === 'vendedor';
    const nextM = mine.meetings.filter(x => x.status === 'aceptada' && x.slot > m.slot).sort((a, b) => a.slot.localeCompare(b.slot))[0];
    const nextSlot = nextM ? sched.slots.find(s => s.id === nextM.slot) : null;
    const o = m.other || {};
    const videoHtml = join && join.embed
      ? `<iframe src="${esc(join.url)}" title="Videollamada" allow="camera; microphone; display-capture; autoplay; fullscreen; clipboard-write; speaker-selection" allowfullscreen></iframe>`
      : join ? `<div class="room-ext"><p>${t('meet_hint').replace('{email}', esc(S.user.email))}</p><a class="btn btn-primary btn-lg" href="${esc(join.url)}" target="_blank" rel="noopener">${t('open_meet')}</a></div>`
        : `<div class="room-ext"><p class="error">${esc(errMsg(joinErr))}</p>${joinErr && joinErr.code === 'not-yet' && m.joinFrom ? `<p>${t('join_from')} <strong>${fmtTime(m.joinFrom)}</strong></p>` : ''}</div>`;
    const liveNow = m.liveStatus;
    return {
      html: `<div class="room-wrap">
        <div class="room-top container">${ctxBar(ev, me)}</div>
        <div class="room-layout container">
          <div class="room-video">${videoHtml}${DB.mode === 'demo' && join && join.embed ? '<p class="small muted demo-note">Modo demo: la sala de video es real (VDO.Ninja), pero el link es de prueba.</p>' : ''}</div>
          <aside class="room-panel card">
            <p class="kicker">${t('room_panel')}</p>
            <div class="row-start">${logoHtml(o, 'avatar-lg')}<div><span class="badge">${o.type ? t('role_' + o.type) : ''}</span><h2>${esc(o.companyName || '')}</h2></div></div>
            ${o.type === 'vendedor' ? `<p class="small">${t('destination')}: <strong>${esc(o.destination || '')}</strong></p>` : o.targetMarket ? `<p class="small">${t('target_market')}: <strong>${esc(o.targetMarket)}</strong></p>` : ''}
            <p class="when">${esc(slotText(slot, sched.tz))}</p>
            <div class="countdown"><span class="small muted">${t('time_left')}</span><strong id="countdown">--:--</strong></div>
            <div class="label">${t('room_status')}</div>
            <p id="room-status">${liveNow ? `<span class="badge mt-${m.held === 'no' ? 'cancelada' : 'aceptada'}">${esc(liveLabel(liveNow))}</span>` : '<span class="muted small">—</span>'}</p>
            <div class="room-actions">
              ${seller ? `
                <button class="btn btn-primary btn-block" data-state="en_curso">● ${t('room_in_progress')}</button>
                <button class="btn btn-danger btn-block" data-state="no_show">✕ ${t('room_noshow_btn')}</button>
                <button class="btn btn-block" data-state="finalizada" data-leave="1">■ ${t('room_finish')}</button>`
              : `
                <button class="btn btn-primary btn-block" data-state="realizada">✓ ${t('room_done_btn')}</button>
                <button class="btn btn-block" data-leave="1">⏏ ${t('room_leave')}</button>`}
            </div>
            <p class="small muted">${t('room_wait')}</p>
            <div class="next-box"><span class="small muted">${t('next_meeting_label')}</span>
              ${nextM ? `<strong>${esc(nextM.other ? nextM.other.companyName : '')}</strong><span class="small">${esc(slotText(nextSlot, sched.tz))}</span>` : `<span class="small">${t('no_more_meetings')}</span>`}</div>
            <a class="small" href="#/evento/${enc(id)}/agenda">← ${t('back_agenda')}</a>
            <div class="form-msg" role="alert"></div>
          </aside>
        </div></div>`,
      bind(root) {
        const panel = $('.room-panel', root);
        const beat = () => DB.heartbeat(id, mid).catch(() => { });
        if (join) beat();
        const hb = setInterval(() => { if (join) beat(); }, 30000);
        const end = slot ? Date.parse(slot.end) : 0;
        const cd = $('#countdown', root);
        const tickCd = () => {
          const left = end - Date.now();
          if (!end) { cd.textContent = '--:--'; return; }
          if (left <= 0) { cd.textContent = t('time_up'); cd.classList.add('over'); return; }
          const mm = Math.floor(left / 60000), ss = Math.floor((left % 60000) / 1000);
          cd.textContent = (mm > 99 ? Math.floor(mm / 60) + 'h ' + (mm % 60) + 'm' : String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0'));
        };
        tickCd(); const ct = setInterval(tickCd, 1000);
        cleanup = () => { clearInterval(hb); clearInterval(ct); DB.heartbeat(id, '', true).catch(() => { }); };
        const leave = () => go(`#/evento/${enc(id)}/agenda`);
        $$('[data-state], [data-leave]', root).forEach(b => b.onclick = async () => {
          const st = b.getAttribute('data-state');
          if (st) {
            b.disabled = true;
            try {
              await DB.markMeeting(id, mid, st);
              $('#room-status', root).innerHTML = `<span class="badge mt-${st === 'no_show' ? 'cancelada' : 'aceptada'}">${esc(liveLabel(st))}</span>`;
            } catch (err) { showError(panel, errMsg(err)); b.disabled = false; return; }
            b.disabled = false;
          }
          if (b.getAttribute('data-leave')) { S.flash = { type: 'ok', msg: t('saved') }; leave(); }
        });
      }
    };
  }

  // ---------- acreditación (recepción) ----------
  async function viewAccreditation(id) {
    if (!S.user) return needLogin();
    const ev = await DB.getEvent(id);
    if (!ev) return notFound();
    if (!(isAdminOf(ev.regionId) || (S.staffEvents || []).includes(id))) return denied();
    const list = await DB.listCheckins(id);
    const count = () => ({ done: list.filter(x => x.checkedAt).length, total: list.length });
    const c0 = count();
    const others = (S.staffEvents || []).filter(x => x !== id);
    const card = p => `<div class="acc-result card${p.checkedAt ? ' is-done' : ''}" data-code="${esc(p.code)}">
        <div class="row-start">${logoHtml({ logo: p.logo, companyName: p.companyName }, 'avatar-lg')}
        <div><span class="badge fmt-${p.type === 'vendedor' ? 'presencial' : 'online'}">${p.type === 'vendedor' ? 'Vendedor' : 'Comprador'}</span> <span class="small muted">${p.person === 'titular' ? 'Titular' : 'Acompañante'}</span>
        <h2>${esc(p.name)}</h2><p class="muted">${esc(p.companyName)}${p.type === 'vendedor' && p.table ? ` · <strong>Mesa ${esc(p.table)}</strong>` : ''}</p></div></div>
        ${p.checkedAt ? `<p class="ok-note">✓ Acreditado ${esc(new Date(p.checkedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }))} · credencial entregada</p>
          <button class="link small" data-undo="${esc(p.code)}">Deshacer acreditación</button>`
          : `<button class="btn btn-primary btn-lg btn-block" data-check="${esc(p.code)}">✓ Confirmar acreditación y entregar credencial</button>`}
      </div>`;
    return {
      html: page(`<div class="ctxbar"><div class="ctx-main"><span class="ctx-label">Acreditación</span><strong>${esc(ev.name)}</strong> ${fmtBadge(ev.format)}</div>
          ${others.length ? `<select id="acc-ev" aria-label="Evento"><option value="${esc(id)}">Cambiar de evento…</option>${others.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select>` : ''}</div>
        <div class="stats"><div class="stat stat-ok"><span id="acc-count">${c0.done}/${c0.total}</span>personas acreditadas</div>
          <div class="stat stat-warn"><span id="acc-pending">${c0.total - c0.done}</span>por acreditar</div></div>
        <section class="card acc-scan">
          <h2>Buscar o escanear</h2>
          <form id="f-acc" class="acc-form" novalidate>
            <input id="acc-q" name="q" placeholder="Nombre, empresa o código" autocomplete="off" autofocus>
            <button class="btn btn-primary" type="submit">Buscar</button>
            <button class="btn" type="button" id="btn-scan">📷 Escanear QR</button>
          </form>
          <div class="scan-box" id="scan-box" hidden><video id="scan-video" playsinline muted></video><button class="btn btn-small" type="button" id="btn-scan-stop">Detener cámara</button></div>
          <div class="form-msg" id="acc-msg" role="alert"></div>
          <div id="acc-results"></div>
        </section>
        <details class="card"><summary><h2 style="display:inline">Pendientes de acreditar</h2></summary><div id="acc-pending-list"></div></details>`),
      bind(root) {
        const msg = (txt, bad) => { const b = $('#acc-msg', root); b.className = 'form-msg ' + (bad ? 'error' : 'ok'); b.textContent = txt; };
        const updateCounts = () => { const c = count(); $('#acc-count', root).textContent = `${c.done}/${c.total}`; $('#acc-pending', root).textContent = c.total - c.done; drawPending(); };
        const drawPending = () => {
          const pend = list.filter(x => !x.checkedAt).sort((a, b) => a.companyName.localeCompare(b.companyName));
          $('#acc-pending-list', root).innerHTML = pend.length ? `<div class="table-wrap"><table><thead><tr><th>Persona</th><th>Empresa</th><th>Tipo</th><th></th></tr></thead><tbody>${pend.map(p => `<tr><td>${esc(p.name)} <small class="muted">${p.person === 'titular' ? '' : '(acompañante)'}</small></td><td>${esc(p.companyName)}${p.table ? ' · Mesa ' + esc(p.table) : ''}</td><td>${p.type === 'vendedor' ? 'Vendedor' : 'Comprador'}</td><td><button class="btn btn-small" data-show="${esc(p.code)}">Ver</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Todos acreditados.</p>';
          $$('[data-show]', root).forEach(b => b.onclick = () => { const p = list.find(x => x.code === b.getAttribute('data-show')); showResults([p]); window.scrollTo({ top: 0, behavior: 'smooth' }); });
        };
        const showResults = res => {
          $('#acc-results', root).innerHTML = res.length ? res.map(card).join('') : '<p class="muted">Sin resultados.</p>';
          $$('[data-check], [data-undo]', root).forEach(b => b.onclick = async () => {
            const code = b.getAttribute('data-check') || b.getAttribute('data-undo'); b.disabled = true;
            try {
              const r = await DB.staffCheckin(id, code, !!b.getAttribute('data-undo'));
              const i = list.findIndex(x => x.code === code); if (i >= 0) list[i] = Object.assign(list[i], r); else list.push(r);
              showResults([r]); updateCounts();
              msg(r.checkedAt ? `✓ ${r.name} acreditado. Entrega la credencial.` : 'Acreditación deshecha.');
              $('#acc-q', root).value = ''; $('#acc-q', root).focus();
            } catch (err) { b.disabled = false; msg(adminErr(err), true); }
          });
        };
        const search = async q => {
          q = String(q || '').trim(); if (!q) return;
          try { const res = await DB.staffSearch(id, q); showResults(res); msg(res.length ? '' : 'No se encontró a nadie con ese nombre o código.', !res.length); }
          catch (err) { msg(adminErr(err), true); }
        };
        $('#f-acc', root).onsubmit = e => { e.preventDefault(); search($('#acc-q', root).value); };
        const sel = $('#acc-ev', root); if (sel) sel.onchange = () => go('#/acreditacion/' + enc(sel.value));
        // escáner de QR con la cámara
        let stream = null, raf = null;
        const stop = () => { if (raf) cancelAnimationFrame(raf); raf = null; if (stream) stream.getTracks().forEach(tk => tk.stop()); stream = null; $('#scan-box', root).hidden = true; };
        cleanup = stop;
        $('#btn-scan-stop', root).onclick = stop;
        $('#btn-scan', root).onclick = async () => {
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          } catch (e) { return msg('No se pudo abrir la cámara. Revisa los permisos del navegador o escribe el código.', true); }
          const v = $('#scan-video', root); v.srcObject = stream; await v.play(); $('#scan-box', root).hidden = false;
          let detector = null;
          if ('BarcodeDetector' in window) { try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch (e) { detector = null; } }
          if (!detector) { try { await loadScriptOnce(JSQR_LIB); } catch (e) { stop(); return msg('No se pudo cargar el lector de QR. Escribe el código o el nombre.', true); } }
          const canvas = document.createElement('canvas'); const ctx2 = canvas.getContext('2d', { willReadFrequently: true });
          const found = text => { stop(); $('#acc-q', root).value = text; search(text); };
          const loop = async () => {
            if (!stream) return;
            try {
              if (detector) { const codes = await detector.detect(v); if (codes.length) return found(codes[0].rawValue); }
              else if (v.videoWidth) {
                canvas.width = v.videoWidth; canvas.height = v.videoHeight; ctx2.drawImage(v, 0, 0);
                const img = ctx2.getImageData(0, 0, canvas.width, canvas.height); const r = window.jsQR(img.data, img.width, img.height);
                if (r && r.data) return found(r.data);
              }
            } catch (e) { }
            raf = requestAnimationFrame(loop);
          };
          loop();
        };
        drawPending();
      }
    };
  }

  // ---------- administración ----------
  const PROVIDER_LABEL = { vdo: 'VDO.Ninja (dentro de la plataforma, gratis)', jitsi: 'Jitsi propio (dentro de la plataforma, servidor de TI)', meet: 'Google Meet (se abre en otra ventana)' };
  function eventFormFields(ev, lockRegion) {
    ev = ev || {};
    const regionOpts = ORG_OPTIONS.map(k => `<option value="${k}"${ev.regionId === k ? ' selected' : ''}>${k === 'central' ? 'Nivel Central (rueda nacional)' : REGIONES[k]}</option>`).join('');
    const fmt = ev.format || 'online';
    return `
      <label>Nombre del evento *<input name="name" maxlength="150" value="${esc(ev.name)}" placeholder="Rueda de Negocios Mercado Nacional 2027"></label>
      <div class="two">
        <label>Formato *<select name="format"><option value="online"${fmt === 'online' ? ' selected' : ''}>Online (salas de video)</option><option value="presencial"${fmt === 'presencial' ? ' selected' : ''}>Presencial (mesas y acreditación)</option></select></label>
        <label>Organizador *<select name="regionId"${lockRegion ? ' disabled' : ''}>${regionOpts}</select></label>
      </div>
      <div class="two">
        <label>Mercado *<input name="market" list="markets" maxlength="60" value="${esc(ev.market)}"><datalist id="markets">${MARKETS.map(m => `<option value="${m}">`).join('')}</datalist></label>
        <label>Mínimo de reuniones por empresa<input name="minMeetings" type="number" min="0" max="50" value="${esc(ev.minMeetings === undefined || ev.minMeetings === '' ? 10 : ev.minMeetings)}"></label>
      </div>
      <label>Descripción (se muestra en la página pública)<textarea name="description" rows="3" maxlength="1500">${esc(ev.description)}</textarea></label>
      <div class="two">
        <label>Inicio de inscripciones<input name="regStart" type="date" value="${esc(ev.regStart)}"></label>
        <label>Cierre de inscripciones<input name="regEnd" type="date" value="${esc(ev.regEnd)}"></label>
      </div>
      <label>Fechas de reuniones (texto)<input name="meetingDates" maxlength="120" value="${esc(ev.meetingDates)}" placeholder="2 al 4 de marzo de 2027"></label>
      <div data-fmt="presencial"><label>Lugar del evento<input name="venue" maxlength="200" value="${esc(ev.venue)}" placeholder="Centro de eventos, dirección"></label></div>
      <div data-fmt="online">
        <div class="two">
          <label>Salas de video<select name="videoProvider">${Object.keys(PROVIDER_LABEL).map(k => `<option value="${k}"${(ev.videoProvider || 'vdo') === k ? ' selected' : ''}>${PROVIDER_LABEL[k]}</option>`).join('')}</select></label>
          <label data-prov="jitsi">Dominio del servidor Jitsi<input name="jitsiDomain" maxlength="120" value="${esc(ev.jitsiDomain)}" placeholder="video.sernatur.cl"></label>
        </div>
        <label>Transmisión de bienvenida (link https de YouTube, PeerTube, Owncast o VDO.Ninja/Meshcast)<input name="welcomeUrl" maxlength="500" value="${esc(ev.welcomeUrl)}" placeholder="https://www.youtube.com/watch?v=…"></label>
      </div>
      <label>Foto de portada (opcional, ruta del archivo)<input name="coverPhoto" maxlength="300" value="${esc(ev.coverPhoto)}" placeholder="fotos/valparaiso/portada-2.jpg"></label>
      <label>Fase<select name="phase">${PHASES.map(p => `<option value="${p}"${(ev.phase || 'borrador') === p ? ' selected' : ''}>${PHASE_ADMIN[p]}</option>`).join('')}</select></label>`;
  }
  function bindEventForm(form) {
    const apply = () => {
      const f = form.elements.format.value, p = form.elements.videoProvider ? form.elements.videoProvider.value : '';
      $$('[data-fmt]', form).forEach(el => { el.hidden = el.getAttribute('data-fmt') !== f; });
      $$('[data-prov]', form).forEach(el => { el.hidden = el.getAttribute('data-prov') !== p; });
    };
    form.elements.format.addEventListener('change', apply); if (form.elements.videoProvider) form.elements.videoProvider.addEventListener('change', apply); apply();
  }
  const EVENT_KEYS = ['name', 'market', 'regionId', 'description', 'regStart', 'regEnd', 'meetingDates', 'coverPhoto', 'phase', 'format', 'minMeetings', 'venue', 'videoProvider', 'jitsiDomain', 'welcomeUrl'];
  function readEventForm(form, fixedRegion) {
    const d = {};
    EVENT_KEYS.forEach(k => { d[k] = val(form, k); });
    d.regionId = fixedRegion || d.regionId; d.phase = d.phase || 'borrador';
    if (!d.name || !d.market || !d.regionId) return { error: 'Completa nombre, mercado y organizador.' };
    if (d.regStart && d.regEnd && d.regEnd < d.regStart) return { error: 'El cierre de inscripciones es anterior al inicio.' };
    return { data: d };
  }
  function alertBox(root, msg) { const d = document.createElement('div'); d.className = 'flash error'; d.textContent = msg; root.prepend(d); }
  function orgName(id) { return id === 'central' ? 'Nivel Central' : (REGIONES[id] || id); }

  async function viewAdmin() {
    if (!S.user) return needLogin();
    if (!isAnyAdmin()) return denied();
    const region = S.isSuper ? null : S.admin.regionId;
    const [events, admins] = await Promise.all([DB.listEventsForAdmin(region), S.isSuper ? DB.listAdmins() : Promise.resolve([])]);
    const order = p => ({ reuniones: 0, agenda: 1, inscripcion: 2, borrador: 3, cerrado: 4 }[p] || 5);
    events.sort((a, b) => order(a.phase) - order(b.phase) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const evCards = events.map(ev => `<a class="adm-ev card" href="#/admin/evento/${enc(ev.id)}">
        <div class="row-between"><span>${fmtBadge(ev.format)} <span class="badge ph-${esc(ev.phase)}">${esc((PHASE_ADMIN[ev.phase] || ev.phase).split(' (')[0])}</span></span><span class="small muted">${esc(orgName(ev.regionId))}</span></div>
        <h3>${esc(ev.name)}</h3><p class="small muted">${t('market')}: ${esc(ev.market)}${ev.meetingDates ? ' · ' + esc(ev.meetingDates) : ''}${ev.venue && ev.format === 'presencial' ? ' · ' + esc(ev.venue) : ''}</p>
        <span class="more">Gestionar →</span></a>`).join('');
    const adminsBlock = S.isSuper ? `<section class="card">
      <h2>Administradores (regiones y Nivel Central)</h2>
      <p class="small muted">Cada administrador gestiona solo los eventos de su organizador. Luego crea su cuenta en "Ingresar" con este mismo correo.</p>
      <div class="table-wrap"><table><thead><tr><th>Correo</th><th>Nombre</th><th>Organizador</th><th></th></tr></thead><tbody>
      ${admins.map(a => `<tr><td>${esc(a.email)}</td><td>${esc(a.name)}</td><td>${esc(orgName(a.regionId))}</td><td><button class="btn btn-small btn-danger" data-rm="${esc(a.email)}">Quitar</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin administradores.</td></tr>'}
      </tbody></table></div>
      <form id="f-admin" class="inline-form" novalidate>
        <input name="email" type="email" placeholder="correo@sernatur.cl" aria-label="Correo">
        <input name="name" placeholder="Nombre" aria-label="Nombre">
        <select name="regionId" aria-label="Organizador">${ORG_OPTIONS.map(k => `<option value="${k}">${esc(orgName(k))}</option>`).join('')}</select>
        <button class="btn" type="submit">Agregar</button><div class="form-msg"></div>
      </form></section>` : '';
    return {
      html: page(pageHead(S.isSuper ? 'Superadministrador · todos los organizadores' : esc(orgName(region)), 'Administración') + `
      <section class="card"><div class="row-between"><h2>Eventos</h2><span class="small muted">${events.length} evento(s)</span></div>
        <div class="grid adm-grid">${evCards || '<p class="muted">Aún no hay eventos.</p>'}</div>
        <details class="new-event"><summary class="btn btn-primary">+ Crear evento</summary>
          <form id="f-event" novalidate>${eventFormFields({ regionId: region || CFG.homeRegion || 'valparaiso', phase: 'borrador', format: 'online', minMeetings: 10 }, !!region)}
          <div class="form-msg"></div><button class="btn btn-primary" type="submit">Crear evento</button></form>
        </details>
      </section>${adminsBlock}`),
      bind(root) {
        const fe = $('#f-event', root); bindEventForm(fe);
        fe.onsubmit = async e => {
          e.preventDefault();
          const r = readEventForm(fe, region); if (r.error) return showError(fe, r.error);
          try { const id = await DB.createEvent(r.data); S.flash = { type: 'ok', msg: 'Evento creado. Configura la grilla en la pestaña Configuración.' }; go('#/admin/evento/' + enc(id)); }
          catch (err) { showError(fe, adminErr(err)); }
        };
        const fa = $('#f-admin', root);
        if (fa) fa.onsubmit = async e => {
          e.preventDefault();
          const email = val(fa, 'email').toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showError(fa, 'Correo no válido.');
          try { await DB.setAdmin(email, { name: val(fa, 'name'), regionId: val(fa, 'regionId') }); S.flash = { type: 'ok', msg: 'Administrador agregado.' }; render(); }
          catch (err) { showError(fa, adminErr(err)); }
        };
        $$('[data-rm]', root).forEach(b => b.onclick = async () => {
          b.disabled = true;
          try { await DB.removeAdmin(b.getAttribute('data-rm')); S.flash = { type: 'ok', msg: 'Administrador quitado.' }; render(); }
          catch (err) { b.disabled = false; alertBox(root, adminErr(err)); }
        });
      }
    };
  }

  // Evita que Excel interprete celdas como fórmulas (=, +, -, @)
  function csvCell(v) {
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function downloadCsv(name, rows) {
    const text = '﻿' + rows.map(r => r.map(csvCell).join(';')).join('\r\n');
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function toM(x) { const p = String(x || '').split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); }
  function countSlots(start, end, slot, gap, breaks) {
    let n = 0, m = toM(start); const e = toM(end); slot = Number(slot) || 0; gap = Number(gap) || 0;
    if (slot <= 0) return 0;
    while (m + slot <= e) { const br = (breaks || []).find(b => m < toM(b.end) && m + slot > toM(b.start)); if (br) { m = toM(br.end); continue; } n++; m += slot + gap; }
    return n;
  }

  async function viewAdminEvent(id) {
    if (!S.user) return needLogin();
    const ev = await DB.getEvent(id);
    if (!ev) return notFound();
    if (!isAdminOf(ev.regionId)) return denied();
    const online = (ev.format || 'online') === 'online';
    const [regs, contacts, meetings, sched, rooms, surveys, agendas, staff, checkins, events] = await Promise.all([
      DB.listRegistrations(id), DB.listContacts(id), DB.listMeetings(id), DB.getSchedule(id), online ? DB.listRooms(id) : Promise.resolve([]),
      DB.listSurveys(id), DB.getAgendas(id), DB.listStaff(id), DB.listCheckins(id), DB.listEventsForAdmin(S.isSuper ? null : S.admin.regionId)]);
    const cmap = {}; contacts.forEach(c => { cmap[c.uid] = c; });
    const rmap = {}; regs.forEach(r => { rmap[r.uid] = r; });
    const slotMap = {}; sched.slots.forEach(s => { slotMap[s.id] = s; });
    const count = (type, st) => regs.filter(r => (!type || r.type === type) && (!st || r.status === st)).length;
    const conf = meetings.filter(m => m.status === 'aceptada');
    const min = agendas.minMeetings;
    const under = agendas.participants.filter(p => p.meetings.length < min);
    const accDone = checkins.filter(x => x.checkedAt).length;
    const base = location.href.split('#')[0];
    const eid = enc(id);
    const tab = S.adminTab[id] || 'resumen';
    const TABS = [['resumen', 'Resumen'], ['inscripciones', 'Inscripciones'], ['agendas', 'Agendas'], ['acreditacion', 'Acreditación'], ['monitor', 'Monitor en vivo']]
      .concat(online ? [['salas', 'Salas de video']] : []).concat([['resultados', 'Resultados'], ['config', 'Configuración']]);
    const sc = ev.schedule || { days: [], start: '09:00', end: '13:00', slot: 20, gap: 0, breaks: [{ start: '11:00', end: '11:20', label: 'Café' }] };
    const linkRow = (type, label) => `<div class="link-row"><span class="role-dot">${ICON[type]}</span><div class="link-col"><strong>${label}</strong>
        <div class="copy-row"><input readonly value="${esc(base + '#/evento/' + eid + '/' + type + 'es')}" aria-label="${label}"><button class="btn btn-small" data-copy>Copiar</button></div></div></div>`;
    // --- pestañas
    const sResumen = `
      <div class="stats">
        <div class="stat"><span>${count('vendedor', 'aprobada')}/${count('vendedor')}</span>vendedores aprobados</div>
        <div class="stat"><span>${count('comprador', 'aprobada')}/${count('comprador')}</span>compradores aprobados</div>
        <div class="stat stat-warn"><span>${count(null, 'pendiente')}</span>inscripciones por revisar</div>
        <div class="stat stat-ok"><span>${conf.length}</span>reuniones confirmadas</div>
        <div class="stat ${under.length ? 'stat-warn' : 'stat-ok'}"><span>${under.length}</span>empresas bajo el mínimo (${min})</div>
        <div class="stat"><span>${accDone}/${checkins.length}</span>${online ? 'ingresos registrados' : 'personas acreditadas'}</div>
      </div>
      <section class="card"><h2>Fase del evento</h2>
        <form id="f-phase" class="inline-form" novalidate><select name="phase">${PHASES.map(p => `<option value="${p}"${ev.phase === p ? ' selected' : ''}>${PHASE_ADMIN[p]}</option>`).join('')}</select><button class="btn btn-primary" type="submit">Cambiar fase</button><div class="form-msg"></div></form>
      </section>
      <section class="card"><h2>Links de convocatoria</h2>
        <p class="small muted">Un link para cada público. ${ev.phase === 'inscripcion' ? '' : '<strong>Ojo:</strong> las inscripciones solo funcionan con la fase "Inscripciones abiertas".'}</p>
        ${linkRow('vendedor', 'Vendedores')}${linkRow('comprador', 'Compradores')}
        <p class="small"><a href="#/evento/${eid}">Ver página pública →</a> · <a href="#/evento/${eid}/catalogo">Ver catálogo →</a></p>
      </section>`;
    const sInscripciones = `<section class="card"><h2>Inscripciones</h2>
        <div class="filters">
          <select id="flt-st" aria-label="Estado"><option value="">Todos los estados</option><option value="pendiente" selected>Pendientes</option><option value="aprobada">Aprobadas</option><option value="rechazada">Rechazadas</option></select>
          <select id="flt-type" aria-label="Tipo"><option value="">Vendedores y compradores</option><option value="vendedor">Vendedores</option><option value="comprador">Compradores</option></select>
          <input id="flt-q" type="search" placeholder="Buscar empresa, destino, correo…" aria-label="Buscar">
          <button class="btn" id="btn-csv">Descargar Excel (CSV)</button>
        </div>
        <div class="table-wrap"><table class="regs"><thead><tr><th>Empresa</th><th>Tipo</th><th>Detalle</th><th>Contacto</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="regs-body"></tbody></table></div>
      </section>`;
    const sAgendas = `<section class="card"><div class="row-between"><h2>Agendas individuales</h2><span class="small muted">Mínimo por empresa: <strong>${min}</strong> reuniones</span></div>
        <div class="actions">
          <button class="btn btn-primary" id="btn-suggest">✨ Sugerir reuniones para llegar al mínimo</button>
          <button class="btn" id="btn-print-all">🖨 Imprimir todas las agendas (PDF)</button>
          ${online ? '' : '<button class="btn" id="btn-tables">Asignar mesas automáticamente</button>'}
        </div>
        <div id="suggest-box"></div>
        <div class="filters"><select id="ag-type" aria-label="Tipo"><option value="">Todos</option><option value="vendedor">Vendedores</option><option value="comprador">Compradores</option></select>
          <label class="check inline-check"><input type="checkbox" id="ag-under"> Solo bajo el mínimo</label>
          <input id="ag-q" type="search" placeholder="Buscar empresa…" aria-label="Buscar"></div>
        <div class="table-wrap"><table class="agendas"><thead><tr><th>Empresa</th><th>Tipo</th>${online ? '' : '<th>Mesa</th>'}<th>Reuniones</th>${online ? '<th>Ingreso</th>' : '<th>Acreditada</th>'}<th></th></tr></thead><tbody id="ag-body"></tbody></table></div>
        <p class="small muted">Puedes asignar reuniones también el mismo día: el horario debe estar libre para ambas empresas. Quedan confirmadas y ambas reciben aviso por correo.</p>
      </section>`;
    const sAcred = `<section class="card"><h2>${online ? 'Ingreso al evento (online)' : 'Acreditación presencial'}</h2>
        ${online ? '<p class="small muted">En eventos online, la acreditación se registra sola cuando cada empresa entra a su agenda el día de reuniones. No hay credencial física.</p>' : `
        <p class="small muted">Las credenciales se imprimen antes del evento y se entregan cuando el acreditador confirma la llegada (escaneando el QR o buscando por nombre). La acreditación es obligatoria para marcar reuniones como realizadas.</p>
        <div class="actions"><button class="btn btn-primary" id="btn-badges">🖨 Imprimir credenciales (PDF)</button><a class="btn" href="#/acreditacion/${eid}">Abrir pantalla de recepción →</a></div>
        <h3>Acreditadores</h3>
        <div class="table-wrap"><table><tbody>${staff.map(s => `<tr><td>${esc(s.email)}</td><td>${esc(s.name)}</td><td><button class="btn btn-small btn-danger" data-rmstaff="${esc(s.email)}">Quitar</button></td></tr>`).join('') || '<tr><td class="muted">Sin acreditadores. Agrega el correo de quienes estarán en recepción.</td></tr>'}</tbody></table></div>
        <form id="f-staff" class="inline-form" novalidate><input name="email" type="email" placeholder="correo del acreditador" aria-label="Correo"><input name="name" placeholder="Nombre" aria-label="Nombre"><button class="btn" type="submit">Agregar acreditador</button><div class="form-msg"></div></form>
        <p class="small muted">El acreditador crea su cuenta en "Ingresar" con ese correo y solo ve la pantalla de recepción.</p>`}
        <h3>${accDone} de ${checkins.length} personas ${online ? 'ingresaron' : 'acreditadas'}</h3>
        <div class="table-wrap"><table><thead><tr><th>Persona</th><th>Empresa</th><th>Tipo</th><th>Estado</th>${online ? '' : '<th></th>'}</tr></thead><tbody>
        ${checkins.slice().sort((a, b) => a.companyName.localeCompare(b.companyName)).map(p => `<tr><td>${esc(p.name)} <small class="muted">${p.person === 'titular' ? '' : '(acompañante)'}</small></td><td>${esc(p.companyName)}${p.table ? ' · Mesa ' + esc(p.table) : ''}</td><td>${p.type === 'vendedor' ? 'Vendedor' : 'Comprador'}</td>
          <td>${p.checkedAt ? `<span class="badge st-aprobada">✓ ${esc(new Date(p.checkedAt).toLocaleString('es-CL', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }))}</span>` : '<span class="badge st-pendiente">Pendiente</span>'}</td>
          ${online ? '' : `<td><button class="btn btn-small" data-acc="${esc(p.code)}" data-undo="${p.checkedAt ? 1 : ''}">${p.checkedAt ? 'Deshacer' : 'Acreditar'}</button></td>`}</tr>`).join('') || '<tr><td colspan="5" class="muted">Sin empresas aprobadas.</td></tr>'}
        </tbody></table></div></section>`;
    const sMonitor = `<section class="card"><div class="row-between"><h2>Monitor en vivo</h2><span class="small muted" id="mon-time"></span></div>
        <p class="small muted">Se actualiza cada 20 segundos. ${online ? 'Una sala está "conectada" cuando la empresa tiene abierta la página de la reunión.' : 'Muestra las mesas, la acreditación y lo que marcan los vendedores.'}</p>
        <div id="mon-body"><p class="muted">Cargando…</p></div></section>`;
    const evProv = ev.videoProvider || 'vdo';
    const roomsMissing = rooms.filter(r => !r.url || (r.provider !== evProv && r.provider !== 'manual')).length;
    const sSalas = online ? `<section class="card"><h2>Salas de video</h2>
        <p class="small">Proveedor del evento: <strong>${esc(PROVIDER_LABEL[ev.videoProvider || 'vdo'])}</strong> (se cambia en Configuración).</p>
        <p class="small muted">Se crea una sala fija por vendedor aprobado. ${(ev.videoProvider || 'vdo') === 'meet' ? 'Con Meet se crean en tu Google Calendar y los compradores quedan invitados.' : 'Las salas se abren dentro de la plataforma, con el panel de control de la reunión.'}</p>
        <div class="actions">
          <button class="btn btn-primary" id="btn-rooms"${roomsMissing ? '' : ' disabled'}>${roomsMissing ? (rooms.some(r => r.url && r.provider !== evProv && r.provider !== 'manual') ? `Cambiar salas a ${esc(PROVIDER_LABEL[evProv].split(' (')[0])} (${roomsMissing})` : `Crear salas (${roomsMissing} pendientes)`) : 'Todas las salas creadas ✓'}</button>
          ${(ev.videoProvider || 'vdo') === 'meet' ? '<button class="btn" id="btn-sync">Actualizar invitados</button>' : ''}
        </div>
        <p class="small muted">Para usar un link propio, pégalo en "Cambiar link" y presiona Guardar. Los links de VDO.Ninja${ev.jitsiDomain ? ' y de ' + esc(ev.jitsiDomain) : ''} se abren dentro de la plataforma; los demás (Meet, Zoom, Teams) en otra ventana.</p>
        <div class="form-msg" id="rooms-msg"></div>
        ${rooms.length ? `<div class="table-wrap"><table><thead><tr><th>Vendedor</th><th>Sala</th><th>Cambiar link</th></tr></thead><tbody>${rooms.map(r => `<tr>
          <td><strong>${esc(r.companyName)}</strong></td>
          <td>${r.url ? `<span class="small">${esc({ vdo: 'VDO.Ninja', jitsi: 'Jitsi', meet: 'Meet', manual: 'Link manual' }[r.provider] || r.provider)}</span><br><small class="muted">${esc(r.url.replace(/^https:\/\//, '').slice(0, 48))}…</small>` : '<span class="muted">Sin sala</span>'}</td>
          <td><div class="copy-row"><input placeholder="https://…" aria-label="Link de sala" data-room-input="${esc(r.sellerUid)}" value="${esc(r.url)}"><button class="btn btn-small" data-room-save="${esc(r.sellerUid)}">Guardar</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aún no hay vendedores aprobados.</p>'}
      </section>` : '';
    const sv = {}; surveys.forEach(x => { (sv[x.meetingId] = sv[x.meetingId] || {})[x.role] = x; });
    const heldCount = conf.filter(m => m.held === 'si' || m.buyerHeld === 'si' || (sv[m.id] && Object.values(sv[m.id]).some(x => x.held === 'si'))).length;
    const noShow = conf.filter(m => m.liveStatus === 'no_show' || m.held === 'no').length;
    const sumRole = role => surveys.filter(x => x.role === role).reduce((a, x) => a + (Number(x.amount) || 0), 0);
    const outc = o => surveys.filter(x => x.outcome === o).length;
    const ints = surveys.filter(x => Number(x.interest)); const avgInt = ints.length ? (ints.reduce((a, x) => a + Number(x.interest), 0) / ints.length).toFixed(1) : '—';
    const usd = n => 'US$ ' + Math.round(n).toLocaleString('es-CL');
    const mStatus = m => ({ pendiente: 'Pendiente', aceptada: 'Confirmada', rechazada: 'Rechazada', cancelada: m.cancelledBy === 'admin' ? 'Anulada por admin' : 'Cancelada', vencida: 'Vencida', anulada: m.cancelledBy === 'grilla' ? 'Anulada (horario eliminado)' : 'Anulada' }[m.status] || m.status);
    const sResultados = `<section class="card"><h2>Resultados</h2>
        <div class="stats">
          <div class="stat"><span>${conf.length}</span>reuniones confirmadas</div>
          <div class="stat stat-ok"><span>${heldCount}</span>realizadas</div>
          <div class="stat stat-warn"><span>${noShow}</span>no realizadas / inasistencias</div>
          <div class="stat"><span>${surveys.length}</span>evaluaciones</div>
          <div class="stat stat-ok"><span>${usd(sumRole('vendedor'))}</span>expectativa (vendedores)</div>
          <div class="stat"><span>${usd(sumRole('comprador'))}</span>expectativa (compradores)</div>
        </div>
        <p class="small">Resultados: <strong>${outc('negocio')}</strong> negocios concretados · <strong>${outc('seguimiento')}</strong> con seguimiento · <strong>${outc('sin_interes')}</strong> sin interés · interés promedio <strong>${avgInt}</strong>/5</p>
        <div class="actions"><button class="btn" id="btn-csv-r"${conf.length ? '' : ' disabled'}>Reporte de resultados (CSV)</button><button class="btn" id="btn-csv-m"${meetings.length ? '' : ' disabled'}>Todas las reuniones (CSV)</button></div>
      </section>
      <section class="card"><h2>Reuniones</h2>
        ${meetings.length ? `<div class="table-wrap"><table><thead><tr><th>Bloque (Chile)</th><th>Vendedor</th><th>Comprador</th><th>Origen</th><th>Estado</th><th>Marcada</th><th></th></tr></thead><tbody>${meetings.slice().sort((a, b) => a.slot.localeCompare(b.slot)).map(m => `<tr><td>${esc(m.slot)}</td><td>${esc((rmap[m.sellerUid] || {}).companyName)}</td><td>${esc((rmap[m.buyerUid] || {}).companyName)}</td>
          <td>${m.assignedBy ? 'Asignada por admin' : ((rmap[m.requesterUid] || {}).type === 'vendedor' ? 'Solicitó vendedor' : 'Solicitó comprador')}</td>
          <td><span class="badge mt-${esc(m.status)}">${esc(mStatus(m))}</span></td><td>${esc(liveLabel(m.liveStatus) || (m.held === 'si' ? 'Realizada' : m.held === 'no' ? 'No realizada' : ''))}</td>
          <td>${['pendiente', 'aceptada'].includes(m.status) ? `<button class="btn btn-small btn-danger" data-mcancel="${esc(m.id)}">Anular</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aún no hay reuniones.</p>'}
      </section>`;
    const sConfig = `<section class="card"><h2>Datos del evento</h2>
        <form id="f-ev" novalidate>${eventFormFields(ev, !S.isSuper)}<div class="form-msg"></div><button class="btn btn-primary" type="submit">Guardar evento</button></form>
      </section>
      <section class="card"><h2>Grilla de reuniones (hora de Chile)</h2>
        <p class="small muted">Define los días, el horario de la jornada y los breaks. Todos los participantes usan los mismos bloques.</p>
        <form id="f-sched" novalidate>
          <div class="label">Días de reuniones</div>
          <div class="day-chips" id="day-chips"></div>
          <div class="inline-form"><input type="date" id="day-new" aria-label="Agregar día"><button class="btn btn-small" type="button" id="day-add">+ Agregar día</button></div>
          <div class="four">
            <label>Inicio<input type="time" name="start" value="${esc(sc.start)}"></label>
            <label>Término<input type="time" name="end" value="${esc(sc.end)}"></label>
            <label>Minutos por reunión<input type="number" name="slot" min="5" max="120" step="5" value="${esc(sc.slot)}"></label>
            <label>Pausa entre reuniones<input type="number" name="gap" min="0" max="60" step="5" value="${esc(sc.gap)}"></label>
          </div>
          <div class="label">Breaks de la jornada</div>
          <div id="breaks"></div>
          <button class="btn btn-small" type="button" id="brk-add">+ Agregar break</button>
          <p class="small" id="sched-preview"></p>
          <div class="form-msg"></div>
          <button class="btn btn-primary" type="submit">Guardar grilla</button>
        </form>
      </section>
      <section class="card danger-zone"><h2>Eliminar evento</h2>
        <p class="small">Se borra el evento con todas sus inscripciones, contactos, reuniones y acreditaciones. No se puede deshacer.</p>
        <button class="btn btn-danger" id="btn-del">Eliminar evento…</button>
        <form id="f-del" hidden novalidate>
          <label>Para confirmar, escribe <strong>ELIMINAR</strong><input name="confirm" autocomplete="off"></label>
          <div class="form-msg"></div>
          <div class="actions"><button class="btn btn-danger" type="submit">Eliminar definitivamente</button><button class="btn btn-ghost" type="button" id="btn-del-cancel">Cancelar</button></div>
        </form>
      </section>`;
    const panels = { resumen: sResumen, inscripciones: sInscripciones, agendas: sAgendas, acreditacion: sAcred, monitor: sMonitor, salas: sSalas, resultados: sResultados, config: sConfig };
    const others = events.filter(e => e.id !== id);
    return {
      html: page(`<div class="ctxbar"><div class="ctx-main"><span class="ctx-label">Administrando</span><strong>${esc(ev.name)}</strong> ${fmtBadge(ev.format)} <span class="badge ph-${esc(ev.phase)}">${esc(phaseLabel(ev.phase))}</span> <span class="small muted">${esc(orgName(ev.regionId))}</span></div>
        <select id="ev-switch" aria-label="Cambiar de evento"><option value="">Cambiar de evento…</option>${others.map(e => `<option value="${esc(e.id)}">${esc(e.name)} · ${esc(t('fmt_' + (e.format || 'online')))}</option>`).join('')}<option value="__list">← Todos los eventos</option></select></div>
        <nav class="tabs" role="tablist">${TABS.map(([k, l]) => `<button class="tab${k === tab ? ' on' : ''}" role="tab" data-tab="${k}" aria-selected="${k === tab}">${l}${k === 'inscripciones' && count(null, 'pendiente') ? ` <span class="count">${count(null, 'pendiente')}</span>` : ''}${k === 'agendas' && under.length ? ` <span class="count warn">${under.length}</span>` : ''}</button>`).join('')}</nav>
        ${TABS.map(([k]) => `<div class="tab-panel" data-panel="${k}"${k === tab ? '' : ' hidden'}>${panels[k]}</div>`).join('')}`),
      bind(root) {
        // navegación
        const sw = $('#ev-switch', root); sw.onchange = () => { if (sw.value === '__list') go('#/admin'); else if (sw.value) go('#/admin/evento/' + enc(sw.value)); };
        let monTimer = null;
        const showTab = k => {
          S.adminTab[id] = k;
          $$('.tab', root).forEach(b => { const on = b.getAttribute('data-tab') === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
          $$('.tab-panel', root).forEach(p => { p.hidden = p.getAttribute('data-panel') !== k; });
          if (monTimer) { clearInterval(monTimer); monTimer = null; }
          if (k === 'monitor') { loadMonitor(); monTimer = setInterval(loadMonitor, 20000); }
        };
        cleanup = () => { if (monTimer) clearInterval(monTimer); };
        $$('.tab', root).forEach(b => b.onclick = () => showTab(b.getAttribute('data-tab')));
        const undoToast = prev => ({ msg: 'Cambios guardados.', undo: () => DB.updateEvent(id, prev, true) });
        const pickPrev = keys => { const o = {}; keys.forEach(k => { o[k] = ev[k] === undefined ? '' : ev[k]; }); return o; };

        // resumen: fase con deshacer
        $('#f-phase', root).onsubmit = async e => {
          e.preventDefault(); const f = e.target; const ph = val(f, 'phase');
          if (ph === ev.phase) return;
          try { await DB.updateEvent(id, { phase: ph }); S.toast = undoToast({ phase: ev.phase }); render(); }
          catch (err) { showError(f, adminErr(err)); }
        };
        $$('[data-copy]', root).forEach(b => b.onclick = async () => {
          const inp = b.previousElementSibling; inp.select();
          try { await navigator.clipboard.writeText(inp.value); } catch (e) { try { document.execCommand('copy'); } catch (x) { } }
          b.textContent = 'Copiado ✓';
        });

        // inscripciones
        const body = $('#regs-body', root);
        const drawRegs = () => {
          const st = $('#flt-st', root).value, ty = $('#flt-type', root).value, q = $('#flt-q', root).value.toLowerCase().trim();
          const list = regs.filter(r => (!st || r.status === st) && (!ty || r.type === ty))
            .filter(r => { const c = cmap[r.uid] || {}; return !q || [r.companyName, r.destination, r.targetMarket, r.products, c.email, c.contactName, r.sernaturRegistry].join(' ').toLowerCase().includes(q); })
            .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
          body.innerHTML = list.length ? list.map(r => {
            const c = cmap[r.uid] || {};
            const detail = r.type === 'vendedor'
              ? `${(r.serviceTypes || []).map(k => esc(I.services[k] ? I.services[k][0] : k)).join(', ')}<br><small>Destino: ${esc(r.destination)} · Regiones: ${esc((r.regions || []).map(k => REGIONES[k]).join(', ') || '—')} · Reg. SERNATUR: ${esc(r.sernaturRegistry || '—')}</small><details><summary>Productos</summary><p class="pre small">${esc(r.products)}</p></details>`
              : `<small>Mercado objetivo:</small> ${esc(r.targetMarket)}`;
            const comps = (c.companions || []).map(x => esc(x.name + (x.email ? ' <' + x.email + '>' : ''))).join('<br>');
            return `<tr>
              <td><div class="row-start">${logoHtml(r, 'avatar-sm')}<strong>${esc(r.companyName)}</strong></div>${r.website ? `<small>${esc(r.website)}</small><br>` : ''}<small class="muted">Inscrito: ${fmtDate(r.createdAt)}</small></td>
              <td>${r.type === 'vendedor' ? 'Vendedor' : 'Comprador'}</td><td>${detail}</td>
              <td>${esc(c.contactName)}<br><small>${esc(c.email)}<br>${esc(c.phone)}</small>${comps ? `<br><small class="muted">Acompañante: ${comps}</small>` : ''}<br><small class="muted">${esc((r.lang || '').toUpperCase())} · ${esc(r.tz || '')}</small></td>
              <td>${statusBadge(r.status, true)}</td>
              <td class="acts">
                ${r.status !== 'aprobada' ? `<button class="btn btn-small btn-ok" data-st="aprobada" data-uid="${esc(r.uid)}">Aprobar</button>` : ''}
                ${r.status !== 'rechazada' ? `<button class="btn btn-small btn-danger" data-st="rechazada" data-uid="${esc(r.uid)}">Rechazar</button>` : ''}
                ${r.status !== 'pendiente' ? `<button class="btn btn-small btn-ghost" data-st="pendiente" data-uid="${esc(r.uid)}">Volver a pendiente</button>` : ''}
              </td></tr>`;
          }).join('') : '<tr><td colspan="6" class="muted">No hay inscripciones con estos filtros.</td></tr>';
          $$('[data-st]', body).forEach(b => b.onclick = async () => {
            $$('[data-st]', body).forEach(x => { x.disabled = true; });
            try { const uid = b.getAttribute('data-uid'), st = b.getAttribute('data-st'); await DB.setRegistrationStatus(id, uid, st); regs.find(x => x.uid === uid).status = st; }
            catch (err) { alertBox(root, adminErr(err)); }
            drawRegs();
          });
        };
        $('#flt-st', root).onchange = drawRegs; $('#flt-type', root).onchange = drawRegs; $('#flt-q', root).oninput = drawRegs;
        drawRegs();
        $('#btn-csv', root).onclick = () => {
          const head = ['Empresa', 'Tipo', 'Estado', 'Tipos de servicio', 'Destino', 'Regiones', 'Productos', 'Registro SERNATUR', 'Mercado objetivo', 'Descripción', 'Sitio web', 'Contacto', 'Correo', 'Teléfono', 'Acompañante', 'Mesa', 'Idioma', 'Zona horaria', 'Fecha inscripción'];
          const rows = regs.map(r => { const c = cmap[r.uid] || {}; return [r.companyName, r.type, r.status, (r.serviceTypes || []).map(k => I.services[k] ? I.services[k][0] : k).join(', '), r.destination, (r.regions || []).map(k => REGIONES[k]).join(', '), r.products, r.sernaturRegistry, r.targetMarket, r.description, r.website, c.contactName, c.email, c.phone, (c.companions || []).map(x => x.name + (x.email ? ' (' + x.email + ')' : '')).join(' / '), r.table || '', r.lang, r.tz, fmtDate(r.createdAt)]; });
          downloadCsv('inscripciones-' + id + '.csv', [head].concat(rows));
        };

        // agendas
        const P = agendas.participants;
        const pmap = {}; P.forEach(p => { pmap[p.uid] = p; });
        const busyOf = p => { const b = {}; p.meetings.forEach(m => { b[m.slot] = m; }); p.blocks.forEach(s => { if (!b[s]) b[s] = 'blocked'; }); return b; };
        const paired = (a, b) => meetings.some(m => ['pendiente', 'aceptada'].includes(m.status) && ((m.sellerUid === a && m.buyerUid === b) || (m.sellerUid === b && m.buyerUid === a)));
        const agBody = $('#ag-body', root);
        const drawAg = () => {
          const ty = $('#ag-type', root).value, uo = $('#ag-under', root).checked, q = $('#ag-q', root).value.toLowerCase().trim();
          const list = P.filter(p => (!ty || p.type === ty) && (!uo || p.meetings.length < min) && (!q || p.companyName.toLowerCase().includes(q)))
            .sort((a, b) => a.type.localeCompare(b.type) || (Number(a.table) || 999) - (Number(b.table) || 999) || a.companyName.localeCompare(b.companyName));
          agBody.innerHTML = list.map(p => `<tr data-row="${esc(p.uid)}">
              <td><div class="row-start">${logoHtml(p, 'avatar-sm')}<strong>${esc(p.companyName)}</strong></div></td>
              <td>${p.type === 'vendedor' ? 'Vendedor' : 'Comprador'}</td>
              ${online ? '' : `<td>${p.type === 'vendedor' ? `<input class="table-input" data-table="${esc(p.uid)}" value="${esc(p.table)}" aria-label="Mesa" maxlength="6">` : ''}</td>`}
              <td><span class="badge ${p.meetings.length < min ? 'st-pendiente' : 'st-aprobada'}">${p.meetings.length} / ${min}</span></td>
              <td>${p.accredited ? '✓' : '—'}</td>
              <td class="acts-inline"><button class="btn btn-small" data-open="${esc(p.uid)}">Ver agenda</button><button class="btn btn-small btn-ghost" data-print="${esc(p.uid)}">🖨</button></td></tr>
            <tr class="ag-detail" data-detail="${esc(p.uid)}" hidden><td colspan="${online ? 5 : 6}"></td></tr>`).join('') || `<tr><td colspan="6" class="muted">Sin empresas aprobadas.</td></tr>`;
          $$('[data-open]', agBody).forEach(b => b.onclick = () => toggleDetail(b.getAttribute('data-open')));
          $$('[data-print]', agBody).forEach(b => b.onclick = () => printAg([pmap[b.getAttribute('data-print')]]));
          $$('[data-table]', agBody).forEach(inp => inp.onchange = async () => {
            try { await DB.setTable(id, inp.getAttribute('data-table'), inp.value.trim()); pmap[inp.getAttribute('data-table')].table = inp.value.trim(); inp.classList.add('saved'); }
            catch (err) { alertBox(root, adminErr(err)); }
          });
        };
        const toggleDetail = uid => {
          const tr = $(`[data-detail="${uid}"]`, agBody); const p = pmap[uid];
          if (!tr.hidden) { tr.hidden = true; return; }
          const busy = busyOf(p);
          const nowMs = Date.now();
          tr.firstElementChild.innerHTML = `<div class="slot-days">${groupByDay(agendas.slots).map(g => `<div class="slot-day"><h3>${esc(g.day)}</h3><div class="ag-slots">${g.slots.map(s => {
            const m = busy[s.id];
            if (m && m !== 'blocked') return `<div class="ag-slot ag-meet"><b>${esc(s.time)}</b>${esc(m.otherName)}${m.assigned ? ' <small>(asignada)</small>' : ''}${m.liveStatus ? `<small>${esc(liveLabel(m.liveStatus))}</small>` : ''}</div>`;
            if (m === 'blocked') return `<div class="ag-slot ag-blocked"><b>${esc(s.time)}</b>No disponible</div>`;
            if (Date.parse(s.end) <= nowMs) return `<div class="ag-slot ag-past"><b>${esc(s.time)}</b>—</div>`;
            return `<div class="ag-slot ag-free"><b>${esc(s.time)}</b><button class="link small" data-assign="${esc(uid)}" data-slot="${esc(s.id)}">+ Asignar</button></div>`;
          }).join('')}</div></div>`).join('')}</div><div class="assign-box"></div>`;
          tr.hidden = false;
          $$('[data-assign]', tr).forEach(b => b.onclick = () => {
            const slot = b.getAttribute('data-slot');
            const cands = P.filter(o => o.type !== p.type && !busyOf(o)[slot] && !paired(o.uid, uid)).sort((a, b2) => a.meetings.length - b2.meetings.length || a.companyName.localeCompare(b2.companyName));
            const box = $('.assign-box', tr);
            box.innerHTML = `<div class="assign-form"><strong>Asignar a ${esc(p.companyName)} · ${esc(slot)}</strong>
              ${cands.length ? `<select id="as-sel">${cands.map(o => `<option value="${esc(o.uid)}">${esc(o.companyName)} (${o.meetings.length}/${min})</option>`).join('')}</select>
              <button class="btn btn-primary btn-small" id="as-ok">Confirmar reunión</button>` : '<span class="muted">No hay empresas libres en ese horario.</span>'}
              <button class="btn btn-ghost btn-small" id="as-x">Cerrar</button><div class="form-msg"></div></div>`;
            $('#as-x', box).onclick = () => { box.innerHTML = ''; };
            const okb = $('#as-ok', box);
            if (okb) okb.onclick = async () => {
              const other = $('#as-sel', box).value; okb.disabled = true;
              const sUid = p.type === 'vendedor' ? uid : other, bUid = p.type === 'vendedor' ? other : uid;
              try { await DB.adminAssignMeeting(id, sUid, bUid, slot); S.adminTab[id] = 'agendas'; S.flash = { type: 'ok', msg: 'Reunión asignada y confirmada. Ambas empresas fueron avisadas.' }; render(); }
              catch (err) { okb.disabled = false; showError(box, adminErr(err)); }
            };
          });
        };
        ['#ag-type', '#ag-under'].forEach(s => { $(s, root).onchange = drawAg; }); $('#ag-q', root).oninput = drawAg;
        drawAg();
        const printAg = people => printWindow('Agendas · ' + ev.name, agendaSheets(ev, agendas, people.map(p => ({
          companyName: p.companyName, type: p.type, table: p.table, contactName: p.contactName, companion: p.companion,
          meetings: p.meetings.map(m => ({ slot: m.slot, otherName: m.otherName, otherTable: m.otherTable }))
        }))));
        $('#btn-print-all', root).onclick = () => printAg(P.slice().sort((a, b) => a.type.localeCompare(b.type) || (Number(a.table) || 999) - (Number(b.table) || 999) || a.companyName.localeCompare(b.companyName)));
        const bt = $('#btn-tables', root);
        if (bt) bt.onclick = async () => { try { const n = await DB.autoTables(id); S.adminTab[id] = 'agendas'; S.flash = { type: 'ok', msg: `Mesas asignadas a ${n} vendedores sin mesa. Puedes editarlas en la tabla.` }; render(); } catch (err) { alertBox(root, adminErr(err)); } };
        $('#btn-suggest', root).onclick = async () => {
          const box = $('#suggest-box', root); box.innerHTML = '<p class="muted">Buscando combinaciones…</p>';
          try {
            const r = await DB.suggestMeetings(id);
            if (!r.proposals.length) { box.innerHTML = `<div class="notice">No hay más combinaciones posibles con los horarios libres.${r.stillUnder.length ? ` Siguen bajo el mínimo: ${r.stillUnder.map(x => esc(x.companyName) + ' (' + x.count + ')').join(', ')}.` : ''}</div>`; return; }
            box.innerHTML = `<div class="card suggest"><h3>${r.proposals.length} reuniones sugeridas</h3>
              <p class="small muted">Prioriza a las empresas con menos reuniones y no repite pares. Desmarca las que no quieras y confirma.</p>
              <div class="table-wrap"><table><thead><tr><th><input type="checkbox" id="sg-all" checked aria-label="Todas"></th><th>Bloque</th><th>Vendedor</th><th>Comprador</th></tr></thead><tbody>
              ${r.proposals.map((p, i) => `<tr><td><input type="checkbox" class="sg" data-i="${i}" checked aria-label="Elegir"></td><td>${esc(p.slot)}</td><td>${esc(p.sellerName)} <small class="muted">(${p.sellerCount})</small></td><td>${esc(p.buyerName)} <small class="muted">(${p.buyerCount})</small></td></tr>`).join('')}
              </tbody></table></div>
              ${r.stillUnder.length ? `<p class="small">Aun con estas sugerencias quedan bajo el mínimo: ${r.stillUnder.map(x => esc(x.companyName) + ' (' + x.count + ')').join(', ')}. Considera ampliar la grilla.</p>` : ''}
              <div class="actions"><button class="btn btn-primary" id="sg-ok">Confirmar seleccionadas</button><button class="btn btn-ghost" id="sg-x">Descartar</button></div><div class="form-msg"></div></div>`;
            $('#sg-all', box).onchange = e => $$('.sg', box).forEach(c => { c.checked = e.target.checked; });
            $('#sg-x', box).onclick = () => { box.innerHTML = ''; };
            $('#sg-ok', box).onclick = async () => {
              const chosen = $$('.sg:checked', box).map(c => r.proposals[Number(c.getAttribute('data-i'))]);
              const btn = $('#sg-ok', box); btn.disabled = true; let okN = 0; const errs = [];
              for (const p of chosen) {
                btn.textContent = `Confirmando ${okN + errs.length + 1} de ${chosen.length}…`;
                try { await DB.adminAssignMeeting(id, p.sellerUid, p.buyerUid, p.slot); okN++; } catch (err) { errs.push(p.sellerName + ' / ' + p.buyerName + ': ' + adminErr(err)); }
              }
              S.adminTab[id] = 'agendas';
              S.flash = { type: errs.length ? 'error' : 'ok', msg: `${okN} reuniones asignadas.` + (errs.length ? ' No se pudieron: ' + errs.join(' · ') : '') }; render();
            };
          } catch (err) { box.innerHTML = ''; alertBox(root, adminErr(err)); }
        };

        // acreditación
        const bb = $('#btn-badges', root);
        if (bb) bb.onclick = async () => {
          bb.disabled = true; bb.textContent = 'Preparando credenciales…';
          const people = checkins.slice().sort((a, b) => a.type.localeCompare(b.type) || (Number(a.table) || 999) - (Number(b.table) || 999) || a.companyName.localeCompare(b.companyName) || (a.person === 'titular' ? -1 : 1));
          printWindow('Credenciales · ' + ev.name, await credentialSheets(ev, people));
          bb.disabled = false; bb.textContent = '🖨 Imprimir credenciales (PDF)';
        };
        const fst = $('#f-staff', root);
        if (fst) fst.onsubmit = async e => {
          e.preventDefault();
          try { await DB.setStaff(id, val(fst, 'email'), val(fst, 'name')); S.adminTab[id] = 'acreditacion'; S.flash = { type: 'ok', msg: 'Acreditador agregado.' }; render(); }
          catch (err) { showError(fst, adminErr(err)); }
        };
        $$('[data-rmstaff]', root).forEach(b => b.onclick = async () => { try { await DB.removeStaff(id, b.getAttribute('data-rmstaff')); S.adminTab[id] = 'acreditacion'; render(); } catch (err) { alertBox(root, adminErr(err)); } });
        $$('[data-acc]', root).forEach(b => b.onclick = async () => {
          b.disabled = true;
          try { await DB.staffCheckin(id, b.getAttribute('data-acc'), !!b.getAttribute('data-undo')); S.adminTab[id] = 'acreditacion'; render(); }
          catch (err) { b.disabled = false; alertBox(root, adminErr(err)); }
        });

        // monitor
        const loadMonitor = async () => {
          const mb = $('#mon-body', root); if (!mb) return;
          try {
            const r = await DB.getMonitor(id);
            $('#mon-time', root).textContent = 'Actualizado ' + new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const stTxt = row => {
              const m = row.meeting; if (!m) return '<span class="muted">Sin reunión en este bloque</span>';
              if (m.liveStatus === 'no_show') return '<span class="badge mt-cancelada">Comprador no se presentó</span>';
              if (m.liveStatus === 'finalizada' || m.held === 'si') return '<span class="badge mt-aceptada">Realizada</span>';
              if (m.liveStatus === 'en_curso') return '<span class="badge mt-aceptada">● En curso</span>';
              if (online) return row.sellerInRoom && m.buyerInRoom ? '<span class="badge mt-aceptada">● Ambos en sala</span>' : row.sellerInRoom ? '<span class="badge mt-pendiente">Vendedor esperando</span>' : m.buyerInRoom ? '<span class="badge mt-pendiente">Comprador esperando</span>' : '<span class="badge mt-vencida">Sala vacía</span>';
              return row.sellerAccredited && m.buyerAccredited ? '<span class="badge mt-pendiente">Por marcar</span>' : '<span class="badge mt-vencida">Falta acreditación</span>';
            };
            const dot = on => `<span class="dot ${on ? 'on' : ''}"></span>`;
            mb.innerHTML = `<div class="stats">
                <div class="stat"><span>${r.slot ? esc(fmtTime(r.slot.start)) : '—'}</span>bloque actual / próximo</div>
                <div class="stat stat-ok"><span>${r.accreditation.companiesChecked}/${r.accreditation.companies}</span>empresas ${online ? 'ingresadas' : 'acreditadas'}</div>
                <div class="stat stat-ok"><span>${r.totals.held}</span>realizadas</div><div class="stat stat-warn"><span>${r.totals.noShow}</span>inasistencias</div></div>
              <div class="table-wrap"><table><thead><tr>${online ? '' : '<th>Mesa</th>'}<th>Vendedor</th><th>Comprador del bloque</th><th>Estado</th></tr></thead><tbody>
              ${r.rows.map(row => `<tr>${online ? '' : `<td><strong>${esc(row.table || '—')}</strong></td>`}
                <td>${online ? dot(row.sellerInRoom || row.sellerOnline) : dot(row.sellerAccredited)} ${esc(row.companyName)}</td>
                <td>${row.meeting ? `${online ? dot(row.meeting.buyerInRoom) : dot(row.meeting.buyerAccredited)} ${esc(row.meeting.buyerName)}` : '—'}</td>
                <td>${stTxt(row)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin vendedores aprobados.</td></tr>'}
              </tbody></table></div>
              <p class="small muted">${dot(true)} ${online ? 'conectado en la sala' : 'acreditado'} · ${dot(false)} ${online ? 'no conectado' : 'sin acreditar'}</p>`;
          } catch (err) { mb.innerHTML = `<p class="error">${esc(adminErr(err))}</p>`; }
        };

        // salas
        const rmsg = $('#rooms-msg', root);
        const say = (txt, bad) => { rmsg.className = 'form-msg ' + (bad ? 'error' : 'ok'); rmsg.textContent = txt; };
        const br = $('#btn-rooms', root);
        if (br) br.onclick = async () => {
          br.disabled = true; let total = 0; const errs = [];
          try {
            for (let i = 0; i < 20; i++) {
              say('Creando salas… ' + total + ' listas');
              const r = await DB.createRooms(id); total += r.created; errs.push(...r.errors);
              if (!r.remaining || (!r.created && r.errors.length)) break;
            }
            S.adminTab[id] = 'salas'; S.flash = { type: errs.length ? 'error' : 'ok', msg: `Salas creadas: ${total}.` + (errs.length ? ' Errores: ' + errs.join(' · ') : '') }; render();
          } catch (err) { br.disabled = false; say(adminErr(err), true); }
        };
        const bs = $('#btn-sync', root);
        if (bs) bs.onclick = async () => {
          try { const r = await DB.syncGuests(id); say(`Invitados actualizados en ${r.synced} salas.` + (r.errors.length ? ' Errores: ' + r.errors.join(' · ') : ''), r.errors.length); }
          catch (err) { say(adminErr(err), true); }
        };
        $$('[data-room-save]', root).forEach(b => b.onclick = async () => {
          const uid = b.getAttribute('data-room-save'); const v = $(`[data-room-input="${uid}"]`, root).value.trim();
          try { await DB.setRoom(id, uid, v); S.adminTab[id] = 'salas'; S.flash = { type: 'ok', msg: 'Link de sala guardado.' }; render(); }
          catch (err) { say(adminErr(err), true); }
        });

        // resultados
        $$('[data-mcancel]', root).forEach(b => b.onclick = async () => {
          if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '¿Seguro? Anular'; return; }
          b.disabled = true;
          try { await DB.adminCancelMeeting(id, b.getAttribute('data-mcancel')); S.adminTab[id] = 'resultados'; S.flash = { type: 'ok', msg: 'Reunión anulada. Las empresas quedan libres en ese horario.' }; render(); }
          catch (err) { b.disabled = false; alertBox(root, adminErr(err)); }
        });
        const bm = $('#btn-csv-m', root);
        if (bm) bm.onclick = () => {
          const head = ['Bloque (hora Chile)', 'Vendedor', 'Comprador', 'Origen', 'Estado', 'Marcada por vendedor', 'Marcada por comprador', 'Mensaje', 'Creada'];
          const rows = meetings.map(m => [m.slot, (rmap[m.sellerUid] || {}).companyName, (rmap[m.buyerUid] || {}).companyName, m.assignedBy ? 'Asignada por admin' : (rmap[m.requesterUid] || {}).companyName, mStatus(m), liveLabel(m.liveStatus) || m.held, m.buyerHeld, m.note, fmtDate(m.createdAt)]);
          downloadCsv('reuniones-' + id + '.csv', [head].concat(rows));
        };
        const brr = $('#btn-csv-r', root);
        if (brr) brr.onclick = () => {
          const out = o => o ? ({ negocio: 'Negocio concretado', seguimiento: 'Seguimiento', sin_interes: 'Sin interés' }[o] || o) : '';
          const head = ['Bloque (hora Chile)', 'Vendedor', 'Comprador', 'Mesa', 'Ingreso vendedor', 'Ingreso comprador', 'Realizada (vendedor)', 'Realizada (comprador)', 'Interés vendedor', 'Interés comprador', 'Resultado vendedor', 'Resultado comprador', 'Expectativa vendedor US$', 'Expectativa comprador US$', 'Comentario vendedor', 'Comentario comprador'];
          const rows = conf.slice().sort((a, b) => a.slot.localeCompare(b.slot)).map(m => {
            const v = (sv[m.id] || {}).vendedor || {}, c = (sv[m.id] || {}).comprador || {};
            const hora = x => x ? new Date(x).toLocaleString('es-CL', { timeZone: 'America/Santiago' }) : '';
            return [m.slot, (rmap[m.sellerUid] || {}).companyName, (rmap[m.buyerUid] || {}).companyName, (rmap[m.sellerUid] || {}).table || '', hora(m.sellerJoinedAt), hora(m.buyerJoinedAt), m.held || v.held || '', m.buyerHeld || c.held || '', v.interest || '', c.interest || '', out(v.outcome), out(c.outcome), v.amount || '', c.amount || '', v.comment || '', c.comment || ''];
          });
          downloadCsv('resultados-' + id + '.csv', [head].concat(rows));
        };

        // configuración: evento con deshacer
        const fe = $('#f-ev', root); bindEventForm(fe);
        fe.onsubmit = async e => {
          e.preventDefault();
          const r = readEventForm(fe, !S.isSuper ? ev.regionId : null); if (r.error) return showError(fe, r.error);
          const changed = EVENT_KEYS.filter(k => String(r.data[k] || '') !== String(ev[k] === undefined ? '' : ev[k]));
          if (!changed.length) return showOk(fe, 'No hay cambios.');
          try { await DB.updateEvent(id, r.data); S.adminTab[id] = 'config'; S.toast = undoToast(pickPrev(changed)); render(); }
          catch (err) { showError(fe, adminErr(err)); }
        };
        // grilla con breaks
        const fs = $('#f-sched', root); let days = (sc.days || []).slice(); let breaks = (sc.breaks || []).map(b => Object.assign({}, b));
        let forceSched = false;
        const resetForce = () => { forceSched = false; $('button[type=submit]', fs).textContent = 'Guardar grilla'; };
        const drawSched = () => {
          $('#day-chips', root).innerHTML = days.length ? days.map(d => `<span class="day-chip">${esc(fmtDate(d))}<button type="button" data-rmday="${esc(d)}" aria-label="Quitar">×</button></span>`).join('') : '<span class="muted small">Sin días todavía.</span>';
          $$('[data-rmday]', root).forEach(b => b.onclick = () => { resetForce(); days = days.filter(x => x !== b.getAttribute('data-rmday')); drawSched(); });
          $('#breaks', root).innerHTML = breaks.map((b, i) => `<div class="brk-row"><input type="time" data-bi="${i}" data-bk="start" value="${esc(b.start)}" aria-label="Inicio break"><span>a</span><input type="time" data-bi="${i}" data-bk="end" value="${esc(b.end)}" aria-label="Término break"><input data-bi="${i}" data-bk="label" value="${esc(b.label)}" maxlength="40" aria-label="Nombre del break" placeholder="Café"><button type="button" class="btn btn-small btn-ghost" data-rmbrk="${i}" aria-label="Quitar break">×</button></div>`).join('') || '<p class="small muted">Sin breaks.</p>';
          $$('[data-bi]', root).forEach(inp => inp.oninput = () => { resetForce(); breaks[Number(inp.getAttribute('data-bi'))][inp.getAttribute('data-bk')] = inp.value; preview(); });
          $$('[data-rmbrk]', root).forEach(b => b.onclick = () => { resetForce(); breaks.splice(Number(b.getAttribute('data-rmbrk')), 1); drawSched(); });
          preview();
        };
        const preview = () => {
          const n = countSlots(val(fs, 'start'), val(fs, 'end'), val(fs, 'slot'), val(fs, 'gap'), breaks.filter(b => b.start && b.end));
          $('#sched-preview', root).innerHTML = `<strong>${n}</strong> reuniones posibles por empresa al día · <strong>${n * days.length}</strong> en total.` + (n * Math.max(days.length, 1) < min ? ` <span class="error">Con esta grilla no se alcanza el mínimo de ${min} reuniones por empresa.</span>` : '');
        };
        $('#day-add', root).onclick = () => { resetForce(); const d = $('#day-new', root).value; if (d && !days.includes(d)) { days.push(d); days.sort(); } $('#day-new', root).value = ''; drawSched(); };
        $('#brk-add', root).onclick = () => { resetForce(); breaks.push({ start: '11:00', end: '11:20', label: 'Café' }); drawSched(); };
        ['start', 'end', 'slot', 'gap'].forEach(n => fs.elements[n].addEventListener('input', () => { resetForce(); preview(); }));
        drawSched();
        fs.onsubmit = async e => {
          e.preventDefault();
          if (!days.length) return showError(fs, 'Agrega al menos un día.');
          const schedule = { days, start: val(fs, 'start'), end: val(fs, 'end'), slot: Number(val(fs, 'slot')), gap: Number(val(fs, 'gap')), breaks: breaks.filter(b => b.start && b.end) };
          if (toM(schedule.end) <= toM(schedule.start)) return showError(fs, 'El término debe ser posterior al inicio.');
          if (schedule.breaks.some(b => toM(b.end) <= toM(b.start))) return showError(fs, 'Cada break debe terminar después de empezar.');
          try {
            await DB.updateEvent(id, { schedule }, forceSched);
            S.adminTab[id] = 'config'; S.toast = undoToast({ schedule: ev.schedule || null }); render();
          } catch (err) {
            showError(fs, adminErr(err));
            if (err.code === 'schedule-conflict') { forceSched = true; $('button[type=submit]', fs).textContent = 'Guardar de todos modos y anular esas reuniones'; }
          }
        };
        // eliminar
        const fd = $('#f-del', root);
        $('#btn-del', root).onclick = () => { fd.hidden = false; $('#btn-del', root).hidden = true; fd.elements.confirm.focus(); };
        $('#btn-del-cancel', root).onclick = () => { fd.hidden = true; $('#btn-del', root).hidden = false; };
        fd.onsubmit = async e => {
          e.preventDefault();
          if (val(fd, 'confirm').toUpperCase() !== 'ELIMINAR') return showError(fd, 'Escribe ELIMINAR para confirmar.');
          try { await DB.deleteEvent(id); S.flash = { type: 'ok', msg: 'Evento eliminado.' }; go('#/admin'); }
          catch (err) { showError(fd, adminErr(err)); }
        };
        showTab(tab);
      }
    };
  }

  // ---------- inicio ----------
  async function refreshAuth(u) {
    S.user = u ? { uid: u.uid, email: String(u.email || '').toLowerCase() } : null;
    S.isSuper = false; S.admin = null; S.staffEvents = [];
    if (S.user) { try { const r = await DB.getRoles(); S.isSuper = !!r.isSuper; S.admin = r.admin || null; S.staffEvents = r.staffEvents || []; } catch (e) { } }
  }
  function demoMail(o) {
    let box = $('#demo-mail');
    if (!box) { box = document.createElement('div'); box.id = 'demo-mail'; box.className = 'demo-mail'; document.body.appendChild(box); }
    const item = document.createElement('div'); item.className = 'demo-mail-item';
    item.innerHTML = `<button class="link" aria-label="Cerrar">×</button><p class="kicker">Correo simulado (demo) → ${esc(o.to)}</p><strong>${esc(o.subject)}</strong><p class="pre small">${esc(o.body)}</p>`;
    $('button', item).onclick = () => item.remove();
    box.prepend(item); setTimeout(() => item.remove(), 20000);
  }
  async function init() {
    S.lang = detectLang(); document.documentElement.lang = S.lang;
    document.title = CFG.appName + ' · ' + (CFG.appTagline || '');
    try {
      if (CFG.mode === 'sheets') {
        if (!CFG.apiUrl) throw new Error('Falta la dirección del servidor (apiUrl) en config.js. Ver LEEME.md.');
        DB = window.RN_createSheetsDB(CFG);
      } else { DB = await window.RN_createDemoDB(CFG); DB.onMail(demoMail); }
    } catch (e) { $('#main').innerHTML = page(`<div class="card narrow"><p class="error">${esc(e.message)}</p></div>`); return; }
    DB.onAuth(async u => {
      if (S.busy) return;
      await refreshAuth(u);
      S.ready = true; render();
    });
    window.addEventListener('hashchange', render);
  }
  document.addEventListener('DOMContentLoaded', init);
})();
