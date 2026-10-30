package se.lobbamannen.nexushub.app

import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.res.Configuration
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.view.ViewGroup
import android.view.WindowInsets
import android.webkit.*
import android.widget.FrameLayout
import android.widget.Toast
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.File
import java.net.URLConnection
import java.util.concurrent.Executors

class MainActivity : Activity() {
    companion object {
        private const val HOST = "appassets.androidplatform.net"
        private const val HOME = "https://appassets.androidplatform.net/index.html"
        private const val PICK_MODEL = 1003
        private const val PICK_FILE = 1001
        private const val SAVE_FILE = 1002
        private const val MAX_FILE_BYTES = 64 * 1024 * 1024
        private const val PENDING_SAVE_PATH = "nexushub.pendingSave.path"
        private const val PENDING_SAVE_NAME = "nexushub.pendingSave.name"
    }
    private lateinit var webView: WebView
    private lateinit var nexusMessages: NexusMessageBridge
    private var pendingSeries: String? = null
    private var pendingDestination: String? = null
    private lateinit var incomingShares: IncomingShareStore
    private lateinit var credentials: GithubCredentialStore
    private var fileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingSave: File? = null
    private var backCallback: OnBackInvokedCallback? = null
    private val io = Executors.newSingleThreadExecutor()
    @Volatile private var trustedDocument = false
    @Volatile private var pendingIncomingOpen = false

