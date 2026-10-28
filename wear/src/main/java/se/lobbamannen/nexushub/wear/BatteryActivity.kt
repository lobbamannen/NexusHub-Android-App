package se.lobbamannen.nexushub.wear
import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.widget.*
import se.lobbamannen.nexushub.battery.LocalBattery
import se.lobbamannen.nexushub.battery.BatterySnapshot
import java.util.concurrent.Executors
class BatteryActivity:Activity() {
 private val handler=Handler(Looper.getMainLooper());private val io=Executors.newSingleThreadExecutor();private lateinit var status:TextView
 private val tick=object:Runnable{override fun run(){showStatus();handler.postDelayed(this,3000)}}
 override fun onCreate(savedInstanceState:Bundle?) {
  super.onCreate(savedInstanceState)
  val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;setPadding(26,30,26,30);setBackgroundColor(Color.BLACK)}
  fun text(s:String,size:Float)=TextView(this).apply{text=s;textSize=size;gravity=Gravity.CENTER;setTextColor(Color.rgb(231,193,105))}
  root.addView(text("NEXUSHUB",16f));root.addView(text("Two Thumbs Battery",13f));status=text("Läser batteri…",16f);root.addView(status)
  root.addView(Button(this).apply{text="Synka nu";setOnClickListener{BatteryWork.now(this@BatteryActivity);Toast.makeText(this@BatteryActivity,if(BatteryWork.paused(this@BatteryActivity))"Nattpaus – senaste mätningen visas" else "Uppdatering begärd",Toast.LENGTH_SHORT).show()}})
  root.addView(text("Öppna Batteriwidget i telefonens NexusHub för anslutning och inställningar.",11f))
  setContentView(ScrollView(this).apply{addView(root)})
  BatteryWork.schedule(this);BatteryWork.now(this,"open")
  io.execute{try{BatteryWork.configure(this)}catch(_:Exception){}}
 }
 private fun showStatus(){
  val p=BatteryWork.prefs(this);val config=BatteryWork.configuration(this);val paused=BatteryWork.paused(this)
  val s=if(paused)BatterySnapshot.decode(p.getString("snapshot","").orEmpty(),System.currentTimeMillis()) else LocalBattery.read(this)
  status.text="${s?.percent ?: "—"} %"+(if(paused)" · senaste" else if(s?.status==2)" · laddar" else "")+"\n"+(if(paused)"Nattpaus " else "Kontroll ca var ${config.interval} min\n")+(if(config.quietEnabled)config.quietHours().label() else "Nattpaus av")+"\n"+p.getString("error","")
 }

 override fun onResume(){super.onResume();handler.post(tick)}
 override fun onPause(){handler.removeCallbacks(tick);super.onPause()}
 override fun onDestroy(){io.shutdownNow();super.onDestroy()}
}
