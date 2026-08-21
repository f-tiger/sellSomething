package com.agiscorecard.llmstxt.lang

import com.intellij.lang.Language

/**
 * One shared language for the two markdown-like AI-agent content standards:
 * llms.txt (H1 title, `>` summary blockquote, `##` sections of `- [name](url): description`
 * link bullets) and agents.md (H1 title plus free-form `##` instruction sections).
 */
object LlmsTxtLanguage : Language("LlmsTxt") {
    override fun getDisplayName(): String = "LLMs.txt"
}
