/**
 * Debug: try many method names + param combos with the valid frame format
 * Format B ({id, method, params}) was accepted — now find the right method
 */
import 'dotenv/config'
import WebSocket from 'ws'
import crypto from 'crypto'

const url = process.env.ALLYCLAW_GATEWAY_URL!.replace(/^http/, 'ws')
const token = process.env.ALLYCLAW_TOKEN!

interface Attempt { name: string; build: (nonce: string) => unknown }

const attempts: Attempt[] = [
  // Different method names
  { name: 'method: "auth"', build: (n) => ({ id: 1, method: 'auth', params: { token, nonce: n } }) },
  { name: 'method: "connect"', build: (n) => ({ id: 1, method: 'connect', params: { token, nonce: n } }) },
  { name: 'method: "connect.resolve"', build: (n) => ({ id: 1, method: 'connect.resolve', params: { token, nonce: n } }) },
  { name: 'method: "connect.verify"', build: (n) => ({ id: 1, method: 'connect.verify', params: { token, nonce: n } }) },
  { name: 'method: "connect.response"', build: (n) => ({ id: 1, method: 'connect.response', params: { token, nonce: n } }) },
  { name: 'method: "authenticate"', build: (n) => ({ id: 1, method: 'authenticate', params: { token, nonce: n } }) },
  // Password instead of token
  { name: 'password field', build: (n) => ({ id: 1, method: 'connect.auth', params: { password: token, nonce: n } }) },
  { name: 'credential field', build: (n) => ({ id: 1, method: 'connect.auth', params: { credential: token, nonce: n } }) },
  // HMAC proof
  { name: 'HMAC proof', build: (n) => {
    const proof = crypto.createHmac('sha256', token).update(n).digest('hex')
    return { id: 1, method: 'connect.auth', params: { proof, nonce: n } }
  }},
  { name: 'HMAC as token', build: (n) => {
    const hmac = crypto.createHmac('sha256', token).update(n).digest('hex')
    return { id: 1, method: 'connect.auth', params: { token: hmac, nonce: n } }
  }},
  // Try sending token at top level
  { name: 'token at top level', build: (n) => ({ id: 1, method: 'connect.auth', token, params: { nonce: n } }) },
  // Try just the health method directly (skip auth?)
  { name: 'skip auth: health directly', build: (_n) => ({ id: 1, method: 'health', params: {} }) },
]

function tryAttempt(a: Attempt): Promise<string> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url)
    let done = false
    const timer = setTimeout(() => { if (!done) { done = true; ws.close(); resolve('TIMEOUT') } }, 4000)

    ws.on('message', (data) => {
      if (done) return
      const msg = JSON.parse(data.toString())
      if (msg.event === 'connect.challenge') {
        const nonce = msg.payload?.nonce
        const auth = a.build(nonce)
        ws.send(JSON.stringify(auth))
        return
      }
      // Any response
      done = true; clearTimeout(timer); ws.close()
      const str = JSON.stringify(msg)
      resolve(msg.event === 'hello' ? `SUCCESS! ${str.slice(0, 300)}` : `Got: ${str.slice(0, 300)}`)
    })

    ws.on('close', (code, reason) => {
      if (!done) { done = true; clearTimeout(timer); resolve(`CLOSED: ${code} ${reason.toString()}`) }
    })
    ws.on('error', (err) => {
      if (!done) { done = true; clearTimeout(timer); resolve('ERROR: ' + err.message) }
    })
  })
}

async function main() {
  console.log('Testing methods against', url, '\n')
  for (const a of attempts) {
    const result = await tryAttempt(a)
    const ok = result.startsWith('SUCCESS') ? '✅' : result === 'TIMEOUT' ? '⏳' : '❌'
    console.log(`${ok} ${a.name}`)
    console.log(`   → ${result}\n`)
    if (result.startsWith('SUCCESS')) { console.log('FOUND IT!'); break }
  }
}

main().catch(console.error)
