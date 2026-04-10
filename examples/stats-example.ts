/**
 * Allyclaw (OpenClaw) Conversation Statistics — Example
 *
 * Usage:
 *   cp .env.example .env   # fill in your gateway URL & token
 *   npm run example:stats
 */

import 'dotenv/config'
import { createAllyclawClient } from '../src/index.js'

async function main() {
  const client = createAllyclawClient()

  // --- 1. Health check ---
  console.log('=== Gateway Health ===')
  try {
    const health = await client.health()
    console.log(`Status: ${health.ok ? '✅ OK' : '❌ Error'}`)
    console.log(`Sessions: ${health.sessions?.count ?? 'N/A'}`)
    console.log(`Agents: ${health.agents?.length ?? 0}`)
  } catch (err) {
    console.error('Health check failed:', err)
  }

  // --- 2. List all sessions ---
  console.log('\n=== All Sessions ===')
  const sessions = await client.listSessions({ limit: 50 })
  console.log(JSON.stringify(sessions, null, 2))

  // --- 3. Conversation statistics ---
  console.log('\n=== Conversation Statistics ===')
  const stats = await client.getConversationStats()
  console.log(`Total sessions: ${stats.totalSessions}`)

  for (const s of stats.sessions) {
    console.log(`\n  Session: ${s.key}`)
    console.log(`  Messages: ${s.messageCount}`)

    // Count by role
    const userMsgs = s.messages.filter(m => m.role === 'user').length
    const assistantMsgs = s.messages.filter(m => m.role === 'assistant').length
    console.log(`    User messages: ${userMsgs}`)
    console.log(`    Assistant messages: ${assistantMsgs}`)
  }

  // --- 4. Summary ---
  const totalMessages = stats.sessions.reduce((sum, s) => sum + s.messageCount, 0)
  const totalUserMsgs = stats.sessions.reduce(
    (sum, s) => sum + s.messages.filter(m => m.role === 'user').length, 0
  )
  const totalAssistantMsgs = stats.sessions.reduce(
    (sum, s) => sum + s.messages.filter(m => m.role === 'assistant').length, 0
  )

  console.log('\n=== Summary ===')
  console.log(`Total sessions:           ${stats.totalSessions}`)
  console.log(`Total messages:           ${totalMessages}`)
  console.log(`  User messages:          ${totalUserMsgs}`)
  console.log(`  Assistant messages:     ${totalAssistantMsgs}`)
  console.log(`Avg messages per session: ${stats.totalSessions ? (totalMessages / stats.totalSessions).toFixed(1) : 0}`)

  // --- 5. Available models ---
  console.log('\n=== Available Models ===')
  try {
    const models = await client.listModels()
    for (const m of models.models ?? []) {
      console.log(`  - ${JSON.stringify(m)}`)
    }
  } catch {
    console.log('  (could not fetch models)')
  }
}

main().catch(console.error)
