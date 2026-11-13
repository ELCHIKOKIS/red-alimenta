-- Add optional product image metadata and a separate table for image bytes.
-- Existing product rows remain valid and continue to use local category defaults.
ALTER TABLE `productos`
  ADD COLUMN `imagen_url` VARCHAR(255) NULL;

CREATE TABLE `imagenes_productos` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `producto_id` INTEGER NOT NULL,
  `tipo_mime` VARCHAR(50) NOT NULL,
  `contenido` LONGBLOB NOT NULL,
  `actualizada_en` DATETIME(3) NOT NULL,
  UNIQUE INDEX `imagenes_productos_producto_id_key` (`producto_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `imagenes_productos_producto_id_fkey`
    FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`)
    ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
