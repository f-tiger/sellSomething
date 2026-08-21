package com.agiscorecard.llmstxt.settings

import com.intellij.openapi.options.Configurable
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBTextField
import com.intellij.util.ui.FormBuilder
import javax.swing.JComponent
import javax.swing.JPanel

/** Settings | Tools | LLMs.txt & Agents.md */
class LlmsTxtConfigurable : Configurable {

    private var domainField: JBTextField? = null
    private var panel: JPanel? = null

    override fun getDisplayName(): String = "LLMs.txt & Agents.md"

    override fun createComponent(): JComponent {
        val field = JBTextField()
        domainField = field
        val built = FormBuilder.createFormBuilder()
            .addLabeledComponent("Default site domain:", field, 1, false)
            .addComponentToRightColumn(
                JBLabel("Pre-fills generated llms.txt / agents.md files and the AgentReady audit (e.g. https://www.example.com)."),
                1,
            )
            .addComponentFillVertically(JPanel(), 0)
            .panel
        panel = built
        return built
    }

    override fun isModified(): Boolean =
        (domainField?.text?.trim() ?: "") != LlmsTxtSettings.getInstance().defaultDomain

    override fun apply() {
        LlmsTxtSettings.getInstance().defaultDomain = domainField?.text?.trim().orEmpty()
    }

    override fun reset() {
        domainField?.text = LlmsTxtSettings.getInstance().defaultDomain
    }

    override fun disposeUIResources() {
        domainField = null
        panel = null
    }
}
