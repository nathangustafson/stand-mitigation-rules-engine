# --- Stage 1: build the frontend bundle ---
FROM node:24-slim AS frontend-build
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
# npm install (not npm ci) so the build works whether the lock was generated on
# macOS or Linux — npm strips platform-specific optional deps from the lock on
# the host that doesn't need them, which makes `npm ci` brittle across OSes.
RUN npm install --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# --- Stage 2: backend image with the bundle baked in ---
FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
# data/ is created at runtime by init_db() — no need to copy a pre-existing
# directory (which doesn't exist on a fresh git checkout anyway, since the
# SQLite file is gitignored).
COPY --from=frontend-build /build/dist ./frontend_dist

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
