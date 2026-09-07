# HANDOFF — Playing God (read this first in a new session)

Updated 2026-09-07, evening. Owner: Calypso (ultimatefaux@gmail.com). Repo: github.com/calypsocharm/playing-god (PUBLIC:
never commit `data/`, `.env`, or a real Creator password). Live at https://clawkeep.io on box 2. **Pushing to main is
deploying**: the box runs `playing-god-update` every 5 minutes (cron hourly as backstop); client files go live on the pull,
server files only on the restart it triggers. Nobody has SSH from Claude sessions. The local server (`npm start`, :3333,
launch config `playing-god` in Downloads/.claude/launch.json) is only a test bench and loads the old "laptop village" in
`data/`. **Back `data/world.json` up to the scratchpad before any preview_start and restore it after** — the test bench
writes to it. Check the live world with `curl -s https://clawkeep.io/api/state`.

## What exists (all live)
Bodies/wounds/charts/families/grief/economy/barter/builds; joy + hobbies; Higher Self (talk bar, conversation box, standing
intention, claim/release, carry a villager between worlds via `/api/agent/<id>.json`); drawn interiors in
`client/interior.js` (house, store, bank, meeting house); map 72x36 with fog ("the pale"), explore, lake/hills/ruin; the
camp past the edge; gifts by Moon element + the four clairs; animals; babies; sickness; invented holidays; the arts;
diaries and the chronicle. Plus everything below.

## Shipped 2026-09-07 (all live, all verified)
Anchors are the things to grep for. Every feature has a smoke script in `test/` (`node test/smoke_threats.mjs` and friends; see the section at the
foot of this file).

- **Threats + season score** (`server/threats.js`): a seasonal threat gathers and lands late in the season; `rollThreat` /
  `landThreat` / `T.readiness` daily; god op `warn` (1) names the omen; effects `w.coldSnap` / `drought` / `flood` / `frost`
  read in dayPhase. `closeSeason` builds `T.seasonReport` and **attention is earned, not given** (the flat +3 is gone);
  `w.despair >= 2` sets `w.ended` and pauses. Client: Weather tab "What is coming" + "The last season, weighed"; Village tab
  "book is closed" card with Begin again.
- **Departments** (`server/civic.js`): store = shelf only; **bank** = savings/`draw`/borrow/repay, interest at season turn,
  inheritance, lends to the council with a 30 float; **council** = ballot at the meeting house (`vote {for}`) → `commission`
  borrows → `payWage` per material → civic build. Civic builds (`civic: true` in items.js: commons, bathhouse, school,
  wellhouse) can ONLY be raised as the council's project. New PLACES `bank` (23,19), `council` (17,13). `C.ensure` migrates
  old worlds (splits the till, moves loans off the store). **The bank action for taking coin out is `draw`** — `withdraw`
  already means go home.
- **The tarot sky** (`server/tarot.js`): 78 cards, `w.deck` shuffled and drawn down, `Tarot.draw(w, cardContext(w), by)`.
  Each card is a one-line effect over `cardContext` (alive/remember/event/bumpTrust/die/emotionalEvent/awaken/openSense/
  newTraveler/propose/leave/tryConceive/foundHoliday/findNext/closeBallot/landThreat). God op `draw` (1); the sky draws one
  free at each season turn. **Rule: no card may ever pause the world** — the Hanged Man deadlocked the live village doing
  that; it now sets `w.stillUntil = day+1` (everyone rests) and createWorld unpauses a world saved on `major:12`.
  Client: card face + suit tint + "IN EFFECT" text drawn on the map by `drawCardOverlay()`.
- **The other fire** (`server/rival.js`): `w.rival`, abstract people at PLACES.rival (66,27), seen by a scout within 12
  tiles or ~year 1.5; nightly they eat, hunt the same deer, trade (warm) or raid (cold + hungry; defence = dogs + axes at
  the hearth ×1.5 + hall + fences). Villager action `send {n}` at the edge; god op `parley` (2).
- **The stones**: `w.funerals` queue filled in `die()`; `funeralIfDue` runs in `step()` at tick 3, one funeral an afternoon,
  skipped the day a threat lands. It back-fills anyone dead+unburied still grieved or dead within the year (oldest death
  first; the rest get `a.longBuried`). Grief halves and is shared, believers find them somewhere better, trust bumps.
  **Fading** in `closeSeason`: negative trust +0.025/season (grudges gone in ~5 years), wounds older than 2 years lose
  0.03/season → scar, memories older than a year blur.
