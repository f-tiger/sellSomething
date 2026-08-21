package com.agiscorecard.llmstxt.lang

import com.intellij.extapi.psi.ASTWrapperPsiElement
import com.intellij.extapi.psi.PsiFileBase
import com.intellij.lang.ASTNode
import com.intellij.lang.ParserDefinition
import com.intellij.lang.PsiBuilder
import com.intellij.lang.PsiParser
import com.intellij.lexer.Lexer
import com.intellij.openapi.fileTypes.FileType
import com.intellij.openapi.project.Project
import com.intellij.psi.FileViewProvider
import com.intellij.psi.PsiElement
import com.intellij.psi.PsiFile
import com.intellij.psi.tree.IElementType
import com.intellij.psi.tree.IFileElementType
import com.intellij.psi.tree.TokenSet

class LlmsTxtFile(viewProvider: FileViewProvider) : PsiFileBase(viewProvider, LlmsTxtLanguage) {
    override fun getFileType(): FileType =
        if (name.endsWith(".md", ignoreCase = true)) AgentsMdFileType else LlmsTxtFileType

    override fun toString(): String = "LlmsTxtFile:$name"
}

/** Flat parse: the file node directly owns the line tokens produced by the lexer. */
class LlmsTxtParser : PsiParser {
    override fun parse(root: IElementType, builder: PsiBuilder): ASTNode {
        val fileMarker = builder.mark()
        while (!builder.eof()) builder.advanceLexer()
        fileMarker.done(root)
        return builder.treeBuilt
    }
}

class LlmsTxtParserDefinition : ParserDefinition {
    override fun createLexer(project: Project): Lexer = LlmsTxtLexer()

    override fun createParser(project: Project): PsiParser = LlmsTxtParser()

    override fun getFileNodeType(): IFileElementType = FILE

    override fun getCommentTokens(): TokenSet = TokenSet.EMPTY

    override fun getStringLiteralElements(): TokenSet = TokenSet.EMPTY

    override fun createElement(node: ASTNode): PsiElement = ASTWrapperPsiElement(node)

    override fun createFile(viewProvider: FileViewProvider): PsiFile = LlmsTxtFile(viewProvider)

    companion object {
        @JvmField
        val FILE = IFileElementType(LlmsTxtLanguage)
    }
}
