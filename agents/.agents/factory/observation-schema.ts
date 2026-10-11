import * as Effect from 'effect/Effect';
import * as Schema from 'effect/Schema';

const nonempty = (max: number) => Schema.String.check(Schema.isPattern(/\S/, { message: 'Must contain non-whitespace text' }), Schema.isMaxLength(max));
const short = nonempty(10_000);
const optional = Schema.optionalKey;
const common = { cwd: optional(nonempty(4096)), runtime: optional(Schema.String), model: optional(Schema.String) };
const identity = { ...common, id: nonempty(200) };
const State = Schema.Literals(['queued', 'building', 'reviewing', 'ready', 'needs-human', 'paused', 'cancelled', 'completed', 'interrupted']);
const Stage = Schema.Literals(['plan', 'build', 'verify', 'review', 'deliver']);
const Decision = Schema.Struct({ blockedOn: short, alreadyTried: Schema.Array(short), recommendation: short, needFromYou: short });
const Check = Schema.Struct({ name: short, command: short, status: Schema.Literals(['passed', 'failed', 'unavailable']), exitCode: Schema.NullOr(Schema.Int), artifact: optional(short) });
const Finding = Schema.Struct({ severity: Schema.Literals(['blocking', 'warning', 'info']), explanation: short, location: optional(short), suggestedFix: optional(short) });
const Review = Schema.Struct({ verdict: Schema.Literals(['pass', 'changes', 'blocked']), summary: nonempty(100_000), findings: Schema.Array(Finding) });

export const ObserverCommand = Schema.Union([
  Schema.Struct({ ...common, action: Schema.Literals(['status', 'dashboard', 'migrate']) }),
  Schema.Struct({ ...common, action: Schema.Literals(['start', 'new']), cwd: nonempty(4096), description: nonempty(100_000) }),
  Schema.Struct({ ...identity, action: Schema.Literals(['inspect', 'pause', 'resume', 'cancel', 'checkpoint']) }),
  Schema.Struct({ ...identity, action: Schema.Literal('answer'), answer: nonempty(100_000) }),
  Schema.Struct({ ...identity, action: Schema.Literal('ack'), controlId: nonempty(200), state: optional(State), activity: optional(short) }),
  Schema.Struct({ ...identity, action: Schema.Literal('report'), state: optional(State), stage: optional(Stage), activity: optional(short),
    project: optional(short), worktree: optional(short), branch: optional(short), baseSha: optional(short), targetBranch: optional(short),
    lastSummary: optional(nonempty(100_000)), pr: optional(short), error: optional(short), decision: optional(Schema.NullOr(Decision)), checks: optional(Schema.Array(Check)), review: optional(Review) }),
  Schema.Struct({ ...identity, action: Schema.Literal('document'), name: Schema.Literals(['spec.md', 'build.md', 'decisions.md', 'approval.md']), content: nonempty(1_000_000) }),
  Schema.Struct({ ...identity, action: Schema.Literal('artifact'), name: Schema.String.check(Schema.isPattern(/^[\w][\w.-]*\.(md|json|log)$/), Schema.isMaxLength(200)), content: nonempty(1_000_000) })
]);
export type ObserverCommand = typeof ObserverCommand.Type;
export class InvalidCommand extends Schema.TaggedErrorClass<InvalidCommand>()('InvalidCommand', { message: Schema.String }) {}
export const decodeCommand = (value: unknown) => Schema.decodeUnknownEffect(ObserverCommand, { onExcessProperty: 'error' })(value).pipe(
  Effect.mapError(() => {
    const action = value && typeof value === 'object' && 'action' in value && typeof value.action === 'string' && /^[a-z]+$/.test(value.action) ? value.action : 'unknown';
    return new InvalidCommand({ message: `Invalid Factory ${action} command: check required fields, types, allowed states/stages and size limits.${action === 'artifact' ? ' Use a simple .md/.json/.log filename.' : ''}` });
  })
);
