package com.meetos.android.data

import com.google.firebase.Firebase
import com.google.firebase.firestore.CollectionReference
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.MetadataChanges
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.WriteBatch
import com.google.firebase.firestore.firestore
import com.meetos.android.analysis.Extraction
import com.meetos.android.analysis.Text
import com.meetos.android.analysis.Transcript
import com.meetos.android.model.Commitment
import com.meetos.android.model.CommitmentEvent
import com.meetos.android.model.CommitmentStatus
import com.meetos.android.model.Decision
import com.meetos.android.model.Evidence
import com.meetos.android.model.InferenceSourceLabel
import com.meetos.android.model.Meeting
import com.meetos.android.model.Participant
import com.meetos.android.model.Question
import com.meetos.android.model.Workspace
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

data class Actor(val uid: String, val name: String)

/**
 * Firestore data access. Document shapes are identical to the web app's
 * (apps/web/src/data/*), so both clients work on the same workspace and the
 * same security rules apply.
 */
object MeetosRepository {
    private val db by lazy { Firebase.firestore }

    private fun ws(wid: String) = db.collection("workspaces").document(wid)
    private fun col(wid: String, name: String): CollectionReference = ws(wid).collection(name)

    private fun <T> listen(query: Query, map: (com.google.firebase.firestore.DocumentSnapshot) -> T): Flow<List<T>> = callbackFlow {
        val reg = query.addSnapshotListener { snap, err ->
            if (err != null) { close(err); return@addSnapshotListener }
            if (snap != null) trySend(snap.documents.map(map))
        }
        awaitClose { reg.remove() }
    }

    /** Held back until committed: workspace subcollection rules check the committed document. */
    fun workspaces(uid: String): Flow<List<Workspace>> = callbackFlow {
        val reg = db.collection("workspaces").whereArrayContains("memberIds", uid)
            .addSnapshotListener(MetadataChanges.INCLUDE) { snap, err ->
                if (err != null) { close(err); return@addSnapshotListener }
                snap?.let { s -> trySend(s.documents.filter { !it.metadata.hasPendingWrites() }.map { it.toWorkspace() }.sortedBy { it.name }) }
            }
        awaitClose { reg.remove() }
    }

    fun meetings(wid: String) = listen(col(wid, "meetings").orderBy("createdAt", Query.Direction.DESCENDING).limit(300)) { it.toMeeting() }
    fun commitments(wid: String) = listen(col(wid, "commitments").orderBy("createdAt", Query.Direction.DESCENDING).limit(1000)) { it.toCommitment() }
    fun decisions(wid: String) = listen(col(wid, "decisions").orderBy("decidedAt", Query.Direction.DESCENDING).limit(1000)) { it.toDecision() }
    fun questions(wid: String) = listen(col(wid, "questions").orderBy("createdAt", Query.Direction.DESCENDING).limit(1000)) { it.toQuestion() }
    fun events(wid: String, cid: String): Flow<List<CommitmentEvent>> =
        listen(col(wid, "commitments").document(cid).collection("events").orderBy("at", Query.Direction.ASCENDING)) { it.toEvent() }

    fun meeting(wid: String, mid: String): Flow<Meeting?> = callbackFlow {
        val reg = col(wid, "meetings").document(mid).addSnapshotListener { s, _ -> trySend(if (s != null && s.exists()) s.toMeeting() else null) }
        awaitClose { reg.remove() }
    }

    fun transcript(wid: String, mid: String): Flow<String> = callbackFlow {
        val reg = transcriptRef(wid, mid).addSnapshotListener { s, _ -> trySend(s?.getString("text") ?: "") }
        awaitClose { reg.remove() }
    }

    private fun transcriptRef(wid: String, mid: String) = col(wid, "meetings").document(mid).collection("content").document("transcript")

    // ------------------------------------------------------------------ writes

