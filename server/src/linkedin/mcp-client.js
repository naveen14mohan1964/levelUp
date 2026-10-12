// Talks to the local LinkedIn MCP server (DSA/linkedin-mcp) exactly like Claude Code does: over stdio.
// Every publish goes through linkedin_preview_post first and reuses its draft_id, so the MCP's safety lock applies.
const path = require('path');

const MCP_PATH = process.env.LINKEDIN_MCP_PATH || path.join(__dirname, '..', '..', '..', '..', 'linkedin-mcp', 'src', 'index.js');

async function withClient(fn) {
  const { Client } = await import('@modelcontextprotocol/sdk/client/index.js');
  const { StdioClientTransport, getDefaultEnvironment } = await import('@modelcontextprotocol/sdk/client/stdio.js');
  const client = new Client({ name: 'levelup-tracker', version: '1.0.0' });
  // Only a minimal environment + LINKEDIN_* overrides reach the MCP process (tests use this to point it at an empty token file).
  const env = { ...getDefaultEnvironment(), ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith('LINKEDIN_'))) };
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [MCP_PATH], env, stderr: 'ignore' }));
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

const textOf = (r) => (r.content || []).map((c) => c.text || '').join('\n');
// The attached image (if any) travels with the post; the MCP hashes it into the draft_id, so preview and publish must match.
const postArgs = (post) => ({
  text: post.text, visibility: post.visibility || 'PUBLIC',
  ...(post.image_path ? { image_path: path.join(require('../meals').UPLOADS, post.image_path), image_alt: post.image_alt || '' } : {}),
});

/** { connected, text } */
async function status() {
  return withClient(async (c) => {
    const text = textOf(await c.callTool({ name: 'linkedin_status', arguments: {} }));
    return { connected: !/not connected/i.test(text) && !/expired/i.test(text), text };
  });
}

/** Validates without posting: { ok, draftId, text, errors[], warnings[] } */
async function preview(post) {
  return withClient(async (c) => {
    const r = await c.callTool({ name: 'linkedin_preview_post', arguments: postArgs(post) });
    const text = textOf(r);
    const section = (title) => {
      const m = text.split(title)[1];
      return m ? m.split('\n\n')[0].split('\n').filter((l) => l.startsWith('- ')).map((l) => l.slice(2)) : [];
    };
    return {
      ok: !r.isError,
      draftId: /draft_id: `(\w+)`/.exec(text)?.[1] || null,
      text,
      errors: section('❌ Cannot post yet:'),
      warnings: section('⚠️ Suggestions:'),
    };
  });
}

/** Preview → publish with the same draft_id. Returns { urn, url }; throws Error(message) on failure. */
async function publish(post) {
  return withClient(async (c) => {
    const pv = await c.callTool({ name: 'linkedin_preview_post', arguments: postArgs(post) });
    const pvText = textOf(pv);
    const draftId = /draft_id: `(\w+)`/.exec(pvText)?.[1];
    if (pv.isError || !draftId) throw new Error(`Cannot post yet: ${pvText.split('❌ Cannot post yet:')[1]?.trim() || pvText.slice(0, 300)}`);
    const r = await c.callTool({ name: 'linkedin_publish_post', arguments: { ...postArgs(post), draft_id: draftId } });
    const text = textOf(r);
    if (r.isError) throw new Error(text.replace(/^Not posted\.\s*/, '').slice(0, 900));
    const urn = /urn:li:(?:share|ugcPost):\d+/.exec(text)?.[0] || null;
    return { urn, url: urn ? `https://www.linkedin.com/feed/update/${urn}/` : null };
  });
}

module.exports = { status, preview, publish, MCP_PATH };
