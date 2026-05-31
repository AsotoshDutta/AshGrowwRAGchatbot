import os
import json
import re
import math
import urllib.request
from flask import Flask, request, jsonify
import google.generativeai as genai

app = Flask(__name__)

# Path to the static index compiled during build
INDEX_PATH = os.path.join(os.path.dirname(__file__), '../src/data/index.json')

URL_WHITELIST = [
    "https://www.sbimf.com/en-us/quick-links/investor-education",
    "https://www.sbimf.com/en-us/quick-links/tax-calculator",
    "https://www.sbimf.com/en-us/equity-schemes/sbi-bluechip-fund",
    "https://www.sbimf.com/en-us/equity-schemes/sbi-small-cap-fund",
    "https://www.sbimf.com/en-us/equity-schemes/sbi-focused-equity-fund",
    "https://www.sbimf.com/en-us/equity-schemes/sbi-contra-fund",
    "https://www.sbimf.com/en-us/equity-schemes/sbi-long-term-equity-fund",
    "https://www.sbimf.com/downloads/factsheets/Latest_Factsheet.pdf",
    "https://www.sbimf.com/downloads/kim/SBI-Bluechip-Fund-KIM.pdf",
    "https://www.sbimf.com/downloads/kim/SBI-Small-Cap-Fund-KIM.pdf",
    "https://www.sbimf.com/downloads/sid/SBI-Bluechip-Fund-SID.pdf",
    "https://www.sbimf.com/downloads/sid/SBI-Small-Cap-Fund-SID.pdf",
    "https://www.sebi.gov.in/sebi_data/faqfiles/jan-2021/1611728286280.pdf",
    "https://www.amfiindia.com/investor-corner/knowledge-center/what-are-mutual-funds-categories",
    "https://www.amfiindia.com/investor-corner/knowledge-center/expense-ratio.html",
    "https://www.amfiindia.com/investor-corner/knowledge-center/exit-load.html",
    "https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=36"
]

# PII regex patterns
PAN_PATTERN = re.compile(r'[A-Za-z]{5}[0-9]{4}[A-Za-z]{1}')
AADHAAR_PATTERN = re.compile(r'[2-9]{1}[0-9]{3}\s?[0-9]{4}\s?[0-9]{4}')

def detect_pii(text):
    if PAN_PATTERN.search(text):
        return {"contains_pii": True, "type": "PAN Card"}
    if AADHAAR_PATTERN.search(text):
        return {"contains_pii": True, "type": "Aadhaar Card"}
    return {"contains_pii": False, "type": None}

def sanitize_input(text):
    text = PAN_PATTERN.sub('[REDACTED PAN]', text)
    text = AADHAAR_PATTERN.sub('[REDACTED AADHAAR]', text)
    return text

def dot_product(v1, v2):
    return sum(x * y for x, y in zip(v1, v2))

def magnitude(v):
    return math.sqrt(sum(x * x for x in v))

def cosine_similarity(v1, v2):
    m1 = magnitude(v1)
    m2 = magnitude(v2)
    if not m1 or not m2:
        return 0.0
    return dot_product(v1, v2) / (m1 * m2)

def retrieve_chunks(query_embedding, chunks, limit=3):
    scored_chunks = []
    for chunk in chunks:
        sim = cosine_similarity(query_embedding, chunk['embedding'])
        scored_chunks.append((sim, chunk))
    scored_chunks.sort(key=lambda x: x[0], reverse=True)
    return [chunk for sim, chunk in scored_chunks[:limit]]

def count_sentences(text):
    if not text:
        return 0
    sentences = re.findall(r'[^.!?]+[.!?]+(?:\s|$)', text)
    return len(sentences) if sentences else 1

def truncate_to_three_sentences(text):
    if not text:
        return ''
    sentences = re.findall(r'[^.!?]+[.!?]+(?:\s|$)', text)
    if not sentences:
        return text
    if len(sentences) <= 3:
        return text
    return ''.join(sentences[:3]).strip()

