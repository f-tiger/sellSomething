/**
 * AgentFront — storefronts for the agentic web.
 * Static landing + waitlist API, and a machine-readable surface
 * that practices what it preaches (llms.txt, agents.txt, JSON catalog).
 */
import { handleWaitlist, handleCatalog } from "./handlers.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/waitlist" && request.method === "POST") {
      return handleWaitlist(request, env);
    }
    if (url.pathname === "/api/catalog") {
      return handleCatalog();
    }
    return env.ASSETS.fetch(request);
  },
};
