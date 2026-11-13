from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from auth import create_access_token, get_current_user, hash_password, verify_password
from database import get_db
from models import User
from schemas import LanguageUpdateRequest, LoginRequest, RegisterRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])


def serialize_user(user: User):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": user.role,
        "region": user.region,
        "preferred_language": user.preferred_language,
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_farmer(body: RegisterRequest, db: Session = Depends(get_db)):
    normalized_email = body.email.strip().lower()
    if db.query(User).filter(User.email == normalized_email).first():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An account with this email already exists.")

    # Strict role enforcement: self-registration always creates 'farmer'
    user = User(
        name=body.name.strip(),
        email=normalized_email,
        password_hash=hash_password(body.password),
        role="farmer",
        region=body.region.strip() or "General Agricultural Zone",
        preferred_language=body.preferredLanguage,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {"token": create_access_token(user), "user": serialize_user(user)}


@router.post("/login")
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.strip().lower()).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    return {"token": create_access_token(user), "user": serialize_user(user)}


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"user": serialize_user(user)}


@router.patch("/language")
def update_language(body: LanguageUpdateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    user.preferred_language = body.language
    db.commit()
    return {"ok": True, "preferred_language": user.preferred_language}
