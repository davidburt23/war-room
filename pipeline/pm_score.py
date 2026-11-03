"""Score the 2027 prospect class with the trained models. Run after prospects.py (needs S['prospects']).
Needs college seasons parquet (pm_college) and data/prospect_model.json (pm_train).
Writes S['prospect_board'] and S['pm_meta'] into data/site.json.
"""
import json, math, os, re
import numpy as np, pandas as pd
import pm_features as F
from pm_college import norm

CFB_SEASONS = os.environ.get('CFB_SEASONS', '/tmp/claude-0/cfb_seasons.parquet')
M = json.load(open('data/prospect_model.json'))
S = json.load(open('data/site.json'))
CS = pd.read_parquet(CFB_SEASONS)
try:
    _wk = pd.read_parquet(os.path.join(os.environ.get('CFB_DIR', '/tmp/claude-0/cfb'), 'adv_receiving_2026.parquet'))['week'].max()
except Exception:
    _wk = 0
REC = pd.read_parquet(os.environ.get('RECRUITS', '/tmp/claude-0/recruits_all.parquet'))
ROS26 = pd.read_parquet(os.environ.get('ROSTER26', '/tmp/claude-0/cfb/cfb_rosters_2026.parquet'), columns=['athlete_id', 'experience_display_value', 'full_name'])
ROS26['athlete_id'] = pd.to_numeric(ROS26.athlete_id, errors='coerce')
AGE_CLS = 18.66      # median age on Sept 1 of high-school class year (calibrated on 875 drafted players, sd 0.51)
CLASS_AGE = {'Freshman': 18.7, 'Sophomore': 19.7, 'Junior': 20.7, 'Senior': 21.7}   # floor: typical age on Sept 1, 2026
def est_birth(name, school, aid, cs):
    """Best birthdate estimate and the method used."""
    keys = ALIAS.get(norm(name), [norm(name)])
    r = REC[REC.key.isin(keys) & REC.cls.between(2019, 2026)].sort_values('stars', ascending=False)
    cands = []
    if len(r): cands.append(('recruiting class ' + str(int(r.cls.iloc[0])), pd.Timestamp(f'{int(r.cls.iloc[0])}-09-01') - pd.Timedelta(days=int(AGE_CLS * 365.25))))
    ex = ROS26[ROS26.athlete_id == aid].experience_display_value
    if len(ex) and ex.iloc[0] in CLASS_AGE: cands.append(('2026 class year (' + ex.iloc[0] + ')', pd.Timestamp('2026-09-01') - pd.Timedelta(days=int(CLASS_AGE[ex.iloc[0]] * 365.25))))
    first = int(cs[cs.games > 0].season.min()) if (cs.games > 0).any() else int(cs.season.min())
    cands.append(('first college season ' + str(first), pd.Timestamp(f'{first}-09-01') - pd.Timedelta(days=int(M['age0'] * 365.25))))
    # recruiting class is the most accurate (sd ~0.5 yr); first season is the fallback. Use the class-year floor
    # only when it is clearly older (transfers up from lower levels, long redshirts).
    base = cands[0] if cands[0][0].startswith('recruiting') else min(cands, key=lambda c: c[1])
    floor = [c for c in cands if c[0].startswith('2026 class')]
    if floor and (base[1] - floor[0][1]).days > 180: return floor[0]
    return base
ALIAS = {'hollywood smothers': ['hollywood smothers', 'daylan smothers'], 'deuce alexander': ['caleb alexander', 'deuce alexander'], 'fluff bothwell': ['fluff bothwell', 'kahlil bothwell'],
         'duce robinson': ['duce robinson'], 'trinidad chambliss': ['trinidad chambliss'], 'ryan coleman williams': ['ryan williams', 'ryan coleman williams'],
         'kj duff': ['kj duff', 'k j duff'], 'tj moore': ['tj moore', 't j moore'], 'lj martin': ['lj martin', 'l j martin'], 'cj carr': ['cj carr', 'c j carr'],
         'dj lagway': ['dj lagway', 'd j lagway'], 'dj vonnahme': ['dj vonnahme', 'd j vonnahme'], 'cj baxter': ['cj baxter', 'c j baxter'], 'cj bailey': ['cj bailey', 'c j bailey'],
         'mark fletcher': ['mark fletcher'], 'isaiah sategna': ['isaiah sategna'], 'eugene wilson': ['eugene wilson'], 'eric singleton': ['eric singleton'],
         'nico iamaleava': ['nico iamaleava'], 'raleek brown': ['raleek brown']}
