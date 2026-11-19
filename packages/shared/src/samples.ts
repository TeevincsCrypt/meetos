/**
 * SAMPLE DATA — fictional transcripts for demos and tests.
 *
 * These are clearly labelled as samples everywhere they surface in the UI
 * (meetings created from them carry `isSample: true` and a "Sample" badge).
 * They are written so that the second meeting refers back to commitments
 * made in the first, which demonstrates Commitment Graph linking.
 */

export interface SampleMeeting {
  key: 'kickoff' | 'sync';
  title: string;
  description: string;
  participants: string[];
  /** Days relative to "now" when the sample is loaded. */
  dayOffset: number;
  transcript: string;
}

export const SAMPLE_KICKOFF: SampleMeeting = {
  key: 'kickoff',
  title: 'Beta launch planning (sample)',
  description: 'SAMPLE DATA — fictional kickoff meeting for the Lumen beta launch.',
  participants: ['Maya Chen', 'Daniel Okafor', 'Priya Raman', 'Leo Martins'],
  dayOffset: -9,
  transcript: `Maya Chen: Okay, let's get started. The goal today is to lock the plan for the Lumen beta launch.
Maya Chen: First topic is timing. Are we still comfortable launching the beta two weeks from Monday?
Daniel Okafor: Engineering-wise yes, as long as the landing page and signup flow are done in time.
Leo Martins: Marketing needs about a week of lead time for the waitlist emails.
Maya Chen: Then let's agree: the beta launches two weeks from Monday, and it goes to the waitlist first, not a public launch.
Priya Raman: Agreed. A public launch would be too much support load for us right now.
Daniel Okafor: Agreed from my side too.
Maya Chen: Great, that's decided. Second topic, the landing page.
Daniel Okafor: I'll finish the landing page before Friday. That includes the hero section, pricing table and the signup form.
Priya Raman: I'll send the final onboarding mockups to Daniel by Wednesday so he isn't blocked.
Daniel Okafor: Perfect. One blocker though: we still don't have production API keys from the payment provider, so checkout can't be tested end to end.
Maya Chen: I'll chase the payment provider for the API keys tomorrow.
Maya Chen: Next, pricing. We discussed nineteen dollars versus twenty-nine dollars per seat.
Leo Martins: I think nineteen is easier for small teams to say yes to.
Maya Chen: Let's go with nineteen dollars per seat for the beta and revisit after we have usage data.
Priya Raman: Makes sense to me.
Leo Martins: I'll draft the waitlist announcement email by next Tuesday and share it in the channel.
Maya Chen: Last thing. Do we need SOC 2 before the enterprise pilot with Northwind, or can that wait until after the beta?
Daniel Okafor: I honestly don't know. We should ask their security team.
Maya Chen: Okay, let's leave that open for now. Thanks everyone.`,
};

export const SAMPLE_SYNC: SampleMeeting = {
  key: 'sync',
  title: 'Beta launch weekly sync (sample)',
  description: 'SAMPLE DATA — fictional follow-up meeting one week after the kickoff.',
  participants: ['Maya Chen', 'Daniel Okafor', 'Priya Raman', 'Leo Martins'],
  dayOffset: -2,
  transcript: `Maya Chen: Welcome back. Let's go through what we committed to last week.
Maya Chen: Daniel, how is the landing page going?
Daniel Okafor: The landing page is mostly there, but the authentication section of the signup form is still incomplete.
Daniel Okafor: I need more time on the landing page, I'll have it finished by next Wednesday instead.
Maya Chen: Okay, next Wednesday works as long as it's ready before the waitlist emails go out.
Priya Raman: The onboarding mockups are done, I sent them to Daniel on Tuesday.
Daniel Okafor: Yes, I got them, they look great.
Maya Chen: I did chase the payment provider. We got sandbox keys, but production API keys are still pending, so checkout is still blocked.
Leo Martins: The waitlist announcement email is drafted. I'll share it for review tomorrow.
Maya Chen: On pricing, after talking to three design partners, I think we should change the beta price to twenty-four dollars per seat instead of nineteen.
Leo Martins: I'm fine with twenty-four if we give waitlist users a founding discount.
Priya Raman: Same here.
Maya Chen: Then we're changing it: beta pricing is twenty-four dollars per seat with a founding discount for waitlist users.
Maya Chen: Priya, can you update the pricing table design by Friday?
Priya Raman: Yes, I'll update the pricing table design by Friday.
Leo Martins: Did anyone hear back from Northwind about SOC 2?
Maya Chen: Not yet. That question is still open.
Maya Chen: Okay, that's it for today. Thanks all.`,
};

export const SAMPLE_MEETINGS: SampleMeeting[] = [SAMPLE_KICKOFF, SAMPLE_SYNC];
