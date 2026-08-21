package com.agiscorecard.llmstxt.settings

import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.components.PersistentStateComponent
import com.intellij.openapi.components.Service
import com.intellij.openapi.components.State
import com.intellij.openapi.components.Storage

/** Application-level persisted settings (light service; no plugin.xml registration needed). */
@State(name = "LlmsTxtAgentsSettings", storages = [Storage("llmstxt-agents.xml")])
@Service(Service.Level.APP)
class LlmsTxtSettings : PersistentStateComponent<LlmsTxtSettings.State> {

    class State {
        var defaultDomain: String = ""
    }

    private var myState = State()

    override fun getState(): State = myState

    override fun loadState(state: State) {
        myState = state
    }

    /** Default site domain, e.g. "https://www.example.com". Empty when unset. */
    var defaultDomain: String
        get() = myState.defaultDomain
        set(value) {
            myState.defaultDomain = value
        }

    companion object {
        fun getInstance(): LlmsTxtSettings =
            ApplicationManager.getApplication().getService(LlmsTxtSettings::class.java)
    }
}
