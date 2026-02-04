const fs = require('fs');

class MetricsTracker {
  constructor() {
    this.startTime = Date.now();
    this.challenges = [];
    this.totalPopupsDismissed = 0;
    this.totalCodesFound = 0;
    this.totalBruteForceSuccesses = 0;
    this.totalLLMFallbacks = 0;
    this.totalLLMTime = 0;
    this.totalTokens = { input: 0, output: 0 };
    this.totalCost = 0;
  }

  addChallenge(challengeNum, duration, method, data) {
    this.challenges.push({
      challenge: challengeNum,
      duration,
      method, // 'bruteforce' or 'llm'
      ...data
    });
    
    if (method === 'bruteforce') {
      this.totalBruteForceSuccesses++;
    } else {
      this.totalLLMFallbacks++;
      if (data.llmTime) this.totalLLMTime += data.llmTime;
      if (data.tokens) {
        this.totalTokens.input += data.tokens.input;
        this.totalTokens.output += data.tokens.output;
        this.totalCost += (data.tokens.input * 0.05 / 1000000) + (data.tokens.output * 0.08 / 1000000);
      }
    }
  }

  finish() {
    this.endTime = Date.now();
    this.totalDuration = (this.endTime - this.startTime) / 1000;
    return {
      agentType: 'Brute-Force (LLM as last resort)',
      totalDuration: `${this.totalDuration.toFixed(2)} seconds`,
      totalChallenges: this.challenges.length,
      bruteForceSuccesses: this.totalBruteForceSuccesses,
      llmFallbacks: this.totalLLMFallbacks,
      llmTimeTotal: `${this.totalLLMTime.toFixed(2)} seconds`,
      totalTokens: this.totalTokens,
      totalCost: `$${this.totalCost.toFixed(6)}`,
      averageTimePerChallenge: `${(this.totalDuration / this.challenges.length).toFixed(2)} seconds`,
      challenges: this.challenges,
      success: this.challenges.length === 30,
      timestamp: new Date().toISOString()
    };
  }
  
  writeProgressLog(startStep, newStep, duration, attempts) {
    const progressLog = {
      timestamp: new Date().toISOString(),
      step: newStep,
      duration: duration.toFixed(2),
      attempts,
      totalCompleted: this.challenges.length,
      challenges: this.challenges
    };
    
    fs.appendFileSync('progress-log.txt', 
      `\n${'='.repeat(60)}\n` +
      `Step ${startStep} → ${newStep} completed in ${duration.toFixed(2)}s (${attempts} attempts)\n` +
      `Total completed: ${this.challenges.length}/30\n` +
      `${new Date().toISOString()}\n`
    );
    
    fs.writeFileSync('progress.json', JSON.stringify(progressLog, null, 2));
  }
}

module.exports = MetricsTracker;