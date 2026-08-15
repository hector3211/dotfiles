#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const sourceRoot = path.join(repoRoot, "pi", ".pi", "agent");
const targetRoot = path.join(os.homedir(), ".pi", "agent");
const resources = ["agents", "prompts", "extensions"];

for (const resource of resources) {
  const source = path.join(sourceRoot, resource);
  const target = path.join(targetRoot, resource);
  const canonicalSource = fs.realpathSync(source);

  if (fs.existsSync(target)) {
    const stats = fs.lstatSync(target);
    if (!stats.isSymbolicLink()) {
      console.warn(`[pi] Not replacing existing non-link path: ${target}`);
      continue;
    }

    const resolvedTarget = fs.realpathSync(target);
    if (resolvedTarget === canonicalSource) {
      console.log(`[pi] Link already configured: ${target}`);
    } else {
      console.warn(`[pi] Not replacing link with unexpected target: ${target} -> ${resolvedTarget}`);
    }
    continue;
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
  console.log(`[pi] Linked ${target} -> ${source}`);
}

const settings = path.join(targetRoot, "settings.json");
const settingsExample = path.join(sourceRoot, "settings.json.example");
if (!fs.existsSync(settings)) {
  fs.mkdirSync(targetRoot, { recursive: true });
  fs.copyFileSync(settingsExample, settings, fs.constants.COPYFILE_EXCL);
  console.log(`[pi] Seeded local settings: ${settings}`);
} else {
  console.log(`[pi] Preserved local settings: ${settings}`);
}
