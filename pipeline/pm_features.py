"""Turn a player's college seasons into model features. Shared by training (past classes) and scoring (2027 class)."""
import math
import pandas as pd

BREAKOUT = {'WR': ('dom', 0.20), 'TE': ('dom', 0.15), 'RB': ('rb_dom', 0.20)}

def age_on(birth, season):
    """Age on Sept 1 of the season."""
    if birth is None or pd.isna(birth): return None
    b = pd.Timestamp(birth)
    return (pd.Timestamp(f'{int(season)}-09-01') - b).days / 365.25

def features(seasons, pos, birth, draft_year):
    """seasons: DataFrame rows for one athlete (any team), college seasons before the draft."""
    s = seasons[seasons.games > 0].sort_values('season')
    f = dict(n_seasons=int(s.season.nunique()))
    if s.empty: return f
    # collapse transfers in the same season (rare) by summing counting stats and taking the max shares
    g = s.groupby('season').agg({**{c: 'sum' for c in ['rec', 'tar', 'rec_yds', 'rec_td', 'car', 'rush_yds', 'rush_td', 'cmp', 'att', 'pass_yds', 'pass_td', 'ints', 'games', 'yac']},
                                 **{c: 'max' for c in ['dom', 'rb_dom', 'rec_yd_sh', 'scr_sh', 'tar_sh', 'height', 'weight', 'epa_pp']}}).reset_index()
    first = g.season.min()
    f['first_season'] = int(first)
    f['ht'] = float(g.height.dropna().iloc[-1]) if g.height.notna().any() else None
    f['wt'] = float(g.weight.dropna().iloc[-1]) if g.weight.notna().any() else None
    ages = {r.season: age_on(birth, r.season) for r in g.itertuples()}
    f['age_draft'] = age_on(birth, draft_year) - 0.35 if birth is not None and not pd.isna(birth) else None   # ~late April
    gp = g.games.sum()
    f['games'] = int(gp)
    f['rec'] = int(g.rec.sum()); f['rec_yds'] = int(g.rec_yds.sum()); f['rec_td'] = int(g.rec_td.sum())
    f['car'] = int(g.car.sum()); f['rush_yds'] = int(g.rush_yds.sum()); f['rush_td'] = int(g.rush_td.sum())
    f['ypr'] = f['rec_yds'] / f['rec'] if f['rec'] >= 10 else None
    f['ypc'] = f['rush_yds'] / f['car'] if f['car'] >= 30 else None
    f['rec_ypg'] = f['rec_yds'] / gp if gp else 0
    f['scr_ypg'] = (f['rec_yds'] + f['rush_yds']) / gp if gp else 0
    f['peak_dom'] = float(g.dom.max()); f['peak_rb_dom'] = float(g.rb_dom.max())
    f['peak_rec_sh'] = float(g.rec_yd_sh.max()); f['peak_tar_sh'] = float(g.tar_sh.max())
    best = g.sort_values('rec_yds' if pos in ('WR', 'TE') else ('pass_yds' if pos == 'QB' else 'rush_yds')).iloc[-1]
    f['best_season'] = int(best.season)
    f['yac_per_rec'] = float(g.yac.sum() / f['rec']) if f['rec'] >= 10 and g.yac.sum() > 0 else None
    if pos in BREAKOUT:
        col, thr = BREAKOUT[pos]
        bo = g[(g[col] >= thr) & (g.games >= 5)]
        f['breakout_season'] = int(bo.season.min()) if len(bo) else None
        f['breakout_age'] = ages.get(f['breakout_season']) if len(bo) else None
        f['breakout_year'] = int(f['breakout_season'] - first + 1) if len(bo) else None   # 1 = freshman
    if pos == 'QB':
        att, cmp_ = g.att.sum(), g.cmp.sum()
        f['att'] = int(att); f['pass_yds'] = int(g.pass_yds.sum()); f['pass_td'] = int(g.pass_td.sum()); f['ints'] = int(g.ints.sum())
        f['comp'] = cmp_ / att if att else None
        f['ypa'] = g.pass_yds.sum() / att if att else None
        f['td_int'] = (g.pass_td.sum() + 1) / (g.ints.sum() + 1)
        f['rush_ypg'] = g.rush_yds.sum() / gp if gp else 0
        starts = g[g.att >= 150]
        f['starter_seasons'] = int(len(starts))
        last = starts.iloc[-1] if len(starts) else g.iloc[-1]
        f['last_ypa'] = last.pass_yds / last.att if last.att else None
        f['last_epa'] = float(last.epa_pp) if not pd.isna(last.epa_pp) else None
    f['seasons'] = [dict(season=int(r.season), g=int(r.games), rec=int(r.rec), rec_yds=int(r.rec_yds), rec_td=int(r.rec_td),
                         car=int(r.car), rush_yds=int(r.rush_yds), rush_td=int(r.rush_td), att=int(r.att), cmp=int(r.cmp),
                         pass_yds=int(r.pass_yds), pass_td=int(r.pass_td), ints=int(r.ints),
                         dom=round(float(r.dom), 3), rb_dom=round(float(r.rb_dom), 3), age=round(ages[r.season], 1) if ages.get(r.season) else None)
                    for r in g.itertuples()]
    return f
