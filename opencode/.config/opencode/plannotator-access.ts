import type { Plugin } from "@opencode-ai/plugin"

const sessionAgents = new Map<string, string>()

const lastUserAgent = (messages: Array<{ info: { role: string; agent?: string } }>) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.info.role === "user" && message.info.agent) {
      return message.info.agent
    }
  }
}

export const RestrictPlanAgentPlannotator: Plugin = async ({ client }) => ({
  config: async (config) => {
    config.agent ??= {}
    config.agent.plan ??= {}

    const plan = config.agent.plan
    if (!plan.permission || typeof plan.permission !== "object" || Array.isArray(plan.permission)) {
      plan.permission = {}
    }

    plan.permission.submit_plan = "deny"
    plan.tools = { ...plan.tools, submit_plan: false }
  },

  "chat.message": async (input) => {
    if (input.agent) {
      sessionAgents.set(input.sessionID, input.agent)
    }
  },

  "experimental.chat.messages.transform": async (_input, output) => {
    const agent = lastUserAgent(output.messages)
    if (agent !== "plan") {
      return
    }

    for (const message of output.messages) {
      for (const part of message.parts) {
        if (part.type === "text") {
          part.text = part.text.replace(
            "Use submit_plan to submit your plan for user review.",
            "Present the completed plan directly in chat for user review.",
          )
        }
      }
    }
  },

  "experimental.chat.system.transform": async (input, output) => {
    if (!input.sessionID || sessionAgents.get(input.sessionID) !== "plan") {
      return
    }

    output.system = output.system.filter((entry) => !entry.startsWith("## Plannotator"))
    output.system.push(
      "Plannotator is unavailable to the plan agent. Present completed plans directly in chat and do not call submit_plan.",
    )
  },

  "tool.execute.before": async (input) => {
    if (input.tool !== "submit_plan") {
      return
    }

    let agent = sessionAgents.get(input.sessionID)
    if (!agent) {
      const response = await client.session.messages({ path: { id: input.sessionID } })
      agent = lastUserAgent(response.data ?? [])
    }

    if (agent === "plan") {
      throw new Error("The plan agent is not allowed to run Plannotator.")
    }
  },
})
