package se.lobbamannen.nexushub.app

import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import java.util.concurrent.TimeUnit

class BackgroundIntakeFailure(message:String,val status:Int=503):Exception(message)

internal fun interface BackgroundIntakeTransport {
    fun request(path:String,method:String,body:JSONObject?):String
}

/** Fixed repository/scope; credentials never cross the bridge or enter job files. */
private class BackgroundIntakeHttp(private val token:String):BackgroundIntakeTransport {
    companion object {
        private val client=OkHttpClient.Builder().connectTimeout(20,TimeUnit.SECONDS).readTimeout(120,TimeUnit.SECONDS)
            .callTimeout(150,TimeUnit.SECONDS).followRedirects(false).followSslRedirects(false).retryOnConnectionFailure(false).build()
    }
    override fun request(path:String,method:String,body:JSONObject?):String {
        require(path.startsWith("/")&&!path.contains("\r")&&!path.contains("\n"))
        if(token.isBlank())throw BackgroundIntakeFailure("GitHub-token saknas. Öppna appen och kontrollera anslutningen.",401)
        val request=Request.Builder().url("https://api.github.com/repos/lobbamannen/Databas$path")
            .header("Authorization","Bearer $token").header("Accept","application/vnd.github+json")
            .header("User-Agent","NexusHub-Android").header("X-GitHub-Api-Version","2022-11-28")
            .method(method,body?.toString()?.toRequestBody("application/json; charset=utf-8".toMediaType())).build()
        client.newCall(request).execute().use {response->
            val code=if(response.code==403&&(response.header("X-RateLimit-Remaining")=="0"||response.header("Retry-After")!=null))429 else response.code
            if(code !in 200..299)throw BackgroundIntakeFailure(when(code){401->"GitHub-token är ogiltig eller har gått ut.";403,429->"GitHub nekade åtkomst eller anropsgränsen är nådd.";409,422->"GitHub ändrades under uppladdningen. Ingen ändring tvingas igenom.";else->"GitHub svarade med fel $code."},code)
            return response.body?.string()?:throw BackgroundIntakeFailure("GitHub returnerade ett tomt svar.")
        }
    }
}

class BackgroundIntakeGitHub internal constructor(private val transport:BackgroundIntakeTransport) {
    constructor(token:String):this(BackgroundIntakeHttp(token))
    private data class Snapshot(val head:String,val base:String,val entries:List<JSONObject>)
    private fun request(path:String,method:String="GET",body:JSONObject?=null)=transport.request(path,method,body)
    private fun state():Snapshot {
        val head=JSONObject(request("/git/ref/heads/main")).getJSONObject("object").getString("sha");require(BackgroundIntakeProtocol.sha.matches(head))
        val commit=JSONObject(request("/git/commits/$head"));val tree=JSONObject(request("/git/trees/$head?recursive=1"));require(!tree.optBoolean("truncated")){"GitHub returnerade en ofullständig inventering."}
        val rows=tree.getJSONArray("tree");return Snapshot(head,commit.getJSONObject("tree").getString("sha"),(0 until rows.length()).map{rows.getJSONObject(it)}.filter{it.optString("type")=="blob"})
    }
    private fun present(s:Snapshot,entries:List<BackgroundIntakeProtocol.Entry>,prefix:String):Boolean {
        val current=s.entries.filter{it.getString("path").startsWith(prefix)}
        if(current.isEmpty())return false
        if(current.size!=entries.size||entries.any{e->current.none{it.getString("path")==e.path&&it.getString("sha")==e.sha}})throw BackgroundIntakeFailure("Mottagningsposten har ändrats i GitHub. Originalet behålls; granska konflikten.",409)
        return true
    }
    private fun receipt(s:Snapshot,entries:List<BackgroundIntakeProtocol.Entry>,commit:String=s.head)=JSONObject().put("entries",JSONArray(entries.map{JSONObject().put("path",it.path).put("sha",it.sha)})).put("manifestSha",entries.last().sha).put("commit",commit)
    private fun history(path:String):Boolean {val rows=JSONArray(request("/commits?path="+URLEncoder.encode(path,"UTF-8")+"&per_page=1"));return rows.length()>0}
    fun upload(input:JSONObject,shouldCancel:()->Boolean={false}):JSONObject {
        fun continuing(){if(shouldCancel())throw BackgroundIntakeFailure("Bakgrundsuppladdningen har avbrutits.",499)}
        continuing()
        val id=input.getString("id");require(BackgroundIntakeProtocol.uuid.matches(id));val s=state()
        val prefix=if(s.entries.any{it.getString("path").startsWith(BackgroundIntakeProtocol.root+id+"/")})BackgroundIntakeProtocol.root+id+"/" else if(s.entries.any{it.getString("path").startsWith(BackgroundIntakeProtocol.legacy+id+"/")})BackgroundIntakeProtocol.legacy+id+"/" else BackgroundIntakeProtocol.root+id+"/"
        val entries=BackgroundIntakeProtocol.prepare(input,prefix)
        if(present(s,entries,prefix))return receipt(s,entries)
        // Check both names used by historical releases: a lost reply followed by deletion is final.
        if(history(prefix+"metadata.json")||history(BackgroundIntakeProtocol.legacy+id+"/metadata.json"))return JSONObject().put("deleted",true)
        val originalHashes=entries.filter{!it.path.endsWith("/metadata.json")&&!it.path.endsWith("/delad-text.txt")}.map{it.sha}.toSet()
        if(s.entries.any{val p=it.getString("path");(p.startsWith(BackgroundIntakeProtocol.root)||p.startsWith(BackgroundIntakeProtocol.legacy))&&!p.startsWith(prefix)&&!p.endsWith("/metadata.json")&&it.getString("sha") in originalHashes})throw BackgroundIntakeFailure("Identiskt dokument finns redan i NexusHub inkorg. Originalet finns kvar lokalt; ingen extra GitHub-kopia skapades.",409)
        val tree=JSONArray()
        for(entry in entries){continuing();val blob=JSONObject(request("/git/blobs","POST",JSONObject().put("content",Base64.encodeToString(entry.bytes,Base64.NO_WRAP)).put("encoding","base64")));require(blob.getString("sha")==entry.sha){"GitHub bekräftade inte filens bytes."};tree.put(JSONObject().put("path",entry.path).put("mode","100644").put("type","blob").put("sha",entry.sha))}
        continuing()
        val treeSha=JSONObject(request("/git/trees","POST",JSONObject().put("base_tree",s.base).put("tree",tree))).getString("sha")
        val commit=JSONObject(request("/git/commits","POST",JSONObject().put("message","NexusHub: mottaget tillfälligt material").put("tree",treeSha).put("parents",JSONArray().put(s.head)))).getString("sha")
        require(BackgroundIntakeProtocol.sha.matches(commit));continuing();request("/git/refs/heads/main","PATCH",JSONObject().put("sha",commit).put("force",false))
        val after=state();if(!present(after,entries,prefix)){
            // A concurrent explicit deletion must not be mistaken for an uncommitted upload.
            if(history(prefix+"metadata.json"))return JSONObject().put("deleted",true)
            throw BackgroundIntakeFailure("Mottagningskopian kunde inte återläsas.")
        }
        return receipt(after,entries,commit)
    }
}
