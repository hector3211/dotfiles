import { constants, promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

/** Storage files are data, never aliases to other user files. */
export async function safePath(root: string, relative: string) {
  if (path.isAbsolute(relative) || relative.split(/[\\/]/).some(part => part === '..')) throw new Error('Record path escapes its root');
  const rootStat = await fs.lstat(root);
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) throw new Error('Record root must be a regular directory');
  const canonical = await fs.realpath(root);
  let current = canonical;
  for (const part of relative.split(/[\\/]/).filter(Boolean)) {
    current = path.join(current, part);
    const stat = await fs.lstat(current).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; return null; });
    if (stat?.isSymbolicLink()) throw new Error('Symlinked record files and directories are not allowed');
  }
  if (!current.startsWith(canonical + path.sep)) throw new Error('Record path escapes its root');
  return current;
}
export async function safeRead(root: string, relative: string, maxBytes = 2_000_000) {
  const file = await safePath(root, relative);
  const expected = await fs.lstat(file);
  if (!expected.isFile() || expected.size > maxBytes) throw new Error('Record is not a bounded regular file');
  const handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW || 0) | (constants.O_NONBLOCK || 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes || stat.dev !== expected.dev || stat.ino !== expected.ino) throw new Error('Record is not a bounded regular file');
    const buffer = Buffer.alloc(Math.min(maxBytes + 1, stat.size + 1));
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > maxBytes) throw new Error('Record file is too large');
    return buffer.subarray(0, offset).toString('utf8');
  } finally { await handle.close(); }
}
export async function safeWrite(root: string, relative: string, content: string) {
  let file = await safePath(root, relative);
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  file = await safePath(root, relative);
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temporary, 'wx', 0o600);
  try { await handle.writeFile(content); await handle.sync(); } finally { await handle.close(); }
  try { await safePath(root, relative); await fs.rename(temporary, file); }
  catch (error) { await fs.rm(temporary, { force: true }); throw error; }
}
export async function safeAppend(root: string, relative: string, content: string) {
  const previous = await safeRead(root, relative, 10_000_000).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; return ''; });
  await safeWrite(root, relative, previous + content);
}
