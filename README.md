**简体中文** · [English](README.en.md)

# 会话产物 · dsh-session-artifacts

给 DeepSeek Harness（DSH）的 Web UI 加一个右栏标签页：**把所有会话产出过的文件列成一张清单**，当前会话置顶、文件名与父目录分行、点一下复制路径。

它不生成文件，也不改动任何东西——只是把已经散落在会话日志里的「谁写了哪个路径」重新变成看得见的一列，让下一次会话能接着上一次的活干，而不是重新盘一遍。

```
产物                                         140 个会话 · 892 个产物文件   ↻
┌──────────────────────────────────────────────────────────────┐
│ 置顶 1                                                        │
│  📌 PLUGIN-PLAN.md   …\default-workspace\            ⧉   ×   │
├──────────────────────────────────────────────────────────────┤
│ ▸ ✨ 功能｜派活台插件后台派活        本会话  65               │
│   📌 client.js      …\dsh-session-artifacts\         ⧉  📌   │
│      index.js       …\dsh-session-artifacts\         ⧉  📌   │
│      package.json   …\dsh-session-artifacts\         ⧉  📌   │
│      展开全部 +53                       复制全部路径          │
└──────────────────────────────────────────────────────────────┘
```

## 为什么需要它

一次会话里我建过哪些文件、改过哪些文件，事后是不可见的。会话日志里有记录，但那是给人看的流水账，不是清单。于是下一次会话只有两条路：把整棵目录重新盘一遍（慢，而且盘不全），或者靠人凭记忆指路（更慢，而且会漏）。

这个插件把那条记录折成清单。它不是「整理文件」——文件在哪就是哪，一个都不动；它只是把「上次动了什么」变成可以一眼看完、可以一键复制的列表。

## 交互

| 操作 | 结果 |
| --- | --- |
| 单击文件行 | 复制该文件完整路径 |
| 双击文件行 | 在右侧栏打开预览；右栏已分屏时开在另一栏 |
| 行获得焦点时按 Enter | 等同于双击 |
| ⧉ | 只复制，不触发整行 |
| 📌（hover 出现） | 展开两个作用域：本会话置顶 / 全局置顶 |
| 置顶区 × | 直接取消全局置顶 |

- **两级置顶**：全局置顶在所有会话上方单列一区；会话置顶只把这条排到该会话产物列表最前。置顶写在宿主侧（`~/.dsh/session-artifacts-pins.json`），换页面、换会话都还在。
- **当前会话**永远排第一并默认展开，带一个「本会话」小标——因为右栏是会话作用域的，你在哪个会话里，想找的通常就是它。
- 搜索框同时匹配会话标题、工作目录、产物路径。
- 配色与动效跟随当前皮肤（本机是 `dsh-claude-style`）：颜色只走宿主 token、分隔线 0.5px、圆角取 4/8/16 梯子、动效只用皮肤的时长与曲线 token，并且**每个 token 都带 fallback**，皮肤关掉也不会塌。

## 安装

这是一个 DSH bundle（`dsh.bundle.patch` 指向 `cordis.patch.yml`），装法与其它本地 bundle 相同：

```js
// 在 DSH 会话里让 Agent 执行
plugin_manager({ action: 'install_bundle',
                 target: 'D:\\路径\\到\\dsh-session-artifacts' })
```

- 返回 `application: "applied"` 才算生效；`failed` 时看 `warnings`。
- 安装后**刷新页面**（Ctrl+R）才会挂上新的 client bundle；标签出现在右栏的标签条里。
- 改了插件代码不重启也会生效：`plugin_manager({ action:'set_plugin', target:'include:dsh-session-artifacts', enabled:false })` 再 `enabled:true`（entry id 不是包名）。

## 数据从哪来

DSH 的会话日志是**唯一**能回答「这个会话产出过哪些文件」的数据源。`workspaceChanges` 服务只服务 live session（而且要 `seq`），历史会话问不到。

| 事实 | 细节 |
| --- | --- |
| 日志位置 | `~/.dsh/sessions/<按工作区转义的桶名>/<sessionId>/session.v4.jsonl.zstd` |
| 文件格式 | **多个 zstd 帧首尾相接**。`zstdDecompressSync` 只解第一帧（4.2 MB 的文件只出 290 字节），必须按魔数 `28 b5 2f fd` 切片逐帧解；尾部未写完的帧跳过 |
| 会话标题 | `session/title` 行自带标题，不必解析首条用户消息 |
| 产物路径 | 只能来自 `tool/call`：`write` / `edit` 的 `arguments`（JSON 字符串，要二次 `parse`）里有 `file_path` |
| 实测规模 | 本机 140 个会话 / 892 个产物文件；冷启动全量索引 ~3 s，暖启动 ~0.2 s |

缓存写在 `~/.dsh/session-artifacts-cache.json`，按 `size + mtime` 增量：没变过的会话不重新解压。首次扫描在后台跑，界面先显示「首次扫描中…」。

## 路由与安全

| 路由 | 方法 | 说明 |
| --- | --- | --- |
| `/plugins/session-artifacts/state` | GET | 全量索引结果 + 置顶表 + client 版本戳 |
| `/plugins/session-artifacts/pins` | GET / POST | 读 / 切换一条置顶 |

- 两个路由都只接受 loopback 请求；写路由还要求 `x-dsh-session-artifacts` 自定义头（跨站表单加不上这个头），body ≤ 8 KB。
- 置顶比较前先归一化：分隔符统一成 `/`、去尾斜杠、转小写。所以在 A 会话里用 `D:\x\y.js`、在 B 会话里用 `d:/X/Y.js` 置顶的是同一条。
- 插件**不发起任何外部网络请求**，`dependencies` / `devDependencies` / `peerDependencies` 全空。

## 兼容性与已知限制

- 只在 **Windows + DSH 桌面版**上实测（Electron 自带 Node 24，提供 `zlib.zstdDecompressSync`）。日志路径在其它平台是同一个 `~/.dsh/sessions`，但没有实测过。
- **产物只认 `write` / `edit` 工具调用里的 `file_path`**。`ops_bash` 命令里顺手生成的文件（重定向、构建产物、下载）不会进清单——那些路径藏在 shell 命令字符串里，猜比漏更糟，所以不猜。
- 索引窗口上限 400 个会话，`node_modules` / `.git` / `dist` 等目录在反查产物时跳过。
- 预览只对侧栏认得的那批格式开：源码、配置、文本、常见图片，以及 pdf/docx/xlsx/pptx。其余格式会提示「侧边栏不支持这个格式」，而不是开一个花屏。

## 开发

没有构建步骤，`index.js` 是宿主半部（注册路由、解帧、索引），`client.js` 是浏览器半部（右栏标签）。两个文件都只在**运行时**存在约定，不需要打包。

```bash
node --check index.js && node --check client.js
```

改 UI 时注意：这个插件不自带配色方案，它读皮肤的 token。想确认没写死颜色/时长，可以照着 `client.js` 里 `CSS` 常量的写法自查——原始时间值只允许出现在 token 的 fallback 里。

## 许可

MIT，见 [LICENSE](LICENSE)。
