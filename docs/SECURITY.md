# 私人部署安全边界

## 已实现

- 服务端Supabase Auth `getUser()`验证会话，环境UID和数据库owner双重校验。缺失配置、未匹配、未登录、部署锁未解除时拒绝资料访问。
- Email/Password管理员创建账号，无注册API；托管项目必须关闭公开signup。SDK只在server-only模块使用，无浏览器Supabase APIKey。
- 会话cookie为HttpOnly、SameSite=Strict，Vercel强制Secure。所有写接口验证Origin，并在实际流读取时限制JSON体积。
- 私有Storage、对象路径UID+随机文档ID、路径白名单、文件真实性检测、bucket体积/MIME限制。不能用文件名覆盖其他路径。
- 所有表RLS强制启用，profile/document要求本人+自己user_id；Storage要求本人+所属文档路径，公共anon没有读取能力。应用不使用service-role绕过RLS。
- 分段解析、持久化进度、数据库跨实例租约、档案revision冲突检测。删除先打tombstone拒绝新解析写入，移除包括未提交的部分图片后删数据库记录，失败保留记录可重试。
- 预览和下载通过60秒签名地址；资料不放public目录，不落本地生产磁盘。响应与页面禁止缓存，Referrer-Policy=no-referrer，nosniff，禁止页面被iframe嵌入。
- API/数据库错误不返回内部凭据、SQL细节或外部供应商响应。私密目录、dotenv、测试文件、构建产物不进Git。

## 必须验证的部署配置

- Supabase实际关闭signup、匿名登录和不需要的provider；实际ownerUID匹配；bucket保持private，无其他过宽的Storage policy。
- 未登录、第二账号、被篡改路径被拒绝；本人文件读写/下载/删除成功。
- 生产HTTPS、cookie Secure、正确的Supabase项目域名、函数预算、平台账号保护。
- 默认DEPLOYMENT_LOCKED=true。只有在私人环境和真实托管后端权限验收完成后，由本人决定解锁及公开部署。

## 已知边界

- 签名URL是bearer授权：泄漏链接的人在有效期内可访问。短期签名不等于绑定浏览器身份。已签发下载链接可能在退出后仍存活最多60秒；删除源对象后普通读取应失败，平台缓存/备份保留另由平台控制。
- Supabase签名上传的有效期由平台决定，可能2小时。删除后极端情况下旧上传授权可创建不可读取的孤立对象；生产定时清理尚未实现。签名URL不记录、不分享。
- 只服务一个本人账号，不是多人招聘SaaS。Supabase管理员、托管服务管理员、备份持有人仍属于可信边界；没有端到端加密。
- 解析是在函数进程中进行，不是独立沙箱；只有本人上传自己可信的文件。仍可能遇到复杂PDF耗时或内存异常，不承诺处理所有文档。
- 登录限速依赖Supabase Auth平台，未实现额外WAF、审计告警、定时清理或病毒扫描；不应为其他账号开放入口。
- RLS策略无法替代官方服务真实验收。合成测试通过、构建通过与上线后验证是不同结果。

任何日志、截图、支持工单、Git提交或环境快照都不得包含真实简历、作品集、Key、密码及有效签名URL。
