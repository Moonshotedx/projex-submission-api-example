/**
 * Server-only config. Keys never leave the server — call the ProjeX API from
 * Server Actions / Route Handlers, not from the browser.
 */
export function getProjexConfig() {
  const apiKey = process.env.PROJEX_API_KEY?.trim() || undefined;
  const baseUrl = (
    process.env.PROJEX_API_URL?.trim() || "https://projex.xcelerator.in"
  ).replace(/\/$/, "");

  return {
    apiKey,
    baseUrl,
    configured: Boolean(apiKey),
  };
}
