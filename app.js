'use strict';

const STATE={user:null,role:null,isSuperUser:false,isUfficio:false,isAdmin:false,dati:[],anagrafiche:[],configTemplate:[],utentiRaggruppati:{},currentPage:'kpi',ricevutiSegment:'ricevuti',filtri:{dal:'',al:'',commerciale:'',testo:'',tipo:'',sigla:'',stato:''},lastUpdate:null};

async function apiCall(action,params={}){
  const url=new URL(SCRIPT_URL);
  url.searchParams.set('action',action);
  for(const[k,v]of Object.entries(params)){if(v!==null&&v!==undefined&&v!=='')url.searchParams.set(k,String(v));}
  const r=await fetch(url.toString(),{method:'GET',redirect:'follow',cache:'no-store'});
  const text=await r.text();
  try{return JSON.parse(text);}catch(e){throw new Error('Risposta non valida dal server.');}
}

async function apiPost(payload){
  const r=await fetch(SCRIPT_URL,{method:'POST',redirect:'follow',body:JSON.stringify(payload)});
  const text=await r.text();
  try{return JSON.parse(text);}catch(e){throw new Error('Risposta non valida dopo il caricamento.');}
}

document.addEventListener('DOMContentLoaded',()=>{
  const vEl=document.getElementById('loginVersion');
  if(vEl)vEl.textContent='v'+APP_VERSION;
  initLogin();
});

async function initLogin(){
  showLoader('loginLoader',true);
  document.getElementById('btnLogin').disabled=true;
  try{
    const utenti=await apiCall('getUtenti');
    STATE.utentiRaggruppati=utenti||{};
    const rSel=document.getElementById('loginReparto');
    rSel.innerHTML='<option value="">Scegli Reparto Operativo...</option>';
    Object.keys(utenti).sort().forEach(r=>{rSel.innerHTML+=`<option value="${r}">${r}</option>`;});
    document.getElementById('btnLogin').disabled=false;
  }catch(e){showError('loginError','Errore connessione. Verifica la rete e ricarica.');}
  finally{showLoader('loginLoader',false);}
}

function onRepartoChange(){
  const rep=document.getElementById('loginReparto').value;
  const box=document.getElementById('loginNomeBox');
  const sel=document.getElementById('loginNome');
  if(!rep){box.style.display='none';sel.innerHTML='';return;}
  sel.innerHTML='<option value="">Seleziona identificativo...</option>';
  (STATE.utentiRaggruppati[rep]||[]).forEach(n=>{sel.innerHTML+=`<option value="${n}">${n}</option>`;});
  box.style.display='block';
}

async function doLogin(){
  const nome=document.getElementById('loginNome').value;
  const pwd=document.getElementById('loginPwd').value;
  const rep=document.getElementById('loginReparto').value;
  document.getElementById('loginError').style.display='none';
  if(!rep||!nome||!pwd){showError('loginError','Compila tutti i campi per accedere.');return;}
  showLoader('loginLoader',true);
  document.getElementById('btnLogin').disabled=true;
  try{
    const res=await apiCall('login',{nome,pwd});
    if(res.successo)handleLoginSuccess(res);
    else{showError('loginError',res.messaggio||'Credenziali non valide.');document.getElementById('btnLogin').disabled=false;}
  }catch(e){showError('loginError','Errore di connessione. Riprova.');document.getElementById('btnLogin').disabled=false;}
  finally{showLoader('loginLoader',false);}
}

