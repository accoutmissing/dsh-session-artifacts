import { readFileSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { open, readdir, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { zstdDecompressSync } from 'node:zlib'

/**
 * Session artifacts — the Host half.
 *
 * Every Session writes one append-only log under `~/.dsh/sessions`; the file
 * paths it touched live in there as `tool/call` rows. This half decodes those
 * logs into one row per Session so the browser can answer "which Session made
 * this file?" without opening the files themselves. Read-only throughout.
 */

const STATE_ROUTE = '/plugins/session-artifacts/state'
const PINS_ROUTE = '/plugins/session-artifacts/pins'
/** Our own bundle: its mtime tells an already-open page that code moved. */
const CLIENT_FILE = fileURLToPath(new URL('./client.js', import.meta.url))

/** How many Sessions a single response may carry. The list is newest first. */
const MAX_SESSIONS = 400
/** Tool rows are the only file evidence, and they sit anywhere in the log. */
const LOG_NAME = 'session.v4.jsonl.zstd'
/** A log never grows beyond this during one read; guards a runaway file. */
const MAX_LOG_BYTES = 600 * 1024 * 1024

const LOG_FILE = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'session-artifacts.log')
const LOG_MAX_BYTES = 1_000_000
const CACHE_FILE = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'session-artifacts-cache.json')
const CACHE_VERSION = 4

/** Pins are the only state this plugin keeps: two scopes, one tiny file. */
const PINS_FILE = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'session-artifacts-pins.json')
const PINS_VERSION = 1
/** Enough for a year of favourites; keeps the file small and the response bounded. */
const PIN_MAX = 200
const PIN_PATH_MAX = 1024
const PIN_SESSION_MAX = 128
/** Write routes need a header a cross-site form cannot set; loopback alone is not enough. */
const WRITE_HEADER = 'x-dsh-session-artifacts'
const BODY_MAX_BYTES = 8 * 1024

/** One zstd frame per flush: a log is many frames, not one. */
const FRAME_MAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])

/** Tools whose arguments name a file the Session produced. */
const WRITE_TOOLS = new Set(['write', 'edit'])
/** Tools whose arguments name a file the Session consumed. */
const READ_TOOLS = new Set(['read', 'ops_read_files', 'ops_inspect_local_file'])

function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

function oneLine(value, limit = 2000) {
  const flat = String(value).split('\n').join(' ')
  return flat.length > limit ? `${flat.slice(0, limit)}…` : flat
}

function log(line) {
  try {
    const full = `${new Date().toISOString()} ${oneLine(line)}`
    try {
      if (statSync(LOG_FILE).size > LOG_MAX_BYTES) renameSync(LOG_FILE, `${LOG_FILE}.1`)
    } catch {
      /* first write */
    }
    writeFileSync(LOG_FILE, `${full}\n`, { encoding: 'utf8', flag: 'a' })
  } catch {
    /* a broken log must never break the routes */
  }
}

/** `~/.dsh/sessions`, following the symlink the profile keeps pointing at WSL. */
function sessionsRoot() {
  return join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'sessions')
}

/** Split a log into frames. Node's decompressor stops at the first frame end. */
export function decodeLog(raw) {
  const starts = []
  let at = raw.indexOf(FRAME_MAGIC, 0)
  while (at !== -1) {
    starts.push(at)
    at = raw.indexOf(FRAME_MAGIC, at + 4)
  }
  const parts = []
  let failed = 0
  for (let index = 0; index < starts.length; index += 1) {
    const end = index + 1 < starts.length ? starts[index + 1] : raw.length
    try {
      parts.push(zstdDecompressSync(raw.subarray(starts[index], end)))
    } catch {
      // A frame still being appended ends the readable range.
      failed += 1
    }
  }
  return { text: Buffer.concat(parts).toString('utf8'), frames: starts.length, failed }
}

function stringOf(value) {
  return typeof value === 'string' ? value : ''
}

