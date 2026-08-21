package com.agiscorecard.llmstxt.actions

import com.agiscorecard.llmstxt.settings.LlmsTxtSettings
import com.agiscorecard.llmstxt.templates.LlmsTxtTemplates
import com.intellij.openapi.actionSystem.ActionUpdateThread
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.CommonDataKeys
import com.intellij.openapi.command.WriteCommandAction
import com.intellij.openapi.fileEditor.FileEditorManager
import com.intellij.openapi.project.Project
import com.intellij.openapi.project.guessProjectDir
import com.intellij.openapi.ui.Messages
import com.intellij.openapi.vfs.VfsUtil
import com.intellij.openapi.vfs.VirtualFile
import java.io.IOException

/**
 * Creates [fileName] from a template in the context directory (project-view selection)
 * or the project root, then opens it. If the file already exists it is just opened.
 */
abstract class ScaffoldFileActionBase(private val fileName: String) : AnAction() {

    protected abstract fun template(project: Project, domain: String): String

    override fun getActionUpdateThread(): ActionUpdateThread = ActionUpdateThread.BGT

    override fun update(e: AnActionEvent) {
        e.presentation.isEnabledAndVisible = e.project != null
    }

    override fun actionPerformed(e: AnActionEvent) {
        val project = e.project ?: return
        val contextFile = e.getData(CommonDataKeys.VIRTUAL_FILE)
        val dir: VirtualFile? = when {
            contextFile != null && contextFile.isDirectory -> contextFile
            contextFile != null -> contextFile.parent
            else -> null
        } ?: project.guessProjectDir()

        if (dir == null) {
            Messages.showErrorDialog(project, "Could not determine a target directory.", "Generate $fileName")
            return
        }

        val existing = dir.findChild(fileName)
        if (existing != null) {
            FileEditorManager.getInstance(project).openFile(existing, true)
            return
        }

        val domain = LlmsTxtSettings.getInstance().defaultDomain.ifBlank { "https://www.example.com" }
        var created: VirtualFile? = null
        try {
            WriteCommandAction.runWriteCommandAction(project) {
                val file = dir.createChildData(this, fileName)
                VfsUtil.saveText(file, template(project, domain))
                created = file
            }
        } catch (ex: IOException) {
            Messages.showErrorDialog(project, "Could not create $fileName: ${ex.message}", "Generate $fileName")
            return
        }
        created?.let { FileEditorManager.getInstance(project).openFile(it, true) }
    }
}

class GenerateLlmsTxtAction : ScaffoldFileActionBase("llms.txt") {
    override fun template(project: Project, domain: String): String =
        LlmsTxtTemplates.llmsTxt(project.name, domain)
}

class GenerateAgentsMdAction : ScaffoldFileActionBase("agents.md") {
    override fun template(project: Project, domain: String): String =
        LlmsTxtTemplates.agentsMd(project.name, domain)
}