SCHOOL = {'Miami': ['miami'], 'Ole Miss': ['ole miss', 'mississippi'], 'Mississippi': ['ole miss', 'mississippi'], 'Cal': ['california', 'cal'], 'USC': ['usc', 'southern california'],
          'NC State': ['nc state', 'north carolina state'], 'BYU': ['byu', 'brigham young'], 'UCLA': ['ucla'], 'LSU': ['lsu']}

def sigmoid(x): return 1 / (1 + math.exp(-x))
def logit(p): p = min(max(p, 1e-4), 1 - 1e-4); return math.log(p / (1 - p))
def apply_lr(m, feats):
    z = 0.0
    for c, mu, sd, med, w in zip(m['cols'], m['mu'], m['sd'], m['med'], m['coef']):
        v = feats.get(c); v = med if v is None or (isinstance(v, float) and math.isnan(v)) else v
        z += w * (v - mu) / (sd or 1)
    return sigmoid(z + m['b'])

def find(name, pos, school):
    keys = ALIAS.get(norm(name), [norm(name)])
    c = CS[CS['key'].isin(keys) & CS.athlete_id.notna()]
    if c.empty: return None
    want = [w for w in SCHOOL.get(school, [school.lower()])]
    cur = c[c.season >= 2025]
    hit = cur[cur.team_location.fillna('').str.lower().apply(lambda t: any(w == t or w in t for w in want))]
    pick = hit if len(hit) else cur if len(cur) else c
    pick = pick.sort_values(['season', 'games'], ascending=False)
    aid = pick.athlete_id.iloc[0]
    return CS[CS.athlete_id == aid]

def combine_est(pos, f):
    out = {}
    for m, c in M['combine'].get(pos, {}).items():
        z = 0.0
        for col, mu, sd, med, w in zip(c['cols'], c['mu'], c['sd'], c['med'], c['coef']):
            v = f.get(col); v = med if v is None else v
            z += w * (v - mu) / (sd or 1)
        out[m] = round(z + c['b'], 2 if m == 'forty' else 1); out[m + '_sd'] = c['resid']
    return out

# ---- projected draft slot from NFL big boards; fall back to dynasty consensus via fitted curve ----
PR = S['prospects']
# projected NFL pick: weighted mean of the NFL mocks and boards. A player missing from a mock that runs N picks deep
# counts as going just after it, but only if at least one NFL source has him (otherwise use the consensus curve).
SRCW = {s['key']: (s['weight'], s.get('nfl')) for s in S.get('prospect_sources', [])}
DEPTH = {'rw': 32, 'kip': 25, 'fs': 10, 'tk': 64, 'cbs': 32, 'azs': 32, 'fy': 10, 'ndb': 50, 'wf': 64, 'br': 50, 'tsn': 100}
NFLK = [k for k, (w, isn) in SRCW.items() if isn and w] or ['br', 'wf', 'tsn']
nfl = {}
for x in PR:
    have = [k for k in NFLK if x['ranks'].get(k)]
    if not have: continue
    pts = []
    for k in NFLK:
        w = SRCW.get(k, (0.3, True))[0]
        v = x['ranks'].get(k)
        if v: pts.append((v, w))
        elif k in ('rw', 'tk', 'cbs', 'azs') and x['rank'] <= 40: pts.append((DEPTH[k] + 12, w))
    pts.sort(); half = sum(w for _, w in pts) / 2; acc = 0.0
    for v, w in pts:                                  # weighted median: one stale board can't drag a consensus top-5 pick to 13th
        acc += w
        if acc >= half: med = v; break
    nfl[x['name']] = med * x.get('pick_mult', 1.0)
pairs = [(math.log(x['rank']), math.log(nfl[x['name']])) for x in PR if x['name'] in nfl]
a, b = np.polyfit([p[0] for p in pairs], [p[1] for p in pairs], 1)
def proj_pick(x):
    if x['name'] in nfl: return max(1.0, nfl[x['name']] * 1.05)
    return float(min(250, math.exp(b + a * math.log(x['rank'])) * 1.15))

# ---- position value scale from this league's market (what a hit / a miss is worth) ----
P = S['players']; HIT_N = M['hit_n']
vals = {}
for pos, n in HIT_N.items():
    v = sorted([p['value'] for p in P.values() if p['pos'] == pos], reverse=True)
    vals[pos] = dict(hit=float(np.mean(v[:n])), miss=float(np.mean(v[n:n * 3])))

W_DRAFT = {'QB': 0.40, 'RB': 0.65, 'WR': 0.65, 'TE': 0.65}
comps_all = pd.DataFrame(M['comps'])
CMP_COLS = {'WR': ['breakout_age', 'peak_dom', 'rec_ypg', 'wt', 'ht'], 'TE': ['breakout_age', 'peak_dom', 'rec_ypg', 'wt', 'ht'],
            'RB': ['peak_rb_dom', 'peak_rec_sh', 'scr_ypg', 'wt'], 'QB': ['rush_ypg', 'comp', 'ypa']}

