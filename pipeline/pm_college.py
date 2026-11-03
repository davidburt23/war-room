"""College season stats per athlete from ESPN game-level data (sportsdataverse releases).
Output: DataFrame keyed by (season, athlete_id) with receiving / rushing / passing totals and team shares.
"""
import os, re, subprocess
import pandas as pd

CFB = os.environ.get('CFB_DIR', '/tmp/claude-0/cfb')
BASE = 'https://github.com/sportsdataverse/sportsdataverse-data/releases/download'
KINDS = {'adv_receiving': 'espn_cfb_adv_receiving', 'adv_rushing': 'espn_cfb_adv_rushing',
         'adv_passing': 'espn_cfb_adv_passing', 'cfb_rosters': 'espn_cfb_rosters'}

def fetch(season, force=False):
    os.makedirs(CFB, exist_ok=True)
    for n, rel in KINDS.items():
        p = f'{CFB}/{n}_{season}.parquet'
        if force or not os.path.exists(p) or os.path.getsize(p) < 1000:
            subprocess.run(['curl', '-sSL', '--max-time', '180', '-o', p, f'{BASE}/{rel}/{n}_{season}.parquet'], check=True)

def norm(s):
    s = str(s).lower()
    s = re.sub(r"[.'’`]", '', s)
    s = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b', '', s)
    return ' '.join(re.sub(r'[^a-z ]', ' ', s).split())

def season_stats(season):
    rd = lambda n: pd.read_parquet(f'{CFB}/{n}_{season}.parquet')
    rec, rush, pas, ros = rd('adv_receiving'), rd('adv_rushing'), rd('adv_passing'), rd('cfb_rosters')
    # team totals (all rows, named or not)
    tr = rec.groupby('pos_team_id').agg(t_rec_yds=('Yds', 'sum'), t_rec_td=('Rec_TD', 'sum'), t_tar=('Tar', 'sum'), t_games=('game_id', 'nunique'))
    tu = rush.groupby('pos_team_id').agg(t_rush_yds=('Yds', 'sum'), t_rush_td=('Rush_TD', 'sum'), t_car=('Car', 'sum'))
    R = rec.dropna(subset=['receiver_player_name']).groupby(['pos_team_id', 'receiver_player_name']).agg(
        rec=('Rec', 'sum'), tar=('Tar', 'sum'), rec_yds=('Yds', 'sum'), rec_td=('Rec_TD', 'sum'), rec_g=('game_id', 'nunique'), yac=('YAC', 'sum')).reset_index().rename(columns={'receiver_player_name': 'name'})
    U = rush.dropna(subset=['rusher_player_name']).groupby(['pos_team_id', 'rusher_player_name']).agg(
        car=('Car', 'sum'), rush_yds=('Yds', 'sum'), rush_td=('Rush_TD', 'sum'), rush_g=('game_id', 'nunique')).reset_index().rename(columns={'rusher_player_name': 'name'})
    Pz = pas.dropna(subset=['passer_player_name']).groupby(['pos_team_id', 'passer_player_name']).agg(
        cmp=('Comp', 'sum'), att=('Att', 'sum'), pass_yds=('Yds', 'sum'), pass_td=('Pass_TD', 'sum'), ints=('Int', 'sum'), pass_g=('game_id', 'nunique'),
        epa_pp=('EPA_per_Play', 'mean')).reset_index().rename(columns={'passer_player_name': 'name'})
    S = R.merge(U, on=['pos_team_id', 'name'], how='outer').merge(Pz, on=['pos_team_id', 'name'], how='outer')
    S = S.merge(tr, left_on='pos_team_id', right_index=True, how='left').merge(tu, left_on='pos_team_id', right_index=True, how='left')
    S['key'] = S['name'].map(norm)
    ros = ros.copy()
    ros['team_id'] = pd.to_numeric(ros['team_id'], errors='coerce')
    ros['key'] = ros['full_name'].map(norm)
    ros2 = ros.copy(); ros2['key'] = ros['display_name'].map(norm)
    rr = pd.concat([ros, ros2]).drop_duplicates(['team_id', 'key'])[['team_id', 'key', 'athlete_id', 'position_abbreviation', 'height', 'weight', 'date_of_birth', 'experience_display_value', 'full_name', 'team_location']]
    S['pos_team_id'] = pd.to_numeric(S['pos_team_id'], errors='coerce')
    S = S.merge(rr, left_on=['pos_team_id', 'key'], right_on=['team_id', 'key'], how='left')
    S['season'] = season
    for c in ['rec', 'tar', 'rec_yds', 'rec_td', 'car', 'rush_yds', 'rush_td', 'cmp', 'att', 'pass_yds', 'pass_td', 'ints', 'yac']:
        S[c] = S[c].fillna(0)
    S['games'] = S[['rec_g', 'rush_g', 'pass_g']].max(axis=1)
    S['team_games'] = S['t_games']
    S['athlete_id'] = pd.to_numeric(S['athlete_id'], errors='coerce')
    return S

def all_seasons(seasons):
    out = []
    for y in seasons:
        try: out.append(season_stats(y))
        except Exception as e: print('season', y, 'failed', e)
    return pd.concat(out, ignore_index=True)

def add_shares(S):
    sh = lambda a, b: (a / b.where(b > 0)).fillna(0)
    S['rec_yd_sh'] = sh(S.rec_yds, S.t_rec_yds); S['rec_td_sh'] = sh(S.rec_td, S.t_rec_td)
    S['dom'] = 0.5 * (S.rec_yd_sh + S.rec_td_sh)                      # receiving dominator
    scr, tscr = S.rush_yds + S.rec_yds, S.t_rush_yds + S.t_rec_yds
    S['scr_sh'] = sh(scr, tscr)
    S['scr_td_sh'] = sh(S.rush_td + S.rec_td, S.t_rush_td + S.t_rec_td)
    S['rb_dom'] = 0.5 * (S.scr_sh + S.scr_td_sh)                       # scrimmage dominator for RBs
    S['tar_sh'] = sh(S.tar, S.t_tar)
    return S
