package com.redalimenta.mobile.data

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

enum class AppTab(val label: String) {
    PRODUCTS("Productos"),
    DONATIONS("Donaciones"),
    DELIVERIES("Entregas"),
}

data class AppUiState(
    val selectedTab: AppTab = AppTab.PRODUCTS,
    val products: List<Product> = emptyList(),
    val donations: List<Donation> = emptyList(),
    val deliveries: List<Delivery> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
    val notice: String? = null,
)

class RedAlimentaViewModel(
    private val api: ApiService = ApiClient.service,
) : ViewModel() {
    private val mutableState = MutableStateFlow(AppUiState())
    val state: StateFlow<AppUiState> = mutableState.asStateFlow()

    init {
        refresh()
    }

    fun selectTab(tab: AppTab) {
        mutableState.update { it.copy(selectedTab = tab) }
    }

    fun clearFeedback() {
        mutableState.update { it.copy(error = null, notice = null) }
    }

    fun refresh() {
        viewModelScope.launch {
            mutableState.update { it.copy(isLoading = true, error = null) }
            try {
                val data = loadData()
                mutableState.update { it.withData(data) }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                mutableState.update { it.copy(error = error.toApiMessage()) }
            } finally {
                mutableState.update { it.copy(isLoading = false) }
            }
        }
    }

    fun saveProduct(id: Int?, product: ProductPayload) {
        mutate(if (id == null) "Producto creado." else "Producto actualizado.") {
            if (id == null) api.createProduct(product) else api.updateProduct(id, product)
        }
    }

    fun deactivateProduct(id: Int) {
        mutate("Producto desactivado.") {
            api.deactivateProduct(id)
        }
    }

    fun registerDonation(donation: DonationPayload) {
        mutate("Donación registrada.") {
            api.createDonation(donation)
        }
    }

    fun registerDelivery(delivery: DeliveryPayload) {
        mutate("Entrega registrada.") {
            api.createDelivery(delivery)
        }
    }

    private fun mutate(successMessage: String, request: suspend () -> Unit) {
        viewModelScope.launch {
            mutableState.update { it.copy(isLoading = true, error = null, notice = null) }
            var requestSucceeded = false
            try {
                request()
                requestSucceeded = true
                val data = loadData()
                mutableState.update { it.withData(data).copy(notice = successMessage) }
            } catch (error: CancellationException) {
                throw error
            } catch (error: Exception) {
                mutableState.update {
                    it.copy(
                        error = if (requestSucceeded) {
                            "La operación se completó, pero no se pudo actualizar la información. " +
                                error.toApiMessage()
                        } else {
                            error.toApiMessage()
                        },
                    )
                }
            } finally {
                mutableState.update { it.copy(isLoading = false) }
            }
        }
    }

    private suspend fun loadData(): Triple<List<Product>, List<Donation>, List<Delivery>> =
        coroutineScope {
            val products = async { api.getProducts() }
            val donations = async { api.getDonations() }
            val deliveries = async { api.getDeliveries() }
            Triple(products.await(), donations.await(), deliveries.await())
        }

    private fun AppUiState.withData(
        data: Triple<List<Product>, List<Donation>, List<Delivery>>,
    ): AppUiState = copy(
        products = data.first,
        donations = data.second,
        deliveries = data.third,
    )
}
