package com.agiscorecard.llmstxt.completion

import com.agiscorecard.llmstxt.lang.LlmsTxtFile
import com.intellij.codeInsight.completion.CompletionContributor
import com.intellij.codeInsight.completion.CompletionParameters
import com.intellij.codeInsight.completion.CompletionProvider
import com.intellij.codeInsight.completion.CompletionResultSet
import com.intellij.codeInsight.completion.CompletionType
import com.intellij.codeInsight.completion.PlainPrefixMatcher
import com.intellij.codeInsight.lookup.LookupElementBuilder
import com.intellij.openapi.util.TextRange
import com.intellij.patterns.PlatformPatterns
import com.intellij.util.ProcessingContext

/**
 * Completes canonical llms.txt section headers, common agents.md sections
 * and a link-bullet template. Registered for the LlmsTxt language only.
 */
class LlmsTxtCompletionContributor : CompletionContributor() {
    init {
        extend(
            CompletionType.BASIC,
            PlatformPatterns.psiElement(),
            object : CompletionProvider<CompletionParameters>() {
                override fun addCompletions(
                    parameters: CompletionParameters,
                    context: ProcessingContext,
                    result: CompletionResultSet,
                ) {
                    val file = parameters.originalFile
                    if (file !is LlmsTxtFile) return

                    val document = parameters.editor.document
                    val offset = parameters.offset.coerceIn(0, document.textLength)
                    val lineNumber = document.getLineNumber(offset)
                    val linePrefix = document.getText(TextRange(document.getLineStartOffset(lineNumber), offset))
                    val typed = linePrefix.trimStart()

                    val isAgents = file.name.endsWith(".md", ignoreCase = true)
                    val sections = if (isAgents) AGENTS_SECTIONS else LLMS_SECTIONS
                    val sectionType = if (isAgents) "agents.md section" else "llms.txt section"

                    // Match against what was really typed on the line ("## D" etc.);
                    // '#' is not part of the default identifier prefix.
                    val matched = result.withPrefixMatcher(PlainPrefixMatcher(typed))
                    for (section in sections) {
                        matched.addElement(
                            LookupElementBuilder.create(section)
                                .bold()
                                .withTypeText(sectionType, true),
                        )
                    }
                    if (!isAgents) {
                        matched.addElement(
                            LookupElementBuilder.create(LINK_TEMPLATE)
                                .withPresentableText("- [name](url): description")
                                .withTypeText("link bullet", true),
                        )
                    }
                }
            },
        )
    }

    companion object {
        private val LLMS_SECTIONS = listOf(
            "## Docs",
            "## Products",
            "## Pricing",
            "## Policies",
            "## Guides",
            "## API",
            "## Examples",
            "## Optional",
        )

        private val AGENTS_SECTIONS = listOf(
            "## Project overview",
            "## What this site offers",
            "## How to interact",
            "## Setup commands",
            "## Build and test",
            "## Code style",
            "## Testing instructions",
            "## PR instructions",
            "## Security considerations",
            "## Deployment",
        )

        private const val LINK_TEMPLATE =
            "- [Page title](https://www.example.com/page): One-line description"
    }
}
