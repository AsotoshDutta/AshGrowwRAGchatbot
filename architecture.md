# Architecture Design: Mutual Fund FAQ Assistant (Facts-Only Q&A)

This document details the system architecture, component design, data flow, and compliance guardrails for the **Mutual Fund FAQ Assistant**. The system is designed to provide high-precision, facts-only responses to mutual fund queries based on a curated corpus of official documents from a selected Asset Management Company (AMC) — **SBI Mutual Fund** — and official regulatory bodies (AMFI and SEBI).

---

## 1. System Overview

The system is built on a **Retrieval-Augmented Generation (RAG)** architecture with a strict compliance-oriented retrieval pipeline and a deterministic output filter. The core objective is **high-fidelity facts-only retrieval** over flexibility or conversational intelligence.

### High-Level Architecture Diagram

```mermaid
graph TD
    %% Corpus & Ingestion
    subgraph Data Ingestion Pipeline (Offline)
        A[Official Sources: SBI AMC, SEBI, AMFI] -->|Scrape / Download| B(Raw PDF/HTML Docs)
        B -->|PDF/HTML Parsing| C[Text Pre-processing & Cleaning]
        C -->|Recursive Character Chunking| D[Text Chunks + Metadata]
        D -->|Embeddings Generation| E[Vector Database]
    end

    %% Query Pipeline
    subgraph Query & Retrieval Pipeline (Online)
        User[User Interface] -->|Query| F[Input Guardrail: Intent Classifier]
        F -->|Advisory / Non-Factual| G[Refusal Handler]
        F -->|Factual Query| H[Hybrid Retriever: Vector + Keyword]
        E -->|Search Context| H
        H -->|Context Chunks| I[RAG Prompt Assembly]
        I -->|Strict System Instructions| J[LLM Generation Engine]
        J -->|Raw Response| K[Output Guardrail & Validator]
        K -->|Fail: Retry or Refuse| G
        K -->|Pass: Output Response| L[Response Formatter]
        G -->|Pre-packaged Refusal + AMFI Link| L
        L -->|Response + Source Citation + Date Footer| User
    end

    style Data Ingestion Pipeline (Offline) fill:#f5f7fa,stroke:#666,stroke-width:1px
    style Query & Retrieval Pipeline (Online) fill:#edf2f7,stroke:#666,stroke-width:1px
    style G fill:#fbcfe8,stroke:#ec4899,stroke-width:1.5px
    style K fill:#fed7aa,stroke:#f97316,stroke-width:1.5px
```

---

## 2. Component Specifications

### 2.1 Data Ingestion Pipeline (Offline)
*   **Target AMC**: **SBI Mutual Fund**
*   **Source Document Types**:
    *   *Scheme Information Documents (SID)* and *Key Information Memorandums (KIM)* for target schemes.
    *   *Monthly Fund Factsheets* (latest monthly PDFs for expense ratios, exit loads, asset allocation, and fund manager profiles/tenure).
    *   *AMC Help & FAQs* (static web pages for statement generation, account logins, and capital gains reports).
    *   *AMFI / SEBI Regulatory FAQs* (for general rules like ELSS lock-in periods and taxation).
*   **Chunking Strategy**: 
    *   We use a **Recursive Character Text Splitter** with a chunk size of 500 characters and 100 characters overlap.
    *   Metadata is preserved for each chunk: `source_url`, `doc_type`, `scheme_name`, and `last_updated_date`.
*   **Vector Database / Index**: 
    *   A pre-computed JSON file (`src/data/index.json`) containing text chunks, metadata, and 768-dimension embeddings generated using Google's `gemini-embedding-001` model. At runtime, the serverless function loads this JSON in-memory to compute cosine similarities.

### 2.2 Input Guardrail & Intent Classifier
To prevent the assistant from offering investment advice, the system runs an initial classification filter on the user input query:
1.  **Keyword Blocking**: Queries containing advisory keywords (e.g., *"should I buy"*, *"which is better"*, *"best return"*, *"invest in"*, *"opinion on"*) are routed directly to the Refusal Handler.
2.  **Semantic Classification**: An LLM-based zero-shot intent classifier identifies if the query is factual (e.g., *"What is the exit load of SBI Bluechip?"*) or advisory (e.g., *"Is SBI Small Cap good for long term?"*).

