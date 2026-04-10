/**
 * Allyclaw (OpenClaw) Gateway Client
 * Connects via WebSocket RPC to the OpenClaw gateway
 *
 * Auth flow:
 *   1. Connect WebSocket
 *   2. Receive connect.challenge { nonce }
 *   3. Reply with connect.auth { token, nonce, clientName, mode }
 *   4. Receive hello event → authenticated
 *   5. Send RPC requests
 */

import WebSocket from 'ws'

export interface AllyclawConfig {
  /** WebSocket URL, e.g. ws://localhost:12369 */
  gatewayUrl: string
  /** Auth token from openclaw.json gateway.auth.token */
  token: string
  /** Request timeout in ms (default: 15000) */
  timeout?: number
}

export class AllyclawClient {
  private gatewayUrl: string
  private token: string
  private timeout: number

  constructor(config: AllyclawConfig) {
    this.gatewayUrl = config.gatewayUrl.replace(/\/$/, '')
    this.token = config.token
    this.timeout = config.timeout ?? 15000
  }

  /**
   * Open a WebSocket connection, complete challenge-response auth,
   * then send an RPC request and return the result.
   */
  private rpc<T>(method: string, params: unknown = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.gatewayUrl.replace(/^http/, 'ws')
      const ws = new WebSocket(wsUrl)
      let settled = false
      let authenticated = false
      let rpcId = 1

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true
          ws.close()
          reject(new Error(`RPC timeout after ${this.timeout}ms for method: ${method}`))
        }
      }, this.timeout)

      const finish = (err: Error | null, result?: T) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (err) reject(err)
        else resolve(result as T)
        ws.close()
      }

      ws.on('open', () => {
        // Wait for challenge from gateway
      })

      ws.on('message', (data: WebSocket.Data) => {
        if (settled) return
        try {
          const msg = JSON.parse(data.toString())

          // Step 1: Handle challenge → send auth
          if (msg.event === 'connect.challenge' || msg.type === 'connect.challenge') {
            const nonce = msg.payload?.nonce ?? msg.nonce
            ws.send(JSON.stringify({
              type: 'connect.auth',
              token: this.token,
              nonce,
              clientName: 'allyclaw-agent',
              clientVersion: '1.0.0',
              mode: 'webchat',
            }))
            return
          }

          // Step 2: Hello → authenticated, now send RPC
          if (msg.event === 'hello' || msg.type === 'hello') {
            authenticated = true
            ws.send(JSON.stringify({
              id: rpcId,
              method,
              params,
            }))
            return
          }

          // Step 3: Handle RPC response
          if (authenticated) {
            // Skip other events (agent, chat, presence, etc.)
            if (msg.event && msg.id === undefined) return

            if (msg.error) {
              finish(new Error(`RPC error (${method}): ${msg.error.message || JSON.stringify(msg.error)}`))
            } else {
              finish(null, (msg.result ?? msg.data ?? msg) as T)
            }
          }
        } catch (err) {
          finish(err as Error)
        }
      })

      ws.on('error', (err) => {
        finish(new Error(`WebSocket error: ${err.message}`))
      })

      ws.on('close', () => {
        if (!settled) {
          settled = true
          clearTimeout(timer)
        }
      })
    })
  }

  /** 获取 gateway 健康状态 */
  async health(): Promise<unknown> {
    return this.rpc('health', {})
  }

  /** 获取所有会话列表 */
  async listSessions(limit = 50): Promise<unknown> {
    return this.rpc('sessions.list', {
      limit,
      includeGlobal: true,
      includeUnknown: true,
    })
  }

  /** 获取某个会话的聊天历史 */
  async getChatHistory(sessionKey: string, limit = 200): Promise<{ messages: Array<{ role: string; content: unknown; timestamp?: number }> }> {
    return this.rpc('chat.history', { sessionKey, limit })
  }

  /** 获取可用模型列表 */
  async listModels(): Promise<unknown> {
    return this.rpc('models.list', {})
  }

  /** 获取 agent 身份信息 */
  async getAgentIdentity(sessionKey?: string): Promise<unknown> {
    return this.rpc('agent.identity.get', sessionKey ? { sessionKey } : {})
  }

  /**
   * 统计对话数据
   */
  async getConversationStats(): Promise<{
    totalSessions: number
    sessions: Array<{
      key: string
      messageCount: number
      userMessages: number
      assistantMessages: number
    }>
    totalMessages: number
    totalUserMessages: number
    totalAssistantMessages: number
  }> {
    const result = await this.listSessions() as { sessions?: Array<{ key: string }> }
    const sessionList = (result as any)?.sessions ?? (result as any)?.recent ?? []

    const sessions = await Promise.all(
      sessionList.map(async (s: any) => {
        const key = s.key ?? s.sessionKey ?? s.id ?? ''
        if (!key) return { key: 'unknown', messageCount: 0, userMessages: 0, assistantMessages: 0 }
        try {
          const history = await this.getChatHistory(key)
          const msgs = history?.messages ?? []
          const userMessages = msgs.filter((m) => m.role === 'user').length
          const assistantMessages = msgs.filter((m) => m.role === 'assistant').length
          return { key, messageCount: msgs.length, userMessages, assistantMessages }
        } catch {
          return { key, messageCount: 0, userMessages: 0, assistantMessages: 0 }
        }
      })
    )

    const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0)
    const totalUserMessages = sessions.reduce((sum, s) => sum + s.userMessages, 0)
    const totalAssistantMessages = sessions.reduce((sum, s) => sum + s.assistantMessages, 0)

    return { totalSessions: sessions.length, sessions, totalMessages, totalUserMessages, totalAssistantMessages }
  }
}
