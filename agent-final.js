llconst puppeteer = require('puppeteer');
const fs = require('fs');
require('dotenv').config();

class FinalMetrics {
  constructor() {
    this.startTime = Date.now();
    this.challenges = [];
    this.totalPopupsDismissed = 0;
    this.totalCodesExtracted = 0;
    this.totalLLMCalls = 0;
    this.totalLLMTime = 0;
    this.totalTokens = { input: 0, output: 0 };
    this.totalCost = 0;
  }

  addChallenge(challengeNum, duration, popups, codesFound, llmData) {
    this.challenges.push({
      challenge: challengeNum,
      duration,
      popupsDismissed: popups,
      codesFound,
      llmCalls: llmData.calls,
      tokens: llmData.tokens,
      llmTime: llmData.time
    });
    
    this.totalPopupsDismissed += popups;
    this.totalCodesExtracted += codesFound;
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
      agentType: 'Final (Smooth Interactions + Code Extraction)',
      totalDuration: `${this.totalDuration.toFixed(2)} seconds`,
      totalChallenges: this.challenges.length,
      totalPopupsDismissed: this.totalPopupsDismissed,
      totalCodesExtracted: this.totalCodesExtracted,
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

class FinalBrowserAgent {
  constructor() {
    this.metrics = new FinalMetrics();
    this.llm = new GroqClient();
    this.currentStep = 0;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async init() {
    console.log('🚀 Launching browser (Final agent with smooth interactions)...');
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
    
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const buttons = await this.page.$$('button, [role="button"]');
        
        for (const button of buttons) {
          try {
            const isVisible = await button.isVisible();
            if (!isVisible) continue;
            
            const text = await button.evaluate(el => el.textContent.toLowerCase());
            
            if (text.includes('dismiss') || 
                text.includes('close') || 
                text.includes('accept') ||
                text.includes('decline') ||
                text.includes('ok')) {
              await button.click({ delay: 10 });
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
        // Continue
      }
    }
    
    return dismissed;
  }

  async extractChallengeContext() {
    return await this.page.evaluate(() => {
      const stepMatch = document.body.innerText.match(/Step (\d+) of 30/);
      const currentStep = stepMatch ? parseInt(stepMatch[1]) : null;
      
      // Extract ALL potential codes from the page (6-character alphanumeric)
      const allText = document.body.innerText;
      const codeMatches = allText.match(/\b[A-Z0-9]{6}\b/g) || [];
      const uniqueCodes = [...new Set(codeMatches)];
      
      // Get all visible interactive elements
      const interactive = Array.from(document.querySelectorAll(
        'button, a, input, select, textarea, [role="button"], [role="radio"]'
      )).map((el, idx) => {
        const rect = el.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;
        
        if (!isVisible) return null;
        
        return {
          id: idx,
          tag: el.tagName.toLowerCase(),
          type: el.type || '',
          text: el.textContent.trim().slice(0, 150),
          value: el.value || '',
          placeholder: el.placeholder || '',
          role: el.getAttribute('role') || ''
        };
      }).filter(el => el !== null);
      
      const bodyText = document.body.innerText.slice(0, 2000);
      
      return {
        currentStep,
        codes: uniqueCodes,
        bodyText,
        interactive
      };
    });
  }

  async analyzeWithLLM(context) {
    const systemPrompt = `You are an expert at solving browser automation challenges with smooth, natural interactions.

IMPORTANT RULES:
1. Popups have already been dismissed
2. If codes are provided, you MUST use them - type the EXACT code into input fields
3. Use smooth interaction flow: scroll → find elements → type codes → click submit → navigate
4. Be specific about element IDs and use actual code values
5. Always verify you're using the right code for the right input

Return JSON:
{
  "reasoning": "detailed explanation including which code to use if applicable",
  "actions": [
    {"type": "scroll", "amount": 500, "reason": "reveal code section"},
    {"type": "type", "elementId": 3, "text": "ABC123", "reason": "enter the 6-character code"},
    {"type": "click", "elementId": 12, "reason": "submit the code"},
    {"type": "scroll", "amount": 300, "reason": "reveal navigation"},
    {"type": "click", "elementId": 20, "reason": "click next button"}
  ]
}

Action types: "click", "type", "scroll"`;

    let codesInfo = '';
    if (context.codes && context.codes.length > 0) {
      codesInfo = `\n\nCODES FOUND ON PAGE: ${context.codes.join(', ')}
**You MUST use one of these codes if there's an input field asking for a code!**`;
    }

    const userPrompt = `Current Step: ${context.currentStep || 'unknown'}${codesInfo}

Interactive elements (${context.interactive.length} total):
${context.interactive.slice(0, 35).map(el => 
  `[${el.id}] ${el.tag}${el.type ? `[${el.type}]` : ''} "${el.text.slice(0, 70)}"${el.placeholder ? ` placeholder:"${el.placeholder}"` : ''}`
).join('\n')}

Page content excerpt:
${context.bodyText.slice(0, 1000)}

What smooth sequence of actions will progress to the next step?`;

    return await this.llm.analyze(systemPrompt, userPrompt);
  }

  async executeActions(actions) {
    for (const action of actions) {
      try {
        if (action.type === 'scroll') {
          await this.page.evaluate((amount) => {
            window.scrollBy({ top: amount, behavior: 'smooth' });
          }, action.amount || 500);
          console.log(`   ✓ Scrolled ${action.amount || 500}px: ${action.reason}`);
          await this.delay(400); // Wait for smooth scroll
          
        } else if (action.type === 'type') {
          const inputs = await this.page.$$('input, textarea');
          if (inputs[action.elementId]) {
            await inputs[action.elementId].click();
            await this.delay(100);
            // Clear existing content first
            await inputs[action.elementId].evaluate(el => el.value = '');
            // Type with natural delay
            await inputs[action.elementId].type(action.text, { delay: 80 });
            console.log(`   ✓ Typed "${action.text}" into input ${action.elementId}: ${action.reason}`);
            await this.delay(300);
          }
          
        } else if (action.type === 'click') {
          const elements = await this.page.$$('button, a, input[type="submit"], [role="button"], [role="radio"]');
          if (elements[action.elementId]) {
            await elements[action.elementId].click();
            console.log(`   ✓ Clicked element ${action.elementId}: ${action.reason}`);
            await this.delay(400);
          }
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

    // Phase 1: Dismiss popups
    const popupsDismissed = await this.dismissAllPopups();
    if (popupsDismissed > 0) {
      console.log(`   🧹 Dismissed ${popupsDismissed} popups`);
    }
    
    await this.delay(500);

    // Phase 2: Extract context including codes
    const context = await this.extractChallengeContext();
    const codesFound = context.codes ? context.codes.length : 0;
    
    if (codesFound > 0) {
      console.log(`   🔑 Found ${codesFound} code(s): ${context.codes.join(', ')}`);
    }

    // Phase 3: Analyze with LLM
    console.log('   🤖 Analyzing with LLM...');
    const analysis = await this.analyzeWithLLM(context);
    
    if (!analysis) {
      console.log('   ❌ LLM analysis failed');
      return { success: false };
    }

    console.log(`   💭 ${analysis.content.reasoning}`);
    console.log(`   📊 ${analysis.tokens.input + analysis.tokens.output} tokens, ${analysis.duration.toFixed(2)}s`);

    // Phase 4: Execute smooth actions
    await this.executeActions(analysis.content.actions);
    
    // Phase 5: Wait and verify
    await this.delay(1000);
    const newStep = await this.getCurrentStep();
    
    const duration = (Date.now() - challengeStart) / 1000;
    const llmData = {
      calls: 1,
      tokens: analysis.tokens,
      time: analysis.duration
    };

    if (newStep && newStep > startStep) {
      console.log(`   ✅ SUCCESS! Step ${startStep} → ${newStep}`);
      this.currentStep = newStep;
      this.metrics.addChallenge(newStep, duration, popupsDismissed, codesFound, llmData);
      console.log(`   ⏱️  ${duration.toFixed(2)}s`);
      return { success: true, newStep };
    } else {
      console.log(`   ⚠️  Still on step ${startStep}`);
      this.metrics.addChallenge(startStep, duration, popupsDismissed, codesFound, llmData);
      return { success: false };
    }
  }

  async run() {
    try {
      await this.init();

      console.log('🌐 Navigating to challenge...');
      await this.page.goto('https://serene-frangipane-7fd25b.netlify.app', {
        waitUntil: 'networkidle0'
      });

      console.log('▶️  Starting challenges...\n');

      // Click START
      await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const startBtn = buttons.find(btn => btn.textContent.includes('START'));
        if (startBtn) startBtn.click();
      });
      await this.delay(1000);

      // Solve all 30 challenges
      let attempts = 0;
      const maxAttempts = 40;
      
      while (this.currentStep < 30 && attempts < maxAttempts) {
        attempts++;
        await this.solveChallenge();
      }

      console.log('\n✅ Challenge completed!');

      const report = this.metrics.finish();
      fs.writeFileSync('results-final.json', JSON.stringify(report, null, 2));
      
      console.log('\n📊 FINAL RESULTS:');
      console.log(`   Time: ${report.totalDuration}`);
      console.log(`   Completed: ${report.totalChallenges}/30`);
      console.log(`   Popups: ${report.totalPopupsDismissed}`);
      console.log(`   Codes: ${report.totalCodesExtracted}`);
      console.log(`   LLM Calls: ${report.totalLLMCalls}`);
      console.log(`   Cost: ${report.totalCost}`);
      console.log(`   Success: ${report.success ? '✅' : '❌'}`);
      console.log('\n📄 Saved to results-final.json');

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

// Run
(async () => {
  const agent = new FinalBrowserAgent();
  await agent.run();
})();