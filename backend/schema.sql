CREATE DATABASE IF NOT EXISTS electoral_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE electoral_db;

CREATE TABLE IF NOT EXISTS voters (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    normalized_name VARCHAR(255) NOT NULL,
    father_name VARCHAR(255) NOT NULL,
    normalized_father_name VARCHAR(255) NOT NULL,
    mother_name VARCHAR(255) NOT NULL,
    normalized_mother_name VARCHAR(255) NOT NULL,
    registry_no VARCHAR(50) NOT NULL,
    sect VARCHAR(100) NOT NULL,
    birth_date DATE DEFAULT NULL,
    birth_date_raw VARCHAR(100) NOT NULL,
    gender ENUM('Female', 'Male') NOT NULL,
    village VARCHAR(255) NOT NULL,
    page_number INT NOT NULL,
    row_index INT NOT NULL,
    INDEX idx_normalized_name (normalized_name),
    INDEX idx_normalized_father (normalized_father_name),
    INDEX idx_normalized_mother (normalized_mother_name),
    INDEX idx_village (village),
    INDEX idx_gender (gender),
    INDEX idx_sect (sect),
    INDEX idx_registry_no (registry_no)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin', 'super_admin') NOT NULL DEFAULT 'admin'
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS telegram_whitelist (
    id INT AUTO_INCREMENT PRIMARY KEY,
    identifier VARCHAR(100) UNIQUE NOT NULL, -- Chat ID, phone, or username
    description VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chatbot_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    chat_id VARCHAR(100) NOT NULL,
    username VARCHAR(100) NULL,
    message_type ENUM('text', 'voice') NOT NULL,
    query_text TEXT NULL,
    response_text TEXT NULL,
    prompt_tokens INT DEFAULT 0,
    completion_tokens INT DEFAULT 0,
    estimated_cost DECIMAL(12, 9) DEFAULT 0.000000000,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_chat_id (chat_id),
    INDEX idx_message_type (message_type),
    INDEX idx_created_at (created_at)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Insert default superadmin/admin123 if not exists
INSERT INTO users (username, password_hash, role) 
SELECT 'superadmin', '$2y$10$5h5.s5cExZ7kZ57E5s5s5eeE7xXyY8z2a7q.p7lK8z3u3o3vGgX8v', 'super_admin'
FROM DUAL 
WHERE NOT EXISTS (SELECT 1 FROM users WHERE username = 'superadmin');

