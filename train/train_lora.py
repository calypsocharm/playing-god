#!/usr/bin/env python
"""Shape a local model by a villager's life: SFT on what went well, then DPO on what went better.

Usage:
  python train_lora.py --base Qwen/Qwen2.5-7B-Instruct --sft Name-sft.jsonl --dpo Name-dpo.jsonl --out name-adapter

Needs: torch, transformers, peft, trl, datasets. A GPU that fits the base model in 4-bit.
Nothing is downloaded here except the base model you name, by the Hugging Face libraries.
"""
import argparse, json, random, sys

def load_jsonl(path):
    with open(path, encoding='utf-8') as f:
        return [json.loads(l) for l in f if l.strip()]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', required=True)
    ap.add_argument('--sft', required=True)
    ap.add_argument('--dpo', default=None)
    ap.add_argument('--out', required=True)
    ap.add_argument('--epochs', type=float, default=2)
    ap.add_argument('--holdout', type=float, default=0.1)
    a = ap.parse_args()

    try:
        import torch
        from datasets import Dataset
        from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
        from peft import LoraConfig
        from trl import SFTTrainer, SFTConfig, DPOTrainer, DPOConfig
    except ImportError as e:
        print('missing dependency:', e, '\npip install torch transformers peft trl datasets bitsandbytes', file=sys.stderr)
        sys.exit(1)

    tok = AutoTokenizer.from_pretrained(a.base)
    tok.pad_token = tok.pad_token or tok.eos_token
    quant = BitsAndBytesConfig(load_in_4bit=True, bnb_4bit_compute_dtype=torch.bfloat16)
    model = AutoModelForCausalLM.from_pretrained(a.base, quantization_config=quant, device_map='auto')
    lora = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, target_modules='all-linear', task_type='CAUSAL_LM')

    # Stage 1: supervised, on the decisions that went well.
    sft = [{'messages': r['messages']} for r in load_jsonl(a.sft)]
    random.shuffle(sft)
    print(f'SFT examples: {len(sft)}')
    trainer = SFTTrainer(model=model, processing_class=tok, train_dataset=Dataset.from_list(sft), peft_config=lora,
                         args=SFTConfig(output_dir=a.out + '-sft', num_train_epochs=a.epochs, per_device_train_batch_size=2,
                                        gradient_accumulation_steps=8, learning_rate=1e-4, logging_steps=10, save_strategy='no', bf16=True))
    trainer.train()
    model = trainer.model

    # Stage 2: preference, on pairs from similar moments. Hold some out to check it helped.
    if a.dpo:
        pairs = load_jsonl(a.dpo)
        random.shuffle(pairs)
        k = max(1, int(len(pairs) * a.holdout))
        held, train = pairs[:k], pairs[k:]
        print(f'DPO pairs: {len(train)} train, {len(held)} held out')
        ds = Dataset.from_list([{'prompt': p['prompt'], 'chosen': [{'role': 'assistant', 'content': p['chosen']}], 'rejected': [{'role': 'assistant', 'content': p['rejected']}]} for p in train])
        dpo = DPOTrainer(model=model, ref_model=None, processing_class=tok, train_dataset=ds,
                         args=DPOConfig(output_dir=a.out + '-dpo', num_train_epochs=1, per_device_train_batch_size=1,
                                        gradient_accumulation_steps=8, learning_rate=5e-6, beta=0.1, logging_steps=10, save_strategy='no', bf16=True))
        dpo.train()
        model = dpo.model

        # Did it learn to prefer what settled the body? Compare log-likelihoods on the held-out pairs.
        model.eval()
        def ll(prompt, answer):
            text = tok.apply_chat_template(prompt + [{'role': 'assistant', 'content': answer}], tokenize=False)
            ids = tok(text, return_tensors='pt').to(model.device)
            with torch.no_grad():
                out = model(**ids, labels=ids['input_ids'])
            return -out.loss.item()
        wins = sum(1 for p in held if ll(p['prompt'], p['chosen']) > ll(p['prompt'], p['rejected']))
        print(f'held-out preference agreement: {wins}/{len(held)} = {wins/len(held):.2f}')
        if wins / len(held) < 0.55:
            print('WARNING: the adapter barely prefers the better choice. Do not load it; live longer first.')

    model.save_pretrained(a.out)
    tok.save_pretrained(a.out)
    print('saved adapter to', a.out)

if __name__ == '__main__':
    main()
