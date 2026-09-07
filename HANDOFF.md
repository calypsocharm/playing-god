# HANDOFF — Playing God (read this first in a new session)

Updated 2026-09-07, midday. Owner: Calypso (ultimatefaux@gmail.com). Repo: github.com/calypsocharm/playing-god (PUBLIC:
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

## Threats + season score (strategy layer): DONE and live
`server/threats.js` is wired: each season `rollThreat` picks a seasonal threat that lands late in the season; `T.readiness`
is recomputed daily; the god op `warn` (1 attention) names the omen and every villager remembers what would help; scripted
villagers prepare (`s.threat` in snapshotFor -> block in scripted.js); `landThreat` scales damage by readiness; effects:
`w.coldSnap`/`w.drought`/`w.flood`/`w.frost` read in dayPhase (cold + field yield + flooded creek). At each season turn
`closeSeason` builds `T.seasonReport` from `w.seasonDeaths/seasonBorn/seasonHealed/seasonHolidays` + goals/works/prayers since
`w.seasonStartDay`, attention += `report.earned` (the flat +3 is gone), and `w.despair >= 2` sets `w.ended` + pauses.
Client: Weather tab "What is coming" (readiness bar, Warn them) + "The last season, weighed"; Village tab shows the
"book is closed" card with Begin again (= reset); story.html frontispiece says so. publicState ships `threat`, `reports`,
`threatLog`, `ended`. Smoke script: scratchpad `smoke_threats.mjs` (fresh 3 seasons w/ warn, forced despair, migration of
data/world.json read-only). Live village will get its first threat rolled on load (migration rolls one if none).

## Departments (her ask 2026-09-07): DONE
`server/civic.js`: bank (savings/draw/borrow/repay, interest at season turn, inheritance, lends to the council with a 30 float)
and council (ballot every time there is no project and debt <= 60 or a season passed; scripted `preferBuild` votes by need;
`closeBallot` -> `commission` borrows and seeds the coin cost; `payWage` from council coin in the build action; `nightly`
= tithe 2% of till, debt paydown, project-finished announcement + joy, civic building effects). New PLACES `bank` (23,19)
and `council` (17,13); civic BUILDS in items.js (`civic: true`): commons, bathhouse, school, wellhouse; civic builds can
only be raised as the council's project. Bank action for taking coin out is `draw` (NOT `withdraw`, which means go home).
Client: BANK/MEETING sprites, bank + meeting-house scenes (`drawBank`, `drawCouncil`), Village tab department lines,
villager page savings/debt/vote. Migration `C.ensure` splits the till in half and moves loans/project off the store.
Smoke: scratchpad `smoke_civic.mjs`. Next (her earlier picks): a rival fire past the pale, then a second Creator.

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
