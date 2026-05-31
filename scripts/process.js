import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pdfParse from 'pdf-parse';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Directories
const pdfDir = path.join(__dirname, '../data/pdf');
const webDir = path.join(__dirname, '../data/web');
const outputPath = path.join(__dirname, '../data/corpus_raw.json');

// Load URLs config to map files back to URLs and metadata
const urlsPath = path.join(__dirname, 'urls.json');
const urls = JSON.parse(fs.readFileSync(urlsPath, 'utf8'));

// Helper to clean extracted text
function cleanText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, '\n')
    .replace(/\s+/g, ' ')
    .trim();
}

async function parsePdf(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const data = await pdfParse(dataBuffer);
  return data.text;
}

function parseHtml(htmlContent) {
  const $ = cheerio.load(htmlContent);
  // Remove scripts, styles, navigations, and footers to keep only text content
  $('script, style, nav, footer, header, noscript, iframe').remove();
  
  // Extract text from the main body or content area
  const mainText = $('main, article, #content, .content, body').text();
  return mainText || $.text();
}

async function processFile(item) {
  const filename = `${item.category}_${item.id}.${item.type}`;
  const isPdf = item.type === 'pdf';
  const dir = isPdf ? pdfDir : webDir;
  
  let filePath = path.join(dir, filename);
  let text = '';
  
  console.log(`[PROCESS] Processing ${filename} (${item.title})...`);

  // Check if PDF download failed and fallback TXT exists
  if (isPdf && !fs.existsSync(filePath)) {
    const txtFallbackPath = filePath.replace('.pdf', '.txt');
    if (fs.existsSync(txtFallbackPath)) {
      console.log(`[PROCESS] PDF not found. Using fallback text file: ${path.basename(txtFallbackPath)}`);
      text = fs.readFileSync(txtFallbackPath, 'utf8');
    } else {
      console.warn(`[PROCESS] File not found: ${filename}`);
      return null;
    }
  } else if (!fs.existsSync(filePath)) {
    console.warn(`[PROCESS] File not found: ${filename}`);
    return null;
  } else {
    // Normal file parsing
    if (isPdf) {
      try {
        text = await parsePdf(filePath);
      } catch (err) {
        console.error(`[PROCESS] Error parsing PDF ${filename}: ${err.message}. Trying fallback TXT.`);
        const txtFallbackPath = filePath.replace('.pdf', '.txt');
        if (fs.existsSync(txtFallbackPath)) {
          text = fs.readFileSync(txtFallbackPath, 'utf8');
        } else {
          throw err;
        }
      }
    } else {
      const htmlContent = fs.readFileSync(filePath, 'utf8');
      text = parseHtml(htmlContent);
    }
  }

  const cleanedText = cleanText(text);

  // Determine last updated date
  let lastUpdatedDate = 'May 2026';
  if (item.id === 14) {
    lastUpdatedDate = 'January 2021'; // SEBI Categorization Guidelines
  }

  return {
    id: item.id,
    url: item.url,
    category: item.category,
    title: item.title,
    lastUpdatedDate,
    content: cleanedText
  };
}

async function run() {
  console.log('[PROCESS] Starting text extraction and parsing...');
  const corpus = [];

  for (const item of urls) {
    const doc = await processFile(item);
    if (doc) {
      corpus.push(doc);
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(corpus, null, 2), 'utf8');
  console.log(`[PROCESS] Processed ${corpus.length} documents. Saved corpus to: ${outputPath}`);
}

run();
