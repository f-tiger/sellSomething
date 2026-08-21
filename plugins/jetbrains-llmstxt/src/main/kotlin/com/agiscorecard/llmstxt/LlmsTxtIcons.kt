package com.agiscorecard.llmstxt

import com.intellij.openapi.util.IconLoader
import javax.swing.Icon

object LlmsTxtIcons {
    @JvmField
    val LLMS_FILE: Icon = IconLoader.getIcon("/icons/llmstxt.svg", LlmsTxtIcons::class.java.classLoader)

    @JvmField
    val AGENTS_FILE: Icon = IconLoader.getIcon("/icons/agentsmd.svg", LlmsTxtIcons::class.java.classLoader)

    @JvmField
    val TOOL_WINDOW: Icon = IconLoader.getIcon("/icons/toolWindow.svg", LlmsTxtIcons::class.java.classLoader)
}
