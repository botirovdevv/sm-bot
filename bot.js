const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const token = process.env.BOT_TOKEN;

const bot = new TelegramBot(token, { polling: true });

const dbPath = path.join(__dirname, 'movies.json');

const loadMovies = () => {
    if (!fs.existsSync(dbPath)) {
        fs.writeFileSync(dbPath, JSON.stringify({}));
    }
    const data = fs.readFileSync(dbPath);
    return JSON.parse(data);
};

const saveMovie = (code, fileId, caption) => {
    const movies = loadMovies();
    movies[code] = { fileId, caption };
    fs.writeFileSync(dbPath, JSON.stringify(movies, null, 2));
};

bot.on('channel_post', (msg) => {
    console.log("Kanalga xabar keldi:", msg); 

    if ((msg.video || msg.document) && msg.caption) {
        
        const caption = msg.caption.trim();
        const code = caption.split(' ')[0]; 
        
        const fileId = msg.video ? msg.video.file_id : msg.document.file_id;

        saveMovie(code, fileId, msg.caption);
        
        console.log(`✅ Yangi kino saqlandi! Kod: ${code}`);
    } else {
        console.log("❌ Xabar keldi, lekin u video emas yoki kodi yo'q.");
    }
});


bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (text === '/start') {
        bot.sendMessage(chatId, "Assalomu alaykum! Menga kino kodini yuboring.");
        return;
    }

    const movies = loadMovies();
    
    if (movies[text]) {
        const movie = movies[text];
        
        bot.sendMessage(chatId, "Kino topildi, yuklanmoqda...");
        
        bot.sendVideo(chatId, movie.fileId, {
            caption: movie.caption
        }).catch((err) => {
            bot.sendDocument(chatId, movie.fileId, {
                caption: movie.caption
            });
        });
        
    } else {
        bot.sendMessage(chatId, "Bunday kodli kino topilmadi. Kodni to'g'ri yozganingizni tekshiring.");
    }
});

console.log("Bot ishga tushdi...");