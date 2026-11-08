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
    agenda: 'Agenda abierta (se habilita en etapa 2)', reuniones: 'Día de reuniones (etapa 3)', cerrado: 'Cerrado'
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
    console.error(e); return t('err_generic');
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
  function bindPhotos(root) {
    heroTimers.forEach(clearInterval); heroTimers = [];
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
  function myStatusBox(mine) {
    return `<div class="card status-box"><div><p class="kicker">${t('my_status')}</p><p><strong>${esc(mine.companyName)}</strong> · ${t('role_' + mine.type)} ${statusBadge(mine.status)}</p></div>
      <a class="btn" href="#/mi">${t('go_account')}</a></div>`;
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
          ${mine ? myStatusBox(mine) : ''}
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
    if (mine) cta = myStatusBox(mine);
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
      companyName: val(form, 'companyName'), description: val(form, 'description'), website: val(form, 'website'),
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

  async function viewRegister(id, type) {
    const ev = await DB.getEvent(id);
    if (!ev) return notFound();
    const head = `<p class="small"><a href="#/evento/${enc(id)}/${type}es">← ${esc(ev.name)}</a></p>` + pageHead(`<span class="role-dot">${ICON[type]}</span> ${t('for_' + type)}`, t('reg_title_' + type), esc(ev.name));
    if (ev.phase !== 'inscripcion') return { html: page(head + `<div class="card narrow"><p>${t('reg_closed')}</p></div>`) };
    const mine = await myRegFor(id);
    if (mine) return { html: page(head + myStatusBox(mine)) };
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
        const form = $('#f-reg', root);
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
        const form = $('#f-prof', root);
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
      return `<article class="card mine">
        <div class="mine-photo" data-photo="${esc(JSON.stringify(photosFor(ev)))}"></div>
        <div class="mine-body">
          <div class="row-between"><span class="badge ph-${esc(ev.phase)}">${esc(phaseLabel(ev.phase))}</span>${statusBadge(r.status)}</div>
          <h3>${esc(ev.name)}</h3>
          <p class="muted">${esc(r.companyName)} · ${t('as')} ${t('role_' + r.type).toLowerCase()}</p>
          ${r.status === 'pendiente' ? `<p class="small">${t('pending_note')}</p>` : ''}
          <div class="actions">
            ${canCatalog ? `<a class="btn btn-primary" href="#/evento/${eid}/catalogo">${t('catalog')}</a>` : ''}
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
      html: page(`<p class="small"><a href="#/evento/${eid}">← ${esc(ev.name)}</a></p>` + pageHead(t('catalog'), '', '') + `
        <div class="filters card">
          ${!approved ? `<select id="cat-type" aria-label="Tipo"><option value="vendedor">${t('catalog_sellers')}</option><option value="comprador">${t('catalog_buyers')}</option></select>` : ''}
          <input id="cat-q" type="search" placeholder="${esc(t('search'))}" aria-label="${esc(t('search'))}">
          <select id="cat-svc" aria-label="${esc(t('service_types'))}"><option value="">${t('all_services')}</option>${Object.keys(I.services).map(k => `<option value="${k}">${esc(svc(k))}</option>`).join('')}</select>
        </div>
        <p class="muted small" id="cat-count"></p>
        <div class="grid" id="cat-list"></div>
        <p class="notice">${t('agenda_soon')}</p>`),
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
              <div class="avatar">${initials(r.companyName)}</div>
              <h3>${esc(r.companyName)}</h3>${companySummary(r)}
              <span class="more">${t('view_company')} →</span></a>`).join('')
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
    const contactHtml = contact ? `<dl class="facts">
        <dt>${t('contact_name')}</dt><dd>${esc(contact.contactName)}</dd>
        <dt>${t('email')}</dt><dd><a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></dd>
        <dt>${t('phone')}</dt><dd>${esc(contact.phone)}</dd></dl>` : `<p class="muted">${t('no_share')}</p>`;
    return {
      html: page(`<p class="small"><a href="#/evento/${enc(id)}/catalogo">← ${t('catalog')}</a></p>
      <article class="card narrow company-detail">
        <div class="row-start"><div class="avatar avatar-lg">${initials(r.companyName)}</div>
        <div><span class="badge">${t('role_' + r.type)}</span><h1>${esc(r.companyName)}</h1></div></div>
        ${companySummary(r)}
        ${r.type === 'vendedor' ? `<h3>${t('products')}</h3><p class="pre">${esc(r.products)}</p>` : ''}
        ${r.description ? `<p class="pre">${esc(r.description)}</p>` : ''}
        ${r.website && /^https?:\/\//i.test(r.website) ? `<p><a href="${esc(r.website)}" target="_blank" rel="noopener">${esc(r.website)}</a></p>` : ''}
        <h3>${t('contact')}</h3>${contactHtml}
        <p class="notice">${t('agenda_soon')}</p>
      </article>`)
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
          catch (err) { showError(fe, errMsg(err)); }
        };
        const fa = $('#f-admin', root);
        if (fa) fa.onsubmit = async e => {
          e.preventDefault();
          const email = val(fa, 'email').toLowerCase();
          if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return showError(fa, 'Correo no válido.');
          try { await DB.setAdmin(email, { name: val(fa, 'name'), regionId: val(fa, 'regionId') }); S.flash = { type: 'ok', msg: 'Administrador agregado.' }; render(); }
          catch (err) { showError(fa, errMsg(err)); }
        };
        $$('[data-rm]', root).forEach(b => b.onclick = async () => {
          b.disabled = true;
          try { await DB.removeAdmin(b.getAttribute('data-rm')); S.flash = { type: 'ok', msg: 'Administrador quitado.' }; render(); }
          catch (err) { b.disabled = false; alertBox(root, errMsg(err)); }
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
    const [regs, contacts] = await Promise.all([DB.listRegistrations(id), DB.listContacts(id)]);
    const cmap = {}; contacts.forEach(c => { cmap[c.uid] = c; });
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
              <td><strong>${esc(r.companyName)}</strong>${r.website ? `<br><small>${esc(r.website)}</small>` : ''}<br><small class="muted">Inscrito: ${fmtDate(r.createdAt)}</small></td>
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
            } catch (err) { alertBox(root, errMsg(err)); }
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
        const fe = $('#f-ev', root);
        fe.onsubmit = async e => {
          e.preventDefault();
          const r = readEventForm(fe, lockRegion ? ev.regionId : null); if (r.error) return showError(fe, r.error);
          try { await DB.updateEvent(id, r.data); S.flash = { type: 'ok', msg: 'Evento guardado.' }; render(); }
          catch (err) { showError(fe, errMsg(err)); }
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
  function init() {
    S.lang = detectLang(); document.documentElement.lang = S.lang;
    document.title = CFG.appName + ' · ' + (CFG.appTagline || '');
    if (CFG.mode === 'sheets') {
      if (!CFG.apiUrl) { $('#main').innerHTML = page('<div class="card narrow"><p class="error">Falta la dirección del servidor (apiUrl) en config.js. Ver LEEME.md.</p></div>'); return; }
      DB = window.RN_createSheetsDB(CFG);
    } else DB = window.RN_LocalDB;
    DB.onAuth(async u => {
      if (S.busy) return;
      await refreshAuth(u);
      S.ready = true; render();
    });
    window.addEventListener('hashchange', render);
  }
  document.addEventListener('DOMContentLoaded', init);
})();
