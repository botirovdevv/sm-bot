require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');
const db = require('./firebase');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const CHANNEL_ID = process.env.CHANNEL_ID;
const ADMIN_ID = process.env.ADMIN_ID;

console.log('🤖 Smile Movies Bot ishga tushdi!');

// ======================
// KINO KODINI AJRATIB OLISH
// ======================
function extractMovieCode(caption) {
  if (!caption) return null;

  // Kod: 1234 | 🔢 Kod - 1234 | kod 1234
  const match = caption.match(/kod\s*[:\-]?\s*(\d+)/i);
  return match ? match[1] : null;
}

// ======================
// START COMMAND
// ======================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id.toString();

  try {
    await db.collection('users').doc(chatId).set(
      {
        chatId,
        startedAt: new Date(),
      },
      { merge: true }
    );

    await bot.sendMessage(
      chatId,
      `🎬 <b>Smile Movies</b> botiga xush kelibsiz!

👤 Yaratuvchi: <b>@mustafo_dv</b>
🍿 Bu botda kino ko‘rish uchun <b>obuna shart emas</b>

🔢 Kino kodini yuboring va tomosha qiling`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error('Start command xatolik:', err);
  }
});

// ======================
// HELP COMMAND
// ======================
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;

  try {
    await bot.sendMessage(
      chatId,
      `ℹ️ <b>Qanday ishlaydi?</b>

1️⃣ Admin kanalga kino yuboradi
2️⃣ Caption ichida <b>Kod:</b> bo‘ladi
3️⃣ Siz kodni yuborasiz
4️⃣ Bot kinoni qaytaradi 🎬

📝 Misol:
<code>🔢 Kod: 4587</code>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error('Help command xatolik:', err);
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
      console.log('❌ Caption ichida kino kodi topilmadi');
      return;
    }

    const fileId = post.video.file_id;

    await db.collection('movies').doc(code).set({
      fileId,
      caption: post.caption,
      createdAt: new Date(),
      views: 0,
    });

    console.log(`🎬 Kino saqlandi. Kod: ${code}`);
  } catch (err) {
    console.error('Channel post handler xatolik:', err);
  }
});

// ======================
// USER MESSAGE HANDLER
// ======================
bot.on('message', async (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (text.startsWith('/')) return;

  try {
    const doc = await db.collection('movies').doc(text).get();

    if (!doc.exists) {
      return bot.sendMessage(
        chatId,
        `❌ <b>Bunday kino kodi topilmadi</b>
🔁 Iltimos, kodni tekshirib qayta yuboring`,
        { parse_mode: 'HTML' }
      );
    }

    const data = doc.data();

    await db.collection('movies').doc(text).update({
      views: admin.firestore.FieldValue.increment(1),
    });

    await bot.sendVideo(chatId, data.fileId, {
      caption: `🎬 <b>Kino kodi:</b> ${text}
🍿 Yaxshi tomosha!`,
      parse_mode: 'HTML',
    });
  } catch (err) {
    console.error('Message handler xatolik:', err);
    bot.sendMessage(chatId, '❌ Xatolik yuz berdi, qayta urinib ko‘ring.');
  }
});

// ======================
// ADMIN: BROADCAST
// ======================
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  if (msg.chat.id.toString() !== ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, '❌ Siz admin emassiz');
  }

  const text = match[1];

  try {
    const usersSnap = await db.collection('users').get();
    let sent = 0;

    for (const doc of usersSnap.docs) {
      try {
        await bot.sendMessage(
          doc.id,
          `📢 <b>Admin xabari</b>

${text}`,
          { parse_mode: 'HTML' }
        );
        sent++;
      } catch (e) {
        console.log('Xabar yuborilmadi:', doc.id);
      }
    }

    await bot.sendMessage(
      msg.chat.id,
      `✅ Xabar <b>${sent}</b> ta foydalanuvchiga yuborildi`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error('Broadcast xatolik:', err);
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

👥 Foydalanuvchilar soni: <b>${usersSnap.size}</b>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error('Stats command xatolik:', err);
  }
});