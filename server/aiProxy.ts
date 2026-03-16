export interface AiEnv {
  DEEPSEEK_API_KEY?: string
  DEEPSEEK_BASE_URL?: string
  DEEPSEEK_MODEL?: string
  DEEPSEEK_CHAT_MODEL?: string
  DEEPSEEK_LOG_MODEL?: string
  DEEPSEEK_EXTRACT_MODEL?: string
  DEEPSEEK_POLISH_MODEL?: string
  DEEPSEEK_REASONING_MODEL?: string
  DEEPSEEK_CHAT_REASONING_MODEL?: string
  DEEPSEEK_LOG_REASONING_MODEL?: string
  GEMINI_API_KEY?: string
  GEMINI_BASE_URL?: string
  GEMINI_MODEL?: string
  GEMINI_CHAT_MODEL?: string
  GEMINI_LOG_MODEL?: string
  GEMINI_EXTRACT_MODEL?: string
  GEMINI_POLISH_MODEL?: string
  GEMINI_REASONING_MODEL?: string
  GEMINI_CHAT_REASONING_MODEL?: string
  GEMINI_LOG_REASONING_MODEL?: string
  KIMI_API_KEY?: string
  KIMI_BASE_URL?: string
  KIMI_MODEL?: string
  KIMI_CHAT_MODEL?: string
  KIMI_LOG_MODEL?: string
  KIMI_EXTRACT_MODEL?: string
  KIMI_POLISH_MODEL?: string
  KIMI_REASONING_MODEL?: string
  KIMI_CHAT_REASONING_MODEL?: string
  KIMI_LOG_REASONING_MODEL?: string
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
  reasoningEnabled?: boolean
}

export type LogAnalysisAction = 'deep_dive' | 'critique' | 'organize'
export type AiFeature = 'chat' | 'logAnalysis' | 'extractTodos' | 'polishIdea'
export type AiProvider = 'deepseek' | 'gemini' | 'kimi'
export type AiModelId = 'deepseek' | 'gemini' | 'kimi'

export interface AiFeatureCapability {
  supportsReasoning: boolean
  supportsWebSearch: boolean
  isDefault: boolean
}

export interface AiModelDescriptor {
  id: AiModelId
  label: string
  provider: AiProvider
  features: Partial<Record<AiFeature, AiFeatureCapability>>
}

export interface LogAnalysisResult {
  content: string
  usedWebSearch: boolean
  modelId: AiModelId
  modelLabel: string
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | null
    }
  }>
}

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
      }>
    }
    groundingMetadata?: {
      groundingChunks?: unknown[]
      webSearchQueries?: string[]
    }
  }>
  error?: {
    message?: string
  }
}

interface GenerateTextOptions {
  feature: AiFeature
  systemPrompt: string
  userText: string
  history?: ChatMessage[]
  useWebSearch?: boolean
  reasoningEnabled?: boolean
  temperature?: number
}

const DEFAULT_DEEPSEEK_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const DEFAULT_KIMI_BASE_URL = 'https://api.moonshot.cn/v1'
const DEFAULT_DEEPSEEK_MODEL = 'deepseek-chat'
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash'
const DEFAULT_TODO_CATEGORY = '生活'
const GEMINI_REASONING_BUDGET = 1024

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

