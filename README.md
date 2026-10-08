# 职途 AI · 私人 Job Search Agent

中文 Next.js / TypeScript / Tailwind Web 应用。仅第一阶段：PDF 简历、PDF/PPTX 作品集、逐页核对、职业能力档案、可选 AI 分析。第二至第四阶段尚未开发。

**生产架构：Supabase Auth + 私有 Storage + PostgreSQL RLS，Vercel 运行网页和分段解析 API。** 未配置 Supabase 或未解除验证锁时，资料接口拒绝访问。应用不开放注册，不需要也不使用 Supabase service_role / secret key。

非程序员请先阅读 **[逐步部署说明](docs/DEPLOYMENT.md)**；安全边界见 **[安全说明](docs/SECURITY.md)**。代码提交不代表已部署或真实托管权限已经验证。

## 可用功能

- 只允许环境变量指定的本人 UID 登录，数据库 `private.app_owner` 也必须匹配。无注册接口，Supabase 项目还必须关闭公开注册。
- PDF 简历和 PDF/PPTX 作品集原件保存在 `career-private` 私有 bucket；可下载或删除。解析文字与预览同样私有，不进入 GitHub。
- 每次最多 15 MB、60 页、账号最多4个文件。浏览器凭限定路径的签名上传 URL 直接上传 Storage，文件不经过 Vercel 请求体。
- 每个解析请求处理3页，进度持久化，可继续解析。PDF提取文字和页面预览；PPTX按实际页序提取文字、内嵌 PNG/JPEG 和原生图表缓存值，不重建完整排版。
- 每页显示原文最多3000字，超限明确提示；可下载原件核对完整内容。自动候选按原文关键词提取，最多每类150条，不推测姓名、学历或经历。
- 档案编辑、确认、数据库保存、跨浏览器登录恢复、JSON导出；单文件删除会删除其引用条目；清空操作分批移除所有原件、预览与档案。
- 可选 AI：经本人明确同意后逐页发送文字和有限图片，每请求1页，最多前12页。结果待人工核实，不自动成为已确认履历。不配置 AI Key 也可使用原文解析。

## 服务端环境变量

复制 `.env.example` 的变量名到安全的环境设置中。**不要把密钥或密码发到聊天、写入 README、提交 GitHub。**

| 变量 | 用途 |
|---|---|
| `SUPABASE_URL` | 项目 HTTPS 地址 |
| `SUPABASE_PUBLISHABLE_KEY` | Publishable key 或旧版 anon key，服务端使用 |
| `SUPABASE_OWNER_USER_ID` | 本人 Auth User UID，与 SQL 授权一致 |
| `DEPLOYMENT_LOCKED` | 默认锁定；只在私人验证环境验证时设 `false`，正式解锁需通过真实权限检查 |
| `COOKIE_SECURE` | HTTPS为`true`，Vercel强制安全cookie；本机合成测试用`false` |
| `AI_API_KEY` / `AI_BASE_URL` / `AI_MODEL` | 可选 AI 服务端设置 |

没有 `NEXT_PUBLIC_*` 配置，没有生产 `.data` 路径，没有生产 service-role 客户端。Auth 会话令牌只保存在 HttpOnly cookie，API Key 不发给网页。签名文件 URL 是短期授权凭据，请勿分享。

## 数据库初始化

按顺序在全新 Supabase 项目的 SQL Editor 执行：

1. `supabase/migrations/20261008000000_private_workspace.sql`：表、RLS、事务函数和私有 bucket。
2. 创建本人 Auth 用户、复制 UID，修改并执行 `supabase/set-owner.sql`。
3. 配置相同的服务端 UID；关闭 Supabase 新用户注册、匿名登录和不需要的登录方式。

详见部署说明。不要直接在存有其他应用的项目上混用未知 Storage policies。

## 开发与构建

需要 Node.js 24。依赖由 `package-lock.json` 固定。

```bash
npm ci --cache /tmp/job-agent-npm-cache
npm run dev
npm run test
npm run typecheck
npm run build
npm run start
```

环境未配置时页面显示私人登录页并拒绝资料访问。云环境不一定提供网页预览；不要将远程服务器的内部地址当成电脑上的入口。

## 测试

```bash
npm run test             # 15项纯逻辑/合成文件测试
npm run typecheck
npm run build
npm audit --omit=dev
```

`npm run test:e2e` 默认检查未登录拒绝访问；完整上传测试必须使用本地专门生成的合成账号，绝不使用本人线上账号。

需要 Docker 和 Chromium 的完整本地测试：

```bash
npm run test:stack       # 终端1：轻量官方 Auth/Storage/PostgREST/Postgres 组件，仅限本地
npm run test:local       # 终端2：本地生成两名合成用户，测试 RLS 和真实浏览器流程
```

测试栈使用命名测试容器和回环地址，暂存凭据位于受限的 `/tmp/job-agent-local-stack/`，退出时清理；不会上传到线上项目，也不使用真实简历。Storage 和 Auth 使用官方镜像。普通 PostgreSQL 兼容引导替代完整 Supabase Postgres 镜像；正式托管项目仍需单独验证。浏览器默认 `/usr/bin/chromium`，可用 `CHROMIUM_PATH` 指定安装位置。

## Serverless 边界

API只接收小型JSON。原件直接进入Storage；下载原件/预览使用短期签名链接，避免大文件响应经过Vercel。解析每次3页、AI每次1页，最大执行时长60秒，数据库租约150秒，过期可重试。档案保存使用revision避免覆盖新修改；数据库事务与租约替代内存锁。

文档metadata ≤700KB、档案 ≤1MB，避免全量状态响应无限增长。部分复杂文件可能仍超过单次解析的内存或执行预算，届时需拆分或压缩；此版本不提供独立后台worker。

## 目录

- `components/Workspace.tsx`：保留原有中文工作台，增加下载、删除、继续解析及退出。
- `app/login/`、`lib/supabase.ts`：服务端Supabase会话、本人登录。
- `app/api/`：所有资料及AI请求校验本人身份；签名直传、分批解析、私有文件访问。
- `lib/parse.ts`、`lib/profile.ts`：PDF/PPTX解析、原文证据候选。
- `lib/repository.ts`：Supabase持久化及删除，不使用本地文件存储。
- `supabase/migrations/`：初始化SQL；`supabase/set-owner.sql`：本人UID授权模板。
- `tests/`、`scripts/`：内存合成样本和本地安全验证。

不要公开包含真实资料的环境快照，不要添加 `.data/`、`.env*`、测试输出或原件到Git。默认保留原件直到本人删除，不自动过期；后续可增加保留期限、备份管理和清理任务。
