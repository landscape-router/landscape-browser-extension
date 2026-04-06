import { cp, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const outputDir = new URL('../.output/', import.meta.url);
const entries = await readdir(outputDir, { withFileTypes: true });

const firefoxZip = entries.find(
  (entry) => entry.isFile() && entry.name.endsWith('-firefox.zip'),
);

if (!firefoxZip) {
  throw new Error('Firefox zip artifact was not found in .output/.');
}

const sourcePath = new URL(firefoxZip.name, outputDir);
const targetPath = new URL(firefoxZip.name.replace(/\.zip$/, '.xpi'), outputDir);

await cp(sourcePath, targetPath);

console.log(`Created ${join('.output', firefoxZip.name.replace(/\.zip$/, '.xpi'))}`);
