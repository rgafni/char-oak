# Char & Oak: A Whiskey Club

Private, phone-first app for a whiskey tasting club: date polls (Shabbat / Yom Tov aware), sealed blind tastings with live
scoring, a dramatic reveal, custom and printable scoresheets, an archive with photos and charts, a Hall of Fame and more.

**Code only.** No member names, data or link tokens live in this repo.

- **Real mode:** open your personal link (`#k=…`). The token is kept on the device and removed from the address bar; a URL
  fragment is never sent to any server. All data lives in a private Google Sheet and a private Drive folder behind an Apps
  Script API that checks every link.
- **Demo:** `?demo=1` runs the same rules engine (`core.js`) on made-up data stored only in your browser.
- **Installable PWA** (manifest + service worker that caches the app shell only, never API traffic).
- **Strict CSP**, no third-party scripts, fonts or trackers, `no-referrer`. Fonts are self-hosted under the SIL OFL
  (Manrope, Cormorant Garamond; see `fonts/OFL.txt`).
