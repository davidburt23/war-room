// Dynasty War Room: league engine. Loads a Sleeper league live in the browser and computes
// values, teams, picks, projections, trade grades and draft grades in the shape the UI expects.
'use strict';
const ENGINE = (() => {
  const API = 'https://api.sleeper.app/v1/';
  const DD_NAME = 'Dynasty Degenerates';
  const CACHE_MIN = 15;

  // ---------- fetching with a small session cache and limited concurrency ----------
  const strip = (url, j) => {
    if (!j) return j;
    if (/\/matchups\/\d+$/.test(url)) return j.map(m => ({roster_id: m.roster_id, matchup_id: m.matchup_id, points: m.points}));
    if (/\/transactions\/\d+$/.test(url)) return j.filter(t => t.type === 'trade').map(t => ({transaction_id: t.transaction_id, status: t.status, created: t.created, leg: t.leg, roster_ids: t.roster_ids, adds: t.adds, drops: t.drops, draft_picks: t.draft_picks, waiver_budget: t.waiver_budget}));
    if (/\/rosters$/.test(url)) return j.map(r => ({roster_id: r.roster_id, owner_id: r.owner_id, co_owners: r.co_owners, players: r.players, taxi: r.taxi, reserve: r.reserve, settings: r.settings}));
    if (/\/users$/.test(url)) return j.map(u => ({user_id: u.user_id, display_name: u.display_name, avatar: u.avatar, metadata: {team_name: u.metadata && u.metadata.team_name}}));
    if (/\/draft\/\d+\/picks$/.test(url)) return j.map(p => ({round: p.round, draft_slot: p.draft_slot, pick_no: p.pick_no, roster_id: p.roster_id, player_id: p.player_id}));
    return j;
  };
  const ssGet = k => { try { const x = JSON.parse(sessionStorage.getItem(k)); if (x && Date.now() - x.t < CACHE_MIN * 60000) return x.v; } catch (e) {} return undefined; };
  const ssSet = (k, v) => { try { sessionStorage.setItem(k, JSON.stringify({t: Date.now(), v})); } catch (e) { try { sessionStorage.clear(); } catch (e2) {} } };
  let active = 0; const queue = [];
  const pump = () => { while (active < 8 && queue.length) { const job = queue.shift(); active++; job().finally(() => { active--; pump(); }); } };
  function get(path, opts = {}) {
    const url = API + path, key = 'sl:' + path;
    if (!opts.fresh) { const c = ssGet(key); if (c !== undefined) return Promise.resolve(c); }
    return new Promise((res, rej) => {
      queue.push(async () => {
        try {
          let r, tries = 0;
          while (true) { r = await fetch(url); if (r.status !== 429 || ++tries > 3) break; await new Promise(z => setTimeout(z, 800 * tries)); }
          if (r.status === 404) { res(null); return; }
          if (!r.ok) throw new Error(`Sleeper returned ${r.status} for ${path}`);
          const j = strip(url, await r.json()); ssSet(key, j); res(j);
        } catch (e) { rej(e); }
      });
      pump();
    });
  }

  // ---------- static data (published daily) ----------
  let STATIC = null;
  async function loadStatic() {
    if (STATIC) return STATIC;
    const g = f => fetch('data/' + f + '?v=' + Math.floor(Date.now() / 3.6e6)).then(r => { if (!r.ok) throw new Error('Missing ' + f); return r.json(); });
    const [values, players, prospects] = await Promise.all([g('values.json'), g('players.json'), g('prospects.json').catch(() => ({}))]);
    STATIC = {values, players: players.players, prospects};
    return STATIC;
  }

  // ---------- Sleeper lookups for the Leagues tab ----------
  async function findUser(name) {
    const u = await get('user/' + encodeURIComponent(name.trim().toLowerCase()), {fresh: true});
    if (!u || !u.user_id) return null;
    return {user_id: u.user_id, display_name: u.display_name, avatar: u.avatar};
  }
  async function userLeagues(userId) {
    const st = await get('state/nfl');
    const seasons = [st.league_season]; if (st.league_season !== st.season) seasons.push(st.season);
    const out = [];
    for (const s of [...new Set(seasons)]) {
      const ls = await get(`user/${userId}/leagues/nfl/${s}`, {fresh: true}) || [];
      ls.forEach(l => out.push(summarize(l)));
    }
    return out.filter((l, i, a) => a.findIndex(x => x.id === l.id) === i);
  }
  async function leagueSummary(id) { const l = await get('league/' + id, {fresh: true}); return l ? summarize(l) : null; }
  function summarize(l) {
    const f = formatOf(l);
    return {id: l.league_id, name: l.name, season: l.season, teams: l.total_rosters, type: (l.settings || {}).type, status: l.status, avatar: l.avatar,
            sf: f.sf, ppr: f.ppr, tep: f.tep, desc: describe(l, f)};
  }

  // ---------- league format ----------
  const SKILL = ['QB', 'RB', 'WR', 'TE'];
  function formatOf(L) {
    const rp = L.roster_positions || [], sc = L.scoring_settings || {}, st = L.settings || {};
    const qbs = rp.filter(x => x === 'QB').length;
    const sf = rp.includes('SUPER_FLEX') || qbs >= 2;
    const ppr = sc.rec ?? 0, tep = sc.bonus_rec_te ?? 0;
    const slots = rp.filter(x => !['BN', 'IR', 'TAXI'].includes(x));
    return {sf, ppr, tep, passTd: sc.pass_td ?? 4, slots, bench: rp.filter(x => x === 'BN').length,
            taxi: st.taxi_slots || 0, ir: st.reserve_slots || 0, teams: L.total_rosters || 12,
            rounds: st.draft_rounds || 4, playoffTeams: st.playoff_teams || 6, playoffStart: st.playoff_week_start || 15,
            divisions: st.divisions || 1, type: st.type ?? 2, deadline: st.trade_deadline || null};
  }
  const SLOT_NAME = {QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', FLEX: 'FLEX', WRRB_FLEX: 'RB/WR flex', REC_FLEX: 'WR/TE flex', SUPER_FLEX: 'superflex', K: 'K', DEF: 'DEF'};
  function describe(L, f) {
    const c = {}; f.slots.forEach(s => c[s] = (c[s] || 0) + 1);
    const lineupTxt = Object.entries(c).map(([s, n]) => (n > 1 ? n + ' ' : '') + (SLOT_NAME[s] || s)).join(', ');
    const scoring = f.ppr >= 1 ? 'full PPR' : f.ppr >= 0.5 ? 'half PPR' : f.ppr > 0 ? f.ppr + ' PPR' : 'standard (no PPR)';
    return {lineup: lineupTxt, scoring: scoring + (f.tep ? `, +${f.tep} TE premium` : ''), format: f.sf ? 'Superflex' : '1QB',
            kind: f.type === 2 ? 'Dynasty' : f.type === 1 ? 'Keeper' : 'Redraft'};
  }

  // ---------- helpers ----------
  const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
  const pstdev = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
  let seed = 7; const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const gauss = (m, s) => { let u = 0, v = 0; while (u === 0) u = rand(); v = rand(); return m + s * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  const ORD = r => r + (['th', 'st', 'nd', 'rd'][((r % 100) - 20) % 10] || ['th', 'st', 'nd', 'rd'][r % 100] || 'th');
  const pad2 = n => String(n).padStart(2, '0');
  const pts = s => (s.fpts || 0) + (s.fpts_decimal || 0) / 100;

  // ---------- load + compute ----------
  async function load(leagueId, progress = () => {}) {
    const S = await loadStatic();
    progress('Loading league from Sleeper…', 0.05);
    const state = await get('state/nfl');
    const Lg = await get('league/' + leagueId);
    if (!Lg) throw new Error("Sleeper doesn't have a league with that ID.");
    const F = formatOf(Lg);
    const isDD = Lg.name.trim() === DD_NAME && F.teams === 12;
    // current league data
    const weeksToGet = Math.min(18, F.playoffStart + 3);
    const [users, rosters, traded, drafts, ...mups] = await Promise.all([
      get(`league/${leagueId}/users`), get(`league/${leagueId}/rosters`), get(`league/${leagueId}/traded_picks`), get(`league/${leagueId}/drafts`),
      ...Array.from({length: weeksToGet}, (_, i) => get(`league/${leagueId}/matchups/${i + 1}`))]);
    progress('Loading trade and draft history…', 0.3);
    // league chain for history
    const chain = [{L: Lg, users, rosters, drafts}];
    let prev = Lg.previous_league_id;
    while (prev && prev !== '0' && chain.length < 8) {
      const PL = await get('league/' + prev); if (!PL) break;
      const [u, r, d] = await Promise.all([get(`league/${prev}/users`), get(`league/${prev}/rosters`), get(`league/${prev}/drafts`)]);
      chain.push({L: PL, users: u || [], rosters: r || [], drafts: d || []});
      prev = PL.previous_league_id;
    }
    let done = 0; const total = chain.length * 19 + chain.reduce((s, c) => s + (c.drafts || []).length * 2, 0);
    const tick = () => { done++; if (done % 8 === 0) progress('Loading trade and draft history…', 0.3 + 0.6 * done / total); };
    await Promise.all(chain.map(async c => {
      c.tx = (await Promise.all(Array.from({length: 19}, (_, w) => get(`league/${c.L.league_id}/transactions/${w}`).then(x => { tick(); return x || []; })))).flat();
      c.draftData = await Promise.all((c.drafts || []).map(async d => {
        const [full, picks] = await Promise.all([get('draft/' + d.draft_id).then(x => { tick(); return x; }), get(`draft/${d.draft_id}/picks`).then(x => { tick(); return x; })]);
        return {d, full, picks: picks || []};
      }));
    }));
    progress('Crunching numbers…', 0.93);
    await new Promise(r => setTimeout(r, 0));
    const D = compute({S, state, Lg, F, isDD, users: users || [], rosters: rosters || [], traded: traded || [], drafts: drafts || [], mups, chain});
    progress('Done', 1);
    return D;
  }

  function compute(ctx) {
    const {S, state, Lg, F, isDD} = ctx;
    seed = 7;
    const V = S.values, PL = S.players;
    const W = V.weights, sfi = F.sf ? 0 : 3, ddMax = V.dd_max[F.sf ? 0 : 1] || 1;
    const teMult = 1 + 0.2 * F.tep;
    const posMult = pos => {
      let m = 1;
      if (pos === 'TE') m *= teMult;
      if (F.ppr < 1) { const g = 1 - F.ppr; if (pos === 'RB') m *= 1 + 0.06 * g; if (pos === 'WR' || pos === 'TE') m *= 1 - 0.04 * g; }
      if (pos === 'QB' && F.passTd >= 6) m *= 1.04;
      return m;
    };
    const blendRow = (row, pos) => {
      const parts = {};
      if (row[sfi]) parts.ktc = row[sfi];
      if (row[sfi + 1]) parts.dd = row[sfi + 1] * 9999 / ddMax;
      if (row[sfi + 2] && W.flock) parts.flock = row[sfi + 2];
      const ks = Object.keys(parts).filter(k => W[k]);
      if (!ks.length) return [0, parts];
      let v = ks.reduce((s, k) => s + parts[k] * W[k], 0) / ks.reduce((s, k) => s + W[k], 0);
      if (pos) v *= posMult(pos);
      for (const k in parts) parts[k] = Math.round(parts[k]);
      return [Math.round(v), parts];
    };
    // players
    const players = {};
    for (const [sid, row] of Object.entries(V.players)) {
      const p = PL[sid]; if (!p) continue;
      const [val, parts] = blendRow(row, p[1]);
      if (val <= 0) continue;
      players[sid] = {id: sid, name: p[0], pos: p[1], team: p[2] || 'FA', age: p[3], exp: p[4], inj: p[5], value: val, src: parts};
    }
    // superflex reference values for the prospect board position adjustment
    const sfRef = {}; for (const [sid, row] of Object.entries(V.players)) { const p = PL[sid]; if (!p) continue; const r = row[0] || row[1] ? ((row[0] || 0) + (row[1] ? row[1] * 9999 / (V.dd_max[0] || 1) : 0)) / ((row[0] ? 1 : 0) + (row[1] ? 1 : 0)) : 0; if (r) (sfRef[p[1]] = sfRef[p[1]] || []).push(r * (p[1] === 'TE' ? 1.1 : 1)); }
    const top24 = a => mean((a || []).sort((x, y) => y - x).slice(0, 24));
    const posRatio = {}; SKILL.forEach(pos => { posRatio[pos] = top24(Object.values(players).filter(p => p.pos === pos).map(p => p.value)) / (top24(sfRef[pos]) || 1); });

    // draft seasons
    const curSeason = +Lg.season;
    const curDraft = ctx.drafts.find(d => d.season === Lg.season && d.status !== 'complete');
    const D0 = curDraft ? curSeason : curSeason + 1;
    const SEASONS = [D0, D0 + 1, D0 + 2].map(String);
    const ROUNDS = Array.from({length: F.rounds}, (_, i) => i + 1);
    const nextDraft = ctx.drafts.find(d => d.season === SEASONS[0]);
    const snake = nextDraft ? nextDraft.type === 'snake' : false;
    // pick tiers
    const pkSeasons = [...new Set(Object.keys(V.picks).map(k => +k.split('-')[0]))].sort();
    function tierVal(season, rnd, tier) {
      const s = +season, avail = pkSeasons.filter(x => x >= curSeason + (curDraft ? 0 : 1));
      const use = avail.includes(s) ? s : (avail.filter(x => x <= s).pop() || avail[0] || pkSeasons[pkSeasons.length - 1]);
      const r = Math.min(rnd, 4);
      const row = V.picks[`${use}-${r}-${tier}`] || V.picks[`${use}-${r}-Mid`];
      let v = row ? blendRow(row)[0] : 0;
      if (rnd > 4) v *= Math.pow(0.55, rnd - 4);
      return v;
    }
    const T = F.teams;
    const tierOf = slot => slot <= T / 3 ? 'Early' : slot <= 2 * T / 3 ? 'Mid' : 'Late';
    function slotValue(season, rnd, slot) {
      const xs = [T * 0.208, T * 0.542, T * 0.875], ys = ['Early', 'Mid', 'Late'].map(t => tierVal(season, rnd, t));
      const [i0, i1] = slot <= xs[1] ? [0, 1] : [1, 2];
      return Math.max(0, ys[i0] + (ys[i1] - ys[i0]) * (slot - xs[i0]) / (xs[i1] - xs[i0]));
    }

    // teams
    const U = Object.fromEntries(ctx.users.map(u => [u.user_id, u]));
    const teams = {};
    for (const r of ctx.rosters) {
      const u = U[r.owner_id] || {}, s = r.settings || {};
      const allp = [...new Set([...(r.players || []), ...(r.taxi || []), ...(r.reserve || [])])];
      teams[r.roster_id] = {rid: r.roster_id, owner_id: r.owner_id, co_owners: r.co_owners || [], owner: u.display_name || 'Open team',
        name: ((u.metadata && u.metadata.team_name) || u.display_name || `Team ${r.roster_id}`).trim(), div: s.division || 1,
        w: s.wins || 0, l: s.losses || 0, t: s.ties || 0, pf: pts(s), pa: (s.fpts_against || 0) + (s.fpts_against_decimal || 0) / 100,
        maxpf: (s.ppts || 0) + (s.ppts_decimal || 0) / 100, players: allp, taxi: r.taxi || [], ir: r.reserve || []};
    }
    const RIDS = Object.keys(teams).map(Number);
    // pick ownership
    const own = {};
    SEASONS.forEach(s => ROUNDS.forEach(rd => RIDS.forEach(rid => own[`${s}|${rd}|${rid}`] = rid)));
    for (const t of ctx.traded) { const k = `${t.season}|${t.round}|${t.roster_id}`; if (k in own) own[k] = t.owner_id; }
    // lineup from the league's starting slots
    const SLOTSETS = {QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'], WRRB_FLEX: ['RB', 'WR'], REC_FLEX: ['WR', 'TE'], FLEX: ['RB', 'WR', 'TE'], SUPER_FLEX: ['QB', 'RB', 'WR', 'TE']};
    const ORDER = ['QB', 'RB', 'WR', 'TE', 'WRRB_FLEX', 'REC_FLEX', 'FLEX', 'SUPER_FLEX'];
    const slotPlan = ORDER.map(s => [SLOTSETS[s], F.slots.filter(x => x === s).length]).filter(x => x[1]);
    function lineup(ids) {
      const ps = ids.map(i => players[i]).filter(Boolean).sort((a, b) => b.value - a.value);
      const used = new Set(), start = [];
      for (const [set, n0] of slotPlan) { let n = n0; for (const p of ps) { if (!n) break; if (!used.has(p.id) && set.includes(p.pos)) { used.add(p.id); start.push(p.id); n--; } } }
      return start;
    }
    for (const t of Object.values(teams)) {
      t.starters = lineup(t.players.filter(i => !t.ir.includes(i)));
      t.starter_value = t.starters.reduce((s, i) => s + players[i].value, 0);
      t.player_value = t.players.reduce((s, i) => s + (players[i] ? players[i].value : 0), 0);
      t.bench_value = t.player_value - t.starter_value;
      t.pos_value = Object.fromEntries(SKILL.map(pos => [pos, t.players.reduce((s, i) => s + (players[i] && players[i].pos === pos ? players[i].value : 0), 0)]));
    }

    // ---------- season simulation ----------
    const REG = F.playoffStart - 1;
    const sameSeason = Lg.season === state.season;
    let curWeek;
    if (!sameSeason) curWeek = +Lg.season > +state.season ? 1 : REG + 1;
    else if (state.season_type === 'pre' || state.season_type === 'off') curWeek = state.season_type === 'pre' ? 1 : REG + 1;
    else curWeek = Math.max(1, state.week || 1);
    const mups = ctx.mups;
    const completed = []; for (let w = 1; w <= Math.min(REG, curWeek - 1); w++) { const m = mups[w - 1]; if (m && m.length && m.some(x => x.points)) completed.push(w); }
    const scores = Object.fromEntries(RIDS.map(r => [r, []]));
    completed.forEach(w => mups[w - 1].forEach(m => { if (scores[m.roster_id]) scores[m.roster_id].push(m.points || 0); }));
    const allsc = Object.values(scores).flat();
    const n = completed.length;
    let lgMean = mean(allsc), lgSd = pstdev(allsc);
    const svs = RIDS.map(r => teams[r].starter_value), mx = mean(svs), sdx = pstdev(svs) || 1;
    if (n >= 2) {
      const ys = RIDS.map(r => mean(scores[r])), my = mean(ys);
      const slope = svs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / (svs.reduce((s, x) => s + (x - mx) ** 2, 0) || 1);
      RIDS.forEach(r => { const t = teams[r], ppg = mean(scores[r]); t.ppg = Math.round(ppg * 10) / 10;
        const shrunk = lgMean + (ppg - lgMean) * n / (n + 6), fromval = my + slope * (t.starter_value - mx);
        t.rating = Math.round((0.5 * shrunk + 0.5 * fromval) * 10) / 10; });
    } else {
      lgMean = lgMean || 115; lgSd = lgSd || 25;
      RIDS.forEach(r => { const t = teams[r]; t.ppg = n ? Math.round(mean(scores[r]) * 10) / 10 : null; t.rating = Math.round((lgMean + (t.starter_value - mx) / sdx * 10) * 10) / 10; });
    }
    RIDS.forEach(r => { const t = teams[r]; t.maxpf_ratio = t.pf ? t.maxpf / t.pf : 1.15; });
    const WEEK_SD = Math.max(18, (lgSd || 25) * 0.85);
    // schedule
    const sched = {};
    for (let w = 1; w <= REG; w++) {
      const m = mups[w - 1];
      if (m && m.length && m.every(x => x.matchup_id != null)) {
        const g = {}; m.forEach(x => (g[x.matchup_id] = g[x.matchup_id] || []).push(x));
        sched[w] = Object.values(g).filter(v => v.length === 2).map(([a, b]) => [a.roster_id, b.roster_id, a.points || 0, b.points || 0]);
      } else sched[w] = null;   // unknown: random pairings
    }
    const SIMS = 10000;
    const P_N = Math.min(F.playoffTeams, RIDS.length);
    const res = Object.fromEntries(RIDS.map(r => [r, {wins: 0, playoff: 0, bye: 0, champ: 0, final: 0, best_record: 0, most_pf: 0, lottery: 0, place: Array(T + 1).fill(0), slot: Array(T + 1).fill(0)}]));
    const sizeUp = n => { let s = 1; while (s < n) s *= 2; return s; };
    const seedOrder = s => { let o = [1]; while (o.length < s) { const m = o.length * 2 + 1; o = o.flatMap(x => [x, m - x]); } return o; };
    const BYES = sizeUp(P_N) - P_N;
    const draftDone = Lg.status === 'complete';
    for (let it = 0; it < SIMS; it++) {
      const Wn = {}, PF = {}; RIDS.forEach(r => { Wn[r] = teams[r].w; PF[r] = teams[r].pf; });
      for (let w = curWeek; w <= REG; w++) {
        let games = sched[w];
        if (!games) { const sh = RIDS.slice().sort(() => rand() - 0.5); games = []; for (let i = 0; i + 1 < sh.length; i += 2) games.push([sh[i], sh[i + 1], 0, 0]); }
        for (const [a, b, pa, pb] of games) {
          let sa, sb;
          if (w === curWeek && pa && pb) { sa = pa + gauss(0, 8); sb = pb + gauss(0, 8); }
          else { sa = gauss(teams[a].rating, WEEK_SD); sb = gauss(teams[b].rating, WEEK_SD); }
          PF[a] += sa; PF[b] += sb; if (sa > sb) Wn[a]++; else Wn[b]++;
        }
      }
      const better = (x, y) => (Wn[y] - Wn[x]) || (PF[y] - PF[x]);
      const order = RIDS.slice().sort(better);
      order.forEach((r, i) => { res[r].place[i + 1]++; res[r].wins += Wn[r]; });
      res[order[0]].best_record++;
      res[RIDS.reduce((a, b) => PF[b] > PF[a] ? b : a)].most_pf++;
      const g = (a, b) => { const sa = gauss(teams[a].rating, WEEK_SD), sb = gauss(teams[b].rating, WEEK_SD); return sa > sb ? [a, b, sa, sb] : [b, a, sb, sa]; };
      const slot = {};
      if (isDD) {
        // Dynasty Degenerates bylaws: 3 per division, division winners get byes, lottery for the bottom four by max PF
        const divs = {}; order.forEach(r => (divs[teams[r].div] = divs[teams[r].div] || []).push(r));
        const winners = Object.values(divs).map(v => v[0]).sort(better);
        const rest = Object.values(divs).flatMap(v => v.slice(1, 3)).sort(better);
        const seeds = winners.concat(rest);
        seeds.forEach((r, i) => { res[r].playoff++; if (i < 2) res[r].bye++; });
        const s = Object.fromEntries(seeds.map((r, i) => [i + 1, r]));
        const [w36, l36, , ls36] = g(s[3], s[6]), [w45, l45, , ls45] = g(s[4], s[5]);
        const rem = [w36, w45].sort((a, b) => seeds.indexOf(a) - seeds.indexOf(b));
        const [f1, sl1] = g(s[1], rem[1]), [f2, sl2] = g(s[2], rem[0]);
        const [champ, runner] = g(f1, f2), [third, fourth] = g(sl1, sl2);
        res[champ].champ++; res[champ].final++; res[runner].final++;
        Object.assign(slot, {[champ]: 12, [runner]: 11, [third]: 10, [fourth]: 9});
        if (ls36 < ls45) { slot[l36] = 7; slot[l45] = 8; } else { slot[l45] = 7; slot[l36] = 8; }
        const non = RIDS.filter(r => !seeds.includes(r)).sort((a, b) => (teams[a].maxpf + (PF[a] - teams[a].pf) * teams[a].maxpf_ratio) - (teams[b].maxpf + (PF[b] - teams[b].pf) * teams[b].maxpf_ratio));
        const lot = non.slice(0, 4), pool = lot.map((r, i) => [r, [4, 3, 2, 1][i]]); let pk = 1;
        lot.forEach(r => res[r].lottery++);
        while (pool.length) { let x = rand() * pool.reduce((s, q) => s + q[1], 0); for (let j = 0; j < pool.length; j++) { x -= pool[j][1]; if (x <= 0) { slot[pool[j][0]] = pk++; pool.splice(j, 1); break; } } }
        non.slice(4).forEach((r, i) => slot[r] = 5 + i);
      } else {
        // generic Sleeper-style: division winners seeded first, fixed bracket, top seeds get byes; draft order = reverse standings
        let seeds;
        if (F.divisions > 1) {
          const divs = {}; order.forEach(r => (divs[teams[r].div] = divs[teams[r].div] || []).push(r));
          const winners = Object.values(divs).map(v => v[0]).sort(better).slice(0, P_N);
          seeds = winners.concat(order.filter(r => !winners.includes(r))).slice(0, P_N);
          seeds = winners.concat(seeds.filter(r => !winners.includes(r)).sort(better)).slice(0, P_N);
        } else seeds = order.slice(0, P_N);
        seeds.forEach((r, i) => { res[r].playoff++; if (i < BYES) res[r].bye++; });
        const elim = {};
        let round = 1, bracket = seedOrder(sizeUp(P_N)).map(sd => sd <= P_N ? seeds[sd - 1] : null);
        let semis = [];
        while (bracket.length > 1) {
          const next = [];
          for (let i = 0; i < bracket.length; i += 2) {
            const a = bracket[i], b = bracket[i + 1];
            if (a == null || b == null) { next.push(a ?? b); continue; }
            const [wn, ls] = g(a, b); next.push(wn); elim[ls] = round; if (bracket.length === 4) semis.push(ls);
          }
          bracket = next; round++;
        }
        const champ = bracket[0]; elim[champ] = round + 1;
        const runner = Object.keys(elim).map(Number).find(r => elim[r] === round - 1 && r !== champ);
        res[champ].champ++; res[champ].final++; if (runner != null) res[runner].final++;
        if (semis.length === 2) { const [w3] = g(semis[0], semis[1]); elim[w3] += 0.5; }
        const non = RIDS.filter(r => !seeds.includes(r)).sort((a, b) => -better(a, b));   // worst record first
        non.forEach((r, i) => slot[r] = i + 1);
        const po = seeds.slice().sort((a, b) => (elim[a] - elim[b]) || -better(a, b));
        po.forEach((r, i) => slot[r] = non.length + i + 1);
      }
      for (const r in slot) res[r].slot[slot[r]]++;
    }
    const pctv = x => Math.round(1000 * x / SIMS) / 10;
    RIDS.forEach(rid => { const r = res[rid];
      teams[rid].proj = {wins: Math.round(10 * r.wins / SIMS) / 10, playoff: pctv(r.playoff), bye: pctv(r.bye), final: pctv(r.final), champ: pctv(r.champ),
        best_record: pctv(r.best_record), most_pf: pctv(r.most_pf), place: r.place.slice(1).map(pctv), slot: r.slot.slice(1).map(pctv), lottery: pctv(r.lottery),
        avg_place: r.place.reduce((s, x, i) => s + i * x, 0) / SIMS, avg_slot: r.slot.reduce((s, x, i) => s + i * x, 0) / SIMS}; });
    // when the draft order for the next draft is already set in Sleeper, use it
    const setOrder = nextDraft && nextDraft.draft_order && nextDraft.status !== 'complete' ? nextDraft.draft_order : null;
    if (setOrder && Object.keys(setOrder).length === T) {
      const byUser = {}; Object.values(teams).forEach(t => { if (t.owner_id) byUser[t.owner_id] = t.rid; });
      for (const [uid, sl] of Object.entries(setOrder)) { const rid = byUser[uid]; if (rid) { const p = teams[rid].proj; p.slot = Array(T).fill(0); p.slot[sl - 1] = 100; p.avg_slot = sl; p.lottery = 0; } }
    }

    // ---------- picks ----------
    const RN = r => ORD(r);
    const picks = [];
    for (const [k, owner] of Object.entries(own)) {
      const [season, rs, origS] = k.split('|'), rnd = +rs, orig = +origS;
      let val, avg = null, label;
      if (season === SEASONS[0]) {
        const dist = teams[orig].proj.slot;
        val = dist.reduce((s, c, i) => s + slotValue(season, rnd, i + 1) * c, 0) / 100;
        avg = teams[orig].proj.avg_slot;
        label = `${season} ${RN(rnd)} (${tierOf(Math.round(avg))}, ~${rnd}.${pad2(Math.round(avg))})`;
      } else { val = tierVal(season, rnd, 'Mid'); label = `${season} ${RN(rnd)}`; }
      picks.push({id: `${season}-${rnd}-${orig}`, season, round: rnd, orig, owner, value: Math.round(val), avg_slot: avg, label});
    }
    Object.values(teams).forEach(t => { t.pick_value = picks.filter(p => p.owner === t.rid).reduce((s, p) => s + p.value, 0); t.total_value = t.player_value + t.pick_value; });
    const generic = []; SEASONS.forEach(s => ROUNDS.forEach(r => ['Early', 'Mid', 'Late'].forEach(tr => generic.push({id: `g-${s}-${r}-${tr}`, label: `${s} ${tr} ${RN(r)}`, value: Math.round(tierVal(s, r, tr))}))));
    const rostered = {}; Object.values(teams).forEach(t => t.players.forEach(i => rostered[i] = t.rid));

    // ---------- history: trades and drafts across the league chain ----------
    const NAMES = id => PL[id] ? [PL[id][0], PL[id][1]] : ['Unknown player', '?'];
    const future = Object.fromEntries(picks.map(p => [`${p.season}|${p.round}|${p.orig}`, p]));
    const drafted = {};
    const startupOf = dd => { const rounds = (dd.full && dd.full.settings && dd.full.settings.rounds) || 0; return rounds > 6 || dd.picks.length > T * 6; };
    ctx.chain.forEach(c => c.draftData.forEach(dd => {
      if (!dd.full || startupOf(dd)) return;
      const s2r = dd.full.slot_to_roster_id || {};
      dd.picks.forEach(p => { const orig = s2r[p.draft_slot]; if (orig != null) drafted[`${dd.d.season}|${p.round}|${orig}`] = [p.player_id, `${p.round}.${pad2(p.draft_slot)}`]; });
    }));
    const NORM = 1.4, adj = vals => { vals = vals.filter(v => v > 0); return vals.length ? Math.pow(vals.reduce((s, v) => s + Math.pow(v, NORM), 0), 1 / NORM) : 0; };
    const FAAB = 15;
    const playerAsset = pid => { const p = players[pid], nm = NAMES(pid); return {kind: 'player', id: pid, name: nm[0], pos: SKILL.includes(nm[1]) ? nm[1] : (nm[1] || '?'), value: p ? p.value : 0, note: p ? null : 'No longer valued'}; };
    const pickAsset = (season, rnd, orig) => {
      const k = `${season}|${rnd}|${orig}`;
      if (future[k]) return {kind: 'pick', name: future[k].label, pos: 'PK', value: future[k].value, note: 'Not yet used', orig};
      if (drafted[k]) { const [pid, sl] = drafted[k], a = playerAsset(pid); return {kind: 'pick', name: `${season} ${sl}`, pos: 'PK', value: a.value, note: `Became ${a.name}`, became: a.name, became_pos: a.pos, orig}; }
      return {kind: 'pick', name: `${season} ${RN(rnd)}`, pos: 'PK', value: 0, note: 'Pick not used', orig};
    };
    const sig = (r, flip) => {
      const a = Object.entries(r.adds || {}).map(([k, v]) => flip ? [k, (r.drops || {})[k], v] : [k, v, (r.drops || {})[k]]).map(String).sort().join(';');
      const p = (r.draft_picks || []).map(x => flip ? [x.season, x.round, x.roster_id, x.owner_id, x.previous_owner_id] : [x.season, x.round, x.roster_id, x.previous_owner_id, x.owner_id]).map(String).sort().join(';');
      const f = (r.waiver_budget || []).map(w => flip ? [w.receiver, w.sender, w.amount] : [w.sender, w.receiver, w.amount]).map(String).sort().join(';');
      return a + '|' + p + '|' + f;
    };
    const ALLTX = ctx.chain.flatMap(c => c.tx.filter(t => t.status === 'complete'));
    const REVERSED = {};
    const bySig = {}; ALLTX.forEach(t => (bySig[sig(t, true)] = bySig[sig(t, true)] || []).push(t));
    ALLTX.forEach(a => { const s = sig(a); if (s === '||') return; (bySig[s] || []).forEach(b => { if (a.transaction_id !== b.transaction_id && a.created <= b.created) { REVERSED[a.transaction_id] = b.transaction_id; REVERSED[b.transaction_id] = a.transaction_id; } }); });
    const trades = [];
    ctx.chain.forEach(c => {
      const UN = Object.fromEntries((c.users || []).map(u => [u.user_id, [((u.metadata && u.metadata.team_name) || u.display_name || '').trim(), u.display_name]]));
      const owner = Object.fromEntries((c.rosters || []).map(r => [r.roster_id, r.owner_id]));
      c.tx.forEach(t => {
        if (t.status !== 'complete') return;
        const sides = Object.fromEntries((t.roster_ids || []).map(rid => [rid, {rid, got: [], gave: []}]));
        for (const [pid, to] of Object.entries(t.adds || {})) { const frm = (t.drops || {})[pid], a = playerAsset(pid); if (sides[to]) sides[to].got.push(a); if (sides[frm]) sides[frm].gave.push(a); }
        for (const dp of t.draft_picks || []) { const a = pickAsset(dp.season, dp.round, dp.roster_id); if (sides[dp.owner_id]) sides[dp.owner_id].got.push(a); if (sides[dp.previous_owner_id]) sides[dp.previous_owner_id].gave.push(a); }
        const faab = (t.waiver_budget || []).map(w => ({frm: w.sender, to: w.receiver, amount: w.amount}));
        faab.forEach(f => { const fa = {kind: 'faab', name: `$${f.amount} FAAB`, pos: '$', value: f.amount * FAAB, note: null}; if (sides[f.to]) sides[f.to].got.push(fa); if (sides[f.frm]) sides[f.frm].gave.push(fa); });
        Object.values(sides).forEach(s => {
          const oid = owner[s.rid], nm = UN[oid] || [`Team ${s.rid}`, '?'];
          Object.assign(s, {team: nm[0] || nm[1], manager: nm[1], owner_id: oid});
          s.got_adj = Math.round(adj(s.got.map(a => a.value))); s.gave_adj = Math.round(adj(s.gave.map(a => a.value)));
          s.net = s.got_adj - s.gave_adj;
        });
        const ss = Object.values(sides).sort((a, b) => b.net - a.net);
        if (!ss.length) return;
        const top = Math.max(ss[0].got_adj, ss[0].gave_adj, 1), margin = ss[0].net / top * 100, total = ss.reduce((s, x) => s + x.got_adj, 0);
        let verdict = total === 0 ? 'wash' : (Math.abs(margin) < 5 || ss[0].net < 250) ? 'even' : (margin < 15 || ss[0].net < 1000) ? 'edge' : 'win';
        const empty = ss.filter(s => !s.got.length);
        if (REVERSED[t.transaction_id]) verdict = 'reversed';
        else if (empty.length && empty.length < ss.length && ss.length === 2) verdict = 'one-sided';
        const dt = new Date(t.created);
        trades.push({id: t.transaction_id, season: c.L.season, week: t.leg, created: t.created, date: dt.toISOString().slice(0, 10), sides: ss, faab,
          winner: ['edge', 'win'].includes(verdict) ? ss[0].rid : null, winner_owner: ['edge', 'win'].includes(verdict) ? ss[0].owner_id : null,
          margin: Math.round(margin * 10) / 10, gap: ss[0].net, verdict, size: total});
      });
    });
    trades.sort((a, b) => b.created - a.created);
    const curName = Object.fromEntries(ctx.users.map(u => [u.user_id, ((u.metadata && u.metadata.team_name) || u.display_name || '').trim()]));
    const curOwners = new Set(ctx.rosters.flatMap(r => [r.owner_id, ...(r.co_owners || [])]));
    const board = {};
    trades.forEach(tr => { if (['reversed', 'one-sided', 'wash'].includes(tr.verdict)) return;
      tr.sides.forEach(s => { if (!s.owner_id) return;
        const b = board[s.owner_id] = board[s.owner_id] || {owner_id: s.owner_id, manager: s.manager, name: curName[s.owner_id] || s.manager, trades: 0, wins: 0, losses: 0, even: 0, net: 0, best: null, worst: null};
        b.trades++; b.net += s.net;
        if (tr.verdict === 'even') b.even++; else if (tr.winner_owner === s.owner_id) b.wins++; else b.losses++;
        if (!b.best || s.net > b.best[1]) b.best = [tr.id, s.net]; if (!b.worst || s.net < b.worst[1]) b.worst = [tr.id, s.net]; }); });
    Object.values(board).forEach(b => b.active = curOwners.has(b.owner_id));
    const tradeBoard = Object.values(board).sort((a, b) => b.net - a.net);

    // rookie draft grades
    const grade = d => d >= 8 ? 'steal' : d >= 3 ? 'good' : d > -3 ? 'fair' : d > -8 ? 'reach' : 'bust';
    const dh = [];
    ctx.chain.forEach(c => {
      const UN = Object.fromEntries((c.users || []).map(u => [u.user_id, [((u.metadata && u.metadata.team_name) || u.display_name || '').trim(), u.display_name]]));
      const owner = Object.fromEntries((c.rosters || []).map(r => [r.roster_id, r.owner_id]));
      c.draftData.forEach(dd => {
        if (!dd.full || dd.full.status !== 'complete' || startupOf(dd) || !dd.picks.length) return;
        const pk = dd.picks.map(p => { const nm = NAMES(p.player_id), oid = owner[p.roster_id], tn = UN[oid] || [`Team ${p.roster_id}`, '?'];
          return {no: p.pick_no, round: p.round, slot: p.draft_slot, label: `${p.round}.${pad2(p.draft_slot)}`, rid: p.roster_id, owner_id: oid, team: tn[0] || tn[1], manager: tn[1],
            pid: p.player_id, name: nm[0], pos: nm[1], nfl: (players[p.player_id] || {}).team || (PL[p.player_id] || [])[2], value: (players[p.player_id] || {}).value || 0}; });
        pk.slice().sort((a, b) => (b.value - a.value) || (a.no - b.no)).forEach((p, i) => p.rerank = i + 1);
        pk.forEach(p => { p.delta = p.no - p.rerank; p.grade = grade(p.delta);
          const later = pk.filter(q => q.no > p.no), best = later.reduce((a, q) => !a || q.value > a.value ? q : a, null);
          if ((p.grade === 'reach' || p.grade === 'bust') && best && best.value > p.value) p.alt = {name: best.name, pos: best.pos, label: best.label, value: best.value}; });
        const mgr = {};
        pk.forEach(p => { const m = mgr[p.owner_id] = mgr[p.owner_id] || {owner_id: p.owner_id, team: p.team, manager: p.manager, picks: 0, value: 0, delta: 0, steals: 0, busts: 0};
          m.picks++; m.value += p.value; m.delta += p.delta; m.steals += p.grade === 'steal'; m.busts += p.grade === 'bust'; });
        dh.push({season: dd.d.season, picks: pk, managers: Object.values(mgr).sort((a, b) => b.delta - a.delta)});
      });
    });
    dh.sort((a, b) => b.season.localeCompare(a.season));
    const lb = {};
    dh.forEach(d => d.managers.forEach(m => { const x = lb[m.owner_id] = lb[m.owner_id] || {owner_id: m.owner_id, manager: m.manager, team: m.team, drafts: 0, picks: 0, delta: 0, steals: 0, busts: 0, value: 0};
      x.drafts++; x.picks += m.picks; x.delta += m.delta; x.steals += m.steals; x.busts += m.busts; x.value += m.value; }));
    Object.values(lb).forEach(x => { x.active = curOwners.has(x.owner_id); if (curName[x.owner_id]) x.team = curName[x.owner_id]; x.avg_delta = x.picks ? Math.round(10 * x.delta / x.picks) / 10 : 0; });

    // ---------- prospects re-weighted for this league's format ----------
    const PRO = S.prospects || {};
    let board2 = PRO.prospect_board || [];
    if (board2.length) {
      const ev = r => (r.ev || 0) * (posRatio[r.pos] || 1);
      const n2 = board2.length;
      const evRank = {}; board2.slice().sort((a, b) => ev(b) - ev(a)).forEach((r, i) => evRank[r.name] = i + 1);
      board2 = board2.map(r => Object.assign({}, r, {ev_league: Math.round(ev(r)), model_rank: evRank[r.name], _big: 0.5 * (r.consensus - 1) / (n2 - 1) + 0.5 * (evRank[r.name] - 1) / (n2 - 1)}));
      board2.slice().sort((a, b) => a._big - b._big || a.consensus - b.consensus).forEach((r, i) => r.big_rank = i + 1);
    }
    const prospects = (PRO.prospects || []).map(x => Object.assign({}, x, {score: x.pos === 'QB' && !F.sf ? x.score * 1.5 : x.score}));

    const desc = describe(Lg, F);
    return {
      updated: V.updated, week: Math.min(curWeek, REG + 1), completed_weeks: completed,
      league: {name: Lg.name, id: Lg.league_id, season: Lg.season, avatar: Lg.avatar, status: Lg.status},
      L: {teams: T, rounds: F.rounds, seasons: SEASONS, draftSeason: SEASONS[0], sf: F.sf, ppr: F.ppr, tep: F.tep, isDD, mm: isDD, snake,
          playoffTeams: P_N, byes: isDD ? 2 : BYES, divisions: F.divisions, regWeeks: REG, playoffStart: F.playoffStart, desc, type: F.type,
          orderSet: !!setOrder, deadline: F.deadline},
      sources: {ktc: true, dd: true, flock: !!W.flock}, weights: W, te_premium: teMult, sims: SIMS, rating_sd: Math.round(WEEK_SD * 10) / 10,
      players, teams: Object.values(teams), picks, generic_picks: generic, rostered,
      owner_of: Object.fromEntries(Object.values(teams).map(t => [String(t.rid), t.owner_id])),
      trades, trade_board: tradeBoard, faab_per_dollar: FAAB,
      draft_history: {drafts: dh, leaders: Object.values(lb).sort((a, b) => b.avg_delta - a.avg_delta)},
      prospects, prospect_sources: PRO.prospect_sources || [], prospects_updated: PRO.prospects_updated, prospect_board: board2, pm_meta: PRO.pm_meta,
      pos_ratio: posRatio, lineup,
    };
  }

  return {load, loadStatic, findUser, userLeagues, leagueSummary, get, DD_NAME};
})();
