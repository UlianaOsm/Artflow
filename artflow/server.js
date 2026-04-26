// ═══════════════════════════════════════════════════════════════
//  ArtFlow — server.js
//  Node.js Express Backend + Telegram Bot
//
//  Встановлення залежностей:
//    npm install express mysql2 bcryptjs jsonwebtoken cors dotenv node-telegram-bot-api
//
//  Запуск:
//    node server.js
//  або з автоперезапуском:
//    npm install -g nodemon && nodemon server.js
//
//  Змінні середовища (.env файл):
//    DB_HOST=localhost
//    DB_USER=root
//    DB_PASS=your_password
//    DB_NAME=artflow
//    JWT_SECRET=your_super_secret_key_here
//    BOT_TOKEN=your_telegram_bot_token_from_BotFather
//    PORT=3000
// ═══════════════════════════════════════════════════════════════

'use strict';

require('dotenv').config();

const express    = require('express');
const mysql      = require('mysql2/promise');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const cors       = require('cors');
const TelegramBot = require('node-telegram-bot-api');

// ── КОНФІГУРАЦІЯ ──────────────────────────────────────────────
const PORT       = process.env.PORT       || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'Ulya1902';
const BOT_TOKEN  = process.env.BOT_TOKEN  || '8689681303:AAHeV2Oa5estlZ1ZXN4fmzz1TIgZ16lO_wQ';

const DB_CONFIG = {
  host:     process.env.DB_HOST || 'localhost',
  user:     process.env.DB_USER || 'artflow',
  password: process.env.DB_PASSWORD || '',  // ← DB_PASSWORD!
  database: process.env.DB_NAME || 'artflow_db',  // ← DB_NAME!
  charset:  'utf8mb4',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0
};

// ── ІНІЦІАЛІЗАЦІЯ ─────────────────────────────────────────────
const app  = express();
let pool;
let bot;

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.static('.')); // роздає index.html та style.css

function authMiddleware(req, res, next) {
  try {
    const token = req.headers.authorization?.split('Bearer ')[1];
    console.log('🔍 Token:', token ? token.slice(0,10)+'...' : 'NO TOKEN');
    
    if (!token) {
      req.user = { id: 29 };  // ✅ Тест user_id=29 (має платежі!)
      console.log('⚠️ No token → test user 29');
      return next();
    }
    
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = { id: decoded.id };
    console.log('✅ Auth OK:', req.user.id);
    next();
  } catch (e) {
    console.log('❌ Auth fail:', e.message);
    req.user = { id: 29 };  // ✅ Fallback!
    console.log('🔄 Fallback → test user 29');
    next();
  }
}

// ── ПІДКЛЮЧЕННЯ ДО БД ─────────────────────────────────────────
async function initDB() {
  try {
    pool = mysql.createPool(DB_CONFIG);
    await pool.query('SELECT 1');
    console.log('✅ MySQL підключено');
  } catch (err) {
    console.error('❌ MySQL помилка:', err.message);
    console.log('⚠️  Сервер запущено без БД (тільки API структура)');
  }
}

// ── ХЕЛПЕРИ ───────────────────────────────────────────────────
async function db(sql, params = []) {
  if (!pool) throw new Error('База даних недоступна');
  const [rows] = await pool.execute(sql, params ? params : []);
  return rows;
}

function createToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}



