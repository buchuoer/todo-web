import OpenAI from 'openai';

export const aiClient = new OpenAI({
  apiKey: import.meta.env.VITE_AI_API_KEY || 'YOUR_API_KEY',
  baseURL: import.meta.env.VITE_AI_BASE_URL || 'https://api.deepseek.com',
  dangerouslyAllowBrowser: true
});

/**
 * 从文本中提取待办任务（高级版）
 * 支持自然语言日期、优先级检测、智能分类
 */
export async function extractTodos(text: string) {
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
3. 根据任务内容智能分类：工作、学习、生活
   - 学习：课程、作业、考试、读书、科研、论文、复习
   - 工作：实习、项目、开会、报告、汇报、需求、上线
   - 生活：吃饭、购物、运动、娱乐、旅行、打扫、看病
4. 返回 JSON 数组：[{"text": "任务描述", "deadline": "2024-01-15", "category": "学习"}, ...]
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
