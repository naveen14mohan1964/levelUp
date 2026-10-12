  // Thin wrapper around the Gemini REST API. The key stays on the server (server/.env), never in the browser.
require('./db'); // loads .env

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function isConfigured() {
  return !!process.env.GEMINI_API_KEY;
}

/**
 * Calls generateContent and returns parsed JSON (when a schema is given) or text.
 * parts: [{ text }] and/or [{ inline_data: { mime_type, data: base64 } }]
 */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Busy models return 503/429 at peak times: retry with backoff, then fall back to a second model.
// The free tier allows ~20 requests per model per day, so spread load over several models.
// GEMINI_FALLBACK_MODELS (comma-separated) overrides the defaults.
function modelChain() {
  const fallbacks = (process.env.GEMINI_FALLBACK_MODELS || process.env.GEMINI_FALLBACK_MODEL || 'gemini-3.5-flash,gemini-3.1-flash-lite')
    .split(',').map((m) => m.trim()).filter(Boolean);
  return [...new Set([process.env.GEMINI_MODEL || 'gemini-3.8-flash', ...fallbacks])];
}

/** "Please retry in 5h19m2s" → a friendly local time, e.g. "around 1:30 PM". */
function resetTime(message) {
  const m = /retry in (?:(\d+)h)?(?:(\d+)m)?/i.exec(message || '');
  if (!m || (!m[1] && !m[2])) return null;
  const at = new Date(Date.now() + ((Number(m[1]) || 0) * 60 + (Number(m[2]) || 0) + 1) * 60_000);
  return at.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
}

// Speed: Gemini 3 models "think" before answering, which was most of the ~12–30 s per call. A low thinking level
// answers in a few seconds with the same quality for these short, structured tasks. GEMINI_THINKING overrides it
// (low | medium | high | off); callers can pass { thinking } for harder work (e.g. code review).
const DEFAULT_THINKING = (process.env.GEMINI_THINKING || 'low').toLowerCase();
const noThinkingLevel = new Set(); // models that reject thinkingLevel: we stop sending it to them
const FIRST_TIMEOUT_MS = 15_000;
const TIMEOUT_MS = 25_000;

async function generate(parts, opts = {}) {
  if (!isConfigured()) throw new Error('GEMINI_API_KEY is not set in server/.env');
  let lastErr;
  let quotaErr;
  for (const [i, model] of modelChain().entries()) {
    for (const delay of [0, 1500]) {
      if (delay) await sleep(delay);
      try {
        // The main model normally answers in ~5 s; give it 15 s, then let a backup model try (25 s each).
        return await generateOnce(model, parts, { timeoutMs: i === 0 ? FIRST_TIMEOUT_MS : TIMEOUT_MS, ...opts });
      } catch (err) {
        lastErr = err;
        if (err.status === 429) {
          quotaErr = err; // this model's quota is used up: retrying won't help, try the next model
          break;
        }
        // A slow/hung model: don't wait on it again, go straight to the next (faster) model.
        if (err.timeout) break;
        if (!RETRYABLE.has(err.status)) throw err;
      }
    }
  }
  if (quotaErr && lastErr === quotaErr) {
    const when = resetTime(quotaErr.message);
    const friendly = new Error(
      `Today's free Gemini quota is used up (about 20 requests per model per day). It resets ${when ? `around ${when}` : 'tomorrow'}. ` +
      'Meanwhile you can log meals manually and keep going; the AI will be back.',
    );
    friendly.status = 429;
    throw friendly;
  }
  throw lastErr;
}

// `input` is either parts for a single user turn, or a full multi-turn `contents` array
// ([{ role: 'user' | 'model', parts: [{ text }] }, ...]) for conversations.
async function generateOnce(model, input, { schema, system, temperature = 0.4, maxOutputTokens, thinking = DEFAULT_THINKING, timeoutMs = TIMEOUT_MS } = {}) {
  const contents = input[0]?.role ? input : [{ role: 'user', parts: input }];
  const sendThinking = thinking !== 'off' && !noThinkingLevel.has(model);
  const body = {
    contents,
    generationConfig: {
      temperature,
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
      ...(schema ? { responseMimeType: 'application/json', responseSchema: schema } : {}),
      ...(sendThinking ? { thinkingConfig: { thinkingLevel: thinking } } : {}),
    },
    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
  };
  let res;
  try {
    res = await fetch(`${BASE}/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const err = new Error(e.name === 'TimeoutError' ? `Gemini (${model}) took longer than ${timeoutMs / 1000} s` : `Can't reach Gemini (${e.message})`);
    err.timeout = e.name === 'TimeoutError';
    err.status = e.name === 'TimeoutError' ? undefined : 503; // network blip: retryable
    throw err;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Older models don't know thinkingLevel: remember that and retry once without it.
    if (res.status === 400 && sendThinking && /thinking/i.test(data.error?.message || '')) {
      noThinkingLevel.add(model);
      return generateOnce(model, input, { schema, system, temperature, maxOutputTokens, thinking, timeoutMs });
    }
    const err = new Error(`Gemini error ${res.status} (${model}): ${data.error?.message || res.statusText}`);
    err.status = res.status;
    throw err;
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || '';
  if (!text) throw new Error('Gemini returned an empty response (it may have been blocked or the image unreadable)');
  return schema ? JSON.parse(text) : text;
}

// ---------- Food photo / description → calories + macros ----------
const MACROS = {
  calories: { type: 'INTEGER' },
  protein_g: { type: 'NUMBER' },
  carbs_g: { type: 'NUMBER' },
  fat_g: { type: 'NUMBER' },
};
const MEAL_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING', description: 'Short name for the meal, e.g. "Chicken biryani with raita"' },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: { name: { type: 'STRING' }, portion: { type: 'STRING' }, ...MACROS },
        required: ['name', 'portion', 'calories', 'protein_g', 'carbs_g', 'fat_g'],
      },
    },
    total: { type: 'OBJECT', properties: MACROS, required: ['calories', 'protein_g', 'carbs_g', 'fat_g'] },
    confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
    notes: { type: 'STRING', description: 'Assumptions made (oil, portion size, hidden ingredients)' },
    tip: { type: 'STRING', description: 'One practical, non-judgemental tip to fit this meal into a fat-loss plan' },
  },
  required: ['title', 'items', 'total', 'confidence', 'notes', 'tip'],
};

