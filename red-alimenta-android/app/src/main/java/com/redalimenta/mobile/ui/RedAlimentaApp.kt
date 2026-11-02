package com.redalimenta.mobile.ui

import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Inventory2
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.VolunteerActivism
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Block
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.redalimenta.mobile.data.AppTab
import com.redalimenta.mobile.data.DeliveryPayload
import com.redalimenta.mobile.data.DonationPayload
import com.redalimenta.mobile.data.Delivery
import com.redalimenta.mobile.data.Donation
import com.redalimenta.mobile.data.Product
import com.redalimenta.mobile.data.RedAlimentaViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RedAlimentaApp(viewModel: RedAlimentaViewModel) {
    val state by viewModel.state.collectAsState()
    var showProductForm by remember { mutableStateOf(false) }
    var productBeingEdited by remember { mutableStateOf<Product?>(null) }
    var showMovementForm by remember { mutableStateOf(false) }

    MaterialTheme {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = {
                        Column {
                            Text("Red Alimenta", fontWeight = FontWeight.Bold)
                            Text(
                                state.selectedTab.label,
                                style = MaterialTheme.typography.labelMedium,
                            )
                        }
                    },
                    actions = {
                        IconButton(
                            onClick = {
                                viewModel.clearFeedback()
                                viewModel.refresh()
                            },
                        ) {
                            Icon(Icons.Default.Refresh, contentDescription = "Actualizar")
                        }
                    },
                )
            },
            bottomBar = {
                NavigationBar {
                    AppTab.entries.forEach { tab ->
                        NavigationBarItem(
                            selected = state.selectedTab == tab,
                            onClick = { viewModel.selectTab(tab) },
                            icon = {
                                Icon(
                                    imageVector = when (tab) {
                                        AppTab.PRODUCTS -> Icons.Default.Inventory2
                                        AppTab.DONATIONS -> Icons.Default.VolunteerActivism
                                        AppTab.DELIVERIES -> Icons.Default.LocalShipping
                                    },
                                    contentDescription = tab.label,
                                )
                            },
                            label = { Text(tab.label) },
                        )
                    }
                }
            },
        ) { innerPadding ->
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
            ) {
                if (state.isLoading) {
                    LinearProgressIndicator(modifier = Modifier.fillMaxWidth())
                }
                state.error?.let { message ->
                    FeedbackCard(message = message, isError = true) {
                        viewModel.clearFeedback()
                    }
                }
                state.notice?.let { message ->
                    FeedbackCard(message = message, isError = false) {
                        viewModel.clearFeedback()
                    }
                }

                when (state.selectedTab) {
                    AppTab.PRODUCTS -> ProductList(
                        products = state.products,
                        onAdd = {
                            productBeingEdited = null
                            showProductForm = true
                        },
                        onEdit = { product ->
                            productBeingEdited = product
                            showProductForm = true
                        },
                        onDeactivate = viewModel::deactivateProduct,
                    )
                    AppTab.DONATIONS -> DonationList(
                        donations = state.donations,
                        onAdd = { showMovementForm = true },
                    )
                    AppTab.DELIVERIES -> DeliveryList(
                        deliveries = state.deliveries,
                        onAdd = { showMovementForm = true },
                    )
                }
            }
        }
    }

    if (showProductForm) {
        ProductFormDialog(
            product = productBeingEdited,
            onDismiss = { showProductForm = false },
            onSave = { payload ->
                viewModel.saveProduct(productBeingEdited?.id, payload)
                showProductForm = false
            },
        )
    }

    if (showMovementForm) {
        val isDonation = state.selectedTab == AppTab.DONATIONS
        MovementFormDialog(
            title = if (isDonation) "Registrar donación" else "Registrar entrega",
            products = state.products,
            isDonation = isDonation,
            onDismiss = { showMovementForm = false },
            onSave = { productId, quantity, reference ->
                if (isDonation) {
                    viewModel.registerDonation(
                        DonationPayload(
                            productId = productId,
                            cantidad = quantity,
                            donorReference = reference,
                        ),
                    )
                } else {
                    viewModel.registerDelivery(
                        DeliveryPayload(
                            productId = productId,
                            cantidad = quantity,
                            beneficiaryReference = reference,
                        ),
                    )
                }
                showMovementForm = false
            },
        )
    }
}

