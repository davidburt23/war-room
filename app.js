'use strict';
// ---------- shared helpers ----------
const fmt = n => Math.round(n).toLocaleString('en-US');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ord = n => n + (['th','st','nd','rd'][((n%100)-20)%10] || ['th','st','nd','rd'][n%100] || 'th');
const store = { get(k){ try{return localStorage.getItem(k)}catch(e){return null} }, set(k,v){ try{localStorage.setItem(k,v)}catch(e){} }, del(k){ try{localStorage.removeItem(k)}catch(e){} } };
const DEFAULT_LEAGUE = {id: '1312333744274669568', name: 'Dynasty Degenerates'};
const savedLeagues = () => { try { const a = JSON.parse(store.get('ddw-leagues') || 'null'); return Array.isArray(a) ? a : null; } catch(e){ return null; } };
const setSaved = a => store.set('ddw-leagues', JSON.stringify(a));
const leagueList = () => savedLeagues() || [DEFAULT_LEAGUE];
const qs = new URLSearchParams(location.search);
const CUR_LEAGUE = qs.get('league') || store.get('ddw-league') || leagueList()[0].id;
function openLeague(id, tab){
  store.set('ddw-league', id);
  const u = new URL(location.href); u.searchParams.set('league', id); u.hash = tab || location.hash.slice(1) || 'trade';
  location.href = u.toString();
}

// ---------- menu + tabs ----------
const tabs = [...document.querySelectorAll('nav.tabs button[data-tab]')];
const drawer = document.getElementById('drawer'), drawerBg = document.getElementById('drawerBg'), menuBtn = document.getElementById('menuBtn');
function setDrawer(open){
  drawer.classList.toggle('open', open); drawerBg.classList.toggle('open', open);
  drawer.setAttribute('aria-hidden', !open); menuBtn.setAttribute('aria-expanded', open);
  tabs.forEach(b => b.tabIndex = open ? 0 : -1);
  if (open) (tabs.find(b => b.getAttribute('aria-current') === 'page') || tabs[0]).focus(); else if (drawer.contains(document.activeElement)) menuBtn.focus();
}
menuBtn.addEventListener('click', () => setDrawer(!drawer.classList.contains('open')));
drawerBg.addEventListener('click', () => setDrawer(false));
document.getElementById('drawerClose').addEventListener('click', () => setDrawer(false));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && drawer.classList.contains('open')) setDrawer(false); });
let BOOTED = false, curTabId = 'trade';
function show(id){
  curTabId = id;
  tabs.forEach(b => b.dataset.tab === id ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'));
  const cur = tabs.find(b => b.dataset.tab === id); document.getElementById('curTab').textContent = cur ? cur.textContent : '';
  const ready = BOOTED || id === 'leagues';
  document.querySelectorAll('section.view').forEach(s => s.hidden = !ready || s.id !== 'v-'+id);
  document.getElementById('boot').hidden = ready;
  store.set('ddw-tab', id);
}
tabs.forEach(b => { b.tabIndex = -1; b.addEventListener('click', () => { show(b.dataset.tab); history.replaceState(null,'','#'+b.dataset.tab); setDrawer(false); window.scrollTo(0, 0); }); });
{ const h = location.hash.slice(1); show(tabs.some(b => b.dataset.tab === h) ? h : (store.get('ddw-tab') || 'trade')); }

// ---------- league switcher ----------
function renderSwitcher(curName){
  const list = leagueList().slice();
  if (!list.some(l => l.id === CUR_LEAGUE)) list.unshift({id: CUR_LEAGUE, name: curName || 'This league'});
  const sel = document.getElementById('leagueSel');
  sel.innerHTML = list.map(l => `<option value="${esc(l.id)}" ${l.id === CUR_LEAGUE ? 'selected' : ''}>${esc(l.name)}${l.season ? ' (' + esc(l.season) + ')' : ''}</option>`).join('') + `<option value="__manage">Add or manage leagues…</option>`;
  sel.onchange = e => { if (e.target.value === '__manage'){ e.target.value = CUR_LEAGUE; show('leagues'); history.replaceState(null,'','#leagues'); } else openLeague(e.target.value); };
}
renderSwitcher();

// ---------- leagues tab ----------
(function(){
  const $ = id => document.getElementById(id);
  const kindTxt = l => `${l.teams} teams · ${l.desc.kind} · ${l.desc.format} · ${l.desc.scoring}`;
  let found = [];
  function renderSaved(){
    const s = savedLeagues();
    const list = s || [DEFAULT_LEAGUE];
    $('lgSaved').innerHTML = `<div class="roster">${list.map(l => `<div class="row"><span class="nm"><b>${esc(l.name)}</b>${l.season ? ` <span class="muted" style="font-size:.82rem">${esc(l.season)}</span>` : ''}${l.desc ? `<div class="muted" style="font-size:.8rem">${esc(kindTxt(l))}</div>` : (s ? '' : '<div class="muted" style="font-size:.8rem">Default league</div>')}</span>${l.id === CUR_LEAGUE ? '<span class="pill in">Viewing</span>' : `<button class="btn" data-open="${esc(l.id)}">Open</button>`}${s ? `<button class="btn" data-rm="${esc(l.id)}" aria-label="Remove ${esc(l.name)}">Remove</button>` : ''}</div>`).join('')}</div>`;
    $('lgSaved').querySelectorAll('[data-open]').forEach(b => b.onclick = () => openLeague(b.dataset.open, 'trade'));
    $('lgSaved').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { setSaved((savedLeagues() || []).filter(l => l.id !== b.dataset.rm)); renderSaved(); renderFound(); renderSwitcher(); });
  }
  function toggle(l, on){
    let s = savedLeagues() || [];
    if (on && !s.some(x => x.id === l.id)) s.push(l);
    if (!on) s = s.filter(x => x.id !== l.id);
    setSaved(s); renderSaved(); renderSwitcher();
  }
  function renderFound(){
    if (!found.length){ $('lgFound').innerHTML = ''; return; }
    const s = new Set((savedLeagues() || []).map(l => l.id));
    $('lgFound').innerHTML = `<div class="panel"><h3>Leagues for ${esc((JSON.parse(store.get('ddw-sleeper') || '{}')).display_name || '')}</h3><p class="muted" style="margin:4px 0 10px">Tick the leagues you want in the league switcher. The site works best for dynasty leagues; redraft and keeper leagues still get values, projections and trade grades.</p>
      <div class="lgcards">${found.map(l => `<label class="lgcard ${s.has(l.id) ? 'on' : ''}"><input type="checkbox" data-id="${esc(l.id)}" ${s.has(l.id) ? 'checked' : ''}><span><b>${esc(l.name)}</b> <span class="muted" style="font-size:.82rem">${esc(l.season)}</span><span class="lgmeta">${esc(kindTxt(l))}</span><span class="lgmeta">${esc(l.desc.lineup)}</span></span><button class="btn" type="button" data-go="${esc(l.id)}">Open</button></label>`).join('')}</div>
      <div class="btnrow" style="margin-top:10px"><button class="btn" id="lgAllDyn">Add all dynasty leagues</button></div></div>`;
    $('lgFound').querySelectorAll('input[data-id]').forEach(c => c.onchange = () => { toggle(found.find(l => l.id === c.dataset.id), c.checked); renderFound(); });
    $('lgFound').querySelectorAll('[data-go]').forEach(b => b.onclick = e => { e.preventDefault(); const l = found.find(x => x.id === b.dataset.go); toggle(l, true); openLeague(l.id, 'trade'); });
    $('lgAllDyn').onclick = () => { found.filter(l => l.type === 2).forEach(l => toggle(l, true)); renderFound(); };
  }
  async function lookup(name){
    $('lgMsg').textContent = 'Looking up ' + name + '…';
    try {
      const u = await ENGINE.findUser(name);
      if (!u){ $('lgMsg').textContent = `Sleeper has no user named "${name}". Check the spelling (it's your Sleeper username, not your team name).`; return; }
      store.set('ddw-sleeper', JSON.stringify(u));
      found = await ENGINE.userLeagues(u.user_id);
      found.sort((a, b) => (b.type === 2) - (a.type === 2) || a.name.localeCompare(b.name));
      $('lgMsg').textContent = found.length ? `Found ${found.length} league${found.length > 1 ? 's' : ''}. Your team in each league is picked automatically.` : `${u.display_name} isn't in any leagues this season.`;
      renderFound();
    } catch(e){ $('lgMsg').textContent = "Couldn't reach Sleeper just now. Check your connection and try again."; }
  }
  $('lgForm').addEventListener('submit', e => { e.preventDefault(); const v = $('lgUser').value.trim(); if (v) lookup(v); });
  $('lgIdForm').addEventListener('submit', async e => {
    e.preventDefault(); const id = $('lgId').value.trim().replace(/\D/g, '');
    if (!id){ return; }
    $('lgIdMsg').textContent = 'Looking up league…';
    try { const l = await ENGINE.leagueSummary(id); if (!l){ $('lgIdMsg').textContent = 'No league with that ID.'; return; } toggle(l, true); $('lgIdMsg').textContent = `Added ${l.name}.`; $('lgId').value = ''; }
    catch(err){ $('lgIdMsg').textContent = "Couldn't reach Sleeper just now."; }
  });
  $('lgSignOut').addEventListener('click', () => { store.del('ddw-sleeper'); found = []; $('lgUser').value = ''; $('lgMsg').textContent = ''; renderFound(); });
  const su = (() => { try { return JSON.parse(store.get('ddw-sleeper') || 'null'); } catch(e){ return null; } })();
  if (su){ $('lgUser').value = su.display_name; ENGINE.userLeagues(su.user_id).then(f => { found = f.sort((a, b) => (b.type === 2) - (a.type === 2) || a.name.localeCompare(b.name)); renderFound(); }).catch(() => {}); }
  renderSaved();
})();

// ---------- tooltips: hover, keyboard focus or tap any [data-tip] ----------
(function(){
  const tipEl = document.createElement('div'); tipEl.id = 'tip'; tipEl.setAttribute('role', 'tooltip'); tipEl.hidden = true; document.body.appendChild(tipEl);
  let cur = null;
  function place(el){
    tipEl.textContent = el.dataset.tip; tipEl.hidden = false; cur = el;
    const r = el.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight, vw = innerWidth, vh = innerHeight;
    let x = Math.min(Math.max(8, r.left + r.width/2 - w/2), vw - w - 8), y = r.bottom + 8;
    if (y + h > vh - 8) y = Math.max(8, r.top - h - 8);
    tipEl.style.left = x + 'px'; tipEl.style.top = y + 'px';
  }
  const hide = () => { tipEl.hidden = true; cur = null; };
  document.addEventListener('mouseover', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) place(el); else if (cur) hide(); });
  document.addEventListener('focusin', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) place(el); });
  document.addEventListener('focusout', e => { if (cur && e.target === cur) hide(); });
  document.addEventListener('click', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el){ if (cur === el && !tipEl.hidden) hide(); else place(el); } else hide(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  addEventListener('scroll', () => { if (cur && !tipEl.hidden){ const r = cur.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) hide(); else place(cur); } }, true);
})();

// ---------- load the league, then build every tab ----------
(async function(){
  const bar = document.getElementById('bootBar'), msg = document.getElementById('bootMsg');
  try {
    const D = await ENGINE.load(CUR_LEAGUE, (m, f) => { msg.textContent = m; bar.style.width = Math.round(f * 100) + '%'; });
    document.title = `${D.league.name} · The Wylie Model`;
    renderSwitcher(D.league.name);
    BOOTED = true;
    boot(D);
    show(curTabId);
  } catch(e){
    console.error(e);
    msg.textContent = (e && e.message && !/fetch/i.test(e.message) ? e.message : "Couldn't load this league from Sleeper.") + ' Try again, or pick another league.';
    document.getElementById('bootRetry').hidden = false;
  }
})();
document.getElementById('bootRetry').addEventListener('click', () => location.reload());

