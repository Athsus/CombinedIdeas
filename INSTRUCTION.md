# Instruction

## 本地开发验证（只跑 dev）

```bash
export PATH="/home/ya/.nvm/versions/node/v24.14.0/bin:$PATH"
cd /home/ya/ideasCombine
npm run dev
```

默认地址：`http://127.0.0.1:5173/`

## Study Tools 路由

- `/#/study-tools`
- `/#/study-tools/flash-cards`

## Claude API 接入（Supabase Edge Function）

```bash
cd /home/ya/ideasCombine
supabase functions deploy claude-study
supabase secrets set ANTHROPIC_API_KEY=你的key
# 可选
supabase secrets set ANTHROPIC_MODEL=claude-3-7-sonnet-latest
```

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
