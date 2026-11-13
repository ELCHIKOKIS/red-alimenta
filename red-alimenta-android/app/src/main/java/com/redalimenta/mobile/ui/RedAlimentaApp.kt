package com.redalimenta.mobile.ui

import android.provider.OpenableColumns
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.background
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Assignment
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.Assessment
import androidx.compose.material.icons.filled.Assignment
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Inventory
import androidx.compose.material.icons.filled.LocalShipping
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Wifi
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ElevatedCard
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.SnackbarDuration
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.redalimenta.mobile.data.AppTab
import com.redalimenta.mobile.data.AppUiState
import com.redalimenta.mobile.data.AdminUser
import com.redalimenta.mobile.data.displayRoleName
import com.redalimenta.mobile.data.isAdminRole
import com.redalimenta.mobile.data.isSuperAdmin
import com.redalimenta.mobile.data.ApprovedProduct
import com.redalimenta.mobile.data.Bank
import com.redalimenta.mobile.data.BankBeneficiary
import com.redalimenta.mobile.data.BankDonor
import com.redalimenta.mobile.data.BankHistoryItem
import com.redalimenta.mobile.data.Delivery
import com.redalimenta.mobile.data.DeliveredProduct
import com.redalimenta.mobile.data.FoodRequest
import com.redalimenta.mobile.data.InventoryItem
import com.redalimenta.mobile.data.Product
import com.redalimenta.mobile.data.RedAlimentaViewModel
import com.redalimenta.mobile.data.prepareProductImageUpload
import com.redalimenta.mobile.data.RegistrationRequest
import com.redalimenta.mobile.data.User
import com.redalimenta.mobile.data.tabsFor
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RedAlimentaApp(viewModel: RedAlimentaViewModel) {
    val state by viewModel.state.collectAsState()
    val context = LocalContext.current
    var showPendingProfileForm by remember { mutableStateOf(false) }
    val documentPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri ->
        if (uri != null) {
            runCatching {
                val mimeType = context.contentResolver.getType(uri) ?: "application/octet-stream"
                val fileName = context.contentResolver.query(uri, null, null, null, null)?.use { cursor ->
                    val nameIndex = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME)
                    if (cursor.moveToFirst() && nameIndex >= 0) cursor.getString(nameIndex) else "documento"
                } ?: "documento"
                val content = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                    ?: error("No se pudo leer el documento seleccionado.")
                if (content.size > 5 * 1024 * 1024) {
                    error("El documento supera el límite de 5 MB.")
                }
                viewModel.uploadVerificationDocument(fileName, mimeType, content)
            }.onFailure { error ->
                viewModel.reportError(error.message ?: "No se pudo cargar el documento.")
            }
        }
    }

    val lifecycleOwner = LocalLifecycleOwner.current
    DisposableEffect(lifecycleOwner, viewModel) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> viewModel.onAppForeground()
                Lifecycle.Event.ON_STOP -> viewModel.onAppBackground()
                else -> Unit
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            viewModel.onAppBackground()
        }
    }

    RedAlimentaTheme {
        Surface(
            modifier = Modifier.fillMaxSize(),
            color = MaterialTheme.colorScheme.background,
        ) {
            val user = state.user
            when {
                user == null -> AuthScreen(
                    isLoading = state.isLoading,
                    error = state.error,
                    notice = state.notice,
                    onSignIn = viewModel::signIn,
                    onRegister = viewModel::register,
                    onClearFeedback = viewModel::clearFeedback,
                )
                user.rol == "BENEFICIARIO" && user.estado != "ACTIVA" -> PendingRegistrationScreen(
                    user = user,
                    isLoading = state.isLoading,
                    error = state.error,
                    onRefresh = viewModel::refresh,
                    onUploadDocument = { documentPicker.launch("*/*") },
                    onEditProfile = { showPendingProfileForm = true },
                    onSignOut = viewModel::signOut,
                )
                user.estado != "ACTIVA" -> InactiveAccountScreen(
                    user = user,
                    isLoading = state.isLoading,
                    error = state.error,
                    onRefresh = viewModel::refresh,
                    onSignOut = viewModel::signOut,
                )
                else -> MainDashboard(viewModel, state)
            }
            if (showPendingProfileForm && user != null) {
                ProfileEditDialog(
                    user = user,
                    onDismiss = { showPendingProfileForm = false },
                    onSave = {
                        viewModel.updateProfile(it)
                        showPendingProfileForm = false
                    },
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainDashboard(viewModel: RedAlimentaViewModel, state: AppUiState) {
    val user = state.user ?: return
    val context = LocalContext.current
    val coroutineScope = rememberCoroutineScope()
    var showProductForm by remember { mutableStateOf(false) }
    var showBankForm by remember { mutableStateOf(false) }
    var showDonationForm by remember { mutableStateOf(false) }
    var showRequestForm by remember { mutableStateOf(false) }
    var deliveryRequest by remember { mutableStateOf<FoodRequest?>(null) }
    var confirmationDelivery by remember { mutableStateOf<Delivery?>(null) }
    var productBeingEdited by remember { mutableStateOf<Product?>(null) }
    var bankForNewUser by remember { mutableStateOf<Int?>(null) }
    var userBeingEdited by remember { mutableStateOf<AdminUser?>(null) }
    var userPendingDeletion by remember { mutableStateOf<AdminUser?>(null) }
    var showProfileForm by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(state.error, state.notice) {
        val message = state.error ?: state.notice
        if (!message.isNullOrBlank()) {
            snackbarHostState.showSnackbar(message, duration = SnackbarDuration.Short)
            viewModel.clearFeedback()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.primaryContainer,
                        ) {
                            Text(
                                user.nombre.trim().firstOrNull()?.uppercase() ?: "R",
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                                color = MaterialTheme.colorScheme.primary,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold,
                            )
                        }
                        Column(modifier = Modifier.padding(start = 10.dp)) {
                            Text("RED-ALIMENTA", fontWeight = FontWeight.Bold)
                            Text(
                                "${user.nombre} · ${displayRoleName(user.rol)}",
                                style = MaterialTheme.typography.labelMedium,
                                maxLines = 1,
                            )
                            Surface(
                                shape = MaterialTheme.shapes.small,
                                color = if (state.isRealtimeConnected) {
                                    MaterialTheme.colorScheme.primaryContainer
                                } else {
                                    MaterialTheme.colorScheme.surfaceVariant
                                },
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 7.dp, vertical = 2.dp),
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Icon(
                                        imageVector = if (state.isRealtimeConnected) {
                                            Icons.Default.Wifi
                                        } else {
                                            Icons.Default.WifiOff
                                        },
                                        contentDescription = null,
                                        modifier = Modifier.width(14.dp).height(14.dp),
                                        tint = MaterialTheme.colorScheme.primary,
                                    )
                                    Text(
                                        if (state.isRealtimeConnected) "En vivo" else "Sin conexión",
                                        modifier = Modifier.padding(start = 4.dp),
                                        style = MaterialTheme.typography.labelSmall,
                                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                                    )
                                }
                            }
                        }
                    }
                },
                actions = {
                    IconButton(onClick = viewModel::refresh) {
                        Icon(Icons.Default.Refresh, contentDescription = "Actualizar")
                    }
                    IconButton(onClick = viewModel::signOut) {
                        Icon(Icons.AutoMirrored.Filled.ExitToApp, contentDescription = "Cerrar sesión")
                    }
                },
            )
        },
        bottomBar = {
            val tabs = tabsFor(user.rol)
            if (tabs.size <= 4) {
                NavigationBar {
                    tabs.forEach { tab ->
                        NavigationBarItem(
                            selected = state.selectedTab == tab,
                            onClick = { viewModel.selectTab(tab) },
                            icon = { Icon(tabIcon(tab), contentDescription = null) },
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
        },
    ) { innerPadding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
                .animateContentSize()
                .padding(innerPadding),
        ) {
            val tabs = tabsFor(user.rol)
            if (tabs.size > 4) {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(tabs) { tab ->
                        FilterChip(
                            selected = state.selectedTab == tab,
                            onClick = { viewModel.selectTab(tab) },
                            label = { Text(tab.label) },
                        )
                    }
                }
            }
            if (user.rol == "BANCO" || user.rol == "BENEFICIARIO") {
                BankSelector(state.banks, state.selectedBankId, viewModel::selectBank)
            }
            if (state.isLoading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())

            when (state.selectedTab) {
                AppTab.PRODUCTS -> ProductList(
                    products = state.products,
                    onAdd = { productBeingEdited = null; showProductForm = true },
                    onEdit = { productBeingEdited = it; showProductForm = true },
                    onDeactivate = viewModel::deactivateProduct,
                )
                AppTab.BANKS -> BankList(
                    banks = state.banks,
                    selectedBankId = state.selectedBankId,
                    canCreate = isAdminRole(user.rol),
                    canManageUsers = isAdminRole(user.rol),
                    onSelect = viewModel::selectBank,
                    onAdd = { showBankForm = true },
                    onCreateUser = { bankForNewUser = it },
                )
                AppTab.INVENTORY -> InventoryList(
                    inventory = state.inventory,
                    products = state.products,
                    onAddProduct = viewModel::addInventoryProduct,
                    onPublish = viewModel::setInventoryPublished,
                )
                AppTab.DONATIONS -> DonationList(
                    donations = state.donations,
                    canRegister = user.rol == "DONANTE",
                    canReview = user.rol == "BANCO" || isAdminRole(user.rol),
                    onAdd = { showDonationForm = true },
                    onReview = viewModel::reviewDonation,
                )
                AppTab.REQUESTS -> RequestList(
                    requests = state.requests,
                    deliveries = state.deliveries,
                    canCreate = user.rol == "BENEFICIARIO",
                    canReview = user.rol == "BANCO" || isAdminRole(user.rol),
                    canDeliver = user.rol == "BANCO" || isAdminRole(user.rol),
                    onCreate = { showRequestForm = true },
                    onReview = { request, approvals ->
                        viewModel.reviewFoodRequest(request, approvals)
                    },
                    onDeliver = { deliveryRequest = it },
                )
                AppTab.DELIVERIES -> DeliveryList(
                    deliveries = state.deliveries,
                    canConfirm = user.rol == "BENEFICIARIO",
                    onConfirm = { confirmationDelivery = it },
                )
                AppTab.APPROVALS -> RegistrationList(
                    registrations = state.registrationRequests,
                    onReview = viewModel::reviewRegistration,
                )
                AppTab.REPORTS -> ReportList(state.report)
                AppTab.USERS -> AdminUserList(
                    users = state.adminUsers,
                    filteredTotal = state.adminUserTotal,
                    offset = state.adminUserOffset,
                    pageSize = state.adminUserLimit,
                    counts = state.adminUserCounts,
                    roleFilter = state.adminUserRoleFilter,
                    statusFilter = state.adminUserStatusFilter,
                    currentUserId = user.id,
                    canDeleteUsers = isSuperAdmin(user.rol),
                    onEdit = { userBeingEdited = it },
                    onSetActive = viewModel::setAdminUserActive,
                    onDelete = { userPendingDeletion = it },
                    onFilter = viewModel::filterAdminUsers,
                    onPage = viewModel::pageAdminUsers,
                )
                AppTab.AVAILABILITY -> AvailabilityList(
                    products = state.availableProducts,
                    onRequest = { showRequestForm = true },
                )
                AppTab.BANK_DONORS -> BankDonorList(state.bankDonors)
                AppTab.BANK_BENEFICIARIES -> BankBeneficiaryList(state.bankBeneficiaries)
                AppTab.BANK_HISTORY -> BankHistoryList(state.bankHistory)
                AppTab.PROFILE -> ProfileSummary(user, onEdit = { showProfileForm = true })
            }
        }
    }

    if (showProductForm) {
        ProductFormDialog(
            product = productBeingEdited,
            onDismiss = { showProductForm = false },
            onSave = { payload, selectedImage, removeImage ->
                val productId = productBeingEdited?.id
                showProductForm = false
                coroutineScope.launch {
                    try {
                        val imageUpload = selectedImage?.let { uri ->
                            withContext(Dispatchers.IO) {
                                prepareProductImageUpload(context, uri)
                            }
                        }
                        viewModel.saveProduct(productId, payload, imageUpload, removeImage)
                    } catch (error: CancellationException) {
                        throw error
                    } catch (error: Exception) {
                        viewModel.reportError(
                            error.message ?: "No se pudo preparar la fotografía del producto.",
                        )
                    }
                }
            },
        )
    }
    if (showBankForm) {
        BankFormDialog(
            onDismiss = { showBankForm = false },
            onSave = {
                viewModel.createBank(it)
                showBankForm = false
            },
        )
    }
    bankForNewUser?.let { bankId ->
        BankUserFormDialog(
            onDismiss = { bankForNewUser = null },
            onSave = {
                viewModel.createBankUser(bankId, it)
                bankForNewUser = null
            },
        )
    }
    userBeingEdited?.let { userToEdit ->
        AdminUserEditDialog(
            user = userToEdit,
            onDismiss = { userBeingEdited = null },
            onSave = { name, email ->
                viewModel.updateAdminUser(userToEdit.id, name, email)
                userBeingEdited = null
            },
        )
    }
    userPendingDeletion?.let { userToDelete ->
        AlertDialog(
            onDismissRequest = { userPendingDeletion = null },
            title = { Text("Eliminar usuario permanentemente") },
            text = {
                Text(
                    "Se eliminará la cuenta de ${userToDelete.nombre} (${userToDelete.email}), " +
                        "junto con sus solicitudes, donaciones, entregas pendientes, registros de auditoría " +
                        "y documentos. Las entregas confirmadas no se pueden eliminar. Esta acción no se puede deshacer.",
                )
            },
            confirmButton = {
                Button(onClick = {
                    viewModel.deleteAdminUser(userToDelete.id)
                    userPendingDeletion = null
                }) {
                    Text("Eliminar definitivamente")
                }
            },
            dismissButton = {
                TextButton(onClick = { userPendingDeletion = null }) { Text("Cancelar") }
            },
        )
    }
    if (showProfileForm) {
        ProfileEditDialog(
            user = user,
            onDismiss = { showProfileForm = false },
            onSave = {
                viewModel.updateProfile(it)
                showProfileForm = false
            },
        )
    }
    if (showDonationForm) {
        DonationFormDialog(
            products = state.products,
            banks = state.banks,
            selectedBankId = state.selectedBankId,
            onDismiss = { showDonationForm = false },
            onSave = { productId, bankId, quantity, expiry ->
                viewModel.registerDonation(productId, bankId, quantity, expiry)
                showDonationForm = false
            },
        )
    }
    if (showRequestForm) {
        RequestFormDialog(
            products = state.availableProducts,
            onDismiss = { showRequestForm = false },
            onSave = { items ->
                state.selectedBankId?.let { viewModel.createFoodRequest(it, items) }
                showRequestForm = false
            },
        )
    }
    deliveryRequest?.let { request ->
        DeliveryFormDialog(
            request = request,
            deliveries = state.deliveries,
            onDismiss = { deliveryRequest = null },
            onSave = { deliveredBy, items ->
                viewModel.registerDelivery(request, deliveredBy, items)
                deliveryRequest = null
            },
        )
    }
    confirmationDelivery?.let { delivery ->
        TextInputDialog(
            title = "Confirmar recepción",
            label = "Persona que recibe",
            onDismiss = { confirmationDelivery = null },
            onSave = {
                viewModel.confirmDelivery(delivery.id, it)
                confirmationDelivery = null
            },
        )
    }
}

