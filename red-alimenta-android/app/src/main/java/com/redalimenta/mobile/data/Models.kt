package com.redalimenta.mobile.data

import com.google.gson.annotations.SerializedName

data class User(
    val id: Int,
    val nombre: String,
    val email: String,
    val rol: String,
    val estado: String,
    val telefono: String? = null,
    val donante: DonorProfile? = null,
    val beneficiario: BeneficiaryProfile? = null,
    val membresias: List<BankMembership> = emptyList(),
)

data class HealthResponse(val status: String)

data class DonorProfile(
    val organizacion: String?,
    val direccion: String?,
)

data class BeneficiaryProfile(
    val nombreOrganizacion: String,
    val nit: String?,
    val tipoOrganizacion: String,
    val departamento: String,
    val municipio: String,
    val direccion: String,
    val telefono: String?,
    val estadoVerificacion: String,
    val solicitudesRegistro: List<RegistrationStatus> = emptyList(),
)

data class RegistrationStatus(
    val id: Int,
    val estado: String,
    val observacionesRevision: String?,
    val creadaEn: String,
    val revisadaEn: String?,
)

data class BankMembership(
    val nivel: String,
    val banco: BankSummary,
)

data class BankSummary(
    val id: Int,
    val nombre: String,
)

data class Bank(
    val id: Int,
    val nombre: String,
    val descripcion: String?,
    val departamento: String,
    val municipio: String,
    val estado: String,
)

data class BankPayload(
    val nombre: String,
    val departamento: String,
    val municipio: String,
    val coberturas: List<BankCoveragePayload>,
)

data class BankCoveragePayload(
    val departamento: String,
    val municipio: String? = null,
)

data class BankUserPayload(
    val nombre: String,
    val email: String,
    val password: String,
    val nivel: String = "OPERADOR",
)

data class AdminUser(
    val id: Int,
    val nombre: String,
    val email: String,
    val rol: String,
    val estado: String,
    val telefono: String?,
    val membresias: List<BankMembership> = emptyList(),
)

data class AdminUsersResponse(
    val items: List<AdminUser>,
    val total: Int,
    val limit: Int,
    val offset: Int,
    val counts: AdminUserCounts,
)

data class AdminUserCounts(
    val total: Int,
    val byRole: Map<String, Int>,
    val byStatus: Map<String, Int>,
)

data class AdminUserUpdatePayload(
    val nombre: String? = null,
    val email: String? = null,
    val estado: String? = null,
)

data class AdminUserDeleteResponse(
    val deleted: Boolean,
    val documentCleanupWarnings: Int,
)

fun isAdminRole(role: String): Boolean = role == "ADMIN_GENERAL" || role == "SUPER_ADMIN"

fun isSuperAdmin(role: String): Boolean = role == "SUPER_ADMIN"

fun displayRoleName(role: String): String = when (role) {
    "ADMIN_GENERAL" -> "Administrador"
    "SUPER_ADMIN" -> "Superadministrador"
    "BANCO" -> "Banco"
    "DONANTE" -> "Donante"
    "BENEFICIARIO" -> "Beneficiario"
    else -> role
}

data class BankDonor(
    val id: Int,
    val organizacion: String?,
    val direccion: String?,
    val usuario: BankContact,
)

data class BankBeneficiary(
    val id: Int,
    val nombreOrganizacion: String,
    val nit: String?,
    val tipoOrganizacion: String,
    val departamento: String,
    val municipio: String,
    val telefono: String?,
    val usuario: BankContact,
)

data class BankContact(
    val id: Int,
    val nombre: String,
    val email: String,
    val telefono: String? = null,
)

data class BankHistoryResponse(
    val items: List<BankHistoryItem>,
)

data class BankHistoryItem(
    val id: Int,
    val accion: String,
    val entidad: String,
    val entidadId: String?,
    val creadoEn: String,
    val usuario: BankContact,
)

data class SystemReport(
    val donaciones: List<ReportStatusCount>,
    val solicitudes: List<ReportStatusCount>,
    val entregas: List<ReportStatusCount>,
    val productosPorBanco: List<ReportInventoryItem>,
    val cantidadesDistribuidas: Int,
)

data class ReportStatusCount(
    val estado: String,
    @SerializedName("_count") val count: ReportCount,
)

data class ReportCount(
    @SerializedName("_all") val total: Int,
)

data class ReportInventoryItem(
    val banco: BankSummary,
    val producto: ReportProduct,
    val stockActual: Int,
    val stockReservado: Int,
    val cantidadDisponible: Int,
)

data class ReportProduct(
    val id: Int,
    val nombre: String,
    val unidad: String,
)

data class Product(
    val id: Int,
    val nombre: String,
    val categoria: String,
    val unidad: String,
    val activo: Boolean,
)

data class InventoryItem(
    val id: Int,
    val bancoId: Int,
    val productoId: Int,
    val stockActual: Int,
    val stockReservado: Int,
    val cantidadDisponible: Int,
    val publicado: Boolean,
    val activo: Boolean,
    val producto: Product,
)