def comps(pos, f, pick):
    c = comps_all[comps_all.pos == pos].copy()
    cols = CMP_COLS[pos] + ['lp']
    c['lp'] = np.log(c.pick); f2 = dict(f); f2['lp'] = math.log(pick)
    if pos in ('WR', 'TE'): c['breakout_age'] = c.breakout_age.fillna(23.5); f2['breakout_age'] = f2.get('breakout_age') or 23.5
    c = c.dropna(subset=cols)
    if c.empty: return []
    sd = c[cols].std().replace(0, 1)
    d = sum(((c[k] - (f2.get(k) if f2.get(k) is not None else c[k].median())) / sd[k]) ** 2 for k in cols)
    c['d'] = d
    return [dict(name=r.name, year=int(r.draft_year), pick=int(r.pick), hit=int(r.hit), ppg=round(float(r.best_ppg), 1)) for r in c.nsmallest(3, 'd').itertuples()]

def notes(pos, f, est):
    out = []; BK = M['buckets'].get(pos, {})
    def bucket(col, v):
        for b in BK.get(col, []):
            if b['lo'] <= v < b['hi']: return b
    if pos in ('WR', 'TE'):
        ba = f.get('breakout_age')
        b = bucket('breakout_age', ba if ba is not None else 99)
        if b: out.append(('breakout', f"{'Broke out at ' + format(ba, '.1f') if ba else 'Has not broken out yet'}. Past {pos}s in that range ({b['label']}) hit {round(b['hit']*100)}% of the time (n={b['n']})."))
    if pos == 'WR':
        b = bucket('peak_dom', f.get('peak_dom', 0))
        if b: out.append(('dominator', f"Peak dominator {round(f.get('peak_dom',0)*100)}%. WRs at {b['label']}: {round(b['hit']*100)}% hit rate."))
    if pos == 'RB':
        b = bucket('peak_rec_sh', f.get('peak_rec_sh', 0))
        if b: out.append(('receiving', f"Peak share of team receiving yards: {round(f.get('peak_rec_sh',0)*100)}%. RBs at {b['label']}: {round(b['hit']*100)}% hit rate."))
        b = bucket('peak_rb_dom', f.get('peak_rb_dom', 0))
        if b: out.append(('dominator', f"Peak scrimmage dominator {round(f.get('peak_rb_dom',0)*100)}%. RBs at {b['label']}: {round(b['hit']*100)}% hit rate."))
    if pos == 'QB':
        b = bucket('rush_ypg', f.get('rush_ypg', 0))
        if b: out.append(('rushing', f"{round(f.get('rush_ypg',0))} rush yards per game. QBs at {b['label']}: {round(b['hit']*100)}% hit rate. Rushing is the strongest college signal for fantasy QBs."))
    return out

