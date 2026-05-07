import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dest = join(root, 'public', 'tesseract');

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function copyFiles(srcDir, destDir, predicate = () => true) {
  if (!existsSync(srcDir)) { console.warn('  not found: ' + srcDir); return 0; }
  ensureDir(destDir);
  const files = readdirSync(srcDir).filter(predicate);
  files.forEach((f) => copyFileSync(join(srcDir, f), join(destDir, f)));
  return files.length;
}

ensureDir(dest);

const workerSrc = join(root, 'node_modules', 'tesseract.js', 'dist', 'worker.min.js');
if (existsSync(workerSrc)) { copyFileSync(workerSrc, join(dest, 'worker.min.js')); console.log('  ok worker.min.js'); }

const coreCount = copyFiles(join(root, 'node_modules', 'tesseract.js-core'), join(dest, 'core'), (f) => f.endsWith('.js') || f.endsWith('.wasm'));
console.log('  ok core (' + coreCount + ' files)');

const langCount = copyFiles(join(root, 'node_modules', '@tesseract.js-data', 'eng', '4.0.0'), join(dest, 'langs'), (f) => f.endsWith('.traineddata') || f.endsWith('.traineddata.gz'));
console.log('  ok langs (' + langCount + ' files)');

console.log('Tesseract assets ready.');

// Copy PDF.js worker
const pdfjsDest = join(root, 'public', 'pdfjs');
ensureDir(pdfjsDest);
const pdfWorkerSrc = join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.mjs');
if (existsSync(pdfWorkerSrc)) {
  copyFileSync(pdfWorkerSrc, join(pdfjsDest, 'pdf.worker.min.mjs'));
  console.log('PDF.js worker ready.');
} else {
  console.warn('PDF.js worker not found at ' + pdfWorkerSrc);
}
