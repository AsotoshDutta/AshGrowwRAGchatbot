import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Determine directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// In Vercel serverless environment, files are in the repository root.
// We can try to find index.json in standard path, or fallback to root-relative paths.
function getIndexPath() {
  const localPath = path.join(__dirname, '../../src/data/index.json');
  if (fs.existsSync(localPath)) {
    return localPath;
  }
  // Vercel serverless layout
  const vercelPath = path.join(process.cwd(), 'src/data/index.json');
  if (fs.existsSync(vercelPath)) {
    return vercelPath;
  }
  // Fallback to relative to process.cwd()
  return path.join(process.cwd(), 'src/data/index.json');
}

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

/**
 * Retrieves the top matching chunks for a query from the static embedding index.
 * @param {string} queryText - User search query.
 * @param {string} apiKey - Gemini API Key.
 * @param {number} limit - Maximum number of chunks to return.
 * @returns {Promise<Array>} - Top retrieved chunks with similarity scores.
 */
export async function retrieveChunks(queryText, apiKey, limit = 3) {
  const genAI = new GoogleGenerativeAI(apiKey);
  const embeddingModel = genAI.getGenerativeModel({ model: 'gemini-embedding-001' });

  // 1. Get embedding for the query
  const res = await embeddingModel.embedContent(queryText);
  const queryVector = res.embedding.values;

  // 2. Load the pre-computed JSON index
  const indexPath = getIndexPath();
  if (!fs.existsSync(indexPath)) {
    throw new Error(`Vector index file not found at: ${indexPath}`);
  }
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

  // 3. Compute cosine similarity scores
  const scored = index.map(chunk => {
    const score = cosineSimilarity(queryVector, chunk.embedding);
    return {
      docId: chunk.docId,
      title: chunk.title,
      url: chunk.url,
      category: chunk.category,
      lastUpdatedDate: chunk.lastUpdatedDate,
      text: chunk.text,
      score: score
    };
  });

  // 4. Sort in descending order of score and return top results
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
