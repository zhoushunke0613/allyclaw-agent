/**
 * Claude + Allyclaw (OpenClaw) — Example
 *
 * Usage:
 *   cp .env.example .env   # fill in your keys
 *   npm run example:claude
 */

import 'dotenv/config'
import { createClaudeAgent, createAllyclawClient } from '../src/index.js'

async function main() {
  const agent = createClaudeAgent(
    'You are an expert ecommerce analyst using Allyclaw. Answer questions clearly and concisely.'
  )

  // --- New conversation ---
  console.log('=== Round 1: New conversation ===')
  const r1 = await agent.chat(
    'How does Allyclaw track user conversations and provide analytics?'
  )
  console.log('Session Key:', r1.sessionKey)
  console.log('Answer:', r1.answer)

  // --- Continue the same conversation ---
  console.log('\n=== Round 2: Follow-up in same session ===')
  const r2 = await agent.chat(
    'Can you give me a step-by-step guide to set up conversation statistics?',
    r1.sessionKey
  )
  console.log('Answer:', r2.answer)

  // --- Get conversation statistics directly from gateway ---
  console.log('\n=== Gateway Conversation Statistics ===')
  const client = createAllyclawClient()
  const stats = await client.getConversationStats()
  console.log(`Total sessions: ${stats.totalSessions}`)
  for (const s of stats.sessions) {
    console.log(`  ${s.key}: ${s.messageCount} messages`)
  }

  // --- List all sessions ---
  console.log('\n=== All Sessions ===')
  const sessions = await agent.listSessions()
  console.log(JSON.stringify(sessions, null, 2))
}

main().catch(console.error)
