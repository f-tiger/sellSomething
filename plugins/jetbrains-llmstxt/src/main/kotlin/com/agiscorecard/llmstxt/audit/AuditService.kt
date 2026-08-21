package com.agiscorecard.llmstxt.audit

import com.intellij.openapi.components.Service
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindowManager

/**
 * Bridges the "Audit Site with AgentReady" action and the tool-window panel.
 * The panel registers itself when the tool window's content is created; if a
 * scan is requested before that, the URL is parked and consumed by the factory.
 */
@Service(Service.Level.PROJECT)
class AuditService(private val project: Project) {

    @Volatile
    var panel: AuditPanel? = null

    @Volatile
    private var pendingUrl: String? = null

    fun openAndScan(url: String) {
        pendingUrl = url
        val toolWindow = ToolWindowManager.getInstance(project).getToolWindow(TOOL_WINDOW_ID) ?: return
        toolWindow.activate({
            val target = panel
            if (target != null) {
                consumePendingUrl()?.let { target.startScan(it) }
            }
        }, true)
    }

    fun consumePendingUrl(): String? {
        val url = pendingUrl
        pendingUrl = null
        return url
    }

    companion object {
        const val TOOL_WINDOW_ID = "AgentReady Audit"

        fun getInstance(project: Project): AuditService = project.getService(AuditService::class.java)
    }
}
