package se.lobbamannen.nexushub.app

import org.json.JSONObject

/** Shared closed contract; unknown properties are discarded, invalid known values reject the event. */
class TelemetryPolicy(private val schema:JSONObject) {
    fun sanitize(name:String,properties:JSONObject):Map<String,Any>? {
        val fields=schema.optJSONObject(name) ?: return null
        val clean=linkedMapOf<String,Any>()
        for(key in fields.keys()) {
            if(!properties.has(key))continue
            val value=properties.get(key);val allowed=fields.get(key)
            if(allowed=="boolean") {if(value !is Boolean)return null}
            else {val choices=fields.getJSONArray(key);if(value !is String || (0 until choices.length()).none {choices.getString(it)==value})return null}
            clean[key]=value
        }
        return clean
    }
    companion object {
        fun files(n:Int)=when {n<=0->"0";n<=10->"1to10";n<=100->"11to100";n<=1000->"101to1000";else->"over1000"}
    }
}
