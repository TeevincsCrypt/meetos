package com.meetos.android.data

/**
 * SAMPLE DATA — fictional transcripts, generated from packages/shared/src/samples.ts
 * — keep the two in sync. Always labelled as samples in the UI.
 */
object Samples {
    data class Sample(val title: String, val description: String, val participants: List<String>, val dayOffset: Int, val transcript: String)

    val KICKOFF = Sample(
        title = "Beta launch planning (sample)",
        description = "SAMPLE DATA — fictional kickoff meeting for the Lumen beta launch.",
        participants = listOf("Maya Chen", "Daniel Okafor", "Priya Raman", "Leo Martins"),
        dayOffset = -9,
        transcript = "Maya Chen: Okay, let's get started. The goal today is to lock the plan for the Lumen beta launch.\nMaya Chen: First topic is timing. Are we still comfortable launching the beta two weeks from Monday?\nDaniel Okafor: Engineering-wise yes, as long as the landing page and signup flow are done in time.\nLeo Martins: Marketing needs about a week of lead time for the waitlist emails.\nMaya Chen: Then let's agree: the beta launches two weeks from Monday, and it goes to the waitlist first, not a public launch.\nPriya Raman: Agreed. A public launch would be too much support load for us right now.\nDaniel Okafor: Agreed from my side too.\nMaya Chen: Great, that's decided. Second topic, the landing page.\nDaniel Okafor: I'll finish the landing page before Friday. That includes the hero section, pricing table and the signup form.\nPriya Raman: I'll send the final onboarding mockups to Daniel by Wednesday so he isn't blocked.\nDaniel Okafor: Perfect. One blocker though: we still don't have production API keys from the payment provider, so checkout can't be tested end to end.\nMaya Chen: I'll chase the payment provider for the API keys tomorrow.\nMaya Chen: Next, pricing. We discussed nineteen dollars versus twenty-nine dollars per seat.\nLeo Martins: I think nineteen is easier for small teams to say yes to.\nMaya Chen: Let's go with nineteen dollars per seat for the beta and revisit after we have usage data.\nPriya Raman: Makes sense to me.\nLeo Martins: I'll draft the waitlist announcement email by next Tuesday and share it in the channel.\nMaya Chen: Last thing. Do we need SOC 2 before the enterprise pilot with Northwind, or can that wait until after the beta?\nDaniel Okafor: I honestly don't know. We should ask their security team.\nMaya Chen: Okay, let's leave that open for now. Thanks everyone.",
    )

    val SYNC = Sample(
        title = "Beta launch weekly sync (sample)",
        description = "SAMPLE DATA — fictional follow-up meeting one week after the kickoff.",
        participants = listOf("Maya Chen", "Daniel Okafor", "Priya Raman", "Leo Martins"),
        dayOffset = -2,
        transcript = "Maya Chen: Welcome back. Let's go through what we committed to last week.\nMaya Chen: Daniel, how is the landing page going?\nDaniel Okafor: The landing page is mostly there, but the authentication section of the signup form is still incomplete.\nDaniel Okafor: I need more time on the landing page, I'll have it finished by next Wednesday instead.\nMaya Chen: Okay, next Wednesday works as long as it's ready before the waitlist emails go out.\nPriya Raman: The onboarding mockups are done, I sent them to Daniel on Tuesday.\nDaniel Okafor: Yes, I got them, they look great.\nMaya Chen: I did chase the payment provider. We got sandbox keys, but production API keys are still pending, so checkout is still blocked.\nLeo Martins: The waitlist announcement email is drafted. I'll share it for review tomorrow.\nMaya Chen: On pricing, after talking to three design partners, I think we should change the beta price to twenty-four dollars per seat instead of nineteen.\nLeo Martins: I'm fine with twenty-four if we give waitlist users a founding discount.\nPriya Raman: Same here.\nMaya Chen: Then we're changing it: beta pricing is twenty-four dollars per seat with a founding discount for waitlist users.\nMaya Chen: Priya, can you update the pricing table design by Friday?\nPriya Raman: Yes, I'll update the pricing table design by Friday.\nLeo Martins: Did anyone hear back from Northwind about SOC 2?\nMaya Chen: Not yet. That question is still open.\nMaya Chen: Okay, that's it for today. Thanks all.",
    )

    val ALL = listOf(KICKOFF, SYNC)
}
