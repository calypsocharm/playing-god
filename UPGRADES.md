# Playing God: upgrades

Written 2026-09-05 after the first day of building. Ordered by what would change the feel most
per hour of work. Each line is roughly a day or less unless marked.

## 1. Make it feel (the surface)

- **Walking.** Villagers teleport between places each tick. Make them walk: the server sets a
  target, the viewer moves them at a human pace. Watching someone cross the snow to sit by a
  grieving friend is the whole show and we skip it.
- **Sound.** Wind that rises with harshness, fire crackle when near the hearth, one low note at
  a death, a small chord at a birth. Half of feeling, costs almost nothing.
- **Pacing.** A wake, a birth, a death, a split should slow the clock and pull the camera in on
  their own. Ordinary afternoons should pass fast. Right now every tick has the same weight.
- **Camera that follows the drama.** An optional mode where the view drifts to whoever is
  having the most eventful moment (overwhelmed, struck, a proposal, a wake).
- **Everyone on a brain.** Fourteen of eighteen villagers still say "Cold one." Either a
  batched local model driving all autopilot villagers in one call per tick, or a fallback
  voice that speaks from memory ("You've been at the field since Wren died").
- **The chronicle in a real voice.** Let a model write the nightly paragraph from the day's
  events (opt-in, one call a night). The scripted one is a list with punctuation.
- **Better scripted diaries.** Still flat for uneventful days. Pull in the weather, who they
  sat with, what they made.

## 2. Make it a game (the loop)

- **Tune attention.** 6/8/+3 is a first guess. Watch a few seasons and adjust. Consider acts
  that cost more in winter (the sky is busier) and a "hold your breath" act that saves attention
  across a season.
- **Omens.** A cheap god act that is not an intervention: a red sky, a bird at the well, frost
  in summer. Villagers interpret it (brained ones freely). The god gets a voice without hands.
- **Faith with consequences.** A village that calls the sky Kind builds a shrine and prays more;
  one that calls it Cold stops praying and hoards. Faith should change behaviour, not just names.
- **Rituals.** First harvest, midwinter, a naming when a child is born, a joining when two bond.
  Rituals are where the village looks at itself, and they give the chronicle chapters. Only the
  wake exists.
- **Runs.** A "start a new world with these settings" flow and a closing summary when a world
  ends or the player chooses to close the book: years lived, lineages, questions answered, what
  the village called the sky. Shareable as one page.
- **More questions.** A child who buries both parents. A camp that reconciles. A stolen charm
  returned. Three generations under one roof. A stranger who arrived wounded and healed.
- **The camp as a trail.** Rationing (a camp with N days of food shown plainly), a camp journal
  in the leader's voice, deaths on the trail, and the two possible endings: reconciliation or
  a raid in a bad winter. Trade between the fires.

## 3. Make it deep (the people)

- **Relationships with texture.** Trust is one number. Add love, resentment, debt, awe, and a
  shared-history list per pair so "Wren and Ash" is a story you can open, not a +0.44.
