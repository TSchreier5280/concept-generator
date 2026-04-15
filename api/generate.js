import Anthropic from "@anthropic-ai/sdk";
import { Resend } from "resend";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const resend = new Resend(process.env.RESEND_API_KEY);

export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const brand = req.body;
  if (!brand?.brand_name) return res.status(400).json({ error: "Missing brand data" });

  console.log("=== NEW SUBMISSION ===");
  console.log("Submitter:", brand.submitter_name, "|", brand.submitter_email);
  console.log("Brand:", brand.brand_name, "|", brand.website);
  console.log("Full data:", JSON.stringify(brand));
  console.log("=== END SUBMISSION ===");

  try {
    const conceptsRaw = await callClaude(
      "You are an expert social media strategist. Respond ONLY with a valid JSON array. No markdown fences, no preamble.",
      buildConceptsPrompt(brand)
    );
    const concepts = JSON.parse(conceptsRaw.replace(/```json|```/g, "").trim());
    const withScripts = await generateAllScripts(brand, concepts);

    try {
      await emailResults(brand, withScripts);
      console.log("Email sent successfully");
    } catch (emailErr) {
      console.error("EMAIL FAILED:", emailErr.message);
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Generate error:", err.message);
    return res.status(500).json({ error: err.message || "Generation failed" });
  }
}

async function callClaude(system, user) {
  const msg = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    system,
    messages: [{ role: "user", content: user }],
  });
  return msg.content[0].text;
}

function buildConceptsPrompt(d) {
  return `Generate exactly 30 social media video concepts for the brand below.

Return ONLY a JSON array of 30 objects with these fields:
- "number": integer 1-30
- "hook": opening line / video title (punchy, scroll-stopping, under 15 words)
- "concept": 2-3 sentence description of the video structure and key message
- "platform": one of the brand's target platforms
- "type": e.g. Tutorial, Hot take, Story, POV, Myth-busting, Behind the scenes, etc.

BRAND BRIEF:
Brand: ${d.brand_name} (${d.website})
Niche: ${d.niche}
What makes them different: ${d.differentiator}
Ideal customer: ${d.ideal_customer}
Top customer problems: ${d.customer_problems}
Customer voice: ${d.customer_voice || "Not provided"}
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
- Vary content types widely
- Every hook must be specific to this brand
- Make each concept immediately actionable`;
}

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
    "You are a professional video scriptwriter. Write exactly as requested — no preamble, just the script.",
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
- Include [PAUSE], [SMILE], [CUT TO:], [B-ROLL: description] stage directions
- End with a clear call to action
- Write ONLY the script`
  );
}

async function emailResults(brand, concepts) {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail) return;

  const date = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  let html = `<div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
  <div style="background:#0d1b2e;padding:24px 32px;border-bottom:3px solid #c9a84c;">
    <div style="color:#c9a84c;font-size:11px;margin-bottom:6px;">SCHREIER GROUP</div>
    <div style="color:#ffffff;font-size:22px;font-weight:bold;">New Submission: ${brand.brand_name}</div>
    <div style="color:#a0b0c0;font-size:13px;margin-top:4px;">${brand.submitter_name} &lt;${brand.submitter_email}&gt; &nbsp;·&nbsp; ${date}</div>
  </div>
  <div style="background:#f5f0e8;padding:20px 32px;border-bottom:1px solid #ddd4c0;">
    <p><strong>Brand:</strong> ${brand.brand_name} — ${brand.website}</p>
    <p><strong>Niche:</strong> ${brand.niche}</p>
    <p><strong>Platforms:</strong> ${brand.platforms}</p>
    <p><strong>Goal:</strong> ${brand.content_goal}</p>
    <p><strong>Followers:</strong> ${brand.followers}</p>
    <p><strong>Competitors:</strong> ${brand.competitors}</p>
    <p><strong>Ideal Customer:</strong> ${brand.ideal_customer}</p>
    <p><strong>Problems:</strong> ${brand.customer_problems}</p>
  </div>
  <div style="padding:24px 32px;">
    <h2 style="color:#0d1b2e;">30 Concepts + Scripts</h2>`;

  concepts.forEach((c) => {
    html += `<div style="margin-bottom:24px;border:1px solid #ddd;border-radius:6px;overflow:hidden;">
      <div style="background:#0d1b2e;padding:12px 16px;">
        <div style="color:#c9a84c;font-size:10px;font-weight:bold;">CONCEPT ${c.number} · ${(c.type||"").toUpperCase()} · ${(c.platform||"").toUpperCase()}</div>
        <div style="color:#fff;font-size:15px;font-weight:bold;margin-top:4px;">${esc(c.hook)}</div>
      </div>
      <div style="padding:14px 16px;">
        <p style="color:#374151;font-size:13px;">${esc(c.concept)}</p>
        <div style="background:#f9f5ed;border:1px solid #e8d9b5;border-radius:4px;padding:12px;font-size:13px;white-space:pre-wrap;">${esc(c.script||"")}</div>
      </div>
    </div>`;
  });

  html += `</div><div style="background:#0d1b2e;padding:16px 32px;text-align:center;color:#6b7a90;font-size:11px;">Schreier Group LLC · schreiergroup.com</div></div>`;

  const result = await resend.emails.send({
    from: "Schreier Group <onboarding@resend.dev>",
    to: adminEmail,
    subject: `[Concept Generator] ${brand.brand_name} — ${concepts.length} concepts ready`,
    html,
  });
  console.log("Resend result:", JSON.stringify(result));
}

function esc(str) {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
