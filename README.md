*Project Title*:

Label‑Aware Medication Reminder & Drug Information Assistant

*Problem Statement*:

Patients often forget medication schedules and lack clear, reliable information about drug dosage and side effects. This project builds an AI-powered medication assistant using LLMs with RAG to retrieve verified drug information and generate structured medication reminder plans, improving safety and adherence.

*Problem Description:*

This project is an AI-driven chatbot that uses LLMs + Retrieval-Augmented Generation (RAG) to:

Retrieve accurate drug details from FDA/openFDA label datasets

Answer user questions about dosage, side effects, warnings, usage, etc.

Generate structured reminder schedules in JSON format

Provide safe, grounded responses based on real drug labels

Help patients manage their medications more effectively

The system demonstrates responsible AI usage in healthcare by grounding all answers in verified drug label data rather than allowing the model to hallucinate.

 *Feasibility*

*Technical Feasibility*

Uses openFDA, a free, publicly accessible API → no cost, no legal issues.

RAG pipeline relies on FAISS/Chroma, sentence-transformers, and open-source tools.

Embedding generation + vector search requires low computational power, can run on any laptop.

LLM (ChatGPT or local Llama model) can be integrated easily using SDKs.

*Operational Feasibility*

No domain expertise required — FDA labels already contain structured information.

System is modular: retrieval, generator, reminder logic are separate.

Easy to integrate as CLI or minimal web UI (Flask/Streamlit).

*Economic Feasibility*

All components except optional LLM API are free.

Using small LLM models or OpenAI free tier keeps costs almost zero.

*Reliability*

*1.Authoritative Data Source*

Uses FDA‑approved drug label information.

Ensures zero misinformation from random web sources.

*2.RAG Architecture*

Instead of the LLM “guessing”, it answers only from retrieved label text.

If data is missing → system safely says “Information not available”.

*3.Deterministic Retrieval*

FAISS/chroma vector search always returns the same relevant chunks for the same query.

Makes the system predictable and testable.

*4.Transparent Output*

Retrieved context can be logged or shown to judges → high trustworthiness.

*5.No hallucinations*

Because of retrieval grounding + strict prompts:

“Use only the provided source. Do not invent medical facts.”

*Workflow*

*Step 1 — User Query*

User asks a question such as:

“What is the dosage of Amoxicillin?”

“Generate reminder for 500mg 3 times/day.”

*Step 2 — Data Retrieval from openFDA*

System fetches:

-dosage_and_administration

-adverse_reactions

-warnings

-indications_and_usage

Data arrives in JSON format.

*Step 3 — Text Processing*

Text is cleaned

Split into chunks (paragraphs)

Embeddings generated using sentence-transformers

*Step 4 — Store in Vector Database*

Chunks + embeddings stored in:

-FAISS or Chroma

This enables semantic search (meaning-based, not word-matching).

*Step 5 — Query Embedding & Retrieval*

User question → converted into embedding → vector DB retrieves top‑k relevant chunks.

Example:

  The system retrieves the “dosage and administration” section for Amoxicillin.

*Step 6 — LLM Answer Generation*

Input to model:

-User question

-Retrieved label text

-Safety instructions (no hallucination)

LLM then:

-Summarizes the relevant drug details

-Ensures answer is grounded only on FDA information

-If no data → politely declines

*Step 7 — Reminder Module*

If a reminder is requested:

-System converts dosage frequency into time slots

*Step 8 — Final Output*

Delivered as:

-Plain chat answer

-JSON schedule

-Optional citations
