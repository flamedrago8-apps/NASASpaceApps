# Python helpers sidecar: Ollama prompt router, LLMLingua-2 compression, search-query planner.
FROM python:3.12-slim
WORKDIR /app
# CPU-only torch keeps the image a few GB smaller than the default CUDA build LLMLingua would pull.
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY pyproject.toml ./
COPY backend/*.py backend/
RUN pip install --no-cache-dir .
EXPOSE 8788
CMD ["uvicorn", "helpers_server:app", "--app-dir", "backend", "--host", "0.0.0.0", "--port", "8788"]
