import os from 'node:os';
import path from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export default function (pi: ExtensionAPI) {
  if (process.env.FACTORY_WORKER === '1') return;
  pi.registerCommand('factory', {
    description: 'Start or manage autonomous feature jobs and the local dashboard',
    handler: async (args, ctx) => {
      const cli = path.join(os.homedir(), '.agents', 'factory', 'cli.ts');
      const options = [cli, '--caller', 'pi'];
      if (ctx.model) options.push('--model', `${ctx.model.provider}/${ctx.model.id}`);
      options.push(args || 'help');
      const node = /^node(?:\.exe)?$/i.test(path.basename(process.execPath)) ? process.execPath : 'node';
      const result = await pi.exec(node, options, { cwd: ctx.cwd, timeout: 120_000 });
      if (result.code !== 0) { ctx.ui.notify(result.stderr || result.stdout || 'Factory command failed', 'error'); return; }
      pi.sendMessage({ customType: 'factory', content: result.stdout.trim(), display: true }, { triggerTurn: false });
    },
  });
}