// ---------- everything that depends on the loaded league ----------
function boot(D){
const P = D.players, TEAMS = D.teams;
// "Viewing as": league view by default; a viewer can pick their team (stored in this browser only)
const L = D.L, LID = D.league.id, NT = L.teams, ROUNDS = Array.from({length: L.rounds}, (_, i) => i + 1), DS = L.draftSeason;
const ME = (() => {
  const v = store.get('ddw-team:' + LID);
  if (v === 'none') return null;
  const n = parseInt(v, 10); if (TEAMS.some(t => t.rid === n)) return n;
  // default to the team owned by the saved Sleeper user, if any
  try { const su = JSON.parse(store.get('ddw-sleeper') || 'null'); if (su) { const t = TEAMS.find(t => t.owner_id === su.user_id || (t.co_owners || []).includes(su.user_id)); if (t) return t.rid; } } catch(e){}
  return null;
})();
const MEO = ME && D.owner_of ? D.owner_of[String(ME)] : null;
window.setViewingAs = function(v){ store.set('ddw-team:' + LID, !v || v === 'none' ? 'none' : String(v)); location.reload(); };
const TM = Object.fromEntries(TEAMS.map(t => [t.rid, t]));

// ---------- asset catalog ----------
const ASSETS = {};
for (const p of Object.values(P)) ASSETS['p'+p.id] = {key:'p'+p.id, kind:'player', name:p.name, pos:p.pos, value:p.value, sub:`${p.pos} · ${p.team} · ${p.age ?? '–'} yrs`, owner:D.rostered[p.id] ?? null, pid:p.id};
for (const k of D.picks) ASSETS['k'+k.id] = {key:'k'+k.id, kind:'pick', name:k.label, pos:'PK', value:k.value, sub:`Original: ${TM[k.orig].name}`, owner:k.owner, season:k.season, round:k.round, orig:k.orig};
for (const g of D.generic_picks) ASSETS['g'+g.id] = {key:'g'+g.id, kind:'generic', name:g.label, pos:'PK', value:g.value, sub:'Generic pick value', owner:null};

// ---------- viewing as ----------
document.getElementById('viewAs').innerHTML = `<option value="none">Whole league</option>` + TEAMS.slice().sort((a,b) => a.name.localeCompare(b.name)).map(t => `<option value="${t.rid}" ${t.rid===ME?'selected':''}>${esc(t.name)}</option>`).join('');
document.getElementById('viewAs').addEventListener('change', e => setViewingAs(e.target.value));

// ---------- meta ----------
const upd = new Date(D.updated);
document.getElementById('dmeta').textContent = document.getElementById('meta').textContent = `Week ${D.week} · ${D.league.season} season · Values updated ${upd.toLocaleString([], {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'})}`;

const lineup = D.lineup;
{ const W = D.weights, pc = k => Math.round((W[k]||0)*100), [s0, s1, s2] = L.seasons;
  document.getElementById('tradeLede').textContent = `Values blend ${D.sources.flock ? `Flock (${pc('flock')}%), KeepTradeCut (${pc('ktc')}%) and Dynasty Daddy (${pc('dd')}%)` : `KeepTradeCut (${pc('ktc')}%) and Dynasty Daddy (${pc('dd')}%)`} ${L.sf ? 'superflex' : '1QB'} values${L.tep ? ', with a TE-premium boost' : ''}. ${s0} picks are priced from where each team is projected to pick.`;
  document.getElementById('powerLede').textContent = `Total dynasty value of every roster: all players (including taxi and IR) plus owned ${s0}–${s2} picks. Starters is the best lineup by value for this league's starting slots. Select a team to see its roster.`;
  document.getElementById('picksLede').textContent = `Who owns every ${s0}–${s2} pick. ${s0} values follow each original team's projected draft slot; ${s1} and ${s2} picks are valued as mid-round.`; }
const sv = ids => lineup(ids).reduce((s,i) => s + P[i].value, 0);

// ---------- trade calculator ----------
// Consolidation adjustment: a side's trade value is the 1.4-norm of its pieces, so one elite asset beats several mid ones.
const NORM = 1.4;
const adj = vals => vals.length ? Math.pow(vals.reduce((s,v) => s + Math.pow(v, NORM), 0), 1/NORM) : 0;
// Stud premium ("no pennies for a dollar"): when one side sends fewer pieces and has the single best asset,
// it gets credit for 30% of the gap between the two sides' best assets.
const STUD = 0.30;
function sides(av, bv){
  const a = adj(av), b = adj(bv), ba = Math.max(0, ...av), bb = Math.max(0, ...bv);
  let pa = 0, pb = 0;
  if (av.length && bv.length){
    if (ba > bb && av.length < bv.length) pa = STUD * (ba - bb);
    if (bb > ba && bv.length < av.length) pb = STUD * (bb - ba);
  }
  return {a: a + pa, b: b + pb, pa, pb};
}
const vals = k => state[k].items.map(x => ASSETS[x]).filter(Boolean).map(a => a.value);
const state = { A:{team:ME || TEAMS.slice().sort((a,b) => a.name.localeCompare(b.name))[0].rid, items:[]}, B:{team:null, items:[]} };
try { const s = JSON.parse(store.get('ddw-trade:' + LID) || 'null'); if (s && s.A && TM[s.A.team] && TM[s.B.team]) { Object.assign(state.A, s.A); Object.assign(state.B, s.B); ['A','B'].forEach(k => state[k].items = state[k].items.filter(x => ASSETS[x])); } } catch(e){}
if (!state.B.team) state.B.team = TEAMS.filter(t => t.rid !== state.A.team).sort((a,b) => b.total_value - a.total_value)[0].rid;
const save = () => store.set('ddw-trade:' + LID, JSON.stringify(state));

function renderSide(k){
  const s = state[k], other = state[k === 'A' ? 'B' : 'A'];
  const el = document.getElementById('side'+k);
  const opts = TEAMS.slice().sort((a,b) => a.name.localeCompare(b.name)).map(t => `<option value="${t.rid}" ${t.rid==s.team?'selected':''}>${esc(t.name)}${ME && t.rid===ME?' ★':''}</option>`).join('');
  const items = s.items.map(key => ASSETS[key]).filter(Boolean);
  el.innerHTML = `
    <div class="side-head"><label for="team${k}">${k==='A'?'Side A gives':'Side B gives'}</label><select id="team${k}">${opts}</select></div>
    <div class="picker"><input type="search" id="search${k}" placeholder="Add a player or pick" autocomplete="off" aria-label="Add a player or pick to side ${k}"><div class="results" id="res${k}" hidden></div></div>
    <div class="assets">${items.length ? items.map(a => `
      <div class="asset"><span class="pos ${a.pos}">${a.pos}</span><div class="nm">${esc(a.name)}<small>${esc(a.sub)}</small></div><span class="num">${fmt(a.value)}</span><button class="x" data-rm="${a.key}" aria-label="Remove ${esc(a.name)}">×</button></div>`).join('') : `<div class="empty">Add what ${esc(TM[s.team].name)} sends in this deal.</div>`}</div>
    <div class="sidetot"><span class="muted">${items.length} asset${items.length===1?'':'s'} · raw ${fmt(items.reduce((x,a)=>x+a.value,0))}${(() => { const sv_ = sides(vals('A'), vals('B')); const p = k==='A'?sv_.pa:sv_.pb; return p ? ` · <b style="color:var(--accent)">+${fmt(p)} stud premium</b>` : ''; })()}</span><span class="big num">${fmt(k==='A'?sides(vals('A'),vals('B')).a:sides(vals('A'),vals('B')).b)}</span></div>`;
  el.querySelector('select').addEventListener('change', e => { s.team = +e.target.value; s.items = s.items.filter(key => ASSETS[key].owner == null || ASSETS[key].owner === s.team); save(); renderTrade(); });
  el.querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { s.items = s.items.filter(x => x !== b.dataset.rm); save(); renderTrade(); }));
  const inp = el.querySelector('input'), res = el.querySelector('.results');
  let hl = 0, list = [];
  const draw = () => {
    const q = inp.value.trim().toLowerCase();
    const taken = new Set([...state.A.items, ...state.B.items]);
    const pool = Object.values(ASSETS).filter(a => !taken.has(a.key) && (!q || a.name.toLowerCase().includes(q)));
    const mine = pool.filter(a => a.owner === s.team).sort((a,b) => b.value - a.value);
    const rest = q ? pool.filter(a => a.owner !== s.team).sort((a,b) => b.value - a.value).slice(0, 25) : [];
    list = [...mine, ...rest]; hl = 0;
    const row = (a,i) => `<button data-k="${a.key}" class="${i===hl?'hl':''}"><span class="pos ${a.pos}">${a.pos}</span><span class="nm">${esc(a.name)}</span><span class="muted" style="font-size:.78rem">${a.owner && a.owner!==s.team ? esc(TM[a.owner].name) : (a.kind==='generic'?'generic':'')}</span><span class="num">${fmt(a.value)}</span></button>`;
    res.innerHTML = (mine.length ? `<div class="grp">${esc(TM[s.team].name)}</div>` + mine.map(row).join('') : '') + (rest.length ? `<div class="grp">Everyone else</div>` + rest.map((a,i)=>row(a,i+mine.length)).join('') : '') || '<div class="grp">No matches</div>';
    res.hidden = false;
    res.querySelectorAll('button').forEach(b => b.addEventListener('mousedown', ev => { ev.preventDefault(); add(b.dataset.k); }));
  };
  const add = key => { s.items.push(key); save(); renderTrade(); setTimeout(()=>document.getElementById('search'+k)?.focus(), 0); };
  inp.addEventListener('focus', draw); inp.addEventListener('input', draw);
  inp.addEventListener('blur', () => setTimeout(() => res.hidden = true, 120));
  inp.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){ e.preventDefault(); hl = Math.max(0, Math.min(list.length-1, hl + (e.key==='ArrowDown'?1:-1))); res.querySelectorAll('button').forEach((b,i)=>b.classList.toggle('hl', i===hl)); res.querySelectorAll('button')[hl]?.scrollIntoView({block:'nearest'}); }
    if (e.key === 'Enter' && list[hl]){ e.preventDefault(); add(list[hl].key); }
    if (e.key === 'Escape') res.hidden = true;
  });
}

function teamAfter(rid, gives, gets){
  const t = TM[rid];
  const out = new Set(gives.filter(a => a.kind==='player').map(a => a.pid));
  const ids = t.players.filter(i => !out.has(i) && !t.ir.includes(i)).concat(gets.filter(a => a.kind==='player').map(a => a.pid));
  const pv = gives.concat(gets);
  const total = t.total_value - gives.filter(a=>a.kind!=='generic').reduce((s,a)=>s+a.value,0) + gets.filter(a=>a.kind!=='generic').reduce((s,a)=>s+a.value,0);
  return {start: sv(ids), total};
}

