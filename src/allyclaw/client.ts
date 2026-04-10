/**
 * Allyclaw (OpenClaw) Gateway Client
 * Connects via WebSocket RPC to the OpenClaw gateway
 *
 * Protocol (from OpenClaw source):
 *   1. Connect WebSocket
 *   2. Receive event: { type:"event", event:"connect.challenge", payload:{ nonce } }
 *   3. Send request: { type:"req", id, method:"connect", params:{ auth:{token}, client:{...}, role, scopes, ... } }
 *   4. Receive hello response → authenticated
 *   5. Send RPC: { type:"req", id, method:"...", params:{...} }
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
   * Open a WebSocket, authenticate with challenge-response,
   * then send an RPC and return the result.
   */
  private rpc<T>(method: string, params: unknown = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.gatewayUrl.replace(/^http/, 'ws')
      const httpUrl = this.gatewayUrl.replace(/^ws/, 'http')
      const ws = new WebSocket(wsUrl, { headers: { Origin: httpUrl } })
      let settled = false
      let authenticated = false
      const connectId = randomUUID()

      const timer = setTimeout(() => {
        if (!settled) { settled = true; ws.close(); reject(new Error(`RPC timeout: ${method}`)) }
      }, this.timeout)

      const finish = (err: Error | null, result?: T) => {
        if (settled) return
        settled = true; clearTimeout(timer)
        if (err) reject(err); else resolve(result as T)
        ws.close()
      }

      ws.on('message', (data: WebSocket.Data) => {
        if (settled) return
        try {
          const msg = JSON.parse(data.toString())

          // Step 1: challenge → send connect request
          if (msg.type === 'event' && msg.event === 'connect.challenge') {
            const nonce = msg.payload?.nonce
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
            return
          }

          // Step 2: connect response (hello) → send actual RPC
          if (msg.id === connectId) {
            if (msg.error) {
              finish(new Error(`Connect failed: ${JSON.stringify(msg.error)}`))
              return
            }
            authenticated = true
            const rpcId = randomUUID()
            ws.send(JSON.stringify({ type: 'req', id: rpcId, method, params }))

            // Now wait for the RPC response with this rpcId
            const origHandler = ws.listeners('message')[0] as (...args: unknown[]) => void
            ws.removeAllListeners('message')
            ws.on('message', (d: WebSocket.Data) => {
              if (settled) return
              try {
                const m = JSON.parse(d.toString())
                // Skip events
                if (m.type === 'event') return
                if (m.id === rpcId) {
                  if (m.error) finish(new Error(`RPC error (${method}): ${JSON.stringify(m.error)}`))
                  else finish(null, (m.result ?? m) as T)
                }
              } catch (e) { finish(e as Error) }
            })
            return
          }

          // Skip other events while waiting for connect response
          if (msg.type === 'event') return

        } catch (err) { finish(err as Error) }
      })

      ws.on('error', (err) => finish(new Error(`WS error: ${err.message}`)))
      ws.on('close', () => { if (!settled) { settled = true; clearTimeout(timer) } })
    })
  }

  async health() { return this.rpc<any>('health', {}) }

  async listSessions(limit = 50) {
    return this.rpc<any>('sessions.list', { limit, includeGlobal: true, includeUnknown: true })
  }

  async getChatHistory(sessionKey: string, limit = 200) {
    return this.rpc<any>('chat.history', { sessionKey, limit })
  }

  async listModels() { return this.rpc<any>('models.list', {}) }

  async getConversationStats() {
    const result = await this.listSessions()
    const sessionList: any[] = result?.sessions ?? result?.recent ?? []

    const sessions = await Promise.all(
      sessionList.map(async (s: any) => {
        const key = s.key ?? s.sessionKey ?? s.id ?? ''
        if (!key) return { key: 'unknown', messageCount: 0, userMessages: 0, assistantMessages: 0 }
        try {
          const history = await this.getChatHistory(key)
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
