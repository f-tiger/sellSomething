#!/usr/bin/env node
/**
 * The Agent Glossary — generates plain-English definition pages for the
 * AI-agent era (agentic commerce, MCP, agent payments), each optimized for
 * "what is X" definitional queries that get cited by ChatGPT / AI Overviews.
 *
 * Add a term to TERMS and re-run: node scripts/gen-glossary.mjs
 * Emits term pages + index.html + sitemap.xml + llms.txt + feed.xml (Atom)
 * under sites/glossary/public.
 */
import fs from "node:fs";

const SITE = "https://glossary.agiscorecard.com";
const GA = 'G-FZXLMBB5QB';
const OUT = new URL("../sites/glossary/public/", import.meta.url);

const AGENTREADY = "https://agentready.agiscorecard.com";
const MCPPULSE = "https://mcppulse.agiscorecard.com";
const SELLTOAGENTS = "https://selltoagents.agiscorecard.com";
const X402TOOL = "https://x402.agiscorecard.com";

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
    answer: "The Agentic Commerce Protocol (ACP) is an open standard, maintained by OpenAI and Stripe, for connecting buyers, their AI agents and businesses to complete purchases. It powers product discovery in ChatGPT; after OpenAI retired Instant Checkout in March 2026, checkout itself hands off to the merchant's own environment.",
    body: `<p>ACP defines how a shopping agent finds products — via structured merchant feeds — and shortlists them against a buyer's constraints. The spec (still in beta, date-versioned; the 2026-04-17 snapshot added cart, feed, orders, auth and MCP compatibility) is developed openly on GitHub, with PayPal joining Stripe as a payment provider.</p>
<p>Know the history: OpenAI's in-chat <em>Instant Checkout</em> launched September 2025 but was retired in March 2026 after weak merchant uptake, and ChatGPT shopping pivoted discovery-first — agents surface your products, then send buyers to <strong>your</strong> checkout. That makes structured feeds and machine-readable product data, not a checkout integration, the thing that decides whether you're surfaced. The merchant stays seller of record and owns fulfillment and the customer relationship.</p>`,
    related: ["agentic-commerce", "ucp", "agentic-checkout", "ai-shopping-agent", "agentic-payments"],
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
    related: ["mcp-server", "mcp-registry", "streamable-http", "agentic-payments"],
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
    answer: "x402 is an open protocol that revives the HTTP 402 \"Payment Required\" status so AI agents and apps can pay for API calls or content programmatically, typically in stablecoins, in a single request-response. Created by Coinbase, it is now governed by the x402 Foundation under the Linux Foundation.",
    body: `<p>x402 lets a server respond to a request with payment terms (an HTTP 402); the client signs a payment locally (commonly USDC on a network like Base) and retries with proof, unlocking the resource — no accounts or manual checkout. It's aimed at machine-to-machine and agent payments.</p>
<p>The v2 spec, launched in early 2026, moved payment data into HTTP headers (<code>PAYMENT-REQUIRED</code>, <code>PAYMENT-SIGNATURE</code>, <code>PAYMENT-RESPONSE</code>), identifies networks with <a href="/x402-facilitator">facilitator</a>-pluggable CAIP-2 IDs (e.g. <code>eip155:8453</code> for Base, plus Solana), and added discovery and wallet-based identity. Governance moved to the Linux Foundation's x402 Foundation (operational July 2026), whose 40 members include Coinbase, Cloudflare, Google, Stripe, Visa, Mastercard and AWS. Coinbase reported 100M+ transactions through the protocol's first six months.</p>`,
    related: ["x402-facilitator", "http-402", "eip-3009", "ap2", "agentic-payments", "monetization-gateway"],
    faq: [["What is HTTP 402?", "402 Payment Required is a long-reserved HTTP status code that was never standardized for general use. x402 gives it a concrete meaning for programmatic, agent-driven payments."],
      ["What changed in x402 v2?", "Payment data moved into HTTP headers, networks are identified by CAIP-2 IDs (EVM and non-EVM), facilitators and payment schemes became pluggable, and the protocol added API discovery and wallet-based identity."]],
    cta: [X402TOOL, "Try pay-per-call x402 APIs live →"],
  },
  {
    slug: "ap2", term: "AP2 (Agent Payments Protocol)", cat: "Agent payments",
    answer: "AP2 (Agent Payments Protocol) is an open protocol for agent-initiated payments, initiated by Google and donated to the FIDO Alliance in April 2026. It uses cryptographically signed \"mandates\" that prove a user authorized an agent to make a specific purchase within set limits.",
    body: `<p>AP2 focuses on trust and authorization: a <a href="/ap2-mandate">mandate</a> is a signed record of what the user permitted (what, how much, for whom), so a merchant or payment network can verify an agent's purchase was genuinely authorized. It launched in September 2025 with dozens of corporate collaborators.</p>
<p>On April 28, 2026 Google donated AP2 to the FIDO Alliance — the standards body behind passkeys — to keep it platform-neutral, alongside a verifiable-intent framework co-developed with Mastercard; around sixty organizations backed the move. AP2 v0.2 added support for "human not present" payments, letting agents transact autonomously under pre-authorized instructions. AP2 (authorization) and <a href="/x402">x402</a> (settlement rails) are complementary rather than competing — different layers of the agent-payment stack.</p>`,
    related: ["ap2-mandate", "x402", "agentic-payments", "agentic-checkout", "acp"],
    faq: [["Is AP2 competing with x402?", "Not directly. AP2 handles authorization via signed mandates; x402 handles programmatic settlement. They can compose in a single agent transaction."]],
    cta: [SELLTOAGENTS, "Read the agentic commerce guides →"],
  },
  {
    slug: "agentic-payments", term: "Agentic payments", cat: "Agent payments",
    answer: "Agentic payments are payments initiated and completed by AI agents on a user's behalf, using protocols like x402 (settlement) and AP2 (authorization) so an agent can pay for goods, APIs or content without manual checkout.",
    body: `<p>As agents move from answering to transacting, they need to pay — for the products they buy in <a href="/agentic-commerce">agentic commerce</a>, and for the APIs and data they consume. Agentic payment protocols provide the authorization and settlement rails to do it safely and programmatically.</p>
<p>The payment rails are dominated by large players (Coinbase, Google, Visa, Mastercard, Stripe). For builders, the open opportunity is the surrounding layer: readiness tooling, monitoring, discovery and education.</p>`,
    related: ["x402", "ap2", "agentic-checkout", "agent-wallet", "acp", "agentic-commerce"],
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
    answer: "ChatGPT Shopping is OpenAI's feature that lets ChatGPT recommend products drawn from merchant feeds via the Agentic Commerce Protocol. Since OpenAI retired in-chat Instant Checkout in March 2026, ChatGPT surfaces and shortlists products, then hands buyers off to the merchant's own checkout.",
    body: `<p>When a user asks ChatGPT for product help, it can present a shortlist drawn from merchant feeds through <a href="/acp">ACP</a>. Over a million Shopify merchants are auto-enrolled; the question isn't whether you participate but whether your product data is structured well enough to be selected. The March 2026 pivot to discovery-first (checkout completes on your site) makes feed and schema quality — not a payments integration — the deciding factor.</p>`,
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
  /* ---- added 2026-08-21: agent-payments / agentic-commerce wave ---- */
  {
    slug: "x402-facilitator", term: "x402 facilitator", cat: "Agent payments", published: "2026-08-21",
    answer: "An x402 facilitator is a service that verifies and settles payments on behalf of servers using the x402 protocol — it checks that a client's signed payment matches the server's requirements, then broadcasts the transaction on-chain, so sellers never need blockchain infrastructure of their own.",
    body: `<p>In an <a href="/x402">x402</a> flow, the resource server can outsource the two hard steps to a facilitator: <code>POST /verify</code> confirms a signed payment payload meets the declared payment requirements (without touching the chain), and <code>POST /settle</code> submits the validated payment on-chain and watches for confirmation. A <code>GET /supported</code> endpoint advertises which schemes and networks the facilitator handles.</p>
<p>Facilitators are optional but recommended — they're why an API seller can accept stablecoins with a few lines of middleware. Well-known facilitators include Coinbase's CDP facilitator (fee-free settlement on Base and Solana) and PayAI (Solana-first, multi-network). In the v2 spec, facilitators and payment schemes are pluggable, so new networks can be added without changing the protocol.</p>`,
    related: ["x402", "eip-3009", "http-402", "monetization-gateway", "agent-wallet"],
    faq: [["Do I need a facilitator to accept x402 payments?", "No — a server can verify and settle payments itself. But a facilitator removes the need to run blockchain infrastructure, which is why most x402 sellers use one (e.g. Coinbase CDP or PayAI)."],
      ["What's the difference between verify and settle?", "Verify checks the signed payment payload against the server's payment requirements off-chain; settle actually broadcasts the transaction to the blockchain and monitors it until confirmed."]],
    cta: [X402TOOL, "See x402 payments in action →"],
  },
  {
    slug: "http-402", term: "HTTP 402 (Payment Required)", cat: "Agent payments", published: "2026-08-21",
    answer: "HTTP 402 \"Payment Required\" is a status code reserved in the HTTP spec since the 1990s but never standardized — until the AI-agent era. Protocols like x402 and products like Cloudflare's Pay Per Crawl now use a 402 response to tell a machine caller exactly what a resource costs and how to pay for it programmatically.",
    body: `<p>A 402 response turns a paywall into an API: instead of a human-oriented checkout page, the server returns machine-readable payment terms; the client (often an AI agent) pays and retries. <a href="/x402">x402</a> standardizes this exchange — in its HTTP transport, payment terms and proofs travel in headers such as <code>PAYMENT-REQUIRED</code>, <code>PAYMENT-SIGNATURE</code> and <code>PAYMENT-RESPONSE</code>.</p>
<p>The code went from curiosity to infrastructure fast: Cloudflare's <a href="/pay-per-crawl">Pay Per Crawl</a> answers unpaid AI crawlers with 402s at network scale, and its <a href="/monetization-gateway">Monetization Gateway</a> extends the same model to APIs, datasets and MCP tools.</p>`,
    related: ["x402", "pay-per-crawl", "monetization-gateway", "x402-facilitator"],
    faq: [["Why was HTTP 402 never used before?", "It was explicitly \"reserved for future use\" — there was no standard way for a machine to pay. Programmatic stablecoin payments and AI agents that need to buy access finally supplied both the rails and the demand."]],
    cta: [X402TOOL, "Call a real 402-gated API →"],
  },
  {
    slug: "eip-3009", term: "EIP-3009 (transferWithAuthorization)", cat: "Agent payments", published: "2026-08-21",
    answer: "EIP-3009 is an Ethereum token standard that lets a holder authorize a one-time, recipient-specific stablecoin transfer with an off-chain signature (transferWithAuthorization), which anyone can then submit on-chain. It's how x402 payments work on EVM chains: the paying agent signs; a facilitator submits and pays the gas.",
    body: `<p>Instead of sending a transaction, the payer signs an EIP-712 message authorizing a specific transfer — amount, recipient, a one-time nonce and a validity window. A relayer (in <a href="/x402">x402</a>, the <a href="/x402-facilitator">facilitator</a>) submits <code>transferWithAuthorization</code> on-chain and covers gas. The payer never needs ETH.</p>
<p>USDC implements EIP-3009 natively, which is why x402's "exact" payment scheme uses it on EVM networks like Base — an agent holding only USDC can pay for an API call with a single signature. On Solana, the equivalent role is played by SPL-token <code>TransferChecked</code> instructions.</p>`,
    related: ["x402", "x402-facilitator", "agent-wallet", "http-402"],
    faq: [["Why does x402 use EIP-3009 instead of a normal transfer?", "Because it makes payment a signature, not a transaction: the agent authorizes exactly one transfer and the facilitator handles gas and submission. That removes the need for the payer to hold native gas tokens and fits a single request-response cycle."]],
    cta: [X402TOOL, "Pay a real API with USDC on Base →"],
  },
  {
    slug: "monetization-gateway", term: "Monetization Gateway (Cloudflare)", cat: "Agent payments", published: "2026-08-21",
    answer: "The Monetization Gateway is a Cloudflare product (waitlist opened July 2, 2026) that lets anyone charge for resources behind Cloudflare — web pages, APIs, datasets, files or MCP tool calls — using the x402 protocol, with payments settling in stablecoins and Cloudflare verifying payment and enforcing access at the edge.",
    body: `<p>The seller defines which resources cost money and how much; Cloudflare answers unpaid requests with <a href="/x402">x402</a> payment terms, verifies payments, and unlocks access — no payment infrastructure to build. It generalizes <a href="/pay-per-crawl">Pay Per Crawl</a> (which covered publisher content) to anything an agent might consume: API endpoints, data feeds and <a href="/mcp-tool">MCP tools</a>.</p>
<p>It's part of Cloudflare's 2026 agentic-payments push alongside <a href="/agent-wallet">Cloudflare Wallets</a> (the buyer side, announced the following month) and its role as a premier member of the Linux Foundation's x402 Foundation.</p>`,
    related: ["x402", "pay-per-crawl", "agent-wallet", "http-402", "agentic-payments"],
    faq: [["What can I charge for with the Monetization Gateway?", "Any resource served through Cloudflare — pages, API routes, datasets, file downloads, or MCP tool calls. You set the price; Cloudflare handles the x402 payment flow and enforcement at the edge."]],
    cta: [X402TOOL, "See a pay-per-call API built on x402 →"],
  },
  {
    slug: "pay-per-crawl", term: "Pay per crawl", cat: "Agent payments", published: "2026-08-21",
    answer: "Pay per crawl is a Cloudflare feature (part of AI Crawl Control) that lets website owners charge AI crawlers for access to their content: a crawler either presents payment intent in its request headers and gets the page, or receives an HTTP 402 Payment Required response with the price.",
    body: `<p>Launched in private beta in July 2025 and folded into the AI Crawl Control console, pay per crawl gives publishers a third option beyond "allow" and "block": <em>charge</em>. The site owner sets a price; verified AI crawlers that agree to pay get HTTP 200 and content, others get a <a href="/http-402">402</a> with payment terms.</p>
<p>It reframes the crawler standoff as a market: AI companies get legitimate access to content for training, search and agents; publishers get paid per request instead of trading traffic for nothing as <a href="/zero-click-search">zero-click</a> answers grow. Stack Overflow was an early named adopter, and the model was later generalized by Cloudflare's <a href="/monetization-gateway">Monetization Gateway</a>.</p>`,
    related: ["http-402", "monetization-gateway", "x402", "zero-click-search", "llms-txt"],
    faq: [["How is pay per crawl different from blocking AI bots in robots.txt?", "robots.txt is a voluntary allow/deny signal. Pay per crawl is enforced at Cloudflare's edge and adds a price: crawlers that pay get access, crawlers that don't get a 402 — turning crawl access into revenue rather than an all-or-nothing choice."]],
    cta: [AGENTREADY, "Check how AI crawlers see your site →"],
  },
  {
    slug: "agent-wallet", term: "Agent wallet (programmable wallet)", cat: "Agent payments", published: "2026-08-21",
    answer: "An agent wallet is a programmable wallet built for an AI agent rather than a human: the agent gets its own payment credentials and identity, but every spend is constrained by human-set policies — spending caps, per-transaction limits and scoped permissions. Examples include Coinbase's CDP Agentic Wallets and Cloudflare Wallets.",
    body: `<p>Agents can't open bank accounts or click "Sign up with Google." Agent wallets solve this with programmable custody: keys held in secure infrastructure (MPC or enclaves), stablecoin balances, native <a href="/x402">x402</a> support for machine-to-machine payments, and guardrails the owner defines in code.</p>
<p>Two 2026 landmarks: Coinbase launched <strong>CDP Agentic Wallets</strong> (February 2026) — MPC-secured wallets with session caps, per-transaction limits and gasless settlement on Base, installable via CLI or an MCP server. Cloudflare announced <strong>Cloudflare Wallets</strong> with cloudflare.pay identity handles (August 4, 2026), giving agents deployed on Cloudflare a stable identity and human-set spending limits on x402 rails; handle reservations opened first, with wallet infrastructure rolling out over the following months.</p>`,
    related: ["x402", "agentic-payments", "eip-3009", "monetization-gateway", "ai-agent"],
    faq: [["How is an agent wallet different from a normal crypto wallet?", "Policy is the product: a human owner sets spending caps, transaction limits and scopes, and the agent transacts autonomously only inside them. Keys stay in secure infrastructure (MPC/enclaves) rather than with the agent itself."],
      ["Do agent wallets only hold crypto?", "Today they're mostly stablecoin wallets on x402 rails (e.g. USDC on Base or Solana), but the same pattern — scoped, delegated payment credentials — also exists on card rails via network tokens like Stripe's Shared Payment Tokens or Mastercard's Agentic Tokens."]],
    cta: [X402TOOL, "What an agent can buy with a wallet →"],
  },
  {
    slug: "shared-payment-token", term: "Shared Payment Token (SPT)", cat: "Agent payments", published: "2026-08-21",
    answer: "A Shared Payment Token (SPT) is a Stripe payment primitive for agentic commerce: it lets an AI agent initiate a payment using a customer's permitted payment method without ever exposing the underlying card or credentials, with scope and amount controlled by the merchant and platform.",
    body: `<p>SPTs answer the scariest question in agentic commerce — "does the agent hold my card?" — with no. The buyer's payment method stays vaulted; the agent platform passes a token that can only be used within the agreed scope, and the merchant charges it like a normal payment.</p>
<p>Stripe introduced SPTs alongside the <a href="/acp">Agentic Commerce Protocol</a> and later broadened agentic checkout beyond cards to additional payment methods. It's the card-rail sibling of crypto-native approaches like <a href="/x402">x402</a>, and one of several delegated-credential schemes (Visa's Intelligent Commerce and Mastercard's Agent Pay tokens play similar roles on their networks).</p>`,
    related: ["acp", "agentic-checkout", "agentic-payments", "ap2-mandate"],
    faq: [["Does an AI agent see my card number when using an SPT?", "No. The card stays vaulted with the payment provider; the agent only carries a scoped token that authorizes a specific kind of charge, so a compromised agent can't reuse or exfiltrate your credentials."]],
    cta: [SELLTOAGENTS, "How agent payments reach your store →"],
  },
  {
    slug: "ap2-mandate", term: "Mandate (AP2)", cat: "Agent payments", published: "2026-08-21",
    answer: "A mandate, in the Agent Payments Protocol (AP2), is a cryptographically signed digital record proving what a user authorized their AI agent to do — what to buy, under which limits — giving merchants and payment networks verifiable, auditable evidence that an agent-initiated purchase was genuinely approved.",
    body: `<p>Mandates are AP2's core trust primitive. When you tell an agent "buy these shoes if they drop under $100," that authorization is captured as a signed mandate; when the agent later transacts, the merchant can verify the purchase traces back to real user intent — and disputes have a non-repudiable audit trail.</p>
<p>AP2 v0.2 extended mandates to "human not present" payments, where an agent executes autonomously under pre-authorized instructions — the foundation for delegated commerce at scale. Since <a href="/ap2">AP2</a> was donated to the FIDO Alliance in April 2026, mandates sit in the same standards family as passkeys: cryptographic proof of who authorized what.</p>`,
    related: ["ap2", "agentic-payments", "agentic-checkout", "shared-payment-token"],
    faq: [["Why do agent payments need mandates?", "Because in agentic commerce the buyer isn't present at checkout. A signed mandate lets everyone downstream — merchant, processor, network — verify the agent acted within what the human actually authorized, and assigns accountability if it didn't."]],
    cta: [SELLTOAGENTS, "Prepare your store for agent buyers →"],
  },
  {
    slug: "agentic-checkout", term: "Agentic checkout", cat: "Agentic commerce", published: "2026-08-21",
    answer: "Agentic checkout is the completion step of agentic commerce: how an AI agent actually pays and places an order on a buyer's behalf. In 2026 it spans two models — handoff (the agent shortlists, the buyer completes checkout on the merchant's site) and delegated payment (the agent pays directly using scoped credentials like tokens or mandates).",
    body: `<p>Discovery gets the attention, but checkout is where agentic commerce becomes real money. The stack settled into layers during 2026: open protocols (<a href="/acp">ACP</a> for merchant feeds and orders, <a href="/ap2">AP2</a> for authorization), card networks (Visa Intelligent Commerce, Mastercard Agent Pay with its scoped Agentic Tokens), processors (Stripe's <a href="/shared-payment-token">Shared Payment Tokens</a>), and crypto rails (<a href="/x402">x402</a> for machine-to-machine payments).</p>
<p>The market spoke on which model leads for retail: after OpenAI retired in-chat Instant Checkout in March 2026, handoff — agent discovers and shortlists, merchant hosts the checkout — became the dominant pattern, with fully delegated payment growing fastest in machine-to-machine contexts (APIs, data, tools) rather than consumer carts.</p>`,
    related: ["agentic-commerce", "acp", "ap2", "shared-payment-token", "x402", "agentic-payments"],
    faq: [["Can AI agents actually complete purchases today?", "Yes, but mostly via handoff or tightly scoped credentials. Consumer flows typically end on the merchant's checkout; autonomous payment is furthest along for machine-to-machine purchases like API calls, where x402-style rails settle in stablecoins."]],
    cta: [AGENTREADY, "Is your store ready for agent buyers? →"],
  },
  {
    slug: "mcp-registry", term: "MCP Registry", cat: "Model Context Protocol", published: "2026-08-21",
    answer: "The MCP Registry is the official open catalog of Model Context Protocol servers at registry.modelcontextprotocol.io, where developers publish servers under verified namespaces (like io.github.username) so MCP clients and subregistries can discover them from one canonical source.",
    body: `<p>Launched in preview in September 2025 by the MCP open-source community (with Anthropic, GitHub, PulseMCP and Microsoft involved), the registry is the single source of truth that downstream catalogs — including the GitHub MCP Registry — build on. It passed several thousand listed servers within its first year.</p>
<p>Publishing is namespace-verified: <code>io.github.*</code> names require GitHub login (or GitHub Actions OIDC, which lets CI publish with zero stored secrets), and custom reverse-DNS namespaces are verified via DNS or HTTP. Each entry is a <code>server.json</code> describing where the <a href="/mcp-server">server</a> lives and how to run or reach it. For agents, the registry is becoming what package registries were for code: the default place to resolve trusted tools.</p>`,
    related: ["mcp", "mcp-server", "mcp-tool", "streamable-http"],
    faq: [["How do I publish my MCP server to the registry?", "Verify a namespace (easiest: io.github.you via GitHub auth, or OIDC from GitHub Actions), write a server.json describing your server, and publish with the mcp-publisher CLI. Then make sure the server itself passes a health check — clients skip broken servers."]],
    cta: [MCPPULSE, "Health-check your server before publishing →"],
  },
  {
    slug: "proof-of-personhood", term: "Proof of personhood", cat: "AI agents & concepts", published: "2026-08-21",
    answer: "Proof of personhood is a way to verify that an online actor is a unique human — not a bot, a duplicate account, or an AI agent — without necessarily revealing who they are. As AI agents flood the internet, it's becoming core infrastructure for fair airdrops, governance, and telling delegated agents apart from fake users.",
    body: `<p>Approaches range from biometric (World's iris-scanning Orb) to aggregate signals: <strong>Human Passport</strong> (formerly Gitcoin Passport, acquired by Holonym's human.tech in late 2024) lets users collect verifiable "stamps" from web2 and web3 accounts into a Unique Humanity Score that apps can gate on — proving humanity without exposing identity.</p>
<p>In the agent economy the point isn't to exclude agents — it's to bind them to humans. An <a href="/ai-agent">agent</a> acting for a verified person (with a <a href="/ap2-mandate">mandate</a> or an <a href="/agent-wallet">agent wallet</a>) is a customer; a swarm of agents pretending to be thousands of people is a Sybil attack. Proof of personhood is the anchor that keeps one human behind each delegated identity.</p>`,
    related: ["ai-agent", "agent-wallet", "ap2-mandate", "prompt-injection"],
    faq: [["Does proof of personhood block AI agents?", "No — it distinguishes them. A delegated agent can act under a verified human's identity and authorization; what proof of personhood blocks is one operator masquerading as many humans (Sybil attacks) in votes, airdrops and reward programs."]],
    cta: [SELLTOAGENTS, "Understand the agent-era trust stack →"],
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
      { "@type": "Article", headline: `What is ${t.term}?`, datePublished: t.published || "2026-07-21", author: { "@type": "Organization", name: "Agent Glossary" } },
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

const urls = [{ loc: `${SITE}/`, mod: "2026-08-21" },
  ...TERMS.map((t) => ({ loc: `${SITE}/${t.slug}`, mod: t.published || "2026-07-21" }))];
fs.writeFileSync(new URL("./sitemap.xml", OUT),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${u.loc}</loc><lastmod>${u.mod}</lastmod></url>`).join("\n") + `\n</urlset>\n`);

const llms = `# Agent Glossary\n\n> Plain-English definitions for the AI-agent era: agentic commerce, the Model Context Protocol (MCP), GEO/AEO, and agent payments (x402, AP2). Each term is answered in one sentence, then explained, with links to free tools.\n\n## Terms\n` +
  TERMS.map((t) => `- [${t.term}](/${t.slug}): ${t.answer}`).join("\n") +
  `\n\n## Machine discovery\n- [ai-catalog.json](/.well-known/ai-catalog.json): Agentic Resource Discovery manifest of this site and its sister tools/APIs\n- [feed.xml](/feed.xml): Atom feed of glossary terms, newest first` +
  `\n\n## Related tools\n- [AgentReady](${AGENTREADY}): AI sales-visibility scanner\n- [MCP Pulse](${MCPPULSE}): MCP server health scanner\n- [SellToAgents](${SELLTOAGENTS}): agentic commerce guides\n`;
fs.writeFileSync(new URL("./llms.txt", OUT), llms);

/* ---------------- Atom feed (feed.xml) ---------------- */

const DEFAULT_PUBLISHED = "2026-07-21";
const iso = (d) => `${d}T00:00:00Z`;
// Newest first; stable within the same date (keeps TERMS order).
const feedTerms = TERMS
  .map((t, i) => ({ t, i, pub: t.published || DEFAULT_PUBLISHED }))
  .sort((a, b) => (a.pub === b.pub ? a.i - b.i : b.pub.localeCompare(a.pub)));
const feedUpdated = iso(feedTerms[0].pub);
const feed = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>The Agent Glossary</title>
  <subtitle>Plain-English definitions for the AI-agent era — agentic commerce, MCP, GEO/AEO and agent payments. New terms appear here as they are published.</subtitle>
  <id>${SITE}/</id>
  <link href="${SITE}/"/>
  <link rel="self" type="application/atom+xml" href="${SITE}/feed.xml"/>
  <updated>${feedUpdated}</updated>
  <author><name>Agent Glossary</name></author>
${feedTerms.map(({ t, pub }) => `  <entry>
    <title>${esc(`What is ${t.term}?`)}</title>
    <id>${SITE}/${t.slug}</id>
    <link href="${SITE}/${t.slug}"/>
    <published>${iso(pub)}</published>
    <updated>${iso(pub)}</updated>
    <category term="${esc(t.cat)}"/>
    <summary>${esc(t.answer)}</summary>
  </entry>`).join("\n")}
</feed>
`;
fs.writeFileSync(new URL("./feed.xml", OUT), feed);

console.log(`Generated ${TERMS.length} term pages + index + sitemap (${urls.length} urls) + llms.txt + feed.xml (${feedTerms.length} entries) -> ${OUT.pathname}`);
