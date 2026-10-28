package se.lobbamannen.nexushub.app.weather
import android.app.Application
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.widget.FrameLayout
import android.widget.TextView
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import se.lobbamannen.nexushub.app.R
import java.time.LocalDate

@RunWith(RobolectricTestRunner::class)
@Config(application=Application::class,sdk=[34])
class WeatherWidgetTest {
 @Test fun calendarAndWeatherOnlyAllowExistingNexusRoutes(){assertEquals("kalender",WeatherWidgetProvider.destination("kalender"));assertEquals("vader",WeatherWidgetProvider.destination("vader"));for(s in listOf("https://bad.example/","javascript:alert(1)","vader?url=bad","","Kalender"))assertNull(WeatherWidgetProvider.destination(s))}
 @Test fun widgetRendersActualDateBlackSurfaceAndMissingWeatherWithoutZero(){
  val c=RuntimeEnvironment.getApplication();val state=JSONObject().put("location",WeatherLocation.DEFAULT.json()).put("status","empty").put("current",JSONObject.NULL)
  val view=WeatherWidgetProvider.views(c,state,Bundle(),LocalDate.of(2026,10,28)).apply(c,FrameLayout(c))
  assertEquals("28",view.findViewById<TextView>(R.id.weather_widget_date).text.toString());assertEquals("onsdag",view.findViewById<TextView>(R.id.weather_widget_weekday).text.toString())
  assertEquals("—",view.findViewById<TextView>(R.id.weather_widget_temperature).text.toString());assertEquals("TWO THUMBS INCORPORATED™",view.findViewById<TextView>(R.id.weather_widget_brand).text.toString())
  assertEquals(android.graphics.Color.BLACK,(view.background as GradientDrawable).color!!.defaultColor)
  assertTrue(view.findViewById<TextView>(R.id.weather_widget_month).text.toString().contains("2026"))
 }
 @Test fun onlyMissingTemperatureUsesDash(){assertEquals("3°",WeatherWidgetProvider.degrees(2.5));assertEquals("−3°",WeatherWidgetProvider.degrees(-3.5));assertEquals("0°",WeatherWidgetProvider.degrees(0.0));assertEquals("−3°",WeatherWidgetProvider.degrees(-3.2));assertEquals("—",WeatherWidgetProvider.degrees(null))}
 @Test fun partlyCloudyIconDistinguishesDayAndNight(){assertFalse(WeatherWidgetGlyph.draw("partly_cloudy",true).sameAs(WeatherWidgetGlyph.draw("partly_cloudy",false)))}

}
