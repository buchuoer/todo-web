import { jsonData, jsonError, listAvailableModels, type AiEnv } from '../../../server/aiProxy'

export async function onRequestGet(context: { env: AiEnv }) {
  try {
    return jsonData(listAvailableModels(context.env))
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'AI 模型读取失败')
  }
}
