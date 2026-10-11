import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// A running daemon captures this once; clients compare against the files on disk.
export async function sourceVersion() {
  const files = (await fs.readdir(import.meta.dirname)).filter(name => (name.endsWith('.ts') && !name.endsWith('.test.ts')) || name === 'package.json' || name === 'package-lock.json').sort();
  const hash = createHash('sha256');
  for (const name of files) hash.update(name).update(await fs.readFile(path.join(import.meta.dirname, name)));
  return hash.digest('hex');
}