data class Donation(
    val id: Int,
    val cantidad: Int,
    val fecha: String,
    @SerializedName("donante_referencia") val donanteReferencia: String,
    val estado: String,
    val producto: Product,
    val banco: BankSummary?,
)

data class FoodRequest(
    val id: Int,
    val estado: String,
    val observaciones: String?,
    val motivoDecision: String?,
    val creadaEn: String,
    val banco: BankSummary,
    val beneficiario: BeneficiarySummary? = null,
    val detalles: List<RequestDetail>,
)

data class BeneficiarySummary(
    val id: Int,
    val nombreOrganizacion: String,
)

data class RequestDetail(
    val id: Int,
    val productoId: Int,
    val cantidadSolicitada: Int,
    val cantidadAprobada: Int,
    val producto: Product,
)

data class Delivery(
    val id: Int,
    val fecha: String,
    val estado: String,
    val entregadaPor: String?,
    val recibidaPor: String?,
    @SerializedName("beneficiario_referencia") val beneficiarioReferencia: String,
    val banco: BankSummary?,
    val solicitud: RequestSummary?,
    val detalles: List<DeliveryDetail> = emptyList(),
)

data class RequestSummary(
    val id: Int,
    val estado: String,
)

data class DeliveryDetail(
    val id: Int,
    val detalleSolicitudId: Int,
    val productoId: Int,
    val cantidad: Int,
    val producto: Product,
)

data class RegistrationRequest(
    val id: Int,
    val estado: String,
    val observacionesRevision: String?,
    val creadaEn: String,
    val solicitante: RegistrationApplicant,
    val beneficiario: RegistrationBeneficiary,
    val documentos: List<VerificationDocument>,
)

data class RegistrationApplicant(
    val nombre: String,
    val email: String,
)

data class RegistrationBeneficiary(
    val nombreOrganizacion: String,
    val nit: String?,
    val tipoOrganizacion: String,
    val departamento: String,
    val municipio: String,
    val estadoVerificacion: String,
)

data class VerificationDocument(
    val id: Int,
    val nombreOriginal: String,
    val tipoMime: String,
    val tamanoBytes: Int,
    val creadoEn: String,
)

data class DocumentUpload(
    val id: Int,
    val nombreOriginal: String,
    val tipoMime: String,
    val tamanoBytes: Int,
)

data class LoginPayload(
    @SerializedName("email")
    val email: String,
    val password: String,
)

data class LoginResponse(
    val accessToken: String,
    val expiresAt: String,
    val user: User,
)

data class ProfileUpdatePayload(
    val nombre: String? = null,
    val email: String? = null,
    val telefono: String? = null,
    val organizacion: String? = null,
    val direccion: String? = null,
    val nombreOrganizacion: String? = null,
    val nit: String? = null,
    val tipoOrganizacion: String? = null,
    val departamento: String? = null,
    val municipio: String? = null,
)

data class RegisterPayload(
    val nombre: String,
    @SerializedName("email")
    val email: String,
    val password: String,
    val tipoCuenta: String,
    val organizacion: String? = null,
    val direccion: String? = null,
    val nombreOrganizacion: String? = null,
    val nit: String? = null,
    val tipoOrganizacion: String? = null,
    val departamento: String? = null,
    val municipio: String? = null,
    val telefono: String? = null,
)

data class RegisterResponse(
    val user: User,
    val message: String,
)

data class ProductPayload(
    val nombre: String,
    val categoria: String,
    val unidad: String,
    val activo: Boolean = true,
)

data class DonationPayload(
    val productoId: Int,
    val bancoId: Int,
    val cantidad: Int,
    val fechaVencimiento: String? = null,
    val observaciones: String? = null,
)

data class CreateRequestPayload(
    val bancoId: Int,
    val items: List<RequestedProduct>,
    val observaciones: String? = null,
)

data class RequestedProduct(
    val productoId: Int,
    val cantidad: Int,
)

data class RequestReviewPayload(
    val decision: String,
    val items: List<ApprovedProduct> = emptyList(),
    val motivo: String? = null,
)

data class ApprovedProduct(
    val detalleId: Int,
    val cantidadAprobada: Int,
)

data class DeliveryPayload(
    val solicitudId: Int,
    val items: List<DeliveredProduct>,
    val entregadaPor: String,
    val recibidaPor: String? = null,
    val observaciones: String? = null,
)

data class DeliveredProduct(
    val detalleSolicitudId: Int,
    val cantidad: Int,
)

data class DeliveryConfirmationPayload(
    val recibidaPor: String,
)

data class ReviewRegistrationPayload(
    val decision: String,
    val observaciones: String? = null,
)

data class AvailabilityResponse(
    val banco: Bank,
    val productos: List<AvailableProduct>,
)

data class AvailableProduct(
    val id: Int,
    val nombre: String,
    val categoria: String,
    val unidad: String,
    val cantidadDisponible: Int,
)
