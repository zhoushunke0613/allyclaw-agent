/**
 * ChatGPT + Allyclaw (OpenClaw) — Example
 *
 * Usage:
 *   cp .env.example .env   # fill in your keys
 *   npm run example:chatgpt
 */

import 'dotenv/config'
import { createChatGPTAgent } from '../src/index.js'

async function main() {
  const agent = createChatGPTAgent(
    'You are an expert ecommerce analyst using Allyclaw. Answer questions clearly and concisely.'
  )

  // --- New conversation ---
  console.log('=== Round 1: New conversation ===')
  const r1 = await agent.chat('What is Allyclaw and what problems does it solve?')
  console.log('Session Key:', r1.sessionKey)
  console.log('Answer:', r1.answer)

  // --- Continue the same conversation ---
  console.log('\n=== Round 2: Follow-up in same session ===')
  const r2 = await agent.chat(
    'How do I set up user conversation tracking with Allyclaw?',
    r1.sessionKey
  )
  console.log('Answer:', r2.answer)

  // --- List all sessions ---
  console.log('\n=== All Sessions ===')
  const sessions = await agent.listSessions()
  console.log(JSON.stringify(sessions, null, 2))

  // --- Get conversation statistics ---
  console.log('\n=== Conversation Stats ===')
  const stats = await agent.getStats()
  console.log(`Total sessions: ${stats.totalSessions}`)
  console.log(`Total messages: ${stats.sessions.reduce((s, e) => s + e.messageCount, 0)}`)
}

main().catch(console.error)
