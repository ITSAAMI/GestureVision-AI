from pydantic import BaseModel, Field, field_validator


class FaceRegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    image_base64: str = Field(..., min_length=16, description="Image as base64 or a data: URL")

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("Name cannot be blank")
        return value


class FaceData(BaseModel):
    id: int
    name: str
    created_at: str
    thumbnail: str | None = None  # data:image/jpeg;base64,...


class FaceRegisterResponse(BaseModel):
    face: FaceData
    detection_confidence: float
    aligned: bool
    message: str


class FaceListResponse(BaseModel):
    faces: list[FaceData]
