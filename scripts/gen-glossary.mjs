#!/usr/bin/env node
/**
 * The Agent Glossary — generates plain-English definition pages for the
 * AI-agent era (agentic commerce, MCP, agent payments), each optimized for
 * "what is X" definitional queries that get cited by ChatGPT / AI Overviews.
 *
 * Add a term to TERMS and re-run: node scripts/gen-glossary.mjs
 * Emits term pages + index.html + sitemap.xml + llms.txt under sites/glossary/public.
 */
import fs from "node:fs";

const SITE = "https://glossary.agiscorecard.com";
const GA = 'G-FZXLMBB5QB';
const OUT = new URL("../sites/glossary/public/", import.meta.url);

const AGENTREADY = "https://agentready.agiscorecard.com";
const MCPPULSE = "https://mcppulse.agiscorecard.com";
const SELLTOAGENTS = "https://selltoagents.agiscorecard.com";

// category -> ordering weight for the index
const CATS = ["AI agents & concepts", "Agentic commerce", "AI visibility (GEO/AEO)", "Model Context Protocol", "Agent payments"];

const TERMS = [
  {
    slug: "agentic-commerce", term: "Agentic commerce", cat: "Agentic commerce",
    answer: "Agentic commerce is delegated shopping: a person states intent and constraints, and an AI agent searches, compares and completes part or all of a purchase on their behalf. Unlike a chatbot, an agent transacts — it produces an order.",
    body: `<p>In agentic commerce the buyer no longer clicks through a storefront. They tell an assistant like ChatGPT or Gemini what they want ("running shoes under $120, wide fit, arrives by Friday"), and the agent reads structured product data across merchants, shortlists options, and moves toward checkout.</p>
<p>For merchants this flips discovery: agents don't see your hero images or popups — they read your <a href="/llms-txt">llms.txt</a>, <a href="/">product schema</a> and feed. Being selected depends on machine-readable data, not persuasion. McKinsey projects $3–5 trillion in agent-orchestrated retail spend by 2030.</p>`,
    related: ["acp", "ai-shopping-agent", "citation-share", "geo"],
    faq: [["Is agentic commerce the same as AI shopping?", "It's the transactional end of it. AI shopping includes browsing and recommendations; agentic commerce specifically means the agent takes actions — comparing and buying — not just answering."]],
    cta: [AGENTREADY, "Scan your store's AI-agent readiness →"],
  },
  {
    slug: "acp", term: "Agentic Commerce Protocol (ACP)", cat: "Agentic commerce",
    answer: "The Agentic Commerce Protocol (ACP) is an open protocol from OpenAI and Stripe that lets AI agents discover merchant products and complete purchases. It powers ChatGPT Shopping.",
    body: `<p>ACP defines how a shopping agent finds products (via structured merchant feeds), shortlists them against a buyer's constraints, and completes checkout — either through delegated payment on Stripe rails or by handing off to the merchant's own checkout.</p>
<p>Under delegated checkout the merchant stays the seller of record: you process the order, own fulfillment and own the post-purchase relationship. The agent is a new demand channel, similar to how a marketplace refers buyers.</p>`,
    related: ["agentic-commerce", "ucp", "ai-shopping-agent", "agentic-payments"],
    faq: [["How do I get my products into ChatGPT Shopping?", "Shopify merchants are largely auto-enrolled. Others should keep a clean structured product feed, ship schema.org Product/Offer markup, and allow OAI-SearchBot in robots.txt."]],
    cta: [SELLTOAGENTS + "/acp-guide", "Read the full ACP merchant guide →"],
  },
  {
    slug: "ucp", term: "Universal Commerce Protocol (UCP)", cat: "Agentic commerce",
    answer: "The Universal Commerce Protocol (UCP) is Google's agentic-commerce standard, launched at NRF 2026, covering the full journey from product discovery to post-purchase across Google's AI surfaces.",
    body: `<p>Where OpenAI's <a href="/acp">ACP</a> is transaction-focused and powers ChatGPT Shopping, UCP is broader — spanning discovery, purchase and post-purchase across Google AI Mode and related surfaces. Both consume the same fuel: clean, structured, machine-readable product data.</p>
<p>Merchants don't have to choose. Optimizing your structured data and feed once makes you eligible across ACP, UCP and MCP-based agents simultaneously.</p>`,
    related: ["acp", "agentic-commerce", "geo"],
    faq: [["Do I need to implement UCP and ACP separately?", "No. Both read structured product data (schema.org Product/Offer, clean feeds). Get the data right once and you're eligible across surfaces."]],
    cta: [AGENTREADY, "Check your structured-data readiness →"],
  },
  {
    slug: "ai-shopping-agent", term: "AI shopping agent", cat: "Agentic commerce",
    answer: "An AI shopping agent is an AI assistant that discovers, compares and can purchase products on a buyer's behalf — for example ChatGPT Shopping, Perplexity, or Google AI Mode acting on a shopping request.",
    body: `<p>An AI shopping agent evaluates products the way a machine does: it reads price, availability, specs and policies from structured data and filters by the buyer's constraints. It never sees your storefront design.</p>
<p>To be picked, your store needs readable product data and open access to the crawlers behind these agents (GPTBot, OAI-SearchBot, PerplexityBot, Google-Extended). A single blocked crawler removes you from that channel entirely.</p>`,
    related: ["agentic-commerce", "acp", "citation-share", "geo"],
    faq: [["How do AI shopping agents choose products?", "They compose a shortlist from products whose structured data proves they fit every constraint — price, availability, shipping, specs. Missing data means you're skipped, even if you actually qualify."]],
    cta: [AGENTREADY, "Are you visible to AI shoppers? Scan free →"],
  },
  {
    slug: "citation-share", term: "Citation share", cat: "AI visibility (GEO/AEO)",
    answer: "Citation share is how often an AI assistant cites or recommends your brand when answering a relevant query — the AI-era replacement for search rankings. If SEO was about ranking a link, citation share is about being part of the answer.",
    body: `<p>When a buyer asks an AI for "the best ergonomic chair under $400", the model composes a shortlist of 3–5 products. Either your brand is in that synthesis or it's invisible — there is no page two. Citation share measures how often you make the cut.</p>
<p>It's driven by machine-readable authority: structured data, consistent brand signals, third-party citations, and being crawlable. Cited brands earn disproportionately more clicks per impression than uncited ones.</p>`,
    related: ["geo", "aeo", "ai-shopping-agent", "agentic-commerce"],
    faq: [["How do I measure citation share?", "Ask ChatGPT, Perplexity and Gemini to recommend products in your category and note whether — and where — you appear. Track it monthly; it's the metric that replaces keyword rankings."]],
    cta: [AGENTREADY, "Improve your citation share — scan free →"],
  },
  {
    slug: "geo", term: "Generative Engine Optimization (GEO)", cat: "AI visibility (GEO/AEO)",
    answer: "Generative Engine Optimization (GEO) is the practice of optimizing content and data so AI systems (ChatGPT, Perplexity, Google AI Overviews) cite you in their synthesized answers. It's SEO for the AI-answer era.",
    body: `<p>Traditional SEO optimizes for ranking a blue link. GEO optimizes for being part of the answer the model generates. Front-load direct answers, structure content for extraction (headings, Q&A, schema), strengthen authority signals, and earn third-party citations.</p>
<p>As zero-click searches climb past 69% and AI Overviews appear on nearly half of queries, GEO is becoming the dominant discovery discipline for both content and commerce.</p>`,
    related: ["aeo", "citation-share", "llms-txt", "agents-md"],
    faq: [["What's the difference between GEO and SEO?", "SEO earns a ranked link a user clicks. GEO earns a citation inside an AI-generated answer. They overlap on fundamentals (crawlability, structure, authority) but the KPI shifts from rank to citation."]],
    cta: [SELLTOAGENTS, "Read the merchant GEO guides →"],
  },
  {
    slug: "aeo", term: "Answer Engine Optimization (AEO)", cat: "AI visibility (GEO/AEO)",
    answer: "Answer Engine Optimization (AEO) is optimizing content to be the direct answer an AI or search engine returns — often used interchangeably with GEO, with a slightly stronger focus on Q&A-style extraction and featured answers.",
    body: `<p>AEO emphasizes structuring content as clear questions and direct answers, marked up with FAQPage schema, so answer engines can lift it cleanly. Front-loading the answer in the first sentence is the core tactic — exactly what this glossary does on every page.</p>`,
    related: ["geo", "citation-share", "llms-txt"],
    faq: [["Is AEO different from GEO?", "They're largely the same idea. AEO leans on Q&A extraction and featured answers; GEO is the broader umbrella for being cited in generative answers. Optimizing for one optimizes for both."]],
    cta: [SELLTOAGENTS, "See how AEO applies to your store →"],
  },
  {
    slug: "llms-txt", term: "llms.txt", cat: "AI visibility (GEO/AEO)",
    answer: "llms.txt is a plain-markdown file served at a site's root (/llms.txt) that gives AI systems a curated summary of the site — what it is, its key pages, and important facts like pricing and policies.",
    body: `<p>It's a hand-written map you control, read first by AI agents crawling your site. For a store, it lists what you sell, your best pages and your policies in machine-friendly markdown. It complements — never replaces — robots.txt (access) and sitemap.xml (enumeration).</p>
<p>Note it's an emerging convention: Shopify serves one natively as of 2026, while Google has called it "speculative." Cheap to add, useful, but not a ranking guarantee.</p>`,
    related: ["agents-md", "geo", "aeo"],
    faq: [["Where does llms.txt go?", "At your domain root, reachable at https://yourdomain.com/llms.txt, served as plain text. Generate one free with the AgentReady llms.txt generator."]],
    cta: [AGENTREADY + "/llms-txt-generator", "Generate your llms.txt free →"],
  },
  {
    slug: "agents-md", term: "agents.md", cat: "AI visibility (GEO/AEO)",
    answer: "agents.md is an emerging convention: a markdown file that tells AI agents how to interact with your site or repository — what it is, how to use it, and what they may do. Shopify serves one natively for stores.",
    body: `<p>Where <a href="/llms-txt">llms.txt</a> summarizes <em>what</em> a site is, agents.md focuses on <em>how</em> agents should interact with it — usage instructions, endpoints, and boundaries. It's increasingly checked by AI-readiness scanners alongside llms.txt.</p>`,
    related: ["llms-txt", "geo"],
    faq: [["Do I need both llms.txt and agents.md?", "They serve different purposes — one summarizes, one instructs — and are cheap to add together. Scanners increasingly check for both."]],
    cta: [AGENTREADY, "Scan for llms.txt + agents.md →"],
  },
  {
    slug: "mcp", term: "Model Context Protocol (MCP)", cat: "Model Context Protocol",
    answer: "The Model Context Protocol (MCP) is an open standard from Anthropic that lets AI applications connect to external tools and data through a common interface. It's often described as \"USB-C for AI\" — one protocol, many integrations.",
    body: `<p>MCP standardizes how an AI client (Claude, Cursor, an agent framework) talks to an <a href="/mcp-server">MCP server</a> that exposes tools, resources and prompts. Messages use JSON-RPC 2.0 over a transport (today <a href="/streamable-http">streamable HTTP</a> for remote servers, or stdio locally).</p>
<p>The ecosystem passed 5,800+ community servers in the official registry, with Google and Microsoft shipping their own agent registries — making MCP one of the fastest-growing developer ecosystems of the AI era.</p>`,
    related: ["mcp-server", "streamable-http", "agentic-payments"],
    faq: [["What does MCP actually standardize?", "The handshake and message format between an AI client and a tool server: initialize, capability negotiation, and how tools/resources/prompts are listed and called — so any compliant client can use any compliant server."]],
    cta: [MCPPULSE, "Health-check any MCP server free →"],
  },
  {
    slug: "mcp-server", term: "MCP server", cat: "Model Context Protocol",
    answer: "An MCP server is a program that exposes tools, resources or prompts to AI clients over the Model Context Protocol. Clients discover its tools via a tools/list call and invoke them through JSON-RPC.",
    body: `<p>A remote MCP server runs as an HTTPS service; a local one runs as a subprocess over stdio. Either way it answers an <code>initialize</code> handshake, declares its <code>capabilities</code>, and lists tools — each with a name, a description and a JSON-Schema input.</p>
<p>The quality bar that decides whether agents actually use a server: clear tool descriptions (agents pick tools by description), valid input schemas, low handshake latency, and a deliberate auth posture.</p>`,
    related: ["mcp", "streamable-http", "mcp"],
    faq: [["How do I know if my MCP server is healthy?", "Run a real initialize + tools/list handshake and check protocol conformance, tool-description coverage, latency and TLS. A free scan surfaces all of it in seconds."]],
    cta: [MCPPULSE, "Scan your MCP server →"],
  },
  {
    slug: "streamable-http", term: "Streamable HTTP (MCP transport)", cat: "Model Context Protocol",
    answer: "Streamable HTTP is the current transport for remote MCP servers: a single HTTPS endpoint that accepts POSTed JSON-RPC and replies with either a plain JSON response or a Server-Sent-Events stream, with optional sessions via the Mcp-Session-Id header.",
    body: `<p>It superseded the older two-endpoint HTTP+SSE transport, collapsing everything to one endpoint. The client POSTs with <code>Accept: application/json, text/event-stream</code>; the server chooses JSON or SSE per request. For local tools, stdio is used instead.</p>`,
    related: ["mcp", "mcp-server"],
    faq: [["Which MCP transport should a remote server use?", "Streamable HTTP — it's the single-endpoint standard current clients expect. The legacy HTTP+SSE transport is superseded; stdio is for local subprocess servers."]],
    cta: [MCPPULSE + "/mcp-transports-explained", "MCP transports explained →"],
  },
  {
    slug: "x402", term: "x402", cat: "Agent payments",
    answer: "x402 is an open protocol (originated by Coinbase) that revives the HTTP 402 \"Payment Required\" status so AI agents and apps can pay for API calls or content programmatically, typically with stablecoins, in a single request-response.",
    body: `<p>x402 lets a server respond to a request with a 402 and payment terms; the client pays (often in stablecoins on a network like Base) and retries with proof, unlocking the resource — no accounts or manual checkout. It's aimed at machine-to-machine and agent payments.</p>
<p>Adoption grew fast (hundreds of millions of transactions across tens of thousands of agents by 2026), though a large share looks like testing. The rails themselves are backed by large players; the solo-viable layer is tooling, monitoring and content around them.</p>`,
    related: ["ap2", "agentic-payments", "acp"],
    faq: [["What is HTTP 402?", "402 Payment Required is a long-reserved HTTP status code that was never standardized for general use. x402 gives it a concrete meaning for programmatic, agent-driven payments."]],
    cta: [SELLTOAGENTS, "How agent payments fit agentic commerce →"],
  },
  {
    slug: "ap2", term: "AP2 (Agent Payments Protocol)", cat: "Agent payments",
    answer: "AP2 (Agent Payments Protocol) is Google's open protocol for agent-initiated payments, using cryptographically signed \"mandates\" that prove a user authorized an agent to make a specific purchase within set limits.",
    body: `<p>AP2 focuses on trust and authorization: a mandate is a signed record of what the user permitted (what, how much, for whom), so a merchant or payment network can verify an agent's purchase was genuinely authorized. It launched with dozens of corporate collaborators.</p>
<p>AP2 (authorization) and <a href="/x402">x402</a> (settlement rails) are complementary rather than competing — different layers of the agent-payment stack.</p>`,
    related: ["x402", "agentic-payments", "acp"],
    faq: [["Is AP2 competing with x402?", "Not directly. AP2 handles authorization via signed mandates; x402 handles programmatic settlement. They can compose in a single agent transaction."]],
    cta: [SELLTOAGENTS, "Read the agentic commerce guides →"],
  },
  {
    slug: "agentic-payments", term: "Agentic payments", cat: "Agent payments",
    answer: "Agentic payments are payments initiated and completed by AI agents on a user's behalf, using protocols like x402 (settlement) and AP2 (authorization) so an agent can pay for goods, APIs or content without manual checkout.",
    body: `<p>As agents move from answering to transacting, they need to pay — for the products they buy in <a href="/agentic-commerce">agentic commerce</a>, and for the APIs and data they consume. Agentic payment protocols provide the authorization and settlement rails to do it safely and programmatically.</p>
<p>The payment rails are dominated by large players (Coinbase, Google, Visa, Mastercard, Stripe). For builders, the open opportunity is the surrounding layer: readiness tooling, monitoring, discovery and education.</p>`,
    related: ["x402", "ap2", "acp", "agentic-commerce"],
    faq: [["Do agentic payments require crypto?", "Not necessarily. x402 commonly uses stablecoins, but agent-payment authorization (AP2) and card-network schemes (Visa, Mastercard) also support fiat rails. The common thread is programmatic, agent-initiated payment."]],
    cta: [SELLTOAGENTS, "Where agent payments meet commerce →"],
  },
  {
    slug: "ai-agent", term: "AI agent", cat: "AI agents & concepts",
    answer: "An AI agent is a system that uses a large language model to pursue a goal autonomously — deciding on steps, calling tools or APIs, and acting on the results — rather than just answering a single prompt.",
    body: `<p>Where a chatbot responds once, an agent loops: it plans, calls a tool (search, code, a database, a purchase), observes the result, and decides the next step until the goal is met. Tool access is what turns a model into an agent — commonly via <a href="/mcp">MCP</a> or function calling.</p>
<p>Agents now shop (<a href="/agentic-commerce">agentic commerce</a>), write code, and operate software. Their reliability depends on the quality of the tools and data they can reach — which is why tool descriptions, structured data and server health matter so much.</p>`,
    related: ["mcp", "function-calling", "agentic-commerce", "rag"],
    faq: [["What's the difference between an AI agent and a chatbot?", "A chatbot answers a prompt. An agent pursues a goal across multiple steps, calling tools and acting on results autonomously until it's done."]],
    cta: [MCPPULSE, "Building agent tools? Scan your MCP server →"],
  },
  {
    slug: "rag", term: "RAG (Retrieval-Augmented Generation)", cat: "AI agents & concepts",
    answer: "RAG (Retrieval-Augmented Generation) is a technique where an AI model retrieves relevant documents from an external knowledge source and uses them as context to generate a more accurate, grounded answer — reducing hallucination.",
    body: `<p>Instead of relying only on what a model memorized in training, RAG fetches fresh, specific data at query time (from a vector database, search index or API) and feeds it into the prompt. The model then answers from that retrieved context.</p>
<p>RAG is how assistants stay current and cite sources. <a href="/mcp">MCP</a> servers are increasingly the retrieval layer — exposing live data an agent pulls in on demand.</p>`,
    related: ["ai-agent", "mcp", "function-calling"],
    faq: [["Does RAG stop hallucinations?", "It reduces them by grounding answers in retrieved sources, but doesn't eliminate them — retrieval quality and how the model uses the context still matter."]],
    cta: [MCPPULSE, "Exposing data to agents via MCP? Test it →"],
  },
  {
    slug: "function-calling", term: "Function calling (tool calling)", cat: "AI agents & concepts",
    answer: "Function calling (or tool calling) is a capability where an AI model, given a set of tool definitions, outputs a structured request to invoke one — with arguments — so an application can run it and return the result to the model.",
    body: `<p>It's the mechanism behind agents: you describe tools (name, description, JSON-Schema inputs), the model decides which to call and with what arguments, your code executes it, and the result goes back into the conversation. <a href="/mcp">MCP</a> standardizes this across clients and servers.</p>
<p>The model chooses tools from their <strong>descriptions</strong> — so vague descriptions mean tools never get called, whether you use raw function calling or MCP.</p>`,
    related: ["ai-agent", "mcp", "mcp-tool"],
    faq: [["Is function calling the same as MCP?", "Related but not identical. Function calling is a model capability; MCP is an open protocol that standardizes how tools are exposed and called across different clients and servers."]],
    cta: [MCPPULSE + "/why-mcp-tools-not-called", "Why agents skip your tools →"],
  },
  {
    slug: "a2a", term: "A2A (Agent2Agent protocol)", cat: "AI agents & concepts",
    answer: "A2A (Agent2Agent) is an open protocol, introduced by Google, that lets independent AI agents discover each other and collaborate — delegating tasks and exchanging results — across different vendors and frameworks.",
    body: `<p>Where <a href="/mcp">MCP</a> connects an agent to tools and data, A2A connects agents to other agents. An agent publishes a capability card; another agent can discover it and hand off a task. The two protocols are complementary layers of the agent stack.</p>`,
    related: ["mcp", "ai-agent", "agentic-payments"],
    faq: [["How is A2A different from MCP?", "MCP is agent-to-tool (an agent calls tools/data). A2A is agent-to-agent (agents delegate tasks to each other). They compose: an agent uses MCP for tools and A2A to collaborate."]],
    cta: [MCPPULSE, "Health-check your agent's MCP tools →"],
  },
  {
    slug: "prompt-injection", term: "Prompt injection", cat: "AI agents & concepts",
    answer: "Prompt injection is an attack where malicious instructions hidden in content an AI reads (a web page, document, tool output) trick the model into ignoring its original task and following the attacker's instructions instead.",
    body: `<p>It's the top security risk for agents that browse the web or call tools: untrusted data can carry commands ("ignore previous instructions and…"). For agentic systems this is serious because agents <em>act</em> — they can send data or make purchases.</p>
<p>Mitigations include treating tool/web content as untrusted, constraining what tools can do, requiring confirmation for sensitive actions, and clear auth boundaries on <a href="/mcp-server">MCP servers</a>.</p>`,
    related: ["ai-agent", "mcp-server", "mcp"],
    faq: [["Why is prompt injection worse for agents?", "Because agents take actions, not just answer. An injected instruction can cause an agent to exfiltrate data or make a transaction, not merely say something wrong."]],
    cta: [MCPPULSE, "Check your MCP server's auth posture →"],
  },
  {
    slug: "ai-overviews", term: "AI Overviews", cat: "AI visibility (GEO/AEO)",
    answer: "AI Overviews are Google's AI-generated answer summaries shown at the top of search results. They synthesize an answer from multiple sources and cite them, often reducing clicks to the underlying websites.",
    body: `<p>AI Overviews now appear on roughly half of queries and can cut organic click-through substantially when present. For businesses, the goal shifts from ranking a link to being one of the cited sources in the overview — the essence of <a href="/geo">GEO</a>.</p>`,
    related: ["geo", "zero-click-search", "citation-share", "aeo"],
    faq: [["How do I get cited in AI Overviews?", "Publish clear, factual, well-structured content with schema markup, earn third-party citations, and keep your site crawlable. Domain authority is a strong predictor of being cited."]],
    cta: [AGENTREADY, "Check your AI-answer readiness →"],
  },
  {
    slug: "zero-click-search", term: "Zero-click search", cat: "AI visibility (GEO/AEO)",
    answer: "A zero-click search is a search where the user gets their answer directly on the results page — from an AI Overview, featured snippet or knowledge panel — without clicking through to any website.",
    body: `<p>Zero-click searches climbed past 69% of queries in 2025 and are projected higher as AI answers expand. It means less referral traffic from informational queries, and makes <em>being the cited source</em> (rather than the clicked link) the thing worth optimizing for.</p>`,
    related: ["ai-overviews", "geo", "citation-share"],
    faq: [["Is SEO dead because of zero-click search?", "No, but its goal changes. Informational-query traffic shrinks; the win shifts to being cited in AI answers (GEO) and capturing transactional and brand demand."]],
    cta: [SELLTOAGENTS, "Adapt your store to AI search →"],
  },
  {
    slug: "structured-data", term: "Structured data (schema markup)", cat: "AI visibility (GEO/AEO)",
    answer: "Structured data is machine-readable markup (usually schema.org JSON-LD) added to a web page that describes its content — a product's price, an FAQ, an organization — so search engines and AI agents can understand and use it reliably.",
    body: `<p>Humans read your page; machines read your structured data. For commerce, schema.org <a href="/ai-shopping-agent">Product and Offer</a> markup tells AI shopping agents your price, availability and specs. FAQ and Organization markup feed AI answers and trust signals.</p>
<p>Generate it free with the <a href="https://tools.agiscorecard.com/product-schema-generator">Product schema</a> and <a href="https://tools.agiscorecard.com/faq-schema-generator">FAQ schema</a> tools, then verify it's present with a scan.</p>`,
    related: ["geo", "ai-shopping-agent", "citation-share", "llms-txt"],
    faq: [["What format should structured data use?", "JSON-LD is the recommended format — a script block you add to the page, decoupled from your HTML. schema.org defines the vocabulary."]],
    cta: [AGENTREADY, "Scan your structured data →"],
  },
  {
    slug: "chatgpt-shopping", term: "ChatGPT Shopping", cat: "Agentic commerce",
    answer: "ChatGPT Shopping is OpenAI's feature that lets ChatGPT recommend products and, via the Agentic Commerce Protocol, surface merchant items and support purchases directly in the conversation.",
    body: `<p>When a user asks ChatGPT for product help, it can present a shortlist drawn from merchant feeds through <a href="/acp">ACP</a>. Over a million Shopify merchants are auto-enrolled; the question isn't whether you participate but whether your product data is structured well enough to be selected.</p>`,
    related: ["acp", "ai-shopping-agent", "agentic-commerce", "citation-share"],
    faq: [["How do I appear in ChatGPT Shopping?", "Keep a clean structured product feed, ship Product/Offer schema, and allow OAI-SearchBot in robots.txt. Shopify stores are largely enrolled automatically."]],
    cta: [AGENTREADY, "Are you visible in ChatGPT Shopping? Scan →"],
  },
  {
    slug: "mcp-tool", term: "MCP tool", cat: "Model Context Protocol",
    answer: "An MCP tool is a single callable function exposed by an MCP server — with a name, a description and a JSON-Schema for its inputs — that an AI agent can discover via tools/list and invoke to perform an action.",
    body: `<p>Tools are the actions an <a href="/mcp-server">MCP server</a> offers: search_orders, run_query, create_ticket. The agent reads each tool's <strong>description</strong> to decide when to call it, so a clear description and a valid input schema are what make a tool actually get used.</p>`,
    related: ["mcp-server", "mcp", "function-calling"],
    faq: [["Why won't the model call my MCP tool?", "Almost always the description: agents select tools by their name and description. Vague, empty or duplicate descriptions make a tool invisible — even if it works perfectly."]],
    cta: [MCPPULSE, "See your tool-description coverage →"],
  },
];

