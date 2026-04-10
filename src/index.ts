import 'dotenv/config'
import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { AllyclawClient } from './allyclaw/client.js'
import { ChatGPTAgent } from './agents/chatgpt-agent.js'
import { ClaudeAgent } from './agents/claude-agent.js'

function requireEnv(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing env var: ${key}`)
  return val
}

export function createAllyclawClient() {
  return new AllyclawClient({
    gatewayUrl: requireEnv('ALLYCLAW_GATEWAY_URL'),
    token: requireEnv('ALLYCLAW_TOKEN'),
  })
}

export function createChatGPTAgent(systemPrompt?: string) {
  const openai = new OpenAI({ apiKey: requireEnv('OPENAI_API_KEY') })
  const allyclaw = createAllyclawClient()
  return new ChatGPTAgent({
    openai,
    allyclaw,
    model: process.env.OPENAI_MODEL,
    systemPrompt,
  })
}

export function createClaudeAgent(systemPrompt?: string) {
  const anthropic = new Anthropic({ apiKey: requireEnv('ANTHROPIC_API_KEY') })
  const allyclaw = createAllyclawClient()
  return new ClaudeAgent({
    anthropic,
    allyclaw,
    model: process.env.ANTHROPIC_MODEL,
    systemPrompt,
  })
}

export { AllyclawClient, ChatGPTAgent, ClaudeAgent }
