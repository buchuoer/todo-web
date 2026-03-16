import { chatWithModel, jsonData, jsonError, readJson, type AiEnv, type ChatMessage } from '../../../server/aiProxy'

interface ChatRequest {
  text?: string
  history?: ChatMessage[]
  todoContext?: string
  modelId?: string
  options?: {
    useWebSearch?: boolean
    reasoningEnabled?: boolean
  }
}

export async function onRequestPost(context: { request: Request; env: AiEnv }) {
  try {
    const body = await readJson<ChatRequest>(context.request)
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    const todoContext = typeof body.todoContext === 'string' ? body.todoContext : undefined

    if (!text) return jsonError('400 text is required', 400)

    const data = await chatWithModel(
      context.env,
      text,
      body.history,
      todoContext,
      typeof body.modelId === 'string' ? body.modelId : undefined,
      body.options
    )
    return jsonData(data)
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'AI 对话失败')
  }
}