function handleLoginSuccess(res){
  STATE.user=res.nome;STATE.role=res.ruolo;
  STATE.isSuperUser=['Administrator','Responsabile Commerciale','Direzione'].includes(res.ruolo)||res.nome==='Reverdito Andrea';
  STATE.isUfficio=res.ruolo==='Ufficio Preventivi';
  STATE.isAdmin=res.ruolo==='Administrator';
  const hU=document.getElementById('headerUser');if(hU)hU.textContent=STATE.user+' — '+STATE.role;
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('appScreen').style.display='flex';
  if(STATE.isSuperUser||STATE.isUfficio){
    const box=document.getElementById('filterCommBox');if(box)box.style.display='block';
    const sel=document.getElementById('filterComm');
    if(sel){sel.innerHTML='<option value="">Tutti (Visione Globale)</option>';Object.values(STATE.utentiRaggruppati).flat().sort().forEach(n=>{sel.innerHTML+=`<option value="${n}">${n}</option>`;});}
  }
  if(STATE.isUfficio){const navKpi=document.getElementById('navKpi');if(navKpi)navKpi.style.display='none';}
  if(STATE.isSuperUser||STATE.isAdmin){const navAdmin=document.getElementById('navAdmin');if(navAdmin)navAdmin.style.display='flex';}
  const navC=document.getElementById('navContatti');if(navC)navC.style.display='flex';
  const now=new Date();
  const al=fmtDateInput(now);now.setMonth(now.getMonth()-6);const dal=fmtDateInput(now);
  STATE.filtri.dal=dal;STATE.filtri.al=al;
  document.getElementById('filterDal').value=dal;document.getElementById('filterAl').value=al;
  loadData();loadAnagrafiche();
  if(STATE.isSuperUser||STATE.isAdmin)loadConfigTemplate();
  navigateTo(STATE.isUfficio?'lavorazione':'kpi');
}

function logout(){
  STATE.user=null;STATE.dati=[];STATE.anagrafiche=[];STATE.configTemplate=[];
  document.getElementById('appScreen').style.display='none';
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('loginPwd').value='';
  document.getElementById('loginReparto').value='';
  document.getElementById('loginNomeBox').style.display='none';
  document.getElementById('loginError').style.display='none';
  document.getElementById('btnLogin').disabled=false;
  const navAdmin=document.getElementById('navAdmin');if(navAdmin)navAdmin.style.display='none';
  const navCout=document.getElementById('navContatti');if(navCout)navCout.style.display='none';
  const navKpi=document.getElementById('navKpi');if(navKpi)navKpi.style.display='flex';
}

function navigateTo(page){
  STATE.currentPage=page;
  document.querySelectorAll('.page').forEach(p=>p.style.display='none');
  const target=document.getElementById('page'+cap(page));
  if(target)target.style.display='block';
  document.querySelectorAll('#bottomNav button').forEach(b=>b.classList.remove('active'));
  const btn=document.getElementById('nav'+cap(page));if(btn)btn.classList.add('active');
  renderCurrentPage();
}

function renderCurrentPage(){
  switch(STATE.currentPage){
    case 'kpi':         renderKPI();         break;
    case 'lavorazione': renderLavorazione(); break;
    case 'ricevuti':    renderRicevuti();    break;
    case 'vinti':       renderVinti();       break;
    case 'rubrica':     renderRubrica();     break;
    case 'admin':       renderAdmin();       break;
    case 'contatti':    renderContattiMobile(); break;
  }
}

async function loadData(){
  setLoadingState(true);
  try{
    let dati;
    if(STATE.isSuperUser||STATE.isUfficio)dati=await apiCall('getTuttiPreventivi',{dal:STATE.filtri.dal,al:STATE.filtri.al});
    else dati=await apiCall('getPreventiviCommerciale',{nome:STATE.user,dal:STATE.filtri.dal,al:STATE.filtri.al});
    STATE.dati=processData(Array.isArray(dati)?dati:[]);
    STATE.lastUpdate=new Date();
    const inf=document.getElementById('lastUpdateInfo');
    if(inf)inf.textContent='Aggiornato alle '+STATE.lastUpdate.toLocaleTimeString('it-IT')+' — '+STATE.dati.length+' preventivi totali.';
    renderCurrentPage();
    showToast('Dati aggiornati','success');
  }catch(e){showToast('Errore: '+e.message,'error');}
  finally{setLoadingState(false);}
}

async function loadAnagrafiche(){
  try{const lista=await apiCall('getAnagrafiche');STATE.anagrafiche=Array.isArray(lista)?lista:[];if(STATE.currentPage==='rubrica')renderRubrica();}
  catch(e){STATE.anagrafiche=[];}
}

async function loadConfigTemplate(){
  try{const cfg=await apiCall('getConfigTemplate');STATE.configTemplate=Array.isArray(cfg)?cfg:[];if(STATE.currentPage==='admin')renderAdmin();}
  catch(e){STATE.configTemplate=[];}
}

