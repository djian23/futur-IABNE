// First-party read-only protocol adapter. No third-party École Directe SDK.
// Public protocol references and validation limits: docs/ECOLEDIRECTE.md.
const HOST = "https://api.ecoledirecte.com";
const MAX_BYTES = 1024 * 1024;
export const protocolVersion = () =>
  process.env.ECOLEDIRECTE_API_VERSION || "4.97.2";
export class ConnectorError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export const invalidRemote = () =>
  new ConnectorError(
    "upstream_invalid",
    "Réponse École Directe incompatible avec le connecteur expérimental.",
  );

export function createEcoleDirecteClient({
  fetchImpl = globalThis.fetch,
  state = {},
  signal,
  version = protocolVersion(),
} = {}) {
  if (!/^\d{1,2}\.\d{1,3}\.\d{1,3}$/.test(version))
    throw new ConnectorError(
      "configuration_missing",
      "Version du protocole École Directe invalide.",
      503,
    );
  const session = {
    token: state.token || "",
    twoFaToken: state.twoFaToken || "",
  };
  async function transport(
    route,
    { method = "POST", payload = {}, headers = {} } = {},
  ) {
    // Deliberately restricted to authentication and the three read endpoints.
    if (
      !/^\/(?:login\.awp(?:\?gtk=1)?|connexion\/doubleauth\.awp\?verbe=(?:get|post)|E\/[A-Za-z0-9_-]{1,80}\/emploidutemps\.awp\?verbe=get|Eleves\/[A-Za-z0-9_-]{1,80}\/cahierdetexte(?:\/\d{4}-\d{2}-\d{2})?\.awp\?verbe=get)$/.test(
        route,
      )
    )
      throw new ConnectorError(
        "route_forbidden",
        "Opération non autorisée par le connecteur.",
        400,
      );
    const url = new URL(`/v3${route}`, HOST);
    url.searchParams.set("v", version);
    let response;
    try {
      response = await fetchImpl(url.toString(), {
        method,
        redirect: "error",
        signal: signal
          ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
          : AbortSignal.timeout(10000),
        headers: {
          "User-Agent": "Futur-IABNE-Connector/0.2",
          Accept: "application/json",
          ...(method === "POST"
            ? {
                "Content-Type": "application/x-www-form-urlencoded",
                "X-Token": session.token,
                "2fa-Token": session.twoFaToken,
              }
            : {}),
          ...headers,
        },
        ...(method === "POST"
          ? {
              body: new URLSearchParams({
                data: JSON.stringify(payload),
              }).toString(),
            }
          : {}),
      });
      if (response.status === 401 || response.status === 403)
        throw new ConnectorError(
          "session_expired",
          "Accès École Directe refusé. Reconnectez le compte sur le site officiel si nécessaire.",
          409,
        );
      if (response.status === 429)
        throw new ConnectorError(
          "upstream_rate_limit",
          "École Directe limite les demandes. Réessayez plus tard.",
          429,
        );
      if (!response.ok)
        throw new ConnectorError(
          "upstream_unavailable",
          "Le service École Directe est indisponible. Réessayez plus tard.",
        );
      const declared = Number(response.headers.get("content-length") || 0);
      if (declared > MAX_BYTES) {
        await response.body?.cancel();
        throw invalidRemote();
      }
      const reader = response.body?.getReader();
      let count = 0;
      const chunks = [];
      if (reader) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            count += value.byteLength;
            if (count > MAX_BYTES) {
              await reader.cancel();
              throw invalidRemote();
            }
            chunks.push(Buffer.from(value));
          }
        } finally {
          reader.releaseLock();
        }
      }
      return { response, text: Buffer.concat(chunks).toString("utf8") };
    } catch (error) {
      if (error instanceof ConnectorError) throw error;
      throw new ConnectorError(
        "upstream_unavailable",
        "La requête École Directe a échoué ou dépassé le délai autorisé.",
      );
    }
  }
  async function request(route, payload = {}, headers = {}, empty) {
    const { response, text } = await transport(route, { payload, headers });
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw invalidRemote();
    }
    if (!data || typeof data !== "object") throw invalidRemote();
    if (
      typeof data.token === "string" &&
      data.token.length > 0 &&
      data.token.length <= 20000
    )
      session.token = data.token;
    const twoFa = response.headers.get("2fa-Token");
    if (twoFa && twoFa.length <= 20000) session.twoFaToken = twoFa;
    const code = Number(data.code);
    if (code === 200) return data.data;
    if (code === 210 && empty !== undefined) return empty;
    if (code === 250)
      throw new ConnectorError(
        "challenge_required",
        "Une vérification École Directe est nécessaire.",
        409,
      );
    if (code === 505)
      throw new ConnectorError(
        "credentials_invalid",
        "Identifiants École Directe incorrects.",
        422,
      );
    if (code === 520 || code === 525)
      throw new ConnectorError(
        "session_expired",
        "La connexion École Directe a expiré. Reconnectez ce compte.",
        409,
      );
    if (code === 240)
      throw new ConnectorError(
        "charter_required",
        "École Directe demande une acceptation de charte. Vérifiez-la sur son site.",
        422,
      );
    throw new ConnectorError(
      "upstream_unavailable",
      "École Directe refuse la demande ou est temporairement indisponible.",
    );
  }
  async function login(username, password, fa) {
    const { response } = await transport("/login.awp?gtk=1", { method: "GET" });
    const cookies = response.headers.getSetCookie?.() || [
      response.headers.get("set-cookie") || "",
    ];
    const pairs = cookies
      .flatMap((cookie) => cookie.split(/,(?=\s*[^;,=\s]+=)/))
      .map((cookie) => cookie.trim().split(";")[0])
      .filter((cookie) => /^[A-Za-z0-9_-]+=[^\s;,\r\n]{1,8192}$/.test(cookie));
    const gtk = pairs.find((cookie) => cookie.startsWith("GTK="))?.slice(4);
    if (!gtk || pairs.join("; ").length > 20000) throw invalidRemote();
    return request(
      "/login.awp",
      {
        identifiant: username,
        motdepasse: password,
        acceptationCharte: true,
        ...(fa ? { fa: [fa] } : {}),
      },
      { "X-Gtk": gtk, Cookie: pairs.join("; ") },
    );
  }
  return { session, request, login };
}
