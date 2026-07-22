from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from datetime import datetime
from backend.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    reminders = relationship("MedicationReminder", back_populates="user", cascade="all, delete-orphan")
    chat_history = relationship("ChatHistory", back_populates="user", cascade="all, delete-orphan")

class MedicationReminder(Base):
    __tablename__ = "medication_reminders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    medication_name = Column(String, nullable=False)
    dosage = Column(String, nullable=False)
    frequency = Column(String, nullable=False)  # once_daily, twice_daily, three_times_daily, custom
    start_date = Column(String, nullable=False)  # YYYY-MM-DD
    end_date = Column(String, nullable=True)  # YYYY-MM-DD, optional
    instructions = Column(String, nullable=True)  # e.g., "Take after food"
    notes = Column(String, nullable=True)
    is_enabled = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="reminders")
    times = relationship("ReminderTime", back_populates="reminder", cascade="all, delete-orphan")
    occurrences = relationship("ReminderOccurrence", back_populates="reminder", cascade="all, delete-orphan")

class ReminderTime(Base):
    __tablename__ = "reminder_times"

    id = Column(Integer, primary_key=True, index=True)
    reminder_id = Column(Integer, ForeignKey("medication_reminders.id", ondelete="CASCADE"), nullable=False)
    time = Column(String, nullable=False)  # HH:MM format

    reminder = relationship("MedicationReminder", back_populates="times")

class ReminderOccurrence(Base):
    __tablename__ = "reminder_occurrences"

    id = Column(Integer, primary_key=True, index=True)
    reminder_id = Column(Integer, ForeignKey("medication_reminders.id", ondelete="CASCADE"), nullable=False)
    scheduled_date = Column(String, nullable=False)  # YYYY-MM-DD
    scheduled_time = Column(String, nullable=False)  # HH:MM
    status = Column(String, nullable=False)  # taken, skipped
    action_timestamp = Column(DateTime, default=datetime.utcnow)

    reminder = relationship("MedicationReminder", back_populates="occurrences")

class ChatHistory(Base):
    __tablename__ = "chat_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    question = Column(String, nullable=False)
    answer = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="chat_history")