function renderVerdict(){
  const A = state.A.items.map(k=>ASSETS[k]), B = state.B.items.map(k=>ASSETS[k]);
  const el = document.getElementById('verdict');
  if (!A.length && !B.length){
    el.innerHTML = `<div class="vhead"><div class="vtext">Build a trade</div></div><p class="muted" style="margin:0">Add assets to both sides. The verdict, the value gap and how each lineup changes appear here.</p>`;
    return;
  }
  const SV = sides(A.map(a=>a.value), B.map(a=>a.value)), va = SV.a, vb = SV.b;
  const tot = va + vb || 1, diff = va - vb, pct = Math.abs(diff) / Math.max(va, vb, 1) * 100;
  const tA = TM[state.A.team], tB = TM[state.B.team];
  const winner = diff > 0 ? tB : tA; // side receiving more
  let cls = 'fair', text = 'Fair trade';
  if (pct >= 5 && pct < 15){ cls = 'lean'; text = `Leans ${winner.name}`; }
  if (pct >= 15){ cls = 'lopsided'; text = `Wins it: ${winner.name}`; }
  const aAfter = teamAfter(tA.rid, A, B), bAfter = teamAfter(tB.rid, B, A);
  const aStart0 = sv(tA.players.filter(i=>!tA.ir.includes(i))), bStart0 = sv(tB.players.filter(i=>!tB.ir.includes(i)));
  const d = (x,y) => { const v = Math.round(y-x); return `<span class="delta ${v>0?'up':v<0?'down':''}">${v>0?'+':''}${fmt(v)}</span>`; };
  // balance suggestions: packages of 1-3 assets from the side giving less, scored with the stud premium included
  const needSide = diff > 0 ? 'B' : 'A', gap = Math.abs(diff);
  let sugg = [];
  if (pct >= 5){
    const s = state[needSide], taken = new Set([...state.A.items, ...state.B.items]);
    const curNeed = (needSide==='A'?A:B).map(a=>a.value), curOther = (needSide==='A'?B:A).map(a=>a.value);
    const pool = Object.values(ASSETS).filter(a => a.owner === s.team && !taken.has(a.key) && a.value >= 300).sort((x,y) => y.value - x.value).slice(0, 32);
    const cands = [];
    const score = combo => {
      const nv = curNeed.concat(combo.map(a=>a.value));
      const r = needSide==='A' ? sides(nv, curOther) : sides(curOther, nv);
      const mine = needSide==='A' ? r.a : r.b, theirs = needSide==='A' ? r.b : r.a;
      return (mine - theirs) / Math.max(mine, theirs, 1);   // >0 means the package side now gives more
    };
    for (let i = 0; i < pool.length; i++){
      cands.push([pool[i]]);
      for (let j = i+1; j < pool.length; j++){
        cands.push([pool[i], pool[j]]);
        for (let k2 = j+1; k2 < pool.length; k2++) cands.push([pool[i], pool[j], pool[k2]]);
      }
    }
    const ok = cands.map(c => ({c, f: score(c)})).filter(x => x.f >= -0.03 && x.f <= 0.08);
    const pick = [];
    for (const n of [1, 2, 3]){
      const seenTop = new Set();
      for (const x of ok.filter(x => x.c.length === n).sort((p,q) => Math.abs(p.f-0.01) - Math.abs(q.f-0.01))){
        if (seenTop.has(x.c[0].key)) continue;
        seenTop.add(x.c[0].key); pick.push(x);
        if (seenTop.size >= (n === 1 ? 2 : 3)) break;
      }
    }
    sugg = pick.slice(0, 8);
  }
  el.innerHTML = `
    <div class="vhead"><div class="vtext ${cls}">${esc(text)}</div><div class="num muted">Gap ${fmt(gap)} (${pct.toFixed(1)}%)</div></div>
    <div><div class="bar"><span class="a" style="width:${va/tot*100}%"></span><span class="b" style="width:${vb/tot*100}%"></span><i class="mid"></i></div>
    <div class="barlbl"><span>${esc(tA.name)} gives ${fmt(va)}</span><span>${esc(tB.name)} gives ${fmt(vb)}</span></div></div>
    <div class="stats">
      <div class="stat"><div class="k">${esc(tA.name)} starters</div><div class="v">${fmt(aStart0)} → ${fmt(aAfter.start)} ${d(aStart0,aAfter.start)}</div></div>
      <div class="stat"><div class="k">${esc(tA.name)} total value</div><div class="v">${fmt(tA.total_value)} → ${fmt(aAfter.total)} ${d(tA.total_value,aAfter.total)}</div></div>
      <div class="stat"><div class="k">${esc(tB.name)} starters</div><div class="v">${fmt(bStart0)} → ${fmt(bAfter.start)} ${d(bStart0,bAfter.start)}</div></div>
      <div class="stat"><div class="k">${esc(tB.name)} total value</div><div class="v">${fmt(tB.total_value)} → ${fmt(bAfter.total)} ${d(tB.total_value,bAfter.total)}</div></div>
    </div>
    ${(SV.pa || SV.pb) ? `<p style="margin:0;font-size:.88rem"><b>Stud premium:</b> ${esc((SV.pa?tA:tB).name)} sends the best asset in fewer pieces, so that side gets +${fmt(SV.pa||SV.pb)} (30% of the gap between the two best assets). Depth doesn't buy a star at face value.</p>` : ''}
    ${pct >= 5 ? `<div><h3 style="margin-bottom:6px">Packages that even it out (${esc(TM[state[needSide].team].name)} adds)</h3>${sugg.length ? `<div class="pkgs">${sugg.map((x,i)=>`<div class="pkg"><div class="pkg-items">${x.c.map(a=>`<span class="pkg-a"><span class="pos ${a.pos}">${a.pos}</span>${esc(a.name)} <span class="num muted">${fmt(a.value)}</span></span>`).join('')}</div><div class="pkg-foot"><span class="muted" style="font-size:.8rem">${x.c.length} piece${x.c.length>1?'s':''} · ${x.f>=0.005?'slight overpay':x.f<=-0.005?'slight underpay':'dead even'} (${x.f>=0?'+':''}${(x.f*100).toFixed(1)}%)</span><button class="btn" data-pkg="${i}">Add package</button></div></div>`).join('')}</div>` : `<p class="muted" style="margin:0">Nothing on ${esc(TM[state[needSide].team].name)}'s roster balances this, even in packages of three. Take a piece off the other side instead.</p>`}</div>` : ''}
    <div class="btnrow"><button class="btn" id="swap">Swap sides</button><button class="btn" id="clear">Clear trade</button></div>
    <p class="muted" style="margin:0;font-size:.82rem">Side totals use a consolidation adjustment plus a stud premium, so one elite asset is worth more than several smaller ones that add up to the same raw number. Starter values use the best legal lineup by value.</p>`;
  el.querySelectorAll('[data-pkg]').forEach(b => b.addEventListener('click', () => { state[needSide].items.push(...sugg[+b.dataset.pkg].c.map(a => a.key)); save(); renderTrade(); }));
  el.querySelector('#swap').addEventListener('click', () => { [state.A, state.B] = [state.B, state.A]; save(); renderTrade(); });
  el.querySelector('#clear').addEventListener('click', () => { state.A.items = []; state.B.items = []; save(); renderTrade(); });
}
function renderTrade(){ renderSide('A'); renderSide('B'); renderVerdict(); }
renderTrade();

// ---------- power rankings ----------
const byTotal = TEAMS.slice().sort((a,b) => b.total_value - a.total_value);
const maxTot = byTotal[0].total_value;
let selTeam = ME || byTotal[0].rid;
function renderPower(){
  const rows = byTotal.map((t,i) => {
    const seg = [['QB','--qb'],['RB','--rb'],['WR','--wr'],['TE','--te']].map(([p,c]) => `<span style="width:${t.pos_value[p]/maxTot*100}%;background:var(${c})" title="${p} ${fmt(t.pos_value[p])}"></span>`).join('') + `<span style="width:${t.pick_value/maxTot*100}%;background:var(--pk)" title="Picks ${fmt(t.pick_value)}"></span>`;
    const sRank = 1 + TEAMS.filter(x => x.starter_value > t.starter_value).length;
    return `<tr class="click ${t.rid===ME?'me':''}" data-rid="${t.rid}"><td class="num">${i+1}</td><td class="teamname">${esc(t.name)}<div class="muted" style="font-size:.78rem">${esc(t.owner)}${L.divisions > 1 ? ' · Div ' + t.div : ''}</div></td><td class="num">${t.w}-${t.l}${t.t?'-'+t.t:''}</td><td class="r num"><b>${fmt(t.total_value)}</b></td><td class="r num">${fmt(t.starter_value)} <span class="muted">(${ord(sRank)})</span></td><td class="r num">${fmt(t.bench_value)}</td><td class="r num">${fmt(t.pick_value)}</td><td><div class="posbar">${seg}</div></td></tr>`;
  }).join('');
  document.getElementById('powerTbl').innerHTML = `<thead><tr><th>#</th><th>Team</th><th>Record</th><th class="r">Total</th><th class="r">Starters</th><th class="r">Bench</th><th class="r">Picks</th><th>Makeup</th></tr></thead><tbody>${rows}</tbody>`;
  document.querySelectorAll('#powerTbl tr[data-rid]').forEach(tr => tr.addEventListener('click', () => { selTeam = +tr.dataset.rid; renderDetail(); document.getElementById('teamDetail').scrollIntoView({behavior:'smooth', block:'start'}); }));
  renderDetail();
}
function renderDetail(){
  const t = TM[selTeam];
  const ids = t.players.slice().sort((a,b) => (P[b]?.value||0) - (P[a]?.value||0));
  const row = i => { const p = P[i]; const st = t.starters.includes(i); const tag = st ? '<span class="tag st">Start</span>' : t.ir.includes(i) ? '<span class="tag">IR</span>' : t.taxi.includes(i) ? '<span class="tag">Taxi</span>' : '';
    return p ? `<div class="row"><span class="pos ${p.pos}">${p.pos}</span><span class="nm">${esc(p.name)} <span class="muted" style="font-size:.8rem">${p.team} · ${p.age ?? '–'}</span></span>${tag}<span class="num">${fmt(p.value)}</span></div>` : ''; };
  const pk = D.picks.filter(p => p.owner === t.rid).sort((a,b) => a.season.localeCompare(b.season) || a.round - b.round || b.value - a.value);
  document.getElementById('teamDetail').innerHTML = `
    <div class="panel"><h3>${esc(t.name)} roster</h3><p class="muted" style="margin:4px 0 8px">${fmt(t.player_value)} in players · ${t.players.length} rostered</p><div class="roster">${ids.map(row).join('')}</div></div>
    <div class="panel"><h3>${esc(t.name)} picks</h3><p class="muted" style="margin:4px 0 8px">${fmt(t.pick_value)} in ${pk.length} picks</p><div class="roster">${pk.map(p => `<div class="row"><span class="pos PK">${p.season.slice(2)}</span><span class="nm">${esc(p.label)}${p.orig!==t.rid?` <span class="muted" style="font-size:.8rem">via ${esc(TM[p.orig].name)}</span>`:''}</span><span class="num">${fmt(p.value)}</span></div>`).join('') || '<p class="muted">No picks owned.</p>'}</div></div>`;
}
renderPower();

// ---------- projections ----------
document.getElementById('projLede').textContent = `${D.sims.toLocaleString()} simulations of the rest of the regular season (through Week ${L.regWeeks}) and the playoffs, using each team's scoring so far blended with its starting-lineup value. ` +
  (L.isDD ? 'Seeding follows the bylaws: three teams per division, division winners get byes, ties go to points for.' : `${L.playoffTeams} teams make the playoffs${L.divisions > 1 ? ', division winners first' : ''}${L.byes ? `, and the top ${L.byes} get a bye` : ''}; ties go to points for.`) +
  (D.completed_weeks.length ? ` Through ${D.completed_weeks.length} completed week${D.completed_weeks.length > 1 ? 's' : ''}.` : ' No games played yet, so ratings come from lineup value alone.');
document.getElementById('draftBoardTitle').textContent = `${DS} rookie draft board`;
document.getElementById('draftRuleLede').textContent = L.isDD
  ? "Where each team's pick is likely to land, from the season simulation. Per the bylaws, non-playoff teams pick 1–6 in order of max points for, and the bottom four by max PF enter a lottery for picks 1–4. Playoff teams pick 7–12 by finish, and the two first-round playoff losers are ordered by their elimination score. All four rounds follow the same order, so each row also shows who owns that team's later picks."
  : L.orderSet ? `The ${DS} draft order is already set in Sleeper, so each team's slot is shown as fixed.`
  : `Where each team's pick is likely to land, from the season simulation. Sleeper doesn't record custom draft-order rules, so this assumes reverse standings: non-playoff teams pick first, worst record first, then playoff teams by how far they go. ${L.snake ? 'The draft is a snake, so even rounds reverse.' : 'Every round follows the same order.'}`;
function renderProj(){
  const rows = TEAMS.slice().sort((a,b) => a.proj.avg_place - b.proj.avg_place);
  const maxp = Math.max(...rows.flatMap(t => t.proj.place));
  const pill = p => p >= 85 ? '<span class="pill in">Likely in</span>' : p >= 25 ? '<span class="pill bub">Bubble</span>' : '<span class="pill out">Long shot</span>';
  document.getElementById('projTbl').innerHTML = `<thead><tr><th>Team</th>${L.divisions > 1 ? '<th>Div</th>' : ''}<th>Record</th><th class="r">Proj. wins</th><th class="r">Playoffs</th><th class="r">Bye</th><th class="r">Title</th><th>Regular-season finish (1st → ${ord(NT)})</th><th class="r">Avg finish</th></tr></thead><tbody>${rows.map(t => {
    const p = t.proj;
    const heat = p.place.map((x,i) => `<i title="${ord(i+1)}: ${x}%" style="opacity:${0.06 + 0.94 * x/maxp}"></i>`).join('');
    return `<tr class="${t.rid===ME?'me':''}"><td class="teamname">${esc(t.name)}</td>${L.divisions > 1 ? `<td class="num">${t.div}</td>` : ''}<td class="num">${t.w}-${t.l}</td><td class="r num">${p.wins.toFixed(1)}</td><td class="r"><span class="num pct">${p.playoff}%</span> ${pill(p.playoff)}</td><td class="r num">${p.bye}%</td><td class="r num">${p.champ}%</td><td><div class="heat">${heat}</div></td><td class="r num">${ord(Math.round(p.avg_place))}</td></tr>`;}).join('')}</tbody>`;
  const dr = TEAMS.slice().sort((a,b) => a.proj.avg_slot - b.proj.avg_slot);
  const pickOf = (rnd, orig) => D.picks.find(k => k.season===DS && k.round===rnd && k.orig===orig);
  const range = sl => { // middle 80% of outcomes
    let c = 0, lo = null, hi = null;
    sl.forEach((x,i) => { const prev = c; c += x; if (lo === null && c >= 10) lo = i+1; if (hi === null && c >= 90) hi = i+1; });
    return lo === hi ? `${lo}` : `${lo}–${hi ?? NT}`;
  };
  const head = Array.from({length:NT}, (_,i) => `<th class="r slotcol">${i+1}</th>`).join('');
  const LR = ROUNDS.slice(1, 5);
  document.getElementById('draftTbl').innerHTML = `<thead><tr><th>Proj.</th><th>Original team</th><th class="r">Avg</th><th class="r">Likely</th>${L.isDD ? '<th class="r">Lottery</th>' : ''}${head}<th>1st owner</th><th class="r">1st value</th>${LR.map(r => `<th>${ord(r)}</th>`).join('')}</tr></thead><tbody>${dr.map((t,i) => {
    const p = t.proj, mx = Math.max(...p.slot), mode = p.slot.indexOf(mx);
    const cells = p.slot.map((x,j) => `<td class="hc${j===mode?' mode':''}" title="${t.name}: pick ${j+1} — ${x}%" style="--a:${x <= 0 ? 0 : 0.10 + 0.85 * x / 60}">${x >= 1 ? Math.round(x) : x > 0 ? '<1' : ''}</td>`).join('');
    const p1 = pickOf(1, t.rid), o = r => { const k = pickOf(r, t.rid); return k ? `<span class="${k.owner===ME?'mine':''}">${esc(TM[k.owner].name)}</span>` : '–'; };
    const mineRow = ME && ROUNDS.some(r => (pickOf(r, t.rid) || {}).owner === ME);
    return `<tr class="${mineRow?'me':''}"><td class="num">1.${String(i+1).padStart(2,'0')}</td><td class="teamname">${esc(t.name)}</td><td class="r num">${p.avg_slot.toFixed(1)}</td><td class="r num">${range(p.slot)}</td>${L.isDD ? `<td class="r num">${p.lottery ? Math.round(p.lottery)+'%' : '–'}</td>` : ''}${cells}<td>${o(1)}</td><td class="r num">${p1 ? fmt(p1.value) : '–'}</td>${LR.map(r => `<td>${o(r)}</td>`).join('')}</tr>`;}).join('')}</tbody>`;
  // your picks summary
  const mine = D.picks.filter(k => k.season===DS && k.owner===ME).sort((a,b) => a.round - b.round || TM[a.orig].proj.avg_slot - TM[b.orig].proj.avg_slot);
  const top = (sl, n) => sl.slice(0,n).reduce((s,x) => s+x, 0);
  document.getElementById('draftMine').innerHTML = ME && mine.length ? `<h3 style="margin-bottom:6px">${esc(TM[ME].name)}'s ${DS} picks</h3><div class="tblwrap"><table><thead><tr><th>Pick</th><th>Via</th><th class="r">Proj. slot</th><th class="r">Likely</th><th class="r">Top-3 odds</th><th class="r">#1 odds</th><th class="r">Value</th></tr></thead><tbody>${mine.map(k => { const p = TM[k.orig].proj; return `<tr><td class="teamname">${k.season} ${ord(k.round)}</td><td>${k.orig===ME?'Own':esc(TM[k.orig].name)}</td><td class="r num">${k.round}.${String(Math.round(p.avg_slot)).padStart(2,'0')}</td><td class="r num">${range(p.slot)}</td><td class="r num">${top(p.slot,3).toFixed(0)}%</td><td class="r num">${p.slot[0].toFixed(0)}%</td><td class="r num">${fmt(k.value)}</td></tr>`; }).join('')}</tbody></table></div>` : '';
}
renderProj();

// ---------- players ----------
const posSeg = document.getElementById('pPos'); let pPos = 'ALL', pSort = 'value';
posSeg.innerHTML = ['ALL','QB','RB','WR','TE'].map(p => `<button aria-pressed="${p==='ALL'}" data-p="${p}">${p==='ALL'?'All':p}</button>`).join('');
posSeg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { pPos = b.dataset.p; posSeg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x===b)); renderPlayers(); }));
document.getElementById('pOwner').innerHTML = `<option value="all">All players</option><option value="fa">Free agents</option>` + TEAMS.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(t => `<option value="${t.rid}">${esc(t.name)}</option>`).join('');
document.getElementById('pOwner').addEventListener('change', renderPlayers);
document.getElementById('pSearch').addEventListener('input', renderPlayers);
const allP = Object.values(P).sort((a,b) => b.value - a.value);
const rankOf = Object.fromEntries(allP.map((p,i) => [p.id, i+1]));
const posRank = {}; { const c = {}; for (const p of allP){ c[p.pos] = (c[p.pos]||0)+1; posRank[p.id] = p.pos + c[p.pos]; } }
function renderPlayers(){
  const q = document.getElementById('pSearch').value.trim().toLowerCase(), own = document.getElementById('pOwner').value;
  let list = allP.filter(p => (pPos==='ALL' || p.pos===pPos) && (!q || p.name.toLowerCase().includes(q)));
  if (own === 'fa') list = list.filter(p => D.rostered[p.id] == null); else if (own !== 'all') list = list.filter(p => D.rostered[p.id] == +own);
  const sorters = {value:(a,b)=>b.value-a.value, age:(a,b)=>(a.age??99)-(b.age??99), flock:(a,b)=>(b.src.flock||0)-(a.src.flock||0), ktc:(a,b)=>(b.src.ktc||0)-(a.src.ktc||0), dd:(a,b)=>(b.src.dd||0)-(a.src.dd||0)};
  list.sort(sorters[pSort]);
  const th = (k,l,c='r') => `<th class="sort ${c}" data-s="${k}" aria-sort="${pSort===k?'descending':'none'}">${l}${pSort===k?' ▾':''}</th>`;
  document.getElementById('playersTbl').innerHTML = `<thead><tr><th>#</th><th>Player</th><th>Pos</th><th>NFL</th>${th('age','Age')}${th('value','Value')}${th('flock','Flock')}${th('ktc','KTC')}${th('dd','Dyn. Daddy')}<th>League owner</th></tr></thead><tbody>${list.slice(0,400).map(p => {
    const o = D.rostered[p.id];
    return `<tr class="${ME && o===ME?'me':''}"><td class="num muted">${rankOf[p.id]}</td><td class="teamname">${esc(p.name)}${p.inj?` <span class="pill out">${esc(p.inj)}</span>`:''}</td><td><span class="pos ${p.pos}">${posRank[p.id]}</span></td><td>${p.team}</td><td class="r num">${p.age ?? '–'}</td><td class="r num"><b>${fmt(p.value)}</b></td><td class="r num">${p.src.flock?fmt(p.src.flock):'–'}</td><td class="r num">${p.src.ktc?fmt(p.src.ktc):'–'}</td><td class="r num">${p.src.dd?fmt(p.src.dd):'–'}</td><td>${o?esc(TM[o].name):'<span class="muted">Free agent</span>'}</td></tr>`;}).join('')}</tbody>`;
  document.querySelectorAll('#playersTbl th[data-s]').forEach(t => t.addEventListener('click', () => { pSort = t.dataset.s; renderPlayers(); }));
}
renderPlayers();

// ---------- picks ----------
const pkSeg = document.getElementById('pkSeason'); let pkS = DS;
pkSeg.innerHTML = L.seasons.map(s => `<button aria-pressed="${s===pkS}" data-s="${s}">${s}</button>`).join('');
pkSeg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { pkS = b.dataset.s; pkSeg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x===b)); renderPicks(); }));
document.getElementById('pkOwner').innerHTML = `<option value="all">All owners</option>` + TEAMS.slice().sort((a,b)=>a.name.localeCompare(b.name)).map(t => `<option value="${t.rid}">${esc(t.name)}</option>`).join('');
document.getElementById('pkOwner').addEventListener('change', renderPicks);
function renderPicks(){
  const own = document.getElementById('pkOwner').value;
  const list = D.picks.filter(p => p.season === pkS && (own==='all' || p.owner == +own)).sort((a,b) => a.round - b.round || (a.avg_slot??0) - (b.avg_slot??0) || b.value - a.value);
  document.getElementById('picksTbl').innerHTML = `<thead><tr><th>Pick</th><th>Original team</th><th>Owner</th><th class="r">Proj. slot</th><th class="r">Value</th></tr></thead><tbody>${list.map(p => `<tr class="${p.owner===ME?'me':''}"><td class="teamname">${esc(p.label)}</td><td>${esc(TM[p.orig].name)}</td><td>${esc(TM[p.owner].name)}${p.owner!==p.orig?' <span class="pill">Traded</span>':''}</td><td class="r num">${p.avg_slot!=null?p.round+'.'+String(Math.round(p.avg_slot)).padStart(2,'0'):'–'}</td><td class="r num">${fmt(p.value)}</td></tr>`).join('')}</tbody>`;
}
renderPicks();

