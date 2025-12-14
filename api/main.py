from fastapi import FastAPI, Form
from fastapi.responses import HTMLResponse
from openai import OpenAI
import os
from dotenv import load_dotenv

from api.fetch_label import fetch_drug_label
from api.rag import create_temp_vector_store, retrieve_answer
from api.reminder import generate_custom_reminder

load_dotenv()

app = FastAPI(
    title="Medication Assistant",
    docs_url=None,
    redoc_url=None,
    openapi_url=None
)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# -------------------------------------------------------------------
# HOME UI PAGE (NOTIFICATION LOGIC INCLUDED)
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


# -------------------------------------------------------------------
# DRUG INFO PAGE (UI UPDATED)
# -------------------------------------------------------------------
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
    except:
        return "<p>Error processing drug info.</p>"

    prompt = f"Use only this verified drug label:\n{context}\n\nQuestion: {question}"

    res = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[{"role":"user", "content":prompt}]
    )
    
    answer = res.choices[0].message.content

    return f"""
<div style='padding:20px;font-family:Inter;background:white;border-radius:12px;max-width:760px;margin:auto'>
    <h2 style='color:#1e293b;font-size:28px'>Drug Information Result</h2>
    <p style='font-size:18px;line-height:1.6'>{answer}</p>

    <br>
    <a href="/" style="color:#2563eb;font-size:18px">⬅ Back</a>
</div>
"""


# -------------------------------------------------------------------
# REMAINDER RESULT PAGE (UI + POPUP)
# -------------------------------------------------------------------
@app.post("/reminder-ui", response_class=HTMLResponse)
def reminder_ui(
    medicine: str = Form(...),
    dose: str = Form(...),
    frequency: str = Form(...),
    times: str = Form(...)
):

    times_list = [t.strip() for t in times.split(",")]
    reminder = generate_custom_reminder(medicine, dose, frequency, times_list)

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
