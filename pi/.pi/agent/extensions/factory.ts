import os from 'node:os';
import path from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

type WorkspaceSelection = {
  needsSelection: true;
  choices: { label: string; cwd: string }[];
  workspace: string;
};

function selectionFrom(stdout: string): WorkspaceSelection | undefined {
  const start = stdout.indexOf('{');
  if (start < 0) return;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < stdout.length; i++) {
    const char = stdout[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}' && --depth === 0) {
      try {
        const value = JSON.parse(stdout.slice(start, i + 1)) as Partial<WorkspaceSelection>;
        if (value.needsSelection === true && Array.isArray(value.choices) && value.choices.every(choice =>
          typeof choice?.label === 'string' && typeof choice.cwd === 'string') && typeof value.workspace === 'string') {
          return value as WorkspaceSelection;
        }
      } catch { return; }
    }
  }
}

function isFeatureCommand(args: string): boolean {
  const verb = args.trim().split(/\s+/, 1)[0]?.toLowerCase();
  return !['help', 'status', 'dashboard', 'inspect', 'pause', 'resume', 'cancel', 'answer', 'issue', 'config', 'new', 'plan', 'attach'].includes(verb || '');
}

export default function (pi: ExtensionAPI) {
  if (process.env.FACTORY_WORKER === '1') return;
  pi.registerCommand('factory', {
    description: 'Start or manage autonomous feature jobs and the local dashboard',
    handler: async (args, ctx) => {
      const cli = path.join(os.homedir(), '.agents', 'factory', 'cli.ts');
      const node = /^node(?:\.exe)?$/i.test(path.basename(process.execPath)) ? process.execPath : 'node';
      const run = async (command: string, cwd: string, repoCwd?: string) => {
        const options = [cli, '--caller', 'pi'];
        if (ctx.model) options.push('--model', `${ctx.model.provider}/${ctx.model.id}`);
        if (repoCwd) options.push('--cwd', repoCwd);
        options.push(command || 'help');
        return pi.exec(node, options, { cwd, timeout: 120_000 });
      };

      const originalCommand = args || 'help';
      const result = await run(originalCommand, ctx.cwd);
      if (result.code !== 0) { ctx.ui.notify(result.stderr || result.stdout || 'Factory command failed', 'error'); return; }

      const selection = selectionFrom(result.stdout);
      if (!selection) {
        pi.sendMessage({ customType: 'factory', content: result.stdout.trim(), display: true }, { triggerTurn: false });
        return;
      }

      if (!ctx.hasUI) {
        ctx.ui.notify('Factory needs a workspace selection, but no UI is available.', 'warning');
        return;
      }
      const feature = isFeatureCommand(originalCommand);
      const newProject = 'New project';
      const planOnly = 'Plan only';
      const options = [...selection.choices.map(choice => `Project: ${choice.label}`), ...(feature ? [newProject, planOnly] : [])];
      if (!options.length) { ctx.ui.notify('No project repositories found. Use /factory new <name> <feature> to create one.', 'warning'); return; }
      const selected = await ctx.ui.select('Choose a Factory workspace', options);
      if (!selected) return;

      let command: string;
      let cwd: string;
      let repoCwd: string | undefined;
      if (selected === newProject) {
        const name = await ctx.ui.input('New project directory name');
        if (!name?.trim()) return;
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(name.trim())) {
          ctx.ui.notify('Use a simple directory name: letters, numbers, - or _ (no spaces).', 'error');
          return;
        }
        command = `new ${name.trim()} ${originalCommand}`;
        cwd = ctx.cwd;
      } else if (selected === planOnly && feature) {
        command = `plan ${originalCommand}`;
        cwd = ctx.cwd;
      } else {
        const choice = selection.choices.find(item => `Project: ${item.label}` === selected);
        if (!choice) return;
        command = originalCommand;
        cwd = ctx.cwd;
        repoCwd = choice.cwd;
      }

      const rerun = await run(command, cwd, repoCwd);
      if (rerun.code !== 0) { ctx.ui.notify(rerun.stderr || rerun.stdout || 'Factory command failed', 'error'); return; }
      pi.sendMessage({ customType: 'factory', content: rerun.stdout.trim(), display: true }, { triggerTurn: false });
    },
  });
}
