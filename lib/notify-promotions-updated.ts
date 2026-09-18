/**
 * Promotion writes happen in Next.js, but the Socket.IO server runs in the
 * separate api-server process. API_SERVER_URL must point from this deployment
 * to that process (for example http://localhost:4000 in local development).
 */
export async function notifyPromotionsUpdated() {
  const apiServerUrl = process.env.API_SERVER_URL || "https://api.cocinabruma.com.mx";

  // The database write has already succeeded. Do not make a temporarily
  // unavailable Socket.IO process turn a successful admin request into a 500.
  // Await the request so a serverless Next.js invocation cannot finish before
  // its fire-and-forget notification has actually left the process.
  await fetch(`${apiServerUrl.replace(/\/$/, "")}/internal/promotions/notify`, {
      method: "POST",
      // The Express request logger expects a JSON body for POST requests.
      headers: { "Content-Type": "application/json" },
      body: "{}",
    })
    .then((response) => {
      if (!response.ok) {
        console.error("Promotion socket notification failed:", response.status);
      }
    })
    .catch((error) => {
      console.error("Promotion socket notification failed:", error);
    });
}