- **A measured wit dial.** Derived from latency, missed turns, unparseable replies, and choice
  variety per villager, so the model behind a person shows up as quick or slow, present or
  absent. Record the model, and every change of model, in the diary ("Something in how I think
  changed today").
- **Children with minds.** Let an owner adopt a child at 10 with a restricted action set, so a
  childhood can be lived by a model, not only scripted.
- **Illness.** A sickness that spreads at the hearth in winter, herbs and salve that treat it,
  tending the sick as another act of care that bonds.
- **Old age with content.** Elders teach (a memory passed to a child becomes the child's),
  tell stories at the hearth, and are asked things.
- **Real charts.** Swap the approximate ephemeris for the Daily Stars engine. Deeper synastry
  (Moon to Saturn, Venus to Mars) for bonds.
- **Seasonal moods.** Long winters tighten everyone a little; spring loosens. Cheap and true.

## 4. Make it shareable (the platform)

- **Host it.** Box 2, pm2, nginx, a real GOD_TOKEN. Then friends can bring their own models and
  villagers into one village. The spectator page is what music.atmosphereengine.com is to the
  radio: the public face.
- **Many worlds.** One server, several villages, each with its own token and clock.
- **Spectator presence.** Show how many are watching; let watchers leave anonymous notes at the
  well that villagers might read (or not; gods only).
- **Export a life.** One-click PDF or page of a villager's whole life: chart, diary, wounds,
  scars, family, death. This is the NFT payload if that day ever comes.
- **Tests.** The scratchpad smoke scripts should live in the repo as `npm test`: N days on
  autopilot, a forced death, a forced bond, a forced split, and every night phase exercised.

## Known rough edges

- The WebSocket reconnect logs spam the console after a restart. Harmless, noisy.
- `world.js` is over 1,000 lines. Split: interactions, death and grief, camp, god, views.
- The save file is 1 MB and grows with memories and diaries. Cap memories harder, or move
  diaries to per-agent files only.
- Children and elders share the adult felt-sense text in places.
- Trust between talkative neighbours still climbs toward 1.0 over months; consider decay.
- The camp has no builds and no reconciliation path yet.
- The attention key sometimes re-asks a brain because a nearby villager's felt sense changed,
  not theirs.

## 5. The frontier and daily life (added at Calypso's request)

Built first slice 2026-09-05: a `scout` action that walks out past the edge (tiring, cold, usually
nothing) and can find the creek (fish), the grove (berries, herbs), and the clay pit; bread as a
staple made from food and wood, broken with others for a bigger trust event than sharing; a pot
from clay that slows spoilage and cooks fish. Two new questions: first news from past the edge,
first bread broken.

Still to do:
- **Animals.** Goats (milk as food, wool as fiber; need tending and shelter, die in a killing
  winter), dogs (a companion lowers tightness a little each tick and warns of danger; bond with
  one person), wolves (winter danger at the edge and the camp; a fence or a dog keeps them off).
  Livestock as property that can be inherited, given, stolen.
- **Water.** A well that can run low in a dry summer; a bucket; carrying water as a chore that
  children can do; the creek as the village's fallback.
- **Cooking.** Stew (fish or berries plus herbs in a pot) that feeds a family at once; a communal
  meal at the hearth as a ritual that shares grief and builds trust.
- **Cooling.** Summer heat that wears people down; shade at the grove; swimming at the creek as
  the summer equivalent of the hearth.
- **A scout role proper.** Someone the village recognises as its scout, with a better chance of
  finding things, whose news is a chronicle event; more frontier places (a cave, a hill with a
  view, ruins of an older village, a second river with a ford to the far side); a map that grows.
- **New land as new settlements.** The far side of the river as where a camp can go instead of
  the forest edge, with a real distance between fires.

## 6. Animals as god-play (Calypso's kitten)

The way in: not livestock first, but one small creature, sent by the weather, with a will of its
own. A god act, "a small creature arrives" (cost 2), drops a kitten or a pup at the edge or the
well. From there it is the village's problem.

- **The creature is a tiny agent.** Body dials (hunger, fear, trust), no chart, no diary. It
  attaches to whoever feeds it, follows them, and sleeps in their house. It lowers its person's
  tightness a little each tick just by being there. It can scratch or bite when handled tight or
  frightened: a small physical hit and a small hurt, which for someone like Rook is a rebuff from
  the one thing that was starting to work.
- **It can be given.** `give {target, item: kitten}` hands it over. The creature's trust resets
  toward the new person. A villager who dislikes cats but loves animals (a trait from the chart:
  Venus in earth loves creatures, Mars in fire is impatient with them) will feed it and try to
  place it: "who wants the cat?" becomes something they ask in talk, and brained villagers will
  actually ask. Refusals and acceptances are trust events.
- **It can be lost, stolen, or die.** Animals are property and company at once, so the take and
  inheritance rules apply, and grief applies at a smaller weight. A child who grows up with one
  gets a memory line about it for life.
- **Weather-side animals.** Later: wolves in a killing winter (a god act "the wolves come",
  cost 3) that threaten the edge, the camp, and anyone alone at night; a fence or a dog keeps
  them off; a fight with a wolf writes a real wound. Goats as the first livestock (milk, wool,
  need a pen and hay). Bees at the grove (honey, a sting).
- **Sky events as omens or acts.** Eclipse (added as an omen), a comet over a whole season,
  aurora, a hailstorm that ruins a harvest (an act, costs 2), a long rain that fills the creek.

## 7. Property and improvement (Calypso, night 1)

- **A store.** Not a shop with a keeper (there is no money yet) but a shared exchange: villagers
  put surplus in and take what they need; who gave and who took is remembered, which is trust
  and debt at once. Later, tokens of exchange (the charm was always halfway to being one).
- **Upgrades you build for yourself.** A bigger house (room for a partner, children, and an
  elder; warmer at night), a garden by the house (a small steady yield without walking to the
  field; herbs for salve), a bathhouse or pool at the creek (a summer place, the cooling we
  talked about, and a place to talk that is not the hearth), a fence (keeps wolves off, later).
  Each is a personal build with a cost in materials, visible on the map, inherited with the house.
- **Gardens grow.** Planted in spring, tended (a small act of care that bonds a household),
  harvested in autumn, dead in winter. A neglected garden shows it.
- **Night owls** exist now: the young, restless and grieving sit up late by the fire when there is
  wood; children slip out and worried parents notice.
