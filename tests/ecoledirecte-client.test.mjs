import test from "node:test";
import assert from "node:assert/strict";
import { createEcoleDirecteClient } from "../server/ecoledirecte-client.mjs";
const route = "/Eleves/123/cahierdetexte.awp?verbe=get";
const json = (data, headers = {}) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", ...headers },
  });

test("client indépendant : GTK, formulaire de connexion et jetons renouvelés", async () => {
  const calls = [];
  const client = createEcoleDirecteClient({
    version: "4.97.2",
    fetchImpl: async (url, options) => {
      calls.push({ url: new URL(url), ...options });
      if (options.method === "GET")
        return new Response("", {
          headers: { "Set-Cookie": "GTK=synthetic; Path=/; Secure" },
        });
      return json(
        { code: 200, token: "rotated", data: { accounts: [] } },
        { "2fa-Token": "device" },
      );
    },
  });
  await client.login("synthetic-user", "synthetic-password");
  assert.equal(calls[0].url.hostname, "api.ecoledirecte.com");
  assert.equal(calls[0].url.searchParams.get("v"), "4.97.2");
  assert.equal(calls[1].headers["X-Gtk"], "synthetic");
  assert.equal(calls[1].headers.Cookie, "GTK=synthetic");
  assert.equal(
    JSON.parse(new URLSearchParams(calls[1].body).get("data")).identifiant,
    "synthetic-user",
  );
  assert.equal(client.session.token, "rotated");
  assert.equal(client.session.twoFaToken, "device");
});
test("client : seules les routes de lecture prévues et de connexion atteignent le transport", async () => {
  let calls = 0;
  const client = createEcoleDirecteClient({
    fetchImpl: async () => {
      calls++;
      return json({ code: 200, data: {} });
    },
  });
  for (const forbidden of [
    "https://example.org",
    "/Eleves/123/notes.awp?verbe=get",
    "/Eleves/123/cahierdetexte.awp?verbe=put",
    "/E/../emploidutemps.awp?verbe=get",
  ])
    await assert.rejects(
      client.request(forbidden),
      (e) => e.code === "route_forbidden",
    );
  assert.equal(calls, 0);
  await client.request(route);
  assert.equal(calls, 1);
  assert.throws(
    () => createEcoleDirecteClient({ version: "invalid?host=elsewhere" }),
    (e) => e.code === "configuration_missing",
  );
});
test("client : expiration, limitation et erreurs métier explicites sans nouvelle tentative", async () => {
  for (const [status, body, expected] of [
    [401, {}, "session_expired"],
    [429, {}, "upstream_rate_limit"],
    [200, { code: 525 }, "session_expired"],
    [200, { code: 250 }, "challenge_required"],
    [200, { code: 505 }, "credentials_invalid"],
  ]) {
    let calls = 0;
    const client = createEcoleDirecteClient({
      fetchImpl: async () => {
        calls++;
        return new Response(JSON.stringify(body), { status });
      },
    });
    await assert.rejects(client.request(route), (e) => e.code === expected);
    assert.equal(calls, 1);
  }
});
test("client : réponse inconnue ou trop volumineuse refusée", async () => {
  for (const body of [
    "not-json",
    "null",
    '{"code":200',
    "x".repeat(1024 * 1024 + 1),
  ]) {
    const client = createEcoleDirecteClient({
      fetchImpl: async () => new Response(body),
    });
    await assert.rejects(
      client.request(route),
      (e) => e.code === "upstream_invalid",
    );
  }
});
test("client : l’annulation globale est transmise au transport", async () => {
  const controller = new AbortController();
  controller.abort();
  const client = createEcoleDirecteClient({
    signal: controller.signal,
    fetchImpl: async (_url, options) => {
      assert.equal(options.signal.aborted, true);
      throw options.signal.reason;
    },
  });
  await assert.rejects(
    client.request(route),
    (e) => e.code === "upstream_unavailable",
  );
});
