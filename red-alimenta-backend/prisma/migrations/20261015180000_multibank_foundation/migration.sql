-- AlterTable
ALTER TABLE `donaciones` ADD COLUMN `banco_id` INTEGER NULL,
    ADD COLUMN `beneficiario_id` INTEGER NULL,
    ADD COLUMN `donante_id` INTEGER NULL,
    ADD COLUMN `estado` ENUM('PENDIENTE', 'ACEPTADA', 'RECHAZADA') NOT NULL DEFAULT 'PENDIENTE',
    ADD COLUMN `fecha_vencimiento` DATETIME(3) NULL,
    ADD COLUMN `observaciones` TEXT NULL,
    ADD COLUMN `revisada_en` DATETIME(3) NULL,
    ADD COLUMN `revisada_por_id` INTEGER NULL;

-- AlterTable
ALTER TABLE `entregas` ADD COLUMN `banco_id` INTEGER NULL,
    ADD COLUMN `beneficiario_id` INTEGER NULL,
    ADD COLUMN `confirmada_en` DATETIME(3) NULL,
    ADD COLUMN `confirmada_por_id` INTEGER NULL,
    ADD COLUMN `entregada_por` VARCHAR(191) NULL,
    ADD COLUMN `estado` ENUM('REGISTRADA', 'CONFIRMADA') NOT NULL DEFAULT 'REGISTRADA',
    ADD COLUMN `observaciones` TEXT NULL,
    ADD COLUMN `recibida_por` VARCHAR(191) NULL,
    ADD COLUMN `registrada_por_id` INTEGER NULL,
    ADD COLUMN `solicitud_id` INTEGER NULL,
    MODIFY `producto_id` INTEGER NULL,
    MODIFY `cantidad` INTEGER NULL;

