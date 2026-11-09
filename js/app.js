// Plataforma de Ruedas de Negocios Turísticos — Etapa 1 (v2)
// Eventos, inscripción separada para vendedores y compradores, aprobación, perfiles y catálogo.
(function () {
  'use strict';
  const CFG = window.RN_CONFIG;
  const I = window.RN_I18N;

  const REGIONES = {
    arica: 'Arica y Parinacota', tarapaca: 'Tarapacá', antofagasta: 'Antofagasta', atacama: 'Atacama',
    coquimbo: 'Coquimbo', valparaiso: 'Valparaíso', metropolitana: 'Metropolitana', ohiggins: "O'Higgins",
    maule: 'Maule', nuble: 'Ñuble', biobio: 'Biobío', araucania: 'La Araucanía', losrios: 'Los Ríos',
    loslagos: 'Los Lagos', aysen: 'Aysén', magallanes: 'Magallanes'
  };
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
  const S = { user: null, admin: null, isSuper: false, ready: false, busy: false, lang: 'es', flash: null, next: null };

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
    const map = { 'slot-taken': 'err_slot_taken', 'slot-invalid': 'err_slot_taken', 'pair-exists': 'err_pair', 'too-many': 'err_too_many', 'me-busy': 'err_me_busy', 'too-late': 'too_late', closed: 'agenda_closed', 'not-pending': 'err_not_pending', 'not-yet': 'err_not_yet', 'no-room': 'no_room' };
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
  function regionName(id) { const r = regionCfg(id); return r && r.name ? r.name : (REGIONES[id] ? 'Región de ' + REGIONES[id] : ''); }
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
      ${S.user ? `<div class="userline"><div class="container">${esc(S.user.email)}${S.isSuper ? ' · superadministrador' : (S.admin ? ' · administrador ' + esc(REGIONES[S.admin.regionId] || '') : '')}</div></div>` : ''}`;
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
    [/^#\/ingresar$/, viewLogin],
    [/^#\/mi$/, viewMine],
    [/^#\/admin$/, viewAdmin],
    [/^#\/admin\/evento\/([^/]+)$/, viewAdminEvent]
  ];
  let seq = 0;
  async function render() {
    if (!S.ready) return;
    const my = ++seq;
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
        ${[0, 1].map(i => `<div class="two"><input name="comp${i}name" placeholder="${esc(t('companion_name'))}" aria-label="${esc(t('companion_name'))}" maxlength="120" value="${esc((comps[i] || {}).name)}"><input name="comp${i}email" type="email" placeholder="${esc(t('email'))}" aria-label="${esc(t('email'))}" maxlength="120" value="${esc((comps[i] || {}).email)}"></div>`).join('')}
        <div class="two">
          <label>${t('lang_pref')}<select name="lang">${I.langs.map(l => `<option value="${l}"${(reg.lang || S.lang) === l ? ' selected' : ''}>${l.toUpperCase()}</option>`).join('')}</select></label>
          <label>${t('timezone')}<input name="tz" value="${esc(tz)}" readonly></label>
        </div>
      </fieldset>
      <fieldset><legend>${t('consent_section')}</legend>
        <label class="check"><input type="checkbox" name="consentData"${reg.consentData ? ' checked disabled' : ''}> <span>${t('consent_data')} *</span></label>
        <label class="check"><input type="checkbox" name="shareContact"${reg.shareContact ? ' checked' : ''}> <span>${t('consent_share')}</span></label>
      </fieldset>`;
  }
  // Lee y valida el formulario. Devuelve {pub, contact} o {error}
  function readProfile(form, type, existing) {
    const pub = {
      companyName: val(form, 'companyName'), logo: val(form, 'logo'), description: val(form, 'description'), website: val(form, 'website'),
      shareContact: !!form.elements.shareContact.checked, lang: val(form, 'lang') || S.lang, tz: val(form, 'tz'),
      serviceTypes: [], destination: '', products: '', sernaturRegistry: '', targetMarket: ''
    };
    if (type === 'vendedor') {
      pub.serviceTypes = $$('input[name=serviceTypes]:checked', form).map(x => x.value);
      pub.destination = val(form, 'destination'); pub.products = val(form, 'products'); pub.sernaturRegistry = val(form, 'sernaturRegistry');
    } else pub.targetMarket = val(form, 'targetMarket');
    const companions = [0, 1].map(i => ({ name: val(form, `comp${i}name`), email: val(form, `comp${i}email`).toLowerCase() })).filter(c => c.name || c.email);
    const contact = { contactName: val(form, 'contactName'), phone: val(form, 'phone'), companions };
    if (!pub.companyName || !contact.contactName || !contact.phone) return { error: t('required') };
    if (type === 'vendedor') {
      if (!pub.serviceTypes.length) return { error: t('choose_service') };
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
      <div class="demo-accounts">${[['admin@demo.cl', 'Superadministrador'], ['valpo@demo.cl', 'Admin regional Valparaíso'], ['vendedor@demo.cl', 'Vendedor aprobado'], ['comprador@demo.cl', 'Comprador aprobado'], ['pendiente@demo.cl', 'Vendedor pendiente']]
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

  async function viewMine() {
    if (!S.user) return needLogin();
    const regs = await DB.listMyRegistrations(S.user.uid);
    const rows = await Promise.all(regs.map(async r => { let ev = null; try { ev = await DB.getEvent(r.eventId); } catch (e) { } return { r, ev }; }));
    const items = rows.filter(x => x.ev).map(({ r, ev }) => {
      const eid = enc(ev.id);
      const canCatalog = r.status === 'aprobada' && ev.phase !== 'borrador';
      const canAgenda = r.status === 'aprobada' && ['agenda', 'reuniones', 'cerrado'].includes(ev.phase);
      return `<article class="card mine">
        <div class="mine-photo" data-photo="${esc(JSON.stringify(photosFor(ev)))}"></div>
        <div class="mine-body">
          <div class="row-between"><span class="badge ph-${esc(ev.phase)}">${esc(phaseLabel(ev.phase))}</span>${statusBadge(r.status)}</div>
          <h3>${esc(ev.name)}</h3>
          <p class="muted">${esc(r.companyName)} · ${t('as')} ${t('role_' + r.type).toLowerCase()}</p>
          ${r.status === 'pendiente' ? `<p class="small">${t('pending_note')}</p>` : ''}
          ${canAgenda && ev.phase === 'agenda' ? `<p class="small ok-note">${t('agenda_open_cta')}</p>` : ''}
          <div class="actions">
            ${canAgenda ? `<a class="btn btn-primary" href="#/evento/${eid}/agenda">${t('agenda')}</a>` : ''}
            ${canCatalog ? `<a class="btn ${canAgenda ? '' : 'btn-primary'}" href="#/evento/${eid}/catalogo">${t('catalog')}</a>` : ''}
            <a class="btn" href="#/evento/${eid}/perfil">${t('edit_profile')}</a>
            <a class="btn btn-ghost" href="#/evento/${eid}">${t('view_event')}</a>
          </div></div></article>`;
    });
    return {
      html: page(pageHead('', t('mine_title'), esc(S.user.email))
        + (isAnyAdmin() ? `<p><a class="btn" href="#/admin">${t('nav_admin')} →</a></p>` : '')
        + `<div class="stack">${items.length ? items.join('') : `<div class="card"><p class="muted">${t('mine_empty')} <a href="#/">${t('nav_events')}</a></p></div>`}</div>`)
    };
  }

  // ---------- catálogo ----------
  function companySummary(r) {
    if (r.type === 'vendedor') return `<div class="tags">${(r.serviceTypes || []).map(k => `<span class="tag">${esc(svc(k))}</span>`).join('')}</div><p class="small">${t('destination')}: <strong>${esc(r.destination)}</strong></p>`;
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
    if (!admin && !approved) return { html: page(pageHead('', ev.name) + `<div class="card narrow"><p>${t('pending_note')}</p><a class="btn" href="#/mi">${t('go_account')}</a></div>`) };
    const all = (await DB.listRegistrations(id, { status: 'aprobada' })).filter(r => r.uid !== S.user.uid);
    let showType = approved ? (me.type === 'vendedor' ? 'comprador' : 'vendedor') : 'vendedor';
    const eid = enc(id);
    return {
      html: page(`<p class="small"><a href="#/evento/${eid}">← ${esc(ev.name)}</a></p>` + pageHead(t('catalog'), '', '') +
        (ev.phase === 'agenda' && approved ? `<div class="card status-box"><p>${t('agenda_open_cta')}</p><a class="btn btn-primary" href="#/evento/${eid}/agenda">${t('agenda')}</a></div>` : '') + `
        <div class="filters card">
          ${!approved ? `<select id="cat-type" aria-label="Tipo"><option value="vendedor">${t('catalog_sellers')}</option><option value="comprador">${t('catalog_buyers')}</option></select>` : ''}
          <input id="cat-q" type="search" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}">
          <select id="cat-svc" aria-label="${esc(t('service_types'))}"><option value="">${t('all_services')}</option>${Object.keys(I.services).map(k => `<option value="${k}">${esc(svc(k))}</option>`).join('')}</select>
        </div>
        <p class="muted small" id="cat-count"></p>
        <div class="grid" id="cat-list"></div>
        ${ev.phase === 'agenda' && approved ? '' : `<p class="notice">${ev.phase === 'inscripcion' ? t('agenda_soon') : t('agenda_closed')}</p>`}`),
      bind(root) {
        const draw = () => {
          const q = ($('#cat-q', root).value || '').toLowerCase().trim();
          const sv = $('#cat-svc', root).value;
          $('#cat-svc', root).hidden = showType !== 'vendedor';
          $('.page-head h1', root).textContent = showType === 'vendedor' ? t('catalog_sellers') : t('catalog_buyers');
          const list = all.filter(r => r.type === showType)
            .filter(r => showType !== 'vendedor' || !sv || (r.serviceTypes || []).includes(sv))
            .filter(r => !q || [r.companyName, r.destination, r.products, r.targetMarket, r.description].join(' ').toLowerCase().includes(q))
            .sort((a, b) => a.companyName.localeCompare(b.companyName));
          $('#cat-count', root).textContent = `${list.length} ${t('results')}`;
          $('#cat-list', root).innerHTML = list.length ? list.map(r => `<a class="card company" href="#/evento/${eid}/empresa/${enc(r.uid)}">
              ${logoHtml(r)}
              <h3>${esc(r.companyName)}</h3>${companySummary(r)}
              <span class="more">${ev.phase === 'agenda' && approved ? t('request_meeting') : t('view_company')} →</span></a>`).join('')
            : `<p class="muted">${t('no_results')}</p>`;
        };
        $('#cat-q', root).oninput = draw; $('#cat-svc', root).onchange = draw;
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
    let contact = null;
    try { contact = await DB.getContact(id, uid); } catch (e) { contact = null; }
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
        const now = Date.now();
        booking = `<div class="booking card" id="booking"><h2>${t('request_meeting')}</h2>
          <p class="small muted">${t('choose_slot')} · ${t('your_tz_note')}: <strong>${esc(USER_TZ)}</strong></p>
          <div class="slot-days">${groupByDay(sched.slots).map(g => `<div class="slot-day"><h3>${esc(g.day)}</h3><div class="slot-grid">${g.slots.map(s => {
            const past = Date.parse(s.start) <= now, busy = theirs[s.id], mineB = myBusy[s.id];
            const dis = past || busy || mineB;
            return `<button type="button" class="slot${dis ? ' slot-off' : ''}" data-slot="${esc(s.id)}"${dis ? ' disabled' : ''} title="${esc(busy ? t('blocked') : mineB ? t('err_me_busy') : '')}">${fmtTime(s.start)}</button>`;
          }).join('')}</div></div>`).join('')}</div>
          <form id="f-book" hidden novalidate>
            <p class="selected-slot"><span class="kicker">${t('selected')}</span><strong id="sel-slot"></strong></p>
            <label>${t('note_ph')}<textarea name="note" rows="2" maxlength="300"></textarea></label>
            <div class="form-msg" role="alert"></div>
            <button class="btn btn-primary" type="submit">${t('send_request')}</button>
          </form>
          <p class="small muted">${t('pending_count')}: ${sentPending} / ${sched.rules.maxPending}. ${t('rules_note')}</p></div>`;
      }
    }
    const contactHtml = contact ? `<dl class="facts">
        <dt>${t('contact_name')}</dt><dd>${esc(contact.contactName)}</dd>
        <dt>${t('email')}</dt><dd><a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></dd>
        <dt>${t('phone')}</dt><dd>${esc(contact.phone)}</dd></dl>` : `<p class="muted">${t('no_share')}</p>`;
    return {
      html: page(`<p class="small"><a href="#/evento/${enc(id)}/catalogo">← ${t('catalog')}</a></p>
      <div class="company-layout">
      <article class="card company-detail">
        <div class="row-start">${logoHtml(r, 'avatar-lg')}
        <div><span class="badge">${t('role_' + r.type)}</span><h1>${esc(r.companyName)}</h1></div></div>
        ${companySummary(r)}
        ${r.type === 'vendedor' ? `<h3>${t('products')}</h3><p class="pre">${esc(r.products)}</p>` : ''}
        ${r.description ? `<p class="pre">${esc(r.description)}</p>` : ''}
        ${r.website && /^https?:\/\//i.test(r.website) ? `<p><a href="${esc(r.website)}" target="_blank" rel="noopener">${esc(r.website)}</a></p>` : ''}
        <h3>${t('contact')}</h3>${contactHtml}
        ${canBook ? '' : `<p class="notice">${ev.phase === 'inscripcion' ? t('agenda_soon') : t('agenda_closed')}</p>`}
      </article>
      ${booking}
      </div>`),
      bind(root) {
        const form = $('#f-book', root); if (!form) return;
        let chosen = null;
        $$('.slot[data-slot]', root).forEach(b => b.onclick = () => {
          $$('.slot.on', root).forEach(x => x.classList.remove('on')); b.classList.add('on');
          chosen = b.getAttribute('data-slot');
          const sl = sched.slots.find(s => s.id === chosen);
          $('#sel-slot', root).textContent = slotText(sl, sched.tz);
          form.hidden = false; form.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        });
        form.onsubmit = async e => {
          e.preventDefault(); if (!chosen) return;
          const btn = $('button[type=submit]', form); btn.disabled = true; btn.textContent = t('sending');
          try {
            await DB.requestMeeting(id, uid, chosen, val(form, 'note'));
            S.flash = { type: 'ok', msg: t('request_sent') }; render();
          } catch (err) { showError(form, errMsg(err)); btn.disabled = false; btn.textContent = t('send_request'); }
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
      return { html: page(pageHead('', t('agenda')) + `<div class="card narrow"><p>${t('pending_note')}</p></div>`) };
    }
    const [sched, mine] = await Promise.all([DB.getSchedule(id), DB.listMyMeetings(id)]);
    const slotMap = {}; sched.slots.forEach(s => { slotMap[s.id] = s; });
    const open = ev.phase === 'agenda';
    const bySlot = (a, b) => String(a.slot).localeCompare(String(b.slot));
    const ms = mine.meetings.slice().sort(bySlot);
    const received = ms.filter(m => m.incoming && m.status === 'pendiente');
    const sent = ms.filter(m => !m.incoming && m.status === 'pendiente');
    const confirmed = ms.filter(m => m.status === 'aceptada');
    const past = ms.filter(m => ['rechazada', 'cancelada', 'vencida', 'anulada'].includes(m.status));
    const cancelMs = sched.rules.cancelHours * 3600000;
    const eid = enc(id);
    const who = m => `<a class="who" href="#/evento/${eid}/empresa/${enc(m.other ? m.other.uid : '')}">${logoHtml(m.other)}<span><strong>${esc(m.other ? m.other.companyName : '—')}</strong><small>${m.other ? t('role_' + m.other.type) : ''}</small></span></a>`;
    const when = m => `<div class="when">${esc(slotText(slotMap[m.slot], sched.tz)) || esc(m.slot)}</div>`;
    const note = m => m.note ? `<p class="m-note">“${esc(m.note)}”</p>` : '';
    const row = (m, actions) => `<div class="m-row">${who(m)}<div class="m-info">${when(m)}${note(m)}</div><div class="m-act">${actions}</div></div>`;
    const section = (title, list, render, extra) => `<section class="card"><div class="row-between"><h2>${title} <span class="count">${list.length}</span></h2></div>${extra || ''}${list.length ? list.map(render).join('') : `<p class="muted">${t('none_yet')}</p>`}</section>`;
    const rooms = ['agenda', 'reuniones'].includes(ev.phase);
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
    const myRoomCard = me.type === 'vendedor' && mine.room && rooms ? `<div class="card room-card"><div><p class="kicker">${t('my_room')}</p><p class="small muted">${t('my_room_help')}</p>
      <p class="small"><a href="${esc(mine.room.url)}" target="_blank" rel="noopener">${esc(mine.room.url)}</a></p></div>
      <a class="btn btn-primary" href="${esc(mine.room.url)}" target="_blank" rel="noopener">${t('open_room')}</a></div>` : '';
    const blocks = {}; mine.blocks.forEach(b => { blocks[b] = 1; });
    const meetAt = {}; confirmed.forEach(m => { meetAt[m.slot] = m; });
    const now = Date.now();
    const grid = sched.slots.length ? groupByDay(sched.slots).map(g => `<div class="slot-day"><h3>${esc(g.day)}</h3><div class="slot-grid">${g.slots.map(s => {
      const m = meetAt[s.id], b = blocks[s.id], past = Date.parse(s.start) <= now;
      if (m) return `<div class="slot slot-meet" title="${esc(m.other ? m.other.companyName : '')}">${fmtTime(s.start)}<small>${esc(m.other ? m.other.companyName : '')}</small></div>`;
      return `<button type="button" class="slot ${b ? 'slot-blocked' : ''}" data-block="${esc(s.id)}" data-on="${b ? 1 : 0}"${past || !open ? ' disabled' : ''}>${fmtTime(s.start)}<small>${b ? t('blocked') : t('free')}</small></button>`;
    }).join('')}</div></div>`).join('') : `<p class="muted">${t('no_slots')}</p>`;
    return {
      html: page(`<p class="small"><a href="#/mi">← ${t('nav_mine')}</a></p>` + pageHead(esc(ev.name), t('agenda'), `${esc(me.companyName)} · ${t('your_tz_note')}: ${esc(USER_TZ)}`) + `
        <div class="stats">
          <div class="stat stat-ok"><span>${confirmed.length}</span>${t('confirmed')}</div>
          <div class="stat stat-warn"><span>${received.length}</span>${t('received')}</div>
          <div class="stat"><span>${sent.length}/${sched.rules.maxPending}</span>${t('pending_count')}</div>
        </div>
        ${open ? `<div class="card status-box"><p>${t('agenda_open_cta')}</p><a class="btn btn-primary" href="#/evento/${eid}/catalogo">${t('catalog')}</a></div>` : ev.phase === 'reuniones' ? `<div class="card status-box"><p><strong>${t('meetings_day')}</strong></p></div>` : `<p class="notice">${t('agenda_closed')}</p>`}
        ${myRoomCard}
        ${section(t('confirmed'), confirmed, m => {
          const sl = slotMap[m.slot]; const can = open && sl && Date.parse(sl.start) - now >= cancelMs;
          const isNext = nextId === m.id;
          return `<div class="meet-card${isNext ? ' is-next' : ''}">` + row(m, `${isNext ? `<span class="badge ph-inscripcion">${t('next_meeting')}</span>` : meetingBadge('aceptada')}
            ${joinArea(m)}
            ${m.canSurvey ? (m.survey ? `<span class="badge mt-aceptada">${t('evaluated')} ✓</span><button class="link small" data-eval="${esc(m.id)}">${t('edit_eval')}</button>` : `<button class="btn btn-small" data-eval="${esc(m.id)}">${t('evaluate')}</button>`) : ''}
            ${can ? `<button class="btn btn-small btn-ghost" data-cancel="${esc(m.id)}">${t('cancel_meeting')}</button>` : ''}`) + (m.canSurvey ? surveyForm(m) : '') + `</div>`;
        }, confirmed.length && rooms ? `<p class="small muted meet-hint">${esc(t('meet_hint').replace('{email}', S.user.email))}${DB.mode === 'demo' ? ' ' + t('demo_meet') : ''}</p>` : '')}
        ${section(t('received'), received, m => row(m, open ? `<button class="btn btn-small btn-primary" data-resp="1" data-id="${esc(m.id)}">${t('accept')}</button><button class="btn btn-small" data-resp="0" data-id="${esc(m.id)}">${t('reject')}</button>` : meetingBadge(m.status)))}
        ${section(t('sent'), sent, m => row(m, `${meetingBadge('pendiente')}<button class="btn btn-small btn-ghost" data-cancel="${esc(m.id)}">${t('withdraw')}</button>`))}
        <section class="card"><h2>${t('availability')}</h2><p class="small muted">${t('availability_help')}</p><div class="slot-days">${grid}</div></section>
        ${past.length ? `<details class="card history"><summary><h2>${t('history')} <span class="count">${past.length}</span></h2></summary>${past.map(m => row(m, meetingBadge(m.status))).join('')}</details>` : ''}
        <p class="small muted">${t('rules_note')}</p>
        <div class="form-msg" id="agenda-msg" role="alert"></div>`),
      bind(root) {
        const fail = err => { const b = $('#agenda-msg', root); b.className = 'form-msg error'; b.textContent = errMsg(err); b.scrollIntoView({ block: 'center' }); };
        const busy = el => { $$('button', root).forEach(x => { x.disabled = true; }); el.textContent = t('sending'); };
        $$('[data-resp]', root).forEach(b => b.onclick = async () => {
          busy(b);
          try { await DB.respondMeeting(id, b.getAttribute('data-id'), b.getAttribute('data-resp') === '1'); render(); } catch (err) { await render(); fail(err); }
        });
        $$('[data-cancel]', root).forEach(b => b.onclick = async () => {
          busy(b);
          try { await DB.cancelMeeting(id, b.getAttribute('data-cancel')); render(); } catch (err) { await render(); fail(err); }
        });
        // entrar a la sala (se abre la ventana antes para que el navegador no la bloquee)
        $$('[data-join]', root).forEach(b => b.onclick = async () => {
          const w = window.open('', '_blank');
          try {
            const r = await DB.joinMeeting(id, b.getAttribute('data-join'));
            if (w && !w.closed) { try { w.opener = null; } catch (x) { } w.location.href = r.url; }
            else { const box = $('#agenda-msg', root); box.className = 'form-msg ok'; box.innerHTML = `${esc(t('popup_blocked'))} <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url)}</a>`; box.scrollIntoView({ block: 'center' }); }
          } catch (err) { if (w) w.close(); fail(err); }
        });
        const tick = () => $$('[data-join]', root).forEach(b => {
          const f = b.getAttribute('data-from'), u = b.getAttribute('data-until'); if (!f) return;
          const n = Date.now();
          if (n >= Date.parse(f) && n <= Date.parse(u)) { b.disabled = false; b.textContent = '▶ ' + t('join'); }
          else if (n > Date.parse(u)) { b.outerHTML = `<p class="small muted">${t('join_ended')}</p>`; }
        });
        agendaTimer = setInterval(tick, 20000);
        // evaluación
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
      }
    };
  }

  // ---------- administración ----------
  function eventFormFields(ev, lockRegion) {
    ev = ev || {};
    const regionOpts = Object.keys(REGIONES).map(k => `<option value="${k}"${ev.regionId === k ? ' selected' : ''}>${REGIONES[k]}</option>`).join('');
    return `
      <label>Nombre del evento *<input name="name" maxlength="150" value="${esc(ev.name)}" placeholder="Rueda de Negocios Mercado Nacional 2027"></label>
      <div class="two">
        <label>Mercado *<input name="market" list="markets" maxlength="60" value="${esc(ev.market)}"><datalist id="markets">${MARKETS.map(m => `<option value="${m}">`).join('')}</datalist></label>
        <label>Región organizadora *<select name="regionId"${lockRegion ? ' disabled' : ''}>${regionOpts}</select></label>
      </div>
      <label>Descripción (se muestra en la página pública)<textarea name="description" rows="3" maxlength="1500">${esc(ev.description)}</textarea></label>
      <div class="two">
        <label>Inicio de inscripciones<input name="regStart" type="date" value="${esc(ev.regStart)}"></label>
        <label>Cierre de inscripciones<input name="regEnd" type="date" value="${esc(ev.regEnd)}"></label>
      </div>
      <label>Fechas de reuniones (texto)<input name="meetingDates" maxlength="120" value="${esc(ev.meetingDates)}" placeholder="2 al 4 de marzo de 2027"></label>
      <label>Foto de portada (opcional, ruta del archivo)<input name="coverPhoto" maxlength="300" value="${esc(ev.coverPhoto)}" placeholder="fotos/valparaiso/portada-2.jpg"></label>
      <label>Fase<select name="phase">${PHASES.map(p => `<option value="${p}"${(ev.phase || 'borrador') === p ? ' selected' : ''}>${PHASE_ADMIN[p]}</option>`).join('')}</select></label>`;
  }
  function readEventForm(form, fixedRegion) {
    const d = {
      name: val(form, 'name'), market: val(form, 'market'), regionId: fixedRegion || val(form, 'regionId'),
      description: val(form, 'description'), regStart: val(form, 'regStart'), regEnd: val(form, 'regEnd'),
      meetingDates: val(form, 'meetingDates'), coverPhoto: val(form, 'coverPhoto'), phase: val(form, 'phase') || 'borrador'
    };
    if (!d.name || !d.market || !d.regionId) return { error: 'Completa nombre, mercado y región.' };
    if (d.regStart && d.regEnd && d.regEnd < d.regStart) return { error: 'El cierre de inscripciones es anterior al inicio.' };
    return { data: d };
  }
  function alertBox(root, msg) { const d = document.createElement('div'); d.className = 'flash error'; d.textContent = msg; root.prepend(d); }

  async function viewAdmin() {
    if (!S.user) return needLogin();
    if (!isAnyAdmin()) return denied();
    const region = S.isSuper ? null : S.admin.regionId;
    const [events, admins] = await Promise.all([DB.listEventsForAdmin(region), S.isSuper ? DB.listAdmins() : Promise.resolve([])]);
    events.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const evRows = events.map(ev => `<tr><td><a href="#/admin/evento/${enc(ev.id)}"><strong>${esc(ev.name)}</strong></a></td><td>${esc(ev.market)}</td>
      <td>${esc(REGIONES[ev.regionId] || ev.regionId)}</td><td><span class="badge ph-${esc(ev.phase)}">${esc((PHASE_ADMIN[ev.phase] || ev.phase).split(' (')[0])}</span></td>
      <td><a class="btn btn-small" href="#/admin/evento/${enc(ev.id)}">Gestionar</a></td></tr>`).join('');
    const adminsBlock = S.isSuper ? `<section class="card">
      <h2>Administradores regionales</h2>
      <p class="small muted">Cada administrador gestiona solo los eventos de su región. Luego crea su cuenta en "Ingresar" con este mismo correo.</p>
      <div class="table-wrap"><table><thead><tr><th>Correo</th><th>Nombre</th><th>Región</th><th></th></tr></thead><tbody>
      ${admins.map(a => `<tr><td>${esc(a.email)}</td><td>${esc(a.name)}</td><td>${esc(REGIONES[a.regionId] || a.regionId)}</td><td><button class="btn btn-small btn-danger" data-rm="${esc(a.email)}">Quitar</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">Sin administradores regionales.</td></tr>'}
      </tbody></table></div>
      <form id="f-admin" class="inline-form" novalidate>
        <input name="email" type="email" placeholder="correo@sernatur.cl" aria-label="Correo">
        <input name="name" placeholder="Nombre" aria-label="Nombre">
        <select name="regionId" aria-label="Región">${Object.keys(REGIONES).map(k => `<option value="${k}">${REGIONES[k]}</option>`).join('')}</select>
        <button class="btn" type="submit">Agregar</button><div class="form-msg"></div>
      </form></section>` : '';
    return {
      html: page(pageHead(S.isSuper ? 'Superadministrador · todas las regiones' : 'Región ' + esc(REGIONES[region]), 'Administración') + `
      <section class="card"><div class="row-between"><h2>Eventos</h2></div>
        <div class="table-wrap"><table><thead><tr><th>Evento</th><th>Mercado</th><th>Región</th><th>Fase</th><th></th></tr></thead>
        <tbody>${evRows || '<tr><td colspan="5" class="muted">Aún no hay eventos.</td></tr>'}</tbody></table></div>
        <details class="new-event"><summary class="btn btn-primary">+ Crear evento</summary>
          <form id="f-event" novalidate>${eventFormFields({ regionId: region || CFG.homeRegion || 'valparaiso', phase: 'borrador' }, !!region)}
          <div class="form-msg"></div><button class="btn btn-primary" type="submit">Crear evento</button></form>
        </details>
      </section>${adminsBlock}`),
      bind(root) {
        const fe = $('#f-event', root);
        fe.onsubmit = async e => {
          e.preventDefault();
          const r = readEventForm(fe, region); if (r.error) return showError(fe, r.error);
          try { const id = await DB.createEvent(r.data); S.flash = { type: 'ok', msg: 'Evento creado.' }; go('#/admin/evento/' + enc(id)); }
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

  async function viewAdminEvent(id) {
    if (!S.user) return needLogin();
    const ev = await DB.getEvent(id);
    if (!ev) return notFound();
    if (!isAdminOf(ev.regionId)) return denied();
    const [regs, contacts, meetings, sched, rooms, surveys] = await Promise.all([DB.listRegistrations(id), DB.listContacts(id), DB.listMeetings(id), DB.getSchedule(id), DB.listRooms(id), DB.listSurveys(id)]);
    const roomsMissing = rooms.filter(r => !r.url).length;
    const conf = meetings.filter(m => m.status === 'aceptada');
    const sv = {}; surveys.forEach(x => { (sv[x.meetingId] = sv[x.meetingId] || {})[x.role] = x; });
    const heldCount = conf.filter(m => m.held === 'si' || (sv[m.id] && Object.values(sv[m.id]).some(x => x.held === 'si'))).length;
    const bothJoined = conf.filter(m => m.sellerJoinedAt && m.buyerJoinedAt).length;
    const sumRole = role => surveys.filter(x => x.role === role).reduce((a, x) => a + (Number(x.amount) || 0), 0);
    const outc = o => surveys.filter(x => x.outcome === o).length;
    const ints = surveys.filter(x => Number(x.interest)); const avgInt = ints.length ? (ints.reduce((a, x) => a + Number(x.interest), 0) / ints.length).toFixed(1) : '—';
    const usd = n => 'US$ ' + Math.round(n).toLocaleString('es-CL');
    const cmap = {}; contacts.forEach(c => { cmap[c.uid] = c; });
    const rmap = {}; regs.forEach(r => { rmap[r.uid] = r; });
    const slotMap = {}; sched.slots.forEach(s => { slotMap[s.id] = s; });
    const sc = ev.schedule || { days: [], start: '09:00', end: '13:00', slot: 20, gap: 5 };
    const mcount = st => meetings.filter(m => m.status === st).length;
    const mRows = meetings.slice().sort((a, b) => a.slot.localeCompare(b.slot)).map(m => `<tr><td>${esc(m.slot)}</td><td>${esc((rmap[m.sellerUid] || {}).companyName)}</td><td>${esc((rmap[m.buyerUid] || {}).companyName)}</td><td>${esc((rmap[m.requesterUid] || {}).type === 'vendedor' ? 'Vendedor' : 'Comprador')}</td><td><span class="badge mt-${esc(m.status)}">${esc({ pendiente: 'Pendiente', aceptada: 'Confirmada', rechazada: 'Rechazada', cancelada: 'Cancelada', vencida: 'Vencida', anulada: 'Anulada' }[m.status] || m.status)}</span></td></tr>`).join('');
    const count = (type, st) => regs.filter(r => (!type || r.type === type) && (!st || r.status === st)).length;
    const base = location.href.split('#')[0];
    const linkRow = (type, label) => `<div class="link-row"><span class="role-dot">${ICON[type]}</span><div class="link-col"><strong>${label}</strong>
        <div class="copy-row"><input readonly value="${esc(base + '#/evento/' + enc(id) + '/' + type + 'es')}" aria-label="${label}"><button class="btn btn-small" data-copy>Copiar</button></div></div></div>`;
    const lockRegion = !S.isSuper;
    return {
      html: page(`<p class="small"><a href="#/admin">← Administración</a></p>` + pageHead(esc(REGIONES[ev.regionId] || '') + ' · ' + esc(PHASE_ADMIN[ev.phase] || ev.phase), ev.name) + `
      <div class="stats">
        <div class="stat"><span>${count('vendedor')}</span>vendedores inscritos</div>
        <div class="stat"><span>${count('comprador')}</span>compradores inscritos</div>
        <div class="stat stat-warn"><span>${count(null, 'pendiente')}</span>pendientes de revisión</div>
        <div class="stat stat-ok"><span>${count(null, 'aprobada')}</span>aprobados</div>
      </div>
      <section class="card"><h2>Links de convocatoria</h2>
        <p class="small muted">Un link para cada público. Compártelos por correo y redes sociales. ${ev.phase === 'inscripcion' ? '' : '<strong>Ojo:</strong> las inscripciones solo funcionan con la fase "Inscripciones abiertas".'}</p>
        ${linkRow('vendedor', 'Vendedores')}${linkRow('comprador', 'Compradores')}
        <p class="small"><a href="#/evento/${enc(id)}">Ver página pública →</a> · <a href="#/evento/${enc(id)}/catalogo">Ver catálogo de aprobados →</a></p>
      </section>
      <section class="card"><h2>Grilla de reuniones (hora de Chile)</h2>
        <p class="small muted">Define los días y el horario. Todos los participantes usan los mismos bloques. Configúrala antes de pasar el evento a "Agenda abierta".</p>
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
          <p class="small" id="sched-preview"></p>
          <div class="form-msg"></div>
          <button class="btn btn-primary" type="submit">Guardar grilla</button>
        </form>
      </section>
      <section class="card"><h2>Reuniones</h2>
        <div class="stats">
          <div class="stat stat-ok"><span>${mcount('aceptada')}</span>confirmadas</div>
          <div class="stat stat-warn"><span>${mcount('pendiente')}</span>solicitudes pendientes</div>
          <div class="stat"><span>${mcount('rechazada') + mcount('cancelada') + mcount('vencida') + mcount('anulada')}</span>rechazadas, canceladas o vencidas</div>
        </div>
        ${meetings.length ? `<p><button class="btn" id="btn-csv-m">Descargar reuniones (CSV)</button></p><div class="table-wrap"><table><thead><tr><th>Bloque (Chile)</th><th>Vendedor</th><th>Comprador</th><th>Solicitó</th><th>Estado</th></tr></thead><tbody>${mRows}</tbody></table></div>` : '<p class="muted">Aún no hay solicitudes de reunión.</p>'}
      </section>
      <section class="card"><h2>Salas de video (Google Meet)</h2>
        <p class="small muted">Se crea una sala fija por vendedor aprobado en tu Google Calendar (calendario "Ruedas de Negocios – Salas"). Al confirmarse una reunión, el comprador queda invitado a la sala con su correo y entra directo. Puedes reemplazar cualquier link por uno propio (Meet, Teams o Zoom).</p>
        <div class="actions">
          <button class="btn btn-primary" id="btn-rooms"${roomsMissing ? '' : ' disabled'}>${roomsMissing ? `Crear salas Meet (${roomsMissing} pendientes)` : 'Todas las salas creadas ✓'}</button>
          <button class="btn" id="btn-sync">Actualizar invitados</button>
        </div>
        <div class="form-msg" id="rooms-msg"></div>
        ${rooms.length ? `<div class="table-wrap"><table><thead><tr><th>Vendedor</th><th>Sala</th><th>Invitados</th><th>Cambiar link</th></tr></thead><tbody>${rooms.map(r => `<tr>
          <td><strong>${esc(r.companyName)}</strong></td>
          <td>${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.url.replace(/^https:\/\//, ''))}</a><br><small class="muted">${r.provider === 'meet' ? 'Meet automático' : 'Link manual'}</small>` : '<span class="muted">Sin sala</span>'}</td>
          <td>${r.provider === 'meet' ? r.guests : '—'}</td>
          <td><div class="copy-row"><input placeholder="https://…" aria-label="Link de sala" data-room-input="${esc(r.sellerUid)}" value="${esc(r.url)}"><button class="btn btn-small" data-room-save="${esc(r.sellerUid)}">Guardar</button></div></td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">Aún no hay vendedores aprobados.</p>'}
      </section>
      <section class="card"><h2>Resultados</h2>
        <div class="stats">
          <div class="stat"><span>${conf.length}</span>reuniones confirmadas</div>
          <div class="stat stat-ok"><span>${heldCount}</span>realizadas (según evaluación)</div>
          <div class="stat"><span>${bothJoined}</span>con ingreso de ambas empresas a la sala</div>
          <div class="stat"><span>${surveys.length}</span>evaluaciones recibidas</div>
          <div class="stat stat-ok"><span>${usd(sumRole('vendedor'))}</span>expectativa declarada por vendedores</div>
          <div class="stat"><span>${usd(sumRole('comprador'))}</span>expectativa declarada por compradores</div>
        </div>
        <p class="small">Resultados: <strong>${outc('negocio')}</strong> negocios concretados · <strong>${outc('seguimiento')}</strong> con seguimiento · <strong>${outc('sin_interes')}</strong> sin interés · interés promedio <strong>${avgInt}</strong>/5</p>
        <button class="btn" id="btn-csv-r"${conf.length ? '' : ' disabled'}>Descargar reporte de resultados (CSV)</button>
      </section>
      <section class="card"><h2>Inscripciones</h2>
        <div class="filters">
          <select id="flt-st" aria-label="Estado"><option value="">Todos los estados</option><option value="pendiente" selected>Pendientes</option><option value="aprobada">Aprobadas</option><option value="rechazada">Rechazadas</option></select>
          <select id="flt-type" aria-label="Tipo"><option value="">Vendedores y compradores</option><option value="vendedor">Vendedores</option><option value="comprador">Compradores</option></select>
          <input id="flt-q" type="search" placeholder="Buscar empresa, destino, correo…" aria-label="Buscar">
          <button class="btn" id="btn-csv">Descargar Excel (CSV)</button>
        </div>
        <div class="table-wrap"><table class="regs"><thead><tr><th>Empresa</th><th>Tipo</th><th>Detalle</th><th>Contacto</th><th>Estado</th><th>Acciones</th></tr></thead><tbody id="regs-body"></tbody></table></div>
      </section>
      <section class="card"><h2>Datos del evento</h2>
        <form id="f-ev" novalidate>${eventFormFields(ev, lockRegion)}<div class="form-msg"></div><button class="btn btn-primary" type="submit">Guardar evento</button></form>
      </section>
      <section class="card danger-zone"><h2>Eliminar evento</h2>
        <p class="small">Se borra el evento con todas sus inscripciones, contactos y reuniones. No se puede deshacer. Antes, descarga los Excel si necesitas respaldo.</p>
        <button class="btn btn-danger" id="btn-del">Eliminar evento…</button>
        <form id="f-del" hidden novalidate>
          <label>Para confirmar, escribe <strong>ELIMINAR</strong><input name="confirm" autocomplete="off"></label>
          <div class="form-msg"></div>
          <div class="actions"><button class="btn btn-danger" type="submit">Eliminar definitivamente</button><button class="btn btn-ghost" type="button" id="btn-del-cancel">Cancelar</button></div>
        </form>
      </section>`),
      bind(root) {
        const body = $('#regs-body', root);
        const draw = () => {
          const st = $('#flt-st', root).value, ty = $('#flt-type', root).value, q = $('#flt-q', root).value.toLowerCase().trim();
          const list = regs.filter(r => (!st || r.status === st) && (!ty || r.type === ty))
            .filter(r => { const c = cmap[r.uid] || {}; return !q || [r.companyName, r.destination, r.targetMarket, r.products, c.email, c.contactName, r.sernaturRegistry].join(' ').toLowerCase().includes(q); })
            .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
          body.innerHTML = list.length ? list.map(r => {
            const c = cmap[r.uid] || {};
            const detail = r.type === 'vendedor'
              ? `${(r.serviceTypes || []).map(k => esc(I.services[k] ? I.services[k][0] : k)).join(', ')}<br><small>Destino: ${esc(r.destination)} · Reg. SERNATUR: ${esc(r.sernaturRegistry || '—')}</small><details><summary>Productos</summary><p class="pre small">${esc(r.products)}</p></details>`
              : `<small>Mercado objetivo:</small> ${esc(r.targetMarket)}`;
            const comps = (c.companions || []).map(x => esc(x.name + (x.email ? ' <' + x.email + '>' : ''))).join('<br>');
            return `<tr>
              <td><div class="row-start">${logoHtml(r, 'avatar-sm')}<strong>${esc(r.companyName)}</strong></div>${r.website ? `<br><small>${esc(r.website)}</small>` : ''}<br><small class="muted">Inscrito: ${fmtDate(r.createdAt)}</small></td>
              <td>${r.type === 'vendedor' ? 'Vendedor' : 'Comprador'}</td>
              <td>${detail}</td>
              <td>${esc(c.contactName)}<br><small>${esc(c.email)}<br>${esc(c.phone)}</small>${comps ? `<br><small class="muted">Acompañantes:<br>${comps}</small>` : ''}<br><small class="muted">${r.shareContact ? 'Comparte contacto' : 'No comparte contacto'} · ${esc((r.lang || '').toUpperCase())} · ${esc(r.tz || '')}</small></td>
              <td>${statusBadge(r.status, true)}</td>
              <td class="acts">
                ${r.status !== 'aprobada' ? `<button class="btn btn-small btn-ok" data-st="aprobada" data-uid="${esc(r.uid)}">Aprobar</button>` : ''}
                ${r.status !== 'rechazada' ? `<button class="btn btn-small btn-danger" data-st="rechazada" data-uid="${esc(r.uid)}">Rechazar</button>` : ''}
                ${r.status !== 'pendiente' ? `<button class="btn btn-small btn-ghost" data-st="pendiente" data-uid="${esc(r.uid)}">Volver a pendiente</button>` : ''}
              </td></tr>`;
          }).join('') : '<tr><td colspan="6" class="muted">No hay inscripciones con estos filtros.</td></tr>';
          $$('[data-st]', body).forEach(b => b.onclick = async () => {
            $$('[data-st]', body).forEach(x => { x.disabled = true; });
            try {
              const uid = b.getAttribute('data-uid'), st = b.getAttribute('data-st');
              await DB.setRegistrationStatus(id, uid, st);
              regs.find(x => x.uid === uid).status = st;
              const stats = $$('.stat span', root);
              stats[2].textContent = count(null, 'pendiente'); stats[3].textContent = count(null, 'aprobada');
            } catch (err) { alertBox(root, adminErr(err)); }
            draw();
          });
        };
        $('#flt-st', root).onchange = draw; $('#flt-type', root).onchange = draw; $('#flt-q', root).oninput = draw;
        draw();
        $$('[data-copy]', root).forEach(b => b.onclick = async () => {
          const inp = b.previousElementSibling; inp.select();
          try { await navigator.clipboard.writeText(inp.value); } catch (e) { try { document.execCommand('copy'); } catch (x) { } }
          b.textContent = 'Copiado ✓';
        });
        $('#btn-csv', root).onclick = () => {
          const head = ['Empresa', 'Tipo', 'Estado', 'Tipos de servicio', 'Destino', 'Productos', 'Registro SERNATUR', 'Mercado objetivo', 'Descripción', 'Sitio web', 'Contacto', 'Correo', 'Teléfono', 'Acompañantes', 'Comparte contacto', 'Idioma', 'Zona horaria', 'Fecha inscripción'];
          const rows = regs.map(r => { const c = cmap[r.uid] || {}; return [r.companyName, r.type, r.status, (r.serviceTypes || []).map(k => I.services[k] ? I.services[k][0] : k).join(', '), r.destination, r.products, r.sernaturRegistry, r.targetMarket, r.description, r.website, c.contactName, c.email, c.phone, (c.companions || []).map(x => x.name + (x.email ? ' (' + x.email + ')' : '')).join(' / '), r.shareContact ? 'Sí' : 'No', r.lang, r.tz, fmtDate(r.createdAt)]; });
          downloadCsv('inscripciones-' + id + '.csv', [head].concat(rows));
        };
        // grilla
        const fs = $('#f-sched', root); let days = (sc.days || []).slice();
        const toM = x => { const p = String(x || '').split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); };
        const drawSched = () => {
          $('#day-chips', root).innerHTML = days.length ? days.map(d => `<span class="day-chip">${esc(fmtDate(d))}<button type="button" data-rmday="${esc(d)}" aria-label="Quitar">×</button></span>`).join('') : '<span class="muted small">Sin días todavía.</span>';
          $$('[data-rmday]', root).forEach(b => b.onclick = () => { days = days.filter(x => x !== b.getAttribute('data-rmday')); drawSched(); });
          const st = toM(val(fs, 'start')), en = toM(val(fs, 'end')), sl = Number(val(fs, 'slot')) || 0, gp = Number(val(fs, 'gap')) || 0;
          let n = 0; if (sl > 0) for (let m = st; m + sl <= en; m += sl + gp) n++;
          $('#sched-preview', root).textContent = `${n} reuniones posibles por empresa al día · ${n * days.length} en total por empresa.`;
        };
        $('#day-add', root).onclick = () => { const d = $('#day-new', root).value; if (d && !days.includes(d)) { days.push(d); days.sort(); } $('#day-new', root).value = ''; drawSched(); };
        ['start', 'end', 'slot', 'gap'].forEach(n => fs.elements[n].addEventListener('input', drawSched));
        drawSched();
        fs.onsubmit = async e => {
          e.preventDefault();
          if (!days.length) return showError(fs, 'Agrega al menos un día.');
          const schedule = { days, start: val(fs, 'start'), end: val(fs, 'end'), slot: Number(val(fs, 'slot')), gap: Number(val(fs, 'gap')) };
          if (toM(schedule.end) <= toM(schedule.start)) return showError(fs, 'El término debe ser posterior al inicio.');
          try { await DB.updateEvent(id, { schedule }); S.flash = { type: 'ok', msg: 'Grilla guardada.' }; render(); }
          catch (err) { showError(fs, adminErr(err)); }
        };
        const bm = $('#btn-csv-m', root);
        if (bm) bm.onclick = () => {
          const head = ['Bloque (hora Chile)', 'Vendedor', 'Comprador', 'Solicitó', 'Estado', 'Mensaje', 'Creada', 'Respondida'];
          const rows = meetings.map(m => [m.slot, (rmap[m.sellerUid] || {}).companyName, (rmap[m.buyerUid] || {}).companyName, (rmap[m.requesterUid] || {}).companyName, m.status, m.note, fmtDate(m.createdAt), fmtDate(m.respondedAt)]);
          downloadCsv('reuniones-' + id + '.csv', [head].concat(rows));
        };
        // salas
        const rmsg = $('#rooms-msg', root);
        const say = (txt, bad) => { rmsg.className = 'form-msg ' + (bad ? 'error' : 'ok'); rmsg.textContent = txt; };
        $('#btn-rooms', root).onclick = async () => {
          const b = $('#btn-rooms', root); b.disabled = true; let total = 0; const errs = [];
          try {
            for (let i = 0; i < 20; i++) {
              say('Creando salas… ' + total + ' listas');
              const r = await DB.createRooms(id); total += r.created; errs.push(...r.errors);
              if (!r.remaining || (!r.created && r.errors.length)) break;
            }
            S.flash = { type: errs.length ? 'error' : 'ok', msg: `Salas creadas: ${total}.` + (errs.length ? ' Errores: ' + errs.join(' · ') : '') }; render();
          } catch (err) { b.disabled = false; say(adminErr(err), true); }
        };
        $('#btn-sync', root).onclick = async () => {
          try { const r = await DB.syncGuests(id); say(`Invitados actualizados en ${r.synced} salas.` + (r.errors.length ? ' Errores: ' + r.errors.join(' · ') : ''), r.errors.length); }
          catch (err) { say(adminErr(err), true); }
        };
        $$('[data-room-save]', root).forEach(b => b.onclick = async () => {
          const uid = b.getAttribute('data-room-save'); const v = $(`[data-room-input="${uid}"]`, root).value.trim();
          try { await DB.setRoom(id, uid, v); S.flash = { type: 'ok', msg: 'Link de sala guardado.' }; render(); }
          catch (err) { say(adminErr(err), true); }
        });
        const br = $('#btn-csv-r', root);
        if (br) br.onclick = () => {
          const out = o => o ? ({ negocio: 'Negocio concretado', seguimiento: 'Seguimiento', sin_interes: 'Sin interés' }[o] || o) : '';
          const head = ['Bloque (hora Chile)', 'Vendedor', 'Comprador', 'Ingreso vendedor', 'Ingreso comprador', 'Realizada (vendedor)', 'Realizada (comprador)', 'Interés vendedor', 'Interés comprador', 'Resultado vendedor', 'Resultado comprador', 'Expectativa vendedor US$', 'Expectativa comprador US$', 'Comentario vendedor', 'Comentario comprador'];
          const rows = conf.slice().sort((a, b) => a.slot.localeCompare(b.slot)).map(m => {
            const v = (sv[m.id] || {}).vendedor || {}, c = (sv[m.id] || {}).comprador || {};
            const hora = x => x ? new Date(x).toLocaleString('es-CL', { timeZone: 'America/Santiago' }) : '';
            return [m.slot, (rmap[m.sellerUid] || {}).companyName, (rmap[m.buyerUid] || {}).companyName, hora(m.sellerJoinedAt), hora(m.buyerJoinedAt), v.held || '', c.held || '', v.interest || '', c.interest || '', out(v.outcome), out(c.outcome), v.amount || '', c.amount || '', v.comment || '', c.comment || ''];
          });
          downloadCsv('resultados-' + id + '.csv', [head].concat(rows));
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
        const fe = $('#f-ev', root);
        fe.onsubmit = async e => {
          e.preventDefault();
          const r = readEventForm(fe, lockRegion ? ev.regionId : null); if (r.error) return showError(fe, r.error);
          try { await DB.updateEvent(id, r.data); S.flash = { type: 'ok', msg: 'Evento guardado.' }; render(); }
          catch (err) { showError(fe, adminErr(err)); }
        };
      }
    };
  }

  // ---------- inicio ----------
  async function refreshAuth(u) {
    S.user = u ? { uid: u.uid, email: String(u.email || '').toLowerCase() } : null;
    S.isSuper = false; S.admin = null;
    if (S.user) { try { const r = await DB.getRoles(); S.isSuper = !!r.isSuper; S.admin = r.admin || null; } catch (e) { } }
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
