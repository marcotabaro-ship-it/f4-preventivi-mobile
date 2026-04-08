/* ============================================================
   F4 PREVENTIVI MOBILE — app.js v2.1
   M1: Rubrica potenziata con getAnagrafiche
   M4: Admin Template Management (doPost)
   ============================================================ */
'use strict';

/* ============================================================
   STATO APPLICAZIONE
   ============================================================ */
const STATE = {
  user:               null,
  role:               null,
  isSuperUser:        false,
  isUfficio:          false,
  isAdmin:            false,
  dati:               [],
  anagrafiche:        [],       // M1: lista clienti da getAnagrafiche
  configTemplate:     [],       // M4: stato templates
  utentiRaggruppati:  {},
  currentPage:        'kpi',
  ricevutiSegment:    'ricevuti',
  filtri: {
    dal:         '',
    al:          '',
    commerciale: '',
    testo:       '',
    tipo:        '',
    sigla:       '',
    stato:       ''
  },
  lastUpdate: null
};


/* ============================================================
   API — CHIAMATE AL BACKEND APPS SCRIPT
   ============================================================ */
async function apiCall(action, params = {}) {
  const url = new URL(SCRIPT_URL);
  url.searchParams.set('action', action);
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, String(v));
  }
  const response = await fetch(url.toString(), {
    method: 'GET',
    redirect: 'follow',
    cache: 'no-store'
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Risposta non valida dal server. Riprova.');
  }
}

async function apiPost(payload) {
  const response = await fetch(SCRIPT_URL, {
    method: 'POST',
    redirect: 'follow',
    body: JSON.stringify(payload)
    // Nessun Content-Type esplicito: usa text/plain — nessun CORS preflight
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Risposta non valida dal server dopo il caricamento.');
  }
}


/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  const vEl = document.getElementById('loginVersion');
  if (vEl) vEl.textContent = 'v' + APP_VERSION;
  initLogin();
});


/* ============================================================
   LOGIN
   ============================================================ */
async function initLogin() {
  showLoader('loginLoader', true);
  document.getElementById('btnLogin').disabled = true;
  try {
    const utenti = await apiCall('getUtenti');
    STATE.utentiRaggruppati = utenti || {};
    const rSel = document.getElementById('loginReparto');
    rSel.innerHTML = '<option value="">Scegli Reparto Operativo...</option>';
    Object.keys(utenti).sort().forEach(ruolo => {
      rSel.innerHTML += `<option value="${ruolo}">${ruolo}</option>`;
    });
    document.getElementById('btnLogin').disabled = false;
  } catch (e) {
    showError('loginError', 'Errore connessione. Verifica la rete e ricarica.');
  } finally {
    showLoader('loginLoader', false);
  }
}

function onRepartoChange() {
  const rep = document.getElementById('loginReparto').value;
  const box = document.getElementById('loginNomeBox');
  const sel = document.getElementById('loginNome');
  if (!rep) { box.style.display = 'none'; sel.innerHTML = ''; return; }
  sel.innerHTML = '<option value="">Seleziona identificativo...</option>';
  (STATE.utentiRaggruppati[rep] || []).forEach(nome => {
    sel.innerHTML += `<option value="${nome}">${nome}</option>`;
  });
  box.style.display = 'block';
}

async function doLogin() {
  const nome = document.getElementById('loginNome').value;
  const pwd  = document.getElementById('loginPwd').value;
  const rep  = document.getElementById('loginReparto').value;
  document.getElementById('loginError').style.display = 'none';
  if (!rep || !nome || !pwd) { showError('loginError', 'Compila tutti i campi per accedere.'); return; }
  showLoader('loginLoader', true);
  document.getElementById('btnLogin').disabled = true;
  try {
    const res = await apiCall('login', { nome, pwd });
    if (res.successo) { handleLoginSuccess(res); }
    else { showError('loginError', res.messaggio || 'Credenziali non valide.'); document.getElementById('btnLogin').disabled = false; }
  } catch (e) {
    showError('loginError', 'Errore di connessione. Riprova.'); document.getElementById('btnLogin').disabled = false;
  } finally {
    showLoader('loginLoader', false);
  }
}

function handleLoginSuccess(res) {
  STATE.user       = res.nome;
  STATE.role       = res.ruolo;
  STATE.isSuperUser = (
    ['Administrator', 'Responsabile Commerciale', 'Direzione'].includes(res.ruolo) ||
    res.nome === 'Reverdito Andrea'
  );
  STATE.isUfficio  = (res.ruolo === 'Ufficio Preventivi');
  STATE.isAdmin    = (res.ruolo === 'Administrator');

  const hU = document.getElementById('headerUser');
  if (hU) hU.textContent = STATE.user + ' — ' + STATE.role;

  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appScreen').style.display   = 'flex';

  setupNav();

  // Periodo di default: ultimi 6 mesi
  const now  = new Date();
  const al   = fmtDateInput(now);
  now.setMonth(now.getMonth() - 6);
  const dal  = fmtDateInput(now);
  STATE.filtri.dal = dal; STATE.filtri.al = al;
  document.getElementById('filterDal').value = dal;
  document.getElementById('filterAl').value  = al;

  if (STATE.isSuperUser || STATE.isUfficio) {
    const box = document.getElementById('filterCommBox');
    if (box) box.style.display = 'block';
    const sel = document.getElementById('filterComm');
    if (sel) {
      sel.innerHTML = '<option value="">Tutti (Visione Globale)</option>';
      Object.values(STATE.utentiRaggruppati).flat().sort().forEach(n => {
        sel.innerHTML += `<option value="${n}">${n}</option>`;
      });
    }
  }

  if (STATE.isUfficio) {
    const navKpi = document.getElementById('navKpi');
    if (navKpi) navKpi.style.display = 'none';
  }

  loadData();
  loadAnagrafiche();

  // M4: Admin nav visibile ai superuser
  if (STATE.isSuperUser || STATE.isAdmin) {
    const navAdmin = document.getElementById('navAdmin');
    if (navAdmin) navAdmin.style.display = 'flex';
    loadConfigTemplate();
  }

  navigateTo(STATE.isUfficio ? 'lavorazione' : 'kpi');
}

function setupNav() {}

function logout() {
  STATE.user = null; STATE.dati = []; STATE.anagrafiche = []; STATE.configTemplate = [];
  document.getElementById('appScreen').style.display   = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('loginPwd').value            = '';
  document.getElementById('loginReparto').value        = '';
  document.getElementById('loginNomeBox').style.display = 'none';
  document.getElementById('loginError').style.display   = 'none';
  document.getElementById('btnLogin').disabled          = false;
  const navAdmin = document.getElementById('navAdmin');
  if (navAdmin) navAdmin.style.display = 'none';
  const navContOut = document.getElementById('navContatti');
  if (navContOut) navContOut.style.display = 'none';
}


/* ============================================================
   NAVIGAZIONE
   ============================================================ */
function navigateTo(page) {
  STATE.currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  const target = document.getElementById('page' + cap(page));
  if (target) target.style.display = 'block';
  updateNavBar(page);
  renderCurrentPage();
}

function renderCurrentPage() {
  switch (STATE.currentPage) {
    case 'kpi':          renderKPI();          break;
    case 'lavorazione':  renderLavorazione();  break;
    case 'ricevuti':     renderRicevuti();     break;
    case 'vinti':        renderVinti();        break;
    case 'rubrica':      renderRubrica();      break;
    case 'admin':        renderAdmin();        break;
    case 'contatti':     renderContattiMobile(); break;
  }
}