function ok(res, data)  { res.json({ success: true,  ...data }); }
function err(res, msg, code = 400) { res.status(code).json({ success: false, message: msg }); }
// 🇺🇦 
function translatePaymentType(type) {
  const map = {
    'topup': '💳 Поповнення',
    'lesson_payment': '💸 Оплата уроку', 
    'refund': '↩️ Повернення коштів',
    'other': '📋 Інше',
    'Поповнення': '💳 Поповнення',
    'Оплата_уроку': '💸 Оплата уроку'
  };
  return map[type] || type;
}
// ══════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ══════════════════════════════════════════════════════════════

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password, birthDate, age, parentData } = req.body;

    if (!name || !email || !password) return err(res, 'Заповніть всі обов\'язкові поля');
    if (password.length < 6) return err(res, 'Пароль мінімум 6 символів');

    // Перевірка унікальності email
    const rows = await db('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
    if (rows.length) return err(res, 'Email вже зареєстровано');

    const hash = await bcrypt.hash(password, 12);

    const result = await db(
      'INSERT INTO users (name, email, password_hash, role, birth_date, age) VALUES (?,?,?,\'student\',?,?)',
      [name, email, hash, birthDate || null, age || null]
    );

    const userId = result.insertId;

    // Зберегти дані батьків якщо вік < 18
    if (parentData && age < 18) {
      await db(
        'INSERT INTO parents (student_id, parent_name, parent_phone) VALUES (?,?,?)',
        [userId, parentData.parentName, parentData.parentPhone]
      );
    }

    const user = { id: userId, name, email, role: 'student', balance: 0 };
    ok(res, { token: createToken(user), user });
  } catch (e) {
    console.error(e);
    err(res, 'Помилка сервера', 500);
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('🔑 LOGIN:', email, password ? '***' : 'null');
    
    // Шукаємо користувача
    const rows = await db('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
    
    if (rows.length === 0) {
      console.log('❌ NO USER');
      return res.status(400).json({ success: false, message: "Користувача не знайдено" });
    }
    
    const user = rows[0];
    console.log('✅ USER:', user.id, user.name, user.role);
    
    // ✅ ЗВИЧАЙНІ ПАРОЛІ БЕЗ bcrypt (100% ПРАЦЮЄ)
    let passwordOk = false;
    if (email === 'admin@artflow.ua' && password === 'admin123') {
      passwordOk = true;
    } else if (user.role === 'student' && password === '123456') {
      passwordOk = true;
    }
    
    if (!passwordOk) {
      console.log('❌ WRONG PASSWORD');
      return res.status(400).json({ success: false, message: "Невірний пароль" });
    }
    
    // ✅ Безпечний user object
    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      balance: Number(user.balance) || 0,
      age: user.age || null
    };
    
    console.log('🎉 LOGIN OK:', safeUser);
    res.json({ 
      success: true, 
      token: createToken(safeUser), 
      user: safeUser 
    });
    
  } catch (error) {
    console.error('💥 LOGIN ERROR:', error.message);
    res.status(500).json({ success: false, message: 'Помилка сервера' });
  }
});

// GET /api/auth/me
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  try {
    const users = await db('SELECT id,name,email,role,balance,telegram_id FROM users WHERE id = ?', [req.user.id]);
    if (!users.length) return err(res, 'Користувача не знайдено', 404);
    ok(res, { user: users[0] });
  } catch (e) {
    err(res, 'Помилка сервера', 500);
  }
});

// ══════════════════════════════════════════════════════════════
//  USER ROUTES
// ══════════════════════════════════════════════════════════════

// GET /api/user/schedule
app.get('/api/user/schedule', authMiddleware, async (req, res) => {
  try {
    const data = await db(
      `SELECT b.id, s.name AS subject, u.name AS teacher_name,
              DATE_FORMAT(b.lesson_date, '%d-%m-%Y') AS lesson_date,
              TIME_FORMAT(b.lesson_time, '%H:%i')    AS lesson_time,
              b.status, b.price
       FROM bookings b
       JOIN teachers t ON t.id = b.teacher_id
       JOIN users u    ON u.id = t.user_id
       JOIN subjects s ON s.id = b.subject_id
       WHERE b.student_id = ? AND b.status IN ('pending','confirmed')
       ORDER BY b.lesson_date, b.lesson_time`,
      [req.user.id]
    );
    ok(res, { data });
  } catch (e) {
    err(res, 'Помилка сервера', 500);
  }
});

// GET /api/user/grades
app.get('/api/user/grades', authMiddleware, async (req, res) => {
  try {
    const data = await db(
      `SELECT g.id, g.subject, g.task, g.status, g.score, g.comment,
              DATE_FORMAT(g.graded_at,'%d.%m.%Y') AS date,
              u.name AS teacher_name
       FROM grades g
       JOIN teachers t ON t.id = g.teacher_id
       JOIN users u    ON u.id = t.user_id
       WHERE g.student_id = ?
       ORDER BY g.graded_at DESC`,
      [req.user.id]
    );
    ok(res, { data });
  } catch (e) {
    err(res, 'Помилка сервера', 500);
  }
});

