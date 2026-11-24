export default defineEventHandler((event) => {
  if (!event.path.startsWith("/api/") || !["POST", "PUT", "PATCH", "DELETE"].includes(event.method)) {
    return;
  }

  const origin = getRequestHeader(event, "origin");
  const host = getRequestHeader(event, "host");
  if (!origin || !host) {
    throw createError({ statusCode: 403, statusMessage: "Request origin is not allowed." });
  }

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    throw createError({ statusCode: 403, statusMessage: "Request origin is not allowed." });
  }
  if (url.origin !== origin || url.host !== host || !["http:", "https:"].includes(url.protocol)
    || (process.env.NODE_ENV === "production" && url.protocol !== "https:")) {
    throw createError({ statusCode: 403, statusMessage: "Request origin is not allowed." });
  }
});
