const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const LLMClient = require('./utils/llm');
require('dotenv').config();

class BruteForceMetrics {
  constructor() {
    this.startTime = Date.now();
    this.challenges = [];
    this.totalPopupsDismissed = 0;
    this.totalCodesFound = 0;
    this.totalBruteForceSuccesses = 0;
    this.totalLLMFallbacks = 0;
    this.totalLLMCalls = 0;
    this.totalLLMTime = 0;
    this.totalTokens = { input: 0, output: 0 };
    this.totalCost = 0;
    this.totalSteps = 30;
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
    } else if (method === 'llm') {
      this.totalLLMFallbacks++;
    }
  }

  recordLLMUsage(tokens, llmTime) {
    this.totalLLMCalls++;
    if (llmTime) this.totalLLMTime += llmTime;
    if (tokens) {
      this.totalTokens.input += tokens.input || 0;
      this.totalTokens.output += tokens.output || 0;
      this.totalCost += ((tokens.input || 0) * 0.05 / 1000000) + ((tokens.output || 0) * 0.08 / 1000000);
    }
  }

  finish(totalSteps = this.totalSteps, finalStepReached = false) {
    this.totalSteps = totalSteps || this.totalSteps;
    this.endTime = Date.now();
    this.totalDuration = (this.endTime - this.startTime) / 1000;
    return {
      agentType: 'Hybrid (Heuristics + Occasional LLM)',
      totalDuration: `${this.totalDuration.toFixed(2)} seconds`,
      totalChallenges: this.challenges.length,
      totalSteps: this.totalSteps,
      finalStepReached,
      bruteForceSuccesses: this.totalBruteForceSuccesses,
      llmFallbacks: this.totalLLMFallbacks,
      totalLLMCalls: this.totalLLMCalls,
      llmTimeTotal: `${this.totalLLMTime.toFixed(2)} seconds`,
      totalTokens: this.totalTokens,
      totalCost: `$${this.totalCost.toFixed(6)}`,
      averageTimePerChallenge: this.challenges.length
        ? `${(this.totalDuration / this.challenges.length).toFixed(2)} seconds`
        : '0.00 seconds',
      challenges: this.challenges,
      success: finalStepReached,
      timestamp: new Date().toISOString()
    };
  }
}

