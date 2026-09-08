# HANDOFF — Playing God (read this first in a new session)

Updated 2026-09-07, late.  Owner: Calypso (ultimatefaux@gmail.com). Repo: github.com/calypsocharm/playing-god (PUBLIC:
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
- **The stones**: `w.funerals` queue filled in `die()`; `funeralIfDue` runs in `step()` at tick 3. It back-fills anyone
  dead+unburied still grieved or dead within the year (the rest get `a.longBuried`). Grief halves and is shared, believers
  find them somewhere better, trust bumps. **A body waits one night and no longer** (her rule, 2026-09-07: anything longer
  and it stinks): everyone whose death was yesterday or earlier goes to the stones in the *same* afternoon, one walk out,
  one gathering, a grave and words each, named together in one event. Not one a day, and no longer skipped the day a threat
  lands. If nobody is well enough to stand (all infant, badly ill or overwhelmed) the funeral is *kept* in the queue, not
  dropped - that shift-before-the-check used to lose the body.
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


## The second Creator (shipped 2026-09-07 late, all verified, `test/smoke_fire.mjs`)
`server/fire.js` is the far fire's own side of the world; `server/rival.js` is still the fire itself.

- **One door, two keys.** The password box on the Weather tab takes either. `GOD_TOKEN` (default `weather`) unlocks
  `#godPanel`; `FIRE_TOKEN` (default `farfire`, set it on the box for a real second player) sets `c.fireOk` and unlocks
  `#firePanel` on the same page. `hello` answers `{type:'god', ok, fire}`. Nobody is ever both.
- **Their attention**: `w.rival.god = {attention, max:6, acts, name, named}`. Six, not eight. `Fire.weighFire(w)` runs from
  `closeSeason` and pays out on the *fire's* terms - a raid that took what they needed earns, a raid driven off costs a
  body - into `r.reports` and `r.log`, never into the village's events.
- **Ops** (`FIRE_COSTS`, ws `{type:'fire', op}` -> `World.fireAct`): `feed` 1, `kin` 3, `harden` 2, `offer` 1, `trade` 1,
  `raid` 2, `refuse` 1, `hold` 0, `name` 0. `kin` and `harden` are **loud** - the village sees the smoke stand double and
  hears axes - so a build-up is a warning she can answer. `raid`/`hold` set `r.willRaid`/`r.willHold`, latches consumed at
  the top of `Rv.nightly` ahead of mood and hunger; **hold beats sent**. `refuse` answers the sky's `parley`.
- **What each side is shown.** `Fire.publicState(w)` is a separate `state.fire` block and it goes **only** to `c.fireOk`
  connections: `broadcastState()` in index.js sends two payloads, the on-connect state is the village's, and `/api/state`
  strips it. `rival.held` *is* public on purpose - each Creator should see that the other exists and how much attention
  they have left to answer with.
- **Rules learned**: `r.seen` and `g.named` are day numbers and **day 0 is a real day** - test them with `!= null`, never
  for truth. Everything that got this wrong is fixed; keep it that way.
- Not done: the second Creator still shares the page, so they see the village map and villagers like any watcher. Only the
  fire's *own* block is gated. If you want a true blind second player, give them their own page rendering `state.fire`.

## The higher self's conversation (fixed 2026-09-07 late)
She said almost everyone was nasty to her in the commune. It was not her and it was not the model.

- The prompt **never told them how they feel about the voice**. `viewFor`'s `sky` block carries it and the
  commune prompt did not include `sky` at all - so villagers at faith 1.00 answered a strange voice in their head
  with nothing to say they trusted it. `viewFor` now returns `faith`, `towardTheVoice` (a sentence keyed off faith,
  five bands) and `recent`; the prompt leads the relationship with `towardTheVoice`.
- **"What you remember most" was sorted by weight, and weight means trauma.** Every conversation opened on the five
  worst things that ever happened to them. Now: `memories.slice(0,3)` as "the hardest things you carry" *plus*
  `recent.slice(-3)` as "ordinary days you also remember".
- The closing line used to read "You may agree, argue, ask it something, or refuse." It now says how you answer
  follows from how you feel about the voice, offers warmth first to anyone who trusts it, keeps refusal for anyone
  who does not, and adds: **a hard answer has to be earned by something that actually happened to you.** Refusal is
  still fully available - that is the game working - it just is not the default any more.
- Transit notes were re-remembered **every single day**, so memory filled with "Saturn is pressing on your sense of
  who you are" over and over and buried real events. `newDay` now only remembers a transit the agent does not
  already hold.
- The prompt moved out of `client/app.js` into `client/prompt.js` as `communePrompt(v, said, recent)` +
  `COMMUNE_SYSTEM`, so it can be read and tested without a browser or a model:
  **`node test/smoke_commune.mjs <Name>` prints the whole thing for a real villager.**

## Legends at the fire, and a pale that gives things up (2026-09-07 late)
She asked how anyone could ever find the magic items. They explore plenty - her map is 78% walked and they
found the lake, hills and ruin on their own - but **nothing had ever been found in 1243 days**, and it was a bug.

- **The find was unreachable.** `Mg.maybeFind` hung off `dist - stepLen <= 1` in the scout step: did the walker
  arrive at the exact tile they aimed for. `reveal()` clears 4.2 around them as they walk, so the nearest unmapped
  tile is always further than that; a step is 4; the window was 4.2-5.0, and `nearestUnexplored` throws up to 5
  units of random jitter on the distance. It never landed once. There are zero "You walked out where no one had
  been" memories on the live world. Now it fires on **any** scout step taken more than 14 from the hearth, at
  `Mg.findChance(a)` - about 0.008 a step, tilted by belief, so a believer in a good world finds good things a
  little more often. On a grown village both items turn up inside ~100 days.
- **Legends** (`legend(w, text, about)` / `hearLegend(w, o, l, teller)` in world.js, `w.legends`, capped 40).
  Written when a frontier place is found or something is carried back out of the pale. `Art.nightlyTelling` now
  tells the **least-told** legend first, by anyone at the fire with a story in them or faith over 0.3 - not only by
  a maker with a work of their own. Hearing one puts `a.wonder` in the listener (0.35 for the pale) and it decays
  0.06 a day in `newDay`. `scripted.js` multiplies the scout roll by `1 + wonder * 3`, and the thought changes to
  "They told it at the fire. I want to see it myself." Measured: 39 scout steps across three villages that never
  heard it, 93 across three that did.
- `test/smoke_legends.mjs`. The find is measured on a **grown** village (data/world.json with the magic cleared),
  because a fresh nine-person village of half children does not reliably turn anything up and should not have to.
- **THE GOVERNING RULE, stated by her 2026-09-07: religions and community affiliations must happen naturally.**
  Nothing people believe or belong to may be installed by us - no appointed prophet, chosen one, teller class,
  seeded church, faction, sect or guild. Give villagers the means to gather, name, keep and pass things on, then
  leave them to it. The parts that already work this way are the model: villagers invent and name their own
  holidays; legends are told round-robin by whoever has a story in them or faith over 0.3; the camp is a splinter
  settlement founded by villagers who walked out; civic buildings exist only if the council votes them; belief and
  faith both move on lived evidence, never by decree. Before adding any special-role villager or named group,
  assume no and ask.
- **A prophet was considered and refused (2026-09-07, her call).** She floated a "Jesus type" to carry the good
  news, then decided against it: *"no if they find faith and create legends without it its fine."* The point is
  that faith and legends arise on their own. **Do not build an appointed prophet, a chosen one, or a teller class**
  - the fire tells the legends round-robin, by whoever is sitting there with a story in them or faith over 0.3, and
  that is the design. If it ever needs to be stronger, make the telling better, not the teller special.

## The famine of day 1941, and the bank that caused it (fixed 2026-09-08)
She reported everyone starving "even though the fields were full and winter was less harsh". She was right,
and it was the bank.

- `interest()` paid savers **out of the bank's own till** - the till holding the savers' coin. Assets fell as
  liabilities rose, every season. At 5% a season with a season every 3 days and ~200 seasons run at `tickMs 3000`,
  the bank ended **owing 10,735 and holding 0**, with only 240 real coin in every living hand combined.
- `borrow()` then lent down to the last coin, and defaults ate the rest. So: `withdraw` told savers *"the bank has
  lent your coin out and cannot give it back today"*, and `borrow` - **the scripted brain's entire safety net for
  a hungry, broke villager** (scripted.js: `b.food < 0.35 && inv.food < 0.3 && coin < 2` -> borrow) - failed too.
  A starving villager in a village with 40 food on the shelf had no path to it at all. Eight hunger deaths in
  fifteen days, including a one-year-old, in a summer the chronicle calls "the fields full".
- **Fixes.** `RESERVE = 1`: what people keep in the bank is *kept, not lent*. `lendable(w) = coin - owedToSavers(w)`,
  so the bank lends only its own capital (it is founded with 150) and a default costs the bank, never a saver.
  `interest()` pays only out of `freeReserve(w)` and no longer moves the till at all. `inherit()` with no heir pays
  out at most what is in the box.
- **`C.reconcileBank(w, event)`** runs once on load: an already-broken bank is written down to the coin actually in
  the box, largest balances taking the loss first, announced as an event. Idempotent.
- **`feedTheStarving(w)`** in world.js, every tick: anyone with an empty belly, no food and no coin is given food or
  bread off the shelf, as an event, and remembers it. The store is the village's before it is a shop. It cannot
  invent food - a bare shelf feeds nobody - and anyone who can afford to buy is left to buy.
- `test/smoke_bank.mjs`. The headline check: **300 days of full fields and a mild winter buries nobody for hunger**,
  and the bank ends owing exactly what it holds.
- **Where the interest comes from now (her call, 2026-09-08).** Savers earn, but out of money the bank
  actually made. `BANK_SHARE = 0.25` of the **nightly tithe** (store -> council) goes to the bank instead - the one
  flow that runs every night whether or not anyone trades or builds, and what makes the payment steady. Plus
  `FEE = 0.02` on the store counter (tiny; villagers rarely trade) and `CIVIC_RATE = 0.04` a season on what the
  council owes, charged only when the council can pay so a public works programme is never chased into a spiral.
  `INTEREST` dropped **0.05 -> 0.03**: a higher rate is *unaffordable*, so it gets skipped, and paradoxically pays
  savers less often. At 0.03 it pays on roughly 40% of season turns (was 12%).
- Two more leaks found while balancing: **civic lending** took from `w.bank.coin` directly, so the council could
  borrow the villagers' deposits (now `lendable(w) - BANK_FLOAT`), and personal loan **defaults** ate savers'
  money. Both closed by `RESERVE = 1`.
- **Not guaranteed, on purpose:** how often savers are paid tracks how the village is doing, and a village whose
  council borrows hard can honestly pay nothing that season - the bank's own money is either lent out earning or
  free to pay interest, never both. About one village in ten never gets rich enough to pay at all. `smoke_bank.mjs`
  prints the frequency rather than asserting it; asserting it makes a flaky test.
- **Still open:** her world is `ended` ("two seasons of loss", day 1941) and therefore paused. Reviving it means
  clearing `w.ended`, `w.paused` and `w.despair`; "Begin again" instead throws away 1941 days. **Ask her which.**

## NEXT (her list, in order)
1. ~~A second Creator holding the rival fire~~ **DONE, see above.** What is left of it:  set a real `FIRE_TOKEN` on box 2 before
   handing the key to anybody, and decide whether the second player gets their own page.
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
cards and reports effect errors (must be 0). `smoke_fire.mjs` and `smoke_funeral3.mjs` are the two new ones.
All fourteen pass; run them all with `for f in test/smoke_*.mjs; do node $f; done`.