@Composable
private fun BankSelector(banks: List<Bank>, selectedBankId: Int?, onSelect: (Int) -> Unit) {
    if (banks.size <= 1) return
    LazyRow(
        contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(banks, key = { it.id }) { bank ->
            FilterChip(
                selected = bank.id == selectedBankId,
                onClick = { onSelect(bank.id) },
                label = { Text(bank.nombre) },
            )
        }
    }
}

@Composable
private fun tabIcon(tab: AppTab) = when (tab) {
    AppTab.PRODUCTS, AppTab.INVENTORY, AppTab.AVAILABILITY -> Icons.Default.Inventory
    AppTab.BANKS -> Icons.Default.AccountBalance
    AppTab.DONATIONS -> Icons.Default.Favorite
    AppTab.REQUESTS -> Icons.AutoMirrored.Filled.Assignment
    AppTab.DELIVERIES -> Icons.Default.LocalShipping
    AppTab.APPROVALS -> Icons.Default.VerifiedUser
    AppTab.REPORTS -> Icons.Default.Assessment
    AppTab.USERS, AppTab.BANK_DONORS, AppTab.BANK_BENEFICIARIES -> Icons.Default.People
    AppTab.BANK_HISTORY -> Icons.Default.History
    AppTab.PROFILE -> Icons.Default.Person
}

