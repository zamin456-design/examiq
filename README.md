# ExamIQ: AI Examination Platform (MERN + AI Gateway)

Needs Node 18+ and a MongoDB (local, or a free MongoDB Atlas cluster).

## 1. Run the server
    cd server
    cp .env.example .env      # then fill in the values (see below)
    npm install
    npm run dev               # http://localhost:5000
If startup says the port is already in use, the API is already running; reuse that server instead of starting a second copy.

## 2. Run the client (second terminal)
    cd client
    npm install
    npm run dev               # http://localhost:5173

## 3. The two AI models (both free)
Put keys in `server/.env` only. Never in the client, never in GitHub.
- GEMINI_API_KEY: from Google AI Studio.
- SECOND_AI_KEY: your Groq key (default). For xAI Grok instead, also set
  SECOND_AI_BASE_URL=https://api.x.ai/v1 and SECOND_AI_MODEL to a Grok model name.
- AI_PRIMARY=gemini or second (Groq defaults to `openai/gpt-oss-120b`). If the first fails, the other is used automatically.
- Model names change over time. If a model is rejected, update GEMINI_MODEL or SECOND_AI_MODEL.

## 4. First login and try it
1. Log in as the admin from your `.env` (ADMIN_EMAIL / ADMIN_PASSWORD).
2. Register a teacher, then approve them in the Admin page.
3. Teacher: create a course, then use AI Command Center to make and publish a test.
4. Register a student, join with the course code, take the test, see results.

## Where the backbone (kernel) lives
server/src/kernel: auth + roles + ownership, AI Gateway, prompts, notifications, audit.
server/src/services/marking.js: the Marking Contract marking pipeline.

## Testing
    cd server
    npm test          # 25 unit tests (logic, marking safety, queue). Runs with no database.
    npm run loadsim   # large-class simulation (CPU cost + AI marking queue)
For the full API test, first run `npm i -D supertest mongodb-memory-server`; `npm test` then also runs test/api.integration.test.js.

## Known limits (honest list)
- Free AI keys are the bottleneck: about 10 marked students per minute per key. See AI_RPM. A class of 30-100 is fine; 1000 at once is not.
- Teachers can edit a Blueprint but not individual generated questions yet (regenerate instead).
- Uploaded files are stored on the server disk (and only served to the owner or teacher). Use cloud storage before real use.
- The marking queue lives in the server's memory; unfinished jobs are re-queued on restart, but run one server instance only.
- Single login token (7 days), no refresh-token cookie or email verification yet. No multi-school tenancy yet.
- The API integration test and real AI calls were not run in the build sandbox (no network).
