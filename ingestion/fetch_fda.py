import os
import sys
import argparse
import requests
import json
from typing import List, Optional

# Ensure project root is in the path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BASE_DIR not in sys.path:
    sys.path.append(BASE_DIR)

# Standard medications list for the application database
DEFAULT_MEDICATIONS = [
    "Ibuprofen",
    "Amoxicillin",
    "Metformin",
    "Aspirin",
    "Lisinopril",
    "Omeprazole",
    "Atorvastatin",
    "Albuterol",
    "Gabapentin",
    "Acetaminophen",
    "Metoprolol",
    "Losartan",
    "Simvastatin"
]

DATA_DIR = os.path.join(BASE_DIR, "backend", "data")
RAW_DRUG_LABELS_DIR = os.path.join(DATA_DIR, "raw", "drug_labels")

def fetch_and_save_drug_label(drug_name: str) -> bool:
    """
    Fetch raw drug label JSON from official openFDA API and save it.
    """
    query_drug = drug_name.lower().strip()
    print(f"[*] Querying openFDA API for: '{drug_name}'...")
    
    # openFDA query syntax: search both brand name and generic name via fuzzy queries
    url = f"https://api.fda.gov/drug/label.json?search=openfda.brand_name:{query_drug}+openfda.generic_name:{query_drug}&limit=1"
    
    try:
        response = requests.get(url, timeout=15)
        if response.status_code == 404:
            # Try searching just brand name or just generic name to be more lenient
            print(f"[!] Fuzzy combined search failed. Trying brand name only search for '{drug_name}'...")
            url = f"https://api.fda.gov/drug/label.json?search=openfda.brand_name:{query_drug}&limit=1"
            response = requests.get(url, timeout=15)
            
            if response.status_code == 404:
                print(f"[!] Brand name search failed. Trying generic name only search for '{drug_name}'...")
                url = f"https://api.fda.gov/drug/label.json?search=openfda.generic_name:{query_drug}&limit=1"
                response = requests.get(url, timeout=15)

        if response.status_code != 200:
            print(f"[ERROR] openFDA API returned HTTP {response.status_code} for '{drug_name}'.")
            return False
            
        data = response.json()
        if "results" not in data or len(data["results"]) == 0:
            print(f"[ERROR] No results found for '{drug_name}' in openFDA response.")
            return False
            
        # Target output file path
        safe_filename = "".join([c if c.isalnum() else "_" for c in drug_name.lower()]).strip("_")
        out_path = os.path.join(RAW_DRUG_LABELS_DIR, f"{safe_filename}.json")
        
        # Save JSON directly
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
            
        print(f"[SUCCESS] Downloaded and saved raw label JSON to {out_path}")
        return True
        
    except Exception as e:
        print(f"[ERROR] Request failed for '{drug_name}': {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="Fetch official FDA drug-label JSON data from openFDA.")
    parser.add_argument(
        "--drug", 
        type=str, 
        help="Specific medication brand or generic name to fetch."
    )
    parser.add_argument(
        "--all", 
        action="store_true", 
        help="Fetch all standard default medications."
    )
    
    args = parser.parse_args()
    
    # Ensure raw drug label folder exists
    os.makedirs(RAW_DRUG_LABELS_DIR, exist_ok=True)
    
    medications_to_fetch = []
    
    if args.drug:
        medications_to_fetch = [args.drug]
    elif args.all:
        medications_to_fetch = DEFAULT_MEDICATIONS
    else:
        # Prompt option if run interactively or default to all if nothing is passed
        print("[*] No arguments specified. Defaulting to fetch all standard medications.")
        medications_to_fetch = DEFAULT_MEDICATIONS
        
    print(f"[*] Preparing to fetch {len(medications_to_fetch)} medication label(s)...")
    
    successful = 0
    failed = []
    
    for med in medications_to_fetch:
        print("-" * 50)
        ok = fetch_and_save_drug_label(med)
        if ok:
            successful += 1
        else:
            failed.append(med)
            
    print("\n" + "=" * 50)
    print("[DONE] openFDA Data Fetch Completed!")
    print(f"   Successfully fetched: {successful} / {len(medications_to_fetch)}")
    if failed:
        print(f"   Failed to fetch:     {failed}")
    print("=" * 50)

if __name__ == "__main__":
    main()
