package com.agiscorecard.llmstxt.audit

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.intellij.openapi.progress.ProgressIndicator
import com.intellij.util.io.HttpRequests
import java.io.IOException
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

data class AuditCheck(
    val id: String,
    val category: String,
    val title: String,
    val earned: Int,
    val possible: Int,
    val status: String, // "pass" | "warn" | "fail"
    val detail: String,
    val fix: String?,
)

data class AuditReport(
    val url: String,
    val score: Int,
    val grade: String,
    val summary: String,
    val checks: List<AuditCheck>,
)

/**
 * Thin client for the free AgentReady scanner
 * (GET https://agentready.agiscorecard.com/api/scan?url=…). This is the plugin's
 * only network call, and it runs solely when the user explicitly starts an audit.
 */
object AgentReadyClient {
    private const val ENDPOINT = "https://agentready.agiscorecard.com/api/scan"

    @Throws(IOException::class)
    fun scan(rawUrl: String, indicator: ProgressIndicator?): AuditReport {
        val requestUrl = ENDPOINT + "?url=" + URLEncoder.encode(rawUrl, StandardCharsets.UTF_8)
        val body = HttpRequests.request(requestUrl)
            .productNameAsUserAgent()
            .connectTimeout(15_000)
            .readTimeout(45_000)
            .tuner { connection -> connection.setRequestProperty("Accept", "application/json") }
            .readString(indicator)
        return parse(body)
    }

    @Throws(IOException::class)
    fun parse(body: String): AuditReport {
        val root = JsonParser.parseString(body).asJsonObject
        if (root.has("error") && !root.get("error").isJsonNull) {
            throw IOException(root.get("error").asString)
        }
        val checks = ArrayList<AuditCheck>()
        val array = if (root.has("checks") && root.get("checks").isJsonArray) root.getAsJsonArray("checks") else null
        if (array != null) {
            for (element in array) {
                if (!element.isJsonObject) continue
                val obj = element.asJsonObject
                checks.add(
                    AuditCheck(
                        id = str(obj, "id"),
                        category = str(obj, "category"),
                        title = str(obj, "title"),
                        earned = int(obj, "earned"),
                        possible = int(obj, "possible"),
                        status = str(obj, "status").ifEmpty { "warn" },
                        detail = str(obj, "detail"),
                        fix = optStr(obj, "fix"),
                    ),
                )
            }
        }
        return AuditReport(
            url = str(root, "url"),
            score = int(root, "score"),
            grade = str(root, "grade").ifEmpty { "?" },
            summary = str(root, "summary"),
            checks = checks,
        )
    }

    private fun str(obj: JsonObject, key: String): String = optStr(obj, key) ?: ""

    private fun optStr(obj: JsonObject, key: String): String? {
        val value = if (obj.has(key)) obj.get(key) else return null
        if (value.isJsonNull) return null
        return try {
            value.asString
        } catch (_: UnsupportedOperationException) {
            value.toString()
        }
    }

    private fun int(obj: JsonObject, key: String): Int {
        val value = if (obj.has(key)) obj.get(key) else return 0
        if (value.isJsonNull) return 0
        return try {
            value.asInt
        } catch (_: RuntimeException) {
            0
        }
    }
}
