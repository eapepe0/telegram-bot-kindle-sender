require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");

// Creamos la carpeta downloads si no existe
const DOWNLOADS_DIR = path.join(__dirname, "downloads");

if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR);
}

// funcion que me ayude a ver lo que pasa en Render
function log(level, message, data = {}) {
  const time = new Date().toISOString();
  console.log(JSON.stringify({ time, level, message, ...data }));
}

const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: true });

log("INFO", "Bot iniciado", {
  polling: true,
  email_user: process.env.EMAIL_USER,
});

const userKindleMails = {};
const usersInSetup = {};

// Transporter SMTP
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

bot.on("document", async (msg) => {

  const chatId = msg.chat.id;
  const file = msg.document;

	const kindleEmail = userKindleMails[chatId];

  log("INFO", "Documento recibido", {
    chatId,
    filename: file.file_name,
    size: file.file_size,
  });

	if (!kindleEmail) {
  	bot.sendMessage(chatId, '⚠️ Primero configurá tu email Kindle con /setmail');
  	return;
	}


  if (!file.file_name.endsWith(".epub")) {
    bot.sendMessage(chatId, "❌ Solo acepto archivos EPUB");
    return;
  }

  try {
    bot.sendMessage(chatId, "📥 Descargando archivo...");

    const filePath = await bot.downloadFile(file.file_id, DOWNLOADS_DIR);

    bot.sendMessage(chatId, "📧 Enviando al Kindle...");

    await transporter.sendMail({
      from: `"Telegram Kindle Bot" <${process.env.EMAIL_USER}>`,
      to: process.env.KINDLE_EMAIL,
      subject: "Kindle EPUB",
      text: "Archivo enviado automáticamente desde Telegram",
      attachments: [
        {
          filename: path.basename(filePath),
          path: filePath,
        },
      ],
    });

    log("INFO", "Enviando EPUB al Kindle", {
      chatId,
      to: kindleEmail,
      file: path.basename(filePath),
    });

    bot.sendMessage(chatId, "✅ EPUB enviado correctamente al Kindle");

    fs.unlinkSync(filePath); // limpiar archivo
  } catch (err) {
    console.error(err);
    bot.sendMessage(chatId, "❌ Error al enviar el archivo");
    log("ERROR", "Error enviando EPUB", {
      chatId,
      error: err.message,
    });
  }
});

bot.onText(/\/start/, (msg) => {
  log("INFO", "Comando /start", { chatId: msg.chat.id });
  bot.sendMessage(
    msg.chat.id,
    `
📚 Bienvenido al Kindle Bot

Este bot te permite enviar libros directamente a tu Kindle.

👉 Primer paso:
Ingresá la dirección de email de tu dispositivo usando:

/setmail

Y siguiendo los pasos

Recorda de entrar a https://www.amazon.com/hz/mycd/preferences/myx#/home/settings/payment 

Agrega ${process.env.EMAIL_USER} a la Lista de direcciones de correo electrónico autorizadas para el envío de documentos personales

Luego solo tenés que enviarme un archivo EPUB y yo me encargo del resto 📧➡️📚
`
  );
});

bot.onText(/\/setmail$/, (msg) => {
  const chatId = msg.chat.id;

  log("INFO", "Inicio configuración email Kindle", { chatId });

  usersInSetup[chatId] = true;

  bot.sendMessage(
    chatId,
    `
📚 Antes de continuar, es importante configurar dos cosas para que el envío al Kindle funcione correctamente:

🔐 1) Contraseña de aplicación (Gmail)
Si usás Gmail como cuenta emisora:
- Activá la verificación en dos pasos
- Generá una contraseña de aplicación
- App: Correo
- Dispositivo: Otro → Telegram Kindle Bot

📩 2) Autorizar el email en Amazon Kindle
- Amazon → Manage Your Content and Devices
- Preferences → Personal Document Settings
- Approved Personal Document Email List
- Agregá el email emisor

Cuando lo tengas listo, enviá ahora tu email Kindle:
👉 tuusuario@kindle.com
`
  );
});

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!usersInSetup[chatId]) return;
  if (!text || text.startsWith("/")) return;

  const kindleRegex = /^[^\s@]+@(kindle\.com|free\.kindle\.com)$/i;

  if (!kindleRegex.test(text)) {
    bot.sendMessage(
      chatId,
      `
❌ El email no es un Kindle válido.

Debe terminar en:
- @kindle.com
- @free.kindle.com
`
    );
    return;
  }

  userKindleMails[chatId] = text;
  usersInSetup[chatId] = false;

  bot.sendMessage(
    chatId,
    `
✅ Email Kindle configurado correctamente:

📩 ${text}

Ahora podés enviarme archivos EPUB y los mando automáticamente a tu Kindle 📚
`
  );

  log("INFO", "Email Kindle configurado", {
    chatId,
    kindleEmail: text,
  });
});

bot.onText(/\/help/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `
📖 Ayuda – Kindle Bot

Comandos disponibles:
/start  – Mensaje inicial
/setmail – Configurar email Kindle
/help   – Ver esta ayuda

📌 Requisitos:
- Email emisor autorizado en Amazon
- Contraseña de aplicación (si usás Gmail)
- Enviar solo archivos EPUB / PDF / DOCX
`
  );
});
