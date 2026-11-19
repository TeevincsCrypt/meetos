package com.meetos.android.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp

/** Same palette as the web app (apps/web/src/index.css). */
object MeetosColors {
    val Brand = Color(0xFF0B5D57)
    val BrandDark = Color(0xFF3FB3A6)
    val Accent = Color(0xFFC98A12)
    val Danger = Color(0xFFC2372E)
    val Warning = Color(0xFFA86200)
    val Success = Color(0xFF1F7A4D)
    val Device = Color(0xFF6D43C9)
    val DeviceSoft = Color(0xFFEFE9FB)
    val Cloud = Color(0xFF1D6FA5)
    val CloudSoft = Color(0xFFE4F0F8)
    val WarningSoft = Color(0xFFFDF0DC)
}

private val Light = lightColorScheme(
    primary = MeetosColors.Brand,
    onPrimary = Color.White,
    primaryContainer = Color(0xFFE5F1EF),
    onPrimaryContainer = Color(0xFF0A5751),
    secondary = MeetosColors.Accent,
    background = Color(0xFFF7F7F5),
    surface = Color.White,
    surfaceVariant = Color(0xFFF2F2EF),
    onSurface = Color(0xFF17191C),
    onSurfaceVariant = Color(0xFF4D5258),
    outline = Color(0xFFE4E4DF),
    outlineVariant = Color(0xFFE9E9E5),
    error = MeetosColors.Danger,
)

private val Dark = darkColorScheme(
    primary = MeetosColors.BrandDark,
    onPrimary = Color(0xFF06201D),
    primaryContainer = Color(0xFF14302D),
    onPrimaryContainer = Color(0xFF6FD0C4),
    secondary = Color(0xFFF0B445),
    background = Color(0xFF0F1113),
    surface = Color(0xFF16191C),
    surfaceVariant = Color(0xFF1C2024),
    onSurface = Color(0xFFECEDEE),
    onSurfaceVariant = Color(0xFFB4B9BF),
    outline = Color(0xFF272C31),
    outlineVariant = Color(0xFF252A2F),
    error = Color(0xFFF0776D),
)

private val Type = Typography(
    headlineSmall = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 22.sp, letterSpacing = (-0.2).sp),
    titleMedium = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 15.sp),
    titleSmall = TextStyle(fontWeight = FontWeight.SemiBold, fontSize = 13.sp),
    bodyMedium = TextStyle(fontSize = 14.sp, lineHeight = 20.sp),
    bodySmall = TextStyle(fontSize = 12.5.sp, lineHeight = 17.sp),
    labelSmall = TextStyle(fontWeight = FontWeight.Medium, fontSize = 11.sp),
)

@Composable
fun MeetosTheme(content: @Composable () -> Unit) {
    MaterialTheme(colorScheme = if (isSystemInDarkTheme()) Dark else Light, typography = Type, content = content)
}
