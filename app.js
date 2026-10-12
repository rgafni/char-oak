/* Char & Oak Tasting Club: the app. Talks to the private Apps Script API with the member's personal link token,
   or runs fully in this browser with made-up data in demo mode (?demo=1). */
(function () {
  'use strict';
  var C = window.CO_CONFIG || {}, TK = 'choak.k';
  var DEMO = /[?&]demo=1/.test(location.search) || sessionStorage.getItem('co.demo') === '1';
  if (DEMO) sessionStorage.setItem('co.demo', '1');
  var token = null; try { token = localStorage.getItem(TK); } catch (e) {}
  var S = null, LAST = 0, POLL = null, app = document.getElementById('app');
  var UI = { live: {}, seg: {}, drafts: {}, photos: {}, peek: {} };

  /* ---------- utils ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function rid() { return Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4); }
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Motzei Shabbat'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function t12(hm) { var h = +hm.slice(0, 2), m = hm.slice(3, 5); return ((h + 11) % 12 + 1) + (m === '00' ? '' : ':' + m) + (h >= 12 ? 'pm' : 'am'); }
  function fmtDay(w, long) { if (!w) return ''; var d = w.slice(0, 10), p = d.split('-'), dw = CO.dow(d), dn = dw === 6 && +w.slice(11, 13) >= 17 ? 'Motzei Shabbat' : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dw];
    if (long) dn = dw === 6 && +w.slice(11, 13) >= 17 ? 'Motzei Shabbat' : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dw];
    return dn + ', ' + MON[+p[1] - 1] + ' ' + (+p[2]) + (long ? ', ' + p[0] : ''); }
  function fmtWhen(w, long) { if (!w) return ''; return fmtDay(w.start || w, long) + (w.start ? ' \u00b7 ' + t12(w.start.slice(11, 16)) + (w.end && w.end !== w.start ? '\u2013' + t12(w.end.slice(11, 16)) : '') : ''); }
  function nowWall() { var d = new Date(), off = -d.getTimezoneOffset(); return new Date(d.getTime()).toISOString().slice(0, 16); }
  function todayNY() { try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date()); } catch (e) { return new Date().toISOString().slice(0, 10); } }
  function sc(x) { return x == null ? '\u2013' : (Math.round(x * 10) / 10).toFixed(1); }
  function famColor(t) { var f = CO.TAG_FAMILY[t]; return (CO.FAMILIES.filter(function (x) { return x.k === f; })[0] || { color: '#B88B4A' }).color; }
  function member(id) { return (S && S.members || []).filter(function (m) { return m.id === id; })[0] || null; }
  function nameOf(id) { if (/^g:/.test(id || '')) return id.slice(2) + ' (guest)'; var m = member(id); return m ? m.name : 'Someone'; }
  function av(m, cls) { m = m || { name: '?' }; var c = m.color || '#6B4E2E';
    return '<span class="av ' + (cls || '') + '" data-c="' + esc(c) + '" aria-hidden="true">' + (m.avatar ? '<img alt="" src="' + esc(m.avatar) + '">' : esc(CO.initials(m.name))) + '</span>'; }
  function isAdmin() { return S && S.me && S.me.role === 'admin'; }
  function ev(id) { return (S.events || []).filter(function (e) { return e.id === id; })[0] || null; }
  function myVotes(e) { return (S.votes || []).filter(function (v) { return v.eid === e.id && v.mid === S.me.id; })[0] || { v: {} }; }
  function active() { return (S.members || []).filter(function (m) { return m.active !== false; }); }
  function evDate(e) { return (e.when && e.when.start) || (e.revealedAt || '').slice(0, 16) || ''; }

  /* ---------- toast / modal ---------- */
  var tt;
  function toast(msg, undo) {
    var t = $('#toast'); t.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button type="button">Undo</button>' : '');
    t.classList.add('on'); clearTimeout(tt); tt = setTimeout(function () { t.classList.remove('on'); }, undo ? 6000 : 2600);
    if (undo) t.querySelector('button').onclick = function () { t.classList.remove('on'); undo(); };
  }
  function modal(html, onMount) {
    var m = document.createElement('div'); m.className = 'modal'; m.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(m); m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('[data-close]')) close(); });
    function close() { m.remove(); } paint(m); if (onMount) onMount(m.querySelector('.sheet'), close); return close;
  }
  function confirmBox(title, body, yes, cls) {
    return new Promise(function (res) {
      modal('<h2>' + esc(title) + '</h2><p class="muted">' + esc(body) + '</p><div class="btns"><button class="btn" data-close>Cancel</button><button class="btn ' + (cls || 'primary') + '" data-yes>' + esc(yes) + '</button></div>',
        function (el, close) { el.querySelector('[data-close]').onclick = function () { close(); res(false); }; el.querySelector('[data-yes]').onclick = function () { close(); res(true); }; });
    });
  }
  /* CSP-safe dynamic styles: colors and widths are set through the CSSOM, never style="" attributes */
  function paint(root) {
    $$('[data-c]', root).forEach(function (el) { el.style.setProperty('--c', el.getAttribute('data-c')); });
    $$('[data-fam]', root).forEach(function (el) { el.style.setProperty('--fam', el.getAttribute('data-fam')); });
    $$('[data-w]', root).forEach(function (el) { el.style.width = Math.max(0, Math.min(100, +el.getAttribute('data-w'))) + '%'; });
    $$('[data-bg]', root).forEach(function (el) { el.style.background = el.getAttribute('data-bg'); });
  }

  /* ---------- API ---------- */
  function netErr(e) { var x = new Error('No connection'); x.net = true; return x; }
  function call(action, args, id) {
    if (DEMO) return new Promise(function (res, rej) { setTimeout(function () {
      var run = function () { try { res(Demo.call(action, args)); } catch (e) { rej(e); } };
      if (navigator.locks) navigator.locks.request('co-demo-db', function () { run(); }); else run(); }, 120); });
    if (!token) return Promise.reject(Object.assign(new Error('No link'), { status: 401 }));
    var ctl = window.AbortController ? new AbortController() : null, tm = setTimeout(function () { if (ctl) ctl.abort(); }, 45000);
    return fetch(C.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow', referrerPolicy: 'no-referrer', cache: 'no-store', credentials: 'omit',
      signal: ctl ? ctl.signal : undefined, body: JSON.stringify({ k: token, action: action, args: args || [], rid: id }) })
      .then(function (r) { if (!r.ok) { var e = new Error('Server error ' + r.status); e.status = r.status; throw e; } return r.json(); }, function (e) { var x = netErr(e); x.timeout = !!(ctl && ctl.signal.aborted); throw x; })
      .then(function (j) { clearTimeout(tm); if (!j.ok) { var e = new Error(j.error || 'Something went wrong'); e.status = j.status; throw e; } return j.result; }, function (e) { clearTimeout(tm); throw e; });
  }
  function errMsg(e) { return e.timeout ? 'The server is slow. Try again; it never saves twice.' : e.net ? 'No connection. Nothing was saved.' : e.status === 401 ? 'Your link isn\u2019t valid anymore. Ask Roni for a new one.' : (e.message || 'Something went wrong'); }
  /* do an action, then refresh everything */
  function act(action, args, okMsg, opt) {
    opt = opt || {}; var id = rid();
    return call(action, args, id).then(function (r) { if (okMsg) toast(okMsg); return refresh().then(function () { return r; }); })
      .catch(function (e) { toast(errMsg(e)); if (opt.rethrow) throw e; return null; });
  }
  function refresh() {
    return call('getAll', []).then(function (d) { S = d; LAST = Date.now(); try { if (!DEMO) localStorage.setItem('choak.cache', JSON.stringify(d)); } catch (e) {} render(); return d; });
  }

  /* ---------- router ---------- */
  function route() { var h = (location.hash || '#/').replace(/^#\/?/, ''), q = {}; var parts = h.split('?'); (parts[1] || '').split('&').forEach(function (kv) { if (kv) { var p = kv.split('='); q[p[0]] = decodeURIComponent(p[1] || ''); } }); var seg = parts[0].split('/'); return { name: seg[0] || 'home', id: seg[1] || '', sub: seg[2] || '', q: q }; }
  function go(path) { if (location.hash === '#/' + path) render(); else location.hash = '#/' + path; }
  window.addEventListener('hashchange', function () { window.scrollTo(0, 0); render(); });
  var TABS = [['home', 'Home', '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'],
    ['meetings', 'Meetings', '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'],
    ['archive', 'Archive', '<path d="M4 7h16v13H4zM2 3h20v4H2zM10 11h4"/>'],
    ['hall', 'Hall', '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>'],
    ['club', 'Club', '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>']];
  var TAB_OF = { home: 'home', meetings: 'meetings', m: 'meetings', live: 'meetings', archive: 'archive', a: 'archive', hall: 'hall', club: 'club', p: 'club', wish: 'club', admin: 'club', builder: 'club', me: 'club', sheets: 'club', print: 'club' };
  var LOGO = '<img class="logo" src="icons/logo-160.png" alt="Char &amp; Oak" width="60" height="60">';
  var STARS = '<div class="stars" aria-hidden="true">\u2605 \u2605 \u2605</div>';
  function wheat(cls) {
    var g = '', i; for (i = 0; i < 8; i++) { var y = 14 + i * 12; g += '<ellipse cx="' + (30 - i * 1.2) + '" cy="' + y + '" rx="5" ry="9" transform="rotate(-28 ' + (30 - i * 1.2) + ' ' + y + ')" fill="url(#wg)"/><ellipse cx="' + (42 - i * 1.6) + '" cy="' + (y + 5) + '" rx="5" ry="9" transform="rotate(28 ' + (42 - i * 1.6) + ' ' + (y + 5) + ')" fill="url(#wg)"/>'; }
    return '<svg class="wheat ' + (cls || '') + '" viewBox="0 0 70 150" aria-hidden="true"><defs><linearGradient id="wg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F6D27A"/><stop offset=".55" stop-color="#D19A32"/><stop offset="1" stop-color="#8A5A16"/></linearGradient></defs><path d="M36 8 C 34 60, 30 110, 22 148" stroke="#B9852A" stroke-width="2.4" fill="none"/>' + g + '</svg>';
  }
  function badge(cls) { return '<div class="badge ' + (cls || '') + '"><img src="icons/logo-720.png" alt="Char &amp; Oak, est. 2023" width="720" height="720"></div>'; }

  function shell(title, body, opt) {
    opt = opt || {}; var r = route(), tab = TAB_OF[r.name] || 'home', liveEv = (S.events || []).filter(function (e) { return e.status === 'live'; })[0];
    document.body.classList.toggle('full', !!opt.full);
    var top = '<header class="top noprint' + (opt.back ? ' compact' : '') + '">' + (opt.back ? '<button class="back" data-go="' + esc(opt.back) + '" aria-label="Back"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg></button><a class="brand" href="#/">' + LOGO + '<span><b>Char &amp; Oak</b><small>A Whiskey Club</small></span></a>'
      : '<a class="brand" href="#/">' + LOGO + '<span><b>Char &amp; Oak</b><small>' + esc(title || 'A Whiskey Club') + '</small></span></a>')
      + (DEMO ? '<button class="pill amber" data-act="demoAs" aria-label="Switch demo taster">Demo: ' + esc(S.me.name.split(' ')[0]) + '</button>' : '')
      + '<button class="btn ghost sm" data-go="p/' + esc(S.me.id) + '" aria-label="My profile">' + av(S.me, 'sm') + '</button></header>';
    var tabs = '<nav class="tabs noprint" aria-label="Main"><div class="in">' + TABS.map(function (t) {
      return '<button data-go="' + (t[0] === 'home' ? '' : t[0]) + '" class="' + (tab === t[0] ? 'on' : '') + '"' + (tab === t[0] ? ' aria-current="page"' : '') + '><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + t[2] + '</svg>' + t[1] + (t[0] === 'meetings' && liveEv ? '<i class="dot"></i>' : '') + '</button>';
    }).join('') + '</div></nav>';
    app.innerHTML = top + body; 
    var old = $('nav.tabs'); if (old) old.remove(); document.body.insertAdjacentHTML('beforeend', tabs);
    paint(document);
  }

  /* ---------- HOME ---------- */
  function upcoming() { return (S.events || []).filter(function (e) { return e.status !== 'revealed'; }).sort(function (a, b) { var o = { live: 0, locked: 1, planning: 2 }; return o[a.status] - o[b.status] || (evDate(a) || 'z').localeCompare(evDate(b) || 'z'); }); }
  function past() { return (S.events || []).filter(function (e) { return e.status === 'revealed'; }).sort(function (a, b) { return evDate(b).localeCompare(evDate(a)); }); }
  function vHome() {
    var st = CO.stats(S), up = upcoming(), last = past()[0], live = up.filter(function (e) { return e.status === 'live'; })[0], next = up.filter(function (e) { return e.status !== 'live'; })[0];
    var h = '<div class="hero">' + badge('big') + '<p class="eyebrow center">\u2605 A Whiskey Club \u00b7 Est. 2023 \u2605</p></div><h1 class="center">Welcome, ' + esc(S.me.nick || S.me.name.split(' ')[0]) + '.</h1>';
    if (live) h += '<div class="card live"><p class="eyebrow">Live now</p><h2>' + esc(live.title) + '</h2><p class="muted">' + (live.bottles || []).length + ' bottles are poured and sealed. ' + Object.keys(live.progress || {}).length + ' tasters scoring.</p><button class="btn ember block pulse" data-go="live/' + live.id + '">Open my scoresheet</button></div>';
    if (next) h += nextCard(next);
    else if (!live) h += '<div class="card"><p class="eyebrow">Next meeting</p><p class="muted">Nothing planned yet.</p>' + (isAdmin() ? '<button class="btn primary block" data-go="meetings/new">Plan the next meeting</button>' : '<p class="small dim">Roni will post dates soon. Meanwhile, vote on what to pour next.</p><button class="btn block" data-go="wish">Bottle wishlist</button>') + '</div>';
    if (last) { var R = CO.results(last, S.scores, S.members), w = R.winner;
      if (w) h += '<div class="card glow champ">' + wheat('l') + wheat('r') + '<p class="eyebrow">Last champion \u00b7 ' + esc(fmtDay(evDate(last))) + '</p><div class="row"><div class="crown" aria-hidden="true">\uD83D\uDC51</div><div class="grow"><h2>' + esc(w.bottle.name) + '</h2><p class="muted small">' + esc([w.bottle.distillery, w.bottle.style, w.bottle.proof ? w.bottle.proof + ' proof' : ''].filter(Boolean).join(' \u00b7 ')) + '</p></div><div class="oakscore">' + sc(w.mean) + '</div></div><button class="btn block" data-go="a/' + last.id + '">See the full results</button></div>'; }
    h += '<div class="grid3"><div class="stat"><b>' + st.events + '</b><span>tastings</span></div><div class="stat"><b>' + st.bottles.length + '</b><span>bottles judged</span></div><div class="stat"><b>' + (st.clubAvg == null ? '\u2013' : sc(st.clubAvg)) + '</b><span>club average</span></div></div>';
    h += '<div class="sec"><h2>Explore</h2></div><div class="list">'
      + tile('hall', '\uD83C\uDFC6', 'Hall of Fame', 'Champions, leaderboards, palate twins')
      + tile('wish', '\uD83E\uDD43', 'Bottle wishlist', 'Suggest and vote on what to pour next')
      + tile('sheets', '\uD83D\uDDA8\uFE0F', 'Print scoresheets', '5 paper designs to choose from')
      + tile('club', '\uD83E\uDDD1\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1', 'The members', active().length + ' tasters, palate stats and bias')
      + '</div>';
    shell('A Whiskey Club', h);
  }
  function tile(go_, ic, t, s) { return '<button class="item" data-go="' + go_ + '"><span class="medal" aria-hidden="true">' + ic + '</span><span class="grow"><span class="t">' + esc(t) + '</span><br><span class="s">' + esc(s) + '</span></span><span class="chev" aria-hidden="true">\u203A</span></button>'; }
  function nextCard(e) {
    var h = '<div class="card glow"><p class="eyebrow">Next meeting</p><h2>' + esc(e.title) + '</h2>';
    if (e.theme) h += '<p class="muted">' + esc(e.theme) + '</p>';
    if (e.status === 'planning') {
      var mv = myVotes(e), un = e.candidates.filter(function (c) { return !mv.v[c.id]; }).length, best = CO.tally(e, S.votes)[0];
      h += '<p>' + (un ? '<span class="pill ember">' + un + ' date' + (un > 1 ? 's' : '') + ' need your answer</span>' : '<span class="pill ok">You voted</span>') + '</p>' + (best && best.y.length ? '<p class="small muted">Leading: ' + esc(fmtWhen(best.c)) + ' (' + best.y.length + ' yes)</p>' : '') + '<button class="btn primary block" data-go="m/' + e.id + '">' + (un ? 'Vote on dates' : 'See the dates') + '</button>';
    } else {
      var mine = myVotes(e).rsvp;
      h += '<p><b>' + esc(fmtWhen(e.when, true)) + '</b><br><span class="muted">' + esc(e.host ? 'At ' + nameOf(e.host) + '\u2019s' : '') + (e.location ? ' \u00b7 ' + esc(e.location) : '') + '</span></p>'
        + rsvpButtons(e, mine) + '<div class="btns"><button class="btn" data-act="ics" data-id="' + e.id + '">Add to calendar</button><button class="btn" data-go="m/' + e.id + '">Details</button></div>';
    }
    return h + '</div>';
  }
  function rsvpButtons(e, mine) { return '<div class="vote3" role="group" aria-label="Are you coming?">' + [['y', 'Going'], ['m', 'Maybe'], ['n', 'Can\u2019t']].map(function (o) { return '<button class="chip ' + o[0] + (mine === o[0] ? ' on' : '') + '" aria-pressed="' + (mine === o[0]) + '" data-act="rsvp" data-id="' + e.id + '" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>'; }

  /* ---------- MEETINGS ---------- */
  var STATUS = { planning: ['Picking a date', ''], locked: ['Date set', 'ok'], live: ['Live', 'ember'], revealed: ['Revealed', 'amber'] };
  function pill(e) { var s = STATUS[e.status]; return '<span class="pill ' + s[1] + '">' + s[0] + '</span>'; }
  function vMeetings() {
    var up = upcoming(), h = '<h1>Meetings</h1>';
    if (isAdmin()) h += '<button class="btn primary block" data-go="meetings/new">+ Plan a new meeting</button>';
    h += '<div class="sec"><h2>Coming up</h2></div>';
    h += up.length ? '<div class="list">' + up.map(function (e) {
      return '<button class="item" data-go="' + (e.status === 'live' ? 'live/' : 'm/') + e.id + '"><span class="grow"><span class="t">' + esc(e.title) + '</span><br><span class="s">' + (e.when ? esc(fmtWhen(e.when)) : e.candidates.length + ' possible dates') + '</span></span>' + pill(e) + '</button>';
    }).join('') + '</div>' : '<div class="empty"><span class="big">No meetings planned</span>' + (isAdmin() ? 'Tap \u201cPlan a new meeting\u201d to propose dates.' : 'You\u2019ll see the date poll here.') + '</div>';
    var p = past().slice(0, 3);
    if (p.length) h += '<div class="sec"><h2>Recently</h2><button class="btn ghost sm" data-go="archive">Archive \u203A</button></div><div class="list">' + p.map(function (e) { return '<button class="item" data-go="a/' + e.id + '"><span class="grow"><span class="t">' + esc(e.title) + '</span><br><span class="s">' + esc(fmtDay(evDate(e))) + '</span></span>' + pill(e) + '</button>'; }).join('') + '</div>';
    shell('Meetings', h);
  }
  function memberOptions(sel, blank) { return (blank ? '<option value="">' + esc(blank) + '</option>' : '') + active().map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === sel ? ' selected' : '') + '>' + esc(m.name) + '</option>'; }).join(''); }
  function vNewMeeting() {
    if (!isAdmin()) return go('meetings');
    var d = UI.newEv = UI.newEv || { cands: [] };
    var h = '<h1>Plan a meeting</h1><p class="muted">Propose a few dates. Everyone answers Yes / Maybe / No, then you lock the best one.</p>'
      + '<label class="f" for="nt">Name</label><input id="nt" maxlength="80" placeholder="e.g. Barrel-proof bourbon night" value="' + esc(d.title || '') + '">'
      + '<label class="f" for="nth">Theme (optional)</label><input id="nth" maxlength="120" placeholder="e.g. 13th Century vs. the world" value="' + esc(d.theme || '') + '">'
      + '<label class="f" for="nho">Host</label><select id="nho">' + memberOptions(d.host || S.me.id, 'Decide later') + '</select>'
      + '<label class="f" for="nlo">Location</label><input id="nlo" maxlength="160" placeholder="Whose home, or an address" value="' + esc(d.location || '') + '">'
      + '<div class="sec"><h3>Candidate dates</h3></div>' + candAdder()
      + '<div class="list" id="clist">' + d.cands.map(function (c, i) { return '<div class="item"><span class="grow"><span class="t">' + esc(fmtWhen(c)) + '</span></span><button class="btn sm danger" data-act="ncDel" data-i="' + i + '">Remove</button></div>'; }).join('') + '</div>'
      + '<div class="btns"><button class="btn" data-go="meetings">Cancel</button><button class="btn primary" data-act="createEv">Post the date poll</button></div>';
    shell('', h, { back: 'meetings', full: true });
    wireCand();
  }
  function candAdder(eid) {
    var d0 = CO.addDays(todayNY(), 7);
    return '<div class="card"><div class="grid2"><div><label class="f" for="cd">Day</label><input id="cd" type="date" value="' + d0 + '" min="' + todayNY() + '"></div><div><label class="f" for="ct">Starts</label><input id="ct" type="time" value="20:00" step="900"></div></div>'
      + '<label class="f">Length</label><div class="chips" id="clen">' + [2, 3, 4].map(function (n) { return '<button class="chip' + (n === 3 ? ' on' : '') + '" data-len="' + n + '">' + n + ' hours</button>'; }).join('') + '</div>'
      + '<div id="cinfo" class="small muted"></div><div id="cwarn"></div>'
      + '<button class="btn block" data-act="' + (eid ? 'addCand' : 'ncAdd') + '"' + (eid ? ' data-id="' + eid + '"' : '') + ' id="caddbtn">+ Add this date</button></div>';
  }
  function candValue() {
    var d = $('#cd').value, t = $('#ct').value || '20:00', len = +($('#clen .chip.on') || { getAttribute: function () { return 3; } }).getAttribute('data-len');
    if (!d) return null; var s = d + 'T' + t.slice(0, 5), eh = +t.slice(0, 2) + len, e = eh >= 24 ? s.slice(0, 11) + '23:59' : d + 'T' + ('0' + eh).slice(-2) + t.slice(2, 5);
    return { start: s, end: e };
  }
  function wireCand() {
    var upd = function () {
      var c = candValue(), w = $('#cwarn'), inf = $('#cinfo'); if (!c) return;
      var why = CO.restCheck(c.start, c.end, S.settings), di = CO.dayInfo(c.start.slice(0, 10), S.settings);
      inf.textContent = fmtDay(c.start, true) + ' \u00b7 sunset ' + di.sunset + (di.rest ? ' \u00b7 havdalah ' + di.havdalah : '') + (di.restTomorrow ? ' \u00b7 candles ' + di.candles : '');
      w.innerHTML = why ? '<div class="warn">\u26D4 ' + esc(why) + '</div>' : '<div class="okmsg">\u2713 ' + esc(fmtWhen(c)) + ' works.</div>';
      $('#caddbtn').disabled = !!why;
    };
    ['#cd', '#ct'].forEach(function (s) { var el = $(s); if (el) { el.addEventListener('input', upd); el.addEventListener('change', upd); } });
    $$('#clen .chip').forEach(function (b) { b.onclick = function () { $$('#clen .chip').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); upd(); }; });
    if ($('#cd')) upd();
  }
  function saveNewForm() { var d = UI.newEv; d.title = $('#nt').value; d.theme = $('#nth').value; d.host = $('#nho').value; d.location = $('#nlo').value; }

  function vMeeting(id) {
    var e = ev(id); if (!e) return notFound();
    if (e.status === 'revealed') return go('a/' + id);
    var host = e.canHost, h = '<div class="row between"><p class="eyebrow">' + esc(e.status === 'planning' ? 'Date poll' : 'Meeting') + '</p>' + pill(e) + '</div><h1>' + esc(e.title) + '</h1>' + (e.theme ? '<p class="muted">' + esc(e.theme) + '</p>' : '');
    if (e.status === 'live') h += '<div class="card live"><h3>The tasting is live</h3><button class="btn ember block pulse" data-go="live/' + e.id + '">Open the scoresheet</button></div>';
    /* date */
    if (e.status === 'planning') {
      var T = CO.tally(e, S.votes), mv = myVotes(e), voters = {}; (S.votes || []).forEach(function (v) { if (v.eid === e.id && Object.keys(v.v || {}).length) voters[v.mid] = 1; });
      var missing = active().filter(function (m) { return !voters[m.id]; });
      h += '<div class="sec"><h2>When works?</h2><span class="small muted">' + Object.keys(voters).length + ' of ' + active().length + ' answered</span></div>';
      if (!e.candidates.length) h += '<div class="empty">No dates yet.</div>';
      h += e.candidates.slice().sort(function (a, b) { return a.start.localeCompare(b.start); }).map(function (c) {
        var t = T.filter(function (x) { return x.c.id === c.id; })[0], best = T[0] && T[0].c.id === c.id && t.y.length, my = mv.v[c.id], n = active().length || 1;
        return '<div class="card' + (best ? ' glow' : '') + '"><div class="row between"><div><b>' + esc(fmtDay(c.start, true)) + '</b><br><span class="muted">' + esc(t12(c.start.slice(11, 16)) + '\u2013' + t12(c.end.slice(11, 16))) + '</span></div>' + (best ? '<span class="pill amber">Best date</span>' : '') + '</div>'
          + '<div class="row small" ><span class="grow"><div class="bar y"><i data-w="' + (t.y.length / n * 100) + '"></i></div></span><span>' + t.y.length + ' yes \u00b7 ' + t.m.length + ' maybe \u00b7 ' + t.n.length + ' no</span></div>'
          + '<div class="avs">' + t.y.map(function (x) { return av(member(x), 'sm'); }).join('') + '</div>'
          + '<div class="vote3" role="group" aria-label="Your answer for ' + esc(fmtDay(c.start)) + '">' + [['y', 'Yes'], ['m', 'Maybe'], ['n', 'No']].map(function (o) { return '<button class="chip ' + o[0] + (my === o[0] ? ' on' : '') + '" aria-pressed="' + (my === o[0]) + '" data-act="vote" data-id="' + e.id + '" data-cid="' + c.id + '" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') + '</div>'
          + (isAdmin() ? '<div class="btns"><button class="btn sm primary" data-act="lock" data-id="' + e.id + '" data-cid="' + c.id + '">Lock this date</button><button class="btn sm danger" data-act="rmCand" data-id="' + e.id + '" data-cid="' + c.id + '">Remove</button></div>' : '') + '</div>';
      }).join('');
      if (missing.length) h += '<p class="small muted">Still waiting on: ' + missing.map(function (m) { return esc(m.name); }).join(', ') + '</p>';
      if (isAdmin()) h += '<details class="card"><summary class="btn ghost block">+ Add another date</summary>' + candAdder(e.id) + '</details>';
    } else if (e.when) {
      var rs = (S.votes || []).filter(function (v) { return v.eid === e.id; }), going = rs.filter(function (v) { return v.rsvp === 'y'; });
      h += '<div class="card glow"><p class="eyebrow">Locked in</p><h2>' + esc(fmtWhen(e.when, true)) + '</h2>' + rsvpButtons(e, myVotes(e).rsvp)
        + '<p class="small muted">' + going.length + ' going' + (going.length ? ': ' + going.map(function (v) { return esc(nameOf(v.mid)); }).join(', ') : '') + '</p>'
        + '<div class="btns"><button class="btn" data-act="ics" data-id="' + e.id + '">\uD83D\uDCC5 Add to calendar</button>' + (isAdmin() && e.status === 'locked' ? '<button class="btn ghost" data-act="unlock" data-id="' + e.id + '">Reopen the vote</button>' : '') + '</div></div>';
    }
    /* details */
    h += '<div class="sec"><h2>Where</h2>' + (host ? '<button class="btn ghost sm" data-act="editEv" data-id="' + e.id + '">Edit</button>' : '') + '</div><div class="card"><div class="row">' + (e.host ? av(member(e.host)) : '') + '<div class="grow"><b>' + esc(e.host ? 'Host: ' + nameOf(e.host) : 'Host to be decided') + '</b><br><span class="muted">' + esc(e.location || 'Location to be decided') + '</span></div></div>'
      + (e.location ? '<div class="btns"><a class="btn sm" rel="noreferrer noopener" target="_blank" href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(e.location) + '">Open in Maps</a></div>' : '') + (e.notes ? '<p class="muted">' + esc(e.notes) + '</p>' : '') + '</div>';
    /* bring */
    h += '<div class="sec"><h2>Who\u2019s bringing what</h2></div><div class="card"><div class="list">' + (e.bring || []).map(function (b) {
      var mine = b.by === S.me.id;
      return '<div class="item"><span class="grow"><span class="t">' + esc(b.item) + '</span><br><span class="s">' + (b.by ? esc(nameOf(b.by)) : 'Nobody yet') + '</span></span>'
        + (b.by ? (mine || host ? '<button class="btn sm ghost" data-act="bring" data-op="unclaim" data-id="' + e.id + '" data-bid="' + b.id + '">' + (mine ? 'Not me' : 'Clear') + '</button>' : '') : '<button class="btn sm primary" data-act="bring" data-op="claim" data-id="' + e.id + '" data-bid="' + b.id + '">I\u2019ll bring it</button>')
        + ((b.added === S.me.id || host) ? '<button class="btn sm danger" aria-label="Remove ' + esc(b.item) + '" data-act="bring" data-op="remove" data-id="' + e.id + '" data-bid="' + b.id + '">\u2715</button>' : '') + '</div>';
    }).join('') + '</div><div class="row" ><input id="bri" maxlength="80" placeholder="Glencairns, water, crackers, a bottle\u2026" class="grow"><button class="btn primary" data-act="bringAdd" data-id="' + e.id + '">Add</button></div>'
      + '<div class="chips">' + ['Glencairn glasses', 'Water & droppers', 'Crackers', 'Dark chocolate', 'Cigars'].map(function (s) { return '<button class="chip tag" data-act="bringQuick" data-id="' + e.id + '" data-item="' + esc(s) + '">+ ' + esc(s) + '</button>'; }).join('') + '</div></div>';
    /* lineup */
    h += '<div class="sec"><h2>The lineup</h2>' + (host ? '<button class="btn ghost sm" data-go="m/' + e.id + '/lineup">Edit bottles</button>' : '') + '</div>';
    if (host) {
      var pk = UI.peek[e.id];
      h += '<div class="card">' + ((e.bottles || []).length ? '<div class="list">' + e.bottles.map(function (b) { return '<div class="item"><span class="glass"><span class="code">' + b.code + '</span></span><span class="grow"><span class="t">' + (pk ? esc(b.name) : 'Sealed') + '</span><br><span class="s">' + (pk ? esc([b.distillery, b.style, b.proof ? b.proof + ' proof' : ''].filter(Boolean).join(' \u00b7 ')) : 'Tap \u201cPeek\u201d to see it') + '</span></span></div>'; }).join('') + '</div>'
        + '<div class="btns"><button class="btn ghost sm" data-act="peek" data-id="' + e.id + '">' + (pk ? 'Hide names' : '\uD83D\uDC41 Peek (host only)') + '</button></div>' : '<p class="muted">No bottles yet. Add them before the tasting, then they\u2019re sealed as A, B, C\u2026</p><button class="btn primary block" data-go="m/' + e.id + '/lineup">Set up the bottles</button>') + '</div>';
    } else h += '<div class="card"><p>' + ((e.bottles || []).length ? '<b>' + e.bottles.length + ' bottles</b>, sealed as ' + e.bottles.map(function (b) { return b.code; }).join(', ') + '. No peeking.' : 'The host will pour a sealed lineup.') + '</p>' + (e.lineup && e.lineup.length ? '<p class="small muted">Tonight\u2019s lineup (in no order): ' + e.lineup.map(function (l) { return esc(l.name); }).join(' \u00b7 ') + '. Match them to the glasses for 3 points each.</p>' : '') + '</div>';
    /* scoresheet + tasting */
    var shS = e.sheet;
    h += '<div class="sec"><h2>Scoresheet</h2></div><div class="card"><p class="muted">' + shS.categories.map(function (c) { return esc(c.label) + ' \u00d7' + c.weight; }).join(' \u00b7 ') + '<br>Scale ' + shS.scale.min + '\u2013' + shS.scale.max + '. Every score becomes an Oak Score out of 100.</p><div class="btns">'
      + (host && e.status !== 'live' ? '<button class="btn" data-go="builder/' + e.id + '">Customize</button>' : '') + '<button class="btn" data-go="print/' + e.id + '">\uD83D\uDDA8 Print sheets</button></div></div>';
    if (host) {
      h += '<div class="sec"><h2>Host controls</h2></div><div class="card">';
      if (e.status !== 'live') h += '<p class="muted">When the glasses are poured, start the tasting. Everyone\u2019s phone opens the scoresheet.</p><button class="btn ember block" data-act="status" data-id="' + e.id + '" data-s="live"' + ((e.bottles || []).length ? '' : ' disabled') + '>\uD83D\uDD25 Start the live tasting</button>';
      else h += '<button class="btn block" data-act="status" data-id="' + e.id + '" data-s="' + (e.when ? 'locked' : 'planning') + '">Pause the tasting</button>';
      if (isAdmin()) h += '<div class="btns"><button class="btn danger sm" data-act="delEv" data-id="' + e.id + '">Delete this meeting</button></div>';
      h += '</div>';
    }
    shell('', h, { back: 'meetings' });
    if ($('#cd')) wireCand();
  }
  function editEventModal(e) {
    modal('<h2>Edit meeting</h2><label class="f" for="et">Name</label><input id="et" maxlength="80" value="' + esc(e.title) + '"><label class="f" for="eth">Theme</label><input id="eth" maxlength="120" value="' + esc(e.theme || '') + '">'
      + (isAdmin() ? '<label class="f" for="eho">Host</label><select id="eho">' + memberOptions(e.host, 'Decide later') + '</select>' : '')
      + '<label class="f" for="elo">Location</label><input id="elo" maxlength="160" value="' + esc(e.location || '') + '"><label class="f" for="eno">Notes for everyone</label><textarea id="eno" maxlength="600">' + esc(e.notes || '') + '</textarea>'
      + '<label class="f">Show tonight\u2019s lineup names (unordered) for the match game?</label><div class="chips"><button class="chip' + (e.showLineup ? ' on' : '') + '" data-sl="1">Yes</button><button class="chip' + (!e.showLineup ? ' on' : '') + '" data-sl="0">No, fully blind</button></div>'
      + '<div class="btns"><button class="btn" data-close>Cancel</button><button class="btn primary" id="esave">Save</button></div>', function (el, close) {
      var sl = e.showLineup; $$('[data-sl]', el).forEach(function (b) { b.onclick = function () { sl = b.getAttribute('data-sl') === '1'; $$('[data-sl]', el).forEach(function (x) { x.classList.toggle('on', x === b); }); }; });
      $('#esave', el).onclick = function () { var f = { title: $('#et', el).value, theme: $('#eth', el).value, location: $('#elo', el).value, notes: $('#eno', el).value, showLineup: sl }; if ($('#eho', el)) f.host = $('#eho', el).value; close(); act('updateEvent', [e.id, f], 'Saved'); };
    });
  }
  /* lineup editor (host) */
  function vLineup(id) {
    var e = ev(id); if (!e || !e.canHost) return go('m/' + id);
    var L = UI.lineup && UI.lineup.id === id ? UI.lineup : (UI.lineup = { id: id, list: (e.bottles || []).map(function (b) { return Object.assign({}, b); }) });
    var h = '<p class="eyebrow">Host only \u00b7 sealed</p><h1>Bottles</h1><p class="muted">Pour in this order. Tasters only see the letters until you reveal.</p>';
    h += L.list.map(function (b, i) {
      return '<div class="card"><div class="row between"><div class="glass"><span class="code">' + CO.letters(i) + '</span></div><div class="row"><button class="btn sm ghost" aria-label="Move up" data-act="lnMove" data-i="' + i + '" data-d="-1"' + (i ? '' : ' disabled') + '>\u2191</button><button class="btn sm ghost" aria-label="Move down" data-act="lnMove" data-i="' + i + '" data-d="1"' + (i < L.list.length - 1 ? '' : ' disabled') + '>\u2193</button><button class="btn sm danger" data-act="lnDel" data-i="' + i + '">Remove</button></div></div>'
        + '<label class="f">Bottle name</label><input data-ln="name" data-i="' + i + '" maxlength="80" list="lnames" value="' + esc(b.name || '') + '" placeholder="e.g. Char & Oak 13th Century">'
        + '<div class="grid2"><div><label class="f">Distillery / brand</label><input data-ln="distillery" data-i="' + i + '" maxlength="60" value="' + esc(b.distillery || '') + '"></div><div><label class="f">Line</label><input data-ln="line" data-i="' + i + '" maxlength="60" list="llines" value="' + esc(b.line || '') + '"></div></div>'
        + '<label class="f">Style</label><select data-ln="style" data-i="' + i + '">' + CO.STYLES.map(function (s) { return '<option' + (b.style === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>'
        + '<div class="grid3"><div><label class="f">Proof</label><input data-ln="proof" data-i="' + i + '" inputmode="decimal" maxlength="5" value="' + esc(b.proof || '') + '"></div><div><label class="f">Age</label><input data-ln="age" data-i="' + i + '" maxlength="20" value="' + esc(b.age || '') + '"></div><div><label class="f">Price</label><input data-ln="price" data-i="' + i + '" maxlength="20" value="' + esc(b.price || '') + '"></div></div>'
        + '<label class="f">Host notes (shown after the reveal)</label><input data-ln="notes" data-i="' + i + '" maxlength="300" value="' + esc(b.notes || '') + '"></div>';
    }).join('');
    var wl = (S.wishes || []).filter(function (w) { return w.status !== 'tasted'; }).sort(function (a, b) { return b.votes.length - a.votes.length; }).slice(0, 6);
    h += '<button class="btn block" data-act="lnAdd">+ Add bottle ' + CO.letters(L.list.length) + '</button>';
    if (wl.length) h += '<p class="small muted">From the wishlist:</p><div class="chips">' + wl.map(function (w) { return '<button class="chip tag" data-act="lnWish" data-wid="' + w.id + '">+ ' + esc(w.name) + ' (' + w.votes.length + '\u2605)</button>'; }).join('') + '</div>';
    h += '<datalist id="llines"><option>13th Century</option><option>Farbrengen</option><option>Foundations</option><option>Private barrel</option></datalist><datalist id="lnames"><option>Char &amp; Oak 13th Century</option><option>Char &amp; Oak Farbrengen</option><option>Char &amp; Oak Foundations</option><option>Char &amp; Oak Private Barrel</option></datalist>';
    h += '<div class="sticky-foot"><button class="btn" data-go="m/' + id + '">Cancel</button><button class="btn primary" data-act="lnSave">Save &amp; seal</button></div>';
    shell('', h, { back: 'm/' + id, full: true });
    $$('[data-ln]').forEach(function (inp) { inp.addEventListener('input', function () { L.list[+inp.getAttribute('data-i')][inp.getAttribute('data-ln')] = inp.value; }); inp.addEventListener('change', function () { L.list[+inp.getAttribute('data-i')][inp.getAttribute('data-ln')] = inp.value; }); });
  }

  /* ---------- LIVE TASTING ---------- */
  function liveState(e, scorer) {
    var key = e.id + '|' + scorer, L = UI.live[key];
    if (!L) {
      var row = (S.scores || []).filter(function (r) { return r.eid === e.id && r.scorer === scorer; })[0];
      L = UI.live[key] = { i: 0, entries: row ? JSON.parse(JSON.stringify(row.entries || {})) : {}, done: row ? !!row.done : false, dirty: false, saved: row ? 'Saved' : '' };
    }
    return L;
  }
  function vLive(id, q) {
    var e = ev(id); if (!e) return notFound();
    if (e.status === 'revealed' && !q.as) return go('reveal/' + id);
    if (e.status !== 'live' && !e.canHost) return go('m/' + id);
    var scorer = (e.canHost && q.as) || S.me.id, paper = scorer !== S.me.id, seg = UI.seg[id] || (paper ? 'sheet' : 'sheet');
    var h = '<div class="row between"><p class="eyebrow">' + (paper ? 'Paper sheet for ' + esc(nameOf(scorer)) : 'Live blind tasting') + '</p>' + pill(e) + '</div><h1>' + esc(e.title) + '</h1>';
    if (!paper) h += '<div class="seg" role="tablist"><button role="tab" class="' + (seg === 'sheet' ? 'on' : '') + '" data-act="seg" data-id="' + id + '" data-s="sheet">My scoresheet</button><button role="tab" class="' + (seg === 'board' ? 'on' : '') + '" data-act="seg" data-id="' + id + '" data-s="board">Live board</button></div>';
    if (e.status !== 'live' && !paper) h += '<div class="banner">Scoring opens when you start the tasting. You can test the sheet below.</div>';
    h += (seg === 'board' && !paper) ? board(e) : sheetView(e, scorer, paper);
    shell('', h, { back: paper ? (e.status === 'revealed' ? 'a/' + id : 'live/' + id) : 'm/' + id, full: true });
  }
  function sheetView(e, scorer, paper) {
    var L = liveState(e, scorer), B = e.bottles || [], sh = e.sheet; if (L.i >= B.length) L.i = 0;
    var b = B[L.i]; if (!b) return '<div class="empty">No bottles yet.</div>';
    var en = L.entries[b.id] = L.entries[b.id] || { v: {}, tags: [], note: '', guess: {} }, score = CO.entryScore(en, sh);
    var vals = []; for (var x = sh.scale.min; x <= sh.scale.max + 1e-9; x += sh.scale.step) vals.push(Math.round(x * 100) / 100);
    var cols = vals.length <= 5 ? 'n' + vals.length : vals.length === 6 ? 'n6' : vals.length === 7 ? 'n7' : vals.length % 5 === 0 ? '' : vals.length % 4 === 0 ? 'n4' : vals.length % 6 === 0 ? 'n6' : '';
    var h = '<div class="bottles" role="tablist" aria-label="Bottles">' + B.map(function (bb, i) {
      var ok = L.entries[bb.id] && Object.keys(L.entries[bb.id].v || {}).length >= sh.categories.length;
      return '<button class="chip' + (i === L.i ? ' on' : '') + '" role="tab" aria-selected="' + (i === L.i) + '" aria-label="Bottle ' + bb.code + (ok ? ', scored' : '') + '" data-act="bsel" data-i="' + i + '" data-id="' + e.id + '" data-sc="' + esc(scorer) + '">' + bb.code + (ok ? '<span class="ck">\u2713</span>' : '') + '</button>';
    }).join('') + '</div>';
    h += '<div class="card"><div class="row between"><div class="glass"><span class="code">' + b.code + '</span><div><b>Glass ' + b.code + '</b><br><span class="small muted">' + (L.i + 1) + ' of ' + B.length + '</span></div></div><div class="center"><div class="oakscore" id="oak">' + (score == null ? '\u2013' : Math.round(score)) + '</div><span class="small muted">Oak Score</span></div></div>';
    h += sh.categories.map(function (c) {
      return '<div class="cat"><div class="row between"><b>' + esc(c.label) + '</b><span class="small dim">' + esc(c.hint || '') + (c.weight !== 1 ? ' \u00b7 \u00d7' + c.weight : '') + '</span></div><div class="scale ' + cols + '" role="radiogroup" aria-label="' + esc(c.label) + '">'
        + vals.map(function (v) { var on = en.v[c.k] === v; return '<button class="chip' + (on ? ' on' : '') + '" role="radio" aria-checked="' + on + '" data-act="sv" data-k="' + esc(c.k) + '" data-v="' + v + '">' + v + '</button>'; }).join('') + '</div></div>';
    }).join('') + '</div>';
    if (sh.tags) h += '<div class="card"><h3>What do you taste?</h3>' + CO.FAMILIES.map(function (f) {
      return '<div class="fam"><div data-fam="' + f.color + '" class="famh">' + esc(f.label) + '</div><div class="chips">' + f.tags.map(function (t) { var on = en.tags.indexOf(t) >= 0; return '<button class="chip tag' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-fam="' + f.color + '" data-act="tg" data-t="' + esc(t) + '">' + esc(t) + '</button>'; }).join('') + '</div></div>';
    }).join('') + '</div>';
    if (sh.notes) h += '<div class="card"><label class="f" for="nn">Your notes on ' + b.code + '</label><textarea id="nn" maxlength="400" placeholder="Rich caramel up front, a long peppery finish\u2026">' + esc(en.note || '') + '</textarea></div>';
    var gs = sh.guessStyle, gp = sh.guessProof, gm = sh.guessMatch && ((e.lineup && e.lineup.length) || (e.canHost && e.showLineup));
    if (gs || gp || gm) {
      h += '<div class="card"><h3>\uD83C\uDFAF Guess the bottle</h3><p class="small muted">Style right: 2 pts. Proof range right: 2 (one off: 1). Name it: 3.</p>';
      if (gs) h += '<label class="f">Style</label><div class="chips">' + CO.STYLES.map(function (s) { var on = en.guess.style === s; return '<button class="chip tag' + (on ? ' on' : '') + '" data-act="gs" data-v="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') + '</div>';
      if (gp) h += '<label class="f">Proof</label><div class="chips">' + CO.PROOFS.map(function (p) { var on = en.guess.proof === p.k; return '<button class="chip tag' + (on ? ' on' : '') + '" data-act="gp" data-v="' + p.k + '">' + esc(p.label) + '</button>'; }).join('') + '</div>';
      var lu = e.lineup && e.lineup.length ? e.lineup.map(function (l) { return l.name; }) : (e.bottles || []).map(function (x) { return x.name; }).filter(Boolean).sort();
      if (gm) h += '<label class="f">Which bottle is it?</label><div class="chips">' + lu.map(function (n) { var on = en.guess.matchName === n; return '<button class="chip tag' + (on ? ' on' : '') + '" data-act="gm" data-v="' + esc(n) + '">' + esc(n) + '</button>'; }).join('') + '</div>';
      h += '</div>';
    }
    var last = L.i >= B.length - 1;
    h += '<div class="sticky-foot"><span class="small muted" id="savest">' + esc(L.saved || '') + '</span>' + (L.i > 0 ? '<button class="btn" data-act="bsel" data-id="' + e.id + '" data-sc="' + esc(scorer) + '" data-i="' + (L.i - 1) + '">\u2190 ' + B[L.i - 1].code + '</button>' : '')
      + (last ? '<button class="btn primary" data-act="finish" data-id="' + e.id + '" data-sc="' + esc(scorer) + '">' + (paper ? 'Save sheet' : L.done ? 'Update my sheet' : 'I\u2019m done') + '</button>' : '<button class="btn primary" data-act="bsel" data-id="' + e.id + '" data-sc="' + esc(scorer) + '" data-i="' + (L.i + 1) + '">Next: ' + B[L.i + 1].code + ' \u2192</button>') + '</div>';
    UI.cur = { e: e, scorer: scorer, b: b, L: L };
    return h;
  }
  var saveT = null;
  function queueSave(now) {
    var c = UI.cur; if (!c) return; c.L.dirty = true; c.L.saved = 'Saving\u2026'; var st = $('#savest'); if (st) st.textContent = 'Saving\u2026';
    clearTimeout(saveT); saveT = setTimeout(function () { flush(c); }, now ? 0 : 1200);
  }
  function flush(c, done) {
    c = c || UI.cur; if (!c) return Promise.resolve();
    var guest = /^g:/.test(c.scorer) ? c.scorer.slice(2) : '';
    return call('saveScore', [c.e.id, c.scorer, c.L.entries, done == null ? undefined : done, guest], rid()).then(function (row) {
      c.L.dirty = false; c.L.saved = 'Saved \u2713'; if (done != null) c.L.done = done; var st = $('#savest'); if (st) st.textContent = 'Saved \u2713';
      S.scores = (S.scores || []).filter(function (r) { return r.id !== row.id; }).concat([row]); return row;
    }).catch(function (e) { c.L.saved = 'Not saved'; var st = $('#savest'); if (st) st.textContent = 'Not saved'; toast(errMsg(e)); throw e; });
  }
  function board(e) {
    var P = e.progress || {}, B = e.bottles || [], rows = active().map(function (m) { return { id: m.id, name: m.name, m: m }; });
    Object.keys(P).forEach(function (k) { if (/^g:/.test(k)) rows.push({ id: k, name: P[k].name || k.slice(2), guest: true }); });
    var started = rows.filter(function (r) { return P[r.id]; }), done = rows.filter(function (r) { return P[r.id] && P[r.id].done; });
    var h = '<div class="grid3"><div class="stat"><b>' + started.length + '</b><span>scoring</span></div><div class="stat"><b>' + done.length + '</b><span>done</span></div><div class="stat"><b>' + B.length + '</b><span>bottles</span></div></div>';
    h += '<div class="card scroll-x"><table class="board"><thead><tr><th></th>' + B.map(function (b) { return '<th scope="col">' + b.code + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(function (r) {
      var p = P[r.id] || { b: [] };
      return '<tr><td class="nm">' + (r.m ? av(r.m, 'sm') + ' ' : '') + esc(r.name.split(' ')[0]) + (p.done ? ' \u2705' : '') + (p.paper ? ' \uD83D\uDCC4' : '') + '</td>' + B.map(function (b) { var y = (p.b || []).indexOf(b.id) >= 0; return '<td class="' + (y ? (p.done ? 'done' : 'y') : '') + '" aria-label="' + (y ? 'scored' : 'not yet') + '">' + (y ? '\u2713' : '') + '</td>'; }).join('') + '</tr>';
    }).join('') + '</tbody></table><p class="small dim">Scores stay hidden until the reveal. Updates every few seconds.</p></div>';
    if (e.canHost) {
      h += '<div class="card"><h3>Paper sheets</h3><p class="small muted">Someone scored on paper? Type it in for them.</p><select id="pps">' + memberOptions('', 'Choose a taster\u2026') + '<option value="__guest">A guest (not a member)\u2026</option></select><button class="btn block" data-act="paper" data-id="' + e.id + '">Enter their scores</button></div>';
      h += '<div class="card live"><h3>Ready?</h3><p class="muted">The reveal unmasks every glass, crowns the winner and posts the results to the archive.</p><button class="btn ember block pulse" data-act="reveal" data-id="' + e.id + '">\uD83E\uDD43 Reveal the bottles</button></div>';
    } else h += '<div class="banner">The host will reveal the bottles when everyone is done. Your screen will follow along.</div>';
    return h;
  }

  /* ---------- REVEAL ---------- */
  function vReveal(id) {
    var e = ev(id); if (!e) return notFound();
    if (e.status !== 'revealed') return go('live/' + id);
    var R = CO.results(e, S.scores, S.members), order = R.ranked.slice().reverse(), rv = UI.rv && UI.rv.id === id ? UI.rv : (UI.rv = { id: id, step: 0, open: false });
    var n = order.length, h = '';
    if (rv.step === 0) h = '<div class="stage">' + badge('mid') + '<p class="eyebrow">' + esc(e.title) + '</p><h1>The Reveal</h1><p class="muted">' + n + ' glasses. ' + R.scorers + ' tasters. One champion.</p><div id="cnt"></div><button class="btn primary block" data-act="rvGo">Begin the reveal</button><button class="btn ghost block" data-go="a/' + id + '">Skip to the results</button></div>';
    else if (rv.step <= n) {
      var b = order[rv.step - 1], isW = rv.step === n, rk = n - rv.step + 1;
      h = '<div class="stage' + (isW ? ' winner' : '') + '"><img class="logo stage-logo" src="icons/logo-160.png" alt="">' + (isW ? STARS : '') + '<p class="rank">' + (isW ? 'And the winner is\u2026' : 'In ' + ordinal(rk) + ' place') + '</p>'
        + '<div class="framed">' + (isW ? wheat('l') : '') + '<div class="flip' + (rv.open ? ' open' : '') + '"><div class="in"><div class="face front"><div class="code">' + b.code + '</div><p class="muted">Glass ' + b.code + '</p></div>'
        + '<div class="face back">' + (isW ? '<div class="crown" aria-hidden="true">\uD83D\uDC51</div>' : '<p class="rank">Glass ' + b.code + '</p>') + '<div class="nm">' + esc(b.bottle.name) + '</div><p class="muted small">' + esc([b.bottle.distillery, b.bottle.style, b.bottle.proof ? b.bottle.proof + ' proof' : '', b.bottle.age].filter(Boolean).join(' \u00b7 ')) + '</p><div class="sc" id="cup">' + (rv.open ? sc(b.mean) : '') + '</div><p class="small muted">Oak Score \u00b7 ' + esc(b.verdict) + '</p></div></div></div>' + (isW ? wheat('r') : '') + '</div>'
        + (rv.open ? '<button class="btn primary block" data-act="rvNext">' + (isW ? 'Who guessed best?' : 'Next glass') + '</button>' : '<button class="btn ember block pulse" data-act="rvOpen">Unmask ' + b.code + '</button>') + '</div>';
    } else {
      var G = Object.keys(R.guess).map(function (k) { return R.guess[k]; }).sort(function (a, b) { return b.pts - a.pts; });
      h = '<div class="stage">' + badge('mid') + '<p class="eyebrow">Guess the bottle</p><h1>\uD83C\uDFAF Sharpest palate</h1><div class="list">' + G.slice(0, 8).map(function (g, i) { return '<div class="item"><span class="medal">' + (['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'][i] || '\u00b7') + '</span><span class="grow t">' + esc(g.name) + '</span><b>' + g.pts + ' pts</b></div>'; }).join('') + '</div>'
        + '<button class="btn primary block" data-go="a/' + id + '">Full results, notes &amp; charts</button><button class="btn block" data-act="shareCard" data-id="' + id + '">Share the results card</button></div>';
    }
    shell('', h, { back: 'a/' + id, full: true });
  }
  function ordinal(n) { return n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'); }
  function countUp(el, to) { var t0 = performance.now(), d = 1100; (function f(t) { var k = Math.min(1, (t - t0) / d), v = to * (1 - Math.pow(1 - k, 3)); el.textContent = v.toFixed(1); if (k < 1) requestAnimationFrame(f); })(t0); }
  function embers(ms) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var c = document.createElement('canvas'); c.className = 'embers'; document.body.appendChild(c);
    var W = c.width = innerWidth * devicePixelRatio, H = c.height = innerHeight * devicePixelRatio, x = c.getContext('2d'), P = [], t0 = performance.now();
    for (var i = 0; i < 160; i++) P.push({ x: Math.random() * W, y: H + Math.random() * H * 0.6, r: (1 + Math.random() * 3.5) * devicePixelRatio, vy: (1.5 + Math.random() * 4) * devicePixelRatio, vx: (Math.random() - .5) * 1.5 * devicePixelRatio, h: 25 + Math.random() * 25, gold: Math.random() < .35 });
    (function f(t) {
      x.clearRect(0, 0, W, H); var age = t - t0;
      P.forEach(function (p) { p.y -= p.vy; p.x += p.vx + Math.sin((t + p.h * 50) / 400) * .6; var a = Math.max(0, 1 - age / ms);
        x.beginPath(); x.fillStyle = p.gold ? 'rgba(244,190,92,' + a + ')' : 'hsla(' + p.h + ',90%,55%,' + a + ')'; x.shadowBlur = 12; x.shadowColor = '#f4a03a'; x.arc(p.x, p.y, p.r, 0, 7); x.fill(); });
      if (age < ms) requestAnimationFrame(f); else c.remove();
    })(t0);
  }

  /* ---------- ARCHIVE ---------- */
  function vArchive() {
    var P = past(), h = '<h1>The Archive</h1><p class="muted">Every tasting, every glass, every note.</p>';
    if (isAdmin()) h += '<button class="btn block" data-act="pastEv">+ Add a past tasting (from paper)</button>';
    var years = {}; P.forEach(function (e) { var y = evDate(e).slice(0, 4); (years[y] = years[y] || []).push(e); });
    if (!P.length) h += '<div class="empty"><span class="big">Nothing here yet</span>After the first reveal, the results land here automatically.</div>';
    Object.keys(years).sort().reverse().forEach(function (y) {
      h += '<div class="sec"><h2>' + esc(y) + '</h2></div><div class="list">' + years[y].map(function (e) {
        var R = CO.results(e, S.scores, S.members), w = R.winner, cov = e.cover || ((e.photos || [])[0] || {}).id;
        return '<button class="card ev item" data-go="a/' + e.id + '"><span class="cov">' + (cov ? '<img alt="" data-photo="' + e.id + '|' + cov + '">' : '\uD83E\uDD43') + '</span><span class="bd"><span class="small muted">' + esc(fmtDay(evDate(e), true)) + '</span><br><span class="t">' + esc(e.title) + '</span><br><span class="s">\uD83D\uDC51 ' + esc(w ? w.bottle.name + ' \u00b7 ' + sc(w.mean) : 'No winner') + '</span><br><span class="s">' + (e.bottles || []).length + ' bottles \u00b7 ' + R.scorers + ' tasters' + ((e.photos || []).length ? ' \u00b7 ' + e.photos.length + ' photos' : '') + '</span></span></button>';
      }).join('') + '</div>';
    });
    shell('Archive', h); loadPhotos();
  }
  function hbars(rows, max) {
    var W = 340, bh = 48, H = rows.length * bh + 4, bw = W - 30 - 56;
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Scores">' + rows.map(function (r, i) {
      var y = i * bh + 2, sx = function (v) { return (30 + Math.max(0, v) / (max || 100) * bw).toFixed(1); }, w = Math.max(2, r.v / (max || 100) * bw);
      return '<text x="0" y="' + (y + 38) + '" fill="#F4BE5C" font-size="22" font-family="Cormorant, serif" font-weight="700">' + esc(r.code) + '</text>'
        + '<text x="30" y="' + (y + 14) + '" fill="#C9B293" font-size="13" font-weight="700">' + esc(r.name || '') + '</text>'
        + '<rect x="30" y="' + (y + 22) + '" width="' + bw + '" height="20" rx="6" fill="#1A110B"/>'
        + '<rect x="30" y="' + (y + 22) + '" width="' + w.toFixed(1) + '" height="20" rx="6" fill="' + (i === 0 ? '#E0A03A' : '#8a5a2b') + '"/>'
        + (r.lo != null ? '<line x1="' + sx(r.lo) + '" x2="' + sx(r.hi) + '" y1="' + (y + 32) + '" y2="' + (y + 32) + '" stroke="#F4E7D0" stroke-opacity=".6" stroke-width="2"/><circle cx="' + sx(r.lo) + '" cy="' + (y + 32) + '" r="2.5" fill="#F4E7D0"/><circle cx="' + sx(r.hi) + '" cy="' + (y + 32) + '" r="2.5" fill="#F4E7D0"/>' : '')
        + '<text x="' + W + '" y="' + (y + 38) + '" text-anchor="end" fill="#F4E7D0" font-size="17" font-weight="800">' + esc(r.label) + '</text>';
    }).join('') + '</svg>';
  }
  function wheel(fam) {
    var tot = 0; CO.FAMILIES.forEach(function (f) { tot += fam[f.k] || 0; }); if (!tot) return '';
    var a = -Math.PI / 2, R = 70, r = 40, cx = 80, cy = 80, segs = '';
    CO.FAMILIES.forEach(function (f) { var v = fam[f.k] || 0; if (!v) return; var a2 = a + v / tot * Math.PI * 2, lg = a2 - a > Math.PI ? 1 : 0;
      if (v === tot) { segs += '<circle cx="80" cy="80" r="55" fill="none" stroke="' + f.color + '" stroke-width="30"/>'; a = a2; return; }
      var p = function (rad, ang) { return (cx + rad * Math.cos(ang)).toFixed(1) + ' ' + (cy + rad * Math.sin(ang)).toFixed(1); };
      segs += '<path d="M' + p(R, a) + ' A' + R + ' ' + R + ' 0 ' + lg + ' 1 ' + p(R, a2) + ' L' + p(r, a2) + ' A' + r + ' ' + r + ' 0 ' + lg + ' 0 ' + p(r, a) + 'Z" fill="' + f.color + '" stroke="#1A110B" stroke-width="2"/>'; a = a2; });
    var legend = CO.FAMILIES.filter(function (f) { return fam[f.k]; }).map(function (f) { return '<span data-fam="' + f.color + '">\u25CF ' + esc(f.label) + ' ' + Math.round(fam[f.k] / tot * 100) + '%</span>'; }).join('');
    return '<div class="row wrap"><svg width="160" height="160" viewBox="0 0 160 160" role="img" aria-label="Flavor wheel">' + segs + '<text x="80" y="86" text-anchor="middle" fill="#F4E7D0" font-size="15" font-weight="800">Flavor</text></svg><div class="cloud small grow">' + legend + '</div></div>';
  }
  function cloud(tags) {
    var ks = Object.keys(tags).sort(function (a, b) { return tags[b] - tags[a]; }), mx = ks.length ? tags[ks[0]] : 1;
    return ks.length ? '<div class="cloud">' + ks.slice(0, 18).map(function (t) { var s = 1 + Math.round((tags[t] / mx) * 3); return '<span class="s' + Math.min(4, s) + '" data-fam="' + famColor(t) + '">' + esc(t) + '</span>'; }).join('') + '</div>' : '<p class="small dim">No flavor tags.</p>';
  }
  function heat(v) { if (v == null) return ''; var k = Math.max(0, Math.min(1, (v - 40) / 60)); return 'rgba(224,160,58,' + (0.12 + k * 0.75).toFixed(2) + ')'; }
  function vArchiveDetail(id) {
    var e = ev(id); if (!e) return notFound();
    if (e.status !== 'revealed') return go('m/' + id);
    var R = CO.results(e, S.scores, S.members), w = R.winner, seg = UI.seg['a' + id] || 'results';
    var h = '<p class="eyebrow">' + esc(fmtDay(evDate(e), true)) + (e.host ? ' \u00b7 hosted by ' + esc(nameOf(e.host)) : '') + '</p><h1>' + esc(e.title) + '</h1>' + (e.theme ? '<p class="muted">' + esc(e.theme) + '</p>' : '');
    if ((e.attendees || []).length) h += '<p class="small muted">\uD83E\uDD43 At the table: ' + e.attendees.map(function (x) { var m = member(x); return esc(/^g:/.test(x) ? x.slice(2) : m ? m.name + (m.left ? ' (past member)' : '') : 'Someone'); }).join(', ') + '</p>';
    if (e.imported) h += '<p class="small dim">\uD83D\uDCDC ' + esc(e.imported) + '</p>';
    if (w) h += '<div class="card glow center champ">' + wheat('l') + wheat('r') + STARS + '<div class="crown" aria-hidden="true">\uD83D\uDC51</div><p class="eyebrow">Champion of the night \u00b7 Glass ' + w.code + '</p><h2>' + esc(w.bottle.name) + '</h2><p class="muted small">' + esc([w.bottle.distillery, w.bottle.line, w.bottle.style, w.bottle.proof ? w.bottle.proof + ' proof' : '', w.bottle.age, w.bottle.price].filter(Boolean).join(' \u00b7 ')) + '</p><div class="oakscore">' + sc(w.mean) + '</div><p class="small muted">Oak Score \u00b7 ' + w.n + ' tasters \u00b7 ' + esc(w.verdict) + '</p><div class="btns"><button class="btn primary" data-act="shareCard" data-id="' + id + '">Share results card</button><button class="btn" data-act="replay" data-id="' + id + '">Replay the reveal</button></div></div>';
    h += '<div class="seg" role="tablist">' + [['results', 'Results'], ['notes', 'Notes'], ['scores', 'Scores'], ['photos', 'Photos' + ((e.photos || []).length ? ' (' + e.photos.length + ')' : '')]].map(function (s) { return '<button role="tab" class="' + (seg === s[0] ? 'on' : '') + '" data-act="seg" data-id="a' + id + '" data-s="' + s[0] + '">' + s[1] + '</button>'; }).join('') + '</div>';
    if (seg === 'results') {
      h += '<div class="card"><h3>The standings</h3>' + hbars(R.ranked.map(function (b) { return { code: b.code, v: b.mean, lo: b.min, hi: b.max, label: sc(b.mean), name: (b.bottle.name || '').slice(0, 34) }; }), 100) + '<p class="small dim">Bar = average Oak Score. Line = lowest to highest score.</p></div>';
      if (R.consensus && R.controversial && R.consensus !== R.controversial) h += '<div class="grid2"><div class="stat"><span>\uD83E\uDD1D Consensus pick</span><b>' + R.consensus.code + '</b><span>' + esc(R.consensus.bottle.name) + ' \u00b7 spread \u00b1' + sc(R.consensus.sd) + '</span></div><div class="stat"><span>\u26A1 Most controversial</span><b>' + R.controversial.code + '</b><span>' + esc(R.controversial.bottle.name) + ' \u00b7 spread \u00b1' + sc(R.controversial.sd) + '</span></div></div>';
      h += R.ranked.concat(R.bottles.filter(function (b) { return !b.n; })).map(function (b) {
        return '<div class="card"><div class="rankrow"><span class="n">' + (b.rank || '\u2013') + '</span><div class="grow"><b>' + esc(b.bottle.name) + '</b> <span class="pill">' + b.code + '</span><br><span class="small muted">' + esc([b.bottle.distillery, b.bottle.style, b.bottle.proof ? b.bottle.proof + ' proof' : '', b.bottle.age, b.bottle.price].filter(Boolean).join(' \u00b7 ')) + '</span></div><div class="oakscore">' + sc(b.mean) + '</div></div>'
          + '<p class="small"><span class="pill ' + (b.verdict === 'Consensus' ? 'ok' : b.verdict === 'Controversial' ? 'ember' : '') + '">' + esc(b.verdict || 'No scores') + '</span> <span class="muted">median ' + sc(b.median) + ' \u00b7 range ' + sc(b.min) + '\u2013' + sc(b.max) + '</span></p>'
          + e.sheet.categories.map(function (c) { var v = b.cats[c.k], pct = v == null ? 0 : (v - e.sheet.scale.min) / ((e.sheet.scale.max - e.sheet.scale.min) || 1) * 100; return '<div class="row small"><span class="grow" >' + esc(c.label) + '</span><span class="grow"><div class="bar"><i data-w="' + pct + '"></i></div></span><b>' + (v == null ? '\u2013' : v) + '</b></div>'; }).join('')
          + (b.bottle.notes ? '<p class="note"><b>Host:</b> ' + esc(b.bottle.notes) + '</p>' : '') + wheel(b.families) + cloud(b.tags) + '</div>';
      }).join('');
      var G = Object.keys(R.guess).map(function (k) { return R.guess[k]; }).sort(function (a, b) { return b.pts - a.pts; });
      if (G.length) h += '<div class="card"><h3>\uD83C\uDFAF Guess the bottle</h3><div class="list">' + G.map(function (g, i) { return '<div class="item"><span class="medal">' + (['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'][i] || '') + '</span><span class="grow t">' + esc(g.name) + '</span><b>' + g.pts + ' pts</b></div>'; }).join('') + '</div></div>';
    } else if (seg === 'notes') {
      h += R.ranked.concat(R.bottles.filter(function (b) { return !b.n; })).map(function (b) {
        return '<div class="card"><h3>' + b.code + ' \u00b7 ' + esc(b.bottle.name) + '</h3>' + (b.by.length ? b.by.map(function (x) {
          return '<div class="note"><div class="row between"><b>' + esc(x.name) + (x.paper ? ' \uD83D\uDCC4' : '') + '</b><b>' + sc(x.score) + '</b></div>' + (x.note ? '<div>' + esc(x.note) + '</div>' : '') + (x.tags.length ? '<div class="small muted">' + x.tags.map(esc).join(' \u00b7 ') + '</div>' : '') + '</div>';
        }).join('') : '<p class="dim">No notes.</p>') + '</div>';
      }).join('');
    } else if (seg === 'scores') {
      var scorers = {}; R.bottles.forEach(function (b) { b.by.forEach(function (x) { scorers[x.scorer] = x.name; }); });
      var ids = Object.keys(scorers);
      h += '<div class="card scroll-x"><h3>Who gave what</h3><table class="mx"><thead><tr><th>Taster</th>' + R.bottles.map(function (b) { return '<th>' + b.code + '</th>'; }).join('') + '<th>Avg</th></tr></thead><tbody>' + ids.map(function (sid) {
        var vals = [];
        return '<tr><td>' + esc(scorers[sid]) + '</td>' + R.bottles.map(function (b) { var x = b.by.filter(function (y) { return y.scorer === sid; })[0]; if (x) vals.push(x.score); return '<td class="h" data-bg="' + (x ? heat(x.score) : '') + '">' + (x ? Math.round(x.score) : '\u2013') + '</td>'; }).join('') + '<td><b>' + sc(CO.mean(vals)) + '</b></td></tr>';
      }).join('') + '<tr><td><b>Club</b></td>' + R.bottles.map(function (b) { return '<td><b>' + (b.mean == null ? '\u2013' : Math.round(b.mean)) + '</b></td>'; }).join('') + '<td></td></tr></tbody></table></div>';
      if (e.canHost) h += '<div class="card"><h3>Fix or add a sheet</h3><select id="pps">' + memberOptions('', 'Choose a taster\u2026') + '<option value="__guest">A guest\u2026</option>' + ids.filter(function (s) { return /^g:/.test(s); }).map(function (s) { return '<option value="' + esc(s) + '">' + esc(scorers[s]) + ' (guest)</option>'; }).join('') + '</select><button class="btn block" data-act="paper" data-id="' + id + '">Edit their scores</button>'
        + (isAdmin() ? '<div class="btns"><button class="btn danger sm" data-act="status" data-id="' + id + '" data-s="live">Re-open scoring (un-reveal)</button><button class="btn sm" data-go="print/' + id + '?results=1">Print results</button></div>' : '') + '</div>';
    } else {
      h += '<div class="card"><h3>Photos</h3><p class="small muted">Saved to the club\u2019s private Google Drive folder. Only people with a club link can see them.</p><label class="btn primary block" for="phf">\uD83D\uDCF7 Add photos</label><input id="phf" class="hidden" type="file" accept="image/*" multiple data-id="' + id + '">'
        + '<div class="photos" id="phgrid">' + (e.photos || []).map(function (p) { return '<button data-act="lb" data-id="' + id + '" data-pid="' + p.id + '" aria-label="Open photo' + (p.caption ? ': ' + esc(p.caption) : '') + '"><img alt="' + esc(p.caption || 'Tasting photo') + '" data-photo="' + id + '|' + p.id + '"></button>'; }).join('') + '</div>'
        + ((e.photos || []).length ? '' : '<p class="empty">No photos yet.</p>') + '</div>';
    }
    shell('', h, { back: 'archive' }); loadPhotos();
    var f = $('#phf'); if (f) f.onchange = function () { uploadPhotos(id, f.files); };
  }
  /* photos are fetched through the API and kept in memory only */
  function loadPhotos() {
    $$('img[data-photo]').forEach(function (img) {
      var k = img.getAttribute('data-photo'), p = k.split('|');
      if (UI.photos[k]) { if (UI.photos[k].then) UI.photos[k].then(function (d) { img.src = d; }); else img.src = UI.photos[k]; return; }
      UI.photos[k] = call('getPhoto', [p[0], p[1], 'thumb']).then(function (r) { UI.photos[k] = r.data; img.src = r.data; return r.data; }).catch(function () { delete UI.photos[k]; });
    });
  }
  function resize(file, max, q) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () { var k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q)); };
      im.onerror = function () { URL.revokeObjectURL(url); rej(new Error('Can\u2019t read that picture')); }; im.src = url;
    });
  }
  function uploadPhotos(id, files) {
    files = Array.prototype.slice.call(files || []).slice(0, 10); if (!files.length) return;
    toast('Uploading ' + files.length + ' photo' + (files.length > 1 ? 's' : '') + '\u2026');
    var chain = Promise.resolve();
    files.forEach(function (f) { chain = chain.then(function () { return Promise.all([resize(f, 1600, .82), resize(f, 420, .7)]).then(function (d) { return call('addPhoto', [id, d[0], d[1], ''], rid()); }); }); });
    chain.then(function () { toast('Photos saved'); return refresh(); }).catch(function (e) { toast(errMsg(e)); refresh(); });
  }
  function lightbox(id, pid) {
    var e = ev(id), p = (e.photos || []).filter(function (x) { return x.id === pid; })[0]; if (!p) return;
    var lb = document.createElement('div'); lb.className = 'lightbox'; lb.setAttribute('role', 'dialog');
    lb.innerHTML = '<img alt="' + esc(p.caption || 'Photo') + '"><p class="small muted">' + esc(p.caption || '') + ' \u00b7 by ' + esc(nameOf(p.by)) + '</p><div class="btns"><button class="btn" data-x>Close</button>' + (e.canHost ? '<button class="btn" data-cov>Make cover</button>' : '') + ((p.by === S.me.id || e.canHost) ? '<button class="btn danger" data-del>Delete</button>' : '') + '</div>';
    document.body.appendChild(lb);
    var img = lb.querySelector('img'), k = id + '|' + pid; if (typeof UI.photos[k] === 'string') img.src = UI.photos[k];
    call('getPhoto', [id, pid, 'full']).then(function (r) { img.src = r.data; }).catch(function () {});
    lb.onclick = function (ev_) { var t = ev_.target;
      if (t.hasAttribute('data-x') || t === lb) lb.remove();
      if (t.hasAttribute('data-cov')) { lb.remove(); act('setCover', [id, pid], 'Cover set'); }
      if (t.hasAttribute('data-del')) { lb.remove(); confirmBox('Delete this photo?', 'It goes to the trash in the club Drive folder.', 'Delete', 'danger').then(function (y) { if (y) act('removePhoto', [id, pid], 'Deleted'); }); } };
  }
  /* shareable results card (PNG, made on the phone) */
  var LOGO_IMG = new Image(); LOGO_IMG.src = 'icons/logo-720.png';
  function shareCard(id) {
    var f = document.fonts ? Promise.all(['58px "Pirata One"', '700 40px Cinzel', '700 20px Manrope'].map(function (x) { return document.fonts.load(x); })) : Promise.resolve();
    var l = LOGO_IMG.complete ? Promise.resolve() : new Promise(function (r) { LOGO_IMG.onload = LOGO_IMG.onerror = r; });
    Promise.all([f, l]).then(function () { shareCard_(id); }, function () { shareCard_(id); });
  }
  function shareCard_(id) {
    var e = ev(id), R = CO.results(e, S.scores, S.members), c = document.createElement('canvas'), W = 1080, H = 1350; c.width = W; c.height = H; var x = c.getContext('2d');
    var g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#000000'); g.addColorStop(1, '#0b0805'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    for (var i = 0; i < 40; i++) { x.strokeStyle = 'rgba(120,90,55,' + (0.04 + Math.random() * .05) + ')'; x.lineWidth = 2; x.beginPath(); var yy = i * 36; x.moveTo(0, yy); x.bezierCurveTo(300, yy + 20, 700, yy - 20, W, yy + 10); x.stroke(); }
    x.strokeStyle = '#C8922E'; x.lineWidth = 4; x.strokeRect(30, 30, W - 60, H - 60); x.strokeStyle = 'rgba(213,217,222,.35)'; x.lineWidth = 1.5; x.strokeRect(44, 44, W - 88, H - 88);
    x.textAlign = 'center'; if (LOGO_IMG && LOGO_IMG.complete && LOGO_IMG.naturalWidth) x.drawImage(LOGO_IMG, W / 2 - 170, 40, 340, 340); x.fillStyle = '#C9CDD2'; x.font = '800 24px Manrope, sans-serif'; x.fillText('A   W H I S K E Y   C L U B', W / 2, 395);
    x.fillStyle = '#F4E7D0'; x.font = '600 72px Cormorant, Georgia, serif'; x.fillStyle = '#E6E9EC'; x.font = '58px "Pirata One", Georgia, serif'; wrap(x, e.title, W / 2, 470, 900, 60);
    x.fillStyle = '#C9B293'; x.font = '600 34px Manrope, sans-serif'; x.fillText(fmtDay(evDate(e), true), W / 2, 530);
    var w = R.winner;
    if (w) { x.fillStyle = '#D4A23C'; x.font = '700 34px Cinzel, serif'; x.fillText('\u2605  CHAMPION  \u2605', W / 2, 610); x.fillStyle = '#F0C869'; x.font = '64px "Pirata One", Georgia, serif'; wrap(x, w.bottle.name, W / 2, 685, 920, 66);
      x.font = '700 120px Cinzel, serif'; x.fillText(sc(w.mean), W / 2, 830); x.fillStyle = '#B9BEC4'; x.font = '700 28px Manrope, sans-serif'; x.fillText('OAK SCORE \u00b7 GLASS ' + w.code, W / 2, 880); }
    R.ranked.slice(1, 5).forEach(function (b, i) { var y = 950 + i * 80; x.textAlign = 'left'; x.fillStyle = '#E0A03A'; x.font = '700 46px Cormorant, Georgia, serif'; x.fillText((i + 2) + '.', 120, y);
      x.fillStyle = '#F4E7D0'; x.font = '700 36px Manrope, sans-serif'; x.fillText(trunc(x, b.bottle.name, 640), 190, y); x.textAlign = 'right'; x.fillStyle = '#F4BE5C'; x.fillText(sc(b.mean), W - 120, y); });
    x.textAlign = 'center'; x.fillStyle = '#A9AEB4'; x.font = '600 26px Manrope, sans-serif'; x.fillText(R.scorers + ' tasters \u00b7 ' + (e.bottles || []).length + ' blind pours', W / 2, H - 80);
    c.toBlob(function (blob) {
      var file = new File([blob], 'char-oak-results.png', { type: 'image/png' }), url = URL.createObjectURL(blob);
      modal('<h2>Results card</h2><img alt="Results card" class="chart" src="' + url + '"><div class="btns"><a class="btn primary" download="char-oak-results.png" href="' + url + '">Download</a>' + (navigator.canShare && navigator.canShare({ files: [file] }) ? '<button class="btn" id="shr">Share\u2026</button>' : '') + '<button class="btn" data-close>Close</button></div>',
        function (el) { var b = $('#shr', el); if (b) b.onclick = function () { navigator.share({ files: [file], title: e.title }).catch(function () {}); }; });
    }, 'image/png');
  }
  function trunc(x, s, w) { s = String(s || ''); while (s.length > 3 && x.measureText(s).width > w) s = s.slice(0, -2); return s; }
  function wrap(x, s, cx, y, w, lh) { var words = String(s || '').split(' '), line = '', n = 0; words.forEach(function (wd) { var t = line ? line + ' ' + wd : wd; if (x.measureText(t).width > w && line) { x.fillText(line, cx, y + n * lh); n++; line = wd; } else line = t; }); x.fillText(line, cx, y + n * lh); }

  /* ---------- HALL OF FAME ---------- */
  function vHall() {
    var st = CO.stats(S), M = st.members.filter(function (m) { return m.n; });
    var h = '<p class="eyebrow">Legends of the barrel</p><h1>Hall of Fame</h1>';
    if (!st.events) { shell('Hall of Fame', h + '<div class="empty"><span class="big">No legends yet</span>The first reveal starts the record books.</div>'); return; }
    h += '<div class="sec"><h2>\uD83D\uDC51 Champions</h2></div><div class="list">' + st.winners.map(function (x) { return '<button class="item" data-go="a/' + x.ev.id + '"><span class="medal">\uD83C\uDFC6</span><span class="grow"><span class="t">' + esc(x.b.bottle.name) + '</span><br><span class="s">' + esc(x.ev.title) + ' \u00b7 ' + esc(fmtDay(evDate(x.ev))) + '</span></span><span class="oakscore">' + sc(x.b.mean) + '</span></button>'; }).join('') + '</div>';
    h += '<div class="sec"><h2>Top bottles, all time</h2></div><div class="card">' + hbars(st.bottles.slice(0, 8).map(function (x, i) { return { code: String(i + 1), v: x.b.mean, label: sc(x.b.mean), name: (x.b.bottle.name || '').slice(0, 34) }; }), 100) + '</div>';
    function board_(title, ic, list, val, sub) { return '<div class="card"><h3>' + ic + ' ' + title + '</h3><div class="list">' + list.slice(0, 5).map(function (m, i) { return '<button class="item" data-go="p/' + m.id + '"><span class="medal">' + (['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'][i] || (i + 1) + '.') + '</span>' + av(member(m.id), 'sm') + '<span class="grow t">' + esc(m.name) + '</span><b>' + val(m) + '</b></button>'; }).join('') + '</div>' + (sub ? '<p class="small dim">' + sub + '</p>' : '') + '</div>'; }
    h += '<div class="sec"><h2>Leaderboards</h2></div>';
    h += board_('Guess master', '\uD83C\uDFAF', M.slice().sort(function (a, b) { return b.guessPts - a.guessPts; }), function (m) { return m.guessPts + ' pts'; }, 'Points for naming the style, proof and bottle.');
    h += board_('Golden palate', '\u2728', M.filter(function (m) { return m.accuracy != null; }).sort(function (a, b) { return a.accuracy - b.accuracy; }), function (m) { return '\u00b1' + sc(m.accuracy); }, 'Closest to the club consensus, bottle after bottle.');
    h += board_('Iron attendance', '\uD83D\uDCC5', M.slice().sort(function (a, b) { return b.attended - a.attended; }), function (m) { return m.attended + '/' + st.events; });
    h += board_('Harshest judge', '\uD83E\uDDCA', M.filter(function (m) { return m.bias != null; }).sort(function (a, b) { return a.bias - b.bias; }), function (m) { return (m.bias > 0 ? '+' : '') + sc(m.bias); }, 'Average points above or below everyone else on the same glass.');
    h += board_('Most generous pour', '\uD83C\uDF6F', M.filter(function (m) { return m.bias != null; }).sort(function (a, b) { return b.bias - a.bias; }), function (m) { return (m.bias > 0 ? '+' : '') + sc(m.bias); });
    h += '<div class="sec"><h2>\uD83D\uDC6F Palate twins</h2></div><div class="card">' + (st.twins.length ? '<div class="list">' + st.twins.slice(0, 5).map(function (t) { return '<div class="item"><span class="avs">' + av(member(t.a), 'sm') + av(member(t.b), 'sm') + '</span><span class="grow"><span class="t">' + esc(t.an.split(' ')[0]) + ' & ' + esc(t.bn.split(' ')[0]) + '</span><br><span class="s">' + t.n + ' glasses in common</span></span><b>' + t.match + '%</b></div>'; }).join('') + '</div>'
      + (st.twins.length > 1 ? '<p class="small muted">Opposite palates: <b>' + esc(st.twins[st.twins.length - 1].an) + '</b> & <b>' + esc(st.twins[st.twins.length - 1].bn) + '</b> (' + st.twins[st.twins.length - 1].match + '%)</p>' : '') : '<p class="dim">Twins appear after members share 3+ glasses.</p>') + '</div>';
    shell('Hall of Fame', h);
  }

  /* ---------- CLUB / MEMBERS / PROFILE ---------- */
  function vClub() {
    var st = CO.stats(S), by = {}; st.members.forEach(function (m) { by[m.id] = m; });
    var h = '<h1>The Club</h1><div class="people">' + active().map(function (m) { var x = by[m.id] || {}; return '<button class="person" data-go="p/' + m.id + '">' + av(m) + '<b>' + esc(m.name) + '</b><span class="small muted">' + esc(x.n ? x.biasLabel : 'New palate') + '</span><span class="small dim">' + (x.attended || 0) + ' tastings</span></button>'; }).join('') + '</div>';
    h += '<div class="sec"><h2>More</h2></div><div class="list">' + tile('wish', '\uD83E\uDD43', 'Bottle wishlist', 'Suggest and vote on the next pour') + tile('hall', '\uD83C\uDFC6', 'Hall of Fame', 'Champions and leaderboards') + tile('sheets', '\uD83D\uDDA8\uFE0F', 'Print scoresheets', '5 paper designs to choose from')
      + tile('p/' + S.me.id, '\uD83D\uDC64', 'My profile', 'Photo, nickname, my palate') + (isAdmin() ? tile('admin', '\uD83D\uDD11', 'Admin', 'Members, private links, default scoresheet, settings') : '')
      + (window.AppInstall && AppInstall.visible() ? '<button class="item" data-act="install"><span class="medal">\uD83D\uDCF2</span><span class="grow"><span class="t">Install the app</span><br><span class="s">Put Char &amp; Oak on your home screen</span></span></button>' : '') + '</div>'
      + '<p class="small dim center">' + (DEMO ? 'Demo mode: made-up data, saved only in this browser.' : 'Private club app. Your link is personal; please don\u2019t share it.') + '</p>';
    shell('The Club', h);
  }
  function vProfile(id) {
    var m = member(id); if (!m) return notFound();
    var st = CO.stats(S), x = st.members.filter(function (y) { return y.id === id; })[0] || {}, me = id === S.me.id;
    var tw = st.twins.filter(function (t) { return t.a === id || t.b === id; }), best = tw[0], worst = tw.length > 1 ? tw[tw.length - 1] : null;
    function other(t) { return t.a === id ? t.bn : t.an; }
    var h = '<div class="center">' + av(m, 'lg') + '<h1>' + esc(m.name) + '</h1>' + (m.nick ? '<p class="eyebrow">\u201c' + esc(m.nick) + '\u201d</p>' : '') + (m.bio ? '<p class="muted">' + esc(m.bio) + '</p>' : '') + (m.favorite ? '<p class="small">Desert-island pour: <b>' + esc(m.favorite) + '</b></p>' : '') + '</div>';
    if (me) h += '<button class="btn block" data-act="editMe">Edit my profile</button>';
    h += '<div class="sec"><h2>Palate</h2></div><div class="grid2"><div class="stat"><b>' + sc(x.avg) + '</b><span>average score given</span></div><div class="stat"><b>' + (x.bias == null ? '\u2013' : (x.bias > 0 ? '+' : '') + sc(x.bias)) + '</b><span>' + esc(x.biasLabel || 'Not enough pours yet') + '</span></div>'
      + '<div class="stat"><b>' + (x.attendance || 0) + '%</b><span>attendance (' + (x.attended || 0) + ' of ' + st.events + ')</span></div><div class="stat"><b>' + (x.guessPts || 0) + '</b><span>guess-the-bottle points</span></div></div>';
    if (x.bias != null) { var pos = Math.max(0, Math.min(100, 50 + x.bias * 2.5)); h += '<div class="card"><div class="row between small muted"><span>\uD83E\uDDCA Harsh</span><span>Calibrated</span><span>Generous \uD83C\uDF6F</span></div><div class="bar"><i data-w="' + pos + '"></i></div></div>'; }
    h += '<div class="card"><p><b>Favorite style:</b> ' + esc(x.favStyle ? x.favStyle + ' (avg ' + sc(x.favAvg) + ')' : 'Too early to tell') + '</p>' + (x.hosted ? '<p><b>Hosted:</b> ' + x.hosted + ' tasting' + (x.hosted > 1 ? 's' : '') + '</p>' : '')
      + (best ? '<p>\uD83D\uDC6F <b>Palate twin:</b> ' + esc(other(best)) + ' (' + best.match + '% match)</p>' : '') + (worst && worst !== best ? '<p>\u2694\uFE0F <b>Palate rival:</b> ' + esc(other(worst)) + ' (' + worst.match + '%)</p>' : '') + '</div>';
    if (x.topTags && x.topTags.length) { var tg = {}; x.topTags.forEach(function (t, i) { tg[t] = 6 - i; }); h += '<div class="card"><h3>Always tastes\u2026</h3>' + cloud(tg) + '</div>'; }
    var hist = past().map(function (e) { var R = CO.results(e, S.scores, S.members), mine = []; R.bottles.forEach(function (b) { b.by.forEach(function (y) { if (y.scorer === id) mine.push({ b: b, s: y.score }); }); }); mine.sort(function (a, b) { return b.s - a.s; }); return { e: e, top: mine[0] }; }).filter(function (r) { return r.top; });
    if (hist.length) h += '<div class="sec"><h2>Their favorites</h2></div><div class="list">' + hist.map(function (r) { return '<button class="item" data-go="a/' + r.e.id + '"><span class="grow"><span class="t">' + esc(r.top.b.bottle.name) + '</span><br><span class="s">' + esc(r.e.title) + ' \u00b7 ' + esc(fmtDay(evDate(r.e))) + '</span></span><b>' + sc(r.top.s) + '</b></button>'; }).join('') + '</div>';
    shell('', h, { back: 'club' });
  }
  function editMe() {
    var m = S.me;
    modal('<h2>My profile</h2><div class="center">' + av(m, 'lg') + '</div><label class="btn block" for="avf">Change photo</label><input id="avf" class="hidden" type="file" accept="image/*">'
      + '<label class="f" for="pn">Name</label><input id="pn" maxlength="40" value="' + esc(m.name) + '"><label class="f" for="pk">Nickname</label><input id="pk" maxlength="40" value="' + esc(m.nick || '') + '" placeholder="e.g. The Nose">'
      + '<label class="f" for="pf">Desert-island bottle</label><input id="pf" maxlength="80" value="' + esc(m.favorite || '') + '"><label class="f" for="pb">About you</label><textarea id="pb" maxlength="200">' + esc(m.bio || '') + '</textarea>'
      + '<div class="btns"><button class="btn" data-close>Cancel</button><button class="btn primary" id="psave">Save</button></div>', function (el, close) {
      var avData = null;
      $('#avf', el).onchange = function () { var f = this.files[0]; if (!f) return; resize(f, 160, .8).then(function (d) { avData = d; var a = $('.av', el); a.innerHTML = '<img alt="" src="' + d + '">'; }).catch(function (e) { toast(e.message); }); };
      $('#psave', el).onclick = function () { var f = { name: $('#pn', el).value, nick: $('#pk', el).value, favorite: $('#pf', el).value, bio: $('#pb', el).value }; if (avData) f.avatar = avData; close(); act('updateMe', [f], 'Profile saved'); };
    });
  }

  /* ---------- WISHLIST ---------- */
  function vWish() {
    var W = (S.wishes || []).slice().sort(function (a, b) { return (a.status === 'tasted') - (b.status === 'tasted') || b.votes.length - a.votes.length; });
    var h = '<h1>Bottle wishlist</h1><p class="muted">What should we pour next? Add a bottle, then vote. The top picks show up in the host\u2019s lineup builder.</p>'
      + '<div class="card"><label class="f" for="wn">Bottle</label><input id="wn" maxlength="80" placeholder="e.g. Char & Oak Farbrengen, single barrel"><label class="f">Style</label><div class="chips" id="wst">' + CO.STYLES.slice(0, 9).map(function (s) { return '<button class="chip tag" data-s="' + esc(s) + '">' + esc(s) + '</button>'; }).join('') + '</div>'
      + '<label class="f" for="wy">Why? (optional)</label><input id="wy" maxlength="200" placeholder="Heard the 2024 barrel is a monster"><button class="btn primary block" data-act="addWish">Add to the wishlist</button></div>';
    h += W.length ? '<div class="list">' + W.map(function (w, i) {
      var on = w.votes.indexOf(S.me.id) >= 0;
      return '<div class="card"><div class="row"><div class="grow"><b>' + (i < 3 && w.status === 'open' ? ['\uD83E\uDD47 ', '\uD83E\uDD48 ', '\uD83E\uDD49 '][i] : '') + esc(w.name) + '</b>' + (w.status !== 'open' ? ' <span class="pill ' + (w.status === 'got' ? 'ok' : '') + '">' + (w.status === 'got' ? 'Bought' : 'Tasted') + '</span>' : '') + '<br><span class="small muted">' + esc([w.style, 'added by ' + nameOf(w.by)].filter(Boolean).join(' \u00b7 ')) + '</span>' + (w.why ? '<br><span class="small">' + esc(w.why) + '</span>' : '') + '</div>'
        + '<button class="chip' + (on ? ' on' : '') + '" aria-pressed="' + on + '" data-act="voteWish" data-wid="' + w.id + '">\u2605 ' + w.votes.length + '</button></div>'
        + ((w.by === S.me.id || isAdmin()) ? '<div class="btns">' + (isAdmin() ? '<button class="btn sm" data-act="setWish" data-wid="' + w.id + '" data-s="' + (w.status === 'got' ? 'open' : 'got') + '">' + (w.status === 'got' ? 'Not bought' : 'Mark bought') + '</button><button class="btn sm" data-act="setWish" data-wid="' + w.id + '" data-s="tasted">Tasted</button>' : '') + '<button class="btn sm danger" data-act="setWish" data-wid="' + w.id + '" data-s="delete">Remove</button></div>' : '') + '</div>';
    }).join('') + '</div>' : '<div class="empty"><span class="big">Empty glass</span>Be the first to suggest a bottle.</div>';
    shell('', h, { back: 'club' });
    $$('#wst .chip').forEach(function (b) { b.onclick = function () { var was = b.classList.contains('on'); $$('#wst .chip').forEach(function (x) { x.classList.remove('on'); }); if (!was) b.classList.add('on'); }; });
  }

  /* ---------- ADMIN ---------- */
  function vAdmin() {
    if (!isAdmin()) return go('club');
    var all = S.members || [], st = S.settings || CO.defaultSettings();
    var h = '<p class="eyebrow">Only you see this</p><h1>Admin</h1><div class="sec"><h2>Members</h2></div><div class="card"><label class="f" for="amn">Add a member</label><div class="row"><input id="amn" maxlength="40" placeholder="Full name" class="grow"><button class="btn primary" data-act="addMember">Add</button></div><p class="small dim">You get their private link once. You can always make a new one (the old one stops working).</p></div>';
    h += '<div class="list">' + all.map(function (m) {
      return '<div class="card"><div class="row">' + av(m) + '<div class="grow"><b>' + esc(m.name) + '</b>' + (m.role === 'admin' ? ' <span class="pill amber">Admin</span>' : '') + (m.active === false ? ' <span class="pill">Inactive</span>' : '') + '<br><span class="small muted">' + (m.linkSet ? 'Private link active' + (m.linkAt ? ' since ' + esc(m.linkAt.slice(0, 10)) : '') : 'No link yet') + '</span></div></div>'
        + '<div class="btns"><button class="btn sm" data-act="renameMember" data-mid="' + m.id + '">Rename</button><button class="btn sm" data-act="resetLink" data-mid="' + m.id + '">' + (m.linkSet ? 'New link' : 'Make link') + '</button>' + (m.role !== 'admin' ? '<button class="btn sm ' + (m.active === false ? '' : 'danger') + '" data-act="toggleMember" data-mid="' + m.id + '">' + (m.active === false ? 'Reactivate' : 'Deactivate') + '</button>' : '') + '</div></div>';
    }).join('') + '</div>';
    h += '<div class="sec"><h2>Default scoresheet</h2></div><div class="card"><p class="muted">' + st.sheet.categories.map(function (c) { return esc(c.label) + ' \u00d7' + c.weight; }).join(' \u00b7 ') + ' \u00b7 scale ' + st.sheet.scale.min + '\u2013' + st.sheet.scale.max + '</p><div class="btns"><button class="btn" data-go="builder/default">Customize</button><button class="btn" data-go="print/default">Print</button></div></div>';
    h += '<div class="sec"><h2>Club settings</h2></div><div class="card"><label class="f" for="sgn">Club name</label><input id="sgn" maxlength="60" value="' + esc(st.groupName) + '">'
      + '<label class="f">Zmanim location (for sunset, candles and havdalah)</label><div class="chips" id="sloc">' + [['Brooklyn', 40.63, -73.96], ['Manhattan', 40.78, -73.97], ['Lakewood', 40.08, -74.21], ['Monsey', 41.11, -74.07], ['Five Towns', 40.62, -73.73]].map(function (p) { var on = Math.abs(st.lat - p[1]) < .02 && Math.abs(st.lon - p[2]) < .02; return '<button class="chip tag' + (on ? ' on' : '') + '" data-lat="' + p[1] + '" data-lon="' + p[2] + '">' + p[0] + '</button>'; }).join('') + '</div>'
      + '<label class="f">Havdalah, minutes after sunset</label><div class="chips" id="shv">' + [42, 50, 60, 72].map(function (n) { return '<button class="chip' + (st.havdalahMin === n ? ' on' : '') + '" data-n="' + n + '">' + n + '</button>'; }).join('') + '</div>'
      + '<button class="btn primary block" data-act="saveSettings">Save settings</button></div>';
    if (DEMO) h += '<div class="card"><h3>Demo data</h3><button class="btn danger block" data-act="demoReset">Reset demo data</button></div>';
    shell('', h, { back: 'club' });
    ['#sloc', '#shv'].forEach(function (g) { $$(g + ' .chip').forEach(function (b) { b.onclick = function () { $$(g + ' .chip').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); }; }); });
  }
  function showLink(m, tok) {
    var url = (C.APP_URL || location.origin + location.pathname) + '#k=' + tok;
    modal('<h2>' + esc(m.name) + '\u2019s private link</h2><p class="muted">Copy it now and send it to them yourself. It is shown only once. Anyone with this link can act as ' + esc(m.name.split(' ')[0]) + '.</p><div class="linkbox" id="lk">' + esc(url) + '</div><div class="btns"><button class="btn primary" id="cp">Copy link</button>' + (navigator.share ? '<button class="btn" id="sh">Share\u2026</button>' : '') + '<button class="btn" data-close>Done</button></div>', function (el) {
      $('#cp', el).onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('Copied'); }, function () { toast('Press and hold the link to copy'); }); };
      var s = $('#sh', el); if (s) s.onclick = function () { navigator.share({ title: 'Char & Oak', text: 'Your Char & Oak: A Whiskey Club link', url: url }).catch(function () {}); };
    });
  }

  /* ---------- SCORESHEET BUILDER ---------- */
  var PRESET_CATS = [['Nose', 'Aroma in the glass'], ['Palate', 'Taste and texture'], ['Finish', 'Length and what lingers'], ['Mouthfeel', 'Body: thin to chewy'], ['Balance', 'Does it all fit?'], ['Complexity', 'Layers that unfold'], ['Value', 'Worth the price?'], ['Color', 'In the glass'], ['Overall', 'Would you pour it again?']];
  var PRESET_SCALES = [[1, 5, 1, '1\u20135'], [1, 10, 1, '1\u201310'], [0, 10, 0.5, '0\u201310 by \u00bd'], [50, 100, 5, '50\u2013100 (by 5)'], [1, 100, 5, '1\u2013100 (by 5)']];
  function vBuilder(scope) {
    var e = scope === 'default' ? null : ev(scope); if (scope !== 'default' && (!e || !e.canHost)) return go('m/' + scope); if (scope === 'default' && !isAdmin()) return go('club');
    var B = UI.builder && UI.builder.scope === scope ? UI.builder : (UI.builder = { scope: scope, s: JSON.parse(JSON.stringify(e ? e.sheet : (S.settings || CO.defaultSettings()).sheet)) }), s = B.s;
    var h = '<p class="eyebrow">' + (e ? esc(e.title) : 'Club default') + '</p><h1>Scoresheet builder</h1>';
    h += '<div class="card"><h3>Scale</h3><div class="chips">' + PRESET_SCALES.map(function (p, i) { var on = s.scale.min === p[0] && s.scale.max === p[1] && s.scale.step === p[2]; return '<button class="chip' + (on ? ' on' : '') + '" data-act="bScale" data-i="' + i + '">' + p[3] + '</button>'; }).join('') + '</div>'
      + ['min', 'max', 'step'].map(function (k) { return '<div class="row between numrow"><span class="grow">' + { min: 'Lowest score', max: 'Highest score', step: 'Step' }[k] + '</span><button class="btn sm" data-act="bNum" data-k="' + k + '" data-d="-1" aria-label="Lower ' + k + '">\u2212</button><b class="numv">' + s.scale[k] + '</b><button class="btn sm" data-act="bNum" data-k="' + k + '" data-d="1" aria-label="Raise ' + k + '">+</button></div>'; }).join('') + '</div>';
    h += '<div class="card"><h3>Categories &amp; weights</h3>' + s.categories.map(function (c, i) {
      return '<div class="card"><div class="row"><input data-bc="label" data-i="' + i + '" maxlength="30" value="' + esc(c.label) + '" aria-label="Category name" class="grow"><button class="btn sm ghost" aria-label="Move up" data-act="bMove" data-i="' + i + '" data-d="-1"' + (i ? '' : ' disabled') + '>\u2191</button><button class="btn sm ghost" aria-label="Move down" data-act="bMove" data-i="' + i + '" data-d="1"' + (i < s.categories.length - 1 ? '' : ' disabled') + '>\u2193</button><button class="btn sm danger" aria-label="Remove ' + esc(c.label) + '" data-act="bDel" data-i="' + i + '"' + (s.categories.length > 1 ? '' : ' disabled') + '>\u2715</button></div>'
        + '<input data-bc="hint" data-i="' + i + '" maxlength="60" value="' + esc(c.hint || '') + '" placeholder="Hint (optional)" aria-label="Hint">'
        + '<div class="chips">' + [0.5, 1, 1.5, 2, 3].map(function (w) { return '<button class="chip' + (+c.weight === w ? ' on' : '') + '" data-act="bW" data-i="' + i + '" data-w8="' + w + '">\u00d7' + w + '</button>'; }).join('') + '</div></div>';
    }).join('') + (s.categories.length < 8 ? '<p class="small muted">Add a category:</p><div class="chips">' + PRESET_CATS.filter(function (p) { return !s.categories.some(function (c) { return c.label === p[0]; }); }).map(function (p) { return '<button class="chip tag" data-act="bAdd" data-l="' + esc(p[0]) + '" data-h="' + esc(p[1]) + '">+ ' + esc(p[0]) + '</button>'; }).join('') + '<button class="chip tag" data-act="bAdd" data-l="New category" data-h="">+ Custom</button></div>' : '') + '</div>';
    h += '<div class="card"><h3>Extras</h3>' + [['tags', 'Flavor tag chips'], ['notes', 'Free-text notes'], ['guessStyle', 'Guess the style'], ['guessProof', 'Guess the proof'], ['guessMatch', 'Match the bottle (lineup game)']].map(function (o) { return '<div class="row between"><span>' + o[1] + '</span><div class="chips"><button class="chip' + (s[o[0]] !== false ? ' on' : '') + '" data-act="bX" data-k="' + o[0] + '" data-v="1">On</button><button class="chip' + (s[o[0]] === false ? ' on' : '') + '" data-act="bX" data-k="' + o[0] + '" data-v="0">Off</button></div></div>'; }).join('<hr class="oak">') + '</div>';
    var tw = s.categories.reduce(function (a, c) { return a + +c.weight; }, 0) || 1;
    h += '<div class="card"><h3>How the Oak Score works</h3><p class="small muted">Each category is turned into 0\u2013100 and weighted: ' + s.categories.map(function (c) { return esc(c.label) + ' ' + Math.round(c.weight / tw * 100) + '%'; }).join(', ') + '.</p></div>';
    h += '<div class="sticky-foot"><button class="btn" data-act="bPrint">Preview print</button><button class="btn primary" data-act="bSave">Save sheet</button></div>';
    shell('', h, { back: e ? 'm/' + e.id : 'admin', full: true });
    $$('[data-bc]').forEach(function (inp) { inp.addEventListener('input', function () { s.categories[+inp.getAttribute('data-i')][inp.getAttribute('data-bc')] = inp.value; }); });
  }

  /* ---------- PRINT ---------- */
  function vPrint(scope, q) {
    var e = scope === 'default' ? null : ev(scope), sh = UI.printSheet || (e ? e.sheet : (S.settings || CO.defaultSettings()).sheet); UI.printSheet = null;
    var n = e && (e.bottles || []).length ? e.bottles.length : (UI.printN || 6), codes = []; for (var i = 0; i < n; i++) codes.push(CO.letters(i));
    if (q.results && e && e.status === 'revealed') return vPrintResults(e);
    var vals = []; for (var x = sh.scale.min; x <= sh.scale.max + 1e-9; x += sh.scale.step) vals.push(Math.round(x * 100) / 100);
    var head = '<div class="hdr"><img class="plogo" src="icons/logo-print.png" alt=""><div class="grow"><b>Char &amp; Oak: A Whiskey Club</b><br><span>' + esc(e ? e.title : 'Blind tasting scoresheet') + (e && e.when ? ' \u00b7 ' + esc(fmtDay(e.when.start, true)) : '') + '</span></div></div><div class="pname">Name: <span></span></div>';
    var block = function (c) {
      return '<div class="bt"><h3>Glass ' + c + '</h3>' + sh.categories.map(function (k) { return '<div class="crow"><span class="lb">' + esc(k.label) + (k.weight !== 1 ? ' \u00d7' + k.weight : '') + '</span>' + vals.map(function (v) { return '<span class="bx">' + v + '</span>'; }).join('') + '</div>'; }).join('')
        + (sh.tags ? '<div class="tg">' + CO.FAMILIES.map(function (f) { return f.tags.slice(0, 4).map(function (t) { return '<span>' + esc(t) + '</span>'; }).join(''); }).join('') + '</div>' : '')
        + (sh.notes ? '<div class="ln"></div><div class="ln"></div><div class="ln"></div>' : '')
        + ((sh.guessStyle || sh.guessProof || sh.guessMatch) ? '<div class="guess">' + (sh.guessStyle ? 'Style: <span></span>' : '') + (sh.guessProof ? 'Proof: <span></span>' : '') + (sh.guessMatch ? 'Bottle: <span></span>' : '') + '</div>' : '') + '</div>';
    };
    var per = sh.categories.length > 5 ? 2 : 3, pages = '';
    for (var p = 0; p < codes.length; p += per) pages += '<section class="ps page">' + head + codes.slice(p, p + per).map(block).join('') + '<p class="small">Circle one number per row. Oak Score = weighted average of the categories, 0\u2013100.</p></section>';
    var h = '<div class="noprint"><h1>Print scoresheets</h1><p class="muted">Prints ' + n + ' glasses (' + per + ' per page), with blank lines for notes. Choose \u201cSave as PDF\u201d in the print dialog for a PDF.</p>'
      + (!e ? '<label class="f">How many glasses?</label><div class="chips">' + [3, 4, 5, 6, 8].map(function (k) { return '<button class="chip' + (k === n ? ' on' : '') + '" data-act="printN" data-n="' + k + '">' + k + '</button>'; }).join('') + '</div>' : '')
      + '<button class="btn primary block" data-act="print">\uD83D\uDDA8 Print / Save as PDF</button><button class="btn block" data-go="sheets">More designs: 5 printable scoresheets</button>' + (e && e.canHost ? '<p class="small muted">After the tasting, type paper sheets in from the live board.</p>' : '') + '<hr class="oak"></div>' + pages;
    shell('', h, { back: e ? 'm/' + e.id : 'club', full: true });
  }
  function vPrintResults(e) {
    var R = CO.results(e, S.scores, S.members);
    var h = '<div class="noprint"><button class="btn primary block" data-act="print">\uD83D\uDDA8 Print results</button><hr class="oak"></div><section class="ps"><div class="hdr"><img class="plogo" src="icons/logo-print.png" alt=""><div class="grow"><b>' + esc(e.title) + '</b><br>' + esc(fmtDay(evDate(e), true)) + '</div><div>Char &amp; Oak: A Whiskey Club</div></div>'
      + R.ranked.map(function (b) { return '<div class="bt"><h3>' + b.rank + '. ' + esc(b.bottle.name) + ' (Glass ' + b.code + ') \u2014 ' + sc(b.mean) + '</h3><div class="small">' + esc([b.bottle.distillery, b.bottle.style, b.bottle.proof ? b.bottle.proof + ' proof' : ''].filter(Boolean).join(' \u00b7 ')) + ' \u00b7 ' + esc(b.verdict) + '</div>' + b.by.map(function (x) { return '<div class="small">' + esc(x.name) + ': <b>' + sc(x.score) + '</b>' + (x.note ? ' \u2014 ' + esc(x.note) : '') + '</div>'; }).join('') + '</div>'; }).join('') + '</section>';
    shell('', h, { back: 'a/' + e.id, full: true });
  }

  /* ---------- SCORESHEET DESIGNS (5 printable styles) ---------- */
  var SD_NAMES = [['classic', 'Classic', 'Nose, palate & finish 1\u201310 per glass'], ['minimal', 'Minimal quick-score', 'One line per glass: score + rank'], ['wheel', 'Tasting wheel', 'Aroma & flavor checkboxes, color, proof & price guess'], ['h2h', 'Head-to-head', 'Rank, favorite, matchups & match the reveal list'], ['social', 'Fun & social', 'Glass ratings, superlatives, quote of the night']];
  function sdInit() {
    if (UI.sd) return UI.sd;
    var e = upcoming()[0], d = e ? evDate(e) : '';
    UI.sd = { n: e && (e.bottles || []).length ? e.bottles.length : 6, title: e ? e.title : 'Blind Tasting', date: d ? d.slice(0, 10) : '', from: e ? e.title : '' };
    return UI.sd;
  }
  function sdDate(d) { if (!d) return ''; try { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }); } catch (x) { return d; } }
  var GLASS = '<svg class="gi" viewBox="0 0 24 30" aria-hidden="true"><path d="M5 3h14l-1.6 10.5A5.5 5.5 0 0 1 12 18a5.5 5.5 0 0 1-5.4-4.5z M12 18v7 M7 27h10" fill="none" stroke="#111" stroke-width="1.6" stroke-linecap="round"/></svg>';
  function sdBuild(kind, st) {
    var codes = []; for (var i = 0; i < st.n; i++) codes.push(CO.letters(i));
    var head = function (sub) { return '<div class="sd-hd"><img src="icons/logo-print.png" alt=""><div class="grow"><div class="sd-club">Char &amp; Oak</div><div class="sd-tag">A Whiskey Club \u00b7 ' + sub + '</div></div><div class="sd-ev"><b>' + esc(st.title || 'Blind Tasting') + '</b><br>' + esc(sdDate(st.date)) + '</div></div><div class="sd-rule">\u2605 \u2605 \u2605</div><div class="sd-name">Taster <span></span></div>'; };
    var page = function (sub, body, foot) { return '<section class="sd-pg">' + head(sub) + body + '<div class="sd-ft">' + (foot || '') + '</div></section>'; };
    var dots = function (a, b) { var s = ''; for (var x = a; x <= b; x++) s += '<i>' + x + '</i>'; return '<span class="sd-dots">' + s + '</span>'; };
    var lines = function (k) { var s = ''; for (var j = 0; j < k; j++) s += '<div class="sd-ln"></div>'; return s; };
    var chunk = function (per, fn, sub, foot) { var out = ''; for (var p = 0; p < codes.length; p += per) out += page(sub + (codes.length > per ? ' \u00b7 page ' + (p / per + 1) + ' of ' + Math.ceil(codes.length / per) : ''), codes.slice(p, p + per).map(fn).join(''), foot); return out; };
    if (kind === 'classic') return chunk(3, function (c) {
      return '<div class="sd-box"><div class="sd-let">' + c + '</div><div class="grow">' + ['Nose', 'Palate', 'Finish'].map(function (l) { return '<div class="sd-row"><b>' + l + '</b>' + dots(1, 10) + '</div>'; }).join('')
        + '<div class="sd-row"><b>Overall</b><span class="sd-blank sm"></span> / 10</div><div class="sd-lbl">Notes</div>' + lines(2) + '<div class="sd-row"><b>My guess</b><span class="sd-blank"></span></div></div></div>';
    }, 'Classic Scoresheet', 'Circle one number per row. Overall is your gut call, not an average.');
    if (kind === 'minimal') return page('Quick Score', '<table class="sd-tbl"><thead><tr><th>Glass</th><th>Score <small>(1\u201310)</small></th><th>Rank</th><th>One word</th></tr></thead><tbody>' + codes.map(function (c) { return '<tr><td class="sd-l">' + c + '</td><td></td><td></td><td></td></tr>'; }).join('') + '</tbody></table>', 'Rank 1 = your favorite. No ties.');
    if (kind === 'wheel') {
      var cb = function (l) { return l.map(function (t) { return '<span class="sd-cb">' + t + '</span>'; }).join(''); };
      return chunk(2, function (c) {
        return '<div class="sd-box"><div class="sd-let">' + c + '</div><div class="grow"><div class="sd-sub">Color</div><div class="sd-cbs">' + cb(['Straw', 'Gold', 'Amber', 'Copper', 'Mahogany']) + '</div>'
          + '<div class="sd-sub">Aroma</div><div class="sd-cbs">' + cb(['Fruit', 'Citrus', 'Dried fruit', 'Floral', 'Spice', 'Pepper', 'Oak', 'Smoke', 'Peat', 'Sweet', 'Caramel', 'Vanilla', 'Honey', 'Grain', 'Nutty', 'Chocolate', 'Leather', 'Herbal']) + '</div>'
          + '<div class="sd-sub">Flavor</div><div class="sd-cbs">' + cb(['Fruit', 'Spice', 'Oak', 'Smoke', 'Sweet', 'Bitter', 'Salty', 'Creamy', 'Hot', 'Dry', 'Oily', 'Thin']) + '</div>'
          + '<div class="sd-sub">Finish</div><div class="sd-cbs">' + cb(['Short', 'Medium', 'Long', 'Lingering']) + '</div>'
          + '<div class="sd-row"><b>Proof guess</b><span class="sd-blank sm"></span><b>Price guess $</b><span class="sd-blank sm"></span><b>Score</b><span class="sd-blank sm"></span>/10</div></div></div>';
      }, 'Tasting Wheel', 'Check every box you notice. Proof and price guesses earn bragging rights at the reveal.');
    }
    if (kind === 'h2h') {
      var rank = codes.map(function (c, i) { return '<div class="sd-rk"><span class="sd-n">' + (i + 1) + '</span><span class="sd-blank sm"></span></div>'; }).join('');
      var pairs = []; for (var a = 0; a < codes.length; a++) for (var b = a + 1; b < codes.length; b++) pairs.push('<span class="sd-mu"><i>' + codes[a] + '</i> vs <i>' + codes[b] + '</i></span>');
      var rev = codes.map(function () { return '<div class="sd-rv"><span class="sd-blank"></span><span>is glass</span><span class="sd-sq"></span></div>'; }).join('');
      return page('Head-to-Head', '<div class="sd-2c"><div><div class="sd-sub">My ranking (write the letter)</div>' + rank + '<div class="sd-fav">My favorite: <span class="sd-sq big"></span></div></div><div><div class="sd-sub">Reveal list \u2192 which glass?</div><p class="sd-tiny">Copy the bottle names as the host reads them, then write the letter you think each one is.</p>' + rev + '</div></div>'
        + (pairs.length <= 45 ? '<div class="sd-sub">Matchups \u00b7 circle the winner</div><div class="sd-mus">' + pairs.join('') + '</div>' : ''), 'Matchups settle ties. One point per correct match on the reveal list.');
    }
    var gl = ''; for (var g = 0; g < 5; g++) gl += GLASS;
    var sup = ['Best value', 'Crowd pleaser', 'Most surprising', 'Smokiest', 'Would gift it', 'Biggest disappointment', 'Pairs with a cigar', 'Takes me back'];
    return page('Party Sheet', '<div class="sd-sub">Rate each glass \u00b7 fill in the glasses (1\u20135)</div>' + codes.map(function (c) { return '<div class="sd-gr"><span class="sd-l">' + c + '</span><span class="sd-gls">' + gl + '</span><span class="sd-blank"></span></div>'; }).join('')
      + '<div class="sd-sub">Superlatives \u00b7 write a letter</div><div class="sd-sups">' + sup.map(function (s) { return '<div><span class="sd-sq"></span>' + s + '</div>'; }).join('') + '</div>'
      + '<div class="sd-sub">Quote of the night</div><div class="sd-quote">\u201c<span></span>\u201d<div class="sd-who">\u2014 <span class="sd-blank"></span></div></div>', 'Cheers. Drink responsibly and get home safe.');
  }
  function vSheets() {
    var st = sdInit();
    var h = '<div class="noprint"><p class="eyebrow">Printable</p><h1>Scoresheet designs</h1><p class="muted">Five different paper sheets. Pick one and print it, in black and white on US Letter. Choose \u201cSave as PDF\u201d in the print dialog for a PDF.' + (st.from ? ' Pre-filled from \u201c' + esc(st.from) + '\u201d.' : '') + '</p>'
      + '<div class="card"><label class="f" for="sd-title">Tasting name</label><input id="sd-title" data-sd="title" value="' + esc(st.title) + '" maxlength="60"><label class="f" for="sd-date">Date</label><input id="sd-date" type="date" data-sd="date" value="' + esc(st.date) + '">'
      + '<label class="f">How many bottles?</label><div class="chips">' + [3, 4, 5, 6, 7, 8, 10, 12].map(function (k) { return '<button class="chip' + (k === st.n ? ' on' : '') + '" data-act="sdN" data-n="' + k + '">' + k + '</button>'; }).join('') + '</div></div></div>'
      + '<div class="sd-grid">' + SD_NAMES.map(function (d, i) { return '<div class="sd-card" id="sd-' + d[0] + '"><div class="noprint sd-cap"><div class="grow"><b>' + (i + 1) + '. ' + d[1] + '</b><br><small class="muted">' + d[2] + '</small></div><button class="btn primary sm" data-act="sdPrint" data-k="' + d[0] + '">\uD83D\uDDA8 Print</button></div><div class="sd-prev">' + sdBuild(d[0], st) + '</div></div>'; }).join('') + '</div>';
    shell('', h, { back: 'club', full: true });
    $$('[data-sd]').forEach(function (inp) { inp.addEventListener('change', function () { st[inp.getAttribute('data-sd')] = inp.value; render(true); }); });
  }

  /* ---------- calendar ---------- */
  function ics(e) {
    if (!e.when) return toast('No date yet');
    var f = function (w) { return CO.toUTC(w).toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z'; }, ex = function (s) { return String(s || '').replace(/[\\;,]/g, '\\$&').replace(/\n/g, '\\n'); };
    var body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Char & Oak//Tasting Club//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT', 'UID:' + e.id + '@char-oak', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
      'DTSTART:' + f(e.when.start), 'DTEND:' + f(e.when.end || e.when.start), 'SUMMARY:' + ex('Char & Oak: ' + e.title), 'LOCATION:' + ex(e.location || ''), 'DESCRIPTION:' + ex((e.theme ? e.theme + '\n' : '') + (e.host ? 'Host: ' + nameOf(e.host) : '')),
      'BEGIN:VALARM', 'TRIGGER:-PT3H', 'ACTION:DISPLAY', 'DESCRIPTION:Char & Oak tonight', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    var url = URL.createObjectURL(new Blob([body], { type: 'text/calendar' })), a = document.createElement('a'); a.href = url; a.download = 'char-oak-' + e.when.start.slice(0, 10) + '.ics'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    toast('Calendar file downloaded');
  }
  function notFound() { shell('', '<div class="empty"><span class="big">Not found</span>It may have been removed.</div><button class="btn block" data-go="">Home</button>', { back: '' }); }

  /* ---------- render + events ---------- */
  var pendingRender = false, LASTTAP = 0;
  ['pointerdown', 'keydown'].forEach(function (t) { document.addEventListener(t, function () { LASTTAP = Date.now(); }, true); });
  function render(force) {
    if (!S) return;
    var ae = document.activeElement;
    if (!force && ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && app.contains(ae)) { pendingRender = true; return; }
    if (document.querySelector('.modal') && !force) { pendingRender = true; return; }
    pendingRender = false;
    var r = route(), y = window.scrollY;
    switch (r.name) {
      case 'home': vHome(); break;
      case 'meetings': r.id === 'new' ? vNewMeeting() : vMeetings(); break;
      case 'm': r.sub === 'lineup' ? vLineup(r.id) : vMeeting(r.id); break;
      case 'live': vLive(r.id, r.q); break;
      case 'reveal': vReveal(r.id); break;
      case 'archive': vArchive(); break;
      case 'a': vArchiveDetail(r.id); break;
      case 'hall': vHall(); break;
      case 'club': vClub(); break;
      case 'p': vProfile(r.id); break;
      case 'wish': vWish(); break;
      case 'admin': vAdmin(); break;
      case 'builder': vBuilder(r.id); break;
      case 'print': vPrint(r.id, r.q); break;
      case 'sheets': vSheets(); break;
      default: notFound();
    }
    window.scrollTo(0, y);
    var nn = $('#nn'); if (nn) nn.addEventListener('input', function () { if (UI.cur) { UI.cur.L.entries[UI.cur.b.id].note = nn.value; queueSave(); } });
  }
  document.addEventListener('focusout', function () { setTimeout(function () { if (pendingRender && !(document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName))) render(); }, 50); });

  var H = {
    rsvp: function (d) { act('rsvp', [d.id, d.v], d.v === 'y' ? 'See you there' : 'Got it'); },
    vote: function (d) { var e = ev(d.id), mv = myVotes(e), v = mv.v[d.cid] === d.v ? '' : d.v;
      var row = (S.votes || []).filter(function (x) { return x.eid === d.id && x.mid === S.me.id; })[0]; if (!row) { row = { id: d.id + '|' + S.me.id, eid: d.id, mid: S.me.id, v: {} }; S.votes.push(row); } if (v) row.v[d.cid] = v; else delete row.v[d.cid]; render(true);
      act('vote', [d.id, d.cid, v]); },
    lock: function (d) { var c = ev(d.id).candidates.filter(function (x) { return x.id === d.cid; })[0]; confirmBox('Lock in ' + fmtDay(c.start, true) + '?', 'Everyone will see it as the date. You can add it to your calendar next.', 'Lock it in').then(function (y) { if (y) act('lockDate', [d.id, d.cid], 'Locked in'); }); },
    unlock: function (d) { act('unlockDate', [d.id], 'The vote is open again'); },
    rmCand: function (d) { act('removeCandidate', [d.id, d.cid], 'Removed'); },
    addCand: function (d) { var c = candValue(); if (!c) return; act('addCandidate', [d.id, c], 'Date added'); },
    ncAdd: function () { saveNewForm(); var c = candValue(); if (!c) return; var why = CO.restCheck(c.start, c.end, S.settings); if (why) return toast(why); if (UI.newEv.cands.some(function (x) { return x.start === c.start; })) return toast('Already added'); UI.newEv.cands.push(c); UI.newEv.cands.sort(function (a, b) { return a.start.localeCompare(b.start); }); render(true); toast('Added ' + fmtDay(c.start)); },
    ncDel: function (d) { saveNewForm(); UI.newEv.cands.splice(+d.i, 1); render(true); },
    createEv: function () { saveNewForm(); var n = UI.newEv; if (!n.cands.length) return toast('Add at least one date');
      call('createEvent', [{ title: n.title, theme: n.theme, host: n.host, location: n.location, candidates: n.cands }], rid()).then(function (e) { UI.newEv = null; toast('Date poll posted'); return refresh().then(function () { go('m/' + e.id); }); }).catch(function (e) { toast(errMsg(e)); }); },
    pastEv: function () {
      modal('<h2>Add a past tasting</h2><p class="muted">For a tasting you did on paper. Then add the bottles, type in each sheet, and reveal it into the archive.</p><label class="f" for="pt">Name</label><input id="pt" maxlength="80" value="Tasting night"><label class="f" for="pd">Date</label><input id="pd" type="date" max="' + todayNY() + '" value="' + todayNY() + '"><label class="f" for="ph">Host</label><select id="ph">' + memberOptions(S.me.id, 'No host') + '</select><div class="btns"><button class="btn" data-close>Cancel</button><button class="btn primary" id="pgo">Create</button></div>', function (el, close) {
        $('#pgo', el).onclick = function () { var d = $('#pd', el).value; if (!d) return; close(); call('createEvent', [{ title: $('#pt', el).value, host: $('#ph', el).value, past: true, when: { start: d + 'T20:00', end: d + 'T23:00' } }], rid()).then(function (e) { return refresh().then(function () { toast('Created. Now add the bottles.'); go('m/' + e.id + '/lineup'); }); }).catch(function (e) { toast(errMsg(e)); }); };
      });
    },
    editEv: function (d) { editEventModal(ev(d.id)); },
    delEv: function (d) { confirmBox('Delete this meeting?', 'Its votes and scores are deleted too. This can\u2019t be undone.', 'Delete', 'danger').then(function (y) { if (y) act('deleteEvent', [d.id], 'Deleted').then(function () { go('meetings'); }); }); },
    bring: function (d) { act('bring', [d.id, d.op, { id: d.bid }], d.op === 'claim' ? 'Thanks!' : null); },
    bringAdd: function (d) { var v = $('#bri').value.trim(); if (!v) return toast('What are you bringing?'); act('bring', [d.id, 'add', { item: v, claim: true }], 'Added'); },
    bringQuick: function (d) { act('bring', [d.id, 'add', { item: d.item }], 'Added to the list'); },
    peek: function (d) { UI.peek[d.id] = !UI.peek[d.id]; render(true); },
    ics: function (d) { ics(ev(d.id)); },
    status: function (d) {
      var msg = { live: ['Start the live tasting?', 'Everyone can score on their phones. The bottles stay sealed.', 'Start'], locked: ['Pause the tasting?', 'Scoring closes until you start again. Nothing is lost.', 'Pause'], planning: ['Pause the tasting?', 'Scoring closes until you start again.', 'Pause'] }[d.s];
      var e = ev(d.id); if (e.status === 'revealed') msg = ['Re-open scoring?', 'The results leave the archive until you reveal again.', 'Re-open'];
      confirmBox(msg[0], msg[1], msg[2], d.s === 'live' ? 'ember' : 'primary').then(function (y) { if (y) act('setStatus', [d.id, d.s], d.s === 'live' ? 'The tasting is live' : 'Done').then(function (r) { if (r && d.s === 'live') go('live/' + d.id); }); });
    },
    seg: function (d) { UI.seg[d.id] = d.s; render(true); if (d.s === 'board') refresh(); },
    bsel: function (d) { var e = ev(d.id), L = liveState(e, d.sc); if (L.dirty) queueSave(true); L.i = +d.i; render(true); window.scrollTo(0, 0); },
    sv: function (d) { var c = UI.cur; c.L.entries[c.b.id].v[d.k] = +d.v; render(true); queueSave(); },
    tg: function (d) { var c = UI.cur, t = c.L.entries[c.b.id].tags, i = t.indexOf(d.t); if (i >= 0) t.splice(i, 1); else t.push(d.t); render(true); queueSave(); },
    gs: function (d) { var g = UI.cur.L.entries[UI.cur.b.id].guess; g.style = g.style === d.v ? '' : d.v; render(true); queueSave(); },
    gp: function (d) { var g = UI.cur.L.entries[UI.cur.b.id].guess; g.proof = g.proof === d.v ? '' : d.v; render(true); queueSave(); },
    gm: function (d) { var g = UI.cur.L.entries[UI.cur.b.id].guess; g.matchName = g.matchName === d.v ? '' : d.v; render(true); queueSave(); },
    finish: function (d) {
      var c = UI.cur, e = c.e, sh = e.sheet, missing = (e.bottles || []).filter(function (b) { var en = c.L.entries[b.id]; return !en || Object.keys(en.v || {}).length < sh.categories.length; }).map(function (b) { return b.code; });
      var paper = c.scorer !== S.me.id;
      var go_ = function () { clearTimeout(saveT); flush(c, true).then(function () { toast(paper ? 'Sheet saved for ' + nameOf(c.scorer) : 'Sheet in. Waiting for the reveal\u2026'); if (paper) { delete UI.live[e.id + '|' + c.scorer]; go(e.status === 'revealed' ? 'a/' + e.id : 'live/' + e.id); refresh(); } else { UI.seg[e.id] = 'board'; refresh(); } }).catch(function () {}); };
      if (missing.length) confirmBox('Some glasses aren\u2019t fully scored', 'Missing: ' + missing.join(', ') + '. Finish anyway?', 'Finish anyway').then(function (y) { if (y) go_(); }); else go_();
    },
    paper: function (d) { var v = $('#pps').value; if (!v) return toast('Choose a taster');
      if (v === '__guest') { modal('<h2>Guest taster</h2><label class="f" for="gn">Their name</label><input id="gn" maxlength="40"><div class="btns"><button class="btn" data-close>Cancel</button><button class="btn primary" id="ggo">Continue</button></div>', function (el, close) { $('#ggo', el).onclick = function () { var n = $('#gn', el).value.trim().replace(/[^\w .'-]/g, ''); if (!n) return; close(); go('live/' + d.id + '?as=' + encodeURIComponent('g:' + n)); }; }); return; }
      go('live/' + d.id + '?as=' + encodeURIComponent(v)); },
    reveal: function (d) {
      var e = ev(d.id), P = e.progress || {}, notDone = Object.keys(P).filter(function (k) { return !P[k].done; }).length;
      confirmBox('Reveal the bottles?', (notDone ? notDone + ' taster' + (notDone > 1 ? 's are' : ' is') + ' still scoring. ' : '') + 'Scores lock and everyone sees the results.', 'Reveal', 'ember').then(function (y) {
        if (!y) return; if (UI.cur && UI.cur.L.dirty) flush(UI.cur).catch(function () {});
        call('setStatus', [d.id, 'revealed'], rid()).then(function () { UI.rv = null; return refresh(); }).then(function () { go('reveal/' + d.id); }).catch(function (x) { toast(errMsg(x)); });
      });
    },
    rvGo: function () { var el = $('#cnt'), n = 3; $$('.stage .btn').forEach(function (b) { b.classList.add('hidden'); }); (function tick() { el.innerHTML = '<div class="count">' + n + '</div>'; if (n-- > 1) setTimeout(tick, 800); else setTimeout(function () { UI.rv.step = 1; UI.rv.open = false; render(true); }, 800); })(); },
    rvOpen: function () { UI.rv.open = true; var f = $('.flip'); f.classList.add('open'); var R = CO.results(ev(UI.rv.id), S.scores, S.members), order = R.ranked.slice().reverse(), b = order[UI.rv.step - 1], isW = UI.rv.step === order.length;
      setTimeout(function () { countUp($('#cup'), b.mean); if (isW) embers(5200); }, 500);
      setTimeout(function () { var btn = $('.stage .btn'); if (btn) { btn.outerHTML = '<button class="btn primary block" data-act="rvNext">' + (isW ? 'Who guessed best?' : 'Next glass') + '</button>'; } }, 1200); },
    rvNext: function () { UI.rv.step++; UI.rv.open = false; render(true); },
    replay: function (d) { UI.rv = { id: d.id, step: 0, open: false }; go('reveal/' + d.id); },
    shareCard: function (d) { shareCard(d.id); },
    lb: function (d) { lightbox(d.id, d.pid); },
    lnAdd: function () { UI.lineup.list.push({ style: 'Bourbon' }); render(true); },
    lnDel: function (d) { UI.lineup.list.splice(+d.i, 1); render(true); },
    lnMove: function (d) { var l = UI.lineup.list, i = +d.i, j = i + +d.d; var t = l[i]; l[i] = l[j]; l[j] = t; render(true); },
    lnWish: function (d) { var w = (S.wishes || []).filter(function (x) { return x.id === d.wid; })[0]; if (w) { UI.lineup.list.push({ name: w.name, style: w.style || 'Bourbon', wish: w.id }); render(true); } },
    lnSave: function () { var L = UI.lineup; if (L.list.some(function (b) { return !String(b.name || '').trim(); })) return toast('Give every bottle a name');
      call('setBottles', [L.id, L.list], rid()).then(function () { UI.lineup = null; toast('Lineup sealed: ' + L.list.map(function (b, i) { return CO.letters(i); }).join(' ')); return refresh(); }).then(function () { go('m/' + L.id); }).catch(function (e) { toast(errMsg(e)); }); },
    editMe: editMe,
    addWish: function () { var n = $('#wn').value.trim(); if (!n) return toast('Which bottle?'); var st = $('#wst .chip.on'); act('addWish', [{ name: n, style: st ? st.getAttribute('data-s') : '', why: $('#wy').value }], 'Added to the wishlist'); },
    voteWish: function (d) { act('voteWish', [d.wid]); },
    setWish: function (d) { act('setWish', [d.wid, d.s], d.s === 'delete' ? 'Removed' : 'Updated'); },
    addMember: function () { var n = $('#amn').value.trim(); if (!n) return toast('Type a name'); call('addMember', [{ name: n }], rid()).then(function (r) { return refresh().then(function () { showLink(r.member, r.token); }); }).catch(function (e) { toast(errMsg(e)); }); },
    resetLink: function (d) { var m = member(d.mid) || (S.members || []).filter(function (x) { return x.id === d.mid; })[0];
      confirmBox('New link for ' + m.name + '?', m.linkSet ? 'Their current link stops working right away.' : 'You\u2019ll see it once.', 'Make new link').then(function (y) { if (y) call('resetLink', [d.mid], rid()).then(function (r) { return refresh().then(function () { showLink(r.member, r.token); }); }).catch(function (e) { toast(errMsg(e)); }); }); },
    renameMember: function (d) { var m = (S.members || []).filter(function (x) { return x.id === d.mid; })[0];
      modal('<h2>Rename</h2><input id="rn" maxlength="40" value="' + esc(m.name) + '" aria-label="Name"><div class="btns"><button class="btn" data-close>Cancel</button><button class="btn primary" id="rgo">Save</button></div>', function (el, close) { $('#rgo', el).onclick = function () { var v = $('#rn', el).value.trim(); if (!v) return; close(); act('updateMember', [d.mid, { name: v }], 'Saved'); }; }); },
    toggleMember: function (d) { var m = (S.members || []).filter(function (x) { return x.id === d.mid; })[0]; act('updateMember', [d.mid, { active: m.active === false }], m.active === false ? 'Reactivated' : 'Deactivated. Their link stops working.'); },
    saveSettings: function () { var l = $('#sloc .chip.on'), hv = $('#shv .chip.on'), f = { groupName: $('#sgn').value }; if (l) { f.lat = +l.getAttribute('data-lat'); f.lon = +l.getAttribute('data-lon'); } if (hv) f.havdalahMin = +hv.getAttribute('data-n'); act('setSettings', [f], 'Settings saved'); },
    bScale: function (d) { var p = PRESET_SCALES[+d.i]; UI.builder.s.scale = { min: p[0], max: p[1], step: p[2] }; render(true); },
    bNum: function (d) { var s = UI.builder.s.scale, k = d.k, st = k === 'step' ? (s.step >= 1 ? 1 : 0.5) : s.step, nv = Math.round((s[k] + (+d.d) * st) * 100) / 100;
      if (k === 'step') nv = Math.max(0.5, nv); if (k === 'min') nv = Math.max(0, Math.min(nv, s.max - s.step)); if (k === 'max') nv = Math.min(100, Math.max(nv, s.min + s.step));
      var t = Object.assign({}, s); t[k] = nv; if ((t.max - t.min) / t.step > 20) return toast('Up to 21 choices so the buttons stay big'); s[k] = nv; render(true); },
    bW: function (d) { UI.builder.s.categories[+d.i].weight = +d.w8; render(true); },
    bMove: function (d) { var l = UI.builder.s.categories, i = +d.i, j = i + +d.d, t = l[i]; l[i] = l[j]; l[j] = t; render(true); },
    bDel: function (d) { UI.builder.s.categories.splice(+d.i, 1); render(true); },
    bAdd: function (d) { UI.builder.s.categories.push({ k: d.l.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 16) + Date.now().toString(36).slice(-3), label: d.l, weight: 1, hint: d.h }); render(true); },
    bX: function (d) { UI.builder.s[d.k] = d.v === '1'; render(true); },
    bPrint: function () { UI.printSheet = CO.cleanSheet(UI.builder.s); go('print/' + UI.builder.scope); },
    bSave: function () { var B = UI.builder, s = CO.cleanSheet(B.s);
      var p = B.scope === 'default' ? call('setSettings', [{ sheet: s }], rid()) : call('updateEvent', [B.scope, { sheet: s }], rid());
      p.then(function () { toast('Scoresheet saved'); UI.builder = null; return refresh(); }).then(function () { go(B.scope === 'default' ? 'admin' : 'm/' + B.scope); }).catch(function (e) { toast(errMsg(e)); }); },
    printN: function (d) { UI.printN = +d.n; render(true); },
    print: function () { window.print(); },
    sdN: function (d) { UI.sd.n = +d.n; render(true); },
    sdPrint: function (d) { document.body.setAttribute('data-sdp', d.k); var done = function () { document.body.removeAttribute('data-sdp'); window.removeEventListener('afterprint', done); }; window.addEventListener('afterprint', done); window.print(); setTimeout(done, 1500); },
    install: function () { if (window.AppInstall) AppInstall.install(); },
    demoAs: function () { modal('<h2>Demo: be someone else</h2><p class="muted">Try the app as any member. Only in this browser tab.</p><div class="list">' + (S.members || []).map(function (m) { return '<button class="item" data-as="' + m.id + '">' + av(m, 'sm') + '<span class="grow t">' + esc(m.name) + (m.role === 'admin' ? ' (admin)' : '') + '</span></button>'; }).join('') + '</div>', function (el, close) { $$('[data-as]', el).forEach(function (b) { b.onclick = function () { sessionStorage.setItem('co.demo.as', b.getAttribute('data-as')); close(); UI.live = {}; refresh(); }; }); }); },
    demoReset: function () { Demo.reset(); UI.live = {}; refresh().then(function () { go(''); }); }
  };
  document.addEventListener('click', function (ev_) {
    var t = ev_.target.closest('[data-go],[data-act]'); if (!t || t.closest('.modal [data-close]')) return;
    if (t.disabled) return;
    if (t.hasAttribute('data-go')) { ev_.preventDefault(); if (UI.cur && UI.cur.L.dirty) flush(UI.cur).catch(function () {}); go(t.getAttribute('data-go')); return; }
    var a = t.getAttribute('data-act'); if (H[a]) { ev_.preventDefault(); H[a](t.dataset); }
  });

  /* polling: fast while a tasting is live, slow otherwise, paused in the background */
  function poll() {
    clearTimeout(POLL); var r = route(), fast = r.name === 'live' || (S && (S.events || []).some(function (e) { return e.status === 'live'; }));
    POLL = setTimeout(function () {
      if (document.hidden || !S) return poll();
      var wasLive = r.name === 'live' && ev(r.id) && ev(r.id).status === 'live';
      var before = S && r.name === 'live' && ev(r.id) ? ev(r.id).status : null;
      call('getAll', []).then(function (d) { S = d; LAST = Date.now(); var now = route();
        if (wasLive && now.name === 'live' && !now.q.as && ev(now.id) && ev(now.id).status === 'revealed') { UI.rv = null; go('reveal/' + now.id); return; }
        if (now.name === 'reveal' || now.name === 'builder' || (now.name === 'm' && now.sub === 'lineup') || (now.name === 'meetings' && now.id === 'new')) return;
        /* on my own scoresheet only re-draw if the tasting changed state; never under a finger */
        if (now.name === 'live' && (UI.seg[now.id] || 'sheet') === 'sheet' && ev(now.id) && ev(now.id).status === before) return;
        if (Date.now() - LASTTAP < 2500) { pendingRender = true; return; }
        render(); }).catch(function () {}).then(poll);
    }, fast ? 4000 : 30000);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && S && Date.now() - LAST > 15000) refresh().catch(function () {}); });

  function welcome(msg) {
    document.body.classList.add('full');
    app.innerHTML = '<div class="stage">' + badge('big') + '<h1>A Whiskey Club</h1><p class="muted">' + msg + '</p><a class="btn primary" href="?demo=1">Try the demo</a></div>';
  }
  function boot() {
    if (!DEMO && !token) return welcome('This is a private club app. Open your personal link from Roni to come in.');
    if (!DEMO && (!C.API_URL || /__API_URL__/.test(C.API_URL))) return welcome('The club server isn\u2019t connected yet.');
    if (!DEMO) { try { var c = JSON.parse(localStorage.getItem('choak.cache') || 'null'); if (c && c.me) { S = c; render(); } } catch (e) {} }
    if (!S) app.innerHTML = '<div class="stage"><div class="crown">\uD83E\uDD43</div><p class="muted">Pouring\u2026</p></div>';
    refresh().then(poll).catch(function (e) {
      if (e.status === 401) { try { localStorage.removeItem(TK); localStorage.removeItem('choak.cache'); } catch (x) {} return welcome('That link isn\u2019t valid anymore. Ask Roni for a fresh one.'); }
      if (S) { toast('Offline. Showing the last saved copy.'); poll(); } else welcome(errMsg(e));
    });
  }
  if ('serviceWorker' in navigator && !DEMO && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(function () {});
  window.CO_APP = { refresh: refresh, state: function () { return S; } };
  boot();
})();