@Composable
private fun Card(
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit,
) {
    ElevatedCard(
        modifier = modifier,
        elevation = CardDefaults.elevatedCardElevation(defaultElevation = 2.dp),
        content = content,
    )
}

@Composable
private fun ProductList(
    products: List<Product>,
    onAdd: () -> Unit,
    onEdit: (Product) -> Unit,
    onDeactivate: (Int) -> Unit,
) {
    var selectedFilter by remember { mutableStateOf("ACTIVOS") }
    var pendingDeactivation by remember { mutableStateOf<Product?>(null) }
    Column(modifier = Modifier.fillMaxSize()) {
        Button(onClick = onAdd, modifier = Modifier.fillMaxWidth().padding(12.dp)) {
            Icon(Icons.Default.Add, contentDescription = null)
            Text("  Crear producto de catálogo")
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.padding(horizontal = 12.dp)) {
            listOf("ACTIVOS", "DESACTIVADOS", "TODOS").forEach { filter ->
                FilterChip(
                    selected = selectedFilter == filter,
                    onClick = { selectedFilter = filter },
                    label = { Text(filter) },
                )
            }
        }
        val visible = products.filter {
            selectedFilter == "TODOS" ||
                (selectedFilter == "ACTIVOS" && it.activo) ||
                (selectedFilter == "DESACTIVADOS" && !it.activo)
        }
        if (visible.isEmpty()) {
            EmptyState(if (products.isEmpty()) "Aún no hay productos registrados." else "No hay productos en esta vista.")
        } else {
            LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(visible, key = { it.id }) { product ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(
                            modifier = Modifier.fillMaxWidth().padding(14.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                ProductImage(
                                    category = product.categoria,
                                    imageUrl = product.imagenUrl,
                                    contentDescription = product.nombre,
                                    modifier = Modifier.width(72.dp).height(72.dp),
                                )
                                Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                                    Text(product.nombre, fontWeight = FontWeight.SemiBold)
                                    Text("${product.categoria} · ${product.unidad}")
                                    Text(
                                        if (product.activo) "Catálogo activo"
                                        else "Desactivado; historial conservado",
                                        style = MaterialTheme.typography.bodySmall,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                            }
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.End,
                            ) {
                                TextButton(onClick = { onEdit(product) }) { Text("Editar") }
                                if (product.activo) {
                                    TextButton(onClick = { pendingDeactivation = product }) {
                                        Text("Desactivar")
                                    }
                                }
                            }
                        }
                        pendingDeactivation?.let { product ->
                            AlertDialog(
                                onDismissRequest = { pendingDeactivation = null },
                                title = { Text("Desactivar producto") },
                                text = {
                                    Text(
                                        "${product.nombre} dejará de publicarse en todos los bancos. " +
                                            "El producto y los movimientos históricos se conservarán.",
                                    )
                                },
                                confirmButton = {
                                    TextButton(onClick = {
                                        onDeactivate(product.id)
                                        pendingDeactivation = null
                                    }) { Text("Desactivar") }
                                },
                                dismissButton = {
                                    TextButton(onClick = { pendingDeactivation = null }) { Text("Cancelar") }
                                },
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BankList(
    banks: List<Bank>,
    selectedBankId: Int?,
    canCreate: Boolean,
    canManageUsers: Boolean,
    onSelect: (Int) -> Unit,
    onAdd: () -> Unit,
    onCreateUser: (Int) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        if (canCreate) {
            Button(onClick = onAdd, modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                Icon(Icons.Default.Add, contentDescription = null)
                Text("  Registrar banco")
            }
        }
        if (banks.isEmpty()) {
            EmptyState("No hay bancos de alimentos disponibles.")
        } else {
            LazyColumn(
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(banks, key = { it.id }) { bank ->
                    Card(modifier = Modifier.fillMaxWidth()) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(bank.nombre, fontWeight = FontWeight.SemiBold)
                            Text("${bank.municipio}, ${bank.departamento}")
                            Text(bank.estado)
                            TextButton(onClick = { onSelect(bank.id) }) {
                                Text(if (bank.id == selectedBankId) "Banco seleccionado" else "Seleccionar banco")
                            }
                            if (canManageUsers) {
                                TextButton(onClick = { onCreateUser(bank.id) }) {
                                    Text("Crear usuario del banco")
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
private fun AdminUserList(
    users: List<AdminUser>,
    filteredTotal: Int,
    offset: Int,
    pageSize: Int,
    counts: com.redalimenta.mobile.data.AdminUserCounts?,
    roleFilter: String?,
    statusFilter: String?,
    currentUserId: Int,
    canDeleteUsers: Boolean,
    onEdit: (AdminUser) -> Unit,
    onSetActive: (AdminUser, Boolean) -> Unit,
    onDelete: (AdminUser) -> Unit,
    onFilter: (String?, String?) -> Unit,
    onPage: (Int) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            Text(
                "Usuarios registrados: ${counts?.total ?: 0}",
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold,
            )
        }
        item { Text("Filtrar por rol", style = MaterialTheme.typography.labelLarge) }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    FilterChip(
                        selected = roleFilter == null,
                        onClick = { onFilter(null, statusFilter) },
                        label = { Text("Todos (${counts?.total ?: 0})") },
                    )
                }
                items(listOf("ADMIN_GENERAL", "SUPER_ADMIN", "BANCO", "DONANTE", "BENEFICIARIO")) { role ->
                    FilterChip(
                        selected = roleFilter == role,
                        onClick = { onFilter(if (roleFilter == role) null else role, statusFilter) },
                        label = { Text("${displayRoleName(role)} (${counts?.byRole?.get(role) ?: 0})") },
                    )
                }
            }
        }
        item { Text("Filtrar por estado", style = MaterialTheme.typography.labelLarge) }
        item {
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                item {
                    FilterChip(
                        selected = statusFilter == null,
                        onClick = { onFilter(roleFilter, null) },
                        label = { Text("Todos (${counts?.total ?: 0})") },
                    )
                }
                items(listOf("ACTIVA", "PENDIENTE", "SUSPENDIDA", "RECHAZADA")) { status ->
                    FilterChip(
                        selected = statusFilter == status,
                        onClick = { onFilter(roleFilter, if (statusFilter == status) null else status) },
                        label = { Text("${statusLabel(status)} (${counts?.byStatus?.get(status) ?: 0})") },
                    )
                }
            }
        }
        item {
            Text(
                if (filteredTotal == 0) "No hay usuarios que coincidan con los filtros."
                else "Mostrando ${offset + 1}-${offset + users.size} de $filteredTotal.",
                style = MaterialTheme.typography.bodySmall,
            )
        }
        if (users.isEmpty()) {
            item { EmptyState("No hay usuarios que coincidan con estos filtros.") }
        } else {
            items(users, key = { it.id }) { user ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(user.nombre, fontWeight = FontWeight.SemiBold)
                        Text(user.email)
                        Text("Rol: ${displayRoleName(user.rol)} · Estado: ${statusLabel(user.estado)}")
                        val banks = user.membresias.joinToString { it.banco.nombre }
                        if (banks.isNotBlank()) Text("Bancos: $banks")
                        Row {
                            if (!isSuperAdmin(user.rol) || canDeleteUsers) {
                                TextButton(onClick = { onEdit(user) }) { Text("Editar") }
                            }
                            if (user.id != currentUserId) {
                                if (!isSuperAdmin(user.rol) || canDeleteUsers) {
                                    TextButton(onClick = { onSetActive(user, user.estado != "ACTIVA") }) {
                                        Text(if (user.estado == "ACTIVA") "Suspender" else "Reactivar")
                                    }
                                    if (canDeleteUsers) {
                                        TextButton(onClick = { onDelete(user) }) { Text("Eliminar") }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        if (filteredTotal > pageSize) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                ) {
                    TextButton(onClick = { onPage(offset - pageSize) }, enabled = offset > 0) {
                        Text("Anterior")
                    }
                    TextButton(
                        onClick = { onPage(offset + pageSize) },
                        enabled = offset + users.size < filteredTotal,
                    ) {
                        Text("Siguiente")
                    }
                }
            }
        }
    }
}

private fun statusLabel(status: String): String = when (status) {
    "ACTIVA" -> "Activo"
    "PENDIENTE" -> "Pendiente"
    "SUSPENDIDA" -> "Suspendido"
    "RECHAZADA" -> "Rechazado"
    else -> status
}

private fun donationStatusLabel(status: String): String = when (status) {
    "ACEPTADA" -> "Aceptada"
    "PENDIENTE" -> "Pendiente"
    "RECHAZADA" -> "Rechazada"
    else -> status
}

@Composable
private fun DonationStatusChip(status: String) {
    val backgroundColor = when (status) {
        "ACEPTADA" -> MaterialTheme.colorScheme.primaryContainer
        "RECHAZADA" -> MaterialTheme.colorScheme.errorContainer
        else -> MaterialTheme.colorScheme.secondaryContainer
    }
    val textColor = when (status) {
        "RECHAZADA" -> MaterialTheme.colorScheme.onErrorContainer
        "ACEPTADA" -> MaterialTheme.colorScheme.onPrimaryContainer
        else -> MaterialTheme.colorScheme.onSecondaryContainer
    }
    Surface(shape = MaterialTheme.shapes.small, color = backgroundColor) {
        Text(
            donationStatusLabel(status),
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp),
            style = MaterialTheme.typography.labelMedium,
            color = textColor,
        )
    }
}

@Composable
private fun BankDonorList(donors: List<BankDonor>) {
    if (donors.isEmpty()) {
        EmptyState("Este banco aún no tiene donantes registrados.")
        return
    }
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(donors, key = { it.id }) { donor ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(donor.usuario.nombre, fontWeight = FontWeight.SemiBold)
                    Text(donor.usuario.email)
                    donor.organizacion?.let { Text("Organización: $it") }
                    donor.usuario.telefono?.let { Text("Teléfono: $it") }
                }
            }
        }
    }
}

@Composable
private fun BankBeneficiaryList(beneficiaries: List<BankBeneficiary>) {
    if (beneficiaries.isEmpty()) {
        EmptyState("Este banco aún no tiene beneficiarios relacionados.")
        return
    }
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(beneficiaries, key = { it.id }) { beneficiary ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(beneficiary.nombreOrganizacion, fontWeight = FontWeight.SemiBold)
                    Text("Responsable: ${beneficiary.usuario.nombre} · ${beneficiary.usuario.email}")
                    Text("${beneficiary.municipio}, ${beneficiary.departamento}")
                    Text("${beneficiary.tipoOrganizacion} · NIT: ${beneficiary.nit ?: "No registrado"}")
                }
            }
        }
    }
}

@Composable
private fun BankHistoryList(history: List<BankHistoryItem>) {
    if (history.isEmpty()) {
        EmptyState("No hay operaciones registradas para este banco.")
        return
    }
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(history, key = { it.id }) { entry ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(entry.accion, fontWeight = FontWeight.SemiBold)
                    Text("${entry.entidad} ${entry.entidadId.orEmpty()}")
                    Text("Usuario: ${entry.usuario.nombre} · ${entry.creadoEn}")
                }
            }
        }
    }
}

