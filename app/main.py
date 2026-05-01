from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

from app.api.routes import router
from app.db import init_db
from app.seed import seed_all

FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend_dist"


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    seed_all()
    yield


app = FastAPI(title="Mitigation Rules Engine", lifespan=lifespan)
app.include_router(router)


# SPA fallback: serve real files from frontend_dist when present, otherwise
# return index.html so client-side routes (e.g. /properties) work on reload.
# Registered after the API router so /api/* always wins.
if FRONTEND_DIST.exists():

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str) -> FileResponse:
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404)
        candidate = FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(FRONTEND_DIST / "index.html")