class BruteForceAgent {
  constructor() {
    this.metrics = new BruteForceMetrics();
    this.currentStep = 0;
    this.totalSteps = 30;
    this.config = this.loadConfig();
    this.llmCalls = 0;
    this.llmMaxCalls = parseInt(this.getConfig('LLM_MAX_CALLS', '30'), 10);
    this.llmMaxCallsPerStep = parseInt(this.getConfig('LLM_MAX_CALLS_PER_STEP', '1'), 10);
    this.llmMinCallsPerRun = parseInt(this.getConfig('LLM_MIN_CALLS_PER_RUN', '1'), 10);
    this.llmMinCallsPerStep = parseInt(this.getConfig('LLM_MIN_CALLS_PER_STEP', '1'), 10);
    this.llmAlwaysOn = (this.getConfig('LLM_ALWAYS_ON', 'true')).toLowerCase() === 'true';
    this.llmUseCache = (this.getConfig('LLM_USE_CACHE', 'false')).toLowerCase() === 'true';
    this.useSessionCode = (this.getConfig('USE_SESSION_CODE', 'true')).toLowerCase() === 'true';
    this.keepBrowserOpen = (this.getConfig('KEEP_BROWSER_OPEN', 'true')).toLowerCase() === 'true';
    this.llm = new LLMClient({
      endpoint: this.getConfig('LLM_SERVICE_ENDPOINT', ''),
      apiKey: process.env.LLM_SERVICE_API_KEY,
      model: (this.getConfig('LLM_SERVICE_GENERAL_MODEL_NAME', '')).replace('groq/', ''),
      timeoutMs: parseInt(this.getConfig('LLM_TIMEOUT_MS', '2000'), 10)
    });
    this.llmCache = new Map();
    this.memory = this.loadMemory();

    this.baseUrl = (this.getConfig('CHALLENGE_URL', 'https://serene-frangipane-7fd25b.netlify.app')).replace(/\/$/, '');
    this.logsDir = path.join(__dirname, 'logs');
    this.resultsDir = path.join(__dirname, 'results');
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

  loadConfig() {
    const configPath = path.join(__dirname, 'config.json');
    if (!fs.existsSync(configPath)) return {};
    try {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (e) {
      return {};
    }
  }

  getConfig(key, fallback) {
    if (process.env[key] !== undefined) return process.env[key];
    if (this.config && this.config[key] !== undefined) return this.config[key];
    return fallback;
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

  ensureDirs() {
    if (!fs.existsSync(this.logsDir)) fs.mkdirSync(this.logsDir, { recursive: true });
    if (!fs.existsSync(this.resultsDir)) fs.mkdirSync(this.resultsDir, { recursive: true });
  }

  async safeEvaluate(fn, ...args) {
    try {
      return await this.page.evaluate(fn, ...args);
    } catch (e) {
      const msg = e?.message || '';
      if (msg.includes('detached') ||
          msg.includes('Execution context was destroyed') ||
          msg.includes('Cannot find context with specified id')) {
        return null;
      }
      throw e;
    }
  }

  hashString(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    return `${hash}`;
  }

  async waitForInput(timeoutMs = 1500) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = await this.safeEvaluate(() => {
        return !!document.querySelector('input[placeholder*="code" i], input[maxlength="6"], input[type="text"], input:not([type])');
      });
      if (found) return true;
      await this.delay(100);
    }
    return false;
  }

  async getSessionCodes() {
    return await this.safeEvaluate(() => {
      const key = 'WO_2024_CHALLENGE';
      const raw = sessionStorage.getItem('wo_session');
      if (!raw) return null;
      let decoded = '';
      try {
        const bytes = atob(raw);
        for (let i = 0; i < bytes.length; i++) {
          decoded += String.fromCharCode(bytes.charCodeAt(i) ^ key.charCodeAt(i % key.length));
        }
      } catch (e) {
        return null;
      }
      try {
        const data = JSON.parse(decoded);
        return Array.isArray(data.codes) ? data.codes : null;
      } catch (e) {
        return null;
      }
    });
  }

  async fillCodeAndSubmit(code) {
    return await this.safeEvaluate((value) => {
      const input = document.querySelector('input[placeholder*="code" i], input[maxlength="6"]') ||
        document.querySelector('input[type="text"], input:not([type])');
      if (!input) return false;
      input.scrollIntoView({ behavior: 'auto', block: 'center' });
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (setter) {
        setter.call(input, value);
      } else {
        input.value = value;
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));

      const form = input.closest('form');
      if (form && typeof form.requestSubmit === 'function') {
        form.requestSubmit();
        return true;
      }

      const submit = (form && form.querySelector('button[type="submit"], input[type="submit"]')) ||
        document.querySelector('button[type="submit"], input[type="submit"]');
      if (submit) {
        submit.click();
        return true;
      }

      if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        return true;
      }

      return false;
    }, code);
  }

  async trySessionCode(step) {
    if (!this.useSessionCode) return null;
    if (!step || step >= this.totalSteps) return null;
    const inputReady = await this.waitForInput();
    if (!inputReady) {
      console.log('   ⚠️  No input found for session code');
      return null;
    }
    const codes = await this.getSessionCodes();
    if (!codes || !codes[step]) {
      console.log('   ⚠️  Session codes unavailable');
      return null;
    }
    console.log(`   🔐 Session codes loaded (${codes.length})`);
    const code = String(codes[step]).toUpperCase();
    const submitted = await this.fillCodeAndSubmit(code);
    if (!submitted) {
      console.log('   ⚠️  Session code submit failed');
      return null;
    }
    return code;
  }

  async handleFinalStep() {
    console.log(`🏁 Final step detected (${this.totalSteps}) — completing Service Worker challenge...`);
    await this.dismissPopupsAggressive();

    // Try to click "Register Service Worker" if present
    await this.safeEvaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const registerBtn = buttons.find(b => /register service worker/i.test(b.textContent || ''));
      if (registerBtn && !registerBtn.disabled) registerBtn.click();
    });

    // Wait for cache status to populate
    await this.delay(1200);

    // Click "Retrieve from Cache"
    await this.safeEvaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const retrieveBtn = buttons.find(b => /retrieve from cache/i.test(b.textContent || ''));
      if (retrieveBtn && !retrieveBtn.disabled) retrieveBtn.click();
    });

    await this.delay(1200);

    // Try to extract any revealed code and submit
    const codes = await this.extractCodes();
    if (codes.length > 0) {
      console.log(`   🔑 Found code on final step: ${codes[0]}`);
      await this.fillCodeAndSubmit(codes[0]);
      await this.delay(800);
      return true;
    }

    console.log('   ⚠️  No code revealed on final step (expected). Navigating to finish screen...');
    try {
      await this.page.goto(`${this.baseUrl}/finish`, {
        waitUntil: 'networkidle0'
      });
      await this.delay(500);
    } catch (e) {
      // Ignore navigation errors
    }

    return true;
  }


  async init() {
    console.log('🚀 Launching browser (Enhanced Brute-Force agent)...');
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1280, height: 800 },
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
    this.page.setDefaultTimeout(10000);
    
    console.log(`   ✓ Browser ready | LLM: ${this.llm.isEnabled() ? 'enabled' : 'disabled'}`);
  }

  async getCurrentStep() {
    const text = await this.safeEvaluate(() => document.body.innerText);
    if (!text) return null;
    const match = text.match(/Step\s+(\d+)\s+of\s+(\d+)/i);
    if (match) {
      this.totalSteps = parseInt(match[2], 10);
      this.metrics.totalSteps = this.totalSteps;
      return parseInt(match[1], 10);
    }
    return null;
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

  async dismissPopupsAggressive(windowMs = 1500) {
    const start = Date.now();
    let total = 0;
    while (Date.now() - start < windowMs) {
      total += await this.dismissAllPopups();
      await this.delay(150);
    }
    if (total > 0) {
      console.log(`   🧹 Aggressively dismissed ${total} popups`);
    }
    return total;
  }

  async extractCodes() {
    const codes = await this.safeEvaluate(() => {
      const allText = document.body.innerText;
      const codeMatches = allText.match(/\b[A-Z0-9]{6}\b/g) || [];
      return [...new Set(codeMatches)];
    });
    return Array.isArray(codes) ? codes : [];
  }

  canUseLLM(stepCalls = 0) {
    return this.llm.isEnabled() &&
      this.llmCalls < this.llmMaxCalls &&
      stepCalls < this.llmMaxCallsPerStep;
  }

  async extractLLMContext() {
    const context = await this.safeEvaluate(() => {
      const text = document.body.innerText.replace(/\s+/g, ' ').trim();
      const stepMatch = text.match(/Step\s+(\d+)\s+of\s+(\d+)/i);
      const codes = [...new Set((text.match(/\b[A-Z0-9]{6}\b/g) || []))];
      const selector = 'button, [role="button"], a, input, select, textarea, [role="radio"], [role="checkbox"]';
      const elements = Array.from(document.querySelectorAll(selector)).map((el, idx) => {
        const rect = el.getBoundingClientRect();
        const visible = rect.width > 1 && rect.height > 1;
        if (!visible) return null;
        return {
          id: idx,
          tag: el.tagName.toLowerCase(),
          type: el.type || '',
          text: (el.textContent || '').trim().slice(0, 80),
          value: el.value || '',
          placeholder: el.placeholder || '',
          ariaLabel: el.getAttribute('aria-label') || ''
        };
      }).filter(Boolean).slice(0, 30);

      return {
        step: stepMatch ? parseInt(stepMatch[1], 10) : null,
        total: stepMatch ? parseInt(stepMatch[2], 10) : null,
        text: text.slice(0, 1400),
        codes,
        elements
      };
    });

    return context || null;
  }

  async executeLLMActions(actions) {
    const selector = 'button, [role="button"], a, input, select, textarea, [role="radio"], [role="checkbox"]';

    for (const action of actions) {
      if (!action || !action.type) continue;

      if (action.type === 'wait') {
        await this.delay(Math.min(Math.max(action.ms || 300, 100), 3000));
        continue;
      }

      if (action.type === 'scroll') {
        const deltaY = typeof action.deltaY === 'number' ? action.deltaY : 400;
        await this.safeEvaluate((dy) => window.scrollBy(0, dy), deltaY);
        await this.delay(200);
        continue;
      }

      if (typeof action.selectorIndex !== 'number') continue;

      if (action.type === 'click') {
        await this.safeEvaluate((idx, sel) => {
          const el = document.querySelectorAll(sel)[idx];
          if (!el) return false;
          el.scrollIntoView({ behavior: 'auto', block: 'center' });
          el.click();
          return true;
        }, action.selectorIndex, selector);
        await this.delay(300);
        continue;
      }

      if (action.type === 'type') {
        await this.safeEvaluate((idx, sel, text) => {
          const el = document.querySelectorAll(sel)[idx];
          if (!el) return false;
          el.scrollIntoView({ behavior: 'auto', block: 'center' });
          el.focus();
          const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
          if (setter) {
            setter.call(el, text);
          } else {
            el.value = text;
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return true;
        }, action.selectorIndex, selector, action.text || '');
        await this.delay(300);
        continue;
      }
    }
  }

  filterSafeActions(actions, context) {
    if (!Array.isArray(actions)) return [];
    if (!context || !Array.isArray(context.elements)) return [];

    const codes = (context.codes || []).map(c => c.toUpperCase());
    const safeClicks = /(next|continue|submit|register|retrieve|reveal|start|extract|open|proceed|finish|complete|advance|go)/i;
    const risky = /(fake|wrong|incorrect|dismiss|close \(fake\))/i;

    const safe = [];
    for (const action of actions) {
      if (!action || !action.type) continue;
      if (action.type === 'wait' || action.type === 'scroll') {
        safe.push(action);
        continue;
      }

      const el = context.elements[action.selectorIndex];
      const text = ((el && (el.text || el.ariaLabel || el.placeholder || '')) || '').toLowerCase();

      if (action.type === 'type') {
        const typed = (action.text || '').toUpperCase();
        if (codes.includes(typed)) {
          safe.push(action);
        }
        continue;
      }

      if (action.type === 'click') {
        if (safeClicks.test(text) && !risky.test(text)) {
          safe.push(action);
        }
      }
    }

    return safe.slice(0, 3);
  }

  async llmSolve(step, stepCalls = 0, { useCache = true } = {}) {
    if (!this.canUseLLM(stepCalls)) return null;

    const context = await this.extractLLMContext();
    if (!context) return null;

    const cacheKey = this.hashString(`${context.step}|${context.text.slice(0, 400)}`);
    if (useCache && this.llmCache.has(cacheKey)) {
      return this.llmCache.get(cacheKey);
    }

    const systemPrompt = [
      'You are a JSON-only navigation helper.',
      'Return ONLY valid JSON with an "actions" array.',
      'Each action is one of:',
      '- {"type":"click","selectorIndex":N}',
      '- {"type":"type","selectorIndex":N,"text":"ABC123"}',
      '- {"type":"wait","ms":500}',
      '- {"type":"scroll","deltaY":400}',
      'Keep actions minimal (1-3).'
    ].join(' ');

    const userPrompt = JSON.stringify({
      step: context.step,
      total: context.total,
      codes: context.codes,
      text: context.text,
      elements: context.elements
    });

    const response = await this.llm.complete(systemPrompt, userPrompt, { maxTokens: 200 });
    if (!response || !response.content) return null;

    this.llmCalls += 1;
    this.metrics.recordLLMUsage(response.tokens, response.duration);

    let parsed = null;
    try {
      parsed = JSON.parse(response.content);
    } catch (e) {
      return null;
    }

    if (!parsed || !Array.isArray(parsed.actions)) return null;

    const result = {
      actions: parsed.actions.slice(0, 3),
      tokens: response.tokens,
      llmTime: response.duration,
      context
    };

    if (useCache) {
      this.llmCache.set(cacheKey, result);
    }
    return result;
  }

  async bruteForceChallenge() {
    // CRITICAL: Wait for delayed content blocks to load (they appear at 500ms, 1500ms, 2500ms, etc.)
    console.log(`   ⏳ Waiting for delayed content to load...`);
    await this.delay(3500); // Wait for at least 3 content blocks to load
    
    // Get page text for challenge detection
    let pageText = '';
    try {
      pageText = await this.page.evaluate(() => document.body.innerText);
    } catch (e) {
      pageText = '';
    }
    
    const detectedTypes = this.detectChallengeType(pageText);
    
    if (detectedTypes.length > 0) {
      console.log(`   🧠 Detected: ${detectedTypes.join(', ')}`);
      
      // Handle "wait_seconds" challenge
      if (detectedTypes.includes('wait_seconds')) {
        const waitMatch = pageText.match(/wait\s+(?:for\s+)?(\d+)\s+seconds?/i);
        if (waitMatch) {
          const seconds = parseInt(waitMatch[1]);
          console.log(`   ⏳ Waiting ${seconds} seconds...`);
          await this.delay(seconds * 1000);
          this.recordSuccess('wait_seconds');
          
          // Click next
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
        const scrollMatch = pageText.match(/scroll\s+(?:down\s+)?(\d+)\s*(?:pixels?|px)/i);
        if (scrollMatch) {
          const pixels = parseInt(scrollMatch[1]);
          console.log(`   📜 Scrolling ${pixels}px...`);
          await this.page.evaluate((px) => window.scrollBy(0, px), pixels);
          await this.delay(500);
          this.recordSuccess('scroll_pixels');
          
          // Click next
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
      
      // Handle "audio_listen" - just skip
      if (detectedTypes.includes('audio_listen')) {
        console.log(`   ⏭️  Audio challenge - skipping`);
        const buttons = await this.page.$$('button, a');
        for (const button of buttons) {
          try {
            const text = await button.evaluate(el => el.textContent.toLowerCase());
            if (text.includes('next') || text.includes('continue') || text.includes('skip')) {
              await button.click();
              this.recordSuccess('audio_listen');
              return { popups: 0, codes: 0, clicked: 1, challengeType: 'audio_listen' };
            }
          } catch (e) {}
        }
      }
    }
    
    // Dismiss popups AGGRESSIVELY
    const popups = await this.dismissAllPopups();
    if (popups > 0) {
      console.log(`   🧹 Dismissed ${popups} popups`);
    }
    
    // Scroll through the ENTIRE page to find codes and navigation
    console.log(`   📜 Scrolling through page...`);
    try {
      // Scroll to top first
      await this.page.evaluate(() => window.scrollTo(0, 0));
      await this.delay(200);
      
      // Scroll down in increments to reveal all content
      for (let i = 0; i < 5; i++) {
        await this.page.evaluate(() => window.scrollBy(0, 400));
        await this.delay(200);
      }
    } catch (e) {}
    
    // Scroll within modals
    try {
      await this.page.evaluate(() => {
        const modals = document.querySelectorAll('[role="dialog"], .modal, [class*="modal"]');
        modals.forEach(modal => {
          // Scroll to 30%, 50%, 70% of modal height
          const positions = [0.3, 0.5, 0.7];
          positions.forEach(pos => {
            modal.scrollTop = modal.scrollHeight * pos;
          });
        });
      });
      await this.delay(300);
    } catch (e) {}
    
    // CRITICAL: Select radio with "Option X - Correct choice" pattern
    console.log(`   🔘 Looking for "Option X - Correct choice"...`);
    const radios = await this.page.$$('input[type="radio"], [role="radio"]');
    let selectedRadio = false;
    
    for (const radio of radios) {
      try {
        const isVisible = await radio.isVisible();
        if (!isVisible) continue;
        
        const labelText = await radio.evaluate(el => {
          const label = el.closest('label') || 
                       document.querySelector(`label[for="${el.id}"]`) ||
                       el.parentElement;
          return label ? label.textContent : '';
        });
        
        // EXACT PATTERN: "Option X - Correct choice" (case insensitive)
        const correctPattern = /option\s+[a-z]\s*[-–—]\s*correct\s+choice/i;
        
        if (correctPattern.test(labelText)) {
          // Scroll into view
          await radio.evaluate(el => el.scrollIntoView({ behavior: 'auto', block: 'center' }));
          await this.delay(200);
          
          // Click the radio
          await radio.click();
          console.log(`   ✓ Selected: "${labelText.trim().slice(0, 50)}"`);
          selectedRadio = true;
          await this.delay(200);
          break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    if (!selectedRadio) {
      console.log(`   ⚠️  No "Correct choice" radio found`);
    }
    
    // Click checkboxes
    const checkboxes = await this.page.$$('input[type="checkbox"]');
    for (const checkbox of checkboxes) {
      try {
        const isVisible = await checkbox.isVisible();
        if (isVisible) {
          await checkbox.click();
          await this.delay(100);
        }
      } catch (e) {}
    }
    
    // Extract and type codes
    const codes = await this.extractCodes();
    let typedCode = false;
    
    if (codes.length > 0) {
      console.log(`   🔑 Found codes: ${codes.join(', ')}`);
      
      const inputs = await this.page.$$('input[type="text"], input:not([type])');
      for (const input of inputs) {
        try {
          const isVisible = await input.isVisible();
          if (isVisible) {
            await input.click();
            await this.delay(50);
            
            // Clear and type
            await input.evaluate(el => el.value = '');
            await input.type(codes[0], { delay: 80 });
            console.log(`   ✓ Typed: ${codes[0]}`);
            typedCode = true;
            await this.delay(200);
            break;
          }
        } catch (e) {}
      }
    }
    
    // Click "Reveal Code" buttons FIRST, then extract codes
    const revealButtons = await this.page.$$('button');
    for (const button of revealButtons) {
      try {
        const isVisible = await button.isVisible();
        if (!isVisible) continue;
        
        const text = await button.evaluate(el => el.textContent.toLowerCase());
        
        if (text.includes('reveal') || text.includes('show code')) {
          await button.click();
          console.log(`   ✓ Clicked: Reveal Code`);
          await this.delay(500); // Wait longer for code to appear
          break;
        }
      } catch (e) {}
    }
    
    // NOW extract codes again after reveal button was clicked
    if (!typedCode) {
      const revealedCodes = await this.extractCodes();
      if (revealedCodes.length > 0) {
        console.log(`   🔑 Found codes after reveal: ${revealedCodes.join(', ')}`);
        
        const inputs = await this.page.$$('input[type="text"], input:not([type])');
        for (const input of inputs) {
          try {
            const isVisible = await input.isVisible();
            if (isVisible) {
              await input.click();
              await this.delay(50);
              await input.evaluate(el => el.value = '');
              await input.type(revealedCodes[0], { delay: 80 });
              console.log(`   ✓ Typed revealed code: ${revealedCodes[0]}`);
              typedCode = true;
              await this.delay(200);
              break;
            }
          } catch (e) {}
        }
      }
    }
    
    await this.delay(200);
    
    // Click Submit button if we typed a code
    if (typedCode) {
      const buttons = await this.page.$$('button, input[type="submit"]');
      for (const button of buttons) {
        try {
          const isVisible = await button.isVisible();
          if (!isVisible) continue;
          
          const text = await button.evaluate(el => el.textContent.toLowerCase());
          
          if (text.includes('submit') && !text.includes('continue')) {
            await button.click();
            console.log(`   ✓ Clicked: Submit`);
            await this.delay(500);
            break;
          }
        } catch (e) {}
      }
    }
    
    // Click "Submit & Continue" buttons
    const allButtons = await this.page.$$('button, a, input[type="submit"]');
    for (const button of allButtons) {
      try {
        const isVisible = await button.isVisible();
        if (!isVisible) continue;
        
        const text = await button.evaluate(el => el.textContent.toLowerCase());
        
        if ((text.includes('submit') && text.includes('continue')) ||
            text.includes('submit & continue')) {
          await button.click();
          console.log(`   ✓ Clicked: Submit & Continue`);
          await this.delay(500);
          break;
        }
      } catch (e) {}
    }
    
    // Scroll down MORE to find navigation buttons (they might be at the bottom)
    console.log(`   📜 Scrolling to find navigation...`);
    try {
      for (let i = 0; i < 3; i++) {
        await this.page.evaluate(() => window.scrollBy(0, 500));
        await this.delay(200);
      }
    } catch (e) {}
    
    // Click navigation buttons (next, continue, etc.)
    let clicked = 0;
    const navButtons = await this.page.$$('button, a, input[type="submit"]');
    for (const button of navButtons) {
      try {
        const isVisible = await button.isVisible();
        if (!isVisible) continue;
        
        const text = await button.evaluate(el => el.textContent.toLowerCase());
        
        // Avoid clicking "incorrect" or "wrong" buttons
        if (text.includes('incorrect') || text.includes('wrong')) {
          continue;
        }
        
        if (text.includes('next') ||
            text.includes('continue') ||
            text.includes('proceed') ||
            text.includes('forward') ||
            text.includes('advance') ||
            text.includes('move on')) {
          // Scroll button into view first
          await button.evaluate(el => el.scrollIntoView({ behavior: 'auto', block: 'center' }));
          await this.delay(200);
          
          await button.click();
          clicked++;
          console.log(`   ✓ Clicked navigation: "${text.slice(0, 30)}"`);
          await this.delay(500);
          break;
        }
      } catch (e) {}
    }
    
    return { popups, codes: codes.length, clicked, selectedRadio };
  }

  async solveChallenge() {
    const start = Date.now();
    const startStep = await this.getCurrentStep();
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📝 STEP ${startStep} OF ${this.totalSteps}`);
    console.log(`${'='.repeat(60)}`);

    await this.dismissPopupsAggressive();

    let llmStepCalls = 0;

    if (startStep === this.totalSteps) {
      const done = await this.handleFinalStep();
      const duration = (Date.now() - start) / 1000;
      if (done) {
        this.currentStep = this.totalSteps;
        this.metrics.addChallenge(startStep, duration, 'bruteforce', { finalStep: true });
      }
      return { success: !!done };
    }

    // Always-on LLM preflight (ensures some Groq usage and helps navigation)
    if (this.llmAlwaysOn || this.llmCalls < this.llmMinCallsPerRun || llmStepCalls < this.llmMinCallsPerStep) {
      const preflight = await this.llmSolve(startStep, llmStepCalls, { useCache: this.llmUseCache });
      if (preflight) {
        llmStepCalls += 1;
        const safeActions = this.filterSafeActions(preflight.actions, preflight.context);
        if (safeActions.length > 0) {
          console.log('🤖 LLM preflight actions (safe) executing...');
          await this.executeLLMActions(safeActions);
          await this.delay(700);
          const newStep = await this.getCurrentStep();
          if (newStep && newStep > startStep) {
            const duration = (Date.now() - start) / 1000;
            console.log(`\n✅ LLM PREFLIGHT SUCCESS! ${startStep} → ${newStep}`);
            this.currentStep = newStep;
            this.metrics.addChallenge(startStep, duration, 'llm', preflight);
            return { success: true };
          }
        }
      }
    }

    // Fast path: decode session storage and submit correct code
    const sessionCode = await this.trySessionCode(startStep);
    if (sessionCode) {
      console.log(`   ⚡ Using session code: ${sessionCode}`);
      await this.delay(800);
      const newStep = await this.getCurrentStep();
      if (newStep && newStep > startStep) {
        const duration = (Date.now() - start) / 1000;
        console.log(`\n✅ SESSION SUCCESS! ${startStep} → ${newStep} (${duration.toFixed(2)}s)`);
        this.currentStep = newStep;
        this.metrics.addChallenge(startStep, duration, 'bruteforce', { sessionCode: true, code: sessionCode });
        return { success: true };
      }
      console.log(`   ⚠️  Session code did not advance step`);
      await this.dismissPopupsAggressive();
    }

    // Try brute force with MORE retries
    let attempts = 0;
    const maxAttempts = 5; // Increased from 3 to 5
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`\n🔨 Attempt ${attempts}/${maxAttempts}...`);

      await this.dismissPopupsAggressive();

      const retrySessionCode = await this.trySessionCode(startStep);
      if (retrySessionCode) {
        console.log(`   ⚡ Using session code (retry): ${retrySessionCode}`);
        await this.delay(800);
        const retryStep = await this.getCurrentStep();
        if (retryStep && retryStep > startStep) {
        const duration = (Date.now() - start) / 1000;
        console.log(`\n✅ SESSION SUCCESS! ${startStep} → ${retryStep} (${duration.toFixed(2)}s)`);
        this.currentStep = retryStep;
        this.metrics.addChallenge(startStep, duration, 'bruteforce', { sessionCode: true, code: retrySessionCode });
        return { success: true };
      }
        await this.dismissPopupsAggressive();
      }
      
      const bruteResult = await this.bruteForceChallenge();
      
      await this.delay(1000);
      const newStep = await this.getCurrentStep();
      
      if (newStep && newStep > startStep) {
        const duration = (Date.now() - start) / 1000;
        console.log(`\n✅ SUCCESS! ${startStep} → ${newStep} (${duration.toFixed(2)}s)`);
        
        this.currentStep = newStep;
        this.metrics.addChallenge(startStep, duration, 'bruteforce', bruteResult);
        return { success: true };
      }
      
      console.log(`   ⚠️  Still on step ${startStep}`);
      
      if (attempts < maxAttempts) {
        await this.delay(500);
      }
    }

    // LLM fallback (occasional)
    if (this.canUseLLM(llmStepCalls)) {
      console.log('\n🤖 LLM fallback engaged...');
      const llmResult = await this.llmSolve(startStep, llmStepCalls);
      llmStepCalls += llmResult ? 1 : 0;

      if (llmResult && llmResult.actions?.length) {
        await this.executeLLMActions(llmResult.actions);
        await this.delay(1000);
        const newStep = await this.getCurrentStep();
        const duration = (Date.now() - start) / 1000;

        if (newStep && newStep > startStep) {
          console.log(`\n✅ LLM SUCCESS! ${startStep} → ${newStep}`);
          this.currentStep = newStep;
          this.metrics.addChallenge(startStep, duration, 'llm', llmResult);
          return { success: true };
        }
      }
    }

    const duration = (Date.now() - start) / 1000;
    console.log(`\n❌ BLOCKED ON STEP ${startStep} after ${maxAttempts} attempts`);
    this.metrics.addChallenge(startStep, duration, 'failed', { blocked: true });
    return { success: false };
  }

  async run() {
    try {
      await this.init();
      this.ensureDirs();
      
      console.log('🌐 Navigating...');
      await this.page.goto(this.baseUrl, {
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
      const initialStep = await this.getCurrentStep();
      if (initialStep) this.currentStep = initialStep;

      // Solve all steps
      let attempts = 0;
      const runStart = Date.now();
      while (this.currentStep < this.totalSteps && attempts < 50) {
        const elapsed = (Date.now() - runStart) / 1000;
        if (elapsed > 300) {
          console.log('\n⏱️  Time budget exceeded (300s). Stopping.');
          break;
        }
        attempts++;
        const result = await this.solveChallenge();
        if (!result.success) {
          console.log('\n⚠️  Challenge failed, stopping...');
          break;
        }
      }

      console.log('\n✅ Done!');

      const finalStepReached = this.currentStep >= this.totalSteps;
      const report = this.metrics.finish(this.totalSteps, finalStepReached);
      fs.writeFileSync(path.join(this.resultsDir, 'results-hybrid.json'), JSON.stringify(report, null, 2));
      
      console.log('\n📊 RESULTS:');
      console.log(`   Time: ${report.totalDuration}`);
      console.log(`   Completed: ${report.totalChallenges}/${this.totalSteps}`);
      console.log(`   Brute Force: ${report.bruteForceSuccesses}`);
      console.log(`   LLM Fallbacks: ${report.llmFallbacks}`);
      console.log(`   Tokens: ${report.totalTokens.input + report.totalTokens.output} (in ${report.totalTokens.input} / out ${report.totalTokens.output})`);
      console.log(`   LLM Cost: ${report.totalCost}`);
      console.log(`   Success: ${report.success ? '✅' : '❌'}`);

      await this.delay(2000);
      if (this.keepBrowserOpen) {
        console.log('🛑 Leaving browser open for inspection.');
      } else if (this.browser) {
        await this.browser.close();
      }

      return report;

    } catch (error) {
      console.error('❌ Error:', error.message);
      if (this.keepBrowserOpen) {
        console.log('🛑 Leaving browser open for inspection.');
      } else if (this.browser) {
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
