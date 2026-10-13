// Minimal Telegram Bot API client (https://core.telegram.org/bots/api).
// Outgoing HTTPS only: the laptop asks Telegram for new messages (long polling), so no port is opened
// and no firewall change is needed. The bot token is never logged or put in an error message.

const base = () => process.env.TELEGRAM_API_BASE || 'https://api.telegram.org'; // overridable for tests
const token = () => (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const isConfigured = () => /^\d+:[\w-]{20,}$/.test(token());

class TelegramError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status; // 401 = bad token, 409 = another app is polling this bot, 429 = slow down
  }
}

async function call(method, params = {}, { timeoutMs = 20_000 } = {}) {
  let res;
  try {
    res = await fetch(`${base()}/bot${token()}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    throw new TelegramError(`Can't reach Telegram (${e.name === 'TimeoutError' ? 'timed out' : 'offline?'})`, 0);
  }
  const json = await res.json().catch(() => ({}));
  if (!json.ok) throw new TelegramError(`Telegram ${method}: ${json.description || res.status}`, json.error_code || res.status);
  return json.result;
}

const getMe = () => call('getMe');

/** Long poll: waits up to `timeout` seconds for new messages. */
const getUpdates = (offset, timeout = 50) =>
  call('getUpdates', { offset, timeout, allowed_updates: ['message', 'callback_query'] }, { timeoutMs: (timeout + 15) * 1000 }); // callback_query = the Mentor's buttons

/** extra: e.g. { reply_markup: { inline_keyboard: [[{ text, callback_data }]] } } */
const sendMessage = (chatId, text, extra = {}) =>
  call('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
/** Stops the button's loading spinner; the text shows as a small toast. */
const answerCallbackQuery = (id, text) => call('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) });
/** Removes a message's buttons once one was used. */
const clearButtons = (chatId, messageId) => call('editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } });

/** Shows "typing…" in the chat for ~5 s (or until the next message), so you can see the bot is working. */
const sendTyping = (chatId) => call('sendChatAction', { chat_id: chatId, action: 'typing' }).catch(() => {});

/** Downloads a file the user sent (Telegram keeps the link valid for at least an hour). */
async function downloadFile(fileId) {
  const f = await call('getFile', { file_id: fileId });
  let res;
  try {
    res = await fetch(`${base()}/file/bot${token()}/${f.file_path}`, { signal: AbortSignal.timeout(60_000) });
  } catch {
    throw new TelegramError("Can't download the photo from Telegram", 0);
  }
  if (!res.ok) throw new TelegramError(`Photo download failed (${res.status})`, res.status);
  return { buffer: Buffer.from(await res.arrayBuffer()), path: f.file_path };
}

module.exports = { isConfigured, getMe, getUpdates, sendMessage, answerCallbackQuery, clearButtons, sendTyping, downloadFile, TelegramError };
