package com.agiscorecard.llmstxt.annotator

import com.agiscorecard.llmstxt.lang.LlmsTxtFile
import com.intellij.lang.annotation.AnnotationHolder
import com.intellij.lang.annotation.Annotator
import com.intellij.lang.annotation.HighlightSeverity
import com.intellij.openapi.util.TextRange
import com.intellij.psi.PsiElement

/**
 * Spec checks, mirroring what the AgentReady scanner scores:
 * - missing H1 title (llms.txt and agents.md)
 * - H1 not on the first content line
 * - missing `>` summary blockquote (llms.txt)
 * - malformed link bullets and non-absolute URLs (llms.txt)
 * - `##` sections without any link bullet (llms.txt)
 */
class LlmsTxtAnnotator : Annotator {

    override fun annotate(element: PsiElement, holder: AnnotationHolder) {
        if (element !is LlmsTxtFile) return
        val lines = splitLines(element.text)
        val isAgents = element.name.endsWith(".md", ignoreCase = true)

        checkTitle(lines, holder, isAgents)
        if (!isAgents) {
            checkSummary(lines, holder)
            checkBullets(lines, holder)
            checkSections(lines, holder)
        }
    }

    private fun checkTitle(lines: List<LineInfo>, holder: AnnotationHolder, isAgents: Boolean) {
        val firstContent = lines.firstOrNull { it.text.isNotBlank() }
        val titleLine = lines.firstOrNull { isH1(it.text) }
        if (titleLine == null) {
            val message =
                if (isAgents) "agents.md is missing an H1 title (\"# Your project\")"
                else "llms.txt is missing its H1 title (\"# Your site name\") — the spec requires one"
            holder.newAnnotation(HighlightSeverity.WARNING, message)
                .fileLevel()
                .withFix(InsertScaffoldFix(isAgents))
                .create()
        } else if (firstContent != null && firstContent.start != titleLine.start) {
            holder.newAnnotation(HighlightSeverity.WEAK_WARNING, "The H1 title should be the first line of the file")
                .range(TextRange(firstContent.start, firstContent.end))
                .create()
        }
    }

    private fun checkSummary(lines: List<LineInfo>, holder: AnnotationHolder) {
        if (lines.none { it.text.trim().startsWith(">") }) {
            holder.newAnnotation(
                HighlightSeverity.WEAK_WARNING,
                "Missing summary blockquote (\"> one-line summary\") after the title — it is the first thing AI agents read",
            )
                .fileLevel()
                .withFix(InsertScaffoldFix(false))
                .create()
        }
    }

    private fun checkBullets(lines: List<LineInfo>, holder: AnnotationHolder) {
        for (line in lines) {
            val trimmed = line.text.trim()
            if (!trimmed.startsWith("- ") && !trimmed.startsWith("* ")) continue

            val match = LINK_BULLET.matchEntire(line.text)
            if (match == null) {
                holder.newAnnotation(
                    HighlightSeverity.WARNING,
                    "Malformed link bullet — expected \"- [Name](https://…): description\"",
                )
                    .range(TextRange(line.start, line.end))
                    .create()
                continue
            }

            val urlGroup = match.groups[2] ?: continue
            val url = urlGroup.value
            val urlRange = TextRange(line.start + urlGroup.range.first, line.start + urlGroup.range.last + 1)
            when {
                url.startsWith("https://") -> Unit
                url.startsWith("http://") ->
                    holder.newAnnotation(HighlightSeverity.WEAK_WARNING, "Prefer an HTTPS URL")
                        .range(urlRange)
                        .create()
                else ->
                    holder.newAnnotation(
                        HighlightSeverity.WARNING,
                        "Use an absolute URL (https://…) — relative links break when agents read llms.txt out of context",
                    )
                        .range(urlRange)
                        .create()
            }
        }
    }

    private fun checkSections(lines: List<LineInfo>, holder: AnnotationHolder) {
        var i = 0
        while (i < lines.size) {
            val trimmed = lines[i].text.trim()
            if (isH2(trimmed)) {
                var j = i + 1
                var hasBullet = false
                while (j < lines.size) {
                    val next = lines[j].text.trim()
                    if (next.startsWith("#")) break
                    if (next.startsWith("- ") || next.startsWith("* ")) hasBullet = true
                    j++
                }
                if (!hasBullet) {
                    val sectionName = trimmed.trimStart('#').trim().ifEmpty { "(unnamed)" }
                    holder.newAnnotation(
                        HighlightSeverity.WEAK_WARNING,
                        "Section \"$sectionName\" has no link bullets — agents will skip it",
                    )
                        .range(TextRange(lines[i].start, lines[i].end))
                        .withFix(InsertSampleLinkFix(trimmed))
                        .create()
                }
                i = j
            } else {
                i++
            }
        }
    }

    private data class LineInfo(val start: Int, val text: String) {
        val end: Int get() = start + text.length
    }

    private fun splitLines(text: String): List<LineInfo> {
        val result = ArrayList<LineInfo>()
        var offset = 0
        for (line in text.split("\n")) {
            result.add(LineInfo(offset, line))
            offset += line.length + 1
        }
        return result
    }

    companion object {
        private val LINK_BULLET = Regex("""^\s*[-*]\s+\[([^\]]+)]\(([^)\s]+)\)\s*(?::\s*(.*))?$""")

        internal fun isH1(line: String): Boolean {
            val trimmed = line.trim()
            return trimmed.startsWith("#") && !trimmed.startsWith("##")
        }

        internal fun isH2(trimmed: String): Boolean =
            trimmed.startsWith("##") && !trimmed.startsWith("###")
    }
}