    private suspend fun log(wid: String, actor: Actor, type: String, message: String, meetingId: String? = null) {
        runCatching {
            col(wid, "activity").add(
                mapOf("type" to type, "actorUid" to actor.uid, "actorName" to actor.name, "message" to message.take(480),
                    "meetingId" to meetingId, "entityId" to null, "createdAt" to FieldValue.serverTimestamp()),
            ).await()
        }
    }

    suspend fun ensureProfile(uid: String, name: String, email: String?) {
        db.collection("users").document(uid).set(mapOf("displayName" to name, "email" to email), com.google.firebase.firestore.SetOptions.merge()).await()
    }

    suspend fun createWorkspace(actor: Actor, email: String?, name: String, isDemo: Boolean = false): String {
        val ref = db.collection("workspaces").document()
        ref.set(
            mapOf("name" to name.trim().take(80), "description" to "", "ownerId" to actor.uid, "roles" to mapOf(actor.uid to "owner"),
                "memberIds" to listOf(actor.uid), "isDemo" to isDemo, "createdAt" to FieldValue.serverTimestamp(), "updatedAt" to FieldValue.serverTimestamp()),
        ).await()
        ref.collection("members").document(actor.uid).set(
            mapOf("uid" to actor.uid, "role" to "owner", "displayName" to actor.name, "email" to email, "photoURL" to null, "joinedAt" to FieldValue.serverTimestamp()),
        ).await()
        log(ref.id, actor, "workspace_created", "created the workspace \"$name\"")
        return ref.id
    }

    suspend fun createMeeting(wid: String, actor: Actor, title: String, participants: List<Participant>, scheduledAt: Long?, isSample: Boolean = false): String {
        val ref = col(wid, "meetings").document()
        ref.set(
            mapOf(
                "workspaceId" to wid, "title" to title.trim().take(200).ifBlank { "Untitled meeting" }, "description" to "",
                "projectId" to null, "participants" to participants.distinctBy { it.name.lowercase() }.map { mapOf("name" to it.name, "email" to it.email, "uid" to it.uid) },
                "scheduledAt" to ts(scheduledAt), "startedAt" to null, "endedAt" to null, "status" to "scheduled", "archived" to false,
                "transcriptSource" to null, "transcriptChars" to 0, "summary" to "", "topics" to emptyList<Any>(), "discussionPoints" to emptyList<Any>(),
                "risks" to emptyList<Any>(), "followUps" to emptyList<Any>(), "analysis" to null, "agenda" to null, "agendaUpdatedAt" to null,
                "isSample" to isSample, "createdAt" to FieldValue.serverTimestamp(), "updatedAt" to FieldValue.serverTimestamp(), "createdBy" to actor.uid,
            ),
        ).await()
        log(wid, actor, "meeting_created", "created the meeting \"$title\"", ref.id)
        return ref.id
    }

    suspend fun saveTranscript(wid: String, actor: Actor, meeting: Meeting, text: String, source: String) {
        val clean = Transcript.normalize(text)
        require(clean.length <= Transcript.MAX_TRANSCRIPT_CHARS) { "Transcript is too long." }
        transcriptRef(wid, meeting.id).set(mapOf("text" to clean, "source" to source, "updatedAt" to FieldValue.serverTimestamp(), "updatedBy" to actor.uid)).await()
        col(wid, "meetings").document(meeting.id).update(
            mapOf("transcriptSource" to source, "transcriptChars" to clean.length, "status" to if (meeting.status == "analyzed") "analyzed" else "captured",
                "startedAt" to (ts(meeting.startedAt) ?: FieldValue.serverTimestamp()), "updatedAt" to FieldValue.serverTimestamp()),
        ).await()
        log(wid, actor, "transcript_saved", "added a transcript to \"${meeting.title}\"", meeting.id)
    }

    suspend fun getTranscript(wid: String, mid: String): String = transcriptRef(wid, mid).get().await().getString("text") ?: ""

    /** Live capture: each finalised phrase is saved immediately. */
    suspend fun appendSegment(wid: String, mid: String, index: Int, speaker: String?, text: String) {
        col(wid, "meetings").document(mid).collection("segments").document(index.toString().padStart(6, '0'))
            .set(mapOf("index" to index, "speaker" to speaker, "text" to text.take(20000), "source" to "android_speech", "createdAt" to FieldValue.serverTimestamp())).await()
    }