-- CreateTable
CREATE TABLE `usuarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(150) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `rol` ENUM('ADMIN_GENERAL', 'BANCO', 'DONANTE', 'BENEFICIARIO') NOT NULL,
    `estado` ENUM('ACTIVA', 'PENDIENTE', 'SUSPENDIDA', 'RECHAZADA') NOT NULL DEFAULT 'ACTIVA',
    `telefono` VARCHAR(30) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `usuarios_email_key`(`email`),
    INDEX `usuarios_rol_estado_idx`(`rol`, `estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sesiones` (
    `id` CHAR(36) NOT NULL,
    `usuario_id` INTEGER NOT NULL,
    `expira_en` DATETIME(3) NOT NULL,
    `revocada_en` DATETIME(3) NULL,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `sesiones_usuario_id_revocada_en_idx`(`usuario_id`, `revocada_en`),
    INDEX `sesiones_expira_en_idx`(`expira_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `bancos_alimentos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nombre` VARCHAR(191) NOT NULL,
    `nit` VARCHAR(30) NULL,
    `descripcion` TEXT NULL,
    `departamento` VARCHAR(100) NOT NULL,
    `municipio` VARCHAR(100) NOT NULL,
    `direccion` VARCHAR(255) NULL,
    `telefono` VARCHAR(30) NULL,
    `estado` ENUM('ACTIVO', 'SUSPENDIDO') NOT NULL DEFAULT 'ACTIVO',
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `bancos_alimentos_nombre_key`(`nombre`),
    UNIQUE INDEX `bancos_alimentos_nit_key`(`nit`),
    INDEX `bancos_alimentos_departamento_municipio_estado_idx`(`departamento`, `municipio`, `estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `bancos_alimentos` (`id`, `nombre`, `departamento`, `municipio`, `estado`, `creado_en`, `actualizado_en`)
VALUES (1, 'Banco RED-ALIMENTA inicial', 'No especificado', 'No especificado', 'ACTIVO', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3));

-- CreateTable
CREATE TABLE `coberturas_banco` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `banco_id` INTEGER NOT NULL,
    `departamento` VARCHAR(100) NOT NULL,
    `municipio` VARCHAR(100) NOT NULL DEFAULT '*',

    INDEX `coberturas_banco_departamento_municipio_idx`(`departamento`, `municipio`),
    UNIQUE INDEX `coberturas_banco_banco_id_departamento_municipio_key`(`banco_id`, `departamento`, `municipio`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `membresias_banco` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `banco_id` INTEGER NOT NULL,
    `nivel` ENUM('ADMINISTRADOR', 'OPERADOR') NOT NULL DEFAULT 'OPERADOR',
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `membresias_banco_banco_id_nivel_idx`(`banco_id`, `nivel`),
    UNIQUE INDEX `membresias_banco_usuario_id_banco_id_key`(`usuario_id`, `banco_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `donantes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `organizacion` VARCHAR(191) NULL,
    `direccion` VARCHAR(255) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `donantes_usuario_id_key`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `beneficiarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NOT NULL,
    `nombre_organizacion` VARCHAR(191) NOT NULL,
    `nit` VARCHAR(30) NULL,
    `tipo_organizacion` VARCHAR(100) NOT NULL,
    `departamento` VARCHAR(100) NOT NULL,
    `municipio` VARCHAR(100) NOT NULL,
    `direccion` VARCHAR(255) NOT NULL,
    `telefono` VARCHAR(30) NULL,
    `estado_verificacion` ENUM('PENDIENTE', 'APROBADA', 'RECHAZADA') NOT NULL DEFAULT 'PENDIENTE',
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `beneficiarios_usuario_id_key`(`usuario_id`),
    UNIQUE INDEX `beneficiarios_nit_key`(`nit`),
    INDEX `beneficiarios_departamento_municipio_estado_verificacion_idx`(`departamento`, `municipio`, `estado_verificacion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `solicitudes_registro` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `beneficiario_id` INTEGER NOT NULL,
    `solicitante_id` INTEGER NOT NULL,
    `estado` ENUM('PENDIENTE', 'APROBADA', 'RECHAZADA') NOT NULL DEFAULT 'PENDIENTE',
    `observaciones` TEXT NULL,
    `observaciones_revision` TEXT NULL,
    `revisada_por_id` INTEGER NULL,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revisada_en` DATETIME(3) NULL,

    INDEX `solicitudes_registro_estado_creada_en_idx`(`estado`, `creada_en`),
    INDEX `solicitudes_registro_beneficiario_id_estado_idx`(`beneficiario_id`, `estado`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `documentos_verificacion` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `solicitud_registro_id` INTEGER NOT NULL,
    `nombre_original` VARCHAR(255) NOT NULL,
    `nombre_almacenado` VARCHAR(100) NOT NULL,
    `tipo_mime` VARCHAR(100) NOT NULL,
    `tamano_bytes` INTEGER NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `documentos_verificacion_nombre_almacenado_key`(`nombre_almacenado`),
    INDEX `documentos_verificacion_solicitud_registro_id_idx`(`solicitud_registro_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventarios` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `banco_id` INTEGER NOT NULL,
    `producto_id` INTEGER NOT NULL,
    `stock_actual` INTEGER NOT NULL DEFAULT 0,
    `stock_reservado` INTEGER NOT NULL DEFAULT 0,
    `publicado` BOOLEAN NOT NULL DEFAULT false,
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `actualizado_en` DATETIME(3) NOT NULL,

    INDEX `inventarios_banco_id_publicado_activo_idx`(`banco_id`, `publicado`, `activo`),
    UNIQUE INDEX `inventarios_banco_id_producto_id_key`(`banco_id`, `producto_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `solicitudes_alimentos` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `beneficiario_id` INTEGER NOT NULL,
    `banco_id` INTEGER NOT NULL,
    `estado` ENUM('PENDIENTE', 'APROBADA', 'APROBADA_PARCIALMENTE', 'RECHAZADA', 'ENTREGADA', 'CANCELADA') NOT NULL DEFAULT 'PENDIENTE',
    `clave_idempotencia` VARCHAR(100) NULL,
    `observaciones` TEXT NULL,
    `motivo_decision` TEXT NULL,
    `revisada_por_id` INTEGER NULL,
    `creada_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revisada_en` DATETIME(3) NULL,

    UNIQUE INDEX `solicitudes_alimentos_clave_idempotencia_key`(`clave_idempotencia`),
    INDEX `solicitudes_alimentos_banco_id_estado_creada_en_idx`(`banco_id`, `estado`, `creada_en`),
    INDEX `solicitudes_alimentos_beneficiario_id_estado_creada_en_idx`(`beneficiario_id`, `estado`, `creada_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `detalles_solicitud` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `solicitud_id` INTEGER NOT NULL,
    `producto_id` INTEGER NOT NULL,
    `cantidad_solicitada` INTEGER NOT NULL,
    `cantidad_aprobada` INTEGER NOT NULL DEFAULT 0,

    INDEX `detalles_solicitud_producto_id_idx`(`producto_id`),
    UNIQUE INDEX `detalles_solicitud_solicitud_id_producto_id_key`(`solicitud_id`, `producto_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `detalles_entrega` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `entrega_id` INTEGER NOT NULL,
    `detalle_solicitud_id` INTEGER NOT NULL,
    `producto_id` INTEGER NOT NULL,
    `cantidad` INTEGER NOT NULL,

    INDEX `detalles_entrega_producto_id_idx`(`producto_id`),
    UNIQUE INDEX `detalles_entrega_entrega_id_detalle_solicitud_id_key`(`entrega_id`, `detalle_solicitud_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `movimientos_inventario` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `banco_id` INTEGER NOT NULL,
    `inventario_id` INTEGER NOT NULL,
    `producto_id` INTEGER NOT NULL,
    `tipo` ENUM('DONACION_ACEPTADA', 'ENTREGA_REGISTRADA', 'AJUSTE_ENTRADA', 'AJUSTE_SALIDA') NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `donacion_id` INTEGER NULL,
    `detalle_entrega_id` INTEGER NULL,
    `usuario_id` INTEGER NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `movimientos_inventario_detalle_entrega_id_key`(`detalle_entrega_id`),
    INDEX `movimientos_inventario_banco_id_creado_en_idx`(`banco_id`, `creado_en`),
    INDEX `movimientos_inventario_inventario_id_creado_en_idx`(`inventario_id`, `creado_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auditorias` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `usuario_id` INTEGER NULL,
    `banco_id` INTEGER NULL,
    `accion` VARCHAR(100) NOT NULL,
    `entidad` VARCHAR(100) NOT NULL,
    `entidad_id` VARCHAR(100) NULL,
    `detalles` JSON NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `auditorias_usuario_id_creado_en_idx`(`usuario_id`, `creado_en`),
    INDEX `auditorias_banco_id_creado_en_idx`(`banco_id`, `creado_en`),
    INDEX `auditorias_entidad_entidad_id_creado_en_idx`(`entidad`, `entidad_id`, `creado_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

UPDATE `donaciones`
SET `banco_id` = 1,
    `estado` = 'ACEPTADA';

ALTER TABLE `donaciones` MODIFY `banco_id` INTEGER NOT NULL;

UPDATE `entregas`
SET `banco_id` = 1;

INSERT INTO `inventarios` (`banco_id`, `producto_id`, `stock_actual`, `stock_reservado`, `publicado`, `activo`, `actualizado_en`)
SELECT 1, `id`, `stock_actual`, 0, false, `activo`, CURRENT_TIMESTAMP(3)
FROM `productos`;

-- CreateIndex
CREATE INDEX `donaciones_banco_id_estado_fecha_idx` ON `donaciones`(`banco_id`, `estado`, `fecha`);

-- CreateIndex
CREATE INDEX `donaciones_donante_id_fecha_idx` ON `donaciones`(`donante_id`, `fecha`);

-- CreateIndex
CREATE INDEX `entregas_banco_id_fecha_idx` ON `entregas`(`banco_id`, `fecha`);

-- CreateIndex
CREATE INDEX `entregas_beneficiario_id_fecha_idx` ON `entregas`(`beneficiario_id`, `fecha`);

-- CreateIndex
CREATE INDEX `entregas_solicitud_id_idx` ON `entregas`(`solicitud_id`);

-- AddForeignKey
ALTER TABLE `sesiones` ADD CONSTRAINT `sesiones_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coberturas_banco` ADD CONSTRAINT `coberturas_banco_banco_id_fkey` FOREIGN KEY (`banco_id`) REFERENCES `bancos_alimentos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `membresias_banco` ADD CONSTRAINT `membresias_banco_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `membresias_banco` ADD CONSTRAINT `membresias_banco_banco_id_fkey` FOREIGN KEY (`banco_id`) REFERENCES `bancos_alimentos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `donantes` ADD CONSTRAINT `donantes_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `beneficiarios` ADD CONSTRAINT `beneficiarios_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `solicitudes_registro` ADD CONSTRAINT `solicitudes_registro_beneficiario_id_fkey` FOREIGN KEY (`beneficiario_id`) REFERENCES `beneficiarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `solicitudes_registro` ADD CONSTRAINT `solicitudes_registro_solicitante_id_fkey` FOREIGN KEY (`solicitante_id`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `solicitudes_registro` ADD CONSTRAINT `solicitudes_registro_revisada_por_id_fkey` FOREIGN KEY (`revisada_por_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `documentos_verificacion` ADD CONSTRAINT `documentos_verificacion_solicitud_registro_id_fkey` FOREIGN KEY (`solicitud_registro_id`) REFERENCES `solicitudes_registro`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventarios` ADD CONSTRAINT `inventarios_banco_id_fkey` FOREIGN KEY (`banco_id`) REFERENCES `bancos_alimentos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventarios` ADD CONSTRAINT `inventarios_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `donaciones` ADD CONSTRAINT `donaciones_banco_id_fkey` FOREIGN KEY (`banco_id`) REFERENCES `bancos_alimentos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `donaciones` ADD CONSTRAINT `donaciones_donante_id_fkey` FOREIGN KEY (`donante_id`) REFERENCES `donantes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `donaciones` ADD CONSTRAINT `donaciones_beneficiario_id_fkey` FOREIGN KEY (`beneficiario_id`) REFERENCES `beneficiarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `donaciones` ADD CONSTRAINT `donaciones_revisada_por_id_fkey` FOREIGN KEY (`revisada_por_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `solicitudes_alimentos` ADD CONSTRAINT `solicitudes_alimentos_beneficiario_id_fkey` FOREIGN KEY (`beneficiario_id`) REFERENCES `beneficiarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `solicitudes_alimentos` ADD CONSTRAINT `solicitudes_alimentos_banco_id_fkey` FOREIGN KEY (`banco_id`) REFERENCES `bancos_alimentos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `solicitudes_alimentos` ADD CONSTRAINT `solicitudes_alimentos_revisada_por_id_fkey` FOREIGN KEY (`revisada_por_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalles_solicitud` ADD CONSTRAINT `detalles_solicitud_solicitud_id_fkey` FOREIGN KEY (`solicitud_id`) REFERENCES `solicitudes_alimentos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalles_solicitud` ADD CONSTRAINT `detalles_solicitud_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entregas` ADD CONSTRAINT `entregas_banco_id_fkey` FOREIGN KEY (`banco_id`) REFERENCES `bancos_alimentos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entregas` ADD CONSTRAINT `entregas_beneficiario_id_fkey` FOREIGN KEY (`beneficiario_id`) REFERENCES `beneficiarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entregas` ADD CONSTRAINT `entregas_solicitud_id_fkey` FOREIGN KEY (`solicitud_id`) REFERENCES `solicitudes_alimentos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entregas` ADD CONSTRAINT `entregas_registrada_por_id_fkey` FOREIGN KEY (`registrada_por_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `entregas` ADD CONSTRAINT `entregas_confirmada_por_id_fkey` FOREIGN KEY (`confirmada_por_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalles_entrega` ADD CONSTRAINT `detalles_entrega_entrega_id_fkey` FOREIGN KEY (`entrega_id`) REFERENCES `entregas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalles_entrega` ADD CONSTRAINT `detalles_entrega_detalle_solicitud_id_fkey` FOREIGN KEY (`detalle_solicitud_id`) REFERENCES `detalles_solicitud`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `detalles_entrega` ADD CONSTRAINT `detalles_entrega_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_inventario` ADD CONSTRAINT `movimientos_inventario_banco_id_fkey` FOREIGN KEY (`banco_id`) REFERENCES `bancos_alimentos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_inventario` ADD CONSTRAINT `movimientos_inventario_inventario_id_fkey` FOREIGN KEY (`inventario_id`) REFERENCES `inventarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_inventario` ADD CONSTRAINT `movimientos_inventario_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_inventario` ADD CONSTRAINT `movimientos_inventario_donacion_id_fkey` FOREIGN KEY (`donacion_id`) REFERENCES `donaciones`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_inventario` ADD CONSTRAINT `movimientos_inventario_detalle_entrega_id_fkey` FOREIGN KEY (`detalle_entrega_id`) REFERENCES `detalles_entrega`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_inventario` ADD CONSTRAINT `movimientos_inventario_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auditorias` ADD CONSTRAINT `auditorias_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auditorias` ADD CONSTRAINT `auditorias_banco_id_fkey` FOREIGN KEY (`banco_id`) REFERENCES `bancos_alimentos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
