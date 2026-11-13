CREATE TABLE `fotos_perfil` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `usuario_id` INTEGER NOT NULL,
  `tipo_mime` VARCHAR(50) NOT NULL,
  `contenido` LONGBLOB NOT NULL,
  `actualizada_en` DATETIME(3) NOT NULL,
  UNIQUE INDEX `fotos_perfil_usuario_id_key` (`usuario_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `fotos_perfil_usuario_id_fkey`
    FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
