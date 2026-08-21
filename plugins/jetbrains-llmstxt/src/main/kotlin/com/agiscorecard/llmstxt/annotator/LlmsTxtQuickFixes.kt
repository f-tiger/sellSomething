package com.agiscorecard.llmstxt.annotator

import com.agiscorecard.llmstxt.templates.LlmsTxtTemplates
import com.intellij.codeInsight.intention.IntentionAction
import com.intellij.openapi.editor.Editor
import com.intellij.openapi.project.Project
import com.intellij.psi.PsiDocumentManager
import com.intellij.psi.PsiFile

/**
 * Inserts the missing H1 title (and, for llms.txt, the missing summary blockquote).
 * Positions are recomputed from the current document at invocation time, so the fix
 * stays correct even after unrelated edits.
 */
class InsertScaffoldFix(private val agentsMd: Boolean) : IntentionAction {

    override fun getText(): String =
        if (agentsMd) "Insert agents.md title" else "Insert llms.txt title and summary"

    override fun getFamilyName(): String = "LLMs.txt & Agents.md"

    override fun isAvailable(project: Project, editor: Editor?, file: PsiFile?): Boolean =
        file != null && file.isWritable

    override fun startInWriteAction(): Boolean = true

    override fun invoke(project: Project, editor: Editor?, file: PsiFile?) {
        if (file == null) return
        val document = PsiDocumentManager.getInstance(project).getDocument(file) ?: return

        var offset = 0
        var titleEnd = -1
        var hasTitle = false
        var hasSummary = false
        for (line in document.text.split("\n")) {
            val trimmed = line.trim()
            if (!hasTitle && trimmed.startsWith("#") && !trimmed.startsWith("##")) {
                hasTitle = true
                titleEnd = offset + line.length
            }
            if (trimmed.startsWith(">")) hasSummary = true
            offset += line.length + 1
        }

        val needSummary = !agentsMd && !hasSummary
        if (!hasTitle) {
            val insertion = buildString {
                append("# ").append(project.name).append("\n\n")
                if (needSummary) append(LlmsTxtTemplates.SUMMARY_LINE).append("\n\n")
            }
            document.insertString(0, insertion)
        } else if (needSummary) {
            val at = titleEnd.coerceIn(0, document.textLength)
            document.insertString(at, "\n\n" + LlmsTxtTemplates.SUMMARY_LINE)
        }
    }
}

/** Inserts a sample link bullet right under the given (trimmed) "## Section" header line. */
class InsertSampleLinkFix(private val sectionHeader: String) : IntentionAction {

    override fun getText(): String = "Insert a sample link into \"$sectionHeader\""

    override fun getFamilyName(): String = "LLMs.txt & Agents.md"

    override fun isAvailable(project: Project, editor: Editor?, file: PsiFile?): Boolean =
        file != null && file.isWritable

    override fun startInWriteAction(): Boolean = true

    override fun invoke(project: Project, editor: Editor?, file: PsiFile?) {
        if (file == null) return
        val document = PsiDocumentManager.getInstance(project).getDocument(file) ?: return

        var offset = 0
        for (line in document.text.split("\n")) {
            if (line.trim() == sectionHeader) {
                val at = (offset + line.length).coerceIn(0, document.textLength)
                document.insertString(at, "\n" + LlmsTxtTemplates.SAMPLE_LINK)
                return
            }
            offset += line.length + 1
        }
    }
}
