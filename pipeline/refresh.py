"""Daily data refresh that runs on GitHub Actions (no personal computer needed).

Pulls KeepTradeCut and Dynasty Daddy values plus Sleeper's player list, carries the last Flock
rankings forward (Flock needs the owner's sign-in, so it is refreshed by hand), refreshes college
stats from sportsdataverse, rescores The Wylie and rewrites data/values.json, data/players.json
and data/prospects.json. If KTC or Dynasty Daddy can't be reached, nothing is changed.
"""
import json, os, re, shutil, subprocess, sys, tempfile, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PIPE = os.path.join(ROOT, 'pipeline')
UA = {'User-Agent': 'Mozilla/5.0 (compatible; WylieModelRefresh/1.0)', 'Accept': '*/*'}


def get(url, kind='json', timeout=90):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        body = r.read().decode('utf-8', 'replace')
    return json.loads(body) if kind == 'json' else body


def ktc():
    html = get('https://keeptradecut.com/dynasty-rankings?filters=QB|WR|RB|TE|RDP&format=2', 'text')
    m = re.search(r'<script[^>]*id="ktc-players"[^>]*>(.*?)</script>', html, re.S) or \
        re.search(r'var\s+playersArray\s*=\s*(\[.*?\]);\s*\n', html, re.S)
    if not m: raise RuntimeError('KTC player data not found (page layout changed or request blocked)')
    arr = json.loads(m.group(1))
    return [[p['playerName'], p['position'], p.get('team'), p.get('age'), (p.get('superflexValues') or {}).get('value'),
             (p.get('oneQBValues') or {}).get('value'), p.get('seasonsExperience'), 1 if p.get('rookie') else 0, p.get('playerID')] for p in arr]


def dynasty_daddy():
    base = get('https://dynasty-daddy.com/api/v1/player/all/today')
    m = get('https://dynasty-daddy.com/api/v1/player/all/market/19')
    ddmap = [[p.get('name_id'), p.get('sleeper_id'), p.get('full_name'), p.get('position'), p.get('team'), p.get('age'), p.get('experience')] for p in base]
    dd = [[p.get('name_id'), p.get('sf_trade_value'), p.get('trade_value')] for p in m]
    return ddmap, dd


def sleeper_players():
    P = get('https://api.sleeper.app/v1/players/nfl', timeout=180)
    S, SK = {}, ['QB', 'RB', 'WR', 'TE']
    for pid, p in P.items():
        pos = p.get('position') if p.get('position') in SK else next((x for x in (p.get('fantasy_positions') or []) if x in SK), None)
        if not pos: continue
        ye, sr = p.get('years_exp'), p.get('search_rank')
        if not (p.get('active') or p.get('team') or (ye is not None and ye <= 12 and (sr or 9e9) < 5000)): continue
        name = p.get('full_name') or ((p.get('first_name') or '') + ' ' + (p.get('last_name') or '')).strip()
        S[pid] = [name, pos, p.get('team'), p.get('age'), ye, p.get('injury_status'), sr]
    return S


def main():
    work = tempfile.mkdtemp(prefix='wylie_')
    os.makedirs(os.path.join(work, 'data'))
    W = lambda k, v: json.dump(v, open(os.path.join(work, 'data', k + '.json'), 'w'))
    try:
        W('ktc', ktc())
        ddmap, dd = dynasty_daddy(); W('ddmap', ddmap); W('dd', dd)
        W('players_all', sleeper_players())
    except Exception as e:
        print('Source fetch failed, leaving data unchanged:', e); return 0
    env = dict(os.environ, FLOCK_PUBLIC='1', WEB_DIR=ROOT, PYTHONPATH=PIPE)
    # carry the prospect consensus (maintained by hand) into the scoring workspace
    pro = json.load(open(os.path.join(ROOT, 'data', 'prospects.json')))
    json.dump({k: pro.get(k) for k in ('prospects', 'prospect_sources', 'prospects_updated')}, open(os.path.join(work, 'data', 'site.json'), 'w'))
    subprocess.run([sys.executable, os.path.join(PIPE, 'build_static.py'), 'values'], cwd=work, env=env, check=True)
    # college stats + The Wylie; on any failure keep yesterday's prospect board
    try:
        shutil.copy(os.path.join(PIPE, 'prospect_model.json'), os.path.join(work, 'data', 'prospect_model.json'))
        cfb = os.path.join(work, 'cfb'); env2 = dict(env, CFB_DIR=cfb)
        subprocess.run([sys.executable, os.path.join(PIPE, 'pm_daily.py')], cwd=work, env=env2, check=True, timeout=2400)
        subprocess.run([sys.executable, os.path.join(PIPE, 'build_static.py'), 'export'], cwd=work, env=env, check=True)
    except Exception as e:
        print('Prospect rescoring failed, keeping the previous board:', e)
    return 0


if __name__ == '__main__':
    sys.exit(main())
