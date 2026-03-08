import { useState, useEffect, useRef } from 'react'
import {
  Plus, CheckCircle2, Circle, CheckSquare, Sparkles, Loader2, Trash2,
  FolderOpen, Calendar, BookOpen, Send, User, Bot, Bold, Italic, List,
  Check, Moon, Sun, BarChart3, GripVertical, X, Undo2, Bell, ChevronLeft, ChevronRight,
  Download, Upload, LogOut, RefreshCw, WifiOff, Cloud, Settings, Pencil
} from 'lucide-react'
import { extractTodos, chatWithAI } from './services/ai'
import { signIn, signUp, signOut, onAuthStateChange } from './services/auth'
import { pushTodos, pushLogs, pushTags, fetchTodos, fetchLogs, fetchTags, subscribeTodos, subscribeLogs, subscribeTags } from './services/sync'
import './App.css'

// 日志类型
interface LogEntry {
  id: number
  type: 'thought' | 'ai_chat' | 'ai_reply'
  content: string
  createdAt: string
}

interface DayLogs {
  date: string
  entries: LogEntry[]
}

interface Todo {
  id: number
  text: string
  completed: boolean
  category: string
  deadline?: string
  priority: 'high' | 'medium' | 'low'
}

interface UndoAction {
  type: 'delete' | 'toggle'
  todo: Todo
  timestamp: number
}

interface NotificationSettings {
  enabled: boolean
  notifyToday: boolean
  notifyTomorrow: boolean
  notifyOverdue: boolean
}

interface Tag {
  id: string
  name: string
  color: string
  bgColor: string
  borderColor: string
  isDefault: boolean
  createdAt: string
}

// 常量
const STORAGE_KEY = 'minimus-todos'
const LOGS_STORAGE_KEY = 'minimus-logs'
const TAGS_STORAGE_KEY = 'minimus-tags'
const TODO_DRAFT_KEY = 'minimus-todo-draft'
const LOG_DRAFT_KEY = 'minimus-log-draft'
const DARK_MODE_KEY = 'minimus-dark-mode'
const NOTIFICATION_SETTINGS_KEY = 'minimus-notification-settings'
const MIN_LOG_LENGTH = 5

// 计算剩余天数
const getDaysLeft = (deadline: string): number => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const datePart = deadline.split(' ')[0]
  const deadlineDate = new Date(datePart)
  deadlineDate.setHours(0, 0, 0, 0)
  return Math.ceil((deadlineDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

const formatDate = (date: Date): string => date.toISOString().split('T')[0]
const getToday = (): string => formatDate(new Date())

const getMonthDays = (year: number, month: number) => new Date(year, month + 1, 0).getDate()
const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay()
const MONTHS = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const getWeekDays = (startDate: Date): Date[] => {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDate)
    d.setDate(startDate.getDate() + i)
    return d
  })
}

const formatWeekRange = (startDate: Date): string => {
  const endDate = new Date(startDate)
  endDate.setDate(startDate.getDate() + 6)
  return `${startDate.getMonth() + 1}月${startDate.getDate()}日 - ${endDate.getMonth() + 1}月${endDate.getDate()}日`
}

const getDeadlineInfo = (deadline: string, completed: boolean) => {
  if (completed) return { text: '已完成', className: 'deadline-done' }
  const daysLeft = getDaysLeft(deadline)
  const timePart = deadline.includes(' ') ? deadline.split(' ')[1] : ''
  if (daysLeft < 0) return { text: `已过期 ${Math.abs(daysLeft)} 天`, className: 'deadline-overdue' }
  if (daysLeft === 0) return { text: timePart ? `今天 ${timePart} 到期` : '今天到期', className: 'deadline-today' }
  if (daysLeft === 1) return { text: timePart ? `明天 ${timePart} 到期` : '明天到期', className: 'deadline-tomorrow' }
  if (daysLeft <= 3) return { text: `${daysLeft} 天后到期`, className: 'deadline-soon' }
  return { text: `${daysLeft} 天后到期`, className: 'deadline-normal' }
}

// 标签色板
const TAG_COLOR_PALETTE = ['#007AFF', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#FF2D55', '#5AC8FA', '#5856D6', '#A2845E', '#8E8E93']

const deriveTagColors = (hex: string) => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return {
    bgColor: `rgba(${r}, ${g}, ${b}, 0.1)`,
    borderColor: `rgba(${r}, ${g}, ${b}, 0.3)`,
  }
}

const DEFAULT_TAGS: Tag[] = [
  { id: 'default-work', name: '工作', color: '#007AFF', ...deriveTagColors('#007AFF'), isDefault: true, createdAt: '2024-01-01T00:00:00.000Z' },
  { id: 'default-study', name: '学习', color: '#34C759', ...deriveTagColors('#34C759'), isDefault: true, createdAt: '2024-01-01T00:00:01.000Z' },
  { id: 'default-life', name: '生活', color: '#FF9500', ...deriveTagColors('#FF9500'), isDefault: true, createdAt: '2024-01-01T00:00:02.000Z' },
]

// 优先级配置
const PRIORITY_CONFIG: Record<'high' | 'medium' | 'low', { color: string; label: string }> = {
  'high': { color: '#FF3B30', label: '高' },
  'medium': { color: '#FF9500', label: '中' },
  'low': { color: '#8E8E93', label: '低' }
}

// 空状态配置
const EMPTY_STATE_CONFIG: Record<string, { icon: string; title: string; hint: string }> = {
  '全部': { icon: '📋', title: '暂无待办事项', hint: '在上方输入框添加你的第一个待办' },
  '工作': { icon: '💼', title: '暂无工作待办', hint: '添加工作相关的任务开始吧' },
  '学习': { icon: '📚', title: '暂无学习待办', hint: '添加一个学习目标开始吧' },
  '生活': { icon: '🌟', title: '暂无生活待办', hint: '记录生活中的待办事项' }
}

