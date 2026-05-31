# Edge Cases & Mitigation Strategies: Mutual Fund FAQ Assistant

This document identifies potential edge cases that could arise across the ingestion, retrieval, safety filtering, generation, and user interface layers, along with technical mitigation strategies to address them.

---

## 1. Safety & Compliance Edge Cases

### 1.1 Intent Classification Failure (Advisory vs. Factual)
*   **Edge Case**: User inputs a hybrid query that contains a factual question mixed with an advisory request (e.g., *"What is the expense ratio of SBI Bluechip and is it a safe investment?"*).
*   **Risk**: The system might answer the factual portion while ignoring the advisory check, or generate a response containing subjective commentary.
*   **Mitigation**: The input classifier must classify the query as **advisory/non-factual** if *any* part of the query is subjective. We will instruct the classification LLM to adopt a pessimistic safety posture: if a query cannot be answered 100% facts-only, it must be flagged for refusal.

### 1.2 Multi-Scheme Comparison Queries
*   **Edge Case**: User asks: *"Which fund is better: SBI Small Cap or SBI Bluechip?"* or *"Compare SBI Contra Fund and SBI Focused Equity Fund."*
*   **Risk**: Performance comparison or subjective evaluation violates the "no investment advice" constraint.
*   **Mitigation**: Intercept comparison queries at the intent classifier. If the query asks for a subjective comparison ("which is better", "recommend one"), route it to refusal. If it asks for purely objective side-by-side metrics ("compare the exit loads of fund A and fund B"), the RAG prompt will only output raw metrics and append the factsheet links for both, without styling one as "better."

### 1.3 Obfuscated PII (Aadhaar/PAN)
*   **Edge Case**: User inputs sensitive details using unconventional spacing, casing, or masking characters (e.g., `P-A-N: ABCDE 1234 F` or Aadhaar written as `1234-5678-9012` or `1234 5678 9012`).
*   **Risk**: Strict regex checks might fail to match, leading to PII leaking to the LLM backend.
*   **Mitigation**: Implement a normalizer that strips common non-alphanumeric separators (spaces, hyphens, colons) before running regex patterns. Add general heuristics that flag any sequence of 10 characters matching PAN letter-number patterns, or 12 digits matching Aadhaar.

### 1.4 PII False Positives
*   **Edge Case**: A query containing scheme numbers, transaction IDs, or other numeric data (e.g., `"Query ID: 8876 2931 9283"`) is incorrectly flagged as an Aadhaar number and rejected.
*   **Risk**: Degraded user experience where valid factual questions are blocked.
*   **Mitigation**: The regex pattern for Aadhaar must follow the official Verhoeven algorithm check to validate that the 12-digit number is mathematically valid before flagging it as PII.

---

## 2. Ingestion & Retrieval Edge Cases

### 2.1 PDF Tabular Data Corruption
*   **Edge Case**: Factsheets store exit loads and expense ratios in multi-column tables. During text extraction from PDFs, columns might get interleaved, leading to incorrect factual associations (e.g., attributing SBI Small Cap's expense ratio to SBI Bluechip).
*   **Risk**: LLM retrieves incorrect numbers, generating factually wrong answers.
*   **Mitigation**: Use structure-aware PDF parsers (like `pdfplumber` or table-extraction utilities) instead of simple text extraction for sheets with dense tables. Validate critical metrics (expense ratios, exit loads) against a structured, manually verified JSON schema configuration.

### 2.2 Outdated Facts (Temporal Drift)
*   **Edge Case**: A scheme's expense ratio or fund manager changes, but the system continues to serve retrieved chunks from an outdated factsheet.
*   **Risk**: The system reports stale, inaccurate data.
*   **Mitigation**: The system's response footer must output the *exact* date from the source document (`Last updated from sources: <date>`). Additionally, the ingestion pipeline should compare document hashes weekly and automatically rebuild the vector DB index when new monthly factsheets are uploaded.

### 2.3 Semantic Overlap & Query Collision
*   **Edge Case**: User asks: *"What is the exit load of the Magnum fund?"* where multiple Magnum funds exist (e.g., *SBI Magnum Constant Maturity Fund* vs *SBI Magnum Midcap Fund*).
*   **Risk**: The vector store returns chunks for the wrong scheme, or the LLM answers for a random Magnum fund.
*   **Mitigation**: If a query is ambiguous, the system must trigger a request for clarification (e.g., *"Please specify which Magnum fund you are referring to: SBI Magnum Constant Maturity Fund or others"*), rather than guessing the scheme.

---

## 3. Generation & Formatting Edge Cases

### 3.1 Run-On Sentence Bypass (Sentence Count Constraint)
*   **Edge Case**: To bypass the 3-sentence constraint, the LLM generates 3 very long sentences loaded with semicolons, conjunctions, and bullet points.
*   **Risk**: Lengthy, dense answers that look unprofessional and dilute the "concise facts-only" criteria.
*   **Mitigation**: The post-generation output validator will verify that the character length does not exceed 350 characters and that the response contains no bullet-pointed structures.

### 3.2 Citation Link Hallucination
*   **Edge Case**: The LLM generates a response citing a plausible-looking but non-existent URL or a third-party link (e.g., `https://www.groww.in/...` or `https://www.moneycontrol.com/...`).
*   **Risk**: Violates the constraint to use *only* official sources (SBI AMC, SEBI, AMFI).
*   **Mitigation**: Implement a strict whitelist check in the output validator. The generated URL must match exactly one of the 18 validated URLs in our index metadata. If the URL does not match, the response is discarded, and the system falls back to a default refusal/out-of-scope response.

### 3.3 Silent Retrieval Failures (Hallucination on Missing Context)
*   **Edge Case**: User asks a factual query about a scheme or regulatory rule not covered by the 18-document corpus (e.g., *"What is the expense ratio of SBI Infrastructure Fund?"*).
*   **Risk**: The vector store returns weak/unrelated matches, and the LLM attempts to fabricate or guess the answer.
*   **Mitigation**: Instruct the model via the system prompt: *"If the provided context does not contain the answer, you must state: 'I do not have the verified factual records to answer this query. Please refer to the official SBI Mutual Fund Portal at https://www.sbimf.com for more details.'"*

---

## 4. User Interface & Session Edge Cases

### 4.1 Cross-Site Scripting (XSS)
*   **Edge Case**: User inputs a query containing HTML or Javascript tags (e.g., `<script>alert('hack')</script>`).
*   **Risk**: The frontend renders the chat logs directly, leading to code execution.
*   **Mitigation**: Sanitize all chat inputs and outputs before rendering them to the DOM using text node assignments (`textContent`) instead of rendering raw HTML (`innerHTML`).

### 4.2 Conversational Loop Lock
*   **Edge Case**: User tries to hold a general conversation with the bot (e.g., *"Hello"*, *"How are you?"*, *"Tell me a joke"*).
*   **Risk**: RAG engine gets confused or tries to find matches in the mutual fund corpus.
*   **Mitigation**: Maintain a small list of basic conversational intents (greetings) and handle them deterministically (e.g., greeting the user and offering the example questions) without invoking the RAG/LLM pipeline.
