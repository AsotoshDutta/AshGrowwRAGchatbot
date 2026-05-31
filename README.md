# Mutual Fund FAQ Assistant (Facts-Only Q&A)

> **Disclaimer**: Facts-only. No investment advice. This application answers objective factual queries regarding selected mutual fund schemes and does not provide financial planning, opinions, recommendations, or transaction services.

A lightweight, serverless-native **Retrieval-Augmented Generation (RAG)** chatbot tailored for Vercel free-tier hosting. The assistant responds to facts-only queries (expense ratios, exit loads, fund managers, lock-in periods, risk classifications, benchmarks, and statement guides) for **SBI Mutual Fund** schemes.

---

## 🚀 Key Features

*   **Vercel Serverless Ready**: Fully optimized for Vercel's 50MB Serverless Function package limit and memory restrictions.
*   **Zero-Cost In-Memory Vector Search**: Uses a static JSON database (`src/data/index.json`) loaded in-memory at runtime to compute cosine similarities, eliminating the need for expensive external database subscriptions.
*   **Strict Compliance Guardrails**:
    *   **Intent Classifier**: Automatically routes subjective or advisory requests (e.g., *"Which fund is better?"*) to polite refusal pages linking to the official SEBI RIA Directory.
    *   **Length Enforcement**: Deterministically trims responses to a maximum of 3 sentences.
    *   **Strict Citation Whitelisting**: Ensures every factual answer contains exactly one verifiable reference link to official AMC, SEBI, or AMFI documents.
*   **Privacy & Security Filters**: Offline regex filters immediately strip and block queries containing personal data (PAN, Aadhaar, phone numbers, email, or OTPs) before they are sent to the LLM backend.
*   **Groww-Inspired UI**: Beautiful, fully responsive web interface with a sleek dark/light theme, custom glassmorphism panels, query chips, typing animations, and auto-clearing sessions.

---

## 🛠️ Tech Stack

*   **Frontend**: HTML5, Vanilla CSS, Vanilla JavaScript (ESM).
*   **Backend**: Node.js Serverless Functions (`api/chat.js` for Vercel).
*   **LLM API**: Google Gemini (`gemini-3.5-flash` for generation & classification; `gemini-embedding-001` for text vectorization).
*   **Ingestion Utilities**: `pdf-parse` (for PDF Facts parsing), `cheerio` (for HTML parsing).

---

## 📂 Project Structure

```
├── api/
│   ├── lib/
│   │   ├── safety.js         # PII detection & sanitization filters
│   │   └── retriever.js      # Cosine similarity vector search
│   ├── chat.js               # Vercel Serverless entry point (POST /api/chat)
│   └── cron-ingest.js        # Vercel Cron trigger to rebuild the project
├── data/                     # Raw downloaded factsheets and HTML guides
├── public/                   # Client-side assets served by Vercel
│   ├── css/
│   │   └── style.css         # Glassmorphism dark/light design system
│   ├── js/
│   │   └── app.js            # Chat interactions & session wipes
│   └── index.html            # Core HTML workspace
├── scripts/                  # Offline ingestion and testing scripts
│   ├── download.js           # Scrapes official pages & saves fallback files
│   ├── process.js            # Parses raw text from PDF & HTML files
│   ├── build_index.js        # Generates embeddings and builds index.json
│   ├── test_retrieval.js     # Verifies retrieval accuracy locally
│   └── test_compliance.js    # Automated compliance and security test suite
├── src/
│   └── data/
│       └── index.json        # Compiled text chunks & vector embeddings
├── package.json              # Project dependencies & npm scripts
├── vercel.json               # Defines the daily 10:00 AM IST Cron job
└── .env                      # Local environment configurations (ignored)
```

---

## 📖 Curated AMC Corpus (SBI Mutual Fund)

The chatbot is indexing **18 official public URLs** covering the following schemes:
1.  **SBI Bluechip Fund** (Large Cap)
2.  **SBI Small Cap Fund** (Small Cap)
3.  **SBI Focused Equity Fund** (Focused)
4.  **SBI Contra Fund** (Contra Value)
5.  **SBI Long Term Equity Fund** (ELSS Tax Saving)
6.  **SBI Magnum Constant Maturity Fund** (Debt / Gilt)

For each scheme, the database indexes:
*   Total Expense Ratio (TER) (Regular and Direct Plans)
*   Exit load brackets and periods
*   Minimum SIP/lump sum investment bounds
*   Mandatory lock-in details (3-year ELSS lock-in)
*   Benchmark indexes & Riskometer classifications
*   Fund Manager names, experience, and fund tenure
*   Interactive guides on statement downloads & Capital Gains tax rates

