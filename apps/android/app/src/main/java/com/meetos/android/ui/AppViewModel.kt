package com.meetos.android.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.google.firebase.auth.FirebaseUser
import com.meetos.android.MeetosApp
import com.meetos.android.auth.AuthRepository
import com.meetos.android.data.Actor
import com.meetos.android.data.MeetosRepository
import com.meetos.android.data.Samples
import com.meetos.android.data.local.CachedCommitment
import com.meetos.android.data.local.CachedMeeting
import com.meetos.android.model.Commitment
import com.meetos.android.model.Decision
import com.meetos.android.model.Meeting
import com.meetos.android.model.Participant
import com.meetos.android.model.Question
import com.meetos.android.model.Workspace
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.emptyFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

data class WorkspaceData(
    val meetings: List<Meeting> = emptyList(),
    val commitments: List<Commitment> = emptyList(),
    val decisions: List<Decision> = emptyList(),
    val questions: List<Question> = emptyList(),
    val loaded: Boolean = false,
)

@OptIn(ExperimentalCoroutinesApi::class)
class AppViewModel(app: Application) : AndroidViewModel(app) {
    private val cache = (app as MeetosApp).cache.dao()

    val user: StateFlow<FirebaseUser?> =
        (if (MeetosApp.firebaseReady) AuthRepository.userFlow() else flowOf(null))
            .stateIn(viewModelScope, SharingStarted.Eagerly, if (MeetosApp.firebaseReady) AuthRepository.currentUser else null)

    val actor: Actor?
        get() = user.value?.let { Actor(it.uid, it.displayName?.takeIf(String::isNotBlank) ?: it.email?.substringBefore('@') ?: "You") }

    /** null = still loading */
    val workspaces: StateFlow<List<Workspace>?> = user.flatMapLatest { u ->
        if (u == null) flowOf(emptyList()) else MeetosRepository.workspaces(u.uid).catch { emit(emptyList()) }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    private val selectedId = MutableStateFlow<String?>(null)

    val workspace: StateFlow<Workspace?> = combine(workspaces, selectedId) { list, sel ->
        list?.firstOrNull { it.id == sel } ?: list?.firstOrNull()
    }.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val data: StateFlow<WorkspaceData> = workspace.map { it?.id }.flatMapLatest { wid ->
        if (wid == null) flowOf(WorkspaceData())
        else combine(
            MeetosRepository.meetings(wid).onEach { list -> cacheMeetings(wid, list) },
            MeetosRepository.commitments(wid).onEach { list -> cacheCommitments(wid, list) },
            MeetosRepository.decisions(wid),
            MeetosRepository.questions(wid),
        ) { m, c, d, q -> WorkspaceData(m, c, d, q, loaded = true) }.catch { emit(WorkspaceData(loaded = true)) }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, WorkspaceData())

    /** Last-known lists from Room, shown while offline / before Firestore delivers. */
    val cachedMeetings: Flow<List<CachedMeeting>> = workspace.flatMapLatest { w -> if (w == null) emptyFlow() else cache.meetings(w.id) }
    val cachedCommitments: Flow<List<CachedCommitment>> = workspace.flatMapLatest { w -> if (w == null) emptyFlow() else cache.commitments(w.id) }

    private suspend fun cacheMeetings(wid: String, list: List<Meeting>) = runCatching {
        cache.replaceMeetings(wid, list.map { CachedMeeting(it.id, wid, it.title, it.summary, it.status, it.date, it.isSample) })
    }

    private suspend fun cacheCommitments(wid: String, list: List<Commitment>) = runCatching {
        cache.replaceCommitments(wid, list.map { CachedCommitment(it.id, wid, it.description, it.ownerName, it.deadline, it.status.wire, it.originMeetingTitle, it.meetingIds.size) })
    }

    fun select(id: String) { selectedId.value = id }

    val busy = MutableStateFlow(false)
    val message = MutableStateFlow<String?>(null)

    fun launchAction(block: suspend () -> Unit) {
        viewModelScope.launch {
            busy.value = true
            try { block() } catch (e: Exception) { message.value = e.message ?: "Something went wrong." } finally { busy.value = false }
        }
    }

    fun createWorkspace(name: String) = launchAction {
        val a = actor ?: return@launchAction
        selectedId.value = MeetosRepository.createWorkspace(a, user.value?.email, name)
    }

    /** A clearly labelled demo workspace with the fictional sample meetings (not pre-analysed). */
    fun createDemoWorkspace() = launchAction {
        val a = actor ?: return@launchAction
        val wid = MeetosRepository.createWorkspace(a, user.value?.email, "Lumen demo (sample data)", isDemo = true)
        selectedId.value = wid
        val day = 86_400_000L
        for (s in Samples.ALL) {
            val at = System.currentTimeMillis() + s.dayOffset * day
            val mid = MeetosRepository.createMeeting(wid, a, s.title, s.participants.map { Participant(it) }, at, isSample = true)
            MeetosRepository.patchMeeting(wid, mid, mapOf("startedAt" to com.meetos.android.data.ts(at), "description" to s.description))
            val m = Meeting(mid, wid, s.title, s.description, null, emptyList(), at, at, "scheduled", false, null, 0, "", emptyList(), emptyList(),
                emptyList(), emptyList(), null, true, at, a.uid)
            MeetosRepository.saveTranscript(wid, a, m, s.transcript, "sample")
        }
    }

    fun signOut() {
        viewModelScope.launch { runCatching { cache.clearAllMeetings(); cache.clearAllCommitments() } }
        AuthRepository.signOut()
        selectedId.value = null
    }
}
