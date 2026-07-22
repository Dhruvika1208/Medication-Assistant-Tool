import os
import re
import json
from typing import Dict, Any, List, Optional
import pypdf

# Configured FDA drug label sections we wish to extract from JSON files
FDA_SECTIONS_MAP = {
    "indications_and_usage": ["indications_and_usage"],
    "dosage_and_administration": ["dosage_and_administration"],
    "contraindications": ["contraindications"],
    "warnings": ["warnings"],
    "warnings_and_precautions": ["warnings_and_precautions", "warnings_and_cautions"],
    "adverse_reactions": ["adverse_reactions"],
    "drug_interactions": ["drug_interactions"],
    "use_in_specific_populations": ["pregnancy", "nursing_mothers", "pediatric_use", "geriatric_use", "use_in_specific_populations"],
    "overdosage": ["overdosage"],
    "description": ["description"],
    "clinical_pharmacology": ["clinical_pharmacology"],
    "how_supplied": ["how_supplied"],
    "storage_and_handling": ["storage_and_handling"]
}

def clean_text(text: str) -> str:
    """
    Cleans text by removing HTML tags, excess spaces, citation brackets, and formatting artifacts.
    """
    if not text:
        return ""
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    # Remove bracketed numbers like [1], [2], (1)
    text = re.sub(r'\[\d+\]', '', text)
    # Standardize spaces
    text = re.sub(r'[ \t]+', ' ', text)
    # Limit consecutive newlines to maximum 2
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()

def guess_medication_name(file_path: str) -> str:
    """
    Guesses the medication name from the file basename.
    E.g., "ibuprofen_labels.json" -> "Ibuprofen"
    "aspirin-notes.txt" -> "Aspirin"
    """
    basename = os.path.basename(file_path)
    name_without_ext, _ = os.path.splitext(basename)
    
    # Replace separators with spaces
    cleaned = re.sub(r'[_\-\s]+', ' ', name_without_ext).strip()
    
    # List of common medications to look for (case-insensitive)
    common_meds = [
        "ibuprofen", "amoxicillin", "metformin", "aspirin", "lisinopril",
        "omeprazole", "atorvastatin", "albuterol", "gabapentin",
        "acetaminophen", "metoprolol", "losartan", "simvastatin"
    ]
    
    words = cleaned.lower().split()
    for word in words:
        if word in common_meds:
            return word.capitalize()
            
    # Fallback to the first capitalized word of the filename
    if words:
        return words[0].capitalize()
    return "Unknown Medication"

def parse_fda_json(file_path: str) -> Optional[Dict[str, Any]]:
    """
    Parses an FDA/openFDA JSON file.
    Can handle standard openFDA API wrapper structure (having a "results" key)
    or a single direct result object.
    
    Returns a dictionary of sections:
    {
        "drug_name": brand_name,
        "generic_name": generic_name,
        "setid": doc_id,
        "sections": {section_name: text},
        "source_url": API url or query URL (optional),
        "doc_id": doc_id
    }
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            
        # Resolve results if it's the raw API response wrapper
        result = None
        if "results" in data and isinstance(data["results"], list) and len(data["results"]) > 0:
            result = data["results"][0]
        elif isinstance(data, dict):
            # Try to treat the root dict as the label itself
            # Check if it has setid or sections
            if "setid" in data or any(k in data for k in FDA_SECTIONS_MAP.keys()):
                result = data
                
        if not result:
            print(f"[Parser Warning] Could not resolve a valid FDA label structure in {file_path}")
            return None
            
        # Extract metadata identifiers
        setid = result.get("setid")
        if isinstance(setid, list) and setid:
            setid = setid[0]
        elif not setid:
            setid = "unknown_setid"
            
        # Get openfda brand/generic names
        openfda = result.get("openfda", {})
        brand_names = openfda.get("brand_name", [])
        generic_names = openfda.get("generic_name", [])
        
        # Use filename as backup if names not present in JSON
        guessed_name = guess_medication_name(file_path)
        brand_name = brand_names[0] if brand_names else guessed_name
        generic_name = generic_names[0] if generic_names else brand_name
        
        extracted_sections = {}
        for section_name, fda_keys in FDA_SECTIONS_MAP.items():
            content_list = []
            for key in fda_keys:
                if key in result:
                    val = result[key]
                    if isinstance(val, list):
                        content_list.extend(val)
                    else:
                        content_list.append(str(val))
            if content_list:
                extracted_sections[section_name] = "\n".join(content_list)
                
        # Fallback if no sections extracted, try looking for general text fields
        if not extracted_sections:
            # Maybe it's a simple key-value structure of drug info
            for k, v in result.items():
                if isinstance(v, str) and len(v) > 20 and k != "setid":
                    extracted_sections[k] = v
                    
        source_url = f"https://api.fda.gov/drug/label.json?search=setid:{setid}" if setid != "unknown_setid" else ""
        
        return {
            "drug_name": brand_name,
            "generic_name": generic_name,
            "setid": setid,
            "sections": extracted_sections,
            "source_url": source_url,
            "doc_id": setid
        }
    except Exception as e:
        print(f"[Parser Error] Failed to parse FDA JSON label {file_path}: {e}")
        return None

def parse_txt(file_path: str) -> Optional[str]:
    """
    Parses a plain text file.
    Returns cleaned text content.
    """
    try:
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()
        return content
    except Exception as e:
        print(f"[Parser Error] Failed to read text file {file_path}: {e}")
        return None

def parse_pdf(file_path: str) -> Optional[str]:
    """
    Parses a PDF file using pypdf and extracts all text page by page.
    """
    try:
        reader = pypdf.PdfReader(file_path)
        text_pages = []
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text()
            if page_text:
                text_pages.append(page_text)
        if not text_pages:
            print(f"[Parser Warning] No text extracted from PDF: {file_path}")
            return None
        return "\n\n".join(text_pages)
    except Exception as e:
        print(f"[Parser Error] Failed to parse PDF file {file_path}: {e}")
        return None