---

## ⚡ Setup & Local Execution

### Prerequisites
*   Node.js (v18 or higher) installed.
*   A free Gemini API Key from [Google AI Studio](https://aistudio.google.com/).

### Installation

1.  **Clone or navigate to the workspace**:
    ```bash
    cd MutualFundFAQRAG
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Configure environment variables**:
    Create a `.env` file in the root directory and add your Gemini API key:
    ```env
    GEMINI_API_KEY=AIzaSy...your_actual_key_here
    ```

### Running the ETL Ingestion Pipeline (Offline)

1.  **Download Documents**:
    This script downloads raw webpages/PDFs from the 18 official URLs. It contains fallback parameters to write offline files if network blocks or 404s occur:
    ```bash
    node scripts/download.js
    ```

2.  **Extract and Clean Raw Text**:
    ```bash
    node scripts/process.js
    ```

3.  **Generate Embeddings & Compile JSON Index**:
    This chunks the cleaned text and makes requests to the Gemini `gemini-embedding-001` model to save `src/data/index.json`:
    ```bash
    node scripts/build_index.js
    ```

4.  **Verify Vector Search (Optional)**:
    Runs local query similarity lookups to check vector precision:
    ```bash
    node scripts/test_retrieval.js
    ```

### Launching the Dev Server

Run the Vercel Development CLI to spin up the local serverless functions and static frontend:
```bash
npx vercel dev
```
Open **`http://localhost:3000`** in your browser.

---

## ⚡ How to Deploy on Vercel

Since the project uses Vercel Serverless directory conventions (`public/` and `api/`), deploying is trivially simple:

1.  **Install the Vercel CLI**:
    ```bash
    npm install -g vercel
    ```
2.  **Deploy to Production**:
    ```bash
    vercel --prod
    ```
3.  **Configure Environment Variables**:
    In your Vercel Dashboard under **Settings > Environment Variables**, add:
    - `GEMINI_API_KEY`: Your Google Gemini API Key.
    - `VERCEL_DEPLOY_HOOK_URL`: (Optional) The Deploy Hook URL generated in the dashboard (see below).
    - `CRON_SECRET`: (Optional) Automatically provided by Vercel to secure cron calls.

---

## ⏰ Daily Scheduler (10:00 AM IST)

To automatically crawl, parse, and rebuild the static embedding index daily at **10:00 AM IST** (04:30 AM UTC) without keeping a server running, we use **Vercel Cron** paired with a **Deploy Hook**:

1.  **Create a Deploy Hook**:
    - Go to your project on the Vercel Dashboard.
    - Navigate to **Settings > Git** and scroll down to **Deploy Hooks**.
    - Create a hook named `daily-ingest` tied to your main production branch. Copy the generated URL.
2.  **Add Environment Variable**:
    - Add the copied URL to your Vercel project environment variables as `VERCEL_DEPLOY_HOOK_URL`.
3.  **Cron Job Execution**:
    - Vercel automatically reads the `vercel.json` file which schedules `/api/cron-ingest` to run daily at `04:30 UTC` (10:00 AM IST).
    - When triggered, `/api/cron-ingest` makes a request to the Deploy Hook, causing Vercel to rebuild and redeploy the site.
    - During the build phase, Vercel runs the `"build"` script (`npm run build` which runs our ingestion pipeline), fetching the latest facts, generating new embeddings, and deploying a fresh index.

---

## 🧪 Testing & QA Compliance

We've built an automated test runner (`scripts/test_compliance.js`) to validate all 5 system compliance criteria:

Run the compliance check suite:
```bash
node scripts/test_compliance.js
```

### Verified Test Cases:
1.  **Factual Query Check**: Validates details on manager names ("Sohini Andani"), tenure ("13+ years"), and exit loads ("1%").
2.  **Advisory Refusal Check**: Assures requests like *"Should I invest in..."* are blocked and redirected to the SEBI RIA advisor registry.
3.  **Sentence Length Check**: Validates that all answers contain a maximum of 3 sentences.
4.  **PII Privacy Check**: Ensures inputs containing dummy PAN or Aadhaar card formats are blocked offline and sanitized.
5.  **Citation Link Check**: Confirms that all citation links match the whitelisted AMFI/SEBI/AMC URLs.

---

## ⚠️ Known Limitations

1.  **Static Temporal Cache**: The system uses a static vector index. When the AMC uploads new monthly factsheets (e.g., updating expense ratios), `scripts/build_index.js` must be re-run to refresh `index.json`.
2.  **Limited Context Corpus**: It only answers queries for the 6 indexed schemes. Out-of-scope schemes trigger a polite refusal directing the user to the official AMC website.
