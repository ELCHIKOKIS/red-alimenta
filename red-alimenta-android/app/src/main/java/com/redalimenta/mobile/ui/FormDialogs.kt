package com.redalimenta.mobile.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
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
import androidx.compose.ui.unit.dp
import com.redalimenta.mobile.data.Product
import com.redalimenta.mobile.data.ProductPayload

@Composable
fun ProductFormDialog(
    product: Product?,
    onDismiss: () -> Unit,
    onSave: (ProductPayload) -> Unit,
) {
    var name by remember(product) { mutableStateOf(product?.nombre.orEmpty()) }
    var category by remember(product) { mutableStateOf(product?.categoria.orEmpty()) }
    var unit by remember(product) { mutableStateOf(product?.unidad.orEmpty()) }
    var stock by remember(product) { mutableStateOf(product?.stockActual?.toString() ?: "0") }
    var active by remember(product) { mutableStateOf(product?.activo ?: true) }
    var validationError by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (product == null) "Nuevo producto" else "Editar producto") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
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
                OutlinedTextField(
                    value = stock,
                    onValueChange = { stock = it },
                    label = { Text("Stock actual") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (product != null) {
                    androidx.compose.foundation.layout.Row(
                        horizontalArrangement = Arrangement.SpaceBetween,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("Activo")
                        Switch(checked = active, onCheckedChange = { active = it })
                    }
                }
                validationError?.let {
                    Text(it, color = MaterialTheme.colorScheme.error)
                }
            }
        },
        confirmButton = {
            Button(onClick = {
                val parsedStock = stock.toIntOrNull()
                validationError = when {
                    name.isBlank() || category.isBlank() || unit.isBlank() ->
                        "Completa todos los campos."
                    parsedStock == null || parsedStock < 0 ->
                        "El stock debe ser un entero igual o mayor que cero."
                    else -> null
                }
                if (validationError == null) {
                    onSave(
                        ProductPayload(
                            nombre = name.trim(),
                            categoria = category.trim(),
                            unidad = unit.trim(),
                            stockActual = parsedStock ?: 0,
                            activo = active,
                        ),
                    )
                }
            }) {
                Text("Guardar")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancelar") }
        },
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MovementFormDialog(
    title: String,
    products: List<Product>,
    isDonation: Boolean,
    onDismiss: () -> Unit,
    onSave: (productId: Int, quantity: Int, reference: String) -> Unit,
) {
    val availableProducts = remember(products, isDonation) {
        products.filter { it.activo && (isDonation || it.stockActual > 0) }
    }
    var selectedProduct by remember(availableProducts) {
        mutableStateOf(availableProducts.firstOrNull())
    }
    var expanded by remember { mutableStateOf(false) }
    var quantity by remember { mutableStateOf("") }
    var reference by remember { mutableStateOf("") }
    var validationError by remember { mutableStateOf<String?>(null) }
    val referenceLabel = if (isDonation) "Donante" else "Beneficiario"

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                if (availableProducts.isEmpty()) {
                    Text(
                        if (isDonation) "Primero registra un producto activo."
                        else "No hay productos activos con stock disponible.",
                    )
                } else {
                    ExposedDropdownMenuBox(
                        expanded = expanded,
                        onExpandedChange = { expanded = it },
                    ) {
                        OutlinedTextField(
                            value = selectedProduct?.nombre.orEmpty(),
                            onValueChange = {},
                            readOnly = true,
                            label = { Text("Producto") },
                            trailingIcon = {
                                ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded)
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .menuAnchor(),
                        )
                        ExposedDropdownMenu(
                            expanded = expanded,
                            onDismissRequest = { expanded = false },
                        ) {
                            availableProducts.forEach { product ->
                                DropdownMenuItem(
                                    text = {
                                        Text("${product.nombre} · stock ${product.stockActual}")
                                    },
                                    onClick = {
                                        selectedProduct = product
                                        expanded = false
                                    },
                                )
                            }
                        }
                    }
                    OutlinedTextField(
                        value = quantity,
                        onValueChange = { quantity = it },
                        label = { Text("Cantidad") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = reference,
                        onValueChange = { reference = it },
                        label = { Text(referenceLabel) },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    validationError?.let {
                        Text(it, color = MaterialTheme.colorScheme.error)
                    }
                }
            }
        },
        confirmButton = {
            Button(
                enabled = availableProducts.isNotEmpty(),
                onClick = {
                    val parsedQuantity = quantity.toIntOrNull()
                    validationError = when {
                        selectedProduct == null -> "Selecciona un producto."
                        parsedQuantity == null || parsedQuantity <= 0 ->
                            "La cantidad debe ser un entero mayor que cero."
                        !isDonation && parsedQuantity > (selectedProduct?.stockActual ?: 0) ->
                            "La cantidad supera el stock disponible."
                        reference.isBlank() -> "Indica el nombre del $referenceLabel."
                        else -> null
                    }
                    if (validationError == null) {
                        selectedProduct?.let {
                            onSave(it.id, parsedQuantity ?: 0, reference.trim())
                        }
                    }
                },
            ) {
                Text("Registrar")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancelar") }
        },
    )
}
