/**
 * Debug WebSocket connection to OpenClaw Gateway
 * Tries multiple auth frame formats to find the correct one
 */
import 'dotenv/config'
import WebSocket from 'ws'

const url = process.env.ALLYCLAW_GATEWAY_URL!.replace(/^http/, 'ws')
const token = process.env.ALLYCLAW_TOKEN!

interface AuthFormat {
  name: string
  build: (nonce: string) => unknown
}

const formats: AuthFormat[] = [
  {
    name: 'Format A: {type:"request", id, method:"connect.auth", params:{token,nonce}}',
    build: (nonce) => ({ type: 'request', id: 1, method: 'connect.auth', params: { token, nonce, clientName: 'allyclaw-agent', mode: 'webchat' } }),
  },
  {
    name: 'Format B: {id, method:"connect.auth", params:{token,nonce}}',
    build: (nonce) => ({ id: 1, method: 'connect.auth', params: { token, nonce, clientName: 'allyclaw-agent', mode: 'webchat' } }),
  },
  {
    name: 'Format C: {type:"connect.auth", token, nonce}',
    build: (nonce) => ({ type: 'connect.auth', token, nonce, clientName: 'allyclaw-agent', mode: 'webchat' }),
  },
  {
    name: 'Format D: {type:"request", id, method:"connect.response", params:{token,nonce}}',
    build: (nonce) => ({ type: 'request', id: 1, method: 'connect.response', params: { token, nonce, clientName: 'allyclaw-agent', mode: 'webchat' } }),
  },
  {
    name: 'Format E: {action:"auth", token, nonce}',
    build: (nonce) => ({ action: 'auth', token, nonce }),
  },
  {
    name: 'Format F: {type:"auth", payload:{token,nonce}}',
    build: (nonce) => ({ type: 'auth', payload: { token, nonce, clientName: 'allyclaw-agent', mode: 'webchat' } }),
  },
  {
    name: 'Format G: {type:"connect.response", token, nonce} (flat)',
    build: (nonce) => ({ type: 'connect.response', token, nonce, clientName: 'allyclaw-agent', mode: 'webchat' }),
  },
  {
    name: 'Format H: {type:"rpc", id, method:"connect.auth", params:{token,nonce}}',
    build: (nonce) => ({ type: 'rpc', id: 1, method: 'connect.auth', params: { token, nonce } }),
  },
]

function tryFormat(fmt: AuthFormat): Promise<string> {
  return new Promise((resolve) => {
    const ws = new WebSocket(url)
    let done = false
    const timer = setTimeout(() => { if (!done) { done = true; ws.close(); resolve('TIMEOUT (no response)') } }, 5000)

    ws.on('message', (data) => {
      if (done) return
      const msg = JSON.parse(data.toString())
      if (msg.event === 'connect.challenge') {
        const nonce = msg.payload?.nonce
        const auth = fmt.build(nonce)
        ws.send(JSON.stringify(auth))
        return
      }
      if (msg.event === 'hello') {
        done = true; clearTimeout(timer); ws.close()
        resolve('SUCCESS! Got hello: ' + JSON.stringify(msg).slice(0, 200))
        return
      }
      // Any other message
      done = true; clearTimeout(timer); ws.close()
      resolve('Got: ' + JSON.stringify(msg).slice(0, 200))
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
  console.log('Testing auth formats against', url, '\n')
  for (const fmt of formats) {
    const result = await tryFormat(fmt)
    const ok = result.startsWith('SUCCESS') ? '✅' : '❌'
    console.log(`${ok} ${fmt.name}`)
    console.log(`   → ${result}\n`)
    if (result.startsWith('SUCCESS')) {
      console.log('Found working format! Stopping.')
      break
    }
  }
}

main().catch(console.error)