// ---------- trade history ----------
const TR = D.trades || [], BOARD = D.trade_board || [];
const graded = TR.filter(t => !['reversed','one-sided','wash'].includes(t.verdict));
document.getElementById('histLede').textContent = `${TR.length} trades since the ${TR.length ? TR[TR.length-1].season : ''} startup, graded by what each side's assets are worth today. Used draft picks are valued as the player taken with them. ${TR.length - graded.length} trades that were reversed, one-sided transfers or FAAB-only aren't counted in manager records.`;
const sign = n => (n > 0 ? '+' : '') + fmt(n);
document.getElementById('boardTbl').innerHTML = `<thead><tr><th>#</th><th>Manager</th><th class="r">Trades</th><th class="r">Won</th><th class="r">Lost</th><th class="r">Even</th><th class="r">Net value gained</th><th>Best trade</th></tr></thead><tbody>${BOARD.map((b,i) => {
  const best = TR.find(t => t.id === (b.best||[])[0]);
  const bs = best && best.sides.find(s => s.owner_id === b.owner_id);
  const bestTxt = bs ? `${bs.got.slice().sort((x,y)=>y.value-x.value).slice(0,2).map(a => esc(a.became || a.name)).join(', ')} <span class="muted">(${best.season})</span>` : '–';
  return `<tr class="${MEO && b.owner_id===MEO?'me':''}"><td class="num">${i+1}</td><td class="teamname">${esc(b.name)}<div class="muted" style="font-size:.78rem">${esc(b.manager)}${b.active?'':' · former manager'}</div></td><td class="r num">${b.trades}</td><td class="r num">${b.wins}</td><td class="r num">${b.losses}</td><td class="r num">${b.even}</td><td class="r num"><b class="net ${b.net>0?'up':b.net<0?'down':''}">${sign(b.net)}</b></td><td style="white-space:normal;min-width:180px">${bestTxt}</td></tr>`;}).join('')}</tbody>`;
const seasons = [...new Set(TR.map(t => t.season))].sort().reverse();
let hS = 'all', hSortBy = 'recent', hLimit = 30;
const hSeg = document.getElementById('hSeason');
hSeg.innerHTML = ['all', ...seasons].map(s => `<button aria-pressed="${s===hS}" data-s="${s}">${s==='all'?'All seasons':s}</button>`).join('');
hSeg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { hS = b.dataset.s; hLimit = 30; hSeg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x===b)); renderHistory(); }));
const hSortSeg = document.getElementById('hSort');
hSortSeg.innerHTML = [['recent','Most recent'],['lopsided','Most lopsided']].map(([k,l]) => `<button aria-pressed="${k===hSortBy}" data-k="${k}">${l}</button>`).join('');
hSortSeg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { hSortBy = b.dataset.k; hLimit = 30; hSortSeg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x===b)); renderHistory(); }));
document.getElementById('hTeam').innerHTML = `<option value="all">All managers</option>${MEO && ME ? `<option value="${MEO}">${esc(TM[ME].name)} (selected)</option>` : ''}` + BOARD.map(b => `<option value="${b.owner_id}">${esc(b.name)}</option>`).join('');
document.getElementById('hTeam').addEventListener('change', () => { hLimit = 30; renderHistory(); });
function verdictText(t){
  const w = t.sides[0];
  if (t.verdict === 'reversed') return ['muted', 'Reversed (undone, not graded)'];
  if (t.verdict === 'one-sided') return ['muted', 'One-sided transfer (not graded)'];
  if (t.verdict === 'wash') return ['muted', 'FAAB only (not graded)'];
  if (t.verdict === 'even') return ['even', 'Even trade'];
  if (t.verdict === 'edge') return ['edge', `Edge: ${w.team} (+${fmt(t.gap)})`];
  return ['win', `${w.team} won by ${fmt(t.gap)}`];
}
function renderHistory(){
  const own = document.getElementById('hTeam').value;
  let list = TR.filter(t => (hS==='all' || t.season===hS) && (own==='all' || t.sides.some(s => s.owner_id === own)));
  if (hSortBy === 'lopsided') list = list.filter(t => !['reversed','one-sided','wash'].includes(t.verdict)).sort((a,b) => b.gap - a.gap);
  const shown = list.slice(0, hLimit);
  document.getElementById('tradeList').innerHTML = (shown.map(t => {
    const [cls, txt] = verdictText(t);
    const mine = !!MEO && t.sides.some(s => s.owner_id === MEO);
    const sides = t.sides.map(s => {
      const won = t.winner === s.rid;
      const rows = s.got.slice().sort((a,b) => b.value - a.value).map(a => `<div class="trow"><span class="pos ${a.pos}">${a.pos==='PK'?'PK':a.pos}</span><span class="nm">${esc(a.name)}${a.note?`<small>${esc(a.note)}</small>`:''}</span><span class="num">${fmt(a.value)}</span></div>`).join('') || '<div class="muted" style="font-size:.88rem">Nothing</div>';
      const graded = !['reversed','one-sided','wash'].includes(t.verdict);
      return `<div class="tside ${won?'won':''}"><h4><span>${esc(s.team)}${MEO && s.owner_id===MEO?' ★':''}</span>${graded?`<span class="net ${s.net>0?'up':s.net<0?'down':''}">${sign(s.net)}</span>`:''}</h4><div class="got">Received · ${fmt(s.got_adj)}</div>${rows}</div>`;
    }).join('');
    return `<article class="tcard ${mine?'mine':''}"><div class="thead"><span class="tverdict ${cls}">${esc(txt)}</span><span class="when">${t.date} · ${t.season}${t.week>1?' · Week '+t.week:''}${t.verdict!=='reversed'&&t.margin?` · ${Math.abs(t.margin).toFixed(0)}% gap`:''}</span></div><div class="tsides">${sides}</div></article>`;
  }).join('') || '<div class="empty">No trades match these filters.</div>') + (list.length > hLimit ? `<button class="btn more" id="moreTrades">Show ${Math.min(30, list.length - hLimit)} more of ${list.length - hLimit}</button>` : '');
  document.getElementById('moreTrades')?.addEventListener('click', () => { hLimit += 30; renderHistory(); });
}
renderHistory();

// ---------- shared draft engine (mock + simulator) ----------
const DRAFT = (function(){
  const PR = D.prospects || [];
  const PBM = Object.fromEntries((D.prospect_board || []).map(r => [r.name, r]));
  const pool = PR.map(x => Object.assign({}, x, {wy: PBM[x.name] || null}));
  const pickOf = (rnd, orig) => D.picks.find(k => k.season === DS && k.round === rnd && k.orig === orig);
  const hiR = rk => rk >= NT * 0.75, hiR2 = rk => rk >= NT * 0.83, loR = rk => rk <= NT * 0.25, loR2 = rk => rk <= Math.max(1, NT * 0.17);
  const posRank = {};
  TEAMS.forEach(t => { posRank[t.rid] = {}; ['QB','RB','WR','TE'].forEach(p => posRank[t.rid][p] = 1 + TEAMS.filter(x => x.pos_value[p] > t.pos_value[p]).length); });
  const topAt = (rid, pos) => TM[rid].players.map(i => P[i]).filter(p => p && p.pos === pos).sort((a,b) => b.value - a.value);
  // roster-need multiplier on a prospect's consensus score (lower score = better)
  function needMult(rid, pos, taken){
    if (!rid) return 1;
    const rk = posRank[rid][pos], t = TM[rid];
    let m = 1;
    if (pos === 'QB') m *= L.sf ? (hiR(rk) ? 0.80 : loR(rk) ? 1.20 : 1) : (hiR(rk) ? 0.92 : 1.1);
    else if (pos === 'TE') m *= (L.tep ? 0.95 : 1.02) * (hiR2(rk) ? 0.90 : loR2(rk) ? 1.15 : 1);
    else m *= hiR2(rk) ? 0.92 : loR2(rk) ? 1.12 : 1;
    if (t.proj.playoff >= 60 && pos === 'RB') m *= 0.95;
    if (t.proj.playoff < 20 && (pos === 'QB' || pos === 'WR')) m *= 0.97;
    m *= Math.pow(1.12, (taken && taken[pos]) || 0);
    return m;
  }
  const projOrder = () => TEAMS.slice().sort((a,b) => a.proj.avg_slot - b.proj.avg_slot).map(t => t.rid);
  // one plausible draft order: draw each team's slot from its simulated slot odds, then order by the draws
  function randomOrder(){
    const draws = TEAMS.map(t => { let u = Math.random() * 100, s = NT; for (let i = 0; i < NT; i++){ u -= t.proj.slot[i]; if (u <= 0){ s = i + 1; break; } } return {rid: t.rid, s: s + Math.random() * 0.9}; });
    return draws.sort((a,b) => a.s - b.s).map(d => d.rid);
  }
  function buildSlots(order, rounds, mm){
    const out = [];
    for (let r = 1; r <= rounds; r++){
      (L.snake && r % 2 === 0 ? order.slice().reverse() : order).forEach((rid, i) => { const k = pickOf(r, rid); out.push({r, slot: i + 1, no: `${r}.${String(i+1).padStart(2,'0')}`, orig: rid, owner: k ? k.owner : rid}); });
      if (r === 2 && mm) out.push({r, slot: 13, no: '2.13', orig: null, owner: null, mm: true});
    }
    out.forEach((s, i) => s.overall = i + 1);
    return out;
  }
  // big-board position for suggestions (falls back to consensus rank when The Wylie has no profile)
  const bigRank = x => x.wy ? x.wy.big_rank : x.rank + 10;
  function suggest(rid, avail, taken, lean){
    return avail.map(x => {
      let s = bigRank(x) * needMult(rid, x.pos, taken);
      if (lean && x.pos === lean) s *= 0.85;
      return {x, s};
    }).sort((a,b) => a.s - b.s);
  }
  function needText(rid, x){
    if (!rid) return '';
    const rk = posRank[rid][x.pos], t = TM[rid];
    if (hiR(rk)){ const top = topAt(rid, x.pos)[0]; return `${t.name}'s ${x.pos} room ranks ${ord(rk)} of ${NT}${top ? ` (top ${x.pos}: ${top.name})` : ''}.`; }
    if (loR2(rk)) return `Already ${ord(rk)} in ${x.pos} value, so this is talent over need.`;
    if (x.pos === 'QB' && L.sf) return 'In superflex, a third starting-caliber QB is never wasted.';
    if (x.pos === 'TE' && L.tep) return `The +${L.tep} TE premium boosts tight ends in this league.`;
    return '';
  }
  // CPU pick: sample from the best few by need-adjusted consensus score; chaos widens the spread
  function cpuPick(slot, avail, taken, opts){
    const adj = avail.slice(0, 18).map(x => ({x, a: x.score * (opts.needs ? needMult(slot.owner, x.pos, taken) : 1)}));
    const best = Math.min(...adj.map(z => z.a));
    const tau = 0.5 + (opts.chaos / 100) * 7 + (slot.r - 1) * 0.6;
    const w = adj.map(z => Math.exp(-(z.a - best) / tau)), tot = w.reduce((a,b) => a + b, 0);
    let u = Math.random() * tot;
    for (let i = 0; i < adj.length; i++){ u -= w[i]; if (u <= 0) return adj[i].x; }
    return adj[0].x;
  }
  return {pool, pickOf, posRank, topAt, needMult, projOrder, randomOrder, buildSlots, bigRank, suggest, needText, cpuPick};
})();