@Composable
private fun InventoryList(
    inventory: List<InventoryItem>,
    products: List<Product>,
    onAddProduct: (Int) -> Unit,
    onPublish: (Int, Boolean) -> Unit,
) {
    val inventoryProductIds = inventory.map { it.productoId }.toSet()
    val addableProducts = products.filter { it.activo && it.id !in inventoryProductIds }
    Column(modifier = Modifier.fillMaxSize()) {
        if (inventory.isEmpty()) EmptyState("Este banco aún no tiene productos en su inventario.")
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(inventory, key = { it.id }) { item ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            ProductImage(
                                category = item.producto.categoria,
                                imageUrl = item.producto.imagenUrl,
                                contentDescription = item.producto.nombre,
                                modifier = Modifier.width(72.dp).height(72.dp),
                            )
                            Column(modifier = Modifier.padding(start = 12.dp)) {
                                Text(item.producto.nombre, fontWeight = FontWeight.SemiBold)
                                Text(
                                    "Disponible: ${item.cantidadDisponible} ${item.producto.unidad} " +
                                        "(reservado: ${item.stockReservado})",
                                )
                            }
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text("Publicar disponibilidad", modifier = Modifier.weight(1f))
                            Switch(
                                checked = item.publicado,
                                onCheckedChange = { onPublish(item.productoId, it) },
                            )
                        }
                    }
                }
            }
            if (addableProducts.isNotEmpty()) {
                item { Text("Agregar productos al inventario", style = MaterialTheme.typography.titleMedium) }
                items(addableProducts, key = { "catalog-${it.id}" }) { product ->
                    TextButton(
                        onClick = { onAddProduct(product.id) },
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("+ ${product.nombre} · ${product.unidad}")
                    }
                }
            }
        }
    }
}

