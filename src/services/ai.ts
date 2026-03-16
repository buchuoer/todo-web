export type LogAnalysisAction = 'deep_dive' | 'critique' | 'organize'
export interface LogAnalysisMessage {
  role: 'user' | 'assistant'
  content: string
}
export interface LogAnalysisOptions {
  useWebSearch?: boolean
  forceWebSearch?: boolean
}
export interface LogAnalysisResult {
  content: string
  usedWebSearch: boolean
}

interface AiResponse<T> {
  data: T
  error?: string
}

interface ExtractedTodo {
  text: string
  deadline?: string | null
  category: string
}

const AI_API_BASE = '/api/ai'

async function requestAi<T>(path: string, payload: unknown): Promise<T> {
  let response: Response

  try {
    response = await fetch(`${AI_API_BASE}/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (error) {
    if (error instanceof Error) throw error
    throw new Error('AI 请求失败')
  }

  const contentType = response.headers.get('content-type') || ''
  const isJson = contentType.includes('application/json')
  const payloadData = isJson
    ? await response.json() as AiResponse<T>
    : ({ error: await response.text() } as AiResponse<T>)

  if (!response.ok) {
    const message = typeof payloadData?.error === 'string' && payloadData.error.trim()
      ? payloadData.error.trim()
      : 'AI 请求失败'
    throw new Error(`${response.status} ${message}`)
  }

  if (!payloadData || typeof payloadData !== 'object' || !('data' in payloadData)) {
    throw new Error('AI 响应格式无效')
  }

  return payloadData.data
}

/**
 * 从文本中提取待办任务（高级版）
 * 支持自然语言日期、优先级检测、智能分类
 */
export async function extractTodos(text: string, categories?: string[]) {
  return requestAi<ExtractedTodo[]>('extract-todos', { text, categories })
}

/**
 * 与 AI 对话（增强版 - 支持待办上下文）
 */
export async function chatWithAI(
  text: string,
  history?: { role: 'user' | 'assistant'; content: string }[],
  todoContext?: string
) {
  return requestAi<string>('chat', { text, history, todoContext })
}

export async function analyzeLogWithAI(
  text: string,
  actionType: LogAnalysisAction,
  context?: { todoContext?: string; recentLogs?: string },
  history?: LogAnalysisMessage[],
  followUp?: string,
  options?: LogAnalysisOptions
): Promise<LogAnalysisResult> {
  return requestAi<LogAnalysisResult>('analyze-log', {
    text,
    actionType,
    context,
    history,
    followUp,
    options,
  })
}

/**
 * 将凌乱的想法整理成结构化的笔记
 */
export async function polishIdea(text: string) {
  return requestAi<string>('polish-idea', { text })
}