function hasText(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function getRequiredEnv(value: string | undefined, name: string): string {
  if (!hasText(value)) {
    throw new Error(`${name} missing`)
  }
  return value.trim()
}

function buildApiUrl(baseUrl: string, path: string): string {
  return new URL(path.replace(/^\//, ''), `${baseUrl.replace(/\/+$/, '')}/`).toString()
}

async function postJson<T>(
  url: string,
  apiKey: string,
  body: unknown,
  extraHeaders?: Record<string, string>,
  useBearerAuth = true
): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
      ...(useBearerAuth && !extraHeaders?.Authorization ? { Authorization: `Bearer ${apiKey}` } : {}),
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

function getGeminiText(response: GeminiGenerateContentResponse): string {
  const parts = response.candidates?.[0]?.content?.parts || []
  return parts
    .map(part => part.text?.trim() || '')
    .filter(Boolean)
    .join('\n\n')
}

function detectGeminiWebSearch(response: GeminiGenerateContentResponse, requested: boolean): boolean {
  const candidate = response.candidates?.[0]
  if (!candidate) return requested
  return requested && Boolean(
    candidate.groundingMetadata?.groundingChunks?.length ||
    candidate.groundingMetadata?.webSearchQueries?.length
  )
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
      .map((item): ExtractedTodo | null => {
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

function createFeatureCapability(
  supportsWebSearch: boolean,
  supportsReasoning: boolean
): AiFeatureCapability {
  return {
    supportsReasoning,
    supportsWebSearch,
    isDefault: false,
  }
}

function withDefaults(models: AiModelDescriptor[]): AiModelDescriptor[] {
  const featureOrder: Record<AiFeature, AiModelId[]> = {
    chat: ['deepseek', 'gemini', 'kimi'],
    logAnalysis: ['gemini', 'kimi', 'deepseek'],
    extractTodos: ['deepseek', 'gemini', 'kimi'],
    polishIdea: ['deepseek', 'gemini', 'kimi'],
  }

  const cloned = models.map(model => ({
    ...model,
    features: Object.fromEntries(
      Object.entries(model.features).map(([key, capability]) => [key, { ...capability! }])
    ) as AiModelDescriptor['features']
  }))

  ;(Object.keys(featureOrder) as AiFeature[]).forEach(feature => {
    const defaultModelId = featureOrder[feature].find(modelId => cloned.some(model => model.id === modelId && model.features[feature]))
    if (!defaultModelId) return
    const target = cloned.find(model => model.id === defaultModelId)
    if (target?.features[feature]) {
      target.features[feature]!.isDefault = true
    }
  })

  return cloned
}

function getEnabledModels(env: AiEnv): AiModelDescriptor[] {
  const models: AiModelDescriptor[] = []

  if (hasText(env.DEEPSEEK_API_KEY)) {
    const supportsReasoning = hasText(env.DEEPSEEK_REASONING_MODEL) || hasText(env.DEEPSEEK_CHAT_REASONING_MODEL) || hasText(env.DEEPSEEK_LOG_REASONING_MODEL)
    models.push({
      id: 'deepseek',
      label: 'DeepSeek',
      provider: 'deepseek',
      features: {
        chat: createFeatureCapability(false, supportsReasoning),
        logAnalysis: createFeatureCapability(false, supportsReasoning),
        extractTodos: createFeatureCapability(false, false),
        polishIdea: createFeatureCapability(false, false),
      }
    })
  }

  if (hasText(env.GEMINI_API_KEY)) {
    models.push({
      id: 'gemini',
      label: 'Gemini',
      provider: 'gemini',
      features: {
        chat: createFeatureCapability(true, true),
        logAnalysis: createFeatureCapability(true, true),
        extractTodos: createFeatureCapability(false, false),
        polishIdea: createFeatureCapability(false, false),
      }
    })
  }

  const hasKimiModels = [
    env.KIMI_MODEL,
    env.KIMI_CHAT_MODEL,
    env.KIMI_LOG_MODEL,
    env.KIMI_EXTRACT_MODEL,
    env.KIMI_POLISH_MODEL,
  ].some(hasText)

  if (hasText(env.KIMI_API_KEY) && hasKimiModels) {
    const supportsReasoning = hasText(env.KIMI_REASONING_MODEL) || hasText(env.KIMI_CHAT_REASONING_MODEL) || hasText(env.KIMI_LOG_REASONING_MODEL)
    models.push({
      id: 'kimi',
      label: 'Kimi',
      provider: 'kimi',
      features: {
        chat: createFeatureCapability(false, supportsReasoning),
        logAnalysis: createFeatureCapability(false, supportsReasoning),
        extractTodos: createFeatureCapability(false, false),
        polishIdea: createFeatureCapability(false, false),
      }
    })
  }

  return withDefaults(models)
}

function getFeatureCapability(model: AiModelDescriptor, feature: AiFeature): AiFeatureCapability | null {
  return model.features[feature] || null
}

function resolveModel(env: AiEnv, requestedModelId: string | undefined, feature: AiFeature): AiModelDescriptor {
  const models = getEnabledModels(env)
  if (models.length === 0) {
    throw new Error('No AI providers configured')
  }

  if (requestedModelId) {
    const requested = models.find(model => model.id === requestedModelId)
    if (!requested) throw new Error(`Unsupported model: ${requestedModelId}`)
    if (!getFeatureCapability(requested, feature)) throw new Error(`Model ${requested.label} does not support ${feature}`)
    return requested
  }

  const defaultModel = models.find(model => model.features[feature]?.isDefault)
  if (defaultModel) return defaultModel

  const firstAvailable = models.find(model => getFeatureCapability(model, feature))
  if (!firstAvailable) {
    throw new Error(`No AI providers support ${feature}`)
  }
  return firstAvailable
}

function resolveProviderModelName(
  env: AiEnv,
  provider: AiProvider,
  feature: AiFeature,
  reasoningEnabled: boolean
): string {
  switch (provider) {
    case 'deepseek': {
      if (feature === 'chat') {
        return reasoningEnabled
          ? env.DEEPSEEK_CHAT_REASONING_MODEL || env.DEEPSEEK_REASONING_MODEL || env.DEEPSEEK_CHAT_MODEL || env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL
          : env.DEEPSEEK_CHAT_MODEL || env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL
      }
      if (feature === 'logAnalysis') {
        return reasoningEnabled
          ? env.DEEPSEEK_LOG_REASONING_MODEL || env.DEEPSEEK_REASONING_MODEL || env.DEEPSEEK_LOG_MODEL || env.DEEPSEEK_CHAT_MODEL || env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL
          : env.DEEPSEEK_LOG_MODEL || env.DEEPSEEK_CHAT_MODEL || env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL
      }
      if (feature === 'extractTodos') {
        return env.DEEPSEEK_EXTRACT_MODEL || env.DEEPSEEK_CHAT_MODEL || env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL
      }
      return env.DEEPSEEK_POLISH_MODEL || env.DEEPSEEK_CHAT_MODEL || env.DEEPSEEK_MODEL || DEFAULT_DEEPSEEK_MODEL
    }
    case 'gemini': {
      if (feature === 'chat') {
        return reasoningEnabled
          ? env.GEMINI_CHAT_REASONING_MODEL || env.GEMINI_REASONING_MODEL || env.GEMINI_CHAT_MODEL || env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
          : env.GEMINI_CHAT_MODEL || env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
      }
      if (feature === 'logAnalysis') {
        return reasoningEnabled
          ? env.GEMINI_LOG_REASONING_MODEL || env.GEMINI_REASONING_MODEL || env.GEMINI_LOG_MODEL || env.GEMINI_CHAT_MODEL || env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
          : env.GEMINI_LOG_MODEL || env.GEMINI_CHAT_MODEL || env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
      }
      if (feature === 'extractTodos') {
        return env.GEMINI_EXTRACT_MODEL || env.GEMINI_CHAT_MODEL || env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
      }
      return env.GEMINI_POLISH_MODEL || env.GEMINI_CHAT_MODEL || env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL
    }
    case 'kimi': {
      const fallback = env.KIMI_MODEL || env.KIMI_CHAT_MODEL || env.KIMI_LOG_MODEL
      if (!hasText(fallback)) {
        throw new Error('Kimi model name missing')
      }
      if (feature === 'chat') {
        return reasoningEnabled
          ? env.KIMI_CHAT_REASONING_MODEL || env.KIMI_REASONING_MODEL || env.KIMI_CHAT_MODEL || env.KIMI_MODEL || fallback
          : env.KIMI_CHAT_MODEL || env.KIMI_MODEL || fallback
      }
      if (feature === 'logAnalysis') {
        return reasoningEnabled
          ? env.KIMI_LOG_REASONING_MODEL || env.KIMI_REASONING_MODEL || env.KIMI_LOG_MODEL || env.KIMI_CHAT_MODEL || env.KIMI_MODEL || fallback
          : env.KIMI_LOG_MODEL || env.KIMI_CHAT_MODEL || env.KIMI_MODEL || fallback
      }
      if (feature === 'extractTodos') {
        return env.KIMI_EXTRACT_MODEL || env.KIMI_CHAT_MODEL || env.KIMI_MODEL || fallback
      }
      return env.KIMI_POLISH_MODEL || env.KIMI_CHAT_MODEL || env.KIMI_MODEL || fallback
    }
  }
}

async function generateCompatibleText(
  baseUrl: string,
  apiKey: string,
  model: string,
  systemPrompt: string,
  userText: string,
  history?: ChatMessage[],
  temperature = 0.7
): Promise<string> {
  const response = await postJson<ChatCompletionResponse>(
    buildApiUrl(baseUrl, 'chat/completions'),
    apiKey,
    {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...sanitizeChatHistory(history),
        { role: 'user', content: userText },
      ],
      temperature,
    }
  )

  return getChatContent(response)
}

function buildGeminiContents(history: ChatMessage[] | undefined, userText: string) {
  const sanitized = sanitizeChatHistory(history)
  return [
    ...sanitized.map(message => ({
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: message.content }],
    })),
    {
      role: 'user',
      parts: [{ text: userText }],
    }
  ]
}

async function generateGeminiText(
  env: AiEnv,
  model: string,
  systemPrompt: string,
  userText: string,
  history?: ChatMessage[],
  options?: { useWebSearch?: boolean; reasoningEnabled?: boolean; temperature?: number }
): Promise<{ content: string; usedWebSearch: boolean }> {
  const apiKey = getRequiredEnv(env.GEMINI_API_KEY, 'Gemini API key')
  const response = await postJson<GeminiGenerateContentResponse>(
    buildApiUrl(env.GEMINI_BASE_URL || DEFAULT_GEMINI_BASE_URL, `models/${model}:generateContent`),
    apiKey,
    {
      systemInstruction: {
        parts: [{ text: systemPrompt }],
      },
      contents: buildGeminiContents(history, userText),
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        thinkingConfig: {
          thinkingBudget: options?.reasoningEnabled ? GEMINI_REASONING_BUDGET : 0,
        },
      },
      ...(options?.useWebSearch ? {
        tools: [{ googleSearch: {} }],
      } : {}),
    },
    { 'x-goog-api-key': apiKey },
    false
  )

  return {
    content: getGeminiText(response),
    usedWebSearch: detectGeminiWebSearch(response, Boolean(options?.useWebSearch)),
  }
}

async function generateText(env: AiEnv, modelId: string | undefined, options: GenerateTextOptions): Promise<{ content: string; usedWebSearch: boolean; model: AiModelDescriptor }> {
  const model = resolveModel(env, modelId, options.feature)
  const featureCapability = getFeatureCapability(model, options.feature)
  const useWebSearch = Boolean(options.useWebSearch && featureCapability?.supportsWebSearch)
  const reasoningEnabled = Boolean(options.reasoningEnabled && featureCapability?.supportsReasoning)
  const resolvedModelName = resolveProviderModelName(env, model.provider, options.feature, reasoningEnabled)

  switch (model.provider) {
    case 'deepseek': {
      const content = await generateCompatibleText(
        env.DEEPSEEK_BASE_URL || DEFAULT_DEEPSEEK_BASE_URL,
        getRequiredEnv(env.DEEPSEEK_API_KEY, 'DeepSeek API key'),
        resolvedModelName,
        options.systemPrompt,
        options.userText,
        options.history,
        options.temperature
      )
      return { content, usedWebSearch: false, model }
    }
    case 'kimi': {
      const content = await generateCompatibleText(
        env.KIMI_BASE_URL || DEFAULT_KIMI_BASE_URL,
        getRequiredEnv(env.KIMI_API_KEY, 'Kimi API key'),
        resolvedModelName,
        options.systemPrompt,
        options.userText,
        options.history,
        options.temperature
      )
      return { content, usedWebSearch: false, model }
    }
    case 'gemini': {
      const result = await generateGeminiText(
        env,
        resolvedModelName,
        options.systemPrompt,
        options.userText,
        options.history,
        {
          useWebSearch,
          reasoningEnabled,
          temperature: options.temperature,
        }
      )
      return { content: result.content, usedWebSearch: result.usedWebSearch, model }
    }
  }
}

export function listAvailableModels(env: AiEnv): AiModelDescriptor[] {
  return getEnabledModels(env)
}

export async function extractTodosWithModel(
  env: AiEnv,
  text: string,
  categories?: string[],
  modelId?: string
): Promise<ExtractedTodo[]> {
  const result = await generateText(env, modelId, {
    feature: 'extractTodos',
    systemPrompt: buildExtractPrompt(categories),
    userText: text,
    temperature: 0.2,
  })

  return parseExtractedTodos(result.content || '[]', text)
}

export async function chatWithModel(
  env: AiEnv,
  text: string,
  history?: ChatMessage[],
  todoContext?: string,
  modelId?: string,
  options?: { useWebSearch?: boolean; reasoningEnabled?: boolean }
): Promise<string> {
  const result = await generateText(env, modelId, {
    feature: 'chat',
    systemPrompt: buildChatPrompt(todoContext),
    userText: text,
    history,
    useWebSearch: options?.useWebSearch,
    reasoningEnabled: options?.reasoningEnabled,
    temperature: 0.7,
  })

  return result.content
}

export async function analyzeLogWithModel(
  env: AiEnv,
  text: string,
  actionType: LogAnalysisAction,
  context?: AnalyzeLogContext,
  history?: ChatMessage[],
  followUp?: string,
  modelId?: string,
  options?: AnalyzeLogOptions
): Promise<LogAnalysisResult> {
  const result = await generateText(env, modelId, {
    feature: 'logAnalysis',
    systemPrompt: `${buildLogAnalysisPrompt(actionType, context)}\n\n当前聚焦的原始日志：\n${text}`,
    userText: followUp
      ? `请继续围绕原始日志回应这次追问：\n${followUp}`
      : '请先对这条日志给出第一轮分析。',
    history,
    useWebSearch: options?.useWebSearch || options?.forceWebSearch,
    reasoningEnabled: options?.reasoningEnabled,
    temperature: 0.7,
  })

  return {
    content: result.content || 'AI 暂时没有给出内容，请稍后重试。',
    usedWebSearch: result.usedWebSearch,
    modelId: result.model.id,
    modelLabel: result.model.label,
  }
}

export async function polishIdeaWithModel(env: AiEnv, text: string, modelId?: string): Promise<string> {
  const result = await generateText(env, modelId, {
    feature: 'polishIdea',
    systemPrompt: '你是一个精简高效的个人助理。请将用户杂乱的想法整理成结构化、美观的 Markdown 笔记，并添加合适的 Emoji。',
    userText: text,
    temperature: 0.5,
  })

  return result.content
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
