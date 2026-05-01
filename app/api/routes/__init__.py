from fastapi import APIRouter

from app.api.routes.demo import router as demo_router
from app.api.routes.health import router as health_router
from app.api.routes.observation_fields import router as observation_fields_router
from app.api.routes.observations import router as observations_router
from app.api.routes.properties import router as properties_router
from app.api.routes.rules import router as rules_router

router = APIRouter(prefix="/api")
router.include_router(health_router)
router.include_router(properties_router)
router.include_router(observations_router)
router.include_router(observation_fields_router)
router.include_router(rules_router)
router.include_router(demo_router)
