import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, '../public');
const apiDir = path.join(__dirname, '../api');

const htmlPath = path.join(publicDir, 'index.html');
const cssPath = path.join(publicDir, 'css/style.css');
const jsPath = path.join(publicDir, 'js/app.js');
const outputPath = path.join(apiDir, 'index.html');

let html = fs.readFileSync(htmlPath, 'utf8');
const css = fs.readFileSync(cssPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

// Replace stylesheet link
html = html.replace('<link rel="stylesheet" href="css/style.css">', `<style>\n${css}\n</style>`);

// Replace script src link
html = html.replace('<script src="js/app.js"></script>', `<script>\n${js}\n</script>`);

fs.writeFileSync(outputPath, html, 'utf8');
console.log('[MERGE] Successfully compiled self-contained frontend to api/index.html');
