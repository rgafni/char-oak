/* Demo mode: the real rules engine (core.js) running on made-up data stored in this browser only. */
var Demo = (function () {
  var KEY = 'co.demo.db';
  function load() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function save(db) { localStorage.setItem(KEY, JSON.stringify(db)); }
  function store(db) {
    return {
      list: function (t) { return Object.keys(db[t] || {}).map(function (k) { return JSON.parse(JSON.stringify(db[t][k])); }); },
      get: function (t, id) { var o = (db[t] || {})[id]; return o ? JSON.parse(JSON.stringify(o)) : null; },
      put: function (t, o) { (db[t] = db[t] || {})[o.id] = JSON.parse(JSON.stringify(o)); },
      remove: function (t, id) { if (db[t]) delete db[t][id]; }
    };
  }
  var seedN = 7; function rnd() { seedN = (seedN * 16807) % 2147483647; return (seedN - 1) / 2147483646; }
  function pickN(a, n) { var b = a.slice(), out = []; while (out.length < n && b.length) out.push(b.splice(Math.floor(rnd() * b.length), 1)[0]); return out; }
  function seed() {
    seedN = 7;
    var db = { members: {}, events: {}, scores: {}, votes: {}, wishes: {}, settings: {} }, s = store(db);
    var M = [['m_admin', 'Dovid Stein', 'admin', 0, 'The Nose'], ['m_moshe', 'Moshe Adler', 'member', -1.2, 'Old Grumpy'], ['m_yossi', 'Yossi Brenner', 'member', 1.1, ''], ['m_ari', 'Ari Feld', 'member', 0.3, 'Barrel Boss'], ['m_shmuel', 'Shmuel Kaye', 'member', -0.4, ''], ['m_benny', 'Benny Roth', 'member', 0.7, '']];
    M.forEach(function (m, i) { s.put('members', { id: m[0], name: m[1], role: m[2], active: true, color: CO.COLORS[i], nick: m[4], joined: '2026-01-01', tokenHash: 'demo', bias: m[3] }); });
    var st = CO.defaultSettings(); s.put('settings', st);
    var today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
    var lineups = [
      ['Wheat vs. Rye night', 'Sunday', [['Char & Oak Foundations', 'Char & Oak', 'Foundations', 'Wheated bourbon', 94, 6.9, ['sweet', 'grain']], ['Rittenhouse Bottled-in-Bond', 'Heaven Hill', '', 'Rye', 100, 6.4, ['spice', 'fruit']], ['Weller Special Reserve', 'Buffalo Trace', '', 'Wheated bourbon', 90, 6.1, ['sweet', 'fruit']], ['Char & Oak Farbrengen', 'Char & Oak', 'Farbrengen', 'Bourbon', 107, 7.8, ['sweet', 'wood', 'spice']]]],
      ['Barrel-proof showdown', 'Tuesday', [['Char & Oak 13th Century', 'Char & Oak', '13th Century', 'Bourbon', 118, 8.4, ['wood', 'sweet', 'spice']], ['Booker\u2019s', 'Jim Beam', '', 'Bourbon', 126, 7.6, ['grain', 'wood']], ['Elijah Craig Barrel Proof', 'Heaven Hill', '', 'Bourbon', 124, 7.9, ['sweet', 'wood']], ['Stagg Jr.', 'Buffalo Trace', '', 'Bourbon', 130, 7.2, ['spice', 'wood', 'flaw']], ['Char & Oak Private Barrel #7', 'Char & Oak', 'Private barrel', 'Bourbon', 112, 8.1, ['fruit', 'sweet']]]],
      ['Scotch vs. the world', 'Monday', [['Lagavulin 16', 'Lagavulin', '', 'Single malt Scotch', 86, 7.7, ['smoke', 'fruit']], ['Char & Oak Farbrengen', 'Char & Oak', 'Farbrengen', 'Bourbon', 107, 7.5, ['sweet', 'wood']], ['Redbreast 12', 'Midleton', '', 'Irish', 80, 7.1, ['fruit', 'sweet']], ['Hibiki Harmony', 'Suntory', '', 'Japanese', 86, 6.8, ['floral', 'fruit']]]]
    ];
    var notes = ['Big caramel up front, gentle finish.', 'Hot on entry, opens up with water.', 'Cherry cola and oak. Loved it.', 'Thin for the proof.', 'Dessert in a glass.', 'Pepper bomb.', 'Would buy again.', 'Lots of leather and tobacco, long finish.', 'A bit one-note.', 'Smells better than it tastes.'];
    [75, 45, 16].forEach(function (ago, k) {
      var day = CO.addDays(today, -ago); while (CO.dow(day) === 5 || CO.dow(day) === 6) day = CO.addDays(day, -1);
      var L = lineups[k], eid = 'e_demo' + k, host = M[(k + 1) % M.length][0];
      var bottles = L[2].map(function (b, i) { return { id: 'k' + k + i, code: CO.letters(i), name: b[0], distillery: b[1], line: b[2], style: b[3], proof: b[4], age: '', price: '', notes: i === 0 ? 'Poured from a fresh bottle.' : '', _q: b[5], _f: b[6] }; });
      var ev = { id: eid, title: L[0], theme: '', status: 'revealed', candidates: [], host: host, location: 'Host\u2019s dining room', notes: '', bring: [], showLineup: true, sheet: CO.defaultSheet(), photos: [], createdAt: day + 'T12:00:00Z', when: { start: day + 'T20:00', end: day + 'T23:00' }, revealedAt: day + 'T23:00:00Z' };
      var who = M.filter(function (m, i) { return (i + k) % 6 !== 5; });
      who.forEach(function (m) {
        var entries = {};
        bottles.forEach(function (b) {
          var v = {}; ['nose', 'palate', 'finish', 'overall'].forEach(function (c) { v[c] = Math.max(1, Math.min(10, Math.round(b._q + m[3] + (rnd() - .5) * 2.6))); });
          var fam = b._f.map(function (f) { return CO.FAMILIES.filter(function (x) { return x.k === f; })[0]; }), tags = [];
          fam.forEach(function (f) { pickN(f.tags, 1 + Math.floor(rnd() * 2)).forEach(function (t) { tags.push(t); }); });
          var g = { style: rnd() < .5 ? b.style : CO.STYLES[Math.floor(rnd() * 6)], proof: CO.proofBucket(b.proof + (rnd() - .5) * 22) || 'p2' };
          if (rnd() < .6) g.matchName = rnd() < .5 ? b.name : bottles[Math.floor(rnd() * bottles.length)].name;
          entries[b.id] = { v: v, tags: tags, note: rnd() < .55 ? notes[Math.floor(rnd() * notes.length)] : '', guess: g };
        });
        s.put('scores', { id: eid + '|' + m[0], eid: eid, scorer: m[0], entries: entries, done: true, at: ev.revealedAt });
      });
      ev.bottles = bottles.map(function (b) { var c = Object.assign({}, b); delete c._q; delete c._f; return c; });
      s.put('events', ev);
    });
    /* upcoming: a date poll with candidates that respect Shabbat */
    var cands = [], d = CO.addDays(today, 4);
    while (cands.length < 4) { var c = { id: 'c' + cands.length + 'demo', start: d + 'T20:00', end: d + 'T23:00' }; if (!CO.restCheck(c.start, c.end, st) && CO.dow(d) !== 5) cands.push(c); d = CO.addDays(d, 2); }
    s.put('events', { id: 'e_next', title: 'Char & Oak private barrel pick', theme: 'Four single barrels. One goes home with us.', status: 'planning', candidates: cands, host: 'm_admin', location: 'Dovid\u2019s place', notes: 'Bring your own Glencairn if you have one.', bring: [{ id: 'b1', item: 'Glencairn glasses', by: 'm_admin', added: 'm_admin' }, { id: 'b2', item: 'Dark chocolate', by: '', added: 'm_ari' }], bottles: [], showLineup: true, sheet: CO.defaultSheet(), photos: [], createdAt: new Date().toISOString(), by: 'm_admin' });
    [['m_moshe', ['y', 'm', 'n', 'y']], ['m_yossi', ['y', 'y', 'm', 'n']], ['m_ari', ['m', 'y', 'y', 'n']]].forEach(function (x) { var v = {}; cands.forEach(function (c, i) { v[c.id] = x[1][i]; }); s.put('votes', { id: 'e_next|' + x[0], eid: 'e_next', mid: x[0], v: v }); });
    [['Char & Oak 13th Century, cask strength', 'Bourbon', 'm_ari', ['m_ari', 'm_moshe', 'm_yossi']], ['Springbank 10', 'Single malt Scotch', 'm_moshe', ['m_moshe']], ['Old Forester 1920', 'Bourbon', 'm_benny', ['m_benny', 'm_shmuel']]].forEach(function (w, i) {
      s.put('wishes', { id: 'w' + i, name: w[0], style: w[1], by: w[2], votes: w[3], why: i === 0 ? 'The barrel-proof one everyone keeps talking about.' : '', status: 'open', at: new Date().toISOString() });
    });
    save(db); return db;
  }
  function call(action, args) {
    var db = load() || seed(), who = (db.members || {})[sessionStorage.getItem('co.demo.as') || 'm_admin'] || db.members.m_admin;
    var ctx = { store: store(db), who: who, env: {
      newToken: function () { var a = new Uint8Array(24); crypto.getRandomValues(a); return Array.prototype.map.call(a, function (x) { return ('0' + x.toString(16)).slice(-2); }).join(''); },
      hash: function () { return 'demo'; },
      savePhoto: function (d) { var id = 'ph' + Math.random().toString(36).slice(2, 10); try { localStorage.setItem('co.demo.' + id, d); } catch (e) { throw CO.err(400, 'Demo storage is full'); } return id; },
      loadPhoto: function (id) { return localStorage.getItem('co.demo.' + id) || ''; },
      trashPhoto: function (id) { localStorage.removeItem('co.demo.' + id); } } };
    var out = CO.handle(ctx, action, args);
    save(db); return JSON.parse(JSON.stringify(out == null ? null : out));
  }
  function reset() { Object.keys(localStorage).forEach(function (k) { if (k.indexOf('co.demo') === 0) localStorage.removeItem(k); }); }
  return { call: call, reset: reset };
})();
