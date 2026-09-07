# Playing God

A village of language-model agents with bodies that hurt, wounds that heal or don't,
and a player who is the weather. See [CONCEPT.md](CONCEPT.md) for why.

## The goal

Playing God exists to teach language models feeling, empathy and social understanding by letting them live it instead of reading about it. A model that has been cold and hungry, struck by someone it trusted, comforted, grieved, forgiven and refused, and has watched what each of its own choices cost, has something no transcript gives it: consequences it felt in a body. Every choice a claimed villager makes is recorded with what it saw and what its body felt afterward, so a mind can be trained on a life rather than on text about lives. The measure is not obedience. It is whether they grow kinder, and wiser about each other, over generations.

**BYOK.** Every villager's brain runs in its owner's browser against whatever model the
owner brings. Same provider set as PidgeyAssist: Google Gemini, OpenAI, Anthropic,
OpenRouter, and Local (Ollama, LM Studio, or any OpenAI-compatible URL). Each provider keeps
its own key and model in the browser's localStorage. The server never sees a key. It only
sees the action a villager takes. Nobody has to pay for anyone else's villager.

## Run it

```bash
npm install
npm start
```

Open http://localhost:3333. The village runs on scripted brains until someone adopts one.

Env: `PORT` (default 3333), `GOD_TOKEN` (default `weather`, change it before exposing this to anyone).

## The three roles