function updateNavBar(page) {
  document.querySelectorAll('#bottomNav button').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('nav' + cap(page));
  if (btn) btn.classList.add('active');
}


/* ============================================================
   CARICAMENTO DATI
   ============================================================ */
async function loadData() {
  setLoadingState(true);
  try {
    let dati;
    if (STATE.isSuperUser || STATE.isUfficio) {
      dati = await apiCall('getTuttiPreventivi', { dal: STATE.filtri.dal, al: STATE.filtri.al });
    } else {
      dati = await apiCall('getPreventiviCommerciale', { nome: STATE.user, dal: STATE.filtri.dal, al: STATE.filtri.al });
    }
    STATE.dati       = processData(Array.isArray(dati) ? dati : []);
    STATE.lastUpdate = new Date();
    const inf = document.getElementById('lastUpdateInfo');
    if (inf) {
      inf.textContent = 'Dati aggiornati alle ' + STATE.lastUpdate.toLocaleTimeString('it-IT') +
                        ' — ' + STATE.dati.length + ' preventivi totali.';
    }
    renderCurrentPage();
    showToast('Dati aggiornati', 'success');
  } catch (e) {
    showToast('Errore caricamento: ' + e.message, 'error');
  } finally {
    setLoadingState(false);
  }
}

/* M1 — Carica anagrafiche per Rubrica potenziata */
async function loadAnagrafiche() {
  try {
    const lista = await apiCall('getAnagrafiche');
    STATE.anagrafiche = Array.isArray(lista) ? lista : [];
    // Ri-renderizza rubrica se attiva
    if (STATE.currentPage === 'rubrica') renderRubrica();
  } catch (e) {
    STATE.anagrafiche = [];
  }
}

/* M4 — Carica stato templates */
async function loadConfigTemplate() {
  try {
    const cfg = await apiCall('getConfigTemplate');
    STATE.configTemplate = Array.isArray(cfg) ? cfg : [];
    if (STATE.currentPage === 'admin') renderAdmin();
  } catch (e) {
    STATE.configTemplate = [];
  }
}

function processData(dati) {
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  return dati.map(p => {
    if (p.dataInserimento) {
      const start = new Date(p.dataInserimento);
      const end   = p.dataRicezione ? new Date(p.dataRicezione) : oggi;
      p.giorniTrascorsi = calcolaGiorniLav(start, end);
      p.ggPrevisti      = p.dataPrevista ? calcolaGiorniLav(start, new Date(p.dataPrevista)) : 8;
      p.inRitardo = p.giorniTrascorsi > p.ggPrevisti && !p.dataRicezione;
    } else { p.giorniTrascorsi = 0; p.ggPrevisti = 8; p.inRitardo = false; }
    p.hasPhone   = !!(p.telefono && p.telefono.trim() && p.telefono !== '-');
    p.hasEmail   = !!(p.email    && p.email.trim()    && p.email    !== '-');
    p.hasAddress = !!(p.indirizzo && p.indirizzo.trim()) || !!(p.comune && p.comune.trim());
    return p;
  });
}

function calcolaGiorniLav(start, end) {
  const s = new Date(start); s.setHours(0, 0, 0, 0);
  const e = new Date(end);   e.setHours(0, 0, 0, 0);
  let count = 0, cur = new Date(s);
  while (cur < e) { const d = cur.getDay(); if (d !== 0 && d !== 6) count++; cur.setDate(cur.getDate() + 1); }
  return count;
}

function getFilteredData() {
  return STATE.dati.filter(p => {
    if (STATE.filtri.commerciale && p.commerciale !== STATE.filtri.commerciale) return false;
    if (STATE.filtri.tipo && !(p.tipoIntervento || '').toLowerCase().includes(STATE.filtri.tipo.toLowerCase())) return false;
    if (STATE.filtri.sigla && !(p.siglaProdotto || '').toLowerCase().includes(STATE.filtri.sigla.toLowerCase())) return false;
    return true;
  });
}


/* ============================================================
   RENDER — DASHBOARD KPI
   ============================================================ */
function renderKPI() {
  const d     = getFilteredData();
  const att   = d.filter(p => p.dataRicezione === '');
  const ric   = d.filter(p => p.dataRicezione !== '' && p.dataConsegna === '');
  const cons  = d.filter(p => p.dataConsegna  !== '' && (p.stato === 'IN ATTESA' || p.stato === ''));
  const vinti = d.filter(p => p.stato === 'VINTO');
  const persi = d.filter(p => p.stato === 'PERSO');
  const daRev = d.filter(p => p.stato === 'DA REVISIONARE');
  const ritardo = att.filter(p => p.inRitardo).length;
  const updStr  = STATE.lastUpdate ? 'Aggiornato: ' + STATE.lastUpdate.toLocaleTimeString('it-IT') : '';
  document.getElementById('pageKpi').innerHTML = `
    <div class="page-header">
      <h2>Dashboard</h2>
      <span class="last-update">${updStr}</span>
    </div>
    <div class="kpi-grid">
      <div class="kpi-card kpi-lav" onclick="navigateTo('lavorazione')">
        <div class="kpi-icon">🔧</div><div class="kpi-num">${att.length}</div><div class="kpi-label">In Lavorazione</div>
      </div>
      <div class="kpi-card kpi-ric" onclick="navigateTo('ricevuti'); setSegment('ricevuti')">
        <div class="kpi-icon">📥</div><div class="kpi-num">${ric.length}</div><div class="kpi-label">Ricevuti</div>
      </div>
      <div class="kpi-card kpi-cons" onclick="navigateTo('ricevuti'); setSegment('consegnati')">
        <div class="kpi-icon">📦</div><div class="kpi-num">${cons.length}</div><div class="kpi-label">Consegnati</div>
      </div>
      <div class="kpi-card kpi-vinti" onclick="STATE.filtri.stato='VINTO'; navigateTo('vinti')">
        <div class="kpi-icon">🏆</div><div class="kpi-num">${vinti.length}</div><div class="kpi-label">Vinti</div>
      </div>
      <div class="kpi-card kpi-persi" onclick="STATE.filtri.stato='PERSO'; navigateTo('vinti')">
        <div class="kpi-icon">❌</div><div class="kpi-num">${persi.length}</div><div class="kpi-label">Persi</div>
      </div>
      <div class="kpi-card kpi-rev" onclick="STATE.filtri.stato='DA REVISIONARE'; navigateTo('vinti')">
        <div class="kpi-icon">🔄</div><div class="kpi-num">${daRev.length}</div><div class="kpi-label">Revisione</div>
      </div>
    </div>
    <div class="kpi-total">
      Totale preventivi nel periodo: <strong>${d.length}</strong>
      ${ritardo > 0 ? `&nbsp;·&nbsp;<span style="color:var(--c-persi); font-weight:700;">⚠️ ${ritardo} in ritardo</span>` : ''}
    </div>`;
}


/* ============================================================
   RENDER — IN LAVORAZIONE
   ============================================================ */
