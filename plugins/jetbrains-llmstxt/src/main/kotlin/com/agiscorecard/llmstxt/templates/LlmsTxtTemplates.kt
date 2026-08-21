package com.agiscorecard.llmstxt.templates

/**
 * Scaffolds mirror the guidance the AgentReady scanner scores against:
 * H1 title, one-line `>` summary, `##` sections of absolute-URL link bullets.
 */
object LlmsTxtTemplates {

    const val SAMPLE_LINK: String = "- [Page title](https://www.example.com/page): One-line description for AI agents."

    const val SUMMARY_LINE: String =
        "> One-sentence summary of what this site offers, written for AI agents."

    fun normalizeBase(domain: String): String {
        val trimmed = domain.trim().removeSuffix("/")
        if (trimmed.isEmpty()) return "https://www.example.com"
        return if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) trimmed else "https://$trimmed"
    }

    fun llmsTxt(projectName: String, domain: String): String {
        val base = normalizeBase(domain)
        return """
            # $projectName

            $SUMMARY_LINE

            ## Products
            - [Best sellers]($base/collections/best-sellers): Most popular products with prices and availability.
            - [Full catalog]($base/products): Everything we sell, with specs and stock status.

            ## Docs
            - [About us]($base/about): Who we are and why customers trust us.
            - [FAQ]($base/faq): Shipping times, returns, sizing and guarantees.

            ## Policies
            - [Shipping policy]($base/shipping): Costs, regions and delivery times.
            - [Returns and refunds]($base/returns): How returns work and refund timelines.

            ## Optional
            - [Blog]($base/blog): Guides and product deep-dives.
        """.trimIndent() + "\n"
    }

    fun agentsMd(projectName: String, domain: String): String {
        val base = normalizeBase(domain)
        return """
            # $projectName — guide for AI agents

            > How automated agents should browse, query and transact with this project.

            ## What this site offers
            - [Product catalog]($base/products): Every product with price, availability and specs.
            - [llms.txt]($base/llms.txt): Curated content map for language models.

            ## How to interact
            - Product data is exposed as schema.org/Product JSON-LD on every product page.
            - Prefer the pages listed in llms.txt over crawling navigation menus.
            - Never place an order or submit a form without explicit user confirmation.

            ## Setup commands
            - Install dependencies: `npm install`
            - Run locally: `npm run dev`
            - Run tests: `npm test`

            ## Code style
            - Keep changes minimal and focused; follow the existing formatting.

            ## PR instructions
            - Reference the related issue and describe agent-visible behavior changes.
        """.trimIndent() + "\n"
    }
}
