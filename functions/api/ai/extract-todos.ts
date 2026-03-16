import { extractTodosWithModel, jsonData, jsonError, readJson, type AiEnv } from '../../../server/aiProxy'

interface ExtractTodosRequest {
  text?: string
  categories?: string[]
  modelId?: string
}

export async function onRequestPost(context: { request: Request; env: AiEnv }) {
  try {
    const body = await readJson<ExtractTodosRequest>(context.request)
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    const categories = Array.isArray(body.categories)
      ? body.categories.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : undefined

    if (!text) return jsonError('400 text is required', 400)

    const data = await extractTodosWithModel(
      context.env,
      text,
      categories,
      typeof body.modelId === 'string' ? body.modelId : undefined
    )
    return jsonData(data)
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'AI 提取失败')
  }
}