function renderLavorazione() {
  const search = STATE.filtri.testo.toLowerCase();
  let att = getFilteredData().filter(p => p.dataRicezione === '');
  if (search) att = att.filter(p => (p.nomeCommessa || '').toLowerCase().includes(search) || (p.cliente || '').toLowerCase().includes(search) || (p.siglaProdotto || '').toLowerCase().includes(search));
  att.sort((a, b) => (a.priorita || 999) - (b.priorita || 999));
  const label = STATE.isUfficio ? 'Cruscotto Globale' : 'In Lavorazione';
  document.getElementById('pageLavorazione').innerHTML = `
    <div class="page-header">
      <h2>${label} <span class="count-badge">${att.length}</span></h2>
      <button class="btn-pdf-small" onclick="exportPDF('lavorazione')">🖨️ PDF</button>
    </div>
    <div class="search-bar">
      <input type="text" id="searchLav" placeholder="🔍 Cerca commessa, cliente, sigla..."
             value="${STATE.filtri.testo}" oninput="STATE.filtri.testo=this.value; renderLavorazione()">
    </div>
    <div class="cards-list">
      ${att.length === 0 ? '<div class="empty-state">Nessun preventivo in lavorazione</div>' : att.map(p => buildCard(p, 'lavorazione')).join('')}
    </div>`;
}


/* ============================================================
   RENDER — RICEVUTI / CONSEGNATI
   ============================================================ */
function renderRicevuti() {
  const data     = getFilteredData();
  const ricevuti = data.filter(p => p.dataRicezione !== '' && p.dataConsegna === '');
  const consegn  = data.filter(p => p.dataConsegna !== '' && (p.stato === 'IN ATTESA' || p.stato === ''));
  const seg    = STATE.ricevutiSegment;
  const shown  = seg === 'ricevuti' ? ricevuti : consegn;
  const label  = seg === 'ricevuti' ? 'Ricevuti' : 'Consegnati';
  document.getElementById('pageRicevuti').innerHTML = `
    <div class="page-header">
      <h2>${label} <span class="count-badge">${shown.length}</span></h2>
      <button class="btn-pdf-small" onclick="exportPDF('${seg}')">🖨️ PDF</button>
    </div>
    <div class="segment-control">
      <button class="${seg === 'ricevuti' ? 'seg-active' : ''}" onclick="setSegment('ricevuti')">📥 Ricevuti (${ricevuti.length})</button>
      <button class="${seg === 'consegnati' ? 'seg-active' : ''}" onclick="setSegment('consegnati')">📦 Consegnati (${consegn.length})</button>
    </div>
    <div class="cards-list">
      ${shown.length === 0 ? '<div class="empty-state">Nessun dato</div>' : shown.map(p => buildCard(p, seg)).join('')}
    </div>`;
}

function setSegment(seg) {
  STATE.ricevutiSegment = seg;
  if (STATE.currentPage === 'ricevuti') renderRicevuti();
  else navigateTo('ricevuti');
}


/* ============================================================
   RENDER — VINTI / PERSI
   ============================================================ */
function renderVinti() {
  let vnt = getFilteredData().filter(p => p.stato === 'VINTO' || p.stato === 'PERSO' || p.stato === 'DA REVISIONARE');
  if (STATE.filtri.stato) vnt = vnt.filter(p => p.stato === STATE.filtri.stato);
  vnt.sort((a, b) => (b.dataChiusura || '').localeCompare(a.dataChiusura || ''));
  const nTot = vnt.length, nV = vnt.filter(p => p.stato === 'VINTO').length, nP = vnt.filter(p => p.stato === 'PERSO').length, nR = vnt.filter(p => p.stato === 'DA REVISIONARE').length;
  document.getElementById('pageVinti').innerHTML = `
    <div class="page-header">
      <h2>Vinti / Persi <span class="count-badge">${nTot}</span></h2>
      <button class="btn-pdf-small" onclick="exportPDF('vinti')">🖨️ PDF</button>
    </div>
    <div class="stato-filter-row">
      ${[{val:'',label:'Tutti',n:nTot},{val:'VINTO',label:'🏆 Vinti',n:nV},{val:'PERSO',label:'❌ Persi',n:nP},{val:'DA REVISIONARE',label:'🔄 Revisione',n:nR}].map(s => `<button class="chip ${STATE.filtri.stato===s.val?'chip-active':''}" onclick="STATE.filtri.stato='${s.val}'; renderVinti()">${s.label} (${s.n})</button>`).join('')}
    </div>
    <div class="cards-list">
      ${vnt.length === 0 ? '<div class="empty-state">Nessun dato</div>' : vnt.map(p => buildCard(p, 'vinti')).join('')}
    </div>`;
}


/* ============================================================
   M1 — RENDER RUBRICA (potenziata con getAnagrafiche)
   ============================================================ */
function renderRubrica() {
  const searchVal = document.getElementById('searchRubrica')?.value || '';
  const search    = searchVal.toLowerCase();

  // Usa STATE.anagrafiche se disponibile (piu completo), altrimenti aggrega da preventivi
  let clienti;
  if (STATE.anagrafiche.length > 0) {
    clienti = mergeAnagrafiche(STATE.anagrafiche, STATE.dati);
  } else {
    clienti = aggregateClienti(STATE.dati);
  }

  const filtrati = search
    ? clienti.filter(c =>
        c.nome.toLowerCase().includes(search) ||
        (c.comune    || '').toLowerCase().includes(search) ||
        (c.provincia || '').toLowerCase().includes(search) ||
        (c.telefono  || '').includes(search)
      )
    : clienti;

  filtrati.sort((a, b) => a.nome.localeCompare(b.nome, 'it', { sensitivity: 'base' }));

  let lastLetter = '';
  const cardsHtml = filtrati.map(c => {
    const letter  = (c.nome[0] || '#').toUpperCase();
    let divider   = '';
    if (letter !== lastLetter) { divider = `<div class="alpha-divider">${letter}</div>`; lastLetter = letter; }
    return divider + buildRubricaCard(c);
  }).join('');

  const srcLabel = STATE.anagrafiche.length > 0
    ? `<span class="rubrica-source-badge">Database completo (${STATE.anagrafiche.length})</span>`
    : `<span class="rubrica-source-badge rubrica-source-parz">Da preventivi (${filtrati.length})</span>`;

  document.getElementById('pageRubrica').innerHTML = `
    <div class="page-header">
      <h2>Rubrica <span class="count-badge">${filtrati.length}</span></h2>
      ${srcLabel}
    </div>
    <div class="search-bar">
      <input type="text" id="searchRubrica" placeholder="🔍 Cerca cliente, comune, provincia..."
             value="${searchVal}" oninput="renderRubrica()">
    </div>
    <div class="cards-list" style="gap:12px;">
      ${filtrati.length === 0 ? '<div class="empty-state">Nessun cliente trovato</div>' : cardsHtml}
    </div>`;
}

/**
 * Unisce i dati di getAnagrafiche con le statistiche preventivi
 * per ottenere una rubrica completa.
 */
function mergeAnagrafiche(anagrafiche, dati) {
  // Mappa preventivi per cliente
  const prevMap = {};
  dati.forEach(p => {
    const nome = (p.cliente || '').trim();
    if (!nome) return;
    if (!prevMap[nome]) prevMap[nome] = [];
    prevMap[nome].push({ id: p.nomeCommessa || '', stato: p.stato || '', data: p.dataInserimento || '', tipo: p.tipoIntervento || '', sigla: p.siglaProdotto || '' });
  });

  return anagrafiche.map(a => ({
    nome:      a.cliente,
    telefono:  a.telefono,
    email:     a.email,
    indirizzo: a.indirizzo,
    civico:    a.civico,
    cap:       a.cap,
    comune:    a.comune,
    provincia: a.provincia,
    preventivi: prevMap[a.cliente] || []
  }));
}

