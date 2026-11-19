package com.meetos.android.auth

import android.app.Activity
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.Firebase
import com.google.firebase.auth.FirebaseUser
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.auth
import com.google.firebase.auth.userProfileChangeRequest
import com.meetos.android.BuildConfig
import com.meetos.android.data.MeetosRepository
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

/** Firebase Authentication: email/password and Google (Credential Manager). Sessions persist automatically. */
object AuthRepository {
    private val auth get() = Firebase.auth

    val currentUser: FirebaseUser? get() = auth.currentUser

    fun userFlow(): Flow<FirebaseUser?> = callbackFlow {
        val l = com.google.firebase.auth.FirebaseAuth.AuthStateListener { trySend(it.currentUser) }
        auth.addAuthStateListener(l)
        awaitClose { auth.removeAuthStateListener(l) }
    }

    suspend fun signIn(email: String, password: String) {
        auth.signInWithEmailAndPassword(email.trim(), password).await()
    }

    suspend fun signUp(name: String, email: String, password: String) {
        require(password.length >= 8) { "Use at least 8 characters for your password." }
        val user = auth.createUserWithEmailAndPassword(email.trim(), password).await().user ?: error("Sign-up failed")
        user.updateProfile(userProfileChangeRequest { displayName = name.trim() }).await()
        MeetosRepository.ensureProfile(user.uid, name.trim(), user.email)
        runCatching { user.sendEmailVerification().await() } // needed to accept workspace invites
    }

    /** Requires MEETOS_WEB_CLIENT_ID (the OAuth *web* client ID from the Firebase console). */
    suspend fun signInWithGoogle(activity: Activity) {
        require(BuildConfig.WEB_CLIENT_ID.isNotBlank()) {
            "Google sign-in isn't configured: set MEETOS_WEB_CLIENT_ID in ~/.gradle/gradle.properties (see docs/SETUP.md)."
        }
        val option = GetGoogleIdOption.Builder()
            .setFilterByAuthorizedAccounts(false)
            .setServerClientId(BuildConfig.WEB_CLIENT_ID)
            .build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        val credential = CredentialManager.create(activity).getCredential(activity, request).credential
        if (credential is CustomCredential && credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
            val token = GoogleIdTokenCredential.createFrom(credential.data).idToken
            val user = auth.signInWithCredential(GoogleAuthProvider.getCredential(token, null)).await().user ?: error("Sign-in failed")
            MeetosRepository.ensureProfile(user.uid, user.displayName ?: user.email ?: "You", user.email)
        } else {
            error("Unexpected credential type.")
        }
    }

    fun signOut() = auth.signOut()

    fun friendly(e: Throwable): String {
        val m = e.message.orEmpty()
        return when {
            m.contains("password is invalid", true) || m.contains("INVALID_LOGIN_CREDENTIALS", true) || m.contains("no user record", true) -> "Email or password is incorrect."
            m.contains("already in use", true) -> "An account with this email already exists. Try signing in."
            m.contains("network", true) -> "Network error. Check your connection."
            else -> m.ifBlank { "Something went wrong." }
        }
    }
}
