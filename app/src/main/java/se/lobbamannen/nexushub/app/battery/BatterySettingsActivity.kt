package se.lobbamannen.nexushub.app.battery
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.*
import android.view.Gravity
import android.widget.*
import se.lobbamannen.nexushub.app.NexusTelemetry
import org.json.JSONArray
import java.text.SimpleDateFormat
import java.util.*

class BatterySettingsActivity:Activity() {
 private lateinit var status:TextView;private lateinit var history:TextView
 private val handler=Handler(Looper.getMainLooper());private val tick=object:Runnable{override fun run(){update();handler.postDelayed(this,2000)}}
 private fun dp(n:Int)=(n*resources.displayMetrics.density).toInt()
 override fun onCreate(savedInstanceState:Bundle?) {
  super.onCreate(savedInstanceState);window.statusBarColor=Color.BLACK;window.navigationBarColor=Color.BLACK
  val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(20),dp(24),dp(20),dp(32));setBackgroundColor(Color.rgb(9,9,12))}
  fun text(value:String,size:Float=15f)=TextView(this).apply{text=value;textSize=size;setTextColor(Color.rgb(234,230,221));setPadding(0,dp(8),0,dp(8))}
  fun button(label:String,action:()->Unit){root.addView(Button(this).apply{text=label;isAllCaps=false;minHeight=dp(48);setOnClickListener{action()}})}
  root.addView(text("TWO THUMBS BATTERY",22f).apply{setTextColor(Color.rgb(233,198,117))})
  root.addView(text("Telefon och klocka. Två rader.",16f))
  status=text("Läser status…");root.addView(status)
  button("Uppdatera batterier"){BatterySync.refresh(this);update()}
  button("Välj klocka") {
   val nodes=try{JSONArray(BatteryStore(this).prefs.getString("nodes","[]"))}catch(_:Exception){JSONArray()}
   if(nodes.length()==0){BatterySync.refresh(this);Toast.makeText(this,"Söker. Kontrollera att NexusHub Battery är installerad och öppnad på klockan.",Toast.LENGTH_LONG).show()}
   else AlertDialog.Builder(this).setTitle("Välj NexusHub-klocka").setItems(Array(nodes.length()){nodes.getJSONObject(it).optString("label","Klocka")}){_,index->BatteryStore(this).select(nodes.getJSONObject(index).getString("id"));BatterySync.refresh(this);update()}.show()
  }
  button("Bakgrund") {
   val keys=arrayOf("glass","black","transparent");val store=BatteryStore(this)
   AlertDialog.Builder(this).setTitle("Widgetens bakgrund").setSingleChoiceItems(arrayOf("Mörk genomskinlig","Svart","Helt transparent"),keys.indexOf(store.prefs.getString("background","glass"))){dialog,index->store.prefs.edit().putString("background",keys[index]).apply();BatteryWidgetProvider.render(this);dialog.dismiss()}.show()
  }
  button("Uppdateringsintervall på klockan") {
   val values=intArrayOf(15,30,60);val store=BatteryStore(this)
   AlertDialog.Builder(this).setTitle("Bakgrundskontroll").setSingleChoiceItems(arrayOf("Cirka 15 minuter","Cirka 30 minuter","Cirka 60 minuter"),values.indexOf(store.interval())){dialog,index->store.prefs.edit().putInt("interval",values[index]).apply();BatterySync.refresh(this);dialog.dismiss();update()}.show()
  }
  root.addView(text("Lägg till widgeten: Good Lock → LockStar → lägg till widget → NexusHub · Two Thumbs Battery. Anpassa storleken där. Telefonraden öppnar denna vy; klockraden begär ny mätning. Hemskärmens widgetväljare fungerar också."))
  button("Installation av klockappen") {AlertDialog.Builder(this).setTitle("NexusHub Battery på klockan").setMessage("Installera nexus-hub-watch.apk på klockan och öppna den en gång. Telefon- och klockappen måste vara signerade med samma NexusHub-nyckel. En APK på telefonen installeras inte automatiskt på klockan. Installationsguiden finns i releasen.").setPositiveButton("Öppna release"){_,_->startActivity(Intent(Intent.ACTION_VIEW,Uri.parse("https://github.com/lobbamannen/NexusHub-Android-App/releases/latest")))}.setNegativeButton("Stäng",null).show()}
  root.addView(text("Android kan skjuta upp bakgrundskontroller. Mättiden på klockraden visar när värdet faktiskt lästes. Tryck Uppdatera för ett nytt försök. Ingen ständig bakgrundstjänst används."))
  root.addView(text("Diagnostik",18f));root.addView(text("PostHog följer NexusHubs befintliga diagnostikval. Batteriprocent, laddningsstatus, mättid och slumpmässigt mät-ID ingår när diagnostik är på. Inga enhetsnamn, Bluetooth-adresser eller privata NexusHub-uppgifter skickas."))
  history=text("",12f);root.addView(history)
  button("Tillbaka"){finish()}
  val scroll=ScrollView(this).apply{addView(root)}
  scroll.setOnApplyWindowInsetsListener { view,insets ->
   val bars=if(Build.VERSION.SDK_INT>=30)insets.getInsets(android.view.WindowInsets.Type.systemBars() or android.view.WindowInsets.Type.displayCutout()) else null
   if(bars!=null)view.setPadding(bars.left,bars.top,bars.right,bars.bottom)
   insets
  }
  setContentView(scroll)
  BatterySync.refresh(this)
 }
 private fun update() {
  val s=BatterySync.state(this);val time=s.optLong("measuredAt");val store=BatteryStore(this)
  val request=when(s.optString("request")){"pending"->"\nVäntar på ny mätning…";"timeout"->"\nKlockan har inte svarat ännu.";else->""}
  status.text="Telefon: ${if(s.isNull("phonePercent"))"—" else s.optInt("phonePercent")} %\nKlocka: ${if(s.isNull("watchPercent"))"—" else s.optInt("watchPercent")} %"+(if(s.optBoolean("charging"))" · laddar" else "")+"\nMätt: "+(if(time>0)SimpleDateFormat("d/M HH:mm:ss",Locale("sv","SE")).format(Date(time)) else "inväntar klockan")+"\nKontroll: cirka var ${store.interval()} min"+request+"\n"+s.optString("error")
  val entries=store.journal();val lines=mutableListOf<String>();for(i in maxOf(0,entries.length()-8) until entries.length()){val e=entries.getJSONObject(i);lines.add(store.label(e.optLong("at"))+" · "+e.optString("message"))}
  history.text=(if(NexusTelemetry.status().optBoolean("enabled"))"PostHog: på" else "PostHog: av")+"\n"+lines.joinToString("\n")
 }
 override fun onResume(){super.onResume();handler.post(tick)}
 override fun onPause(){handler.removeCallbacks(tick);super.onPause()}
}
