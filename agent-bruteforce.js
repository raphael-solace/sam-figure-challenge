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
    this.memory = this.loadMemory();
  }
  
  loadMemory() {
    try {
      const data = fs.readFileSync('challenge-memory.json', 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.log('⚠️  No memory file found, using defaults');
      return { challengePatterns: {} };
    }
  }
  
  saveMemory() {
    this.memory.lastUpdated = new Date().toISOString();
    fs.writeFileSync('challenge-memory.json', JSON.stringify(this.memory, null, 2));
  }
  
  detectChallengeType(pageText) {
    const text = pageText.toLowerCase();
    const detected = [];
    
    for (const [type, pattern] of Object.entries(this.memory.challengePatterns)) {
      const matches = pattern.indicators.some(indicator => text.includes(indicator));
      if (matches) {
        detected.push(type);
      }
    }
    
    return detected;
  }
  
  recordSuccess(challengeType) {
    if (this.memory.challengePatterns[challengeType]) {
      this.memory.challengePatterns[challengeType].successCount++;
      this.saveMemory();
    }
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
    
    // NO FILTERING - Let everything show, we'll handle it programmatically
    console.log('   ✓ Browser ready (no filtering)');
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
    // DETECT CHALLENGE TYPE FROM MEMORY
    const pageText = await this.page.evaluate(() => document.body.innerText);
    const detectedTypes = this.detectChallengeType(pageText);
    
    if (detectedTypes.length > 0) {
      console.log(`   🧠 Detected challenge types: ${detectedTypes.join(', ')}`);
      
      // Handle "wait_seconds" challenge
      if (detectedTypes.includes('wait_seconds')) {
        console.log(`   ⏳ Wait challenge detected`);
        const waitMatch = pageText.match(/wait\s+(?:for\s+)?(\d+)\s+seconds?/i);
        if (waitMatch) {
          const seconds = parseInt(waitMatch[1]);
          console.log(`   ⏳ Waiting for ${seconds} seconds...`);
          await this.delay(seconds * 1000);
          console.log(`   ✓ Waited ${seconds} seconds`);
          this.recordSuccess('wait_seconds');
          
          // Click next after waiting
          const buttons = await this.page.$$('button, a');
          for (const button of buttons) {
            try {
              const text = await button.evaluate(el => el.textContent.toLowerCase());
              if (text.includes('next') || text.includes('continue')) {
                await button.click();
                return { popups: 0, codes: 0, clicked: 1, challengeType: 'wait_seconds' };
              }
            } catch (e) {}
          }
        }
      }
      
      // Handle "scroll_pixels" challenge
      if (detectedTypes.includes('scroll_pixels')) {
        console.log(`   📜 Scroll challenge detected`);
        const scrollMatch = pageText.match(/scroll\s+(?:down\s+)?(\d+)\s*(?:pixels?|px)/i);
        if (scrollMatch) {
          const pixels = parseInt(scrollMatch[1]);
          console.log(`   📜 Scrolling ${pixels} pixels...`);
          await this.page.evaluate((px) => window.scrollBy(0, px), pixels);
          await this.delay(500);
          console.log(`   ✓ Scrolled ${pixels} pixels`);
          this.recordSuccess('scroll_pixels');
          
          // Click next after scrolling
          const buttons = await this.page.$$('button, a');
          for (const button of buttons) {
            try {
              const text = await button.evaluate(el => el.textContent.toLowerCase());
              if (text.includes('next') || text.includes('continue')) {
                await button.click();
                return { popups: 0, codes: 0, clicked: 1, challengeType: 'scroll_pixels' };
              }
            } catch (e) {}
          }
        }
      }
      
      // Handle "audio_listen" challenge - just skip it!
      if (detectedTypes.includes('audio_listen')) {
        console.log(`   ⏭️  Audio challenge detected - skipping (no need to listen)`);
        // Just click next/continue
        const buttons = await this.page.$$('button, a');
        for (const button of buttons) {
          try {
            const text = await button.evaluate(el => el.textContent.toLowerCase());
            if (text.includes('next') || text.includes('continue') || text.includes('skip')) {
              await button.click();
              console.log(`   ✓ Clicked: Skip audio`);
              this.recordSuccess('audio_listen');
              return { popups: 0, codes: 0, clicked: 1, challengeType: 'audio_listen' };
            }
          } catch (e) {}
        }
      }
    }
    
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
    
    // HOVER OVER ELEMENTS TO REVEAL HIDDEN CONTENT
    const hoverElements = await this.page.$$('button, div, span, [data-hover], [class*="hover"]');
    for (const element of hoverElements.slice(0, 10)) {
      try {
        const isVisible = await element.isVisible();
        if (isVisible) {
          await element.hover();
          await this.delay(100);
        }
      } catch (e) {
        // Continue
      }
    }
    
    // CLICK "REVEAL CODE" BUTTONS!
    const revealButtons = await this.page.$$('button');
    for (const button of revealButtons) {
      try {
        const isVisible = await button.isVisible();
        if (!isVisible) continue;
        
        const text = await button.evaluate(el => el.textContent.toLowerCase());
        
        if (text.includes('reveal') || text.includes('show code') || text.includes('get code')) {
          await button.click();
          console.log(`   ✓ Clicked: "Reveal Code" button`);
          await this.delay(300);
        }
   s  } catch (e) {
        // Continue
      }
    }
    
    // Scroll main page
    await this.page.evaluate(() => window.scrollBy(0, 500));
    await this.delay(200);
    
    // PRECISE MODAL SCROLLING - FOCUS ON "Please Select an Option"
    console.log('   🔍 Looking for scrollable modals...');
    const scrollResult = await this.page.evaluate(() => {
      const results = [];
      
      // First, find modals specifically
      const modals = document.querySelectorAll('[role="dialog"], .modal, [class*="modal"]');
      console.log(`   Found ${modals.length} modal(s)`);
          modals.forEach((modal, modalIdx) => {
        // Find scrollable children inside the modal
        const allChildren = modal.querySelectorAll('*');
        
        allChildren.forEach((el, elIdx) => {
          const hasVerticalScrollbar = el.scrollHeight > el.clientHeight;
          
          if (hasVerticalScrollbar) {
            const computedStyle = window.getComputedStyle(el);
            const overflowY = computedStyle.overflowY;
            const overflow = computedStyle.overflow;
            const canScroll = overflowY === 'scroll' || overflowY === 'auto' || 
                             overflow === 'scroll' || overflow === 'auto';
            
            if (canScroll) {
              const beforeScroll = el.scrollTop;
              
              // Scroll in SMALL increments: 20%, 40%, 60%
              const positions = [
                Math.floor(el.scrollHeight * 0.20),
                Math.floor(el.scrollHeight * 0.40),
                Math.floor(el.scrollHeight * 0.60)
              ];
              
              let scrolledTo = [];
              for (const pos of positions) {
                el.scrollTop = pos;
                scrolledTo.push(el.scrollTop);
                
                // Small delay
                const start = Date.now();
                while (Date.now() - start < 150) {}
              }
              
              results.push({
                modalIdx,
                elIdx,
                tag: el.tagName,
                classes: el.className.slice(0, 50),
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
                scrolledTo: scrolledTo,
                beforeScroll
              });
            }
          }
        });
      });
      
      return results;
    });
    
    console.log(`   📜 Scrolled ${scrollResult.length} element(s) in modals:`);
    scrollResult.forEach((r, i) => {
      console.log(`      ${i+1}. Modal ${r.modalIdx}, Element ${r.elIdx}: ${r.tag}.${r.classes}`);
      console.log(`         Height: ${r.scrollHeight}px, Visible: ${r.clientHeight}px`);
      console.log(`         Scrolled from ${r.beforeScroll}px to: ${r.scrolledTo.join('px, ')}px`);
    });
    
    await this.delay(500);
    
    // ALSO try mouse wheel on any visible modal
    try {
      const modalElements = await this.page.$$('[role="dialog"], .modal, [class*="modal"]');
      for (const modal of modalElements) {
        const box = await modal.boundingBox();
        if (box) {
          // Move mouse to center of modal
          await this.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          // Scroll with mouse wheel
          for (let i = 0; i < 10; i++) {
            await this.page.mouse.wheel({ deltaY: 100 });
            await this.delay(50);
          }
        }
      }
    } catch (e) {
      // Continue
    }
    
    // ALSO try keyboard scrolling
    try {
      await this.page.keyboard.press('PageDown');
      await this.delay(100);
      await this.page.keyboard.press('PageDown');
      await this.delay(100);
      await this.page.keyboard.press('End');
      await this.delay(200);
    } catch (e) {
      // Continue
    }
    
    if (scrollResult.length > 0) {
      console.log(`   ✓ Scrolled ${scrollResult.length} element(s) using multiple methods`);
      scrollResult.slice(0, 2).forEach(r => {
        console.log(`      - ${r.tag}.${r.classes.slice(0, 30)} → ${r.scrolled}px`);
      });
    } else {
      console.log(`   ⚠️  No scrollable elements found`);
    }
    
    // CLICK EVERYWHERE - LABELS, DIVS, SPANS NEAR RADIOS
    const clickableElements = await this.page.$$('label, div, span, button, [role="radio"]');
    let clickedElements = 0;
    
    for (const element of clickableElements) {
      try {
        const isVisible = await element.isVisible();
        if (!isVisible) continue;
        
        const text = await element.evaluate(el => el.textContent.toLowerCase());
        
        // Click if it contains "correct" or "option"
        if (text.includes('correct') || text.includes('option b')) {
          await element.evaluate(el => el.scrollIntoView({ behavior: 'auto', block: 'center' }));
          await this.delay(100);
          
          await element.click();
          clickedElements++;
          console.log(`   ✓ Clicked element with: "${text.slice(0, 40)}"`);
          await this.delay(100);
          
          if (clickedElements >= 5) break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    // ENHANCED RADIO BUTTON SELECTION FOR "Please Select an Option"
    const radios = await this.page.$$('input[type="radio"], button[role="radio"]');
    let selectedRadio = false;
    
    // First pass: look for "select me" or "correct" in nearby text
    for (const radio of radios) {
      try {
        const isVisible = await radio.isVisible();
        if (!isVisible) continue;
        
        const labelText = await radio.evaluate(el => {
          const label = el.closest('label') || 
                       document.querySelector(`label[for="${el.id}"]`) ||
                       el.parentElement ||
                       el.nextElementSibling;
          return label ? label.textContent.toLowerCase() : '';
        });
        
        // Look for "correct choice" (ALWAYS the right answer), or fallback to "select me" or "correct"
        if (labelText.includes('correct choice') || labelText.includes('select me') || labelText.includes('correct')) {
          // Scroll the radio into view first
          await radio.evaluate(el => el.scrollIntoView({ behavior: 'auto', block: 'center' }));
          await this.delay(200);
          
          await radio.click();
          console.log(`   ✓ Selected radio: "${labelText.slice(0, 40)}"`);
          selectedRadio = true;
          await this.delay(100);
          break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    // Second pass: if no "correct" found, try clicking ALL visible radios
    if (!selectedRadio) {
      let clickedCount = 0;
      for (const radio of radios) {
        try {
          const isVisible = await radio.isVisible();
          if (isVisible && clickedCount < 5) {
            // Scroll into view
            await radio.evaluate(el => el.scrollIntoView({ behavior: 'auto', block: 'center' }));
            await this.delay(100);
            
            await radio.click();
            clickedCount++;
            console.log(`   ✓ Clicked radio button ${clickedCount}`);
            await this.delay(100);
          }
        } catch (e) {
          // Continue
        }
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
            
            // Try keyboard shortcuts: Ctrl+A to select all, then type
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('a');
            await this.page.keyboard.up('Control');
            await this.delay(50);
            
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
    
    // TRY KEYBOARD SHORTCUTS FOR COPY/PASTE CHALLENGES
    try {
      console.log('   ⌨️  Trying keyboard shortcuts (Ctrl+A, Ctrl+C, Ctrl+V)...');
      
      // Select all text on page
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('a');
      await this.page.keyboard.up('Control');
      await this.delay(100);
      
      // Copy
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('c');
      await this.page.keyboard.up('Control');
      await this.delay(100);
      
      // Try to find input and paste
      const pasteInputs = await this.page.$$('input[type="text"], textarea, input:not([type])');
      for (const input of pasteInputs) {
        try {
          const isVisible = await input.isVisible();
          if (isVisible) {
            await input.click();
            await this.delay(50);
            
            // Paste
            await this.page.keyboard.down('Control');
            await this.page.keyboard.press('v');
            await this.page.keyboard.up('Control');
            await this.delay(100);
            
            console.log(`   ✓ Pasted content into input`);
            break;
          }
        } catch (e) {
          // Continue
        }
      }
    } catch (e) {
      // Continue
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
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📝 STEP ${startStep} OF 30`);
    console.log(`${'='.repeat(60)}`);

    // PURE BRUTE FORCE - Keep trying until it works!
    let attempts = 0;
    const maxAttempts = 5;
    let attemptLogs = [];
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`\n🔨 Attempt ${attempts}/${maxAttempts}...`);
      
      const bruteResult = await this.bruteForceChallenge();
      
      await this.delay(1000);
      let newStep = await this.getCurrentStep();
      
      // Log what happened in this attempt
      attemptLogs.push({
        attempt: attempts,
        popups: bruteResult.popups,
        codes: bruteResult.codes,
        clicked: bruteResult.clicked,
        stepAfter: newStep
      });
      
      if (newStep && newStep > startStep) {
        const duration = (Date.now() - start) / 1000;
        console.log(`\n${'✅'.repeat(30)}`);
        console.log(`✅ SUCCESS! Step ${startStep} → ${newStep}`);
        console.log(`   Duration: ${duration.toFixed(2)}s`);
        console.log(`   Attempts needed: ${attempts}`);
        console.log(`   What worked:`);
        console.log(`      - Popups dismissed: ${bruteResult.popups}`);
        console.log(`      - Codes found: ${bruteResult.codes}`);
        console.log(`      - Buttons clicked: ${bruteResult.clicked}`);
        console.log(`${'✅'.repeat(30)}\n`);
        
        this.currentStep = newStep;
        this.metrics.addChallenge(newStep, duration, 'bruteforce', { 
          ...bruteResult, 
          attempts,
          attemptLogs 
        });
        
        // Write incremental log after each successful challenge
        const progressLog = {
          timestamp: new Date().toISOString(),
          step: newStep,
          duration: duration.toFixed(2),
          attempts,
          totalCompleted: this.metrics.challenges.length,
          challenges: this.metrics.challenges
        };
        fs.appendFileSync('progress-log.txt', 
          `\n${'='.repeat(60)}\n` +
          `Step ${startStep} → ${newStep} completed in ${duration.toFixed(2)}s (${attempts} attempts)\n` +
          `Total completed: ${this.metrics.challenges.length}/30\n` +
          `${new Date().toISOString()}\n`
        );
        fs.writeFileSync('progress.json', JSON.stringify(progressLog, null, 2));
        
        return { success: true };
      }
      
      console.log(`\n⚠️  Attempt ${attempts} FAILED - Still on step ${startStep}`);
      console.log(`   What we tried:`);
      console.log(`      - Dismissed ${bruteResult.popups} popups`);
      console.log(`      - Found ${bruteResult.codes} codes`);
      console.log(`      - Clicked ${bruteResult.clicked} buttons`);
      
      if (attempts < maxAttempts) {
        console.log(`   → Retrying in 500ms...`);
        await this.delay(500);
      }
    }
    
    const duration = (Date.now() - start) / 1000;
    console.log(`\n${'❌'.repeat(30)}`);
    console.log(`❌ BLOCKED ON STEP ${startStep}`);
    console.log(`   All ${maxAttempts} attempts failed`);
    console.log(`   Duration: ${duration.toFixed(2)}s`);
    console.log(`   Attempt summary:`);
    attemptLogs.forEach((log, i) => {
      console.log(`      ${i+1}. Popups: ${log.popups}, Codes: ${log.codes}, Clicks: ${log.clicked}`);
    });
    console.log(`   🔍 This step needs investigation!`);
    console.log(`${'❌'.repeat(30)}\n`);
    
    this.metrics.addChallenge(startStep, duration, 'failed', { 
      attempts: maxAttempts,
      attemptLogs,
      blocked: true
    });
    return { success: false };
  }

  async run() {
    try {
      await this.init();
      
      // Start timer display
      const startTime = Date.now();
      const timerInterval = setInterval(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const remaining = (300 - elapsed).toFixed(1); // 5 minutes = 300 seconds
        process.stdout.write(`\r⏱️  Elapsed: ${elapsed}s | Remaining: ${remaining}s | Completed: ${this.currentStep}/30`);
      }, 100);

      console.log('🌐 Navigating...');
      await this.page.goto('https://serene-frangipane-7fd25b.netlify.app', {
        waitUntil: 'networkidle0'
      });

      console.log('\n▶️  Starting...\n');

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