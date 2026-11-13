from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship
from database import Base


def utc_now():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    email = Column(String(180), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="farmer")
    region = Column(String(160), nullable=False, default="General Agricultural Zone")
    preferred_language = Column(String(5), nullable=False, default="en")
    created_at = Column(DateTime(timezone=True), default=utc_now)


class Plant(Base):
    __tablename__ = "plants"

    id = Column(Integer, primary_key=True, index=True)
    plant_code = Column(String(64), unique=True, nullable=False)
    crop = Column(String(80), nullable=False)
    field_label = Column(String(160), nullable=False)
    region_label = Column(String(160), default="")
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    is_demo = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=utc_now)


class WeatherRecord(Base):
    __tablename__ = "weather_records"

    id = Column(Integer, primary_key=True, index=True)
    location_name = Column(String(160), nullable=False)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    crop = Column(String(80), nullable=False)
    temperature_c = Column(Float, nullable=False)
    humidity_pct = Column(Float, nullable=False)
    rainfall_mm = Column(Float, nullable=False)
    risk_level = Column(String(20), nullable=False)
    risk_factors_json = Column(Text, nullable=False, default="[]")
    is_demo = Column(Integer, default=0)
    recorded_at = Column(DateTime(timezone=True), default=utc_now)


class Prediction(Base):
    __tablename__ = "predictions"

    id = Column(Integer, primary_key=True, index=True)
    plant_id = Column(Integer, ForeignKey("plants.id", ondelete="SET NULL"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    weather_record_id = Column(Integer, ForeignKey("weather_records.id", ondelete="SET NULL"), nullable=True)
    crop = Column(String(80), nullable=False)
    predicted_disease = Column(String(140), nullable=False)
    condition_category = Column(String(40), nullable=False, default="fungal")
    confidence = Column(Float, nullable=False)
    uncertain = Column(Integer, default=0)
    uncertainty_reason = Column(Text, default="")
    alternative_predictions_json = Column(Text, default="[]")
    affected_area_pct = Column(Float, nullable=False)
    severity = Column(String(20), nullable=False)
    leaf_coverage_pct = Column(Float, nullable=False)
    chlorosis_pct = Column(Float, default=0.0)
    necrosis_pct = Column(Float, default=0.0)
    original_image_path = Column(String(255), nullable=False)
    processed_image_path = Column(String(255), nullable=False)
    model_engine = Column(String(80), nullable=False)
    verification_status = Column(String(20), default="pending")
    verified_crop = Column(String(80), nullable=True)
    verified_disease = Column(String(140), nullable=True)
    region_label = Column(String(160), default="")
    approx_lat = Column(Float, nullable=True)
    approx_lng = Column(Float, nullable=True)
    notes = Column(Text, default="")
    symptoms_json = Column(Text, default="[]")
    symptom_onset_value = Column(Integer, nullable=True)
    symptom_onset_unit = Column(String(20), default="")
    image_consistency = Column(String(40), default="single")
    consistency_message = Column(Text, default="")
    user_feedback_status = Column(String(30), default="unreviewed")
    user_feedback_notes = Column(Text, default="")
    same_plant_confirmed = Column(Integer, nullable=True)
    recommendations_json = Column(Text, default="[]")
    is_demo = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    images = relationship("ScreeningImage", back_populates="prediction", cascade="all, delete-orphan")
    soil = relationship("SoilRecord", back_populates="prediction", uselist=False, cascade="all, delete-orphan")
    passport = relationship("FieldPassport", back_populates="prediction", uselist=False, cascade="all, delete-orphan")


class ScreeningImage(Base):
    __tablename__ = "screening_images"

    id = Column(Integer, primary_key=True, index=True)
    prediction_id = Column(Integer, ForeignKey("predictions.id", ondelete="CASCADE"), nullable=False)
    image_role = Column(String(40), nullable=False, default="closeup_leaf")
    original_path = Column(String(255), nullable=False)
    processed_path = Column(String(255), nullable=False)
    suitable = Column(Integer, default=1)
    rejection_reason = Column(Text, default="")
    detected_crop = Column(String(80), nullable=False)
    detected_disease = Column(String(140), nullable=False)
    confidence = Column(Float, nullable=False)
    affected_area_pct = Column(Float, default=0.0)
    severity = Column(String(20), default="Low")
    created_at = Column(DateTime(timezone=True), default=utc_now)

    prediction = relationship("Prediction", back_populates="images")


class SoilRecord(Base):
    __tablename__ = "soil_records"

    id = Column(Integer, primary_key=True, index=True)
    prediction_id = Column(Integer, ForeignKey("predictions.id", ondelete="CASCADE"), nullable=False)
    soil_photo_path = Column(String(255), default="")
    observed_color = Column(Text, default="")
    observed_moisture = Column(Text, default="")
    observed_texture = Column(Text, default="")
    observed_surface_signs = Column(Text, default="")
    soil_disclaimer = Column(Text, default="")
    manual_moisture = Column(String(40), default="")
    manual_ph = Column(String(40), default="")
    manual_soil_type = Column(String(60), default="")
    manual_fertility = Column(String(40), default="")
    recommendations_json = Column(Text, default="[]")
    created_at = Column(DateTime(timezone=True), default=utc_now)

    prediction = relationship("Prediction", back_populates="soil")


class FieldPassport(Base):
    __tablename__ = "field_passports"

    id = Column(Integer, primary_key=True, index=True)
    passport_code = Column(String(40), unique=True, nullable=False)
    prediction_id = Column(Integer, ForeignKey("predictions.id", ondelete="CASCADE"), unique=True, nullable=False)
    weather_record_id = Column(Integer, ForeignKey("weather_records.id", ondelete="SET NULL"), nullable=True)
    share_token = Column(String(80), nullable=False)
    is_public_share = Column(Integer, default=0)
    qr_payload = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now)

    prediction = relationship("Prediction", back_populates="passport")


class GeographicalReport(Base):
    __tablename__ = "geographical_reports"

    id = Column(Integer, primary_key=True, index=True)
    prediction_id = Column(Integer, ForeignKey("predictions.id", ondelete="CASCADE"), nullable=False)
    crop = Column(String(80), nullable=False)
    disease = Column(String(140), nullable=False)
    severity = Column(String(20), nullable=False)
    region_label = Column(String(160), nullable=False)
    approx_lat = Column(Float, nullable=False)
    approx_lng = Column(Float, nullable=False)
    verified = Column(Integer, default=0)
    is_demo = Column(Integer, default=0)
    reported_at = Column(DateTime(timezone=True), default=utc_now)


class DiseaseLibrary(Base):
    __tablename__ = "disease_library"

    id = Column(Integer, primary_key=True, index=True)
    crop = Column(String(80), nullable=False)
    disease_name = Column(String(140), nullable=False)
    condition_category = Column(String(40), nullable=False, default="fungal")
    pathogen = Column(String(160), nullable=False)
    simple_summary = Column(Text, default="")
    symptoms = Column(Text, nullable=False)
    causes = Column(Text, nullable=False)
    favorable_conditions = Column(Text, nullable=False)
    prevention = Column(Text, nullable=False)
    management = Column(Text, nullable=False)
    reference_source = Column(String(180), nullable=False)
    reference_url = Column(String(255), nullable=False)


class ExpertCorrection(Base):
    __tablename__ = "expert_corrections"

    id = Column(Integer, primary_key=True, index=True)
    prediction_id = Column(Integer, ForeignKey("predictions.id", ondelete="CASCADE"), nullable=False)
    reviewer_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    reviewer_name = Column(String(120), nullable=False)
    action = Column(String(20), nullable=False)
    original_crop = Column(String(80), nullable=False)
    original_disease = Column(String(140), nullable=False)
    corrected_crop = Column(String(80), nullable=True)
    corrected_disease = Column(String(140), nullable=True)
    comments = Column(Text, default="")
    queued_for_retraining = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), default=utc_now)
