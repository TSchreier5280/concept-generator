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
      const result = await resend.emails.send({
        from: "Schreier Group <onboarding@resend.dev>",
        to: ["TSchreier606@gmail.com"],
        subject: `[New Submission] ${brand.brand_name} — ${brand.submitter_name}`,
        text: buildEmailMessage(brand, withScripts),
      });
      console.log("Resend result:", JSON.stringify(result));
      if (result.error) {
        console.error("Resend error detail:", JSON.stringify(result.error));
      }
    } catch (emailErr) {
      console.error("EMAIL FAILED:", emailErr.message);
    }

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error("Generate error:", err.message);
    return res.status(500).json({ error: err.message || "Generation failed" });
  }
}

function buildEmailMessage(brand, concepts) {
  let msg = `NEW SUBMISSION — ${new Date().toLocaleString()}\n\n`;
  msg += `SUBMITTER: ${brand.submitter_name} | ${brand.submitter_email}\n`;
  msg += `BRAND: ${brand.brand_name} | ${brand.website}\n`;
  msg += `NICHE: ${brand.niche}\n`;
  msg += `PLATFORMS: ${brand.platforms}\n`;
  msg += `GOAL: ${brand.content_goal}\n`;
  msg += `FOLLOWERS: ${brand.followers}\n`;
  msg += `COMPETITORS: ${brand.competitors}\n`;
  msg += `IDEAL CUSTOMER: ${brand.ideal_customer}\n`;
  msg += `PROBLEMS: ${brand.customer_problems}\n\n`;
  msg += `${"=".repeat(50)}\n\n`;

  concepts.forEach((c) => {
    msg += `CONCEPT ${c.number}: ${(c.type||"").toUpperCase()} | ${(c.platform||"").toUpperCase()}\n`;
    msg += `HOOK: ${c.hook}\n\n`;
    msg += `OVERVIEW:\n${c.concept}\n\n`;
    msg += `SCRIPT:\n${c.script || ""}\n\n`;
    msg += `${"-".repeat(40)}\n\n`;
  });

  return msg;
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

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
