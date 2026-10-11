from fastapi import APIRouter

from app.schemas.settings import RuntimeSettingsUpdate, SettingsResponse
from app.services.runtime_settings import env_defaults, runtime_settings

router = APIRouter(prefix="/api/settings", tags=["Settings"])


@router.get("", response_model=SettingsResponse)
async def get_settings():
    return SettingsResponse(settings=runtime_settings.current, defaults=env_defaults())


@router.put("", response_model=SettingsResponse)
async def update_settings(update: RuntimeSettingsUpdate):
    await runtime_settings.update(update)
    return SettingsResponse(settings=runtime_settings.current, defaults=env_defaults())


@router.post("/reset", response_model=SettingsResponse)
async def reset_settings():
    await runtime_settings.reset()
    return SettingsResponse(settings=runtime_settings.current, defaults=env_defaults())
