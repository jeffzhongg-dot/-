# 第一阶段：Vercel + Supabase 私人部署说明

本指南先配置与验证私有后端，再部署网页。当前代码提交不等于已经发布。没有完成本人登录、账号隔离、私有文件读写/删除验证前，不要创建公开可用的部署。

## 第一步：创建 Supabase 项目（你操作网页）

1. 打开 https://supabase.com/dashboard ，注册或登录。
2. 点击 **New project**；如提示创建组织，先创建个人组织。
3. 项目名填 `job-search-agent`；设置强数据库密码，并安全保管，不发送到聊天。
4. 选择适合你的区域和套餐，确认页面当前费用后创建。等待项目显示可用。
5. 此时只需告诉助手“项目已创建”，并提供 **Project URL**（不是密码或密钥），以便配置所需域名。

## 第二步：禁止公开注册、建立本人账号（你操作网页）

1. 左侧 **Authentication** → **Sign In / Providers**（界面也可能显示设置或登录方式）。找到 **Allow new users to sign up / Enable Sign Ups**，关闭并保存。
2. 关闭匿名登录；不启用Google等其他登录方式。保留Email+Password登录，不启用公开注册入口。
3. 进入 **Authentication → Users → Add user → Create new user**。
4. 输入你自己的邮箱和强密码；选择确认邮箱/Auto Confirm（如果提供）。账号通过管理员后台创建，公开注册保持关闭。
5. 打开此用户记录，复制 **User UID**。UID不是APIKey，但也不要公开传播账号信息。后续SQL和服务端配置需要相同值。
6. 忘记密码由本人在这里安全重设；当前应用不提供公开注册或公开密码恢复页面。

## 第三步：初始化数据库与私有文件存储

1. 在GitHub仓库打开 `supabase/migrations/20261008000000_private_workspace.sql`，点击 **Raw**，复制全部SQL文字。此文件没有密钥或个人信息。
2. Supabase左侧 **SQL Editor → New query**，粘贴并点击 **Run**。
3. 打开 `supabase/set-owner.sql`，复制到另一条SQL查询。
4. 把 `REPLACE_WITH_YOUR_USER_UUID` 改成第二步复制的本人UID。只替换这一段，保留两边单引号，点击 **Run**。
5. 左侧 **Storage** 应出现 `career-private` bucket，确认 **Public 为关闭**。不要点击“设为公开”，不要添加“允许所有人读取/上传”的策略。
6. 数据表 `career_profiles` 和 `career_documents` 必须开启RLS。`private.app_owner` 不通过数据API公开。

建议使用新项目，不与其他应用的Storage策略混用。SQL可重复执行，但不是迁移已有其他应用权限的工具。Supabase管理员与service-role仍属于可信管理边界，不应向他人授权。

## 第四步：在私人环境安全配置并验证（助手尽量自动完成）

你需要在安全的环境设置里填写：

- `SUPABASE_URL`：项目URL，在Project Settings的Data API/API设置查看。
- `SUPABASE_PUBLISHABLE_KEY`：Project Settings → API Keys中的Publishable key；旧项目可用anon key。**不要提供secret / service_role key**，应用不需要它们。
- `SUPABASE_OWNER_USER_ID`：第二步的本人UID。
- `COOKIE_SECURE=true`用于HTTPS；本机私人验证时可为false，Vercel强制Secure。
- `DEPLOYMENT_LOCKED=true`：保持锁定。助手只在不公开的验证进程里设false进行权限检查，公开环境保持true直到验收。

不要把APIKey/密码发送到聊天。若当前云端安全设置支持变量/密钥，助手会根据具体项目URL保存变量需求，指导你在对应设置面板填写。配置存在但无法联网时还需允许访问该项目域名。

真实项目验证至少包括：

1. 未登录访问档案、文件签名、下载、删除和AI接口被拒绝。
2. 本人可以登录；另一名有效但未授权的临时测试账号不能登录工作台或直接访问数据/Storage。
3. 匿名直链不能读私有对象；本人只能操作自己UID路径，篡改对象路径不能跨账号读取或上传。
4. 用合成PDF和PPTX验证直传、分批解析、预览、原件下载、档案保存恢复。
5. 删除后档案引用及原件/预览消失；并发解析租约和过期档案revision不能覆盖数据。
6. 关闭注册的设置确实生效；云平台快照、GitHub和构建包不含测试凭据、私密数据。

