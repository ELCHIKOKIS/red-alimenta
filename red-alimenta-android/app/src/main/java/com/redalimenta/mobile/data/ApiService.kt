package com.redalimenta.mobile.data

import com.redalimenta.mobile.BuildConfig
import com.google.gson.JsonObject
import org.json.JSONObject
import retrofit2.HttpException
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

interface ApiService {
    @GET("api/products")
    suspend fun getProducts(): List<Product>

    @POST("api/products")
    suspend fun createProduct(@Body product: ProductPayload): Product

    @PUT("api/products/{id}")
    suspend fun updateProduct(
        @Path("id") id: Int,
        @Body product: ProductPayload,
    ): Product

    @DELETE("api/products/{id}")
    suspend fun deactivateProduct(@Path("id") id: Int): Response<Unit>

    @GET("api/donations")
    suspend fun getDonations(): List<Donation>

    @POST("api/donations")
    suspend fun createDonation(@Body donation: DonationPayload): JsonObject

    @GET("api/deliveries")
    suspend fun getDeliveries(): List<Delivery>

    @POST("api/deliveries")
    suspend fun createDelivery(@Body delivery: DeliveryPayload): JsonObject
}

object ApiClient {
    val service: ApiService by lazy {
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }
}

fun Throwable.toApiMessage(): String {
    if (this is HttpException) {
        val body = response()?.errorBody()?.string()
        if (!body.isNullOrBlank()) {
            val apiError = runCatching { JSONObject(body).optString("error") }.getOrNull()
            if (!apiError.isNullOrBlank()) return apiError
        }
        return "El servidor respondió con el código HTTP ${code()}."
    }

    return when (this) {
        is java.io.IOException ->
            "No se pudo conectar con la API. Verifica la URL y que el servidor esté disponible."
        else -> message ?: "Ocurrió un error inesperado al comunicarse con la API."
    }
}
