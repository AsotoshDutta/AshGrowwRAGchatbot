import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import { detectPII, sanitizeInput } from './lib/safety.js';
import { retrieveChunks } from './lib/retriever.js';

// Load env variables (for local dev)
dotenv.config();

// Whitelist of valid source URLs from urls.json
const URL_WHITELIST = [
  "https://www.sbimf.com/en-us/quick-links/investor-education",
  "https://www.sbimf.com/en-us/quick-links/tax-calculator",
  "https://www.sbimf.com/en-us/equity-schemes/sbi-bluechip-fund",
  "https://www.sbimf.com/en-us/equity-schemes/sbi-small-cap-fund",
  "https://www.sbimf.com/en-us/equity-schemes/sbi-focused-equity-fund",
  "https://www.sbimf.com/en-us/equity-schemes/sbi-contra-fund",
  "https://www.sbimf.com/en-us/equity-schemes/sbi-long-term-equity-fund",
  "https://www.sbimf.com/en-us/debt-schemes/sbi-magnum-constant-maturity-fund",
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
];

function countSentences(text) {
  if (!text) return 0;
  // Simple regex to split sentences by (. ! ?) followed by space or end of string
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text];
  return sentences.filter(s => s.trim().length > 0).length;
}

function truncateToThreeSentences(text) {
  if (!text) return '';
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text];
  const validSentences = sentences.filter(s => s.trim().length > 0);
  if (validSentences.length <= 3) {
    return text;
  }
  return validSentences.slice(0, 3).join('').trim();
}

export default async function handler(req, res) {
  // Enforce POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const { query } = req.body;
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({ error: 'Missing query parameter in request body.' });
    }

    const cleanQuery = query.trim();

    // 1. PII Security Check
    const piiCheck = detectPII(cleanQuery);
    if (piiCheck.containsPII) {
      return res.status(200).json({
        answer: `For security and privacy reasons, please do not share personal details like ${piiCheck.type}s. I can only process factual inquiries regarding SBI Mutual Fund schemes.`,
        citationUrl: "https://www.amfiindia.com/investor-corner/knowledge-center/what-are-mutual-funds-categories",
        lastUpdated: "May 2026",
        isRefusal: true
      });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is missing.' });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const textModel = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

    // 2. Retrieval Phase (Retrieve chunks first to use as context for decision making)
    let contextChunks = [];
    try {
      contextChunks = await retrieveChunks(cleanQuery, apiKey, 3);
    } catch (err) {
      console.error('[CHAT] Retrieval error:', err.message);
      return res.status(500).json({ error: 'Failed to retrieve relevant documents.' });
    }

    // Assemble Context
    const contextString = contextChunks.map((chunk, i) => `
[Source #${i+1}]
Source URL: ${chunk.url}
Last Updated: ${chunk.lastUpdatedDate}
Document: ${chunk.title}
Content: ${chunk.text}
`).join('\n');

    // 3. Unified Generation & Intent Classifier Phase (Single LLM Call)
    const ragPrompt = `
You are a strict, compliant Mutual Fund FAQ Assistant for SBI Mutual Fund.
First, analyze the User Query: "${cleanQuery}"

Verify if the query asks for investment advice, recommendations, subjective evaluations, or qualitative opinions (e.g. "should I invest", "which fund is better", "give me a recommendation").
- If the query is ADVISORY/Advisory, refuse it directly and output exactly this JSON response format:
{
  "answer": "I am a facts-only assistant and do not provide investment advice, qualitative opinions, or scheme recommendations. For personalized investment decisions, please consult a SEBI Registered Investment Advisor (RIA).",
  "citationUrl": "https://www.sebi.gov.in/sebiweb/other/OtherAction.do?doRecognisedFpi=yes&intmId=36",
  "lastUpdated": "May 2026",
  "isRefusal": true
}

- Otherwise, if the query is FACTUAL, answer it using EXCLUSIVELY the provided Context Records:
${contextString}

Follow these rules for factual answers:
1. Answer the query using ONLY the factual data present in the context. Do not make assumptions or use external knowledge.
2. If the context does not contain the exact factual answer, say "I do not have the verified factual records to answer this query. Please check the official SBI Mutual Fund website."
3. Do not offer recommendations, advice, or qualitative evaluations.
4. Limit the answer to a maximum of 3 sentences.
5. Select EXACTLY ONE citation URL from the Source URLs provided in the context that best matches the answer.
6. Format your output as a valid, JSON object. Do not wrap in markdown code blocks. The schema is:
{
  "answer": "Factual answer text.",
  "citationUrl": "https://...",
  "lastUpdated": "Month Year",
  "isRefusal": false
}
`;

    const generationResult = await textModel.generateContent(ragPrompt);
    let responseText = generationResult.response.text().trim();

    // Clean potential markdown wrappers if the LLM ignored instruction
    if (responseText.startsWith('```json')) {
      responseText = responseText.replace(/^```json/, '').replace(/```$/, '').trim();
    } else if (responseText.startsWith('```')) {
      responseText = responseText.replace(/^```/, '').replace(/```$/, '').trim();
    }

    let resultObj;
    try {
      resultObj = JSON.parse(responseText);
    } catch (e) {
      console.warn('[CHAT] LLM did not return valid JSON. Response:', responseText);
      // Fallback parser if JSON fails
      resultObj = {
        answer: truncateToThreeSentences(responseText),
        citationUrl: contextChunks[0]?.url || "https://www.sbimf.com",
        lastUpdated: contextChunks[0]?.lastUpdatedDate || "May 2026",
        isRefusal: false
      };
    }

    // 4. Post-Generation Output Validation & Sanitization
    
    // Enforce 3 sentences maximum
    if (countSentences(resultObj.answer) > 3) {
      resultObj.answer = truncateToThreeSentences(resultObj.answer);
    }

    // Ensure citation link belongs to the whitelist
    if (!resultObj.citationUrl || !URL_WHITELIST.includes(resultObj.citationUrl)) {
      console.warn('[CHAT] Invalid or hallucinated URL:', resultObj.citationUrl);
      // Fallback to the retrieved chunk's URL
      resultObj.citationUrl = contextChunks[0] ? contextChunks[0].url : "https://www.sbimf.com";
    }

    // Clean up any remaining PII in the generated response (defense in depth)
    resultObj.answer = sanitizeInput(resultObj.answer);

    return res.status(200).json({
      answer: resultObj.answer,
      citationUrl: resultObj.citationUrl,
      lastUpdated: resultObj.lastUpdated || contextChunks[0]?.lastUpdatedDate || "May 2026",
      isRefusal: resultObj.isRefusal === true
    });

  } catch (error) {
    console.error('[CHAT] Global request error:', error);
    return res.status(500).json({ error: 'Internal Server Error.' });
  }
}
