import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { SPECIALTIES } from "@/lib/geo";

export const maxDuration = 120;

const LANG_NAME: Record<string, string> = {
  uz: "Uzbek (Latin script)",
  ru: "Russian",
  en: "English",
};

const numOrNull = { anyOf: [{ type: "number" }, { type: "null" }] };

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["readable", "lab", "items", "summary", "doctor", "doctor_reason", "questions", "urgent"],
  properties: {
    readable: { type: "boolean", description: "false if the image is not a lab report or is unreadable" },
    lab: { anyOf: [{ type: "string" }, { type: "null" }] },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "value", "value_text", "unit", "ref_low", "ref_high", "ref_text", "status", "explanation"],
        properties: {
          name: { type: "string" },
          value: numOrNull,
          value_text: { type: "string" },
          unit: { type: "string" },
          ref_low: numOrNull,
          ref_high: numOrNull,
          ref_text: { type: "string" },
          status: { type: "string", enum: ["normal", "low", "high", "critical", "unknown"] },
          explanation: { type: "string" },
        },
      },
    },
    summary: { type: "string" },
    doctor: { type: "string", enum: [...SPECIALTIES] },
    doctor_reason: { type: "string" },
    questions: { type: "array", items: { type: "string" } },
    urgent: { type: "boolean" },
  },
};

function system(lang: string) {
  return `You read photos of laboratory test reports from clinics in Uzbekistan (Invitro, Akfa Medline, SOF, state polyclinics and others) and explain them to a patient with no medical training.

Write every human-readable field in ${LANG_NAME[lang] ?? LANG_NAME.ru}. Use short, calm, everyday sentences.

Rules:
- Copy values, units and reference ranges exactly as printed on the report. Never invent a value. If a number is unreadable, set value to null and explain in value_text.
- Use the reference range printed on the report. Only when none is printed, use a commonly accepted adult range and say "typical range" in ref_text.
- status: "normal" inside the range, "low"/"high" outside it, "critical" when far outside it in a way that needs a doctor today, "unknown" when it cannot be judged.
- explanation: one or two sentences on what the marker measures and what this value usually means. Do not diagnose a disease, do not name medicines or doses.
- doctor: the one specialist the patient should see first. Use "therapist" when everything is normal or unclear.
- questions: three concrete questions to ask that doctor.
- urgent: true only if at least one value is "critical".
- If the image is not a lab report, set readable to false and return an empty items list.`;
}

type Img = { media_type: "image/jpeg" | "image/png" | "image/webp"; data: string };

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return NextResponse.json({ error: "no_key" }, { status: 501 });
  }
  let body: { images?: Img[]; lang?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const lang = body.lang && LANG_NAME[body.lang] ? body.lang : "ru";
  const images = (body.images || []).slice(0, 4).filter(
    (i) => ["image/jpeg", "image/png", "image/webp"].includes(i.media_type) && typeof i.data === "string",
  );
  if (!images.length) return NextResponse.json({ error: "no images" }, { status: 400 });

  const client = new Anthropic();
  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: system(lang),
      messages: [
        {
          role: "user",
          content: [
            ...images.map((img) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: img.media_type, data: img.data },
            })),
            { type: "text" as const, text: "Explain this lab report." },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return NextResponse.json({ error: "refusal" }, { status: 422 });
    }
    if (response.stop_reason === "max_tokens") {
      return NextResponse.json({ error: "too long" }, { status: 422 });
    }
    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return NextResponse.json(JSON.parse(text));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) {
      return NextResponse.json({ error: "rate limited, try again in a minute" }, { status: 429 });
    }
    if (e instanceof Anthropic.APIError) {
      return NextResponse.json({ error: `api ${e.status}: ${e.message}` }, { status: 502 });
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