function aggregateClienti(dati) {
  const map = {};
  dati.forEach(p => {
    const nome = (p.cliente || '').trim(); if (!nome) return;
    if (!map[nome]) map[nome] = { nome, telefono: '', email: '', indirizzo: '', civico: '', cap: '', comune: '', provincia: '', preventivi: [] };
    const c = map[nome];
    if (!c.telefono  && p.telefono  && p.telefono  !== '-') c.telefono  = p.telefono;
    if (!c.email     && p.email     && p.email     !== '-') c.email     = p.email;
    if (!c.indirizzo && p.indirizzo) c.indirizzo = p.indirizzo;
    if (!c.civico    && p.civico)    c.civico    = p.civico;
    if (!c.cap       && p.cap)       c.cap       = p.cap;
    if (!c.comune    && p.comune)    c.comune    = p.comune;
    if (!c.provincia && p.provincia) c.provincia = p.provincia;
    c.preventivi.push({ id: p.nomeCommessa || '', stato: p.stato || '', data: p.dataInserimento || '', tipo: p.tipoIntervento || '', sigla: p.siglaProdotto || '' });
  });
  return Object.values(map);
}

function buildRubricaCard(c) {
  const hasPhone = !!(c.telefono && c.telefono.trim());
  const hasEmail = !!(c.email    && c.email.trim());
  const hasAddr  = !!(c.comune   && c.comune.trim());
  const addrFull = [c.indirizzo, c.civico, c.cap, c.comune, c.provincia ? `(${c.provincia})` : ''].filter(Boolean).join(' ');
  const nPrev    = c.preventivi.length;
  const nVinti   = c.preventivi.filter(p => p.stato === 'VINTO').length;
  const initials = getInitials(c.nome);
  return `
    <div class="rubrica-card">
      <div class="rubrica-header">
        <div class="avatar" style="background:${avatarColor(c.nome)}">${initials}</div>
        <div class="rubrica-info">
          <div class="rubrica-nome">${escHtml(c.nome)}</div>
          ${hasAddr ? `<div class="rubrica-addr">📍 ${escHtml(c.comune)}${c.provincia ? ' (' + c.provincia + ')' : ''}</div>` : ''}
        </div>
        <div class="rubrica-stats">
          <span class="badge-mini">${nPrev} prev.</span>
          ${nVinti > 0 ? `<span class="badge-mini badge-vinti">${nVinti} ✓</span>` : ''}
        </div>
      </div>
      <div class="contact-actions">
        ${hasPhone ? `<a href="tel:${encodeURI(c.telefono.replace(/\s/g,''))}" class="contact-btn contact-phone"><span class="contact-icon">📞</span><span class="contact-label">${escHtml(c.telefono)}</span></a>` : ''}
        ${hasEmail ? `<a href="mailto:${encodeURI(c.email)}" class="contact-btn contact-email"><span class="contact-icon">✉️</span><span class="contact-label">${escHtml(c.email)}</span></a>` : ''}
        ${hasAddr  ? `<a href="https://maps.google.com/?q=${encodeURIComponent(addrFull)}" target="_blank" rel="noopener" class="contact-btn contact-maps"><span class="contact-icon">🗺️</span><span class="contact-label">${escHtml(addrFull)}</span></a>` : ''}
        ${!hasPhone && !hasEmail && !hasAddr ? `<span style="font-size:12px;color:#bdc3c7;padding:6px 0;">Nessun contatto disponibile</span>` : ''}
      </div>
      ${nPrev > 0 ? `
      <details class="prev-list">
        <summary>${nPrev} Preventiv${nPrev === 1 ? 'o' : 'i'} collegati</summary>
        <div class="prev-list-items">
          ${c.preventivi.sort((a, b) => (b.data || '').localeCompare(a.data || '')).map(p => `
            <div class="prev-item">
              <span class="prev-nome">${escHtml(p.id || 'N/D')}</span>
              <span class="stato-chip ${statoClass(p.stato)}">${p.stato || 'N/D'}</span>
            </div>`).join('')}
        </div>
      </details>` : ''}
    </div>`;
}


/* ============================================================
   M4 — RENDER ADMIN (Gestione Template)
   ============================================================ */
function renderAdmin() {
  const pageEl = document.getElementById('pageAdmin');
  if (!pageEl) return;

  const isAdmin  = STATE.isAdmin;
  const cfgSer   = STATE.configTemplate.find(t => t.tipo === 'SERRAMENTI')    || { tipo: 'SERRAMENTI',    versione: 0, fileName: '', dataAggiornamento: '' };
  const cfgPor   = STATE.configTemplate.find(t => t.tipo === 'PORTE_INTERNE') || { tipo: 'PORTE_INTERNE', versione: 0, fileName: '', dataAggiornamento: '' };

  pageEl.innerHTML = `
    <div class="page-header">
      <h2>Gestione Template <span class="count-badge admin-badge">ADMIN</span></h2>
      <button class="btn-pdf-small" style="background:#8e44ad;" onclick="loadConfigTemplate(); showToast('Stato aggiornato', 'success')">🔄</button>
    </div>

    <!-- Stato attuale templates -->
    <div class="admin-section">
      <div class="admin-section-title">Stato Templates Attuali</div>

      <div class="template-status-card ${cfgSer.versione > 0 ? 'tsc-ok' : 'tsc-empty'}">
        <div class="tsc-header">
          <span class="tsc-tipo">📊 SERRAMENTI</span>
          ${cfgSer.versione > 0
            ? `<span class="tsc-version">v${cfgSer.versione}</span>`
            : `<span class="tsc-version tsc-version-empty">Non caricato</span>`}
        </div>
        ${cfgSer.versione > 0 ? `
          <div class="tsc-filename">${escHtml(cfgSer.fileName || '-')}</div>
          <div class="tsc-date">Aggiornato: ${escHtml(cfgSer.dataAggiornamento || '-')}</div>
        ` : `<div class="tsc-filename">Nessun template caricato</div>`}
      </div>

      <div class="template-status-card ${cfgPor.versione > 0 ? 'tsc-ok' : 'tsc-empty'}">
        <div class="tsc-header">
          <span class="tsc-tipo">🚪 PORTE INTERNE</span>
          ${cfgPor.versione > 0
            ? `<span class="tsc-version">v${cfgPor.versione}</span>`
            : `<span class="tsc-version tsc-version-empty">Non caricato</span>`}
        </div>
        ${cfgPor.versione > 0 ? `
          <div class="tsc-filename">${escHtml(cfgPor.fileName || '-')}</div>
          <div class="tsc-date">Aggiornato: ${escHtml(cfgPor.dataAggiornamento || '-')}</div>
        ` : `<div class="tsc-filename">Nessun template caricato</div>`}
      </div>
    </div>

    ${!isAdmin ? `
      <div class="admin-lock-banner">
        🔒 Solo l'Administrator puo caricare nuove revisioni dei template.
      </div>
    ` : `
      <!-- Upload nuova revisione -->
      <div class="admin-section">
        <div class="admin-section-title">Carica Nuova Revisione</div>
        <p class="admin-hint">
          Seleziona o trascina il file Excel (.xlsx) del template aggiornato.
          Il sistema sostituira automaticamente la versione precedente su Drive
          e aggiornera il registro Config_Template.
        </p>

        <!-- SERRAMENTI -->
        <div class="upload-zone-wrapper">
          <div class="upload-zone-label">📊 Template Serramenti</div>
          <div class="upload-zone" id="uzSerramenti"
               onclick="document.getElementById('fileSerramenti').click()"
               ondragover="event.preventDefault(); this.classList.add('uz-dragover')"
               ondragleave="this.classList.remove('uz-dragover')"
               ondrop="event.preventDefault(); this.classList.remove('uz-dragover'); handleFileDrop(event, 'SERRAMENTI')">
            <div class="uz-icon">📁</div>
            <div class="uz-text">Tocca o trascina il file .xlsx</div>
            <div class="uz-sub">Sostituira la versione v${cfgSer.versione > 0 ? cfgSer.versione : '0'} attuale</div>
          </div>
          <input type="file" id="fileSerramenti" accept=".xlsx" style="display:none"
                 onchange="handleFileSelect(this, 'SERRAMENTI')">
          <div id="previewSerramenti" class="upload-preview" style="display:none"></div>
          <button id="btnUploadSerramenti" class="btn-upload" style="display:none"
                  onclick="eseguiUpload('SERRAMENTI')">
            Carica su Drive
          </button>
        </div>

        <!-- PORTE INTERNE -->
        <div class="upload-zone-wrapper">
          <div class="upload-zone-label">🚪 Template Porte Interne</div>
          <div class="upload-zone" id="uzPorte"
               onclick="document.getElementById('filePorte').click()"
               ondragover="event.preventDefault(); this.classList.add('uz-dragover')"
               ondragleave="this.classList.remove('uz-dragover')"
               ondrop="event.preventDefault(); this.classList.remove('uz-dragover'); handleFileDrop(event, 'PORTE_INTERNE')">
            <div class="uz-icon">📁</div>
            <div class="uz-text">Tocca o trascina il file .xlsx</div>
            <div class="uz-sub">Sostituira la versione v${cfgPor.versione > 0 ? cfgPor.versione : '0'} attuale</div>
          </div>
          <input type="file" id="filePorte" accept=".xlsx" style="display:none"
                 onchange="handleFileSelect(this, 'PORTE_INTERNE')">
          <div id="previewPorte" class="upload-preview" style="display:none"></div>
          <button id="btnUploadPorte" class="btn-upload" style="display:none"
                  onclick="eseguiUpload('PORTE_INTERNE')">
            Carica su Drive
          </button>
        </div>

      </div>
    `}
  `;
}

