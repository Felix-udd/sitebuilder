-- SiteBuilder database schema
-- Import this in phpMyAdmin, or run: mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS sitebuilder CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE sitebuilder;

CREATE TABLE IF NOT EXISTS pages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(191) NOT NULL UNIQUE,
    content LONGTEXT NOT NULL,
    is_published TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
