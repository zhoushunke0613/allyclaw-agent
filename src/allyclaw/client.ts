/**
 * Allyclaw (OpenClaw) Gateway Client
 * Connects via WebSocket RPC to the OpenClaw gateway
 *
 * RPC methods discovered from the Control UI:
 *   sessions.list   — list all conversation sessions
 *   chat.history    — get message history for a session
 *   chat.send       — send a message in a session
 *   health          — gateway health check
 *   models.list     — list available models
 */

import WebSocket from 'ws'

export interface AllyclawConfig {
  /** WebSocket URL, e.g. ws://43.166.252.204:12369 */
  gatewayUrl: string
  /** Auth token from openclaw.json gateway.auth.token */
  token: string
  /** Request timeout in ms (default: 15000) */
  timeout?: number
}

export interface Session {
  key: string
  kind: string
  model: string
  tokens: number
  contextPercent: number
  age: string
  flags: string
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string | Array<{ type: string; text?: string }>
  timestamp?: number
}

export interface HealthResult {
  ok: boolean
  ts: number
  durationMs: number
  heartbeatSeconds: number
  defaultAgentId: string
  agents: unknown[]
  sessions: {
    path: string
    count: number
    recent: unknown[]
  }
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
   * Send a JSON-RPC request to the OpenClaw gateway via WebSocket.
   * Opens a short-lived connection, sends the request, and returns the response.
   */
  private async rpc<T>(method: string, params: unknown = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.gatewayUrl.replace(/^http/, 'ws')
      const ws = new WebSocket(wsUrl)
      const timer = setTimeout(() => {
        ws.close()
        reject(new Error(`RPC timeout after ${this.timeout}ms for method: ${method}`))
      }, this.timeout)

      ws.on('open', () => {
        ws.send(JSON.stringify({
          id: 1,
          method,
          params,
          token: this.token,
        }))
      })

      ws.on('message', (data: WebSocket.Data) => {
        clearTimeout(timer)
        try {
          const msg = JSON.parse(data.toString())
          // The gateway sends a "hello" message first, then our RPC response
          if (msg.event === 'hello' || msg.type === 'hello') {
            // Wait for the actual RPC response
            return
          }
          if (msg.error) {
            reject(new Error(`RPC error (${method}): ${msg.error.message || JSON.stringify(msg.error)}`))
          } else {
            resolve((msg.result ?? msg.data ?? msg) as T)
          }
          ws.close()
        } catch (err) {
          reject(err)
          ws.close()
        }
      })

      ws.on('error', (err) => {
        clearTimeout(timer)
        reject(new Error(`WebSocket error: ${err.message}`))
      })

      ws.on('close', () => {
        clearTimeout(timer)
      })
    })
  }

  /** 获取 gateway 健康状态 */
  async health(): Promise<HealthResult> {
    return this.rpc<HealthResult>('health', {})
  }

  /** 获取所有会话列表 */
  async listSessions(params?: { limit?: number; includeGlobal?: boolean }): Promise<unknown> {
    return this.rpc('sessions.list', {
      limit: params?.limit ?? 50,
      includeGlobal: params?.includeGlobal ?? true,
      includeUnknown: true,
    })
  }

  /** 获取某个会话的聊天历史 */
  async getChatHistory(sessionKey: string, limit = 200): Promise<{ messages: ChatMessage[] }> {
    return this.rpc('chat.history', {
      sessionKey,
      limit,
    })
  }

  /** 发送消息到某个会话 */
  async sendMessage(sessionKey: string, message: string): Promise<unknown> {
    return this.rpc('chat.send', {
      sessionKey,
      message,
      deliver: false,
    })
  }

  /** 获取可用模型列表 */
  async listModels(): Promise<{ models: unknown[] }> {
    return this.rpc('models.list', {})
  }

  /** 获取 agent 身份信息 */
  async getAgentIdentity(sessionKey?: string): Promise<unknown> {
    return this.rpc('agent.identity.get', sessionKey ? { sessionKey } : {})
  }

  /**
   * 统计对话数据
   * 汇总所有 session 的消息数量、token 使用等
   */
  async getConversationStats(): Promise<{
    totalSessions: number
    sessions: Array<{
      key: string
      messageCount: number
      messages: ChatMessage[]
    }>
  }> {
    const sessionsResult = await this.listSessions() as { sessions?: Array<{ key: string }> }
    const sessions = sessionsResult?.sessions ?? []

    const stats = await Promise.all(
      sessions.map(async (s) => {
        try {
          const history = await this.getChatHistory(s.key)
          return {
            key: s.key,
            messageCount: history.messages?.length ?? 0,
            messages: history.messages ?? [],
          }
        } catch {
          return { key: s.key, messageCount: 0, messages: [] }
        }
      })
    )

    return {
      totalSessions: sessions.length,
      sessions: stats,
    }
  }
}
