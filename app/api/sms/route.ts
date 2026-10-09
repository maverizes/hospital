import { NextResponse } from "next/server";

// Eskiz.uz: https://documenter.getpostman.com/view/663428/RzfmES4z
// ESKIZ_EMAIL / ESKIZ_PASSWORD berilmasa, demo javob qaytadi (SMS yuborilmaydi).
const BASE = "https://notify.eskiz.uz/api";

let cachedToken: { value: string; at: number } | null = null;

async function token(): Promise<string> {
  if (cachedToken && Date.now() - cachedToken.at < 20 * 24 * 3600 * 1000) return cachedToken.value;
  const form = new FormData();
  form.set("email", process.env.ESKIZ_EMAIL!);
  form.set("password", process.env.ESKIZ_PASSWORD!);
  const res = await fetch(`${BASE}/auth/login`, { method: "POST", body: form });
  const data = (await res.json()) as { data?: { token?: string }; message?: string };
  if (!res.ok || !data.data?.token) throw new Error(data.message || `login ${res.status}`);
  cachedToken = { value: data.data.token, at: Date.now() };
  return cachedToken.value;
}

export async function POST(req: Request) {
  let body: { phone?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const digits = (body.phone || "").replace(/\D/g, "");
  const phone = digits.length === 9 ? `998${digits}` : digits;
  const text = (body.text || "").trim();
  if (!/^998\d{9}$/.test(phone) || !text || text.length > 480) {
    return NextResponse.json({ error: "bad phone or text" }, { status: 400 });
  }

  if (!process.env.ESKIZ_EMAIL || !process.env.ESKIZ_PASSWORD) {
    return NextResponse.json({ sent: false, demo: true });
  }

  try {
    const send = async (tok: string) => {
      const form = new FormData();
      form.set("mobile_phone", phone);
      form.set("message", text);
      form.set("from", process.env.ESKIZ_FROM || "4546");
      return fetch(`${BASE}/message/sms/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}` },
        body: form,
      });
    };
    let res = await send(await token());
    if (res.status === 401) {
      cachedToken = null;
      res = await send(await token());
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) return NextResponse.json({ sent: false, error: data.message || `${res.status}` }, { status: 502 });
    return NextResponse.json({ sent: true, id: data.id ?? null });
  } catch (e) {
    return NextResponse.json({ sent: false, error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
