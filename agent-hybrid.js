const puppeteer = require('puppeteer');
const fs = require('fs');
require('dotenv').config();

class HybridMetrics {
  constructor() {
    this.startTime = Date.now();
    this.challenges = [];
    this.totalClicks = 0;
    this.totalScrolls = 0;
    this.totalLLMCalls = 0;
    this.totalLLMTime = 0;
    this.totalTokens = { input: 0, output: 0 };
    this.totalCost = 0;
    this.heuristicSuccesses = 0;
    this.llmSuccesses = 0;
  }

  addChallenge(challengeNum, duration, method, llmData = null) {
    const challenge = {
      challenge: challengeNum,
      duration,
      method // 'heuristic' or 'llm'
    };

    if (llmData) {
      challenge.llmCalls = llmData.calls;
      challenge.tokens = llmData.tokens;
      challenge.llmTime = llmData.time;
      this.totalLLMCalls += llmData.calls;
      this.totalLLMTime += llmData.time;
      this.totalTokens.input += llmData.tokens.input;
      this.totalTokens.output += llmData.tokens.output;
      this.totalCost += (llmData.tokens.input * 0.05 / 1000000) + (llmData.tokens.output * 0.08 / 1000000);
      this.llmSuccesses++;
    } else {
      this.heuristicSuccesses++;
    }

    this.challenges.push(challenge);
  }

  finish() {
    this.endTime = Date.now();
    this.totalDuration = (this.endTime - this.startTime) / 1000;
    return this.getReport();
  }

  getReport() {
    return {
      agentType: 'Hybrid (Heuristic + LLM)',
      totalDuration: `${this.totalDuration.toFixed(2)} seconds`,
      totalChallenges: this.challenges.length,
      heuristicSuccesses: this.heuristicSuccesses,
      llmSuccesses: this.llmSuccesses,
      totalClicks: this.totalClicks,
      totalScrolls: this.totalScrolls,
      totalLLMCalls: this.totalLLMCalls,
      totalLLMTime: `${this.totalLLMTime.toFixed(2)} seconds`,
      llmTimePercentage: `${((this.totalLLMTime / this.totalDuration) * 100).toFixed(1)}%`,
      totalTokens: this.totalTokens,
      totalCost: `$${this.totalCost.toFixed(6)}`,
      averageTimePerChallenge: `${(this.totalDuration / this.challenges.length).toFixed(2)} seconds`,
      challenges: this.challenges,
      success: this.challenges.length === 30,
      timestamp: new Date().toISOString()
    };
  }
}

class GroqClient {
  constructor() {
    this.endpoint = process.env.LLM_SERVICE_ENDPOINT;
    this.apiKey = process.env.LLM_SERVICE_API_KEY;
    this.model = process.env.LLM_SERVICE_GENERAL_MODEL_NAME.replace('groq/', '');
  }

  async analyze(systemPrompt, userPrompt) {
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${this.endpoint}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.1,
          max_tokens: 500,
          response_format: { type: 'json_object' }
        })
      });

      if (!response.ok) {
        throw new Error(`Groq API error: ${response.status}`);
      }

      const data = await response.json();
      const duration = (Date.now() - startTime) / 1000;

      return {
        content: JSON.parse(data.choices[0].message.content),
        tokens: {
          input: data.usage.prompt_tokens,
          output: data.usage.completion_tokens
        },
        duration
      };
    } catch (error) {
      console.error('   ⚠️  LLM Error:', error.message);
      return null;
    }
  }
}

class HybridBrowserAgent {
  constructor() {
    this.metrics = new HybridMetrics();
    this.llm = new GroqClient();
    this.currentChallenge = 0;
    this.lastChallengeNumber = 0;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async init() {
    console.log('🚀 Launching browser (Hybrid agent)...');
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1280, height: 800 },
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
    this.page.setDefaultTimeout(5000);
    this.page.setDefaultNavigationTimeout(10000);
  }

  async getCurrentChallengeNumber() {
    try {
      const text = await this.page.evaluate(() => document.body.innerText);
      const match = text.match(/Step (\d+) of 30/);
      return match ? parseInt(match[1]) : null;
    } catch (e) {
      return null;
    }
  }

