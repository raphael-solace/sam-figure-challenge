const fs = require('fs');

// Load both result files (new paths with fallback)
const readJson = (primary, fallback) => {
  const path = fs.existsSync(primary) ? primary : fallback;
  return JSON.parse(fs.readFileSync(path, 'utf8'));
};

const heuristicResults = readJson('results/results-hybrid.json', 'results.json');
const llmResults = readJson('results/results-llm.json', 'results-llm.json');

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║         BROWSER AUTOMATION AGENT COMPARISON                    ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log('📊 PERFORMANCE COMPARISON\n');

// Parse durations
const heuristicTime = parseFloat(heuristicResults.totalDuration);
const llmTime = parseFloat(llmResults.totalDuration);
const timeDiff = llmTime - heuristicTime;
const timePercent = ((timeDiff / heuristicTime) * 100).toFixed(1);

console.log('⏱️  Total Time:');
console.log(`   Heuristic Agent:  ${heuristicResults.totalDuration}`);
console.log(`   LLM Agent:        ${llmResults.totalDuration}`);
console.log(`   Difference:       ${timeDiff > 0 ? '+' : ''}${timeDiff.toFixed(2)}s (${timePercent > 0 ? '+' : ''}${timePercent}%)\n`);

console.log('✅ Success Rate:');
console.log(`   Heuristic Agent:  ${heuristicResults.success ? '30/30 ✓' : 'Failed'}`);
console.log(`   LLM Agent:        ${llmResults.success ? '30/30 ✓' : 'Failed'}\n`);

console.log('🎯 Efficiency:');
console.log(`   Heuristic Agent:  ${heuristicResults.averageTimePerChallenge} per challenge`);
console.log(`   LLM Agent:        ${llmResults.averageTimePerChallenge} per challenge\n`);

console.log('🤖 LLM-SPECIFIC METRICS\n');
console.log(`   Total LLM Calls:       ${llmResults.totalLLMCalls}`);
console.log(`   Total LLM Time:        ${llmResults.totalLLMTime}`);
console.log(`   LLM Time Percentage:   ${llmResults.llmTimePercentage}`);
console.log(`   Total Tokens:          ${llmResults.totalTokens.input + llmResults.totalTokens.output}`);
console.log(`     - Input:             ${llmResults.totalTokens.input}`);
console.log(`     - Output:            ${llmResults.totalTokens.output}`);
console.log(`   Average Tokens/Call:   ${Math.round((llmResults.totalTokens.input + llmResults.totalTokens.output) / llmResults.totalLLMCalls)}`);
console.log(`   Total Cost:            ${llmResults.totalCost}\n`);

console.log('📈 ACTIONS TAKEN\n');
console.log(`   Heuristic Agent:`);
console.log(`     - Total Clicks:      ${heuristicResults.totalClicks}`);
console.log(`     - Total Scrolls:     ${heuristicResults.totalScrolls}`);
console.log(`   LLM Agent:`);
console.log(`     - Decisions Made:    ${llmResults.totalLLMCalls} (via LLM)`);
console.log(`     - Actions Executed:  Varies per challenge\n`);

console.log('💡 ANALYSIS\n');

if (llmTime < heuristicTime) {
  console.log('   ✨ LLM Agent is FASTER! Intelligence pays off.');
} else if (timeDiff < 10) {
  console.log('   ⚖️  Both agents perform similarly in speed.');
} else {
  console.log('   🏃 Heuristic Agent is faster, but LLM provides intelligence.');
}

const costPerSecond = parseFloat(llmResults.totalCost.replace('$', '')) / llmTime;
console.log(`   💰 LLM cost efficiency: ${costPerSecond.toFixed(8)} $/second`);

if (llmResults.success && heuristicResults.success) {
  console.log('   🎯 Both agents successfully completed all challenges!');
}

console.log('\n📝 CONCLUSION\n');
console.log('   The LLM-powered agent demonstrates that AI can effectively');
console.log('   automate browser tasks with minimal cost and reasonable speed.');
console.log(`   Trade-off: ${timeDiff > 0 ? '+' : ''}${timeDiff.toFixed(1)}s for intelligent decision-making.\n`);

// Save comparison
const comparison = {
  timestamp: new Date().toISOString(),
  heuristic: {
    time: heuristicTime,
    success: heuristicResults.success,
    clicks: heuristicResults.totalClicks,
    scrolls: heuristicResults.totalScrolls
  },
  llm: {
    time: llmTime,
    success: llmResults.success,
    llmCalls: llmResults.totalLLMCalls,
    tokens: llmResults.totalTokens.input + llmResults.totalTokens.output,
    cost: llmResults.totalCost
  },
  comparison: {
    timeDifference: `${timeDiff > 0 ? '+' : ''}${timeDiff.toFixed(2)}s`,
    timePercentage: `${timePercent > 0 ? '+' : ''}${timePercent}%`,
    winner: llmTime < heuristicTime ? 'LLM' : 'Heuristic'
  }
};

if (!fs.existsSync('results')) fs.mkdirSync('results', { recursive: true });
const comparisonPath = 'results/comparison.json';
fs.writeFileSync(comparisonPath, JSON.stringify(comparison, null, 2));
console.log(`📄 Detailed comparison saved to ${comparisonPath}\n`);
