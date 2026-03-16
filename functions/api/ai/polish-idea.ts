import { jsonData, jsonError, polishIdeaWithModel, readJson, type AiEnv } from '../../../server/aiProxy'

interface PolishIdeaRequest {
  text?: string
  modelId?: string
}

export async function onRequestPost(context: { request: Request; env: AiEnv }) {
  try {
    const body = await readJson<PolishIdeaRequest>(context.request)
    const text = typeof body.text === 'string' ? body.text.trim() : ''

    if (!text) return jsonError('400 text is required', 400)

    const data = await polishIdeaWithModel(
      context.env,
      text,
      typeof body.modelId === 'string' ? body.modelId : undefined
    )
    return jsonData(data)
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'AI 整理失败')
  }
}
