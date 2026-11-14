from ollama import (
    chat,
    ChatResponse
)
import json

def return_prompt_level(prompt: str):
    
    response: ChatResponse = chat(
        model="qwen3.5:4b",
        messages=[
            {
                "role": "system",
                "content": "Classify the user prompt as either 'fast' (simple lookup, short QA, basic chat) or 'advanced' (complex coding, multi-step math, deep reasoning, nuanced analysis). Respond with ONLY JSON: {\"tier\": \"fast\"} or {\"tier\": \"advanced\"}"
            },
            {"role": "user", "content": prompt}
        ]
    )

    print(response)

return_prompt_level("What color is the sky?")