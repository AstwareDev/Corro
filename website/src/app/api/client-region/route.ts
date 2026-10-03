const COUNTRY_CODE = /^[A-Z]{2}$/;





function isPublic(ip: string): boolean {
  if (ip === "::1" || ip === "127.0.0.1") return false;
  if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\.|^169\.254\./.test(ip))
    return false;
  if (ip.startsWith("fc") || ip.startsWith("fd") || ip.startsWith("fe80"))
    return false;
  return true;
}



function clientIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  const candidate =
    forwarded?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    undefined;
  const ip = candidate?.replace(/^::ffff:/, "");
  const resolved = ip && isPublic(ip) ? ip : undefined;
  return resolved;
}

const NO_STORE = { headers: { "Cache-Control": "private, no-store" } };



export async function GET(request: Request) {
  const ip = clientIp(request);
  if (!ip) {
    return Response.json({ region: null }, NO_STORE);
  }

  const url = `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
    const data = (await response.json()) as {
      status: string;
      countryCode?: string;
    };
    const country =
      data.status === "success" ? data.countryCode?.toUpperCase() : undefined;
    const region = country && COUNTRY_CODE.test(country) ? country : null;
    return Response.json({ region }, NO_STORE);
  } catch {
    return Response.json({ region: null }, NO_STORE);
  }
}
