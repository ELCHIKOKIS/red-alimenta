package com.redalimenta.mobile.data

import com.google.gson.Gson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UserRoleTest {
    @Test
    fun gsonPreservesAdministratorRoleInLoginResponse() {
        val response = Gson().fromJson(
            """{"accessToken":"token","expiresAt":"2026-11-05T05:00:00.000Z","user":{"id":1,"nombre":"Admin","email":"admin@example.test","rol":"SUPER_ADMIN","estado":"ACTIVA"}}""",
            LoginResponse::class.java,
        )

        assertEquals("SUPER_ADMIN", response.user.rol)
        assertEquals("Superadministrador", displayRoleName(response.user.rol))
    }

    @Test
    fun administratorRolesKeepTheirDistinctLabels() {
        assertEquals("Superadministrador", displayRoleName("SUPER_ADMIN"))
        assertEquals("Administrador", displayRoleName("ADMIN_GENERAL"))
    }

    @Test
    fun onlySuperAdminGetsPermanentDeletionPermission() {
        assertTrue(isSuperAdmin("SUPER_ADMIN"))
        assertFalse(isSuperAdmin("ADMIN_GENERAL"))
    }

    @Test
    fun bothAdministratorRolesReceiveSharedAdministrativeAccess() {
        assertTrue(isAdminRole("SUPER_ADMIN"))
        assertTrue(isAdminRole("ADMIN_GENERAL"))
        assertFalse(isAdminRole("BANCO"))
    }
}