只使用合成文件进行验收。测试脚本的本地“清空”功能不要对线上真实账号运行；正式项目的验证要分别删除新建的测试文件，保留原有用户数据。尚未完成以上检查就不能宣称线上访问控制已验证。

## 第五步：验证通过后才导入 Vercel（你操作网页）

**在验证完成、助手明确汇报并且你同意之前，不执行本步骤。**

1. 打开 https://vercel.com/new ，使用GitHub登录。
2. 选择 `jeffzhongg-dot/-`。如果没有显示，点击配置GitHub访问，只授权此仓库。
3. 点击 **Import**，框架选 **Next.js**，Root Directory保持仓库根目录，Node.js选24.x。
4. 在 **Environment Variables** 中填写上述服务端变量；不使用 `NEXT_PUBLIC_` 前缀，不填service-role。先保持 `DEPLOYMENT_LOCKED=true`。
5. 可选AI Key先不填写；本地原文解析不需要它。
6. 在Vercel项目的 **Settings → Deployment Protection** 中确认可用的访问保护是否覆盖将要使用的生产与预览地址。套餐和保护范围可能变化，以当时网页为准；不能只保护预览而以为生产也受保护。不要开启绕过保护的共享链接。
7. 再执行部署。保持验证锁时数据接口拒绝访问；完成托管环境的最后检查后，经本人同意将 `DEPLOYMENT_LOCKED` 设为false并重新部署。
8. 在部署完成页点击 **Visit**，获得真正的HTTPS网页地址。以后直接打开该网址登录，不访问远程内部地址。

部分保护设置需创建项目后才能选择。如果平台在项目创建时自动构建，验证锁必须预先设为true，不能先发布可上传资料的无锁版本。

## 上传/AI/文件隐私

- 15MB原件从浏览器直接上传到Supabase，不通过Vercel函数请求体。签名上传只允许预定的本人文件路径，不允许覆盖旧对象。
- 原件与页面图片均为私有bucket，档案受RLS保护。预览/下载链接有效60秒；拿到链接的人在其有效期内可访问，因此不要分享或记录链接。上传签名由Supabase管理，有效期可能达2小时，也不得分享。
- 解析每次3页，AI每次1页，声明60秒函数预算。实际函数时长、内存和费用受Vercel套餐限制，必须在部署时核对；复杂PDF可能仍需压缩或拆分。
- 解析文字每页最多3000字，有明确截断提示；原件完整保留到本人删除。图表识别、扫描文字和AI结论都需要人工核实。
- 存储/数据库服务管理员与平台备份不是用户RLS阻挡的对象。请保护平台账号，开启平台支持的二次验证，不共享管理员权限。删除应用对象不承诺立即擦除平台备份。
- 默认不开AI外传；本人主动勾选后，选定页面会发给AI供应商。配置AI前需允许供应商域名，确认其数据使用设置。应用不把AI建议自动变成真实经历。

## 暂停与维护

- 怀疑账号泄露时先将 `DEPLOYMENT_LOCKED=true` 并重新部署；在Supabase后台修改密码/撤销会话。不要只删除浏览器cookie。
- Supabase/Vercel费用、暂停项目、Storage配额、备份保留和过期签名行为由平台管理；本项目不自动购买套餐或扩大费用。
- 原件及档案不会自动到期删除，可在应用下载/导出后删除。上传签名可能在删除后仍短期有效，极端情况下可产生不可读取的孤立对象；需在签名到期后检查Storage并清理，本项目尚无后台定时孤立对象清理服务。

## 邮件恢复密码（不解除资料验证锁）

支持 Supabase 默认邮件模板，无需自定义 SMTP、管理员密钥、新环境变量或数据库迁移。原 UID、白名单与 RLS 保留，资料接口继续由 `DEPLOYMENT_LOCKED=true` 拒绝访问。