function App() {
  // === 认证 & 同步状态 ===
  const [user, setUser] = useState<any>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authEmail, setAuthEmail] = useState('')
  const [authPassword, setAuthPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced' | 'offline' | 'error'>('idle')
  const isRemoteUpdate = useRef(false)
  const syncTodosTimer = useRef<number | null>(null)
  const syncLogsTimer = useRef<number | null>(null)
  const syncTagsTimer = useRef<number | null>(null)

  // === 核心状态 ===
  const [todos, setTodos] = useState<Todo[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      const parsed = saved ? JSON.parse(saved) : [
        { id: 1, text: '学习 React Hooks', completed: false, category: '学习' },
        { id: 2, text: '完成待办工具原型设计', completed: true, category: '工作' },
      ]
      // 兼容旧数据：缺少 priority 字段默认为 'medium'
      const mapped = parsed.map((t: any) => ({ ...t, priority: t.priority || 'medium' }))
      const seen = new Set<number>()
      return mapped.filter((t: Todo) => {
        if (seen.has(t.id)) return false
        seen.add(t.id)
        return true
      })
    } catch {
      return [
        { id: 1, text: '学习 React Hooks', completed: false, category: '学习', priority: 'medium' },
        { id: 2, text: '完成待办工具原型设计', completed: true, category: '工作', priority: 'medium' },
      ]
    }
  })
  const [tags, setTags] = useState<Tag[]>(() => {
    try {
      const saved = localStorage.getItem(TAGS_STORAGE_KEY)
      const loaded: Tag[] = saved ? JSON.parse(saved) : DEFAULT_TAGS
      const seen = new Set<string>()
      return loaded.filter(t => {
        if (seen.has(t.name)) return false
        seen.add(t.name)
        return true
      })
    } catch { return DEFAULT_TAGS }
  })
  const [activeTab, setActiveTab] = useState<'todo' | 'logs' | 'calendar'>('todo')
  const [isAiLoading, setIsAiLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('全部')
  const [showCategorySelect, setShowCategorySelect] = useState(false)
  const [selectedPriority, setSelectedPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [showPrioritySelect, setShowPrioritySelect] = useState(false)
  const [deadline, setDeadline] = useState('')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [pickerYear, setPickerYear] = useState(new Date().getFullYear())
  const [pickerMonth, setPickerMonth] = useState(new Date().getMonth())
  const [pickerHour, setPickerHour] = useState(9)
  const [pickerMinute, setPickerMinute] = useState(0)
  const [deadlineTimeEnabled, setDeadlineTimeEnabled] = useState(false)
  const [editTodoTime, setEditTodoTime] = useState('')

  // 标签管理状态
  const [showTagManager, setShowTagManager] = useState(false)
  const [editingTag, setEditingTag] = useState<Tag | null>(null)
  const [newTagName, setNewTagName] = useState('')
  const [newTagColor, setNewTagColor] = useState(TAG_COLOR_PALETTE[0])

  // 待办编辑状态
  const [editingTodoId, setEditingTodoId] = useState<number | null>(null)
  const [editTodoText, setEditTodoText] = useState('')
  const [editTodoCategory, setEditTodoCategory] = useState('生活')
  const [editTodoDeadline, setEditTodoDeadline] = useState('')
  const [editTodoPriority, setEditTodoPriority] = useState<'high' | 'medium' | 'low'>('medium')

  // 日志状态
  const [logs, setLogs] = useState<LogEntry[]>(() => {
    try {
      const saved = localStorage.getItem(LOGS_STORAGE_KEY)
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [logInput, setLogInput] = useState(() => {
    try { return localStorage.getItem(LOG_DRAFT_KEY) || '' } catch { return '' }
  })
  const [isLogAiLoading, setIsLogAiLoading] = useState(false)
  const [editingLogId, setEditingLogId] = useState<number | null>(null)
  const [editContent, setEditContent] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [input, setInput] = useState(() => {
    try { return localStorage.getItem(TODO_DRAFT_KEY) || '' } catch { return '' }
  })

  // === 新功能状态 ===
  // 暗黑模式
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(DARK_MODE_KEY)
      if (saved !== null) return JSON.parse(saved)
    } catch {}
    return window.matchMedia('(prefers-color-scheme: dark)').matches
  })

  // 撤销系统
  const [undoStack, setUndoStack] = useState<UndoAction[]>([])
  const undoTimerRef = useRef<number | null>(null)

  // 拖拽排序
  const [dragTodoId, setDragTodoId] = useState<number | null>(null)
  const [dragOverTodoId, setDragOverTodoId] = useState<number | null>(null)

  // 数据统计
  const [showStats, setShowStats] = useState(false)

  // 离线编辑保护：已登录 + 离线/同步失败时禁止编辑
  const canEdit = !user || (syncStatus !== 'offline' && syncStatus !== 'error')

  // 日历视图
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<string | null>(null)
  const [calendarView, setCalendarView] = useState<'month' | 'week'>('month')
  const [calendarWeekStart, setCalendarWeekStart] = useState<Date>(() => {
    const now = new Date()
    const day = now.getDay()
    const start = new Date(now)
    start.setDate(now.getDate() - day)
    start.setHours(0, 0, 0, 0)
    return start
  })

  // 桌面通知
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(() => {
    try {
      const saved = localStorage.getItem(NOTIFICATION_SETTINGS_KEY)
      return saved ? JSON.parse(saved) : { enabled: false, notifyToday: true, notifyTomorrow: true, notifyOverdue: true }
    } catch { return { enabled: false, notifyToday: true, notifyTomorrow: true, notifyOverdue: true } }
  })
  const [showNotificationPanel, setShowNotificationPanel] = useState(false)
  const notifiedTodayRef = useRef<Set<string>>(new Set())

  // 删除动画
  const [removingTodoId, setRemovingTodoId] = useState<number | null>(null)

  // === 派生标签配置（替代原 tagConfig） ===
  const tagConfig: Record<string, { color: string; bgColor: string; borderColor: string }> = {}
  tags.forEach(tag => {
    tagConfig[tag.name] = { color: tag.color, bgColor: tag.bgColor, borderColor: tag.borderColor }
  })
  tagConfig['全部'] = { color: '#8E8E93', bgColor: '#F2F2F7', borderColor: 'rgba(142, 142, 147, 0.3)' }

  // === 标签管理函数 ===
  const addTag = (name: string, color: string) => {
    if (!canEdit) return
    if (!name.trim() || tags.some(t => t.name === name.trim())) return
    const { bgColor, borderColor } = deriveTagColors(color)
    const tag: Tag = {
      id: crypto.randomUUID(),
      name: name.trim(),
      color,
      bgColor,
      borderColor,
      isDefault: false,
      createdAt: new Date().toISOString(),
    }
    setTags(prev => [...prev, tag])
    setNewTagName('')
    setNewTagColor(TAG_COLOR_PALETTE[0])
  }

  const updateTag = (id: string, updates: { name?: string; color?: string }) => {
    if (!canEdit) return
    setTags(prev => prev.map(tag => {
      if (tag.id !== id) return tag
      const newColor = updates.color || tag.color
      const newName = updates.name?.trim() || tag.name
      const colors = updates.color ? deriveTagColors(newColor) : { bgColor: tag.bgColor, borderColor: tag.borderColor }
      // 如果名称变了，同步更新所有 todo 的 category
      if (updates.name && updates.name.trim() !== tag.name) {
        setTodos(prevTodos => prevTodos.map(todo =>
          todo.category === tag.name ? { ...todo, category: newName } : todo
        ))
      }
      return { ...tag, name: newName, color: newColor, ...colors }
    }))
    setEditingTag(null)
  }

  const deleteTag = (id: string) => {
    if (!canEdit) return
    const tag = tags.find(t => t.id === id)
    if (!tag || tag.isDefault) return
    // 关联 todo 归入"生活"
    setTodos(prevTodos => prevTodos.map(todo =>
      todo.category === tag.name ? { ...todo, category: '生活' } : todo
    ))
    setTags(prev => prev.filter(t => t.id !== id))
    if (selectedCategory === tag.name) setSelectedCategory('全部')
  }

  // === 副作用 ===
  // 持久化日志
  useEffect(() => {
    try { localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(logs)) } catch {}
    if (user && !isRemoteUpdate.current) {
      if (syncLogsTimer.current) clearTimeout(syncLogsTimer.current)
      setSyncStatus('syncing')
      syncLogsTimer.current = window.setTimeout(() => {
        pushLogs(logs, user.id)
          .then(() => setSyncStatus('synced'))
          .catch(() => setSyncStatus('error'))
      }, 800)
    }
  }, [logs, user])

  // 持久化待办
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(todos)) } catch {}
    if (user && !isRemoteUpdate.current) {
      if (syncTodosTimer.current) clearTimeout(syncTodosTimer.current)
      setSyncStatus('syncing')
      syncTodosTimer.current = window.setTimeout(() => {
        pushTodos(todos, user.id)
          .then(() => setSyncStatus('synced'))
          .catch(() => setSyncStatus('error'))
      }, 800)
    }
  }, [todos, user])

  // 持久化标签
  useEffect(() => {
    try { localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(tags)) } catch {}
    if (user && !isRemoteUpdate.current) {
      if (syncTagsTimer.current) clearTimeout(syncTagsTimer.current)
      syncTagsTimer.current = window.setTimeout(() => {
        pushTags(tags, user.id)
          .catch((err) => console.warn('标签同步失败（tags 表可能未创建）:', err))
      }, 800)
    }
  }, [tags, user])

  // 自动保存待办草稿
  useEffect(() => {
    try {
      if (input.trim()) localStorage.setItem(TODO_DRAFT_KEY, input)
      else localStorage.removeItem(TODO_DRAFT_KEY)
    } catch {}
  }, [input])

  // 自动保存日志草稿
  useEffect(() => {
    try {
      if (logInput.trim()) localStorage.setItem(LOG_DRAFT_KEY, logInput)
      else localStorage.removeItem(LOG_DRAFT_KEY)
    } catch {}
  }, [logInput])

  // 暗黑模式
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light')
    try { localStorage.setItem(DARK_MODE_KEY, JSON.stringify(isDarkMode)) } catch {}
  }, [isDarkMode])

  // 撤销自动消失
  useEffect(() => {
    if (undoStack.length > 0) {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current)
      undoTimerRef.current = window.setTimeout(() => setUndoStack([]), 5000)
    }
    return () => { if (undoTimerRef.current) clearTimeout(undoTimerRef.current) }
  }, [undoStack])

  // 持久化通知设置
  useEffect(() => {
    try { localStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(notificationSettings)) } catch {}
  }, [notificationSettings])

  // === 认证状态监听 ===
  useEffect(() => {
    const unsubscribe = onAuthStateChange((u) => {
      setUser(u)
      setAuthChecked(true)
    })
    return unsubscribe
  }, [])

  // === 登录后初始同步 + 实时订阅 ===
  useEffect(() => {
    if (!user) return

    let cancelled = false
    let initialized = false

    const initSync = async () => {
      if (initialized) return
      initialized = true
      setSyncStatus('syncing')
      try {
        const remoteTodos = await fetchTodos(user.id)
        const remoteLogs = await fetchLogs(user.id)
        // tags 表可能未创建，单独 try-catch
        let remoteTags: Tag[] = []
        try { remoteTags = await fetchTags(user.id) } catch {}
        if (cancelled) return

        if (remoteTodos.length === 0 && todos.length > 0) {
          // 首次登录，本地有数据：迁移到云端
          await pushTodos(todos, user.id)
          await pushLogs(logs, user.id)
          pushTags(tags, user.id).catch(() => {})
        } else if (remoteTodos.length > 0) {
          // 云端有数据：拉取覆盖本地
          isRemoteUpdate.current = true
          if (syncTodosTimer.current) clearTimeout(syncTodosTimer.current)
          if (syncLogsTimer.current) clearTimeout(syncLogsTimer.current)
          if (syncTagsTimer.current) clearTimeout(syncTagsTimer.current)
          setTodos(remoteTodos)
          setLogs(remoteLogs)
          if (remoteTags.length > 0) setTags(remoteTags)
          setTimeout(() => { isRemoteUpdate.current = false }, 1000)
        }
        if (!cancelled) setSyncStatus('synced')
      } catch (err) {
        console.error('初始同步失败:', err)
        if (!cancelled) setSyncStatus('error')
      }
    }

    initSync()

    // 实时订阅
    const todosChannel = subscribeTodos(user.id, (newTodos) => {
      isRemoteUpdate.current = true
      if (syncTodosTimer.current) clearTimeout(syncTodosTimer.current)
      setTodos(newTodos)
      setTimeout(() => { isRemoteUpdate.current = false }, 1000)
    })
    const logsChannel = subscribeLogs(user.id, (newLogs) => {
      isRemoteUpdate.current = true
      if (syncLogsTimer.current) clearTimeout(syncLogsTimer.current)
      setLogs(newLogs)
      setTimeout(() => { isRemoteUpdate.current = false }, 1000)
    })
    let tagsChannel: ReturnType<typeof subscribeTags> | null = null
    try {
      tagsChannel = subscribeTags(user.id, (newTags) => {
        isRemoteUpdate.current = true
        if (syncTagsTimer.current) clearTimeout(syncTagsTimer.current)
        setTags(newTags.length > 0 ? newTags : DEFAULT_TAGS)
        setTimeout(() => { isRemoteUpdate.current = false }, 1000)
      })
    } catch {}

    return () => {
      cancelled = true
      todosChannel.unsubscribe()
      logsChannel.unsubscribe()
      tagsChannel?.unsubscribe()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // === 在线/离线检测 ===
  useEffect(() => {
    const handleOnline = async () => {
      if (!user) return
      isRemoteUpdate.current = true
      if (syncTodosTimer.current) clearTimeout(syncTodosTimer.current)
      if (syncLogsTimer.current) clearTimeout(syncLogsTimer.current)
      if (syncTagsTimer.current) clearTimeout(syncTagsTimer.current)
      setSyncStatus('syncing')
      try {
        const [remoteTodos, remoteLogs] = await Promise.all([
          fetchTodos(user.id), fetchLogs(user.id)
        ])
        let remoteTags: Tag[] = []
        try { remoteTags = await fetchTags(user.id) } catch {}
        setTodos(remoteTodos)
        setLogs(remoteLogs)
        if (remoteTags.length > 0) setTags(remoteTags)
        setSyncStatus('synced')
      } catch {
        setSyncStatus('error')
      } finally {
        setTimeout(() => { isRemoteUpdate.current = false }, 1000)
      }
    }
    const handleOffline = () => setSyncStatus('offline')

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    if (!navigator.onLine) setSyncStatus('offline')

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  })

  // 桌面通知检查
  useEffect(() => {
    if (!notificationSettings.enabled || typeof Notification === 'undefined') return

    const checkAndNotify = () => {
      const today = getToday()
      const tomorrow = formatDate(new Date(Date.now() + 86400000))

      todos.filter(t => !t.completed && t.deadline).forEach(todo => {
        const key = `${todo.id}-${today}`
        if (notifiedTodayRef.current.has(key)) return

        const daysLeft = getDaysLeft(todo.deadline!)
        let message = ''

        if (daysLeft === 0 && notificationSettings.notifyToday) {
          message = `「${todo.text}」今天到期！`
        } else if (daysLeft === 1 && notificationSettings.notifyTomorrow) {
          message = `「${todo.text}」明天到期`
        } else if (daysLeft < 0 && notificationSettings.notifyOverdue) {
          message = `「${todo.text}」已过期 ${Math.abs(daysLeft)} 天`
        }

        if (message) {
          notifiedTodayRef.current.add(key)
          const n = new Notification('Minimus 提醒', { body: message, icon: '/favicon.ico' })
          n.onclick = () => { window.focus(); n.close() }
        }
      })
    }

    checkAndNotify()
    const interval = setInterval(checkAndNotify, 60000)

    const handleVisibility = () => { if (!document.hidden) checkAndNotify() }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [notificationSettings, todos])

  // === 日期辅助 ===
  const getTodayDate = (): string => new Date().toISOString().split('T')[0]

  const formatDateDisplay = (dateStr: string): string => {
    const today = getTodayDate()
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    if (dateStr === today) return '今日'
    if (dateStr === yesterday.toISOString().split('T')[0]) return '昨日'
    return dateStr
  }

  const groupLogsByDate = (entries: LogEntry[]): DayLogs[] => {
    const groups: { [key: string]: LogEntry[] } = {}
    entries.forEach(entry => {
      const date = entry.createdAt.split('T')[0]
      if (!groups[date]) groups[date] = []
      groups[date].push(entry)
    })
    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, entries]) => ({ date, entries }))
  }

  // === 日志操作 ===
  const addLog = (type: LogEntry['type'], content: string) => {
    if (!canEdit) return
    if (!content.trim()) return
    setLogs(prev => [...prev, {
      id: Math.floor(Date.now() * 1000 + Math.random() * 1000), type, content: content.trim(),
      createdAt: new Date().toISOString()
    }])
  }

  const deleteLog = (id: number) => {
    if (!canEdit) return
    setLogs(prev => prev.filter(l => l.id !== id))
  }

  const startEditLog = (id: number, content: string) => {
    setEditingLogId(id)
    setEditContent(content)
  }

  const saveEditLog = () => {
    if (!canEdit) return
    if (editingLogId === null || !editContent.trim()) return
    setLogs(prev => prev.map(l => l.id === editingLogId ? { ...l, content: editContent.trim() } : l))
    setEditingLogId(null)
    setEditContent('')
  }

  const cancelEditLog = () => { setEditingLogId(null); setEditContent('') }

  const formatText = (format: 'bold' | 'italic' | 'list') => {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const text = logInput
    const selected = text.substring(start, end)
    let newText = '', newCursorPos = start
    switch (format) {
      case 'bold':
        newText = text.substring(0, start) + `**${selected}**` + text.substring(end)
        newCursorPos = selected ? end + 4 : start + 2; break
      case 'italic':
        newText = text.substring(0, start) + `*${selected}*` + text.substring(end)
        newCursorPos = selected ? end + 2 : start + 1; break
      case 'list':
        newText = text.substring(0, start) + `\n- ${selected}` + text.substring(end)
        newCursorPos = start + 3; break
    }
    setLogInput(newText)
    setTimeout(() => { textarea.focus(); textarea.setSelectionRange(newCursorPos, newCursorPos) }, 0)
  }

  const handleLogSubmit = () => {
    if (!logInput.trim() || isLogAiLoading) return
    addLog('thought', logInput)
    setLogInput('')
  }

  const handleAiChat = async () => {
    if (!logInput.trim() || isLogAiLoading) return
    const userMessage = logInput.replace(/^@AI\s*/, '').trim()
    if (!userMessage) return
    setIsLogAiLoading(true)

    const recentLogs = logs.slice(-10).filter(l => l.type === 'ai_chat' || l.type === 'ai_reply')
    const history: { role: 'user' | 'assistant'; content: string }[] = recentLogs.map(l => ({
      role: l.type === 'ai_chat' ? 'user' as const : 'assistant' as const, content: l.content
    }))

    // 高级 AI：将待办列表作为上下文传递
    const todoContext = todos.length > 0
      ? todos.map(t =>
          `- [${t.completed ? '✓' : ' '}] ${t.text} (${t.category}${t.deadline ? `, 截止: ${t.deadline}` : ''})`
        ).join('\n')
      : undefined

    try {
      addLog('ai_chat', userMessage)
      const aiResponse = await chatWithAI(userMessage, history, todoContext)
      if (aiResponse) addLog('ai_reply', aiResponse)
      setLogInput('')
    } catch (error) {
      let errorMessage = 'AI 对话失败'
      if (error instanceof Error) {
        if (error.message.includes('API key') || error.message.includes('401')) {
          errorMessage = 'API Key 无效或已过期，请检查配置'
        } else if (error.message.includes('network') || error.message.includes('fetch') || error.message.includes('ECONNREFUSED')) {
          errorMessage = '网络连接失败，请检查网络设置'
        } else if (error.message.includes('timeout')) {
          errorMessage = '请求超时，请稍后重试'
        } else if (error.message.includes('rate limit') || error.message.includes('429')) {
          errorMessage = '请求过于频繁，请稍后再试'
        } else {
          errorMessage = `AI 对话失败: ${error.message}`
        }
      }
      addLog('ai_reply', `❌ ${errorMessage}\n\n💡 提示: 检查 API Key 是否正确配置，或稍后重试`)
    } finally {
      setIsLogAiLoading(false)
    }
  }

  const handleLogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if (e.nativeEvent.isComposing || e.keyCode === 229) return
      e.preventDefault()
      const text = logInput.trim()
      if (!text) return
      if (text.startsWith('@AI')) { handleAiChat(); return }
      if (text.length >= MIN_LOG_LENGTH) handleLogSubmit()
    }
  }

  // === 待办操作 ===
  const priorityOrder = { 'high': 0, 'medium': 1, 'low': 2 }
  const filteredTodos = (selectedCategory === '全部' ? todos : todos.filter(t => t.category === selectedCategory))
    .sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1))

  const addTodo = (text: string, category: string = '生活', deadlineVal?: string, priorityVal: 'high' | 'medium' | 'low' = 'medium') => {
    if (!canEdit) return
    if (!text.trim()) return
    setTodos(prev => [{ id: Math.floor(Date.now() * 1000 + Math.random() * 1000), text, completed: false, category, deadline: deadlineVal, priority: priorityVal }, ...prev])
    setInput('')
    setShowCategorySelect(false)
    setShowPrioritySelect(false)
    setDeadline('')
    setSelectedPriority('medium')
    setDeadlineTimeEnabled(false)
    setPickerHour(9)
    setPickerMinute(0)
  }

  const toggleTodo = (id: number) => {
    if (!canEdit) return
    const todo = todos.find(t => t.id === id)
    if (todo) {
      setUndoStack(prev => [...prev, { type: 'toggle', todo: { ...todo }, timestamp: Date.now() }])
      setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t))
    }
  }

  const deleteTodo = (id: number) => {
    if (!canEdit) return
    const todo = todos.find(t => t.id === id)
    if (todo) {
      setRemovingTodoId(id)
      setTimeout(() => {
        setTodos(prev => prev.filter(t => t.id !== id))
        setUndoStack(prev => [...prev, { type: 'delete', todo, timestamp: Date.now() }])
        setRemovingTodoId(null)
      }, 300)
    }
  }

  const handleUndo = () => {
    if (!canEdit) return
    if (undoStack.length === 0) return
    const action = undoStack[undoStack.length - 1]
    if (action.type === 'delete') {
      setTodos(prev => [action.todo, ...prev])
    } else if (action.type === 'toggle') {
      setTodos(prev => prev.map(t => t.id === action.todo.id ? action.todo : t))
    }
    setUndoStack(prev => prev.slice(0, -1))
  }

  const startEditTodo = (todo: Todo) => {
    setEditingTodoId(todo.id)
    setEditTodoText(todo.text)
    setEditTodoCategory(todo.category)
    if (todo.deadline && todo.deadline.includes(' ')) {
      const [datePart, timePart] = todo.deadline.split(' ')
      setEditTodoDeadline(datePart)
      setEditTodoTime(timePart)
    } else {
      setEditTodoDeadline(todo.deadline || '')
      setEditTodoTime('')
    }
    setEditTodoPriority(todo.priority || 'medium')
  }

  const saveEditTodo = () => {
    if (!canEdit) return
    if (!editTodoText.trim() || editingTodoId === null) return
    const mergedDeadline = editTodoDeadline
      ? (editTodoTime ? `${editTodoDeadline} ${editTodoTime}` : editTodoDeadline)
      : undefined
    setTodos(prev => prev.map(t =>
      t.id === editingTodoId
        ? { ...t, text: editTodoText.trim(), category: editTodoCategory, deadline: mergedDeadline, priority: editTodoPriority }
        : t
    ))
    setEditingTodoId(null)
    setEditTodoText('')
    setEditTodoDeadline('')
    setEditTodoTime('')
    setEditTodoPriority('medium')
  }

  const cancelEditTodo = () => {
    setEditingTodoId(null)
    setEditTodoText('')
    setEditTodoDeadline('')
    setEditTodoTime('')
    setEditTodoPriority('medium')
  }

  // === 数据导出/导入 ===
  const handleExport = () => {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      todos,
      logs,
      notificationSettings
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `minimus-backup-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canEdit) return
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string)
        if (!Array.isArray(data.todos)) {
          alert('无效的备份文件：缺少 todos 数据')
          return
        }
        const merge = confirm('选择导入方式：\n\n点击"确定"= 合并模式（保留现有数据，追加新数据）\n点击"取消"= 覆盖模式（替换所有数据）')
        if (merge) {
          // 合并模式：按 id 去重追加
          setTodos(prev => {
            const existingIds = new Set(prev.map(t => t.id))
            const newTodos = data.todos.filter((t: any) => !existingIds.has(t.id)).map((t: any) => ({ ...t, priority: t.priority || 'medium' }))
            return [...prev, ...newTodos]
          })
          if (Array.isArray(data.logs)) {
            setLogs(prev => {
              const existingIds = new Set(prev.map(l => l.id))
              const newLogs = data.logs.filter((l: any) => !existingIds.has(l.id))
              return [...prev, ...newLogs]
            })
          }
        } else {
          // 覆盖模式：直接替换
          setTodos(data.todos.map((t: any) => ({ ...t, priority: t.priority || 'medium' })))
          if (Array.isArray(data.logs)) setLogs(data.logs)
          if (data.notificationSettings) setNotificationSettings(data.notificationSettings)
        }
        alert('导入成功！')
      } catch {
        alert('导入失败：文件格式错误')
      }
    }
    reader.readAsText(file)
    // 重置 file input 以允许重复选择同一文件
    e.target.value = ''
  }

  // === 拖拽排序 ===
  const handleDragStart = (e: React.DragEvent, id: number) => {
    setDragTodoId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e: React.DragEvent, id: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (id !== dragOverTodoId) setDragOverTodoId(id)
  }

  const handleDrop = (e: React.DragEvent, id: number) => {
    e.preventDefault()
    if (!canEdit) return
    if (dragTodoId !== null && id !== dragTodoId) {
      setTodos(prev => {
        const newTodos = [...prev]
        const dragIndex = newTodos.findIndex(t => t.id === dragTodoId)
        const overIndex = newTodos.findIndex(t => t.id === id)
        if (dragIndex === -1 || overIndex === -1) return prev
        const [dragged] = newTodos.splice(dragIndex, 1)
        newTodos.splice(overIndex, 0, dragged)
        return newTodos
      })
    }
    setDragTodoId(null)
    setDragOverTodoId(null)
  }

  const handleDragEnd = () => {
    setDragTodoId(null)
    setDragOverTodoId(null)
  }

  // === AI 提取 ===
  const handleAiExtract = async () => {
    if (!input.trim()) return
    setIsAiLoading(true)
    try {
      const extracted = await extractTodos(input, tags.map(t => t.name))
      extracted.forEach((task: { text: string; deadline?: string | null; category: string }) => {
        addTodo(task.text, task.category, task.deadline || undefined, selectedPriority)
      })
      setInput('')
      alert(`AI 已成功提取 ${extracted.length} 个任务！`)
    } catch (error) {
      console.error('AI 提取失败:', error)
      alert('AI 提取失败，请检查 API Key 或网络连接')
    } finally {
      setIsAiLoading(false)
    }
  }

  // === 数据统计 ===
  const stats = {
    total: todos.length,
    completed: todos.filter(t => t.completed).length,
    pending: todos.filter(t => !t.completed).length,
    overdue: todos.filter(t => !t.completed && t.deadline && getDaysLeft(t.deadline) < 0).length,
    byCategory: tags.map(tag => ({
      name: tag.name,
      total: todos.filter(t => t.category === tag.name).length,
      completed: todos.filter(t => t.category === tag.name && t.completed).length,
    })),
    completionRate: todos.length > 0 ? Math.round((todos.filter(t => t.completed).length / todos.length) * 100) : 0,
  }

  // === 通知开关 ===
  const handleNotificationToggle = async () => {
    if (notificationSettings.enabled) {
      setNotificationSettings(prev => ({ ...prev, enabled: false }))
      return
    }
    if (typeof Notification === 'undefined') return
    if (Notification.permission === 'denied') return
    const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (perm === 'granted') {
      setNotificationSettings(prev => ({ ...prev, enabled: true }))
    }
  }

  // === 标签切换动画 ===
  const switchTab = (tab: 'todo' | 'logs' | 'calendar') => {
    if (tab === activeTab) return
    setActiveTab(tab)
  }

  // === 认证操作 ===
  const handleAuth = async () => {
    if (!authEmail.trim() || !authPassword.trim()) {
      setAuthError('请输入邮箱和密码')
      return
    }
    setAuthLoading(true)
    setAuthError('')
    try {
      if (authMode === 'login') {
        await signIn(authEmail, authPassword)
      } else {
        await signUp(authEmail, authPassword)
      }
    } catch (err: any) {
      setAuthError(err.message || '操作失败')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    try {
      await signOut()
      setUser(null)
      setSyncStatus('idle')
    } catch (err) {
      console.error('退出失败:', err)
    }
  }

  // === 认证检查中 ===
  if (!authChecked) {
    return (
      <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <Loader2 className="animate-spin" size={32} color="var(--primary)" />
      </div>
    )
  }

  // === 未登录：显示登录页 ===
  if (!user) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <h1>Minimus</h1>
            <Sparkles size={24} color="#007AFF" />
            <p>Simple & Beautiful AI Todo</p>
          </div>
          <div className="auth-form">
            <div className="auth-tabs">
              <button className={authMode === 'login' ? 'active' : ''} onClick={() => { setAuthMode('login'); setAuthError('') }}>登录</button>
              <button className={authMode === 'register' ? 'active' : ''} onClick={() => { setAuthMode('register'); setAuthError('') }}>注册</button>
            </div>
            {authError && <div className="auth-error">{authError}</div>}
            <input
              type="email"
              placeholder="邮箱"
              value={authEmail}
              onChange={(e) => setAuthEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
            />
            <input
              type="password"
              placeholder="密码（至少 6 位）"
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAuth()}
            />
            <button className="auth-submit" onClick={handleAuth} disabled={authLoading}>
              {authLoading ? <Loader2 className="animate-spin" size={20} /> : (authMode === 'login' ? '登录' : '注册')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      <header>
        <div className="logo-area">
          <h1>Minimus</h1>
          <Sparkles className="ai-icon-pulse" size={24} color="#007AFF" />
          <div className="header-actions">
            <div className={`sync-indicator sync-${syncStatus}`} title={
              syncStatus === 'syncing' ? '同步中...' :
              syncStatus === 'synced' ? '已同步' :
              syncStatus === 'offline' ? '离线模式' :
              syncStatus === 'error' ? '同步失败' : ''
            }>
              {syncStatus === 'syncing' && <RefreshCw size={14} className="animate-spin" />}
              {syncStatus === 'synced' && <Cloud size={14} />}
              {syncStatus === 'offline' && <WifiOff size={14} />}
              {syncStatus === 'error' && <Cloud size={14} />}
            </div>
            <button className="header-icon-btn" onClick={() => setShowNotificationPanel(!showNotificationPanel)} title="消息提醒">
              <Bell size={20} />
            </button>
            <button className="header-icon-btn" onClick={() => setShowStats(!showStats)} title="数据统计">
              <BarChart3 size={20} />
            </button>
            <button className="header-icon-btn" onClick={() => setIsDarkMode(!isDarkMode)} title={isDarkMode ? '浅色模式' : '暗黑模式'}>
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <button className="header-icon-btn" onClick={handleLogout} title="退出登录">
              <LogOut size={20} />
            </button>
          </div>
        </div>
        <p>Simple & Beautiful AI Assistant</p>
      </header>

      {/* 数据统计面板 */}
      {showStats && (
        <div className="stats-panel">
          <div className="stats-header">
            <h3>数据统计</h3>
            <button className="stats-close" onClick={() => setShowStats(false)}><X size={18} /></button>
          </div>
          <div className="stats-summary">
            <div className="stat-card">
              <span className="stat-number">{stats.total}</span>
              <span className="stat-label">全部</span>
            </div>
            <div className="stat-card stat-completed">
              <span className="stat-number">{stats.completed}</span>
              <span className="stat-label">已完成</span>
            </div>
            <div className="stat-card stat-pending">
              <span className="stat-number">{stats.pending}</span>
              <span className="stat-label">待完成</span>
            </div>
            <div className="stat-card stat-overdue">
              <span className="stat-number">{stats.overdue}</span>
              <span className="stat-label">已过期</span>
            </div>
          </div>
          <div className="stats-progress">
            <div className="progress-header">
              <span>完成率</span>
              <span className="progress-percent">{stats.completionRate}%</span>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${stats.completionRate}%` }}></div>
            </div>
          </div>
          <div className="stats-categories">
            {stats.byCategory.map(cat => (
              <div key={cat.name} className="category-stat">
                <div className="category-stat-header">
                  <span className="category-stat-name" style={{ color: tagConfig[cat.name]?.color }}>{cat.name}</span>
                  <span className="category-stat-count">{cat.completed}/{cat.total}</span>
                </div>
                <div className="category-progress-bar">
                  <div
                    className="category-progress-fill"
                    style={{
                      width: cat.total > 0 ? `${(cat.completed / cat.total) * 100}%` : '0%',
                      backgroundColor: tagConfig[cat.name]?.color
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
          <div className="stats-actions">
            <button className="export-btn" onClick={handleExport}>
              <Download size={16} /> 导出数据
            </button>
            <button className="import-btn" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} /> 导入数据
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImport}
            />
          </div>
        </div>
      )}

      {/* 通知设置面板 */}
      {showNotificationPanel && (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <h3>消息提醒</h3>
            <button
              className={`notification-toggle ${notificationSettings.enabled ? 'active' : ''}`}
              onClick={handleNotificationToggle}
              disabled={typeof Notification !== 'undefined' && Notification.permission === 'denied'}
            >
              <span className="toggle-knob" />
            </button>
          </div>
          {typeof Notification !== 'undefined' && Notification.permission === 'denied' && (
            <p className="notification-denied-hint">请在浏览器设置中允许通知</p>
          )}
          {notificationSettings.enabled && (
            <div className="notification-options">
              <label className="notification-option">
                <input
                  type="checkbox"
                  className="notification-checkbox"
                  checked={notificationSettings.notifyToday}
                  onChange={() => setNotificationSettings(prev => ({ ...prev, notifyToday: !prev.notifyToday }))}
                />
                <span>当天到期提醒</span>
              </label>
              <label className="notification-option">
                <input
                  type="checkbox"
                  className="notification-checkbox"
                  checked={notificationSettings.notifyTomorrow}
                  onChange={() => setNotificationSettings(prev => ({ ...prev, notifyTomorrow: !prev.notifyTomorrow }))}
                />
                <span>提前一天提醒</span>
              </label>
              <label className="notification-option">
                <input
                  type="checkbox"
                  className="notification-checkbox"
                  checked={notificationSettings.notifyOverdue}
                  onChange={() => setNotificationSettings(prev => ({ ...prev, notifyOverdue: !prev.notifyOverdue }))}
                />
                <span>已过期任务提醒</span>
              </label>
            </div>
          )}
        </div>
      )}

      <main>
        <div className="tab-switcher">
          <button className={activeTab === 'todo' ? 'active' : ''} onClick={() => switchTab('todo')}>
            <CheckSquare size={20} /> 待办
          </button>
          <button className={activeTab === 'calendar' ? 'active' : ''} onClick={() => switchTab('calendar')}>
            <Calendar size={20} /> 日历
          </button>
          <button className={activeTab === 'logs' ? 'active' : ''} onClick={() => switchTab('logs')}>
            <BookOpen size={20} /> 日志
          </button>
        </div>

        <div className="tab-content" key={activeTab}>
          {activeTab === 'todo' && (
            <div className="todo-section">
              <div className="category-filter-wrapper">
                <div className="category-filter">
                  <button
                    key="全部"
                    className={selectedCategory === '全部' ? 'active' : ''}
                    onClick={() => setSelectedCategory('全部')}
                    style={selectedCategory === '全部' ? {
                      background: tagConfig['全部']?.color,
                      boxShadow: `0 2px 8px ${tagConfig['全部']?.borderColor}`
                    } : undefined}
                  >
                    全部
                  </button>
                  {tags.map(tag => (
                    <button
                      key={tag.id}
                      className={selectedCategory === tag.name ? 'active' : ''}
                      onClick={() => setSelectedCategory(tag.name)}
                      style={selectedCategory === tag.name ? {
                        background: tag.color,
                        boxShadow: `0 2px 8px ${tag.borderColor}`
                      } : undefined}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
                <button className="tag-manage-btn" onClick={() => setShowTagManager(true)} title="管理标签">
                  <Settings size={16} />
                </button>
              </div>

              <div className="input-group">
                <input
                  type="text"
                  placeholder="添加任务或让 AI 提取待办..."
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={!canEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      if (e.nativeEvent.isComposing || e.keyCode === 229) return
                      e.preventDefault()
                      if (input.trim()) {
                        const category = selectedCategory === '全部' ? '生活' : selectedCategory
                        addTodo(input, category, deadline || undefined, selectedPriority)
                      }
                    }
                  }}
                />
                <button
                  className={`ai-extract-btn ${isAiLoading ? 'loading' : ''}`}
                  onClick={handleAiExtract}
                  disabled={!canEdit || isAiLoading || !input.trim()}
                  title="AI 智能提取待办"
                >
                  {isAiLoading ? <Loader2 className="animate-spin" size={20} /> : <Sparkles size={20} />}
                </button>
                <button
                  className={`category-btn ${showCategorySelect ? 'active' : ''}`}
                  onClick={() => setShowCategorySelect(!showCategorySelect)}
                  title={selectedCategory !== '全部' ? `当前分类: ${selectedCategory}` : '选择分类'}
                >
                  <FolderOpen size={20} />
                  {selectedCategory !== '全部' && <span className="category-indicator">{selectedCategory}</span>}
                </button>
                <button
                  className={`priority-btn ${selectedPriority !== 'medium' ? 'active' : ''}`}
                  onClick={() => setShowPrioritySelect(!showPrioritySelect)}
                  title="选择优先级"
                  style={{ background: selectedPriority !== 'medium' ? PRIORITY_CONFIG[selectedPriority].color + '20' : undefined }}
                >
                  <span className="priority-dot" style={{ background: PRIORITY_CONFIG[selectedPriority].color }} />
                </button>
                <button className={`deadline-btn ${deadline ? 'active' : ''}`} onClick={() => setDeadline('')} title="点击清除日期">
                  <Calendar size={20} />
                </button>
                <button
                  onClick={() => addTodo(input, selectedCategory === '全部' ? '生活' : selectedCategory, deadline || undefined, selectedPriority)}
                  disabled={!canEdit || !input.trim()}
                  className={input.trim() && canEdit ? 'active' : ''}
                >
                  <Plus size={20} />
                </button>
              </div>

              <div className="deadline-picker-row">
                <button className={`deadline-trigger ${deadline ? 'active' : ''}`} onClick={() => {
                  if (!showDatePicker) {
                    if (deadline && deadline.includes(' ')) {
                      const [, time] = deadline.split(' ')
                      const [h, m] = time.split(':').map(Number)
                      setPickerHour(h)
                      setPickerMinute(m)
                      setDeadlineTimeEnabled(true)
                    } else {
                      setDeadlineTimeEnabled(false)
                      setPickerHour(9)
                      setPickerMinute(0)
                    }
                  }
                  setShowDatePicker(!showDatePicker)
                }}>
                  <Calendar size={16} />
                  {deadline ? deadline : '设置截止日期'}
                </button>
                {deadline && <button className="clear-deadline" onClick={() => setDeadline('')}>清除</button>}
              </div>

              {showDatePicker && (
                <div className="custom-date-picker">
                  <div className="picker-header">
                    <button onClick={() => setPickerYear(p => p - 1)}>-</button>
                    <span>{pickerYear}年</span>
                    <button onClick={() => setPickerYear(p => p + 1)}>+</button>
                    <button onClick={() => setPickerMonth(p => (p === 0 ? 11 : p - 1))}>-</button>
                    <span>{MONTHS[pickerMonth]}</span>
                    <button onClick={() => setPickerMonth(p => (p === 11 ? 0 : p + 1))}>+</button>
                  </div>
                  <div className="picker-weekdays">
                    {['日', '一', '二', '三', '四', '五', '六'].map(d => <span key={d}>{d}</span>)}
                  </div>
                  <div className="picker-days">
                    {Array.from({ length: getFirstDayOfMonth(pickerYear, pickerMonth) }).map((_, i) => (
                      <span key={`empty-${i}`} className="empty"></span>
                    ))}
                    {Array.from({ length: getMonthDays(pickerYear, pickerMonth) }).map((_, i) => {
                      const day = i + 1
                      const dateStr = `${pickerYear}-${String(pickerMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                      const selectedDatePart = deadline.split(' ')[0]
                      return (
                        <button
                          key={day}
                          className={`day ${selectedDatePart === dateStr ? 'selected' : ''} ${dateStr === getToday() ? 'today' : ''}`}
                          onClick={() => {
                            const timeStr = deadlineTimeEnabled ? ` ${String(pickerHour).padStart(2, '0')}:${String(pickerMinute).padStart(2, '0')}` : ''
                            setDeadline(dateStr + timeStr)
                          }}
                        >
                          {day}
                        </button>
                      )
                    })}
                  </div>
                  <div className="picker-time-toggle">
                    <label>
                      <input
                        type="checkbox"
                        checked={deadlineTimeEnabled}
                        onChange={(e) => {
                          setDeadlineTimeEnabled(e.target.checked)
                          if (deadline) {
                            const datePart = deadline.split(' ')[0]
                            if (e.target.checked) {
                              setDeadline(`${datePart} ${String(pickerHour).padStart(2, '0')}:${String(pickerMinute).padStart(2, '0')}`)
                            } else {
                              setDeadline(datePart)
                            }
                          }
                        }}
                      />
                      设置时间
                    </label>
                  </div>
                  {deadlineTimeEnabled && (
                    <div className="picker-time-select">
                      <select value={pickerHour} onChange={(e) => {
                        const h = Number(e.target.value)
                        setPickerHour(h)
                        if (deadline) {
                          const datePart = deadline.split(' ')[0]
                          setDeadline(`${datePart} ${String(h).padStart(2, '0')}:${String(pickerMinute).padStart(2, '0')}`)
                        }
                      }}>
                        {Array.from({ length: 24 }, (_, i) => (
                          <option key={i} value={i}>{String(i).padStart(2, '0')}时</option>
                        ))}
                      </select>
                      <span>:</span>
                      <select value={pickerMinute} onChange={(e) => {
                        const m = Number(e.target.value)
                        setPickerMinute(m)
                        if (deadline) {
                          const datePart = deadline.split(' ')[0]
                          setDeadline(`${datePart} ${String(pickerHour).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
                        }
                      }}>
                        {Array.from({ length: 12 }, (_, i) => i * 5).map(m => (
                          <option key={m} value={m}>{String(m).padStart(2, '0')}分</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="picker-actions">
                    <button className="picker-confirm" onClick={() => setShowDatePicker(false)}>确认</button>
                  </div>
                </div>
              )}

              {showCategorySelect && (
                <div className="category-select-popup">
                  {tags.map(tag => (
                    <button
                      key={tag.id}
                      className={selectedCategory === tag.name ? 'selected' : ''}
                      onClick={() => { setSelectedCategory(tag.name); setShowCategorySelect(false) }}
                    >
                      {tag.name}
                    </button>
                  ))}
                </div>
              )}

              {showPrioritySelect && (
                <div className="priority-select-popup">
                  {(['high', 'medium', 'low'] as const).map(p => (
                    <button
                      key={p}
                      className={selectedPriority === p ? 'selected' : ''}
                      onClick={() => { setSelectedPriority(p); setShowPrioritySelect(false) }}
                      style={{ color: PRIORITY_CONFIG[p].color }}
                    >
                      <span className="priority-dot" style={{ background: PRIORITY_CONFIG[p].color }} />
                      {PRIORITY_CONFIG[p].label}
                    </button>
                  ))}
                </div>
              )}

              <ul className="todo-list">
                {filteredTodos.map(todo => (
                  <li
                    key={todo.id}
                    className={`
                      ${todo.completed ? 'completed' : ''}
                      ${editingTodoId === todo.id ? 'editing' : ''}
                      ${removingTodoId === todo.id ? 'removing' : ''}
                      ${dragTodoId === todo.id ? 'dragging' : ''}
                      ${dragOverTodoId === todo.id ? 'drag-over' : ''}
                      priority-${todo.priority || 'medium'}
                    `}
                    style={{ '--category-color': tagConfig[todo.category]?.color || '#8E8E93' } as React.CSSProperties}
                    draggable={editingTodoId !== todo.id}
                    onDragStart={(e) => handleDragStart(e, todo.id)}
                    onDragOver={(e) => handleDragOver(e, todo.id)}
                    onDrop={(e) => handleDrop(e, todo.id)}
                    onDragEnd={handleDragEnd}
                    onDragLeave={() => setDragOverTodoId(null)}
                  >
                    {editingTodoId === todo.id ? (
                      <div className="todo-edit-mode">
                        <input
                          type="text"
                          value={editTodoText}
                          onChange={(e) => setEditTodoText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') { e.preventDefault(); saveEditTodo() }
                            else if (e.key === 'Escape') cancelEditTodo()
                          }}
                          autoFocus
                          className="todo-edit-input"
                        />
                        <div className="todo-edit-row">
                          <select value={editTodoCategory} onChange={(e) => setEditTodoCategory(e.target.value)} className="todo-edit-select">
                            {tags.map(tag => (
                              <option key={tag.id} value={tag.name}>{tag.name}</option>
                            ))}
                          </select>
                          <select value={editTodoPriority} onChange={(e) => setEditTodoPriority(e.target.value as 'high' | 'medium' | 'low')} className="todo-edit-select">
                            {(['high', 'medium', 'low'] as const).map(p => (
                              <option key={p} value={p} style={{ color: PRIORITY_CONFIG[p].color }}>{PRIORITY_CONFIG[p].label}</option>
                            ))}
                          </select>
                          <input type="date" value={editTodoDeadline} onChange={(e) => setEditTodoDeadline(e.target.value)} className="todo-edit-date" />
                          <input type="time" value={editTodoTime} onChange={(e) => setEditTodoTime(e.target.value)} className="todo-edit-date" placeholder="时间" />
                          <div className="todo-edit-actions">
                            <button onClick={cancelEditTodo} className="cancel-btn">取消</button>
                            <button onClick={saveEditTodo} className="save-btn"><Check size={14} /> 保存</button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="drag-handle" title="拖拽排序">
                          <GripVertical size={16} />
                        </span>
                        <button className="check-btn" onClick={() => toggleTodo(todo.id)}>
                          {todo.completed ? <CheckCircle2 size={22} color="#34C759" /> : <Circle size={22} />}
                        </button>
                        <div className="todo-content" onClick={() => startEditTodo(todo)}>
                          <span className="todo-text">{todo.text}</span>
                          <div className="todo-meta">
                            <span
                              className="todo-category"
                              style={{
                                color: tagConfig[todo.category]?.color,
                                backgroundColor: tagConfig[todo.category]?.bgColor,
                                borderColor: tagConfig[todo.category]?.borderColor
                              }}
                            >
                              {todo.category}
                            </span>
                            {todo.deadline && (
                              <span className={`todo-deadline ${getDeadlineInfo(todo.deadline, todo.completed).className}`}>
                                {getDeadlineInfo(todo.deadline, todo.completed).text}
                              </span>
                            )}
                          </div>
                        </div>
                        <button className="delete-btn" onClick={() => deleteTodo(todo.id)}>
                          <Trash2 size={18} />
                        </button>
                      </>
                    )}
                  </li>
                ))}
                {filteredTodos.length === 0 && (
                  <li className="empty-state">
                    <div className="empty-illustration">{EMPTY_STATE_CONFIG[selectedCategory]?.icon || '📋'}</div>
                    <p className="empty-title">{EMPTY_STATE_CONFIG[selectedCategory]?.title || '暂无待办事项'}</p>
                    <p className="empty-hint">{EMPTY_STATE_CONFIG[selectedCategory]?.hint || '添加你的第一个待办'}</p>
                    {selectedCategory !== '全部' && todos.length > 0 && (
                      <button className="empty-action" onClick={() => setSelectedCategory('全部')}>
                        查看全部待办
                      </button>
                    )}
                  </li>
                )}
              </ul>
            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="calendar-section">
              <div className="calendar-header">
                <button className="calendar-nav-btn" onClick={() => {
                  if (calendarView === 'week') {
                    const prev = new Date(calendarWeekStart)
                    prev.setDate(prev.getDate() - 7)
                    setCalendarWeekStart(prev)
                  } else {
                    if (calendarMonth === 0) { setCalendarMonth(11); setCalendarYear(y => y - 1) }
                    else setCalendarMonth(m => m - 1)
                  }
                }}>
                  <ChevronLeft size={20} />
                </button>
                <span className="calendar-month-year">
                  {calendarView === 'week' ? formatWeekRange(calendarWeekStart) : `${calendarYear}年 ${MONTHS[calendarMonth]}`}
                </span>
                <button className="calendar-nav-btn" onClick={() => {
                  if (calendarView === 'week') {
                    const next = new Date(calendarWeekStart)
                    next.setDate(next.getDate() + 7)
                    setCalendarWeekStart(next)
                  } else {
                    if (calendarMonth === 11) { setCalendarMonth(0); setCalendarYear(y => y + 1) }
                    else setCalendarMonth(m => m + 1)
                  }
                }}>
                  <ChevronRight size={20} />
                </button>
                <button className="calendar-today-btn" onClick={() => {
                  const now = new Date()
                  setCalendarYear(now.getFullYear())
                  setCalendarMonth(now.getMonth())
                  const day = now.getDay()
                  const start = new Date(now)
                  start.setDate(now.getDate() - day)
                  start.setHours(0, 0, 0, 0)
                  setCalendarWeekStart(start)
                }}>今天</button>
                <div className="calendar-view-toggle">
                  <button className={calendarView === 'month' ? 'active' : ''} onClick={() => setCalendarView('month')}>月</button>
                  <button className={calendarView === 'week' ? 'active' : ''} onClick={() => setCalendarView('week')}>周</button>
                </div>
              </div>

              {calendarView === 'month' ? (
                <>
              <div className="calendar-grid">
                <div className="calendar-weekdays">
                  {['日', '一', '二', '三', '四', '五', '六'].map(d => <span key={d}>{d}</span>)}
                </div>
                <div className="calendar-days">
                  {/* 上月溢出 */}
                  {(() => {
                    const firstDay = getFirstDayOfMonth(calendarYear, calendarMonth)
                    const prevMonthDays = calendarMonth === 0
                      ? getMonthDays(calendarYear - 1, 11)
                      : getMonthDays(calendarYear, calendarMonth - 1)
                    return Array.from({ length: firstDay }).map((_, i) => {
                      const day = prevMonthDays - firstDay + 1 + i
                      return <div key={`prev-${i}`} className="calendar-day other-month"><span className="day-number">{day}</span></div>
                    })
                  })()}
                  {/* 当月 */}
                  {Array.from({ length: getMonthDays(calendarYear, calendarMonth) }).map((_, i) => {
                    const day = i + 1
                    const dateStr = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const dayTodos = todos.filter(t => t.deadline?.split(' ')[0] === dateStr)
                    const isToday = dateStr === getToday()
                    const isSelected = dateStr === selectedCalendarDate

                    return (
                      <div
                        key={day}
                        className={`calendar-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${dayTodos.length > 0 ? ' has-tasks' : ''}`}
                        onClick={() => setSelectedCalendarDate(isSelected ? null : dateStr)}
                      >
                        <span className="day-number">{day}</span>
                        {dayTodos.length > 0 && (
                          <div className="day-tasks">
                            {dayTodos.slice(0, 3).map(t => (
                              <span
                                key={t.id}
                                className="task-dot"
                                style={{
                                  backgroundColor: tagConfig[t.category]?.color || '#8E8E93',
                                  opacity: t.completed ? 0.4 : 1,
                                  width: t.priority === 'high' ? '8px' : t.priority === 'low' ? '5px' : '6px',
                                  height: t.priority === 'high' ? '8px' : t.priority === 'low' ? '5px' : '6px'
                                }}
                              />
                            ))}
                            {dayTodos.length > 3 && <span className="task-dot-more">+{dayTodos.length - 3}</span>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {/* 下月溢出 */}
                  {(() => {
                    const totalCells = getFirstDayOfMonth(calendarYear, calendarMonth) + getMonthDays(calendarYear, calendarMonth)
                    const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7)
                    return Array.from({ length: remaining }).map((_, i) => (
                      <div key={`next-${i}`} className="calendar-day other-month"><span className="day-number">{i + 1}</span></div>
                    ))
                  })()}
                </div>
              </div>

              {/* 点击日期后的任务面板 */}
              {selectedCalendarDate && (
                <div className="calendar-task-panel">
                  <div className="calendar-task-panel-header">
                    <span>{selectedCalendarDate.replace(/^(\d+)-(\d+)-(\d+)$/, (_m, _y, mo, d) => `${parseInt(mo)}月${parseInt(d)}日`)} 的任务</span>
                    <button onClick={() => setSelectedCalendarDate(null)}><X size={16} /></button>
                  </div>
                  {todos.filter(t => t.deadline?.split(' ')[0] === selectedCalendarDate).length === 0 ? (
                    <div className="calendar-task-empty">暂无任务</div>
                  ) : (
                    todos.filter(t => t.deadline?.split(' ')[0] === selectedCalendarDate).map(todo => (
                      <div key={todo.id} className={`calendar-task-item ${todo.completed ? 'completed' : ''}`}>
                        <button className="check-btn" onClick={() => toggleTodo(todo.id)}>
                          {todo.completed ? <CheckCircle2 size={20} color="#34C759" /> : <Circle size={20} />}
                        </button>
                        <span className="calendar-task-text">{todo.text}</span>
                        <span
                          className="calendar-task-category"
                          style={{
                            color: tagConfig[todo.category]?.color,
                            backgroundColor: tagConfig[todo.category]?.bgColor,
                          }}
                        >
                          {todo.category}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
                </>
              ) : (
                <div className="calendar-week-view">
                  <div className="calendar-week-grid">
                    {getWeekDays(calendarWeekStart).map((date, i) => {
                      const dateStr = formatDate(date)
                      const dayTodos = todos.filter(t => t.deadline?.split(' ')[0] === dateStr)
                      const isToday = dateStr === getToday()
                      const isSelected = dateStr === selectedCalendarDate

                      return (
                        <div
                          key={i}
                          className={`calendar-week-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}`}
                          onClick={() => setSelectedCalendarDate(isSelected ? null : dateStr)}
                        >
                          <div className="week-day-header">
                            <span className="week-day-name">{WEEKDAYS[i]}</span>
                            <span className={`week-day-number${isToday ? ' today' : ''}`}>{date.getDate()}</span>
                          </div>
                          <div className="week-day-tasks">
                            {dayTodos.length > 0 ? dayTodos.map(t => (
                              <div
                                key={t.id}
                                className={`week-task-card${t.completed ? ' completed' : ''}`}
                                onClick={(e) => { e.stopPropagation(); toggleTodo(t.id) }}
                              >
                                <span
                                  className="week-task-category-tag"
                                  style={{ backgroundColor: tagConfig[t.category]?.color || '#8E8E93' }}
                                />
                                <span className="week-task-name">{t.text}</span>
                              </div>
                            )) : (
                              <span className="week-no-tasks">无</span>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div className="logs-section">
              <div className="log-input-area">
                <div className="log-editor">
                  <div className="log-toolbar">
                    <div className="toolbar-left">
                      <button onClick={() => formatText('bold')} title="粗体"><Bold size={16} /></button>
                      <button onClick={() => formatText('italic')} title="斜体"><Italic size={16} /></button>
                      <button onClick={() => formatText('list')} title="列表"><List size={16} /></button>
                    </div>
                    {logs.length > 0 && (
                      <button
                        className="clear-history-btn"
                        onClick={() => { if (canEdit && confirm('确定要清除所有日志吗？此操作不可恢复。')) setLogs([]) }}
                        title="清除所有日志"
                      >
                        <Trash2 size={16} /> 清除历史
                      </button>
                    )}
                  </div>
                  <textarea
                    ref={textareaRef}
                    placeholder="记录想法...（@AI 开头可对话，Shift+Enter 换行）"
                    value={logInput}
                    onChange={(e) => setLogInput(e.target.value)}
                    onKeyDown={handleLogKeyDown}
                    disabled={!canEdit || isLogAiLoading}
                    rows={4}
                  />
                  <div className="log-actions">
                    <div className="log-hint-area">
                      <span className="log-hint">@AI 开头可对话</span>
                      {!logInput.trim().startsWith('@AI') && logInput.trim().length > 0 && (
                        <span className={`char-count ${logInput.trim().length >= MIN_LOG_LENGTH ? 'valid' : 'invalid'}`}>
                          {logInput.trim().length}/{MIN_LOG_LENGTH}
                        </span>
                      )}
                    </div>
                    <div className="log-action-buttons">
                      {logInput.trim() && (
                        <button className="log-clear-btn" onClick={() => setLogInput('')} title="清除草稿">
                          <Trash2 size={16} />
                        </button>
                      )}
                      <button
                        className={`log-send-btn ${isLogAiLoading ? 'loading' : ''}`}
                        onClick={() => logInput.trim().startsWith('@AI') ? handleAiChat() : handleLogSubmit()}
                        disabled={!canEdit || !logInput.trim() || isLogAiLoading}
                      >
                        {isLogAiLoading ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="logs-list">
                {groupLogsByDate(logs).map(dayLog => (
                  <div key={dayLog.date} className="log-day-group">
                    <div className="log-date-header">{formatDateDisplay(dayLog.date)}</div>
                    <div className="log-entries">
                      {dayLog.entries.map(entry => (
                        <div key={entry.id} className={`log-entry log-entry-${entry.type}`}>
                          {editingLogId === entry.id ? (
                            <div className="log-edit-mode">
                              <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={3} autoFocus />
                              <div className="log-edit-actions">
                                <button onClick={cancelEditLog} className="cancel-btn">取消</button>
                                <button onClick={saveEditLog} className="save-btn"><Check size={14} /> 保存</button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="log-icon">
                                {entry.type === 'thought' && <span>💭</span>}
                                {entry.type === 'ai_chat' && <User size={14} />}
                                {entry.type === 'ai_reply' && <Bot size={14} />}
                              </div>
                              <div className="log-content" onClick={() => startEditLog(entry.id, entry.content)}>
                                <p className="log-text">{entry.content}</p>
                                <span className="log-time">
                                  {new Date(entry.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                              <button className="log-delete-btn" onClick={() => deleteLog(entry.id)}>
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {logs.length === 0 && (
                  <div className="logs-empty">
                    <div className="logs-empty-icon">📝</div>
                    <p>暂无日志</p>
                    <p className="logs-empty-hint">记录你的想法或使用 @AI 对话</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* 撤销提示 */}
      {/* 标签管理弹窗 */}
      {showTagManager && (
        <div className="modal-overlay" onClick={() => { setShowTagManager(false); setEditingTag(null) }}>
          <div className="tag-manager-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tag-manager-header">
              <h3>管理标签</h3>
              <button className="modal-close-btn" onClick={() => { setShowTagManager(false); setEditingTag(null) }}>
                <X size={20} />
              </button>
            </div>

            <div className="tag-list">
              {tags.map(tag => (
                <div key={tag.id} className="tag-item">
                  {editingTag?.id === tag.id ? (
                    <div className="tag-edit-form">
                      <input
                        type="text"
                        value={editingTag.name}
                        onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                        className="tag-name-input"
                        autoFocus
                      />
                      <div className="color-picker">
                        {TAG_COLOR_PALETTE.map(c => (
                          <button
                            key={c}
                            className={`color-option ${editingTag.color === c ? 'selected' : ''}`}
                            style={{ backgroundColor: c }}
                            onClick={() => setEditingTag({ ...editingTag, color: c })}
                          />
                        ))}
                      </div>
                      <div className="tag-edit-actions">
                        <button className="cancel-btn" onClick={() => setEditingTag(null)}>取消</button>
                        <button className="save-btn" onClick={() => updateTag(editingTag.id, { name: editingTag.name, color: editingTag.color })}>
                          <Check size={14} /> 保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="tag-color-dot" style={{ backgroundColor: tag.color }} />
                      <span className="tag-name">{tag.name}</span>
                      <div className="tag-actions">
                        <button className="tag-edit-btn" onClick={() => setEditingTag({ ...tag })} title="编辑">
                          <Pencil size={14} />
                        </button>
                        {!tag.isDefault && (
                          <button className="tag-delete-btn" onClick={() => deleteTag(tag.id)} title="删除">
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>

            <div className="tag-add-form">
              <input
                type="text"
                placeholder="新标签名称"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                className="tag-name-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (e.nativeEvent.isComposing || e.keyCode === 229) return
                    e.preventDefault()
                    if (newTagName.trim()) addTag(newTagName, newTagColor)
                  }
                }}
              />
              <div className="color-picker">
                {TAG_COLOR_PALETTE.map(c => (
                  <button
                    key={c}
                    className={`color-option ${newTagColor === c ? 'selected' : ''}`}
                    style={{ backgroundColor: c }}
                    onClick={() => setNewTagColor(c)}
                  />
                ))}
              </div>
              <button
                className="add-tag-btn"
                onClick={() => addTag(newTagName, newTagColor)}
                disabled={!newTagName.trim() || tags.some(t => t.name === newTagName.trim())}
              >
                <Plus size={16} /> 添加标签
              </button>
            </div>
          </div>
        </div>
      )}

      {undoStack.length > 0 && (
        <div className="undo-toast">
          <span className="undo-message">
            {undoStack[undoStack.length - 1].type === 'delete' ? '已删除待办' : '已更改状态'}
          </span>
          <button className="undo-btn" onClick={handleUndo}>
            <Undo2 size={16} /> 撤销
          </button>
          <button className="toast-close-btn" onClick={() => setUndoStack([])}>
            <X size={16} />
          </button>
        </div>
      )}

      <nav className="mobile-nav">
        <button className={activeTab === 'todo' ? 'active' : ''} onClick={() => switchTab('todo')}>
          <CheckSquare />
        </button>
        <button className={activeTab === 'calendar' ? 'active' : ''} onClick={() => switchTab('calendar')}>
          <Calendar />
        </button>
        <button className={activeTab === 'logs' ? 'active' : ''} onClick={() => switchTab('logs')}>
          <BookOpen />
        </button>
      </nav>
    </div>
  )
}

export default App
