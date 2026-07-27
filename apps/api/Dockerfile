FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app
COPY pyproject.toml ./
COPY app ./app
RUN pip install --upgrade pip && pip install .
COPY . .

RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
CMD ["sh", "-c", "if [ \"${RUN_WORKER:-false}\" = \"true\" ]; then exec python -m app.worker; else exec uvicorn app.main:app --host 0.0.0.0 --port \"${PORT:-8000}\"; fi"]

FROM runtime AS development
USER root
RUN pip install '.[dev]'
USER appuser

FROM runtime AS production
