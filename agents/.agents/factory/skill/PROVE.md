# Prove: checks plus runtime evidence

Use this guide before implementation, then return to it during verification. Proof is a reproducible observation of the requested behavior, not just green tests or a code review.

## Before: establish the baseline

1. Pick the smallest safe scenario that exercises the user's acceptance criteria. Record the command or URL, inputs/fixture, environment, source revision when available, expected result, and actual result.
2. Run it before changing the behavior. For a bug, capture the reported symptom; for a feature, capture the current behavior or missing capability. Save the original observation while reproduction is cheap. If work already changed, identify a genuine existing baseline or mark before evidence unavailable; never manufacture a baseline from the fixed result.
3. Store sanitized output as `before-001.log` or `before-001.json` with the observer's `artifact` action. Keep screenshots/traces in a private local output directory and record their exact paths in the proof summary. The reporting helper accepts text artifacts, not binary image uploads.

Baseline complete: the scenario and actual before result are recorded, or the missing baseline and its reason are explicitly documented.

## Choose runtime evidence

- **CLI:** invoke the actual entrypoint with representative input; record stdout, stderr and exit status. A mocked function alone is not end-to-end proof.
- **API/service:** make the relevant request against the running application; record a redacted request, response/status and relevant state transition. Use a disposable fixture where writes are needed.
- **UI:** capture the affected page or element and exercise its relevant interactions. For behavior changes, screenshots complement click/keyboard assertions, console errors or network observations; they do not replace them.
- **Performance:** compare the same workload and environment; record sampling conditions and avoid presenting one noisy measurement as a reliable improvement.
- **Documentation-only work:** show the changed guidance at its real entrypoint and validate references/checks. Mark application runtime evidence not applicable with a reason rather than inventing an app run.

Use tools already available in the host. Ask before installing additional tooling, running a potentially destructive reproduction, changing shared/production data, or starting a server with unclear side effects. Use a disposable fixture rather than stashing, resetting, or switching the user's checkout merely to reconstruct a baseline.

## Visual comparisons

For visual changes, capture a focused before/after pair with matching viewport, selector, data, theme and application state. Record any intentional differences; otherwise a mismatch can masquerade as an improvement.

- Identify the before and after sources explicitly. If only an after URL/image exists, ask for the baseline or report it missing; do not guess a deployment.
- Prefer the affected element or normal viewport. Capture a full scrolling page only when requested or necessary for the acceptance criteria. Include mobile/tablet sizes when responsive behavior is relevant.
- Use available browser tooling or an already-approved `@vercel/before-and-after` installation (the package is not named `before-and-after`). Check its help and local-output behavior before using it; no installation or upload is required by Factory.
- A protected deployment is blocked evidence unless authorized access is available. Request access or manual captures; preserve credentials and deployment protection.
- Keep images local by default. Markdown/upload modes can publish images externally. Get explicit approval for any upload destination or PR-body update; generate a local comparison table without uploading when approval is absent.

## After: prove the change

1. Run the repo's relevant tests, lint and type checks and record their actual exit results.
2. Re-run the baseline scenario against the changed application with the same inputs and conditions. Capture the actual after state as `after-001.log` or `after-001.json`, plus local screenshots/traces where useful.
3. Check each acceptance criterion against the observations. Preserve before evidence; use a new numbered pair for a changed scenario or another repair round. After subsequent changes affecting the scenario, re-run the checks and refresh the after evidence.
4. Save `proof-001.md` as an observer artifact. Include:
   - Scenario, environment/source identity, commands/URLs and capture timestamps.
   - Expected versus actual behavior and references to both numbered artifacts.
   - A Before / After comparison table; for visual evidence include exact local image paths (or explicitly approved shared URLs), viewport and selectors. These paths are references, not dashboard image previews.
   - Repo check results, exercised interactions, acceptance criteria covered, and remaining gaps.
5. Report check outcomes through `report.checks`. Put a concise proof verdict and the `artifacts/proof-001.md` reference in `approval.md` and `lastSummary`; have the independent reviewer inspect the evidence, not just the diff.

Proof complete: the requested behavior is demonstrated by after evidence, supported by applicable repo checks, and compared to the recorded baseline. If evidence is missing, blocked, inconclusive or not applicable, label that explicitly and explain why. Passing repo checks alone does not mean runtime proof passed. Report the limitation and seek a decision when it blocks acceptance; a user-authorized handoff with gaps remains **unproven**, not silently verified.

## Inspiration

Visual-comparison ideas were informed by [michaelshimeles/skills — before-and-after](https://github.com/michaelshimeles/skills/tree/main/before-and-after). This is original Factory guidance, not a vendored copy of that skill or its upload scripts.
