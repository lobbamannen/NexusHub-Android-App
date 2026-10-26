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
        private const val PICK_FILE = 1001
        private const val SAVE_FILE = 1002
        private const val MAX_FILE_BYTES = 64 * 1024 * 1024
        private const val PENDING_SAVE_PATH = "nexushub.pendingSave.path"
        private const val PENDING_SAVE_NAME = "nexushub.pendingSave.name"
    }
    private lateinit var webView: WebView
    private lateinit var nexusMessages: NexusMessageBridge
    private var pendingSeries: String? = null
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
        incomingShares = IncomingShareStore(applicationContext)
        pendingSave = restorePendingSave(savedInstanceState)
        val root = FrameLayout(this)
        webView = WebView(this)
        webView.setBackgroundColor(android.graphics.Color.rgb(9, 8, 17))
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
        if (trustedDocument) openPendingSeries()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        captureShare(intent)
        intent.getStringExtra("nexus.series")?.take(200)?.let { pendingSeries = it; if (trustedDocument) openPendingSeries() }
    }
    private fun openPendingSeries() {
        val target = pendingSeries ?: return
        pendingSeries = null
        webView.evaluateJavascript("location.hash=" + JSONObject.quote("serier?item=" + Uri.encode(target)) + ";", null)
    }
    override fun onResume() { super.onResume(); if (::nexusMessages.isInitialized) nexusMessages.resume() }
    override fun onStop() { if (::nexusMessages.isInitialized) nexusMessages.stop(); super.onStop() }
    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (::nexusMessages.isInitialized) nexusMessages.permissions(requestCode)
    }
    private fun captureShare(sharedIntent: Intent) {
        if (sharedIntent.action != Intent.ACTION_SEND && sharedIntent.action != Intent.ACTION_SEND_MULTIPLE) return
        io.execute {
            try {
                if (incomingShares.receive(sharedIntent)) { pendingIncomingOpen = true; runOnUiThread {
                    if (!isFinishing && !isDestroyed) {
                        Toast.makeText(this, "Sparat i NexusHubs mottagningsinkorg", Toast.LENGTH_SHORT).show()
                        if (trustedDocument) { pendingIncomingOpen = false; webView.evaluateJavascript("window.NexusHubIncomingOpen=true;window.dispatchEvent(new Event('nexus-incoming-changed'));window.dispatchEvent(new Event('nexus-native-share'));", null) }
                    }
                } }
            } catch (error: Exception) { runOnUiThread { Toast.makeText(this, "Kunde inte spara delningen: " + error.message, Toast.LENGTH_LONG).show() } }
        }
    }

    /** Called only from the bundled document; CSP excludes foreign child frames. */
    inner class NativeBridge {
        @JavascriptInterface fun listIncoming(): String = if (trustedDocument) incomingShares.list() else "[]"
        @JavascriptInterface fun readIncomingFile(id: String, fileId: String): String = if (trustedDocument) incomingShares.read(id, fileId) else ""
        @JavascriptInterface fun removeIncoming(id: String): Boolean = trustedDocument && incomingShares.remove(id)

        @JavascriptInterface fun getGithubToken(): String = if (trustedDocument) credentials.get() else ""
        @JavascriptInterface fun setGithubToken(token: String): Boolean = trustedDocument && credentials.set(token)
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
        try { startActivity(Intent.createChooser(view, "Öppna med")) }
        catch (_: ActivityNotFoundException) {
            val share = Intent(Intent.ACTION_SEND).apply {
                type = mime; putExtra(Intent.EXTRA_STREAM, uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION); clipData = ClipData.newRawUri(file.name, uri)
            }
            try { startActivity(Intent.createChooser(share, "Dela fil")) }
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
        if (requestCode == PICK_FILE) {
            fileCallback?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data)); fileCallback = null
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
                    notifyUser("Filen har sparats.")
                } catch (_: Exception) { notifyUser("Kunde inte spara filen.") }
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
