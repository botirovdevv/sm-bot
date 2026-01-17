require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');
const db = require('./firebase');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const CHANNEL_ID = process.env.CHANNEL_ID;
const ADMIN_ID = process.env.ADMIN_ID;

console.log('🤖 Smile Movies Bot ishga tushdi!');

// ======================
// START COMMAND
// ======================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id.toString();

  await db.collection('users').doc(chatId).set(
    {
      chatId,
      startedAt: new Date(),
    },
    { merge: true }
  );

  bot.sendMessage(
    chatId,
    `🎬 <b>Smile Movies</b> botiga xush kelibsiz!

👤 Yaratuvchi: <b>@mustafo_dv</b>
🍿 Bu botda kino ko‘rish uchun <b>obuna shart emas</b>`,
    { parse_mode: 'HTML' }
  );
});

// ======================
// HELP COMMAND
// ======================
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `ℹ️ <b>Qanday ishlaydi?</b><br><br>
1️⃣ Kanalga kino yuboriladi<br>
2️⃣ Video caption — bu <b>kino kodi</b><br>
3️⃣ Siz kodi yozasiz<br>
4️⃣ Bot sizga kinoni yuboradi 🎬`,
    { parse_mode: 'HTML' }
  );
});

// ======================
// CHANNEL POST HANDLER
// ======================
bot.on('channel_post', async (post) => {
  if (post.chat.id.toString() !== CHANNEL_ID) return;
  if (!post.video || !post.caption) return;

  const code = post.caption.trim();
  const fileId = post.video.file_id;

  await db.collection('movies').doc(code).set({
    fileId,
    createdAt: new Date(),
    views: 0,
  });

});

// ======================
// USER MESSAGE HANDLER
// ======================
bot.on('message', async (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  if (text.startsWith('/')) return;

  const doc = await db.collection('movies').doc(text).get();

  if (!doc.exists) {
    return bot.sendMessage(
      chatId,
      `❌ <b>Bunday kino kodi topilmadi</b><br>
🔁 Iltimos, kodni tekshirib qayta yuboring`,
      { parse_mode: 'HTML' }
    );
  }

  const data = doc.data();

  await db.collection('movies').doc(text).update({
    views: admin.firestore.FieldValue.increment(1),
  });

  bot.sendVideo(chatId, data.fileId, {
    caption: `🎬 Kino kodi: <b>${text}</b>\n🍿 Yaxshi tomosha!`,
    parse_mode: 'HTML',
  });
});

// ======================
// ADMIN: BROADCAST
// ======================
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  if (msg.chat.id.toString() !== ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, '❌ Siz admin emassiz');
  }

  const text = match[1];
  const usersSnap = await db.collection('users').get();

  let sent = 0;

  for (const doc of usersSnap.docs) {
    try {
      await bot.sendMessage(
        doc.id,
        `📢 <b>Admin xabari</b><br><br>${text}`,
        { parse_mode: 'HTML' }
      );
      sent++;
    } catch (e) {
      console.log('Xabar yuborilmadi:', doc.id);
    }
  }

  bot.sendMessage(
    msg.chat.id,
    `✅ Xabar <b>${sent}</b> ta foydalanuvchiga yuborildi`,
    { parse_mode: 'HTML' }
  );
});

// ======================
// ADMIN: STATS
// ======================
bot.onText(/\/stats/, async (msg) => {
  if (msg.chat.id.toString() !== ADMIN_ID) {
    return bot.sendMessage(msg.chat.id, '❌ Siz admin emassiz');
  }

  const usersSnap = await db.collection('users').get();

  bot.sendMessage(
    msg.chat.id,
    `📊 <b>Bot statistikasi</b><br><br>
👥 Foydalanuvchilar soni: <b>${usersSnap.size}</b>`,
    { parse_mode: 'HTML' }
  );
});