@Composable
private fun DonationList(
    donations: List<com.redalimenta.mobile.data.Donation>,
    canRegister: Boolean,
    canReview: Boolean,
    onAdd: () -> Unit,
    onReview: (Int, Boolean) -> Unit,
) {
    Column(modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp)) {
            Text("Donaciones", style = MaterialTheme.typography.headlineSmall)
            Text(
                "Alimentos que la comunidad está compartiendo.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        if (canRegister) {
            Button(onClick = onAdd, modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
                Icon(Icons.Default.Add, contentDescription = null)
                Text("Registrar donación", modifier = Modifier.padding(start = 8.dp))
            }
        }
        if (donations.isEmpty()) EmptyState("Aún no hay donaciones registradas.")
        LazyColumn(
            modifier = Modifier.weight(1f),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(donations, key = { it.id }) { donation ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column {
                        ProductImage(
                            category = donation.producto.categoria,
                            imageUrl = donation.producto.imagenUrl,
                            contentDescription = donation.producto.nombre,
                            modifier = Modifier.fillMaxWidth().height(188.dp),
                        )
                        Column(
                            modifier = Modifier.padding(16.dp),
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Text(
                                    "Donación de ${donation.donanteReferencia}",
                                    modifier = Modifier.weight(1f),
                                    style = MaterialTheme.typography.labelLarge,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                                DonationStatusChip(donation.estado)
                            }
                            Text(
                                donation.producto.nombre,
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.SemiBold,
                            )
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Default.Inventory,
                                    contentDescription = null,
                                    tint = MaterialTheme.colorScheme.primary,
                                )
                                Text(
                                    "${donation.cantidad} ${donation.producto.unidad}",
                                    modifier = Modifier.padding(start = 8.dp),
                                )
                            }
                            Text(
                                "Banco: ${donation.banco?.nombre ?: "Banco histórico"}",
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            Text(
                                "Fecha: ${donation.fecha.take(10)}",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            if (canReview && donation.estado == "PENDIENTE") {
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(onClick = { onReview(donation.id, true) }) { Text("Aceptar") }
                                    TextButton(onClick = { onReview(donation.id, false) }) {
                                        Text("Rechazar")
                                    }
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
private fun RequestList(
    requests: List<FoodRequest>,
    deliveries: List<Delivery>,
    canCreate: Boolean,
    canReview: Boolean,
    canDeliver: Boolean,
    onCreate: () -> Unit,
    onReview: (FoodRequest, List<ApprovedProduct>?) -> Unit,
    onDeliver: (FoodRequest) -> Unit,
) {
    var requestToApprove by remember { mutableStateOf<FoodRequest?>(null) }
    Column(modifier = Modifier.fillMaxSize()) {
        if (canCreate) {
            Button(onClick = onCreate, modifier = Modifier.fillMaxWidth().padding(12.dp)) {
                Icon(Icons.Default.Add, contentDescription = null)
                Text("  Crear solicitud")
            }
        }
        if (requests.isEmpty()) EmptyState("Aún no hay solicitudes de alimentos.")
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(requests, key = { it.id }) { request ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Solicitud #${request.id} · ${request.estado}", fontWeight = FontWeight.SemiBold)
                        Text("Banco: ${request.banco.nombre}")
                        request.beneficiario?.let { Text("Organización: ${it.nombreOrganizacion}") }
                        request.detalles.forEach { detail ->
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                ProductImage(
                                    category = detail.producto.categoria,
                                    imageUrl = detail.producto.imagenUrl,
                                    contentDescription = detail.producto.nombre,
                                    modifier = Modifier.width(48.dp).height(48.dp),
                                )
                                Text(
                                    "${detail.producto.nombre}: ${detail.cantidadSolicitada} " +
                                        "(aprobado: ${detail.cantidadAprobada}) ${detail.producto.unidad}",
                                    modifier = Modifier.padding(start = 10.dp),
                                )
                            }
                        }
                        if (canReview && request.estado == "PENDIENTE") {
                            Row {
                                TextButton(onClick = { requestToApprove = request }) { Text("Aprobar") }
                                TextButton(onClick = { onReview(request, null) }) { Text("Rechazar") }
                            }
                        }
                        if (
                            canDeliver
                            && request.estado in setOf("APROBADA", "APROBADA_PARCIALMENTE")
                            && request.detalles.any { detail ->
                                val alreadyDelivered = deliveries
                                    .filter { it.solicitud?.id == request.id }
                                    .flatMap { it.detalles }
                                    .filter { it.detalleSolicitudId == detail.id }
                                    .sumOf { it.cantidad }
                                detail.cantidadAprobada > alreadyDelivered
                            }
                        ) {
                            TextButton(onClick = { onDeliver(request) }) { Text("Registrar entrega aprobada") }
                        }
                    }
                }
            }
        }
    }
    requestToApprove?.let { request ->
        RequestApprovalDialog(
            request = request,
            onDismiss = { requestToApprove = null },
            onSave = {
                onReview(request, it)
                requestToApprove = null
            },
        )
    }
}

@Composable
private fun DeliveryList(
    deliveries: List<Delivery>,
    canConfirm: Boolean,
    onConfirm: (Delivery) -> Unit,
) {
    if (deliveries.isEmpty()) {
        EmptyState("Aún no hay entregas registradas.")
        return
    }
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(deliveries, key = { it.id }) { delivery ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text("Entrega #${delivery.id} · ${delivery.estado}", fontWeight = FontWeight.SemiBold)
                    Text("Organización: ${delivery.beneficiarioReferencia}")
                    Text("Banco: ${delivery.banco?.nombre ?: "Banco histórico"}")
                    Text("Fecha: ${delivery.fecha.take(10)}")
                    Text("Entrega: ${delivery.entregadaPor ?: "No indicado"}")
                    Text("Recibe: ${delivery.recibidaPor ?: "Pendiente"}")
                    delivery.detalles.forEach { detail ->
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            ProductImage(
                                category = detail.producto.categoria,
                                imageUrl = detail.producto.imagenUrl,
                                contentDescription = detail.producto.nombre,
                                modifier = Modifier.width(48.dp).height(48.dp),
                            )
                            Text(
                                "${detail.producto.nombre}: ${detail.cantidad} ${detail.producto.unidad}",
                                modifier = Modifier.padding(start = 10.dp),
                            )
                        }
                    }
                    if (canConfirm && delivery.estado == "REGISTRADA") {
                        TextButton(onClick = { onConfirm(delivery) }) { Text("Confirmar recepción") }
                    }
                }
            }
        }
    }
}

