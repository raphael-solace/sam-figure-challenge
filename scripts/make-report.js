const fs = require('fs');
const path = require('path');

const resultsPath = path.join(__dirname, '..', 'results', 'results-hybrid.json');
if (!fs.existsSync(resultsPath)) {
  console.error(`Missing results file: ${resultsPath}`);
  process.exit(1);
}

const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));

const report = `# Run Report\n\n` +
`- Timestamp: ${results.timestamp}\n` +
`- Agent: ${results.agentType}\n` +
`- Total Steps: ${results.totalSteps}\n` +
`- Completed: ${results.totalChallenges}/${results.totalSteps}\n` +
`- Final Step Reached: ${results.finalStepReached}\n` +
`- Success: ${results.success}\n` +
`- Total Duration: ${results.totalDuration}\n` +
`- Average Time/Challenge: ${results.averageTimePerChallenge}\n` +
`- LLM Calls (total): ${results.totalLLMCalls || 0}\n` +
`- LLM Calls (fallback steps): ${results.llmFallbacks}\n` +
`- LLM Time: ${results.llmTimeTotal}\n` +
`- Tokens (input/output): ${results.totalTokens.input} / ${results.totalTokens.output}\n` +
`- Total Cost: ${results.totalCost}\n\n` +
`## Notes\n` +
`- Results source: results/results-hybrid.json\n`;

fs.writeFileSync(path.join(__dirname, '..', 'RUN-REPORT.md'), report);
console.log('Wrote RUN-REPORT.md');
