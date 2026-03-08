#!/usr/bin/env node

/**
 * Minimus 项目 - Enter 键交互测试验证脚本
 * 这个脚本提供手动测试指南和验证清单
 *
 * 使用方法: node test-verify.js
 */

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, text) {
  console.log(`${color}${text}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(colors.cyan, `  ${title}`);
  console.log('='.repeat(60) + '\n');
}

function logTest(num, name, status, message = '') {
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⏳';
  const color = status === 'pass' ? colors.green : status === 'fail' ? colors.red : colors.yellow;
  log(color, `${icon} 测试 ${num}: ${name}`);
  if (message) log(colors.yellow, `   💬 ${message}`);
}

// 主要测试报告
logSection('Minimus 项目 - Enter 键交互修复');

console.log(`
📝 修复内容总结：

1. ✅ 待办输入框
   - 从 onKeyUp → onKeyDown 改进
   - 添加 e.preventDefault() 防止二次触发
   - 关键修复：行 387-395

2. ✅ 日志输入框
   - 函数从 handleLogKeyUp → handleLogKeyDown
   - 支持 Shift+Enter 换行
   - 优化 AI 对话检测
   - 关键修复：行 284-302, 526

3. ✅ Placeholder 提示
   - 添加"Shift+Enter 换行"提示
   - 行 523

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

logSection('🧪 测试场景 & 验证步骤');

const tests = [
  {
    num: '1️⃣',
    name: '待办输入框 - 基础 Enter 提交',
    steps: [
      '切换到"待办"标签页',
      '输入文本: "测试任务001"',
      '按 Enter 键 1 次',
      '验证: ✅ 只创建 1 个待办项',
      '验证: ✅ 输入框立即清空'
    ]
  },
  {
    num: '2️⃣',
    name: '待办输入框 - 快速连续 Enter',
    steps: [
      '输入: "快速测试"',
      '快速按 Enter 3 次',
      '验证: ✅ 只创建 1 个待办项（不是 3 个）'
    ]
  },
  {
    num: '3️⃣',
    name: '日志输入框 - 基础 Enter 提交',
    steps: [
      '切换到"日志"标签页',
      '输入: "这是一条测试日志" (≥5 字符)',
      '按 Enter 键 1 次',
      '验证: ✅ 只创建 1 条日志',
      '验证: ✅ 日志显示在"今日"分组中'
    ]
  },
  {
    num: '4️⃣',
    name: '日志输入框 - Shift+Enter 换行',
    steps: [
      '输入: "第一行"',
      '按 Shift+Enter',
      '输入: "第二行"',
      '按 Enter (普通)',
      '验证: ✅ 日志内容包含两行',
      '验证: ✅ Shift+Enter 不会提交日志'
    ]
  },
  {
    num: '5️⃣',
    name: '日志输入框 - 最小字符限制（5个字符）',
    steps: [
      '输入: "短" (< 5 字符)',
      '按 Enter',
      '验证: ✅ 不创建日志',
      '输入: "刚好五字" (= 5 字符)',
      '按 Enter',
      '验证: ✅ 创建日志'
    ]
  },
  {
    num: '6️⃣',
    name: 'AI 对话 - @AI 前缀触发',
    steps: [
      '输入: "@AI 你好" (不足 5 字符)',
      '按 Enter',
      '验证: ✅ 触发 AI 对话（忽略 5 字符限制）',
      '验证: ✅ 显示加载状态',
      '验证: ✅ AI 回复显示在日志中'
    ]
  },
  {
    num: '7️⃣',
    name: '日志输入框 - 空输入/纯空格',
    steps: [
      '输入: "     " (5 个空格)',
      '按 Enter',
      '验证: ✅ 不创建日志（trim() 后为空）'
    ]
  },
  {
    num: '8️⃣',
    name: '连续快速日志提交',
    steps: [
      '输入: "快速日志01" → 按 Enter',
      '立即输入: "快速日志02" → 按 Enter',
      '验证: ✅ 创建 2 条独立日志',
      '验证: ✅ 时间戳或顺序不同'
    ]
  }
];

tests.forEach((test, idx) => {
  logTest(test.num, test.name, 'pending');
  test.steps.forEach((step, stepIdx) => {
    const isVerify = step.startsWith('验证:');
    console.log(`   ${isVerify ? '📌' : '👉'} ${step}`);
  });
});

logSection('🔍 代码验证清单');

const codeChecks = [
  { file: 'src/App.tsx', line: '387-395', desc: '待办输入框: onKeyDown + preventDefault()' },
  { file: 'src/App.tsx', line: '284-302', desc: '日志处理函数: handleLogKeyDown' },
  { file: 'src/App.tsx', line: '526', desc: '日志 textarea: onKeyDown={handleLogKeyDown}' },
  { file: 'src/App.tsx', line: '523', desc: 'Placeholder: 提示 Shift+Enter 换行' }
];

console.log('请验证以下代码修改:\n');
codeChecks.forEach((check, idx) => {
  log(colors.green, `✅ [${idx + 1}] ${check.file}:${check.line}`);
  console.log(`   └─ ${check.desc}\n`);
});

logSection('📋 验证结果记录');

console.log(`
请在浏览器中按顺序进行以下操作，并记录结果:

【第一轮 - 快速验证 (1 分钟)】
□ 测试 1️⃣ - 待办 Enter → 检查只创建 1 条
□ 测试 3️⃣ - 日志 Enter → 检查只创建 1 条
□ 测试 6️⃣ - AI 对话 → 检查触发成功

【第二轮 - 详细验证 (5 分钟)】
□ 测试 2️⃣ - 快速连续 Enter
□ 测试 4️⃣ - Shift+Enter 换行
□ 测试 5️⃣ - 字符限制
□ 测试 7️⃣ - 空输入处理
□ 测试 8️⃣ - 连续提交

【问题记录】
遇到的任何问题:
_______________________________________________________
_______________________________________________________

【最终结果】
✅ 所有测试通过 / ⚠️ 部分测试失败 / ❌ 重大问题
`);

logSection('🎯 下一步行动');

console.log(`
✅ 如果所有测试通过:
   → 阶段 1 完成！准备进入阶段 2（增强输入体验）
   → 选项: 字符计数、草稿保存、更好的错误提示

❌ 如果发现问题:
   → 收集详细信息（步骤、浏览器、截图）
   → 创建 issue 或修改代码
   → 重新运行测试验证

📞 需要帮助?
   → 查看 TEST_CHECKLIST.md 获取详细指导
   → 检查浏览器控制台 (F12) 查看错误信息
   → 验证 API Key 是否正确配置
`);

console.log('\n' + '═'.repeat(60));
log(colors.blue, '✨ 测试指南已生成！请在浏览器中进行手动测试 ✨');
log(colors.cyan, '🔗 访问地址: http://localhost:5173');
console.log('═'.repeat(60) + '\n');
