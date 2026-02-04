class InteractionHelper {
  constructor(page) {
    this.page = page;
  }
  
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
  
  async hoverElements(maxElements = 10) {
    const hoverElements = await this.page.$$('button, div, span, [data-hover], [class*="hover"]');
    for (const element of hoverElements.slice(0, maxElements)) {
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
  }
  
  async clickRevealButtons() {
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
          return true;
        }
      } catch (e) {
        // Continue
      }
    }
    return false;
  }
  
  async selectRadioButtons() {
    const radios = await this.page.$$('input[type="radio"], button[role="radio"]');
    let selectedRadio = false;
    
    // First pass: look for "correct choice" or "select me"
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
        
        if (labelText.includes('correct choice') || labelText.includes('select me') || labelText.includes('correct')) {
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
    
    return selectedRadio;
  }
  
  async clickCheckboxes() {
    const checkboxes = await this.page.$$('input[type="checkbox"]');
    let clicked = 0;
    
    for (const checkbox of checkboxes) {
      try {
        const isVisible = await checkbox.isVisible();
        if (isVisible) {
          await checkbox.click();
          clicked++;
          console.log(`   ✓ Checked checkbox`);
          await this.delay(100);
        }
      } catch (e) {
        // Continue
      }
    }
    
    return clicked;
  }
  
  async extractCodes() {
    return await this.page.evaluate(() => {
      const allText = document.body.innerText;
      const codeMatches = allText.match(/\b[A-Z0-9]{6}\b/g) || [];
      return [...new Set(codeMatches)];
    });
  }
  
  async typeCode(code) {
    const inputs = await this.page.$$('input[type="text"], input:not([type])');
    for (const input of inputs) {
      try {
        const isVisible = await input.isVisible();
        if (isVisible) {
          await input.click();
          await this.delay(50);
          
          await this.page.keyboard.down('Control');
          await this.page.keyboard.press('a');
          await this.page.keyboard.up('Control');
          await this.delay(50);
          
          await input.type(code, { delay: 50 });
          console.log(`   ✓ Typed code: ${code}`);
          return true;
        }
      } catch (e) {
        // Continue
      }
    }
    return false;
  }
  
  async clickNavigationButton() {
    const allButtons = await this.page.$$('button, a, input[type="submit"]');
    
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
          console.log(`   ✓ Clicked: "${text.slice(0, 30)}"`);
          await this.delay(300);
          return true;
        }
      } catch (e) {
        // Continue
      }
    }
    return false;
  }
}

module.exports = InteractionHelper;