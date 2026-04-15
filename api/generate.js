import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

export const config = { maxDuration: 300 }; // 5 min timeout for script generation

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const brand = req.body;
  if (!brand?.brand_name) return res.status(400).json({ error: "Missing brand data" });

  try {
    // ── STEP 1: Generate 30 concepts ──────────────────────────
    const conceptsRaw = await callClaude(
      "You are an expert social media strategist. Respond ONLY with a valid JSON array. No markdown fences, no preamble.",
      buildConceptsPrompt(brand)
    );
    const concepts = JSON.parse(conceptsRaw.replace(/```json|```/g, "").trim());

    // ── STEP 2: Generate scripts in batches of 5 ──────────────
    const withScripts = await generateAllScripts(brand, concepts);

    // ── STEP 3: Email results to admin ────────────────────────
    await emailResults(brand, withScripts);

    // ── STEP 4: Return results to browser ────────────────────
    return res.status(200).json({ concepts: withScripts });

  } catch (err) {
    console.error("Generate error:", err);
    return res.status(500).json({ error: err.message || "Generation failed" });
  }
}

// ── Claude helper ─────────────────────────────────────────────
async function callClaude(system, user) {
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: user }],
  });
  return msg.content[0].text;
}

// ── Concepts prompt ───────────────────────────────────────────
function buildConceptsPrompt(d) {
  return `Generate exactly 30 social media video concepts for the brand below.

Return ONLY a JSON array of 30 objects with these fields:
- "number": integer 1–30
- "hook": opening line / video title (punchy, scroll-stopping, under 15 words)
- "concept": 2–3 sentence description of the video structure and key message
- "platform": one of the brand's target platforms
- "type": e.g. Tutorial, Hot take, Story, POV, Myth-busting, Behind the scenes, etc.

BRAND BRIEF:
Brand: ${d.brand_name} (${d.website})
Niche: ${d.niche}
What makes them different: ${d.differentiator}
Ideal customer: ${d.ideal_customer}
Top customer problems: ${d.customer_problems}
Customer voice/language: ${d.customer_voice || "Not provided"}
Competitors: ${d.competitors}
Competitor strengths: ${d.competitor_good || "Not provided"}
Content gaps: ${d.content_gaps || "Not provided"}
Brand personality: ${d.brand_personality || "Not provided"}
Content goal: ${d.content_goal}
Target platforms: ${d.platforms}
Topics to AVOID: ${d.avoid || "None"}
Upcoming events: ${d.upcoming || "None"}
Posting frequency: ${d.posting_freq}
Follower count: ${d.followers}

Rules:
- Spread concepts across ALL listed platforms proportionally
- Vary content types widely (don't repeat types more than 4 times)
- Every hook must be specific to this brand — no generic hooks
- Make each concept immediately actionable`;
}

// ── Script generation ─────────────────────────────────────────
async function generateAllScripts(brand, concepts) {
  const batchSize = 5;
  const result = [...concepts];
  for (let i = 0; i < concepts.length; i += batchSize) {
    const batch = concepts.slice(i, i + batchSize);
    const scripts = await Promise.all(batch.map((c) => generateScript(brand, c)));
    scripts.forEach((script, j) => { result[i + j] = { ...result[i + j], script }; });
    if (i + batchSize < concepts.length) await sleep(500);
  }
  return result;
}

async function generateScript(brand, concept) {
  return callClaude(
    "You are a professional video scriptwriter specializing in social media. Write exactly as requested — no preamble, no meta commentary, just the script.",
    `Write a complete teleprompter script for this social media video.

BRAND: ${brand.brand_name}
PLATFORM: ${concept.platform}
VIDEO TYPE: ${concept.type}
HOOK: ${concept.hook}
CONCEPT: ${concept.concept}
BRAND PERSONALITY: ${brand.brand_personality || "Professional and approachable"}
IDEAL CUSTOMER: ${brand.ideal_customer}
TOPICS TO AVOID: ${brand.avoid || "None"}

Requirements:
- Start with the hook line word-for-word
- Natural, conversational, platform-appropriate tone
- Include [PAUSE], [SMILE], [CUT TO:], [B-ROLL: description] stage directions where helpful
- ${concept.platform === "LinkedIn" ? "LinkedIn: professional, 60–90 seconds" : concept.platform === "YouTube Shorts" ? "YouTube Shorts: energetic, 45–60 seconds" : "TikTok/Reels: punchy, under 60 seconds"}
- End with a clear, specific call to action
- Write ONLY the script — no title or commentary`
  );
}

