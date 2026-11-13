package com.redalimenta.mobile.ui

import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.unit.dp
import com.redalimenta.mobile.data.AvailableProduct
import com.redalimenta.mobile.data.AdminUser
import com.redalimenta.mobile.data.BankUserPayload
import com.redalimenta.mobile.data.ApprovedProduct
import com.redalimenta.mobile.data.Bank
import com.redalimenta.mobile.data.BankCoveragePayload
import com.redalimenta.mobile.data.BankPayload
import com.redalimenta.mobile.data.FoodRequest
import com.redalimenta.mobile.data.Delivery
import com.redalimenta.mobile.data.DeliveredProduct
import com.redalimenta.mobile.data.Product
import com.redalimenta.mobile.data.ProductPayload
import com.redalimenta.mobile.data.ProfileUpdatePayload
import com.redalimenta.mobile.data.RequestedProduct
import com.redalimenta.mobile.data.User

@Composable
fun ProfileEditDialog(
    user: User,
    onDismiss: () -> Unit,
    onSave: (ProfileUpdatePayload) -> Unit,
) {
    var name by remember(user.id) { mutableStateOf(user.nombre) }
    var email by remember(user.id) { mutableStateOf(user.email) }
    var phone by remember(user.id) {
        mutableStateOf(user.telefono ?: user.beneficiario?.telefono.orEmpty())
    }
    var donorOrganization by remember(user.id) {
        mutableStateOf(user.donante?.organizacion.orEmpty())
    }
    var donorAddress by remember(user.id) { mutableStateOf(user.donante?.direccion.orEmpty()) }
    var organization by remember(user.id) {
        mutableStateOf(user.beneficiario?.nombreOrganizacion.orEmpty())
    }
    var nit by remember(user.id) { mutableStateOf(user.beneficiario?.nit.orEmpty()) }
    var organizationType by remember(user.id) {
        mutableStateOf(user.beneficiario?.tipoOrganizacion.orEmpty())
    }
    var department by remember(user.id) { mutableStateOf(user.beneficiario?.departamento.orEmpty()) }
    var municipality by remember(user.id) { mutableStateOf(user.beneficiario?.municipio.orEmpty()) }
    var beneficiaryAddress by remember(user.id) { mutableStateOf(user.beneficiario?.direccion.orEmpty()) }
    var validationError by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Editar perfil") },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth().heightIn(max = 480.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(name, { name = it }, label = { Text("Nombre") }, singleLine = true)
                OutlinedTextField(
                    email,
                    { email = it },
                    label = { Text("Correo") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    singleLine = true,
                )
                OutlinedTextField(
                    phone,
                    { phone = it },
                    label = { Text("Teléfono") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
                    singleLine = true,
                )
                if (user.rol == "DONANTE") {
                    OutlinedTextField(
                        donorOrganization,
                        { donorOrganization = it },
                        label = { Text("Organización (opcional)") },
                    )
                    OutlinedTextField(
                        donorAddress,
                        { donorAddress = it },
                        label = { Text("Dirección (opcional)") },
                    )
                }
                if (user.rol == "BENEFICIARIO") {
                    OutlinedTextField(
                        organization,
                        { organization = it },
                        label = { Text("Nombre de la organización") },
                    )
                    OutlinedTextField(nit, { nit = it }, label = { Text("NIT (opcional)") })
                    OutlinedTextField(
                        organizationType,
                        { organizationType = it },
                        label = { Text("Tipo de organización") },
                    )
                    OutlinedTextField(department, { department = it }, label = { Text("Departamento") })
                    OutlinedTextField(municipality, { municipality = it }, label = { Text("Municipio") })
                    OutlinedTextField(
                        beneficiaryAddress,
                        { beneficiaryAddress = it },
                        label = { Text("Dirección") },
                    )
                }
                validationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            Button(onClick = {
                validationError = when {
                    name.isBlank() -> "El nombre es obligatorio."
                    !email.contains('@') -> "Escribe un correo válido."
                    user.rol == "BENEFICIARIO" && listOf(
                        organization,
                        organizationType,
                        department,
                        municipality,
                        beneficiaryAddress,
                    ).any { it.isBlank() } -> "Completa los datos obligatorios de la organización."
                    else -> null
                }
                if (validationError == null) {
                    onSave(
                        ProfileUpdatePayload(
                            nombre = name.trim(),
                            email = email.trim(),
                            telefono = phone,
                            organizacion = donorOrganization.takeIf { user.rol == "DONANTE" },
                            direccion = when (user.rol) {
                                "DONANTE" -> donorAddress
                                "BENEFICIARIO" -> beneficiaryAddress
                                else -> null
                            },
                            nombreOrganizacion = organization.takeIf { user.rol == "BENEFICIARIO" },
                            nit = nit.takeIf { user.rol == "BENEFICIARIO" },
                            tipoOrganizacion = organizationType.takeIf { user.rol == "BENEFICIARIO" },
                            departamento = department.takeIf { user.rol == "BENEFICIARIO" },
                            municipio = municipality.takeIf { user.rol == "BENEFICIARIO" },
                        ),
                    )
                }
            }) {
                Text("Guardar")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
fun BankUserFormDialog(onDismiss: () -> Unit, onSave: (BankUserPayload) -> Unit) {
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var validationError by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Crear usuario del banco") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Nombre") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Correo") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    singleLine = true,
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    label = { Text("Contraseña (mínimo 12 caracteres)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                    visualTransformation = PasswordVisualTransformation(),
                    singleLine = true,
                )
                validationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            Button(onClick = {
                validationError = when {
                    name.isBlank() || email.isBlank() -> "Completa el nombre y el correo."
                    password.length < 12 -> "La contraseña debe tener al menos 12 caracteres."
                    else -> null
                }
                if (validationError == null) {
                    onSave(BankUserPayload(name.trim(), email.trim(), password))
                }
            }) {
                Text("Crear usuario")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
fun AdminUserEditDialog(
    user: AdminUser,
    onDismiss: () -> Unit,
    onSave: (String, String) -> Unit,
) {
    var name by remember(user.id) { mutableStateOf(user.nombre) }
    var email by remember(user.id) { mutableStateOf(user.email) }
    var validationError by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Editar usuario") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Nombre") },
                    singleLine = true,
                )
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    label = { Text("Correo") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                    singleLine = true,
                )
                validationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            Button(onClick = {
                validationError = when {
                    name.isBlank() -> "El nombre es obligatorio."
                    !email.contains('@') -> "Escribe un correo válido."
                    else -> null
                }
                if (validationError == null) onSave(name.trim(), email.trim())
            }) {
                Text("Guardar")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
fun ProductFormDialog(
    product: Product?,
    onDismiss: () -> Unit,
    onSave: (ProductPayload, Uri?, Boolean) -> Unit,
) {
    var name by remember(product) { mutableStateOf(product?.nombre.orEmpty()) }
    var category by remember(product) { mutableStateOf(product?.categoria.orEmpty()) }
    var unit by remember(product) { mutableStateOf(product?.unidad.orEmpty()) }
    var active by remember(product) { mutableStateOf(product?.activo ?: true) }
    var selectedImage by remember(product) { mutableStateOf<Uri?>(null) }
    var removeImage by remember(product) { mutableStateOf(false) }
    var validationError by remember { mutableStateOf<String?>(null) }
    val imagePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia(),
    ) { uri ->
        if (uri != null) {
            selectedImage = uri
            removeImage = false
        }
    }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (product == null) "Nuevo producto" else "Editar producto") },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth().heightIn(max = 480.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                ProductImage(
                    category = category,
                    imageUrl = product?.imagenUrl.takeUnless { removeImage },
                    localImage = selectedImage,
                    contentDescription = "Vista previa de $name",
                    modifier = Modifier.fillMaxWidth().height(132.dp),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    TextButton(onClick = {
                        imagePicker.launch(
                            androidx.activity.result.PickVisualMediaRequest(
                                ActivityResultContracts.PickVisualMedia.ImageOnly,
                            ),
                        )
                    }) {
                        Text(if (selectedImage == null && product?.imagenUrl.isNullOrBlank()) "Elegir foto" else "Cambiar foto")
                    }
                    if (selectedImage != null || !product?.imagenUrl.isNullOrBlank()) {
                        TextButton(onClick = {
                            selectedImage = null
                            removeImage = true
                        }) {
                            Text("Usar imagen de categoría")
                        }
                    }
                }
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text("Nombre") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = category,
                    onValueChange = { category = it },
                    label = { Text("Categoría") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = unit,
                    onValueChange = { unit = it },
                    label = { Text("Unidad (kg, unidad...)") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (product != null) {
                    Row(
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Activo en el catálogo")
                        Switch(checked = active, onCheckedChange = { active = it })
                    }
                }
                validationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            Button(onClick = {
                validationError = when {
                    name.isBlank() || category.isBlank() || unit.isBlank() ->
                        "Completa todos los campos."
                    else -> null
                }
                if (validationError == null) {
                    onSave(
                        ProductPayload(name.trim(), category.trim(), unit.trim(), active),
                        selectedImage,
                        removeImage,
                    )
                }
            }) {
                Text("Guardar")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
fun BankFormDialog(onDismiss: () -> Unit, onSave: (BankPayload) -> Unit) {
    var name by remember { mutableStateOf("") }
    var department by remember { mutableStateOf("") }
    var municipality by remember { mutableStateOf("") }
    var validationError by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Registrar banco de alimentos") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(name, { name = it }, label = { Text("Nombre") })
                OutlinedTextField(department, { department = it }, label = { Text("Departamento") })
                OutlinedTextField(municipality, { municipality = it }, label = { Text("Municipio") })
                validationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            Button(onClick = {
                validationError = if (name.isBlank() || department.isBlank() || municipality.isBlank()) {
                    "Completa todos los campos."
                } else {
                    null
                }
                if (validationError == null) {
                    onSave(
                        BankPayload(
                            nombre = name.trim(),
                            departamento = department.trim(),
                            municipio = municipality.trim(),
                            coberturas = listOf(
                                BankCoveragePayload(department.trim(), municipality.trim()),
                            ),
                        ),
                    )
                }
            }) {
                Text("Crear banco")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DonationFormDialog(
    products: List<Product>,
    banks: List<Bank>,
    selectedBankId: Int?,
    onDismiss: () -> Unit,
    onSave: (productId: Int, bankId: Int, quantity: Int, expiry: String?) -> Unit,
) {
    val activeProducts = remember(products) { products.filter { it.activo } }
    val activeBanks = remember(banks) { banks.filter { it.estado == "ACTIVO" } }
    var product by remember(activeProducts) { mutableStateOf(activeProducts.firstOrNull()) }
    var bank by remember(activeBanks, selectedBankId) {
        mutableStateOf(activeBanks.firstOrNull { it.id == selectedBankId } ?: activeBanks.firstOrNull())
    }
    var quantity by remember { mutableStateOf("") }
    var expiry by remember { mutableStateOf("") }
    var productMenu by remember { mutableStateOf(false) }
    var bankMenu by remember { mutableStateOf(false) }
    var validationError by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Registrar donación") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (activeProducts.isEmpty() || activeBanks.isEmpty()) {
                    Text("No hay bancos o productos activos para registrar la donación.")
                } else {
                    ExposedDropdownMenuBox(productMenu, { productMenu = it }) {
                        OutlinedTextField(
                            value = product?.nombre.orEmpty(),
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Producto") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(productMenu) },
                            modifier = Modifier.fillMaxWidth().menuAnchor(),
                        )
                        ExposedDropdownMenu(productMenu, { productMenu = false }) {
                            activeProducts.forEach { option ->
                                DropdownMenuItem(
                                    text = { Text("${option.nombre} · ${option.unidad}") },
                                    leadingIcon = {
                                        ProductImage(
                                            category = option.categoria,
                                            imageUrl = option.imagenUrl,
                                            contentDescription = option.nombre,
                                            modifier = Modifier.width(40.dp).height(40.dp),
                                        )
                                    },
                                    onClick = { product = option; productMenu = false },
                                )
                            }
                        }
                    }
                    ExposedDropdownMenuBox(bankMenu, { bankMenu = it }) {
                        OutlinedTextField(
                            value = bank?.nombre.orEmpty(),
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Banco receptor") },
                            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(bankMenu) },
                            modifier = Modifier.fillMaxWidth().menuAnchor(),
                        )
                        ExposedDropdownMenu(bankMenu, { bankMenu = false }) {
                            activeBanks.forEach { option ->
                                DropdownMenuItem(
                                    text = { Text(option.nombre) },
                                    onClick = { bank = option; bankMenu = false },
                                )
                            }
                        }
                    }
                    OutlinedTextField(
                        quantity,
                        { quantity = it },
                        label = { Text("Cantidad") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                    )
                    OutlinedTextField(
                        expiry,
                        { expiry = it },
                        label = { Text("Vencimiento (YYYY-MM-DD, opcional)") },
                        singleLine = true,
                    )
                }
                validationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            Button(enabled = activeProducts.isNotEmpty() && activeBanks.isNotEmpty(), onClick = {
                val parsedQuantity = quantity.toIntOrNull()
                validationError = when {
                    product == null || bank == null -> "Selecciona un producto y un banco."
                    parsedQuantity == null || parsedQuantity <= 0 -> "La cantidad debe ser mayor que cero."
                    else -> null
                }
                if (validationError == null) {
                    onSave(product!!.id, bank!!.id, parsedQuantity!!, expiry.ifBlank { null })
                }
            }) { Text("Enviar donación") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
fun RequestFormDialog(
    products: List<AvailableProduct>,
    onDismiss: () -> Unit,
    onSave: (List<RequestedProduct>) -> Unit,
) {
    var quantities by remember(products) { mutableStateOf(products.associate { it.id to "" }) }
    var selectedIds by remember(products) { mutableStateOf(products.map { it.id }.toSet()) }
    var validationError by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Solicitar alimentos") },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth().heightIn(max = 480.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                if (products.isEmpty()) {
                    Text("No hay alimentos publicados con disponibilidad en este banco.")
                } else {
                    products.forEach { product ->
                        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                            Row(verticalAlignment = androidx.compose.ui.Alignment.CenterVertically) {
                                Checkbox(
                                    checked = product.id in selectedIds,
                                    onCheckedChange = { checked ->
                                        selectedIds = if (checked) selectedIds + product.id
                                        else selectedIds - product.id
                                    },
                                )
                                ProductImage(
                                    category = product.categoria,
                                    imageUrl = product.imagenUrl,
                                    contentDescription = product.nombre,
                                    modifier = Modifier.width(48.dp).height(48.dp),
                                )
                                Text(
                                    "${product.nombre} · ${product.cantidadDisponible} ${product.unidad}",
                                    modifier = Modifier.weight(1f).padding(start = 8.dp),
                                )
                            }
                            if (product.id in selectedIds) {
                                OutlinedTextField(
                                    value = quantities[product.id].orEmpty(),
                                    onValueChange = {
                                        quantities = quantities + (product.id to it)
                                    },
                                    label = { Text("Cantidad solicitada") },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    singleLine = true,
                                    modifier = Modifier.fillMaxWidth(),
                                )
                            }
                        }
                    }
                }
                validationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            Button(enabled = products.isNotEmpty(), onClick = {
                val items = selectedIds.mapNotNull { id ->
                    val product = products.firstOrNull { it.id == id } ?: return@mapNotNull null
                    val quantity = quantities[id]?.toIntOrNull()
                    if (quantity == null || quantity <= 0 || quantity > product.cantidadDisponible) {
                        null
                    } else {
                        RequestedProduct(productoId = id, cantidad = quantity)
                    }
                }
                validationError = when {
                    selectedIds.isEmpty() -> "Selecciona al menos un producto."
                    items.size != selectedIds.size ->
                        "Cada cantidad debe ser positiva y no superar la disponibilidad."
                    else -> null
                }
                if (validationError == null) onSave(items)
            }) { Text("Enviar solicitud") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
fun RequestApprovalDialog(
    request: FoodRequest,
    onDismiss: () -> Unit,
    onSave: (List<ApprovedProduct>) -> Unit,
) {
    var quantities by remember(request) {
        mutableStateOf(request.detalles.associate { it.id to it.cantidadSolicitada.toString() })
    }
    var validationError by remember { mutableStateOf<String?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Aprobar cantidades · solicitud #${request.id}") },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth().heightIn(max = 480.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                request.detalles.forEach { detail ->
                    OutlinedTextField(
                        value = quantities[detail.id].orEmpty(),
                        onValueChange = { quantities = quantities + (detail.id to it) },
                        label = {
                            Text("${detail.producto.nombre} (solicitado: ${detail.cantidadSolicitada})")
                        },
                        supportingText = { Text("Escribe 0 si no se aprueba.") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                validationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            Button(onClick = {
                val approvals = request.detalles.mapNotNull { detail ->
                    val quantity = quantities[detail.id]?.toIntOrNull()
                    if (quantity == null || quantity < 0 || quantity > detail.cantidadSolicitada) {
                        null
                    } else {
                        ApprovedProduct(detail.id, quantity)
                    }
                }
                validationError = when {
                    approvals.size != request.detalles.size ->
                        "Las cantidades deben ser enteros entre 0 y lo solicitado."
                    approvals.none { it.cantidadAprobada > 0 } ->
                        "Aprueba al menos una cantidad o rechaza la solicitud."
                    else -> null
                }
                if (validationError == null) onSave(approvals)
            }) { Text("Guardar aprobación") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}

@Composable
fun DeliveryFormDialog(
    request: FoodRequest,
    deliveries: List<Delivery>,
    onDismiss: () -> Unit,
    onSave: (String, List<DeliveredProduct>) -> Unit,
) {
    var deliveredBy by remember { mutableStateOf("") }
    var validationError by remember { mutableStateOf<String?>(null) }
    val remainingByDetail = remember(request, deliveries) {
        request.detalles.associate { detail ->
            val alreadyDelivered = deliveries
                .filter { it.solicitud?.id == request.id }
                .flatMap { it.detalles }
                .filter { it.detalleSolicitudId == detail.id }
                .sumOf { it.cantidad }
            detail.id to (detail.cantidadAprobada - alreadyDelivered).coerceAtLeast(0)
        }
    }
    var quantities by remember(remainingByDetail) {
        mutableStateOf(remainingByDetail.filterValues { it > 0 }.mapValues { it.value.toString() })
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Registrar entrega") },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth().heightIn(max = 480.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                OutlinedTextField(
                    deliveredBy,
                    { deliveredBy = it },
                    label = { Text("Persona que entrega") },
                    singleLine = true,
                )
                request.detalles.filter { (remainingByDetail[it.id] ?: 0) > 0 }.forEach { detail ->
                    OutlinedTextField(
                        value = quantities[detail.id].orEmpty(),
                        onValueChange = { quantities = quantities + (detail.id to it) },
                        label = { Text("${detail.producto.nombre} · pendiente: ${remainingByDetail[detail.id]} ${detail.producto.unidad}") },
                        supportingText = { Text("Ingresa 0 si no se entrega este producto.") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
                Text("El beneficiario deberá confirmar la recepción.")
                validationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            }
        },
        confirmButton = {
            Button(onClick = {
                val items = quantities.mapNotNull { (detailId, value) ->
                    val quantity = value.toIntOrNull() ?: return@mapNotNull null
                    if (quantity == 0) null else DeliveredProduct(detailId, quantity)
                }
                validationError = when {
                    deliveredBy.isBlank() -> "Indica quién realiza la entrega."
                    quantities.any { (detailId, value) ->
                        value.toIntOrNull()?.let { it < 0 || it > (remainingByDetail[detailId] ?: 0) } != false
                    } -> "Las cantidades deben ser enteros entre 0 y lo pendiente."
                    items.isEmpty() -> "Indica al menos una cantidad para entregar."
                    else -> null
                }
                if (validationError == null) onSave(deliveredBy.trim(), items)
            }) { Text("Registrar") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancelar") } },
    )
}