/** A path is worth listing only if it looks like a file the user could open. */
function plausiblePath(value) {
  if (typeof value !== 'string' || value.length < 4 || value.length > 400) return null
  if (!/^[A-Za-z]:[\\/]|^\//.test(value)) return null
  return value
}

/**
 * Fold one decoded log into the row the browser draws.
 *
 * A log holds one JSON object per line. Only four shapes matter: the Session
 * header (cwd, preset), its title, the `tool/call` rows naming files, and any
 * row's `time` for "when was this last touched".
 */
export function foldLog(text) {
  const files = new Map()
  let id = ''
  let cwd = ''
  let createdAt = 0
  let parentSession = ''
  let delegationDepth = 0
  let agentPreset = ''
  let title = ''
  let lastAt = 0
  let userMessages = 0
  let assistantMessages = 0
  let tools = 0

  const note = (path, kind, when) => {
    const entry = files.get(path)
    if (entry === undefined) {
      files.set(path, { path, writes: kind === 'w' ? 1 : 0, reads: kind === 'r' ? 1 : 0, lastAt: when })
      return
    }
    if (kind === 'w') entry.writes += 1
    else entry.reads += 1
    if (when > entry.lastAt) entry.lastAt = when
  }

  for (const line of text.split('\n')) {
    if (line.length < 24 || line.charCodeAt(0) !== 123) continue
    // Cheap prefilter: a full parse of 20k rows is wasted on the ones we skip.
    if (!line.includes('"type":"')) continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    const when = typeof row.time === 'number' ? row.time : 0
    if (when > lastAt) lastAt = when
    switch (row.type) {
      case 'session': {
        id = stringOf(row.id)
        cwd = stringOf(row.cwd)
        createdAt = typeof row.createdAt === 'number' ? row.createdAt : 0
        parentSession = stringOf(row.parentSession)
        delegationDepth = typeof row.delegationDepth === 'number' ? row.delegationDepth : 0
        agentPreset = stringOf(row.agentPreset)
        break
      }
      case 'session/title': {
        const next = stringOf(row.data?.title)
        if (next !== '') title = next
        break
      }
      case 'user/message': {
        userMessages += 1
        break
      }
      case 'assistant/message': {
        assistantMessages += 1
        break
      }
      case 'tool/call': {
        tools += 1
        const name = stringOf(row.data?.name)
        const writes = WRITE_TOOLS.has(name)
        const reads = !writes && READ_TOOLS.has(name)
        if (!writes && !reads) break
        let args
        try {
          // `arguments` is itself a JSON string, not an object.
          args = JSON.parse(stringOf(row.data?.arguments) || '{}')
        } catch {
          break
        }
        const kind = writes ? 'w' : 'r'
        const single = plausiblePath(args.file_path ?? args.path)
        if (single !== null) note(single, kind, when)
        if (Array.isArray(args.files)) {
          for (const item of args.files) {
            const path = plausiblePath(item?.path ?? item?.file_path)
            if (path !== null) note(path, kind, when)
          }
        }
        break
      }
      default:
        break
    }
  }

  const produced = []
  const consulted = []
  for (const entry of files.values()) {
    if (entry.writes > 0) produced.push(entry)
    else consulted.push(entry)
  }
  produced.sort((left, right) => right.lastAt - left.lastAt)
  consulted.sort((left, right) => right.lastAt - left.lastAt)
  return {
    id,
    title,
    cwd,
    createdAt,
    parentSession,
    delegationDepth,
    agentPreset,
    lastAt,
    userMessages,
    assistantMessages,
    tools,
    produced,
    consulted
  }
}

/** Every `--bucket--/<session>/session.v4.jsonl.zstd` below the sessions root. */
async function collectLogs(root) {
  const logs = []
  let buckets
  try {
    buckets = await readdir(root, { withFileTypes: true })
  } catch (error) {
    log(`sessions root unreadable: ${messageOf(error)}`)
    return logs
  }
  for (const bucket of buckets) {
    if (!bucket.isDirectory() && !bucket.isSymbolicLink()) continue
    const bucketPath = join(root, bucket.name)
    let sessions
    try {
      sessions = await readdir(bucketPath, { withFileTypes: true })
    } catch {
      continue
    }
    for (const session of sessions) {
      if (!session.isDirectory()) continue
      const path = join(bucketPath, session.name, LOG_NAME)
      try {
        const info = await stat(path)
        if (info.size <= 0 || info.size > MAX_LOG_BYTES) continue
        logs.push({ path, bucket: bucket.name, session: session.name, size: info.size, mtimeMs: info.mtimeMs })
      } catch {
        /* a session directory without a log yet */
      }
    }
  }
  return logs
}

async function readWhole(path, size) {
  const handle = await open(path, 'r')
  try {
    const buffer = Buffer.allocUnsafe(size)
    let offset = 0
    while (offset < size) {
      const { bytesRead } = await handle.read(buffer, offset, size - offset, offset)
      if (bytesRead === 0) break
      offset += bytesRead
    }
    return buffer.subarray(0, offset)
  } finally {
    await handle.close()
  }
}

/** Rows survive a restart: a 136-log pass is cheap, but not free at every boot. */
let cache = new Map()
let cacheLoaded = false

function loadCache() {
  if (cacheLoaded) return
  cacheLoaded = true
  try {
    const parsed = JSON.parse(readFileSync(CACHE_FILE, 'utf8'))
    if (parsed?.version !== CACHE_VERSION || typeof parsed.rows !== 'object') return
    for (const [path, entry] of Object.entries(parsed.rows)) {
      if (typeof entry?.size !== 'number' || typeof entry?.mtimeMs !== 'number') continue
      cache.set(path, entry)
    }
  } catch {
    /* no cache yet */
  }
}

function saveCache() {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify({ version: CACHE_VERSION, rows: Object.fromEntries(cache) }), 'utf8')
  } catch (error) {
    log(`cache write failed: ${messageOf(error)}`)
  }
}

