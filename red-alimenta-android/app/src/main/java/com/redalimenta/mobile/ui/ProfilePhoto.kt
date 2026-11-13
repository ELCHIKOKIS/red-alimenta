package com.redalimenta.mobile.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.redalimenta.mobile.BuildConfig
import com.redalimenta.mobile.data.SessionStore

@Composable
fun ProfilePhoto(
    name: String,
    imageUrl: String?,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val initials = remember(name) {
        name.trim()
            .split(Regex("\\s+"))
            .take(2)
            .mapNotNull { it.firstOrNull() }
            .joinToString("")
            .uppercase()
            .ifBlank { "R" }
    }
    val remoteUrl = remember(imageUrl) {
        imageUrl?.takeIf(String::isNotBlank)?.let { path ->
            if (path.startsWith("https://", ignoreCase = true)) {
                path
            } else {
                "${BuildConfig.API_BASE_URL.trimEnd('/')}/${path.trimStart('/')}"
            }
        }
    }
    val token = remember(remoteUrl) {
        if (remoteUrl != null) runCatching { SessionStore.getToken() }.getOrNull() else null
    }

    if (remoteUrl == null || token.isNullOrBlank()) {
        Surface(
            modifier = modifier,
            shape = CircleShape,
            color = MaterialTheme.colorScheme.primaryContainer,
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text(
                    initials,
                    color = MaterialTheme.colorScheme.primary,
                    style = MaterialTheme.typography.titleLarge,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
        return
    }

    val request = remember(remoteUrl, token) {
        val sessionCacheKey = "${remoteUrl}_${token.hashCode()}"
        ImageRequest.Builder(context)
            .data(remoteUrl)
            .crossfade(220)
            .addHeader("Authorization", "Bearer $token")
            .memoryCacheKey(sessionCacheKey)
            .diskCacheKey(sessionCacheKey)
            .build()
    }
    AsyncImage(
        model = request,
        contentDescription = "Foto de perfil de $name",
        contentScale = ContentScale.Crop,
        modifier = modifier.clip(CircleShape),
    )
}
