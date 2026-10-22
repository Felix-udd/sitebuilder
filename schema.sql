-- SiteBuilder database schema
-- Import this in phpMyAdmin, or run: mysql -u root < schema.sql

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

-- Form submissions captured by published forms (submitMethod = database)
CREATE TABLE IF NOT EXISTS form_submissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    page_id INT NOT NULL,
    form_id VARCHAR(64) NOT NULL DEFAULT '',
    data LONGTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_form_page (page_id, form_id),
    CONSTRAINT fk_submission_page FOREIGN KEY (page_id)
        REFERENCES pages(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Uploaded / referenced assets for the asset manager
CREATE TABLE IF NOT EXISTS assets (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) NOT NULL,
    url VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL DEFAULT '',
    size_bytes INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_assets_created (created_at)
) ENGINE=InnoDB;

-- Page revision history (snapshot of content JSON per save)
CREATE TABLE IF NOT EXISTS page_revisions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    page_id INT NOT NULL,
    content LONGTEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_revisions_page (page_id, created_at),
    CONSTRAINT fk_revision_page FOREIGN KEY (page_id)
        REFERENCES pages(id) ON DELETE CASCADE
) ENGINE=InnoDB;
