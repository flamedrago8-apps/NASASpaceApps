import asyncio
import json
import time
import httpx

BASE_URL = "http://127.0.0.1:8000"

FAST_PROMPT = "What is the capital of France?"
COMPLEX_PROMPT = (
    "Explain the architectural differences between Mixture-of-Experts (MoE) "
    "and dense transformer models, specifically focusing on memory bandwidth "
    "bottlenecks during autoregressive inference on consumer GPUs."
)


def handle_response(endpoint: str, res: httpx.Response, elapsed: float) -> dict | None:
    """Safely parses JSON or prints raw text if the server returned an error."""
    print(f"\n{'=' * 65}")
    print(f"ENDPOINT: {endpoint} | STATUS: {res.status_code} | TIME: {elapsed:.2f}s")
    print(f"{'=' * 65}")

    try:
        data = res.json()
        print(json.dumps(data, indent=2))
        return data
    except json.JSONDecodeError:
        print(f"⚠️ NON-JSON RESPONSE (Raw Text):\n{res.text}")
        return None


async def run_tests():
    async with httpx.AsyncClient(base_url=BASE_URL, timeout=120.0) as client:

        # 1. GET /health
        start = time.perf_counter()
        res = await client.get("/health")
        data = handle_response("GET /health", res, time.perf_counter() - start)
        if data:
            assert data.get("status") == "ok", "Health check failed"

        # 2. Empty Prompt Validation (Expect 400)
        start = time.perf_counter()
        res = await client.post("/perplexity", json={"prompt": "   "})
        handle_response("POST /perplexity (Empty Validation)", res, time.perf_counter() - start)
        assert res.status_code == 400, f"Expected 400, got {res.status_code}"

        # 3. POST /perplexity
        start = time.perf_counter()
        res = await client.post("/perplexity", json={"prompt": COMPLEX_PROMPT})
        data = handle_response("POST /perplexity", res, time.perf_counter() - start)
        if data:
            assert isinstance(data.get("perplexity"), float), "Expected float perplexity score"

        # 4. POST /route (Fast vs Advanced)
        for label, prompt, expected_tier in [
            ("Fast Prompt", FAST_PROMPT, "fast"),
            ("Complex Prompt", COMPLEX_PROMPT, "advanced"),
        ]:
            start = time.perf_counter()
            res = await client.post("/route", json={"prompt": prompt})
            data = handle_response(f"POST /route ({label})", res, time.perf_counter() - start)
            if data:
                print(f"-> Routed Tier: {data.get('tier')} (Expected: {expected_tier})")

        # 5. POST /compress (LLMLingua-2)
        start = time.perf_counter()
        res = await client.post("/compress", json={"prompt": COMPLEX_PROMPT})
        data = handle_response("POST /compress", res, time.perf_counter() - start)
        if data and "compressed_prompt" in data:
            print(f"-> Compression Ratio: {data.get('ratio')} | Saved Tokens: {data.get('origin_tokens', 0) - data.get('compressed_tokens', 0)}")

        # 6. POST /breakdown
        start = time.perf_counter()
        res = await client.post("/breakdown", json={"prompt": COMPLEX_PROMPT})
        breakdown_data = handle_response("POST /breakdown", res, time.perf_counter() - start)

        # 7. POST /search
        search_payload = (
            breakdown_data
            if breakdown_data and "search_queries" in breakdown_data
            else {
                "research_question": "MoE vs Dense Transformers",
                "search_queries": [
                    {
                        "id": "Q01",
                        "category": "TECHNICAL_DETAILS",
                        "query": "Mixture of Experts vs dense transformer memory bandwidth",
                        "purpose": "Compare memory bottlenecks",
                    }
                ],
            }
        )
        start = time.perf_counter()
        res = await client.post("/search", json=search_payload)
        search_data = handle_response("POST /search", res, time.perf_counter() - start)
        if search_data and "links" in search_data:
            print(f"-> Retrieved {len(search_data['links'])} links.")

        # 8. POST /process (Full End-to-End Pipeline)
        start = time.perf_counter()
        res = await client.post("/process", json={"prompt": COMPLEX_PROMPT})
        process_data = handle_response("POST /process (Full Pipeline)", res, time.perf_counter() - start)
        if process_data:
            expected_keys = {"prompt_level", "tier", "perplexity", "optimized_prompt", "breakdown", "links"}
            missing = expected_keys - set(process_data.keys())
            print(f"-> Pipeline Keys Valid: {len(missing) == 0} (Missing: {missing or 'None'})")


if __name__ == "__main__":
    print(f"Testing Tokenomics Prompt API at {BASE_URL}...")
    try:
        asyncio.run(run_tests())
        print("\n✅ Test run finished!")
    except httpx.ConnectError:
        print(f"\n❌ Could not connect to {BASE_URL}. Make sure your FastAPI server is running.")