// LinkedIn module · draft generation. Posts should read like a practitioner with real experience, not a beginner's diary:
// they get (1) your proof points ("What I've built", editable in LinkedIn → Settings), (2) live facts from your tracker,
// (3) a post FORMAT, (4) your voice samples, and are told never to invent anything.
const { generate } = require('../gemini');
const { buildContext } = require('../mentor');

const BANNED = [
  "I'm thrilled", "I'm excited to announce", 'excited to share', 'delighted to', 'game-changer', 'game changer', 'delve',
  'in today\'s fast-paced world', 'leverage', 'synergy', 'unlock', 'journey of a thousand', 'humbled', 'grind',
  'revolutionize', 'ever-evolving', 'landscape', 'buckle up', "let's dive in", 'here\'s the thing', 'nobody talks about',
];

/** Post structures that perform well on LinkedIn. "auto" rotates so consecutive posts don't feel the same. */
const FORMATS = {
  story: {
    label: 'Story: problem → what I tried → what worked',
    how: 'Open in the middle of a real problem. Show the wrong first attempt, the insight, the fix. End with the transferable lesson.',
  },
  contrarian: {
    label: 'Contrarian take',
    how: 'State a common belief in one line, then a nuanced, experience-backed counterpoint. Be fair to the other side; back it with one concrete example from the facts.',
  },
  breakdown: {
    label: 'How it works (breakdown)',
    how: 'Explain how something I built or used works in 3–5 short numbered steps ("1.", "2." …). Concrete enough that an engineer learns something.',
  },
  numbers: {
    label: 'Before → after (numbers)',
    how: 'Lead with a before/after number taken from the facts (e.g. a latency drop). Explain what changed technically and why it worked, then the trade-off.',
  },
  lessons: {
    label: '3 lessons',
    how: 'One-line setup, then exactly 3 hard-won lessons as numbered lines, each with a specific example. No generic advice.',
  },
  ai_take: {
    label: 'Opinion on an AI engineering topic',
    how: 'Give a clear opinion on a practical AI-engineering topic (agents and tool use, MCP, structured outputs, latency/cost, evals, reliability, when NOT to use an LLM), grounded in what I built. Never cite news, model releases or statistics that are not in the facts.',
  },
};
const FORMAT_KEYS = Object.keys(FORMATS);

/** Deterministic rotation for "auto": varies by week and slot, so the two weekly posts use different formats. */
function pickFormat(format, seed = Date.now()) {
  if (FORMATS[format]) return format;
  const week = Math.floor(seed / (7 * 86400000));
  return FORMAT_KEYS[(week * 2 + (seed % 2)) % FORMAT_KEYS.length];
}

const DRAFT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    text: { type: 'STRING', description: 'The full post, plain text, hashtags on the last line' },
    hook: { type: 'STRING', description: 'The opening line(s) on their own' },
    facts_used: { type: 'ARRAY', items: { type: 'STRING' }, description: 'Which provided facts the post relies on' },
    first_comment: { type: 'STRING', description: 'Optional first comment (e.g. where a link or repo would go); empty if none' },
    image_prompt: { type: 'STRING', description: 'A detailed prompt for an AI image tool, following the image rules' },
    image_alt: { type: 'STRING', description: 'One-sentence alt text describing that image for screen-reader users' },
  },
  required: ['text', 'hook', 'facts_used', 'first_comment', 'image_prompt', 'image_alt'],
};

// The image the author generates (in Microsoft Designer, Gemini, ChatGPT…) from image_prompt and attaches.
const IMAGE_RULES = `## Image prompt (image_prompt): I will paste it into an AI image tool and attach the result
- Describe ONE clear visual metaphor for the post's single idea (e.g. a stopwatch going from slow to fast, a pipeline of filters, an agent calling tools), not a generic "AI brain".
- Style: clean modern editorial illustration, flat vector or soft 3D isometric, generous negative space, high contrast, professional; deep navy background with teal (#2DD4BF) and blue (#60A5FA) accents.
- Composition for LinkedIn: square 1:1 (1080×1080), subject centred, readable as a small thumbnail on a phone.
- Text in the image: none, or at most one short number/word from the post (image tools garble longer text). Say exactly which, in quotes.
- No real people or faces, no company logos or brand marks, no watermarks, no screenshots of real products.
- 60–120 words, written as a direct instruction to the image tool.`;

