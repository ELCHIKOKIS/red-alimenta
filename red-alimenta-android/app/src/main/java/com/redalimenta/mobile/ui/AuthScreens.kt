package com.redalimenta.mobile.ui

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.compose.ui.Alignment
import com.redalimenta.mobile.R
import com.redalimenta.mobile.data.RegisterPayload
import com.redalimenta.mobile.data.User

@Composable
fun AuthScreen(
    isLoading: Boolean,
    error: String?,
    notice: String?,
    onSignIn: (String, String) -> Unit,
    onRegister: (RegisterPayload) -> Unit,
    onClearFeedback: () -> Unit,
) {
    var registering by remember { mutableStateOf(false) }
    var accountType by remember { mutableStateOf("DONANTE") }
    var name by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var organization by remember { mutableStateOf("") }
    var organizationType by remember { mutableStateOf("") }
    var nit by remember { mutableStateOf("") }
    var department by remember { mutableStateOf("") }
    var municipality by remember { mutableStateOf("") }
    var address by remember { mutableStateOf("") }
    var phone by remember { mutableStateOf("") }
    var validationError by remember { mutableStateOf<String?>(null) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .navigationBarsPadding()
            .imePadding()
            .verticalScroll(rememberScrollState())
            .animateContentSize()
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        AuthIllustration(registering)
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Surface(
                modifier = Modifier.size(48.dp),
                shape = RoundedCornerShape(14.dp),
                color = MaterialTheme.colorScheme.primary,
            ) {
                Image(
                    painter = painterResource(R.drawable.ic_launcher_foreground),
                    contentDescription = null,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.fillMaxSize(),
                )
            }
            Text("RED-ALIMENTA", style = MaterialTheme.typography.headlineMedium)
        }
        AnimatedContent(targetState = registering, label = "auth-description") { isRegistering ->
            Text(
                if (isRegistering) "Crea una cuenta de donante u organización beneficiaria."
                else "Inicia sesión para continuar.",
                style = MaterialTheme.typography.bodyLarge,
            )
        }
        AnimatedVisibility(
            visible = registering,
            enter = fadeIn(tween(220)) + expandVertically(tween(260)),
            exit = fadeOut(tween(120)) + shrinkVertically(tween(180)),
        ) {
            OutlinedTextField(
                value = name,
                onValueChange = { name = it },
                label = { Text("Nombre de la persona responsable") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }
        OutlinedTextField(
            value = email,
            onValueChange = { email = it },
            label = { Text("Correo electrónico") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = password,
            onValueChange = { password = it },
            label = { Text("Contraseña (mínimo 12 caracteres)") },
            visualTransformation = PasswordVisualTransformation(),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )

        AnimatedVisibility(
            visible = registering,
            enter = fadeIn(tween(220)) + expandVertically(tween(260)),
            exit = fadeOut(tween(120)) + shrinkVertically(tween(180)),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                Text("Tipo de cuenta")
                AccountTypeOption("DONANTE", "Donante", accountType) { accountType = it }
                AccountTypeOption("BENEFICIARIO", "Organización beneficiaria", accountType) {
                    accountType = it
                }
                if (accountType == "DONANTE") {
                    OutlinedTextField(
                        value = organization,
                        onValueChange = { organization = it },
                        label = { Text("Organización (opcional)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = address,
                        onValueChange = { address = it },
                        label = { Text("Dirección (opcional)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                } else {
                    OutlinedTextField(
                        value = organization,
                        onValueChange = { organization = it },
                        label = { Text("Nombre de la organización") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = organizationType,
                        onValueChange = { organizationType = it },
                        label = { Text("Tipo (fundación, comedor comunitario...)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = nit,
                        onValueChange = { nit = it },
                        label = { Text("NIT (opcional)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = department,
                        onValueChange = { department = it },
                        label = { Text("Departamento") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = municipality,
                        onValueChange = { municipality = it },
                        label = { Text("Municipio") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = address,
                        onValueChange = { address = it },
                        label = { Text("Dirección") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    OutlinedTextField(
                        value = phone,
                        onValueChange = { phone = it },
                        label = { Text("Teléfono (opcional)") },
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }

        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        notice?.let { Text(it, color = MaterialTheme.colorScheme.primary) }
        validationError?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        if (isLoading) LinearProgressIndicator(modifier = Modifier.fillMaxWidth())

        Button(
            enabled = !isLoading,
            modifier = Modifier.fillMaxWidth(),
            onClick = {
                validationError = when {
                    email.trim().isBlank() || password.isBlank() -> "Completa correo y contraseña."
                    !email.trim().matches(Regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$")) ->
                        "Escribe un correo electrónico válido."
                    registering && name.isBlank() -> "Escribe el nombre de la persona responsable."
                    registering && password.length < 12 -> "La contraseña debe tener al menos 12 caracteres."
                    registering && accountType == "BENEFICIARIO" &&
                        (organization.isBlank() || organizationType.isBlank() ||
                            department.isBlank() || municipality.isBlank() || address.isBlank()) ->
                        "Completa los datos obligatorios de la organización."
                    else -> null
                }
                if (validationError == null) {
                    if (registering) {
                        onRegister(
                            RegisterPayload(
                                nombre = name.trim(),
                                email = email.trim(),
                                password = password,
                                tipoCuenta = accountType,
                                organizacion = organization.trim().ifBlank { null },
                                direccion = address.trim().ifBlank { null },
                                nombreOrganizacion = if (accountType == "BENEFICIARIO") organization.trim() else null,
                                nit = nit.trim().ifBlank { null },
                                tipoOrganizacion = organizationType.trim().ifBlank { null },
                                departamento = department.trim().ifBlank { null },
                                municipio = municipality.trim().ifBlank { null },
                                telefono = phone.trim().ifBlank { null },
                            ),
                        )
                    } else {
                        onSignIn(email.trim(), password)
                    }
                }
            },
        ) {
            Text(
                when {
                    isLoading -> "Conectando..."
                    registering -> "Enviar registro"
                    else -> "Iniciar sesión"
                },
            )
        }
        TextButton(
            enabled = !isLoading,
            onClick = {
                registering = !registering
                name = ""
                email = ""
                password = ""
                organization = ""
                organizationType = ""
                nit = ""
                department = ""
                municipality = ""
                address = ""
                phone = ""
                validationError = null
                onClearFeedback()
            },
        ) {
            Text(if (registering) "Ya tengo una cuenta" else "Crear cuenta")
        }
    }
}

@Composable
private fun AuthIllustration(registering: Boolean) {
    val transition = rememberInfiniteTransition(label = "food-illustration")
    val verticalOffset by transition.animateFloat(
        initialValue = 0f,
        targetValue = 4f,
        animationSpec = infiniteRepeatable(
            animation = tween(durationMillis = 1800),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "food-float",
    )
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(26.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(
                painter = painterResource(R.drawable.food_generic),
                contentDescription = "Ilustración de alimentos frescos",
                contentScale = ContentScale.Fit,
                modifier = Modifier
                    .size(width = 126.dp, height = 98.dp)
                    .offset(y = verticalOffset.dp),
            )
            Column(
                modifier = Modifier.weight(1f).padding(start = 10.dp),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                AnimatedContent(targetState = registering, label = "auth-hero-title") { isRegistering ->
                    Text(
                        if (isRegistering) "Suma tu organización"
                        else "Compartir también alimenta",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                Text(
                    if (registering) "Conectamos personas y alimentos con quienes los necesitan."
                    else "Una red para que los alimentos lleguen más lejos.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }
    }
}

@Composable
private fun AccountTypeOption(
    value: String,
    label: String,
    selected: String,
    onSelect: (String) -> Unit,
) {
    androidx.compose.foundation.layout.Row {
        RadioButton(selected = selected == value, onClick = { onSelect(value) })
        Text(label, modifier = Modifier.padding(top = 12.dp))
    }
}

@Composable
fun PendingRegistrationScreen(
    user: User,
    isLoading: Boolean,
    error: String?,
    onRefresh: () -> Unit,
    onUploadDocument: () -> Unit,
    onEditProfile: () -> Unit,
    onSignOut: () -> Unit,
) {
    val registration = user.beneficiario?.solicitudesRegistro?.firstOrNull()
    Column(
        modifier = Modifier
            .fillMaxSize()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Registro en revisión", style = MaterialTheme.typography.headlineSmall)
        Text(user.beneficiario?.nombreOrganizacion.orEmpty())
        Text("Estado de la cuenta: ${user.estado}")
        Text("Estado de la solicitud: ${registration?.estado ?: user.beneficiario?.estadoVerificacion.orEmpty()}")
        registration?.observacionesRevision?.let { Text("Observaciones: $it") }
        Text(
            "El panel de beneficiario estará disponible cuando un administrador verifique la organización.",
        )
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(onClick = onUploadDocument, enabled = !isLoading) {
            Text("Adjuntar documento de verificación")
        }
        Button(onClick = onEditProfile, enabled = !isLoading) {
            Text("Editar datos de la organización")
        }
        Button(onClick = onRefresh, enabled = !isLoading) {
            Text("Consultar estado")
        }
        TextButton(onClick = onSignOut) { Text("Cerrar sesión") }
    }
}

@Composable
fun InactiveAccountScreen(
    user: User,
    isLoading: Boolean,
    error: String?,
    onRefresh: () -> Unit,
    onSignOut: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .navigationBarsPadding()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text("Cuenta sin acceso", style = MaterialTheme.typography.headlineSmall)
        Text(user.nombre)
        Text("Estado de la cuenta: ${user.estado}")
        Text("Contacta al administrador general para revisar el acceso a tu cuenta.")
        error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
        Button(onClick = onRefresh, enabled = !isLoading) { Text("Consultar estado") }
        TextButton(onClick = onSignOut) { Text("Cerrar sesión") }
    }
}
