package com.meetos.android.analysis

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull

/**
 * Structured extraction: prompt, lenient validation, grounding and merging.
 * Mirrors packages/shared (schemas.ts, prompts.ts, analysis.ts, linking.ts).
 *
 * On Android, Firebase AI Logic's on-device structured output requires
 * KSP-generated @Generable classes; we instead constrain the output with the
 * prompt and validate it strictly on the client (same contract as the web).
 */
object Extraction {

    // ------------------------------------------------------------ output shape

    data class RawTopic(val name: String, val evidence: String)
    data class RawDecision(val title: String, val description: String, val evidence: String, val certainty: String, val madeBy: List<String>, val alternatives: List<String>)
    data class RawCommitment(val description: String, val owner: String, val deadline: String, val evidence: String, val priority: String)
    data class RawQuestion(val text: String, val askedBy: String, val evidence: String)
    data class RawRisk(val description: String, val kind: String, val evidence: String)
    data class RawUpdate(val ref: String, val kind: String, val evidence: String, val newDeadline: String)

    data class ChunkOutput(
        val summary: String,
        val topics: List<RawTopic>,
        val decisions: List<RawDecision>,
        val commitments: List<RawCommitment>,
        val questions: List<RawQuestion>,
        val risks: List<RawRisk>,
        val followUps: List<String>,
        val updates: List<RawUpdate>,
    )

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }

    /** Tolerates code fences / leading prose. Throws if there is no JSON object at all. */
    fun parseJsonObject(text: String): JsonObject {
        val t = text.trim()
        runCatching { return json.parseToJsonElement(t) as JsonObject }
        Regex("```(?:json)?\\s*([\\s\\S]*?)```", RegexOption.IGNORE_CASE).find(t)?.let { m ->
            runCatching { return json.parseToJsonElement(m.groupValues[1]) as JsonObject }
        }
        val start = t.indexOf('{'); val end = t.lastIndexOf('}')
        if (start >= 0 && end > start) return json.parseToJsonElement(t.substring(start, end + 1)) as JsonObject
        throw IllegalArgumentException("Model response was not valid JSON.")
    }

    private fun JsonElement?.str(): String = ((this as? JsonPrimitive)?.contentOrNull ?: "").trim()
    private fun JsonElement?.strList(): List<String> = (this as? JsonArray)?.mapNotNull { (it as? JsonPrimitive)?.contentOrNull?.trim()?.takeIf(String::isNotEmpty) } ?: emptyList()
    private fun JsonObject.objs(key: String, max: Int): List<JsonObject> = (this[key] as? JsonArray)?.filterIsInstance<JsonObject>()?.take(max) ?: emptyList()
    private fun enumOr(v: String, allowed: Set<String>, fallback: String) = if (v in allowed) v else fallback

    fun validate(text: String): ChunkOutput {
        val o = parseJsonObject(text)
        return ChunkOutput(
            summary = o["summary"].str(),
            topics = o.objs("topics", 8).map { RawTopic(it["name"].str(), it["evidence"].str()) },
            decisions = o.objs("decisions", 10).map {
                RawDecision(it["title"].str(), it["description"].str(), it["evidence"].str(),
                    enumOr(it["certainty"].str(), setOf("explicit", "tentative"), "tentative"), it["madeBy"].strList(), it["alternatives"].strList())
            },
            commitments = o.objs("commitments", 15).map {
                RawCommitment(it["description"].str(), it["owner"].str(), it["deadline"].str(), it["evidence"].str(),
                    enumOr(it["priority"].str(), setOf("low", "medium", "high"), "medium"))
            },
            questions = o.objs("questions", 10).map { RawQuestion(it["text"].str(), it["askedBy"].str(), it["evidence"].str()) },
            risks = o.objs("risks", 10).map { RawRisk(it["description"].str(), enumOr(it["kind"].str(), setOf("risk", "blocker"), "risk"), it["evidence"].str()) },
            followUps = o["followUps"].strList().take(8),
            updates = o.objs("updates", 15).map {
                RawUpdate(it["ref"].str(), enumOr(it["kind"].str(), setOf("progress", "blocker", "completion_claim", "deadline_change", "mention"), "mention"),
                    it["evidence"].str(), it["newDeadline"].str())
            },
        )
    }

    // ------------------------------------------------------------ prompt

    data class Candidate(val ref: String, val commitmentId: String, val description: String, val ownerName: String?, val deadlineText: String?)

    fun buildPrompt(chunk: String, meetingTitle: String, meetingDate: String, participants: List<String>, index: Int, count: Int, candidates: List<Candidate>): String {
        val earlier = if (candidates.isEmpty()) "" else buildString {
            append("\nEARLIER commitments from previous meetings (only reference them in \"updates\" if this excerpt clearly talks about them):\n")
            candidates.forEach { c ->
                append("${c.ref}: ${c.description}")
                c.ownerName?.let { append(" (owner: $it)") }
                c.deadlineText?.let { append(" (due: $it)") }
                append('\n')
            }
            append("updates.kind: \"progress\", \"blocker\", \"completion_claim\" (someone says it is done), \"deadline_change\", \"mention\".\n")
        }
        return """You extract structured information from a meeting transcript excerpt.
Meeting: "$meetingTitle" on $meetingDate.${if (participants.isNotEmpty()) " Participants: ${participants.joinToString(", ")}." else ""}
This is part ${index + 1} of $count.
Rules:
- Use ONLY what is said in the excerpt. Never invent people, dates, decisions or tasks.
- "evidence" must be copied word-for-word from the excerpt (one sentence is enough).
- A commitment is a promise by a specific person to do something.
- "owner" is the person who promised, or "" if unclear. "deadline" is the deadline words exactly as spoken, or "".
- A decision is something the group agreed. Use certainty "tentative" if it was not clearly agreed.
- Return empty arrays when nothing applies. Keep text short.
$earlier
Return ONLY a JSON object with exactly these keys:
{"summary":"","topics":[{"name":"","evidence":""}],"decisions":[{"title":"","description":"","evidence":"","certainty":"explicit|tentative","madeBy":[],"alternatives":[]}],"commitments":[{"description":"","owner":"","deadline":"","evidence":"","priority":"low|medium|high"}],"questions":[{"text":"","askedBy":"","evidence":""}],"risks":[{"description":"","kind":"risk|blocker","evidence":""}],"followUps":[],"updates":[{"ref":"C1","kind":"mention","evidence":"","newDeadline":""}]}

TRANSCRIPT EXCERPT:
${"\"\"\""}
$chunk
${"\"\"\""}"""
    }

    // ------------------------------------------------------------ linking

    interface Linkable {
        val linkId: String
        val linkDescription: String
        val linkOwner: String?
        val linkDeadlineText: String?
        val linkActive: Boolean
    }

    fun selectCandidates(chunk: String, open: List<Linkable>, k: Int = 6, minScore: Double = 0.34): List<Candidate> =
        open.filter { it.linkActive }
            .map { c ->
                var score = Text.containment(c.linkDescription, chunk)
                c.linkOwner?.let { o -> if (Text.containsWord(chunk, o) || Text.containsWord(chunk, o.split(" ").first())) score += 0.15 }
                c to score
            }
            .filter { it.second >= minScore }
            .sortedByDescending { it.second }
            .take(k)
            .mapIndexed { i, (c, _) -> Candidate("C${i + 1}", c.linkId, c.linkDescription, c.linkOwner, c.linkDeadlineText) }

    fun matchExisting(description: String, owner: String?, existing: List<Linkable>): String? {
        val nk = Text.personKey(owner)
        return existing.filter { it.linkActive }
            .filter { e ->
                val ek = Text.personKey(e.linkOwner)
                nk == null || ek == null || nk == ek || nk.split(" ").first() == ek.split(" ").first()
            }
            .map { it to Text.taskSimilarity(description, it.linkDescription) }
            .filter { it.second >= 0.6 }
            .maxByOrNull { it.second }?.first?.linkId
    }

    // ------------------------------------------------------------ grounding + merge

    data class GDecision(val title: String, val description: String, val evidence: Grounding.Quote, val explicit: Boolean, val madeBy: List<String>, val alternatives: List<String>)
    data class GCommitment(val description: String, val ownerName: String?, val deadline: Long?, val deadlineText: String?, val priority: String, val evidence: Grounding.Quote)
    data class GQuestion(val text: String, val askedBy: String?, val evidence: Grounding.Quote)
    data class GRisk(val description: String, val kind: String, val evidence: Grounding.Quote)
    data class GUpdate(val commitmentId: String, val kind: String, val evidence: Grounding.Quote, val newDeadline: Long?, val newDeadlineText: String?)

    data class Processed(
        val summary: String,
        val topics: List<RawTopic>,
        val decisions: List<GDecision>,
        val commitments: List<GCommitment>,
        val questions: List<GQuestion>,
        val risks: List<GRisk>,
        val followUps: List<String>,
        val updates: List<GUpdate>,
        val discarded: Int,
    )

    fun process(raw: ChunkOutput, chunk: String, knownNames: List<String>, meetingDate: Long, refMap: Map<String, String>): Processed {
        var discarded = 0
        fun ground(q: String) = Grounding.groundQuote(q, chunk).also { if (it == null) discarded++ }

        val decisions = raw.decisions.filter { it.title.isNotBlank() }.mapNotNull { d ->
            val g = ground(d.evidence) ?: return@mapNotNull null
            GDecision(d.title, d.description.ifBlank { d.title }, g, d.certainty == "explicit",
                d.madeBy.mapNotNull { Grounding.resolveOwner(it, knownNames, chunk, g.speaker) }, d.alternatives)
        }
        val commitments = raw.commitments.filter { it.description.isNotBlank() }.mapNotNull { c ->
            val g = ground(c.evidence) ?: return@mapNotNull null
            val dl = Grounding.resolveDeadline(c.deadline, meetingDate, chunk)
            GCommitment(c.description, Grounding.resolveOwner(c.owner, knownNames, chunk, g.speaker), dl.at, dl.text, c.priority, g)
        }
        val questions = raw.questions.filter { it.text.isNotBlank() }.mapNotNull { q ->
            val g = ground(q.evidence) ?: return@mapNotNull null
            GQuestion(q.text, Grounding.resolveOwner(q.askedBy, knownNames, chunk, g.speaker) ?: g.speaker, g)
        }
        val risks = raw.risks.filter { it.description.isNotBlank() }.mapNotNull { r ->
            val g = ground(r.evidence) ?: return@mapNotNull null
            GRisk(r.description, r.kind, g)
        }
        val updates = raw.updates.mapNotNull { u ->
            val id = refMap[u.ref.trim().uppercase()] ?: run { discarded++; return@mapNotNull null }
            val g = ground(u.evidence) ?: return@mapNotNull null
            val dl = if (u.kind == "deadline_change") Grounding.resolveDeadline(u.newDeadline, meetingDate, chunk) else Grounding.Deadline(null, null)
            GUpdate(id, if (u.kind == "deadline_change" && dl.at == null) "mention" else u.kind, g, dl.at, dl.text)
        }
        val topics = raw.topics.filter { it.name.isNotBlank() && (Grounding.groundQuote(it.evidence, chunk) != null || Text.containment(it.name, chunk) >= 0.5) }
        return Processed(raw.summary, topics, decisions, commitments, questions, risks, raw.followUps, updates, discarded)
    }

    data class Merged(
        val summaries: List<String>,
        val topics: List<RawTopic>,
        val decisions: List<GDecision>,
        val commitments: List<GCommitment>,
        val questions: List<GQuestion>,
        val risks: List<GRisk>,
        val followUps: List<String>,
        val updates: List<GUpdate>,
        val discarded: Int,
    )

    private fun <T> dedupe(items: List<T>, text: (T) -> String, threshold: Double): List<T> {
        val out = mutableListOf<T>()
        for (i in items) if (out.none { Text.similarity(text(it), text(i)) >= threshold }) out += i
        return out
    }

    private val RANK = mapOf("completion_claim" to 5, "deadline_change" to 4, "blocker" to 3, "progress" to 2, "mention" to 1)

    fun merge(chunks: List<Processed>, existing: List<Linkable>): Merged {
        val commitments = mutableListOf<GCommitment>()
        for (c in chunks.flatMap { it.commitments }) {
            val i = commitments.indexOfFirst { o ->
                val sameOwner = o.ownerName == null || c.ownerName == null || Text.normalize(o.ownerName) == Text.normalize(c.ownerName)
                sameOwner && (Text.normalize(o.evidence.quote) == Text.normalize(c.evidence.quote) || Text.taskSimilarity(o.description, c.description) >= 0.6)
            }
            if (i < 0) commitments += c
            else {
                val o = commitments[i]
                commitments[i] = o.copy(
                    ownerName = o.ownerName ?: c.ownerName,
                    deadline = o.deadline ?: c.deadline,
                    deadlineText = o.deadlineText ?: c.deadlineText,
                    priority = if (o.priority == "high" || c.priority == "high") "high" else o.priority,
                )
            }
        }
        val updates = chunks.flatMap { it.updates }.toMutableList()
        val fresh = commitments.filter { c ->
            val match = matchExisting(c.description, c.ownerName, existing)
            if (match != null) updates += GUpdate(match, if (c.deadline != null) "deadline_change" else "mention", c.evidence, c.deadline, c.deadlineText)
            match == null
        }
        val best = LinkedHashMap<String, GUpdate>()
        for (u in updates) {
            val key = "${u.commitmentId}:${u.kind}"
            val prev = best[key]
            if (prev == null || (RANK[u.kind] ?: 0) > (RANK[prev.kind] ?: 0)) best[key] = u
        }
        return Merged(
            summaries = chunks.map { it.summary }.filter { it.isNotBlank() },
            topics = dedupe(chunks.flatMap { it.topics }, { it.name }, 0.6).take(12),
            decisions = dedupe(chunks.flatMap { it.decisions }, { "${it.title} ${it.description}" }, 0.55),
            commitments = fresh,
            questions = dedupe(chunks.flatMap { it.questions }, { it.text }, 0.6),
            risks = dedupe(chunks.flatMap { it.risks }, { it.description }, 0.6),
            followUps = chunks.flatMap { it.followUps }.distinctBy { Text.normalize(it) }.take(10),
            updates = best.values.toList(),
            discarded = chunks.sumOf { it.discarded },
        )
    }

    /** Memory answer output: {"found":bool,"answer":"","citations":[]} */
    data class MemoryAnswer(val found: Boolean, val answer: String, val citations: List<String>)

    fun validateMemoryAnswer(text: String): MemoryAnswer {
        val o = parseJsonObject(text)
        return MemoryAnswer((o["found"] as? JsonPrimitive)?.booleanOrNull ?: false, o["answer"].str(), o["citations"].strList())
    }
}
