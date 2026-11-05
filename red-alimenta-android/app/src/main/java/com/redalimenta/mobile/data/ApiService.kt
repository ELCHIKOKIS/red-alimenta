package com.redalimenta.mobile.data

import android.content.Context
import com.redalimenta.mobile.BuildConfig
import okhttp3.Interceptor
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import org.json.JSONObject
import retrofit2.HttpException
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.Multipart
import retrofit2.http.PATCH
import retrofit2.http.Part
import retrofit2.http.POST
import retrofit2.http.Path
import retrofit2.http.Query

interface ApiService {
    @GET("health")
    suspend fun health(): Response<HealthResponse>

    @POST("api/auth/login")
    suspend fun login(@Body payload: LoginPayload): LoginResponse

    @POST("api/auth/register")
    suspend fun register(@Body payload: RegisterPayload): RegisterResponse

    @Multipart
    @POST("api/auth/beneficiary/documents")
    suspend fun uploadVerificationDocument(@Part documento: MultipartBody.Part): DocumentUpload

    @POST("api/auth/logout")
    suspend fun logout()

    @GET("api/auth/me")
    suspend fun currentUser(): User

    @PATCH("api/auth/me")
    suspend fun updateProfile(@Body payload: ProfileUpdatePayload): Map<String, Any>

    @GET("api/products")
    suspend fun getProducts(): List<Product>

    @POST("api/products")
    suspend fun createProduct(@Body product: ProductPayload): Product

    @PATCH("api/products/{id}")
    suspend fun updateProduct(
        @Path("id") id: Int,
        @Body product: ProductPayload,
    ): Product

    @DELETE("api/products/{id}")
    suspend fun deactivateProduct(@Path("id") id: Int)

    @GET("api/banks")
    suspend fun getBanks(): List<Bank>

    @POST("api/banks")
    suspend fun createBank(@Body payload: BankPayload): Bank

    @GET("api/banks/{bankId}/inventory")
    suspend fun getInventory(@Path("bankId") bankId: Int): List<InventoryItem>

    @GET("api/banks/{bankId}/availability")
    suspend fun getAvailability(@Path("bankId") bankId: Int): AvailabilityResponse

    @POST("api/banks/{bankId}/inventory")
    suspend fun addProductToInventory(
        @Path("bankId") bankId: Int,
        @Body payload: Map<String, Any>,
    ): InventoryItem

    @PATCH("api/banks/{bankId}/inventory/{productId}")
    suspend fun updateInventorySettings(
        @Path("bankId") bankId: Int,
        @Path("productId") productId: Int,
        @Body payload: Map<String, Boolean>,
    ): InventoryItem

    @GET("api/donations")
    suspend fun getDonations(): List<Donation>

    @POST("api/donations")
    suspend fun createDonation(@Body donation: DonationPayload): Map<String, Any>

    @PATCH("api/donations/{id}/review")
    suspend fun reviewDonation(
        @Path("id") id: Int,
        @Body payload: Map<String, String>,
    ): Donation

    @GET("api/requests")
    suspend fun getRequests(): List<FoodRequest>

    @POST("api/requests")
    suspend fun createRequest(
        @Body request: CreateRequestPayload,
        @Header("Idempotency-Key") idempotencyKey: String,
    ): FoodRequest

    @PATCH("api/requests/{id}/review")
    suspend fun reviewRequest(
        @Path("id") id: Int,
        @Body payload: RequestReviewPayload,
    ): FoodRequest

    @GET("api/deliveries")
    suspend fun getDeliveries(): List<Delivery>

    @POST("api/deliveries")
    suspend fun createDelivery(@Body delivery: DeliveryPayload): Delivery

    @POST("api/deliveries/{id}/confirm")
    suspend fun confirmDelivery(
        @Path("id") id: Int,
        @Body payload: DeliveryConfirmationPayload,
    ): Delivery

    @GET("api/admin/registration-requests")
    suspend fun getRegistrationRequests(): List<RegistrationRequest>

    @PATCH("api/admin/registration-requests/{id}/review")
    suspend fun reviewRegistration(
        @Path("id") id: Int,
        @Body payload: ReviewRegistrationPayload,
    ): RegistrationRequest

    @GET("api/admin/reports")
    suspend fun getReport(): SystemReport

    @GET("api/admin/users")
    suspend fun getUsers(
        @Query("rol") role: String? = null,
        @Query("estado") status: String? = null,
        @Query("offset") offset: Int = 0,
    ): AdminUsersResponse

    @PATCH("api/admin/users/{id}")
    suspend fun updateUser(
        @Path("id") id: Int,
        @Body payload: AdminUserUpdatePayload,
    ): AdminUser

    @DELETE("api/admin/users/{id}")
    suspend fun deleteUser(@Path("id") id: Int): AdminUserDeleteResponse

    @POST("api/banks/{bankId}/users")
    suspend fun createBankUser(
        @Path("bankId") bankId: Int,
        @Body payload: BankUserPayload,
    ): User

    @GET("api/banks/{bankId}/donors")
    suspend fun getBankDonors(@Path("bankId") bankId: Int): List<BankDonor>

    @GET("api/banks/{bankId}/beneficiaries")
    suspend fun getBankBeneficiaries(@Path("bankId") bankId: Int): List<BankBeneficiary>

    @GET("api/banks/{bankId}/history")
    suspend fun getBankHistory(@Path("bankId") bankId: Int): BankHistoryResponse
}

object ApiClient {
    private var applicationContext: Context? = null

    fun initialize(context: Context) {
        applicationContext = context.applicationContext
        SessionStore.initialize(context)
    }

    private val service: ApiService by lazy {
        val tokenInterceptor = Interceptor { chain ->
            val request = chain.request()
            val token = SessionStore.getToken()
            val authenticatedRequest = if (token.isNullOrBlank()) {
                request
            } else {
                request.newBuilder()
                    .header("Authorization", "Bearer $token")
                    .build()
            }
            chain.proceed(authenticatedRequest)
        }
        val client = OkHttpClient.Builder()
            .addInterceptor(tokenInterceptor)
            .build()
        Retrofit.Builder()
            .baseUrl(BuildConfig.API_BASE_URL)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }

    val api: ApiService
        get() {
            check(applicationContext != null) { "ApiClient must be initialized with an Android context" }
            return service
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
