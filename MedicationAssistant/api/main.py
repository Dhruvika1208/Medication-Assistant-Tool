from fastapi import FastAPI, Form, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware
from openai import OpenAI
import os
from dotenv import load_dotenv
from sqlalchemy.orm import Session
from pydantic import BaseModel

from api.fetch_label import fetch_drug_label
from api.rag import create_temp_vector_store, retrieve_answer
from api.database import engine, Base, get_db
import api.models as models
import api.reminder as reminder_helpers

# Initialize SQLite database tables
Base.metadata.create_all(bind=engine)

load_dotenv()

app = FastAPI(
    title="Medication Assistant",
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins for dev simplicity
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# -------------------------------------------------------------------
# HTML / BACKWARD COMPATIBILITY ENDPOINTS (ORIGINAL CODE PRESERVED)
# -------------------------------------------------------------------
@app.get("/", response_class=HTMLResponse)
def home():
    return """
<!DOCTYPE html>
<html>
<head>
    <title>Medication Assistant Tool</title>

    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">

    <style>
        body { font-family: 'Inter', sans-serif; background: #eef2f7; padding: 40px; }
        .wrapper { max-width: 760px; margin: auto; background: white; padding: 35px; border-radius: 18px;
                   box-shadow: 0px 8px 30px rgba(0,0,0,0.10); }

        h1 { text-align: center; font-size: 32px; color: #1e293b; margin-bottom: 32px; }
        h1 i { color: #e11d48; }

        .section-box {
            background: #f8fbff; border: 1px solid #d4dbe6; padding: 22px;
            border-radius: 14px; margin-bottom: 38px;
        }

        input {
            width: 100%; padding: 14px; border-radius: 10px; border: 1px solid #cbd5e1;
            margin-top: 10px; background: #f1f5ff;
        }

        button {
            width: 100%; padding: 14px; background: #2563eb; color: white;
            border-radius: 10px; border: none; margin-top: 15px; font-size: 17px; cursor: pointer;
        }
        button:hover { background: #1e4fcf; }
    </style>

    <script>
        // Ask for notification permission immediately
        window.onload = () => {
            if (Notification.permission !== "granted") {
                Notification.requestPermission();
            }
        };

        function scheduleNotifications(medicine, dose, times) {
            times.forEach(time => {
                let now = new Date();
                let reminderTime = new Date();

                let match = time.match(/(\\d+)(am|pm)/i);
                if (!match) return;

                let hour = parseInt(match[1]);
                let period = match[2].toLowerCase();

                if (period === "pm" && hour !== 12) hour += 12;
                if (period === "am" && hour === 12) hour = 0;

                reminderTime.setHours(hour, 0, 0, 0);
                if (reminderTime <= now) reminderTime.setDate(reminderTime.getDate() + 1);

                setTimeout(() => {
                    new Notification("💊 Medication Reminder", {
                        body: `Time to take ${medicine} — ${dose}`,
                        icon: "https://cdn-icons-png.flaticon.com/512/2965/2965567.png"
                    });
                }, reminderTime - now);
            });
        }
    </script>
</head>

<body>

<div class="wrapper">

    <h1><i class="fa-solid fa-pills"></i> Medication Assistant Tool</h1>

    <!-- DRUG INFO SECTION -->
    <div class="section-box">
        <h2><i class="fa-solid fa-capsules icon-label"></i> Drug Information</h2>

        <form action="/drug-info" method="post">
            <input name="drug" placeholder="Enter medicine name" required>
            <input name="question" placeholder="Ask about dosage, side effects..." required>
            <button type="submit"><i class="fa-solid fa-search"></i> Get Information</button>
        </form>
    </div>

    <!-- REMAINDER SECTION -->
    <div class="section-box">
        <h2><i class="fa-solid fa-alarm-clock icon-label"></i> Medication Reminder</h2>

        <form action="/reminder-ui" method="post">
            <input name="medicine" placeholder="Medicine name" required>
            <input name="dose" placeholder="Dose (e.g. 500mg)" required>
            <input name="frequency" placeholder="Frequency (e.g. 3 times/day)" required>
            <input name="times" placeholder="Times (8am,2pm,8pm)" required>
            <button type="submit"><i class="fa-solid fa-bell"></i> Create Reminder</button>
        </form>
    </div>

</div>

</body>
</html>
"""


@app.post("/drug-info", response_class=HTMLResponse)
def drug_info(drug: str = Form(...), question: str = Form(...)):
    label_text = fetch_drug_label(drug)

    if not label_text or label_text.strip() == "":
        return """
        <div style='padding:20px;font-family:Inter;background:white;border-radius:12px;max-width:760px;margin:auto'>
            <h2>No Drug Information Found ⚠</h2>
            <a href='/' style='color:#2563eb;font-size:18px'>⬅ Back</a>
        </div>
        """

    try:
        collection = create_temp_vector_store(label_text)
        context = retrieve_answer(collection, question)
    except Exception:
        return "<p>Error processing drug info.</p>"

    prompt = f"Use only this verified drug label:\n{context}\n\nQuestion: {question}"

    try:
        res = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role":"user", "content":prompt}]
        )
        answer = res.choices[0].message.content
    except Exception as e:
        print(f"LLM generation failed: {str(e)}. Using direct FDA source fallback.")
        if not context or context.strip() == "":
            answer = "No matching information was found in the official FDA label database."
        else:
            paras = [p.strip() for p in context.split("\n\n") if p.strip()]
            formatted_paras = []
            for p in paras[:3]:
                formatted_paras.append(p[:400] + "..." if len(p) > 400 else p)
            bullets = "<br><br>• " + "<br><br>• ".join(formatted_paras)
            answer = f"<b>[FDA Label Verified Information (Offline Fallback Mode)]</b>{bullets}<br><br><i>Note: This information was retrieved directly from official FDA drug labels. The primary AI generator is currently offline.</i>"

    return f"""
<div style='padding:20px;font-family:Inter;background:white;border-radius:12px;max-width:760px;margin:auto'>
    <h2 style='color:#1e293b;font-size:28px'>Drug Information Result</h2>
    <div style='font-size:18px;line-height:1.6'>{answer}</div>

    <br>
    <a href="/" style="color:#2563eb;font-size:18px">⬅ Back</a>
</div>
"""


