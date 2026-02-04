const puppeteer = require('puppeteer');
const fs = require('fs');

class ChallengeMetrics {
  constructor() {
    this.startTime = Date.now();
    this.challenges = [];
    this.totalClicks = 0;
    this.totalScrolls = 0;
  }

  addChallenge(challengeNum, duration, actions) {
    this.challenges.push({
      challenge: challengeNum,
      duration,
      actions
    });
  }

  finish() {
    this.endTime = Date.now();
    this.totalDuration = (this.endTime - this.startTime) / 1000;
    return this.getReport();
  }

  getReport() {
    return {
      totalDuration: `${this.totalDuration.toFixed(2)} seconds`,
      totalChallenges: this.challenges.length,
      totalClicks: this.totalClicks,
      totalScrolls: this.totalScrolls,
      averageTimePerChallenge: `${(this.totalDuration / this.challenges.length).toFixed(2)} seconds`,
      challenges: this.challenges,
      success: this.challenges.length === 30,
      timestamp: new Date().toISOString()
    };
  }
}

class BrowserChallengeAgent {
  constructor() {
    this.metrics = new ChallengeMetrics();
    this.currentChallenge = 0;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async init() {
    console.log('🚀 Launching browser...');
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: { width: 1280, height: 800 },
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
    
    // Set faster timeouts
    this.page.setDefaultTimeout(5000);
    this.page.setDefaultNavigationTimeout(10000);
  }

  async clickAllMatching(selectors) {
    let clicked = 0;
    for (const selector of selectors) {
      try {
        const elements = await this.page.$$(selector);
        for (const element of elements) {
          try {
            const isVisible = await element.isVisible();
            if (isVisible) {
              await element.click({ delay: 10 });
              clicked++;
              await this.delay(50);
            }
          } catch (e) {
            // Element might be gone or not clickable, continue
          }
        }
      } catch (e) {
        // Selector might not exist, continue
      }
    }
    return clicked;
  }

  async dismissAllModals() {
    let totalClicked = 0;
    
    // Multiple passes to handle layered modals
    for (let pass = 0; pass < 3; pass++) {
      // Find all buttons and click those with dismiss/close text
      const buttons = await this.page.$$('button');
      for (const button of buttons) {
        try {
          const text = await button.evaluate(el => el.textContent.toLowerCase());
          const isVisible = await button.isVisible();
          if (isVisible && (
            text.includes('dismiss') || 
            text.includes('close') || 
            text.includes('accept') || 
            text.includes('decline') ||
            text.includes('ok')
          )) {
            await button.click({ delay: 10 });
            totalClicked++;
            await this.delay(50);
          }
        } catch (e) {
          // Element might be gone, continue
        }
      }
      
      // Also try class-based selectors
      const classSelectors = [
        '[class*="close"]',
        '[class*="dismiss"]',
        '.modal button',
        '[role="dialog"] button'
      ];
      
      for (const selector of classSelectors) {
        try {
          const elements = await this.page.$$(selector);
          for (const element of elements) {
            try {
              const isVisible = await element.isVisible();
              if (isVisible) {
                await element.click({ delay: 10 });
                totalClicked++;
                await this.delay(50);
              }
            } catch (e) {
              // Continue
            }
          }
        } catch (e) {
          // Continue
        }
      }
      
      if (totalClicked === 0) break;
      await this.delay(100);
    }

    this.metrics.totalClicks += totalClicked;
    return totalClicked;
  }

  async scrollAndSearch() {
    // Scroll down to reveal content
    const scrollAmount = 500;
    let scrolled = 0;
    
    for (let i = 0; i < 10; i++) {
      await this.page.evaluate((amount) => {
        window.scrollBy(0, amount);
      }, scrollAmount);
      scrolled++;
      await this.delay(100);
      
      // Check if we found navigation elements
      const hasNav = await this.hasNavigationElements();
      if (hasNav) break;
    }
    
    this.metrics.totalScrolls += scrolled;
    return scrolled;
  }

  async hasNavigationElements() {
    try {
      // Check for buttons with navigation text
      const buttons = await this.page.$$('button, a, input[type="submit"]');
      for (const button of buttons) {
        try {
          const text = await button.evaluate(el => el.textContent.toLowerCase());
          const isVisible = await button.isVisible();
          if (isVisible && (
            text.includes('next') ||
            text.includes('continue') ||
            text.includes('submit') ||
            text.includes('proceed') ||
            text.includes('forward') ||
            text.includes('advance')
          )) {
            return true;
          }
        } catch (e) {
          // Continue
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  async clickNavigation() {
    // Find all clickable elements
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
          text.includes('advance') ||
          text.includes('go ')
        )) {
          await element.click();
          this.metrics.totalClicks++;
          await this.delay(200);
          return true;
        }
      } catch (e) {
        // Try next element
      }
    }
    
    // Also try class-based navigation
    const classSelectors = [
      'button[class*="next"]',
      'button[class*="continue"]',
      'button[class*="submit"]'
    ];
    
    for (const selector of classSelectors) {
      try {
        const element = await this.page.$(selector);
        if (element) {
          const isVisible = await element.isVisible();
          if (isVisible) {
            await element.click();
            this.metrics.totalClicks++;
            await this.delay(200);
            return true;
          }
        }
      } catch (e) {
        // Try next selector
      }
    }
    
    return false;
  }

  async fillForms() {
    try {
      // Fill any text inputs with dummy data
      const inputs = await this.page.$$('input[type="text"], input:not([type])');
      for (const input of inputs) {
        try {
          const isVisible = await input.isVisible();
          if (isVisible) {
            await input.type('TEST123', { delay: 10 });
          }
        } catch (e) {
          // Continue
        }
      }
    } catch (e) {
      // No forms to fill
    }
  }

  async getCurrentChallengeNumber() {
    try {
      const text = await this.page.evaluate(() => document.body.innerText);
      const match = text.match(/Step (\d+) of 30/);
      if (match) {
        return parseInt(match[1]);
      }
    } catch (e) {
      // Can't determine
    }
    return null;
  }

  async solveChallenge() {
    const challengeStart = Date.now();
    let actions = 0;

    console.log(`\n📝 Solving Challenge ${this.currentChallenge + 1}...`);

    // Strategy: Brute force everything
    for (let attempt = 0; attempt < 5; attempt++) {
      // 1. Dismiss all modals aggressively
      const dismissed = await this.dismissAllModals();
      actions += dismissed;
      if (dismissed > 0) {
        console.log(`   ✓ Dismissed ${dismissed} modals`);
      }

      // 2. Fill any forms
      await this.fillForms();

      // 3. Scroll to find navigation
      const scrolled = await this.scrollAndSearch();
      if (scrolled > 0) {
        console.log(`   ✓ Scrolled ${scrolled} times`);
      }

      // 4. Try to click navigation
      const navigated = await this.clickNavigation();
      if (navigated) {
        console.log(`   ✓ Clicked navigation button`);
        await this.delay(500);
        
        // Check if we advanced
        const newChallenge = await this.getCurrentChallengeNumber();
        if (newChallenge && newChallenge > this.currentChallenge + 1) {
          this.currentChallenge = newChallenge - 1;
          break;
        } else {
          this.currentChallenge++;
          break;
        }
      }

      await this.delay(200);
    }

    const duration = (Date.now() - challengeStart) / 1000;
    this.metrics.addChallenge(this.currentChallenge, duration, actions);
    console.log(`   ⏱️  Completed in ${duration.toFixed(2)}s`);
  }

  async run() {
    try {
      await this.init();

      console.log('🌐 Navigating to challenge website...');
      await this.page.goto('https://serene-frangipane-7fd25b.netlify.app', {
        waitUntil: 'networkidle0'
      });

      console.log('▶️  Starting challenges...\n');

      // Click START button
      const startButton = await this.page.evaluateHandle(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        return buttons.find(btn => btn.textContent.includes('START'));
      });
      if (startButton) {
        await startButton.click();
      }
      await this.delay(500);

      // Solve all 30 challenges
      while (this.currentChallenge < 30) {
        await this.solveChallenge();
        
        // Safety check - if we're stuck, try harder
        const currentNum = await this.getCurrentChallengeNumber();
        if (currentNum && currentNum === this.currentChallenge + 1) {
          // We're stuck, try clicking everything
          console.log('   ⚠️  Stuck, trying aggressive clicking...');
          await this.clickAllMatching(['button', 'a', 'input[type="submit"]']);
          await this.delay(500);
        }
      }

      console.log('\n✅ All 30 challenges completed!');

      // Save metrics
      const report = this.metrics.finish();
      fs.writeFileSync('results.json', JSON.stringify(report, null, 2));
      
      console.log('\n📊 FINAL RESULTS:');
      console.log(`   Total Time: ${report.totalDuration}`);
      console.log(`   Total Clicks: ${report.totalClicks}`);
      console.log(`   Total Scrolls: ${report.totalScrolls}`);
      console.log(`   Average per Challenge: ${report.averageTimePerChallenge}`);
      console.log(`   Success: ${report.success ? '✅ YES' : '❌ NO'}`);
      console.log('\n📄 Detailed results saved to results.json');

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

// Run the agent
(async () => {
  const agent = new BrowserChallengeAgent();
  await agent.run();
})();