let scanPromise = undefined
let lastScan = { at: 0, total: 0, read: 0, cached: 0, failed: 0 }

async function scan() {
  loadCache()
  const root = sessionsRoot()
  const logs = await collectLogs(root)
  const rows = []
  let read = 0
  let reused = 0
  let failed = 0
  const live = new Set()
  for (const entry of logs) {
    live.add(entry.path)
    const known = cache.get(entry.path)
    if (known !== undefined && known.size === entry.size && known.mtimeMs === entry.mtimeMs) {
      reused += 1
      rows.push({ ...known.row, bucket: known.bucket ?? entry.bucket })
      continue
    }
    try {
      const raw = await readWhole(entry.path, entry.size)
      const { text } = decodeLog(raw)
      const row = foldLog(text)
      cache.set(entry.path, { size: entry.size, mtimeMs: entry.mtimeMs, bucket: entry.bucket, row })
      read += 1
      rows.push({ ...row, bucket: entry.bucket })
    } catch (error) {
      failed += 1
      log(`fold failed for ${oneLine(entry.path, 160)}: ${messageOf(error)}`)
    }
  }
  for (const path of [...cache.keys()]) if (!live.has(path)) cache.delete(path)
  if (read > 0) saveCache()
  lastScan = { at: Date.now(), total: rows.length, read, cached: reused, failed }
  // Sessions that produced files first, then the newest of each group: the list
  // exists to hand work back, and a Session with nothing to hand back is noise
  // at the top of it.
  const weight = (row) => ((row.produced?.length ?? 0) > 0 ? 0 : 1)
  rows.sort((left, right) => weight(left) - weight(right) || (right.lastAt ?? 0) - (left.lastAt ?? 0))
  return { rows, root }
}

function fresh() {
  scanPromise ??= scan().finally(() => {
    scanPromise = undefined
  })
  return scanPromise
}

function clientStamp() {
  try {
    return statSync(CLIENT_FILE).mtimeMs
  } catch {
    return null
  }
}

/**
 * Sessions that produced files first, then the newest of each group: the list
 * exists to hand work back, and a Session with nothing to hand back is noise at
 * the top of it. Applied here as well as in `scan()`, because the warm path
 * serves rows straight out of the cache, whose order is insertion order.
 */
function orderRows(rows) {
  const weight = (row) => ((row.produced?.length ?? 0) > 0 ? 0 : 1)
  return [...rows].sort((left, right) => weight(left) - weight(right) || (right.lastAt ?? 0) - (left.lastAt ?? 0))
}

