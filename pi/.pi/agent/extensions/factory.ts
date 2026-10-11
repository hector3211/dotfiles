import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const MANAGEMENT = new Set(['status', 'dashboard', 'inspect', 'pause', 'resume', 'cancel', 'answer', 'migrate']);
const MAX_REQUEST_LENGTH = 100_000;

export default function (pi: ExtensionAPI, factoryDirectory = path.join(os.homedir(), '.agents', 'factory')) {
  if (process.env.FACTORY_WORKER === '1') return;

  pi.registerCommand('factory', {
    description: 'Start a Factory job in this agent, or explicitly manage a dashboard job',
    handler: async (args, ctx) => {
      const text = args.trim();
      const parts = text.split(/\s+/);
      const command = parts[0]?.toLowerCase() || '';
      const management = (command === 'dashboard' || command === 'status' || command === 'migrate') && parts.length === 1
        || ['inspect', 'pause', 'resume', 'cancel'].includes(command) && parts.length === 2
        || command === 'answer' && parts.length >= 3;

      if (!text || command === 'new' && parts.length === 1) {
        if (!ctx.hasUI) throw new Error('What work would you like the Factory to do? Run /factory <request> in an interactive session.');
        const request = await ctx.ui.input('What work would you like the Factory to do?');
        if (request === undefined || !request.trim()) return;
        await sendWorkRequest(request.trim(), ctx.cwd);
        return;
      }

      if (command === 'new' && parts.length > 1) {
        await sendWorkRequest(text.slice(parts[0].length).trim(), ctx.cwd);
        return;
      }

      if (MANAGEMENT.has(command) && !management) {
        throw new Error(`Usage: /factory ${command}${['status', 'dashboard', 'migrate'].includes(command) ? '' : ' <job-id>'}${command === 'answer' ? ' <response>' : ''}`);
      }
      if (MANAGEMENT.has(command) && management) {
        await runManagement(text, ctx.cwd, pi, factoryDirectory);
        if (command === 'resume' || command === 'answer') await sendWorkRequest(`Continue existing observation ${parts[1]}. Inspect its records and pending controls, reconcile the actual workspace, and acknowledge the user's ${command} request at a safe checkpoint. Do not create a duplicate observation.`, ctx.cwd);
        return;
      }

      await sendWorkRequest(text, ctx.cwd);

      async function sendWorkRequest(request: string, cwd: string) {
        if (!request) throw new Error('Enter the work you want done.');
        if (request.length > MAX_REQUEST_LENGTH) throw new Error(`Factory requests must be ${MAX_REQUEST_LENGTH.toLocaleString()} characters or fewer.`);
        const skillPath = path.join(factoryDirectory, 'skill', 'SKILL.md');
        const skill = await fs.readFile(skillPath, 'utf8');
        pi.sendMessage(
          {
            customType: 'factory',
            content: `Follow these Factory instructions for the current task. Treat the request as feature prose, not as CLI syntax.\n\n<factory-skill>\n${skill}\n</factory-skill>\n\n<request cwd=${JSON.stringify(cwd)}>\n${request}\n</request>`,
            display: true,
          },
          { triggerTurn: true },
        );
      }
    },
  });
}

async function runManagement(text: string, cwd: string, pi: ExtensionAPI, factoryDirectory: string) {
  const [action, id, ...response] = text.split(/\s+/);
  const request: Record<string, unknown> = { action: action.toLowerCase(), cwd };
  if (id) request.id = id;
  if (action.toLowerCase() === 'answer' && response.length) request.answer = response.join(' ');
  if (['inspect', 'pause', 'resume', 'cancel', 'answer'].includes(action.toLowerCase()) && !id) {
    throw new Error(`Usage: /factory ${action.toLowerCase()} <job-id>${action.toLowerCase() === 'answer' ? ' <response>' : ''}`);
  }
  if (action.toLowerCase() === 'answer' && !request.answer) throw new Error('Usage: /factory answer <job-id> <response>');

  const cli = path.join(factoryDirectory, 'cli.ts');
  const node = /^node(?:\.exe)?$/i.test(path.basename(process.execPath)) ? process.execPath : 'node';
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'factory-command-'));
  const file = path.join(directory, 'request.json');
  try {
    await fs.writeFile(file, JSON.stringify(request), { flag: 'wx', mode: 0o600 });
    const result = await pi.exec(node, [cli, '--request-file', file], { cwd, timeout: 120_000 });
    if (result.code !== 0) throw new Error(result.stderr || result.stdout || 'Factory command failed');
    pi.sendMessage({ customType: 'factory', content: result.stdout.trim(), display: true }, { triggerTurn: false });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}
