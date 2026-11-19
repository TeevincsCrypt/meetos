package com.meetos.android.analysis

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AnalysisTest {
    private val zone = ZoneId.of("UTC")
    // Wednesday 2026-11-04 10:00 UTC
    private val meetingDate = LocalDate.of(2026, 11, 4).atTime(10, 0).atZone(zone).toInstant().toEpochMilli()

    private val kickoff = """
        Maya Chen: Okay, let's get started.
        Daniel Okafor: I'll finish the landing page before Friday. That includes the hero section, pricing table and the signup form.
        Priya Raman: I'll send the final onboarding mockups to Daniel by Wednesday so he isn't blocked.
        Maya Chen: I'll chase the payment provider for the API keys tomorrow.
        Leo Martins: I'll draft the waitlist announcement email by next Tuesday and share it in the channel.
        Maya Chen: Then let's agree: the beta launches two weeks from Monday, and it goes to the waitlist first, not a public launch.
    """.trimIndent()

    private fun day(ms: Long) = Instant.ofEpochMilli(ms).atZone(zone).toLocalDate()

    @Test fun parsesSpeakers() {
        assertEquals(listOf("Maya Chen", "Daniel Okafor", "Priya Raman", "Leo Martins"), Transcript.speakers(kickoff))
        assertEquals("Maya", Transcript.parseLine("[00:01:02] Maya: hi", 0).speaker)
        assertNull(Transcript.parseLine("just text", 0).speaker)
    }

    @Test fun chunksAreBoundedAndCoverAllLines() {
        val long = (0 until 200).joinToString("\n") { "Speaker ${it % 3}: line number $it with some words in it." }
        val chunks = Transcript.chunk(long, maxChars = 800)
        assertTrue(chunks.size > 5)
        chunks.forEach { assertTrue(it.text.length <= 800) }
        assertEquals(199, chunks.last().endLine)
    }

    @Test fun groundsExactAndFuzzyQuotesAndRejectsInventions() {
        val exact = Grounding.groundQuote("I'll finish the landing page before Friday.", kickoff)
        assertNotNull(exact); assertTrue(exact!!.exact); assertEquals("Daniel Okafor", exact.speaker)
        val fuzzy = Grounding.groundQuote("I will send the final onboarding mockups to Daniel by Wednesday", kickoff)
        assertNotNull(fuzzy); assertFalse(fuzzy!!.exact)
        assertNull(Grounding.groundQuote("We agreed to hire three engineers next quarter.", kickoff))
    }

    @Test fun resolvesOwnersOnlyToRealPeople() {
        val known = listOf("Maya Chen", "Daniel Okafor")
        assertEquals("Daniel Okafor", Grounding.resolveOwner("Daniel", known, kickoff, null))
        assertEquals("Maya Chen", Grounding.resolveOwner("I", known, kickoff, "Maya Chen"))
        assertEquals("Leo Martins", Grounding.resolveOwner("Leo Martins", known, kickoff, null))
        assertNull(Grounding.resolveOwner("Jessica", known, kickoff, null))
        assertNull(Grounding.resolveOwner("team", known, kickoff, null))
    }

    @Test fun resolvesSpokenDeadlines() {
        val fri = Grounding.resolveDeadline("before Friday", meetingDate, kickoff, zone)
        assertEquals(DayOfWeek.FRIDAY, day(fri.at!!).dayOfWeek)
        val tue = Grounding.resolveDeadline("by next Tuesday", meetingDate, kickoff, zone)
        assertEquals(DayOfWeek.TUESDAY, day(tue.at!!).dayOfWeek)
        assertTrue(tue.at!! > meetingDate)
        assertEquals(LocalDate.of(2026, 11, 5), day(Grounding.resolveDeadline("tomorrow", meetingDate, kickoff, zone).at!!))
        assertNull(Grounding.resolveDeadline("December 31", meetingDate, kickoff, zone).at)
    }

    @Test fun validatesLenientlyAndProcessesChunk() {
        val text = """Sure! ```json
        {"summary":"Planning","commitments":[
          {"description":"Finish the landing page","owner":"Daniel","deadline":"before Friday","evidence":"I'll finish the landing page before Friday.","priority":"urgent"},
          {"description":"Chase API keys","owner":"I","deadline":"tomorrow","evidence":"I'll chase the payment provider for the API keys tomorrow.","priority":"medium"},
          {"description":"Hire a designer","owner":"Maya","deadline":"","evidence":"Maya will hire a designer.","priority":"low"}],
         "decisions":[{"title":"Waitlist first","description":"","evidence":"it goes to the waitlist first, not a public launch","certainty":"explicit","madeBy":["Maya","The CEO"],"alternatives":["Public launch"]}],
         "updates":[{"ref":"C7","kind":"mention","evidence":"x","newDeadline":""}]}
        ```"""
        val raw = Extraction.validate(text)
        assertEquals("medium", raw.commitments[0].priority)
        val p = Extraction.process(raw, kickoff, listOf("Maya Chen", "Daniel Okafor"), meetingDate, emptyMap())
        assertEquals(2, p.commitments.size)
        assertEquals("Daniel Okafor", p.commitments[0].ownerName)
        assertEquals("Maya Chen", p.commitments[1].ownerName)
        assertEquals(listOf("Maya Chen"), p.decisions.single().madeBy)
        assertEquals(2, p.discarded) // invented commitment + unknown ref
    }

    private data class L(override val linkId: String, override val linkDescription: String, override val linkOwner: String?) : Extraction.Linkable {
        override val linkDeadlineText: String? = null
        override val linkActive = true
    }

    @Test fun linksFollowUpMeetingToEarlierCommitments() {
        val sync = """
            Daniel Okafor: The landing page is mostly there, but the authentication section of the signup form is still incomplete.
            Daniel Okafor: I need more time on the landing page, I'll have it finished by next Wednesday instead.
            Priya Raman: The onboarding mockups are done, I sent them to Daniel on Tuesday.
        """.trimIndent()
        val open = listOf(
            L("landing", "Finish the landing page", "Daniel Okafor"),
            L("mockups", "Send final onboarding mockups to Daniel", "Priya Raman"),
            L("lease", "Renew office lease", "Sam Lee"),
        )
        val cands = Extraction.selectCandidates(sync, open)
        val ids = cands.map { it.commitmentId }
        assertTrue("landing" in ids && "mockups" in ids)
        assertFalse("lease" in ids)
        val refMap = cands.associate { it.ref to it.commitmentId }
        val landingRef = cands.first { it.commitmentId == "landing" }.ref
        val raw = Extraction.validate("""{"updates":[{"ref":"$landingRef","kind":"deadline_change","evidence":"I'll have it finished by next Wednesday instead.","newDeadline":"by next Wednesday"}]}""")
        val p = Extraction.process(raw, sync, emptyList(), meetingDate, refMap)
        assertEquals("landing", p.updates.single().commitmentId)
        assertEquals(DayOfWeek.WEDNESDAY, day(p.updates.single().newDeadline!!).dayOfWeek)

        val merged = Extraction.merge(listOf(p, p), open)
        assertEquals(1, merged.updates.size)
        assertEquals("landing", Extraction.matchExisting("finish the landing page", "Daniel", open))
        assertNull(Extraction.matchExisting("finish the landing page", "Priya Raman", open))
    }

    @Test fun memoryAnswerValidation() {
        val a = Extraction.validateMemoryAnswer("""{"found":true,"answer":"Price is ${'$'}24 [S1]","citations":["S1"]}""")
        assertTrue(a.found); assertEquals(listOf("S1"), a.citations)
    }
}