const NUTRITION_SYSTEM = `You are a careful sports nutritionist who knows Indian home cooking and restaurant food.
Estimate calories and macros for the food shown or described. Rules:
- Estimate realistic portions from visual cues (plate size, cutlery, hand). If the user gives quantities, trust them.
- Indian cooking often uses more oil/ghee than it looks: include a sensible amount and say so in notes.
- Round calories to the nearest 10. Totals must equal the sum of items.
- If there's no food in the image, return an empty items list, total 0 and explain in notes.
- Tone: supportive, never shaming.`;

async function estimateMeal({ imageBase64, mimeType, note, context }) {
  const parts = [];
  if (imageBase64) parts.push({ inline_data: { mime_type: mimeType, data: imageBase64 } });
  parts.push({
    text: [
      imageBase64 ? 'Estimate the nutrition of this meal photo.' : 'Estimate the nutrition of this meal.',
      note ? `The user says: "${note}"` : '',
      context ? `Context: ${context}` : '',
    ].filter(Boolean).join('\n'),
  });
  return generate(parts, { schema: MEAL_SCHEMA, system: NUTRITION_SYSTEM, temperature: 0.2 });
}

// ---------- Progress photo → visible changes vs the last photo + a rough body-fat range ----------
const PROGRESS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    is_body_photo: { type: 'BOOLEAN', description: 'false if the image is not a progress photo of a person' },
    changes: { type: 'ARRAY', items: { type: 'STRING' }, description: '1–4 short, specific visible changes vs the previous photo (or baseline observations if none)' },
    body_fat: {
      type: 'OBJECT',
      properties: { low: { type: 'INTEGER' }, high: { type: 'INTEGER' }, confidence: { type: 'STRING', enum: ['low', 'medium'] } },
      required: ['low', 'high', 'confidence'],
    },
    consistency_tip: { type: 'STRING', description: 'One tip to make the next photo easier to compare (light, distance, pose, clothes)' },
    encouragement: { type: 'STRING', description: 'One short, genuine, non-judgemental line' },
  },
  required: ['is_body_photo', 'changes', 'body_fat', 'consistency_tip', 'encouragement'],
};

const PROGRESS_SYSTEM = `You are a supportive fitness coach reviewing fat-loss progress photos.
Rules:
- Describe only what is visible: waist and midsection shape, shoulder/arm definition, face, posture. Be specific and kind.
- Never comment on attractiveness, and never shame. Never give measurements in cm or inches: photos can't measure size.
- Body-fat: give a range at least 5 percentage points wide; confidence is "low" unless lighting, pose and clothing are clear.
- If the photos differ in lighting, distance or angle, say so in consistency_tip and be cautious about the changes.
- If the first image is not a photo of a person's body, set is_body_photo false and explain briefly in changes.`;

/** current/previous: { base64, mimeType, date }; previous may be null (baseline). */
async function analyzeProgressPhoto({ current, previous, pose, context }) {
  const parts = [];
  if (previous) {
    parts.push({ text: `PREVIOUS ${pose} photo (${previous.date}):` });
    parts.push({ inline_data: { mime_type: previous.mimeType, data: previous.base64 } });
  }
  parts.push({ text: `CURRENT ${pose} photo (${current.date}):` });
  parts.push({ inline_data: { mime_type: current.mimeType, data: current.base64 } });
  parts.push({
    text: [
      previous ? 'Compare CURRENT with PREVIOUS.' : 'This is the first photo in this pose: give baseline observations to compare against later.',
      context ? `Context: ${context}` : '',
    ].filter(Boolean).join('\n'),
  });
  return generate(parts, { schema: PROGRESS_SCHEMA, system: PROGRESS_SYSTEM, temperature: 0.2 });
}

module.exports = { isConfigured, generate, estimateMeal, analyzeProgressPhoto };