function summarize(rows) {
  const sessions = []
  let fileTotal = 0
  for (const row of orderRows(rows).slice(0, MAX_SESSIONS)) {
    const produced = row.produced ?? []
    fileTotal += produced.length
    sessions.push({
      id: row.id,
      title: row.title,
      cwd: row.cwd,
      bucket: row.bucket,
      createdAt: row.createdAt,
      lastAt: row.lastAt,
      parentSession: row.parentSession,
      delegationDepth: row.delegationDepth,
      agentPreset: row.agentPreset,
      userMessages: row.userMessages,
      assistantMessages: row.assistantMessages,
      tools: row.tools,
      produced: produced.map((entry) => ({ path: entry.path, writes: entry.writes, lastAt: entry.lastAt })),
      consulted: (row.consulted ?? []).slice(0, 40).map((entry) => ({ path: entry.path, reads: entry.reads }))
    })
  }
  return { sessions, fileTotal }
}

function json(res, status, body) {
  if (res.headersSent === true) return
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload)
  })
  res.end(payload)
}

function fromLoopback(req) {
  const address = req.socket?.remoteAddress ?? ''
  return address === '127.0.0.1' || address === '::1' || address === '::ffff:127.0.0.1'
}

function guarded(handler) {
  return (req, res) => {
    try {
      const outcome = handler(req, res)
      if (outcome instanceof Promise) {
        outcome.catch((error) => {
          log(`route failed: ${messageOf(error)}`)
          json(res, 500, { ok: false, error: oneLine(messageOf(error)) })
        })
      }
    } catch (error) {
      log(`route threw: ${messageOf(error)}`)
      json(res, 500, { ok: false, error: oneLine(messageOf(error)) })
    }
  }
}

/**
 * Which revision of our browser bundle the running boot graph carries. A page
 * that loaded before a rebuild keeps the old one, and this is how it can tell.
 */
