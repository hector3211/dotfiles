import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./link-claude.mjs", import.meta.url));
function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "dotfiles-claude-test-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const settings = path.join(home, ".claude", "settings.json");
  fs.mkdirSync(path.dirname(settings));
  return { home, settings, run: () => spawnSync(process.execPath, [script], { env: { ...process.env, HOME: home, USERPROFILE: home }, encoding: "utf8" }) };
}

test("links the mod and enables it on a clean home", t => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  assert.ok(fs.existsSync(path.join(f.home, "claude-mods/cache-meter/.claude-plugin/plugin.json")));
  assert.equal(JSON.parse(fs.readFileSync(f.settings)).env.CLAUDE_CODE_PLUGIN_DIRS, path.join(f.home, "claude-mods/cache-meter"));
});

test("merges settings, backs them up, and is idempotent", t => {
  const f = fixture(t);
  const original = JSON.stringify({ model: "opus", hooks: {}, env: { KEEP: "yes", CLAUDE_CODE_PLUGIN_DIRS: "/other/mod" } });
  fs.writeFileSync(f.settings, original);
  assert.equal(f.run().status, 0);
  const merged = JSON.parse(fs.readFileSync(f.settings));
  assert.equal(merged.model, "opus");
  assert.deepEqual(merged.hooks, {});
  assert.equal(merged.env.KEEP, "yes");
  assert.equal(merged.env.CLAUDE_CODE_PLUGIN_DIRS, ["/other/mod", path.join(f.home, "claude-mods/cache-meter")].join(path.delimiter));
  const backup = fs.readdirSync(path.dirname(f.settings)).find(n => n.startsWith("settings.json.backup-"));
  assert.equal(fs.readFileSync(path.join(path.dirname(f.settings), backup), "utf8"), original);
  const before = fs.readFileSync(f.settings, "utf8");
  assert.equal(f.run().status, 0);
  assert.equal(fs.readFileSync(f.settings, "utf8"), before);
  assert.equal(fs.readdirSync(path.dirname(f.settings)).filter(n => n.includes(".backup-")).length, 1);
});

test("preserves a local mod and recognises an existing tilde path", t => {
  const f = fixture(t);
  const mod = path.join(f.home, "claude-mods/cache-meter");
  fs.mkdirSync(path.join(mod, ".claude-plugin"), { recursive: true });
  fs.writeFileSync(path.join(mod, ".claude-plugin/plugin.json"), '{"name":"cache-meter"}');
  const original = JSON.stringify({ env: { CLAUDE_CODE_PLUGIN_DIRS: "~/claude-mods/cache-meter" } });
  fs.writeFileSync(f.settings, original);
  assert.equal(f.run().status, 0);
  assert.equal(fs.lstatSync(mod).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(f.settings, "utf8"), original);
});

test("does not overwrite malformed settings", t => {
  const f = fixture(t);
  fs.writeFileSync(f.settings, "not json");
  assert.notEqual(f.run().status, 0);
  assert.equal(fs.readFileSync(f.settings, "utf8"), "not json");
});
