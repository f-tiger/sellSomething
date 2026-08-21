package com.agiscorecard.llmstxt.actions

import com.agiscorecard.llmstxt.audit.AuditService
import com.agiscorecard.llmstxt.settings.LlmsTxtSettings
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.ui.Messages

/** Prompts for a site URL and runs the AgentReady scan in the audit tool window. */
class AuditSiteAction : AnAction() {

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = e.project != null
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val initial = LlmsTxtSettings.getInstance().defaultDomain.ifBlank { "https://" }
        val url = Messages.showInputDialog(
            project,
            "Site URL to audit (fetched by the AgentReady scanner):",
            "Audit Site with AgentReady",
            null,
            initial,
            null,
        )?.trim().orEmpty()
        if (url.isEmpty()) return
        AuditService.getInstance(project).openAndScan(url)
    }
}