const MAXR = Math.max(1, Math.min(L.rounds, Math.floor((D.prospects || []).length / (NT + (L.mm ? 1 : 0)))));
// ---------- 2027 mock draft (projected) ----------
(function(){
  const PR = DRAFT.pool; if (!PR.length) return;
  const SRC = D.prospect_sources || [];
  const slots = DRAFT.buildSlots(DRAFT.projOrder(), MAXR, L.mm);
  const REACH = r => r <= 2 ? 4 : 6;
  let roundSel = '1', useNeeds = true, stratSel = 'needs';
  try { stratSel = localStorage.getItem('ddw-strat2') || 'needs'; } catch(e){}
  const leanOf = s => s.startsWith('lean-') ? s.slice(5) : null;
  function fitLine(s, x, idx){
    if (!s.owner) return 'The March Madness pool winner picks here. We took the best player left on the board.';
    const parts = [];
    if (idx === 0) parts.push('Best player left on the consensus board.');
    const nt = DRAFT.needText(s.owner, x); if (nt) parts.push(nt);
    const t = TM[s.owner];
    if (t.proj.playoff >= 60 && x.pos === 'RB') parts.push('A contender adding a back who can help right away.');
    return parts.join(' ') || 'Good value at this spot for the roster.';
  }
  function run(){
    const avail = PR.slice().sort((a,b) => a.score - b.score), out = [], took = {};
    for (const s of slots){
      const taken = took[s.owner] || (took[s.owner] = {});
      const best = avail[0].score, pool = avail.filter(x => x.score <= best + 8 + s.r * 2);
      let pick = pool[0], idx = 0, leanNote = null;
      const mine = ME && s.owner === ME, lean = mine ? leanOf(stratSel) : null;
      if (lean){
        const c = avail.find(x => x.pos === lean && x.rank - avail[0].rank <= REACH(s.r));
        if (c){ pick = c; idx = avail.indexOf(c); const g = c.rank - avail[0].rank; leanNote = g === 0 ? `${lean}-first: the best player left is also a ${lean}.` : `${lean}-first: best ${lean} left, ${g} spot${g>1?'s':''} below the top player (limit ${REACH(s.r)}).`; }
        else leanNote = `${lean}-first: no ${lean} within ${REACH(s.r)} spots of the best player, so no reach.`;
      }
      if (!leanNote || !leanNote.includes('best ')){
        if (mine && stratSel === 'bpa'){ pick = pool[0]; idx = 0; }
        else if ((useNeeds || mine) && !(leanNote && leanNote.includes('best '))){
          let bestAdj = Infinity;
          pool.forEach((x, i) => { const a = x.score * DRAFT.needMult(s.owner, x.pos, taken); if (a < bestAdj){ bestAdj = a; pick = x; idx = i; } });
        }
      }
      avail.splice(avail.indexOf(pick), 1);
      taken[pick.pos] = (taken[pick.pos] || 0) + 1;
      let fit = fitLine(s, pick, idx); if (leanNote) fit = leanNote + ' ' + fit.replace('Best player left on the consensus board. ', '');
      out.push(Object.assign({}, s, {x: pick, fit, diff: s.overall - pick.rank}));
    }
    return out;
  }
  let MOCK = run();
  const firstTwo = SRC.filter(s => s.weight > 0).length;
  document.getElementById('mockLede').textContent = `A ${MAXR}-round mock of the ${DS} rookie draft using the projected draft order and the actual owner of every pick${L.mm ? ", including the bylaws' 2.13 March Madness pick" : ''}. Prospects come from a consensus of ${firstTwo} ranked boards plus notes from ${SRC.length - firstTwo} more (sources below, gathered ${D.prospects_updated}). Each team takes the best player available, adjusted for roster needs and superflex/TE-premium scoring. Pick a team below to see The Wylie's suggestions for its picks, or run your own draft in the Draft Simulator.`;
  // team + strategy controls
  const teamSel = document.getElementById('mockTeam');
  teamSel.innerHTML = `<option value="none">Choose a team…</option>` + TEAMS.slice().sort((a,b) => a.name.localeCompare(b.name)).map(t => `<option value="${t.rid}" ${t.rid===ME?'selected':''}>${esc(t.name)}</option>`).join('');
  teamSel.addEventListener('change', e => setViewingAs(e.target.value));
  const st = document.getElementById('mockStrat'); st.value = stratSel; st.disabled = !ME;
  st.addEventListener('change', e => { stratSel = e.target.value; try { localStorage.setItem('ddw-strat2', stratSel); } catch(err){} MOCK = run(); renderAll(); });
  const rs = document.getElementById('mockRound');
  rs.innerHTML = [...ROUNDS.slice(0, MAXR).map(String),'all'].map(r => `<button aria-pressed="${r===roundSel}" data-r="${r}">${r==='all'?'All rounds':'Round '+r}</button>`).join('');
  rs.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { roundSel = b.dataset.r; rs.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x===b)); renderMock(); }));
  document.getElementById('mockNeeds').addEventListener('change', e => { useNeeds = e.target.checked; MOCK = run(); renderAll(); });
  const srcName = Object.fromEntries(SRC.map(s => [s.key, s.outlet.replace(' (via Yardbarker)','').replace(' (via Yahoo)','')]));
  const srcRanks = x => Object.entries(x.ranks).map(([k,v]) => `${srcName[k]}${k==='ds1'?' 1QB':''} ${['br','wf','tsn'].includes(k)?'#'+v+' overall':'#'+v}`).join(' · ');
  const pct = v => v == null ? '–' : Math.round(v*100) + '%';
  function card(m){
    const x = m.x, mine = ME && m.owner === ME;
    const via = m.orig && m.orig !== m.owner ? ` via ${esc(TM[m.orig].name)}` : '';
    const tag = m.diff >= 4 ? `<span class="tagv val">Value: consensus #${x.rank}</span>` : m.diff <= -4 ? `<span class="tagv reach">Reach: consensus #${x.rank}</span>` : `<span class="tagv">Consensus #${x.rank}</span>`;
    const blurb = `<p class="mpblurb">${esc(x.blurb)}</p>`;
    return `<article class="mpick ${mine?'mine':''}"><div class="mphead"><span class="mpno num">${m.no}</span><span class="mpteam">${m.owner ? esc(TM[m.owner].name) + (mine?' ★':'') + via : 'March Madness winner'}</span></div>
      <div class="mpname">${esc(x.name)}</div>
      <div class="mpmeta"><span class="pos ${x.pos}">${x.pos}</span>${esc(x.school)} ${tag}${x.wy ? ` <span class="tagv">Wylie hit ${pct(x.wy.p_hit)}</span>` : ''}</div>
      <p class="mpfit">${esc(m.fit)}</p>
      ${m.r <= 2 ? blurb : `<details><summary>Scouting notes</summary>${blurb}</details>`}
      <div class="srcrk">${esc(srcRanks(x))}</div></article>`;
  }
  function renderMock(){
    const list = roundSel === 'all' ? MOCK : MOCK.filter(m => String(m.r) === roundSel);
    document.getElementById('mockPicks').innerHTML = list.map(card).join('');
  }
  function renderPlan(){
    const el = document.getElementById('mockPlan');
    if (!ME){ el.innerHTML = `<h3>The Wylie's suggestions</h3><p class="muted" style="margin:6px 0 0">Choose your team above to see The Wylie's top options at each of your picks, which of them the mock expects to be gone by your next pick, and your projected haul.</p>`; return; }
    const mine = MOCK.filter(m => m.owner === ME), lean = leanOf(stratSel), taken = {};
    const rows = mine.map((m, i) => {
      const before = new Set(MOCK.filter(z => z.overall < m.overall).map(z => z.x.name));
      const avail = DRAFT.pool.filter(x => !before.has(x.name)).sort((a,b) => a.score - b.score);
      const sug = DRAFT.suggest(ME, avail, taken, lean).slice(0, 3);
      const next = mine[i+1];
      taken[m.x.pos] = (taken[m.x.pos] || 0) + 1;
      return `<div class="sgrow"><div class="sghead"><span class="mpno num">${m.no}</span><span class="muted" style="font-size:.84rem">${m.orig!==ME?'via '+esc(TM[m.orig].name)+' · ':''}mock takes <b>${esc(m.x.name)}</b></span></div>
        <div class="sglist">${sug.map((z, j) => { const gone = next && MOCK.find(q => q.x.name === z.x.name && q.overall > m.overall && q.overall < next.overall && q.owner !== ME);
          return `<div class="sgitem"><span class="num muted">${j+1}</span><span class="pos ${z.x.pos}">${z.x.pos}</span><span class="nm"><b>${esc(z.x.name)}</b> <span class="muted" style="font-size:.8rem">${esc(z.x.school)} · board #${DRAFT.bigRank(z.x)} · consensus #${z.x.rank}${z.x.wy?` · hit ${pct(z.x.wy.p_hit)}`:''}</span>${gone?`<span class="tagv reach" style="margin-left:6px">gone by ${next.no} in mock</span>`:''}<div class="muted" style="font-size:.8rem">${esc(DRAFT.needText(ME, z.x))}</div></span></div>`; }).join('')}</div></div>`;
    }).join('');
    el.innerHTML = `<h3>The Wylie's suggestions for ${esc(TM[ME].name)}</h3><p class="muted" style="margin:4px 0 10px">For each pick, the top three prospects still on the board in this mock, ranked by the big board (50% consensus + 50% The Wylie) adjusted for ${esc(TM[ME].name)}'s roster needs${lean ? ` and a ${lean} lean` : ''}.</p>${rows || '<p class="muted">This team has no 2027 picks.</p>'}`;
  }
  function renderMine(){
    const el = document.getElementById('mockMine');
    if (!ME){ const cnt = {}; MOCK.forEach(m => { if (m.owner) cnt[m.owner] = (cnt[m.owner]||0) + 1; });
      el.innerHTML = `<h3>Picks per team</h3><div class="roster">${Object.entries(cnt).sort((a,b) => b[1]-a[1]).map(([rid,n]) => `<div class="row"><span class="nm">${esc(TM[rid].name)}</span><span class="num">${n}</span></div>`).join('')}</div>`; return; }
    const mine = MOCK.filter(m => m.owner === ME), pos = {}; mine.forEach(m => pos[m.x.pos] = (pos[m.x.pos]||0)+1);
    el.innerHTML = `<h3>${esc(TM[ME].name)} mock haul: ${mine.length} picks</h3><p class="muted" style="margin:4px 0 10px">${Object.entries(pos).map(([p,n]) => `${n} ${p}`).join(' · ') || 'No picks'}</p><div class="roster">${mine.map(m => `<div class="row"><span class="num" style="min-width:3em">${m.no}</span><span class="pos ${m.x.pos}">${m.x.pos}</span><span class="nm">${esc(m.x.name)} <span class="muted" style="font-size:.8rem">${esc(m.x.school)}${m.orig!==ME?' · via '+esc(TM[m.orig].name):''}</span></span><span class="muted num">#${m.x.rank}</span></div>`).join('')}</div>`;
  }
  function renderBoard(){
    const at = Object.fromEntries(MOCK.map(m => [m.x.name, m]));
    document.getElementById('prospectTbl').innerHTML = `<thead><tr><th>#</th><th>Prospect</th><th class="c-sm">Pos</th><th>School</th><th class="r">Lists</th><th class="r">Range</th><th>Mock pick</th><th>Source ranks</th></tr></thead><tbody>${PR.map(x => { const m = at[x.name]; return `<tr class="${m && ME && m.owner===ME?'me':''}"><td class="num">${x.rank}</td><td class="teamname">${esc(x.name)}</td><td><span class="pos ${x.pos}">${x.pos}</span></td><td>${esc(x.school)}</td><td class="r num">${x.n}</td><td class="r num">${x.best ?? '–'}${x.worst && x.worst!==x.best ? '–'+x.worst : ''}</td><td>${m ? `<span class="num">${m.no}</span> ${m.owner ? esc(TM[m.owner].name) : 'MM winner'}` : '<span class="muted">Undrafted</span>'}</td><td style="white-space:normal;min-width:260px" class="srcrk">${esc(srcRanks(x))}</td></tr>`; }).join('')}</tbody>`;
  }
  function renderAll(){ renderMock(); renderPlan(); renderMine(); renderBoard(); }
  document.getElementById('mockSources').innerHTML = `<h3>Sources</h3>${SRC.map(s => `<p><a href="${s.url}" target="_blank" rel="noopener">${esc(s.outlet)}: ${esc(s.title)}</a> <span class="muted">· ${s.date} · ${esc(s.format)}${s.weight ? ' · weight ' + s.weight : ' · notes only'}</span></p>`).join('')}<p class="muted">Underclassmen may return to school, and that's the biggest risk in any mock this early.${L.mm ? " The 2.13 pick is the bylaws' March Madness pool prize." : ''}</p>`;
  renderAll();
})();

