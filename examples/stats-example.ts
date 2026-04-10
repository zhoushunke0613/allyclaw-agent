/**
 * Allyclaw (OpenClaw) Conversation Statistics
 *
 * Usage:
 *   cp .env.example .env   # fill in gateway URL & token
 *   npm run example:stats
 */

import 'dotenv/config'
import { createAllyclawClient } from '../src/index.js'

async function main() {
  const client = createAllyclawClient()

  // --- 1. List sessions ---
  console.log('=== Sessions ===')
  const result = await client.listSessions(50)
  const sessions: any[] = result?.sessions ?? []
  console.log(`Found ${sessions.length} sessions\n`)

  for (const s of sessions) {
    const key = s.key ?? 'unknown'
    const model = s.model ?? '-'
    const tokens = s.tokenCount ?? '-'
    const ctx = s.contextTokens ?? '-'
    console.log(`  ${key}`)
    console.log(`    model: ${model}, tokens: ${tokens}/${ctx}`)
  }

  // --- 2. Per-session message counts ---
  console.log('\n=== Message Counts ===')
  const stats = await client.getConversationStats()

  for (const s of stats.sessions) {
    console.log(`  ${s.key}: ${s.messageCount} msgs (user: ${s.userMessages}, assistant: ${s.assistantMessages})`)
  }

  // --- 3. Summary ---
  console.log('\n=== Summary ===')
  console.log(`Total sessions:           ${stats.totalSessions}`)
  console.log(`Total messages:           ${stats.totalMessages}`)
  console.log(`  User messages:          ${stats.totalUserMessages}`)
  console.log(`  Assistant messages:     ${stats.totalAssistantMessages}`)
  console.log(`Avg messages/session:     ${stats.totalSessions ? (stats.totalMessages / stats.totalSessions).toFixed(1) : 0}`)
}

main().catch(console.error)
