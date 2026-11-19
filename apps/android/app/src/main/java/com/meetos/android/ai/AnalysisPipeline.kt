package com.meetos.android.ai

import android.content.Context
import com.google.firebase.Firebase
import com.google.firebase.remoteconfig.remoteConfig
import com.meetos.android.analysis.Extraction
import com.meetos.android.analysis.Transcript
import com.meetos.android.data.Actor
import com.meetos.android.data.MeetosRepository
import com.meetos.android.model.Commitment
import com.meetos.android.model.Decision
import com.meetos.android.model.InferenceSourceLabel
import com.meetos.android.model.Meeting
import java.text.DateFormat
import java.util.Date

/**
 * Meeting analysis on Android — same pipeline as the web app:
 * chunk -> retrieve linked commitments -> hybrid inference -> validate ->
 * ground -> merge -> persist to the Commitment Graph.
 */
object AnalysisPipeline {
    data class ChunkState(val index: Int, val chars: Int, val state: String, val source: InferenceSourceLabel?, val detail: String)
    data class Outcome(val commitments: Int, val decisions: Int, val questions: Int, val linked: Int, val discarded: Int)

    private class Link(val c: Commitment) : Extraction.Linkable {
        override val linkId = c.id
        override val linkDescription = c.description
        override val linkOwner = c.ownerName
        override val linkDeadlineText = c.deadlineText
        override val linkActive = c.status.isActive
    }

    suspend fun run(
        context: Context, wid: String, actor: Actor, meeting: Meeting, transcript: String,
        commitments: List<Commitment>, decisions: List<Decision>, onProgress: (List<ChunkState>) -> Unit,
    ): Outcome {
        require(transcript.isNotBlank()) { "This meeting has no transcript yet." }
        val startedAt = System.currentTimeMillis()
        val maxChars = Firebase.remoteConfig.getLong("ai_chunk_chars").toInt().takeIf { it > 0 } ?: Transcript.DEFAULT_CHUNK_CHARS
        val chunks = Transcript.chunk(transcript, maxChars)
        val states = chunks.map { ChunkState(it.index, it.text.length, "pending", null, "") }.toMutableList()
        onProgress(states.toList())
        MeetosRepository.patchMeeting(wid, meeting.id, mapOf("status" to "analyzing"))

        val known = (meeting.participants.map { it.name } + Transcript.speakers(transcript)).distinct()
        val earlier = commitments.filter { it.originMeetingId != meeting.id && it.status.isActive }.map { Link(it) }
        val processed = mutableListOf<Extraction.Processed>()
        val sources = mutableListOf<InferenceSourceLabel>()
        var lastError: String? = null

        for (chunk in chunks) {
            states[chunk.index] = states[chunk.index].copy(state = "running")
            onProgress(states.toList())
            val candidates = Extraction.selectCandidates(chunk.text, earlier)
            try {
                val prompt = Extraction.buildPrompt(chunk.text, meeting.title, DateFormat.getDateInstance().format(Date(meeting.date)), known,
                    chunk.index, chunks.size, candidates)
                val r = HybridAi.run(context, prompt, HybridAi.Kind.EXTRACT) { Extraction.validate(it) }
                processed += Extraction.process(r.data, chunk.text, known, meeting.date, candidates.associate { it.ref to it.commitmentId })
                sources += r.source
                states[chunk.index] = states[chunk.index].copy(state = "done", source = r.source, detail = r.detail)
            } catch (e: Exception) {
                lastError = e.message
                states[chunk.index] = states[chunk.index].copy(state = "failed", detail = e.message ?: "Failed")
                if (e is HybridAi.UnavailableException) break
            }
            onProgress(states.toList())
        }

        if (processed.isEmpty()) {
            MeetosRepository.patchMeeting(wid, meeting.id, mapOf("status" to "analysis_failed"))
            throw IllegalStateException(lastError ?: "Analysis failed.")
        }

        val merged = Extraction.merge(processed, earlier)
        val failed = states.count { it.state == "failed" }
        val run = MeetosRepository.RunSummary(
            status = if (failed > 0) "partial" else "succeeded", chunkCount = chunks.size,
            onDevice = sources.count { it == InferenceSourceLabel.ON_DEVICE }, inCloud = sources.count { it == InferenceSourceLabel.IN_CLOUD },
            fallback = sources.count { it == InferenceSourceLabel.CLOUD_FALLBACK }, failed = failed, discarded = merged.discarded,
            preference = HybridAi.preference(context).wire,
            cloudModel = if (sources.any { it != InferenceSourceLabel.ON_DEVICE }) Firebase.remoteConfig.getString("ai_cloud_model") else null,
            error = if (failed > 0) lastError else null, startedAt = startedAt,
        )
        // The majority source labels the extracted items; per-chunk sources are kept in the run summary.
        val dominant = sources.groupingBy { it }.eachCount().maxByOrNull { it.value }?.key ?: InferenceSourceLabel.IN_CLOUD
        val linked = MeetosRepository.persistAnalysis(wid, actor, meeting, merged, run, merged.summaries.joinToString(" "),
            mapOf("extract" to dominant), commitments, decisions)
        return Outcome(merged.commitments.size, merged.decisions.size, merged.questions.size, linked, merged.discarded)
    }
}
