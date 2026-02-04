class LLMClient {
  constructor({ endpoint, apiKey, model, timeoutMs = 2000 }) {
    this.endpoint = endpoint;
    this.apiKey = apiKey;
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  isEnabled() {
    return !!(this.endpoint && this.apiKey && this.model);
  }

  async complete(systemPrompt, userPrompt, { maxTokens = 200 } = {}) {
    if (!this.isEnabled()) return null;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const start = Date.now();

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
          temperature: 0,
          max_tokens: maxTokens,
          response_format: { type: 'json_object' }
        }),
        signal: controller.signal
      });

      clearTimeout(timeout);

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const duration = (Date.now() - start) / 1000;

      return {
        content: data.choices?.[0]?.message?.content || '',
        tokens: {
          input: data.usage?.prompt_tokens || 0,
          output: data.usage?.completion_tokens || 0
        },
        duration
      };
    } catch (e) {
      clearTimeout(timeout);
      return null;
    }
  }
}

module.exports = LLMClient;
