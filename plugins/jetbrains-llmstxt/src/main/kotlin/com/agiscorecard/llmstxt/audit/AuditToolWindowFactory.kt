package com.agiscorecard.llmstxt.audit

import com.agiscorecard.llmstxt.settings.LlmsTxtSettings
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.openapi.progress.Task
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.ColoredListCellRenderer
import com.intellij.ui.JBColor
import com.intellij.ui.SimpleTextAttributes
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.components.JBTextField
import com.intellij.ui.content.ContentFactory
import com.intellij.util.io.HttpRequests
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.io.IOException
import javax.swing.DefaultListModel
import javax.swing.JButton
import javax.swing.JList
import javax.swing.JPanel

class AuditToolWindowFactory : ToolWindowFactory {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = AuditPanel(project)
        val service = AuditService.getInstance(project)
        service.panel = panel
        val content = ContentFactory.getInstance().createContent(panel, "", false)
        toolWindow.contentManager.addContent(content)
        // A scan may have been requested before the content existed (first activation).
        service.consumePendingUrl()?.let { panel.startScan(it) }
    }
}

class AuditPanel(private val project: Project) : JPanel(BorderLayout()) {

    private val urlField = JBTextField()
    private val scanButton = JButton("Audit")
    private val statusLabel = JBLabel("Enter a site URL and press Audit.")
    private val listModel = DefaultListModel<AuditCheck>()
    private val checkList = JBList(listModel)

    @Volatile
    private var scanning = false

    init {
        urlField.text = LlmsTxtSettings.getInstance().defaultDomain
        urlField.emptyText.setText("https://your-store.com")

        val top = JPanel(BorderLayout(JBUI.scale(4), 0))
        top.border = JBUI.Borders.empty(4)
        top.add(urlField, BorderLayout.CENTER)
        top.add(scanButton, BorderLayout.EAST)

        checkList.cellRenderer = AuditCheckRenderer()
        checkList.emptyText.setText("No audit yet")

        statusLabel.border = JBUI.Borders.empty(4)

        add(top, BorderLayout.NORTH)
        add(JBScrollPane(checkList), BorderLayout.CENTER)
        add(statusLabel, BorderLayout.SOUTH)

        scanButton.addActionListener { startScan(urlField.text.trim()) }
        urlField.addActionListener { startScan(urlField.text.trim()) }
    }

    /** Must be called on the EDT. */
    fun startScan(url: String) {
        if (url.isBlank()) {
            statusLabel.text = "Enter a URL first."
            return
        }
        if (scanning) return
        scanning = true
        scanButton.isEnabled = false
        urlField.text = url
        listModel.clear()
        statusLabel.text = "Scanning $url…"

        object : Task.Backgroundable(project, "Auditing site with AgentReady", true) {
            private var report: AuditReport? = null
            private var failure: String? = null

            override fun run(indicator: ProgressIndicator) {
                try {
                    report = AgentReadyClient.scan(url, indicator)
                } catch (e: HttpRequests.HttpStatusException) {
                    failure = "Scanner rejected the request (HTTP ${e.statusCode}) — check the URL."
                } catch (e: IOException) {
                    failure = "Could not reach the AgentReady scanner (offline?): ${e.message}"
                } catch (e: RuntimeException) {
                    failure = "Unexpected response from the scanner: ${e.message}"
                }
            }

            override fun onSuccess() {
                val result = report
                if (result == null) {
                    statusLabel.text = failure ?: "Scan failed."
                    return
                }
                for (check in result.checks) listModel.addElement(check)
                statusLabel.text =
                    "${result.url} — score ${result.score}/100 (grade ${result.grade}). ${result.summary}"
            }

            override fun onThrowable(error: Throwable) {
                statusLabel.text = "Scan failed: ${error.message}"
            }

            override fun onFinished() {
                scanning = false
                scanButton.isEnabled = true
            }
        }.queue()
    }
}

private class AuditCheckRenderer : ColoredListCellRenderer<AuditCheck>() {
    override fun customizeCellRenderer(
        list: JList<out AuditCheck>,
        value: AuditCheck?,
        index: Int,
        selected: Boolean,
        hasFocus: Boolean,
    ) {
        val check = value ?: return
        val (label, color) = when (check.status) {
            "pass" -> "PASS" to PASS_COLOR
            "fail" -> "FAIL" to FAIL_COLOR
            else -> "WARN" to WARN_COLOR
        }
        append("$label ", SimpleTextAttributes(SimpleTextAttributes.STYLE_BOLD, color))
        append(check.title, SimpleTextAttributes.REGULAR_ATTRIBUTES)
        append("  ${check.earned}/${check.possible}", SimpleTextAttributes.GRAYED_BOLD_ATTRIBUTES)
        if (check.detail.isNotEmpty()) {
            append("  ${check.detail}", SimpleTextAttributes.GRAYED_ATTRIBUTES)
        }
    }

    companion object {
        private val PASS_COLOR = JBColor(0x1A9E6E, 0x54B57F)
        private val WARN_COLOR = JBColor(0xC58A00, 0xD8A72C)
        private val FAIL_COLOR = JBColor(0xD23F4C, 0xE06C75)
    }
}