board = []; missing = []
for x in PR:
    pos = x['pos']; cs = find(x['name'], pos, x['school'])
    pick = proj_pick(x)
    f = {}; birth = None; aid = None; est_age = True; age_src = None
    if cs is not None and len(cs):
        aid = int(cs.athlete_id.iloc[0])
        dob = cs.date_of_birth.dropna() if 'date_of_birth' in cs else pd.Series(dtype=object)
        if len(dob): birth = pd.Timestamp(dob.iloc[0]); est_age = False; age_src = 'ESPN birthdate'
        else: age_src, birth = est_birth(x['name'], x['school'], aid, cs)
        f = F.features(cs, pos, birth, 2027)
    else:
        missing.append(x['name'])
    est = combine_est(pos, f) if f.get('ht') else {}
    feats = dict(f); feats['log_pick'] = math.log(pick)
    if pos in ('WR', 'TE') and feats.get('breakout_age') is None: feats['breakout_age'] = M['model'][pos]['nobo']
    feats['forty_use'] = est.get('forty'); feats['speed_score'] = (f['wt'] * 200 / est['forty'] ** 4) if est.get('forty') and f.get('wt') else None
    mdl = M['model'][pos]
    p_draft = apply_lr(mdl['draft'], feats)
    p_prof = apply_lr(mdl['profile'], feats) if f.get('games') else mdl['base_rate']
    w = W_DRAFT[pos]
    p = sigmoid(w * logit(p_draft) + (1 - w) * logit(p_prof))
    ev = p * vals[pos]['hit'] + (1 - p) * vals[pos]['miss']
    ev *= x.get('p_declare', 1.0)            # chance he's actually in the 2027 class (injury / likely return)
    cur = [s_ for s_ in f.get('seasons', []) if s_['season'] == 2026]
    board.append(dict(name=x['name'], pos=pos, school=x['school'], consensus=x['rank'], consensus_score=x['score'], blurb=x['blurb'], ranks=x['ranks'],
                      espn_id=aid, ht=f.get('ht'), wt=f.get('wt'), age_now=round(F.age_on(birth, 2026) + (pd.Timestamp.today().normalize() - pd.Timestamp('2026-09-01')).days / 365.25, 1) if birth is not None else None,
                      age_draft=round(f['age_draft'], 1) if f.get('age_draft') else None, age_est=est_age, age_src=age_src,
                      breakout_age=round(f['breakout_age'], 1) if f.get('breakout_age') else None, breakout_season=f.get('breakout_season'), breakout_year=f.get('breakout_year'),
                      peak_dom=round(f.get('peak_dom', 0), 3), peak_rb_dom=round(f.get('peak_rb_dom', 0), 3), peak_rec_sh=round(f.get('peak_rec_sh', 0), 3),
                      rec_ypg=round(f.get('rec_ypg', 0), 1), scr_ypg=round(f.get('scr_ypg', 0), 1), ypr=round(f['ypr'], 1) if f.get('ypr') else None, ypc=round(f['ypc'], 1) if f.get('ypc') else None,
                      comp=round(f['comp'], 3) if f.get('comp') else None, ypa=round(f['ypa'], 1) if f.get('ypa') else None, rush_ypg=round(f.get('rush_ypg', 0), 1) if pos == 'QB' else None,
                      td_int=round(f['td_int'], 2) if f.get('td_int') else None,
                      career=dict(g=f.get('games'), rec=f.get('rec'), rec_yds=f.get('rec_yds'), rec_td=f.get('rec_td'), car=f.get('car'), rush_yds=f.get('rush_yds'), rush_td=f.get('rush_td'),
                                  att=f.get('att'), pass_yds=f.get('pass_yds'), pass_td=f.get('pass_td'), ints=f.get('ints')),
                      seasons=f.get('seasons', []), y2026=cur[0] if cur else None,
                      est=est, proj_pick=round(pick), p_draft=round(p_draft, 3), p_profile=round(p_prof, 3), p_hit=round(p, 3), ev=round(ev),
                      comps=comps(pos, feats, pick) if f.get('games') else [], notes=notes(pos, f, est) if f.get('games') else [],
                      status=x.get('status'), status_note=x.get('status_note'), p_declare=x.get('p_declare', 1.0)))

# ---- final big board: half dynasty consensus, half model expected value ----
bd = pd.DataFrame(board)
bd['cons_pct'] = bd.consensus_score.rank(pct=True, ascending=True)        # lower score = better
bd['ev_pct'] = bd.ev.rank(pct=True, ascending=False)
bd['big'] = 0.5 * bd.cons_pct + 0.5 * bd.ev_pct
bd['model_rank'] = bd.ev.rank(ascending=False, method='first').astype(int)
order = bd.sort_values('big').index
for i, k in enumerate(order, 1): board[k]['big_rank'] = i; board[k]['model_rank'] = int(bd.loc[k, 'model_rank'])
board.sort(key=lambda r: r['big_rank'])
S['prospect_board'] = board
S['pm_meta'] = dict(trained_on=M['trained_on'], models={p: dict(n=M['model'][p]['n'], base_rate=M['model'][p]['base_rate'], auc=M['model'][p]['auc'], w_draft=W_DRAFT[p],
                    profile_cols=M['model'][p]['profile']['cols'], profile_coef=M['model'][p]['profile']['coef']) for p in M['model']},
                    buckets=M['buckets'], hit_n=HIT_N, pos_values={k: {kk: round(vv) for kk, vv in v.items()} for k, v in vals.items()}, age0=round(M['age0'], 2),
                    stats_through=f"2026 Week {int(_wk)} (ESPN play-by-play)", missing=missing, pick_curve=[round(a, 3), round(b, 3)])
json.dump(S, open('data/site.json', 'w'))
print('missing college match:', missing)
for r in board[:40]:
    print(f"{r['big_rank']:>2} cons {r['consensus']:>2} model {r['model_rank']:>2} {r['name'][:22]:22} {r['pos']} {r['ht']} {r['wt']} age {r['age_now']} BO {r['breakout_age']} dom {r['peak_dom']} pick {r['proj_pick']:>3} pD {r['p_draft']:.2f} pP {r['p_profile']:.2f} p {r['p_hit']:.2f} 40 {r['est'].get('forty')}")