/** Facts the post may use: your proof points (DONE) + what the tracker knows right now. */
function factsFrom(ctx, buildLog = '') {
  const f = [];
  for (const line of String(buildLog || '').split('\n').map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean)) {
    f.push(`DONE (built it): ${line}`);
  }
  if (ctx.week) f.push(`Week ${ctx.week} of a 22-week plan (DSA in Java + full-stack projects + fitness)`);
  if (ctx.focus) f.push(`This week's DSA topic: ${ctx.weekTitle || ctx.focus}`);
  const solved = ctx.solved.E + ctx.solved.M + ctx.solved.H;
  if (solved) f.push(`LeetCode problems solved so far: ${solved} (${ctx.solved.E} easy, ${ctx.solved.M} medium, ${ctx.solved.H} hard)`);
  if (ctx.lesson) {
    f.push(`Current learning project: ${ctx.lesson.project}. Lesson ${ctx.lesson.done ? 'DONE' : 'PLANNED, NOT DONE YET'}: learn "${ctx.lesson.learn || '-'}", build "${ctx.lesson.title}"`);
  }
  if (ctx.weakTopics.length) f.push(`Topics I find hard right now: ${ctx.weakTopics.map((w) => w.topic).join(', ')}`);
  return f;
}

/** Builds the prompt (pure, so it's testable). */
function buildPrompt({ pillar, angle, voiceSamples, facts, avoidEmployer, employerName, format = 'story', years = 2, intro = '', source = null }) {
  const fmt = FORMATS[format] || FORMATS.story;
  // a post that reacts to a news article: the article is the one outside source it may use (Stay updated -> Generate post)
  const news = source ? `
## The news this post reacts to
${source.title} (${source.source}${source.published ? `, ${source.published}` : ''})
Link: ${source.url}
${source.text ? `What the article says (${source.grounded === 'article' ? 'its text' : 'the feed summary only'}):\n"""\n${source.text}\n"""` : ''}
Rules for this post:
- Open with my take or a sharp question the news raises for engineers, not "X just announced Y".
- Summarise the news in one or two sentences, attributed to ${source.source}, and use ONLY claims stated above. Never add details, numbers or quotes that are not there.${source.grounded === 'article' ? '' : ' Only the summary was available, so stay high level about what the article says.'}
- Then give my view: what it changes for engineers who build with it, a trade-off or risk, and what I'd try or watch.
- Put the link in first_comment ("Source: ${source.url}"), never in the post body.
` : '';
  return `Write ONE LinkedIn post for me, in MY voice.

## Who I am
A software engineer with ${years} years of professional experience${intro ? `: ${intro}` : ''}. Write as an experienced practitioner who builds real systems and shares hard-won insight with other engineers. Not a beginner diary, not "I'm learning…" as the main point.

## Pillar
${pillar.name}${pillar.hint ? ` (ideas: ${pillar.hint})` : ''}
${angle ? `\nMy angle for this post: ${angle}` : ''}
${news}
## Format: ${fmt.label}
${fmt.how}

## Facts you may use (use ONLY these for any numbers, names or achievements; never invent metrics, results, companies, titles, news or statistics)
${facts.length ? facts.map((x) => `- ${x}`).join('\n') : '- (no facts yet: write about the idea and my plan, not results)'}

## My voice
${voiceSamples?.trim()
    ? `Match the tone, sentence length and vocabulary of these samples I wrote (don't copy them):\n"""\n${voiceSamples.trim().slice(0, 6000)}\n"""`
    : 'No samples yet: direct, confident, specific. Plain words, short sentences, a clear point of view, no corporate tone, no hype.'}

## What makes it engaging (follow all)
- The first 1–2 lines (under 200 characters) must make an engineer stop scrolling: a surprising number from the facts, a sharp opinion, or a concrete tension. This is what shows before "…see more".
- One idea per post, with real technical depth: name the actual technique, trade-off or failure mode.
- Take a position. Say what I'd do differently and why.
- End with a specific question that invites other engineers to share their experience (not "Agree?" or "Thoughts?").
- 150–260 words. Short paragraphs (1–2 sentences) with blank lines between them, so it reads well on a phone.
- Plain text only: LinkedIn does not render markdown, so no **bold**, no headings, no bullet symbols; numbered lines like "1." are fine.
- No links in the post body (LinkedIn shows those to fewer people): if a link or repo would help, put it in first_comment.
- Last line: 3 relevant hashtags. At most 1–2 emojis, or none.
- Never claim something is done or built unless a fact says DONE or gives a number. Planned work is "I'm working on…".
- Never use these phrases: ${BANNED.join(', ')}.
${avoidEmployer ? `- Never mention my employer${employerName ? ` (${employerName})` : ''}, its clients, internal projects or anything confidential from work. Use personal projects and general lessons only.` : ''}

${IMAGE_RULES}`;
}

/** Image tools default to odd sizes; make sure the prompt asks for a LinkedIn-friendly square. */
const withSquare = (p) => { const t = String(p || '').trim(); return !t || /1:1|square|1080s*[x×]s*1080/i.test(t) ? t : `${t} Square 1:1 format (1080×1080).`; };

const IMAGE_SCHEMA = {
  type: 'OBJECT',
  properties: { image_prompt: { type: 'STRING' }, image_alt: { type: 'STRING' } },
  required: ['image_prompt', 'image_alt'],
};

/** An image prompt for a post you wrote yourself (or after editing a draft). Returns { image_prompt, image_alt }. */
async function generateImagePrompt(text) {
  const out = await generate([{ text: `Here is my LinkedIn post:\n"""\n${String(text).slice(0, 3000)}\n"""\n\n${IMAGE_RULES}\n\nAlso give image_alt: one sentence describing that image.` }], {
    schema: IMAGE_SCHEMA, temperature: 0.7, system: 'You are an art director who writes precise prompts for AI image tools.',
  });
  return { image_prompt: withSquare(out.image_prompt), image_alt: String(out.image_alt || '').trim().slice(0, 300) };
}

/** Calls Gemini and lightly cleans the result. Returns { text, hook, facts_used, first_comment, format }. */
async function generateDraft({ pillar, angle, settings, date, format, source = null }) {
  const ctx = await buildContext(date);
  const chosen = pickFormat(format);
  const prompt = buildPrompt({
    pillar, angle, format: chosen, facts: factsFrom(ctx, settings.li_build_log), voiceSamples: settings.li_voice_samples,
    avoidEmployer: settings.li_avoid_employer, employerName: settings.li_employer_name,
    years: Number(settings.li_years_experience) || 2, intro: settings.li_my_intro, source,
  });
  const out = await generate([{ text: prompt }], {
    schema: DRAFT_SCHEMA, temperature: 0.85, thinking: 'medium', // writing quality is worth a few extra seconds here
    system: 'You ghost-write high-performing LinkedIn posts for an experienced software engineer. They sound exactly like the author, teach something real, and never invent facts.',
  });
  return {
    text: cleanDraft(out.text), hook: out.hook, facts_used: out.facts_used || [], first_comment: (out.first_comment || '').trim(), format: chosen,
    image_prompt: withSquare(out.image_prompt), image_alt: String(out.image_alt || '').trim().slice(0, 300),
  };
}

/** Removes markdown that LinkedIn would show literally, and trims to LinkedIn's limit. */
function cleanDraft(text) {
  return String(text || '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 3000);
}

module.exports = { generateDraft, generateImagePrompt, buildPrompt, factsFrom, cleanDraft, pickFormat, FORMATS, BANNED, IMAGE_RULES };
