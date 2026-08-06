/**
 * Generates `public/animations/mixamo-walking-synthia.json` from the raw Mixamo
 * stream file at the repo root (`walking`).
 *
 * Run: npx ts-node --esm scripts/generateMixamoWalkArtifacts.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { convertWalkingStreamText } from '../src/utils/mixamoStreamConverter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const sourcePath = path.join(root, 'walking');
const outPath = path.join(root, 'public', 'animations', 'mixamo-walking-synthia.json');

const raw = fs.readFileSync(sourcePath, 'utf8');
const artifact = convertWalkingStreamText(raw, { loop: true, verbose: false });

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');

// eslint-disable-next-line no-console
console.log(
  `[generate-mixamo-walk] Wrote ${outPath}\n` +
  `  frames=${artifact.sequence.length} fps=${artifact.metadata.fps} ` +
  `forwardSpeed=${artifact.metadata.forwardSpeedMps} m/s`
);