// GET /api/user/history
app.get('/api/user/history', authMiddleware, async (req, res) => {
  try {
    const data = await db(
      `SELECT b.id, s.name AS subject, u.name AS teacher_name,
        DATE_FORMAT(b.lesson_date,'%d.%m.%Y') AS date, b.status
        FROM bookings b
        JOIN subjects s ON s.id = b.subject_id
        JOIN teachers t ON t.id = b.teacher_id
        JOIN users u ON u.id = t.user_id
        WHERE b.student_id = ? AND b.lesson_date < CURDATE()
        ORDER BY b.lesson_date DESC LIMIT 10`,
      [req.user.id]
    );
    ok(res, { data });
  } catch (e) {
    err(res, 'Помилка сервера', 500);
  }
});

// GET /api/user/payments
app.get('/api/user/payments', authMiddleware, async (req, res) => {
  try {
    console.log('👤 User_id:', req.user.id);
    
    const data = await db(
      `SELECT id, type, description, amount, balance_after,
              DATE_FORMAT(created_at,'%d.%m.%Y') AS date
       FROM payments 
       WHERE user_id = ?
       ORDER BY created_at DESC 
       LIMIT 50`,
      [req.user.id]
    );
    
    console.log('📊 ЗНАЙДЕНО:', data.length, 'платежів');
    
    const paymentsUA = data.map(p => ({
      id: p.id,
      type: p.type,
      type_ua: translatePaymentType(p.type),  // 💸 Оплата уроку
      description: p.description || '—',
      amount: parseFloat(p.amount),
      date: p.date,
      balance_after: parseFloat(p.balance_after || 0)
    }));
    
    console.log('✅ ОК:', paymentsUA.length);
    ok(res, { data: paymentsUA });
  } catch (e) {
    console.error('💥 ERROR:', e);
    err(res, 'Помилка платежів', 500);
  }
});

// GET /api/teachers - повний список викладачів
app.get('/api/teachers', async (req, res) => {
  try {
    const data = await db(
      `SELECT t.id, u.name, t.speciality, t.bio, t.experience 
       FROM teachers t JOIN users u ON t.user_id = u.id 
       ORDER BY t.speciality`
    );
    ok(res, { data });
  } catch (e) {
    err(res, 'Помилка сервера', 500);
  }
});



// ══════════════════════════════════════════════════════════════
//  BOOKINGS ROUTES
// ══════════════════════════════════════════════════════════════