    suspend fun patchMeeting(wid: String, mid: String, data: Map<String, Any?>) {
        col(wid, "meetings").document(mid).update(data + ("updatedAt" to FieldValue.serverTimestamp())).await()
    }

    // ------------------------------------------------------------------ commitments

    private fun addEvent(b: WriteBatch, ref: DocumentReference, type: String, actor: Actor?, meeting: Pair<String, String>? = null,
                         quote: String? = null, from: String? = null, to: String? = null, note: String? = null, atMillis: Long? = null) {
        b.set(ref.collection("events").document(), mapOf(
            "type" to type, "at" to (ts(atMillis) ?: FieldValue.serverTimestamp()), "byUid" to actor?.uid, "byName" to actor?.name,
            "meetingId" to meeting?.first, "meetingTitle" to meeting?.second, "quote" to quote, "from" to from, "to" to to,
            "note" to note?.take(2000), "origin" to if (actor != null) "manual" else "ai",
        ))
    }

    suspend fun setStatus(wid: String, actor: Actor, c: Commitment, status: CommitmentStatus) {
        if (status == c.status) return
        if (status == CommitmentStatus.COMPLETED) return confirmCompletion(wid, actor, c, useSuggestedEvidence = false)
        val ref = col(wid, "commitments").document(c.id)
        val b = db.batch()
        b.update(ref, mapOf("status" to status.wire, "completedAt" to null, "completion" to null, "editedByUser" to true, "updatedAt" to FieldValue.serverTimestamp()))
        addEvent(b, ref, "status_changed", actor, from = c.status.wire, to = status.wire)
        b.commit().await()
    }

    /** The only path to "completed": an explicit confirmation by the signed-in user (also enforced by security rules). */
    suspend fun confirmCompletion(wid: String, actor: Actor, c: Commitment, useSuggestedEvidence: Boolean) {
        val evidence = if (useSuggestedEvidence) c.pendingCompletion else null
        val ref = col(wid, "commitments").document(c.id)
        val b = db.batch()
        b.update(ref, mapOf(
            "status" to "completed", "completedAt" to FieldValue.serverTimestamp(),
            "completion" to mapOf("method" to "user_confirmed", "confirmedBy" to actor.uid, "confirmedByName" to actor.name,
                "at" to FieldValue.serverTimestamp(), "evidence" to evidence?.toMap()),
            "pendingCompletion" to null, "editedByUser" to true, "updatedAt" to FieldValue.serverTimestamp(),
        ))
        addEvent(b, ref, "completion_confirmed", actor, evidence?.let { it.meetingId to (it.meetingTitle ?: "") }, quote = evidence?.quote,
            from = c.status.wire, to = "completed")
        b.commit().await()
        log(wid, actor, "commitment_completed", "confirmed \"${c.description}\" as completed")
    }

    suspend fun rejectCompletion(wid: String, actor: Actor, c: Commitment) {
        val ref = col(wid, "commitments").document(c.id)
        val b = db.batch()
        b.update(ref, mapOf("pendingCompletion" to null, "editedByUser" to true, "updatedAt" to FieldValue.serverTimestamp()))
        addEvent(b, ref, "completion_rejected", actor, note = "Not actually complete.")
        b.commit().await()
    }

    suspend fun confirmDecision(wid: String, actor: Actor, d: Decision) {
        col(wid, "decisions").document(d.id).update(mapOf("status" to "active", "confirmedBy" to actor.uid, "confirmedByName" to actor.name,
            "editedByUser" to true, "updatedAt" to FieldValue.serverTimestamp())).await()
    }

    // ------------------------------------------------------------------ analysis persistence

    data class RunSummary(val status: String, val chunkCount: Int, val onDevice: Int, val inCloud: Int, val fallback: Int, val failed: Int,
                          val discarded: Int, val preference: String, val cloudModel: String?, val error: String?, val startedAt: Long)

