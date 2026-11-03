"""Daily: refresh 2026 college stats and rescore the 2027 prospect board (model coefficients come from data/prospect_model.json)."""
import os, subprocess, sys
import pandas as pd
import pm_college as C

CFB = C.CFB
os.makedirs(CFB, exist_ok=True)
for y in range(2020, 2027):
    C.fetch(y, force=(y == 2026))
base = 'https://github.com/sportsdataverse/sportsdataverse-data/releases/download/cfb_recruits'
rec = []
for y in range(2019, 2027):
    p = f'{CFB}/cfb_recruits_{y}.parquet'
    if not os.path.exists(p): subprocess.run(['curl', '-sSL', '--max-time', '120', '-o', p, f'{base}/cfb_recruits_{y}.parquet'], check=True)
    d = pd.read_parquet(p); d['cls'] = y; rec.append(d)
rec = pd.concat(rec); rec['key'] = rec.player_name.map(C.norm)
rec[['key', 'player_name', 'cls', 'stars', 'team', 'position']].to_parquet(f'{CFB}/recruits_all.parquet')
S = C.add_shares(C.all_seasons(range(2020, 2027)))
S.to_parquet(f'{CFB}/cfb_seasons_recent.parquet')
env = dict(os.environ, CFB_SEASONS=f'{CFB}/cfb_seasons_recent.parquet', RECRUITS=f'{CFB}/recruits_all.parquet', ROSTER26=f'{CFB}/cfb_rosters_2026.parquet')
sys.exit(subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'pm_score.py')], env=env).returncode)
