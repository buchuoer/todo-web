import OpenAI from 'openai';

export type LogAnalysisAction = 'deep_dive' | 'critique' | 'organize'
export interface LogAnalysisMessage {
  role: 'user' | 'assistant'
  content: string
}

export const aiClient = new OpenAI({
  apiKey: import.meta.env.VITE_AI_API_KEY || 'YOUR_API_KEY',
  baseURL: import.meta.env.VITE_AI_BASE_URL || 'https://api.deepseek.com',
  dangerouslyAllowBrowser: true
});

/**
 * 从文本中提取待办任务（高级版）
 * 支持自然语言日期、优先级检测、智能分类
 */
export async function extractTodos(text: string, categories?: string[]) {
  const response = await aiClient.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      {
        role: 'system',
        content: `你是一个智能任务管理助手。请从用户的描述中提取待办任务。

规则：
1. 智能识别时间信息：
   - "今天/明天/后天" → 具体日期
   - "下周一/下周三" → 计算为具体日期
   - "X号/X日" → 当月或下月的具体日期
   - "月底" → 当月最后一天
   - "下个月" → 下月15号
   - 如果没有明确时间，deadline 设为 null
2. 所有日期格式为 YYYY-MM-DD
3. 根据任务内容智能分类：${categories ? categories.join('、') : '工作、学习、生活'}
   - 根据任务内容的关键词进行智能分类
4. 返回 JSON 数组：[{"text": "任务描述", "deadline": "2024-01-15", "category": "${categories ? categories[0] : '学习'}"}, ...]
5. 只返回 JSON，不要任何解释文字
6. 任务描述应简洁清晰，去除口语化表达

今天是 ${new Date().toISOString().split('T')[0]}（${['周日','周一','周二','周三','周四','周五','周六'][new Date().getDay()]}）`
      },
      { role: 'user', content: text }
    ],
  });
  try {
    const content = response.choices[0].message.content || '[]'
    // 尝试提取 JSON（处理可能的 markdown 代码块包裹）
    const jsonMatch = content.match(/\[[\s\S]*\]/)
    return jsonMatch ? JSON.parse(jsonMatch[0]) : [{ text, deadline: null, category: '生活' }]
  } catch {
    return [{ text, deadline: null, category: '生活' }];
  }
}

/**
 * 与 AI 对话（增强版 - 支持待办上下文）
 */
export async function chatWithAI(
  text: string,
  history?: { role: 'user' | 'assistant'; content: string }[],
  todoContext?: string
) {
  const systemContent = `你是一个精简高效的个人助理，名叫 Minimus。请用简洁、友好的方式回答用户的问题。

你的特殊能力：
- 你可以看到用户的待办事项列表，帮助他们管理任务
- 当用户询问任务相关问题时，参考他们的待办列表给出建议
- 你可以帮助用户分析任务优先级、时间安排
- 回答时使用中文，保持简洁有用${todoContext ? `\n\n📋 用户当前的待办事项：\n${todoContext}` : ''}`

  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemContent },
    ...(history || []).map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
    { role: 'user', content: text }
  ];

  const response = await aiClient.chat.completions.create({
    model: 'deepseek-chat',
    messages,
  });
  return response.choices[0].message.content;
}

const getLogAnalysisPrompt = (
  actionType: LogAnalysisAction,
  context?: { todoContext?: string; recentLogs?: string }
) => {
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

export async function analyzeLogWithAI(
  text: string,
  actionType: LogAnalysisAction,
  context?: { todoContext?: string; recentLogs?: string },
  history?: LogAnalysisMessage[],
  followUp?: string
) {
  const systemContent = getLogAnalysisPrompt(actionType, context)
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    {
      role: 'system',
      content: `${systemContent}\n\n当前聚焦的原始日志：\n${text}`
    },
    ...(history || []).map(message => ({
      role: message.role,
      content: message.content
    })),
    {
      role: 'user',
      content: followUp
        ? `请继续围绕原始日志回应这次追问：\n${followUp}`
        : '请先对这条日志给出第一轮分析。'
    }
  ]

  const response = await aiClient.chat.completions.create({
    model: 'deepseek-chat',
    messages,
  });

  return response.choices[0].message.content;
}

/**
 * 将凌乱的想法整理成结构化的笔记
 */
export async function polishIdea(text: string) {
  const response = await aiClient.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: '你是一个精简高效的个人助理。请将用户杂乱的想法整理成结构化、美观的 Markdown 笔记，并添加合适的 Emoji。' },
      { role: 'user', content: text }
    ],
  });
  return response.choices[0].message.content;
}