@Composable
private fun AvailabilityList(products: List<com.redalimenta.mobile.data.AvailableProduct>, onRequest: () -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        Button(onClick = onRequest, enabled = products.isNotEmpty(), modifier = Modifier.fillMaxWidth().padding(12.dp)) {
            Icon(Icons.Default.Add, contentDescription = null)
            Text("  Solicitar producto")
        }
        if (products.isEmpty()) EmptyState("No hay alimentos publicados disponibles para este banco.")
        LazyColumn(
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            items(products, key = { it.id }) { product ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        ProductImage(
                            category = product.categoria,
                            imageUrl = product.imagenUrl,
                            contentDescription = product.nombre,
                            modifier = Modifier.width(76.dp).height(76.dp),
                        )
                        Column(modifier = Modifier.padding(start = 12.dp)) {
                            Text(product.nombre, fontWeight = FontWeight.SemiBold)
                            Text("${product.categoria} · ${product.cantidadDisponible} ${product.unidad} disponibles")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun RegistrationList(
    registrations: List<RegistrationRequest>,
    onReview: (Int, Boolean, String?) -> Unit,
) {
    if (registrations.isEmpty()) {
        EmptyState("No hay registros pendientes de verificación.")
        return
    }
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        items(registrations, key = { it.id }) { registration ->
            Card(modifier = Modifier.fillMaxWidth()) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(registration.beneficiario.nombreOrganizacion, fontWeight = FontWeight.SemiBold)
                    Text("Responsable: ${registration.solicitante.nombre} · ${registration.solicitante.email}")
                    Text("NIT: ${registration.beneficiario.nit ?: "No registrado"}")
                    Text("${registration.beneficiario.tipoOrganizacion} · ${registration.beneficiario.municipio}, ${registration.beneficiario.departamento}")
                    Text("Documentos adjuntos: ${registration.documentos.size}")
                    Row {
                        TextButton(onClick = { onReview(registration.id, true, null) }) { Text("Aprobar") }
                        TextButton(
                            onClick = {
                                onReview(registration.id, false, "Documentación o datos insuficientes.")
                            },
                        ) { Text("Rechazar") }
                    }
                }
            }
        }
    }
}

@Composable
private fun ReportList(report: com.redalimenta.mobile.data.SystemReport?) {
    if (report == null) {
        EmptyState("No se pudo cargar el informe. Actualiza para intentarlo de nuevo.")
        return
    }
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item { Text("Resumen de la red", style = MaterialTheme.typography.headlineSmall) }
        item { ReportStatusCard("Donaciones", report.donaciones) }
        item { ReportStatusCard("Solicitudes", report.solicitudes) }
        item { ReportStatusCard("Entregas", report.entregas) }
        item { ReportCard("Cantidades distribuidas", "${report.cantidadesDistribuidas} unidades") }
        item { Text("Inventario disponible por banco", style = MaterialTheme.typography.titleLarge) }
        if (report.productosPorBanco.isEmpty()) {
            item { Text("No hay inventario registrado.") }
        } else {
            items(report.productosPorBanco) { item ->
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(item.banco.nombre, fontWeight = FontWeight.SemiBold)
                        Text(item.producto.nombre)
                        Text(
                            "Disponible: ${item.cantidadDisponible} ${item.producto.unidad} " +
                                "· Reservado: ${item.stockReservado}",
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun ProfileSummary(user: User, onEdit: () -> Unit) {
    val initials = user.nombre
        .trim()
        .split(Regex("\\s+"))
        .take(2)
        .mapNotNull { it.firstOrNull() }
        .joinToString("")
        .uppercase()
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Mi perfil", style = MaterialTheme.typography.headlineSmall)
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        shape = CircleShape,
                        color = MaterialTheme.colorScheme.primaryContainer,
                    ) {
                        Text(
                            initials.ifBlank { "R" },
                            modifier = Modifier.padding(16.dp),
                            color = MaterialTheme.colorScheme.primary,
                            style = MaterialTheme.typography.titleLarge,
                            fontWeight = FontWeight.SemiBold,
                        )
                    }
                    Column(modifier = Modifier.padding(start = 12.dp)) {
                        Text(user.nombre, fontWeight = FontWeight.SemiBold)
                        Text(displayRoleName(user.rol), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                Text(user.email)
                Text("Estado: ${statusLabel(user.estado)}")
                user.telefono?.let { Text("Teléfono: $it") }
                user.donante?.organizacion?.let { Text("Organización: $it") }
                user.beneficiario?.let {
                    Text("Organización: ${it.nombreOrganizacion}")
                    Text("Verificación: ${it.estadoVerificacion}")
                    Text("${it.municipio}, ${it.departamento}")
                }
            }
        }
        Button(onClick = onEdit, modifier = Modifier.fillMaxWidth()) {
            Text("Editar perfil")
        }
    }
}

@Composable
private fun ReportStatusCard(
    title: String,
    entries: List<com.redalimenta.mobile.data.ReportStatusCount>,
) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text("$title por estado", fontWeight = FontWeight.SemiBold)
            if (entries.isEmpty()) {
                Text("Sin registros")
            } else {
                entries.forEach { entry ->
                    Text("${reportStatusLabel(entry.estado)}: ${entry.count.total}")
                }
            }
        }
    }
}

