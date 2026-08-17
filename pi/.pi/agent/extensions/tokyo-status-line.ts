import {
	CustomEditor,
	type ExtensionAPI,
	type ExtensionContext,
	type KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import type { Component, EditorTheme, TUI } from "@earendil-works/pi-tui";
import { truncateToWidth } from "@earendil-works/pi-tui";

class EmptyFooter implements Component {
	render(): string[] {
		return [];
	}

	invalidate(): void {}
}

function compactPath(cwd: string): string {
	const home = process.env.HOME;
	if (home && (cwd === home || cwd.startsWith(`${home}/`))) {
		return `~${cwd.slice(home.length)}`;
	}
	return cwd;
}

function compactNumber(value: number): string {
	if (value < 1_000) return String(value);
	if (value < 1_000_000) return `${(value / 1_000).toFixed(value < 10_000 ? 1 : 0)}k`;
	return `${(value / 1_000_000).toFixed(1)}m`;
}

function contextLabel(ctx: ExtensionContext): string {
	const usage = ctx.getContextUsage();
	const window = usage?.contextWindow ?? ctx.model?.contextWindow;
	if (!window) return "ctx ?";
	const percent = usage?.percent;
	return `${percent === null || percent === undefined ? "?" : `${percent.toFixed(1)}%`}/${compactNumber(window)}`;
}


export default function (pi: ExtensionAPI) {
	let activeTui: TUI | undefined;
	let branch: string | undefined;
	let working = false;
	let spinnerIndex = 0;
	let spinnerTimer: ReturnType<typeof setInterval> | undefined;
	const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

	const stopSpinner = () => {
		if (spinnerTimer) clearInterval(spinnerTimer);
		spinnerTimer = undefined;
	};

	const requestRender = () => activeTui?.requestRender();

	pi.on("agent_start", () => {
		working = true;
		stopSpinner();
		spinnerTimer = setInterval(() => {
			spinnerIndex = (spinnerIndex + 1) % spinnerFrames.length;
			requestRender();
		}, 80);
		requestRender();
	});

	pi.on("agent_settled", () => {
		working = false;
		stopSpinner();
		requestRender();
	});

	pi.on("model_select", requestRender);
	pi.on("thinking_level_select", requestRender);
	pi.on("message_end", requestRender);

	pi.on("session_shutdown", () => {
		stopSpinner();
		activeTui = undefined;
	});

	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui") return;

		ctx.ui.setWorkingVisible(false);
		ctx.ui.setFooter(() => new EmptyFooter());

		const refreshBranch = async () => {
			const result = await pi.exec("git", ["branch", "--show-current"], {
				cwd: ctx.cwd,
				timeout: 2_000,
			}).catch(() => undefined);
			branch = result?.code === 0 && result.stdout.trim() ? result.stdout.trim() : undefined;
			requestRender();
		};
		void refreshBranch();

		class TokyoStatusEditor extends CustomEditor {
			constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager) {
				super(tui, theme, keybindings, { paddingX: 0 });
				activeTui = tui;
			}

			render(width: number): string[] {
				const lines = super.render(width);
				if (lines.length < 2) return lines;

				const theme = ctx.ui.theme;
				const separator = theme.fg("dim", " › ");
				const model = ctx.model?.name || ctx.model?.id || "no model";
				const spinner = working ? `${spinnerFrames[spinnerIndex]} ` : "";

				const segments = [
					theme.fg("warning", theme.bold(`${spinner}π`)),
					theme.fg("muted", compactPath(ctx.cwd)),
					branch ? theme.fg("success", ` ${branch}`) : undefined,
					theme.fg("accent", `◉ ${model}`) + theme.fg("dim", ` · ${pi.getThinkingLevel()}`),
					theme.fg("muted", `◫ ${contextLabel(ctx)}`),
				].filter((segment): segment is string => Boolean(segment));

				const status = truncateToWidth(segments.join(separator), width, "");
				// Replace the top frame with status text and remove the bottom frame.
				return [status, ...lines.slice(1, -1)];
			}
		}

		ctx.ui.setEditorComponent((tui, theme, keybindings) => new TokyoStatusEditor(tui, theme, keybindings));
	});
}
