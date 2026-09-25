-- Schema inicial sync-wand para MySQL 8 / SiteGround.
-- Ejecutar una sola vez en la base de produccion desde phpMyAdmin.
-- Crear un respaldo antes de ejecutarlo si ya existen tablas con estos nombres.

CREATE TABLE IF NOT EXISTS `wand_ras` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `ra_num` VARCHAR(64) NOT NULL,
  `res_num` VARCHAR(64) NULL,
  `ldw` VARCHAR(64) NULL,
  `pai` VARCHAR(64) NULL,
  `pep` VARCHAR(64) NULL,
  `ali` VARCHAR(64) NULL,
  `total_charges_rate_amt` VARCHAR(64) NULL,
  `out_string` TEXT NULL,
  `qv_di_est_total_closed` VARCHAR(64) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_wand_ras_ra_num` (`ra_num`),
  UNIQUE KEY `UQ_wand_ras_res_num` (`res_num`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wpas` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `res_num` VARCHAR(64) NOT NULL,
  `wpa` VARCHAR(64) NOT NULL DEFAULT '',
  `status` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  `message` TEXT NOT NULL,
  `attempts` INT NOT NULL DEFAULT 0,
  `processed_at` DATETIME NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_wpas_res_num` (`res_num`),
  KEY `IDX_wpas_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wpa_jobs` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `source` ENUM('FILE', 'HTTP') NOT NULL DEFAULT 'FILE',
  `reservations` JSON NOT NULL,
  `status` ENUM('PENDING', 'RUNNING', 'COMPLETED', 'ERROR') NOT NULL DEFAULT 'PENDING',
  `worker_id` VARCHAR(128) NULL,
  `started_at` DATETIME NULL,
  `finished_at` DATETIME NULL,
  `result` JSON NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `IDX_wpa_jobs_status` (`status`),
  KEY `IDX_wpa_jobs_worker_id` (`worker_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wpa_workers` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `worker_id` VARCHAR(128) NOT NULL,
  `status` ENUM('ONLINE', 'BUSY', 'OFFLINE', 'ERROR') NOT NULL DEFAULT 'ONLINE',
  `current_job_id` VARCHAR(64) NULL,
  `last_heartbeat_at` DATETIME NOT NULL,
  `metadata` JSON NOT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `UQ_wpa_workers_worker_id` (`worker_id`),
  KEY `IDX_wpa_workers_last_heartbeat_at` (`last_heartbeat_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
