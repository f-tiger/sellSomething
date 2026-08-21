package com.agiscorecard.llmstxt.lang

import com.agiscorecard.llmstxt.LlmsTxtIcons
import com.intellij.openapi.fileTypes.LanguageFileType
import javax.swing.Icon

/** Bound to the exact file names llms.txt / llms-full.txt in plugin.xml. */
object LlmsTxtFileType : LanguageFileType(LlmsTxtLanguage) {
    override fun getName(): String = "LLMs.txt"
    override fun getDescription(): String = "llms.txt AI-agent site map"
    override fun getDefaultExtension(): String = "txt"
    override fun getIcon(): Icon = LlmsTxtIcons.LLMS_FILE
}

/** Bound to the exact file name agents.md in plugin.xml; shares the LlmsTxt language. */
object AgentsMdFileType : LanguageFileType(LlmsTxtLanguage, true) {
    override fun getName(): String = "Agents.md"
    override fun getDescription(): String = "agents.md AI-agent instructions"
    override fun getDefaultExtension(): String = "md"
    override fun getIcon(): Icon = LlmsTxtIcons.AGENTS_FILE
}
