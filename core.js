/* Char & Oak: shared core. The SAME file runs in two places:
   - in the browser (demo mode, and for every stat / result shown on screen)
   - in Apps Script (copied to Core.gs at deploy) where it is the real rules engine behind the private Sheet.
   No data and no secrets in here. */
var CO = (function () {
  'use strict';
  var STYLES = ['Bourbon', 'Wheated bourbon', 'Rye', 'Tennessee', 'American single malt', 'Single malt Scotch', 'Blended Scotch', 'Irish', 'Japanese', 'Rum', 'Brandy / Cognac', 'Other'];
  var PROOFS = [{ k: 'p1', label: 'Under 90', lo: 0, hi: 90 }, { k: 'p2', label: '90\u2013100', lo: 90, hi: 100 }, { k: 'p3', label: '100\u2013110', lo: 100, hi: 110 },
    { k: 'p4', label: '110\u2013120', lo: 110, hi: 120 }, { k: 'p5', label: '120\u2013130', lo: 120, hi: 130 }, { k: 'p6', label: '130+', lo: 130, hi: 999 }];
  var FAMILIES = [
    { k: 'fruit', label: 'Fruit', color: '#C2553A', tags: ['Cherry', 'Apple', 'Citrus', 'Dried fruit', 'Banana', 'Stone fruit', 'Berry'] },
    { k: 'sweet', label: 'Sweet', color: '#D99A3D', tags: ['Caramel', 'Vanilla', 'Honey', 'Toffee', 'Maple', 'Brown sugar', 'Chocolate'] },
    { k: 'spice', label: 'Spice', color: '#A8432A', tags: ['Cinnamon', 'Clove', 'Black pepper', 'Rye spice', 'Nutmeg', 'Ginger'] },
    { k: 'wood', label: 'Wood', color: '#7A4B2A', tags: ['Charred oak', 'Cedar', 'Tobacco', 'Leather', 'Sawdust', 'Coffee'] },
    { k: 'grain', label: 'Grain & Nut', color: '#B88B4A', tags: ['Almond', 'Pecan', 'Bread', 'Cereal', 'Corn', 'Peanut'] },
    { k: 'floral', label: 'Floral & Herbal', color: '#7E8F55', tags: ['Floral', 'Mint', 'Herbal', 'Tea', 'Eucalyptus'] },
    { k: 'smoke', label: 'Smoke & Earth', color: '#5B5B5B', tags: ['Smoke', 'Peat', 'Earthy', 'Mineral', 'Brine'] },
    { k: 'flaw', label: 'Rough edges', color: '#8C2F39', tags: ['Ethanol heat', 'Medicinal', 'Sour', 'Thin', 'Bitter'] }
  ];
  var TAG_FAMILY = {};
  FAMILIES.forEach(function (f) { f.tags.forEach(function (t) { TAG_FAMILY[t] = f.k; }); });

  function defaultSheet() {
    return {
      scale: { min: 1, max: 10, step: 1 },
      categories: [
        { k: 'nose', label: 'Nose', weight: 1, hint: 'Aroma in the glass' },
        { k: 'palate', label: 'Palate', weight: 1.5, hint: 'Taste and texture' },
        { k: 'finish', label: 'Finish', weight: 1, hint: 'Length and what lingers' },
        { k: 'overall', label: 'Overall', weight: 1.5, hint: 'Would you pour it again?' }
      ],
      tags: true, notes: true, guessStyle: true, guessProof: true, guessMatch: true
    };
  }
  function defaultSettings() {
    return { id: 'main', groupName: 'Char & Oak: A Whiskey Club', lat: 40.63, lon: -73.96, havdalahMin: 50, prepMin: 30, sheet: defaultSheet() };
  }

  /* ---------- small helpers ---------- */
  function err(status, msg) { var e = new Error(msg); e.status = status; return e; }
  function str(v, max) { v = v == null ? '' : String(v); v = v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim(); return v.slice(0, max || 200); }
  function num(v, lo, hi, dflt) { var n = Number(v); if (!isFinite(n)) return dflt; return Math.min(hi, Math.max(lo, n)); }
  function uid(p) { return (p || 'x') + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 8); }
  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }
  function median(a) { if (!a.length) return null; var b = a.slice().sort(function (x, y) { return x - y; }), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
  function sd(a) { if (a.length < 2) return 0; var m = mean(a); return Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1)); }
  function r1(x) { return x == null ? null : Math.round(x * 10) / 10; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function pick(o, keys) { var r = {}; keys.forEach(function (k) { if (o[k] !== undefined) r[k] = o[k]; }); return r; }
  var COLORS = ['#B5651D', '#8C2F39', '#6B4E2E', '#A97C2F', '#4F6D5A', '#5D4A6E', '#9A5B3C', '#3E5C76'];
  function initials(name) { var p = str(name, 60).split(/\s+/).filter(Boolean); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : (p[0] || '')[1] || '')).toUpperCase(); }

  /* ---------- Shabbat / Yom Tov (diaspora) ---------- */
  var YOMTOV = ['2026-09-12', '2026-09-13', '2026-09-21', '2026-09-26', '2026-09-27', '2026-10-03', '2026-10-04',
    '2027-04-22', '2027-04-23', '2027-04-28', '2027-04-29', '2027-06-11', '2027-06-12', '2027-10-02', '2027-10-03', '2027-10-11',
    '2027-10-16', '2027-10-17', '2027-10-23', '2027-10-24',
    '2028-04-11', '2028-04-12', '2028-04-17', '2028-04-18', '2028-05-31', '2028-06-01', '2028-09-21', '2028-09-22', '2028-09-30',
    '2028-10-05', '2028-10-06', '2028-10-12', '2028-10-13'];
  function ymd(y, m, d) { return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2); }
  function addDays(s, n) { var p = s.split('-'), dt = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n)); return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()); }
  function dow(s) { var p = s.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); }
  /* US Eastern offset in hours for a wall-clock date (DST: 2nd Sunday of March to 1st Sunday of November). */
  function nyOffset(s) {
    var p = s.split('-'), y = +p[0], m = +p[1], d = +p[2];
    function nthSun(mo, n) { var first = new Date(Date.UTC(y, mo - 1, 1)).getUTCDay(); return 1 + ((7 - first) % 7) + 7 * (n - 1); }
    var dst = (m > 3 && m < 11) || (m === 3 && d >= nthSun(3, 2)) || (m === 11 && d < nthSun(11, 1));
    return dst ? -4 : -5;
  }
  /* NOAA sunset, minutes after local midnight. */
  function sunsetMin(s, lat, lon) {
    var p = s.split('-'), y = +p[0], mo = +p[1], d = +p[2];
    var N = Math.floor(275 * mo / 9) - Math.floor((mo + 9) / 12) * (1 + Math.floor((y - 4 * Math.floor(y / 4) + 2) / 3)) + d - 30;
    var rad = Math.PI / 180, lngHour = lon / 15, t = N + ((18 - lngHour) / 24);
    var M = (0.9856 * t) - 3.289;
    var L = (M + (1.916 * Math.sin(M * rad)) + (0.020 * Math.sin(2 * M * rad)) + 282.634) % 360; if (L < 0) L += 360;
    var RA = Math.atan(0.91764 * Math.tan(L * rad)) / rad; RA = (RA + 360) % 360;
    RA = (RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90)) / 15;
    var sinDec = 0.39782 * Math.sin(L * rad), cosDec = Math.cos(Math.asin(sinDec));
    var cosH = (Math.cos(90.833 * rad) - (sinDec * Math.sin(lat * rad))) / (cosDec * Math.cos(lat * rad));
    var H = Math.acos(Math.max(-1, Math.min(1, cosH))) / rad / 15;
    var T = H + RA - (0.06571 * t) - 6.622, UT = (T - lngHour) % 24; if (UT < 0) UT += 24;
    var local = (UT + nyOffset(s) + 24) % 24;
    return Math.round(local * 60);
  }
  function isRest(s) { return dow(s) === 6 || YOMTOV.indexOf(s) >= 0; }
  function hm(min) { var h = Math.floor(min / 60), m = min % 60, ap = h >= 12 ? 'pm' : 'am'; return ((h + 11) % 12 + 1) + ':' + ('0' + m).slice(-2) + ap; }
  /* start/end are "YYYY-MM-DDTHH:MM" New York wall time. Returns null if fine, or a reason. */
  function restCheck(start, end, st) {
    st = st || defaultSettings();
    var m = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(start || ''); if (!m) return 'Pick a date and time';
    var day = m[1], sMin = +m[2] * 60 + +m[3], e = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/.exec(end || '');
    var eMin = e ? (e[1] === day ? +e[2] * 60 + +e[3] : 24 * 60 + +e[2] * 60 + +e[3]) : sMin + 180;
    var sun = sunsetMin(day, st.lat, st.lon), candle = sun - 18, havd = sun + (st.havdalahMin || 50);
    var restToday = isRest(day), restTomorrow = isRest(addDays(day, 1));
    if (restToday && restTomorrow) return (dow(day) === 6 ? 'Shabbat' : 'Yom Tov') + ' runs into the next day. Pick another day.';
    if (restToday && sMin < havd) return (dow(day) === 6 ? 'Shabbat' : 'Yom Tov') + ' ends ' + hm(havd) + '. Start at ' + hm(havd) + ' or later.';
    if (restTomorrow && eMin > candle - (st.prepMin || 30)) return (dow(day) === 5 ? 'Friday night' : 'Erev Yom Tov') + ': candles ' + hm(candle) + '. Finish by ' + hm(candle - (st.prepMin || 30)) + '.';
    return null;
  }
  function dayInfo(day, st) {
    st = st || defaultSettings(); var sun = sunsetMin(day, st.lat, st.lon);
    return { sunset: hm(sun), candles: hm(sun - 18), havdalah: hm(sun + (st.havdalahMin || 50)), rest: isRest(day), restTomorrow: isRest(addDays(day, 1)), yomtov: YOMTOV.indexOf(day) >= 0 };
  }
  function toUTC(wall) { var day = wall.slice(0, 10), off = nyOffset(day), p = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(wall); return new Date(Date.UTC(+p[1], +p[2] - 1, +p[3], +p[4] - off, +p[5])); }

  /* ---------- scoring ---------- */
  function entryScore(entry, sheet) {
    if (!entry || !entry.v) return null;
    var sc = sheet.scale, span = (sc.max - sc.min) || 1, tw = 0, tot = 0;
    sheet.categories.forEach(function (c) {
      var v = entry.v[c.k]; if (v == null || v === '' || !isFinite(+v)) return;
      tw += +c.weight; tot += +c.weight * ((+v - sc.min) / span);
    });
    return tw ? Math.round(tot / tw * 1000) / 10 : null;   /* 0-100 */
  }
  function proofBucket(p) { p = +p; if (!p) return null; for (var i = 0; i < PROOFS.length; i++) if (p >= PROOFS[i].lo && p < PROOFS[i].hi) return PROOFS[i].k; return null; }
  function guessPoints(g, b) {
    var pts = 0, d = { style: null, proof: null, match: null };
    if (!g) return { pts: 0, d: d };
    if (g.style && b.style) { d.style = g.style === b.style ? 2 : 0; pts += d.style; }
    var real = proofBucket(b.proof);
    if (g.proof && real) { var gi = PROOFS.map(function (x) { return x.k; }).indexOf(g.proof), ri = PROOFS.map(function (x) { return x.k; }).indexOf(real); d.proof = gi === ri ? 2 : Math.abs(gi - ri) === 1 ? 1 : 0; pts += d.proof; }
    if (g.matchName) { d.match = g.matchName === b.name ? 3 : 0; pts += d.match; }
    return { pts: pts, d: d };
  }
  function label(sd_) { return sd_ == null ? '' : sd_ < 7 ? 'Consensus' : sd_ > 14 ? 'Controversial' : 'Mixed'; }
  /* Full results for one revealed (or host-view) event. */
  function results(ev, rows, members) {
    var sheet = ev.sheet || defaultSheet(), names = {};
    (members || []).forEach(function (m) { names[m.id] = m.name; });
    rows = (rows || []).filter(function (r) { return r.eid === ev.id; });
    var bottles = (ev.bottles || []).map(function (b) {
      var vals = [], cats = {}, tags = {}, fam = {}, notes = [], by = [];
      sheet.categories.forEach(function (c) { cats[c.k] = []; });
      rows.forEach(function (r) {
        var e = r.entries && r.entries[b.id]; if (!e) return;
        var s = entryScore(e, sheet); if (s == null) return;
        vals.push(s); by.push({ scorer: r.scorer, name: r.name || names[r.scorer] || 'Guest', score: s, v: e.v, tags: e.tags || [], note: e.note || '', guess: e.guess || null, paper: !!r.paper });
        sheet.categories.forEach(function (c) { if (e.v[c.k] != null && e.v[c.k] !== '') cats[c.k].push(+e.v[c.k]); });
        (e.tags || []).forEach(function (t) { tags[t] = (tags[t] || 0) + 1; var f = TAG_FAMILY[t] || 'other'; fam[f] = (fam[f] || 0) + 1; });
        if (e.note) notes.push({ name: r.name || names[r.scorer] || 'Guest', note: e.note });
      });
      var cm = {}; Object.keys(cats).forEach(function (k) { cm[k] = r1(mean(cats[k])); });
      var s_ = vals.length ? r1(sd(vals)) : null;
      return { id: b.id, code: b.code, bottle: b, n: vals.length, mean: r1(mean(vals)), median: r1(median(vals)), sd: s_, min: vals.length ? Math.min.apply(null, vals) : null,
        max: vals.length ? Math.max.apply(null, vals) : null, verdict: label(s_), cats: cm, tags: tags, families: fam, notes: notes, by: by.sort(function (a, b2) { return b2.score - a.score; }) };
    });
    var ranked = bottles.filter(function (b) { return b.n; }).sort(function (a, b) { return b.mean - a.mean || b.median - a.median; });
    ranked.forEach(function (b, i) { b.rank = i + 1; });
    var guess = {};
    rows.forEach(function (r) {
      var tot = 0, det = {};
      (ev.bottles || []).forEach(function (b) { var e = r.entries && r.entries[b.id]; if (!e || !e.guess) return; var g = guessPoints(e.guess, b); tot += g.pts; det[b.id] = g; });
      guess[r.scorer] = { name: r.name || names[r.scorer] || 'Guest', pts: tot, det: det };
    });
    var most = bottles.filter(function (b) { return b.n > 1; }).sort(function (a, b) { return b.sd - a.sd; });
    return { bottles: bottles, ranked: ranked, winner: ranked[0] || null, guess: guess, controversial: most[0] || null, consensus: most.length ? most[most.length - 1] : null, scorers: rows.length };
  }

  /* ---------- stats across the whole club ---------- */
  function stats(data) {
    var members = data.members || [], evs = (data.events || []).filter(function (e) { return e.status === 'revealed'; });
    var per = {}, all = [];
    members.forEach(function (m) { per[m.id] = { id: m.id, name: m.name, scores: [], diffs: [], styles: {}, tags: {}, attended: 0, hosted: 0, guessPts: 0, guessN: 0, events: [], byBottle: {} }; });
    var winners = [], bottlesAll = [];
    evs.sort(function (a, b) { return String(b.when && b.when.start || b.revealedAt || '').localeCompare(String(a.when && a.when.start || a.revealedAt || '')); });
    evs.forEach(function (ev) {
      var R = results(ev, data.scores, members);
      if (R.winner) winners.push({ ev: ev, b: R.winner });
      R.bottles.forEach(function (b) { if (b.n) bottlesAll.push({ ev: ev, b: b }); });
      if (ev.host && per[ev.host]) per[ev.host].hosted++;
      var seen = {};
      R.bottles.forEach(function (b) {
        b.by.forEach(function (x) {
          var p = per[x.scorer]; if (!p) return;
          seen[x.scorer] = 1; p.scores.push(x.score); all.push(x.score);
          var others = b.by.filter(function (y) { return y.scorer !== x.scorer; }).map(function (y) { return y.score; });
          if (others.length) p.diffs.push(x.score - mean(others));
          var st = b.bottle.style || 'Other'; (p.styles[st] = p.styles[st] || []).push(x.score);
          x.tags.forEach(function (t) { p.tags[t] = (p.tags[t] || 0) + 1; });
          p.byBottle[ev.id + ':' + b.id] = x.score;
        });
      });
      Object.keys(R.guess).forEach(function (s) { if (per[s]) { per[s].guessPts += R.guess[s].pts; per[s].guessN++; } });
      Object.keys(seen).forEach(function (s) { per[s].attended++; per[s].events.push(ev.id); });
    });
    var list = Object.keys(per).map(function (k) {
      var p = per[k], bias = mean(p.diffs), fav = null, favAvg = -1;
      Object.keys(p.styles).forEach(function (s) { var a = mean(p.styles[s]); if (a > favAvg) { favAvg = a; fav = s; } });
      var topTags = Object.keys(p.tags).sort(function (a, b) { return p.tags[b] - p.tags[a]; }).slice(0, 6);
      return { id: p.id, name: p.name, avg: r1(mean(p.scores)), n: p.scores.length, bias: r1(bias), biasLabel: bias == null ? 'Not enough pours yet' : bias <= -4 ? 'Harsh judge' : bias >= 4 ? 'Generous pour' : 'Well calibrated',
        favStyle: fav, favAvg: r1(favAvg < 0 ? null : favAvg), topTags: topTags, attended: p.attended, hosted: p.hosted, guessPts: p.guessPts, byBottle: p.byBottle,
        attendance: evs.length ? Math.round(p.attended / evs.length * 100) : 0, accuracy: p.diffs.length ? r1(mean(p.diffs.map(Math.abs))) : null };
    });
    /* palate twins: mean absolute difference over shared bottles (3+) */
    var twins = [];
    for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {
      var a = list[i], b = list[j], d = [];
      Object.keys(a.byBottle).forEach(function (k) { if (b.byBottle[k] != null) d.push(Math.abs(a.byBottle[k] - b.byBottle[k])); });
      if (d.length >= 3) twins.push({ a: a.id, b: b.id, an: a.name, bn: b.name, n: d.length, match: Math.max(0, Math.round(100 - 2 * mean(d))) });
    }
    twins.sort(function (x, y) { return y.match - x.match; });
    bottlesAll.sort(function (x, y) { return y.b.mean - x.b.mean; });
    return { members: list, twins: twins, winners: winners, bottles: bottlesAll, events: evs.length, clubAvg: r1(mean(all)) };
  }

  /* ---------- views of the data per person (server enforces; client reuses) ---------- */
  function isAdmin(who) { return who && who.role === 'admin'; }
  function canHost(who, ev) { return isAdmin(who) || (ev && ev.host && who && ev.host === who.id); }
  function publicMember(m, who) {
    var o = pick(m, ['id', 'name', 'nick', 'bio', 'avatar', 'color', 'role', 'active', 'joined', 'favorite']);
    if (isAdmin(who)) { o.linkSet = !!m.tokenHash; o.linkAt = m.linkAt || ''; }
    return o;
  }
  function progress(ev, rows) {
    var p = {};
    rows.forEach(function (r) {
      if (r.eid !== ev.id) return;
      var n = 0, bs = []; (ev.bottles || []).forEach(function (b) { if (r.entries && r.entries[b.id] && r.entries[b.id].v && Object.keys(r.entries[b.id].v).length) { n++; bs.push(b.id); } });
      p[r.scorer] = { n: n, b: bs, done: !!r.done, name: r.name || '', paper: !!r.paper, at: r.at || '' };
    });
    return p;
  }
  function sealedEvent(ev, who) {
    var e = clone(ev);
    e.canHost = canHost(who, ev);
    if (ev.status !== 'revealed' && !e.canHost) {
      var lineup = (ev.bottles || []).map(function (b) { return { name: b.name, distillery: b.distillery || '' }; });
      lineup.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
      e.bottles = (ev.bottles || []).map(function (b) { return { id: b.id, code: b.code }; });
      e.lineup = ev.showLineup ? lineup.map(function (l, i) { return { id: 'L' + i, name: l.name, distillery: l.distillery }; }) : [];
      e.sealed = true;
    }
    return e;
  }
  /* lineup guesses: members pick a lineup name; we store the NAME, and score against the real bottle at reveal */
  function getAll(ctx) {
    var who = ctx.who, s = ctx.store;
    var members = s.list('members').filter(function (m) { return m.active !== false || isAdmin(who); }).map(function (m) { return publicMember(m, who); });
    var evsRaw = s.list('events'), rows = s.list('scores');
    var events = evsRaw.map(function (ev) { var e = sealedEvent(ev, who); e.progress = progress(ev, rows); return e; });
    var visibleScores = rows.filter(function (r) {
      var ev = evsRaw.filter(function (e) { return e.id === r.eid; })[0];
      if (!ev) return false;
      return ev.status === 'revealed' || r.scorer === who.id || canHost(who, ev);
    });
    var me = s.get('members', who.id);
    return { me: publicMember(me || who, who), members: members, events: events, scores: visibleScores, votes: s.list('votes'), wishes: s.list('wishes'),
      settings: s.get('settings', 'main') || defaultSettings(), now: new Date().toISOString() };
  }

  function getEv(s, id) { var e = s.get('events', str(id, 40)); if (!e) throw err(404, 'That meeting is gone'); return e; }
  function cleanSheet(x) {
    var d = defaultSheet(); x = x || {};
    var sc = x.scale || d.scale, min = num(sc.min, 0, 100, 1), max = num(sc.max, 1, 100, 10), step = num(sc.step, 0.5, 50, 1);
    if (max <= min) max = min + 1; if ((max - min) / step > 20) step = Math.ceil((max - min) / 20);
    var cats = (Array.isArray(x.categories) ? x.categories : d.categories).slice(0, 8).map(function (c, i) {
      var label_ = str(c.label, 30) || ('Category ' + (i + 1));
      return { k: str(c.k, 20).replace(/[^a-z0-9_]/gi, '') || ('c' + i), label: label_, weight: num(c.weight, 0, 5, 1), hint: str(c.hint, 60) };
    });
    var seen = {}; cats.forEach(function (c, i) { if (seen[c.k]) c.k = c.k + i; seen[c.k] = 1; });
    if (!cats.length) cats = d.categories;
    return { scale: { min: min, max: max, step: step }, categories: cats, tags: x.tags !== false, notes: x.notes !== false,
      guessStyle: x.guessStyle !== false, guessProof: x.guessProof !== false, guessMatch: x.guessMatch !== false, title: str(x.title, 60) };
  }
  function cleanCand(c, st) {
    var start = str(c.start, 16), end = str(c.end, 16);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start)) throw err(400, 'Pick a date and time');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(end) || end <= start) end = start.slice(0, 11) + ('0' + Math.min(23, +start.slice(11, 13) + 3)).slice(-2) + start.slice(13);
    var why = restCheck(start, end, st); if (why) throw err(400, why);
    return { id: c.id && /^[a-z0-9]{4,24}$/i.test(c.id) ? c.id : uid('c'), start: start, end: end };
  }
  function letters(i) { var s = ''; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

  var A = {};
  A.ping = function (ctx) { return { who: ctx.who.name, at: new Date().toISOString() }; };
  A.getAll = getAll;
  A.updateMe = function (ctx, f) {
    var m = ctx.store.get('members', ctx.who.id); if (!m) throw err(404, 'Not found'); f = f || {};
    if (f.name != null && str(f.name, 40)) m.name = str(f.name, 40);
    if (f.nick != null) m.nick = str(f.nick, 40);
    if (f.bio != null) m.bio = str(f.bio, 200);
    if (f.favorite != null) m.favorite = str(f.favorite, 80);
    if (f.avatar != null) { var a = String(f.avatar); if (a && !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(a)) throw err(400, 'Bad picture'); if (a.length > 40000) throw err(400, 'Picture too big'); m.avatar = a; }
    ctx.store.put('members', m); return publicMember(m, ctx.who);
  };
  /* admin: members */
  function needAdmin(ctx) { if (!isAdmin(ctx.who)) throw err(403, 'Only the club admin can do that'); }
  A.addMember = function (ctx, f) {
    needAdmin(ctx); f = f || {}; var name = str(f.name, 40); if (!name) throw err(400, 'Type a name');
    var all = ctx.store.list('members'), tok = ctx.env.newToken();
    var m = { id: uid('m'), name: name, role: 'member', active: true, color: COLORS[all.length % COLORS.length], joined: new Date().toISOString().slice(0, 10), tokenHash: ctx.env.hash(tok), linkAt: new Date().toISOString() };
    ctx.store.put('members', m); return { member: publicMember(m, ctx.who), token: tok };
  };
  A.updateMember = function (ctx, id, f) {
    needAdmin(ctx); var m = ctx.store.get('members', str(id, 40)); if (!m) throw err(404, 'Not found'); f = f || {};
    if (f.name != null && str(f.name, 40)) m.name = str(f.name, 40);
    if (f.active != null) { if (m.role === 'admin' && !f.active) throw err(400, 'The admin stays active'); m.active = !!f.active; }
    if (f.color && /^#[0-9a-f]{6}$/i.test(f.color)) m.color = f.color;
    if (f.bio != null) m.bio = str(f.bio, 200);
    ctx.store.put('members', m); return publicMember(m, ctx.who);
  };
  A.resetLink = function (ctx, id) {
    needAdmin(ctx); var m = ctx.store.get('members', str(id, 40)); if (!m) throw err(404, 'Not found');
    var tok = ctx.env.newToken(); m.tokenHash = ctx.env.hash(tok); m.linkAt = new Date().toISOString(); ctx.store.put('members', m);
    return { member: publicMember(m, ctx.who), token: tok };
  };
  A.setSettings = function (ctx, f) {
    needAdmin(ctx); var st = ctx.store.get('settings', 'main') || defaultSettings(); f = f || {};
    if (f.groupName != null && str(f.groupName, 60)) st.groupName = str(f.groupName, 60);
    if (f.lat != null) st.lat = num(f.lat, -60, 70, st.lat);
    if (f.lon != null) st.lon = num(f.lon, -180, 180, st.lon);
    if (f.havdalahMin != null) st.havdalahMin = num(f.havdalahMin, 40, 90, 50);
    if (f.sheet) st.sheet = cleanSheet(f.sheet);
    st.id = 'main'; ctx.store.put('settings', st); return st;
  };
  /* meetings */
  A.createEvent = function (ctx, f) {
    needAdmin(ctx); f = f || {}; var st = ctx.store.get('settings', 'main') || defaultSettings();
    var ev = { id: uid('e'), title: str(f.title, 80) || 'Tasting night', theme: str(f.theme, 120), status: 'planning', candidates: [], host: str(f.host, 40), location: str(f.location, 160),
      notes: str(f.notes, 600), bring: [], bottles: [], sheet: cleanSheet(f.sheet || st.sheet), showLineup: true, photos: [], createdAt: new Date().toISOString(), by: ctx.who.id };
    (f.candidates || []).slice(0, 12).forEach(function (c) { ev.candidates.push(cleanCand(c, st)); });
    if (f.past && f.when) { var w = cleanWhen(f.when); ev.when = w; ev.status = 'locked'; }
    ctx.store.put('events', ev); return ev;
  };
  function cleanWhen(w) { var s = str(w.start, 16), e = str(w.end, 16); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) throw err(400, 'Pick a date'); if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(e) || e <= s) e = s; return { start: s, end: e }; }
  A.updateEvent = function (ctx, id, f) {
    var ev = getEv(ctx.store, id); if (!canHost(ctx.who, ev)) throw err(403, 'Only the host or admin can edit this'); f = f || {};
    ['title', 'theme', 'location', 'notes', 'address'].forEach(function (k) { if (f[k] != null) ev[k] = str(f[k], k === 'notes' ? 600 : 160); });
    if (f.host != null && isAdmin(ctx.who)) ev.host = str(f.host, 40);
    if (f.showLineup != null) ev.showLineup = !!f.showLineup;
    if (f.sheet) { if (ev.status === 'live' || ev.status === 'revealed') { if (!f.force) throw err(400, 'Scoring has started. The scoresheet is locked.'); } ev.sheet = cleanSheet(f.sheet); }
    if (f.when && isAdmin(ctx.who)) ev.when = cleanWhen(f.when);
    ctx.store.put('events', ev); return ev;
  };
  A.deleteEvent = function (ctx, id) { needAdmin(ctx); var ev = getEv(ctx.store, id); ctx.store.remove('events', ev.id);
    ctx.store.list('scores').forEach(function (r) { if (r.eid === ev.id) ctx.store.remove('scores', r.id); });
    ctx.store.list('votes').forEach(function (r) { if (r.eid === ev.id) ctx.store.remove('votes', r.id); }); return true; };
  A.addCandidate = function (ctx, id, c) { needAdmin(ctx); var ev = getEv(ctx.store, id), st = ctx.store.get('settings', 'main') || defaultSettings();
    if (ev.candidates.length >= 12) throw err(400, 'Up to 12 dates'); var cc = cleanCand(c || {}, st);
    if (ev.candidates.some(function (x) { return x.start === cc.start; })) throw err(400, 'That date is already on the list');
    ev.candidates.push(cc); ev.candidates.sort(function (a, b) { return a.start.localeCompare(b.start); }); ctx.store.put('events', ev); return ev; };
  A.removeCandidate = function (ctx, id, cid) { needAdmin(ctx); var ev = getEv(ctx.store, id); ev.candidates = ev.candidates.filter(function (c) { return c.id !== cid; }); ctx.store.put('events', ev); return ev; };
  A.vote = function (ctx, id, cid, v) {
    var ev = getEv(ctx.store, id); if (['y', 'm', 'n', ''].indexOf(v) < 0) throw err(400, 'Bad vote');
    if (!ev.candidates.some(function (c) { return c.id === cid; })) throw err(400, 'That date was removed');
    var vid = ev.id + '|' + ctx.who.id, row = ctx.store.get('votes', vid) || { id: vid, eid: ev.id, mid: ctx.who.id, v: {} };
    if (v) row.v[cid] = v; else delete row.v[cid]; row.at = new Date().toISOString(); ctx.store.put('votes', row); return row;
  };
  A.rsvp = function (ctx, id, v) {
    var ev = getEv(ctx.store, id); if (['y', 'm', 'n'].indexOf(v) < 0) throw err(400, 'Bad answer');
    var vid = ev.id + '|' + ctx.who.id, row = ctx.store.get('votes', vid) || { id: vid, eid: ev.id, mid: ctx.who.id, v: {} };
    row.rsvp = v; row.at = new Date().toISOString(); ctx.store.put('votes', row); return row;
  };
  function tally(ev, votes) {
    return ev.candidates.map(function (c) {
      var t = { c: c, y: [], m: [], n: [] };
      votes.forEach(function (r) { if (r.eid === ev.id && r.v && r.v[c.id]) t[r.v[c.id]].push(r.mid); });
      t.score = t.y.length * 2 + t.m.length; return t;
    }).sort(function (a, b) { return b.y.length - a.y.length || b.score - a.score || a.n.length - b.n.length || a.c.start.localeCompare(b.c.start); });
  }
  A.lockDate = function (ctx, id, cid) {
    needAdmin(ctx); var ev = getEv(ctx.store, id), c = ev.candidates.filter(function (x) { return x.id === cid; })[0];
    if (!c) throw err(400, 'Pick one of the dates'); ev.when = { start: c.start, end: c.end, cid: c.id }; if (ev.status === 'planning') ev.status = 'locked';
    ctx.store.put('events', ev); return ev;
  };
  A.unlockDate = function (ctx, id) { needAdmin(ctx); var ev = getEv(ctx.store, id); if (ev.status !== 'locked') throw err(400, 'Too late to reopen the vote'); delete ev.when; ev.status = 'planning'; ctx.store.put('events', ev); return ev; };
  A.bring = function (ctx, id, op, f) {
    var ev = getEv(ctx.store, id); f = f || {}; ev.bring = ev.bring || [];
    if (op === 'add') { var item = str(f.item, 80); if (!item) throw err(400, 'What is it?'); if (ev.bring.length >= 40) throw err(400, 'List is full');
      ev.bring.push({ id: uid('b'), item: item, by: f.claim ? ctx.who.id : '', added: ctx.who.id }); }
    else {
      var it = ev.bring.filter(function (x) { return x.id === f.id; })[0]; if (!it) throw err(404, 'Already gone');
      if (op === 'claim') it.by = ctx.who.id;
      else if (op === 'unclaim') { if (it.by !== ctx.who.id && !canHost(ctx.who, ev)) throw err(403, 'Not yours'); it.by = ''; }
      else if (op === 'remove') { if (it.added !== ctx.who.id && !canHost(ctx.who, ev)) throw err(403, 'Not yours'); ev.bring = ev.bring.filter(function (x) { return x !== it; }); }
      else throw err(400, 'Bad op');
    }
    ctx.store.put('events', ev); return ev;
  };
  /* bottles (sealed) */
  A.setBottles = function (ctx, id, list) {
    var ev = getEv(ctx.store, id); if (!canHost(ctx.who, ev)) throw err(403, 'Only the host sets the lineup');
    if (ev.status === 'revealed') throw err(400, 'Already revealed');
    list = (list || []).slice(0, 12);
    var old = {}; (ev.bottles || []).forEach(function (b) { old[b.id] = b; });
    ev.bottles = list.map(function (b, i) {
      return { id: b.id && old[b.id] ? b.id : uid('k'), code: letters(i), name: str(b.name, 80) || ('Bottle ' + letters(i)), distillery: str(b.distillery, 60), line: str(b.line, 60),
        style: STYLES.indexOf(b.style) >= 0 ? b.style : 'Other', proof: num(b.proof, 0, 200, 0) || '', age: str(b.age, 20), price: str(b.price, 20), notes: str(b.notes, 300), wish: str(b.wish, 40) };
    });
    ctx.store.put('events', ev); return ev;
  };
  A.setStatus = function (ctx, id, status) {
    var ev = getEv(ctx.store, id); if (!canHost(ctx.who, ev)) throw err(403, 'Only the host can do that');
    if (['planning', 'locked', 'live', 'revealed'].indexOf(status) < 0) throw err(400, 'Bad status');
    if (status === 'live' && !(ev.bottles || []).length) throw err(400, 'Add the bottles first');
    if (status === 'revealed') {
      if (!(ev.bottles || []).length) throw err(400, 'No bottles to reveal');
      var R = results(ev, ctx.store.list('scores'), ctx.store.list('members'));
      if (!R.winner) throw err(400, 'No scores yet. Nobody has scored a bottle.');
      ev.revealedAt = new Date().toISOString(); ev.winner = R.winner.id;
      if (!ev.when) ev.when = { start: ev.revealedAt.slice(0, 16), end: ev.revealedAt.slice(0, 16) };
      /* close every open sheet */
      ctx.store.list('scores').forEach(function (r) { if (r.eid === ev.id && !r.done) { r.done = true; ctx.store.put('scores', r); } });
    }
    if (status !== 'revealed') { delete ev.revealedAt; delete ev.winner; }
    ev.status = status; ctx.store.put('events', ev); return ev;
  };
  /* scores: self, or the host typing in a paper sheet (scorer = member id or "g:<name>") */
  A.saveScore = function (ctx, id, scorer, entries, done, guestName) {
    var ev = getEv(ctx.store, id), host = canHost(ctx.who, ev);
    scorer = str(scorer || ctx.who.id, 60);
    if (scorer !== ctx.who.id && !host) throw err(403, 'You can only fill in your own sheet');
    if (ev.status === 'revealed' && !host) throw err(400, 'The bottles are revealed. Scores are final.');
    if (ev.status !== 'live' && !host) throw err(400, 'Scoring opens when the host starts the tasting');
    var isGuest = /^g:/.test(scorer), m = isGuest ? null : ctx.store.get('members', scorer);
    if (!isGuest && !m) throw err(404, 'Unknown taster');
    var sheet = ev.sheet, sc = sheet.scale, rid = ev.id + '|' + scorer, row = ctx.store.get('scores', rid) || { id: rid, eid: ev.id, scorer: scorer, entries: {} };
    if (row.done && !host && done !== false) { /* allow edits until reveal */ }
    var lineup = (ev.bottles || []).map(function (b) { return b.name; });
    Object.keys(entries || {}).forEach(function (bid) {
      var b = (ev.bottles || []).filter(function (x) { return x.id === bid; })[0]; if (!b) return; var e = entries[bid] || {}, v = {};
      sheet.categories.forEach(function (c) { var x = e.v && e.v[c.k]; if (x !== '' && x != null && isFinite(+x)) v[c.k] = num(x, sc.min, sc.max, sc.min); });
      var g = e.guess || {}, guess = {};
      if (STYLES.indexOf(g.style) >= 0) guess.style = g.style;
      if (PROOFS.some(function (p) { return p.k === g.proof; })) guess.proof = g.proof;
      if (g.matchName && lineup.indexOf(g.matchName) >= 0) guess.matchName = g.matchName;
      row.entries[bid] = { v: v, tags: (e.tags || []).slice(0, 16).map(function (t) { return str(t, 24); }).filter(Boolean), note: str(e.note, 400), guess: guess };
    });
    if (isGuest) row.name = str(guestName || scorer.slice(2), 40); else delete row.name;
    if (scorer !== ctx.who.id) { row.paper = true; row.by = ctx.who.id; }
    if (done != null) row.done = !!done;
    row.at = new Date().toISOString(); ctx.store.put('scores', row);
    return row;
  };
  A.removeScore = function (ctx, id, scorer) { var ev = getEv(ctx.store, id); if (!canHost(ctx.who, ev)) throw err(403, 'Host only'); ctx.store.remove('scores', ev.id + '|' + str(scorer, 60)); return true; };
  /* photos */
  A.addPhoto = function (ctx, id, full, thumb, caption) {
    var ev = getEv(ctx.store, id); ev.photos = ev.photos || [];
    if (ev.photos.length >= 60) throw err(400, 'Album is full');
    [full, thumb].forEach(function (d) { if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(String(d || ''))) throw err(400, 'Not a picture'); });
    if (String(full).length > 3500000) throw err(400, 'Picture too big');
    var pid = uid('p'), f = ctx.env.savePhoto(full, ev.id + '-' + pid + '.jpg'), t = ctx.env.savePhoto(thumb, ev.id + '-' + pid + '-t.jpg');
    ev.photos.push({ id: pid, full: f, thumb: t, caption: str(caption, 120), by: ctx.who.id, at: new Date().toISOString() });
    ctx.store.put('events', ev); return ev;
  };
  A.getPhoto = function (ctx, id, pid, which) {
    var ev = getEv(ctx.store, id), p = (ev.photos || []).filter(function (x) { return x.id === pid; })[0]; if (!p) throw err(404, 'Photo gone');
    return { id: p.id, data: ctx.env.loadPhoto(which === 'full' ? p.full : p.thumb) };
  };
  A.removePhoto = function (ctx, id, pid) {
    var ev = getEv(ctx.store, id), p = (ev.photos || []).filter(function (x) { return x.id === pid; })[0]; if (!p) return ev;
    if (p.by !== ctx.who.id && !canHost(ctx.who, ev)) throw err(403, 'Not yours');
    if (ctx.env.trashPhoto) { ctx.env.trashPhoto(p.full); ctx.env.trashPhoto(p.thumb); }
    ev.photos = ev.photos.filter(function (x) { return x !== p; }); if (ev.cover === pid) delete ev.cover; ctx.store.put('events', ev); return ev;
  };
  A.setCover = function (ctx, id, pid) { var ev = getEv(ctx.store, id); if (!canHost(ctx.who, ev)) throw err(403, 'Host only'); ev.cover = str(pid, 40); ctx.store.put('events', ev); return ev; };
  /* wishlist */
  A.addWish = function (ctx, f) {
    f = f || {}; var name = str(f.name, 80); if (!name) throw err(400, 'Which bottle?');
    var w = { id: uid('w'), name: name, style: STYLES.indexOf(f.style) >= 0 ? f.style : '', why: str(f.why, 200), price: str(f.price, 20), by: ctx.who.id, votes: [ctx.who.id], at: new Date().toISOString(), status: 'open' };
    if (ctx.store.list('wishes').length >= 200) throw err(400, 'Wishlist is full'); ctx.store.put('wishes', w); return w;
  };
  A.voteWish = function (ctx, wid) { var w = ctx.store.get('wishes', str(wid, 40)); if (!w) throw err(404, 'Gone'); var i = w.votes.indexOf(ctx.who.id);
    if (i >= 0) w.votes.splice(i, 1); else w.votes.push(ctx.who.id); ctx.store.put('wishes', w); return w; };
  A.setWish = function (ctx, wid, status) { var w = ctx.store.get('wishes', str(wid, 40)); if (!w) throw err(404, 'Gone');
    if (w.by !== ctx.who.id && !isAdmin(ctx.who)) throw err(403, 'Not yours');
    if (status === 'delete') { ctx.store.remove('wishes', w.id); return true; }
    if (['open', 'got', 'tasted'].indexOf(status) < 0) throw err(400, 'Bad'); w.status = status; ctx.store.put('wishes', w); return w; };

  function handle(ctx, action, args) {
    if (!Object.prototype.hasOwnProperty.call(A, action)) throw err(400, 'Unknown action');
    return A[action].apply(null, [ctx].concat(args || []));
  }
  return { handle: handle, ACTIONS: Object.keys(A), STYLES: STYLES, PROOFS: PROOFS, FAMILIES: FAMILIES, TAG_FAMILY: TAG_FAMILY, defaultSheet: defaultSheet, defaultSettings: defaultSettings,
    restCheck: restCheck, dayInfo: dayInfo, toUTC: toUTC, addDays: addDays, dow: dow, entryScore: entryScore, results: results, stats: stats, tally: tally, initials: initials,
    letters: letters, proofBucket: proofBucket, COLORS: COLORS, uid: uid, mean: mean, r1: r1, canHost: canHost, isAdmin: isAdmin, cleanSheet: cleanSheet, err: err };
})();
if (typeof module !== 'undefined') module.exports = CO;
