import requests

def fetch_drug_label(drug_name: str):
    url = f"https://api.fda.gov/drug/label.json?search=openfda.brand_name:{drug_name}&limit=1"

    try:
        data = requests.get(url).json()
        results = data.get("results", [])
        if not results:
            return None
        
        result = results[0]

        sections = [
            "indications_and_usage",
            "dosage_and_administration",
            "warnings",
            "adverse_reactions"
        ]

        label_text = ""

        for sec in sections:
            if sec in result:
                label_text += f"\n\n{sec.upper()}:\n{result[sec][0]}"

        return label_text.strip()

    except:
        return None
