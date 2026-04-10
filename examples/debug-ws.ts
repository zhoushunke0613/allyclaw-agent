/**
 * Debug WebSocket connection to OpenClaw Gateway
 * Logs all messages to find the correct auth flow
 */
import 'dotenv/config'
import WebSocket from 'ws'

const url = process.env.ALLYCLAW_GATEWAY_URL!.replace(/^http/, 'ws')
const token = process.env.ALLYCLAW_TOKEN!

console.log('Connecting to:', url)
const ws = new WebSocket(url)

ws.on('open', () => {
  console.log('[open] Connected')
})

ws.on('message', (data) => {
  const raw = data.toString()
  const msg = JSON.parse(raw)
  console.log('[recv]', JSON.stringify(msg, null, 2))

  // On challenge, try multiple auth formats
  if (msg.event === 'connect.challenge') {
    const nonce = msg.payload?.nonce

    // Format 1: type-based
    const auth1 = {
      type: 'connect.response',
      payload: {
        token,
        nonce,
        clientName: 'allyclaw-agent',
        clientVersion: '1.0.0',
        mode: 'webchat',
      }
    }
    console.log('[send] Format 1 (connect.response):', JSON.stringify(auth1))
    ws.send(JSON.stringify(auth1))
  }

  // On hello, send a test RPC
  if (msg.event === 'hello') {
    console.log('[auth] SUCCESS - received hello!')
    const rpc = { id: 1, method: 'health', params: {} }
    console.log('[send] RPC:', JSON.stringify(rpc))
    ws.send(JSON.stringify(rpc))
  }

  // On RPC response
  if (msg.id === 1) {
    console.log('[rpc] Got response, closing')
    ws.close()
  }
})

ws.on('error', (err) => {
  console.error('[error]', err.message)
})

ws.on('close', (code, reason) => {
  console.log('[close]', code, reason.toString())
})

// Timeout
setTimeout(() => {
  console.log('[timeout] No hello after 8s, trying other auth formats...')

  // Try format 2: flat token
  const auth2 = { type: 'auth', token }
  console.log('[send] Format 2 (auth):', JSON.stringify(auth2))
  ws.send(JSON.stringify(auth2))

  setTimeout(() => {
    // Try format 3: method-based
    const auth3 = { method: 'auth', params: { token } }
    console.log('[send] Format 3 (method auth):', JSON.stringify(auth3))
    ws.send(JSON.stringify(auth3))
  }, 2000)

  setTimeout(() => {
    console.log('[timeout] Giving up after 15s')
    ws.close()
    process.exit(0)
  }, 7000)
}, 8000)
