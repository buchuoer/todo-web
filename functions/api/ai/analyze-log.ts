import {
  analyzeLogWithModel,
  jsonData,
  jsonError,
  readJson,
  type AiEnv,
  type AnalyzeLogContext,
  type AnalyzeLogOptions,
  type ChatMessage,
  type LogAnalysisAction,
} from '../../../server/aiProxy'

interface AnalyzeLogRequest {
  text?: string
  actionType?: LogAnalysisAction
  context?: AnalyzeLogContext
  history?: ChatMessage[]
  followUp?: string
  modelId?: string
  options?: AnalyzeLogOptions
}

const isLogAnalysisAction = (value: unknown): value is LogAnalysisAction =>
  value === 'deep_dive' || value === 'critique' || value === 'organize'

export async function onRequestPost(context: { request: Request; env: AiEnv }) {
  try {
    const body = await readJson<AnalyzeLogRequest>(context.request)
    const text = typeof body.text === 'string' ? body.text.trim() : ''
    const followUp = typeof body.followUp === 'string' ? body.followUp : undefined

    if (!text) return jsonError('400 text is required', 400)
    if (!isLogAnalysisAction(body.actionType)) return jsonError('400 invalid actionType', 400)

    const data = await analyzeLogWithModel(
      context.env,
      text,
      body.actionType,
      body.context,
      body.history,
      followUp,
      typeof body.modelId === 'string' ? body.modelId : undefined,
      body.options
    )

    return jsonData(data)
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'AI 分析失败')
  }
}
