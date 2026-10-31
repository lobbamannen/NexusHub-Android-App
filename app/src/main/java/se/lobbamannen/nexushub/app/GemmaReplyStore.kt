package se.lobbamannen.nexushub.app

import android.content.Context
import org.json.JSONObject

/** Persist the final reply before any Activity/WebView notification. */
internal object GemmaReplyStore {
    private const val FILE = "gemma-reply-v1"
    private fun prefs(context: Context) = context.getSharedPreferences(FILE, Context.MODE_PRIVATE)
    @Synchronized fun begin(context: Context, id: String) {
        check(prefs(context).edit().putString("id", id).putString("status", "running")
            .remove("reply").commit()) { "Gemma-begäran kunde inte journalföras." }
    }
    @Synchronized fun complete(context: Context, id: String, answer: JSONObject) {
        if (prefs(context).getString("id", "") != id) return
        check(prefs(context).edit().putString("status", "finished")
            .putString("reply", answer.toString()).commit()) { "Gemmas svar kunde inte lagras." }
    }
    @Synchronized fun latest(context: Context): JSONObject {
        val p = prefs(context)
        val id = p.getString("id", "").orEmpty()
        if (id.isBlank()) return JSONObject()
        var status = p.getString("status", "interrupted").orEmpty()
        if (status == "running" && !ModelRunCoordinator.gemmaPending(id)) {
            status = "interrupted"
            p.edit().putString("status", status).commit()
        }
        return JSONObject().put("requestId", id).put("status", status).apply {
            if (status == "finished") {
                val raw = p.getString("reply", null)
                if (!raw.isNullOrBlank()) put("reply", JSONObject(raw))
            }
        }
    }
}