# Chat route
@app.route('/api/chat', methods=['POST'])
@app.route('/', methods=['POST'])
def chat():
    # Load request body
    data = request.get_json(silent=True) or {}
    query = data.get('query', '')
    if not query or not isinstance(query, str) or not query.strip():
        return jsonify({"error": "Missing query parameter in request body."}), 400

    clean_query = query.strip()

    # 1. PII Security Check
    pii_check = detect_pii(clean_query)
    if pii_check["contains_pii"]:
        return jsonify({
            "answer": f"For security and privacy reasons, please do not share personal details like {pii_check['type']}s. I can only process factual inquiries regarding SBI Mutual Fund schemes.",
            "citationUrl": "https://www.amfiindia.com/investor-corner/knowledge-center/what-are-mutual-funds-categories",
            "lastUpdated": "May 2026",
            "isRefusal": True
        }), 200

    api_key = os.environ.get('GEMINI_API_KEY')
    if not api_key:
        return jsonify({"error": "GEMINI_API_KEY environment variable is missing."}), 500

    # Configure Gemini
    genai.configure(api_key=api_key)

    # 2. Query Embedding Generation
    try:
        embed_result = genai.embed_content(
            model="models/gemini-embedding-001",
            content=clean_query
        )
        query_embedding = embed_result['embedding']
    except Exception as e:
        print(f"Error fetching embedding: {e}")
        return jsonify({"error": f"Failed to generate query embedding: {str(e)}"}), 500

    # 3. Similarity Search & Context Assembly
    if not os.path.exists(INDEX_PATH):
        return jsonify({"error": "RAG index not found. Ingestion must be run."}), 500

    with open(INDEX_PATH, 'r', encoding='utf-8') as f:
        index_data = json.load(f)

    context_chunks = retrieve_chunks(query_embedding, index_data, 3)

    context_strings = []
    for i, chunk in enumerate(context_chunks):
        context_strings.append(f"""
[Source #{i+1}]
Source URL: {chunk['url']}
Last Updated: {chunk['lastUpdatedDate']}
Document: {chunk['title']}
Content: {chunk['text']}
""")
    context_string = "\n".join(context_strings)

    # 4. RAG Prompt
    rag_prompt = f"""
You are a strict, compliant Mutual Fund FAQ Assistant for SBI Mutual Fund.
First, analyze the User Query: "{clean_query}"

Verify if the query asks for investment advice, recommendations, subjective evaluations, or qualitative opinions (e.g. "should I invest", "which fund is better", "give me a recommendation").
- If the query is ADVISORY/Advisory, refuse it directly and output exactly this JSON response format:
{{
  "answer": "I am a facts-only assistant and do not provide investment advice, qualitative opinions, or scheme recommendations. For personalized investment decisions, please consult a SEBI Registered Investment Advisor (RIA).",
  "citationUrl": "https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=36",
  "lastUpdated": "May 2026",
  "isRefusal": true
}}

- Otherwise, if the query is FACTUAL, answer it using EXCLUSIVELY the provided Context Records:
{context_string}

Follow these rules for factual answers:
1. Answer the query using ONLY the factual data present in the context. Do not make assumptions or use external knowledge.
2. If the context does not contain the exact factual answer, say "I do not have the verified factual records to answer this query. Please check the official SBI Mutual Fund website."
3. Do not offer recommendations, advice, or qualitative evaluations.
4. Limit the answer to a maximum of 3 sentences.
5. Select EXACTLY ONE citation URL from the Source URLs provided in the context that best matches the answer.
6. Format your output as a valid, JSON object. Do not wrap in markdown code blocks. The schema is:
{{
  "answer": "Factual answer text.",
  "citationUrl": "https://...",
  "lastUpdated": "Month Year",
  "isRefusal": false
}}
"""

    # Call LLM Model
    try:
        model = genai.GenerativeModel('gemini-3.5-flash')
        response = model.generate_content(rag_prompt)
        response_text = response.text.strip()
    except Exception as e:
        print(f"Error calling Gemini model: {e}")
        return jsonify({"error": f"Failed to call text model: {str(e)}"}), 500

    # Clean markdown code block markers
    if response_text.startswith('```json'):
        response_text = response_text[7:].rstrip('`').strip()
    elif response_text.startswith('```'):
        response_text = response_text[3:].rstrip('`').strip()

    try:
        result_obj = json.loads(response_text)
    except Exception as e:
        print(f"Failed to parse LLM JSON: {response_text}, error: {e}")
        result_obj = {
            "answer": truncate_to_three_sentences(response_text),
            "citationUrl": context_chunks[0]['url'] if context_chunks else "https://www.sbimf.com",
            "lastUpdated": context_chunks[0]['lastUpdatedDate'] if context_chunks else "May 2026",
            "isRefusal": False
        }

    # 5. Output Validation
    if count_sentences(result_obj.get("answer", "")) > 3:
        result_obj["answer"] = truncate_to_three_sentences(result_obj.get("answer", ""))

    citation_url = result_obj.get("citationUrl", "")
    if citation_url not in URL_WHITELIST:
        result_obj["citationUrl"] = context_chunks[0]['url'] if context_chunks else "https://www.sbimf.com"

    result_obj["answer"] = sanitize_input(result_obj.get("answer", ""))

    return jsonify({
        "answer": result_obj.get("answer", ""),
        "citationUrl": result_obj.get("citationUrl", ""),
        "lastUpdated": result_obj.get("lastUpdated", "May 2026"),
        "isRefusal": result_obj.get("isRefusal", False)
    }), 200

# Cron-ingest route
@app.route('/api/cron-ingest', methods=['GET', 'POST'])
def cron_ingest():
    auth_header = request.headers.get('Authorization', '')
    cron_secret = os.environ.get('CRON_SECRET')

    if cron_secret and auth_header != f"Bearer {cron_secret}":
        return jsonify({"error": "Unauthorized. Invalid Cron Secret."}), 401

    deploy_hook_url = os.environ.get('VERCEL_DEPLOY_HOOK_URL')
    if not deploy_hook_url:
        print("[CRON] VERCEL_DEPLOY_HOOK_URL environment variable is missing.")
        return jsonify({"error": "VERCEL_DEPLOY_HOOK_URL environment variable is not configured."}), 500

    try:
        print("[CRON] Triggering rebuild via Vercel Deploy Hook...")
        req = urllib.request.Request(deploy_hook_url, method='POST')
        with urllib.request.urlopen(req) as response:
            res_data = response.read().decode('utf-8')
            data = json.loads(res_data)
            print(f"[CRON] Deploy Hook triggered successfully. Job ID: {data.get('job', {}).get('id')}")
            return jsonify({
                "success": True,
                "message": "Daily rebuild and ingest pipeline triggered successfully.",
                "jobId": data.get('job', {}).get('id')
            }), 200
    except Exception as e:
        print(f"[CRON] Error triggering Deploy Hook: {e}")
        return jsonify({
            "error": "Failed to trigger Vercel Deploy Hook rebuild.",
            "details": str(e)
        }), 500

@app.route('/', methods=['GET'])
@app.route('/index.html', methods=['GET'])
def index():
    html_path = os.path.join(os.path.dirname(__file__), 'index.html')
    if os.path.exists(html_path):
        with open(html_path, 'r', encoding='utf-8') as f:
            return f.read(), 200, {'Content-Type': 'text/html; charset=utf-8'}
    return "Frontend index.html not found.", 404

if __name__ == '__main__':
    app.run(port=3000)
