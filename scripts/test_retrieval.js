import fs from 'fs';
import path from 'url';
import fileSystem from 'fs';
import filePathModule from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = filePathModule.dirname(__filename);

// Load env variables
dotenv.config();

const indexPath = filePathModule.join(__dirname, '../src/data/index.json');

if (!fileSystem.existsSync(indexPath)) {
  console.error('[TEST_RETRIEVAL] Index file not found! Please run the indexer first.');
  process.exit(1);
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey || apiKey.includes('your_gemini_api_key_here')) {
  console.error('[TEST_RETRIEVAL] GEMINI_API_KEY is not set. Please set it in a .env file.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function search(queryText, limit = 3) {
  console.log(`\n[TEST_RETRIEVAL] User Query: "${queryText}"`);
  
  // 1. Get embedding for the query
  const res = await embeddingModel.embedContent(queryText);
  const queryVector = res.embedding.values;

  // 2. Load the index
  const index = JSON.parse(fileSystem.readFileSync(indexPath, 'utf8'));

  // 3. Compute similarities
  const scored = index.map(chunk => {
    const score = cosineSimilarity(queryVector, chunk.embedding);
    return { ...chunk, score };
  });

  // 4. Sort and return top results
  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, limit);

  console.log('[TEST_RETRIEVAL] Top Results:');
  results.forEach((res, i) => {
    console.log(`\n--- Result #${i + 1} (Score: ${res.score.toFixed(4)}) ---`);
    console.log(`Scheme/Doc: ${res.title}`);
    console.log(`Source URL: ${res.url}`);
    console.log(`Updated Date: ${res.lastUpdatedDate}`);
    console.log(`Text: ${res.text}`);
  });
}

async function run() {
  // Run a couple of sample queries to test the search
  await search("Who is the fund manager of SBI Bluechip Fund and what is their tenure?");
  await search("What is the exit load of the small cap fund?");
}

run().catch(err => {
  console.error('[TEST_RETRIEVAL] Error running search:', err);
});