// ── Email results ─────────────────────────────────────────────
async function emailResults(brand, concepts) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return; // skip if not configured

  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric", month: "long", day: "numeric",
  });

  // Build HTML email
  let html = `
<div style="font-family:Georgia,serif;max-width:700px;margin:0 auto;background:#ffffff;">
  <!-- Header -->
  <div style="background:#0d1b2e;padding:24px 32px;border-bottom:3px solid #c9a84c;">
    <div style="color:#c9a84c;font-family:Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:6px;">Schreier Group</div>
    <div style="color:#ffffff;font-size:22px;font-weight:bold;">New Concept Generator Submission</div>
    <div style="color:#a0b0c0;font-size:13px;margin-top:4px;">${brand.brand_name} &nbsp;·&nbsp; ${date}</div>
  </div>

  <!-- Brand Summary -->
  <div style="background:#f5f0e8;padding:20px 32px;border-bottom:1px solid #ddd4c0;">
    <table style="width:100%;font-family:Arial,sans-serif;font-size:13px;border-collapse:collapse;">
      <tr><td style="padding:4px 0;color:#6b7280;width:180px;">Website</td><td style="color:#1a1a2e;">${brand.website || "—"}</td></tr>
      <tr><td style="padding:4px 0;color:#6b7280;">Niche</td><td style="color:#1a1a2e;">${brand.niche}</td></tr>
      <tr><td style="padding:4px 0;color:#6b7280;">Platforms</td><td style="color:#1a1a2e;">${brand.platforms}</td></tr>
      <tr><td style="padding:4px 0;color:#6b7280;">Content Goal</td><td style="color:#1a1a2e;">${brand.content_goal}</td></tr>
      <tr><td style="padding:4px 0;color:#6b7280;">Followers</td><td style="color:#1a1a2e;">${brand.followers}</td></tr>
    </table>
  </div>

  <!-- Concepts -->
  <div style="padding:24px 32px;">
    <div style="font-family:Arial,sans-serif;font-size:18px;font-weight:bold;color:#0d1b2e;margin-bottom:20px;">30 Concepts + Teleprompter Scripts</div>
`;

  concepts.forEach((c) => {
    const wc = c.script ? c.script.split(/\s+/).filter((w) => w).length : 0;
    const secs = Math.round((wc / 130) * 60);
    const dur = secs < 60 ? `~${secs}s` : `~${Math.floor(secs / 60)}m ${secs % 60}s`;

    html += `
    <div style="margin-bottom:28px;border:1px solid #ddd4c0;border-radius:6px;overflow:hidden;">
      <div style="background:#0d1b2e;padding:12px 16px;">
        <span style="color:#c9a84c;font-family:Arial,sans-serif;font-size:10px;font-weight:bold;letter-spacing:1px;">CONCEPT ${c.number} &nbsp;·&nbsp; ${(c.type||"").toUpperCase()} &nbsp;·&nbsp; ${(c.platform||"").toUpperCase()}</span>
        <div style="color:#ffffff;font-size:15px;font-weight:bold;margin-top:6px;">${esc(c.hook)}</div>
      </div>
      <div style="padding:14px 16px;background:#fff;">
        <div style="font-family:Arial,sans-serif;font-size:12px;color:#6b7280;margin-bottom:6px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">Overview</div>
        <div style="font-family:Arial,sans-serif;font-size:13px;color:#374151;line-height:1.6;margin-bottom:14px;">${esc(c.concept)}</div>
        <div style="font-family:Arial,sans-serif;font-size:12px;color:#c9a84c;margin-bottom:6px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">📄 Teleprompter Script &nbsp;<span style="color:#9ca3af;font-weight:normal;">${wc} words · ${dur}</span></div>
        <div style="font-family:Georgia,serif;font-size:13px;color:#1f2937;line-height:1.8;background:#f9f5ed;border:1px solid #e8d9b5;border-radius:4px;padding:14px;white-space:pre-wrap;">${esc(c.script||"")}</div>
      </div>
    </div>`;
  });

  html += `
  </div>
  <!-- Footer -->
  <div style="background:#0d1b2e;padding:16px 32px;text-align:center;">
    <div style="color:#6b7a90;font-family:Arial,sans-serif;font-size:11px;">Schreier Group LLC &nbsp;·&nbsp; schreiergroup.com</div>
  </div>
</div>`;

  await resend.emails.send({
    from: "Schreier Group Tool <onboarding@resend.dev>",
    to: adminEmail,
    subject: `[Concept Generator] ${brand.brand_name} — ${concepts.length} concepts ready`,
    html,
  });
}

function esc(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
