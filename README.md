# social-media-agent

Autonomous social media agent with **persistent semantic memory**.

- LLM via **OpenRouter** for generation and planning
- **Neon Postgres + pgvector** for storage and vector recall
- **Drizzle** ORM and migrations
- **Twitter/X** and **LinkedIn** posters
- **node-cron** scheduler for 24/7 operation
- TypeScript, Docker-ready

> Roadmap: Phase 1 lays the foundation (TypeScript, Neon, embeddings, recall, persistence). **Phase 2 (current) wraps every capability as Mastra tools and exposes a conversational agent.** Phase 3 adds image generation and upload. Phase 4 adds mention reading, automatic replies, and an engagement learning loop. Phase 5 ships a Next.js + Clerk dashboard on Vercel.

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Configure
cp .env.example .env
# Edit .env: OPENROUTER_API_KEY, OPENAI_API_KEY (embeddings),
#            DATABASE_URL (Neon), TWITTER_* and/or LINKEDIN_*

# 3. Apply the database schema (creates pgvector extension + tables)
npm run db:migrate

# 4. Probe connections (OpenRouter, embeddings, DB, enabled networks)
npm test

# 5. Generate without publishing
npm run dev -- run --dry

# 6. Build a weekly plan (persisted in Neon)
npm run dev -- plan

# 7. Publish one round and persist to Neon + memory
npm run dev -- run

# 8. Start the 24/7 scheduler
npm run dev -- start          # development
npm run build && npm start    # production
# or:
docker-compose up -d --build
```

## Memory and recall

Every post is saved to `posts` and embedded into `embeddings` (pgvector, 1536 dims,
HNSW cosine). Before generating, the agent recalls the K most similar prior posts and
includes them in the prompt so it avoids repetition and reinforces brand voice.

```bash
npm run dev -- recall "ai automation for small business"
npm run dev -- ingest ./brand-book.md   # seed the knowledge base
```

## CLI

| Command | What it does |
|---|---|
| `run [--dry]` | Generate + (optionally) publish one round of posts for each enabled platform |
| `plan` | Build a new 7-day plan and store it in `plan_items` |
| `show-plan` | Print stored plan items |
| `recall <query>` | Semantic search over all stored memories |
| `ingest <file>` | Chunk a text/markdown file into `knowledge` + embeddings |
| `ask "<prompt>"` | Talk to the Mastra agent with tool calling (generate / publish / recall / plan / save-knowledge / list-recent-posts) |
| `start` | Start the cron scheduler (plan + run) |

### Mastra agent

The agent (`src/agent/index.ts`) runs on the same OpenRouter model and is wired to six tools that map directly to the persistence and posting primitives. Examples:

```bash
npm run dev -- ask "what have we posted on linkedin this week?"
npm run dev -- ask "draft a twitter post about ai automation, hook on time-to-value"
npm run dev -- ask "remember: our pricing is \$29/mo for solo, \$99/mo for teams"
npm run dev -- ask "build next week's plan and tell me which day covers automation"
```

## Schema (Drizzle / pgvector)

```
posts        published posts + external ids
plan_items   weekly content calendar
mentions     incoming mentions/comments (Phase 4)
replies      our replies to mentions   (Phase 4)
metrics      engagement collected per post (Phase 4)
knowledge    long-form context (brand book, FAQs, products)
embeddings   1536-dim vectors keyed by (ref_type, ref_id)
```

## Layout

```
src/
  config.ts           env loading
  openrouter.ts       chat client
  generator.ts        post + weekly-plan generation, with semantic recall
  planner.ts          DB-backed plan persistence
  runner.ts           one round: pick item -> generate -> publish -> remember
  scheduler.ts        node-cron loop
  posters/            twitter, linkedin
  memory/             embed + recall over pgvector
  db/                 drizzle client, schema, migrate runner
test/                 connection smoke tests
drizzle/              SQL migrations
```
