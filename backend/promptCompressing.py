from llmlingua import PromptCompressor

compressor = PromptCompressor(
    model_name="microsoft/llmlingua-2-bert-base-multilingual-cased-meetingbank",
    use_llmlingua2=True,
    device_map="cpu"
)

def optimize_prompt(prompt: str) -> dict:
    """
    Takes user prompt and optimizes it with LLMLingua
    """

    keep = ["\n", ".", "?", "!"]

    results = compressor.compress_prompt([prompt], rate=0.4, force_tokens=keep, drop_consecutive=True)

    # return results["compressed_prompt"]
    return results