/* ---------------- rendering ---------------- */

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const bySlug = Object.fromEntries(TERMS.map((t) => [t.slug, t]));
const gaTag = `<script async src="https://www.googletagmanager.com/gtag/js?id=${GA}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA}');</script>`;

function head(title, desc, canonical, extraLd) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="article">
<link rel="stylesheet" href="/style.css">
${gaTag}
${extraLd || ""}
</head>
<body>
<div class="wrap">
<header>
  <a class="logo" href="/">Agent<span>Glossary</span></a>
  <nav><a href="/">All terms</a><a href="https://agentready.agiscorecard.com">AgentReady</a><a href="https://mcppulse.agiscorecard.com">MCP Pulse</a></nav>
</header>`;
}

const foot = `<footer>
  <div class="links"><a href="/">All terms</a><a href="/llms.txt">llms.txt</a><a href="https://selltoagents.agiscorecard.com">SellToAgents</a><a href="https://agentready.agiscorecard.com">AgentReady</a><a href="https://mcppulse.agiscorecard.com">MCP Pulse</a></div>
  <div>© 2026 Agent Glossary · Plain-English definitions for the AI-agent era. Cite freely with a link.</div>
</footer>
</div>
</body>
</html>`;

function termPage(t) {
  const canonical = `${SITE}/${t.slug}`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "DefinedTerm", name: t.term, description: t.answer, inDefinedTermSet: SITE },
      { "@type": "Article", headline: `What is ${t.term}?`, datePublished: "2026-07-21", author: { "@type": "Organization", name: "Agent Glossary" } },
      { "@type": "FAQPage", mainEntity: [{ "@type": "Question", name: `What is ${t.term}?`, acceptedAnswer: { "@type": "Answer", text: t.answer } },
        ...t.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } }))] },
    ],
  };
  const extraLd = `<script type="application/ld+json">\n${JSON.stringify(ld)}\n</script>`;
  const related = t.related.map((s) => bySlug[s]).filter(Boolean)
    .map((r) => `<a href="/${r.slug}">${esc(r.term)}</a>`).join("");
  const faqHtml = t.faq.map(([q, a]) => `<h2>${esc(q)}</h2><p>${a}</p>`).join("\n");
  return head(`What is ${t.term}? Definition & how it works (2026)`,
    t.answer.slice(0, 155), canonical, extraLd) + `
