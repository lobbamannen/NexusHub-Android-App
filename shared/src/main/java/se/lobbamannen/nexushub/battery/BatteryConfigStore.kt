package se.lobbamannen.nexushub.battery

import android.content.SharedPreferences

fun batteryConfiguration(prefs:SharedPreferences,watch:Boolean=false):BatteryConfiguration =
 BatteryConfiguration.decode(prefs.getString("configuration",null)?.toByteArray(Charsets.UTF_8))
 ?: BatteryConfiguration(revision=if(watch)0 else 1,interval=BatteryProtocol.interval(prefs.getInt("interval",30)))

fun saveBatteryConfiguration(prefs:SharedPreferences,config:BatteryConfiguration){
 check(prefs.edit().putString("configuration",config.encode()).putInt("interval",config.interval).commit())
}
