package com.redalimenta.mobile.data

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import android.util.Log
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.HttpException
import java.util.UUID
import java.io.IOException

enum class AppTab(val label: String) {
    PRODUCTS("Productos"),
    BANKS("Bancos"),
    INVENTORY("Inventario"),
    DONATIONS("Donaciones"),
    REQUESTS("Solicitudes"),
    DELIVERIES("Entregas"),
    APPROVALS("Verificaciones"),
    REPORTS("Informes"),
    AVAILABILITY("Disponibilidad"),
    USERS("Usuarios"),
    BANK_DONORS("Donantes"),
    BANK_BENEFICIARIES("Beneficiarios"),
    BANK_HISTORY("Historial"),
    PROFILE("Perfil"),
}

data class AppUiState(
    val user: User? = null,
    val selectedTab: AppTab = AppTab.PRODUCTS,
    val selectedBankId: Int? = null,
    val banks: List<Bank> = emptyList(),
    val products: List<Product> = emptyList(),
    val inventory: List<InventoryItem> = emptyList(),
    val availableProducts: List<AvailableProduct> = emptyList(),
    val donations: List<Donation> = emptyList(),
    val requests: List<FoodRequest> = emptyList(),
    val deliveries: List<Delivery> = emptyList(),
    val registrationRequests: List<RegistrationRequest> = emptyList(),
    val adminUsers: List<AdminUser> = emptyList(),
    val adminUserTotal: Int = 0,
    val adminUserOffset: Int = 0,
    val adminUserLimit: Int = 50,
    val adminUserCounts: AdminUserCounts? = null,
    val adminUserRoleFilter: String? = null,
    val adminUserStatusFilter: String? = null,
    val bankDonors: List<BankDonor> = emptyList(),
    val bankBeneficiaries: List<BankBeneficiary> = emptyList(),
    val bankHistory: List<BankHistoryItem> = emptyList(),
    val report: SystemReport? = null,
    val isLoading: Boolean = false,
    val isRealtimeConnected: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
)

