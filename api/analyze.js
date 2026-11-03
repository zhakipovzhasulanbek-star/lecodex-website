// Vercel Serverless Function: POST /api/analyze
// Анализ текста (иск, договор) и фото документа через Groq.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TEXT_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b';

const TASKS = {
  claim: 'Проверь иск или претензию: структура, требования, доказательства, сроки, ошибки.',
  contract: 'Найди в договоре риски для пользователя: невыгодные условия, штрафы, сроки, расторжение, пробелы.',
  photo: 'Прочитай документ на фото (документ, штраф, повестка) и объясни, что это и что с ним делать.'
};

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

  const mode = TASKS[body.mode] ? body.mode : 'claim';
  const text = typeof body.text === 'string' ? body.text.slice(0, 12000) : '';
  const image = typeof body.image === 'string' && body.image.startsWith('data:image/') ? body.image : null;
  const profile = body.profile || {};

  if (!text && !image) {
    return res.status(400).json({ error: 'Нет текста или фото для анализа' });
  }

  const system =
    'Ты — LeCodex, юридический помощник. ' +
    `Страна: ${profile.country || 'Казахстан'}. ` +
    'Отвечай на русском, простыми словами. Не выдумывай статьи и нормы; если не уверен — так и скажи. ' +
    'Строго используй разделы, каждый с новой строки: ' +
    '"Кратко:", "Что нашёл:", "Риски и ошибки:", "Что делать:". Без markdown-разметки.';

  const userText = TASKS[mode] + (text ? '\n\nТекст:\n' + text : '');
  const userContent = image
    ? [
        { type: 'text', text: userText },
        { type: 'image_url', image_url: { url: image } }
      ]
    : userText;

  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify({
        model: image ? VISION_MODEL : TEXT_MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent }
        ],
        temperature: 0.2,
        max_tokens: 1800
      })
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
