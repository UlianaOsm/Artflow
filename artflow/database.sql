-- ═══════════════════════════════════════════════════════════════
--  ArtFlow — database.sql
--  MySQL / MariaDB схема бази даних
-- ═══════════════════════════════════════════════════════════════

-- Створення та вибір бази даних
CREATE DATABASE IF NOT EXISTS artflow_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE artflow_db;

-- ─────────────────────────────────────────────────────────────
-- ТАБЛИЦЯ: users — Користувачі системи
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED     NOT NULL AUTO_INCREMENT,
  name          VARCHAR(100)     NOT NULL,
  email         VARCHAR(150)     NOT NULL UNIQUE,
  password_hash VARCHAR(255)     NOT NULL,        -- bcrypt hash
  role          ENUM('student','teacher','admin') NOT NULL DEFAULT 'student',
  birth_date    DATE             NULL,
  age           TINYINT UNSIGNED NULL,
  balance       DECIMAL(10,2)    NOT NULL DEFAULT 0.00,
  telegram_id   BIGINT           NULL UNIQUE,     -- для Telegram бота
  is_active     BOOLEAN          NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_email (email),
  INDEX idx_telegram (telegram_id),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- ТАБЛИЦЯ: parents — Дані батьків для неповнолітніх
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS parents (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  student_id   INT UNSIGNED NOT NULL,
  parent_name  VARCHAR(150) NOT NULL,
  parent_phone VARCHAR(20)  NOT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_student (student_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- ТАБЛИЦЯ: teachers — Профілі викладачів
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teachers (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id     INT UNSIGNED  NOT NULL UNIQUE,
  speciality  VARCHAR(100)  NOT NULL,
  bio         TEXT          NULL,
  education   VARCHAR(255)  NULL,
  experience  VARCHAR(100)  NULL,
  photo_url   VARCHAR(500)  NULL,
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- ТАБЛИЦЯ: teacher_specialties — Додаткові спеціалізації
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teacher_specialties (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  teacher_id  INT UNSIGNED NOT NULL,
  specialty   VARCHAR(100) NOT NULL,
  PRIMARY KEY (id),
  FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  INDEX idx_teacher (teacher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- ТАБЛИЦЯ: subjects — Напрямки навчання
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  name        VARCHAR(100)  NOT NULL,
  category    ENUM('music','art','other') NOT NULL DEFAULT 'music',
  description TEXT          NULL,
  price       DECIMAL(8,2)  NOT NULL DEFAULT 0.00,  -- ціна за 1 урок (грн)
  duration    SMALLINT      NOT NULL DEFAULT 45,     -- тривалість уроку (хв)
  is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- ТАБЛИЦЯ: bookings — Записи на уроки
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bookings (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  student_id    INT UNSIGNED  NOT NULL,
  teacher_id    INT UNSIGNED  NOT NULL,
  subject_id    INT UNSIGNED  NOT NULL,
  lesson_date   DATE          NOT NULL,
  lesson_time   TIME          NOT NULL,
  status        ENUM('pending','confirmed','completed','cancelled') NOT NULL DEFAULT 'pending',
  price         DECIMAL(8,2)  NOT NULL DEFAULT 0.00,
  notes         TEXT          NULL,
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (student_id) REFERENCES users(id)     ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id)  ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subjects(id)  ON DELETE CASCADE,
  INDEX idx_student    (student_id),
  INDEX idx_teacher    (teacher_id),
  INDEX idx_date       (lesson_date),
  INDEX idx_status     (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- ТАБЛИЦЯ: grades — Оцінки учнів
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grades (
  id          INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  student_id  INT UNSIGNED  NOT NULL,
  teacher_id  INT UNSIGNED  NOT NULL,
  booking_id  INT UNSIGNED  NULL,             -- прив'язка до конкретного уроку
  subject     VARCHAR(100)  NOT NULL,
  task        VARCHAR(255)  NOT NULL,
  score       TINYINT       NULL,             -- числова оцінка (1-100 або 1-12)
  status      ENUM('Склав','Здав','Не здав','Відмінно','Добре','Задовільно') NOT NULL DEFAULT 'Склав',
  comment     TEXT          NULL,
  graded_at   DATE          NOT NULL DEFAULT (CURRENT_DATE),
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (student_id) REFERENCES users(id)     ON DELETE CASCADE,
  FOREIGN KEY (teacher_id) REFERENCES teachers(id)  ON DELETE CASCADE,
  FOREIGN KEY (booking_id) REFERENCES bookings(id)  ON DELETE SET NULL,
  INDEX idx_student (student_id),
  INDEX idx_teacher (teacher_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- ТАБЛИЦЯ: payments — Фінансові операції
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id            INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  user_id       INT UNSIGNED  NOT NULL,
  booking_id    INT UNSIGNED  NULL,
  type          ENUM('topup','lesson_payment','refund','other') NOT NULL,
  description   VARCHAR(255)  NOT NULL,
  amount        DECIMAL(10,2) NOT NULL,         -- + поповнення, - списання
  balance_after DECIMAL(10,2) NOT NULL,
  status        ENUM('pending','completed','failed') NOT NULL DEFAULT 'completed',
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  INDEX idx_user       (user_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- ТАБЛИЦЯ: promotions — Акції та знижки
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promotions (
  id           INT UNSIGNED  NOT NULL AUTO_INCREMENT,
  title        VARCHAR(200)  NOT NULL,
  description  TEXT          NOT NULL,
  details      TEXT          NULL,
  discount     VARCHAR(10)   NOT NULL,     -- наприклад '50%', '100%'
  valid_until  VARCHAR(50)   NOT NULL,
  image_url    VARCHAR(500)  NULL,
  is_active    BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- ТАБЛИЦЯ: contacts — Заявки з сайту
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id         INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name       VARCHAR(100) NOT NULL,
  phone      VARCHAR(20)  NOT NULL,
  message    TEXT         NULL,
  is_handled BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX idx_handled (is_handled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ─────────────────────────────────────────────────────────────
-- ТАБЛИЦЯ: sessions — JWT refresh токени
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id      INT UNSIGNED NOT NULL,
  refresh_token VARCHAR(512) NOT NULL,
  expires_at   TIMESTAMP    NOT NULL,
  created_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user    (user_id),
  INDEX idx_token   (refresh_token(64)),
  INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ═══════════════════════════════════════════════════════════════
-- ПОЧАТКОВІ ДАНІ (seed data)
-- ═══════════════════════════════════════════════════════════════

-- Адміністратор (пароль: admin123 → хеш bcrypt)
INSERT IGNORE INTO users (name, email, password_hash, role, balance) VALUES
  ('Адміністратор', 'admin@artflow.ua',
   '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8Gi.rsNj0yBbwlHxCTm',
   'admin', 0.00);

-- Напрямки навчання
INSERT IGNORE INTO subjects (name, category, price, duration) VALUES
  ('Гітара',        'music', 350.00, 45),
  ('Піаніно',       'music', 400.00, 45),
  ('Скрипка',       'music', 400.00, 45),
  ('Бандура',       'music', 350.00, 45),
  ('Барабани',      'music', 350.00, 45),
  ('Сольфеджіо',    'music', 300.00, 45),
  ('Живопис',       'art',   350.00, 60),
  ('Скульптура',    'art',   400.00, 60),
  ('Портрет',       'art',   350.00, 60);

-- Акції
INSERT IGNORE INTO promotions (title, description, details, discount, valid_until, image_url) VALUES
  ('50% знижка на перший місяць',
   'Спеціальна пропозиція для нових учнів! Почніть свій шлях у мистецтві з вигодою.',
   'Знижка 50% на перший місяць навчання за будь-яким напрямком. Не поєднується з іншими знижками.',
   '50%', 'до 31.03.2026',
   'https://images.unsplash.com/photo-1514320291840-2e0a9bf2a9ae?w=600'),

  ('Безкоштовний пробний урок',
   'Спробуйте будь-який напрямок навчання абсолютно безкоштовно!',
   'Кожен новий учень може отримати один безкоштовний пробний урок тривалістю 45 хвилин.',
   '100%', 'до 15.04.2026',
   'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?w=600'),

  ('Сімейна знижка 30%',
   'При навчанні двох та більше членів родини отримайте знижку на всі уроки.',
   'Знижка 30% при одночасному записі двох або більше членів однієї родини.',
   '30%', 'постійна акція',
   'https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=600'),

  ('Пакет "Інтенсив"',
   '10 занять за ціною 8! Ідеально для швидкого прогресу.',
   'Придбайте пакет із 10 уроків та отримайте 2 безкоштовно. Пакет діє 3 місяці.',
   '20%', 'до 30.04.2026',
   'https://images.unsplash.com/photo-1519892300165-cb5542fb47c7?w=600');

-- ═══════════════════════════════════════════════════════════════
-- КОРИСНІ VIEWS (представлення)
-- ═══════════════════════════════════════════════════════════════

-- Перегляд: розклад з іменами
CREATE OR REPLACE VIEW v_schedule AS
  SELECT
    b.id,
    b.student_id,
    u_s.name  AS student_name,
    b.teacher_id,
    u_t.name  AS teacher_name,
    s.name    AS subject,
    b.lesson_date,
    b.lesson_time,
    b.status,
    b.price,
    b.notes
  FROM bookings b
  JOIN users    u_s ON u_s.id = b.student_id
  JOIN teachers t   ON t.id   = b.teacher_id
  JOIN users    u_t ON u_t.id = t.user_id
  JOIN subjects s   ON s.id   = b.subject_id;

-- Перегляд: фінансовий звіт по користувачах
CREATE OR REPLACE VIEW v_user_balance AS
  SELECT
    u.id,
    u.name,
    u.email,
    u.balance,
    COUNT(DISTINCT b.id) AS total_bookings,
    SUM(CASE WHEN p.type = 'topup' THEN p.amount ELSE 0 END) AS total_topups
  FROM users u
  LEFT JOIN bookings b ON b.student_id = u.id
  LEFT JOIN payments p ON p.user_id    = u.id
  WHERE u.role = 'student'
  GROUP BY u.id, u.name, u.email, u.balance;

-- ═══════════════════════════════════════════════════════════════
-- ЗБЕРЕЖЕНІ ПРОЦЕДУРИ
-- ═══════════════════════════════════════════════════════════════

DELIMITER //

-- Процедура: поповнення балансу
CREATE PROCEDURE IF NOT EXISTS sp_topup_balance(
  IN  p_user_id INT UNSIGNED,
  IN  p_amount  DECIMAL(10,2),
  OUT p_new_bal DECIMAL(10,2)
)
BEGIN
  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  START TRANSACTION;

  UPDATE users SET balance = balance + p_amount WHERE id = p_user_id;

  SELECT balance INTO p_new_bal FROM users WHERE id = p_user_id;

  INSERT INTO payments (user_id, type, description, amount, balance_after)
  VALUES (p_user_id, 'topup', 'Поповнення балансу', p_amount, p_new_bal);

  COMMIT;
END//

-- Процедура: оплата уроку
CREATE PROCEDURE IF NOT EXISTS sp_pay_lesson(
  IN  p_booking_id INT UNSIGNED,
  OUT p_success    BOOLEAN,
  OUT p_message    VARCHAR(255)
)
BEGIN
  DECLARE v_student_id  INT UNSIGNED;
  DECLARE v_price       DECIMAL(8,2);
  DECLARE v_balance     DECIMAL(10,2);
  DECLARE v_new_bal     DECIMAL(10,2);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    SET p_success = FALSE;
    SET p_message = 'Помилка транзакції';
  END;

  SELECT student_id, price INTO v_student_id, v_price
  FROM bookings WHERE id = p_booking_id;

  SELECT balance INTO v_balance FROM users WHERE id = v_student_id;

  IF v_balance < v_price THEN
    SET p_success = FALSE;
    SET p_message = 'Недостатньо коштів на балансі';
  ELSE
    START TRANSACTION;

    UPDATE users SET balance = balance - v_price WHERE id = v_student_id;
    UPDATE bookings SET status = 'confirmed' WHERE id = p_booking_id;

    SELECT balance INTO v_new_bal FROM users WHERE id = v_student_id;

    INSERT INTO payments (user_id, booking_id, type, description, amount, balance_after)
    VALUES (v_student_id, p_booking_id, 'lesson_payment', 'Оплата уроку', -v_price, v_new_bal);

    COMMIT;
    SET p_success = TRUE;
    SET p_message = 'Оплата успішна';
  END IF;
END//

DELIMITER ;

-- ═══════════════════════════════════════════════════════════════
-- ПЕРЕВІРОЧНИЙ ЗАПИТ
-- ═══════════════════════════════════════════════════════════════
SELECT 'ArtFlow DB успішно створено!' AS status;
SELECT TABLE_NAME AS `Таблиця`, TABLE_ROWS AS `Рядків`
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'artflow_bd'
ORDER BY TABLE_NAME;
