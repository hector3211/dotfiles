#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const source = path.join(repoRoot, "opencode", ".config", "opencode", "skills");
const targets = [
  path.join(os.homedir(), ".agents", "skills"),
  path.join(os.homedir(), ".claude", "skills"),
  path.join(os.homedir(), ".config", "opencode", "skills"),
];

if (!fs.statSync(source).isDirectory()) {
  throw new Error(`Canonical skills directory not found: ${source}`);
}

const canonicalSource = fs.realpathSync(source);

for (const target of targets) {
  if (fs.existsSync(target)) {
    const stats = fs.lstatSync(target);
    if (!stats.isSymbolicLink()) {
      console.warn(`[skills] Not replacing existing non-link path: ${target}`);
      continue;
    }

    const resolvedTarget = fs.realpathSync(target);
    if (resolvedTarget === canonicalSource) {
      console.log(`[skills] Link already configured: ${target}`);
    } else {
      console.warn(`[skills] Not replacing link with unexpected target: ${target} -> ${resolvedTarget}`);
    }
    continue;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
  console.log(`[skills] Linked ${target} -> ${source}`);
}
