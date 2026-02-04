# Hybrid LLM Plan (Groq-Occasional)

## Goal
- Keep heuristic speed for most steps.
- Use Groq only when heuristics stall or pattern is complex.
- Maintain low latency and cost.

## Flow Per Step
1. Stabilize
   - Dismiss popups aggressively for ~1–2s.
   - Wait for key elements (challenge panel + code input).
2. Heuristic Solve (2–3 attempts)
   - Reveal code, scroll, modal radio, checkboxes, etc.
3. LLM Escalation (only if still stuck)
   - Send small structured context.
   - Receive JSON actions (click/type/wait/scroll).
4. Verify
   - Check step advanced; retry or mark blocked.

## Groq Usage Rules
- Trigger when:
  - Step didn’t advance after 2 heuristic attempts.
  - Challenge text includes complex cues (service worker, shadow DOM, iframe, mutation, websocket).
- Keep LLM timeout short (1–2s).
- Limit actions to 1–3 per response.

## LLM Input (Minimal)
- Step number
- Challenge text excerpt
- Visible interactive elements list (id, tag, role, text)
- Extracted codes (if any)
- Detected challenge-type hints

## LLM Output Schema
```json
{
  "actions": [
    { "type": "click", "selectorIndex": 5 },
    { "type": "wait", "ms": 1200 },
    { "type": "type", "selectorIndex": 2, "text": "ABC123" }
  ]
}
```

## Performance Optimizations
- Cap elements sent to ~25 visible nodes.
- Cache LLM response for same step + same text hash.
- Fail fast if LLM response invalid; fall back to heuristics.

## Implementation (When Ready)
- Add Groq client + JSON action executor.
- Add escalation rules + per-step LLM budget.
- Keep existing brute-force logic intact.