- **Belief + magic** (`server/magic.js`): `a.belief` (-1..1) from upbringing + Sun; `luck(a)` tilts forage/hunt/field rolls,
  `trustWeight` inside `bumpTrust`, rebuff halved for believers, scripted comfort/withdraw split. `nightly` moves belief on
  the day's memories with confirmation bias + slow drift home. `MAGIC`/`ORDER` items found on an explore step (25%):
  `glasses` (rose-coloured, belief ≥0.7), `plenty` (necklace, +1 coin +0.5 food nightly, belief ≥0.3). New items: add to
  ORDER + an ITEMS entry (`recipe: null, magic: true`) + a whyLines mention. **Every `.recipe` use must stay guarded.**
- **Ghost mode** (`client/ghost.js`): `drawScene` paints the place from beside them (sky by tick/season, `dressPlace` per
  place key, others with name/doing/speech bubble, `drawOverlay` = them from behind + thought + running lines). Indoors it
  renders `Interior.draw*` into a 600×340 offscreen canvas, fit under the top bar, then `drawOverlay`. Both use
  `setTransform(dpr)` and CSS-pixel coords. app.js: `ghostOn`, `startGhost`/`stopGhost`, `drawGhost()` at the top of
  `draw()`. Buttons `[data-ghost]`, `#ghostExit`, Esc. **Every way out of zoom** (whole village / beyond the pale / Esc /
  drag / wheel) ends observing and ghost.
- **Observe mode**: `observing`, ws `watch`/`unwatch` → `eyes` → `onEyes` → `#eyesPanel` at the top of the Villager tab;
  camera locks at scale 2.6.
- **Narrator**: `narrateTick` every 1.5s picks the top-ranked unseen event (NARR_RANK) + its why line, dawn opener, night
  chronicle → `#narrator` over the map; `speak()` (Web Speech) behind the Narrator button; `#narrMode` select switches
  between the facts and `retell(fact)` through her Brain-tab model (her local Ollama works).
- **Story with reasons**: `whyLines(w)` (deaths with who they were + who is left, grief grouped by the dead with relation
  and days, sick/hungry/cold/hurt/low, strikes with state, threat), `standingNow(w)`, `condensedHistory(w)`, all in
  publicState and `/api/story`. `chronicleNight` leads with deaths and why; "Tam made things" filler is gone. Village tab =
  Where things stand → Recent nights → Long ago. `client/story.html` is **The History Book** (no season TOC, no ordinary
  chapters; years counted from days because chapter indices are unreliable in the old world).

## NEXT (her list, in order)
1. **A second Creator holding the rival fire** — the last of the picks she made this morning. Another person unlocks
   `w.rival` with their own password, spends their own attention on their own people, and the two Creators meet through
   trade, raids and parleys. Hooks are all in `server/rival.js` + the `god` op path in `server/index.js`.
2. More magic items when she names them (see the recipe above).

## Standing preferences / lessons
- She wants to SEE things, not read cards (drawn scenes over text). "Claim" not "adopt". Villagers must be able to refuse
  her; that's the game working. Features that live on a separate page are invisible to her — put them in the main panel.
- She gives direction as short mid-turn messages; "ok" means build it. She thinks in belief/quantum-collapse metaphors:
  map them onto tilted rolls, not new UI.
- Live speed: 20 s ticks, and her world runs **3 days to a season**, so a season turns every ~6 minutes. Live world is
  past day 1100; Calypso is claircognizant + kindling.
- Long inline heredocs / `node -e` with `$&` or nested quotes break on this box: write a `.py` or `.cjs` patch file to the
  scratchpad and run it; escape `${` in template literals inside patch files.
- Narrow-screen grid (≤900px) needs explicit row pins for header/talkbar/stage/aside.
- After touching nightPhase/newDay/step, always run the headless smokes before pushing.
- Memory notes live in `C:\Users\Calyp\.claude\projects\C--\memory\playing-god-sim.md`.

## Smoke tests
`test/smoke_*.mjs`, run with `node test/smoke_threats.mjs` etc. from the repo root. They build fresh worlds in memory and
read `data/world.json` read-only for the migration checks; none of them write to disk. `smoke_tarot.mjs` turns all 78
cards and reports effect errors (must be 0).
