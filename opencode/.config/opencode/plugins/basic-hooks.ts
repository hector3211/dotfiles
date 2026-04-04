import type { Plugin } from "@opencode-ai/plugin"
import { access } from "node:fs/promises"
import path from "node:path"

const sessionsNeedingFollowup = new Set<string>()
const sessionsWithDocs = new Set<string>()
const loggedTools = new Set(["bash", "edit", "write"])

const sensitivePathPatterns = [
  /(^|\/)\.env(\.[^/]+)?$/,
  /(^|\/)[^/]+\.pem$/,
  /(^|\/)[^/]+\.key$/,
  /(^|\/)credentials\.json$/,
  /(^|\/)\.npmrc$/,
  /(^|\/)\.ssh(\/|$)/,
]

const dangerousCommandPatterns = [
  /(^|\s)sudo(\s|$)/,
  /rm\s+-rf\s+\//,
  /git\s+reset\s+--hard(\s|$)/,
  /git\s+checkout\s+--(\s|$)/,
  /(^|\s)dd(\s|$)/,
  /(^|\s)mkfs(\.[^\s]+)?(\s|$)/,
  /(^|\s)shutdown(\s|$)/,
  /(^|\s)reboot(\s|$)/,
]

const docsCandidates = ["README.md", "docs", "documentation"]

const normalizePath = (filePath: string, directory: string) =>
  path.isAbsolute(filePath) ? path.normalize(filePath) : path.resolve(directory, filePath)

const isSensitivePath = (filePath: string) => {
  const normalized = filePath.replace(/\\/g, "/")
  return sensitivePathPatterns.some((pattern) => pattern.test(normalized))
}

const isDangerousCommand = (command: string) =>
  dangerousCommandPatterns.some((pattern) => pattern.test(command))

const isWithinProject = (filePath: string, directory: string, worktree: string) => {
  const resolvedPath = normalizePath(filePath, directory)
  const roots = [directory, worktree]
    .filter(Boolean)
    .map((root) => path.resolve(root))

  return roots.some((root) => resolvedPath === root || resolvedPath.startsWith(`${root}${path.sep}`))
}

const hasProjectDocs = async (directory: string) => {
  for (const candidate of docsCandidates) {
    try {
      await access(path.join(directory, candidate))
      return true
    } catch {
      // Ignore missing docs candidates.
    }
  }

  return false
}

export const BasicHooks: Plugin = async ({ client, directory, worktree }) => {
  let docsDetected: boolean | undefined

  const ensureDocsDetected = async () => {
    if (docsDetected === undefined) {
      docsDetected = await hasProjectDocs(directory)
    }

    return docsDetected
  }

  return {
    "experimental.chat.system.transform": async (input, output) => {
      output.system.push(
        "After completing the main task, update any relevant README files, supporting docs, and tests before finalizing your response. If no README, docs, or tests are relevant, say so briefly.",
      )

      if (input.sessionID && sessionsWithDocs.has(input.sessionID)) {
        output.system.push(
          "If this task changes user-facing behavior, commands, configuration, APIs, or workflows, review existing README/docs in the project and update the relevant documentation before finishing.",
        )
      }
    },

    "tool.execute.before": async (input, output) => {
      if (input.tool === "bash" && typeof output.args.command === "string") {
        if (isDangerousCommand(output.args.command)) {
          throw new Error(
            "Blocked potentially destructive command. Explicit user approval is required.",
          )
        }
      }

      if (
        (input.tool === "read" || input.tool === "edit" || input.tool === "write") &&
        typeof output.args.filePath === "string"
      ) {
        const filePath = normalizePath(output.args.filePath, directory)

        if (isSensitivePath(filePath)) {
          throw new Error(
            `Blocked access to sensitive file ${filePath}. Explicit user instruction is required.`,
          )
        }

        if (!isWithinProject(filePath, directory, worktree)) {
          throw new Error(`Blocked path outside current project/worktree: ${filePath}.`)
        }

        if (
          input.sessionID &&
          (input.tool === "edit" || input.tool === "write") &&
          (await ensureDocsDetected())
        ) {
          sessionsWithDocs.add(input.sessionID)
        }
      }

      if (!loggedTools.has(input.tool)) {
        return
      }

      await client.app.log({
        body: {
          service: "basic-hooks",
          level: "info",
          message: "tool.execute.before",
          extra: {
            tool: input.tool,
          },
        },
      })
    },

    "tool.execute.after": async (input) => {
      if (input.tool === "edit" || input.tool === "write") {
        sessionsNeedingFollowup.add(input.sessionID)
      }

      if (!loggedTools.has(input.tool)) {
        return
      }

      await client.app.log({
        body: {
          service: "basic-hooks",
          level: "info",
          message: "tool.execute.after",
          extra: {
            tool: input.tool,
            args: input.args,
          },
        },
      })
    },

    event: async ({ event }) => {
      if (event.type !== "session.idle") {
        return
      }

      const sessionID = event.properties.sessionID
      if (!sessionsNeedingFollowup.has(sessionID)) {
        return
      }

      sessionsNeedingFollowup.delete(sessionID)
      const hasDocs = sessionsWithDocs.has(sessionID)
      sessionsWithDocs.delete(sessionID)

      await client.tui.showToast({
        title: "Post-task checklist",
        message: hasDocs
          ? "Review relevant README/docs and tests before wrapping up."
          : "Review whether README, docs, and tests need updates before wrapping up.",
        variant: "warning",
        duration: 6000,
      })
    },
  }
}
