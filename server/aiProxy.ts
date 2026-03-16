export interface AiEnv {
  DEEPSEEK_API_KEY?: string
  DEEPSEEK_BASE_URL?: string
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
  OPENAI_MODEL?: string
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ExtractedTodo {
  text: string
  deadline?: string | null
  category: string
}

export interface AnalyzeLogContext {
  todoContext?: string
  recentLogs?: string
}

export interface AnalyzeLogOptions {
  useWebSearch?: boolean
  forceWebSearch?: boolean
}

export type LogAnalysisAction = 'deep_dive' | 'critique' | 'organize'

export interface LogAnalysisResult {
  content: string
  usedWebSearch: boolean
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
}

interface OpenAiResponse {
  output_text?: string
  output?: Array<{
    type?: string
    content?: Array<{
      type?: string
      text?: string
    }>
  }>
  error?: {
    message?: string
  }
}

const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1'
const DEFAULT_OPENAI_MODEL = 'gpt-4.1-mini'
const DEFAULT_TODO_CATEGORY = '生活'
const OPENAI_WEB_SEARCH_TOOL = 'web_search_preview'

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const actionPromptMap: Record<LogAnalysisAction, string> = {
  deep_dive: `请像一个敏锐但不说教的老师兼伙伴，帮助用户把这条日志继续想深。

输出要求：
1. 先给出一句核心判断
2. 再给出 2-3 个最值得继续追问的问题
3. 最后给出一个具体、可执行的下一步
4. 不要复述整段原文，不要空泛鼓励`,
  critique: `请直接指出这条日志里可能存在的问题，但保持克制和尊重。

输出要求：
1. 先指出最关键的 1-3 个问题或盲点
2. 说明为什么这可能是问题
3. 给出用户可以如何验证或修正
4. 优先关注逻辑漏洞、认知偏差、遗漏前提、目标与行动不一致`,
  organize: `请把这条日志整理成更清晰的结构，方便用户后续继续思考或行动。

输出格式：
主题：
关键观点：
待验证点：
下一步：

要求简洁、结构清晰、有实际用途。`
}

function getRequiredEnv(value: string | undefined, name: string): string {
  if (!value || !value.trim()) {
    throw new Error(`${name} missing`)
  }
  return value.trim()
}

function buildApiUrl(baseUrl: string, path: string): string {
  return new URL(path.replace(/^\//, ''), `${baseUrl.replace(/\/+$/, '')}/`).toString()
}

async function postJson<T>(url: string, apiKey: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  const rawText = await response.text()
  const payload = rawText ? tryParseJson(rawText) : null

  if (!response.ok) {
    const errorMessage = getErrorMessage(payload) || rawText || 'AI request failed'
    throw new Error(`${response.status} ${errorMessage}`)
  }

  return payload as T
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function getErrorMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null

  const errorValue = (payload as { error?: unknown }).error
  if (typeof errorValue === 'string' && errorValue.trim()) {
    return errorValue.trim()
  }

  if (errorValue && typeof errorValue === 'object') {
    const message = (errorValue as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) {
      return message.trim()
    }
  }

  const message = (payload as { message?: unknown }).message
  if (typeof message === 'string' && message.trim()) {
    return message.trim()
  }

  return null
}

function getChatContent(response: ChatCompletionResponse): string {
  return response.choices?.[0]?.message?.content?.trim() || ''
}

function getResponseText(response: OpenAiResponse): string {
  if (response.output_text?.trim()) return response.output_text.trim()

  const outputText = response.output
    ?.flatMap(item => item.content || [])
    .filter(content => content.type === 'output_text' && typeof content.text === 'string')
    .map(content => content.text?.trim() || '')
    .filter(Boolean)
    .join('\n\n')

  return outputText || ''
}

function detectWebSearchUsage(response: OpenAiResponse): boolean {
  return Array.isArray(response.output) && response.output.some(item => item.type === 'web_search_call')
}

function getTodayContext(): string {
  const now = new Date()
  return `${now.toISOString().split('T')[0]}（${WEEKDAY_LABELS[now.getDay()]}）`
}

function buildExtractPrompt(categories?: string[]): string {
  const resolvedCategories = categories && categories.length > 0 ? categories.join('、') : '工作、学习、生活'
  const defaultCategory = categories?.[0] || '学习'

  return `你是一个智能任务管理助手。请从用户的描述中提取待办任务。

规则：
1. 智能识别时间信息：
   - "今天/明天/后天" → 具体日期
   - "下周一/下周三" → 计算为具体日期
   - "X号/X日" → 当月或下月的具体日期
   - "月底" → 当月最后一天
   - "下个月" → 下月15号
   - 如果没有明确时间，deadline 设为 null
2. 所有日期格式为 YYYY-MM-DD
3. 根据任务内容智能分类：${resolvedCategories}
   - 根据任务内容的关键词进行智能分类
4. 返回 JSON 数组：[{"text": "任务描述", "deadline": "2024-01-15", "category": "${defaultCategory}"}, ...]
5. 只返回 JSON，不要任何解释文字
6. 任务描述应简洁清晰，去除口语化表达

今天是 ${getTodayContext()}`
}

function buildChatPrompt(todoContext?: string): string {
  return `你是一个精简高效的个人助理，名叫 Minimus。请用简洁、友好的方式回答用户的问题。

你的特殊能力：
- 你可以看到用户的待办事项列表，帮助他们管理任务
- 当用户询问任务相关问题时，参考他们的待办列表给出建议
- 你可以帮助用户分析任务优先级、时间安排
- 回答时使用中文，保持简洁有用${todoContext ? `\n\n📋 用户当前的待办事项：\n${todoContext}` : ''}`
}

function buildLogAnalysisPrompt(actionType: LogAnalysisAction, context?: AnalyzeLogContext): string {
  const extraContext = [
    context?.recentLogs ? `用户最近的其他日志：\n${context.recentLogs}` : '',
    context?.todoContext ? `用户当前的待办事项：\n${context.todoContext}` : '',
  ].filter(Boolean).join('\n\n')

  return `你是 Minimus 的 AI 伙伴。你的职责不是附和用户，而是帮助用户把想法想清楚、想全面、想深入。

原则：
- 使用中文回答
- 保持简洁、具体、可执行
- 可以指出错误，但不要攻击用户
- 优先给出新的视角，而不是重复原话
- 尽量结合用户已有日志和待办理解处境

${actionPromptMap[actionType]}${extraContext ? `\n\n补充上下文：\n${extraContext}` : ''}`
}

function parseExtractedTodos(content: string, fallbackText: string): ExtractedTodo[] {
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    if (!jsonMatch) return buildFallbackTodos(fallbackText)
    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) return buildFallbackTodos(fallbackText)

    const todos = parsed
      .map(item => {
        if (!item || typeof item !== 'object') return null
        const text = typeof (item as { text?: unknown }).text === 'string'
          ? (item as { text: string }).text.trim()
          : ''
        const category = typeof (item as { category?: unknown }).category === 'string'
          ? (item as { category: string }).category.trim()
          : DEFAULT_TODO_CATEGORY
        const deadline = (item as { deadline?: unknown }).deadline
        if (!text) return null
        return {
          text,
          deadline: typeof deadline === 'string' && deadline.trim() ? deadline.trim() : null,
          category: category || DEFAULT_TODO_CATEGORY,
        }
      })
      .filter((item): item is ExtractedTodo => Boolean(item))

    return todos.length > 0 ? todos : buildFallbackTodos(fallbackText)
  } catch {
    return buildFallbackTodos(fallbackText)
  }
}

function buildFallbackTodos(text: string): ExtractedTodo[] {
  return [{
    text,
    deadline: null,
    category: DEFAULT_TODO_CATEGORY,
  }]
}

function sanitizeChatHistory(history?: ChatMessage[]): ChatMessage[] {
  if (!Array.isArray(history)) return []
  return history.filter(
    message =>
      (message?.role === 'user' || message?.role === 'assistant') &&
      typeof message.content === 'string' &&
      message.content.trim().length > 0
  )
}

export async function extractTodosWithDeepSeek(
  env: AiEnv,
  text: string,
  categories?: string[]
): Promise<ExtractedTodo[]> {
  const apiKey = getRequiredEnv(env.DEEPSEEK_API_KEY, 'DeepSeek API key')
  const response = await postJson<ChatCompletionResponse>(
    buildApiUrl(env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL, 'chat/completions'),
    apiKey,
    {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: buildExtractPrompt(categories) },
        { role: 'user', content: text },
      ],
    }
  )

  return parseExtractedTodos(getChatContent(response) || '[]', text)
}

