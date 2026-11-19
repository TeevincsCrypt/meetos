package com.meetos.android.model

/**
 * MEETOS domain model — mirrors packages/shared/src/types.ts so the Android
 * app and the web app read and write the same Firestore documents.
 * Timestamps are epoch milliseconds in the domain model.
 */

enum class Role(val wire: String) {
    OWNER("owner"), ADMIN("admin"), MEMBER("member");
    companion object { fun from(v: String?) = entries.firstOrNull { it.wire == v } }
}

enum class CommitmentStatus(val wire: String, val label: String) {
    OPEN("open", "Open"),
    IN_PROGRESS("in_progress", "In progress"),
    COMPLETED("completed", "Completed"),
    BLOCKED("blocked", "Blocked"),
    CANCELLED("cancelled", "Cancelled");

    val isActive get() = this == OPEN || this == IN_PROGRESS || this == BLOCKED
    companion object { fun from(v: String?) = entries.firstOrNull { it.wire == v } ?: OPEN }
}

enum class Priority(val wire: String) {
    LOW("low"), MEDIUM("medium"), HIGH("high");
    companion object { fun from(v: String?) = entries.firstOrNull { it.wire == v } ?: MEDIUM }
}

enum class DecisionStatus(val wire: String, val label: String) {
    ACTIVE("active", "Active"),
    NEEDS_CONFIRMATION("needs_confirmation", "Needs confirmation"),
    SUPERSEDED("superseded", "Superseded"),
    REVERSED("reversed", "Reversed");
    companion object { fun from(v: String?) = entries.firstOrNull { it.wire == v } ?: ACTIVE }
}

/** Only ever set from the SDK-reported inference source. */
enum class InferenceSourceLabel(val wire: String, val label: String) {
    ON_DEVICE("on_device", "On this device"),
    IN_CLOUD("in_cloud", "In the cloud"),
    CLOUD_FALLBACK("cloud_fallback", "Cloud fallback");
    companion object { fun from(v: String?) = entries.firstOrNull { it.wire == v } }
}

data class Participant(val name: String, val email: String? = null, val uid: String? = null)

data class Evidence(
    val meetingId: String,
    val meetingTitle: String?,
    val quote: String,
    val speaker: String?,
)

data class Workspace(
    val id: String,
    val name: String,
    val description: String,
    val ownerId: String,
    val roles: Map<String, String>,
    val memberIds: List<String>,
    val isDemo: Boolean,
)

data class Topic(val name: String, val evidence: String)
data class Risk(val description: String, val kind: String, val evidence: Evidence)

data class AnalysisRun(
    val status: String,
    val chunkCount: Int,
    val chunksOnDevice: Int,
    val chunksInCloud: Int,
    val chunksCloudFallback: Int,
    val chunksFailed: Int,
    val discardedUngrounded: Int,
    val error: String?,
)

data class Meeting(
    val id: String,
    val workspaceId: String,
    val title: String,
    val description: String,
    val projectId: String?,
    val participants: List<Participant>,
    val scheduledAt: Long?,
    val startedAt: Long?,
    val status: String,
    val archived: Boolean,
    val transcriptSource: String?,
    val transcriptChars: Int,
    val summary: String,
    val topics: List<Topic>,
    val discussionPoints: List<String>,
    val risks: List<Risk>,
    val followUps: List<String>,
    val analysis: AnalysisRun?,
    val isSample: Boolean,
    val createdAt: Long,
    val createdBy: String,
) {
    val date: Long get() = startedAt ?: scheduledAt ?: createdAt
}

data class Commitment(
    val id: String,
    val description: String,
    val ownerName: String?,
    val deadline: Long?,
    val deadlineText: String?,
    val originalDeadline: Long?,
    val deadlineChangeCount: Int,
    val priority: Priority,
    val status: CommitmentStatus,
    val originMeetingId: String,
    val originMeetingTitle: String,
    val relatedMeetingIds: List<String>,
    val meetingIds: List<String>,
    val evidence: List<Evidence>,
    val projectId: String?,
    val createdAt: Long,
    val completedAt: Long?,
    val completedByName: String?,
    val pendingCompletion: Evidence?,
    val lastMentionedAt: Long?,
    val origin: String,
    val inferenceSource: InferenceSourceLabel?,
    val createdBy: String,
) {
    fun isOverdue(now: Long = System.currentTimeMillis()) = deadline != null && deadline < now && status.isActive
}

data class CommitmentEvent(
    val id: String,
    val type: String,
    val at: Long,
    val byName: String?,
    val meetingId: String?,
    val meetingTitle: String?,
    val quote: String?,
    val from: String?,
    val to: String?,
    val note: String?,
    val origin: String,
)

data class Decision(
    val id: String,
    val title: String,
    val description: String,
    val meetingId: String,
    val meetingTitle: String,
    val decidedAt: Long,
    val participants: List<String>,
    val evidence: List<Evidence>,
    val alternatives: List<String>,
    val status: DecisionStatus,
    val confirmedByName: String?,
    val origin: String,
    val inferenceSource: InferenceSourceLabel?,
)

data class Question(
    val id: String,
    val text: String,
    val askedBy: String?,
    val meetingId: String,
    val meetingTitle: String,
    val status: String,
    val createdAt: Long,
)
