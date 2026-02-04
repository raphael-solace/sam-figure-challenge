class ScrollingHelper {
  constructor(page) {
    this.page = page;
  }
  
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  async scrollModals() {
    console.log('   🔍 Looking for scrollable modals...');
    
    const scrollResult = await this.page.evaluate(() => {
      const results = [];
      
      // Find modals specifically
      const modals = document.querySelectorAll('[role="dialog"], .modal, [class*="modal"]');
      
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
    
    return scrollResult;
  }
  
  async scrollWithMouseWheel() {
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
  }
  
  async scrollWithKeyboard() {
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
  }
  
  async scrollPage() {
    await this.page.evaluate(() => window.scrollBy(0, 500));
    await this.delay(200);
  }
}

module.exports = ScrollingHelper;