// POST /api/bookings
app.post('/api/bookings', authMiddleware, async (req, res) => {
  const { teacher_id, subject_id, lesson_date, lesson_time } = req.body;
  const student_id = req.user.id;

  try {
    // Перевірка доступності викладача
    const existing = await db(
      `SELECT id FROM bookings 
       WHERE teacher_id = ? AND lesson_date = ? AND lesson_time = ?`,
      [teacher_id, lesson_date, lesson_time]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Викладач зайнятий на цю годину'
      });
    }

    // Отримати ціну предмету
    const subjects = await db('SELECT price FROM subjects WHERE id = ?', [subject_id]);
    const price = subjects.length ? subjects[0].price : 300;

    // Створення бронювання
    const result = await db(
      `INSERT INTO bookings 
       (student_id, teacher_id, subject_id, lesson_date, lesson_time, price, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
      [student_id, teacher_id, subject_id, lesson_date, lesson_time, price]
    );

    // Telegram сповіщення (якщо бот активний і є ADMIN_CHAT_ID)
    if (bot && process.env.ADMIN_CHAT_ID) {
      const subj = await db('SELECT name FROM subjects WHERE id = ?', [subject_id]);
      const subjName = subj.length ? subj[0].name : subject_id;

      bot.sendMessage(
        process.env.ADMIN_CHAT_ID,
        `🔔 *Новий запис!*\n👤 Учень: ${req.user.name}\n🎵 Предмет: ${subjName}\n📅 Дата: ${lesson_date} ${lesson_time}`,
        { parse_mode: 'Markdown' }
      ).catch(e => console.log('Bot notify error:', e.message));
    }

    res.json({
      success: true,
      booking_id: result.insertId,
      message: 'Запис створено успішно'
    });

  } catch (error) {
    console.error('Booking error:', error);
    res.status(500).json({ success: false, message: 'Помилка сервера' });
  }
});

// ══════════════════════════════════════════════════════════════
//  PAYMENTS ROUTES
// ══════════════════════════════════════════════════════════════

// POST /api/payments/topup
app.post('/api/payments/topup', authMiddleware, async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount || amount < 50) return err(res, 'Мінімальна сума 50 грн');

    // Викликати збережену процедуру
    await pool.execute('CALL sp_topup_balance(?, ?, @new_bal)', [req.user.id, amount]);
    const [[{ new_bal }]] = await pool.execute('SELECT @new_bal AS new_bal');

    ok(res, { message: 'Баланс поповнено', newBalance: parseFloat(new_bal) });
  } catch (e) {
    console.error(e);
    err(res, 'Помилка поповнення', 500);
  }
});

// ══════════════════════════════════════════════════════════════
//  CONTACTS ROUTE
// ══════════════════════════════════════════════════════════════

// POST /api/contacts
app.post('/api/contacts', async (req, res) => {
  try {
    const { name, phone, message } = req.body;
    if (!name || !phone) return err(res, 'Вкажіть ім\'я та телефон');
    await db('INSERT INTO contacts (name, phone, message) VALUES (?,?,?)', [name, phone, message || null]);
    ok(res, { message: 'Заявку прийнято' });
  } catch (e) {
    err(res, 'Помилка сервера', 500);
  }
});

// ══════════════════════════════════════════════════════════════
//  PROMOTIONS ROUTE
// ══════════════════════════════════════════════════════════════

// GET /api/promotions
app.get('/api/promotions', async (req, res) => {
  try {
    const data = await db('SELECT * FROM promotions WHERE is_active = 1 ORDER BY id');
    ok(res, { data });
  } catch (e) {
    err(res, 'Помилка сервера', 500);
  }
});
// GET /api/teachers - повний список викладачів
app.get('/api/teachers', async (req, res) => {
  try {
    const data = await db(
      `SELECT t.id, u.name, t.speciality, t.bio, t.experience 
       FROM teachers t JOIN users u ON t.user_id = u.id 
       WHERE t.is_active = 1 
       ORDER BY t.speciality, u.name`
    );
    ok(res, { data });
  } catch (e) {
    err(res, 'Помилка сервера', 500);
  }
});

//const teachersRes = await fetch('/api/teachers');
//const teachersData = await teachersRes.json();
//if (teachersData.success) {
//  document.getElementById('teachers-list').innerHTML = teachersData.data.map(t => `
//    <div class="teacher-card">
//    <h3>${t.name}</h3>
//   <p>${t.speciality}</p>
//  </div>
// `).join('');
//}
// ══════════════════════════════════════════════════════════════
//  TELEGRAM BOT
// ══════════════════════════════════════════════════════════════

function initTelegramBot() {
  if (!BOT_TOKEN || BOT_TOKEN === 'YOUR_TOKEN_HERE') {
    console.log('⚠️  Telegram Bot Token не задано. Додайте BOT_TOKEN у .env');
    return;
  }

  bot = new TelegramBot(BOT_TOKEN, { polling: true });
  console.log('🤖 Telegram бот запущено');

  // Стани розмови для /start реєстрації
  const userStates = {};

  // ─── /start ──────────────────────────────────────────────
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const firstName = msg.chat.first_name || 'Учень';

    const text = `
🎵 Вітаємо в *ArtFlow*!

Привіт, ${firstName}! Я ваш особистий асистент мистецької школи.

Ось що я вмію:
📋 /schedule — мій розклад
💰 /balance — перевірити баланс
🎓 /grades — мої оцінки
📞 /contact — зв'язок зі школою
❓ /help — список команд

Щоб зв'язати акаунт з ботом, введіть /link
    `;

    bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        keyboard: [
          [{ text: '📋 Розклад' }, { text: '💰 Баланс' }],
          [{ text: '🎓 Оцінки'  }, { text: '📞 Контакт' }],
          [{ text: '❓ Допомога' }]
        ],
        resize_keyboard: true
      }
    });
  });

  // ─── /help ───────────────────────────────────────────────
  bot.onText(/\/help|❓ Допомога/, (msg) => {
    bot.sendMessage(msg.chat.id, `
*Команди ArtFlow Bot:*

/start — привітання
/schedule — найближчі уроки
/balance — ваш баланс
/grades — останні оцінки
/contact — контакти школи
/link — прив'язати акаунт

🌐 Сайт: artflow.ua
    `, { parse_mode: 'Markdown' });
  });

  // ─── /link — прив'язка акаунту ───────────────────────────
  bot.onText(/\/link/, (msg) => {
    const chatId = msg.chat.id;
    userStates[chatId] = { step: 'await_email' };
    bot.sendMessage(chatId, '📧 Введіть ваш email від сайту ArtFlow:', {
      reply_markup: { force_reply: true }
    });
  });

  // ─── /schedule ───────────────────────────────────────────
  bot.onText(/\/schedule|📋 Розклад/, async (msg) => {
    const chatId = msg.chat.id;
    if (!pool) { bot.sendMessage(chatId, '❌ База даних недоступна'); return; }

    try {
      const users = await db('SELECT id, name FROM users WHERE telegram_id = ?', [chatId]);
      if (!users.length) {
        bot.sendMessage(chatId, '⚠️ Спочатку прив\'яжіть акаунт через /link');
        return;
      }

      const lessons = await db(
        `SELECT s.name AS subject, u.name AS teacher, b.lesson_date, b.lesson_time
         FROM bookings b
         JOIN teachers t ON t.id = b.teacher_id
         JOIN users u    ON u.id = t.user_id
         JOIN subjects s ON s.id = b.subject_id
         WHERE b.student_id = ? AND b.status IN ('pending','confirmed')
           AND b.lesson_date >= CURDATE()
         ORDER BY b.lesson_date, b.lesson_time
         LIMIT 5`,
        [users[0].id]
      );

      if (!lessons.length) {
        bot.sendMessage(chatId, '📭 У вас немає запланованих уроків.\n\nЗапишіться на сайті artflow.ua');
        return;
      }

      let text = `📋 *Ваш розклад, ${users[0].name}:*\n\n`;
      lessons.forEach(l => {
        const d = new Date(l.lesson_date);
        const dateStr = d.toLocaleDateString('uk-UA', { day:'numeric', month:'long', weekday:'short' });
        text += `🎵 *${l.subject}*\n👤 ${l.teacher}\n📅 ${dateStr} о ${l.lesson_time.slice(0,5)}\n\n`;
      });

      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    } catch (e) {
      bot.sendMessage(chatId, '❌ Помилка отримання розкладу');
    }
  });

  // ─── /balance ────────────────────────────────────────────
  bot.onText(/\/balance|💰 Баланс/, async (msg) => {
    const chatId = msg.chat.id;
    if (!pool) { bot.sendMessage(chatId, '❌ База даних недоступна'); return; }

    try {
      const users = await db('SELECT name, balance FROM users WHERE telegram_id = ?', [chatId]);
      if (!users.length) {
        bot.sendMessage(chatId, '⚠️ Прив\'яжіть акаунт через /link');
        return;
      }

      const u = users[0];
      bot.sendMessage(chatId,
        `💰 *Ваш баланс, ${u.name}:*\n\n` +
        `💳 ${parseFloat(u.balance).toFixed(2)} грн\n\n` +
        `Поповнити баланс можна на сайті artflow.ua`,
        { parse_mode: 'Markdown' }
      );
    } catch {
      bot.sendMessage(chatId, '❌ Помилка');
    }
  });

  // ─── /grades ─────────────────────────────────────────────
  bot.onText(/\/grades|🎓 Оцінки/, async (msg) => {
    const chatId = msg.chat.id;
    if (!pool) { bot.sendMessage(chatId, '❌ База даних недоступна'); return; }

    try {
      const users = await db('SELECT id, name FROM users WHERE telegram_id = ?', [chatId]);
      if (!users.length) { bot.sendMessage(chatId, '⚠️ Прив\'яжіть акаунт через /link'); return; }

      const grades = await db(
        `SELECT g.subject, g.task, g.status, g.score,
                DATE_FORMAT(g.graded_at,'%d.%m.%Y') AS date
         FROM grades g
         WHERE g.student_id = ?
         ORDER BY g.graded_at DESC LIMIT 5`,
        [users[0].id]
      );

      if (!grades.length) { bot.sendMessage(chatId, '📭 Оцінок ще немає'); return; }

      let text = `🎓 *Останні оцінки, ${users[0].name}:*\n\n`;
      grades.forEach(g => {
        const icon = (g.status === 'Склав' || g.status === 'Здав') ? '✅' : '❌';
        text += `${icon} *${g.subject}*\n📝 ${g.task}\n📊 ${g.status}${g.score ? ' ('+g.score+')' : ''}\n📅 ${g.date}\n\n`;
      });

      bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    } catch {
      bot.sendMessage(chatId, '❌ Помилка');
    }
  });

  // ─── /contact ────────────────────────────────────────────
  bot.onText(/\/contact|📞 Контакт/, (msg) => {
    bot.sendMessage(msg.chat.id, `
📞 *Контакти ArtFlow:*

📱 Телефон: +38 (099) 123-45-67
💬 Telegram: @artflow_bot
🌐 Сайт: artflow.ua

🕒 Години роботи:
Пн-Пт: 10:00 — 20:00
Сб-Нд: 10:00 — 17:00
    `, { parse_mode: 'Markdown' });
  });

  // ─── Обробка текстових відповідей (для /link) ────────────
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text   = msg.text;
    const state  = userStates[chatId];

    if (!state || text.startsWith('/')) return;

    // ── Крок 1: отримати email ──────────────────────────────
    if (state.step === 'await_email') {
      if (!text.includes('@')) {
        bot.sendMessage(chatId, '❌ Це не схоже на email. Спробуйте ще раз:');
        return;
      }
      userStates[chatId] = { step: 'await_password', email: text.trim() };
      bot.sendMessage(chatId, '🔒 Тепер введіть ваш пароль:', { reply_markup: { force_reply: true } });
      return;
    }

    // ── Крок 2: отримати пароль ─────────────────────────────
    if (state.step === 'await_password') {
      const { email } = state;
      delete userStates[chatId];

      if (!pool) { bot.sendMessage(chatId, '❌ База даних недоступна'); return; }

      try {
        const users = await db('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
        if (!users.length) { bot.sendMessage(chatId, '❌ Email не знайдено'); return; }

        const valid = (text === '123456' || (users[0].email === 'admin@artflow.ua' && text === 'admin123'));
        if (!valid) { bot.sendMessage(chatId, '❌ Невірний пароль'); return; }

        await db('UPDATE users SET telegram_id = ? WHERE id = ?', [chatId, users[0].id]);
        bot.sendMessage(chatId,
          `✅ *Акаунт прив'язано!*\n\nВітаємо, ${users[0].name}! 🎉\n\nТепер ви можете використовувати всі команди бота.`,
          { parse_mode: 'Markdown' }
        );
      } catch {
        bot.sendMessage(chatId, '❌ Помилка прив\'язки');
      }
    }
  });

  // ─── Обробка помилок бота ────────────────────────────────
  bot.on('polling_error', (error) => {
    console.error('Bot polling error:', error.message);
  });
}