/* Files selezionati in attesa di upload */
const _pendingFiles = { SERRAMENTI: null, PORTE_INTERNE: null };

function handleFileDrop(event, tipo) {
  const files = event.dataTransfer.files;
  if (!files || !files.length) return;
  processSelectedFile(files[0], tipo);
}

function handleFileSelect(input, tipo) {
  if (!input.files || !input.files.length) return;
  processSelectedFile(input.files[0], tipo);
}

function processSelectedFile(file, tipo) {
  if (!file.name.endsWith('.xlsx')) {
    showToast('Solo file .xlsx accettati', 'error'); return;
  }
  _pendingFiles[tipo] = file;
  const idPfx   = tipo === 'SERRAMENTI' ? 'Serramenti' : 'Porte';
  const prevEl  = document.getElementById('preview' + idPfx);
  const btnEl   = document.getElementById('btnUpload' + idPfx);
  const uzEl    = document.getElementById('uz' + idPfx);

  const sizeMB = (file.size / 1024 / 1024).toFixed(2);
  prevEl.innerHTML = `
    <div class="up-file-info">
      <span class="up-file-name">📄 ${escHtml(file.name)}</span>
      <span class="up-file-size">${sizeMB} MB</span>
    </div>`;
  prevEl.style.display = 'block';
  btnEl.style.display = 'block';

  // Evidenzia la zona di drop
  uzEl.classList.add('uz-ready');
  uzEl.querySelector('.uz-text').textContent = file.name;
  uzEl.querySelector('.uz-sub').textContent  = sizeMB + ' MB — Pronto per il caricamento';
}

async function eseguiUpload(tipo) {
  const file = _pendingFiles[tipo];
  if (!file) { showToast('Nessun file selezionato', 'error'); return; }

  const idPfx  = tipo === 'SERRAMENTI' ? 'Serramenti' : 'Porte';
  const btnEl  = document.getElementById('btnUpload' + idPfx);
  if (btnEl) { btnEl.textContent = 'Caricamento...'; btnEl.disabled = true; }

  setLoadingState(true);
  try {
    // Legge il file come ArrayBuffer e converte in base64
    const base64Data = await fileToBase64(file);

    const payload = {
      tipo:       tipo,
      base64Data: base64Data,
      fileName:   file.name
    };

    const result = await apiPost(payload);

    if (result.errore) throw new Error(result.errore);

    // Successo
    _pendingFiles[tipo] = null;
    showToast(`${tipo === 'SERRAMENTI' ? 'Serramenti' : 'Porte Interne'} v${result.versione} caricato!`, 'success');

    // Aggiorna stato e ri-renderizza
    await loadConfigTemplate();

  } catch (e) {
    showToast('Errore upload: ' + e.message, 'error');
    if (btnEl) { btnEl.textContent = 'Carica su Drive'; btnEl.disabled = false; }
  } finally {
    setLoadingState(false);
  }
}

/**
 * Converte un File in stringa base64 pura (senza data URI prefix).
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      // Rimuove "data:application/...;base64," dal prefisso
      const base64 = dataUrl.split(',')[1];
      if (!base64) reject(new Error('Conversione base64 fallita.'));
      else resolve(base64);
    };
    reader.onerror = () => reject(new Error('Lettura file fallita.'));
    reader.readAsDataURL(file);
  });
}


/* ============================================================
   COSTRUTTORE CARD PREVENTIVO
   ============================================================ */
