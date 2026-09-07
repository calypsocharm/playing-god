# HANDOFF — Playing God (read this first in a new session)

Updated 2026-09-07, early morning. Owner: Calypso (ultimatefaux@gmail.com). Repo: github.com/calypsocharm/playing-god (PUBLIC:
never commit `data/`, `.env`, or a real Creator password). Live at https://clawkeep.io on box 2. **Pushing to main is
deploying**: the server on the box runs `playing-god-update` every 5 minutes (cron hourly as backstop). Nobody has SSH from
Claude sessions; the local server (`npm start`, :3333, launch config `playing-god` in Downloads/.claude/launch.json) is only a
test bench and loads the old "laptop village" data in `data/`. Before seeding test data into `data/world.json`, back it up to
the scratchpad and restore after.

## What exists (all live)
Bodies/wounds/charts/families/grief/economy/store/loans/barter/builds; joy + hobbies (sit/walk/sing/hobby, pie/quilt/tonic/toy);
Higher Self: talk bar at page top, conversation box on villager page + Higher Self tab, follow-up buttons, standing intention,
claim/release, Creator can reclaim anyone, others after a season away; carry a villager between worlds (create.html →
"Bring someone from another world" with `/api/agent/<id>.json`); place scenes with drawn interiors (house, store) in
`client/interior.js`; map 72x36 with fog ("the pale"), explore task, lake/hills/ruin; camp as a separate town past the edge
(tents); gifts by Moon element (kindling/seeing/greenhand/farsight, `cast`), clairs (empath/clairaudient/clairvoyant/
claircognizant, always on); animals (strays choose people, hens/goats from store, dogs guard, deer to hunt, wolves in winter);
babies cannot be left (sitter/`mind`, carrying, crying alone costs); sickness (`treat` with herbs/salve/tonic); holidays the
villagers invent (`invent`→`invented` ws flow through the founder's model, scripted fallback, bunting on the map,
`celebrate`); the arts (`make`/`show`/`art`, works kept, told at the fire, grief given a shape); "Through their eyes"
(`client/eyes.html?who=`, ws `watch`, observer only); clock sliders free, only cold/harvest cost attention; winter hunger fix
(buy/hunt/fish when hungry; eat scraps); goal statement in README/CONCEPT/Village tab.

## IN PROGRESS when the window closed: threats + season score (strategy layer)
`server/threats.js` is written and syntax-checked but NOT wired in. It exports: `THREATS`, `roll(w, season, daysPerSeason)`,
`readiness(w, living, animals, builds, store)`, `readinessWord`, `warn(w, living, remember, event)`,
`land(w, living, animals, PLACES, fallIll, remember, event, die, bumpTrust)`, `seasonReport(...)`.
Wiring still to do (anchors verified in world.js):
1. `import * as T from './threats.js'` in world.js.
2. In `newDay` season-start block (`if (W.dayInSeason(w.day, w.weather) === 0)` near "attention returns with the season"):
   before rolling the new threat, build the season report for the season just ended: born/died/healed/questions/holidays
   kept/works/prayers since `w.seasonStartDay`; `T.seasonReport(...)`; replace the flat `+3` attention with
   `+report.earned` (clamp to max); if `w.despair >= 2` → `w.ended = {day, why:'two seasons of loss'}`, event, `w.paused = true`.
   Then `T.roll(w, newSeason, daysPerSeason)`, `w.seasonStartDay = w.day`. Track deaths in `die()` into `w.seasonDeaths`
   (name, cause) and births into `w.seasonBorn`; healed count = wounds→scars this season (count in processExposures caller).
3. In `newDay` every day: if `w.threat && !w.threat.landed && w.day >= w.threat.lands` → `T.land(...)` (pass `R.fallIll`).
   Each day also `T.readiness(w, alive(w), A.alive(w), w.builds, w.store)`.
4. Effects hooks: `coldSnap` → in dayPhase `const cold = ...` add `+ w.coldSnap.extra` while `w.day <= until`;
   `drought`/`frost`/`flood` → field yield ×0.15 / 0 / 0.5 while active (`let y = W.fieldYield(...)` line); flood: creek
   forage off.
5. God op `warn` (GOD_COSTS.warn = 1) → `T.warn`; `describeGodAct` case; client Weather tab: threat name, days until it
   lands, readiness word + bar, "what would help", **Warn them** button, and the last season report card (`w.reports`)
   with the earned-attention breakdown. publicState: `threat`, `reports: w.reports.slice(-4)`, `ended`.
6. Villagers: viewFor felt line when `threat.known` ("Everyone says X is coming in N days. What would help: ...");
   clairvoyants know it regardless. Scripted prep when known: cold→gather wood/craft blanket; wolves→buy dog? (no dog
   purchase yet: keep animals home); sickness→forage herbs/craft salve; drought/frost→work field, buy food; raiders→craft
   axe, stay near hearth; fire→carry stone.
7. Loss/end: when `w.ended`, the Creator gets a "close the book" card (story page) and a "begin again" that calls the
   existing `reset` op. Smoke test 2 seasons headless (roll → warn → land → report), then README section + push.
Next after that (her pick #3): a rival fire past the pale (competes for deer, trades, raids; later a second Creator).

## Standing preferences / lessons
- She wants to SEE things, not read cards (drawn scenes over text). "Claim" not "adopt". No prices/inventory counts to
  customers (different project, same instinct). Villagers must be able to refuse her; that's the game working.
- Live speed: 20 s ticks = a day per 2 min, a year per 80 min. Live world is around day 760, ~12 alive, Calypso's camp
  past the edge with Ilse and Fen; Calypso is claircognizant + kindling, her openness runs low.
- Long inline heredocs/`node -e` with `$&` or nested quotes break on this box: write a `.cjs` patch file to the scratchpad
  and run it; escape `${` in template literals inside patch files.
- Narrow-screen grid (≤900px) needs explicit row pins for header/talkbar/stage/aside.
- After touching nightPhase/newDay, always run a multi-day headless smoke test before pushing.
- Memory notes live in `C:\Users\Calyp\.claude\projects\C--\memory\playing-god-sim.md`.
