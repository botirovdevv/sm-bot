require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const admin = require('firebase-admin');
const db = require('./firebase');

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });
const CHANNEL_ID = process.env.CHANNEL_ID;
const ADMIN_ID = process.env.ADMIN_ID;

/* ======================================
   HELPER FUNCTIONS
======================================*/

// Oddiy kino kodi
function extractMovieCode(caption) {
  if (!caption) return null;
  const match = caption.match(/kod\s*[:\-]?\s*(\d+)/i);
  return match ? match[1] : null;
}

// Serial + qism aniqlash (kuchli versiya)
function extractSerialInfo(caption) {
  if (!caption) return null;

  const serialMatch = caption.match(/serial\s*[:\-]?\s*(\d+)/i);

  const partMatch =
    caption.match(/qism\s*[:\-]?\s*(\d+)/i) ||   // Qism: 4
    caption.match(/(\d+)\s*[-]?\s*qism/i);       // 4-qism yoki 4 qism

  if (!serialMatch || !partMatch) return null;

  return {
    serialCode: serialMatch[1],
    partNumber: partMatch[1],
  };
}

/* ======================================
   SERIAL PAGINATION
======================================*/
const PAGE_SIZE = 5; // bir sahifada qancha qism ko‘rsatiladi

function getSerialKeyboard(serialCode, totalParts, page = 0) {
  const keyboard = [];
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, totalParts);

  let row = [];
  for (let i = start; i < end; i++) {
    row.push({
      text: `${i + 1}-qism`,
      callback_data: `serial_${serialCode}_${i + 1}_page_${page}`,
    });

    if (row.length === 2) {
      keyboard.push(row);
      row = [];
    }
  }
  if (row.length > 0) keyboard.push(row);

  const navRow = [];
  if (page > 0) navRow.push({ text: "⬅️ Orqaga", callback_data: `serial_${serialCode}_nav_${page - 1}` });
  if (end < totalParts) navRow.push({ text: "➡️ Keyingi", callback_data: `serial_${serialCode}_nav_${page + 1}` });
  if (navRow.length) keyboard.push(navRow);

  return keyboard;
}

/* ======================================
   START
======================================*/
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const firstName = msg.from.first_name || "do'st";

  await bot.sendMessage(
    chatId,
    `🎬 <b>Assalomu aleykum, ${firstName}!</b>\n\n` +
    `Bu botdan foydalanish uchun hech qanday kanalga obuna bo‘lish sharti yo‘q ✅\n\n` +
    `🔢 Kino yoki serial kodini yuboring, va siz osonlik bilan film yoki serialni olasiz!`,
    { parse_mode: "HTML" }
  );
});

/* ======================================
   CHANNEL POST (Firebase ga saqlash)
======================================*/
bot.on('channel_post', async (post) => {
  try {
    if (post.chat.id.toString() !== CHANNEL_ID) return;

    if (post.video && post.caption) {
      const serialInfo = extractSerialInfo(post.caption);

      if (serialInfo) {
        await db.collection('serial_parts')
          .doc(`${serialInfo.serialCode}_${serialInfo.partNumber}`)
          .set({
            fileId: post.video.file_id,
            createdAt: new Date(),
          });
        console.log(`📺 Serial saqlandi: ${serialInfo.serialCode} | Qism: ${serialInfo.partNumber}`);
        return;
      }

      const code = extractMovieCode(post.caption);
      if (code) {
        await db.collection('movies').doc(code).set({
          fileId: post.video.file_id,
          caption: post.caption,
          createdAt: new Date(),
          views: 0,
        });
        console.log(`🎬 Kino saqlandi: ${code}`);
      }
    }

  } catch (err) {
    console.error("Channel post xatolik:", err);
  }
});

/* ======================================
   USER MESSAGE
======================================*/
bot.on('message', async (msg) => {
  if (!msg.text) return;
  if (msg.text.startsWith('/')) return;

  const chatId = msg.chat.id;
  const text = msg.text.trim();

  try {
    // Serial tekshirish
    const serialDoc = await db.collection('serials').doc(text).get();
    if (serialDoc.exists) {
      const serialData = serialDoc.data();
      const totalParts = serialData.totalParts;
      const keyboard = getSerialKeyboard(text, totalParts, 0); // bosh sahifa

      return bot.sendPhoto(chatId, serialData.posterFileId, {
        caption: `🎬 <b>${serialData.title}</b>\n\n👇 Qismni tanlang`,
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: keyboard },
      });
    }

    // Kino tekshirish
    const movieDoc = await db.collection('movies').doc(text).get();
    if (!movieDoc.exists) {
      return bot.sendMessage(chatId, `❌ <b>Kod topilmadi</b>\n🔁 Qayta tekshiring`, { parse_mode: "HTML" });
    }

    const movieData = movieDoc.data();
    await db.collection('movies').doc(text).update({
      views: admin.firestore.FieldValue.increment(1),
    });

    const captionParts = movieData.caption ? movieData.caption.match(/(.|[\r\n]){1,800}/g) : [`🎬 Kino kodi: ${text}`];
    captionParts.forEach((part, idx) => {
      bot.sendVideo(chatId, movieData.fileId, { caption: `${getIcon(idx)} ${part}`, parse_mode: "HTML" });
    });

  } catch (err) {
    console.error("User message xatolik:", err);
    bot.sendMessage(chatId, "❌ Xatolik yuz berdi");
  }
});

/* ======================================
   CALLBACK QUERY (Serial qism)
======================================*/
bot.on('callback_query', async (query) => {
  try {
    const data = query.data;
    if (!data.startsWith('serial_')) return;

    const parts = data.split('_');

    // Pagination tugmalari
    if (parts[2] === 'nav') {
      const serialCode = parts[1];
      const page = parseInt(parts[3]);
      const serialDoc = await db.collection('serials').doc(serialCode).get();
      if (!serialDoc.exists) return bot.answerCallbackQuery(query.id, { text: "Serial topilmadi ❌", show_alert: true });

      const totalParts = serialDoc.data().totalParts;
      const keyboard = getSerialKeyboard(serialCode, totalParts, page);

      return bot.editMessageReplyMarkup(
        { inline_keyboard: keyboard },
        { chat_id: query.message.chat.id, message_id: query.message.message_id }
      );
    }

    // Qismni jo‘natish
    const serialCode = parts[1];
    const partNumber = parts[2];
    const partDoc = await db.collection('serial_parts').doc(`${serialCode}_${partNumber}`).get();
    if (!partDoc.exists) return bot.answerCallbackQuery(query.id, { text: "Qism topilmadi ❌", show_alert: true });

    await bot.sendVideo(query.message.chat.id, partDoc.data().fileId, { caption: `${getIcon(parseInt(partNumber) - 1)} 🎬 ${partNumber}-qism` });
    bot.answerCallbackQuery(query.id);

  } catch (err) {
    console.error("Callback xatolik:", err);
  }
});