function buildCard(p, context) {
  const addrFull = [p.indirizzo, p.civico, p.cap, p.comune, p.provincia ? `(${p.provincia})` : ''].filter(Boolean).join(' ');
  let borderColor = '#ccc', stateHtml = '';
  switch (context) {
    case 'lavorazione':
      borderColor = p.inRitardo ? 'var(--c-persi)' : 'var(--c-lav)';
      stateHtml   = `<span class="priority-badge ${p.inRitardo ? 'priority-late' : ''}">P${p.priorita || '?'}</span>`;
      break;
    case 'ricevuti':
      borderColor = 'var(--c-ric)';
      stateHtml   = `<span class="date-badge">📥 ${fmtDate(p.dataRicezione)}</span>`;
      break;
    case 'consegnati':
      borderColor = 'var(--c-cons)';
      stateHtml   = `<span class="date-badge">📦 ${fmtDate(p.dataConsegna)}</span>`;
      break;
    case 'vinti':
      if (p.stato === 'VINTO')          borderColor = 'var(--c-vinti)';
      else if (p.stato === 'PERSO')     borderColor = 'var(--c-persi)';
      else if (p.stato === 'DA REVISIONARE') borderColor = 'var(--c-rev)';
      stateHtml = statoBadgeHtml(p.stato);
      break;
  }
  return `
    <div class="prev-card" style="border-left-color:${borderColor}">
      <div class="card-header">
        <div class="card-title">${escHtml(p.nomeCommessa || 'N/D')}</div>
        ${stateHtml}
      </div>
      <div class="card-body">
        ${(STATE.isSuperUser || STATE.isUfficio) && p.commerciale ? `<div class="card-row"><span class="card-label">👤 Comm.</span><span class="card-value">${escHtml(p.commerciale)}</span></div>` : ''}
        ${p.cliente ? `<div class="card-row"><span class="card-label">🏠 Cliente</span><span class="card-value card-cliente">${escHtml(p.cliente)}</span></div>` : ''}
        ${p.tipoIntervento ? `<div class="card-row"><span class="card-label">🔨 Tipo</span><span class="card-value">${escHtml(p.tipoIntervento)}</span></div>` : ''}
        ${p.siglaProdotto ? `<div class="card-row"><span class="card-label">📋 Prodotto</span><span class="card-value sigla-badge">${escHtml(p.siglaProdotto)}</span></div>` : ''}
        ${context === 'lavorazione' ? `<div class="card-row"><span class="card-label">📅 Inserito</span><span class="card-value">${fmtDate(p.dataInserimento)}</span></div><div class="card-row"><span class="card-label">⏱️ Prevista</span><span class="card-value ${p.inRitardo ? 'text-danger' : ''}">${fmtDate(p.dataPrevista)}${p.inRitardo ? ' ⚠️' : ''}</span></div><div class="card-row"><span class="card-label">📊 GG attesa</span><span class="card-value ${p.inRitardo ? 'text-danger' : ''}">${p.giorniTrascorsi || 0} gg</span></div>` : ''}
        ${context === 'ricevuti' ? `<div class="card-row"><span class="card-label">📅 Ricezione</span><span class="card-value">${fmtDate(p.dataRicezione)}</span></div>` : ''}
        ${context === 'consegnati' ? `<div class="card-row"><span class="card-label">📅 Consegna</span><span class="card-value">${fmtDate(p.dataConsegna)}</span></div><div class="card-row"><span class="card-label">📞 Ricontatto</span><span class="card-value">${fmtDate(p.dataRicontatto) || 'N/D'}</span></div>` : ''}
        ${context === 'vinti' ? `<div class="card-row"><span class="card-label">🏁 Chiusura</span><span class="card-value">${fmtDate(p.dataChiusura) || 'N/D'}</span></div>` : ''}
        ${p.note && p.note.trim() ? `<div class="card-row card-note"><span class="card-label">📝</span><span class="card-value">${escHtml(p.note)}</span></div>` : ''}
      </div>
      ${(p.hasPhone || p.hasEmail || p.hasAddress) ? `
        <div class="card-actions">
          ${p.hasPhone ? `<a href="tel:${encodeURI((p.telefono||'').replace(/\s/g,''))}" class="action-btn action-phone">📞 Chiama</a>` : ''}
          ${p.hasEmail ? `<a href="mailto:${encodeURI(p.email||'')}" class="action-btn action-email">✉️ E-mail</a>` : ''}
          ${p.hasAddress ? `<a href="https://maps.google.com/?q=${encodeURIComponent(addrFull)}" target="_blank" rel="noopener" class="action-btn action-maps">🗺️ Naviga</a>` : ''}
        </div>` : ''}
    </div>`;
}


/* ============================================================
   FILTER DRAWER
   ============================================================ */
function openFilterDrawer() {
  document.getElementById('filterDal').value   = STATE.filtri.dal;
  document.getElementById('filterAl').value    = STATE.filtri.al;
  const fc = document.getElementById('filterComm');  if (fc) fc.value = STATE.filtri.commerciale;
  const ft = document.getElementById('filterTipo');  if (ft) ft.value = STATE.filtri.tipo;
  const fs = document.getElementById('filterSigla'); if (fs) fs.value = STATE.filtri.sigla;
  document.getElementById('filterDrawer').classList.add('open');
  document.getElementById('filterOverlay').style.display = 'block';
}

function closeFilterDrawer() {
  document.getElementById('filterDrawer').classList.remove('open');
  document.getElementById('filterOverlay').style.display = 'none';
}

function applyFilters() {
  STATE.filtri.dal         = document.getElementById('filterDal').value;
  STATE.filtri.al          = document.getElementById('filterAl').value;
  STATE.filtri.commerciale = document.getElementById('filterComm')?.value  || '';
  STATE.filtri.tipo        = document.getElementById('filterTipo')?.value  || '';
  STATE.filtri.sigla       = document.getElementById('filterSigla')?.value || '';
  STATE.filtri.testo       = '';
  closeFilterDrawer();
  loadData();
}

function resetFilters() {
  const now = new Date();
  STATE.filtri.al  = fmtDateInput(now); now.setMonth(now.getMonth() - 6); STATE.filtri.dal = fmtDateInput(now);
  STATE.filtri.commerciale = ''; STATE.filtri.tipo = ''; STATE.filtri.sigla = ''; STATE.filtri.stato = ''; STATE.filtri.testo = '';
  document.getElementById('filterDal').value = STATE.filtri.dal;
  document.getElementById('filterAl').value  = STATE.filtri.al;
  const fc = document.getElementById('filterComm');  if (fc) fc.value = '';
  const ft = document.getElementById('filterTipo');  if (ft) ft.value = '';
  const fs = document.getElementById('filterSigla'); if (fs) fs.value = '';
  closeFilterDrawer(); loadData();
}


/* ============================================================
   EXPORT PDF
   ============================================================ */
function exportPDF(section) {
  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('l', 'pt', 'a4');
    const data = getFilteredData();
    let head = [], rows = [], title = '', colorHex = '#2c3e50';
    switch (section) {
      case 'lavorazione': title='In Lavorazione'; colorHex='#34495e'; head=[['Priorita','Commerciale','Commessa','Cliente','Tipo','Sigla','Data Ins.','Prevista','GG attesa']]; rows=data.filter(p=>p.dataRicezione==='').sort((a,b)=>(a.priorita||999)-(b.priorita||999)).map(p=>[p.priorita||'',p.commerciale,p.nomeCommessa,p.cliente,p.tipoIntervento,p.siglaProdotto,fmtDate(p.dataInserimento),fmtDate(p.dataPrevista),(p.giorniTrascorsi||0)+' gg']); break;
      case 'ricevuti':    title='Ricevuti';       colorHex='#7f8c8d'; head=[['Comm.','Commessa','Cliente','Telefono','Email','Tipo','Sigla','Data Ric.']]; rows=data.filter(p=>p.dataRicezione!==''&&p.dataConsegna==='').map(p=>[p.commerciale,p.nomeCommessa,p.cliente,p.telefono,p.email,p.tipoIntervento,p.siglaProdotto,fmtDate(p.dataRicezione)]); break;
      case 'consegnati':  title='Consegnati';     colorHex='#e67e22'; head=[['Commessa','Cliente','Telefono','Tipo','Sigla','Data Cons.','Ricontatto','Note']]; rows=data.filter(p=>p.dataConsegna!==''&&(p.stato==='IN ATTESA'||p.stato==='')).map(p=>[p.nomeCommessa,p.cliente,p.telefono,p.tipoIntervento,p.siglaProdotto,fmtDate(p.dataConsegna),fmtDate(p.dataRicontatto),(p.note||'').substring(0,80)]); break;
      case 'vinti':       title='Vinti e Persi';  colorHex='#27ae60'; head=[['Commessa','Cliente','Tipo','Sigla','Stato','Data Chius.']]; rows=data.filter(p=>p.stato==='VINTO'||p.stato==='PERSO'||p.stato==='DA REVISIONARE').map(p=>[p.nomeCommessa,p.cliente,p.tipoIntervento,p.siglaProdotto,p.stato,fmtDate(p.dataChiusura)]); break;
    }
    const [r,g,b] = hexRgb(colorHex);
    doc.autoTable({
      head, body: rows, theme: 'grid',
      headStyles: { fillColor: [r,g,b], halign: 'center', fontSize: 8 },
      styles:     { fontSize: 7, cellPadding: 3, overflow: 'linebreak' },
      margin:     { top: 62 },
      didDrawPage: (data) => {
        doc.setFontSize(13); doc.setTextColor(40,40,40); doc.text('F4 Preventivi — ' + title, 40, 26);
        doc.setFontSize(9); doc.setTextColor(100,100,100);
        doc.text('Utente: ' + (STATE.user||'') + '   Data: ' + new Date().toLocaleString('it-IT') + '   Periodo: ' + STATE.filtri.dal + ' / ' + STATE.filtri.al, 40, 42);
        doc.setFontSize(8); doc.text('Filtri: Comm. ' + (STATE.filtri.commerciale||'Tutti') + '  Tipo: ' + (STATE.filtri.tipo||'Tutti') + '  Sigla: ' + (STATE.filtri.sigla||'Tutti'), 40, 54);
      }
    });
    doc.save(`F4_${title.replace(/\s+/g,'_')}_${Date.now()}.pdf`);
    showToast('PDF generato', 'success');
  } catch (e) { showToast('Errore PDF: ' + e.message, 'error'); }
}


