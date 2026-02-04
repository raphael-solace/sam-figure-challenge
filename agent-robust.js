const puppeteer = require('puppeteer');
const fs = require('fs');
require('dotenv').config();

class RobustMetrics {
  constructor() {
    this.startTime = Date.now();
    this.challenges = [];
    this.totalPopupsDismissed = 0;
    this.totalLLMCalls = 0;
    this.totalLLMTime = 0;
    this.totalTokens = { input: 0, output: 0 };
    this.totalCost = 0;
  }

  addChallenge(challengeNum, duration, popups, llmData) {
    this.challenges.push({
      challenge: challengeNum,
      duration,
      popupsDismissed: popups,
      llmCalls: llmData.calls,
      tokens: llmData.tokens,
      llmTime: llmData.time
    });
    
    this.totalPopupsDismissed += popups;
    this.totalLLMCalls += llmData.calls;
    this.totalLLMTime += llmData.time;
    this.totalTokens.input += llmData.tokens.input;
    this.totalTokens.output += llmData.tokens.output;
    this.totalCost += (llmData.tokens.input * 0.05 / 1000000) + (llmData.tokens.output * 0.08 / 1000000);
  }

  finish() {
    this.endTime = Date.now();
    this.totalDuration = (this.endTime - this.startTime) / 1000;
    return {
      agentType: 'Robust (Heuristic Popups + LLM Reasoning)',
      totalDuration: `${this.totalDuration.toFixed(2)} seconds`,
      totalChallenges: this.challenges.length,
      totalPopupsDismissed: this.totalPopupsDismissed,
      totalLLMCalls: this.totalLLMCalls,
      totalLLMTime: `${this.totalLLMTime.toFixed(2)} seconds`,
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
          max_tokens: 800,
          response_format: { type: 'json_object' }
        })
      });

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

class RobustBrowserAgent {
  constructor() {
    this.metrics = new RobustMetrics();
    this.llm = new GroqClient();
    this.currentStep = 0;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async init() {
    console.log('🚀 Launching browser (Robust agent)...');
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1280, height: 800 },
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
    this.page.setDefaultTimeout(10000);
  }

  async getCurrentStep() {
    try {
      const text = await this.page.evaluate(() => document.body.innerText);
      const match = text.match(/Step (\d+) of 30/);
      return match ? parseInt(match[1]) : null;
    } catch (e) {
      return null;
    }
  }

