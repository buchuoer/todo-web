import { jsonData, jsonError, polishIdeaWithDeepSeek, readJson, type AiEnv } from '../../../server/aiProxy'

interface PolishIdeaRequest {
  text?: string
}

export async function onRequestPost(context: { request: Request; env: AiEnv }) {
  try {
    const body = await readJson<PolishIdeaRequest>(context.request)
    const text = typeof body.text === 'string' ? body.text.trim() : ''

    if (!text) return jsonError('400 text is required', 400)

    const data = await polishIdeaWithDeepSeek(context.env, text)
    return jsonData(data)
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'AI 整理失败')
  }
}
