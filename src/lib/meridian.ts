const MERIDIAN_BASE = "https://meridianapi.nodeapi.ai";
const MERIDIAN_KEY = "71d110c0284e0651d0524b9d65e4866824336b5b97aa0d4ae70446243e373dfd";

export async function checkMeridianHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${MERIDIAN_BASE}/v1/health`, {
      headers: { "X-Mcp-Key": MERIDIAN_KEY },
    });
    if (!res.ok) return false;
    const json = await res.json();
    return json?.status === "ok";
  } catch {
    return false;
  }
}

export async function meridianPost(endpoint: string, body: FormData | object): Promise<unknown> {
  const res = await fetch(`${MERIDIAN_BASE}${endpoint}`, {
    method: "POST",
    headers: { "X-Mcp-Key": MERIDIAN_KEY },
    body: body instanceof FormData ? body : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Meridian API error: ${res.status}`);
  return res.json();
}
