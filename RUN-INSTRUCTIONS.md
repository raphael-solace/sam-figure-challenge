# Run Instructions

## 1) Install
```bash
npm install
```

## 2) Configure Environment
Create a `.env` file with your Groq API key:
```env
LLM_SERVICE_ENDPOINT="https://api.groq.com/openai/v1"
LLM_SERVICE_API_KEY="<your-groq-key>"
LLM_SERVICE_GENERAL_MODEL_NAME="groq/llama-3.1-8b-instant"
LLM_MAX_CALLS=30
LLM_MAX_CALLS_PER_STEP=1
LLM_MIN_CALLS_PER_RUN=1
LLM_MIN_CALLS_PER_STEP=1
LLM_ALWAYS_ON=true
LLM_USE_CACHE=false
LLM_TIMEOUT_MS=2000
USE_SESSION_CODE=true
KEEP_BROWSER_OPEN=true
CHALLENGE_URL="https://serene-frangipane-7fd25b.netlify.app"
```

Optional: adjust non-secret defaults in `config.json` (included in the bundle).

## 3) Run The Agent
```bash
npm start
```

Expected behavior:
- Opens a browser and solves all steps.
- Finishes in under 5 minutes.
- Writes results to `results/results-hybrid.json`.

## 4) Generate Run Report
```bash
node scripts/make-report.js
```
This creates `RUN-REPORT.md` from the latest results.

## 5) Package Zip
```bash
bash scripts/package.sh
```
This writes `artifacts/agent-bundle.zip`.

---

If you want to close the browser automatically after run, set:
```env
KEEP_BROWSER_OPEN=false
```
