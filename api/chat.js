// Vercel Serverless Function: POST /api/chat
// Ключ берётся ТОЛЬКО на сервере из переменной окружения GROQ_API_KEY.
// В index.html ключ писать нельзя — его увидит любой посетитель сайта.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Используйте POST' });
  }

  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return res.status(500).json({
      error: 'На сервере нет GROQ_API_KEY. Добавьте его в Vercel → Settings → Environment Variables и сделайте Redeploy.'
    });
  }

  let body = req.body || {};
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) { body = {}; }
  }

  const profile = body.profile || {};
  const history = Array.isArray(body.history) ? body.history.slice(-12) : [];

  const system =
    'Ты — LeCodex, юридический помощник. ' +
    `Страна: ${profile.country || 'Казахстан'}. ` +
    `Область права: ${profile.field || 'общая'}. ` +
    `Стиль ответа: ${profile.style || 'просто и по шагам'}. ` +
    'Отвечай на русском. Не выдумывай статьи и нормы. Отделяй общую информацию от юридического совета ' +
    'и прямо говори, когда нужно проверить актуальную редакцию закона или обратиться к юристу.';

  // history уже содержит последнее сообщение пользователя (фронт добавляет его до запроса)
  const messages = [{ role: 'system', content: system }];
  for (const m of history) {
    if (!m || typeof m.text !== 'string') continue;
    messages.push({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.text.slice(0, 4000)
    });
  }
  if (messages.length === 1 && typeof body.message === 'string') {
    messages.push({ role: 'user', content: body.message.slice(0, 4000) });
  }
  if (messages.length === 1) {
    return res.status(400).json({ error: 'Пустое сообщение' });
  }

  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({ model: MODEL, messages, temperature: 0.3, max_tokens: 1500 })
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (data.error && data.error.message) || `Groq вернул ошибку ${r.status}`;
      return res.status(502).json({ error: msg });
    }
    const answer = (data.choices?.[0]?.message?.content || '')
      .replace(/<think>[\s\S]*?<\/think>/g, '') // некоторые модели пишут «размышления» в тегах
      .trim();
    return res.status(200).json({ answer });
  } catch (e) {
    return res.status(502).json({ error: 'Не удалось связаться с Groq: ' + e.message });
  }
};
