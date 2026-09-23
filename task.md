# Mission X — MIHAS 2026 to-do

Last updated 23 September 2026. `[x]` = done; the commit is in brackets.
Status: everything below is pushed to GitHub `main` and live. The 23 September items were checked in Chrome on an isolated local copy before pushing.

## Done tonight

- [x] User boleh interact dengan booth yang bukan checkpoints (swap card) — `243aff0`
  - Near an exhibitor's booth that isn't one of your checkpoints, the button is **Swap card** (E key too). Checkpoints keep **Stamp**; empty booths show no button.
- [x] Update privacy page — `139ff39`, `67074ff`
  - Operator Leanis Solution Sdn Bhd (Lean X Digital), no location use, hosting in Tokyo, 12 months retention, contact sales@nexovadigital.com. English and Bahasa Malaysia.
- [x] Kod dan layout betul tapi nama booth salah, scrap detail nama booth dari database, akan match nama company dengan kod booth masa onboarding — `17c6c0a`
  - The spreadsheet and organiser list are no longer used. Registration: pick your booth number, then type your company.
- [x] Buang GPS — `dbc4dbc`
  - Everyone plays in one virtual hall and sees every other visitor and exhibitor. A booth QR scores in full everywhere.
- [x] User join game terus boleh buat card, tak perlu ke Lean X booth — `dbc4dbc`
  - The card form comes before entering the world. Chapters: Your card → Find Lean X Digital → Checkpoints.
- [x] Skrg booth yang dah ada register nama company tak keluar kod booth, jadikan dua2 keluar — `17c6c0a`
  - A registered booth shows "7C17 · Company"; an unregistered one shows "7C17".

## Also done tonight (not on the list)

- [x] Only Level 2 (Halls 6–8) in the game — `e39a5ce`
- [x] Exhibitor dashboard has a "Back to the game" button — `c7e7f13`
- [x] Crew "Release" clears the booth's logo, photo, scans and cards, so the next owner starts clean — `998ea53`

## Already in the game before tonight

- [x] 1 company exhibitor boleh register banyak member
  - The booth team: the owner shares a team link, up to 20 colleagues each join on their own phone and see the same dashboard. Check it covers what you need.

## Done 23 September

- [x] "Take me there" to checkpoint ada bug: tak bawa ke checkpoint seterusnya, hanya bawa ke Lean X booth — `7d8a65a`
  - The trail leads to Lean X only until the start QR is scanned. After that it leads to the nearest checkpoint you have not scanned, then the next one, without pressing anything: the mission card shows "Next: Company · Booth", the distance, and **Take me there**. "Skip this one" moves on.
- [x] User boleh pilih nak start game dari gate mana — `7d8a65a`
  - On the first screen, under the two doors: **Walk in by** Hall 8 · Hall 7 · Hall 6 · Main entrance (Hall 5). Remembered on the phone.
- [x] Movement "take me there" terlalu laju, takut user tak boleh catch up; ada pause button — `7d8a65a`
  - The guide jogs (2.7 m/s) instead of running (4.2 m/s); a tap on the floor still runs. While it walks the card shows **Pause** / **Resume** and **Stop**.
- [x] Mission dari 5 checkpoint turun ke 3 — `7d8a65a`; `CHECKPOINTS = 3` in `shared/rules.ts`. With fewer approved exhibitors a visitor gets fewer, topped up as more are approved.
- [x] Booth upload gambar tak perlu approval Lean X — `7d8a65a`
  - Logo and photo go up in the game the moment they are saved, pending or not. Approval still decides whether the booth is a checkpoint.
- [x] 2 flow onboarding: 1 exhibitor sign up sendiri, 1 lagi kita sign up-kan (dashboard dekat /crew.html untuk daftarkan user) — `7d8a65a`, `aea106c`
  - `/crew.html` → **Register**: booth number, company, contact name, phone, email, one line, website, consent tick. Saves their card and their booth (approved) and shows a hand-over link + QR (copy, or WhatsApp it). The exhibitor opens `/?join=CODE` on their phone → "Continue as <name>" → that account is theirs: dashboard, booth QR, visitors. The list under the form shows who has opened their link. Self sign-up in the game is unchanged.
  - The card also shows the **booth team** link + QR (`/?team=CODE`) for colleagues: each joins on their own phone with their own card and sees the same dashboard, up to 20. "Send both on WhatsApp" sends the two links in one message.

## Also done 23 September (not on the list)

