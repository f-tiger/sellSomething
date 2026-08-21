package com.agiscorecard.llmstxt.lang

import com.intellij.lexer.LexerBase
import com.intellij.psi.TokenType
import com.intellij.psi.tree.IElementType

/**
 * Stateless line-based lexer: every line is classified as one token by its prefix,
 * newlines and blank lines are whitespace. State is always 0, so the editor
 * highlighter can restart at any token boundary.
 */
class LlmsTxtLexer : LexerBase() {
    private var myBuffer: CharSequence = ""
    private var myBufferEnd: Int = 0
    private var myTokenStart: Int = 0
    private var myTokenEnd: Int = 0
    private var myTokenType: IElementType? = null

    override fun start(buffer: CharSequence, startOffset: Int, endOffset: Int, initialState: Int) {
        myBuffer = buffer
        myBufferEnd = endOffset
        myTokenStart = startOffset
        myTokenEnd = startOffset
        locateToken()
    }

    override fun getState(): Int = 0

    override fun getTokenType(): IElementType? = myTokenType

    override fun getTokenStart(): Int = myTokenStart

    override fun getTokenEnd(): Int = myTokenEnd

    override fun advance() {
        locateToken()
    }

    override fun getBufferSequence(): CharSequence = myBuffer

    override fun getBufferEnd(): Int = myBufferEnd

    private fun locateToken() {
        myTokenStart = myTokenEnd
        if (myTokenStart >= myBufferEnd) {
            myTokenType = null
            return
        }
        if (myBuffer[myTokenStart] == '\n') {
            myTokenEnd = myTokenStart + 1
            myTokenType = TokenType.WHITE_SPACE
            return
        }
        var end = myTokenStart
        while (end < myBufferEnd && myBuffer[end] != '\n') end++
        myTokenEnd = end
        myTokenType = classify(myBuffer.subSequence(myTokenStart, myTokenEnd).toString())
    }

    private fun classify(line: String): IElementType {
        val trimmed = line.trim()
        return when {
            trimmed.isEmpty() -> TokenType.WHITE_SPACE
            trimmed.startsWith("##") -> LlmsTxtTokens.SECTION
            trimmed.startsWith("#") -> LlmsTxtTokens.TITLE
            trimmed.startsWith(">") -> LlmsTxtTokens.SUMMARY
            trimmed.startsWith("- ") || trimmed.startsWith("* ") -> LlmsTxtTokens.BULLET
            else -> LlmsTxtTokens.TEXT
        }
    }
}
