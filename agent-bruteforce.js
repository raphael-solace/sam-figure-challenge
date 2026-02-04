const puppeteer = require('puppeteer');
const fs = require('fs');
require('dotenv').config();

class BruteForceMetrics {
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
}

class BruteForceAgent {
  constructor() {
    this.metrics = new BruteForceMetrics();
    this.currentStep = 0;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async init() {
    console.log('🚀 Launching browser (Brute-Force agent)...');
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
    
    for (let pass = 0; pass < 3; pass++) {
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

  async extractCodes() {
    return await this.page.evaluate(() => {
      const allText = document.body.innerText;
      const codeMatches = allText.match(/\b[A-Z0-9]{6}\b/g) || [];
      return [...new Set(codeMatches)];
    });
  }

  async bruteForceChallenge() {
    // ENHANCED BRUTE FORCE STRATEGY:
    // 1. Dismiss all popups
    // 2. Scroll main page AND modals
    // 3. Click radio buttons, checkboxes
    // 4. Extract and type codes
    // 5. Click SUBMIT
    // 6. Click navigation
    
    console.log('   📋 Page state:');
    const pageInfo = await this.page.evaluate(() => {
      const modals = document.querySelectorAll('[role="dialog"], .modal, [class*="modal"]');
      const radios = document.querySelectorAll('input[type="radio"]');
      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      return {
        modals: modals.length,
        radios: radios.length,
        checkboxes: checkboxes.length,
        inputs: inputs.length
      };
    });
    console.log(`      Modals: ${pageInfo.modals}, Radios: ${pageInfo.radios}, Checkboxes: ${pageInfo.checkboxes}, Inputs: ${pageInfo.inputs}`);
    
    const popups = await this.dismissAllPopups();
    
    // Scroll main page
    await this.page.evaluate(() => window.scrollBy(0, 500));
    await this.delay(200);
    
    // Scroll within modals/dialogs
    await this.page.evaluate(() => {
      const modals = document.querySelectorAll('[role="dialog"], .modal, [class*="modal"]');
      modals.forEach(modal => {
        if (modal.scrollHeight > modal.clientHeight) {
          modal.scrollTop += 300;
        }
      });
    });
    await this.delay(200);
    
    // Click radio buttons (select first visible one)
    const radios = await this.page.$$('input[type="radio"]');
    for (const radio of radios) {
      try {
        const isVisible = await radio.isVisible();
        if (isVisible) {
          await radio.click();
          console.log(`   ✓ Selected radio button`);
          await this.delay(100);
          break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    // Click checkboxes
    const checkboxes = await this.page.$$('input[type="checkbox"]');
    for (const checkbox of checkboxes) {
      try {
        const isVisible = await checkbox.isVisible();
        if (isVisible) {
          await checkbox.click();
          console.log(`   ✓ Checked checkbox`);
          await this.delay(100);
        }
      } catch (e) {
        // Continue
      }
    }
    
    // Extract codes
    const codes = await this.extractCodes();
    let typedCode = false;
    
    if (codes.length > 0) {
      console.log(`   🔑 Found codes: ${codes.join(', ')}`);
      
      // Type first code into any visible text input
      const inputs = await this.page.$$('input[type="text"], input:not([type])');
      for (const input of inputs) {
        try {
          const isVisible = await input.isVisible();
          if (isVisible) {
            await input.click();
            await this.delay(50);
            await input.evaluate(el => el.value = '');
            await input.type(codes[0], { delay: 50 });
            console.log(`   ✓ Typed code: ${codes[0]}`);
            typedCode = true;
            break;
          }
        } catch (e) {
          // Continue
        }
      }
    }
    
    await this.delay(200);
    
    // If we typed a code, click SUBMIT first
    if (typedCode) {
      const buttons = await this.page.$$('button, input[type="submit"]');
      for (const button of buttons) {
        try {
          const isVisible = await button.isVisible();
          if (!isVisible) continue;
          
          const text = await button.evaluate(el => el.textContent.toLowerCase());
          
          if (text.includes('submit')) {
            await button.click();
            console.log(`   ✓ Clicked: Submit`);
            await this.delay(500);
            break;
          }
        } catch (e) {
          // Continue
        }
      }
    }
    
    // Click "Submit & Continue" type buttons
    const allButtons = await this.page.$$('button, a, input[type="submit"]');
    for (const button of allButtons) {
      try {
        const isVisible = await button.isVisible();
        if (!isVisible) continue;
        
        const text = await button.evaluate(el => el.textContent.toLowerCase());
        
        if (text.includes('submit') && text.includes('continue')) {
          await button.click();
          console.log(`   ✓ Clicked: "${text.slice(0, 40)}"`);
          await this.delay(500);
          break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    // Now click navigation buttons
    let clicked = 0;
    for (const button of allButtons) {
      try {
        const isVisible = await button.isVisible();
        if (!isVisible) continue;
        
        const text = await button.evaluate(el => el.textContent.toLowerCase());
        
        if (text.includes('next') ||
            text.includes('continue') ||
            text.includes('proceed') ||
            text.includes('forward') ||
            text.includes('advance') ||
            text.includes('move') ||
            text.includes('go')) {
          await button.click();
          clicked++;
          console.log(`   ✓ Clicked: "${text.slice(0, 30)}"`);
          await this.delay(300);
          break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    return { popups, codes: codes.length, clicked };
  }

  async llmFallback() {
    console.log('   🤖 Using LLM fallback...');
    
    try {
      const context = await this.page.evaluate(() => {
        const stepMatch = document.body.innerText.match(/Step (\d+) of 30/);
        const codes = [...new Set((document.body.innerText.match(/\b[A-Z0-9]{6}\b/g) || []))];
        const interactive = Array.from(document.querySelectorAll('button, input, a')).slice(0, 20).map((el, i) => ({
          id: i,
          tag: el.tagName.toLowerCase(),
          text: el.textContent.trim().slice(0, 50)
        }));
        
        return {
          step: stepMatch ? parseInt(stepMatch[1]) : null,
          codes,
          interactive,
          text: document.body.innerText.slice(0, 800)
        };
      });

      const response = await fetch(`${process.env.LLM_SERVICE_ENDPOINT}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.LLM_SERVICE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: process.env.LLM_SERVICE_GENERAL_MODEL_NAME.replace('groq/', ''),
          messages: [{
            role: 'system',
            content: 'You are a JSON-only bot. Return ONLY valid JSON, no explanations.'
          }, {
            role: 'user',
            content: `Step ${context.step}. Codes: ${context.codes.join(',')}. Elements: ${JSON.stringify(context.interactive)}. Return JSON: {"action":"click","elementId":5}`
          }],
          temperature: 0,
          max_tokens: 100,
          response_format: { type: 'json_object' }
        })
      });

      const data = await response.json();
      const action = JSON.parse(data.choices[0].message.content);
      
      // Execute LLM action
      if (action.action === 'type') {
        const inputs = await this.page.$$('input');
        if (inputs[action.elementId]) {
          await inputs[action.elementId].type(action.text);
          console.log(`   ✓ LLM typed: ${action.text}`);
        }
      } else if (action.action === 'click') {
        const elements = await this.page.$$('button, a, input');
        if (elements[action.elementId]) {
          await elements[action.elementId].click();
          console.log(`   ✓ LLM clicked element ${action.elementId}`);
        }
      }
      
      return {
        llmTime: 0.5,
        tokens: { input: data.usage.prompt_tokens, output: data.usage.completion_tokens }
      };
    } catch (e) {
      console.log(`   ⚠️  LLM failed: ${e.message}`);
      return { llmTime: 0, tokens: { input: 0, output: 0 } };
    }
  }

  async solveChallenge() {
    const start = Date.now();
    const startStep = await this.getCurrentStep();
    
    console.log(`\n📝 Step ${startStep}...`);

    // Try brute force first
    console.log('   🔨 Brute forcing...');
    const bruteResult = await this.bruteForceChallenge();
    
    await this.delay(1000);
    let newStep = await this.getCurrentStep();
    
    if (newStep && newStep > startStep) {
      const duration = (Date.now() - start) / 1000;
      console.log(`   ✅ Brute force SUCCESS! ${startStep} → ${newStep}`);
      this.currentStep = newStep;
      this.metrics.addChallenge(newStep, duration, 'bruteforce', bruteResult);
      return { success: true };
    }
    
    // Brute force failed, try LLM
    console.log('   ⚠️  Brute force failed, trying LLM...');
    const llmResult = await this.llmFallback();
    
    await this.delay(1000);
    newStep = await this.getCurrentStep();
    
    const duration = (Date.now() - start) / 1000;
    
    if (newStep && newStep > startStep) {
      console.log(`   ✅ LLM SUCCESS! ${startStep} → ${newStep}`);
      this.currentStep = newStep;
      this.metrics.addChallenge(newStep, duration, 'llm', llmResult);
      return { success: true };
    }
    
    console.log(`   ❌ Both failed, still on ${startStep}`);
    this.metrics.addChallenge(startStep, duration, 'failed', {});
    return { success: false };
  }

  async run() {
    try {
      await this.init();

      console.log('🌐 Navigating...');
      await this.page.goto('https://serene-frangipane-7fd25b.netlify.app', {
        waitUntil: 'networkidle0'
      });

      console.log('▶️  Starting...\n');

      // Click START
      await this.page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const startBtn = buttons.find(btn => btn.textContent.includes('START'));
        if (startBtn) startBtn.click();
      });
      await this.delay(1000);

      // Solve all 30
      let attempts = 0;
      while (this.currentStep < 30 && attempts < 50) {
        attempts++;
        await this.solveChallenge();
      }

      console.log('\n✅ Done!');

      const report = this.metrics.finish();
      fs.writeFileSync('results-bruteforce.json', JSON.stringify(report, null, 2));
      
      console.log('\n📊 RESULTS:');
      console.log(`   Time: ${report.totalDuration}`);
      console.log(`   Completed: ${report.totalChallenges}/30`);
      console.log(`   Brute Force: ${report.bruteForceSuccesses}`);
      console.log(`   LLM Fallbacks: ${report.llmFallbacks}`);
      console.log(`   LLM Cost: ${report.totalCost}`);
      console.log(`   Success: ${report.success ? '✅' : '❌'}`);

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

(async () => {
  const agent = new BruteForceAgent();
  await agent.run();
})();