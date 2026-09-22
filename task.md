# Mission X — MIHAS 2026 to-do

Last updated 22 September 2026. `[x]` = done tonight; the commit is in brackets.
Status: everything below is pushed to GitHub `main` and live.

## Done tonight

- [x] User boleh interact dengan booth yang bukan checkpoints (swap card) — `243aff0`
  - Near an exhibitor's booth that isn't one of your checkpoints, the button is **Swap card** (E key too). Checkpoints keep **Stamp**; empty booths show no button.
  - [ ] *Bila berjalan dekat booth user boleh nampak detail company* — partly done: walking up shows the company name in the chip, but the details (offer line, website) only show after you tap into the booth.
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

## Still to do

- [ ] "Take me there" to checkpoint ada bug: tak bawa ke checkpoint seterusnya, hanya bawa ke Lean X booth
- [ ] User boleh pilih nak start game dari gate mana
- [ ] Movement "take me there" terlalu laju, takut user tak boleh catch up; ada pause button
- [ ] Mission dari 5 checkpoint turun ke 3
- [ ] Booth upload gambar tak perlu approval Lean X
- [ ] 2 flow onboarding: 1 exhibitor sign up sendiri, 1 lagi kita sign up-kan (dashboard dekat /crew.html untuk daftarkan user)