    private fun ev(m: Meeting, q: com.meetos.android.analysis.Grounding.Quote) =
        mapOf("meetingId" to m.id, "meetingTitle" to m.title, "quote" to q.quote.take(1000), "speaker" to q.speaker)

    suspend fun persistAnalysis(
        wid: String, actor: Actor, meeting: Meeting, merged: Extraction.Merged, run: RunSummary,
        summary: String, sources: Map<String, InferenceSourceLabel>, existing: List<Commitment>, existingDecisions: List<Decision>,
    ): Int {
        val date = meeting.date
        // Replace unedited AI items from a previous run of this meeting.
        val old = db.batch()
        var oldOps = 0
        for (name in listOf("decisions", "questions")) {
            col(wid, name).whereEqualTo("meetingId", meeting.id).get().await().documents
                .filter { it.getString("origin") == "ai" && it.getBoolean("editedByUser") != true }
                .forEach { old.delete(it.reference); oldOps++ }
        }
        col(wid, "commitments").whereEqualTo("originMeetingId", meeting.id).get().await().documents
            .filter { it.getString("origin") == "ai" && it.getBoolean("editedByUser") != true && it.get("relatedMeetingIds").strings().isEmpty() }
            .forEach { d -> d.reference.collection("events").get().await().documents.forEach { old.delete(it.reference); oldOps++ }; old.delete(d.reference); oldOps++ }
        if (oldOps > 0) old.commit().await()

        val b = db.batch()
        val src = sources["extract"]?.wire
        for (c in merged.commitments) {
            val ref = col(wid, "commitments").document()
            b.set(ref, mapOf(
                "workspaceId" to wid, "description" to c.description.take(2000), "ownerName" to c.ownerName, "ownerKey" to Text.personKey(c.ownerName),
                "deadline" to ts(c.deadline), "deadlineText" to c.deadlineText, "originalDeadline" to ts(c.deadline), "deadlineChangeCount" to 0,
                "priority" to c.priority, "status" to "open", "originMeetingId" to meeting.id, "originMeetingTitle" to meeting.title,
                "relatedMeetingIds" to emptyList<String>(), "meetingIds" to listOf(meeting.id), "evidence" to listOf(ev(meeting, c.evidence)),
                "projectId" to meeting.projectId, "createdAt" to FieldValue.serverTimestamp(), "updatedAt" to FieldValue.serverTimestamp(),
                "completedAt" to null, "completion" to null, "pendingCompletion" to null, "lastMentionedAt" to null, "mentionCount" to 0,
                "origin" to "ai", "inferenceSource" to src, "editedByUser" to false, "createdBy" to actor.uid,
            ))
            addEvent(b, ref, "created", null, meeting.id to meeting.title, quote = c.evidence.quote, note = "Extracted from the transcript.", atMillis = date)
        }
        for (d in merged.decisions) {
            val related = existingDecisions.filter { it.meetingId != meeting.id && Text.similarity("${d.title} ${d.description}", "${it.title} ${it.description}") >= 0.3 }.take(3).map { it.id }
            b.set(col(wid, "decisions").document(), mapOf(
                "workspaceId" to wid, "title" to d.title.take(300), "description" to d.description.take(3000), "meetingId" to meeting.id,
                "meetingTitle" to meeting.title, "decidedAt" to ts(date), "participants" to d.madeBy, "evidence" to listOf(ev(meeting, d.evidence)),
                "alternatives" to d.alternatives, "status" to if (d.explicit) "active" else "needs_confirmation", "supersededBy" to null, "supersedes" to null,
                "relatedDecisionIds" to related, "projectId" to meeting.projectId, "confirmedBy" to null, "confirmedByName" to null, "origin" to "ai",
                "inferenceSource" to src, "editedByUser" to false, "createdAt" to FieldValue.serverTimestamp(), "updatedAt" to FieldValue.serverTimestamp(), "createdBy" to actor.uid,
            ))
        }
        for (q in merged.questions) {
            b.set(col(wid, "questions").document(), mapOf(
                "workspaceId" to wid, "text" to q.text.take(1000), "askedBy" to q.askedBy, "meetingId" to meeting.id, "meetingTitle" to meeting.title,
                "evidence" to listOf(ev(meeting, q.evidence)), "status" to "open", "answer" to null, "resolvedAt" to null, "projectId" to meeting.projectId,
                "origin" to "ai", "inferenceSource" to src, "editedByUser" to false, "createdAt" to FieldValue.serverTimestamp(),
                "updatedAt" to FieldValue.serverTimestamp(), "createdBy" to actor.uid,
            ))
        }
        val byId = existing.associateBy { it.id }
        var linked = 0
        for (u in merged.updates) {
            val c = byId[u.commitmentId] ?: continue
            linked++
            val ref = col(wid, "commitments").document(c.id)
            val e = ev(meeting, u.evidence)
            val patch = mutableMapOf<String, Any?>(
                "relatedMeetingIds" to FieldValue.arrayUnion(meeting.id), "meetingIds" to FieldValue.arrayUnion(meeting.id),
                "evidence" to FieldValue.arrayUnion(e), "lastMentionedAt" to ts(date), "mentionCount" to FieldValue.increment(1),
                "updatedAt" to FieldValue.serverTimestamp(),
            )
            var from: String? = null
            var to: String? = null
            if (u.kind == "completion_claim") patch["pendingCompletion"] = mapOf("evidence" to e, "suggestedAt" to ts(date))
            if (u.kind == "deadline_change" && u.newDeadline != null && u.newDeadline != c.deadline) {
                patch["deadline"] = ts(u.newDeadline); patch["deadlineText"] = u.newDeadlineText
                patch["originalDeadline"] = ts(c.originalDeadline ?: c.deadline)
                if (c.deadline != null) patch["deadlineChangeCount"] = FieldValue.increment(1)
                from = c.deadline?.let { java.time.Instant.ofEpochMilli(it).toString() }
                to = java.time.Instant.ofEpochMilli(u.newDeadline).toString()
            }
            b.update(ref, patch)
            val type = mapOf("progress" to "progress_reported", "blocker" to "blocker_reported", "completion_claim" to "completion_suggested",
                "deadline_change" to "deadline_changed", "mention" to "mentioned")[u.kind] ?: "mentioned"
            addEvent(b, ref, type, null, meeting.id to meeting.title, quote = u.evidence.quote, from = from, to = to,
                note = if (u.kind == "completion_claim") "The transcript says this is done. Waiting for confirmation." else null, atMillis = date)
        }
        b.update(col(wid, "meetings").document(meeting.id), mapOf(
            "summary" to summary, "discussionPoints" to emptyList<String>(),
            "topics" to merged.topics.map { mapOf("name" to it.name, "evidence" to it.evidence) },
            "risks" to merged.risks.map { mapOf("description" to it.description, "kind" to it.kind, "evidence" to ev(meeting, it.evidence)) },
            "followUps" to merged.followUps,
            "analysis" to mapOf(
                "status" to run.status, "startedAt" to ts(run.startedAt), "finishedAt" to FieldValue.serverTimestamp(), "chunkCount" to run.chunkCount,
                "chunksOnDevice" to run.onDevice, "chunksInCloud" to run.inCloud, "chunksCloudFallback" to run.fallback, "chunksFailed" to run.failed,
                "discardedUngrounded" to run.discarded, "inferenceMode" to run.preference, "cloudModel" to run.cloudModel, "error" to run.error,
            ),
            "status" to "analyzed", "updatedAt" to FieldValue.serverTimestamp(),
        ))
        b.commit().await()
        log(wid, actor, "analysis_completed",
            "analysed \"${meeting.title}\" on Android: ${merged.commitments.size} commitments, ${merged.decisions.size} decisions, $linked links to earlier commitments", meeting.id)
        return linked
    }

    @Suppress("unused")
    fun evidenceList(e: List<Evidence>) = e.map { it.toMap() }

    fun questionsForBrief(q: List<Question>) = q.filter { it.status == "open" }
}
