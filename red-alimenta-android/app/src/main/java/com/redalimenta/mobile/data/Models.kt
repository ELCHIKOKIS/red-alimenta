package com.redalimenta.mobile.data

import com.google.gson.annotations.SerializedName

data class Product(
    val id: Int,
    val nombre: String,
    val categoria: String,
    val unidad: String,
    @SerializedName("stock_actual") val stockActual: Int,
    val activo: Boolean,
)

data class ProductPayload(
    val nombre: String,
    val categoria: String,
    val unidad: String,
    @SerializedName("stock_actual") val stockActual: Int,
    val activo: Boolean,
)

data class Donation(
    val id: Int,
    val cantidad: Int,
    val fecha: String,
    @SerializedName("donante_referencia") val donanteReferencia: String,
    val producto: Product,
)

data class DonationPayload(
    @SerializedName("producto_id") val productId: Int,
    val cantidad: Int,
    @SerializedName("donante_referencia") val donorReference: String,
)

data class Delivery(
    val id: Int,
    val cantidad: Int,
    val fecha: String,
    @SerializedName("beneficiario_referencia") val beneficiaryReference: String,
    val producto: Product,
)

data class DeliveryPayload(
    @SerializedName("producto_id") val productId: Int,
    val cantidad: Int,
    @SerializedName("beneficiario_referencia") val beneficiaryReference: String,
)
