const fs = require('fs');

class MemoryManager {
  constructor(memoryFile = 'challenge-memory.json') {
    this.memoryFile = memoryFile;
    this.memory = this.load();
  }
  
  load() {
    try {
      const data = fs.readFileSync(this.memoryFile, 'utf8');
      return JSON.parse(data);
    } catch (e) {
      console.log('⚠️  No memory file found, using defaults');
      return { challengePatterns: {} };
    }
  }
  
  save() {
    this.memory.lastUpdated = new Date().toISOString();
    fs.writeFileSync(this.memoryFile, JSON.stringify(this.memory, null, 2));
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
      this.save();
    }
  }
  
  getPattern(challengeType) {
    return this.memory.challengePatterns[challengeType];
  }
}

module.exports = MemoryManager;