class RedAlimentaViewModel(
    private val api: ApiService = ApiClient.api,
) : ViewModel() {
    private val mutableState = MutableStateFlow(AppUiState())
    val state: StateFlow<AppUiState> = mutableState.asStateFlow()
    private var apiRecoveryJob: Job? = null
    private var realtimeRefreshJob: Job? = null
    private var realtimeRefreshPending = false
    private var isForeground = false

    init {
        recoverSession()
    }

    fun clearFeedback() {
        mutableState.update { it.copy(error = null, notice = null) }
    }

    fun reportError(message: String) {
        mutableState.update { it.copy(error = message) }
    }

    fun onAppForeground() {
        isForeground = true
        val token = try {
            SessionStore.getToken()
        } catch (error: Exception) {
            reportError(error.toApiMessage())
            null
        }
        if (!token.isNullOrBlank()) {
            connectRealtime(token)
            refresh()
        }
    }

    fun onAppBackground() {
        isForeground = false
        RealtimeClient.disconnect()
        mutableState.update { it.copy(isRealtimeConnected = false) }
    }

    fun selectTab(tab: AppTab) {
        mutableState.update { it.copy(selectedTab = tab) }
    }

    fun selectBank(bankId: Int) {
        mutableState.update { it.copy(selectedBankId = bankId) }
        refresh()
    }

    fun filterAdminUsers(role: String?, status: String?) {
        mutableState.update {
            it.copy(adminUserRoleFilter = role, adminUserStatusFilter = status, adminUserOffset = 0)
        }
        loadFilteredAdminUsers()
    }

    fun pageAdminUsers(offset: Int) {
        mutableState.update { it.copy(adminUserOffset = offset.coerceAtLeast(0)) }
        loadFilteredAdminUsers()
    }

    private fun loadFilteredAdminUsers() {
        launchRequest(null) {
            val current = mutableState.value
            val response = api.getUsers(
                current.adminUserRoleFilter,
                current.adminUserStatusFilter,
                current.adminUserOffset,
            )
            mutableState.update {
                it.copy(
                    adminUsers = response.items,
                    adminUserTotal = response.total,
                    adminUserOffset = response.offset,
                    adminUserLimit = response.limit,
                    adminUserCounts = response.counts,
                )
            }
        }
    }

    fun signIn(email: String, password: String) {
        apiRecoveryJob?.cancel()
        realtimeRefreshJob?.cancel()
        RealtimeClient.disconnect()
        mutableState.value = AppUiState(isLoading = true)
        launchRequest("Inicio de sesión correcto.") {
            SessionStore.clearToken()
            val user = try {
                val response = api.login(LoginPayload(email.trim(), password))
                SessionStore.saveToken(response.accessToken)
                api.currentUser()
            } catch (error: CancellationException) {
                clearTokenAfterFailedSignIn(error)
                throw error
            } catch (error: Exception) {
                clearTokenAfterFailedSignIn(error)
                throw error
            }
            mutableState.update {
                AppUiState(
                    user = user,
                    selectedBankId = user.membresias.firstOrNull()?.banco?.id,
                    selectedTab = tabsFor(user.rol).first(),
                    isLoading = true,
                )
            }
            if (user.estado == "ACTIVA") loadData()
            connectRealtimeForCurrentSession()
        }
    }

    fun register(payload: RegisterPayload) {
        launchRequest("Registro enviado. Ya puedes iniciar sesión para consultar su estado.") {
            api.register(payload)
        }
    }

    fun signOut() {
        apiRecoveryJob?.cancel()
        realtimeRefreshJob?.cancel()
        RealtimeClient.disconnect()
        val shouldRevokeSession = mutableState.value.user != null
        mutableState.value = AppUiState(isLoading = true)
        viewModelScope.launch {
            var failure: String? = null
            try {
                if (shouldRevokeSession) api.logout()
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                failure = error.toApiMessage()
            } finally {
                try {
                    SessionStore.clearToken()
                } catch (error: Exception) {
                    failure = listOfNotNull(failure, error.toApiMessage()).joinToString(" ")
                }
                mutableState.value = AppUiState(
                    isLoading = false,
                    error = failure,
                    notice = if (failure == null) "Sesión cerrada." else null,
                )
            }
        }
    }

    fun refresh() {
        if (mutableState.value.user == null) return
        launchRequest(null) {
            val user = api.currentUser()
            mutableState.update { it.copy(user = user) }
            if (user.estado == "ACTIVA") loadData()
            connectRealtimeForCurrentSession()
        }
    }

    fun saveProduct(
        id: Int?,
        product: ProductPayload,
        image: ProductImageUpload? = null,
        removeImage: Boolean = false,
    ) {
        launchRequest(if (id == null) "Producto creado." else "Producto actualizado.") {
            val imagePart = image?.let {
                MultipartBody.Part.createFormData(
                    "imagen",
                    it.fileName,
                    it.content.toRequestBody(it.mimeType.toMediaTypeOrNull()),
                )
            }
            if (id == null) {
                if (imagePart == null) {
                    api.createProduct(product)
                } else {
                    api.createProductWithImage(
                        nombre = product.nombre.asMultipartText(),
                        categoria = product.categoria.asMultipartText(),
                        unidad = product.unidad.asMultipartText(),
                        activo = product.activo.toString().asMultipartText(),
                        imagen = imagePart,
                    )
                }
            } else if (imagePart != null || removeImage) {
                api.updateProductWithImage(
                    id = id,
                    nombre = product.nombre.asMultipartText(),
                    categoria = product.categoria.asMultipartText(),
                    unidad = product.unidad.asMultipartText(),
                    activo = product.activo.toString().asMultipartText(),
                    imagen = imagePart,
                    eliminarImagen = if (removeImage) "true".asMultipartText() else null,
                )
            } else {
                api.updateProduct(id, product)
            }
            loadData()
        }
    }

    fun deactivateProduct(id: Int) {
        launchRequest("Producto desactivado; su historial se conserva.") {
            api.deactivateProduct(id)
            loadData()
        }
    }

    fun deleteProductPermanently(id: Int) {
        launchRequest("Producto y registros relacionados eliminados.") {
            api.deleteProductPermanently(id)
            loadData()
        }
    }

    fun addInventoryProduct(productId: Int) {
        val bankId = mutableState.value.selectedBankId
            ?: return showError("Selecciona un banco antes de modificar su inventario.")
        launchRequest("Producto agregado al inventario.") {
            api.addProductToInventory(bankId, InventoryAddPayload(productId))
            loadData()
        }
    }

    fun setInventoryPublished(productId: Int, published: Boolean) {
        val bankId = mutableState.value.selectedBankId
            ?: return showError("Selecciona un banco antes de modificar su inventario.")
        launchRequest("Visibilidad del producto actualizada.") {
            api.updateInventorySettings(
                bankId,
                productId,
                InventorySettingsPayload(published),
            )
            loadData()
        }
    }

    fun createBank(payload: BankPayload) {
        launchRequest("Banco de alimentos creado.") {
            api.createBank(payload)
            loadData()
        }
    }

    fun deleteBank(id: Int) {
        launchRequest("Banco y registros relacionados eliminados.") {
            api.deleteBank(id)
            loadData()
        }
    }

    fun createBankUser(bankId: Int, payload: BankUserPayload) {
        launchRequest("Usuario del banco creado.") {
            api.createBankUser(bankId, payload)
            loadData()
        }
    }

    fun updateAdminUser(userId: Int, nombre: String, email: String) {
        launchRequest("Usuario actualizado.") {
            api.updateUser(userId, AdminUserUpdatePayload(nombre = nombre.trim(), email = email.trim()))
            loadData()
        }
    }

    fun updateProfile(payload: ProfileUpdatePayload) {
        launchRequest("Perfil actualizado.") {
            api.updateProfile(payload)
            val user = api.currentUser()
            mutableState.update { it.copy(user = user) }
            if (user.estado == "ACTIVA") loadData()
        }
    }

    fun setAdminUserActive(user: AdminUser, active: Boolean) {
        launchRequest(if (active) "Usuario reactivado." else "Usuario suspendido.") {
            api.updateUser(
                user.id,
                AdminUserUpdatePayload(estado = if (active) "ACTIVA" else "SUSPENDIDA"),
            )
            loadData()
        }
    }

    fun deleteAdminUser(userId: Int) {
        launchRequest(null) {
            val result = api.deleteUser(userId)
            loadData()
            mutableState.update {
                it.copy(
                    notice = if (result.documentCleanupWarnings == 0) {
                        "Usuario eliminado permanentemente."
                    } else {
                        "Usuario eliminado, pero ${result.documentCleanupWarnings} documento(s) requieren limpieza."
                    },
                )
            }
        }
    }

    fun uploadVerificationDocument(fileName: String, mimeType: String, content: ByteArray) {
        launchRequest("Documento adjuntado a tu solicitud de verificación.") {
            val body = content.toRequestBody(mimeType.toMediaTypeOrNull())
            val part = MultipartBody.Part.createFormData("documento", fileName, body)
            api.uploadVerificationDocument(part)
            val user = api.currentUser()
            mutableState.update { it.copy(user = user) }
        }
    }

    fun registerDonation(productId: Int, bankId: Int, quantity: Int, expiry: String?) {
        launchRequest("Donación registrada como pendiente; el inventario no cambia hasta su verificación.") {
            api.createDonation(
                DonationPayload(
                    productoId = productId,
                    bancoId = bankId,
                    cantidad = quantity,
                    fechaVencimiento = expiry?.takeIf { it.isNotBlank() },
                ),
            )
            loadData()
        }
    }

    fun reviewDonation(id: Int, accept: Boolean) {
        launchRequest(if (accept) "Donación aceptada e inventario actualizado." else "Donación rechazada.") {
            api.reviewDonation(id, DonationReviewPayload(if (accept) "ACEPTAR" else "RECHAZAR"))
            loadData()
        }
    }

    fun deleteDonation(id: Int) {
        launchRequest("Donación eliminada.") {
            api.deleteDonation(id)
            loadData()
        }
    }

    fun createFoodRequest(bankId: Int, items: List<RequestedProduct>) {
        launchRequest("Solicitud enviada al banco.") {
            api.createRequest(
                CreateRequestPayload(
                    bancoId = bankId,
                    items = items,
                ),
                UUID.randomUUID().toString(),
            )
            loadData()
        }
    }

    fun reviewFoodRequest(request: FoodRequest, approvedItems: List<ApprovedProduct>?) {
        val approve = approvedItems != null
        launchRequest(if (approve) "Decisión de solicitud guardada." else "Solicitud rechazada.") {
            val payload = if (approvedItems != null) {
                RequestReviewPayload(decision = "APROBAR", items = approvedItems)
            } else {
                RequestReviewPayload(decision = "RECHAZAR", motivo = "Solicitud rechazada por el banco.")
            }
            api.reviewRequest(request.id, payload)
            loadData()
        }
    }

    fun deleteFoodRequest(id: Int) {
        launchRequest("Solicitud y entregas pendientes relacionadas eliminadas.") {
            api.deleteRequest(id)
            loadData()
        }
    }

    fun registerDelivery(request: FoodRequest, deliveredBy: String, items: List<DeliveredProduct>) {
        launchRequest("Entrega registrada; queda pendiente la confirmación del beneficiario.") {
            api.createDelivery(
                DeliveryPayload(
                    solicitudId = request.id,
                    items = items,
                    entregadaPor = deliveredBy,
                ),
            )
            loadData()
        }
    }

    fun deleteDelivery(id: Int) {
        launchRequest("Entrega pendiente eliminada.") {
            api.deleteDelivery(id)
            loadData()
        }
    }

    fun confirmDelivery(id: Int, receivedBy: String) {
        launchRequest("Recepción de entrega confirmada.") {
            api.confirmDelivery(id, DeliveryConfirmationPayload(receivedBy))
            loadData()
        }
    }

    fun reviewRegistration(id: Int, approve: Boolean, notes: String? = null) {
        launchRequest(if (approve) "Organización verificada." else "Registro rechazado.") {
            api.reviewRegistration(
                id,
                ReviewRegistrationPayload(
                    decision = if (approve) "APROBAR" else "RECHAZAR",
                    observaciones = notes,
                ),
            )
            loadData()
        }
    }

    private fun recoverSession() {
        viewModelScope.launch {
            mutableState.update { it.copy(isLoading = true) }
            try {
                if (SessionStore.getToken() != null) {
                    val user = api.currentUser()
                    mutableState.update {
                        it.copy(
                            user = user,
                            selectedBankId = user.membresias.firstOrNull()?.banco?.id,
                            selectedTab = tabsFor(user.rol).first(),
                        )
                    }
                    if (user.estado == "ACTIVA") loadData()
                    connectRealtimeForCurrentSession()
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                clearInvalidSessionIfUnauthorized(error)
                val message = error.toApiMessage()
                mutableState.update { it.copy(error = message) }
                if (error is IOException && mutableState.value.user == null) {
                    monitorApiRecovery(message)
                }
            } finally {
                mutableState.update { it.copy(isLoading = false) }
            }
        }
    }

    private suspend fun loadData() {
        val user = mutableState.value.user ?: return
        val banks = api.getBanks()
        val selectedBankId = mutableState.value.selectedBankId
            ?.takeIf { id -> banks.any { it.id == id } }
            ?: user.membresias.firstOrNull()?.banco?.id
            ?: banks.firstOrNull()?.id
        mutableState.update { it.copy(banks = banks, selectedBankId = selectedBankId) }

        when (user.rol) {
            "ADMIN_GENERAL", "SUPER_ADMIN" -> {
                val products = api.getProducts()
                val donations = api.getDonations()
                val requests = api.getRequests()
                val deliveries = api.getDeliveries()
                val registrations = api.getRegistrationRequests()
                val report = api.getReport()
                val users = api.getUsers(
                    mutableState.value.adminUserRoleFilter,
                    mutableState.value.adminUserStatusFilter,
                    mutableState.value.adminUserOffset,
                )
                mutableState.update {
                    it.copy(
                        products = products,
                        donations = donations,
                        requests = requests,
                        deliveries = deliveries,
                        registrationRequests = registrations,
                        adminUsers = users.items,
                        adminUserTotal = users.total,
                        adminUserOffset = users.offset,
                        adminUserLimit = users.limit,
                        adminUserCounts = users.counts,
                        report = report,
                    )
                }

            }
            "BANCO" -> {
                val products = api.getProducts()
                val donations = api.getDonations()
                val requests = api.getRequests()
                val deliveries = api.getDeliveries()
                val inventory = selectedBankId?.let { api.getInventory(it) }.orEmpty()
                val donors = selectedBankId?.let { api.getBankDonors(it) }.orEmpty()
                val beneficiaries = selectedBankId?.let { api.getBankBeneficiaries(it) }.orEmpty()
                val history = selectedBankId?.let { api.getBankHistory(it).items }.orEmpty()
                mutableState.update {
                    it.copy(
                        products = products,
                        inventory = inventory,
                        donations = donations,
                        requests = requests,
                        deliveries = deliveries,
                        bankDonors = donors,
                        bankBeneficiaries = beneficiaries,
                        bankHistory = history,
                    )
                }
            }
            "DONANTE" -> {
                val products = api.getProducts()
                val donations = api.getDonations()
                mutableState.update { it.copy(products = products, donations = donations) }
            }
            "BENEFICIARIO" -> {
                val requests = api.getRequests()
                val deliveries = api.getDeliveries()
                val availability = selectedBankId?.let { api.getAvailability(it) }
                mutableState.update {
                    it.copy(
                        requests = requests,
                        deliveries = deliveries,
                        availableProducts = availability?.productos.orEmpty(),
                    )
                }
            }
        }
    }

    private fun connectRealtimeForCurrentSession() {
        if (!isForeground) return
        val token = try {
            SessionStore.getToken()
        } catch (error: Exception) {
            reportError(error.toApiMessage())
            null
        } ?: return
        connectRealtime(token)
    }

    private fun connectRealtime(token: String) {
        RealtimeClient.connect(
            token = token,
            onConnectionChanged = { connected ->
                mutableState.update { it.copy(isRealtimeConnected = connected) }
            },
            onDataChanged = ::refreshRealtimeData,
        )
    }

    private fun refreshRealtimeData() {
        if (mutableState.value.user == null) return
        if (realtimeRefreshJob?.isActive == true) {
            realtimeRefreshPending = true
            return
        }
        realtimeRefreshJob = viewModelScope.launch {
            do {
                realtimeRefreshPending = false
                delay(200)
                try {
                    val latestUser = api.currentUser()
                    if (mutableState.value.user?.id != latestUser.id) {
                        mutableState.value = AppUiState(
                            user = latestUser,
                            selectedBankId = latestUser.membresias.firstOrNull()?.banco?.id,
                            selectedTab = tabsFor(latestUser.rol).first(),
                        )
                    } else {
                        mutableState.update { it.copy(user = latestUser) }
                    }
                    if (latestUser.estado == "ACTIVA") loadData()
                } catch (error: CancellationException) {
                    throw error
                } catch (error: Exception) {
                    clearInvalidSessionIfUnauthorized(error)
                    Log.e("RedAlimenta", "Realtime data refresh failed", error)
                }
            } while (realtimeRefreshPending && mutableState.value.user != null)
        }
    }

    private fun launchRequest(successMessage: String?, request: suspend () -> Unit) {
        viewModelScope.launch {
            mutableState.update { it.copy(isLoading = true, error = null, notice = null) }
            try {
                request()
                if (successMessage != null) {
                    mutableState.update { it.copy(notice = successMessage) }
                }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                clearInvalidSessionIfUnauthorized(error)
                val message = error.toApiMessage()
                mutableState.update { it.copy(error = message) }
                if (error is IOException && mutableState.value.user == null) {
                    monitorApiRecovery(message)
                }
            } finally {
                mutableState.update { it.copy(isLoading = false) }
            }
        }
    }

    private fun clearInvalidSessionIfUnauthorized(error: Exception) {
        if (error is HttpException && error.code() == 401) {
            apiRecoveryJob?.cancel()
            realtimeRefreshJob?.cancel()
            RealtimeClient.disconnect()
            mutableState.value = AppUiState()
            try {
                SessionStore.clearToken()
            } catch (clearError: Exception) {
                mutableState.update { it.copy(error = clearError.toApiMessage()) }
            }
        }
    }

    private fun clearTokenAfterFailedSignIn(error: Exception) {
        try {
            SessionStore.clearToken()
        } catch (clearError: Exception) {
            error.addSuppressed(clearError)
        }
    }

    private fun monitorApiRecovery(connectionError: String) {
        apiRecoveryJob?.cancel()
        apiRecoveryJob = viewModelScope.launch {
            while (
                mutableState.value.user == null
                && mutableState.value.error == connectionError
            ) {
                delay(3_000)
                try {
                    val response = api.health()
                    if (response.isSuccessful && response.body()?.status == "ok") {
                        val savedToken = SessionStore.getToken()
                        if (!savedToken.isNullOrBlank()) {
                            try {
                                val user = api.currentUser()
                                mutableState.update { current ->
                                    if (current.user == null && current.error == connectionError) {
                                        current.copy(
                                            user = user,
                                            selectedBankId = user.membresias.firstOrNull()?.banco?.id,
                                            selectedTab = tabsFor(user.rol).first(),
                                            error = null,
                                        )
                                    } else {
                                        current
                                    }
                                }
                                if (user.estado == "ACTIVA") loadData()
                                return@launch
                            } catch (error: CancellationException) {
                                throw error
                            } catch (error: HttpException) {
                                if (error.code() == 401) {
                                    clearInvalidSessionIfUnauthorized(error)
                                    mutableState.update { current ->
                                        if (current.error == connectionError) {
                                            current.copy(error = null)
                                        } else {
                                            current
                                        }
                                    }
                                    return@launch
                                }
                                Log.e("RedAlimenta", "API is available but session recovery failed", error)
                                return@launch
                            } catch (error: IOException) {
                                continue
                            } catch (error: Exception) {
                                Log.e("RedAlimenta", "API session recovery failed", error)
                                return@launch
                            }
                        }
                        mutableState.update { current ->
                            if (current.user == null && current.error == connectionError) {
                                current.copy(error = null)
                            } else {
                                current
                            }
                        }
                        return@launch
                    }
                } catch (error: CancellationException) {
                    throw error
                } catch (_: IOException) {
                    // The API is still unreachable; keep checking while this error is visible.
                } catch (error: Exception) {
                    Log.e("RedAlimenta", "API recovery health check failed", error)
                    return@launch
                }
            }
        }
    }

    private fun showError(message: String) {
        mutableState.update { it.copy(error = message) }
    }
}

private fun String.asMultipartText() =
    toRequestBody("text/plain".toMediaTypeOrNull())

fun tabsFor(role: String): List<AppTab> = when (role) {
    "ADMIN_GENERAL", "SUPER_ADMIN" -> listOf(
        AppTab.PRODUCTS,
        AppTab.BANKS,
        AppTab.DONATIONS,
        AppTab.REQUESTS,
        AppTab.DELIVERIES,
        AppTab.APPROVALS,
        AppTab.REPORTS,
        AppTab.USERS,
        AppTab.PROFILE,
    )
    "BANCO" -> listOf(
        AppTab.INVENTORY,
        AppTab.DONATIONS,
        AppTab.REQUESTS,
        AppTab.DELIVERIES,
        AppTab.BANK_DONORS,
        AppTab.BANK_BENEFICIARIES,
        AppTab.BANK_HISTORY,
        AppTab.PROFILE,
    )
    "DONANTE" -> listOf(AppTab.BANKS, AppTab.DONATIONS, AppTab.PROFILE)
    "BENEFICIARIO" -> listOf(AppTab.AVAILABILITY, AppTab.REQUESTS, AppTab.DELIVERIES, AppTab.PROFILE)
    else -> listOf(AppTab.PRODUCTS)
}
