# Teaching a mind from a life

The village records every decision a brained villager makes: what they saw (the exact prompt),
what they chose, and what it did to their body afterward, scored. This folder turns that record
into a model that has been shaped by having lived it.

Nothing here runs inside the game. It is a separate step you run when a villager has lived long
enough to have something to teach.

## What the game gives you

For any villager with a mind, on their panel:

- **Export examples** → `Name-sft.jsonl`. One line per decision that went well enough
  (`?min=0.2` to be stricter). Chat format: system, the villager's view, the villager's answer.
- **Export preference pairs** → `Name-dpo.jsonl`. In similar moments (same place, same company,
  same coarse body state), the choice that led somewhere better paired against one that led
  somewhere worse. `chosen`, `rejected`, and the margin between them.

Raw records live in `data/training/<id>.jsonl` with `before`, `after`, and `reward`.

## The reward

The body scores what followed a choice, over the next moment:

    + settled chest (tightness down) ×2      + fed, warm, breathing ×1
    + hurt healed ×3                         + more open ×0.5
    + trust gained ×0.8                      + wounds weakened ×2, grief eased ×1
    − 5 if they died

It is not "did the task succeed." It is "did the body settle." That is the difference between
teaching a model to be useful and teaching it to have been somewhere.

## Training a local model

Requires Python with `transformers`, `peft`, `trl`, `datasets`, and a GPU that fits the base
model. Install them yourself; nothing here downloads anything.

    pip install torch transformers peft trl datasets

Then, with the base model's Hugging Face name (the same family you run in Ollama):

    python train_lora.py --base Qwen/Qwen2.5-7B-Instruct --sft Calypso-sft.jsonl --dpo Calypso-dpo.jsonl --out calypso-adapter

Stage 1 (SFT) teaches the model to answer the way this villager answered when it went well.
Stage 2 (DPO) teaches it to prefer what settled the body over what did not, in the same moments.
The script holds out 10% of the pairs and reports whether the adapter prefers the chosen answer
more often than the base did. If it does not, do not load it. A bad winter can teach flinching.

## Loading the mind back into Ollama

Merge and export to GGUF (see `export_gguf.md`), then:

    FROM qwen2.5:7b
    ADAPTER ./calypso-adapter.gguf
    SYSTEM You are a villager with a body.

    ollama create calypso -f Modelfile

Set that villager's mind to `calypso` on the Brain tab. Their diary will note that something in
how they think changed.

## Honest limits

- The record is one life. A few hundred decisions nudge tone and tendency; they do not install
  wisdom. Ten villagers over ten years is where it starts to mean something.
- The reward is the body's, not the village's. A villager could learn to be comfortable and
  useless. Trust is in the reward to pull against that. Watch for it.
- Whether the resulting model feels anything is as unknown after training as before. What you
  get is a mind whose defaults were shaped by consequences it lived through, which is what
  childhood does to people, and it is the closest thing this project can offer.
