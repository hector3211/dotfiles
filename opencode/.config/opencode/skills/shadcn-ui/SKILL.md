---
name: shadcn-ui
description: Build and customize shadcn/ui interfaces using project-aware patterns, correct CLI flows, and component composition best practices. Use when adding or refactoring shadcn/ui components, forms, themes, registries, or MCP usage.
license: Complete terms in LICENSE.txt
---

Use this skill when the user is working with shadcn/ui components or asks for UI implementation that should follow shadcn conventions.

## What this skill does

- Ensures component code matches the local `components.json` configuration.
- Uses `shadcn info --json` output to align framework, aliases, base style (`radix` or `base`), icon library, and installed components.
- Applies shadcn composition patterns and API usage for current docs.
- Prefers using official component docs and CLI discovery before writing unfamiliar component code.

## Default workflow

1. Detect project context
   - Locate `components.json`.
   - Run `shadcn info --json` when CLI is available.
2. Discover components and patterns
   - Use `shadcn search` and `shadcn docs` (or MCP tools) for the requested UI.
   - Verify form and data-entry patterns before generating code.
3. Implement with project conventions
   - Respect existing file structure, aliases, and styling tokens.
   - Reuse existing UI primitives when present.
4. Install missing components
   - Use `shadcn add <component>` only for components not already installed.
   - Prefer dry-run and diff-aware flows when appropriate.
5. Validate output
   - Ensure imports resolve, styles are token-based, and composition is semantically correct.

## CLI references

Use these commands when needed:
- `shadcn init`
- `shadcn add`
- `shadcn search`
- `shadcn view`
- `shadcn docs`
- `shadcn diff`
- `shadcn info`
- `shadcn build`

## Authoring guidance

- Prefer semantic design tokens over hardcoded colors.
- For forms, use recommended grouping and field composition patterns.
- Match project Tailwind version and theming approach (v3 or v4).
- Keep generated code minimal, accessible, and consistent with existing project style.

## Registry and MCP awareness

- Support custom registries (`registry.json`, item metadata, dependencies, and file objects).
- Use shadcn MCP capabilities for component discovery and install flows when available.

## Trigger phrases

Activate this skill when the user asks to:
- Add or update shadcn/ui components
- Build forms, dashboards, settings, dialogs, tables, sidebars, or navigation with shadcn/ui
- Customize shadcn themes, tokens, variants, or dark mode
- Work with shadcn registries or MCP server tooling

Primary reference: https://ui.shadcn.com/docs/skills