- [x] Swap card: every field (name, company, role, phone, email) is ticked by default; people untick what they keep — `13fc051`
- [x] Five test booths from a 22 Sep seed (7H18, 6G27, 7B09, 8C10, 7G20 — no exhibitor behind them) deleted from production. Only 6A25 Aura Biocare (Atul) was real and is untouched.
- [x] Guards so that cannot hide again — `693618a`: the crew's **Booths** tab lists every booth in the table, flagging one with "No card — not a real exhibitor"; and a booth whose owner has no card is never handed out as a checkpoint, even if approved.
- [x] Supabase compute upgraded Micro → **Small** (t3a.small, 2 GB, 90 connections) for show-day headroom. A compute change restarts the database (~2 min offline, players see "Could not reach the fair"): never do it during show hours.

## Notes for show day

- Only one real exhibitor is approved (6A25). Until three are approved, visitors get fewer than 3 checkpoints; the mission tops up as you approve or register more.
- Register exhibitors at the counter from `/crew.html → Register`; approve self-signups in **Booths**.

- [x] Bila berjalan dekat booth user boleh nampak detail company — `a8dd788`
  - Walking up to a booth that is online shows a card above the buttons: logo, company, booth number, their one line for visitors, and their website. Tap it for the full booth sheet.

- [x] Bila join game kena pergi Lean X dulu; sepatutnya tak perlu sebab card dah buat — terus ke mission, dan claim tote bag di Lean X bila mission habis — `630215a`
  - The mission starts the moment the card is made: no Lean X first. Chapters: Your card → Checkpoints → Claim your tote bag. The trail leads to the nearest checkpoint straight away, then to Booth 8H18A once all are scanned.
  - The prize code (QR + 6 characters) is now shown in the game: the mission card's **Show my prize code** in chapter 3, or menu → **My prize code**. The crew scans it at `/crew.html` → Prize codes.
  - Lean X's own QR no longer starts anything: scanned, it says how many checkpoints are left, or that the tote bag is here.

- [x] Onboard exhibitor, tapi visitor tak nampak avatar dia dalam game — `9119c2b`
  - The avatar was only there while the game tab was in front: "Open my dashboard" opens a new tab, so the game tab went to the background and stopped sending positions (the server forgets anyone quiet for 15 s). Now the dashboard itself keeps its host standing at the booth: behind the counter, facing the aisle, labelled with the company, and the booth shows "At the counter now". Going back to the game tab from there is not refused as a teleport. A locked phone still steps away, so exhibitors keep the dashboard open on the counter screen.
  - The first push (`849686f`) took the API down for ~10 min: the server imported game code with extensionless imports, which Node ES modules on Vercel cannot resolve. Reverted (`6a6154b`), then shipped with the geometry in `shared/`. Rule: the server imports only from `server/` and `shared/`, always with `.js`.

- [x] Dalam dashboard Roy tak ada QR untuk share pada teammate — `126efec`
  - It was there, on the dashboard below the QR and photo cards ("Your booth team": QR, link, WhatsApp), so on a phone it sits below the fold; the in-game **My booth** sheet had no team link at all. Now the sheet shows the same team QR, **Copy team link** and **Send on WhatsApp** under the booth QR, for the owner. Checked in Chrome on an isolated local copy: hand-over link → Continue as Roy → My booth shows the team QR; the dashboard shows the team card; a curl visitor sees Roy at his counter, labelled UOB.

- [x] Visitor pun kekal di tempat terakhir dia berhenti, macam exhibitor — `ce36ea8`
  - Anyone whose phone goes quiet (locked, another app, the dashboard closed) keeps standing where they stopped, still and out of any pose, for 12 hours (`PRESENCE_LINGER_MS` in `shared/rules.ts`): there all show day, gone by tomorrow. "N in the expo now" counts them. Coming back hours later lands wherever the game puts you. This also removes the dashboard caveat: an exhibitor stays at the counter after closing it.

- [x] Buang butang "skip" masa join game — `e0aa062`
  - It was **Skip this one** on the mission card, beside **Scan QR**: it moved the trail to the next checkpoint, but read as skipping a QR scan. Gone. The trail still leads to the nearest unscanned checkpoint and moves on by itself.

