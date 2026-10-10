import path from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

// Defense in depth, NOT a shell sandbox. Enforce hard merge restrictions using GitHub permissions.
export default function (pi: ExtensionAPI) {
  if (process.env.FACTORY_WORKER !== '1') return;
  pi.on('tool_call', async event => {
    if (event.toolName === 'bash') {
      const command = String(event.input.command || '');
      if (/\bgit\s+(?:[^\n;&|]*\s)?(?:push|merge|rebase|reset|clean|worktree)\b|\bgh\s+(?:pr|api|issue|repo)\b|\b(?:sudo|ssh|scp)\b|\.factory[\/\\].*(?:config|job\.json|projects\.json)|auth\.json|\.env\b/i.test(command)) {
        return { block: true, reason: 'The factory runtime owns delivery and job state. Credentials and destructive operations are not authorized.' };
      }
    }
    if (['write', 'edit'].includes(event.toolName)) {
      const file = String(event.input.path || event.input.file_path || '');
      const root = process.env.FACTORY_WORKTREE || process.cwd();
      const absolute = path.resolve(root, file);
      if (!absolute.startsWith(root + path.sep) || /(?:^|[\/\\])(?:\.factory|\.git|\.env(?:\.[^/\\]+)?)(?:[\/\\]|$)/.test(absolute)) {
        return { block: true, reason: 'Only feature files inside this worktree may be changed.' };
      }
    }
  });
}
