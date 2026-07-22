from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime

from backend.database import get_db
from backend.auth import hash_password, verify_password, create_access_token, get_current_user
from backend.rag_chain import generate_grounded_answer
from backend.vector_store import get_indexed_drugs
import backend.models as models
import backend.reminder as reminder_helpers

router = APIRouter()

# --- Health check endpoint ---
@router.get("/health")
def health_check():
    return {"status": "ok", "service": "MediRAG Medication Assistant"}

# --- User Auth Request / Response Schemas ---
class UserSignup(BaseModel):
    email: EmailStr
    password: str
    full_name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: Dict[str, Any]

class UserProfileResponse(BaseModel):
    id: int
    email: str
    full_name: str
    created_at: datetime

class ProfileUpdate(BaseModel):
    full_name: Optional[str] = None
    current_password: Optional[str] = None
    new_password: Optional[str] = None

# --- User Registration Route ---
@router.post("/auth/signup", status_code=status.HTTP_201_CREATED)
def signup(user_data: UserSignup, db: Session = Depends(get_db)):
    # Check if email already exists
    existing_user = db.query(models.User).filter(models.User.email == user_data.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists."
        )
    
    # Hash password and create record
    hashed = hash_password(user_data.password)
    db_user = models.User(
        email=user_data.email,
        full_name=user_data.full_name,
        hashed_password=hashed
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    # Generate login token immediately
    token = create_access_token(subject=db_user.email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": db_user.id,
            "email": db_user.email,
            "full_name": db_user.full_name
        }
    }

# --- User Login Route (supporting both OAuth2 forms and JSON bodies) ---
@router.post("/auth/login", response_model=TokenResponse)
def login(
    login_data: Optional[UserLogin] = None,
    form_data: Optional[OAuth2PasswordRequestForm] = Depends(),
    db: Session = Depends(get_db)
):
    # Resolve email and password from whichever payload was provided
    email = None
    password = None
    
    if login_data:
        email = login_data.email
        password = login_data.password
    elif form_data and form_data.username:
        email = form_data.username
        password = form_data.password
        
    if not email or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please provide email and password details."
        )
        
    db_user = db.query(models.User).filter(models.User.email == email).first()
    if not db_user or not verify_password(password, db_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password combination."
        )
        
    token = create_access_token(subject=db_user.email)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": db_user.id,
            "email": db_user.email,
            "full_name": db_user.full_name
        }
    }

# --- Current Logged In Profile ---
@router.get("/auth/me", response_model=UserProfileResponse)
def get_me(current_user: models.User = Depends(get_current_user)):
    return current_user

# --- Update Profile Endpoint ---
@router.put("/auth/profile", response_model=UserProfileResponse)
def update_profile(
    profile_data: ProfileUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Update Name
    if profile_data.full_name:
        current_user.full_name = profile_data.full_name

    # Handle Password Change
    if profile_data.new_password:
        if not profile_data.current_password:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Current password is required to change password."
            )
        if not verify_password(profile_data.current_password, current_user.hashed_password):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Incorrect current password."
            )
        current_user.hashed_password = hash_password(profile_data.new_password)
        
    db.commit()
    db.refresh(current_user)
    return current_user


# --- RAG Chat Models & Endpoint (Token Protected) ---
class ChatRequest(BaseModel):
    question: str
    drug: Optional[str] = None

class SourceResponse(BaseModel):
    drug_name: str
    section_name: str
    source_text: str
    source: str
    doc_id: str
    source_type: Optional[str] = None
    source_url: Optional[str] = None
    original_filename: Optional[str] = None

class ChatResponse(BaseModel):
    answer: str
    sources: List[SourceResponse]

@router.post("/chat", response_model=ChatResponse)
def chat_endpoint(
    req: ChatRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    if not req.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty.")
    
    try:
        # Run RAG
        result = generate_grounded_answer(req.question, drug_name=req.drug)
        
        # Log to chat history for user
        chat_log = models.ChatHistory(
            user_id=current_user.id,
            question=req.question,
            answer=result["answer"]
        )
        db.add(chat_log)
        db.commit()
        
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"An error occurred while generating the response: {str(e)}"
        )

# --- Chat History Endpoints ---
@router.get("/chat/history")
def get_chat_history(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    history = db.query(models.ChatHistory)\
        .filter(models.ChatHistory.user_id == current_user.id)\
        .order_by(models.ChatHistory.created_at.asc())\
        .all()
        
    return [
        {
            "id": item.id,
            "question": item.question,
            "answer": item.answer,
            "created_at": item.created_at.isoformat()
        } for item in history
    ]

@router.delete("/chat/history")
def clear_chat_history(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    db.query(models.ChatHistory).filter(models.ChatHistory.user_id == current_user.id).delete()
    db.commit()
    return {"message": "Chat history cleared successfully."}


# --- Drug Search/List Endpoint ---
@router.get("/drugs/search")
def search_drugs(q: Optional[str] = None):
    try:
        all_drugs = get_indexed_drugs()
        if q:
            q_lower = q.lower().strip()
            filtered_drugs = [d for d in all_drugs if q_lower in d.lower()]
            return {"drugs": filtered_drugs}
        return {"drugs": all_drugs}
    except Exception as e:
        raise HTTPException(
            status_code=500, 
            detail=f"Error searching medication list: {str(e)}"
        )


# --- User Protected Medication Reminder Endpoints ---

@router.get("/reminders")
def api_get_reminders(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return reminder_helpers.get_reminders(db, user_id=current_user.id)

@router.post("/reminders")
def api_create_reminder(
    reminder: reminder_helpers.ReminderCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        return reminder_helpers.create_reminder(db, reminder, user_id=current_user.id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to create reminder: {str(e)}")

@router.put("/reminders/{id}")
def api_update_reminder(
    id: int,
    reminder: reminder_helpers.ReminderUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    updated = reminder_helpers.update_reminder(db, id, reminder, user_id=current_user.id)
    if not updated:
        raise HTTPException(status_code=404, detail="Reminder not found or access denied")
    return updated

@router.delete("/reminders/{id}")
def api_delete_reminder(
    id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    success = reminder_helpers.delete_reminder(db, id, user_id=current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Reminder not found or access denied")
    return {"message": "Reminder deleted successfully"}

@router.put("/reminders/{id}/toggle")
def api_toggle_reminder(
    id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    toggled = reminder_helpers.toggle_reminder(db, id, user_id=current_user.id)
    if not toggled:
        raise HTTPException(status_code=404, detail="Reminder not found or access denied")
    return toggled

@router.get("/schedule/today")
def api_get_today_schedule(
    date: str,
    time: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    return reminder_helpers.get_today_schedule(db, date, time, user_id=current_user.id)

@router.post("/schedule/log")
def api_log_occurrence(
    log: reminder_helpers.OccurrenceLogCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    logged = reminder_helpers.log_occurrence(db, log, user_id=current_user.id)
    if not logged:
        raise HTTPException(status_code=404, detail="Reminder not found or access denied")
    return logged
