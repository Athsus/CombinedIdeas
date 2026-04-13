# Instruction

## 本地开发验证（只跑 dev）

```bash
export PATH="/home/ya/.nvm/versions/node/v24.14.0/bin:$PATH"
cd /home/ya/ideasCombine
npm run dev
```

默认地址：`http://127.0.0.1:5174/`

约束：

- `npm run dev` 必须绑定 `5174`，不要静默回退到 `5173` 或其他端口。
- 不要为了常规前端迭代运行 `npm run build`。
- 不要停止已经在运行的本地 dev 实例，除非用户明确要求或无法继续工作。
- 不要用本地 backup / fallback / mock 数据去掩盖真实的后端失败；失败就明确报失败，并优先修真实后端。

## Study Tools 路由

- `/#/study-tools`
- `/#/study-tools/flash-cards`

## Claude API 接入（Supabase Edge Function）

```bash
cd /home/ya/ideasCombine
npx supabase functions deploy claude-study
npx supabase secrets set ANTHROPIC_API_KEY=你的key
# 可选
npx supabase secrets set ANTHROPIC_MODEL=claude-sonnet-4-5
```

约束：在本项目中调用 Supabase CLI 时，统一使用 `npx supabase ...`，不要直接使用 `supabase ...`。

## Supabase 操作流程

如果仓库里存在 `.supabase.local.env`，所有 Supabase CLI 操作都先显式加载它，不要依赖交互式 login 状态是否被当前执行环境继承：

```bash
cd /home/ya/ideasCombine
set -a
. ./.supabase.local.env
set +a
export PATH="/home/ya/.nvm/versions/node/v24.14.0/bin:$PATH"
```

TODO 后端改动的标准顺序：

```bash
npx supabase db query --linked -f supabase.sql
npx supabase functions deploy todo-agent --project-ref kwipkxlhrjbbxsptpwph
```

最小核对：

```bash
printf "%s\n" "select policyname, tablename from pg_policies where schemaname = 'public' and tablename in ('todos','todo_projects') order by tablename, policyname;" > /tmp/check_policies.sql
npx supabase db query --linked -f /tmp/check_policies.sql
```

约束：

- 优先使用 `.supabase.local.env` 里的 `SUPABASE_ACCESS_TOKEN`
- 不要因为当前 shell 看不到 `supabase login` 状态就假设没有权限
- 在 TODO 后端失败时，先补真实 Supabase schema/function，再碰前端 workaround

前端本地环境变量仍使用：

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

## 上传与部署到 GitHub

```bash
cd /home/ya/ideasCombine
git add -A
git commit -m "feat: add study tools flash-cards workflow with claude dsl"
git push origin main
```