function processData(dati){
  const oggi=new Date();oggi.setHours(0,0,0,0);
  return dati.map(p=>{
    if(p.dataInserimento){
      const start=new Date(p.dataInserimento),end=p.dataRicezione?new Date(p.dataRicezione):oggi;
      p.giorniTrascorsi=calcolaGiorniLav(start,end);p.ggPrevisti=p.dataPrevista?calcolaGiorniLav(start,new Date(p.dataPrevista)):8;
      p.inRitardo=p.giorniTrascorsi>p.ggPrevisti&&!p.dataRicezione;
    }else{p.giorniTrascorsi=0;p.ggPrevisti=8;p.inRitardo=false;}
    p.hasPhone=!!(p.telefono&&p.telefono.trim()&&p.telefono!=='-');
    p.hasEmail=!!(p.email&&p.email.trim()&&p.email!=='-');
    p.hasAddress=!!(p.indirizzo&&p.indirizzo.trim())||!!(p.comune&&p.comune.trim());
    return p;
  });
}

function calcolaGiorniLav(start,end){
  const s=new Date(start);s.setHours(0,0,0,0);const e=new Date(end);e.setHours(0,0,0,0);
  let count=0,cur=new Date(s);
  while(cur<e){const d=cur.getDay();if(d!==0&&d!==6)count++;cur.setDate(cur.getDate()+1);}
  return count;
}

function getFilteredData(){
  return STATE.dati.filter(p=>{
    if(STATE.filtri.commerciale&&p.commerciale!==STATE.filtri.commerciale)return false;
    if(STATE.filtri.tipo&&!(p.tipoIntervento||'').toLowerCase().includes(STATE.filtri.tipo.toLowerCase()))return false;
    if(STATE.filtri.sigla&&!(p.siglaProdotto||'').toLowerCase().includes(STATE.filtri.sigla.toLowerCase()))return false;
    return true;
  });
}

function renderKPI(){
  const d=getFilteredData();
  const att=d.filter(p=>p.dataRicezione==='');
  const ric=d.filter(p=>p.dataRicezione!==''&&p.dataConsegna==='');
  const cons=d.filter(p=>p.dataConsegna!==''&&(p.stato==='IN ATTESA'||p.stato===''));
  const vinti=d.filter(p=>p.stato==='VINTO');
  const persi=d.filter(p=>p.stato==='PERSO');
  const daRev=d.filter(p=>p.stato==='DA REVISIONARE');
  const ritardo=att.filter(p=>p.inRitardo).length;
  const updStr=STATE.lastUpdate?'Aggiornato: '+STATE.lastUpdate.toLocaleTimeString('it-IT'):'';
  document.getElementById('pageKpi').innerHTML=`
    <div class="page-header"><h2>Dashboard</h2><span class="last-update">${updStr}</span></div>
    <div class="kpi-grid">
      <div class="kpi-card kpi-lav" onclick="navigateTo('lavorazione')"><div class="kpi-icon">&#128295;</div><div class="kpi-num">${att.length}</div><div class="kpi-label">In Lavorazione</div></div>
      <div class="kpi-card kpi-ric" onclick="navigateTo('ricevuti');setSegment('ricevuti')"><div class="kpi-icon">&#128229;</div><div class="kpi-num">${ric.length}</div><div class="kpi-label">Ricevuti</div></div>
      <div class="kpi-card kpi-cons" onclick="navigateTo('ricevuti');setSegment('consegnati')"><div class="kpi-icon">&#128230;</div><div class="kpi-num">${cons.length}</div><div class="kpi-label">Consegnati</div></div>
      <div class="kpi-card kpi-vinti" onclick="STATE.filtri.stato='VINTO';navigateTo('vinti')"><div class="kpi-icon">&#127942;</div><div class="kpi-num">${vinti.length}</div><div class="kpi-label">Vinti</div></div>
      <div class="kpi-card kpi-persi" onclick="STATE.filtri.stato='PERSO';navigateTo('vinti')"><div class="kpi-icon">&#10060;</div><div class="kpi-num">${persi.length}</div><div class="kpi-label">Persi</div></div>
      <div class="kpi-card kpi-rev" onclick="STATE.filtri.stato='DA REVISIONARE';navigateTo('vinti')"><div class="kpi-icon">&#128260;</div><div class="kpi-num">${daRev.length}</div><div class="kpi-label">Revisione</div></div>
    </div>
    <div class="kpi-total">Totale preventivi nel periodo: <strong>${d.length}</strong>${ritardo>0?` &nbsp;&middot;&nbsp; <span style="color:var(--c-persi);font-weight:700;">&#9888; ${ritardo} in ritardo</span>`:''}</div>`;
}

