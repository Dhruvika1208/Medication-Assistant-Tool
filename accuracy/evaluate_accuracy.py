import json
import os
import sys

# ➤ Add your project root folder to Python path
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.append(BASE_DIR)

from backend.rag_chain import generate_grounded_answer
from backend.vector_store import get_indexed_drugs

# Load all test cases
test_cases_path = os.path.join(BASE_DIR, "accuracy", "test_cases.json")
with open(test_cases_path, "r") as f:
    test_cases = json.load(f)

total = len(test_cases)
correct = 0

print("\n[START] Running Accuracy Evaluation using MediRAG Modular Backend (Groq/Llama-3)...\n")

# Check if drugs are indexed first
indexed_drugs = get_indexed_drugs()
print(f"Currently indexed medications: {indexed_drugs}\n")

for idx, test in enumerate(test_cases, 1):
    drug = test["drug"]
    question = test["question"]
    expected_keywords = test["expected_keywords"]

    print(f"Case {idx}: {drug} | {question}")
    
    matching_drug = next((d for d in indexed_drugs if drug.lower() in d.lower()), None)
    if not matching_drug:
        print(f"[ERROR] '{drug}' is not in the indexed drugs database. Please run ingestion first. Skipping.")
        continue

    # Perform RAG lookup using the actual backend pipeline
    try:
        result = generate_grounded_answer(question, drug_name=matching_drug)
        answer = result["answer"].lower()
        
        # Calculate match (at least one expected keyword should be in the answer)
        matches = sum(1 for kw in expected_keywords if kw.lower() in answer)

        if matches > 0:
            print("[PASS] OK")
            correct += 1
        else:
            print("[FAIL] Out of match")
            
        print(f"Expected keywords: {expected_keywords}")
        print(f"Model answer:\n{result['answer']}\n")
        
    except Exception as e:
        print(f"[ERROR] Error executing RAG chain: {e}\n")

# Final report
if total > 0:
    accuracy = (correct / total) * 100
    print(f"[REPORT] FINAL ACCURACY: {accuracy:.2f}% ({correct}/{total} passed)")
else:
    print("[ERROR] No test cases were evaluated.")

