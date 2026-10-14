# The Wylie Model

Live at https://www.thewyliemodel.com. Dynasty fantasy football tools for any Sleeper league: blended player and pick values, a trade calculator, power rankings, season projections, trade and draft grades, a rookie mock draft and draft simulator, and a 2027 prospect board.

Open the site, go to **Leagues**, and enter a Sleeper username. League data loads live from the Sleeper API in your browser. Player values (KeepTradeCut and Dynasty Daddy) and the prospect board update once a day.

Files:
- `index.html`, `app.js`, `engine.js`: the site.
- `data/values.json`, `data/players.json`, `data/prospects.json`: daily data, rebuilt by the refresh job.
