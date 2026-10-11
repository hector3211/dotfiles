#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as Console from 'effect/Console';
import * as Effect from 'effect/Effect';
import * as Option from 'effect/Option';
import * as NodeRuntime from '@effect/platform-node/NodeRuntime';
import * as NodeServices from '@effect/platform-node/NodeServices';
import * as Argument from 'effect/unstable/cli/Argument';
import * as Command from 'effect/unstable/cli/Command';
import * as Flag from 'effect/unstable/cli/Flag';
import { callFactory, ensureDaemon, migrateLegacy } from './client.ts';
import { decodeCommand } from './observation-schema.ts';

const maxRequestBytes = 2_000_000;
const optionalString = (name: string) => Flag.string(name).pipe(Flag.optional);

export function openBrowser(url: string) {
  if (process.env.FACTORY_OPEN_BROWSER === '0') return;
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(command, args, { detached: true, stdio: 'ignore' });
  child.on('error', () => {});
  child.unref();
}

const words = Argument.string('command-and-description').pipe(Argument.variadic);
const cli = Command.make('factory', {
  words,
  cwd: optionalString('cwd'),
  caller: optionalString('caller'),
  model: optionalString('model'),
  requestJson: optionalString('request-json'),
  requestFile: optionalString('request-file')
}, (options) => Effect.gen(function*() {
  const args = options.words;
  const cwd = Option.getOrUndefined(options.cwd);
  const caller = Option.getOrUndefined(options.caller);
  const model = Option.getOrUndefined(options.model);
  const requestJson = Option.getOrUndefined(options.requestJson);
  const requestFile = Option.getOrUndefined(options.requestFile);
  const baseCwd = path.resolve(cwd ?? process.cwd());
  let request: unknown;

  if (requestJson !== undefined || requestFile !== undefined) {
    if (requestJson !== undefined && requestFile !== undefined) {
      return yield* Effect.fail(new Error('Use only one of --request-file or --request-json'));
    }
    if (args.length > 0) return yield* Effect.fail(new Error('Do not combine a structured request with command arguments'));
    let json: string;
    if (requestFile !== undefined) {
      const filename = path.resolve(requestFile);
      json = yield* Effect.tryPromise({
        try: async () => {
          const file = await fs.open(filename, 'r');
          try {
            if ((await file.stat()).size > maxRequestBytes) throw new Error('Structured request file is too large (maximum 2 MB)');
            return await file.readFile('utf8');
          } finally {
            await file.close();
          }
        },
        catch: (error) => error instanceof Error ? error : new Error(String(error))
      });
    } else {
      json = requestJson!;
      if (Buffer.byteLength(json, 'utf8') > maxRequestBytes) return yield* Effect.fail(new Error('Structured request is too large (maximum 2 MB)'));
    }
    request = yield* Effect.tryPromise({
      try: async () => JSON.parse(json) as unknown,
      catch: () => new Error('Invalid structured request JSON')
    });
    if (!request || typeof request !== 'object' || Array.isArray(request)) return yield* Effect.fail(new Error('Structured request must be a JSON object'));
    const structured = request as Record<string, unknown>;
    if (structured.cwd !== undefined && (typeof structured.cwd !== 'string' || !structured.cwd.trim())) return yield* Effect.fail(new Error('cwd must be a non-empty directory path'));
    if (['start', 'new'].includes(String(structured.action)) && structured.cwd === undefined && cwd === undefined) return yield* Effect.fail(new Error('Structured start requires an explicit cwd (or --cwd)'));
    request = {
      ...structured,
      ...(structured.cwd !== undefined || cwd !== undefined ? { cwd: path.resolve(baseCwd, String(structured.cwd ?? '.')) } : {}),
      ...(caller !== undefined ? { runtime: caller } : {}),
      ...(model !== undefined ? { model } : {})
    };
  } else {
    const [first = '', ...rest] = args;
    const action = String(first).toLowerCase();
    const tail = rest.join(' ');
    const metadata = {
      cwd: baseCwd,
      ...(caller !== undefined ? { runtime: caller } : {}),
      ...(model !== undefined ? { model } : {})
    };

    if (!first || action === 'help' || action === '--help' || action === '-h') {
      yield* Console.log('Factory: agent-driven execution with an observer-only dashboard.\n\nUsage: factory [command] [options]\n\nCommands: start|new <description>, dashboard, status, inspect <id>, pause <id>, resume <id>, cancel <id>, answer <id> <response>, checkpoint <id>\n\nOptions: --cwd <path> --caller <runtime> --model <model> --request-file <JSON-file> --request-json <JSON>\nLarge or private structured requests should use --request-file. This helper records observations; it never launches workers or runs Git.');
      return;
    }

    if (action === 'migrate') {
      if (rest.length) return yield* Effect.fail(new Error('migrate takes no positional arguments'));
      const dashboard = yield* Effect.tryPromise({ try: migrateLegacy, catch: toError });
      yield* Console.log(JSON.stringify({ url: dashboard.url, notice: 'Observer dashboard ready; legacy records and worktrees preserved.' }));
      return;
    }
    if (['status', 'dashboard'].includes(action)) {
      if (rest.length > 0) return yield* Effect.fail(new Error(`${action} takes no positional arguments`));
      request = { ...metadata, action };
    } else if (['inspect', 'pause', 'resume', 'cancel', 'checkpoint'].includes(action)) {
      if (!rest[0] || rest.length !== 1) return yield* Effect.fail(new Error(`${action} requires exactly one observation ID`));
      request = { ...metadata, action, id: rest[0] };
    } else if (action === 'answer') {
      if (!rest[0] || rest.length < 2) return yield* Effect.fail(new Error('answer requires an observation ID and response'));
      request = { ...metadata, action, id: rest[0], answer: rest.slice(1).join(' ') };
    } else if (action === 'start' || action === 'new') {
      request = { ...metadata, action: 'start', description: tail };
    } else {
      // Bare prose is the convenient start form, not an imperative worker command.
      request = { ...metadata, action: 'start', description: args.join(' ') };
    }
  }

  const decoded = yield* decodeCommand(request);
  if (decoded.action === 'migrate') {
    const dashboard = yield* Effect.tryPromise({ try: migrateLegacy, catch: toError });
    yield* Console.log(JSON.stringify({ url: dashboard.url, notice: 'Observer dashboard ready; legacy records and worktrees preserved.' }));
    return;
  }
  if (decoded.action === 'dashboard') {
    const dashboard = yield* Effect.tryPromise({ try: () => ensureDaemon({ allowOutdated: true }), catch: toError });
    openBrowser(dashboard.url);
    yield* Console.log(JSON.stringify({ url: dashboard.url }, null, 2));
    return;
  }
  const result = yield* Effect.tryPromise({ try: () => callFactory(decoded as Record<string, unknown>), catch: toError });
  if (decoded.action === 'start' || decoded.action === 'new') {
    const dashboard = yield* Effect.tryPromise({ try: () => ensureDaemon(), catch: toError });
    openBrowser(dashboard.url);
    yield* Console.log(JSON.stringify({ ...result, dashboardUrl: dashboard.url }, null, 2));
  } else {
    yield* Console.log(JSON.stringify(result, null, 2));
  }
}));

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

const main = Command.run(cli, { version: '0.1.0' }).pipe(
  Effect.catch((error) => Effect.gen(function*() {
    yield* Console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })),
  Effect.provide(NodeServices.layer)
);

NodeRuntime.runMain(main);
