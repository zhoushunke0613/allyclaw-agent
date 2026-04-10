/**
 * Claude Agent with Allyclaw (OpenClaw) conversation tracking
 *
 * Flow:
 *  1. User sends a question
 *  2. Load history from OpenClaw gateway → inject as messages context
 *  3. Call Anthropic Messages API
 *  4. Return answer (conversation is tracked by OpenClaw gateway)
 */

import Anthropic from '@anthropic-ai/sdk'
import { v4 as uuidv4 } from 'uuid'
import type { AllyclawClient } from '../allyclaw/client.js'

export interface ClaudeAgentOptions {
  anthropic: Anthropic
  allyclaw: AllyclawClient
  model?: string
  systemPrompt?: string
}

export class ClaudeAgent {
  private anthropic: Anthropic
  private allyclaw: AllyclawClient
  private model: string
  private systemPrompt: string

  constructor(options: ClaudeAgentOptions) {
    this.anthropic = options.anthropic
    this.allyclaw = options.allyclaw
    this.model = options.model ?? 'claude-opus-4-5'
    this.systemPrompt =
      options.systemPrompt ??
      'You are a helpful assistant for Allyclaw, an ecommerce analytics platform.'
  }

  /**
   * Ask a question within a session.
   * If sessionKey is provided, loads history from OpenClaw.
   */
  async chat(question: string, sessionKey?: string): Promise<{ answer: string; sessionKey: string }> {
    const sid = sessionKey ?? `agent:main:api-${uuidv4()}`

    // 1. Load conversation history from OpenClaw
    const historyMessages: Anthropic.MessageParam[] = []
    if (sessionKey) {
      try {
        const history = await this.allyclaw.getChatHistory(sessionKey)
        for (const msg of history.messages ?? []) {
          const role = msg.role === 'user' ? 'user' as const : 'assistant' as const
          const content = typeof msg.content === 'string'
            ? msg.content
            : (Array.isArray(msg.content) ? msg.content : []).filter((b: any) => b.type === 'text').map((b: any) => b.text ?? '').join('')
          if (content) {
            historyMessages.push({ role, content })
          }
        }
      } catch {
        // Ignore if session not found yet
      }
    }

    // 2. Build messages array
    const messages: Anthropic.MessageParam[] = [
      ...historyMessages,
      { role: 'user', content: question },
    ]

    // 3. Call Claude
    const response = await this.anthropic.messages.create({
      model: this.model,
      max_tokens: 8096,
      system: this.systemPrompt,
      messages,
    })

    const answer =
      response.content
        .filter((block) => block.type === 'text')
        .map((block) => (block as Anthropic.TextBlock).text)
        .join('') ?? ''

    return { answer, sessionKey: sid }
  }

  /** List all sessions from OpenClaw */
  async listSessions() {
    return this.allyclaw.listSessions()
  }

  /** Load full conversation history for a session */
  async getHistory(sessionKey: string) {
    return this.allyclaw.getChatHistory(sessionKey)
  }

  /** Get conversation statistics */
  async getStats() {
    return this.allyclaw.getConversationStats()
  }
}
