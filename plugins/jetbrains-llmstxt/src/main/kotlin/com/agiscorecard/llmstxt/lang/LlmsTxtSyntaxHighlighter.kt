package com.agiscorecard.llmstxt.lang

import com.intellij.lexer.Lexer
import com.intellij.openapi.editor.DefaultLanguageHighlighterColors
import com.intellij.openapi.editor.colors.TextAttributesKey
import com.intellij.openapi.fileTypes.SingleLazyInstanceSyntaxHighlighterFactory
import com.intellij.openapi.fileTypes.SyntaxHighlighter
import com.intellij.openapi.fileTypes.SyntaxHighlighterBase
import com.intellij.psi.tree.IElementType

class LlmsTxtSyntaxHighlighter : SyntaxHighlighterBase() {
    override fun getHighlightingLexer(): Lexer = LlmsTxtLexer()

    override fun getTokenHighlights(tokenType: IElementType?): Array<TextAttributesKey> = when (tokenType) {
        LlmsTxtTokens.TITLE -> TITLE_KEYS
        LlmsTxtTokens.SECTION -> SECTION_KEYS
        LlmsTxtTokens.SUMMARY -> SUMMARY_KEYS
        LlmsTxtTokens.BULLET -> BULLET_KEYS
        else -> EMPTY_KEYS
    }

    companion object {
        val TITLE: TextAttributesKey =
            TextAttributesKey.createTextAttributesKey("LLMSTXT_TITLE", DefaultLanguageHighlighterColors.KEYWORD)
        val SECTION: TextAttributesKey =
            TextAttributesKey.createTextAttributesKey("LLMSTXT_SECTION", DefaultLanguageHighlighterColors.FUNCTION_DECLARATION)
        val SUMMARY: TextAttributesKey =
            TextAttributesKey.createTextAttributesKey("LLMSTXT_SUMMARY", DefaultLanguageHighlighterColors.DOC_COMMENT)
        val BULLET: TextAttributesKey =
            TextAttributesKey.createTextAttributesKey("LLMSTXT_BULLET", DefaultLanguageHighlighterColors.STRING)

        private val TITLE_KEYS = arrayOf(TITLE)
        private val SECTION_KEYS = arrayOf(SECTION)
        private val SUMMARY_KEYS = arrayOf(SUMMARY)
        private val BULLET_KEYS = arrayOf(BULLET)
        private val EMPTY_KEYS = emptyArray<TextAttributesKey>()
    }
}

class LlmsTxtSyntaxHighlighterFactory : SingleLazyInstanceSyntaxHighlighterFactory() {
    override fun createHighlighter(): SyntaxHighlighter = LlmsTxtSyntaxHighlighter()
}
