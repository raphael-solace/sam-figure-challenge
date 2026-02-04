# Browser Challenge Solver 🤖

Fast, intelligent browser automation agent that solves 30 navigation challenges in under 1 minute.

## 🎯 Challenge

Solve all 30 challenges on [this website](https://serene-frangipane-7fd25b.netlify.app) in under 5 minutes.

**Our Result**: ✅ 30/30 challenges in ~40-50 seconds

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Run the agent
npm start
```

## 📊 Performance

- **Time**: 40-50 seconds for 30 challenges
- **Success Rate**: 100%
- **Brute Force**: 80-90% of challenges (no LLM)
- **LLM Fallback**: 10-20% of challenges
- **Cost**: < $0.005 (half a cent)

## 🏗️ Architecture

### Two-Phase Approach

**Phase 1: Brute Force (Primary - No LLM)**
1. Dismiss all popups aggressively
2. Scroll main page + modals
3. Click radio buttons & checkboxes
4. Extract & type 6-character codes
5. Click submit → navigation buttons
6. Verify step progression

**Phase 2: LLM Fallback (Only when needed)**
- Minimal context extraction
- Groq Llama 3.1 8B Instant
- Forced JSON response
- Temperature: 0 (deterministic)

## 📁 Project Structure

```
├── agent-bruteforce.js    # ⭐ Main agent (brute force + LLM fallback)
├── agent-llm.js            # LLM-only approach (for comparison)
├── agent-*.js              # Other experimental agents
├── compare.js              # Results comparison script
├── package.json            # Dependencies & scripts
├── .env                    # API configuration
├── docs/
│   ├── RESEARCH.md         # Automation techniques research
│   ├── README-LLM.md       # LLM experiment analysis
│   └── README-FINAL.md     # Detailed solution docs
└── results-*.json          # Performance metrics
```

## 🎮 Available Commands

```bash
npm start              # Run brute-force agent (recommended)
npm run bruteforce     # Same as start
npm run llm            # Run LLM-only agent
npm run compare        # Compare different agents
```

## 🔧 Configuration

Create a `.env` file:

```env
LLM_SERVICE_ENDPOINT="https://api.groq.com/openai/v1"
LLM_SERVICE_API_KEY="your-groq-api-key"
LLM_SERVICE_GENERAL_MODEL_NAME="groq/llama-3.1-8b-instant"
```

Get a free Groq API key at [console.groq.com](https://console.groq.com)

## 💡 Key Features

### Brute Force Strategy
- ✅ **Aggressive popup dismissal** - Clicks all dismiss/close/accept buttons
- ✅ **Modal scrolling** - Scrolls within dialogs to reveal hidden content
- ✅ **Element interaction** - Handles radios, checkboxes, inputs
- ✅ **Code extraction** - Finds 6-char codes via regex: `/\b[A-Z0-9]{6}\b/g`
- ✅ **Smart navigation** - Clicks submit → navigation in correct order

### LLM Fallback
- ✅ **Minimal usage** - Only when brute force fails
- ✅ **Fast inference** - Groq's Llama 3.1 8B (~0.3-0.5s per call)
- ✅ **Cheap** - < $0.005 total cost
- ✅ **Reliable** - Forced JSON response format

### Detailed Logging
```
📝 Step 1...
   📋 Page state:
      Modals: 1, Radios: 3, Checkboxes: 0, Inputs: 1
   🔨 Brute forcing...
   ✓ Selected radio button
   🔑 Found codes: ABC123
   ✓ Typed code: ABC123
   ✓ Clicked: Submit
   ✓ Clicked: "next"
   ✅ Brute force SUCCESS! 1 → 2
```

## 📈 Results

### Brute-Force Agent
```json
{
  "totalDuration": "45.23 seconds",
  "totalChallenges": 30,
  "bruteForceSuccesses": 27,
  "llmFallbacks": 3,
  "totalCost": "$0.004",
  "success": true
}
```

### Comparison with Other Approaches
| Agent | Time | LLM Calls | Cost | Success |
|-------|------|-----------|------|---------|
| Brute Force | 45s | 3 | $0.004 | ✅ 30/30 |
| LLM-Only | 52s | 30 | $0.008 | ✅ 30/30 |
| Heuristic | 33s | 0 | $0 | ❌ Stuck |

## 🎓 How It Works

### Challenge Patterns

**Pattern 1: Code Entry**
```
Scroll → Extract code → Type → Submit → Navigate
```

**Pattern 2: Modal Selection**
```
Dismiss popups → Scroll modal → Select radio → Submit & Continue
```

**Pattern 3: Multi-Step**
```
Fill form → Submit → Wait → Navigate
```

### Code Extraction
```javascript
// Finds all 6-character alphanumeric codes
const codes = text.match(/\b[A-Z0-9]{6}\b/g);
// Example: ["ABC123", "XYZ789"]
```

### Modal Scrolling
```javascript
// Scrolls within modals to reveal hidden content
document.querySelectorAll('[role="dialog"], .modal').forEach(modal => {
  modal.scrollTop += 300;
});
```

## 📚 Documentation

- **[RESEARCH.md](docs/RESEARCH.md)** - Automation techniques & research
- **[README-LLM.md](docs/README-LLM.md)** - LLM experiment analysis
- **[README-FINAL.md](docs/README-FINAL.md)** - Detailed solution guide

## 🔬 Research

Used BrightData to research:
- Puppeteer vs Selenium performance
- Modal & popup handling techniques
- Speed optimization strategies
- Element interaction best practices

Key findings:
- Puppeteer is 2-3x faster than Selenium
- Brute force solves 80-90% of challenges
- Modal scrolling is critical for hidden content
- LLM fallback provides reliability

## 🚀 Future Improvements

1. **Parallel Execution** - Solve multiple challenges simultaneously
2. **Pattern Caching** - Remember successful strategies
3. **Computer Vision** - Use screenshots for element detection
4. **Stealth Mode** - Bypass bot detection

## 🐛 Troubleshooting

### Agent gets stuck
- Check logs for page state (modals, radios, inputs)
- Verify codes are being extracted
- Ensure popups are dismissed

### LLM errors
- Verify `.env` has correct API key
- Check Groq API status
- Ensure model name is correct

## 📝 License

MIT

## 🙏 Acknowledgments

- **Groq** - Fast LLM inference
- **Puppeteer** - Browser automation
- **BrightData** - Web research capabilities

---

**Built with ❤️ using Node.js, Puppeteer, and Groq LLM**

**Challenge completed in under 1 minute! 🎉**