function renderLavorazione(){
  const search=STATE.filtri.testo.toLowerCase();
  let att=getFilteredData().filter(p=>p.dataRicezione==='');
  if(search)att=att.filter(p=>(p.nomeCommessa||'').toLowerCase().includes(search)||(p.cliente||'').toLowerCase().includes(search)||(p.siglaProdotto||'').toLowerCase().includes(search));
  att.sort((a,b)=>(a.priorita||999)-(b.priorita||999));
  const label=STATE.isUfficio?'Cruscotto Globale':'In Lavorazione';
  document.getElementById('pageLavorazione').innerHTML=`
    <div class="page-header"><h2>${label} <span class="count-badge">${att.length}</span></h2><button class="btn-pdf-small" onclick="exportPDF('lavorazione')">&#128424; PDF</button></div>
    <div class="search-bar"><input type="text" id="searchLav" placeholder="&#128269; Cerca commessa, cliente, sigla..." value="${STATE.filtri.testo}" oninput="STATE.filtri.testo=this.value;renderLavorazione()"></div>
    <div class="cards-list">${att.length===0?'<div class="empty-state">Nessun preventivo in lavorazione</div>':att.map(p=>buildCard(p,'lavorazione')).join('')}</div>`;
}

function renderRicevuti(){
  const data=getFilteredData();
  const ricevuti=data.filter(p=>p.dataRicezione!==''&&p.dataConsegna==='');
  const consegn=data.filter(p=>p.dataConsegna!==''&&(p.stato==='IN ATTESA'||p.stato===''));
  const seg=STATE.ricevutiSegment;
  const shown=seg==='ricevuti'?ricevuti:consegn;
  const label=seg==='ricevuti'?'Ricevuti':'Consegnati';
  document.getElementById('pageRicevuti').innerHTML=`
    <div class="page-header"><h2>${label} <span class="count-badge">${shown.length}</span></h2><button class="btn-pdf-small" onclick="exportPDF('${seg}')">&#128424; PDF</button></div>
    <div class="segment-control">
      <button class="${seg==='ricevuti'?'seg-active':''}" onclick="setSegment('ricevuti')">&#128229; Ricevuti (${ricevuti.length})</button>
      <button class="${seg==='consegnati'?'seg-active':''}" onclick="setSegment('consegnati')">&#128230; Consegnati (${consegn.length})</button>
    </div>
    <div class="cards-list">${shown.length===0?'<div class="empty-state">Nessun dato</div>':shown.map(p=>buildCard(p,seg)).join('')}</div>`;
}

function setSegment(seg){STATE.ricevutiSegment=seg;if(STATE.currentPage==='ricevuti')renderRicevuti();else navigateTo('ricevuti');}

function renderVinti(){
  let vnt=getFilteredData().filter(p=>p.stato==='VINTO'||p.stato==='PERSO'||p.stato==='DA REVISIONARE');
  if(STATE.filtri.stato)vnt=vnt.filter(p=>p.stato===STATE.filtri.stato);
  vnt.sort((a,b)=>(b.dataChiusura||'').localeCompare(a.dataChiusura||''));
  const nTot=vnt.length,nV=vnt.filter(p=>p.stato==='VINTO').length,nP=vnt.filter(p=>p.stato==='PERSO').length,nR=vnt.filter(p=>p.stato==='DA REVISIONARE').length;
  document.getElementById('pageVinti').innerHTML=`
    <div class="page-header"><h2>Vinti / Persi <span class="count-badge">${nTot}</span></h2><button class="btn-pdf-small" onclick="exportPDF('vinti')">&#128424; PDF</button></div>
    <div class="stato-filter-row">
      ${[{val:'',label:'Tutti',n:nTot},{val:'VINTO',label:'&#127942; Vinti',n:nV},{val:'PERSO',label:'&#10060; Persi',n:nP},{val:'DA REVISIONARE',label:'&#128260; Revisione',n:nR}].map(s=>`<button class="chip ${STATE.filtri.stato===s.val?'chip-active':''}" onclick="STATE.filtri.stato='${s.val}';renderVinti()">${s.label} (${s.n})</button>`).join('')}
    </div>
    <div class="cards-list">${vnt.length===0?'<div class="empty-state">Nessun dato</div>':vnt.map(p=>buildCard(p,'vinti')).join('')}</div>`;
}

