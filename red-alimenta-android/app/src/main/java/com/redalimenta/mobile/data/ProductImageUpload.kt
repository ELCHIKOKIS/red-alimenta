package com.redalimenta.mobile.data

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
import java.io.ByteArrayOutputStream
import java.util.UUID

data class ImageUpload(
    val fileName: String,
    val mimeType: String,
    val content: ByteArray,
)

fun prepareProductImageUpload(context: Context, uri: Uri): ImageUpload =
    prepareImageUpload(context, uri, "producto", 1600)

fun prepareProfileImageUpload(context: Context, uri: Uri): ImageUpload =
    prepareImageUpload(context, uri, "perfil", 512)

private fun prepareImageUpload(
    context: Context,
    uri: Uri,
    filePrefix: String,
    maxDimension: Int,
): ImageUpload {
    val bitmap = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
        ImageDecoder.decodeBitmap(
            ImageDecoder.createSource(context.contentResolver, uri),
        ) { decoder, info, _ ->
            val scale = minOf(1f, maxDimension.toFloat() / maxOf(info.size.width, info.size.height))
            if (scale < 1f) {
                decoder.setTargetSize(
                    (info.size.width * scale).toInt().coerceAtLeast(1),
                    (info.size.height * scale).toInt().coerceAtLeast(1),
                )
            }
            decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
        }
    } else {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, bounds)
        }
        require(bounds.outWidth > 0 && bounds.outHeight > 0) {
            "No se pudo leer la imagen seleccionada."
        }
        var sampleSize = 1
        while (
            bounds.outWidth / sampleSize > maxDimension
            || bounds.outHeight / sampleSize > maxDimension
        ) {
            sampleSize *= 2
        }
        val options = BitmapFactory.Options().apply { inSampleSize = sampleSize }
        context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, options)
        } ?: error("No se pudo abrir la imagen seleccionada.")
    }

    try {
        val uploadBitmap = if (bitmap.hasAlpha()) {
            Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.ARGB_8888).also { output ->
                Canvas(output).apply {
                    drawColor(Color.WHITE)
                    drawBitmap(bitmap, 0f, 0f, null)
                }
            }
        } else {
            bitmap
        }
        val compressed = ByteArrayOutputStream()
        var quality = 85
        try {
            do {
                compressed.reset()
                check(uploadBitmap.compress(Bitmap.CompressFormat.JPEG, quality, compressed)) {
                    "No se pudo preparar la fotografía."
                }
                quality -= 10
            } while (compressed.size() > MAX_IMAGE_UPLOAD_BYTES && quality >= 55)
        } finally {
            if (uploadBitmap !== bitmap) uploadBitmap.recycle()
        }

        require(compressed.size() <= MAX_IMAGE_UPLOAD_BYTES) {
            "La imagen sigue superando el límite de 5 MB después de comprimirla."
        }
        val selectedName = context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
            val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
            if (cursor.moveToFirst() && nameIndex >= 0) cursor.getString(nameIndex) else null
        }.orEmpty()
        val safeName = selectedName
            .substringBeforeLast('.', selectedName)
            .replace(Regex("[^A-Za-z0-9_-]"), "_")
            .take(80)
            .ifBlank { filePrefix }

        return ImageUpload(
            fileName = "${safeName}_${UUID.randomUUID()}.jpg",
            mimeType = "image/jpeg",
            content = compressed.toByteArray(),
        )
    } finally {
        bitmap.recycle()
    }
}

private const val MAX_IMAGE_UPLOAD_BYTES = 5 * 1024 * 1024
