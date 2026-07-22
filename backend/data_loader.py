import requests
from typing import Dict, Any, Optional

def fetch_fda_label_data(drug_name: str) -> Optional[Dict[str, Any]]:
    """
    Fetch drug label from official openFDA API.
    Returns structured data containing drug name, setid, and dictionary of sections.
    """
    drug_name = drug_name.lower().strip()
    
    # search brand name and generic name via fuzzy query
    url = f"https://api.fda.gov/drug/label.json?search=openfda.brand_name:{drug_name}+openfda.generic_name:{drug_name}&limit=1"
    
    try:
        response = requests.get(url, timeout=10)
        if response.status_code != 200:
            print(f"Failed to fetch label for '{drug_name}': HTTP Status {response.status_code}")
            return None
            
        data = response.json()
        if "results" not in data or len(data["results"]) == 0:
            print(f"No label results found for '{drug_name}' in openFDA.")
            return None
            
        result = data["results"][0]
        
        # Get identifier
        setid = result.get("setid", ["unknown_id"])[0] if isinstance(result.get("setid"), list) else result.get("setid", "unknown_id")
        
        # Get brand name / generic name for verified indexing
        openfda = result.get("openfda", {})
        brand_name = openfda.get("brand_name", [drug_name.capitalize()])[0]
        generic_name = openfda.get("generic_name", [drug_name.capitalize()])[0]
        
        # Extract desired sections
        sections_map = {
            "indications_and_usage": ["indications_and_usage"],
            "dosage_and_administration": ["dosage_and_administration"],
            "contraindications": ["contraindications"],
            "warnings_and_precautions": ["warnings_and_cautions", "warnings", "warnings_and_precautions"],
            "adverse_reactions": ["adverse_reactions"],
            "drug_interactions": ["drug_interactions"],
            "use_in_specific_populations": ["pregnancy", "nursing_mothers", "pediatric_use", "geriatric_use"],
            "storage_and_handling": ["storage_and_handling", "how_supplied"]
        }
        
        extracted_sections = {}
        for friendly_name, fda_keys in sections_map.items():
            content_list = []
            for key in fda_keys:
                if key in result:
                    val = result[key]
                    if isinstance(val, list):
                        content_list.extend(val)
                    else:
                        content_list.append(str(val))
            if content_list:
                extracted_sections[friendly_name] = "\n".join(content_list)
                
        return {
            "drug_name": brand_name,
            "generic_name": generic_name,
            "setid": setid,
            "sections": extracted_sections
        }
        
    except Exception as e:
        print(f"Error fetching FDA label for '{drug_name}': {e}")
        return None
