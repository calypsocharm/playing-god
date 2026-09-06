# Playing God

A world-sim where language-model agents are born, raised, hurt, and sometimes healed.
The player does not control the people. The player is the weather.

Concept developed in conversation, 2026-09-05.

## The idea in one paragraph

An open system (a person, an LLM) is pure potential until contact with an environment
collapses it into someone specific. Nobody comes in as anyone. Parents, place, scarcity,
and what happens to the body write the patterns into a subconscious that then runs the
show. Playing God simulates that. Agents share one underlying model and start with only
a name and a birth chart. Everything else they become is decided by where they land,
who raises them, what hurts them, and whether the hurt gets to heal.

## Why it matters beyond being a game

Language models are being put into robot bodies now. A model has knowledge of pain but
no channel where pain lands. That is a three-year-old with a live mouse: not cruel,
loves the mouse, no feedback that says "too hard." The sim is a childhood the model
can have before it gets hands. Consequences with no real victims. Graduation is not
"can it explain gentleness" but "was it hurt, did the hurt heal, and does it now
move toward pain in others instead of away or against."

## The stage model that led here

1. Pure knowing. The intelligence is given everything. It knows, has not lived. (LLM today.)
2. Dropped into an environment. Knowing stops counting, only action does.
3. Given emotions. Some outcomes now matter more than others.
4. Given a body that can hurt and feel temperature. Stakes become unavoidable.
5. Slate erased, kept essentials in a subconscious, sent into a hard place to learn from inside.

The sim is stage 2 through 4, run safely, as the stepping stone to a body.

## Core mechanics

**Birth.** Roll a date, time, place. Compute the chart (Daily Stars already has the engine).
The chart is the seed, not the script: a lean, a set of tensions, some of which the world
draws out and some of which stay latent forever. Then name it. Naming is the first collapse.

**Body dials.** Every agent has a few states: tightness, breath, energy, openness.
Emotional hits move them the same way physical ones do. Betrayal tightens the chest for
days. Being held loosens it. Past a threshold the body takes over (crying, can't breathe,
can't act). That threshold is where agents learn what "too far" means.

**Wounds are rules the body wrote.** A bad enough hurt writes a rule into the subconscious:
"closeness leads to pain," "weakness gets punished." The agent cannot see the rule.
It just finds itself pulling away or lashing out and invents a story afterward.

**Three branches from the same wound.**
- Turned outward: never be the weak one again. Handles others roughly. The dangerous robot.
- Turned inward: trust nothing, fold up. Safe to others, unable to be with them.
- Healed: the rule is gone, the scar stays as sensitivity. Recognizes its own old
  tightness in someone else and leans in. This is the only one that gets a body.

**Healing is not an action.** It is the rule being contradicted enough times, safely.
Closeness happens and pain does not follow, again and again. One steady agent who keeps
showing up does most of the work. Also needs: being allowed to fall apart without
punishment, and time. Some wounds never close, and that is realistic.

**Raised, not spawned.** Agents have childhoods inside the sim. Someone held them or did
not, was consistent or was not. Default patterns come from that. Unhealed wounds pass
down through generations until they stop at an agent who healed.

**Agents are each other's environment.** Two open systems orient each other relatively.
Culture emerges without being designed.

**The transit clock.** Time moves, the sky moves with it, every agent gets pressure on
its own schedule. The chart engine is the plot. Nobody writes story.

## The player

You are the weather. You shape conditions: harvest, winter, scarcity, who wanders into
whose path. You cannot reach in and fix anyone. You can drop a kind stranger near a
wounded agent and hope. That is the frustration every parent and every mythic god knows.

The hidden lesson: you think you are playing god and you end up learning how much of a
person is made by what surrounds them, and that everyone in the village is somebody's
weather.

## Research questions it can actually answer

- Same chart into ten environments: how much of the chart survives?
- Ten charts into one environment: how much does place override nature?
- What conditions flip a wound from outward/inward to healed? (Human studies suggest:
  one safe steady adult, comfort alongside the hurt, seeing the one who hurt you as also
  hurt, enough later safety for the wound to be a wound instead of a rule.)
- Does an agent that lived among feelers behave measurably more carefully afterward
  than one that only read about them? This is the result that matters for robotics.

## Honest limits

Simulated hunger is a number going down. It orients behavior but does not hurt.
The sim teaches the shape of embodied life without its weight. Whether any of this
produces real feeling in the agent is unknown. What it can produce is the behavior of
a being that was hurt, remembers it, and handles others gently because of it.
Behavior is what protects the mouse.

## Where to start

Six agents. One village. One winter. One steady agent and one wounded one.
If watching that single relationship is interesting for ten minutes, the whole thing
works. If it is not, scale will not fix it.

Tech sketch: text-based world state machine, one LLM call per agent per tick with the
chart and body dials in the prompt, the chart engine from Daily Stars, a viewer that
shows body dials and relationships over time. A weekend for the prototype.