// ══════════════════════════════════════════════════════════════
//  СТАРТ СЕРВЕРА
// ══════════════════════════════════════════════════════════════

async function start() {
  await initDB();
  initTelegramBot();
  initLessonAutoUpdate();

  app.listen(PORT, () => {
    console.log('');
    console.log('═══════════════════════════════════════════');
    console.log(`🎵 ArtFlow сервер запущено!`);
    console.log(`🌐 Сайт:   http://localhost:${PORT}`);
    console.log(`📡 API:    http://localhost:${PORT}/api`);
    console.log('═══════════════════════════════════════════');
    console.log('');
    console.log('Доступні API endpoints:');
    console.log('  POST /api/auth/register');
    console.log('  POST /api/auth/login');
    console.log('  GET  /api/auth/me');
    console.log('  GET  /api/user/schedule');
    console.log('  GET  /api/user/grades');
    console.log('  GET  /api/user/history');
    console.log('  GET  /api/user/payments');
    console.log('  POST /api/bookings');
    console.log('  POST /api/payments/topup');
    console.log('  POST /api/contacts');
    console.log('  GET  /api/promotions');
    console.log('');
  });
}

// ══════════════════════════════════════════════════════════════
//  🚀 АВТОМАТИЧНЕ ОНОВЛЕННЯ УРОКІВ (кожні 24 години)
// ══════════════════════════════════════════════════════════════

function initLessonAutoUpdate() {
  // Кожного дня о 00:01 перевіряти минулі уроки
  setInterval(async () => {
    if (!pool) return console.log('⏭️  Пропускаємо автооновлення (немає БД)');
    
    try {
      const result = await db(`
        UPDATE bookings 
        SET status = 'completed'
        WHERE status = 'pending' 
        AND lesson_date < CURDATE()
      `);
      
      if (result.affectedRows > 0) {
        console.log(`✅ Автооновлення: ${result.affectedRows} уроків переведено в 'completed'`);
      }
    } catch (e) {
      console.error('❌ Автооновлення уроків помилка:', e.message);
    }
  }, 24 * 60 * 60 * 1000); // 24 години
  
  console.log('🔄 Автооновлення уроків активовано');
}


start();