@app.post("/reminder-ui", response_class=HTMLResponse)
def reminder_ui(
    medicine: str = Form(...),
    dose: str = Form(...),
    frequency: str = Form(...),
    times: str = Form(...)
):
    times_list = [t.strip() for t in times.split(",")]
    reminder = reminder_helpers.generate_custom_reminder(medicine, dose, frequency, times_list)

    return f"""
<div style='padding:20px;font-family:Inter;background:white;border-radius:12px;max-width:760px;margin:auto'>
    <h2 style="color:#1e293b;font-size:30px">Medication Reminder Set Successfully ✔</h2>

    <p><b>Medicine:</b> {reminder['medicine']}</p>
    <p><b>Dose:</b> {reminder['dose']}</p>
    <p><b>Frequency:</b> {reminder['frequency']}</p>
    <p><b>Times:</b> {', '.join(reminder['reminder_times'])}</p>

    <script>
        scheduleNotifications("{reminder['medicine']}",
                              "{reminder['dose']}",
                              {reminder['reminder_times']});
    </script>

    <br>
    <a href="/" style="color:#2563eb;font-size:18px">⬅ Back</a>
</div>
"""


# -------------------------------------------------------------------
# REST API ENDPOINTS FOR REACT FRONTEND
# -------------------------------------------------------------------

class DrugInfoRequest(BaseModel):
    drug: str
    question: str

@app.post("/api/drug-info")
def api_drug_info(req: DrugInfoRequest):
    label_text = fetch_drug_label(req.drug)
    if not label_text or label_text.strip() == "":
        raise HTTPException(status_code=404, detail="No verified drug information found.")
    
    try:
        collection = create_temp_vector_store(label_text)
        context = retrieve_answer(collection, req.question)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing drug info: {str(e)}")

    prompt = f"Use only this verified drug label:\n{context}\n\nQuestion: {req.question}"

    try:
        res = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}]
        )
        answer = res.choices[0].message.content
    except Exception as e:
        print(f"LLM generation failed: {str(e)}. Using direct FDA source fallback.")
        if not context or context.strip() == "":
            answer = "No matching information was found in the official FDA label database."
        else:
            paras = [p.strip() for p in context.split("\n\n") if p.strip()]
            formatted_paras = []
            for p in paras[:3]:
                formatted_paras.append(p[:400] + "..." if len(p) > 400 else p)
            bullets = "\n\n• ".join(formatted_paras)
            answer = f"**[FDA Label Verified Information (Offline Fallback Mode)]**\n\n• {bullets}\n\n*Note: This information was retrieved directly from official FDA drug labels. The primary AI generator is currently offline.*"

    return {
        "answer": answer,
        "drug": req.drug,
        "context": context
    }


@app.get("/api/reminders")
def api_get_reminders(db: Session = Depends(get_db)):
    return reminder_helpers.get_reminders(db)


@app.post("/api/reminders")
def api_create_reminder(reminder: reminder_helpers.ReminderCreate, db: Session = Depends(get_db)):
    return reminder_helpers.create_reminder(db, reminder)


@app.put("/api/reminders/{id}")
def api_update_reminder(id: int, reminder: reminder_helpers.ReminderUpdate, db: Session = Depends(get_db)):
    updated = reminder_helpers.update_reminder(db, id, reminder)
    if not updated:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return updated


@app.delete("/api/reminders/{id}")
def api_delete_reminder(id: int, db: Session = Depends(get_db)):
    success = reminder_helpers.delete_reminder(db, id)
    if not success:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return {"message": "Reminder deleted successfully"}


@app.put("/api/reminders/{id}/toggle")
def api_toggle_reminder(id: int, db: Session = Depends(get_db)):
    toggled = reminder_helpers.toggle_reminder(db, id)
    if not toggled:
        raise HTTPException(status_code=404, detail="Reminder not found")
    return toggled


@app.get("/api/schedule/today")
def api_get_today_schedule(date: str, time: str, db: Session = Depends(get_db)):
    """
    Retrieve today's schedule.
    date: YYYY-MM-DD
    time: HH:MM (for determining missed/upcoming status)
    """
    return reminder_helpers.get_today_schedule(db, date, time)


@app.post("/api/schedule/log")
def api_log_occurrence(log: reminder_helpers.OccurrenceLogCreate, db: Session = Depends(get_db)):
    return reminder_helpers.log_occurrence(db, log)