// ---------- draft simulator ----------
(function(){
  const POOL = DRAFT.pool; if (!POOL.length) return;
  const $ = id => document.getElementById(id);
  const pct = v => v == null ? '–' : Math.round(v*100) + '%';
  const cfg = {rounds: Math.min(4, MAXR), orderMode: 'proj', order: DRAFT.projOrder(), mm: L.mm, chaos: 35, needs: true, control: new Set(), controlTeam: ME || null};
  let SIM = null;   // {slots, picks: [], avail, took, i, hist}
  let simTimer = null;
  function slotsNow(){ return DRAFT.buildSlots(cfg.order, cfg.rounds, cfg.mm); }
  function resetControl(){ cfg.control = new Set(slotsNow().filter(s => cfg.controlTeam && s.owner === cfg.controlTeam).map(s => s.no)); }
  resetControl();
  function teamName(s){ return s.owner ? TM[s.owner].name : 'March Madness winner'; }
  // ---- setup UI ----
  function renderSetup(){
    const slots = slotsNow();
    const rounds = [...new Set(slots.map(s => s.r))];
    $('simSetup').innerHTML = `
      <div class="simrow"><span class="simlbl">Rounds</span><div class="seg" id="simRounds">${ROUNDS.slice(0, MAXR).map(r => `<button aria-pressed="${cfg.rounds===r}" data-r="${r}">${r}</button>`).join('')}</div>
        <span class="simlbl">Draft order</span><div class="seg" id="simOrder"><button aria-pressed="${cfg.orderMode==='proj'}" data-m="proj">Projected</button><button aria-pressed="${cfg.orderMode==='rand'}" data-m="rand">Random from odds</button></div>${cfg.orderMode==='rand' ? '<button class="btn" id="simReroll">Reroll order</button>' : ''}
        ${L.mm ? `<label class="muted simchk"><input type="checkbox" id="simMM" ${cfg.mm?'checked':''}> Include 2.13 (March Madness pick)</label>` : ''}</div>
      <div class="simrow"><span class="simlbl">You control</span><select id="simTeam" aria-label="Control all picks owned by"><option value="none">No team (pick slots below)</option>${TEAMS.slice().sort((a,b) => a.name.localeCompare(b.name)).map(t => `<option value="${t.rid}" ${t.rid===cfg.controlTeam?'selected':''}>All picks owned by ${esc(t.name)}</option>`).join('')}</select>
        <button class="btn" id="simAll">Control every pick</button><button class="btn" id="simNone">Clear</button><span class="muted" style="font-size:.85rem">${cfg.control.size} pick${cfg.control.size===1?'':'s'} selected · click any pick to toggle it</span></div>
      <div class="simgrid">${rounds.map(r => `<div class="simgr"><span class="simlbl">Rd ${r}</span>${slots.filter(s => s.r === r).map(s => `<button class="simslot ${cfg.control.has(s.no)?'on':''}" data-no="${s.no}" aria-pressed="${cfg.control.has(s.no)}" title="${esc(teamName(s))}${s.orig && s.orig!==s.owner ? ' (via '+esc(TM[s.orig].name)+')' : ''}"><span class="num">${s.no}</span><span>${esc(teamName(s))}</span></button>`).join('')}</div>`).join('')}</div>
      <div class="simrow"><span class="simlbl">Other teams</span><label class="muted simchk" for="simChaos">Chalk</label><input type="range" id="simChaos" min="0" max="100" value="${cfg.chaos}" aria-label="How unpredictable other teams draft"><label class="muted simchk" for="simChaos">Chaos</label>
        <label class="muted simchk"><input type="checkbox" id="simNeeds" ${cfg.needs?'checked':''}> Draft for roster needs</label>
        <button class="btn primary" id="simStart">${SIM ? 'Restart draft' : 'Start draft'}</button></div>`;
    $('simRounds').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { cfg.rounds = +b.dataset.r; resetControlKeep(); renderSetup(); }));
    $('simOrder').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { cfg.orderMode = b.dataset.m; cfg.order = cfg.orderMode === 'proj' ? DRAFT.projOrder() : DRAFT.randomOrder(); resetControlKeep(); renderSetup(); }));
    $('simReroll')?.addEventListener('click', () => { cfg.order = DRAFT.randomOrder(); resetControlKeep(); renderSetup(); });
    $('simMM')?.addEventListener('change', e => { cfg.mm = e.target.checked; resetControlKeep(); renderSetup(); });
    $('simTeam').addEventListener('change', e => { cfg.controlTeam = e.target.value === 'none' ? null : +e.target.value; resetControl(); renderSetup(); });
    $('simAll').addEventListener('click', () => { cfg.control = new Set(slotsNow().map(s => s.no)); renderSetup(); });
    $('simNone').addEventListener('click', () => { cfg.control = new Set(); cfg.controlTeam = null; renderSetup(); });
    document.querySelectorAll('#simSetup .simslot').forEach(b => b.addEventListener('click', () => { const n = b.dataset.no; cfg.control.has(n) ? cfg.control.delete(n) : cfg.control.add(n); renderSetup(); }));
    $('simChaos').addEventListener('input', e => { cfg.chaos = +e.target.value; });
    $('simNeeds').addEventListener('change', e => { cfg.needs = e.target.checked; });
    $('simStart').addEventListener('click', start);
  }
  // keep manual selections that still exist after the slot list changes; re-add the control team's picks
  function resetControlKeep(){
    const nos = new Set(slotsNow().map(s => s.no));
    const keep = [...cfg.control].filter(n => nos.has(n));
    resetControl(); keep.forEach(n => cfg.control.add(n));
  }
  // ---- draft engine ----
  function start(){
    clearTimeout(simTimer);
    const slots = slotsNow();
    SIM = {slots, picks: [], avail: POOL.slice().sort((a,b) => a.score - b.score), took: {}, i: 0, hist: [], auto: false, control: new Set(cfg.control)};
    renderSetup(); advance();
    try { $('simLive').scrollIntoView({behavior:'smooth', block:'start'}); } catch(e){}
  }
  const isMine = s => SIM.control.has(s.no);
  function take(x){
    const s = SIM.slots[SIM.i], taken = SIM.took[s.owner] || (SIM.took[s.owner] = {});
    SIM.avail.splice(SIM.avail.indexOf(x), 1);
    taken[x.pos] = (taken[x.pos] || 0) + 1;
    SIM.picks.push({s, x, mine: isMine(s)});
    SIM.i++;
  }
  function snapshot(){ return {picks: SIM.picks.slice(), avail: SIM.avail.slice(), took: JSON.parse(JSON.stringify(SIM.took)), i: SIM.i}; }
  function advance(){
    clearTimeout(simTimer);
    while (SIM.i < SIM.slots.length && !isMine(SIM.slots[SIM.i])){
      const s = SIM.slots[SIM.i];
      take(DRAFT.cpuPick(s, SIM.avail, SIM.took[s.owner] || {}, cfg));
      if (!SIM.fast){ render(); simTimer = setTimeout(advance, 180); return; }
    }
    SIM.fast = false;
    render();
  }
  function simToMine(){ SIM.fast = true; advance(); }
  function draft(x){
    SIM.hist.push(snapshot());
    take(x); SIM.fast = false; advance();
  }
  function undo(){
    clearTimeout(simTimer);
    const h = SIM.hist.pop(); if (!h) return;
    Object.assign(SIM, h); render();
  }
  // odds a prospect is still there at the next pick you control, if you pass on him now (Monte Carlo)
  function availability(cands){
    const now = SIM.i, next = SIM.slots.findIndex((s, k) => k > now && isMine(s));
    if (next < 0) return null;
    const N = 160, alive = Object.fromEntries(cands.map(c => [c.x.name, 0]));
    const owner = SIM.slots[now].owner;
    for (const skipTop of [0, 1]){
      for (let k = 0; k < N; k++){
        let avail = SIM.avail.slice(); const took = JSON.parse(JSON.stringify(SIM.took));
        const mineNow = cands[skipTop === 0 ? 0 : Math.min(1, cands.length - 1)].x;    // you take #1 (or #2 when testing #1)
        avail.splice(avail.indexOf(mineNow), 1);
        for (let j = now + 1; j < next; j++){
          const s = SIM.slots[j], t = took[s.owner] || (took[s.owner] = {});
          const x = isMine(s) ? DRAFT.suggest(s.owner, avail, t)[0].x : DRAFT.cpuPick(s, avail, t, cfg);
          avail.splice(avail.indexOf(x), 1); t[x.pos] = (t[x.pos] || 0) + 1;
        }
        const left = new Set(avail.map(x => x.name));
        cands.forEach((c, ci) => { if ((skipTop === 0 && ci > 0) || (skipTop === 1 && ci === 0)) { if (left.has(c.x.name)) alive[c.x.name]++; } });
      }
    }
    return {next: SIM.slots[next].no, odds: Object.fromEntries(Object.entries(alive).map(([n, v]) => [n, v / N]))};
  }
  // ---- rendering ----
  let listPos = 'ALL', listQ = '', listSort = 'big';
  function render(){
    $('simLive').hidden = false;
    const done = SIM.i >= SIM.slots.length, s = done ? null : SIM.slots[SIM.i], mine = s && isMine(s);
    // status bar
    $('simStatus').innerHTML = done ? `<div class="simclock done"><b>Draft complete.</b> ${SIM.picks.filter(p => p.mine).length} picks made by you.</div>`
      : `<div class="simclock ${mine?'mine':''}"><span class="mpno num">${s.no}</span><span><b>${esc(teamName(s))}</b>${s.orig && s.orig!==s.owner?` <span class="muted">via ${esc(TM[s.orig].name)}</span>`:''} ${mine ? 'is on the clock: your pick' : 'is picking…'}</span></div>`;
    $('simBtns').innerHTML = `${!done && !mine ? '<button class="btn" id="simFast">Sim to my next pick</button>' : ''}${mine ? '<button class="btn" id="simAuto">Draft the top suggestion</button>' : ''}${SIM.hist.length ? '<button class="btn" id="simUndo">Undo my last pick</button>' : ''}<button class="btn" id="simRestart">Restart</button>`;
    $('simFast')?.addEventListener('click', simToMine);
    $('simAuto')?.addEventListener('click', () => draft(DRAFT.suggest(s.owner, SIM.avail, SIM.took[s.owner] || {})[0].x));
    $('simUndo')?.addEventListener('click', undo);
    $('simRestart').addEventListener('click', start);
    // board
    const rounds = [...new Set(SIM.slots.map(z => z.r))];
    const at = Object.fromEntries(SIM.picks.map(p => [p.s.no, p]));
    $('simBoard').innerHTML = `<tbody>${rounds.map(r => `<tr><th class="num">${r}</th>${SIM.slots.filter(z => z.r === r).map(z => { const p = at[z.no]; const cur = s && z.no === s.no;
      return `<td class="sc ${isMine(z)?'ctl':''} ${cur?'cur':''}"><div class="pk"><span>${z.no}</span>${p ? `<span>#${p.x.rank}</span>` : ''}</div>${p ? `<div class="pn">${esc(p.x.name)}</div><div><span class="pos ${p.x.pos}">${p.x.pos}</span></div>` : `<div class="muted" style="font-size:.72rem">${cur?'On the clock':''}</div>`}<div class="pt">${esc(teamName(z))}</div></td>`; }).join('')}</tr>`).join('')}</tbody>`;
    // pick panel
    if (mine){
      const sug = DRAFT.suggest(s.owner, SIM.avail, SIM.took[s.owner] || {}).slice(0, 5);
      const av = availability(sug);
      $('simPick').hidden = false;
      $('simPick').innerHTML = `<h3>Suggested for ${esc(teamName(s))} at ${s.no}</h3><p class="muted" style="margin:4px 0 10px">Ranked by the big board (50% consensus + 50% The Wylie), adjusted for this roster's needs.${av ? ` "Still there at ${av.next}" is the share of ${160} simulated drafts where he lasts to your next pick if you pass on him now.` : ''}</p>
        <div class="sglist">${sug.map((z, j) => `<div class="sgitem"><span class="num muted">${j+1}</span><span class="pos ${z.x.pos}">${z.x.pos}</span><span class="nm"><b>${esc(z.x.name)}</b> <span class="muted" style="font-size:.8rem">${esc(z.x.school)} · board #${DRAFT.bigRank(z.x)} · consensus #${z.x.rank}${z.x.wy?` · Wylie hit ${pct(z.x.wy.p_hit)}`:''}</span><div class="muted" style="font-size:.8rem">${esc(DRAFT.needText(s.owner, z.x))}${av ? ` Still there at ${av.next}: <b>${pct(av.odds[z.x.name])}</b>.` : ''}</div></span><button class="btn primary" data-draft="${esc(z.x.name)}">Draft</button></div>`).join('')}</div>
        <h3 style="margin-top:14px">Everyone available</h3>
        <div class="filters" style="margin:6px 0"><input type="search" id="simQ" placeholder="Search" value="${esc(listQ)}" aria-label="Search available prospects"><div class="seg" id="simPos">${['ALL','QB','RB','WR','TE'].map(p => `<button aria-pressed="${p===listPos}" data-p="${p}">${p==='ALL'?'All':p}</button>`).join('')}</div>
          <select id="simSort" aria-label="Sort available prospects"><option value="big" ${listSort==='big'?'selected':''}>Big board</option><option value="cons" ${listSort==='cons'?'selected':''}>Consensus</option><option value="wylie" ${listSort==='wylie'?'selected':''}>The Wylie</option></select></div>
        <div class="tblwrap" style="max-height:420px;overflow-y:auto"><table><thead><tr><th>Prospect</th><th class="c-sm">Pos</th><th class="r">Board</th><th class="r">Consensus</th><th class="r">Wylie</th><th class="r">Hit</th><th></th></tr></thead><tbody id="simAvail"></tbody></table></div>`;
      const drawAvail = () => {
        const S = {big: (a,b) => DRAFT.bigRank(a) - DRAFT.bigRank(b), cons: (a,b) => a.rank - b.rank, wylie: (a,b) => (a.wy ? a.wy.model_rank : 999) - (b.wy ? b.wy.model_rank : 999)};
        const list = SIM.avail.filter(x => (listPos === 'ALL' || x.pos === listPos) && (!listQ || x.name.toLowerCase().includes(listQ.toLowerCase()))).sort(S[listSort]);
        $('simAvail').innerHTML = list.map(x => `<tr><td class="teamname">${esc(x.name)}<div class="muted" style="font-size:.78rem">${esc(x.school)}</div></td><td><span class="pos ${x.pos}">${x.pos}</span></td><td class="r num">${DRAFT.bigRank(x)}</td><td class="r num">${x.rank}</td><td class="r num">${x.wy ? x.wy.model_rank : '–'}</td><td class="r num">${x.wy ? pct(x.wy.p_hit) : '–'}</td><td><button class="btn" data-draft="${esc(x.name)}">Draft</button></td></tr>`).join('');
        document.querySelectorAll('#simPick [data-draft]').forEach(b => b.onclick = () => draft(SIM.avail.find(x => x.name === b.dataset.draft)));
      };
      $('simQ').addEventListener('input', e => { listQ = e.target.value; drawAvail(); });
      $('simPos').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { listPos = b.dataset.p; $('simPos').querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x===b)); drawAvail(); }));
      $('simSort').addEventListener('change', e => { listSort = e.target.value; drawAvail(); });
      drawAvail();
    } else $('simPick').hidden = true;
    // results
    const myPicks = SIM.picks.filter(p => p.mine);
    if (done || myPicks.length){
      const byTeam = {}; SIM.picks.forEach(p => { const k = p.s.owner || 'mm'; (byTeam[k] = byTeam[k] || []).push(p); });
      const grade = p => { const d = p.s.overall - p.x.rank; return d >= 4 ? `<span class="tagv val">+${d} value</span>` : d <= -4 ? `<span class="tagv reach">${d} reach</span>` : `<span class="tagv">${d>=0?'+':''}${d}</span>`; };
      $('simResults').hidden = false;
      $('simResults').innerHTML = `<h3>Your picks</h3><div class="roster">${myPicks.map(p => `<div class="row"><span class="num" style="min-width:3em">${p.s.no}</span><span class="pos ${p.x.pos}">${p.x.pos}</span><span class="nm">${esc(p.x.name)} <span class="muted" style="font-size:.8rem">${esc(teamName(p.s))} · consensus #${p.x.rank}${p.x.wy?` · Wylie hit ${pct(p.x.wy.p_hit)}`:''}</span></span>${grade(p)}</div>`).join('') || '<p class="muted">None yet.</p>'}</div>
        ${done ? `<h3 style="margin-top:14px">Every team's haul</h3><div class="tblwrap"><table><thead><tr><th>Team</th><th>Picks</th><th class="r">Avg value vs. slot</th></tr></thead><tbody>${Object.entries(byTeam).map(([k, ps]) => { const avg = ps.reduce((a,p) => a + (p.s.overall - p.x.rank), 0) / ps.length; return `<tr class="${ME && +k===ME?'me':''}"><td class="teamname">${k==='mm'?'March Madness winner':esc(TM[k].name)}</td><td style="white-space:normal">${ps.map(p => `<span class="pos ${p.x.pos}">${p.x.pos}</span> ${esc(p.x.name)} <span class="muted num">(${p.s.no})</span>`).join(' · ')}</td><td class="r num">${avg>=0?'+':''}${avg.toFixed(1)}</td></tr>`; }).join('')}</tbody></table></div>` : ''}`;
    } else $('simResults').hidden = true;
  }
  $('simLede').textContent = `Run your own ${DS} rookie draft under ${D.league.name} settings: ${NT} teams, a ${L.snake ? 'snake' : 'linear'} draft${L.snake ? '' : ' (the same order every round)'}, every traded pick with its current owner${L.mm ? ', and optionally the 2.13 March Madness pick' : ''}. Choose how many rounds and which picks you control. Every other team drafts with weighted randomness from the consensus board and its roster needs, so each run plays out differently. Slide toward Chalk for predictable drafts or toward Chaos for surprises.`;
  renderSetup();
})();

// ---------- prospects big board ----------
(function(){
  const PB = D.prospect_board || [], MM = D.pm_meta; if (!PB.length) return;
  const htf = h => h ? `${Math.floor(h/12)}'${Math.round(h%12)}"` : '–';
  const pct = v => v == null ? '–' : Math.round(v*100) + '%';
  const f1 = v => v == null ? '–' : (+v).toFixed(1);
  document.getElementById('pbLede').textContent = `${PB.length} dynasty prospects for the 2027 draft. Each is ranked half on the consensus of ${(D.prospect_sources||[]).filter(s=>s.weight>0).length} ranking sites, and half on The Wylie, a model trained on every QB, RB, WR and TE drafted in 2015–2023, scored by their fantasy output in their first three NFL seasons. The Wylie uses college production (dominator rating, breakout age, yards per game, QB efficiency and rushing), height and weight, estimated combine times, age, and projected draft slot. College stats run through ${MM.stats_through}. Select a prospect for full details.`;
  let pos = 'ALL', sortBy = 'big', open = null;
  // ---- column explanations (hover / focus / tap a header) ----
  const nSrc = (D.prospect_sources||[]).filter(s=>s.weight>0).length, MD = MM.models;
  const wd = p => Math.round(MD[p].w_draft*100), au = (p,k) => (+MD[p].auc[k]).toFixed(2);
  const tip = s => `data-tip="${esc(s)}" tabindex="0"`;
  const TIP = {
    big: tip(`Big board rank. Half consensus, half The Wylie: each prospect gets a percentile on the ${nSrc}-site consensus and a percentile on The Wylie's expected value, the two are averaged, and the board is sorted on that average.`),
    my: tip('Your own rank. Type a number to slot a prospect in; everyone below moves down one. Not part of any model.'),
    age: tip(`Age today. Real birthdates are used when published. Ages marked * are estimated from high-school recruiting class: a recruit is assumed to be ${MM.age0} on Sept. 1 of his class year (the average for drafted players with known birthdates, typical error about ±0.5 years). Transfers and redshirts who look older than that get the older estimate.`),
    breakout: tip('Breakout age: his age in the first college season he cleared a dominator threshold, meaning his share of the team\'s receiving yards and TDs (WR 20%+, TE 15%+), or of scrimmage yards and TDs for RBs (20%+). Earlier breakouts have hit at much higher rates in the NFL. QBs don\'t have one.'),
    career: tip('The key college numbers The Wylie\'s profile model looks at. WR/TE: breakout age, peak dominator, receiving yards per game, size and estimated 40. RB: peak scrimmage dominator, receiving share, scrimmage yards per game, YPC, weight and speed score. QB: rushing yards per game, completion %, YPA, TD:INT, starting seasons and age.'),
    proj: tip('Projected NFL draft pick. If he appears on NFL big boards (B/R, WalterFootball, TSN), it\'s the average of his skill-player ranks there scaled up 5% for non-skill players drafted in between. Otherwise it comes from a curve fitted between dynasty consensus rank and actual draft slot for past classes.'),
    hit: tip(`Chance of a top-24 RB/WR or top-12 QB/TE fantasy season (this league's scoring) within his first three NFL seasons. The Wylie blends two logistic models trained on ${Object.values(MD).reduce((s,m)=>s+m.n,0)} drafted players from 2015–2023: a draft-slot model fed the projected pick, and a college-profile model. Weights are ${wd('WR')}/${100-wd('WR')} draft/profile for RB, WR and TE, and ${wd('QB')}/${100-wd('QB')} for QBs. Accuracy (AUC, 0.5 = coin flip, 1 = perfect): QB ${au('QB','draft')}/${au('QB','profile')}, RB ${au('RB','draft')}/${au('RB','profile')}, WR ${au('WR','draft')}/${au('WR','profile')}, TE ${au('TE','draft')}/${au('TE','profile')} (draft/profile).`),
    cons: tip(`Consensus rank from ${nSrc} ranking sites. Superflex dynasty boards count most, then 1QB and NFL-draft boards (re-ranked among skill players). A prospect a site didn't list is scored just past the end of that site's list.`),
    wylie: tip('The Wylie\'s rank by expected value: hit chance × the league trade value of a hit at his position, plus (1 − hit chance) × the value of a miss. That\'s why a QB with the same hit chance ranks above a TE in superflex. ▲/▼ marks where The Wylie is 5+ spots higher or lower than consensus.'),
    vs: tip('The Wylie\'s rank minus yours. Positive (green) means you like him more than the model does; negative means less.'),
  };
  // ---- my rankings: private db doc myranks/board, owner-only; falls back to this browser ----
  let MY = {}, dbDoc = null, saveState = 'loading', saving = false, again = false, saveTimer = null, canWrite = true, clearArm = false;
  const NAMES = new Set(PB.map(r => r.name));
  const LS = 'ddw-myranks';
  try { const l = JSON.parse(localStorage.getItem(LS) || 'null'); if (l && typeof l === 'object') MY = l; } catch(e){}
  const clean = obj => { const o = {}; Object.entries(obj || {}).forEach(([k,v]) => { if (NAMES.has(k) && Number.isFinite(+v) && +v > 0) o[k] = Math.round(+v); }); return o; };
  const renumber = () => { const arr = Object.entries(MY).sort((a,b) => a[1]-b[1]); MY = {}; arr.forEach(([n], i) => MY[n] = i+1); };
  function setRank(name, r){
    const arr = Object.entries(MY).filter(([n]) => n !== name).sort((a,b) => a[1]-b[1]).map(([n]) => n);
    if (r){ arr.splice(Math.min(Math.max(r,1), arr.length+1) - 1, 0, name); }
    MY = {}; arr.forEach((n, i) => MY[n] = i+1);
    queueSave();
  }
  async function writeNow(){
    if (saving){ again = true; return; }
    saving = true; saveState = 'saving'; renderMine();
    try { localStorage.setItem(LS, JSON.stringify(MY)); } catch(e){}
    if (dbDoc){
      try { await dbDoc.set({ranks: MY, updated: new Date().toISOString(), count: Object.keys(MY).length}); saveState = 'saved'; }
      catch(e){ saveState = e && (e.code === 'invalid_argument' || e.code === 'permission_denied') ? 'readonly' : 'error'; if (saveState === 'readonly') dbDoc = null; }
    } else saveState = 'local';
    saving = false; renderMine();
    if (again){ again = false; writeNow(); }
  }
  function queueSave(){ clearTimeout(saveTimer); saveTimer = setTimeout(writeNow, 600); }
  (async () => {
    const db = await window.claude?.use?.('db').catch(() => null);
    const user = await window.claude?.use?.('user').catch(() => null);
    if (!db){ saveState = 'local'; renderMine(); return; }
    // each viewer gets their own private doc; the owner's older board migrates over once
    let uid = null; try { uid = user && user.id ? await user.id() : null; } catch(e){}
    if (!uid){ saveState = 'local'; renderMine(); return; }
    dbDoc = db.doc('data/users/' + uid + '/myranks');
    try {
      const mine = await dbDoc.get();
      if (!mine.exists && user.isOwner && user.isOwner()){
        const old = await db.doc('myranks/board').get().catch(() => null);
        const r = old && old.exists ? clean((old.data()||{}).ranks) : {};
        if (Object.keys(r).length){ MY = r; await dbDoc.set({ranks: MY, updated: new Date().toISOString(), count: Object.keys(MY).length}); }
      }
    } catch(e){}
    let first = true;
    dbDoc.onSnapshot(snap => {
      if (snap.metadata && snap.metadata.hasPendingWrites) return;
      const remote = snap.exists ? clean((snap.data() || {}).ranks) : null;
      if (first){
        first = false;
        if (remote) MY = remote;
        else if (Object.keys(MY).length && canWrite) { writeNow(); }   // move this browser's draft into the store
        saveState = canWrite ? 'saved' : 'readonly';
      } else if (remote && JSON.stringify(remote) !== JSON.stringify(MY)) MY = remote;
      render();
    }, err => { saveState = 'error'; renderMine(); });
  })();
  const seg = document.getElementById('pbPos');
  seg.innerHTML = ['ALL','QB','RB','WR','TE'].map(p => `<button aria-pressed="${p==='ALL'}" data-p="${p}">${p==='ALL'?'All':p}</button>`).join('');
  seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { pos = b.dataset.p; seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x===b)); render(); }));
  document.getElementById('pbSort').addEventListener('change', e => { sortBy = e.target.value; render(); });
  document.getElementById('pbSearch').addEventListener('input', render);
  const keyStat = r => {
    const c = r.career || {}, y = r.y2026;
    if (r.pos === 'QB') return `${pct(r.comp)} · ${f1(r.ypa)} YPA · ${c.pass_td||0}:${c.ints||0} TD:INT · ${f1(r.rush_ypg)} rush/g`;
    if (r.pos === 'RB') return `${(c.rush_yds||0).toLocaleString()} rush yds · ${f1(r.ypc)} YPC · ${c.rush_td||0} TD · ${pct(r.peak_rec_sh)} rec share`;
    return `${c.rec||0}-${(c.rec_yds||0).toLocaleString()}-${c.rec_td||0} · ${f1(r.rec_ypg)} yds/g · ${pct(r.peak_dom)} peak dom`;
  };
  const y26 = r => { const y = r.y2026; if (!y) return '<span class="muted">No 2026 stats</span>';
    if (r.pos === 'QB') return `${y.cmp}/${y.att}, ${y.pass_yds} yds, ${y.pass_td} TD, ${y.ints} INT · ${y.rush_yds} rush`;
    if (r.pos === 'RB') return `${y.car}-${y.rush_yds}-${y.rush_td} rushing · ${y.rec}-${y.rec_yds} rec`;
    return `${y.rec}-${y.rec_yds}-${y.rec_td} in ${y.g} g`; };
  function detail(r){
    const e = r.est || {}, mdl = MM.models[r.pos];
    const seasons = (r.seasons||[]).map(s => r.pos === 'QB'
      ? `<tr><td>${s.season}</td><td class="r">${s.age ?? '–'}</td><td class="r">${s.g}</td><td class="r">${s.cmp}/${s.att}</td><td class="r">${s.pass_yds}</td><td class="r">${s.pass_td}-${s.ints}</td><td class="r">${s.rush_yds}</td></tr>`
      : r.pos === 'RB'
      ? `<tr><td>${s.season}</td><td class="r">${s.age ?? '–'}</td><td class="r">${s.g}</td><td class="r">${s.car}-${s.rush_yds}-${s.rush_td}</td><td class="r">${s.rec}-${s.rec_yds}-${s.rec_td}</td><td class="r">${pct(s.rb_dom)}</td></tr>`
      : `<tr><td>${s.season}</td><td class="r">${s.age ?? '–'}</td><td class="r">${s.g}</td><td class="r">${s.rec}-${s.rec_yds}-${s.rec_td}</td><td class="r">${pct(s.dom)}</td></tr>`).join('');
    const head = r.pos === 'QB' ? '<th>Season</th><th class="r">Age</th><th class="r">G</th><th class="r">Cmp/Att</th><th class="r">Yds</th><th class="r">TD-INT</th><th class="r">Rush</th>'
      : r.pos === 'RB' ? '<th>Season</th><th class="r">Age</th><th class="r">G</th><th class="r">Rushing</th><th class="r">Receiving</th><th class="r">Dominator</th>'
      : '<th>Season</th><th class="r">Age</th><th class="r">G</th><th class="r">Rec-Yds-TD</th><th class="r">Dominator</th>';
    const comps = (r.comps||[]).map(c => `<div class="trait"><span class="pill ${c.hit?'in':''}">${c.hit?'Hit':'Miss'}</span><span>${esc(c.name)} <span class="muted">(${c.year}, pick ${c.pick}, best ${c.ppg} PPG)</span></span></div>`).join('') || '<p class="muted">No close historical comps.</p>';
    const notes = (r.notes||[]).map(n => `<p>${esc(n[1])}</p>`).join('');
    const src = Object.entries(r.ranks||{}).map(([k,v]) => `${esc((D.prospect_sources.find(s=>s.key===k)||{}).outlet||k)}${k==='ds1'?' 1QB':''} #${v}${['br','wf','tsn'].includes(k)?' overall':''}`).join(' · ');
    return `<div class="pbdet">
      <div>
        <div class="qstats"><div><span class="k">Career</span>${keyStat(r)}</div><div><span class="k">2026</span>${y26(r)}</div></div>
        <h4>Scouting summary</h4><p>${esc(r.blurb)}</p>
        <div class="kv" style="margin:10px 0">
          <div><div class="k">Height / weight</div><div class="v">${htf(r.ht)} / ${r.wt ?? '–'}</div></div>
          <div><div class="k">Age now ${r.age_est?'(est.)':''}</div><div class="v">${r.age_now ?? '–'}</div></div>
          <div><div class="k">Age at draft</div><div class="v">${r.age_draft ?? '–'}</div></div>
          ${r.pos!=='QB'?`<div><div class="k" data-tip="First college season with a 20%+ dominator rating (WR), 15%+ (TE), or 20%+ scrimmage dominator (RB)." tabindex="0">Breakout age</div><div class="v">${r.breakout_age ?? 'None yet'}</div></div>`:''}
          <div><div class="k" data-tip="Estimated from height, weight and college play style with a regression trained on past combine results. The ± is the typical error. Real times replace it after the combine." tabindex="0">Est. 40-yard</div><div class="v">${e.forty ?? '–'} <span class="est">±${e.forty_sd != null ? (+e.forty_sd).toFixed(2) : ''}</span></div></div>
          <div><div class="k">Est. vertical</div><div class="v">${e.vertical ?? '–'}" <span class="est">±${e.vertical_sd != null ? (+e.vertical_sd).toFixed(1) : ''}</span></div></div>
          <div><div class="k">Est. broad</div><div class="v">${e.broad ?? '–'}" <span class="est">±${e.broad_sd != null ? (+e.broad_sd).toFixed(1) : ''}</span></div></div>
          <div><div class="k">Projected pick</div><div class="v">~${r.proj_pick}</div></div>
        </div>
        <h4>College career</h4><div style="overflow-x:auto"><table class="minitbl"><thead><tr>${head}</tr></thead><tbody>${seasons}</tbody></table></div>
        <p class="srcrk" style="margin-top:8px">${esc(src)}</p>
      </div>
      <div>
        <h4>How his profile has played out</h4>${notes || '<p class="muted">Not enough college data yet.</p>'}
        <h4>The Wylie breakdown</h4>
        <p>Draft-slot model: <b>${pct(r.p_draft)}</b> (projected pick ~${r.proj_pick}) · College-profile model: <b>${pct(r.p_profile)}</b> · Combined (${Math.round(mdl.w_draft*100)}/${100-Math.round(mdl.w_draft*100)}): <b>${pct(r.p_hit)}</b> chance of a top-${MM.hit_n[r.pos]} ${r.pos} season within three years.</p>
        <h4>Closest historical profiles</h4>${comps}
      </div></div>`;
  }
  function render(){
    const q = document.getElementById('pbSearch').value.trim().toLowerCase();
    let list = PB.filter(r => (pos==='ALL' || r.pos===pos) && (!q || r.name.toLowerCase().includes(q) || r.school.toLowerCase().includes(q)));
    const S = {big:(a,b)=>a.big_rank-b.big_rank, consensus:(a,b)=>a.consensus-b.consensus, model:(a,b)=>a.model_rank-b.model_rank, p_hit:(a,b)=>b.p_hit-a.p_hit,
      breakout:(a,b)=>(a.breakout_age??99)-(b.breakout_age??99), age:(a,b)=>(a.age_now??99)-(b.age_now??99),
      my:(a,b)=>(MY[a.name]??1e6)-(MY[b.name]??1e6) || a.big_rank-b.big_rank};
    list.sort(S[sortBy]);
    const posRk = {}; const pc = {}; PB.forEach(r => { pc[r.pos] = (pc[r.pos]||0)+1; posRk[r.name] = r.pos + pc[r.pos]; });
    renderMine();
    const anyMine = Object.keys(MY).length > 0, NC = anyMine ? 12 : 11;
    document.getElementById('pbTbl').innerHTML = `<thead><tr><th ${TIP.big}>#</th><th class="r" ${TIP.my}>Mine</th><th>Prospect</th><th class="c-sm">Pos</th><th class="c-md">Size</th><th class="r c-sm" ${TIP.age}>Age</th><th class="r c-md" ${TIP.breakout}>Breakout</th><th class="r c-sm" ${TIP.proj}>Pick</th><th ${TIP.hit}>Hit chance</th><th class="r" ${TIP.cons}>Cons.</th><th class="r" ${TIP.wylie}>Wylie</th>${anyMine ? `<th class="r" ${TIP.vs}>Me vs</th>` : ''}</tr></thead><tbody>${list.map((r, idx) => {
      const mv = r.consensus - r.model_rank, mine = MY[r.name], dv = mine ? r.model_rank - mine : null;
      return `<tr class="prow" data-n="${esc(r.name)}" aria-expanded="${open===r.name}" tabindex="0"><td class="num">${r.big_rank}</td><td class="r"><input class="myrk ${mine?'set':''}" type="number" min="1" inputmode="numeric" id="myrk-${PB.indexOf(r)}" data-n="${esc(r.name)}" value="${mine ?? ''}" aria-label="My rank for ${esc(r.name)}" ${canWrite?'':'disabled'}></td><td class="pbname"><b>${esc(r.name)}</b><span><i class="pos ${r.pos} c-mob">${posRk[r.name]}</i>${esc(r.school)}</span></td><td class="c-sm"><span class="pos ${r.pos}">${posRk[r.name]}</span></td>
        <td class="num c-md">${htf(r.ht)} · ${r.wt ?? '–'}</td><td class="r num c-sm">${r.age_now ?? '–'}${r.age_est?'<span class="est">*</span>':''}</td><td class="r num c-md">${r.pos==='QB'?'<span class="muted">–</span>':(r.breakout_age ?? '<span class="muted">–</span>')}</td>
        <td class="r num c-sm">${r.proj_pick}</td>
        <td class="num"><span class="hitbar"><i style="width:${Math.round(r.p_hit*100)}%"></i></span>${pct(r.p_hit)}</td>
        <td class="r num">${r.consensus}</td><td class="r num">${r.model_rank}${mv>=5?' <span class="mv up">▲</span>':mv<=-5?' <span class="mv down">▼</span>':''}</td>
        ${anyMine ? `<td class="r num">${dv == null ? '<span class="muted">–</span>' : `<span class="dv ${dv>0?'up':dv<0?'down':''}">${dv>0?'+':''}${dv}</span>`}</td>` : ''}</tr>
        ${open===r.name ? `<tr><td colspan="${NC}" class="det">${detail(r)}</td></tr>` : ''}`;}).join('')}</tbody>`;
    document.querySelectorAll('#pbTbl input.myrk').forEach(inp => {
      inp.addEventListener('click', e => e.stopPropagation());
      inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); });
      inp.addEventListener('change', () => { const v = parseInt(inp.value, 10); setRank(inp.dataset.n, Number.isFinite(v) && v > 0 ? v : null); render(); });
    });
    document.querySelectorAll('#pbTbl tr.prow').forEach(tr => { const go = () => { open = open === tr.dataset.n ? null : tr.dataset.n; render(); }; tr.addEventListener('click', go); tr.addEventListener('keydown', e => { if (e.key==='Enter'||e.key===' '){ e.preventDefault(); go(); } }); });
  }
  function spearman(key){
    const xs = PB.filter(r => MY[r.name]); if (xs.length < 5) return null;
    const rk = (arr, f) => { const s = arr.slice().sort((a,b) => f(a)-f(b)); const m = new Map(); s.forEach((r,i) => m.set(r.name, i+1)); return m; };
    const a = rk(xs, r => MY[r.name]), b = rk(xs, r => r[key]); const n = xs.length;
    const d2 = xs.reduce((s,r) => s + (a.get(r.name)-b.get(r.name))**2, 0);
    return 1 - 6*d2/(n*(n*n-1));
  }
  function renderMine(){
    const el = document.getElementById('pbMine'); if (!el) return;
    const n = Object.keys(MY).length;
    const st = {loading:'Loading your rankings…', saving:'Saving…', saved:'Saved to your account. Only you can see your rankings.', local:'Saved in this browser.', error:"Couldn't save just now. Your changes are kept in this browser and will save on your next edit.", readonly:'Saved in this browser only. Ask the league commish for edit access to this page to sync your rankings across devices.'}[saveState] || '';
    const ranked = PB.filter(r => MY[r.name]).map(r => ({r, d: r.model_rank - MY[r.name]}));
    const higher = ranked.filter(x => x.d > 0).sort((a,b) => b.d - a.d).slice(0,5), lower = ranked.filter(x => x.d < 0).sort((a,b) => a.d - b.d).slice(0,5);
    const row = x => `<div class="row"><span class="pos ${x.r.pos}">${x.r.pos}</span><span class="nm">${esc(x.r.name)} <span class="muted" style="font-size:.8rem">you #${MY[x.r.name]} · Wylie #${x.r.model_rank}</span></span><span class="dv ${x.d>0?'up':'down'} num">${x.d>0?'+':''}${x.d}</span></div>`;
    const sm = spearman('model_rank'), sc = spearman('consensus');
    el.innerHTML = `<div class="mystat"><h3>My rankings</h3><span class="muted">${n ? `${n} of ${PB.length} prospects ranked` : 'Type a number in the Mine column to start your board.'}</span><span class="mysave ${saveState==='error'?'err':''}" role="status">${st}</span></div>
      ${sm != null ? `<p class="muted" style="margin:6px 0 0;font-size:.88rem">Your order agrees with The Wylie ${Math.round(sm*100)}% and with consensus ${Math.round(sc*100)}% (rank correlation).</p>` : ''}
      <details class="myhelp"><summary>How ranking works</summary><p class="muted" style="margin:6px 0 0;font-size:.88rem">Type a number in the Mine column. That prospect slots in and everyone below him moves down one, so your board stays numbered 1, 2, 3… Clear a box to unrank someone. Sort by "My rank" to see your board. Click any row for full stats, the scouting report and The Wylie's breakdown.</p></details>
      <div class="btnrow">${canWrite ? `<button class="btn" id="mySeedBig">Start from big board</button><button class="btn" id="mySeedModel">Start from The Wylie</button><button class="btn" id="myClear">${clearArm ? 'Click again to clear all' : 'Clear my rankings'}</button>` : ''}</div>
      ${ranked.length ? `<div class="mydiff"><div><h3 style="margin-bottom:6px">You're higher than The Wylie</h3><div class="roster">${higher.map(row).join('') || '<p class="muted">None yet.</p>'}</div></div><div><h3 style="margin-bottom:6px">You're lower than The Wylie</h3><div class="roster">${lower.map(row).join('') || '<p class="muted">None yet.</p>'}</div></div></div>` : ''}`;
    const seed = key => { const unr = PB.filter(r => !MY[r.name]).sort((a,b) => a[key]-b[key]); let k = Object.keys(MY).length; unr.forEach(r => MY[r.name] = ++k); renumber(); queueSave(); render(); };
    el.querySelector('#mySeedBig')?.addEventListener('click', () => seed('big_rank'));
    el.querySelector('#mySeedModel')?.addEventListener('click', () => seed('model_rank'));
    el.querySelector('#myClear')?.addEventListener('click', () => { if (!clearArm){ clearArm = true; renderMine(); setTimeout(() => { clearArm = false; renderMine(); }, 4000); return; } clearArm = false; MY = {}; queueSave(); render(); });
  }
  render();
  // methodology
  const bk = (pos, col, title) => { const b = (MM.buckets[pos]||{})[col]; if (!b) return ''; return `<p style="margin-top:6px"><b>${title}</b></p><table class="bkt"><thead><tr><th>Group</th><th class="r">Players</th><th class="r">Hit rate</th></tr></thead><tbody>${b.map(x => `<tr><td>${esc(x.label)}</td><td class="r num">${x.n}</td><td class="r num">${Math.round(x.hit*100)}%</td></tr>`).join('')}</tbody></table>`; };
  const auc = Object.entries(MM.models).map(([p,m]) => `${p}: ${m.n} players, ${Math.round(m.base_rate*100)}% hit, accuracy (AUC) draft ${m.auc.draft} / profile ${m.auc.profile}`).join(' · ');
  document.getElementById('pbMethod').innerHTML = `<h3>How the board works</h3>
    <p><b>Training data.</b> ${esc(MM.trained_on)}. Fantasy points use this league's scoring (full PPR, +0.5 per TE catch). A "hit" is a top-${MM.hit_n.WR} RB/WR or top-${MM.hit_n.QB} QB/TE season within three years. College stats come from ESPN play-by-play (via sportsdataverse) and can differ slightly from official totals. Combine results come from nflverse.</p>
    <p><b>How The Wylie works: two models per position.</b> The draft-slot model uses only where a player was picked. The college-profile model uses only his college stats, size, age and athleticism. For 2027 prospects, the draft slot is projected from the NFL big boards (B/R, WalterFootball, TSN), or from the dynasty consensus when they're unranked there. Because projections in October are noisy, the profile model gets ${100-Math.round(MM.models.WR.w_draft*100)}% weight for RB/WR/TE and ${100-Math.round(MM.models.QB.w_draft*100)}% for QBs, where college stats have historically predicted much better. ${esc(auc)}.</p>
    <p><b>Big board rank</b> = 50% dynasty consensus + 50% The Wylie's expected value. Expected value turns hit chance into this league's trade values, so a superflex QB hit is worth more than a TE hit.</p>
    <p><b>Estimates.</b> Combine numbers are estimated from height, weight and college play style, with the ± showing typical error. Most prospects don't have published birthdates, so ages marked * are estimated from high-school recruiting class (typical error about ±0.5 years). Breakout age is the first season with a 20%+ dominator rating (WR), 15%+ (TE), or 20%+ scrimmage dominator (RB).</p>
    ${bk('WR','breakout_age','WR breakout age vs. NFL hit rate')}${bk('WR','pick','WR draft round vs. hit rate')}${bk('RB','peak_rec_sh','RB college receiving share vs. hit rate')}${bk('RB','pick','RB draft round vs. hit rate')}${bk('QB','rush_ypg','QB rushing yards per game vs. hit rate')}${bk('TE','breakout_age','TE breakout age vs. hit rate')}
    <p class="muted">Takeaway from the data: once a player is drafted, his draft slot explains most of his outcome. Before the draft, college profile (especially WR breakout age and QB rushing) is the best independent check on the hype.</p>`;
})();

