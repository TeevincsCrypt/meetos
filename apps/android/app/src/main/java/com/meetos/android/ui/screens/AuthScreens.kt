package com.meetos.android.ui.screens

import android.app.Activity
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.meetos.android.auth.AuthRepository
import com.meetos.android.ui.AppViewModel
import com.meetos.android.ui.Muted
import com.meetos.android.ui.SectionCard
import kotlinx.coroutines.launch

@Composable
private fun Brand() {
    Text("MEETOS", fontWeight = FontWeight.SemiBold, letterSpacing = 2.sp, fontSize = 18.sp, color = MaterialTheme.colorScheme.primary)
}

@Composable
fun SetupScreen() {
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Spacer(Modifier.height(32.dp))
        Brand()
        Text("Connect MEETOS to Firebase", style = MaterialTheme.typography.headlineSmall)
        Muted("This build has no google-services.json, so sign-in, storage and AI are disabled. Nothing is faked.")
        Text("1. Add an Android app (package com.meetos.android) to your Firebase project.\n" +
            "2. Download google-services.json into apps/android/app/.\n" +
            "3. Enable Authentication, Firestore and Firebase AI Logic.\n" +
            "4. Rebuild. Full steps: docs/SETUP.md", style = MaterialTheme.typography.bodyMedium)
    }
}

@Composable
fun AuthScreen() {
    val scope = rememberCoroutineScope()
    val activity = LocalContext.current as Activity
    var signUp by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }

    fun go(block: suspend () -> Unit) = scope.launch {
        busy = true; error = null
        try { block() } catch (e: Exception) { error = AuthRepository.friendly(e) } finally { busy = false }
    }

    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Spacer(Modifier.height(40.dp))
        Brand()
        Text(if (signUp) "Create your account" else "Welcome back", style = MaterialTheme.typography.headlineSmall)
        Muted("Meetings shouldn't end with notes. They should end with work getting done.")
        OutlinedButton(onClick = { go { AuthRepository.signInWithGoogle(activity) } }, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
            Text("Continue with Google")
        }
        if (signUp) OutlinedTextField(name, { name = it }, label = { Text("Your name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
        OutlinedTextField(email, { email = it }, label = { Text("Email") }, singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email), modifier = Modifier.fillMaxWidth())
        OutlinedTextField(password, { password = it }, label = { Text("Password") }, singleLine = true,
            visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth())
        error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall) }
        Button(
            onClick = { go { if (signUp) AuthRepository.signUp(name, email, password) else AuthRepository.signIn(email, password) } },
            enabled = !busy && email.isNotBlank() && password.isNotBlank() && (!signUp || name.isNotBlank()),
            modifier = Modifier.fillMaxWidth(),
        ) { Text(if (signUp) "Create account" else "Sign in") }
        TextButton(onClick = { signUp = !signUp }) { Text(if (signUp) "Already have an account? Sign in" else "New to MEETOS? Create an account") }
    }
}

@Composable
fun OnboardingScreen(vm: AppViewModel) {
    var name by remember { mutableStateOf("") }
    val busy by vm.busy.collectAsState()
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
        Spacer(Modifier.height(24.dp))
        Brand()
        Text("Set up your workspace", style = MaterialTheme.typography.headlineSmall)
        Muted("A workspace holds your team's meetings, commitments and decisions. Only members can see it. Workspaces you're invited to from the web app appear here automatically.")
        SectionCard {
            OutlinedTextField(name, { name = it }, label = { Text("Workspace name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Button(onClick = { vm.createWorkspace(name) }, enabled = name.isNotBlank() && !busy) { Text("Create workspace") }
        }
        SectionCard(title = "Explore with sample data") {
            Muted("Creates a separate, clearly labelled demo workspace with two fictional meeting transcripts. Nothing is pre-analysed — you run the AI yourself.")
            OutlinedButton(onClick = { vm.createDemoWorkspace() }, enabled = !busy) { Text("Create demo workspace") }
        }
        TextButton(onClick = { vm.signOut() }) { Text("Sign out") }
    }
}
