# social-media-agent

Autonomous social media agent. Uses an OpenRouter LLM to plan a weekly content
calendar and publish posts on a cron schedule to Twitter/X and LinkedIn.

## Quick start

```bash
# Install dependencies
npm install

# Copy and configure variables
cp .env.example .env
# Edit .env with your OpenRouter + network keys

# Probe connections
npm test

# Make a test post (skips the cron). Use --dry to generate without publishing.
node src/index.js run
node src/index.js run --dry

# Generate / view the weekly plan
node src/index.js plan
node src/index.js show-plan

# Start the 24/7 scheduler
npm start
# or via Docker:
docker-compose up -d
```

## Configuration

All settings live in `.env` (see `.env.example`):

- `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` — LLM provider.
- `BRAND_NAME`, `BRAND_VOICE`, `BRAND_TOPICS`, `BRAND_LANGUAGE` — brand persona.
- `POST_CRON`, `PLAN_CRON`, `TIMEZONE` — scheduling.
- `TWITTER_ENABLED` + 4 OAuth1 credentials.
- `LINKEDIN_ENABLED` + access token and author URN (e.g. `urn:li:person:XXXX`).

## Layout

```
src/
  config.js        Env loading
  openrouter.js    LLM client (OpenAI-compatible)
  generator.js     Post + weekly plan generation
  planner.js       Build / persist weekly plan
  runner.js        One round: pick item -> generate -> publish
  scheduler.js     node-cron 24/7 loop
  posters/
    twitter.js
    linkedin.js
data/              Plan + post history (created at runtime)
test/connections.test.js
```
