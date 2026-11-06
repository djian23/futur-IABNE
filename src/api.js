export async function api(path, options = {}) {
  const headers = {
    ...(options.body instanceof FormData
      ? {}
      : { "Content-Type": "application/json" }),
    ...options.headers,
  };
  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
    body:
      options.body && !(options.body instanceof FormData)
        ? JSON.stringify(options.body)
        : options.body,
  });
  const type = response.headers.get("content-type") || "";
  const data = type.includes("json")
    ? await response.json()
    : await response.text();
  if (!response.ok) {
    const error = new Error(
      data?.error?.message ||
        data?.message ||
        (typeof data?.error === "string" && data.error) ||
        `La demande a échoué (${response.status}).`,
    );
    error.status = response.status;
    error.code = data?.code;
    throw error;
  }
  return data;
}
export const post = (path, body) => api(path, { method: "POST", body });