    private fun isLocal(uri: Uri): Boolean = uri.scheme == "https" && uri.host == HOST &&
        (uri.port == -1 || uri.port == 443) && uri.userInfo == null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        credentials = GithubCredentialStore(applicationContext)
        io.execute { try { IntelligenceJobs.reconcile(applicationContext) } catch (_: Exception) { } }
        incomingShares = IncomingShareStore(applicationContext)
        pendingSave = restorePendingSave(savedInstanceState)
        val root = FrameLayout(this)
        webView = WebView(this)
        webView.setBackgroundColor(android.graphics.Color.rgb(9, 8, 17))
        webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false)
        root.addView(webView, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(root)
        applySystemBars()
        if (Build.VERSION.SDK_INT >= 35) {
            root.setOnApplyWindowInsetsListener { view, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout() or WindowInsets.Type.ime())
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
                insets
            }
            root.requestApplyInsets()
        }
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            javaScriptCanOpenWindowsAutomatically = false
            setSupportMultipleWindows(false)
        }
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, false)
        WebView.setWebContentsDebuggingEnabled((applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0)

        val loader = WebViewAssetLoader.Builder().addPathHandler("/", WebViewAssetLoader.PathHandler { path ->
            val clean = if (path.isEmpty()) "index.html" else path
            if (clean.split('/').any { it == ".." }) return@PathHandler null
            try {
                val mime = when {
                    clean.endsWith(".js") -> "application/javascript"
                    clean.endsWith(".css") -> "text/css"
                    clean.endsWith(".svg") -> "image/svg+xml"
                    clean.endsWith(".json") -> "application/json"
                    clean.endsWith(".wasm") -> "application/wasm"
                    clean.endsWith(".woff2") -> "font/woff2"
                    else -> URLConnection.guessContentTypeFromName(clean) ?: "application/octet-stream"
                }
                WebResourceResponse(mime, "UTF-8", 200, "OK", mapOf(
                    // JavascriptInterface is visible to frames: remote frames must never be allowed.
                    "Content-Security-Policy" to "script-src 'self' 'wasm-unsafe-eval'; frame-src 'none'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'",
                    "X-Content-Type-Options" to "nosniff"
                ), assets.open("www/$clean"))
            } catch (_: Exception) {
                WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", emptyMap(), ByteArrayInputStream(ByteArray(0)))
            }
        }).build()
        webView.addJavascriptInterface(NativeBridge(), "Android")
        nexusMessages = NexusMessageBridge(this, webView)
        nexusMessages.install()
        pendingDestination = destinationForIntent(intent)
        pendingSeries = intent.getStringExtra("nexus.series")?.take(200)
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (isLocal(request.url)) return false
                if (request.isForMainFrame) openExternal(request.url)
                return true
            }
            override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                trustedDocument = url != null && isLocal(Uri.parse(url))
                if (!trustedDocument) { view.stopLoading(); view.loadUrl(HOME) }
            }
            override fun onPageFinished(view: WebView, url: String?) {
                trustedDocument = url != null && isLocal(Uri.parse(url))
                if (trustedDocument && pendingIncomingOpen) {
                    pendingIncomingOpen = false
                    view.evaluateJavascript("location.hash='mottaget';window.dispatchEvent(new Event('nexus-incoming-changed'));", null)
                }
                if (trustedDocument) {
                    openPendingSeries()
                    openPendingDestination()
                    // Match the original Android wrapper: native insets already reserve
                    // the system navigation area, so the portal must not add it twice.
                    view.evaluateJavascript("""
                        (function() {
                          if (document.getElementById('nexushub-android-nav-spacing')) return;
                          var style = document.createElement('style');
                          style.id = 'nexushub-android-nav-spacing';
                          style.textContent = '@media (max-width: 800px) {' +
                            '.portal-shell .bottom-nav {' +
                            'bottom: 0 !important;' +
                            'padding-bottom: 8px !important;' +
                            'min-height: 0 !important;' +
                            '}' +
                            '.portal-shell main {' +
                            'padding-bottom: 105px !important;' +
                            '}' +
                            '}';
                          document.head.appendChild(style);
                        })();
                    """.trimIndent(), null)
                }
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(view: WebView?, callback: ValueCallback<Array<Uri>>?, params: FileChooserParams?): Boolean {
                if (!trustedDocument || callback == null) return false
                fileCallback?.onReceiveValue(null)
                fileCallback = callback
                val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                    addCategory(Intent.CATEGORY_OPENABLE)
                    type = "*/*"
                    putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params?.mode == FileChooserParams.MODE_OPEN_MULTIPLE)
                }
                return try { startActivityForResult(intent, PICK_FILE); true }
                catch (_: ActivityNotFoundException) { fileCallback?.onReceiveValue(null); fileCallback = null; false }
            }
            override fun onJsAlert(view: WebView?, url: String?, message: String?, result: JsResult): Boolean {
                if (!trustedDocument) { result.cancel(); return true }
                AlertDialog.Builder(this@MainActivity).setMessage(message)
                    .setPositiveButton(android.R.string.ok) { _, _ -> result.confirm() }
                    .setOnCancelListener { result.cancel() }.show()
                return true
            }
            override fun onJsConfirm(view: WebView?, url: String?, message: String?, result: JsResult): Boolean {
                if (!trustedDocument) { result.cancel(); return true }
                AlertDialog.Builder(this@MainActivity).setMessage(message)
                    .setPositiveButton(android.R.string.ok) { _, _ -> result.confirm() }
                    .setNegativeButton(android.R.string.cancel) { _, _ -> result.cancel() }
                    .setOnCancelListener { result.cancel() }.show()
                return true
            }
        }
        webView.setDownloadListener { url, _, disposition, mime, _ ->
            if (trustedDocument) downloadInPage(url, URLUtil.guessFileName(url, disposition, mime), mime ?: "application/octet-stream")
        }
        if (Build.VERSION.SDK_INT >= 33) {
            val callback = OnBackInvokedCallback { navigateBack() }
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, callback)
            backCallback = callback
        }
        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) webView.loadUrl(HOME)
        if (savedInstanceState == null) captureShare(intent)
        pendingSeries = intent.getStringExtra("nexus.series")?.take(200)
        if (trustedDocument) {openPendingSeries();openPendingDestination()}
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        captureShare(intent)
        pendingDestination=destinationForIntent(intent)
        if(trustedDocument)openPendingDestination()
        intent.getStringExtra("nexus.series")?.take(200)?.let { pendingSeries = it; if (trustedDocument) openPendingSeries() }
    }
    private fun destinationForIntent(value: Intent): String? {
        val target=value.getStringExtra("nexus.destination").orEmpty()
        if (Regex("intelligence\\?run=[a-fA-F0-9-]{36}").matches(target))return target
        return se.lobbamannen.nexushub.app.weather.WeatherWidgetProvider.destination(target)
    }
    private fun openPendingDestination(){
        val target=pendingDestination ?: return
        pendingDestination=null;intent.removeExtra("nexus.destination")
        webView.evaluateJavascript("location.hash="+JSONObject.quote(target)+";",null)
    }
    private fun openPendingSeries() {
        val target = pendingSeries ?: return
        pendingSeries = null
        webView.evaluateJavascript("location.hash=" + JSONObject.quote("serier?item=" + Uri.encode(target)) + ";", null)
    }
    override fun onResume() { super.onResume(); NexusTelemetry.foreground(); if (::nexusMessages.isInitialized) nexusMessages.resume() }
    override fun onStop() { NexusTelemetry.background(); if (::nexusMessages.isInitialized) nexusMessages.stop(); super.onStop() }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (::nexusMessages.isInitialized) nexusMessages.permissions(requestCode)
    }
    private fun captureShare(sharedIntent: Intent) {
        if (sharedIntent.action != Intent.ACTION_SEND && sharedIntent.action != Intent.ACTION_SEND_MULTIPLE) return
        io.execute {
            try {
                if (incomingShares.receive(sharedIntent)) { BackgroundIntake.importShares(applicationContext); pendingIncomingOpen = true; runOnUiThread {
                    if (!isFinishing && !isDestroyed) {
                        Toast.makeText(this, "Sparat i NexusHubs mottagningsinkorg", Toast.LENGTH_SHORT).show()
                        if (trustedDocument) { pendingIncomingOpen = false; webView.evaluateJavascript("window.NexusHubIncomingOpen=true;window.dispatchEvent(new Event('nexus-incoming-changed'));window.dispatchEvent(new Event('nexus-native-share'));", null) }
                    }
                } }
            } catch (error: Exception) { runOnUiThread { Toast.makeText(this, "Kunde inte spara delningen: " + error.message, Toast.LENGTH_LONG).show() } }
        }
    }

    private fun activityEvent(action:String,status:String,title:String,details:JSONObject=JSONObject()) {
        try { ActivityJournal(applicationContext).append(JSONObject().put("id",java.util.UUID.randomUUID().toString()).put("at",java.time.Instant.now().toString()).put("category",if(action=="github_credentials_changed")"settings" else "documents").put("action",action).put("status",status).put("source","native").put("title",title).put("details",details)) } catch(_:Exception) { }
    }

    /** Called only from the bundled document; CSP excludes foreign child frames. */
    inner class NativeBridge {
        @JavascriptInterface fun queueIncoming(raw:String):String {
            if(!trustedDocument)return JSONObject().put("error","Otillåtet ursprung").toString()
            return try { require(raw.length<=100*1024*1024);BackgroundIntake.enqueue(applicationContext,JSONObject(raw)).toString() } catch(e:Exception){JSONObject().put("error",e.message?:"Originalet kunde inte säkras för bakgrundssynk.").toString()}
        }
        @JavascriptInterface fun incomingJobs():String = if(trustedDocument)BackgroundIntakeStore(applicationContext).jobs().toString() else "[]"
        @JavascriptInterface fun cancelIncomingJob(id:String):Boolean = trustedDocument && try{BackgroundIntake.cancel(applicationContext,id)}catch(_:Exception){false}
        @JavascriptInterface fun retryIncomingJob(id:String):Boolean = trustedDocument && try{BackgroundIntake.retry(applicationContext,id)}catch(_:Exception){false}
        @JavascriptInterface fun backgroundActive(id:String,active:Boolean):Boolean = trustedDocument && try{ActiveSyncService.active(applicationContext,id,active)}catch(_:Exception){false}
        @JavascriptInterface fun appendActivity(raw:String):Boolean = trustedDocument && try{require(raw.length<=65536);ActivityJournal(applicationContext).append(JSONObject(raw))}catch(_:Exception){false}
        @JavascriptInterface fun activityPage(query:String):String = if(trustedDocument)try{require(query.length<=10000);ActivityJournal(applicationContext).query(JSONObject(query)).toString()}catch(_:Exception){JSONObject().put("error","Aktivitetsloggen kunde inte läsas.").toString()} else "{}"
        @JavascriptInterface fun activityExport():String = if(trustedDocument)try{ActivityJournal(applicationContext).export()}catch(_:Exception){""} else ""
        @JavascriptInterface fun listIncoming(): String = if (trustedDocument) incomingShares.list() else "[]"
        @JavascriptInterface fun readIncomingFile(id: String, fileId: String): String = if (trustedDocument) incomingShares.read(id, fileId) else ""
        @JavascriptInterface fun removeIncoming(id: String): Boolean = trustedDocument && incomingShares.remove(id)

        @JavascriptInterface fun intelligenceResourceStatus():String =
            if(trustedDocument)try{IntelligenceResourcePolicy.snapshot(applicationContext).toString()}
            catch(e:Exception){JSONObject().put("error",e.message?:"Sensorer saknas").toString()} else "{}"
        @JavascriptInterface fun intelligenceStatus():String =
            if(trustedDocument)try{IntelligenceRuntime.get(applicationContext).status().toString()}
            catch(e:Exception){JSONObject().put("error",e.message).toString()} else "{}"
        @JavascriptInterface fun intelligenceIndexStatus():String =
            if(trustedDocument)try{IntelligenceIndexStore(applicationContext).status().toString()}catch(_:Exception){"{}"} else "{}"
        @JavascriptInterface fun intelligenceIndexBegin(commit:String):String =
            if(trustedDocument)try{IntelligenceIndexStore(applicationContext).begin(commit).toString()}
            catch(e:Exception){JSONObject().put("error",e.message).toString()} else "{}"
        @JavascriptInterface fun intelligenceIndexUpsert(raw:String):Boolean =
            trustedDocument && try {
                require(raw.length<=200000)
                val x=JSONObject(raw)
                IntelligenceIndexStore(applicationContext).upsert(x.getString("commit"),
                    x.getString("path"),x.getString("sha"),x.getString("title"),x.getString("body"))
            } catch(_:Exception){false}
        @JavascriptInterface fun intelligenceIndexFinish(commit:String,count:Int):String =
            if(trustedDocument)try{
                val result=IntelligenceIndexStore(applicationContext).finish(commit,count)
                try { IntelligenceJobs.indexCompleted(applicationContext,commit,result) } catch (_:Exception) { }
                IntelligenceJobs.resumeIndexWaiters(applicationContext)
                result.toString()
            }
            catch(e:Exception){JSONObject().put("error",e.message).toString()} else "{}"
        @JavascriptInterface fun intelligenceRunsPage(offset:Int,limit:Int):String =
            if(trustedDocument)try{IntelligenceRunStore(applicationContext).list(limit,offset).toString()}
            catch(e:Exception){JSONObject().put("error",e.message?:"Historik kunde inte läsas").toString()} else "[]"
        @JavascriptInterface fun intelligenceRunCounts():String =
            if(trustedDocument)try{IntelligenceRunStore(applicationContext).counts().toString()}
            catch(_:Exception){"{}"} else "{}"
        @JavascriptInterface fun intelligenceRuns():String =
            if(trustedDocument)try{IntelligenceRunStore(applicationContext).list().toString()}
            catch(_:Exception){"[]"} else "[]"
        @JavascriptInterface fun intelligenceSearchDocuments(query:String):String =
            if(trustedDocument)try{
                require(query.length in 2..120)
                val terms=query.split(Regex("\\s+")).filter{it.isNotBlank()}.take(8)
                IntelligenceIndexStore(applicationContext).search(terms,12).toString()
            }catch(e:Exception){JSONObject().put("error",e.message?:"Sökningen misslyckades").toString()} else "[]"
        @JavascriptInterface fun intelligenceAnalyzeDocument(path:String):String =
            if(trustedDocument)try{IntelligenceJobs.document(applicationContext,path).toString()}
            catch(e:Exception){JSONObject().put("error",e.message?:"Dokumentanalysen kunde inte starta").toString()} else "{}"
        @JavascriptInterface fun intelligencePendingReviews():String =
            if(trustedDocument)try{IntelligenceReviewStore(applicationContext).pending().toString()}
            catch(e:Exception){JSONObject().put("error",e.message?:"Kön kunde inte läsas").toString()} else "[]"
        @JavascriptInterface fun intelligenceReviews(id:String):String =
            if(trustedDocument)try{IntelligenceReviewStore(applicationContext).list(id).toString()}
            catch(e:Exception){JSONObject().put("error",e.message?:"Beslut kunde inte läsas").toString()} else "[]"
        @JavascriptInterface fun intelligenceReview(id:String,index:Int,decision:String):String =
            if(trustedDocument)try{IntelligenceReviewStore(applicationContext).decide(id,index,decision).toString()}
            catch(e:Exception){JSONObject().put("error",e.message?:"Beslutet kunde inte sparas").toString()} else "{}"
        @JavascriptInterface fun intelligenceRecordPublication(raw:String):String =
            if(trustedDocument)try{
                require(raw.length<=4096)
                val x=JSONObject(raw)
                IntelligenceReviewStore(applicationContext).recordPublication(
                    x.getString("runId"),x.getInt("proposalIndex"),x.getString("proposalHash"),
                    x.getString("registrySha"),x.getString("registryCommit")).toString()
            }catch(e:Exception){JSONObject().put("error",e.message?:"Publiceringskvittensen kunde inte sparas").toString()} else "{}"
        @JavascriptInterface fun intelligenceStart(text:String):String =
            if(trustedDocument)try{
                require(text.length in 5..20000)
                IntelligenceJobs.request(applicationContext,text).toString()
            }catch(e:Exception){JSONObject().put("error",e.message?: "Kunde inte starta").toString()} else "{}"
        @JavascriptInterface fun intelligenceQueueIdea(id:String,sha:String,text:String):String =
            if(trustedDocument)try{IntelligenceJobs.idea(applicationContext,id,sha,text).toString()}
            catch(e:Exception){JSONObject().put("error",e.message?:"Analys kunde inte köas").toString()} else "{}"
        @JavascriptInterface fun intelligencePause(id:String):Boolean =
            trustedDocument && try{IntelligenceJobs.pause(applicationContext,id)}catch(_:Exception){false}
        @JavascriptInterface fun intelligenceResume(id:String):Boolean =
            trustedDocument && try{IntelligenceJobs.resume(applicationContext,id)}catch(_:Exception){false}
        @JavascriptInterface fun intelligenceCancel(id:String):Boolean =
            trustedDocument && try{IntelligenceJobs.cancel(applicationContext,id)}catch(_:Exception){false}
        @JavascriptInterface fun intelligenceSaveProfile(raw:String):String =
            if(trustedDocument)try{
                require(raw.length<=16000)
                IntelligenceRuntime.get(applicationContext).saveProfile(JSONObject(raw)).toString()
            }catch(e:Exception){JSONObject().put("error",e.message?: "Felaktiga inställningar").toString()} else "{}"
        @JavascriptInterface fun intelligenceImportModel():Boolean {
            if(!trustedDocument)return false
            runOnUiThread {
                try {
                    startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type="application/octet-stream"
                        putExtra(Intent.EXTRA_MIME_TYPES,arrayOf("application/octet-stream","application/x-gguf","*/*"))
                    },PICK_MODEL)
                } catch(e:ActivityNotFoundException){notifyUser("Androids dokumentväljare saknas")}
            }
            return true
        }
        @JavascriptInterface fun intelligenceDeleteModel():Boolean =
            trustedDocument && try{IntelligenceRuntime.get(applicationContext).delete();true}catch(_:Exception){false}
        @JavascriptInterface fun intelligenceUnloadModel():Boolean =
            trustedDocument && try{IntelligenceRuntime.get(applicationContext).unload();true}catch(_:Exception){false}
        @JavascriptInterface fun getGithubToken(): String = if (trustedDocument) credentials.get() else ""
        @JavascriptInterface fun setGithubToken(token: String): Boolean {
            if(!trustedDocument)return false
            val saved=credentials.set(token)
            if(saved){activityEvent("github_credentials_changed","succeeded","GitHub-anslutningen uppdaterades",JSONObject().put("configured",token.isNotBlank()));BackgroundIntake.resume(applicationContext)}
            return saved
        }
        @JavascriptInterface fun saveFile(name: String, mime: String, base64: String) {
            if (trustedDocument) receiveFile(name, mime, base64, false)
        }
        @JavascriptInterface fun openFile(name: String, mime: String, base64: String) {
            if (trustedDocument) receiveFile(name, mime, base64, true)
        }
    }

    private fun safeName(name: String): String = name.substringAfterLast('/').substringAfterLast('\\')
        .replace(Regex("[\\p{Cntrl}]"), "").take(180).ifBlank { "document" }
    private fun safeMime(mime: String): String = if (mime.matches(Regex("[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+"))) mime else "application/octet-stream"

    private fun receiveFile(name: String, mime: String, encoded: String, open: Boolean) {
        io.execute {
            try {
                val raw = if (encoded.startsWith("data:")) encoded.substringAfter(',') else encoded
                require(raw.length <= MAX_FILE_BYTES * 4L / 3 + 16) { "Filen är för stor (max 64 MB)." }
                val bytes = Base64.decode(raw, Base64.DEFAULT)
                require(bytes.size <= MAX_FILE_BYTES) { "Filen är för stor (max 64 MB)." }
                val dir = File(cacheDir, "exports/${java.util.UUID.randomUUID()}").apply { mkdirs() }
                val file = File(dir, safeName(name)).apply { writeBytes(bytes) }
                runOnUiThread {
                    if (isFinishing || isDestroyed) return@runOnUiThread
                    if (open) openExport(file, safeMime(mime)) else beginSave(file, safeMime(mime))
                }
            } catch (e: Exception) { notifyUser(e.message ?: "Kunde inte läsa filen.") }
        }
    }

    private fun beginSave(file: File, mime: String) {
        if (pendingSave != null) { notifyUser("Slutför den pågående sparningen först."); file.delete(); return }
        pendingSave = file
        try {
            startActivityForResult(Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                addCategory(Intent.CATEGORY_OPENABLE); type = mime; putExtra(Intent.EXTRA_TITLE, file.name)
            }, SAVE_FILE)
        } catch (_: ActivityNotFoundException) { pendingSave = null; file.delete(); notifyUser("Ingen filväljare tillgänglig.") }
    }

    private fun openExport(file: File, mime: String) {
        val uri = FileProvider.getUriForFile(this, "$packageName.files", file)
        val view = Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).apply {
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            clipData = ClipData.newRawUri(file.name, uri)
        }
        try { startActivity(Intent.createChooser(view, "Öppna med")); activityEvent("file_open_external","succeeded",file.name) }
        catch (_: ActivityNotFoundException) {
            val share = Intent(Intent.ACTION_SEND).apply {
                type = mime; putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION); clipData = ClipData.newRawUri(file.name, uri)
            }
            try { startActivity(Intent.createChooser(share, "Dela fil")); activityEvent("file_shared_external","succeeded",file.name) }
            catch (_: ActivityNotFoundException) { notifyUser("Ingen app kan öppna filen.") }
        }
    }

    private fun downloadInPage(url: String, name: String, mime: String) {
        // Blob URLs remain inside their originating WebView. Authenticated originals are
        // fetched by the web repository layer and passed to saveFile/openFile as bytes.
        val script = """
            (async function() {
              try {
                const response = await fetch(${JSONObject.quote(url)});
                if (!response.ok) throw new Error('Kunde inte hämta filen.');
                const blob = await response.blob();
                if (blob.size > $MAX_FILE_BYTES) throw new Error('Filen är för stor (max 64 MB).');
                const reader = new FileReader();
                reader.onload = () => Android.saveFile(${JSONObject.quote(name)}, ${JSONObject.quote(mime)}, String(reader.result).split(',')[1]);
                reader.readAsDataURL(blob);
              } catch (error) { alert(error.message || 'Kunde inte hämta filen.'); }
            })();
        """.trimIndent()
        webView.evaluateJavascript(script, null)
    }

    private fun openExternal(uri: Uri) {
        if (uri.scheme !in listOf("https", "http", "mailto", "tel", "geo")) return
        try { startActivity(Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE)) }
        catch (_: ActivityNotFoundException) { notifyUser("Ingen app kan öppna länken.") }
    }

    private fun navigateBack() {
        if (!trustedDocument) { webView.loadUrl(HOME); return }
        webView.evaluateJavascript("""
            (function() {
              try {
                if (window.NexusHubNavigation && typeof window.NexusHubNavigation.back === 'function')
                  return window.NexusHubNavigation.back() !== false;
              } catch (_) {}
              return false;
            })();
        """.trimIndent()) { handled ->
            if (handled != "true") {
                if (webView.canGoBack()) webView.goBack()
                else moveTaskToBack(true)
            }
        }
    }

    private fun notifyUser(message: String) { runOnUiThread { Toast.makeText(this, message, Toast.LENGTH_LONG).show() } }
    private fun applySystemBars() {
        val dark = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) ==
            Configuration.UI_MODE_NIGHT_YES
        val color = if (dark) android.graphics.Color.rgb(10, 15, 27)
                    else android.graphics.Color.rgb(244, 246, 250)
        window.statusBarColor = color
        window.navigationBarColor = color
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility =
            if (dark) 0 else (android.view.View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or
                android.view.View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR)
        if (Build.VERSION.SDK_INT >= 29) { window.isStatusBarContrastEnforced = false; window.isNavigationBarContrastEnforced = false }
    }
    override fun onConfigurationChanged(newConfig: Configuration) { super.onConfigurationChanged(newConfig); applySystemBars() }
    @Deprecated("Fallback for Android 12 and earlier")
    override fun onBackPressed() { navigateBack() }
    private fun restorePendingSave(state: Bundle?): File? {
        val path = state?.getString(PENDING_SAVE_PATH) ?: return null
        val name = state.getString(PENDING_SAVE_NAME) ?: return null
        return try {
            val root = File(cacheDir, "exports").canonicalFile
            val candidate = File(path).canonicalFile
            candidate.takeIf {
                it.path.startsWith(root.path + File.separator) &&
                    it.name == name && it.isFile && it.length() <= MAX_FILE_BYTES
            }
        } catch (_: Exception) { null }
    }
    override fun onSaveInstanceState(outState: Bundle) {
        pendingSave?.let {
            outState.putString(PENDING_SAVE_PATH, it.absolutePath)
            outState.putString(PENDING_SAVE_NAME, it.name)
        }
        webView.saveState(outState)
        super.onSaveInstanceState(outState)
    }
    @Deprecated("Legacy WebView file result API")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == PICK_MODEL) {
            val uri=if(resultCode==RESULT_OK)data?.data else null
            if(uri!=null)io.execute {
                try {
                    IntelligenceRuntime.get(applicationContext).import(uri)
                    IntelligenceJobs.resumeModelWaiters(applicationContext)
                    activityEvent("intelligence_model_imported","succeeded","Gemma 4 E2B importerad")
                    notifyUser("Modellen har importerats och verifierats.")
                }catch(e:Exception){
                    activityEvent("intelligence_model_import_failed","failed","Gemma-import misslyckades")
                    notifyUser("Modellimport: "+(e.message?:"okänt fel").take(200))
                }
            }
        } else if (requestCode == PICK_FILE) {
            val callback = fileCallback; fileCallback = null
            val selected = linkedSetOf<Uri>()
            if (resultCode == RESULT_OK) {
                data?.clipData?.let { clip -> for (i in 0 until clip.itemCount) clip.getItemAt(i).uri?.let { selected.add(it) } }
                data?.data?.let { selected.add(it) }
            }
            callback?.onReceiveValue(if (selected.isEmpty()) null else selected.toTypedArray())
        } else if (requestCode == SAVE_FILE) {
            val source = pendingSave; pendingSave = null
            val uri = data?.data
            if (resultCode != RESULT_OK) { source?.delete(); return }
            if (source == null || !source.isFile || uri == null) {
                source?.delete()
                notifyUser("Kunde inte slutföra sparningen. Öppna dokumentet och försök spara igen.")
                return
            }
            io.execute {
                try {
                    source.inputStream().use { input ->
                        val output = contentResolver.openOutputStream(uri, "wt") ?: error("Kunde inte öppna målfilen.")
                        output.use { target -> input.copyTo(target) }
                    }
                    activityEvent("file_exported","succeeded",source.name)
                    notifyUser("Filen har sparats.")
                } catch (_: Exception) { activityEvent("file_exported","failed",source.name); notifyUser("Kunde inte spara filen.") }
                finally { source.delete() }
            }
        }
    }
    override fun onDestroy() {
        trustedDocument = false
        if (::nexusMessages.isInitialized) nexusMessages.destroy()
        if (Build.VERSION.SDK_INT >= 33) backCallback?.let { onBackInvokedDispatcher.unregisterOnBackInvokedCallback(it) }
        fileCallback?.onReceiveValue(null); fileCallback = null
        webView.stopLoading(); webView.removeJavascriptInterface("Android"); webView.destroy()
        io.shutdown()
        super.onDestroy()
    }
}
