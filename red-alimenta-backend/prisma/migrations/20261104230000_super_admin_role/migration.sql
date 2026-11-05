-- Add a separately authorized administrator role without changing existing rows.
ALTER TABLE `usuarios`
  MODIFY `rol` ENUM('ADMIN_GENERAL', 'SUPER_ADMIN', 'BANCO', 'DONANTE', 'BENEFICIARIO') NOT NULL;