  async dismissAllPopups() {
    let dismissed = 0;
    
    // Strategy: Click ALL buttons that might close popups
    // This is aggressive but fast and effective
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        // Find all buttons
        const buttons = await this.page.$$('button, [role="button"], .close, [class*="close"], [class*="dismiss"]');
        
        for (const button of buttons) {
          try {
            const isVisible = await button.isVisible();
            if (!isVisible) continue;
            
            const text = await button.evaluate(el => el.textContent.toLowerCase());
            const classes = await button.evaluate(el => el.className);
            
            // Click if it looks like a dismiss/close button
            if (text.includes('dismiss') || 
                text.includes('close') || 
                text.includes('accept') ||
                text.includes('decline') ||
                text.includes('ok') ||
                classes.includes('close') ||
                classes.includes('dismiss')) {
              await button.click({ delay: 10 });
              dismissed++;
              await this.delay(50);
            }
          } catch (e) {
            // Button might have disappeared, continue
          }
        }
        
        // Also try clicking X buttons (common close pattern)
        const xButtons = await this.page.$$('[aria-label*="close" i], [title*="close" i]');
        for (const xBtn of xButtons) {
          try {
            const isVisible = await xBtn.isVisible();
            if (isVisible) {
              await xBtn.click();
              dismissed++;
              await this.delay(50);
            }
          } catch (e) {
            // Continue
          }
        }
        
        if (dismissed === 0) break;
        await this.delay(200);
      } catch (e) {
        console.log(`   ⚠️  Popup dismissal error: ${e.message}`);
      }
    }
    
    return dismissed;
  }

  async extractChallengeContext() {
    return await this.page.evaluate(() => {
      // Get current step
      const stepMatch = document.body.innerText.match(/Step (\d+) of 30/);
      const currentStep = stepMatch ? parseInt(stepMatch[1]) : null;
      
      // Get all visible interactive elements
      const interactive = Array.from(document.querySelectorAll(
        'button, a, input, select, textarea, [role="button"], [role="radio"], [role="checkbox"]'
      )).map((el, idx) => {
        const rect = el.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0 &&
                         window.getComputedStyle(el).visibility !== 'hidden';
        
        if (!isVisible) return null;
        
        return {
          id: idx,
          tag: el.tagName.toLowerCase(),
          type: el.type || '',
          text: el.textContent.trim().slice(0, 200),
          value: el.value || '',
          placeholder: el.placeholder || '',
          checked: el.checked || false,
          role: el.getAttribute('role') || ''
        };
      }).filter(el => el !== null);
      
      // Get page text (limited to avoid token bloat)
      const bodyText = document.body.innerText.slice(0, 2000);
      
      // Check for modals
      const modals = document.querySelectorAll('[role="dialog"], .modal, [class*="modal"]').length;
      
      return {
        currentStep,
        bodyText,
        interactive,
        modalCount: modals
      };
    });
  }

  async analyzeWithLLM(context) {
    const systemPrompt = `You are an expert at solving browser automation challenges. Analyze the page and determine the EXACT actions needed to progress to the next step.

IMPORTANT: 
- Popups have already been dismissed
- Focus on the ACTUAL challenge (entering codes, selecting options, clicking real navigation)
- Be specific about element IDs and actions
- Look for codes that need to be entered, radio buttons to select, or real navigation buttons

Return JSON:
{
  "reasoning": "detailed explanation of what the challenge requires",
  "actions": [
    {"type": "type", "elementId": 5, "text": "ABC123", "reason": "enter the code found in the page"},
    {"type": "click", "elementId": 12, "reason": "click submit button"},
    {"type": "scroll", "amount": 500, "reason": "reveal hidden content"}
  ],
  "expectedNextStep": 2
}

Action types: "click", "type", "scroll", "select"`;

    const userPrompt = `Current Step: ${context.currentStep || 'unknown'}
Modals visible: ${context.modalCount}

Interactive elements (${context.interactive.length} total):
${context.interactive.slice(0, 40).map(el => 
  `[${el.id}] ${el.tag}${el.type ? `[${el.type}]` : ''} "${el.text.slice(0, 80)}"${el.placeholder ? ` placeholder:"${el.placeholder}"` : ''}${el.role ? ` role:${el.role}` : ''}`
).join('\n')}

Page content excerpt:
${context.bodyText.slice(0, 1200)}

What actions are needed to progress to the next step?`;

    return await this.llm.analyze(systemPrompt, userPrompt);
  }

  async executeActions(actions) {
    for (const action of actions) {
      try {
        if (action.type === 'click') {
          const elements = await this.page.$$('button, a, input, [role="button"], [role="radio"]');
          if (elements[action.elementId]) {
            await elements[action.elementId].click();
            console.log(`   ✓ Clicked element ${action.elementId}: ${action.reason}`);
            await this.delay(300);
          }
        } else if (action.type === 'type') {
          const elements = await this.page.$$('input, textarea');
          if (elements[action.elementId]) {
            await elements[action.elementId].click();
            await this.delay(100);
            await elements[action.elementId].type(action.text, { delay: 50 });
            console.log(`   ✓ Typed "${action.text}" in element ${action.elementId}: ${action.reason}`);
            await this.delay(200);
          }
        } else if (action.type === 'scroll') {
          await this.page.evaluate((amount) => window.scrollBy(0, amount), action.amount || 500);
          console.log(`   ✓ Scrolled ${action.amount || 500}px: ${action.reason}`);
          await this.delay(200);
        }
      } catch (e) {
        console.log(`   ⚠️  Action failed: ${action.type} - ${e.message}`);
      }
    }
  }

  async solveChallenge() {
    const challengeStart = Date.now();
    const startStep = await this.getCurrentStep();
    
    console.log(`\n📝 Solving Step ${startStep}...`);

    // Phase 1: Aggressively dismiss ALL popups
    console.log('   🧹 Dismissing popups...');
    const popupsDismissed = await this.dismissAllPopups();
    if (popupsDismissed > 0) {
      console.log(`   ✓ Dismissed ${popupsDismissed} popups`);
    }
    
    await this.delay(500);

    // Phase 2: Extract context and analyze with LLM
    console.log('   🤖 Analyzing challenge with LLM...');
    const context = await this.extractChallengeContext();
    const analysis = await this.analyzeWithLLM(context);
    
    if (!analysis) {
      console.log('   ❌ LLM analysis failed');
      return { success: false, popupsDismissed, llmData: { calls: 1, tokens: { input: 0, output: 0 }, time: 0 } };
    }

    console.log(`   💭 ${analysis.content.reasoning}`);
    console.log(`   📊 Tokens: ${analysis.tokens.input + analysis.tokens.output}, Time: ${analysis.duration.toFixed(2)}s`);

    // Phase 3: Execute actions
    await this.executeActions(analysis.content.actions);
    
    // Phase 4: Wait and verify progress
    await this.delay(1000);
    const newStep = await this.getCurrentStep();
    
    const duration = (Date.now() - challengeStart) / 1000;
    const llmData = {
      calls: 1,
      tokens: analysis.tokens,
      time: analysis.duration
    };

    if (newStep && newStep > startStep) {
      console.log(`   ✅ SUCCESS! Advanced from step ${startStep} to ${newStep}`);
      this.currentStep = newStep;
      this.metrics.addChallenge(newStep, duration, popupsDismissed, llmData);
      console.log(`   ⏱️  Completed in ${duration.toFixed(2)}s`);
      return { success: true, newStep };
    } else {
      console.log(`   ⚠️  Still on step ${startStep}, may need retry`);
      this.metrics.addChallenge(startStep, duration, popupsDismissed, llmData);
      return { success: false, popupsDismissed, llmData };
    }
  }

  async run() {
    try {
      await this.init();

      console.log('🌐 Navigating to challenge website...');
      await this.page.goto('https://serene-frangipane-7fd25b.netlify.app', {
        waitUntil: 'networkidle0'
      });

      console.log('▶️  Starting challenges with robust approach...\n');

      // Click START
      await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const startBtn = buttons.find(btn => btn.textContent.includes('START'));
        if (startBtn) startBtn.click();
      });
      await this.delay(1000);

      // Solve all 30 challenges
      let attempts = 0;
      const maxAttempts = 50; // Safety limit
      
      while (this.currentStep < 30 && attempts < maxAttempts) {
        attempts++;
        const result = await this.solveChallenge();
        
        if (!result.success && attempts > 2) {
          // If stuck, try extra aggressive popup dismissal
          console.log('   🔄 Retrying with extra popup dismissal...');
          await this.dismissAllPopups();
          await this.delay(500);
        }
      }

      console.log('\n✅ Challenge completed!');

      const report = this.metrics.finish();
      fs.writeFileSync('results-robust.json', JSON.stringify(report, null, 2));
      
      console.log('\n📊 FINAL RESULTS (Robust Agent):');
      console.log(`   Total Time: ${report.totalDuration}`);
      console.log(`   Challenges Completed: ${report.totalChallenges}/30`);
      console.log(`   Popups Dismissed: ${report.totalPopupsDismissed}`);
      console.log(`   LLM Calls: ${report.totalLLMCalls}`);
      console.log(`   Total Cost: ${report.totalCost}`);
      console.log(`   Success: ${report.success ? '✅ YES' : '❌ NO'}`);
      console.log('\n📄 Results saved to results-robust.json');

      await this.delay(2000);
      await this.browser.close();

      return report;

    } catch (error) {
      console.error('❌ Error:', error.message);
      console.error(error.stack);
      if (this.browser) {
        await this.browser.close();
      }
      throw error;
    }
  }
}

// Run the robust agent
(async () => {
  const agent = new RobustBrowserAgent();
  await agent.run();
})();