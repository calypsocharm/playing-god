# Getting the adapter into Ollama

Ollama loads LoRA adapters in GGUF form. From the saved adapter folder:

1. Convert with llama.cpp's script (install llama.cpp yourself):

       python convert_lora_to_gguf.py --base <base model dir> --outfile name-adapter.gguf <adapter dir>

2. Write a Modelfile next to it:

       FROM qwen2.5:7b
       ADAPTER ./name-adapter.gguf
       PARAMETER temperature 0.8

3. Create and use:

       ollama create name -f Modelfile

4. On the Brain tab, set that villager's mind to `name`.

The base in the Modelfile must be the same model family and size the adapter was trained on.
