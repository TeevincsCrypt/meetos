/**
 * TEST DOUBLE for Chrome's built-in `LanguageModel` (Prompt API).
 *
 * Headless Chromium has no on-device model, so tests install this stub with
 * `page.addInitScript`. The real Firebase AI Logic SDK still does all the
 * work: it detects `window.LanguageModel`, checks availability, routes
 * PREFER_ON_DEVICE requests to it with our JSON-schema `responseConstraint`,
 * and reports `inferenceSource: "on_device"`. The stub only plays the model,
 * returning canned JSON for the fictional sample transcripts — including one
 * deliberately hallucinated item that the grounding step must discard.
 */
export function installFakeLanguageModel() {
  type Content = { role: string; content: { type: string; value: string }[] };
  const calls: { kind: string; hasConstraint: boolean }[] = [];
  (window as unknown as { __lmCalls: typeof calls }).__lmCalls = calls;

  const refFor = (prompt: string, keyword: string) => {
    const m = prompt.split('\n').find((l) => /^C\d+: /.test(l) && l.toLowerCase().includes(keyword));
    return m ? m.split(':')[0] : 'C99';
  };

  function respond(prompt: string): { kind: string; json: unknown } {
    if (prompt.includes('You extract structured information')) {
      if (prompt.includes("I'll finish the landing page before Friday.")) {
        return {
          kind: 'extract-kickoff',
          json: {
            summary: 'The team agreed to launch the beta to the waitlist and set beta pricing at nineteen dollars per seat.',
            topics: [
              { name: 'Beta timing', evidence: 'Are we still comfortable launching the beta two weeks from Monday?' },
              { name: 'Pricing', evidence: 'We discussed nineteen dollars versus twenty-nine dollars per seat.' },
            ],
            decisions: [
              { title: 'Beta launches to the waitlist first', description: 'The beta launches two weeks from Monday, to the waitlist only.', evidence: 'the beta launches two weeks from Monday, and it goes to the waitlist first, not a public launch', certainty: 'explicit', madeBy: ['Maya', 'Priya Raman', 'Daniel Okafor'], alternatives: ['Public launch'] },
              { title: 'Beta price is $19 per seat', description: 'Nineteen dollars per seat for the beta, revisit with usage data.', evidence: "Let's go with nineteen dollars per seat for the beta and revisit after we have usage data.", certainty: 'explicit', madeBy: ['Maya Chen'], alternatives: ['Twenty-nine dollars per seat'] },
            ],
            commitments: [
              { description: 'Finish the landing page', owner: 'Daniel Okafor', deadline: 'before Friday', evidence: "I'll finish the landing page before Friday.", priority: 'high' },
              { description: 'Send final onboarding mockups to Daniel', owner: 'Priya', deadline: 'by Wednesday', evidence: "I'll send the final onboarding mockups to Daniel by Wednesday so he isn't blocked.", priority: 'medium' },
              { description: 'Chase the payment provider for API keys', owner: 'I', deadline: 'tomorrow', evidence: "I'll chase the payment provider for the API keys tomorrow.", priority: 'medium' },
              { description: 'Draft the waitlist announcement email', owner: 'Leo Martins', deadline: 'by next Tuesday', evidence: "I'll draft the waitlist announcement email by next Tuesday and share it in the channel.", priority: 'medium' },
              { description: 'Hire a contract designer', owner: 'Maya Chen', deadline: 'next month', evidence: 'Maya will hire a contract designer next month.', priority: 'low' },
            ],
            questions: [{ text: 'Do we need SOC 2 before the Northwind enterprise pilot?', askedBy: 'Maya Chen', evidence: 'Do we need SOC 2 before the enterprise pilot with Northwind' }],
            risks: [{ description: 'No production API keys from the payment provider; checkout cannot be tested', kind: 'blocker', evidence: "we still don't have production API keys from the payment provider" }],
            followUps: ['Ask the Northwind security team about SOC 2'],
            updates: [],
          },
        };
      }
      if (prompt.includes('Welcome back.')) {
        return {
          kind: 'extract-sync',
          json: {
            summary: 'The landing page slipped to next Wednesday, mockups were delivered, and beta pricing changed to twenty-four dollars.',
            topics: [{ name: 'Pricing change', evidence: 'we should change the beta price to twenty-four dollars per seat instead of nineteen' }],
            decisions: [
              { title: 'Beta price changes to $24 per seat', description: 'Twenty-four dollars per seat with a founding discount for waitlist users.', evidence: "beta pricing is twenty-four dollars per seat with a founding discount for waitlist users", certainty: 'explicit', madeBy: ['Maya Chen', 'Leo Martins', 'Priya Raman'], alternatives: ['Keep nineteen dollars'] },
            ],
            commitments: [
              { description: 'Update the pricing table design', owner: 'Priya Raman', deadline: 'by Friday', evidence: "Yes, I'll update the pricing table design by Friday.", priority: 'medium' },
            ],
            questions: [],
            risks: [{ description: 'Production API keys still pending; checkout blocked', kind: 'blocker', evidence: 'production API keys are still pending, so checkout is still blocked' }],
            followUps: [],
            updates: [
              { ref: refFor(prompt, 'landing page'), kind: 'deadline_change', evidence: "I need more time on the landing page, I'll have it finished by next Wednesday instead.", newDeadline: 'by next Wednesday' },
              { ref: refFor(prompt, 'mockups'), kind: 'completion_claim', evidence: 'The onboarding mockups are done, I sent them to Daniel on Tuesday.', newDeadline: '' },
              { ref: refFor(prompt, 'waitlist announcement'), kind: 'progress', evidence: 'The waitlist announcement email is drafted.', newDeadline: '' },
            ],
          },
        };
      }
      return { kind: 'extract-other', json: { summary: '', topics: [], decisions: [], commitments: [], questions: [], risks: [], followUps: [], updates: [] } };
    }
    if (prompt.includes("team's meeting memory")) {
      const line = prompt.split('\n').find((l) => /^\[S\d+\]/.test(l) && /twenty-four|\$24/i.test(l)) ?? prompt.split('\n').find((l) => /^\[S\d+\]/.test(l) && /per seat/i.test(l));
      const id = line ? line.slice(1, line.indexOf(']')) : null;
      return {
        kind: 'memory',
        json: id ? { found: true, answer: `Beta pricing was changed to twenty-four dollars per seat [${id}].`, citations: [id] } : { found: false, answer: 'The sources do not say.', citations: [] },
      };
    }
    if (prompt.includes('prepare for their next meeting')) {
      return { kind: 'prep', json: { overview: 'Several commitments are still open.', agenda: [{ title: 'Landing page status', detail: 'Check the new deadline', minutes: 10, refs: ['C1'] }], followUpTopics: [] } };
    }
    if (prompt.includes('daily brief')) {
      return { kind: 'brief', json: { headline: 'Open commitments need attention.', bullets: [] } };
    }
    if (prompt.includes('You write meeting summaries')) {
      return { kind: 'summary', json: { summary: 'Combined summary.', discussionPoints: [] } };
    }
    return { kind: 'unknown', json: {} };
  }

  const LanguageModel = {
    availability: async () => 'available',
    params: async () => ({ defaultTopK: 3, maxTopK: 8, defaultTemperature: 1, maxTemperature: 2 }),
    create: async () => ({
      prompt: async (contents: Content[], options?: { responseConstraint?: object }) => {
        const text = contents.flatMap((c) => c.content.map((p) => p.value)).join('\n');
        const r = respond(text);
        calls.push({ kind: r.kind, hasConstraint: !!options?.responseConstraint });
        return JSON.stringify(r.json);
      },
      promptStreaming: () => {
        throw new Error('not implemented in test double');
      },
      destroy: () => undefined,
    }),
  };
  (window as unknown as { LanguageModel: typeof LanguageModel }).LanguageModel = LanguageModel;
}