// ---------- rookie draft history ----------
(function(){
  const DH = D.draft_history; if (!DH || !DH.drafts.length){ document.getElementById('dhBoard').innerHTML = '<tbody><tr><td class="muted" style="padding:16px">No completed rookie drafts in this league yet. Startup drafts aren\'t graded.</td></tr></tbody>'; ['dhLegend','dhBest','dhWorst','dhLeaders'].forEach(id => { const el = document.getElementById(id); if (el) el.hidden = true; }); document.getElementById('dhMine').closest('label').hidden = true; return; }
  const GL = {steal:'Steal (8+ spots better)', good:'Good (3–7 better)', fair:'Fair (within 2)', reach:'Reach (3–7 worse)', bust:'Bust (8+ worse)'};
  document.getElementById('dhLegend').innerHTML = Object.entries(GL).map(([k,v]) => `<span><i class="sw ${k}"></i>${v}</span>`).join('');
  let season = DH.drafts[0].season, mineOnly = false;
  const seg = document.getElementById('dhSeason');
  seg.innerHTML = DH.drafts.map(d => `<button aria-pressed="${d.season===season}" data-s="${d.season}">${d.season} draft</button>`).join('');
  seg.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { season = b.dataset.s; seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x===b)); render(); }));
  if (!MEO){ document.getElementById('dhMine').disabled = true; document.getElementById('dhMineLbl').textContent = 'Highlight a team (choose one in “Viewing as”)'; }
  document.getElementById('dhMine').addEventListener('change', e => { mineOnly = e.target.checked; render(); });
  const cell = p => `<td class="dc ${p.grade} ${MEO && p.owner_id===MEO?'mine':''} ${MEO && mineOnly && p.owner_id!==MEO?'dim':''}" title="${esc(p.name)}: taken ${p.label}, now #${p.rerank} in this class${p.alt?` · ${esc(p.alt.name)} went later at ${p.alt.label}`:''}">
      <div class="pk"><span>${p.label}</span><span>#${p.rerank}</span></div>
      <div class="pn">${esc(p.name)}</div>
      <div><span class="pos ${p.pos}">${p.pos}</span> <span class="num">${fmt(p.value)}</span></div>
      <div class="pt">${esc(p.team)}</div></td>`;
  function render(){
    const d = DH.drafts.find(x => x.season === season);
    const rounds = [...new Set(d.picks.map(p => p.round))].sort();
    const slots = Math.max(...d.picks.map(p => p.slot));
    document.getElementById('dhBoard').innerHTML = `<thead><tr><th style="width:52px">Rd</th>${Array.from({length:slots}, (_,i) => `<th>${i+1}</th>`).join('')}</tr></thead><tbody>${rounds.map(r => `<tr><th class="num">${r}</th>${Array.from({length:slots}, (_,i) => { const p = d.picks.find(x => x.round===r && x.slot===i+1); return p ? cell(p) : '<td></td>'; }).join('')}</tr>`).join('')}</tbody>`;
    const best = d.picks.slice().sort((a,b) => b.delta - a.delta).slice(0,6), worst = d.picks.slice().sort((a,b) => a.delta - b.delta).slice(0,6);
    const row = p => `<div class="row"><span class="num" style="min-width:3em">${p.label}</span><span class="pos ${p.pos}">${p.pos}</span><span class="nm">${esc(p.name)} <span class="muted" style="font-size:.8rem">${esc(p.team)}${p.alt?` · could have had ${esc(p.alt.name)} (${p.alt.label})`:''}</span></span><span class="num ${p.delta>0?'delta up':'delta down'}">${p.delta>0?'+':''}${p.delta}</span></div>`;
    document.getElementById('dhBest').innerHTML = `<h3>${season} steals</h3><p class="muted" style="margin:4px 0 8px">Re-rank gain: slot taken minus where the player ranks in the class today.</p><div class="roster">${best.map(row).join('')}</div>`;
    document.getElementById('dhWorst').innerHTML = `<h3>${season} busts</h3><p class="muted" style="margin:4px 0 8px">The biggest drops, with the best player still on the board at that pick.</p><div class="roster">${worst.map(row).join('')}</div>`;
  }
  render();
  document.getElementById('dhLeaders').innerHTML = `<thead><tr><th>#</th><th>Manager</th><th class="r">Drafts</th><th class="r">Picks</th><th class="r">Avg gain per pick</th><th class="r">Steals</th><th class="r">Busts</th><th class="r">Value of picks today</th></tr></thead><tbody>${DH.leaders.map((x,i) => `<tr class="${MEO && x.owner_id===MEO?'me':''}"><td class="num">${i+1}</td><td class="teamname">${esc(x.team)}<div class="muted" style="font-size:.78rem">${esc(x.manager)}${x.active?'':' · former manager'}</div></td><td class="r num">${x.drafts}</td><td class="r num">${x.picks}</td><td class="r num"><b class="net ${x.avg_delta>0?'up':x.avg_delta<0?'down':''}">${x.avg_delta>0?'+':''}${x.avg_delta}</b></td><td class="r num">${x.steals}</td><td class="r num">${x.busts}</td><td class="r num">${fmt(x.value)}</td></tr>`).join('')}</tbody>`;
})();