- [x] Crew boleh upload logo dan backdrop untuk exhibitor yang didaftarkan, dari /crew.html — `75c1e63`
  - **Booths** tab: every booth has a Logo and a Booth photo cell with the thumbnail and an **Upload** chip. **Register**: after saving an exhibitor, two rows under the hand-over links, Upload logo and Upload booth photo. Both are on the booth in the game the moment they are saved; the exhibitor can still change them from their dashboard. Checked in Chrome on the isolated local copy.

- [x] Booth QRs boleh print bulk — `9719265`
  - **Booth QRs**: add booths to a print run with **All online booths**, **Hall 8 / 7 / 6**, a pasted list of booth numbers (e.g. `7C17, 7C19, 6A25`; numbers not on the plan are dropped), or **Add to print** on a search result. **Print N cards** prints one A4 card per booth, the same counter card the exhibitor's dashboard prints, with the company name once registered. Checked in Chrome on the isolated local copy.

## Still to do — feedback of 23 September (afternoon)

Checked against the code; the cause is noted where found. Nothing here is built yet.

- [ ] Dah scan tapi masih keluar "scan", tak keluar "done scan" (visitor)
  - Cause: the booth sheet hides its "Scan booth QR" box only on `met`, which the server sets for the exhibitor's *live* QR (`proof: 'host'`), not for the printed one (`proof: 'beacon'`). After scanning a printed QR the sheet still asks for a scan, and the mission card keeps its "Scan QR" button for the whole chapter. Fix: after either QR, the sheet and the card show "Scanned ✓" for that booth and drop the scan prompt.
- [ ] Auto swap card terus lepas scan; tak perlu tunjuk detail apa nak share (visitor)
  - Now: after a scan the booth sheet opens with the field picker and a "Swap card" button. Fix: `handleScan` leaves the card straight away with the saved defaults (every field, `13fc051`), shows "Cards swapped with <company>", and no picker. Same in the swap-with-a-person flow: no "What do you share" step for visitors (the defaults apply; changeable in the menu).
- [ ] "Scan now" transparent pill to remind the user to scan (visitor)
  - Now: only a toast on arrival ("You are at …, scan the QR") that fades. Fix: while the player stands at one of their unscanned checkpoints, a translucent "Scan now" pill at the bottom of the screen that opens the scanner; gone once scanned.
- [ ] Checkpoint ada laser beam / spotlight macam game
  - Now: only the current goal gets a faint blue floor wash (`world.mark('goal')`). Fix: every unscanned checkpoint gets a tall light beam from its booth (visible across the hall, gentle pulse, gold when it is the next one); the beam goes out when scanned.
- [ ] "Take me there" untuk checkpoint ketiga (UOB) takde
  - Cause: once the trail has delivered the player to a checkpoint, `reachCheckpoint` drops it from the open list for the session, so if they walk off without scanning (or it was the last one) there is nothing to point to and the button disappears; with "Skip this one" gone there is no way back. Fix: a reached-but-unscanned checkpoint comes back as a target once the player is more than ~15 m from it, and the mission card's checkpoint list gets its own "Take me there" per booth.
- [ ] "Stamp" is swap info
  - Now: at a checkpoint in the game the button is "Stamp" (a virtual stamp, `proof: 'virtual'`, no card exchange); "Swap card" is a separate button on the sheet. Fix: one button, "Swap card", which leaves the card with the exhibitor and stamps the booth in one go; no separate "Stamp" wording anywhere for visitors.
- [ ] Detail winner tak complete (crew · prize code)
  - Now: `CrewTicketView` carries name, role, company, callsign and the checkpoint count. Fix: add phone, email and the list of checkpoints they scanned (company · booth · time), so the crew can confirm the winner and reach them.
- [ ] "My card" tunjuk digital card, tak perlu
  - Now: menu → "My card" opens the public card page (`/p/<slug>`) in a new tab. Fix: remove it from the menu; the card is shown as the swap code under Swap cards → Show my code.
- [ ] Swap card detail tak complete; orang yang scan tak perlu "Save to phone"; WhatsApp tak boleh
  - Now: a contact in My contacts shows title, a one-line sub, and chips (WhatsApp, Email, Their page, Save to phone, Take back). Fix: show every field they shared (name, company, role, phone, email) in full; drop "Save to phone" on the scanner's side (My contacts) and "Save contact" on the public card page. WhatsApp: the link is `wa.me/<digits of the number as typed>`, so a number typed the Malaysian way (`012…`) gives `wa.me/012…`, which WhatsApp rejects — normalise to `60…` (drop the leading 0, add 60 when there is no country code) in the contact chips, the public card page and the crew's WhatsApp buttons.
