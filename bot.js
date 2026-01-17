require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const db = require('./firebase');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const CHANNEL_ID = process.env.CHANNEL_ID;

console.log('🤖 Smile Movies Bot ishga tushdi!');

// ======================
// START COMMAND
// ======================
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, `🎬 Smile Movies botiga xush kelibsiz!
Kodni yozib kinoni ko‘ring.
📌 Agar kod topilmasa /help ni bosing`, {
    reply_markup: {
      keyboard: [['Kodni yozish']],
      resize_keyboard: true,
      one_time_keyboard: true
    }
  });
});

// ======================
// HELP COMMAND
// ======================
bot.onText(/\/help/, (msg) => {
  bot.sendMessage(msg.chat.id, `💡 Foydalanish:
1️⃣ Kanalga admin sifatida kino yuboriladi
2️⃣ Har bir videoga caption (kod) beriladi
3️⃣ Foydalanuvchi kodi yozsa video keladi
4️⃣ Kod topilmasa ❌ xabar chiqadi`);
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
  const code = msg.text.trim();

  // Agar foydalanuvchi /start yoki /help bosgan bo‘lsa
  if (code.startsWith('/')) return;

  const doc = await db.collection('movies').doc(code).get();

  if (!doc.exists) {
    return bot.sendMessage(chatId, '❌ Bunday kino kodi topilmadi');
  }

  const data = doc.data();

  // Statistika: views ni oshirish
  await db.collection('movies').doc(code).update({
    views: require('firebase-admin').firestore.FieldValue.increment(1)
  });

  // Video yuborish
  bot.sendVideo(chatId, data.fileId, { caption: `🎬 Kodi: ${code}` });
});
