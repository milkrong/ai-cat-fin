Smart Ledger

Import PDF bills, auto-categorize transactions with AI, and view insights.

Setup

1) Copy env template

```bash
cp .env.example .env.local
```

2) Fill in Clerk, Postgres, Redis, OpenAI keys

3) Migrate database

```bash
npx prisma migrate dev --name init
```

4) Start dev server

```bash
npm run dev
```

Endpoints

- /api/upload: POST multipart/form-data with field `file` (PDF)
- /api/inngest: Inngest handler

Auth

- /sign-in, /sign-up