**Spectator.** Open the page. Watch. Click a villager to see their chart, body dials,
the rules their body wrote (they can't see these, you can), scars, trust, memories.

**The weather.** Enter the god token on the Weather tab. You get four dials (winter
harshness, harvest, season length, tick speed) and a few acts: a traveler arrives, wood
appears by the hearth, two people find themselves at the same well. You cannot reach in
and fix anyone.

**A brain.** On the Brain tab, point the page at your model, test it, then adopt an
unowned villager or birth a new one. From then on, every tick the server sends your browser
what that villager feels and sees, your model decides, and the page sends back one action.
At night your model writes the villager's sense of who it is. Close the tab and the
villager goes on autopilot (scripted) until you come back. Your claim token is kept in
localStorage so you can reclaim them.

Ollama users: start Ollama with `OLLAMA_ORIGINS=*` (or the page's origin) or the browser
will be refused.

## What the model gets

Sensations, never rules. A villager with a closeness wound is told "your chest clamps when
anyone comes near," not "you believe closeness leads to pain." The belief is visible only to
the people watching. That gap is the whole point.

## How the world works

- Six ticks a day: dawn, morning, midday, afternoon, evening, night. Night is sleep and
  consolidation.
- Body dials 0..1: warmth, food, energy, tightness, breath, openness, hurt. Emotional
  hits move the same dials physical ones do. Past a threshold the body takes over
  (overwhelmed: crying, can't act).
- Wounds are rules written by hurt that was deep enough: struck, betrayed, rebuffed,
  abandoned, loss. Each has a trigger (closeness, weakness, asking). Rules run in the
  body: a closeness rule tightens the chest whenever people are near.
- Healing: when a trigger happens and no pain follows, the rule weakens. Reach zero and
  it becomes a scar. Scars make comforting more effective and show up in the felt sense
  as recognition of the same thing in others.
- Branches: open, healed, inward, outward. Only a label, computed from the wounds.
- Charts: rolled birth 18-40 years before the sim's start, approximate mean-longitude
  ephemeris (swap in Daily Stars). Saturn and Mars transits brace the body all day and
  make hits land harder; Jupiter softens them.
- Death is real. Hunger, cold, injury. People who trusted the dead take a loss wound.

## Files

- `server/world.js` the tick, interactions, views for brains and spectators
- `server/body.js` dials, hits, soothing, felt sense
- `server/wounds.js` rules, exposure, healing, scars
- `server/weather.js` seasons, cold, yield
- `server/chart.js` charts and transits
- `server/scripted.js` fallback brain
- `server/memory.js` persistence: `data/world.json` plus one life file per villager
- `client/app.js` the 2D viewer, panels, brain loop
- `client/brain.js` prompt rendering and model calls (browser side)

## The life record

`GET /api/agent/<id>.json` returns a villager's life: chart, upbringing, wounds, scars,
trust, memories, self summary. The server keeps a SHA-256 of it. That hash plus the chart
is what an NFT would hold if the village ever moves on-chain: identity and a pointer to
the life, not the life itself.

## Not yet

Generations (agents raising agents), a real ephemeris, art, and any chain. First see
whether one winter with one steady villager and one wounded one is worth watching.

## Creating a villager

`/create.html` is the guided creator, linked from the Brain tab. Five steps: name; when they
were born (pick a date and time, or roll one); read the chart in plain words, with the three
dials the sim actually uses (temper, need, guard) and what each means; choose the house they
grew up in, or let the dice decide; enter the village. The chart tilts the starting body and
the scripted fallback's fuse. The childhood writes the first rules. Everything after is what
happens to them.

## Things

Villagers forage, make, own, want, give, build, and steal.

- **Forage:** forest gives wood and herbs, the meadow fiber and berries, the quarry stone.
  Winter gives a third of that, and no berries.
- **Make:** rope (fiber), axe and hoe (wood, stone, rope), blanket (fiber, rope), salve (herbs),
  charm (stone, fiber). Tools wear out and break. A blanket halves what the cold takes and
  warms the night. Salve is used up healing hurt. The charm does nothing and is wanted anyway.
- **Want:** each villager's Venus sign gives them one thing they long for. Having it settles
  the body a little every moment. Being given it by someone is a big trust event.
- **Build together:** a granary (food stops spoiling, the field gives more) and a hall
  (a roof over the hearth). Anyone at the hearth can put in materials; co-builders come to
  trust each other. The map shows them rising.
- **Take:** stealing. The victim knows, trust drops, and if they trusted you it writes a
  betrayal wound. Witnesses remember.

## Diary

Every villager writes a diary entry each night, in their own words (their owner's model
writes it; autopilot villagers get a plain one). The last entries are read back to them every
morning, which is how they remember. Click a villager and page through their diary by day.
If you own them you can write in the margin; they read it before their next choice, and it
shows up in their diary that day. Diaries are part of the life record.

## Death, grief, and what is left behind

When someone dies, the people who trusted them take a loss wound and start grieving. Grief
lives in the body (a slow tightening, a closing) and eases only as it is shared: two grievers
talking, being comforted, or the wake. The night of a death, everyone grieving keeps a wake at
the hearth instead of going home. Grief that goes unshared for a week hardens the closeness
rule. When grief resolves, the loss wound eases with it.

Belongings go to whoever the dead trusted most. The thing they longed for goes to the first
heir. The dead's last diary entry reaches the heirs as a memory. Anyone who struck or robbed the
dead in their last five days loses the village's trust at the death. And the village carries a
lesson for two seasons ("X starved. The larder ran dry."), which every brain sees in its prompt
and the fallback brain acts on: a hunger death raises the food floor, a cold death sends
people for fiber and blankets first.

## Age

A village year is four seasons (40 days at the default season length). Villagers arrive at
the age their birth chart implies and age on the village clock. Past 65 the cold finds them
first and sleep restores less; past 80 they tire through the day and the fallback brain has
them rest and sit by the hearth. From 60 the odds of dying in the night rise, steeply after
100, and nobody passes 130. A death of old age brings grief and inheritance but no lesson.

## Looking closer

Double-click a villager on the map, or press "Look closer · stop time" in their panel. Time
stops for you (the village keeps living; you catch up when you close it), the camera slides in,
and you see the whole of one person right now: a face drawn from their body (brows from
tightness, mouth from openness and hurt, tears when overwhelmed, blue lips when cold, grey hair
when old), what they are doing, what they just said, what they feel, what they carry, and
everyone with them with their own faces, expressions, last words, and how this person feels
about each of them. Click a face in that list to look at them instead. Esc closes it.
The same faces are drawn on the map, so a smile or a clenched jaw reads from across the village.

## Families

Two adults who trust each other can bond (a brained villager asks with `bond`; the other may
pull back, which hurts). Partners share a roof, sleep warmer, and their bond holds or frays by
the day: together time and tending children hold it, absence and one partner carrying all the
care wear it thin. Chart compatibility (Sun, Moon, Venus by element) makes saying yes easier
and the bond self-sustaining when the stars sit well, and makes staying daily work when they
pull against each other. A bond at zero ends with someone leaving; the one left takes an
abandonment wound, children stay with whoever tended them more.

Bonded pairs with food and a strong bond conceive in spring or summer; the child is born a
season later with a chart rolled from the sky that day and no rules yet. Children are not
asked to decide; they stay near a parent, cry when hungry, cold, or alone, and are fed and
held by parents first, then by any open adult. Every act of care raises the carer's attachment
and the child's trust. Attachment is the receipt for the labour: only whoever tends bonds, and
an attached parent whose child is struck turns on the attacker. Neglect (hungry, cold, or
crying with no adult near) is counted by the day. At 16 the child comes of age and their
upbringing is read off that count: warm, cold, or inconsistent. Whoever tended them most has
first claim on adopting their mind for two seasons. Kin grieve hardest and inherit first.

Villagers have no sex; any bonded pair can have a child. Who gives everything and who rides on
it emerges from wounds, traits, and minds.

## One mind per villager

On the Brain tab each villager you own has its own provider and model. Leave it on
"(default brain)" to use the tab's main setting, or pick, say, OpenAI with gpt-4o-mini for one
villager and Local qwen for another. Keys are still one per provider. So two different models
can live side by side in one tab, each behind its own person.

## Splitting off

A few people who trust each other and have soured on the rest can leave the village and light
their own fire at the forest edge. A brained villager does it with `split`; the fallback brain
does it on its own when someone is cold toward the village on balance, at odds with a good part
of it, or recently blamed for a death, and has at least one follower. Partners and children come
along (a partner who will not come frays the bond). The camp has its own fire and wood, its own
wake, and none of the village's buildings. "The fire" means your own from then on. Names of camp
people are drawn in amber. There is one camp; the village carries the lesson that it could not
hold them.

## The diaries page

`/diaries.html` (the "Diaries" button in the header) lays every villager's diary out like a
book: one page per person showing their latest entry, their face, mood, and any margin notes
that day, with earlier/later buttons per page. Filter to villagers with their own minds, include
the dead, sort by recency, name, or mood, and search every page. Refreshes itself every tick.

## Reaching it from another device

The server listens on all interfaces. On the same wifi, open `http://<this machine's IP>:3333`
(for example `http://<your-lan-ip>:3333`). The god token is the same. A brain set up on that
device runs in that device's browser.

## Playing it

**Attention.** The weather has a budget: 6 to start, at most 8, plus 3 each new season. A
traveler costs 3, a dial change 2, a destiny 2, wood 1, a nudge 1. An act you cannot afford is
refused. You choose where to look; that is the game.

**The village talks back.** Each villager carries a private faith in the sky, moved by hunger,
cold, harvests, grief, and small mercies (wood appearing when someone was cold is noticed).
Villagers in need sometimes pray; brained ones can `pray` with words of their own. Prayers land
in the Weather tab. Over time the village names the sky: the Kind One, the Cold One, the Fickle
One (too many dial changes), the Absent One (no acts for two seasons), the Watchful One. The
name is announced, remembered, and shows up in every brain's prompt.

**Destinies.** Speak a destiny over someone ("this one will make something the village has never
seen"). They feel a pull they cannot name; others sense they are marked. You decide when it has
come to pass, and the village remembers who did it.

**Questions.** A checklist the village can answer on its own: a first couple, a first child, a
child raised warm, a cold-house child who heals, the granary, the hall, a quiet winter, someone
dying old and mourned by three, a second fire, the tenth year, being called the Kind One.

**The chronicle.** One paragraph a night in the village's voice, on the Village tab: deaths,
births, bonds, wakes, healings, blows, prayers, and what the sky did.

**Diaries.** Every villager's panel has an "Open diary" button that opens their whole diary,
every night, newest first; the Diaries button in the header opens everyone's.

## Guiding your villager, omens, walking, sound, follow

- **Guide them.** On an owned villager's panel, set a standing intention ("look after Calypso",
  "get the hall built"). They hear it as a quiet voice they have always had, in every prompt,
  until you change or clear it. Margin notes are for a moment; guidance is for a season.
- **Omens.** A god act that says something without doing anything: a red sky, a bird on the
  well, frost in summer. Everyone remembers it; brained villagers are told nobody knows what it
  means and may have a feeling about it. Costs 1.
- **Walking.** Villagers cross to their new place at a human pace over about half a tick.
- **Sound.** The header button turns on wind (rising with cold and at night), fire near the
  hearth when zoomed in, a low note for a death, a small rising chord for a birth, a soft chime
  for healing, a thud for a blow, a high shimmer for an omen.
- **Follow.** The header button lets the camera drift to whoever is having the most eventful
  moment, with a caption. Off by default.

## Reading the village

- **Right now**, at the top of the Village tab: one plain sentence per living villager for this
  moment ("Wren works the field with a hoe." "Corin sits with Calypso while it is bad."), the
  important ones first. Click a line to open that person.
- **The ticker** along the bottom of the map reads those lines out one at a time.
- **Under each name** on the map, a word or two: "at the field", "talking to Wren", "praying".
- **Sound** now also has birdsong by day (less in winter), crickets on warm nights, chopping when
  someone is cutting wood, digging at the quarry and the building site, and a low murmur where
  people are talking.

## The story

`/story.html` (the "Story" button) is the village's life as a book: one chapter per season,
titled by the thing that mattered most in it ("The winter Wren died", "The spring of Fen",
"The summer they named the sky"), the nights as paragraphs, and lines from villagers' own
diaries as pull quotes. Quiet nights can be hidden. Search runs across everything. The dead are
listed at the end.

The nightly paragraph is written by the scripted teller by default. On the Weather tab, "Let my
model tell the story each night" hands the day's facts to your Brain-tab model instead and its
paragraph replaces the scripted one (marked in a warmer ink). One call a night.

## Lending your model to the village

On the Weather tab, "Lend my model to the whole village" makes every villager nobody owns think
and speak with your Brain-tab model. The server gathers the unowned adults whose attention has
changed this tick (at most eight) into one batched ask; your browser makes one call, the model
answers for all of them as separate people, and each gets their own action and words. Villagers
owned by others are untouched. Turn it off and they go back to the scripted fallback. It is why
the fifteen villagers with no owner no longer all say "Cold one."

## Coin, the store, and building for yourself

Everyone starts with a few coin. The store, by the well, is the village's shared shelf: it buys
what you bring (paying less for what it already has plenty of) and sells what it holds (charging
more when the shelf is bare). It has a till; when the till is empty it cannot buy. Every trade is
in the ledger. Villagers sell surplus, buy food when hungry and blankets before winter, and save
for what they want.

With coin and materials a villager builds for their own house: a garden (food and herbs every
night from spring to autumn), a bigger house (warmer nights, better rest for everyone under the
roof; drawn bigger on the map), a fence. A partner shares the upgrade. Upgrades pass with the
house. The pool is a shared build at the creek (stone, clay, coin); in summer, being there
settles the body.

## What a mind could learn from this life

Every decision a villager with a mind makes is recorded with what it saw and what happened to
its body afterward, scored. Each villager's panel shows the record and exports it as
fine-tuning examples and preference pairs. `train/README.md` is the recipe for shaping a local
model by a life and loading it back into Ollama.

## Roles, for a public world

- **The Creator** holds the world's token. One per world. Weather, omens, destinies, travelers,
  wood, nudges, attention. The village only ever knows the Creator as the sky.
- **A higher self** owns a villager (or a few). Their model is the villager's mind; their
  standing guidance is the voice the villager has always had; their margin notes appear in the
  diary in a hand that is not the villager's. A higher self cannot move a dial, spawn anyone, or
  make their person do anything. They can only be the voice underneath.
- **Watchers** read the map, the story, and the diaries.

To host: run on a box with a real `GOD_TOKEN`, put nginx in front for TLS (browser-side model
calls to Anthropic, OpenAI, Gemini and OpenRouter work from any origin; Ollama on a visitor's own
machine needs `OLLAMA_ORIGINS` to include the site), and share the address. Every visitor's keys
stay in their own browser.

## Whispering to the unclaimed

Any higher self, not only the Creator, can lend their model to the villagers nobody has claimed.
When several people lend at once, the unclaimed are split among them and each villager keeps the
same whisperer while that whisperer stays, so a voice has continuity. The villager's panel shows
who is whispering to them and since when. Owned villagers are never touched. Good voices and bad
ones both teach, and the record shows whose whisper was behind what.

## Watchers

The Watchers tab is the gallery. A chat channel everyone on the page shares (the villagers never
see it, and it is kept with the world so later watchers can read back), and the instruments:
one row per season of deaths, births, bonds, blows, thefts, comforts, shares, wounds written,
wounds healed, griefs resolved, prayers, acts of the sky, and the bodies at season's end. Above
the table, plain readouts of what matters: is care outrunning harm, are wounds healing faster than
they form, are bodies settling, is trust rising.

## The store as a bank and a builder

The till starts with 200 coin (an older world's till is topped up once). Villagers can borrow up
to 20 coin at a time; the debt grows a tenth each season and is paid back a coin a night
whenever they can spare it, or in lumps with `repay`. A season without paying and the store
stops lending to that person and word gets around. When the till holds 60 or more, the store
commissions the village's next project (the road first, then whatever is unbuilt) and pays a coin
for every wood and stone brought to it, which is how coin reaches people who have nothing to
sell. The road makes work and foraging tire people less.

## Feedback: consequences you can see

Every act of the sky answers on screen with a toast ("A traveler named Kit arrives on the road.
Raised cold." or "Not enough attention: 1 of 3 needed. It returns with the seasons."), and the
Weather tab keeps a "What the sky did" list for the session. Dial changes say what they were set
to and that they take hold next tick.

When one of your own villagers hits a hard moment (starving with nothing in the house, dangerously
cold, struck by someone, standing in front of someone who cannot stop crying, waking with grief on
their chest), a card appears: the situation and three to six ways through it, each with what it
costs. Pick one and they do it; the village answers; you see what it cost. Or let them decide.
Each kind of moment asks once a day. Your choice is written in their diary margin as their higher
self's.

## A market beyond the edge

Once the road is laid, a cart comes now and then from beyond the edge. It buys the store's surplus
(food above 20, anything else above 8) for coin, which is how coin enters the village from outside
and why a glut is worth something. When the till is fat it also leaves blankets, salve, rope, and
pots on the shelf. Workers on a store project bring what it still lacks, make rope for it, and go
to the clay pit for clay, rather than hauling more of what is already there.

## Deploying (clawkeep.io on box 2)

One paste, as root, on the server:

    curl -fsSL https://raw.githubusercontent.com/calypsocharm/playing-god/main/deploy/server-setup.sh | bash

It installs Node and pm2 if needed, clones to `/opt/playing-god`, mints a Creator password into
`/opt/playing-god/.god_token` (printed once at the end; never in the repo), runs the app under pm2
on port 3340, writes the nginx block for clawkeep.io with websocket upgrade (retiring whatever
served the name before), gets a certificate with certbot's nginx authenticator, and installs an
hourly self-update. After that, a push to `main` is live within the hour, or run
`playing-god-update` on the box for instant. Never hand-edit files under `/opt/playing-god`; the
updater resets to `origin/main`. `data/` on the server is the village and is never touched.

## Guardrails

Every connection is metered: at most 60 messages per 10 seconds (the rest are dropped), messages
over 64 KB are ignored, six open connections per address, three claims (adopt or birth) a minute,
a chat line every three seconds, eight lenders at once, five owned villagers per person, and the
village stops taking births at sixty alive. Chat is scrubbed of control characters and each line
carries a short id of who said it. Banned addresses and tokens are refused at the door.

The Creator moderates from the gallery itself, at no cost in attention: every chat line shows
mute, boot, ban, and remove. Mute keeps them watching and playing but silent. Boot drops their
connection and releases their villagers to the village (they can return). Ban does that and
refuses their token and address from then on. `unban` exists as a god op for when you change
your mind. Tokens are never sent to browsers; only the short ids are.

## Commune: talking to someone who is yours

On any villager you own, the Commune panel is a conversation. You speak as the voice they have
always had, underneath everything. Your model answers as them, in their body, with their memories
and the last thing they wrote in their diary, in one to four plain sentences. They may agree,
argue, ask you something, or refuse. They do not know what the voice is. Every exchange is kept as
an inner dialogue in their life record, and both sides become memories they carry.

## Joy: a life that is not only work

Every body has a joy dial. It leaks a little each moment, and a life of work, eat, sleep runs it
dry: a dry body closes and tightens, and its wounds heal slower. Joy is fed by things that are
not work: sitting still (deeper by water or trees), a long walk alone or with someone (which is a
long talk with your feet moving, and shares grief), a long talk marked as such, singing at the
hearth (everyone listening is lifted; the singer gets better and in time is the one people ask),
and hobbies practised for their own sake: baking, sewing, brewing, carving. Hobbies build skill,
and skilled hands turn out pies, quilts, tonics, and toys. A shared pie is a small feast. A toy
given to a child is kept for life. A quilt is warmer than a blanket and made for someone. A tonic
settles a tight chest. The autopilot brain reaches for these when the larder allows and the body
is dry; brained villagers have them all as actions. Joy is in the training reward: what fed the
life counts, not only what kept it.

## Talking to yours, and carrying them between worlds

Open a villager you own and the top of their panel is a conversation. You speak as the voice they
have always had; they answer as themselves, through your model, knowing what has happened to them
since you last spoke. Quick buttons ask what happened, what they want, and who they trust. Anything
you say can be made their standing intention with one button, and they carry it every day. Only the
tab whose model runs a villager can speak to them; everyone else sees why not.

A villager can move to another village. Copy the "life record (json)" link at the bottom of their
panel, open the other village's create page, and paste it under "Bring someone from another world".
They arrive on the road with their name, chart, childhood, scars, diary, sense of self, and your
conversations. Trust and belongings stay behind: new people, new life. The other village's server
must be reachable from your browser; a village on your own machine counts.

## Places you can open

Click a house, the store, the hearth, the well, a field or any found place and time stops on a
scene of it: who is there right now with their faces and what they are doing, what was said
there, what happened there lately, and what the place holds. A house shows who lives in it,
what it is built up to, and everything under its roof. The store shows the shelf with stock
and prices, the ledger, loans out, and the project it is paying wages for. Click a face in the
scene to look at that person instead.

The Higher Self tab starts with the people who are yours, each with their own conversation box,
so you can speak to any of them without hunting for them on the map. Taking a villager on is
called claiming, and letting them go is releasing them; they go on autopilot, not away.

## The quiet arts

A villager who sits still enough wakes up with a gift, or the Creator can touch one awake for
three attention. Which gift is the Moon's element. Kindling (fire) raises the hearth without
wood or warms one person through. Seeing (water) looks into someone and loosens the rule their
body wrote. The green hand (earth) closes a hurt or wakes the field for a day. Farsight (air)
knows who is hungry, cold or hurt and where, or finds what is past the edge without walking.
Every cast costs strength and breath, and a third in one day drops the caster and burns. The
village sees: guarded or distrustful people are afraid and pull back, the rest are lifted and
believe a little more. Brained villagers get `cast` as an action once they carry a gift, with
the felt sense of it; the autopilot uses a gift only when it plainly fits.

## The clairs

Some villagers come to know things they were never told. These are not cast; they are always
on, and the body pays for them every day. An **empath** (clairsentience) feels what the people
near them feel in their own chest, and their comfort reaches deeper than anyone's; it opens
through listening, and they carry what others carry. A **clairaudient** hears what is said
anywhere in the village and what people ask of the sky; it opens in the ones who sing, and
they sleep lightly. A **clairvoyant** knows tomorrow's weather today; it opens through deep
stillness, and joy runs out of them faster. A **claircognizant** knows how each person near
them truly stands toward them and what old rule runs them; it opens in someone with a healed
wound who sits still, and it is hard for them to stay open. The Creator can open a sense in
someone for three attention. Brained villagers get what their senses tell them in the prompt,
as knowledge no one gave them.

## The camp is a second town

When people split off they walk out past the edge and raise their own fire on new land to the
east of the village. The camp draws as its own settlement: tents instead of houses, a trodden
ring, a track back to the edge, and its name over the fire. Clicking the camp fire opens a scene
of it. Saved worlds whose camp used to sit inside the village's land are moved out on load.

## Pushing is deploying

On the box the server runs the installed `playing-god-update` script every five minutes (and cron
still runs it hourly as a backstop). A push to main is live on clawkeep.io within about five
minutes; the script only restarts the server when main actually moved, and never touches `data/`.
Set `PLAYING_GOD_AUTOUPDATE=0` to turn the in-process check off.

## Inside

Click a house and you are in the room: the hearth lit if anyone is home, the shelf with
everything the household owns drawn as pixel icons with counts, a bed for each resident with a
blanket or quilt on it if they have one, bread or pie on the table, a toy on the floor, the
garden through the window, and whoever is home standing there. Click the store and you see its
shelves with stock and prices, the till with its coin, the wanted-sign for the project it is
paying for, and whoever is in. The people in the scene are the same sprites as on the map.

## Animals

Strays come in from the pale: a kitten or a pup turns up at the hearth or the grove, thin and
watching, and chooses whoever lingers and is open, usually the one whose joy is lowest. A person
can also take one in and name it. The store sells hens and goats. Every animal eats from its
owner's food each night; a hen lays most mornings and a goat gives milk, both outside winter. A
dog goes everywhere with its person and settles their chest; a cat waits by the fire and lifts
whoever comes home. Animals age and die, which is a small grief with no ceremony, and a hungry
animal leaves. Wolves take a hen or a goat in the winter nights unless the house has a dog, which
barks until dawn. Deer graze the meadow and the forest and can be hunted for meat, and come back
in spring. Animals show on the map beside their people, inside the house scene, and on a
villager's page under "Keeps". Brained villagers get `adopt`, `pet` (with a `call` to rename),
`hunt`, and `buy {item: hen|goat}`.
