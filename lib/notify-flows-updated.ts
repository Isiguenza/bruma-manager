/**
 * Flow writes happen in the Dashboard (Next.js), while connected POS clients
 * listen for invalidation events from the separate Express/Socket.IO server.
 * The write must remain successful even if that server is briefly offline.
 */
export async function notifyFlowsUpdated() {
  const apiServerUrl = process.env.API_SERVER_URL || "https://api.cocinabruma.com.mx"

  await fetch(`${apiServerUrl.replace(/\/$/, "")}/internal/flows/notify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  })
    .then((response) => {
      if (!response.ok) console.error("Flow socket notification failed:", response.status)
    })
    .catch((error) => {
      console.error("Flow socket notification failed:", error)
    })
}