function describeClient(ctx) {
  try {
    const modules = ctx.get('clientModules')
    const graph = modules?.graph?.()
    const entries = Array.isArray(graph?.entries) ? graph.entries : []
    const mine = entries.filter((entry) => String(entry?.id ?? '').includes('session-artifacts'))
    return { graphRev: graph?.rev ?? null, total: entries.length, entries: mine }
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ pins */

/** Case and separators differ between callers; pins compare on this form. */
function pinKey(path) {
  return String(path).trim().replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase()
}

function emptyPins() {
  return { version: PINS_VERSION, global: [], sessions: {} }
}

function sanitizePins(raw) {
  const out = emptyPins()
  if (raw === null || typeof raw !== 'object') return out
  const paths = (value) => {
    const seen = new Set()
    const kept = []
    for (const path of Array.isArray(value) ? value : []) {
      if (typeof path !== 'string' || path.length === 0 || path.length > PIN_PATH_MAX) continue
      const key = pinKey(path)
      if (!key.includes('/')) continue
      if (seen.has(key)) continue
      seen.add(key)
      kept.push(path)
      if (kept.length >= PIN_MAX) break
    }
    return kept
  }
  out.global = paths(raw.global)
  const sessions = raw.sessions
  if (sessions !== null && typeof sessions === 'object' && !Array.isArray(sessions)) {
    for (const [id, value] of Object.entries(sessions)) {
      if (id.length === 0 || id.length > PIN_SESSION_MAX) continue
      const entries = paths(value)
      if (entries.length > 0) out.sessions[id] = entries
    }
  }
  return out
}

/** Held in memory: the file is only re-read on a cold start. */
let pins = null

function readPins() {
  if (pins !== null) return pins
  try {
    pins = sanitizePins(JSON.parse(readFileSync(PINS_FILE, 'utf8')))
  } catch {
    pins = emptyPins()
  }
  return pins
}

function savePins(next) {
  pins = next
  const temporary = `${PINS_FILE}.tmp`
  try {
    writeFileSync(temporary, JSON.stringify(next, null, 2), 'utf8')
    renameSync(temporary, PINS_FILE)
  } catch (error) {
    log(`pins write failed: ${messageOf(error)}`)
  }
  return next
}

function withPin(list, path) {
  const key = pinKey(path)
  if (list.some((entry) => pinKey(entry) === key)) return list
  return [...list, path].slice(0, PIN_MAX)
}

function withoutPin(list, path) {
  const key = pinKey(path)
  return list.filter((entry) => pinKey(entry) !== key)
}

function togglePin({ path, scope, sessionId, pinned }) {
  const current = readPins()
  const next = { version: PINS_VERSION, global: current.global, sessions: { ...current.sessions } }
  if (scope === 'global') {
    next.global = pinned ? withPin(current.global, path) : withoutPin(current.global, path)
  } else {
    const updated = pinned ? withPin(current.sessions[sessionId] ?? [], path) : withoutPin(current.sessions[sessionId] ?? [], path)
    if (updated.length > 0) next.sessions[sessionId] = updated
    else delete next.sessions[sessionId]
  }
  return savePins(next)
}

function fromOwnPage(req) {
  return String(req.headers?.[WRITE_HEADER] ?? '').length > 0
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > BODY_MAX_BYTES) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

export const inject = ['webServer']

export function apply(ctx) {
  const stateRoute = guarded(async (req, res) => {
    if (!fromLoopback(req)) {
      json(res, 403, { ok: false, error: 'loopback only' })
      return
    }
    if (req.method !== 'GET') {
      json(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    const cachedRows = [...cache.values()].map((entry) => ({ ...entry.row, bucket: entry.bucket }))
    let rows = cachedRows
    let root = sessionsRoot()
    if (rows.length === 0) {
      const scanned = await fresh()
      rows = scanned.rows
      root = scanned.root
    } else {
      void fresh()
    }
    const { sessions, fileTotal } = summarize(rows)
    json(res, 200, {
      ok: true,
      root,
      sessions,
      fileTotal,
      pins: readPins(),
      scan: lastScan,
      client: describeClient(ctx),
      clientStamp: clientStamp()
    })
  })

  const pinsRoute = guarded(async (req, res) => {
    if (!fromLoopback(req)) {
      json(res, 403, { ok: false, error: 'loopback only' })
      return
    }
    if (req.method === 'GET') {
      json(res, 200, { ok: true, ...readPins() })
      return
    }
    if (req.method !== 'POST') {
      json(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    if (!fromOwnPage(req)) {
      json(res, 403, { ok: false, error: `missing ${WRITE_HEADER} header` })
      return
    }
    let input = null
    try {
      input = JSON.parse(await readBody(req))
    } catch (error) {
      json(res, 400, { ok: false, error: `body must be JSON: ${oneLine(messageOf(error))}` })
      return
    }
    const path = typeof input?.path === 'string' ? input.path.trim() : ''
    if (path.length === 0 || path.length > PIN_PATH_MAX) {
      json(res, 400, { ok: false, error: 'path must be a non-empty string' })
      return
    }
    // A separator-less string is never one of the paths this pane shows, and a mangled
    // write would otherwise pin a row that can never match a file again.
    if (!pinKey(path).includes('/')) {
      json(res, 400, { ok: false, error: 'path must be a full path' })
      return
    }
    const scope = input?.scope === 'global' ? 'global' : input?.scope === 'session' ? 'session' : null
    if (scope === null) {
      json(res, 400, { ok: false, error: 'scope must be "global" or "session"' })
      return
    }
    const sessionId = typeof input?.sessionId === 'string' ? input.sessionId.trim() : ''
    if (scope === 'session' && (sessionId.length === 0 || sessionId.length > PIN_SESSION_MAX)) {
      json(res, 400, { ok: false, error: 'sessionId is required for a Session pin' })
      return
    }
    const next = togglePin({ path, scope, sessionId, pinned: input?.pinned !== false })
    json(res, 200, { ok: true, ...next })
  })

  ctx.effect(() => {
    const disposers = [
      ctx.webServer.register({ kind: 'exact', path: STATE_ROUTE, handler: stateRoute }),
      ctx.webServer.register({ kind: 'exact', path: PINS_ROUTE, handler: pinsRoute })
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'session-artifacts: routes')

  void fresh().catch((error) => log(`initial scan failed: ${messageOf(error)}`))
}

export const internals = {
  foldLog,
  decodeLog,
  collectLogs,
  scan,
  sessionsRoot,
  summarize,
  pinKey,
  sanitizePins,
  togglePin,
  PINS_FILE
}
