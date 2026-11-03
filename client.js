window.__ModuleLoader__.load({
  id: '@local/dsh-session-artifacts',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const { useCallback, useEffect, useState } = React

    const STATE_ROUTE = '/plugins/session-artifacts/state'
    const PINS_ROUTE = '/plugins/session-artifacts/pins'
    /** Write routes ask for a header a cross-site form cannot set. */
    const WRITE_HEADER = 'x-dsh-session-artifacts'
    const NS = 'dsh-session-artifacts'
    /** The index refreshes in the background; a slow poll keeps the pane honest. */
    const POLL_MS = 15000
    /** Right-sidebar tab kind: the type id and the body's slot key must agree. */
    const TAB_KIND = 'session-artifacts'
    /** Module evaluation time: a bundle rebuilt after this page loaded is not running here. */
    const LOADED_AT = Date.now()
    const CLOCK_SLACK_MS = 1000

    const zh = {
      tabTitle: '产物',
      tabEmpty: '还没有可显示的会话',
      guideTitle: '会话产物',
      guideDescription: '每个会话产出了哪些文件：一眼看到，单击复制路径，双击在侧边栏打开。',
      scanned: '{n} 个会话 · {files} 个产物文件',
      scanning: '首次扫描中…',
      empty: '还没有会话产出过文件',
      noMatch: '没有匹配的会话',
      search: '搜会话标题或文件路径',
      clear: '清空',
      refresh: '重新扫描',
      produced: '产物',
      consulted: '读过',
      copy: '复制路径',
      copyAll: '复制全部路径',
      copied: '已复制 {n} 条路径',
      copyFailed: '复制失败，请手动选中',
      expand: '展开',
      collapse: '收起',
      showAll: '展开全部 +{n}',
      noCwd: '（未知目录）',
      ago: '{value}前',
      stalePage: '界面代码已更新 · 点此刷新',
      error: '连不上宿主：{error}',
      retry: '重试',
      messages: '{n} 轮',
      more: '还有 {n} 个',
      currentRow: '本会话',
      pinMenu: '置顶',
      pinGlobal: '全局置顶',
      pinGlobalOff: '取消全局置顶',
      pinSession: '本会话置顶',
      pinSessionOff: '取消本会话置顶',
      pinSection: '置顶',
      pinHint: '全局置顶在所有会话上方；会话置顶只在这个会话的产物里排最前。',
      pinned: '已置顶：{name}',
      unpinned: '已取消置顶：{name}',
      pinFailed: '置顶没有保存成功',
      unpin: '取消置顶',
      previewFailed: '侧边栏打不开这个格式',
      previewUnsupported: '侧边栏不支持这个格式',
      previewUnavailable: '侧边栏还没准备好，稍后再试'
    }

    const en = {
      tabTitle: 'Artifacts',
      tabEmpty: 'No Session yet',
      guideTitle: 'Session artifacts',
      guideDescription: 'Which files each Session produced — see them at a glance, copy a path, carry on.',
      scanned: '{n} sessions · {files} produced files',
      scanning: 'First scan running…',
      empty: 'No Session has produced a file yet',
      noMatch: 'No matching Session',
      search: 'Filter by title or file path',
      clear: 'Clear',
      refresh: 'Rescan',
      produced: 'Produced',
      consulted: 'Read',
      copy: 'Copy path',
      copyAll: 'Copy all paths',
      copied: 'Copied {n} paths',
      copyFailed: 'Copy failed — select the text instead',
      expand: 'Expand',
      collapse: 'Collapse',
      showAll: 'Show {n} more',
      noCwd: '(unknown directory)',
      ago: '{value} ago',
      stalePage: 'Interface code changed · reload',
      error: 'Host unreachable: {error}',
      retry: 'Retry',
      messages: '{n} turns',
      more: '{n} more',
      currentRow: 'this one',
      pinMenu: 'Pin',
      pinGlobal: 'Pin for every Session',
      pinGlobalOff: 'Unpin everywhere',
      pinSession: 'Pin in this Session',
      pinSessionOff: 'Unpin in this Session',
      pinSection: 'Pinned',
      pinHint: 'A global pin sits above every Session; a Session pin only reorders that Session’s files.',
      pinned: 'Pinned {name}',
      unpinned: 'Unpinned {name}',
      pinFailed: 'The pin did not save',
      unpin: 'Unpin',
      previewFailed: 'The sidebar cannot preview this format',
      previewUnsupported: 'The sidebar does not preview this format',
      previewUnavailable: 'The sidebar is not ready yet — try again in a moment'
    }

    // The tab is painted in the skin's language (docs/STYLE.md of dsh-claude-style):
    // colour only through host alias tokens, shapes from the 4/8/16 ladder, motion
    // only through the skin's duration/curve tokens. Every token keeps a fallback so
    // the tab still renders when the skin is switched off — the skin's own build
    // forbids writing times outside its tokens, a plugin cannot make that promise.
    const CSS = `
.sa-tab{display:flex;flex-direction:column;height:100%;min-height:0;
  font-family:var(--dsw-font-family,ui-sans-serif,system-ui,sans-serif);font-size:12px;line-height:1.5;
  color:var(--dsw-alias-label-primary,#1f1f1f);
  --sa-feedback:var(--dsh-claude-timing-feedback,120ms ease);
  --sa-reveal:var(--dsh-claude-duration-reveal,120ms) var(--dsh-claude-ease-out,ease-out);
  --sa-surface:var(--dsh-claude-duration-surface,150ms) var(--dsh-claude-ease-settle,cubic-bezier(.22,1,.36,1));
  --sa-move:var(--dsh-claude-duration-move,200ms) var(--dsh-claude-ease-glide,cubic-bezier(.22,.61,.36,1));
  --sa-mono:var(--dsh-claude-font-code,ui-monospace,SFMono-Regular,Menlo,monospace);
  --sa-hover:var(--dsh-claude-hover-bg,var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.08)));
  --sa-fill:var(--dsw-alias-bg-layer-2,rgba(127,127,127,.08));
  --sa-line:var(--dsw-alias-border-l1,rgba(127,127,127,.24));
  --sa-sep:var(--dsh-claude-divider,var(--dsw-alias-border-l2,rgba(127,127,127,.18)));
  --sa-dim:var(--dsw-alias-label-secondary,rgba(127,127,127,.95));
  --sa-dim2:var(--dsw-alias-label-tertiary,rgba(127,127,127,.78));
  --sa-accent:var(--dsw-alias-brand-primary,#d97757)}
.sa-head{display:flex;align-items:center;gap:8px;padding:10px 12px 8px;border-bottom:0.5px solid var(--sa-sep)}
.sa-title{font-weight:600;font-size:13px;letter-spacing:-.01em}
.sa-sub{flex:1;min-width:0;color:var(--sa-dim);font-size:11px;font-variant-numeric:tabular-nums;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.sa-btn{flex:none;background:none;border:none;padding:2px 4px;border-radius:4px;color:inherit;opacity:.5;
  cursor:pointer;font-size:12px;line-height:1;transition:opacity var(--sa-feedback),transform var(--sa-feedback)}
.sa-btn:hover{opacity:1}
.sa-btn:active{transform:rotate(-18deg)}
.sa-search{padding:8px 12px;border-bottom:0.5px solid var(--sa-sep)}
.sa-input{width:100%;box-sizing:border-box;padding:5px 8px;border-radius:8px;background:var(--sa-fill);
  border:1px solid var(--sa-line);color:inherit;font:inherit;outline:none;
  transition:border-color var(--sa-feedback),background var(--sa-feedback)}
.sa-input::placeholder{color:var(--sa-dim2)}
.sa-input:focus{border-color:var(--sa-dim2);background:var(--sa-hover)}
.sa-body{flex:1;min-height:0;overflow:auto;padding:4px 0 12px;scrollbar-width:thin}
.sa-row{margin:0 8px 2px;padding:8px 8px 8px 6px;border-radius:8px;cursor:pointer;
  transition:background var(--sa-feedback)}
.sa-row:hover{background:var(--sa-hover)}
.sa-row[data-open="1"]{background:var(--sa-fill);cursor:default}
.sa-row:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--sa-dim2));outline-offset:-2px}
.sa-line{display:flex;align-items:center;gap:6px;min-width:0}
.sa-chev{flex:none;width:9px;color:var(--sa-dim2);transition:transform var(--sa-move)}
.sa-row[data-open="1"] .sa-chev{transform:rotate(90deg)}
.sa-name{flex:1;min-width:0;font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sa-count{flex:none;padding:0 6px;border-radius:999px;font-size:10.5px;line-height:16px;
  font-variant-numeric:tabular-nums;color:var(--sa-accent);background:rgba(217,119,87,.14);
  background:color-mix(in srgb,var(--sa-accent) 14%,transparent)}
.sa-meta{display:flex;align-items:baseline;gap:6px;margin-top:2px;padding-left:15px;
  color:var(--sa-dim);font-size:11px;min-width:0}
.sa-cwd{flex:1;min-width:0;direction:rtl;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sa-files{list-style:none;margin:8px 0 0;padding:4px 0 0;border-top:0.5px solid var(--sa-sep)}
.sa-filecell{list-style:none;margin:0;padding:0}
.sa-file{display:flex;align-items:center;gap:8px;padding:4px 4px 4px 11px;border-radius:6px;cursor:pointer;
  animation:sa-drop var(--sa-reveal) both;animation-delay:calc(var(--sa-i,0) * var(--dsh-claude-duration-instant,80ms) / 6)}
.sa-file:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--sa-accent));outline-offset:-2px}
.sa-file:hover{background:var(--sa-hover)}
.sa-file[data-open="1"]{background:var(--sa-fill)}
.sa-pinglyph{flex:none;color:var(--sa-accent);opacity:.85}
.sa-pinglyph-global{color:var(--sa-dim);opacity:.75}
.sa-pinmenu{display:flex;flex-wrap:wrap;gap:6px;margin:2px 0 6px 22px;
  animation:sa-drop var(--sa-reveal) both}
.sa-pinopt{background:var(--sa-fill);border:1px solid var(--sa-line);border-radius:999px;
  padding:2px 10px;font-family:inherit;font-size:10.5px;line-height:16px;color:var(--sa-dim);cursor:pointer;
  transition:background var(--sa-feedback),color var(--sa-feedback),border-color var(--sa-feedback)}
.sa-pinopt:hover{background:var(--sa-hover);color:var(--dsw-alias-label-primary,inherit)}
.sa-pinopt[data-on="1"]{color:var(--sa-accent);border-color:var(--sa-accent)}
.sa-fname{flex:none;max-width:46%;font-family:var(--sa-mono);font-size:11.5px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sa-fdir{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--sa-mono);font-size:10.5px;
  color:var(--sa-dim2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sa-copy{flex:none;background:none;border:none;padding:0 2px;border-radius:4px;color:inherit;
  opacity:0;cursor:pointer;font-size:11px;line-height:1;
  transition:opacity var(--sa-feedback),color var(--sa-feedback)}
.sa-file:hover .sa-copy,.sa-copy:focus-visible{opacity:.6}
.sa-copy:hover{opacity:1;color:var(--sa-accent)}
.sa-fpin{flex:none;display:inline-flex;align-items:center;background:none;border:none;padding:0 2px;
  border-radius:4px;color:inherit;opacity:0;cursor:pointer;line-height:1;
  transition:opacity var(--sa-feedback),color var(--sa-feedback)}
.sa-file:hover .sa-fpin,.sa-fpin:focus-visible{opacity:.55}
.sa-fpin:hover{opacity:1;color:var(--sa-accent)}
.sa-fpinglyph{display:block;transform:rotate(24deg)}
.sa-gpins{margin:0 8px 4px;padding:2px 0 6px;border-bottom:0.5px solid var(--sa-sep)}
.sa-ghead{display:flex;align-items:center;gap:8px;padding:8px 8px 4px 11px;color:var(--sa-dim);
  font-size:10.5px;letter-spacing:.04em;text-transform:uppercase}
.sa-gcount{color:var(--sa-accent);font-variant-numeric:tabular-nums}
.sa-gfile{padding-left:11px}
/* Pinned rows keep their actions faintly visible: they are the ones you undo. */
.sa-gfile .sa-copy{opacity:.3}
.sa-gfile:hover .sa-copy{opacity:.9}
.sa-unpin{font-size:13px;line-height:1}
.sa-actions{display:flex;align-items:center;gap:14px;margin:8px 0 0 11px}
.sa-link{background:none;border:none;padding:2px 0;border-radius:4px;cursor:pointer;font-size:11px;
  color:var(--sa-dim);transition:color var(--sa-feedback)}
.sa-link:hover{color:var(--sa-accent);text-decoration:underline;text-underline-offset:2px}
.sa-empty{padding:20px 12px;text-align:center;color:var(--sa-dim2);font-size:11.5px}
.sa-empty[data-busy="1"]{animation:sa-pulse calc(var(--dsh-claude-duration-fade,300ms) * 3) var(--dsh-claude-ease-in-out,ease-in-out) infinite alternate}
.sa-toast{position:sticky;bottom:0;margin:8px 12px;padding:5px 10px;border-radius:8px;text-align:center;
  font-size:11px;color:var(--sa-accent);background:rgba(217,119,87,.12);
  background:color-mix(in srgb,var(--sa-accent) 12%,transparent);
  animation:sa-rise var(--sa-surface) both}
.sa-toast[data-bad="1"]{color:var(--dsw-alias-state-warn-label,#c2410c);
  background:color-mix(in srgb,var(--dsw-alias-state-warn-label,#c2410c) 12%,transparent)}
.sa-stale{display:block;width:calc(100% - 24px);margin:8px 12px 0;padding:5px 10px;border-radius:8px;
  border:0.5px solid color-mix(in srgb,var(--sa-accent) 40%,transparent);background:transparent;
  color:var(--sa-accent);cursor:pointer;font:inherit;font-size:11px;line-height:1.4;
  animation:sa-rise var(--sa-surface) both;transition:background var(--sa-feedback)}
.sa-stale:hover{background:color-mix(in srgb,var(--sa-accent) 10%,transparent)}
.sa-read{display:flex;align-items:baseline;gap:6px;margin:8px 0 0 11px;color:var(--sa-dim2);font-size:11px}
.sa-readpath{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  font-family:var(--sa-mono);font-size:10.5px}
.sa-cur{flex:none;padding:0 6px;border-radius:999px;font-size:10px;line-height:15px;
  color:var(--sa-accent);background:rgba(217,119,87,.14);
  background:color-mix(in srgb,var(--sa-accent) 14%,transparent)}
.sa-chip{display:flex;align-items:center;gap:5px;font-size:11.5px;color:inherit;opacity:.9}
@keyframes sa-drop{from{opacity:0;transform:translateY(-3px)}to{opacity:1;transform:none}}
@keyframes sa-rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes sa-pulse{0%,100%{opacity:.55}50%{opacity:1}}
@media (prefers-reduced-motion:reduce){
  .sa-file,.sa-toast,.sa-stale,.sa-empty[data-busy="1"]{animation:none}
  .sa-row,.sa-chev,.sa-btn,.sa-input,.sa-copy,.sa-link,.sa-stale{transition:none}
}
`

    /** Workspace label: the last path segment of the folder, not the bucket name. */
    function workspaceOf(cwd) {
      if (typeof cwd !== 'string' || cwd === '') return ''
      const parts = cwd.replace(/[\\/]+$/, '').split(/[\\/]/)
      return parts[parts.length - 1] ?? ''
    }

    function splitPath(path) {
      const at = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'))
      if (at < 0) return { name: path, dir: '' }
      return { name: path.slice(at + 1), dir: path.slice(0, at) }
    }

    // Windows paths read right-to-left; a two-segment tail says more in 1/3 of the width
    // than an ellipsised full path, and never leaves the RTL bidi marks the CSS hack did.
    function shortDir(dir) {
      if (dir.length === 0) return ''
      const parts = dir.split(/[\\/]/).filter((part) => part.length > 0)
      if (parts.length <= 2) return dir
      return `…\\${parts.slice(-2).join('\\')}`
    }

    const FILE_CAP = 12

    /* ------------------------------------------------------------------ pins */

    /** Same normalisation the Host uses, so "pinned" means one thing on both sides. */
    function pinKey(path) {
      return String(path).trim().replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase()
    }

    function hasPin(list, path) {
      const key = pinKey(path)
      return (Array.isArray(list) ? list : []).some((entry) => pinKey(entry) === key)
    }

    function sessionPinList(pins, sessionId) {
      const table = pins?.sessions
      if (table === null || typeof table !== 'object') return []
      return Array.isArray(table[sessionId]) ? table[sessionId] : []
    }

    function pinGlyph(className) {
      return h(
        'svg',
        { className, width: 11, height: 11, viewBox: '0 0 12 12', 'aria-hidden': 'true' },
        h('path', {
          d: 'M4 1.5h4M6 1.5v4M3.2 5.5h5.6l-1 3H4.2zM6 8.5v2',
          fill: 'none',
          stroke: 'currentColor',
          'stroke-width': '1.2',
          'stroke-linecap': 'round',
          'stroke-linejoin': 'round'
        })
      )
    }

    // --- the right sidebar -----------------------------------------------------------
    // The Host's file preview claims `dsh-resource://file/session/<sessionId>/<path>`
    // only: a bare `file/absolute` address is claimed by no type and the open throws.
    const RESOURCE_PREFIX = 'dsh-resource://file/session/'
    const ENCODE_ONE = (segment) => encodeURIComponent(segment).replace(/%3A/gi, ':')

    function fileAddress(sessionId, path) {
      const normalized = String(path).replace(/\\/g, '/').replace(/^(?:\.\/)+/, '')
      const body = normalized.split('/').map(ENCODE_ONE).join('/')
      return `${RESOURCE_PREFIX}${ENCODE_ONE(String(sessionId))}/${body}`
    }

    // What the preview actually renders. An unknown extension falls to its plain-text
    // reader, which refuses binary content, so guessing per file beats a bare try.
    const PREVIEWABLE = new Set([
      'md', 'markdown', 'txt', 'log', 'csv', 'tsv', 'json', 'jsonl', 'yaml', 'yml', 'toml',
      'ini', 'conf', 'cfg', 'env', 'xml', 'html', 'htm', 'css', 'scss', 'sass', 'less',
      'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'svelte', 'astro', 'py', 'rb', 'go',
      'rs', 'java', 'kt', 'kts', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'sh',
      'bash', 'zsh', 'ps1', 'psm1', 'bat', 'cmd', 'lua', 'sql', 'r', 'pl', 'ex', 'exs',
      'erl', 'hs', 'clj', 'scala', 'dart', 'gradle', 'patch', 'diff',
      'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico', 'avif',
      'pdf', 'docx', 'xlsx', 'pptx'
    ])

    function previewable(path) {
      const name = splitPath(path).name.toLowerCase()
      const dot = name.lastIndexOf('.')
      // No extension at all (Dockerfile, Makefile) or a dotfile (`.gitignore`) is text.
      if (dot <= 0) return name !== ''
      return PREVIEWABLE.has(name.slice(dot + 1))
    }

    // One click copies, two clicks preview — so the first click of a double click must
    // not copy. The copy therefore waits out the platform's double-click window, and a
    // double click cancels the pending copy that its first click scheduled.
    const CLICK_MS = 240
    let pendingCopy = null
    // The right sidebar service can be provided after this plugin applies — it waits on
    // the session model, this tab does not — so a handle read once and kept would stay
    // null for the life of the window and refuse every preview. Keep the injected handle
    // when it arrives, and probe live for the gap before that.
    let rightbar = null
    let probeRightbar = () => null

    function cancelPendingCopy() {
      if (pendingCopy !== null) {
        clearTimeout(pendingCopy)
        pendingCopy = null
      }
    }

    function scheduleCopy(run) {
      cancelPendingCopy()
      pendingCopy = setTimeout(() => {
        pendingCopy = null
        run()
      }, CLICK_MS)
    }

    /**
     * `open` when the sidebar took the file, `format` when its preview does not claim
     * the extension, `service` when the sidebar is not available at all — three
     * different fixes, so the caller can say which one applies.
     */
    function openPreview(sessionId, path) {
      if (sessionId === undefined || sessionId === null) return 'service'
      const column = rightbar ?? probeRightbar()
      if (column === null) return 'service'
      if (!previewable(path)) return 'format'
      try {
        // `preferNewPane` splits the docked column when the two-pane rule allows it, so
        // the list stays visible beside the file instead of being replaced by it.
        column.openResource(fileAddress(sessionId, path), { preferNewPane: true })
        return 'open'
      } catch {
        return 'service'
      }
    }

    /** Says which way the preview declined, if it did. */
    function previewToast(t, result) {
      return result === 'format' ? t('previewUnsupported') : result === 'service' ? t('previewUnavailable') : ''
    }

    /** A click on a control is the control's, never the row's. */
    function fromControl(event) {
      const target = event?.target
      return target !== null && typeof target?.closest === 'function' && target.closest('button') !== null
    }

    function formatAgo(at, t) {
      if (typeof at !== 'number' || at <= 0) return ''
      const minutes = Math.floor((Date.now() - at) / 60000)
      if (minutes < 1) return t('ago', { value: '<1m' })
      if (minutes < 60) return t('ago', { value: `${minutes}m` })
      const hours = Math.floor(minutes / 60)
      if (hours < 24) return t('ago', { value: `${hours}h` })
      return t('ago', { value: `${Math.floor(hours / 24)}d` })
    }

    async function copyText(text) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch {
        return false
      }
    }

    const store = {
      data: null,
      pins: { version: 1, global: [], sessions: {} },
      error: '',
      loading: false,
      listening: new Set(),
      get() {
        return { data: store.data, pins: store.pins, error: store.error, loading: store.loading }
      },
      set(patch) {
        Object.assign(store, patch)
        for (const listener of store.listening) listener()
      },
      subscribe(listener) {
        store.listening.add(listener)
        return () => store.listening.delete(listener)
      },
      async refresh() {
        try {
          const res = await fetch(STATE_ROUTE, { headers: { accept: 'application/json' } })
          const body = await res.json()
          if (body?.ok !== true) throw new Error(body?.error ?? `HTTP ${res.status}`)
          store.set({ data: body, pins: body.pins ?? store.pins, error: '', loading: false })
        } catch (error) {
          store.set({ error: error instanceof Error ? error.message : String(error), loading: false })
        }
      },
      /**
       * Pins are the one write this plugin makes. The Host answers with the whole
       * table, so a racing click cannot leave the pane showing a stale pin.
       */
      async setPin(input) {
        try {
          const res = await fetch(PINS_ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json', [WRITE_HEADER]: '1' },
            body: JSON.stringify(input)
          })
          const body = await res.json()
          if (body?.ok !== true) throw new Error(body?.error ?? `HTTP ${res.status}`)
          store.set({
            pins: {
              version: body.version ?? 1,
              global: Array.isArray(body.global) ? body.global : [],
              sessions: body.sessions ?? {}
            }
          })
          return true
        } catch {
          return false
        }
      }
    }

    function SessionRow({ session, t, pins, onToast, onPin, expanded, onToggle, isCurrent }) {
      const produced = Array.isArray(session.produced) ? session.produced : []
      const consulted = Array.isArray(session.consulted) ? session.consulted : []
      const [showAll, setShowAll] = useState(false)
      const [pinPath, setPinPath] = useState(null)
      const mine = sessionPinList(pins, session.id)
      const everywhere = Array.isArray(pins?.global) ? pins.global : []
      // Pinned files lead their Session. The sort is stable, so the Host's
      // newest-first order survives inside each rank.
      const ordered = produced.slice().sort((left, right) => {
        const rank = (entry) => (hasPin(mine, entry.path) ? 0 : hasPin(everywhere, entry.path) ? 1 : 2)
        return rank(left) - rank(right)
      })
      const visible = showAll ? ordered : ordered.slice(0, FILE_CAP)
      const hidden = ordered.length - visible.length
      const copyPathOnly = useCallback(
        async (path) => {
          const ok = await copyText(path)
          onToast(ok, ok ? t('copied', { n: '1' }) : t('copyFailed'))
        },
        [onToast, t]
      )
      const copyOne = useCallback(
        async (event, path) => {
          event.stopPropagation()
          const ok = await copyText(path)
          onToast(ok, ok ? t('copied', { n: '1' }) : t('copyFailed'))
        },
        [onToast, t]
      )
      const copyAll = useCallback(
        async (event) => {
          event.stopPropagation()
          const ok = await copyText(produced.map((entry) => entry.path).join('\r\n'))
          onToast(ok, ok ? t('copied', { n: String(produced.length) }) : t('copyFailed'))
        },
        [onToast, produced, t]
      )
      const commitPin = useCallback(
        async (event, entry, scope, pinned) => {
          event.stopPropagation()
          setPinPath(null)
          const saved = await onPin({ path: entry.path, scope, sessionId: session.id, pinned })
          const name = splitPath(entry.path).name
          onToast(saved, saved ? t(pinned ? 'pinned' : 'unpinned', { name }) : t('pinFailed'))
        },
        [onPin, onToast, session.id, t]
      )
      return h(
        'div',
        {
          className: 'sa-row',
          'data-open': expanded ? '1' : '0',
          onClick: onToggle,
          role: 'button',
          tabIndex: 0,
          'aria-expanded': expanded ? 'true' : 'false',
          title: session.cwd ?? ''
        },
        h(
          'div',
          { className: 'sa-line' },
          h(
            'svg',
            { className: 'sa-chev', width: 9, height: 9, viewBox: '0 0 9 9', 'aria-hidden': 'true' },
            h('path', { d: 'M2.5 1L6 4.5 2.5 8', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
          ),
          h('span', { className: 'sa-name' }, session.title || t('tabTitle')),
          isCurrent ? h('span', { className: 'sa-cur' }, t('currentRow')) : null,
          produced.length > 0 ? h('span', { className: 'sa-count' }, String(produced.length)) : null
        ),
        h(
          'div',
          { className: 'sa-meta' },
          h('span', null, workspaceOf(session.cwd) || t('noCwd')),
          h('span', null, '·'),
          h('span', null, formatAgo(session.lastAt, t)),
          session.tools > 0 ? h('span', null, `· ${session.tools} tools`) : null
        ),
        expanded
          ? h(
              'div',
              null,
              h(
                'ul',
                { className: 'sa-files' },
                visible.map((entry, index) => {
                  const parts = splitPath(entry.path)
                  const inSession = hasPin(mine, entry.path)
                  const inGlobal = hasPin(everywhere, entry.path)
                  const open = pinPath === entry.path
                  return h(
                    'li',
                    { className: 'sa-filecell', key: `${entry.path}:${index}` },
                    h(
                      'div',
                      {
                        className: 'sa-file',
                        role: 'link',
                        tabIndex: 0,
                        title: entry.path,
                        'data-open': open ? '1' : '0',
                        style: { '--sa-i': String(Math.min(index, FILE_CAP)) },
                        onClick: (event) => {
                          event.stopPropagation()
                          if (fromControl(event)) return
                          scheduleCopy(() => void copyPathOnly(entry.path))
                        },
                        onDoubleClick: (event) => {
                          event.stopPropagation()
                          if (fromControl(event)) return
                          cancelPendingCopy()
                          const result = openPreview(session.id, entry.path)
                          if (result !== 'open') onToast(false, previewToast(t, result))
                        },
                        onKeyDown: (event) => {
                          if (event.key !== 'Enter') return
                          event.stopPropagation()
                          const result = openPreview(session.id, entry.path)
                          if (result !== 'open') onToast(false, previewToast(t, result))
                        }
                      },
                      inSession || inGlobal ? pinGlyph(inSession ? 'sa-pinglyph' : 'sa-pinglyph sa-pinglyph-global') : null,
                      h('span', { className: 'sa-fname', title: entry.path }, parts.name),
                      h('span', { className: 'sa-fdir', title: entry.path }, shortDir(parts.dir)),
                      h(
                        'button',
                        {
                          className: 'sa-fpin',
                          type: 'button',
                          title: t('pinMenu'),
                          onClick: (event) => {
                            event.stopPropagation()
                            setPinPath(open ? null : entry.path)
                          }
                        },
                        pinGlyph('sa-fpinglyph')
                      ),
                      h(
                        'button',
                        {
                          className: 'sa-copy',
                          type: 'button',
                          title: t('copy'),
                          onClick: (event) => void copyOne(event, entry.path)
                        },
                        '⧉'
                      )
                    ),
                    open
                      ? h(
                          'div',
                          { className: 'sa-pinmenu', onClick: (event) => event.stopPropagation() },
                          h(
                            'button',
                            {
                              className: 'sa-pinopt',
                              type: 'button',
                              'data-on': inSession ? '1' : '0',
                              onClick: (event) => void commitPin(event, entry, 'session', !inSession)
                            },
                            inSession ? t('pinSessionOff') : t('pinSession')
                          ),
                          h(
                            'button',
                            {
                              className: 'sa-pinopt',
                              type: 'button',
                              'data-on': inGlobal ? '1' : '0',
                              onClick: (event) => void commitPin(event, entry, 'global', !inGlobal)
                            },
                            inGlobal ? t('pinGlobalOff') : t('pinGlobal')
                          )
                        )
                      : null
                  )
                })
              ),
              produced.length > 0
                ? h(
                    'div',
                    { className: 'sa-actions' },
                    hidden > 0
                      ? h(
                          'button',
                          {
                            className: 'sa-link',
                            type: 'button',
                            onClick: (event) => {
                              event.stopPropagation()
                              setShowAll(true)
                            }
                          },
                          t('showAll', { n: String(hidden) })
                        )
                      : showAll && produced.length > FILE_CAP
                        ? h(
                            'button',
                            {
                              className: 'sa-link',
                              type: 'button',
                              onClick: (event) => {
                                event.stopPropagation()
                                setShowAll(false)
                              }
                            },
                            t('collapse')
                          )
                        : null,
                    h('button', { className: 'sa-link', type: 'button', onClick: (event) => void copyAll(event) }, t('copyAll'))
                  )
                : h('div', { className: 'sa-empty' }, t('empty')),
              consulted.length > 0
                ? h(
                    'div',
                    { className: 'sa-read' },
                    h('span', null, `${t('consulted')} ${consulted.length}`),
                    h('span', { className: 'sa-readpath', title: consulted[0].path }, consulted[0].path)
                  )
                : null
            )
          : null
      )
    }

    function Body({ t, sessionId }) {
      const [state, setState] = useState(store.get())
      const [query, setQuery] = useState('')
      const [expanded, setExpanded] = useState(() => sessionId ?? '')
      const [toast, setToast] = useState(null)

      useEffect(() => {
        setState(store.get())
        const off = store.subscribe(() => setState(store.get()))
        return off
      }, [])

      useEffect(() => {
        if (toast === null) return undefined
        const timer = window.setTimeout(() => setToast(null), 2200)
        return () => window.clearTimeout(timer)
      }, [toast])

      const onToast = useCallback((ok, text) => {
        setToast({ ok, text })
      }, [])

      const onPin = useCallback((input) => store.setPin(input), [])

      const copyPath = useCallback(
        async (path) => {
          const ok = await copyText(path)
          onToast(ok, ok ? t('copied', { n: '1' }) : t('copyFailed'))
        },
        [onToast, t]
      )

      // A global pin names a file, not the Session that produced it: the preview address
      // still needs one, so look the owner up and fall back to the Session in view.
      const ownerOf = useCallback(
        (path) => {
          const key = pinKey(path)
          const owners = Array.isArray(state.data?.sessions) ? state.data.sessions : []
          const found = owners.find((session) => (session.produced ?? []).some((entry) => pinKey(entry.path) === key))
          return found?.id ?? sessionId ?? null
        },
        [sessionId, state.data]
      )

      const data = state.data
      const sessions = Array.isArray(data?.sessions) ? data.sessions : []
      const pins = state.pins
      const globalPins = Array.isArray(pins?.global) ? pins.global : []
      // The pane is per Session, so the Session being looked at leads the list:
      // that is the one whose files this reader most likely wants back.
      const mine = sessions.find((session) => sessionId !== undefined && session.id === sessionId)
      const ordered = mine === undefined ? sessions : [mine, ...sessions.filter((session) => session !== mine)]
      const needle = query.trim().toLowerCase()
      const filtered =
        needle === ''
          ? ordered
          : ordered.filter((session) => {
              if (String(session.title ?? '').toLowerCase().includes(needle)) return true
              if (String(session.cwd ?? '').toLowerCase().includes(needle)) return true
              return (session.produced ?? []).some((entry) => String(entry.path).toLowerCase().includes(needle))
            })
      const stale = typeof data?.clientStamp === 'number' && data.clientStamp > LOADED_AT + CLOCK_SLACK_MS

      return h(
        'div',
        { className: 'sa-tab' },
        h(
          'div',
          { className: 'sa-head' },
          h('span', { className: 'sa-title' }, t('tabTitle')),
          h(
            'span',
            { className: 'sa-sub' },
            data === null
              ? t('scanning')
              : t('scanned', { n: String(sessions.length), files: String(data.fileTotal ?? 0) })
          ),
          // No "this Session" pill here: the row below already carries it, and a second
          // accent pill in the header only competes with the count that matters.
          h(
            'button',
            { className: 'sa-btn', type: 'button', title: t('refresh'), onClick: () => void store.refresh() },
            '↻'
          )
        ),
        stale
          ? h(
              'button',
              { className: 'sa-stale', type: 'button', onClick: () => window.location.reload() },
              t('stalePage')
            )
          : null,
        h(
          'div',
          { className: 'sa-search' },
          h('input', {
            className: 'sa-input',
            type: 'search',
            value: query,
            placeholder: t('search'),
            onChange: (event) => setQuery(event.target.value)
          })
        ),
        h(
          'div',
          { className: 'sa-body' },
          globalPins.length > 0
            ? h(
                'div',
                { className: 'sa-gpins' },
                h(
                  'div',
                  { className: 'sa-ghead', title: t('pinHint') },
                  h('span', null, t('pinSection')),
                  h('span', { className: 'sa-gcount' }, String(globalPins.length))
                ),
                globalPins.map((path, index) => {
                  const parts = splitPath(path)
                  return h(
                    'div',
                    {
                      className: 'sa-file sa-gfile',
                      key: `pin:${path}`,
                      role: 'link',
                      tabIndex: 0,
                      title: path,
                      onClick: (event) => {
                        if (fromControl(event)) return
                        scheduleCopy(() => void copyPath(path))
                      },
                      onDoubleClick: (event) => {
                        if (fromControl(event)) return
                        cancelPendingCopy()
                        const result = openPreview(ownerOf(path), path)
                        if (result !== 'open') onToast(false, previewToast(t, result))
                      },
                      onKeyDown: (event) => {
                        if (event.key !== 'Enter') return
                        cancelPendingCopy()
                        const result = openPreview(ownerOf(path), path)
                        if (result !== 'open') onToast(false, previewToast(t, result))
                      }
                    },
                    pinGlyph('sa-pinglyph sa-pinglyph-global'),
                    h('span', { className: 'sa-fname', title: path }, parts.name),
                    h('span', { className: 'sa-fdir', title: path }, shortDir(parts.dir)),
                    h(
                      'button',
                      {
                        className: 'sa-copy',
                        type: 'button',
                        title: t('copy'),
                        onClick: (event) => {
                          event.stopPropagation()
                          void (async () => {
                            const ok = await copyText(path)
                            onToast(ok, ok ? t('copied', { n: '1' }) : t('copyFailed'))
                          })()
                        }
                      },
                      '⧉'
                    ),
                    h(
                      'button',
                      {
                        className: 'sa-copy sa-unpin',
                        type: 'button',
                        title: t('unpin'),
                        onClick: (event) => {
                          event.stopPropagation()
                          void (async () => {
                            const saved = await onPin({ path, scope: 'global', pinned: false })
                            const name = splitPath(path).name
                            onToast(saved, saved ? t('unpinned', { name }) : t('pinFailed'))
                          })()
                        }
                      },
                      '×'
                    )
                  )
                })
              )
            : null,
          state.error !== ''
            ? h(
                'div',
                { className: 'sa-empty' },
                t('error', { error: state.error }),
                h('div', null, h('button', { className: 'sa-link', type: 'button', onClick: () => void store.refresh() }, t('retry')))
              )
            : filtered.length === 0
              ? h(
                  'div',
                  { className: 'sa-empty', 'data-busy': data === null ? '1' : '0' },
                  data === null ? t('scanning') : sessions.length === 0 ? t('empty') : t('noMatch')
                )
              : filtered.map((session) =>
                  h(SessionRow, {
                    key: session.id ?? `${session.bucket}:${session.lastAt}`,
                    session,
                    t,
                    pins,
                    onToast,
                    onPin,
                    isCurrent: session === mine,
                    expanded: expanded === session.id,
                    onToggle: () => setExpanded(expanded === session.id ? '' : session.id)
                  })
                ),
          toast === null
            ? null
            : h(
                'div',
                { className: 'sa-toast', 'data-bad': toast.ok ? '0' : '1' },
                toast.text
              )
        )
      )
    }

    function ArtifactsGlyph({ size = 16, className }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.6,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          className
        },
        h('path', { d: 'M4 7a2 2 0 0 1 2-2h3l1.6 2H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z' }),
        h('path', { d: 'M8 12h8' }),
        h('path', { d: 'M8 15.5h5' })
      )
    }

    function TabChip({ t }) {
      return h(
        'span',
        { className: 'sa-chip' },
        h(ArtifactsGlyph, { size: 13 }),
        h('span', null, t('tabTitle'))
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => {
          const offZh = ctx.locale.register(NS, 'zh', zh)
          const offEn = ctx.locale.register(NS, 'en', en)
          return () => {
            offZh()
            offEn()
          }
        }, 'session-artifacts: dictionaries')

        const t = ctx.locale.bind(NS)

        // The right sidebar is provided by another plugin, so it is fetched at runtime
        // and may be absent: no preview then, and every other part of the tab keeps
        // working. It also activates later than this tab — its fiber waits for the
        // session model — so waiting for the service the way the tab registry is waited
        // for is what makes the handle real, instead of a null captured at apply time.
        probeRightbar = () => ctx.get('sidebarRight') ?? null
        ctx.inject(['sidebarRight'], (withRight) => {
          withRight.effect(() => {
            rightbar = withRight.get('sidebarRight') ?? null
            return () => {
              cancelPendingCopy()
              rightbar = null
            }
          }, 'session-artifacts: right sidebar handle')
        })

        ctx.effect(() => {
          const style = document.createElement('style')
          style.textContent = CSS
          document.head.appendChild(style)
          return () => style.remove()
        }, 'session-artifacts: styles')

        ctx.effect(() => {
          void store.refresh()
          const timer = window.setInterval(() => {
            if (document.hidden !== true) void store.refresh()
          }, POLL_MS)
          return () => window.clearInterval(timer)
        }, 'session-artifacts: polling')

        // Optional on purpose: without the registry the plugin stays loaded and
        // quiet instead of taking the whole profile down with it.
        ctx.inject(['sidebarRightTabs'], (withTabs) => {
          withTabs.effect(
            () =>
              withTabs.sidebarRightTabs.register({
                id: TAB_KIND,
                kind: TAB_KIND,
                title: () => t('tabTitle'),
                guide: [
                  {
                    order: 62,
                    title: () => t('guideTitle'),
                    description: () => t('guideDescription'),
                    icon: ArtifactsGlyph
                  }
                ]
              }),
            'session-artifacts: tab type'
          )

          withTabs.effect(
            () =>
              withTabs.slots.inject('sidebar.right.pane.tab', () =>
                withTabs.slots.register(
                  { name: 'sidebar.right.pane.tab', key: TAB_KIND, locale: NS },
                  (props) => h(Body, Object.assign({}, props, { t }))
                )
              ),
            'session-artifacts: tab body'
          )

          // The two-stage contract: the chip beside the body lives in its own
          // keyed seat under the same key, so a tab without it would open blank.
          withTabs.effect(
            () =>
              withTabs.slots.inject('sidebar.right.pane.tab.title', () =>
                withTabs.slots.register(
                  { name: 'sidebar.right.pane.tab.title', key: TAB_KIND, locale: NS },
                  () => h(TabChip, { t })
                )
              ),
            'session-artifacts: tab chip'
          )
        })
      }
    }
  }
})