// ---------- about ----------
const S = D.sources, W = D.weights, pc = k => Math.round((W[k] || 0) * 100);
document.getElementById('about').innerHTML = `
  <div class="src"><span class="pill in">KeepTradeCut</span><span class="pill in">Dynasty Daddy</span>${S.flock ? '<span class="pill in">Flock</span>' : ''}<span class="pill in">Sleeper (live)</span></div>
  <p><b>This league.</b> ${esc(D.league.name)}, ${D.league.season}: ${NT} teams, ${esc(L.desc.kind.toLowerCase())}, ${esc(L.desc.format)}, ${esc(L.desc.scoring)}. Starting lineup: ${esc(L.desc.lineup)}. ${L.playoffTeams} playoff teams starting Week ${L.playoffStart}; ${L.rounds}-round rookie drafts. Everything on this site is computed from these settings, live from Sleeper, every time the page loads.</p>
  <p><b>Player values.</b> Each player's value is a weighted average of ${S.flock ? `Flock ${pc('flock')}%, ` : ''}KeepTradeCut ${pc('ktc')}% and Dynasty Daddy ${pc('dd')}%, using their ${L.sf ? 'superflex' : '1QB'} values on a 0–9,999 scale. ${S.flock ? "Flock publishes an expert consensus ranking rather than trade values, so each Flock rank is converted to the value KTC gives that same rank. " : ''}Dynasty Daddy is rescaled so its top player matches KTC's. When a source has no value for an asset, the others are reweighted. ${L.tep ? `Tight ends get a ${Math.round((D.te_premium-1)*100)}% boost for the +${L.tep} TE premium. ` : ''}${L.ppr < 1 ? `Because this league isn't full PPR, running backs get a small boost and pass catchers a small cut. ` : ''}Values update once a day.</p>
  <p><b>Picks.</b> ${DS} picks are priced from each original team's simulated draft slot, interpolating between early, mid and late values. Later seasons use mid-round values.</p>
  <p><b>Team value.</b> Every rostered player (bench, taxi and IR included) plus every owned pick for the next three drafts. Starters is the best value lineup using this league's starting slots.</p>
  <p><b>Projections.</b> Each team gets a weekly scoring rating that blends its points per game so far (pulled toward the league average early in the year) with what its starting-lineup value predicts. Remaining games are simulated ${D.sims.toLocaleString()} times with week-to-week swings of about ${D.rating_sd} points. ${L.isDD ? 'Draft order follows the Dynasty Degenerates bylaws, with an assumed 4-3-2-1 lottery for the bottom four max-PF teams.' : L.orderSet ? `The ${DS} draft order is already set in Sleeper.` : "Sleeper doesn't store custom draft-order rules, so draft order assumes reverse standings: non-playoff teams first (worst record first), then playoff teams by how far they go."}</p>
  <p><b>Trade calculator.</b> Side totals use a consolidation adjustment (a 1.4 power mean), similar in spirit to KTC's value adjustment. On top of that, a stud premium: when one side sends fewer pieces and holds the single best asset, it gets 30% of the gap between the two sides' best assets added to its total. Suggested packages (one to three assets) must clear both adjustments. Within 5% is fair, 5–15% leans one way, over 15% is lopsided.</p>
  <p><b>Trade history.</b> Every completed Sleeper trade in this league's history is graded on what each side received, valued today with the same values and consolidation adjustment as the calculator. Used picks count as the player drafted with them; unused picks use today's projected pick value; FAAB counts ${D.faab_per_dollar} points per dollar. Under 5% (or 250 points) is even, under 15% (or 1,000 points) is an edge, anything more is a win. This is hindsight: it shows how trades turned out, not whether they were fair when made.</p>
  <p><b>Draft simulator.</b> Uses this league's settings: ${NT} teams, ${L.snake ? 'snake' : 'linear'} order, every traded pick with its current owner${L.mm ? ', and the optional 2.13 March Madness pick' : ''}. Computer teams pick by weighted chance from the best 18 left on the consensus board, adjusted for roster needs, so the top player goes most often but not always; the Chaos slider widens that spread, and it widens a bit more each round.${L.sf ? '' : ' In 1QB leagues, quarterbacks are pushed down the board.'}</p>
  <p><b>Prospects.</b> The 2027 class is scored by The Wylie (see the Prospects tab). ${L.sf ? '' : "Expected values are rescaled to this league's 1QB position values, so quarterbacks rank lower than on a superflex board. "}</p>
  ${L.isDD ? `<p><b>Bylaw notes.</b> The bylaws set the trade deadline at Week 12. Unpaid future 1st- and 2nd-round picks carry a payment to the commissioner ($75 / $25); this site does not factor that in.</p>` : ''}
  <p class="muted">Values updated ${new Date(D.updated).toLocaleString()}. Sleeper data loaded ${new Date().toLocaleString()}.</p>`;

}
