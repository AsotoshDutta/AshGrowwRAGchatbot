# Project Implementation Plan: Mutual Fund FAQ Assistant (Facts-Only Q&A)

This document provides a step-by-step implementation plan for building the **Mutual Fund FAQ Assistant**. It details the work items across six structured phases, from initial setup to deployment-ready verification.

For architectural details, refer to the [architecture.md](file:///C:/Users/91910/Downloads/NextLeap%20projects/MutualFundFAQRAG/architecture.md).

---

## Phase 1: Environment Setup & Project Initialization
Set up the workspace, directory structure, dependency management, and configuration.

### Tasks
- [x] Create the project directory structure:
  - `data/` (raw documents, PDFs, static HTML inputs)
  - `scripts/` (offline crawler & indexing scripts)
  - `src/` & `src/data/` (in-memory JSON vector index storage)
  - `public/` (frontend HTML, CSS, JavaScript served statically by Vercel)
  - `api/` (Vercel Serverless Functions)
- [x] Define the dependency requirements in [package.json](file:///C:/Users/91910/Downloads/NextLeap%20projects/MutualFundFAQRAG/package.json):
  - `@google/generative-ai` (official Google Gemini API SDK)
  - `dotenv` (environment configuration loader)
  - `pdf-parse`, `cheerio` (development tools for offline PDF parsing & crawling)
- [x] Set up environment variable template `.env.example`:
  - `GEMINI_API_KEY` (Google Gemini API access)

### Deliverables
- Project folder layout
- File [package.json](file:///C:/Users/91910/Downloads/NextLeap%20projects/MutualFundFAQRAG/package.json)
- Configuration templates

---

## Phase 2: Data Acquisition & Pre-processing (ETL)
Acquire official documentation and create an ingestion pipeline to clean and structure the data.

### Tasks
- [ ] Collate the 18 target SBI Mutual Fund, SEBI, and AMFI URLs specified in [architecture.md](file:///C:/Users/91910/Downloads/NextLeap%20projects/MutualFundFAQRAG/architecture.md#4-curated-data-corpus-sbi-mutual-fund).
- [ ] Build a downloader script `scripts/download.js` to:
  - Download official PDFs (Factsheets, SIDs, KIMs) and cache them in `data/pdf/`.
  - Fetch static FAQ/Guide web pages and save them as plain text/HTML in `data/web/`.
- [ ] Build a pre-processing pipeline `scripts/process.js`:
  - Extract text from PDFs using `pdf-parse`, clean formatting, and strip redundant whitespaces.
  - Parse HTML guides using `cheerio` to extract relevant headers and text blocks.
  - Tag each chunk with critical metadata: `source_url`, `doc_type`, `scheme_name` (where applicable), and `last_updated_date`.

### Deliverables
- Cached source documents under `data/`
- Script `scripts/download.js`
- Script `scripts/process.js`

---

## Phase 3: Vector Index Construction & Embedding Generation (Offline)
Index the processed chunks into a static JSON embedding file for Vercel in-memory lookup.

### Tasks
- [ ] Implement text chunking strategy in `scripts/build_index.js`:
  - Split text by paragraphs/sentences (chunk target size: 500 characters, overlap: 100 characters).
  - Avoid splitting key factual tables/parameters across chunks.
- [ ] Generate Embeddings via Gemini API:
  - Call `gemini-embedding-001` API for each text chunk using `@google/generative-ai`.
- [ ] Compile the static JSON vector store file:
  - Write text chunks, metadata tags, and embedding vectors into `src/data/index.json`.
- [ ] Write a verification script `scripts/test_retrieval.js` to load the JSON index, embed a test query, compute cosine similarity in JavaScript, and verify retrieval accuracy.

### Deliverables
- Ingestion orchestrator `scripts/build_index.js`
- Static Vector database file `src/data/index.json`
- Verification script `scripts/test_retrieval.js`

---

## Phase 4: RAG Engine & Backend API Development (Vercel Serverless)
Implement the Vercel serverless function, query classification, Gemini model orchestration, safety guardrails, and output validation.

### Tasks
- [ ] Develop input safety regex cleaner in `api/lib/safety.js`:
  - Strip PAN formats: `[A-Z]{5}[0-9]{4}[A-Z]{1}`
  - Strip Aadhaar formats: `[2-9]{1}[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}`
  - Strip OTPs, phone numbers, and email patterns.
- [ ] Implement the **Intent Classifier** inside `api/chat.js` to intercept advisory/comparative questions.
- [ ] Design the RAG Prompt Template:
  - Embed strict rules enforcing a maximum of 3 sentences.
  - Enforce zero external knowledge (facts-only, fail-safe refusal if context is insufficient).
  - Enforce JSON response output format.
- [ ] Implement in-memory vector search in `api/lib/retriever.js`:
  - Fetch query embedding via Gemini Embeddings API.
  - Compute cosine similarity against `src/data/index.json`.
  - Retrieve top-3 matching chunks with metadata.
- [ ] Implement the Vercel Serverless Function `api/chat.js` (`POST /api/chat`):
  - Integrate safety cleaner, intent check, custom retriever, Gemini model runner (`gemini-1.5-flash`), output sentence count validator, and whitelist citation checker.
  - Return formatted response JSON.

### Deliverables
- Safety filter `api/lib/safety.js`
- In-memory retriever `api/lib/retriever.js`
- Vercel function `api/chat.js`

---

## Phase 5: Front-end UI Implementation
Create a premium, modern chat user interface styled in a Groww-inspired aesthetic.

### Tasks
- [ ] Design custom HTML layout (`public/index.html`) using semantic tags.
- [ ] Add interactive stylesheet (`public/css/style.css`):
  - Theme colors: Groww Emerald Green (`#00D09C`), charcoal dark mode background, and soft light mode variables.
  - UI Elements: Modern glassmorphism panels, glowing borders, smooth slide-in animations for chat bubbles, typing indicator.
  - Prominent sticky header warning/disclaimer: `"Facts-only FAQ Assistant. No investment advice or recommendations."`
- [ ] Write client interaction script (`public/js/app.js`):
  - Asynchronous chat message management (rendering user vs. bot messages).
  - Pre-packaged "Quick Question" chips (e.g., *"What is the minimum SIP for SBI Small Cap?"*, *"Who is the fund manager of SBI Bluechip?"*, *"Is SBI Focused Equity a good investment?"*).
  - Clear formatting of the answer block, highlighting the citation link and displaying the "Last updated" footer.
  - Automatic session reset (sessionStorage) for privacy compliance.

### Deliverables
- UI layout [index.html](file:///C:/Users/91910/Downloads/NextLeap%20projects/MutualFundFAQRAG/public/index.html)
- Custom CSS stylesheet [style.css](file:///C:/Users/91910/Downloads/NextLeap%20projects/MutualFundFAQRAG/public/css/style.css)
- Script [app.js](file:///C:/Users/91910/Downloads/NextLeap%20projects/MutualFundFAQRAG/public/js/app.js)

---

## Phase 6: Testing & Quality Assurance
Run validation test suites to ensure facts-only constraints, citation accuracy, and refusal compliance are strictly met.

### Tasks
- [ ] Write automated test cases in `scripts/test_compliance.js`:
  - **Factual Queries Test**: Verify correct retrieval for queries (e.g., minimum SIP, exit loads, fund managers).
  - **Advisory Refusal Test**: Verify that queries like "Should I buy..." get flagged, return the standard refusal, and provide the educational link.
  - **Sentence Count Test**: Verify generated responses never exceed 3 sentences.
  - **PII Guardrail Test**: Send dummy PAN/Aadhaar formats and verify the system sanitizes/refuses them.
  - **Citation Check**: Verify that every response contains exactly one link from the official curated list.
- [ ] Execute tests using basic Node assertion runners.
- [ ] Create a comprehensive project `README.md` with:
  - Setup instructions (how to run ingestion, dev environment, and deployment on Vercel).
  - Selected AMC (SBI Mutual Fund) details.
  - Known limitations and the mandatory disclaimer notice.

### Deliverables
- Test script `scripts/test_compliance.js`
- File [README.md](file:///C:/Users/91910/Downloads/NextLeap%20projects/MutualFundFAQRAG/README.md)