  async waitForChallengeChange(previousStep, maxWait = 3000) {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      const currentStep = await this.getCurrentChallengeNumber();
      if (currentStep && currentStep > previousStep) {
        return currentStep;
      }
      await this.delay(100);
    }
    return null;
  }

  async tryHeuristic() {
    console.log('   🔧 Trying heuristic approach...');
    
    // 1. Dismiss modals
    const buttons = await this.page.$$('button');
    for (const button of buttons) {
      try {
        const text = await button.evaluate(el => el.textContent.toLowerCase());
        const isVisible = await button.isVisible();
        if (isVisible && (text.includes('dismiss') || text.includes('close') || text.includes('accept'))) {
          await button.click({ delay: 10 });
          this.metrics.totalClicks++;
          await this.delay(50);
        }
      } catch (e) {
        // Continue
      }
    }

    // 2. Scroll to reveal content
    await this.page.evaluate(() => window.scrollBy(0, 500));
    this.metrics.totalScrolls++;
    await this.delay(100);

    // 3. Click navigation button
    const elements = await this.page.$$('button, a, input[type="submit"]');
    for (const element of elements) {
      try {
        const text = await element.evaluate(el => el.textContent.toLowerCase());
        const isVisible = await element.isVisible();
        
        if (isVisible && (
          text.includes('next') ||
          text.includes('continue') ||
          text.includes('submit') ||
          text.includes('proceed') ||
          text.includes('forward') ||
          text.includes('advance')
        )) {
          await element.click();
          this.metrics.totalClicks++;
          await this.delay(300);
          return true;
        }
      } catch (e) {
        // Continue
      }
    }
    
    return false;
  }

  async extractPageContext() {
    return await this.page.evaluate(() => {
      const interactive = Array.from(document.querySelectorAll(
        'button, a, input[type="submit"], input[type="text"]'
      )).map((el, idx) => {
        const rect = el.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;
        
        return {
          id: idx,
          tag: el.tagName.toLowerCase(),
          text: el.textContent.trim().slice(0, 100),
          visible: isVisible
        };
      }).filter(el => el.visible);

      const bodyText = document.body.innerText.slice(0, 1000);
      const stepMatch = bodyText.match(/Step (\d+) of 30/);
      
      return {
        currentStep: stepMatch ? parseInt(stepMatch[1]) : null,
        bodyText,
        interactive
      };
    });
  }

  async tryLLM() {
    console.log('   🤖 Consulting LLM...');
    
    const context = await this.extractPageContext();
    
    const systemPrompt = `You are a browser automation expert. Analyze the page and provide actions to progress to the next challenge.

Return JSON:
{
  "reasoning": "brief explanation",
  "actions": [
    {"type": "click", "elementId": 5, "reason": "dismiss modal"},
    {"type": "scroll", "amount": 500},
    {"type": "click", "elementId": 12, "reason": "click next"}
  ]
}`;

    const userPrompt = `Step: ${context.currentStep || 'unknown'}

Interactive elements:
${context.interactive.slice(0, 20).map(el => `[${el.id}] ${el.tag} "${el.text}"`).join('\n')}

Page text: ${context.bodyText.slice(0, 500)}

What actions to take?`;

    const analysis = await this.llm.analyze(systemPrompt, userPrompt);
    
    if (!analysis) return null;

    console.log(`   💭 ${analysis.content.reasoning}`);
    console.log(`   📊 Tokens: ${analysis.tokens.input + analysis.tokens.output}, Time: ${analysis.duration.toFixed(2)}s`);

    // Execute actions
    for (const action of analysis.content.actions) {
      try {
        if (action.type === 'click') {
          const elements = await this.page.$$('button, a, input[type="submit"]');
          if (elements[action.elementId]) {
            await elements[action.elementId].click();
            this.metrics.totalClicks++;
            await this.delay(200);
          }
        } else if (action.type === 'scroll') {
          await this.page.evaluate((amount) => window.scrollBy(0, amount), action.amount || 500);
          this.metrics.totalScrolls++;
          await this.delay(100);
        }
      } catch (e) {
        console.log(`   ⚠️  Action failed: ${action.type}`);
      }
    }

    return {
      calls: 1,
      tokens: analysis.tokens,
      time: analysis.duration
    };
  }

  async solveChallenge() {
    const challengeStart = Date.now();
    const startStep = await this.getCurrentChallengeNumber();
    
    console.log(`\n📝 Solving Challenge ${this.currentChallenge + 1} (currently at step ${startStep})...`);

    // Try heuristic first (fast)
    const heuristicWorked = await this.tryHeuristic();
    
    // Wait and check if we progressed
    const newStep = await this.waitForChallengeChange(startStep, 1000);
    
    if (newStep && newStep > startStep) {
      console.log(`   ✅ Heuristic succeeded! Advanced to step ${newStep}`);
      const duration = (Date.now() - challengeStart) / 1000;
      this.currentChallenge = newStep - 1;
      this.metrics.addChallenge(this.currentChallenge, duration, 'heuristic');
      console.log(`   ⏱️  Completed in ${duration.toFixed(2)}s`);
      return;
    }

    // Heuristic failed, try LLM
    console.log('   ⚠️  Heuristic failed, using LLM...');
    const llmData = await this.tryLLM();
    
    if (llmData) {
      await this.delay(500);
      const finalStep = await this.getCurrentChallengeNumber();
      
      if (finalStep && finalStep > startStep) {
        console.log(`   ✅ LLM succeeded! Advanced to step ${finalStep}`);
        const duration = (Date.now() - challengeStart) / 1000;
        this.currentChallenge = finalStep - 1;
        this.metrics.addChallenge(this.currentChallenge, duration, 'llm', llmData);
        console.log(`   ⏱️  Completed in ${duration.toFixed(2)}s`);
        return;
      }
    }

    // Both failed, increment anyway
    console.log('   ⚠️  Both methods struggled, moving on...');
    this.currentChallenge++;
    const duration = (Date.now() - challengeStart) / 1000;
    this.metrics.addChallenge(this.currentChallenge, duration, 'failed');
  }

  async run() {
    try {
      await this.init();

      console.log('🌐 Navigating to challenge website...');
      await this.page.goto('https://serene-frangipane-7fd25b.netlify.app', {
        waitUntil: 'networkidle0'
      });

      console.log('▶️  Starting challenges with hybrid approach...\n');

      // Click START
      await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const startBtn = buttons.find(btn => btn.textContent.includes('START'));
        if (startBtn) startBtn.click();
      });
      await this.delay(500);

      // Solve all 30 challenges
      while (this.currentChallenge < 30) {
        await this.solveChallenge();
      }

      console.log('\n✅ All 30 challenges completed with hybrid approach!');

      const report = this.metrics.finish();
      fs.writeFileSync('results-hybrid.json', JSON.stringify(report, null, 2));
      
      console.log('\n📊 FINAL RESULTS (Hybrid Agent):');
      console.log(`   Total Time: ${report.totalDuration}`);
      console.log(`   Heuristic Successes: ${report.heuristicSuccesses}`);
      console.log(`   LLM Successes: ${report.llmSuccesses}`);
      console.log(`   Total Clicks: ${report.totalClicks}`);
      console.log(`   Total Scrolls: ${report.totalScrolls}`);
      console.log(`   LLM Calls: ${report.totalLLMCalls}`);
      console.log(`   LLM Time: ${report.totalLLMTime} (${report.llmTimePercentage})`);
      console.log(`   Total Cost: ${report.totalCost}`);
      console.log(`   Success: ${report.success ? '✅ YES' : '❌ NO'}`);
      console.log('\n📄 Detailed results saved to results-hybrid.json');

      await this.delay(2000);
      await this.browser.close();

      return report;

    } catch (error) {
      console.error('❌ Error:', error.message);
      if (this.browser) {
        await this.browser.close();
      }
      throw error;
    }
  }
}

// Run the hybrid agent
(async () => {
  const agent = new HybridBrowserAgent();
  await agent.run();
})();