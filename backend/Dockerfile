FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.5 /uv /usr/local/bin/uv

WORKDIR /srv

# Dependencies first, so edits to app/ don't invalidate the install layer.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --extra dev

COPY . .
RUN uv sync --frozen --extra dev

ENV PATH="/srv/.venv/bin:$PATH"
EXPOSE 8000

# Shell form so $PORT expands: hosted platforms assign the port at run time.
# docker-compose overrides this with a --reload variant for local development.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
