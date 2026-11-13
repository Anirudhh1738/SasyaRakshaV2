from typing import List, Literal, Optional
from pydantic import BaseModel, Field


LanguageCode = Literal["en", "hi", "kn"]
PlantImageRole = Literal[
    "closeup_leaf",
    "underside_leaf",
    "multiple_leaves",
    "entire_plant",
    "surrounding_field",
]


class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    email: str = Field(..., min_length=3, max_length=180)
    password: str = Field(..., min_length=6, max_length=128)
    region: str = "General Agricultural Zone"
    preferredLanguage: LanguageCode = "en"


class LoginRequest(BaseModel):
    email: str
    password: str


class LanguageUpdateRequest(BaseModel):
    language: LanguageCode


class PlantImageItem(BaseModel):
    imageBase64: str
    filename: str = "plant.jpg"
    role: PlantImageRole = "closeup_leaf"


class ManualSoilInput(BaseModel):
    moisture: str = ""
    ph: str = ""
    soilType: str = ""
    fertility: str = ""


class AnalyzeRequest(BaseModel):
    imageBase64: Optional[str] = None
    filename: Optional[str] = "leaf.jpg"
    images: Optional[List[PlantImageItem]] = None
    soilImageBase64: Optional[str] = None
    soilFilename: Optional[str] = "soil.jpg"
    manualSoil: Optional[ManualSoilInput] = None
    symptoms: List[str] = []
    durationValue: Optional[int] = None
    durationUnit: str = ""
    cropHint: str = "Auto-Detect"
    plantId: Optional[int] = None
    regionLabel: str = ""
    approxLat: Optional[float] = None
    approxLng: Optional[float] = None
    notes: str = ""
    reportOutbreak: bool = True


class FeedbackRequest(BaseModel):
    feedbackStatus: Literal["confirmed", "incorrect", "recheck_requested"]
    samePlantConfirmed: Optional[bool] = None
    notes: str = ""


class ExpertVerifyRequest(BaseModel):
    predictionId: int
    action: Literal["confirm", "reject", "correct"]
    correctedCrop: Optional[str] = None
    correctedDisease: Optional[str] = None
    comments: str = ""
