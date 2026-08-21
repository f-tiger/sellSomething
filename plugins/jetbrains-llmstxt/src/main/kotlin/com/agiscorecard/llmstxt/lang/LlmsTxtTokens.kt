package com.agiscorecard.llmstxt.lang

import com.intellij.psi.tree.IElementType

class LlmsTxtTokenType(debugName: String) : IElementType(debugName, LlmsTxtLanguage)

/** Line-level tokens: each non-blank line becomes exactly one of these. */
object LlmsTxtTokens {
    @JvmField val TITLE = LlmsTxtTokenType("LLMSTXT_TITLE")       // "# ..." (H1)
    @JvmField val SECTION = LlmsTxtTokenType("LLMSTXT_SECTION")   // "## ..." and deeper
    @JvmField val SUMMARY = LlmsTxtTokenType("LLMSTXT_SUMMARY")   // "> ..." blockquote
    @JvmField val BULLET = LlmsTxtTokenType("LLMSTXT_BULLET")     // "- ..." / "* ..." list item
    @JvmField val TEXT = LlmsTxtTokenType("LLMSTXT_TEXT")         // anything else
}
