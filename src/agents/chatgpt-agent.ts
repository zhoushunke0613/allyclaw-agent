/**
 * ChatGPT Agent with Allyclaw (OpenClaw) conversation tracking
 *
 * Flow:
 *  1. User sends a question
 *  2. Load history from OpenClaw gateway → inject as messages context
 *  3. Call OpenAI ChatCompletion
 *  4. Return answer (conversation is tracked by OpenClaw gateway)
 */

import OpenAI from 'openai'
import { v4 as uuidv4 } from 'uuid'
import type { AllyclawClient } from '../allyclaw/client.js'

export interface ChatGPTAgentOptions {
  openai: OpenAI
  allyclaw: AllyclawClient
  model?: string
  systemPrompt?: string
}

export class ChatGPTAgent {
  private openai: OpenAI
  private allyclaw: AllyclawClient
  private model: string
  private systemPrompt: string

  constructor(options: ChatGPTAgentOptions) {
    this.openai = options.openai
    this.allyclaw = options.allyclaw
    this.model = options.model ?? 'gpt-4o'
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
    const historyMessages: OpenAI.Chat.ChatCompletionMessageParam[] = []
    if (sessionKey) {
      try {
        const history = await this.allyclaw.getChatHistory(sessionKey)
        for (const msg of history.messages ?? []) {
          const role = msg.role === 'user' ? 'user' as const : 'assistant' as const
          const content = typeof msg.content === 'string'
            ? msg.content
            : (msg.content ?? []).filter(b => b.type === 'text').map(b => b.text ?? '').join('')
          if (content) {
            historyMessages.push({ role, content })
          }
        }
      } catch {
        // Ignore if session not found yet
      }
    }

    // 2. Build messages array
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: this.systemPrompt },
      ...historyMessages,
      { role: 'user', content: question },
    ]

    // 3. Call OpenAI
    const completion = await this.openai.chat.completions.create({
      model: this.model,
      messages,
    })

    const answer = completion.choices[0]?.message?.content ?? ''

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