private fun reportStatusLabel(status: String): String = when (status) {
    "PENDIENTE" -> "Pendientes"
    "ACEPTADA" -> "Aceptadas"
    "APROBADA" -> "Aprobadas"
    "APROBADA_PARCIALMENTE" -> "Aprobadas parcialmente"
    "RECHAZADA" -> "Rechazadas"
    "ENTREGADA" -> "Entregadas"
    "CANCELADA" -> "Canceladas"
    "REGISTRADA" -> "Registradas"
    "CONFIRMADA" -> "Confirmadas"
    else -> status
}

@Composable
private fun ReportCard(title: String, value: String) {
    Card(modifier = Modifier.fillMaxWidth()) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text(title, fontWeight = FontWeight.SemiBold)
            Text(value)
        }
    }
}

@Composable
private fun TextInputDialog(
    title: String,
    label: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
) {
    var value by remember { mutableStateOf("") }
    var validationError by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                androidx.compose.material3.OutlinedTextField(
                    value = value,
                    onValueChange = { value = it },
                    label = { Text(label) },
                    singleLine = true,
                )
                validationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            Button(onClick = {
                validationError = if (value.isBlank()) "Este campo es obligatorio." else null
                if (validationError == null) onSave(value.trim())
            }) { Text("Confirmar") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
private fun EmptyState(message: String) {
    Surface(
        modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 32.dp),
        color = MaterialTheme.colorScheme.secondaryContainer,
        shape = MaterialTheme.shapes.large,
    ) {
        Column(
            modifier = Modifier.padding(horizontal = 24.dp, vertical = 28.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(
                imageVector = Icons.Default.Info,
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
            )
            Text(
                message,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSecondaryContainer,
            )
        }
    }
}
