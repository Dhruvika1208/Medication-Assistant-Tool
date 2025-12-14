def generate_custom_reminder(medicine, dose, frequency, times_list):
    return {
        "medicine": medicine,
        "dose": dose,
        "frequency": frequency,
        "reminder_times": times_list,
        "message": "Custom reminder schedule created."
    }
