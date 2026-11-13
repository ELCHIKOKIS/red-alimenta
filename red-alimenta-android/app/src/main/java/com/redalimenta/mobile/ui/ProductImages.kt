package com.redalimenta.mobile.ui

import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import coil.request.ImageRequest
import com.redalimenta.mobile.BuildConfig
import com.redalimenta.mobile.R
import com.redalimenta.mobile.data.SessionStore
import java.util.Locale

@Composable
fun ProductImage(
    category: String,
    imageUrl: String? = null,
    localImage: Uri? = null,
    modifier: Modifier = Modifier,
    contentScale: ContentScale = ContentScale.Crop,
    contentDescription: String? = null,
) {
    val context = LocalContext.current
    val placeholder = painterResource(productPlaceholder(category))
    val remoteUrl = remember(imageUrl) {
        imageUrl?.takeIf(String::isNotBlank)?.let { path ->
            if (path.startsWith("https://", ignoreCase = true)) {
                path
            } else {
                "${BuildConfig.API_BASE_URL.trimEnd('/')}/${path.trimStart('/')}"
            }
        }
    }
    val token = remember(localImage, remoteUrl) {
        if (localImage == null && remoteUrl != null) {
            runCatching { SessionStore.getToken() }.getOrNull()
        } else {
            null
        }
    }

    if (localImage == null && (remoteUrl == null || token.isNullOrBlank())) {
        Image(
            painter = placeholder,
            contentDescription = contentDescription,
            contentScale = contentScale,
            modifier = modifier
                .clip(RoundedCornerShape(18.dp))
                .background(MaterialTheme.colorScheme.surfaceVariant),
        )
        return
    }

    val request = remember(localImage, remoteUrl, token) {
        ImageRequest.Builder(context)
            .data(localImage ?: remoteUrl)
            .crossfade(220)
            .apply {
                if (localImage == null && remoteUrl != null && !token.isNullOrBlank()) {
                    addHeader("Authorization", "Bearer $token")
                    val sessionCacheKey = "${remoteUrl}_${token.hashCode()}"
                    memoryCacheKey(sessionCacheKey)
                    diskCacheKey(sessionCacheKey)
                }
            }
            .build()
    }
    AsyncImage(
        model = request,
        contentDescription = contentDescription,
        contentScale = contentScale,
        placeholder = placeholder,
        error = placeholder,
        modifier = modifier
            .clip(RoundedCornerShape(18.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant),
    )
}

private fun productPlaceholder(category: String): Int {
    val normalized = category.lowercase(Locale.ROOT)
    return when {
        listOf("fruta", "frut").any(normalized::contains) -> R.drawable.food_fruits
        listOf("verdura", "hortaliza", "vegetal").any(normalized::contains) ->
            R.drawable.food_vegetables
        listOf("cereal", "grano", "arroz", "pasta", "harina", "pan").any(normalized::contains) ->
            R.drawable.food_grains
        listOf("lacteo", "lácteo", "leche", "queso", "yogur").any(normalized::contains) ->
            R.drawable.food_dairy
        listOf("carne", "pollo", "pescado", "proteina", "proteína", "legumbre", "frijol")
            .any(normalized::contains) -> R.drawable.food_protein
        else -> R.drawable.food_generic
    }
}