### 2.3 Retrieval Engine
To ensure high precision, the retrieval engine uses a **Hybrid Search** approach:
*   **Vector Search**: Matches semantic context and synonym-based questions.
*   **Keyword Search (BM25)**: Matches exact terms such as numeric scheme names, abbreviations (e.g., "ELSS"), and regulatory terms.
*   **Context Assembling**: The top-3 chunks are retrieved. The system verifies that the retrieved chunks contain relevant source URLs before passing them to the generation step.

### 2.4 LLM Generator & Prompt Design
The LLM is prompted with strict system instructions that dictate:
*   **Context Anchoring**: The model must base its response *only* on the provided context chunks. If the answer is not present, it must trigger a soft refusal.
*   **Sentence Constraint**: The output *must* be limited to a maximum of **3 sentences**.
*   **No Advice**: Do not use words like *"recommend"*, *"good choice"*, *"outperform"*, or *"ideal investment"*.
*   **Citation Formatting**: The LLM must output the response in a structured JSON format to separate the factual sentences, the source link, and the date.

### 2.5 Refusal & Safety Handler
When a query is classified as non-factual, advisory, or out-of-scope:
*   The handler bypasses LLM generation to prevent hallucinations.
*   It generates a standard, polite refusal message reinforcing the facts-only policy.
*   It appends a relevant educational link from **AMFI India** or **SEBI Investor Education** (e.g., [AMFI Investor Education Portal](https://www.amfiindia.com/investor-corner)).

### 2.6 Output Validator & Guardrails
A post-generation verification step runs before displaying the answer:
*   **Length Check**: Verifies the response has $\le 3$ sentences.
*   **Source Verification**: Ensures the citation URL matches one of the official URLs in the retrieved metadata.
*   **Safety Filter**: Verifies no sensitive keywords or advisory terms were generated.

---

## 3. Technology Stack

### 3.1 Backend & RAG Pipeline
*   **Language**: Node.js (v18+ / ESM)
*   **Framework**: Vercel Serverless Functions (`api/chat.js` for API routing)
*   **Orchestration**: Custom lightweight RAG logic using the `@google/generative-ai` SDK
*   **Vector Store**: In-memory static vector index (`src/data/index.json`)
*   **Embeddings**: Google Gemini Embeddings API (`gemini-embedding-001`)
*   **LLM API**: Google Gemini API (`gemini-1.5-flash`)

### 3.2 Frontend User Interface
*   **Structure**: HTML5 (Semantic elements: `<main>`, `<header>`, `<footer>`, `<aside>`)
*   **Styling**: Vanilla CSS (modern glassmorphism, responsive grid layout, clean dark/light UI tokens, transitions)
*   **Interactions**: Vanilla JavaScript (managing chat messages, pre-packaged quick questions, typing animations, error handling)
*   **Design Tokens**:
    *   *Primary Color*: Groww Emerald Green (`#00D09C`)
    *   *Background*: Deep Charcoal (`#121214`) for dark mode; Ice White (`#F8F9FA`) for light mode
    *   *Typography*: Inter / Outfit font family

---

## 4. Curated Data Corpus (SBI Mutual Fund)

The system will ingest a static dataset consisting of **18 official public URLs** from SBI Mutual Fund, AMFI, and SEBI:

| # | Source URL | Document Type | Key Factual Content |
|---|------------|---------------|----------------------|
| 1 | `https://www.sbimf.com/en-us/quick-links/investor-education` | AMC Portal FAQs | Guides on how to download account statements & capital gains. |
| 2 | `https://www.sbimf.com/en-us/quick-links/tax-calculator` | AMC Guide Page | Capital gains tax rates, short-term vs long-term taxation guides. |
| 3 | `https://www.sbimf.com/en-us/equity-schemes/sbi-bluechip-fund` | Scheme Details | Expense ratio, exit load, benchmark index, minimum investment for SBI Bluechip Fund. |
| 4 | `https://www.sbimf.com/en-us/equity-schemes/sbi-small-cap-fund` | Scheme Details | Expense ratio, exit load, riskometer, SIP minimums for SBI Small Cap Fund. |
| 5 | `https://www.sbimf.com/en-us/equity-schemes/sbi-focused-equity-fund` | Scheme Details | Objective, benchmark, entry/exit loads for SBI Focused Equity Fund. |
| 6 | `https://www.sbimf.com/en-us/equity-schemes/sbi-contra-fund` | Scheme Details | Contrarian investment strategy, AUM, and portfolio metrics. |
| 7 | `https://www.sbimf.com/en-us/equity-schemes/sbi-long-term-equity-fund` | Scheme Details (ELSS) | 3-year lock-in guidelines, Section 80C tax deduction features. |
| 8 | `https://www.sbimf.com/en-us/debt-schemes/sbi-magnum-constant-maturity-fund`| Scheme Details (Debt) | Portfolio duration, average maturity, risk classification. |
| 9| `https://www.sbimf.com/downloads/factsheets/Latest_Factsheet.pdf` | Factsheet (PDF) | Latest AUM, expense ratios, portfolio holdings, fund manager details (name, tenure, experience), riskometers for all schemes. |
| 10| `https://www.sbimf.com/downloads/kim/SBI-Bluechip-Fund-KIM.pdf` | KIM (PDF) | Key Information Memorandum containing risk factors and statutory details. |
| 11| `https://www.sbimf.com/downloads/kim/SBI-Small-Cap-Fund-KIM.pdf` | KIM (PDF) | Key Information Memorandum for SBI Small Cap Fund. |
| 12| `https://www.sbimf.com/downloads/sid/SBI-Bluechip-Fund-SID.pdf` | SID (PDF) | Detailed Scheme Information Document for regulatory compliance. |
| 13| `https://www.sbimf.com/downloads/sid/SBI-Small-Cap-Fund-SID.pdf` | SID (PDF) | Detailed Scheme Information Document for SBI Small Cap. |
| 14| `https://www.sebi.gov.in/sebi_data/faqfiles/jan-2021/1611728286280.pdf` | SEBI Regulatory FAQ | Official rules on mutual fund categorization and risk classification. |
| 15| `https://www.amfiindia.com/investor-corner/knowledge-center/what-are-mutual-funds-categories` | AMFI Knowledge Center | Explanations of Equity, Debt, Hybrid, and ELSS structures. |
| 16| `https://www.amfiindia.com/investor-corner/knowledge-center/expense-ratio.html` | AMFI Guide | Explanations of Total Expense Ratio (TER) limits and calculations. |
| 17| `https://www.amfiindia.com/investor-corner/knowledge-center/exit-load.html` | AMFI Guide | Detailed educational reference for exit loads and calculations. |
| 18| `https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=36` | SEBI Portals | Directory of SEBI registered investment advisors (linked in refusal responses). |

---

## 5. Security & Privacy Design

To meet the absolute strict privacy criteria:
*   **PII Stripping (Pre-processor)**: A regex-based sanitizer strips any inputs matching standard formats for:
    *   Permanent Account Number (PAN): `[A-Z]{5}[0-9]{4}[A-Z]{1}`
    *   Aadhaar Number: `[2-9]{1}[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}`
    *   OTP / Phone number: Standard 6-digit OTP codes or 10-digit phone numbers.
    *   Email Addresses.
*   **Database Isolation**: The system does not maintain a persistent database of user queries or session history. Conversation state is stored in memory in ephemeral client-side storage (e.g., JavaScript `sessionStorage`), meaning refreshing the page clears all records.

---

## 6. Implementation Plan & Deliverables

### Phase 1: Ingestion & Knowledge Base Creation
*   Create a scraper/downloader script to pull the static web contents and store PDFs.
*   Set up a chunking and embedding pipeline to generate the static JSON vector store (`src/data/index.json`).

### Phase 2: RAG Pipeline Development
*   Implement the Vercel serverless function (`api/chat.js`).
*   Construct the strict system prompt for Gemini `gemini-1.5-flash`.
*   Develop the Intent Classifier and PII filter for input guardrails.
*   Build the post-generation Output Validator.

### Phase 3: Premium UI Interface
*   Create a single-page chat interface using responsive CSS (emerald green theme matching Groww).
*   Add visible disclaimer headers/footers.
*   Implement pre-packaged question buttons (e.g., *"What is the exit load of SBI Bluechip Fund?"*).

### Phase 4: Verification & Compliance Testing
*   Test with positive factual queries.
*   Test with negative advisory queries (e.g., *"Is SBI Contra Fund good?"*) to verify proper refusal routing and AMFI links.
*   Test with PII (Aadhaar/PAN) to verify redaction/refusal.
