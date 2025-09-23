Smart Ledger

Import PDF bills, auto-categorize transactions with AI (OpenAI or SiliconFlow), including Chinese 账单解析, and view insights.

Setup

1. Copy env template

```bash
cp .env.example .env.local
```

2. Fill in env keys (any not used can be omitted):

Required:

- DATABASE_URL (Postgres)
- REDIS_URL
- Clerk keys (CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY, etc.)

Optional AI Providers:

- OPENAI_API_KEY (OpenAI categorization fallback)
- SILICONFLOW_API_KEY (启用 SiliconFlow，用于中文批量解析与分类)
- SILICONFLOW_BASE_URL (可选，默认 https://api.siliconflow.cn)

Cleanup Cron:

- IMPORT_JOB_REVIEW_RETENTION_DAYS (可选，默认 7)。定时任务 `cleanup-stale-import-jobs` 每小时执行，删除创建时间早于该天数并且仍处于 PENDING / PROCESSING / REVIEW / FAILED 状态的 ImportJob 及其 DraftTransaction（防止长期未确认的任务堆积）。

3. Migrate database

```bash
npx prisma migrate dev --name init
```

4. Start dev server

```bash
npm run dev
```

Endpoints

- /api/upload: POST multipart/form-data with field `file` (PDF 或 Excel: .xlsx/.xls/.csv)
- /api/inngest: Inngest handler

Auth

- /sign-in, /sign-up

AI Categorization, Excel & Chinese Parsing

- 默认使用 OpenAI，如果设置了 `SILICONFLOW_API_KEY` 会优先使用 SiliconFlow（模型示例: Qwen/Qwen2.5-7B-Instruct）。
- PDF 解析后首先用正则提取常见格式：
  - `YYYY-MM-DD 商户 -23.50 CNY`
  - `YYYY/MM/DD 星巴克 -23.50 元`
  - `01月02日 星巴克 23.50`
- 无法匹配的剩余行会打包发送给 SiliconFlow 让模型输出结构化 JSON（日期、描述、金额、币种）。
- Excel (.xlsx/.xls/.csv) 会解析第一张表的前几列，自动匹配列名(日期/描述/金额/币种/商户)。解析结果同样进入草稿审核。
- 分类输出包含 `category` 与置信度 `score`，中文常见分类如：餐饮, 交通出行, 日用品, 娱乐, 网购, 其他 等。

Workflow 返回

Inngest 工作流：

- `parse-and-categorize` (PDF)
- `parse-and-categorize-excel` (Excel)

均返回：

```json
{ "count": <交易数>, "categories": { "餐饮": 123.45, "交通出行": 50.00 } }
```

审核确认流程 (Draft Review)

1. 上传 PDF 后，工作流解析并创建草稿记录 DraftTransaction，`ImportJob.status` = REVIEW。
2. 前端调用 `GET /api/imports/{jobId}/drafts` 获取所有草稿，展示可编辑表格（描述 / 金额 / 类别等）。
3. 用户确认后前端可提交可选 overrides 列表到 `POST /api/imports/{jobId}/confirm`，服务端将草稿写入正式 `Transaction` 表并删除草稿，`status` 变为 COMPLETED。
4. 若需重新解析，可删除该任务或追加新的导入。

接口示例:

GET /api/imports/abcd123/drafts -> { job, drafts: [...] }

POST /api/imports/abcd123/confirm
{
"overrides": [
{ "id": "draftId1", "category": "餐饮", "description": "星巴克咖啡" }
]
}

前端可根据需要在确认前允许批量修改分类。

## 统一验证与错误处理 (Validation & Error Handling)

项目内新增 `src/lib/api.ts` 封装：

- `ApiError` 自定义错误（`throw new ApiError(400, "invalid_input")`）。
- `jsonError`：在 `catch` 中统一转换为 `{ error, code?, details? }`。
- `overridesSchema`, `monthParamSchema`, `idParam` 等常用 zod schema。

示例：在 Route Handler 中使用：

```ts
import { ApiError, jsonError, overridesSchema } from "@/src/lib/api";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { overrides } = overridesSchema.parse(body);
    if (overrides.length > 1000) throw new ApiError(400, "too_many_overrides");
    return Response.json({ ok: true });
  } catch (e) {
    return jsonError(e);
  }
}
```

统一响应规范：

```json
// 成功
{ "jobId": "abc123" }

// 失败
{ "error": "invalid_job_id", "code": "invalid_job_id" }
```

扩展新接口时：

1. 用 zod schema 校验 query/body。
2. 遇到业务错误 throw `ApiError(status, code)`。
3. `catch` 分支调用 `jsonError(e)`。
4. 返回结构中不要额外包裹通用字段（例如统一 data 包装），保持简洁。

上传接口现在加入：大小限制 10MB、扩展名白名单（PDF / Excel），错误码：`file_too_large`, `unsupported_file_type`。

开发调试提示

- 未配置任何 AI key 时可切换 provider 为 RULES（简单规则分类）。
- 增加更多中文正则格式可直接编辑 `parse-and-categorize.ts` 中的 `regexes` 数组。
- 如果需要更换 SiliconFlow 模型，修改 `categorizer.ts` 与工作流中调用的 `model` 字段。