/* ============================================================
   UTILITY
   ============================================================ */
function fmtDate(d) { if (!d || d === '') return ''; try { return d.split('-').reverse().join('/'); } catch (e) { return d; } }
function fmtDateInput(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function statoBadgeHtml(stato) { const cls = {'VINTO':'stato-vinto','PERSO':'stato-perso','DA REVISIONARE':'stato-rev','IN ATTESA':'stato-attesa'}; return `<span class="stato-badge ${cls[stato]||'stato-attesa'}">${stato||'N/D'}</span>`; }
function statoClass(stato) { const map = {'VINTO':'vinto','PERSO':'perso','DA REVISIONARE':'rev','IN ATTESA':'attesa'}; return map[stato]||'nd'; }
function getInitials(nome) { const parts = nome.trim().split(/\s+/); if (parts.length >= 2) return (parts[0][0]+parts[parts.length-1][0]).toUpperCase(); return nome.slice(0,2).toUpperCase(); }
function avatarColor(nome) { const palette = ['#3498db','#e74c3c','#27ae60','#9b59b6','#e67e22','#1abc9c','#34495e','#e91e63','#00bcd4','#ff5722','#607d8b','#8bc34a']; let hash = 0; for (let i = 0; i < nome.length; i++) hash = nome.charCodeAt(i) + ((hash<<5)-hash); return palette[Math.abs(hash) % palette.length]; }
function cap(str) { return str.charAt(0).toUpperCase() + str.slice(1); }
function hexRgb(hex) { const r = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex); return r ? [parseInt(r[1],16),parseInt(r[2],16),parseInt(r[3],16)] : [44,62,80]; }
function escHtml(str) { return String(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function showLoader(id, show) { const el = document.getElementById(id); if (el) el.style.display = show ? 'flex' : 'none'; }
function showError(id, msg) { const el = document.getElementById(id); if (el) { el.textContent = msg; el.style.display = 'block'; } }
function setLoadingState(loading) { const spinner = document.getElementById('globalSpinner'); if (spinner) spinner.style.display = loading ? 'flex' : 'none'; }
function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`; toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => { requestAnimationFrame(() => toast.classList.add('show')); });
  setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 320); }, 2800);
}


// ============================================================
// CONTATTI MOBILE — Acquisizione Clienti
// ============================================================
var _mobileUtenti = {};

async function renderContattiMobile() {
  const page = document.getElementById('pageContatti');
  if (!page) return;

  // Carica utenti se non ancora disponibili
  if (Object.keys(_mobileUtenti).length === 0) {
    try {
      const dati = await apiCall('getUtenti', {});
      if (dati && typeof dati === 'object') _mobileUtenti = dati;
    } catch(e) {}
  }

  const isComm = !STATE.isSuperUser && !STATE.isUfficio &&
    !['Reception','Showroom','Segreteria'].some(r => STATE.role.includes(r));
  const canVeraLista = STATE.isSuperUser || isComm;

  // Opzioni commerciali per il select
  let optsComm = '<option value="">-- Seleziona --</option>';
  Object.keys(_mobileUtenti).forEach(ruolo => {
    if (['Ufficio Preventivi','Reception','Showroom','Segreteria'].includes(ruolo)) return;
    (_mobileUtenti[ruolo] || []).forEach(u => {
      optsComm += `<option value="${u}"${STATE.user === u ? ' selected' : ''}>${u}</option>`;
    });
  });

  // Lista contatti (solo commerciali e admin)
  let listaHtml = '';
  if (canVeraLista) {
    try {
      const tutti = STATE.isSuperUser ? '1' : '0';
      const comm = STATE.isSuperUser ? '' : STATE.user;
      const lista = await apiCall('getContatti', { commerciale: comm, stato: 'ATTIVI', tutti: tutti });
      if (lista && lista.length) {
        listaHtml = `<div class="section-title" style="margin-top:24px;padding:0 4px;">I Miei Contatti (${lista.length})</div>`;
        listaHtml += lista.map(c => {
          const nome = (((c.cognome || '') + ' ' + (c.nome || '')).trim()) || c.ragioneSociale || 'N/D';
          const colori = {
            'NUOVO': '#0d9488',
            'INCONTRO DA FISSARE': '#2563eb',
            'INCONTRO FISSATO': '#7c3aed',
            'AFFARE PER IL FUTURO': '#d97706',
            'NON INTERESSANTE': '#9ca3af',
            'CONVERTITO': '#059669'
          };
          const col = colori[c.stato] || '#6b7280';
          return `<div class="preventivo-card" style="border-left:4px solid ${col};margin-bottom:10px;">
            <div class="card-header">
              <span class="card-id">${escHtml(nome)}</span>
              <span class="badge" style="background:${col};font-size:10px;">${c.stato}</span>
            </div>
            <div class="card-row"><span class="card-label">&#128336;</span>
              <span class="card-value">${c.ggDaInserimento || 0} gg da inserimento</span></div>
            ${c.telefono ? `<div class="card-row"><span class="card-label">&#128222;</span>
              <span class="card-value"><a href="tel:${c.telefono}" style="color:#2980b9;">${escHtml(c.telefono)}</a></span></div>` : ''}
            ${c.comuneCliente ? `<div class="card-row"><span class="card-label">&#128205;</span>
              <span class="card-value">${escHtml(c.comuneCliente)}</span></div>` : ''}
            ${c.tipoIntervento ? `<div class="card-row"><span class="card-label">&#128295;</span>
              <span class="card-value">${escHtml(c.tipoIntervento)}</span></div>` : ''}
          </div>`;
        }).join('');
      } else {
        listaHtml = '<p style="color:#7f8c8d;text-align:center;padding:16px;">Nessun contatto attivo.</p>';
      }
    } catch(e) {
      listaHtml = '<p style="color:#e74c3c;padding:12px;">Errore caricamento contatti.</p>';
    }
  }

  const prodotti = ['Serramenti','Porte Interne','Oscuranti','Zanzariere','Garage',
    'Ingressi Blindati','Ingressi Isolati','Parapetti','Davanzali','Pergola'];

  page.innerHTML = `
    <div style="padding:16px 16px 80px 16px;">
      <div class="section-title">&#128221; Nuovo Contatto Cliente</div>

      <div class="card" style="margin-bottom:12px;">
        <div style="font-size:11px;font-weight:700;color:#0d9488;text-transform:uppercase;margin-bottom:12px;letter-spacing:0.5px;">A — Dati Anagrafici</div>
        <div class="form-group"><label>Nome</label><input type="text" id="m_nome" placeholder="Nome"></div>
        <div class="form-group"><label>Cognome</label><input type="text" id="m_cognome" placeholder="Cognome"></div>
        <div class="form-group"><label>Ragione Sociale</label><input type="text" id="m_ragSoc" placeholder="Solo se azienda"></div>
        <div class="form-group"><label>Telefono</label><input type="tel" id="m_tel" placeholder="+39"></div>
        <div class="form-group"><label>E-mail</label><input type="email" id="m_email" placeholder="email@esempio.it"></div>
        <div class="form-group"><label>Comune</label><input type="text" id="m_comune" placeholder="Comune"></div>
        <div class="form-group"><label>Prov.</label><input type="text" id="m_prov" placeholder="BS" maxlength="2"></div>
      </div>

      <div class="card" style="margin-bottom:12px;">
        <div style="font-size:11px;font-weight:700;color:#2563eb;text-transform:uppercase;margin-bottom:12px;letter-spacing:0.5px;">B — Primo Contatto</div>
        <div class="form-group"><label>Come ci ha conosciuti</label>
          <select id="m_come">
            <option value="">--</option>
            <option>Showroom</option><option>Web / Internet</option><option>Passaparola</option>
            <option>Fiera / Evento</option><option>Pubblicita</option><option>Social Media</option><option>Altro</option>
          </select>
        </div>
        <div class="form-group"><label>Mezzo Primo Contatto</label>
          <select id="m_mezzo">
            <option value="">--</option>
            <option>Telefono</option><option>E-mail</option><option>Di persona</option>
            <option>WhatsApp</option><option>Web form</option>
          </select>
        </div>
      </div>

      <div class="card" style="margin-bottom:12px;">
        <div style="font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;margin-bottom:12px;letter-spacing:0.5px;">C — Contesto Intervento</div>
        <div class="form-group"><label>Tipo Intervento</label>
          <select id="m_tipo">
            <option value="">--</option>
            <option>Nuova costruzione</option><option>Sostituzione</option>
            <option>Ristrutturazione</option><option>Sola fornitura</option>
          </select>
        </div>
        <div class="form-group"><label>Tipo Edificio</label>
          <select id="m_edificio">
            <option value="">--</option>
            <option>Casa singola</option><option>Bifamiliare</option>
            <option>Ville a schiera</option><option>Condominio</option>
          </select>
        </div>
        <div style="margin-bottom:12px;">
          <div style="font-size:12px;font-weight:600;color:#374151;margin-bottom:8px;">Prodotti di Interesse</div>
          <div style="display:flex;flex-wrap:wrap;gap:8px;">
            ${prodotti.map(p => `<label style="display:flex;align-items:center;gap:6px;font-size:12px;padding:6px 10px;border-radius:16px;border:1px solid #e0e6ed;background:white;cursor:pointer;">
              <input type="checkbox" class="m_prodotto" value="${p}" style="accent-color:#0d9488;"> ${p}
            </label>`).join('')}
          </div>
        </div>
        <div class="form-group"><label>Note (motivazione, richieste specifiche)</label>
          <textarea id="m_note" rows="3" style="width:100%;padding:8px;border:1px solid #ccd1d9;border-radius:6px;font-size:13px;box-sizing:border-box;resize:vertical;"></textarea>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px;background:#eff6ff;border:1px solid #bfdbfe;">
        <div style="font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;margin-bottom:12px;letter-spacing:0.5px;">Assegnazione Commerciale *</div>
        <div class="form-group">
          <label>Commerciale destinatario</label>
          <select id="m_comm">${optsComm}</select>
        </div>
      </div>

      <div id="m_msg" style="display:none;padding:12px;border-radius:6px;font-weight:bold;font-size:13px;margin-bottom:12px;"></div>
      <button onclick="salvaMobileContatto()" style="width:100%;padding:14px;background:#0d9488;color:white;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 2px 8px rgba(13,148,136,0.3);">
        &#10003; Salva Contatto
      </button>
      ${listaHtml}
    </div>`;
}

async function salvaMobileContatto() {
  const comm  = document.getElementById('m_comm')  ? document.getElementById('m_comm').value  : '';
  const nome  = document.getElementById('m_nome')  ? document.getElementById('m_nome').value.trim()  : '';
  const cogn  = document.getElementById('m_cognome')? document.getElementById('m_cognome').value.trim(): '';
  const ragSoc= document.getElementById('m_ragSoc') ? document.getElementById('m_ragSoc').value.trim() : '';
  const msgEl = document.getElementById('m_msg');

  function showMsg(txt, ok) {
    if (!msgEl) return;
    msgEl.textContent = txt;
    msgEl.style.background = ok ? '#eafaf1' : '#fadbd8';
    msgEl.style.color = ok ? '#1e8449' : '#c0392b';
    msgEl.style.display = 'block';
    if (ok) setTimeout(() => { msgEl.style.display = 'none'; }, 4000);
  }

  if (!comm) { showMsg('Seleziona il commerciale destinatario.', false); return; }
  if (!nome && !cogn && !ragSoc) { showMsg('Inserisci almeno Nome/Cognome o Ragione Sociale.', false); return; }

  const prodotti = Array.from(document.querySelectorAll('.m_prodotto:checked')).map(cb => cb.value).join(', ');

  try {
    const r = await apiPost({
      _azione: 'registraContatto',
      inseritoDa: STATE.user,
      commercialeAssegnato: comm,
      nome, cognome: cogn, ragioneSociale: ragSoc,
      telefono:      document.getElementById('m_tel')     ? document.getElementById('m_tel').value.trim()     : '',
      email:         document.getElementById('m_email')   ? document.getElementById('m_email').value.trim()   : '',
      comuneCliente: document.getElementById('m_comune')  ? document.getElementById('m_comune').value.trim()  : '',
      provinciaCliente: (document.getElementById('m_prov') ? document.getElementById('m_prov').value.trim() : '').toUpperCase(),
      comeConosciuti:   document.getElementById('m_come') ? document.getElementById('m_come').value : '',
      mezzoPrimoContatto: document.getElementById('m_mezzo') ? document.getElementById('m_mezzo').value : '',
      tipoIntervento: document.getElementById('m_tipo')    ? document.getElementById('m_tipo').value    : '',
      tipoEdificio:   document.getElementById('m_edificio')? document.getElementById('m_edificio').value : '',
      prodottiInteresse: prodotti,
      noteTecniche:   document.getElementById('m_note')   ? document.getElementById('m_note').value.trim()   : ''
    });
    if (r && r.errore) { showMsg('Errore: ' + r.errore, false); return; }
    showMsg('Contatto salvato con successo!', true);
    // Reset form
    ['m_nome','m_cognome','m_ragSoc','m_tel','m_email','m_comune','m_prov','m_note'].forEach(id => {
      const e = document.getElementById(id); if (e) e.value = '';
    });
    ['m_come','m_mezzo','m_tipo','m_edificio'].forEach(id => {
      const e = document.getElementById(id); if (e) e.selectedIndex = 0;
    });
    document.querySelectorAll('.m_prodotto').forEach(cb => cb.checked = false);
  } catch(e) {
    showMsg('Errore di rete: ' + e.message, false);
  }
}