function buildCard(p,context){
  const addrFull=[p.indirizzo,p.civico,p.cap,p.comune,p.provincia?`(${p.provincia})`:``].filter(Boolean).join(' ');
  let borderColor='#ccc',stateHtml='';
  switch(context){
    case 'lavorazione': borderColor=p.inRitardo?'var(--c-persi)':'var(--c-lav)'; stateHtml=`<span class="priority-badge ${p.inRitardo?'priority-late':''}">P${p.priorita||'?'}</span>`; break;
    case 'ricevuti':    borderColor='var(--c-ric)';  stateHtml=`<span class="date-badge">&#128229; ${fmtDate(p.dataRicezione)}</span>`; break;
    case 'consegnati':  borderColor='var(--c-cons)'; stateHtml=`<span class="date-badge">&#128230; ${fmtDate(p.dataConsegna)}</span>`; break;
    case 'vinti':
      if(p.stato==='VINTO')borderColor='var(--c-vinti)';
      else if(p.stato==='PERSO')borderColor='var(--c-persi)';
      else if(p.stato==='DA REVISIONARE')borderColor='var(--c-rev)';
      stateHtml=statoBadgeHtml(p.stato); break;
  }
  return `<div class="prev-card" style="border-left-color:${borderColor}">
    <div class="card-header"><div class="card-title">${escHtml(p.nomeCommessa||'N/D')}</div>${stateHtml}</div>
    <div class="card-body">
      ${(STATE.isSuperUser||STATE.isUfficio)&&p.commerciale?`<div class="card-row"><span class="card-label">&#128100; Comm.</span><span class="card-value">${escHtml(p.commerciale)}</span></div>`:''}
      ${p.cliente?`<div class="card-row"><span class="card-label">&#127968; Cliente</span><span class="card-value card-cliente">${escHtml(p.cliente)}</span></div>`:''}
      ${p.tipoIntervento?`<div class="card-row"><span class="card-label">&#128296; Tipo</span><span class="card-value">${escHtml(p.tipoIntervento)}</span></div>`:''}
      ${p.siglaProdotto?`<div class="card-row"><span class="card-label">&#128203; Prodotto</span><span class="card-value sigla-badge">${escHtml(p.siglaProdotto)}</span></div>`:''}
      ${context==='lavorazione'?`<div class="card-row"><span class="card-label">&#128197; Inserito</span><span class="card-value">${fmtDate(p.dataInserimento)}</span></div><div class="card-row"><span class="card-label">&#8987; Prevista</span><span class="card-value ${p.inRitardo?'text-danger':''}">${fmtDate(p.dataPrevista)}${p.inRitardo?' &#9888;':''}</span></div><div class="card-row"><span class="card-label">&#128202; GG attesa</span><span class="card-value ${p.inRitardo?'text-danger':''}">${p.giorniTrascorsi||0} gg</span></div>`:''}
      ${context==='ricevuti'?`<div class="card-row"><span class="card-label">&#128197; Ricezione</span><span class="card-value">${fmtDate(p.dataRicezione)}</span></div>`:''}
      ${context==='consegnati'?`<div class="card-row"><span class="card-label">&#128197; Consegna</span><span class="card-value">${fmtDate(p.dataConsegna)}</span></div><div class="card-row"><span class="card-label">&#128222; Ricontatto</span><span class="card-value">${fmtDate(p.dataRicontatto)||'N/D'}</span></div>`:''}
      ${context==='vinti'?`<div class="card-row"><span class="card-label">&#127937; Chiusura</span><span class="card-value">${fmtDate(p.dataChiusura)||'N/D'}</span></div>`:''}
      ${p.note&&p.note.trim()?`<div class="card-row card-note"><span class="card-label">&#128221;</span><span class="card-value">${escHtml(p.note)}</span></div>`:''}
    </div>
    ${(p.hasPhone||p.hasEmail||p.hasAddress)?`<div class="card-actions">
      ${p.hasPhone?`<a href="tel:${encodeURI((p.telefono||'').replace(/\s/g,''))}" class="action-btn action-phone">&#128222; Chiama</a>`:''}
      ${p.hasEmail?`<a href="mailto:${encodeURI(p.email||'')}" class="action-btn action-email">&#9993; E-mail</a>`:''}
      ${p.hasAddress?`<a href="https://maps.google.com/?q=${encodeURIComponent(addrFull)}" target="_blank" rel="noopener" class="action-btn action-maps">&#128506; Naviga</a>`:''}
    </div>`:''}
  </div>`;
}

// ============================================================
// MOBILE: FORM CONTATTI
// ============================================================
var _mobileUtenti = {};
async function renderContattiMobile(){
  const page = document.getElementById('pageContatti');
  if(!page) return;
  // Carica utenti per il select se non ancora caricati
  if(Object.keys(_mobileUtenti).length === 0){
    try{
      const dati = await apiCall('getUtenti',{});
      if(dati && typeof dati === 'object') _mobileUtenti = dati;
    }catch(e){}
  }
  const canVeraLista = STATE.isSuperUser || !['Ufficio Preventivi','Reception','Showroom','Segreteria'].includes(STATE.role);
  // Opzioni commerciali
  let optsComm = '<option value="">-- Seleziona --</option>';
  Object.keys(_mobileUtenti).forEach(ruolo=>{
    if(['Ufficio Preventivi','Reception','Showroom','Segreteria'].includes(ruolo)) return;
    (_mobileUtenti[ruolo]||[]).forEach(u=>{optsComm+=`<option value="${u}"${STATE.user===u?' selected':''}>${u}</option>`;});
  });

  // Carica lista contatti se commerciale/admin
  let listaHtml = '';
  if(canVeraLista){
    try{
      const tutti = STATE.isSuperUser?'1':'0';
      const comm = STATE.isSuperUser?'':STATE.user;
      const lista = await apiCall('getContatti',{commerciale:comm,stato:'ATTIVI',tutti:tutti});
      if(lista && lista.length){
        listaHtml = `<div class="mobile-section-title" style="margin-top:20px;">I Miei Contatti (${lista.length})</div>`;
        listaHtml += lista.map(c=>{
          const nome = ((c.cognome||'')+(c.nome?' '+c.nome:'')).trim()||c.ragioneSociale||'N/D';
          const statoColor = {'NUOVO':'#0d9488','INCONTRO DA FISSARE':'#2563eb','INCONTRO FISSATO':'#7c3aed','AFFARE PER IL FUTURO':'#d97706','NON INTERESSANTE':'#9ca3af','CONVERTITO':'#059669'}[c.stato]||'#6b7280';
          return `<div class="preventivo-card" style="border-left:4px solid ${statoColor};margin-bottom:10px;">
            <div class="card-header"><span class="card-id">${escHtml(nome)}</span><span class="badge" style="background:${statoColor};font-size:10px;">${c.stato}</span></div>
            <div class="card-row"><span class="card-label">&#128336;</span><span class="card-value">${c.ggDaInserimento||0} gg da inserimento</span></div>
            ${c.telefono?`<div class="card-row"><span class="card-label">&#128222;</span><span class="card-value"><a href="tel:${c.telefono}" style="color:#2980b9;">${escHtml(c.telefono)}</a></span></div>`:''}
            ${c.comuneCliente?`<div class="card-row"><span class="card-label">&#128205;</span><span class="card-value">${escHtml(c.comuneCliente)}</span></div>`:''}
            ${c.tipoIntervento?`<div class="card-row"><span class="card-label">&#128295;</span><span class="card-value">${escHtml(c.tipoIntervento)}</span></div>`:''}
          </div>`;
        }).join('');
      }else listaHtml='<p style="color:#7f8c8d;text-align:center;padding:16px;">Nessun contatto attivo.</p>';
    }catch(e){ listaHtml='<p style="color:#e74c3c;padding:12px;">Errore caricamento contatti.</p>'; }
  }

  page.innerHTML = `
    <div style="padding:16px 16px 80px 16px;">
      <div class="mobile-section-title">&#128221; Nuovo Contatto Cliente</div>
      <div style="background:white;border-radius:10px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.08);margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;color:#0d9488;text-transform:uppercase;margin-bottom:12px;">A — Dati Anagrafici</div>
        <div class="filter-field"><label>Nome</label><input type="text" id="m_cnt_nome" placeholder="Nome"></div>
        <div class="filter-field"><label>Cognome</label><input type="text" id="m_cnt_cognome" placeholder="Cognome"></div>
        <div class="filter-field"><label>Ragione Sociale</label><input type="text" id="m_cnt_ragSoc" placeholder="Solo se azienda"></div>
        <div class="filter-field"><label>Telefono</label><input type="tel" id="m_cnt_tel" placeholder="+39"></div>
        <div class="filter-field"><label>E-mail</label><input type="email" id="m_cnt_email" placeholder="email@esempio.it"></div>
        <div class="filter-field"><label>Comune Cliente</label><input type="text" id="m_cnt_comune" placeholder="Comune"></div>
        <div class="filter-field"><label>Prov.</label><input type="text" id="m_cnt_prov" placeholder="BS" maxlength="2" style="max-width:80px;"></div>
      </div>
      <div style="background:white;border-radius:10px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.08);margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;color:#2563eb;text-transform:uppercase;margin-bottom:12px;">B — Primo Contatto</div>
        <div class="filter-field"><label>Come ci ha conosciuti</label>
          <select id="m_cnt_come"><option value="">--</option><option>Showroom</option><option>Web / Internet</option><option>Passaparola</option><option>Fiera / Evento</option><option>Pubblicita</option><option>Social Media</option><option>Altro</option></select>
        </div>
        <div class="filter-field"><label>Mezzo Primo Contatto</label>
          <select id="m_cnt_mezzo"><option value="">--</option><option>Telefono</option><option>E-mail</option><option>Di persona</option><option>WhatsApp</option><option>Web form</option></select>
        </div>
      </div>
      <div style="background:white;border-radius:10px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.08);margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;margin-bottom:12px;">C — Contesto Intervento</div>
        <div class="filter-field"><label>Tipo Intervento</label>
          <select id="m_cnt_tipo"><option value="">--</option><option>Nuova costruzione</option><option>Sostituzione</option><option>Ristrutturazione</option><option>Sola fornitura</option></select>
        </div>
        <div class="filter-field"><label>Tipo Edificio</label>
          <select id="m_cnt_edificio"><option value="">--</option><option>Casa singola</option><option>Bifamiliare</option><option>Ville a schiera</option><option>Condominio</option></select>
        </div>
        <div style="font-size:11px;font-weight:700;color:#6b7280;margin:10px 0 8px;">Prodotti di Interesse</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px;">
          ${['Serramenti','Porte Interne','Oscuranti','Zanzariere','Garage','Ingressi Blindati','Ingressi Isolati','Parapetti','Davanzali','Pergola'].map(p=>`<label style="display:flex;align-items:center;gap:6px;font-size:12px;padding:5px 10px;border-radius:16px;border:1px solid #e0e6ed;background:white;cursor:pointer;"><input type="checkbox" class="m_prodotto" value="${p}" style="accent-color:#0d9488;"> ${p}</label>`).join('')}
        </div>
        <div class="filter-field"><label>Note (motivazione, richieste)</label><textarea id="m_cnt_note" rows="3" style="width:100%;padding:8px;border:1px solid #ccd1d9;border-radius:4px;font-size:13px;box-sizing:border-box;"></textarea></div>
      </div>
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px;box-shadow:0 2px 8px rgba(0,0,0,0.08);margin-bottom:16px;">
        <div style="font-size:11px;font-weight:700;color:#1d4ed8;text-transform:uppercase;margin-bottom:12px;">Assegnazione Commerciale</div>
        <div class="filter-field"><label>Commerciale destinatario *</label><select id="m_cnt_comm">${optsComm}</select></div>
      </div>
      <div id="m_msg_contatto" style="display:none;padding:12px;border-radius:6px;font-weight:bold;font-size:13px;margin-bottom:12px;"></div>
      <button onclick="salvaMobileContatto()" style="width:100%;padding:14px;background:#0d9488;color:white;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;">&#10003; Salva Contatto</button>
      ${listaHtml}
    </div>`;
}

async function salvaMobileContatto(){
  const comm = document.getElementById('m_cnt_comm')?document.getElementById('m_cnt_comm').value:'';
  const nome = document.getElementById('m_cnt_nome')?document.getElementById('m_cnt_nome').value.trim():'';
  const cognome = document.getElementById('m_cnt_cognome')?document.getElementById('m_cnt_cognome').value.trim():'';
  const ragSoc = document.getElementById('m_cnt_ragSoc')?document.getElementById('m_cnt_ragSoc').value.trim():'';
  const msgEl = document.getElementById('m_msg_contatto');
  if(!comm){if(msgEl){msgEl.textContent='Seleziona il commerciale';msgEl.style.background='#fadbd8';msgEl.style.color='#c0392b';msgEl.style.display='block';}return;}
  if(!nome&&!cognome&&!ragSoc){if(msgEl){msgEl.textContent='Inserisci almeno Nome/Cognome o Ragione Sociale';msgEl.style.background='#fadbd8';msgEl.style.color='#c0392b';msgEl.style.display='block';}return;}
  const prodotti = Array.from(document.querySelectorAll('.m_prodotto:checked')).map(cb=>cb.value).join(', ');
  try{
    const r = await apiCall('registraContatto',{
      _azione:'registraContatto',
      inseritoDa:STATE.user, commercialeAssegnato:comm,
      nome:nome, cognome:cognome, ragioneSociale:ragSoc,
      telefono:document.getElementById('m_cnt_tel')?document.getElementById('m_cnt_tel').value.trim():'',
      email:document.getElementById('m_cnt_email')?document.getElementById('m_cnt_email').value.trim():'',
      comuneCliente:document.getElementById('m_cnt_comune')?document.getElementById('m_cnt_comune').value.trim():'',
      provinciaCliente:(document.getElementById('m_cnt_prov')?document.getElementById('m_cnt_prov').value.trim():'').toUpperCase(),
      comeConosciuti:document.getElementById('m_cnt_come')?document.getElementById('m_cnt_come').value:'',
      mezzoPrimoContatto:document.getElementById('m_cnt_mezzo')?document.getElementById('m_cnt_mezzo').value:'',
      tipoIntervento:document.getElementById('m_cnt_tipo')?document.getElementById('m_cnt_tipo').value:'',
      tipoEdificio:document.getElementById('m_cnt_edificio')?document.getElementById('m_cnt_edificio').value:'',
      prodottiInteresse:prodotti,
      noteTecniche:document.getElementById('m_cnt_note')?document.getElementById('m_cnt_note').value.trim():''
    });
    if(r && r.errore){if(msgEl){msgEl.textContent='Errore: '+r.errore;msgEl.style.background='#fadbd8';msgEl.style.color='#c0392b';msgEl.style.display='block';}return;}
    if(msgEl){msgEl.textContent='Contatto salvato con successo!';msgEl.style.background='#eafaf1';msgEl.style.color='#1e8449';msgEl.style.display='block';setTimeout(()=>{msgEl.style.display='none';},4000);}
    // Reset form
    ['m_cnt_nome','m_cnt_cognome','m_cnt_ragSoc','m_cnt_tel','m_cnt_email','m_cnt_comune','m_cnt_prov','m_cnt_note'].forEach(id=>{const e=document.getElementById(id);if(e)e.value='';});
    ['m_cnt_come','m_cnt_mezzo','m_cnt_tipo','m_cnt_edificio'].forEach(id=>{const e=document.getElementById(id);if(e)e.selectedIndex=0;});
    document.querySelectorAll('.m_prodotto').forEach(cb=>cb.checked=false);
  }catch(e){if(msgEl){msgEl.textContent='Errore di rete: '+e.message;msgEl.style.background='#fadbd8';msgEl.style.color='#c0392b';msgEl.style.display='block';}}
}
