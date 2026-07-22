from sqlalchemy.orm import Session
from api.models import Reminder, OccurrenceLog
from datetime import datetime
from pydantic import BaseModel
from typing import List, Optional

# Keep the backward compatibility function
def generate_custom_reminder(medicine, dose, frequency, times_list):
    return {
        "medicine": medicine,
        "dose": dose,
        "frequency": frequency,
        "reminder_times": times_list,
        "message": "Custom reminder schedule created."
    }

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

# CRUD helpers
def get_reminders(db: Session):
    return db.query(Reminder).all()

def get_reminder(db: Session, reminder_id: int):
    return db.query(Reminder).filter(Reminder.id == reminder_id).first()

def create_reminder(db: Session, reminder: ReminderCreate):
    # Join times list into comma-separated string
    times_str = ",".join([t.strip() for t in reminder.times])
    db_reminder = Reminder(
        medicine_name=reminder.medicine_name,
        dosage=reminder.dosage,
        frequency=reminder.frequency,
        times=times_str,
        start_date=reminder.start_date,
        end_date=reminder.end_date,
        instructions=reminder.instructions,
        notes=reminder.notes,
        is_enabled=True
    )
    db.add(db_reminder)
    db.commit()
    db.refresh(db_reminder)
    return db_reminder

def update_reminder(db: Session, reminder_id: int, reminder_data: ReminderUpdate):
    db_reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
    if not db_reminder:
        return None
    
    update_dict = reminder_data.dict(exclude_unset=True)
    if "times" in update_dict and update_dict["times"] is not None:
        update_dict["times"] = ",".join([t.strip() for t in update_dict["times"]])
        
    for key, value in update_dict.items():
        setattr(db_reminder, key, value)
        
    db.commit()
    db.refresh(db_reminder)
    return db_reminder

def delete_reminder(db: Session, reminder_id: int):
    db_reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
    if not db_reminder:
        return False
    db.delete(db_reminder)
    db.commit()
    return True

def toggle_reminder(db: Session, reminder_id: int):
    db_reminder = db.query(Reminder).filter(Reminder.id == reminder_id).first()
    if not db_reminder:
        return None
    db_reminder.is_enabled = not db_reminder.is_enabled
    db.commit()
    db.refresh(db_reminder)
    return db_reminder

def log_occurrence(db: Session, log_data: OccurrenceLogCreate):
    # Check if entry already exists for this reminder, date, and time
    db_log = db.query(OccurrenceLog).filter(
        OccurrenceLog.reminder_id == log_data.reminder_id,
        OccurrenceLog.date == log_data.date,
        OccurrenceLog.time == log_data.time
    ).first()
    
    if db_log:
        db_log.status = log_data.status
        db_log.updated_at = datetime.utcnow()
    else:
        db_log = OccurrenceLog(
            reminder_id=log_data.reminder_id,
            date=log_data.date,
            time=log_data.time,
            status=log_data.status
        )
        db.add(db_log)
        
    db.commit()
    db.refresh(db_log)
    return db_log

def get_today_schedule(db: Session, date_str: str, current_time_str: str):
    reminders = db.query(Reminder).all()
    schedule = []
    
    for r in reminders:
        # Check if today's date falls within start_date and end_date
        if r.start_date <= date_str:
            if r.end_date is None or r.end_date >= date_str:
                # Active today! Parse times
                times_list = [t.strip() for t in r.times.split(",") if t.strip()]
                for t in times_list:
                    # Query log status
                    log_entry = db.query(OccurrenceLog).filter(
                        OccurrenceLog.reminder_id == r.id,
                        OccurrenceLog.date == date_str,
                        OccurrenceLog.time == t
                    ).first()
                    
                    if log_entry:
                        status = log_entry.status
                    elif not r.is_enabled:
                        status = "disabled"
                    else:
                        # Compare time HH:MM
                        if t < current_time_str:
                            status = "missed"
                        else:
                            status = "upcoming"
                            
                    schedule.append({
                        "reminder_id": r.id,
                        "medicine_name": r.medicine_name,
                        "dosage": r.dosage,
                        "time": t,
                        "instructions": r.instructions,
                        "status": status,
                        "frequency": r.frequency,
                        "notes": r.notes,
                        "is_enabled": r.is_enabled
                    })
                    
    # Sort schedule by time
    schedule.sort(key=lambda x: x["time"])
    return schedule