@Composable
private fun ProductList(
    products: List<Product>,
    onAdd: () -> Unit,
    onEdit: (Product) -> Unit,
    onDeactivate: (Int) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Button(
            onClick = onAdd,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Icon(Icons.Default.Add, contentDescription = null)
            Text("  Nuevo producto")
        }
        if (products.isEmpty()) {
            EmptyState("No hay productos registrados.")
        } else {
            LazyColumn(
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(products, key = { it.id }) { product ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(start = 16.dp, top = 14.dp, bottom = 14.dp, end = 8.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(product.nombre, fontWeight = FontWeight.SemiBold)
                                Text("${product.categoria} · ${product.stockActual} ${product.unidad}")
                                Text(
                                    if (product.activo) "Activo" else "Inactivo",
                                    style = MaterialTheme.typography.labelMedium,
                                    color = if (product.activo) {
                                        MaterialTheme.colorScheme.primary
                                    } else {
                                        MaterialTheme.colorScheme.error
                                    },
                                )
                            }
                            IconButton(onClick = { onEdit(product) }) {
                                Icon(Icons.Default.Edit, contentDescription = "Editar producto")
                            }
                            if (product.activo) {
                                IconButton(onClick = { onDeactivate(product.id) }) {
                                    Icon(Icons.Default.Block, contentDescription = "Desactivar producto")
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DonationList(donations: List<Donation>, onAdd: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        Button(
            onClick = onAdd,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Icon(Icons.Default.Add, contentDescription = null)
            Text("  Registrar donación")
        }
        if (donations.isEmpty()) {
            EmptyState("Aún no hay donaciones registradas.")
        } else {
            LazyColumn(
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(donations, key = { it.id }) { DonationCard(it) }
            }
        }
    }
}

@Composable
private fun DeliveryList(deliveries: List<Delivery>, onAdd: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        Button(
            onClick = onAdd,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 12.dp),
        ) {
            Icon(Icons.Default.Add, contentDescription = null)
            Text("  Registrar entrega")
        }
        if (deliveries.isEmpty()) {
            EmptyState("Aún no hay entregas registradas.")
        } else {
            LazyColumn(
                contentPadding = PaddingValues(start = 16.dp, end = 16.dp, bottom = 16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(deliveries, key = { it.id }) { DeliveryCard(it) }
            }
        }
    }
}

@Composable
private fun DonationCard(donation: Donation) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(donation.producto.nombre, fontWeight = FontWeight.SemiBold)
            Text("+${donation.cantidad} ${donation.producto.unidad} · ${donation.donanteReferencia}")
            Text(donation.fecha.substringBefore('T'), style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun DeliveryCard(delivery: Delivery) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(delivery.producto.nombre, fontWeight = FontWeight.SemiBold)
            Text("-${delivery.cantidad} ${delivery.producto.unidad} · ${delivery.beneficiaryReference}")
            Text(delivery.fecha.substringBefore('T'), style = MaterialTheme.typography.labelMedium)
        }
    }
}

@Composable
private fun EmptyState(message: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp, vertical = 48.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(message, style = MaterialTheme.typography.bodyLarge)
    }
}

@Composable
private fun FeedbackCard(message: String, isError: Boolean, onDismiss: () -> Unit) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
    ) {
        Row(
            modifier = Modifier.padding(start = 16.dp, top = 10.dp, bottom = 10.dp, end = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                message,
                modifier = Modifier.weight(1f),
                color = if (isError) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
            )
            TextButton(onClick = onDismiss) { Text("Cerrar") }
        }
    }
}

@Preview(showBackground = true)
@Composable
fun ProductListPreview() {
    MaterialTheme {
        ProductList(
            products = listOf(
                Product(id = 1, nombre = "Arroz", categoria = "Cereal", unidad = "kg", stockActual = 50, activo = true),
                Product(id = 2, nombre = "Frijoles", categoria = "Legumbres", unidad = "kg", stockActual = 0, activo = false),
            ),
            onAdd = {},
            onEdit = {},
            onDeactivate = {},
        )
    }
}

