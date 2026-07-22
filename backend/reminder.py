from sqlalchemy.orm import Session
from backend.models import MedicationReminder, ReminderTime, ReminderOccurrence
from datetime import datetime
from pydantic import BaseModel
from typing import List, Optional

# Pydantic schemas for validation
class ReminderCreate(BaseModel):
    medicine_name: str
    dosage: str
    frequency: str
    times: List[str]  # e.g., ["08:00", "14:00"]
    start_date: str  # YYYY-MM-DD
    end_date: Optional[str] = None  # YYYY-MM-DD
    instructions: Optional[str] = None
    notes: Optional[str] = None

class ReminderUpdate(BaseModel):
    medicine_name: Optional[str] = None
    dosage: Optional[str] = None
    frequency: Optional[str] = None
    times: Optional[List[str]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    instructions: Optional[str] = None
    notes: Optional[str] = None
    is_enabled: Optional[bool] = None

class OccurrenceLogCreate(BaseModel):
    reminder_id: int
    date: str  # YYYY-MM-DD
    time: str  # HH:MM
    status: str  # taken, skipped

# Helper to format response into unified flat schema expected by Frontend
def format_reminder_response(r: MedicationReminder):
    return {
        "id": r.id,
        "user_id": r.user_id,
        "medicine_name": r.medication_name,
        "dosage": r.dosage,
        "frequency": r.frequency,
        "times": ",".join([t.time for t in r.times]),
        "start_date": r.start_date,
        "end_date": r.end_date,
        "instructions": r.instructions,
        "notes": r.notes,
        "is_enabled": r.is_enabled,
        "created_at": r.created_at.isoformat() if r.created_at else None
    }

# CRUD helpers
def get_reminders(db: Session, user_id: int):
    reminders = db.query(MedicationReminder).filter(MedicationReminder.user_id == user_id).all()
    return [format_reminder_response(r) for r in reminders]

def get_reminder(db: Session, reminder_id: int, user_id: int):
    return db.query(MedicationReminder).filter(
        MedicationReminder.id == reminder_id, 
        MedicationReminder.user_id == user_id
    ).first()

def create_reminder(db: Session, reminder: ReminderCreate, user_id: int):
    db_reminder = MedicationReminder(
        user_id=user_id,
        medication_name=reminder.medicine_name,
        dosage=reminder.dosage,
        frequency=reminder.frequency,
        start_date=reminder.start_date,
        end_date=reminder.end_date,
        instructions=reminder.instructions,
        notes=reminder.notes,
        is_enabled=True
    )
    db.add(db_reminder)
    db.commit()
    db.refresh(db_reminder)
    
    # Save reminder times
    for t_str in reminder.times:
        db_time = ReminderTime(
            reminder_id=db_reminder.id,
            time=t_str.strip()
        )
        db.add(db_time)
        
    db.commit()
    db.refresh(db_reminder)
    return format_reminder_response(db_reminder)

def update_reminder(db: Session, reminder_id: int, reminder_data: ReminderUpdate, user_id: int):
    db_reminder = db.query(MedicationReminder).filter(
        MedicationReminder.id == reminder_id,
        MedicationReminder.user_id == user_id
    ).first()
    
    if not db_reminder:
        return None
    
    update_dict = reminder_data.dict(exclude_unset=True)
    
    # Handle times replacement separately
    if "times" in update_dict and update_dict["times"] is not None:
        # Delete old times
        db.query(ReminderTime).filter(ReminderTime.reminder_id == reminder_id).delete()
        # Add new times
        for t_str in update_dict["times"]:
            db_time = ReminderTime(
                reminder_id=reminder_id,
                time=t_str.strip()
            )
            db.add(db_time)
        del update_dict["times"]
        
    # Map key names if they differ
    if "medicine_name" in update_dict:
        db_reminder.medication_name = update_dict.pop("medicine_name")
    if "is_enabled" in update_dict:
        db_reminder.is_enabled = update_dict.pop("is_enabled")
        
    for key, value in update_dict.items():
        setattr(db_reminder, key, value)
        
    db.commit()
    db.refresh(db_reminder)
    return format_reminder_response(db_reminder)

def delete_reminder(db: Session, reminder_id: int, user_id: int):
    db_reminder = db.query(MedicationReminder).filter(
        MedicationReminder.id == reminder_id,
        MedicationReminder.user_id == user_id
    ).first()
    
    if not db_reminder:
        return False
        
    db.delete(db_reminder)
    db.commit()
    return True

def toggle_reminder(db: Session, reminder_id: int, user_id: int):
    db_reminder = db.query(MedicationReminder).filter(
        MedicationReminder.id == reminder_id,
        MedicationReminder.user_id == user_id
    ).first()
    
    if not db_reminder:
        return None
        
    db_reminder.is_enabled = not db_reminder.is_enabled
    db.commit()
    db.refresh(db_reminder)
    return format_reminder_response(db_reminder)

def log_occurrence(db: Session, log_data: OccurrenceLogCreate, user_id: int):
    # Verify reminder ownership
    reminder = db.query(MedicationReminder).filter(
        MedicationReminder.id == log_data.reminder_id,
        MedicationReminder.user_id == user_id
    ).first()
    
    if not reminder:
        return None
        
    # Check if entry already exists
    db_log = db.query(ReminderOccurrence).filter(
        ReminderOccurrence.reminder_id == log_data.reminder_id,
        ReminderOccurrence.scheduled_date == log_data.date,
        ReminderOccurrence.scheduled_time == log_data.time
    ).first()
    
    if db_log:
        db_log.status = log_data.status
        db_log.action_timestamp = datetime.utcnow()
    else:
        db_log = ReminderOccurrence(
            reminder_id=log_data.reminder_id,
            scheduled_date=log_data.date,
            scheduled_time=log_data.time,
            status=log_data.status
        )
        db.add(db_log)
        
    db.commit()
    db.refresh(db_log)
    return db_log

def get_today_schedule(db: Session, date_str: str, current_time_str: str, user_id: int):
    reminders = db.query(MedicationReminder).filter(
        MedicationReminder.user_id == user_id,
        MedicationReminder.start_date <= date_str
    ).all()
    
    schedule = []
    for r in reminders:
        # Check if reminder duration covers today's date
        if r.end_date is None or r.end_date >= date_str:
            for t_rec in r.times:
                t = t_rec.time
                
                # Check occurrence status
                occ = db.query(ReminderOccurrence).filter(
                    ReminderOccurrence.reminder_id == r.id,
                    ReminderOccurrence.scheduled_date == date_str,
                    ReminderOccurrence.scheduled_time == t
                ).first()
                
                if occ:
                    status = occ.status
                elif not r.is_enabled:
                    status = "disabled"
                else:
                    # Determine if time is in past (missed) or future (upcoming)
                    if t < current_time_str:
                        status = "missed"
                    else:
                        status = "upcoming"
                        
                schedule.append({
                    "reminder_id": r.id,
                    "medicine_name": r.medication_name,
                    "dosage": r.dosage,
                    "time": t,
                    "instructions": r.instructions,
                    "status": status,
                    "frequency": r.frequency,
                    "notes": r.notes,
                    "is_enabled": r.is_enabled
                })
                
    schedule.sort(key=lambda x: x["time"])
    return schedule
