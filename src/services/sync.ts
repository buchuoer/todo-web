import { supabase } from './supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ---- Types matching App.tsx ----
export interface Tag {
  id: string
  name: string
  color: string
  bgColor: string
  borderColor: string
  isDefault: boolean
  createdAt: string
}

export interface Todo {
  id: number
  text: string
  completed: boolean
  category: string
  deadline?: string
  priority: 'high' | 'medium' | 'low'
}

export interface LogEntry {
  id: number
  type: 'thought' | 'ai_chat' | 'ai_reply'
  content: string
  createdAt: string
}

// ---- Supabase row shapes ----
interface TodoRow {
  id: string
  user_id: string
  text: string
  completed: boolean
  category: string
  deadline: string | null
  priority: string
  "order": number
  created_at: string
  updated_at: string
}

interface LogRow {
  id: string
  user_id: string
  content: string
  type: string
  created_at: string
}

interface TagRow {
  id: string
  user_id: string
  name: string
  color: string
  bg_color: string
  border_color: string
  is_default: boolean
  created_at: string
}

// ---- Conversion helpers ----

// We use the local numeric id encoded in the `order` field for round-tripping.
// This keeps the existing App.tsx code (which relies on numeric ids) unchanged.

function todoToRow(todo: Todo, userId: string): Omit<TodoRow, 'id' | 'created_at' | 'updated_at'> {
  return {
    user_id: userId,
    text: todo.text,
    completed: todo.completed,
    category: todo.category,
    deadline: todo.deadline ?? null,
    priority: todo.priority,
    "order": todo.id, // store local numeric id as order
  }
}

function rowToTodo(row: TodoRow): Todo {
  return {
    id: row["order"] || Date.now(),
    text: row.text,
    completed: row.completed,
    category: row.category,
    deadline: row.deadline ?? undefined,
    priority: (row.priority as Todo['priority']) || 'medium',
  }
}

function logToRow(log: LogEntry, userId: string): Omit<LogRow, 'id'> {
  return {
    user_id: userId,
    content: log.content,
    type: log.type,
    created_at: log.createdAt,
  }
}

function rowToLog(row: LogRow): LogEntry {
  return {
    id: new Date(row.created_at).getTime(),
    type: (row.type as LogEntry['type']) || 'thought',
    content: row.content,
    createdAt: row.created_at,
  }
}

function tagToRow(tag: Tag, userId: string): Omit<TagRow, 'id'> {
  return {
    user_id: userId,
    name: tag.name,
    color: tag.color,
    bg_color: tag.bgColor,
    border_color: tag.borderColor,
    is_default: tag.isDefault,
    created_at: tag.createdAt,
  }
}

function rowToTag(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    bgColor: row.bg_color,
    borderColor: row.border_color,
    isDefault: row.is_default,
    createdAt: row.created_at,
  }
}

// ---- Push locks (prevent Realtime echo during delete+insert) ----
let pushingTodos = false
let pushingLogs = false
let pushingTags = false

export function isPushingTodos() { return pushingTodos }
export function isPushingLogs() { return pushingLogs }
export function isPushingTags() { return pushingTags }

// ---- Push (local → cloud) ----

export async function pushTodos(todos: Todo[], userId: string) {
  pushingTodos = true
  try {
    await supabase.from('todos').delete().eq('user_id', userId)
    if (todos.length === 0) return
    const rows = todos.map(t => todoToRow(t, userId))
    const { error } = await supabase.from('todos').insert(rows)
    if (error) throw error
  } finally {
    setTimeout(() => { pushingTodos = false }, 500)
  }
}

export async function pushLogs(logs: LogEntry[], userId: string) {
  pushingLogs = true
  try {
    await supabase.from('logs').delete().eq('user_id', userId)
    if (logs.length === 0) return
    const rows = logs.map(l => logToRow(l, userId))
    const { error } = await supabase.from('logs').insert(rows)
    if (error) throw error
  } finally {
    setTimeout(() => { pushingLogs = false }, 500)
  }
}

export async function pushTags(tags: Tag[], userId: string) {
  pushingTags = true
  try {
    await supabase.from('tags').delete().eq('user_id', userId)
    if (tags.length === 0) return
    const rows = tags.map(t => tagToRow(t, userId))
    const { error } = await supabase.from('tags').insert(rows)
    if (error) throw error
  } finally {
    setTimeout(() => { pushingTags = false }, 500)
  }
}

// ---- Pull (cloud → local) ----

export async function fetchTodos(userId: string): Promise<Todo[]> {
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .order('order', { ascending: true })
  if (error) throw error
  return (data as TodoRow[]).map(rowToTodo)
}

export async function fetchLogs(userId: string): Promise<LogEntry[]> {
  const { data, error } = await supabase
    .from('logs')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as LogRow[]).map(rowToLog)
}

export async function fetchTags(userId: string): Promise<Tag[]> {
  const { data, error } = await supabase
    .from('tags')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as TagRow[]).map(rowToTag)
}

// ---- Realtime subscriptions ----

export function subscribeTodos(
  userId: string,
  callback: (todos: Todo[]) => void,
): RealtimeChannel {
  return supabase
    .channel('todos-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'todos', filter: `user_id=eq.${userId}` },
      async () => {
        if (pushingTodos) return // 推送期间忽略回流
        const todos = await fetchTodos(userId)
        callback(todos)
      },
    )
    .subscribe()
}

export function subscribeLogs(
  userId: string,
  callback: (logs: LogEntry[]) => void,
): RealtimeChannel {
  return supabase
    .channel('logs-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'logs', filter: `user_id=eq.${userId}` },
      async () => {
        if (pushingLogs) return // 推送期间忽略回流
        const logs = await fetchLogs(userId)
        callback(logs)
      },
    )
    .subscribe()
}

export function subscribeTags(
  userId: string,
  callback: (tags: Tag[]) => void,
): RealtimeChannel {
  return supabase
    .channel('tags-changes')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'tags', filter: `user_id=eq.${userId}` },
      async () => {
        if (pushingTags) return // 推送期间忽略回流
        const tags = await fetchTags(userId)
        callback(tags)
      },
    )
    .subscribe()
}
