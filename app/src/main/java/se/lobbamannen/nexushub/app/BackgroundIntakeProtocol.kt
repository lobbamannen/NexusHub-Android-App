package se.lobbamannen.nexushub.app

import android.util.Base64
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.io.File
import java.text.Normalizer
import java.time.Instant

/** Byte-compatible with lib/shared-incoming.mjs; hashes identify bytes, not user intent. */
object BackgroundIntakeProtocol {
    val uuid=Regex("^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$")
    val sha=Regex("^[a-f0-9]{40}$")
    const val root="NexusHub inkorg/"
    const val legacy="Mottagningsinkorg/"
    data class Entry(val path:String,val bytes:ByteArray){val sha:String get()=hash(bytes)}
    fun hash(bytes:ByteArray):String {val digest=MessageDigest.getInstance("SHA-1");digest.update("blob ${bytes.size}\u0000".toByteArray(Charsets.UTF_8));return digest.digest(bytes).joinToString(""){"%02x".format(it.toInt() and 255)}}
    /** File-backed entries are streamed: do not materialize large originals as ByteArrays. */
    data class FileEntry(val path:String,val sha:String,val source:File?=null,val bytes:ByteArray?=null)
    fun hashFile(file:File):String {
        require(file.isFile&&file.length()<=64L*1024*1024) { "Den lokala filen saknas eller är för stor." }
        val digest=MessageDigest.getInstance("SHA-1")
        digest.update("blob ${file.length()}\u0000".toByteArray(Charsets.UTF_8))
        file.inputStream().use { input ->
            val buffer=ByteArray(64*1024)
            while(true) { val n=input.read(buffer);if(n<0)break;if(n>0)digest.update(buffer,0,n) }
        }
        return digest.digest().joinToString(""){"%02x".format(it.toInt() and 255)}
    }
    /** Same metadata layout and SHA as prepare(), but file bodies remain in durable native storage. */
    fun prepareLocal(input:JSONObject,dir:File,prefix:String=root+input.optString("id")+"/"):List<FileEntry> {
        val id=input.getString("id");require(uuid.matches(id));require(prefix==root+id+"/"||prefix==legacy+id+"/")
        val text=input.getString("text");val created=input.getString("createdAt");Instant.parse(created)
        require(!input.has("sourceLabel")||input.opt("sourceLabel") is String)
        val source=jsTrim(input.optString("sourceLabel"));require(source.length<=120&&!source.any{it.code<32||it.code==127})
        val files=input.getJSONArray("files");require(files.length()>0||jsTrim(text).isNotEmpty());require(files.length()<=1000)
        val entries=mutableListOf<FileEntry>();val metadataFiles=mutableListOf<Any>();val ids=mutableSetOf<String>()
        for(i in 0 until files.length()){
            val f=files.getJSONObject(i);val fid=f.getString("id")
            require(uuid.matches(fid)&&ids.add(fid))
            val fname=f.getString("name");val mime=f.getString("mime")
            require(fname.length<=10000&&mime.length<=300)
            val file=File(dir,fid);val actual=hashFile(file)
            require(!f.has("sha")||f.isNull("sha")||f.getString("sha")==actual){"Originalfilens kontrollsumma avviker."}
            val target=prefix+fid+"-"+name(fname)
            entries.add(FileEntry(target,actual,source=file))
            metadataFiles.add(linkedMapOf("id" to fid,"name" to fname,"mime" to mime,"path" to target,"sha" to actual))
        }
        if(jsTrim(text).isNotEmpty()) {
            val bytes=utf8(text);entries.add(FileEntry(prefix+"delad-text.txt",hash(bytes),bytes=bytes))
        }
        val metadata=linkedMapOf<String,Any>("schemaVersion" to 1)
        if(source.isNotBlank())metadata["sourceLabel"]=source
        metadata["id"]=id;metadata["text"]=text;metadata["createdAt"]=created;metadata["files"]=metadataFiles
        val bytes=(pretty(metadata)+"\n").toByteArray(Charsets.UTF_8)
        entries.add(FileEntry(prefix+"metadata.json",hash(bytes),bytes=bytes))
        return entries
    }
    private fun utf8(value:String):ByteArray {
        val clean=buildString {value.forEachIndexed {i,c->
            val unpaired=Character.isHighSurrogate(c)&&(i+1>=value.length||!Character.isLowSurrogate(value[i+1]))||Character.isLowSurrogate(c)&&(i==0||!Character.isHighSurrogate(value[i-1]))
            append(if(unpaired)'\ufffd' else c)
        }}
        return clean.toByteArray(Charsets.UTF_8)
    }
    private fun jsSpace(c:Char)=c.code in 9..13||c.code in setOf(0x20,0xa0,0x1680,0x2028,0x2029,0x202f,0x205f,0x3000,0xfeff)||c.code in 0x2000..0x200a
    private fun jsTrim(value:String)=value.trim{jsSpace(it)}
    fun name(value:String)=Normalizer.normalize(value,Normalizer.Form.NFC).map{if(it=='/'||it=='\\'||it.code<32||it.code==127)'_' else it}.joinToString("").trimStart('.').takeLast(140).ifEmpty{"dokument"}
    private fun quote(s:String):String=buildString {
        append('"')
        s.forEachIndexed {index,c->
            when(c){
                '"'->append("\\\"");'\\'->append("\\\\");'\b'->append("\\b");'\u000c'->append("\\f");'\n'->append("\\n");'\r'->append("\\r");'\t'->append("\\t")
                else->{
                    val unpaired=Character.isHighSurrogate(c)&&(index+1>=s.length||!Character.isLowSurrogate(s[index+1]))||Character.isLowSurrogate(c)&&(index==0||!Character.isHighSurrogate(s[index-1]))
                    if(c.code<32||unpaired)append("\\u%04x".format(c.code))else append(c)
                }
            }
        }
        append('"')
    }
    /** Javascript JSON.stringify(value,null,2), including compact empty arrays/objects. */
    private fun pretty(value:Any?,depth:Int=0):String {
        val pad="  ".repeat(depth);val next="  ".repeat(depth+1)
        return when(value){
            null,JSONObject.NULL->"null"
            is String->quote(value)
            is Map<*,*>->if(value.isEmpty())"{}" else value.entries.joinToString(",\n","{\n","\n$pad}"){next+quote(it.key.toString())+": "+pretty(it.value,depth+1)}
            is List<*>->if(value.isEmpty())"[]" else value.joinToString(",\n","[\n","\n$pad]"){next+pretty(it,depth+1)}
            else->value.toString()
        }
    }
    fun prepare(input:JSONObject,prefix:String=root+input.optString("id")+"/"):List<Entry> {
        val id=input.getString("id");require(uuid.matches(id));require(prefix==root+id+"/"||prefix==legacy+id+"/")
        val text=input.getString("text");val created=input.getString("createdAt");Instant.parse(created)
        require(!input.has("sourceLabel")||input.opt("sourceLabel") is String);val source=jsTrim(input.optString("sourceLabel"));require(source.length<=120&&!source.any{it.code<32||it.code==127})
        val files=input.getJSONArray("files");require(files.length()>0||jsTrim(text).isNotEmpty());require(files.length()<=1000)
        val entries=mutableListOf<Entry>();val metadataFiles=mutableListOf<Any>();val ids=mutableSetOf<String>()
        for(i in 0 until files.length()){
            val f=files.getJSONObject(i);val fid=f.getString("id");require(uuid.matches(fid)&&ids.add(fid));val fname=f.getString("name");val mime=f.getString("mime")
            require(fname.length<=10000&&mime.length<=300);val bytes=Base64.decode(f.getString("base64"),Base64.DEFAULT);require(bytes.size<=64*1024*1024)
            val entry=Entry(prefix+fid+"-"+name(fname),bytes);require(!f.has("sha")||f.isNull("sha")||f.optString("sha")==entry.sha)
            entries.add(entry);metadataFiles.add(linkedMapOf("id" to fid,"name" to fname,"mime" to mime,"path" to entry.path,"sha" to entry.sha))
        }
        if(jsTrim(text).isNotEmpty())entries.add(Entry(prefix+"delad-text.txt",utf8(text)))
        val metadata=linkedMapOf<String,Any>("schemaVersion" to 1);if(source.isNotBlank())metadata["sourceLabel"]=source
        metadata["id"]=id;metadata["text"]=text;metadata["createdAt"]=created;metadata["files"]=metadataFiles
        entries.add(Entry(prefix+"metadata.json",(pretty(metadata)+"\n").toByteArray(Charsets.UTF_8)));return entries
    }
}
