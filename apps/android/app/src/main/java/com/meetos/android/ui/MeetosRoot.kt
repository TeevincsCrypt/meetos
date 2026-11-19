package com.meetos.android.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Gavel
import androidx.compose.material.icons.outlined.Handshake
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Psychology
import androidx.compose.material.icons.outlined.Videocam
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.meetos.android.MeetosApp
import com.meetos.android.ui.screens.AuthScreen
import com.meetos.android.ui.screens.CommitmentDetailScreen
import com.meetos.android.ui.screens.CommitmentsScreen
import com.meetos.android.ui.screens.DecisionsScreen
import com.meetos.android.ui.screens.HomeScreen
import com.meetos.android.ui.screens.LiveCaptureScreen
import com.meetos.android.ui.screens.MeetingDetailScreen
import com.meetos.android.ui.screens.MeetingsScreen
import com.meetos.android.ui.screens.MemoryScreen
import com.meetos.android.ui.screens.NewMeetingScreen
import com.meetos.android.ui.screens.OnboardingScreen
import com.meetos.android.ui.screens.SettingsScreen
import com.meetos.android.ui.screens.SetupScreen

private data class Tab(val route: String, val label: String, val icon: androidx.compose.ui.graphics.vector.ImageVector)

private val TABS = listOf(
    Tab("home", "Home", Icons.Outlined.Home),
    Tab("meetings", "Meetings", Icons.Outlined.Videocam),
    Tab("commitments", "Commitments", Icons.Outlined.Handshake),
    Tab("decisions", "Decisions", Icons.Outlined.Gavel),
    Tab("memory", "Memory", Icons.Outlined.Psychology),
)

@Composable
fun MeetosRoot() {
    if (!MeetosApp.firebaseReady) return SetupScreen()
    val vm: AppViewModel = viewModel()
    val user by vm.user.collectAsState()
    val workspaces by vm.workspaces.collectAsState()
    val workspace by vm.workspace.collectAsState()
    val snackbar = remember { SnackbarHostState() }
    val message by vm.message.collectAsState()
    LaunchedEffect(message) {
        message?.let { snackbar.showSnackbar(it); vm.message.value = null }
    }

    when {
        user == null -> AuthScreen()
        workspaces == null -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator() }
        workspace == null -> OnboardingScreen(vm)
        else -> MainScaffold(vm, snackbar)
    }
}

@Composable
private fun MainScaffold(vm: AppViewModel, snackbar: SnackbarHostState) {
    val nav = rememberNavController()
    val entry by nav.currentBackStackEntryAsState()
    val route = entry?.destination?.route
    Scaffold(
        snackbarHost = { SnackbarHost(snackbar) },
        bottomBar = {
            if (TABS.any { it.route == route }) {
                NavigationBar(containerColor = MaterialTheme.colorScheme.surface) {
                    TABS.forEach { tab ->
                        NavigationBarItem(
                            selected = route == tab.route,
                            onClick = { nav.navigate(tab.route) { popUpTo("home") { saveState = true }; launchSingleTop = true; restoreState = true } },
                            icon = { Icon(tab.icon, null) },
                            label = { Text(tab.label, style = MaterialTheme.typography.labelSmall) },
                        )
                    }
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding)) { MeetosNavHost(nav, vm) }
    }
}

@Composable
private fun MeetosNavHost(nav: NavHostController, vm: AppViewModel) {
    NavHost(nav, startDestination = "home") {
        composable("home") { HomeScreen(vm, nav) }
        composable("meetings") { MeetingsScreen(vm, nav) }
        composable("meetings/new") { NewMeetingScreen(vm, nav) }
        composable("meeting/{id}") { MeetingDetailScreen(vm, nav, it.arguments?.getString("id").orEmpty()) }
        composable("meeting/{id}/live") { LiveCaptureScreen(vm, nav, it.arguments?.getString("id").orEmpty()) }
        composable("commitments") { CommitmentsScreen(vm, nav) }
        composable("commitment/{id}") { CommitmentDetailScreen(vm, nav, it.arguments?.getString("id").orEmpty()) }
        composable("decisions") { DecisionsScreen(vm) }
        composable("memory") { MemoryScreen(vm) }
        composable("settings") { SettingsScreen(vm, nav) }
    }
}
