FROM node:22-bookworm-slim AS frontend
WORKDIR /build/frontend
RUN npm install --global pnpm@11.25.0
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

FROM python:3.12-slim-bookworm AS application
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    OPENBLAS_NUM_THREADS=1 \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    CAL01_DEPLOYMENT=cloud \
    CAL01_FRONTEND_ROOT=/app/frontend/dist \
    CAL01_STATIC_ROOT=/app/static
WORKDIR /app
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt \
    && useradd --create-home --uid 10001 cal01
COPY backend/ ./backend/
COPY models/ ./models/
COPY --from=frontend /build/frontend/dist ./frontend/dist/
# Collect public assets without connecting to a database or using a real secret.
RUN CAL01_DEPLOYMENT=local CAL01_TEST_SQLITE=1 python backend/manage.py collectstatic --noinput
USER cal01
WORKDIR /app/backend
EXPOSE 8080
CMD ["python", "-m", "config.serve"]
