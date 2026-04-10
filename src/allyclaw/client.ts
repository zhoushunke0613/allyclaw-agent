/**
 * Allyclaw (OpenClaw) Gateway Client
 * WebSocket RPC with challenge-response auth
 */

import WebSocket from 'ws'
import { randomUUID } from 'crypto'

export interface AllyclawConfig {
  gatewayUrl: string
  token: string
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
   * Connect, authenticate, send RPC, return result.
   * Single message handler routes by msg.id.
   */
  private rpc<T>(method: string, params: unknown = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.gatewayUrl.replace(/^http/, 'ws')
      const httpUrl = this.gatewayUrl.replace(/^ws/, 'http')
      const ws = new WebSocket(wsUrl, { headers: { Origin: httpUrl } })
      let settled = false
      const connectId = randomUUID()
      const rpcId = randomUUID()

      const timer = setTimeout(() => {
        if (!settled) { settled = true; ws.close(); reject(new Error(`RPC timeout: ${method}`)) }
      }, this.timeout)

      const finish = (err: Error | null, result?: T) => {
        if (settled) return
        settled = true; clearTimeout(timer)
        if (err) reject(err); else resolve(result as T)
        try { ws.close() } catch {}
      }

      ws.on('message', (data: WebSocket.Data) => {
        if (settled) return
        try {
          const msg = JSON.parse(data.toString())

          // Events from gateway
          if (msg.type === 'event') {
            if (msg.event === 'connect.challenge') {
              // Step 1: respond to challenge
              ws.send(JSON.stringify({
                type: 'req',
                id: connectId,
                method: 'connect',
                params: {
                  minProtocol: 3,
                  maxProtocol: 3,
                  client: {
                    id: 'openclaw-control-ui',
                    version: '1.0.0',
                    platform: 'linux',
                    mode: 'webchat',
                    instanceId: randomUUID(),
                  },
                  caps: [],
                  auth: { token: this.token },
                  role: 'operator',
                  scopes: ['operator.admin', 'operator.read'],
                },
              }))
            }
            // Skip all other events (presence, agent, etc.)
            return
          }

          // Responses (matched by id)
          if (msg.id === connectId) {
            // Step 2: connect response → send actual RPC
            if (msg.error) {
              finish(new Error(`Connect failed: ${JSON.stringify(msg.error)}`))
            } else {
              ws.send(JSON.stringify({ type: 'req', id: rpcId, method, params }))
            }
            return
          }

          if (msg.id === rpcId) {
            // Step 3: RPC response
            if (msg.error) {
              finish(new Error(`RPC error (${method}): ${JSON.stringify(msg.error)}`))
            } else {
              finish(null, (msg.result ?? msg) as T)
            }
            return
          }

          // Ignore other messages (different ids, etc.)
        } catch (err) { finish(err as Error) }
      })

      ws.on('error', (err) => finish(new Error(`WS error: ${err.message}`)))
      ws.on('close', () => { if (!settled) { settled = true; clearTimeout(timer) } })
    })
  }

  async health() { return this.rpc<any>('health', {}) }

  async listSessions(limit: number = 50) {
    return this.rpc<any>('sessions.list', { limit: Math.floor(limit) })
  }

  async getChatHistory(sessionKey: string, limit: number = 200) {
    return this.rpc<any>('chat.history', { sessionKey, limit: Math.floor(limit) })
  }

  async listModels() { return this.rpc<any>('models.list', {}) }

  async getConversationStats() {
    const result = await this.listSessions(50)
    const sessionList: any[] = result?.sessions ?? result?.recent ?? []

    const sessions = await Promise.all(
      sessionList.map(async (s: any) => {
        const key = s.key ?? s.sessionKey ?? s.id ?? ''
        if (!key) return { key: 'unknown', messageCount: 0, userMessages: 0, assistantMessages: 0 }
        try {
          const history = await this.getChatHistory(key, 200)
          const msgs: any[] = history?.messages ?? []
          return {
            key,
            messageCount: msgs.length,
            userMessages: msgs.filter((m) => m.role === 'user').length,
            assistantMessages: msgs.filter((m) => m.role === 'assistant').length,
          }
        } catch {
          return { key, messageCount: 0, userMessages: 0, assistantMessages: 0 }
        }
      })
    )

    const totalMessages = sessions.reduce((sum, s) => sum + s.messageCount, 0)
    return {
      totalSessions: sessions.length,
      sessions,
      totalMessages,
      totalUserMessages: sessions.reduce((sum, s) => sum + s.userMessages, 0),
      totalAssistantMessages: sessions.reduce((sum, s) => sum + s.assistantMessages, 0),
    }
  }
}
