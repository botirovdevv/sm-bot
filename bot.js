require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const db = require('./firebase');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const CHANNEL_ID = process.env.CHANNEL_ID;
const ADMIN_ID = process.env.ADMIN_ID;

console.log('🤖 Smile Movies Bot ishga tushdi!');

// ======================
// START COMMAND
// ======================
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;

  // Foydalanuvchini Firebase users collection ga saqlash
  await db.collection('users').doc(chatId.toString()).set({
    chatId,
    startedAt: new Date()
  }, { merge: true });

  // Welcome sticker (o'zingiz Telegram’dan sticker ID oling)
  // bot.sendSticker(chatId, 'STICKER_ID');

  bot.sendMessage(chatId, `🎬 *Smile Movies* botiga xush kelibsiz!\n
👤 Yaratuvchi: @mustafo_dv
🍿 Bu botda kino ko‘rish uchun obuna bo'lish shart emas
💡 Kino ko‘rish uchun kodi kiriting yoki /help ni bosing`, {
    parse_mode: 'Markdown',
    reply_markup: {
      keyboard: [['Kodni yozish 🎞'], ['/help ℹ️']],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  });
});

// ======================
// HELP COMMAND
// ======================
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, `💡 *Foydalanish qo'llanmasi:*\n
1️⃣ Kanalga admin sifatida kino qo‘shiladi
2️⃣ Har bir videoga caption (kod) beriladi
3️⃣ Siz kodi yozganingizda video keladi
4️⃣ Agar kodi topilmasa ❌ xabar chiqadi`, {
    parse_mode: 'Markdown'
  });
});

// ======================
// CHANNEL POST HANDLER
// ======================
bot.on('channel_post', async (post) => {
  if (post.chat.id.toString() !== CHANNEL_ID) return;
  if (!post.video || !post.caption) return;

  const code = post.caption.trim();
  const fileId = post.video.file_id;

  // Firestore ga saqlash
  await db.collection('movies').doc(code).set({
    fileId,
    createdAt: new Date(),
    views: 0
  });

  console.log(`🎬 Firebase saqlandi: ${code}`);
});

// ======================
// USER MESSAGE HANDLER
// ======================
bot.on('message', async (msg) => {
  if (!msg.text) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  // Agar foydalanuvchi komandalarni bosgan bo‘lsa
  if (text.startsWith('/')) return;

  const doc = await db.collection('movies').doc(text).get();

  if (!doc.exists) {
    // Xato xabar
    bot.sendMessage(chatId, '❌ Bunday kino kodi topilmadi\n💡 Iltimos kodi tekshirib qayta yozing');
    return;
  }

  const data = doc.data();

  // Statistika: views ni oshirish
  await db.collection('movies').doc(text).update({
    views: require('firebase-admin').firestore.FieldValue.increment(1)
  });

  // Video yuborish
  bot.sendVideo(chatId, data.fileId, { caption: `🎬 Kodi: ${text}\n✅ Yaxshi tomosha!` });
});

// ======================
// ADMIN BROADCAST
// ======================
bot.onText(/\/broadcast (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const text = match[1];

  if (chatId.toString() !== ADMIN_ID) {
    return bot.sendMessage(chatId, "❌ Siz admin emassiz");
  }

  const usersSnapshot = await db.collection('users').get();
  const users = usersSnapshot.docs.map(doc => doc.id);

  for (const userId of users) {
    try {
      await bot.sendMessage(userId, `📢 Admin xabari:\n\n${text}`);
    } catch (e) {
      console.log(`Xabar yuborilmadi: ${userId}`, e.message);
    }
  }

  bot.sendMessage(chatId, `✅ Xabar ${users.length} foydalanuvchiga yuborildi`);
});

// ======================
// ADMIN STATS
// ======================
bot.onText(/\/stats/, async (msg) => {
  const chatId = msg.chat.id;

  if (chatId.toString() !== ADMIN_ID) {
    return bot.sendMessage(chatId, "❌ Siz admin emassiz");
  }

  const usersSnapshot = await db.collection('users').get();
  const count = usersSnapshot.size;

  bot.sendMessage(chatId, `📊 Botni ${count} foydalanuvchi ishlatmoqda`);
});