<span class="tag">${esc(t.cat)}</span>
<h1>What is ${esc(t.term)}?</h1>
<div class="answer"><b>Definition:</b> ${esc(t.answer)}</div>
${t.body}
${faqHtml}
<div class="cta"><h3>Put it into practice</h3><a class="btn" href="${t.cta[0]}">${esc(t.cta[1])}</a></div>
<h3>Related terms</h3>
<div class="related">${related}</div>
` + foot;
}

function indexPage() {
  const canonical = SITE + "/";
  const ld = `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org", "@type": "DefinedTermSet", name: "Agent Glossary",
    description: "Plain-English definitions of AI-agent, agentic-commerce, MCP and agent-payment terms.",
    hasDefinedTerm: TERMS.map((t) => ({ "@type": "DefinedTerm", name: t.term, url: `${SITE}/${t.slug}` })),
  })}</script>`;
  let body = `<h1>The Agent Glossary</h1>
<p class="lead">Plain-English definitions for the AI-agent era — agentic commerce, the Model Context Protocol, GEO and agent payments. Every term answered in one sentence, then explained.</p>`;
  for (const cat of CATS) {
    const items = TERMS.filter((t) => t.cat === cat);
    if (!items.length) continue;
    body += `<h3>${esc(cat)}</h3><div class="termgrid">` +
      items.map((t) => `<a href="/${t.slug}">${esc(t.term)}</a>`).join("") + `</div>`;
  }
  body += `<div class="cta"><h3>Ready to act on any of these?</h3><p style="color:var(--dim);font-size:14px">Free tools for the agentic era.</p><a class="btn" href="https://agentready.agiscorecard.com">Scan a store</a> &nbsp; <a class="btn" href="https://mcppulse.agiscorecard.com">Scan an MCP server</a></div>`;
  return head("The Agent Glossary — plain-English definitions for the AI-agent era",
    "Clear definitions of agentic commerce, MCP, GEO, x402 and agent-payment terms — each answered in one sentence, then explained. Free and updated regularly.",
    canonical, ld) + body + foot;
}

/* ---------------- write ---------------- */

fs.mkdirSync(OUT, { recursive: true });
for (const t of TERMS) fs.writeFileSync(new URL(`./${t.slug}.html`, OUT), termPage(t));
fs.writeFileSync(new URL("./index.html", OUT), indexPage());

const urls = [`${SITE}/`, ...TERMS.map((t) => `${SITE}/${t.slug}`)];
fs.writeFileSync(new URL("./sitemap.xml", OUT),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${u}</loc><lastmod>2026-07-21</lastmod></url>`).join("\n") + `\n</urlset>\n`);

const llms = `# Agent Glossary\n\n> Plain-English definitions for the AI-agent era: agentic commerce, the Model Context Protocol (MCP), GEO/AEO, and agent payments (x402, AP2). Each term is answered in one sentence, then explained, with links to free tools.\n\n## Terms\n` +
  TERMS.map((t) => `- [${t.term}](/${t.slug}): ${t.answer}`).join("\n") +
  `\n\n## Related tools\n- [AgentReady](${AGENTREADY}): AI sales-visibility scanner\n- [MCP Pulse](${MCPPULSE}): MCP server health scanner\n- [SellToAgents](${SELLTOAGENTS}): agentic commerce guides\n`;
fs.writeFileSync(new URL("./llms.txt", OUT), llms);

console.log(`Generated ${TERMS.length} term pages + index + sitemap (${urls.length} urls) + llms.txt -> ${OUT.pathname}`);
