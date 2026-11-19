package com.meetos.android.data

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentSnapshot
import com.meetos.android.model.AnalysisRun
import com.meetos.android.model.Commitment
import com.meetos.android.model.CommitmentEvent
import com.meetos.android.model.CommitmentStatus
import com.meetos.android.model.Decision
import com.meetos.android.model.DecisionStatus
import com.meetos.android.model.Evidence
import com.meetos.android.model.InferenceSourceLabel
import com.meetos.android.model.Meeting
import com.meetos.android.model.Participant
import com.meetos.android.model.Priority
import com.meetos.android.model.Question
import com.meetos.android.model.Risk
import com.meetos.android.model.Topic
import com.meetos.android.model.Workspace
import java.util.Date

/** Firestore <-> domain mapping. Field names match the web app exactly. */

internal fun Any?.millis(): Long? = when (this) {
    is Timestamp -> toDate().time
    is Date -> time
    is Number -> toLong()
    else -> null
}

@Suppress("UNCHECKED_CAST")
internal fun Any?.maps(): List<Map<String, Any?>> = (this as? List<*>)?.mapNotNull { it as? Map<String, Any?> } ?: emptyList()
internal fun Any?.strings(): List<String> = (this as? List<*>)?.mapNotNull { it as? String } ?: emptyList()
internal fun Map<String, Any?>.s(k: String): String? = this[k] as? String

internal fun Map<String, Any?>.toEvidence() = Evidence(
    meetingId = s("meetingId") ?: "",
    meetingTitle = s("meetingTitle"),
    quote = s("quote") ?: "",
    speaker = s("speaker"),
)

fun Evidence.toMap(): Map<String, Any?> = mapOf("meetingId" to meetingId, "meetingTitle" to meetingTitle, "quote" to quote, "speaker" to speaker)

fun ts(ms: Long?): Timestamp? = ms?.let { Timestamp(Date(it)) }

fun DocumentSnapshot.toWorkspace() = Workspace(
    id = id,
    name = getString("name") ?: "",
    description = getString("description") ?: "",
    ownerId = getString("ownerId") ?: "",
    roles = (get("roles") as? Map<*, *>)?.entries?.associate { it.key.toString() to it.value.toString() } ?: emptyMap(),
    memberIds = get("memberIds").strings(),
    isDemo = getBoolean("isDemo") ?: false,
)

fun DocumentSnapshot.toMeeting(): Meeting {
    @Suppress("UNCHECKED_CAST")
    val a = get("analysis") as? Map<String, Any?>
    return Meeting(
        id = id,
        workspaceId = getString("workspaceId") ?: "",
        title = getString("title") ?: "Untitled meeting",
        description = getString("description") ?: "",
        projectId = getString("projectId"),
        participants = get("participants").maps().map { Participant(it.s("name") ?: "", it.s("email"), it.s("uid")) },
        scheduledAt = get("scheduledAt").millis(),
        startedAt = get("startedAt").millis(),
        status = getString("status") ?: "scheduled",
        archived = getBoolean("archived") ?: false,
        transcriptSource = getString("transcriptSource"),
        transcriptChars = (get("transcriptChars") as? Number)?.toInt() ?: 0,
        summary = getString("summary") ?: "",
        topics = get("topics").maps().map { Topic(it.s("name") ?: "", it.s("evidence") ?: "") },
        discussionPoints = get("discussionPoints").strings(),
        risks = get("risks").maps().map {
            @Suppress("UNCHECKED_CAST")
            Risk(it.s("description") ?: "", it.s("kind") ?: "risk", ((it["evidence"] as? Map<String, Any?>) ?: emptyMap()).toEvidence())
        },
        followUps = get("followUps").strings(),
        analysis = a?.let {
            AnalysisRun(
                status = it.s("status") ?: "",
                chunkCount = (it["chunkCount"] as? Number)?.toInt() ?: 0,
                chunksOnDevice = (it["chunksOnDevice"] as? Number)?.toInt() ?: 0,
                chunksInCloud = (it["chunksInCloud"] as? Number)?.toInt() ?: 0,
                chunksCloudFallback = (it["chunksCloudFallback"] as? Number)?.toInt() ?: 0,
                chunksFailed = (it["chunksFailed"] as? Number)?.toInt() ?: 0,
                discardedUngrounded = (it["discardedUngrounded"] as? Number)?.toInt() ?: 0,
                error = it.s("error"),
            )
        },
        isSample = getBoolean("isSample") ?: false,
        createdAt = get("createdAt").millis() ?: 0L,
        createdBy = getString("createdBy") ?: "",
    )
}

fun DocumentSnapshot.toCommitment(): Commitment {
    @Suppress("UNCHECKED_CAST")
    val completion = get("completion") as? Map<String, Any?>
    @Suppress("UNCHECKED_CAST")
    val pending = (get("pendingCompletion") as? Map<String, Any?>)?.get("evidence") as? Map<String, Any?>
    return Commitment(
        id = id,
        description = getString("description") ?: "",
        ownerName = getString("ownerName"),
        deadline = get("deadline").millis(),
        deadlineText = getString("deadlineText"),
        originalDeadline = get("originalDeadline").millis(),
        deadlineChangeCount = (get("deadlineChangeCount") as? Number)?.toInt() ?: 0,
        priority = Priority.from(getString("priority")),
        status = CommitmentStatus.from(getString("status")),
        originMeetingId = getString("originMeetingId") ?: "",
        originMeetingTitle = getString("originMeetingTitle") ?: "",
        relatedMeetingIds = get("relatedMeetingIds").strings(),
        meetingIds = get("meetingIds").strings(),
        evidence = get("evidence").maps().map { it.toEvidence() },
        projectId = getString("projectId"),
        createdAt = get("createdAt").millis() ?: 0L,
        completedAt = get("completedAt").millis(),
        completedByName = completion?.s("confirmedByName"),
        pendingCompletion = pending?.toEvidence(),
        lastMentionedAt = get("lastMentionedAt").millis(),
        origin = getString("origin") ?: "manual",
        inferenceSource = InferenceSourceLabel.from(getString("inferenceSource")),
        createdBy = getString("createdBy") ?: "",
    )
}

fun DocumentSnapshot.toEvent() = CommitmentEvent(
    id = id,
    type = getString("type") ?: "note",
    at = get("at").millis() ?: 0L,
    byName = getString("byName"),
    meetingId = getString("meetingId"),
    meetingTitle = getString("meetingTitle"),
    quote = getString("quote"),
    from = getString("from"),
    to = getString("to"),
    note = getString("note"),
    origin = getString("origin") ?: "ai",
)

fun DocumentSnapshot.toDecision() = Decision(
    id = id,
    title = getString("title") ?: "",
    description = getString("description") ?: "",
    meetingId = getString("meetingId") ?: "",
    meetingTitle = getString("meetingTitle") ?: "",
    decidedAt = get("decidedAt").millis() ?: 0L,
    participants = get("participants").strings(),
    evidence = get("evidence").maps().map { it.toEvidence() },
    alternatives = get("alternatives").strings(),
    status = DecisionStatus.from(getString("status")),
    confirmedByName = getString("confirmedByName"),
    origin = getString("origin") ?: "manual",
    inferenceSource = InferenceSourceLabel.from(getString("inferenceSource")),
)

fun DocumentSnapshot.toQuestion() = Question(
    id = id,
    text = getString("text") ?: "",
    askedBy = getString("askedBy"),
    meetingId = getString("meetingId") ?: "",
    meetingTitle = getString("meetingTitle") ?: "",
    status = getString("status") ?: "open",
    createdAt = get("createdAt").millis() ?: 0L,
)