1. 等待现有 Vercel 项目的最新提交部署为 **Ready**，保持 `DEPLOYMENT_LOCKED=true`。
2. 在 Supabase **Authentication → URL Configuration** 确认 **Site URL** 是自己的固定 HTTPS 网站根地址，例如 `https://your-project.vercel.app`。已正确时不需要修改。不要包含 `/login`，不要使用通配域名。
3. 不修改默认 **Reset Password** 邮件模板，不需要设置 SMTP。如果已使用下面的自定义模板，仍兼容。
4. 在 **Authentication → Users** 打开本人现有账号，点击 **Send password recovery**。如果限流仍在，等待限制解除，不要连续重试。
5. 打开最新邮件的重置链接。Supabase 验证成功后会回到网站，网站识别 `type=recovery` 的会话并显示“设置新密码”。点击“验证本人恢复链接”，输入两次新密码（16–128 位，符合项目密码策略），点击“保存新密码”。成功后使用原邮箱与新密码重新登录。
6. 已过期、已使用或不完整的链接显示明确错误；需重新申请邮件。邮件客户端安全扫描可能提前消费一次性链接，此时也需要重新申请，不会放宽校验。不要分享含恢复凭据的链接或调试请求正文。

默认邮件先在 Supabase 验证一次性 OTP，成功后将 access/refresh token 通过 URL fragment 返回网站。根路径重定向到登录页时浏览器保留 fragment；登录页识别恢复会话并切换至设置密码组件，不把它误当成普通登录。页面读取后立即清除地址栏凭据，只保留在内存中，在本人确认时通过同源 POST 交给服务端 SDK `setSession`，再通过 `getUser` 验证真实身份与 `is_app_owner` 核对授权。不能仅凭客户端的 `type` 或解码 JWT 判断权限。

仍兼容自定义邮件模板（仅在你的 SMTP 配置允许编辑时可选）：

```html
<a href="{{ .SiteURL }}/reset-password#token_hash={{ .TokenHash }}&amp;type=recovery">设置新密码</a>
```

密码保存接口核对本人 UID 与数据库白名单，再调用 `updateUser`，不修改邮箱或其他用户。未登录、跨站请求、伪造会话、非本人或数据库权限错误都会拒绝保存。已通过本人校验的现有登录会话也可调用密码更新接口。成功后退出当前浏览器会话；不承诺其他设备会话全部即时失效。

网页功能不能修复 Mac DNS、错误的 Vercel 配置或邮件发送限额。真实托管项目仍需本人通过新邮件完成最终验证；本地测试只使用合成账号和官方默认验证链接，不发送真实邮件。

### 身份验证错误诊断

恢复、登录及密码更新页面会显示安全诊断编号；Vercel 日志仅记录 `auth_diagnostic`、编号及 HTTP 状态，不记录身份凭据、邮箱、UID、项目地址、错误原文或请求正文。无需在网页调试工具复制敏感请求。

- `RECOVERY_EXCHANGE_PROJECT_MISMATCH`：收到的恢复会话签发地址与网站配置的 Supabase 地址不一致。仅在认证失败时利用未验证 claims 解释错误，绝不用于授权；自定义 Auth 域名也需核对。
- `…PROJECT_KEY_REJECTED`：身份接口拒绝后，只读查询 Auth settings 也拒绝了网站密钥。核对同一项目的 URL 与 Publishable key，并重新部署。该只读检查不发送邮件或修改用户。
- `…LINK_INVALID` / `…SESSION_INVALID`：服务明确报告链接或会话失效。
- `…RATE_LIMIT` / `…SERVICE_UNAVAILABLE`：服务限流或连接/服务错误。
- `…AUTH_REJECTED` / `…TOKEN_REJECTED`：服务拒绝验证，但尚不能确定原因，不应直接断定密码错误或链接过期。
- `RECOVERY_OWNER_MISMATCH` / `RECOVERY_WHITELIST_DENIED` / `RECOVERY_WHITELIST_UNAVAILABLE`：本人环境 UID 不符、数据库未授权或白名单检查未完成。

未知错误内容不会透传；把页面上的诊断编号告诉助手即可，不需要复制密钥、密码或邮件链接。