export async function chatWithDeepSeek(
  env: AiEnv,
  text: string,
  history?: ChatMessage[],
  todoContext?: string
): Promise<string> {
  const apiKey = getRequiredEnv(env.DEEPSEEK_API_KEY, 'DeepSeek API key')
  const response = await postJson<ChatCompletionResponse>(
    buildApiUrl(env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL, 'chat/completions'),
    apiKey,
    {
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: buildChatPrompt(todoContext) },
        ...sanitizeChatHistory(history),
        { role: 'user', content: text },
      ],
    }
  )

  return getChatContent(response)
}

export async function analyzeLogWithOpenAI(
  env: AiEnv,
  text: string,
  actionType: LogAnalysisAction,
  context?: AnalyzeLogContext,
  history?: ChatMessage[],
  followUp?: string,
  options?: AnalyzeLogOptions
): Promise<LogAnalysisResult> {
  const apiKey = getRequiredEnv(env.OPENAI_API_KEY, 'OpenAI API key')
  const useWebSearch = Boolean(options?.useWebSearch)
  const forceWebSearch = Boolean(options?.forceWebSearch)
  const response = await postJson<OpenAiResponse>(
    buildApiUrl(env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL, 'responses'),
    apiKey,
    {
      model: env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL,
      instructions: `${buildLogAnalysisPrompt(actionType, context)}\n\n当前聚焦的原始日志：\n${text}`,
      input: [
        ...sanitizeChatHistory(history),
        {
          role: 'user',
          content: followUp
            ? `请继续围绕原始日志回应这次追问：\n${followUp}`
            : '请先对这条日志给出第一轮分析。',
        },
      ],
      temperature: 0.7,
      truncation: 'auto',
      ...(useWebSearch ? {
        tools: [{
          type: OPENAI_WEB_SEARCH_TOOL,
          search_context_size: 'medium',
        }],
        tool_choice: forceWebSearch ? { type: OPENAI_WEB_SEARCH_TOOL } : 'auto',
      } : {}),
    }
  )

  return {
    content: getResponseText(response) || 'AI 暂时没有给出内容，请稍后重试。',
    usedWebSearch: detectWebSearchUsage(response),
  }
}

export async function polishIdeaWithDeepSeek(env: AiEnv, text: string): Promise<string> {
  const apiKey = getRequiredEnv(env.DEEPSEEK_API_KEY, 'DeepSeek API key')
  const response = await postJson<ChatCompletionResponse>(
    buildApiUrl(env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL, 'chat/completions'),
    apiKey,
    {
      model: 'deepseek-chat',
      messages: [
        {
          role: 'system',
          content: '你是一个精简高效的个人助理。请将用户杂乱的想法整理成结构化、美观的 Markdown 笔记，并添加合适的 Emoji。',
        },
        { role: 'user', content: text },
      ],
    }
  )

  return getChatContent(response)
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T
  } catch {
    throw new Error('400 请求体不是合法 JSON')
  }
}

export function jsonData<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

export function jsonError(error: string, status = 500): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}
