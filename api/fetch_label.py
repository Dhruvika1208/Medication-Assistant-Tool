import requests

def fetch_drug_label(drug_name: str):
    drug_name = drug_name.lower().strip()

    # Try fuzzy search via openFDA directly
    url = f"https://api.fda.gov/drug/label.json?search=openfda.brand_name:{drug_name}+openfda.generic_name:{drug_name}&limit=1"

    try:
        response = requests.get(url).json()

        # If nothing found
        if "results" not in response:
            return None

        data = response["results"][0]

        # Combine all useful text sections
        sections = [
            "indications_and_usage",
            "dosage_and_administration",
            "warnings",
            "warnings_and_cautions",
            "adverse_reactions",
            "contraindications",
            "drug_interactions",
            "pregnancy",
            "breastfeeding",
            "overdosage",
            "clinical_pharmacology",
            "how_supplied"
        ]

        all_text = []

        for section in sections:
            if section in data:
                all_text.append("\n".join(data[section]))

        return "\n\n".join(all_text)

    except Exception:
        return None
