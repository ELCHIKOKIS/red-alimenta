package com.redalimenta.mobile.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

private val PurplePrimary = Color(0xFF5B3BB8)
private val PurpleSecondary = Color(0xFF8061CC)
private val LavenderSoft = Color(0xFFEDE7FA)
private val AppBackground = Color(0xFFF8F7FB)

private val RedAlimentaColors = lightColorScheme(
    primary = PurplePrimary,
    onPrimary = Color.White,
    primaryContainer = LavenderSoft,
    onPrimaryContainer = Color(0xFF31215C),
    secondary = PurpleSecondary,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFF1EDFA),
    onSecondaryContainer = Color(0xFF34275B),
    tertiary = Color(0xFFB968A5),
    background = AppBackground,
    surface = Color.White,
    surfaceVariant = Color(0xFFF1EFF5),
    outline = Color(0xFF857D93),
    outlineVariant = Color(0xFFD8D2E2),
    error = Color(0xFFB3261E),
)

private val RedAlimentaShapes = Shapes(
    extraSmall = androidx.compose.foundation.shape.RoundedCornerShape(8.dp),
    small = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
    medium = androidx.compose.foundation.shape.RoundedCornerShape(20.dp),
    large = androidx.compose.foundation.shape.RoundedCornerShape(26.dp),
    extraLarge = androidx.compose.foundation.shape.RoundedCornerShape(32.dp),
)

@Composable
fun RedAlimentaTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = RedAlimentaColors,
        typography = Typography(),
        shapes = RedAlimentaShapes,
        content = content,
    )
}
