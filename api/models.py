from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from api.database import Base

class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(Integer, primary_key=True, index=True)
    medicine_name = Column(String, nullable=False)
    dosage = Column(String, nullable=False)
    frequency = Column(String, nullable=False)  # once_daily, twice_daily, three_times_daily, custom
    times = Column(String, nullable=False)  # Comma-separated list of times, e.g., "08:00,14:00,20:00"
    start_date = Column(String, nullable=False)  # YYYY-MM-DD
    end_date = Column(String, nullable=True)  # YYYY-MM-DD, optional
    instructions = Column(String, nullable=True)  # e.g., "Take after food"
    notes = Column(String, nullable=True)
    is_enabled = Column(Boolean, default=True)

    occurrences = relationship("OccurrenceLog", back_populates="reminder", cascade="all, delete-orphan")

class OccurrenceLog(Base):
    __tablename__ = "occurrence_logs"

    id = Column(Integer, primary_key=True, index=True)
    reminder_id = Column(Integer, ForeignKey("reminders.id", ondelete="CASCADE"), nullable=False)
    date = Column(String, nullable=False)  # YYYY-MM-DD
    time = Column(String, nullable=False)  # HH:MM
    status = Column(String, nullable=False)  # taken, skipped
    updated_at = Column(DateTime, default=datetime.utcnow)

    reminder = relationship("Reminder", back_populates="occurrences")
