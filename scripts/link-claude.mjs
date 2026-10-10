#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = os.homedir();
const mods = ["cache-meter", "ticket-timer"];
const targets = mods.map(name => path.join(home, "claude-mods", name));
const settingsPath = path.join(home, ".claude", "settings.json");

for (const [index, name] of mods.entries()) {
  const source = path.join(repoRoot, "claude", "mods", name);
  const target = targets[index];
  const sourceReal = fs.realpathSync(source);
  // Never replace locally edited mods; they may still be enabled below.
  if (fs.lstatSync(target, { throwIfNoEntry: false })) {
    if (fs.realpathSync(target) !== sourceReal) {
      console.warn(`[claude] Preserving existing mod: ${target}`);
      if (!fs.existsSync(path.join(target, ".claude-plugin", "plugin.json"))) {
        throw new Error(`Existing mod is invalid: ${target}`);
      }
    }
  } else {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(source, target, process.platform === "win32" ? "junction" : "dir");
    console.log(`[claude] Linked ${target} -> ${source}`);
  }
}

// Merge only plugin paths; leave auth, hooks, permissions and other settings alone.
const original = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, "utf8") : null;
const settings = original === null ? {} : JSON.parse(original);
if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("Invalid Claude settings");
settings.env ??= {};
if (typeof settings.env !== "object" || Array.isArray(settings.env)) throw new Error("Invalid Claude env settings");
const key = "CLAUDE_CODE_PLUGIN_DIRS";
const current = settings.env[key] ?? "";
if (typeof current !== "string") throw new Error(`Invalid ${key}`);
const entries = current.split(path.delimiter).filter(Boolean);
const expanded = value => value === "~" ? home : value.startsWith("~/") ? path.join(home, value.slice(2)) : value;
let changed = false;
for (const target of targets) {
  if (!entries.some(entry => path.resolve(expanded(entry)) === path.resolve(target))) {
    entries.push(target);
    changed = true;
  }
}
if (changed) {
  settings.env[key] = entries.join(path.delimiter);
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  if (original !== null) {
    const backup = `${settingsPath}.backup-${Date.now()}`;
    fs.writeFileSync(backup, original, { mode: 0o600, flag: "wx" });
    console.log(`[claude] Settings backup: ${backup}`);
  }
  fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  console.log(`[claude] Enabled ${mods.join(" and ")}; restart Claude Code to load them.`);
} else {
  console.log(`[claude] ${mods.join(" and ")} already enabled.`);
}
