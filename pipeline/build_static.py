"""Static data for the multi-league site (GitHub Pages).
  python3 build_static.py values   -> web/data/values.json + web/data/players.json, and data/site.json['players'] for the prospect scripts
  python3 build_static.py export   -> web/data/prospects.json (run after prospects.py and pm_daily.py)
Inputs in data/: players_all.json (slim Sleeper players), ktc.json, dd.json, ddmap.json, flock.json, flock1.json (optional)
Flock is included only when FLOCK_PUBLIC = True (it's the owner's paid data and the site is public).
"""
import json, re, os, sys, datetime
FLOCK_PUBLIC = os.environ.get('FLOCK_PUBLIC', '0') == '1'
OUT = os.environ.get('WEB_DIR', '/root/web') + '/data'
os.makedirs(OUT, exist_ok=True)
L = lambda k: json.load(open(f'data/{k}.json'))

def norm(n):
    n = n.lower().replace('.', '').replace("'", '').replace('-', ' ')
    n = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b', '', n)
    return re.sub(r'\s+', ' ', n).strip()

def values():
    pl = L('players_all'); ktc = L('ktc'); dd = L('dd'); ddmap = L('ddmap')
    idx = {}
    for sid, p in pl.items(): idx.setdefault((norm(p[0]), p[1]), []).append(sid)
    TEAMFIX = {'KCC': 'KC', 'LVR': 'LV', 'NOS': 'NO', 'NEP': 'NE', 'SFO': 'SF', 'TBB': 'TB', 'GBP': 'GB', 'JAC': 'JAX'}
    ALIAS = {'kenneth': 'kenny', 'chigoziem': 'chig', 'matthew': 'matt'}
    def match(name, pos, team=None):
        c = idx.get((norm(name), pos), [])
        if len(c) > 1 and team:
            t = TEAMFIX.get(team, team); c = [s for s in c if pl[s][2] == t] or c
        if not c:
            f, *r = norm(name).split(' '); c = idx.get((' '.join([ALIAS.get(f, f)] + r), pos), [])
        if not c:
            c = [k for (nn, pp), ids in idx.items() if nn == norm(name) for k in ids]
            if len(c) != 1: c = []
        return c[0] if c else None
    # columns: sf_ktc, sf_dd, sf_flock, oq_ktc, oq_dd, oq_flock
    V = {}; PK = {}; miss = []
    def put(d, k, col, v):
        row = d.setdefault(k, [None] * 6); row[col] = v
    for name, pos, team, age, sf, oq, exp, rook, kid in ktc:
        if pos == 'RDP':
            m = re.match(r'(\d{4}) (Early|Mid|Late) (\d)', name)
            if m: put(PK, f'{m[1]}-{m[3]}-{m[2]}', 0, sf); put(PK, f'{m[1]}-{m[3]}-{m[2]}', 3, oq)
            continue
        sid = match(name, pos, team)
        if not sid: miss.append(name); continue
        put(V, sid, 0, sf); put(V, sid, 3, oq)
    ddv = {n: (sf, oq) for n, sf, oq in dd}
    for nid, sid, name, pos, team, age, exp in ddmap:
        if pos == 'PI' or not sid or nid not in ddv: continue
        sf, oq = ddv[nid]
        if str(sid) in pl:
            if sf: put(V, str(sid), 1, sf)
            if oq: put(V, str(sid), 4, oq)
    for nid, (sf, oq) in ddv.items():
        m = re.match(r'(\d{4})(early|mid|late)(\d)(st|nd|rd|th)pi$', nid)
        if m:
            k = f'{m[1]}-{m[3]}-{m[2].title()}'
            if sf: put(PK, k, 1, sf)
            if oq: put(PK, k, 4, oq)
    flock_ok = False
    if FLOCK_PUBLIC:
        for fname, col, kcol in (('flock', 2, 4), ('flock1', 5, 5)):
            if not os.path.exists(f'data/{fname}.json'): continue
            fl = L(fname)
            if not isinstance(fl, list) or not fl: continue
            flock_ok = True
            fl = [x for x in fl if not (x[5] and (x[0].startswith("'26") or x[0].startswith('2026')))]
            fl.sort(key=lambda x: x[4])
            curve = sorted([k[kcol] for k in ktc if k[1] != 'RDP' or int(k[0][:4]) >= 2027], reverse=True)
            at = lambda r: curve[r - 1] if r <= len(curve) else max(50, curve[-1] * 0.993 ** (r - len(curve)))
            fp = {}
            for r, (name, pos, team, age, avg, isp, fid, prank) in enumerate(fl, 1):
                v = round(at(r))
                if isp: fp[name.upper()] = v; continue
                sid = str(fid)
                if not (sid in pl and norm(pl[sid][0]) == norm(name)): sid = match(name, pos, team)
                if sid and sid in pl: put(V, sid, col, v)
            def fpk(*names):
                xs = [fp[n] for n in names if n in fp]; return round(sum(xs) / len(xs)) if xs else None
            R = {1: '1ST', 2: '2ND', 3: '3RD', 4: '4TH'}
            for s_ in ['2027', '2028']:
                for r_ in [1, 2, 3, 4]:
                    if r_ <= 2:
                        if s_ == '2027' and r_ == 1: e, m, l = fpk('2027 EARLY 1ST'), fpk('2027 MID 1ST'), fpk('2027 LATE 1ST')
                        else:
                            em, ml = fpk(f'{s_} EARLY-MID {R[r_]}'), fpk(f'{s_} MID-LATE {R[r_]}')
                            e, l = em, ml; m = round((em + ml) / 2) if em and ml else None
                    else: e = m = l = fpk(f'{s_} {R[r_]}')
                    for t_, v_ in (('Early', e), ('Mid', m), ('Late', l)):
                        if v_: put(PK, f'{s_}-{r_}-{t_}', col, v_)
            for r_ in [1, 2, 3, 4]:
                for t_ in ['Early', 'Mid', 'Late']:
                    a = PK.get(f'2028-{r_}-{t_}'); b = PK.get(f'2029-{r_}-{t_}')
                    kc = 0 if col == 2 else 3
                    if a and b and a[col] and a[kc] and b[kc]: b[col] = round(a[col] * b[kc] / a[kc])
            floor = round(at(len(fl) + 25))
            for sid, row in V.items():
                if row[col] is None: row[col] = min(floor, row[col - 2] or floor)
    # No fresh Flock pull (it needs the owner's sign-in): carry the last Flock columns forward from the published file.
    flock_asof = datetime.datetime.now(datetime.timezone.utc).isoformat() if flock_ok else None
    prev_path = f'{OUT}/values.json'
    if not flock_ok and FLOCK_PUBLIC and os.path.exists(prev_path):
        prev = json.load(open(prev_path))
        if prev.get('flock'):
            for d, pd_ in ((V, prev.get('players', {})), (PK, prev.get('picks', {}))):
                for k, pr in pd_.items():
                    if not pr or len(pr) != 6 or not (pr[2] or pr[5]): continue
                    if d is V and k not in pl: continue
                    row = d.setdefault(k, [None] * 6); row[2], row[5] = pr[2], pr[5]
            flock_ok = any(r[2] for r in V.values())
            flock_asof = prev.get('flock_asof') or prev.get('updated')
            print('flock carried forward from', flock_asof)
    print('ktc unmatched', len(miss), miss[:20])
    print('valued players', len(V), 'flock', flock_ok)
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    weights = {'flock': 0.50, 'ktc': 0.25, 'dd': 0.25} if flock_ok else {'ktc': 0.5, 'dd': 0.5}
    if not flock_ok:
        for row in list(V.values()) + list(PK.values()): row[2] = row[5] = None
    meta = dict(updated=now, weights=weights, flock=flock_ok, flock_asof=flock_asof,
                dd_max=[max((r[1] or 0) for r in V.values()) or 1, max((r[4] or 0) for r in V.values()) or 1])
    json.dump(dict(meta, players=V, picks=PK), open(f'{OUT}/values.json', 'w'), separators=(',', ':'))
    json.dump(dict(updated=now, players=pl), open(f'{OUT}/players.json', 'w'), separators=(',', ':'))
    # superflex players for the prospect scripts (position hit/miss values)
    w = weights; dmax = meta['dd_max'][0]; P = {}
    for sid, r in V.items():
        parts = {}
        if r[0]: parts['ktc'] = r[0]
        if r[1]: parts['dd'] = r[1] * 9999 / dmax
        if r[2] and 'flock' in w: parts['flock'] = r[2]
        if not parts: continue
        v = sum(parts[k] * w[k] for k in parts) / sum(w[k] for k in parts)
        p = pl[sid]
        if p[1] == 'TE': v *= 1.10
        P[sid] = dict(id=sid, name=p[0], pos=p[1], team=p[2] or 'FA', age=p[3], exp=p[4], value=round(v))
    S = json.load(open('data/site.json')) if os.path.exists('data/site.json') else {}
    S['players'] = P
    json.dump(S, open('data/site.json', 'w'))

def export():
    S = json.load(open('data/site.json'))
    keys = ['prospects', 'prospect_sources', 'prospects_updated', 'prospect_board', 'pm_meta']
    if not S.get('prospect_board') and os.path.exists(f'{OUT}/prospects.json'):
        print('no prospect board this run; keeping the existing prospects.json'); return
    json.dump({k: S.get(k) for k in keys}, open(f'{OUT}/prospects.json', 'w'), separators=(',', ':'))
    print('prospects', len(S.get('prospects') or []), 'board', len(S.get('prospect_board') or []))

if __name__ == '__main__':
    {'values': values, 'export': export}[sys.argv[1]]()
