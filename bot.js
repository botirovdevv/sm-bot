require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');
const db = require('./firebase');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const CHANNEL_ID = process.env.CHANNEL_ID;
const ADMIN_ID = process.env.ADMIN_ID;

console.log('🤖 Smile Movies Bot ishga tushdi!');

// ======================
// KINO KODINI CAPTIONDAN AJRATISH
// ======================
function extractMovieCode(caption) {
  if (!caption) return null;

  // Misollar:
  // Kod: 6
  // kod 6
  // 🔢 Kod - 6
  const match = caption.match(/kod\s*[:\-]?\s*(\d+)/i);
  return match ? match[1] : null;
}

// ======================
// START COMMAND
// ======================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id.toString();
  const username = msg.from.username ? '@' + msg.from.username : 'Username yo‘q';
  const firstName = msg.from.first_name || '';
  const lastName = msg.from.last_name || '';

  const userData = {
    chatId,
    username,
    firstName,
    lastName,
    startedAt: new Date(),
  };

  try {
    await db.collection('users').doc(chatId).set(userData, { merge: true });

    // Foydalanuvchiga xabar
    await bot.sendMessage(
      chatId,
      `🎬 <b>Smile Movies</b> botiga xush kelibsiz!

👤 Yaratuvchi: <b>@mustafo_dv</b>
🍿 Obuna shart emas

🔢 Kino kodini yuboring`,
      {
        parse_mode: 'HTML',
        reply_markup: {
          remove_keyboard: true,
        },
      }
    );

    // ======================
    // ADMINGA YANGI FOYDALANUVCHI XABARI
    // ======================
    await bot.sendMessage(
      ADMIN_ID,
      `🆕 <b>Yangi foydalanuvchi qo‘shildi!</b>\n
👤 Ismi: ${firstName} ${lastName}
🔗 Username: ${username}
🆔 Chat ID: ${chatId}
📅 Qo‘shilgan sana: ${userData.startedAt.toLocaleString()}`,
      { parse_mode: 'HTML' }
    );

  } catch (err) {
    console.error('Start xatolik:', err);
  }
});



// ======================
// HELP COMMAND
// ======================
bot.onText(/\/help/, async (msg) => {
  try {
    await bot.sendMessage(
      msg.chat.id,
      `ℹ️ <b>Qanday ishlaydi?</b>

1️⃣ Kanalga kino tashlanadi
2️⃣ Caption ichida <b>Kod:</b> bo‘ladi
3️⃣ Siz kodni botga yuborasiz
4️⃣ Bot kinoni qaytaradi 🎬

📝 Misol:
<code>Kod: 6</code>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error('Help xatolik:', err);
  }
});

// ======================
// CHANNEL POST HANDLER
// ======================
bot.on('channel_post', async (post) => {
  try {
    if (post.chat.id.toString() !== CHANNEL_ID) return;
    if (!post.video || !post.caption) return;

    const code = extractMovieCode(post.caption);
    if (!code) {
      console.log('❌ Caption ichida kod topilmadi');
      return;
    }

    await db.collection('movies').doc(code).set({
      fileId: post.video.file_id,
      caption: post.caption || '',
      createdAt: new Date(),
      views: 0,
    });

    console.log(`🎬 Kino saqlandi | Kod: ${code}`);
  } catch (err) {
    console.error('Channel post xatolik:', err);
  }
});

// ======================
// USER MESSAGE HANDLER
// ======================
bot.on('message', async (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // commandlarni o'tkazib yuboramiz
  if (text.startsWith('/')) return;

  try {
    const doc = await db.collection('movies').doc(text).get();

    if (!doc.exists) {
      return bot.sendMessage(
        chatId,
        `❌ <b>Bunday kino kodi topilmadi</b>
🔁 Kodni tekshirib qayta yuboring`,
        { parse_mode: 'HTML' }
      );
    }

    const data = doc.data();

    // views +1
    await db.collection('movies').doc(text).update({
      views: admin.firestore.FieldValue.increment(1),
    });

    // caption bo‘sh bo‘lsa — default text
    const captionText =
      data.caption && data.caption.trim().length > 0
        ? data.caption
        : `🎬 Kino kodi: ${text}\n🍿 Yaxshi tomosha!`;

    await bot.sendVideo(chatId, data.fileId, {
      caption: captionText,
    });

  } catch (err) {
    console.error('User message xatolik:', err);
    bot.sendMessage(chatId, '❌ Xatolik yuz berdi, qayta urinib ko‘ring.');
  }
});

// ======================
// ADMIN: STATS
// ======================
bot.onText(/\/stats/, async (msg) => {
  if (msg.chat.id.toString() !== ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, '❌ Siz admin emassiz');
  }

  try {
    const usersSnap = await db.collection('users').get();

    await bot.sendMessage(
      msg.chat.id,
      `📊 <b>Bot statistikasi</b>

👥 Foydalanuvchilar: <b>${usersSnap.size}</b>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error('Stats xatolik:', err);
  }
});
