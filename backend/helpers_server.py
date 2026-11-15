"""
HTTP sidecar exposing the team's Python helpers to the Node gateway.

    POST /route     {prompt}          -> {tier: "fast" | "advanced"}           (modelRouting.py, Ollama)
    POST /compress  {prompt}          -> {compressed, origin_tokens, ...}      (promptCompressing.py, LLMLingua-2)
    POST /plan      {prompt}          -> {queries: [{query, category}, ...]}   (serpAPI_websearching.py, Ollama)
    GET  /health                      -> which helpers can run here

Each helper module is imported lazily, so the server starts even when a heavy
dependency (torch for LLMLingua, a running Ollama) is missing; /health reports it
and the gateway falls back to its built-in logic for that step.

Run:  uvicorn helpers_server:app --app-dir backend --port 8788
"""

import importlib
import json
import os
import re

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Conduit Python helpers")

_modules: dict = {}
_errors: dict = {}


def _load(name: str):
    """Import one of the team's helper modules on first use and remember failures."""
    if name in _modules:
        return _modules[name]
    try:
        _modules[name] = importlib.import_module(name)
        _errors.pop(name, None)
        return _modules[name]
    except Exception as e:  # ImportError, missing model download, …
        _errors[name] = f"{type(e).__name__}: {e}"
        raise HTTPException(status_code=503, detail=f"{name} unavailable: {_errors[name]}")


class PromptIn(BaseModel):
    prompt: str


def _ollama_up() -> bool:
    try:
        import ollama

        ollama.list()
        return True
    except Exception as e:
        _errors["ollama"] = f"{type(e).__name__}: {e}"
        return False


@app.get("/health")
def health():
    available = {}
    for name in ("modelRouting", "promptCompressing", "serpAPI_websearching"):
        try:
            _load(name)
            available[name] = True
        except HTTPException:
            available[name] = False
    ollama = _ollama_up()
    return {
        "router": available["modelRouting"] and ollama,
        "compressor": available["promptCompressing"],
        "planner": available["serpAPI_websearching"] and ollama,
        "errors": _errors,
    }


def _call(fn, *args):
    try:
        return fn(*args)
    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"model returned invalid JSON: {e}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"{type(e).__name__}: {e}")


@app.post("/route")
def route(body: PromptIn):
    m = _load("modelRouting")
    _, tier = _call(m.return_prompt_level, body.prompt[:4000])
    return {"tier": "advanced" if tier == "advanced" else "fast"}


@app.post("/compress")
def compress(body: PromptIn):
    m = _load("promptCompressing")
    r = _call(m.optimize_prompt, body.prompt)
    return {
        "compressed": r.get("compressed_prompt", body.prompt),
        "origin_tokens": r.get("origin_tokens"),
        "compressed_tokens": r.get("compressed_tokens"),
    }


@app.post("/plan")
def plan(body: PromptIn):
    m = _load("serpAPI_websearching")
    r = _call(m.breakdown_prompt, body.prompt[:4000])
    queries = [
        {"query": q.get("query", ""), "category": q.get("category", "")}
        for q in r.get("search_queries", [])
        if isinstance(q, dict) and q.get("query")
    ]
    return {"queries": queries}


# Qwen 3 may wrap answers in <think> … </think>; strip it before the helpers' json.loads.
try:
    import ollama as _ollama

    _orig_chat = _ollama.chat

    def _chat_without_thinking(*args, **kwargs):
        res = _orig_chat(*args, **kwargs)
        try:
            content = res["message"]["content"]
            cleaned = re.sub(r"<think>.*?</think>", "", content, flags=re.S).strip()
            match = re.search(r"\{.*\}", cleaned, flags=re.S)
            res["message"]["content"] = match.group(0) if match else cleaned
        except Exception:
            pass
        return res

    _ollama.chat = _chat_without_thinking
    os.environ.setdefault("OLLAMA_HOST", "http://127.0.0.1:11434")
except ImportError:
    pass
