import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env
dotenv.config();

const corpusPath = path.join(__dirname, '../data/corpus_raw.json');
const outputPath = path.join(__dirname, '../src/data/index.json');

// Ensure output directory exists
fs.mkdirSync(path.dirname(outputPath), { recursive: true });

if (!fs.existsSync(corpusPath)) {
  console.error('[INDEX] Raw corpus file not found! Please run Phase 2 first.');
  process.exit(1);
}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey || apiKey.includes('your_gemini_api_key_here')) {
  console.error('[INDEX] ERROR: GEMINI_API_KEY is not set in the environment variables.');
  console.error('[INDEX] Please set your API key in a .env file at the root directory.');
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(apiKey);
const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });

// Simple sentence-based chunking with size target
function chunkText(text, targetSize = 500, overlap = 100) {
  // Split by sentences, keeping punctuation
  const sentences = text.match(/[^.!?]+[.!?]+(\s|$)/g) || [text];
  const chunks = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    const candidate = currentChunk ? currentChunk + ' ' + sentence : sentence;
    if (candidate.length > targetSize) {
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      // Start next chunk. If the current sentence itself is longer than targetSize, split it.
      if (sentence.length > targetSize) {
        // Just push long sentence directly
        chunks.push(sentence.trim());
        currentChunk = '';
      } else {
        // Take overlap from previous chunk if possible
        const lastWords = currentChunk.split(' ');
        const overlapText = lastWords.slice(-5).join(' ');
        currentChunk = overlapText + ' ' + sentence;
      }
    } else {
      currentChunk = candidate;
    }
  }

  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // Double check and split any excessively large chunks by characters
  const finalChunks = [];
  for (const c of chunks) {
    if (c.length > targetSize * 1.5) {
      let start = 0;
      while (start < c.length) {
        finalChunks.push(c.substring(start, start + targetSize));
        start += (targetSize - overlap);
      }
    } else {
      finalChunks.push(c);
    }
  }

  return finalChunks;
}

// Helper to delay between API requests to prevent rate limiting
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const rawCorpus = JSON.parse(fs.readFileSync(corpusPath, 'utf8'));
  console.log(`[INDEX] Loaded ${rawCorpus.length} raw documents for chunking...`);

  const indexData = [];

  for (const doc of rawCorpus) {
    const chunks = chunkText(doc.content, 500, 100);
    console.log(`[INDEX] Split "${doc.title}" into ${chunks.length} chunks.`);

    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      
      let attempts = 0;
      let embedding = null;

      while (attempts < 3) {
        try {
          const result = await embeddingModel.embedContent(chunkText);
          embedding = result.embedding.values;
          break;
        } catch (err) {
          attempts++;
          console.warn(`[INDEX] Embedding failed for chunk ${i+1}/${chunks.length} of document ${doc.id} (Attempt ${attempts}): ${err.message}`);
          await delay(2000 * attempts);
        }
      }

      if (!embedding) {
        console.error(`[INDEX] Critical failure: Could not generate embedding for chunk ${i+1} of doc ${doc.id}`);
        continue;
      }

      indexData.push({
        id: `${doc.id}_ch${i}`,
        docId: doc.id,
        title: doc.title,
        url: doc.url,
        category: doc.category,
        lastUpdatedDate: doc.lastUpdatedDate,
        text: chunkText,
        embedding: embedding
      });

      // Avoid hitting rate limits
      await delay(150);
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(indexData, null, 2), 'utf8');
  console.log(`[INDEX] Index generation complete! Successfully generated embeddings for ${indexData.length} chunks.`);
  console.log(`[INDEX] Static index database file saved to: ${outputPath}`);
}

run().catch((err) => {
  console.error('[INDEX] Indexing script encountered a fatal error:', err);
  process.exit(1);
});
