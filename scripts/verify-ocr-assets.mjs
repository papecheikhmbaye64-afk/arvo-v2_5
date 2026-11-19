// Vérifie l'intégrité des modèles PP-OCRv6 versionnés dans public/models/ppocrv6/ (SHA-256) avant `npm run dev` et `npm run build`.
// Le moteur WebAssembly d'onnxruntime-web n'a plus besoin d'être copié : Vite l'émet lui-même (voir src/lib/ocr.worker.js).
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'models', 'ppocrv6');
const MODELS = {
  'det_small.onnx': '090f04abcd9d9a7498bc4ebf677e4cb9bdce1fe4197ddb7e529f1ef44e1ff94f',
  'rec_small.onnx': '6f327246b50388f3c176ae304bd95767ea6dc0c9ae92153ef8cbe210b3c14884',
  'dict.txt': null
};
for (const [file, sha] of Object.entries(MODELS)) {
  const path = join(dir, file);
  if (!existsSync(path)) { console.error(`OCR : fichier manquant (${path}).`); process.exit(1); }
  if (sha && createHash('sha256').update(readFileSync(path)).digest('hex') !== sha) { console.error(`OCR : somme de contrôle invalide pour ${file}.`); process.exit(1); }
}
console.log('OCR : modèles PP-OCRv6 vérifiés.');
