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
import org.robolectric.annotation.GraphicsMode
import se.lobbamannen.nexushub.app.R
import java.time.LocalDate

@RunWith(RobolectricTestRunner::class)
@Config(application=Application::class,sdk=[34])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
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

 @Test fun renderNativeWidgetPreview(){
  val c=RuntimeEnvironment.getApplication();val density=c.resources.displayMetrics.density
  val state=JSONObject().put("location",WeatherLocation.DEFAULT.json()).put("status","fresh").put("fetchedAt",1793203200000L).put("current",JSONObject().put("temperature",6.5).put("condition","rain").put("isDay",false))
  for(heightDp in listOf(110,150)){
   val options=Bundle().apply{putInt(android.appwidget.AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH,320);putInt(android.appwidget.AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,heightDp)}
   val view=WeatherWidgetProvider.views(c,state,options,LocalDate.of(2026,10,28)).apply(c,FrameLayout(c)) as android.view.ViewGroup
   val width=(320*density).toInt();val height=(heightDp*density).toInt()
   view.measure(android.view.View.MeasureSpec.makeMeasureSpec(width,android.view.View.MeasureSpec.EXACTLY),android.view.View.MeasureSpec.makeMeasureSpec(height,android.view.View.MeasureSpec.EXACTLY));view.layout(0,0,width,height)
   for(id in listOf(R.id.weather_widget_brand,R.id.weather_widget_month,R.id.weather_widget_date,R.id.weather_widget_weekday,R.id.weather_widget_temperature,R.id.weather_widget_condition,R.id.weather_widget_place,R.id.weather_widget_status)){
    val child=view.findViewById<TextView>(id);val rect=android.graphics.Rect();child.getDrawingRect(rect);view.offsetDescendantRectToMyCoords(child,rect)
    assertTrue("Widget text $id fits top at $heightDp dp: $rect",rect.top>=0)
    assertTrue("Widget text $id fits bottom at $heightDp dp: $rect",rect.bottom<=height)
    assertTrue("Widget text $id has positive height",rect.height()>0)
   }
   val bitmap=android.graphics.Bitmap.createBitmap(width,height,android.graphics.Bitmap.Config.ARGB_8888);view.draw(android.graphics.Canvas(bitmap))
   val file=java.io.File(if(heightDp==150)"build/reports/weather-widget.png" else "build/reports/weather-widget-compact.png");file.parentFile.mkdirs();file.outputStream().use{bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG,100,it)}
   assertEquals("7°",view.findViewById<TextView>(R.id.weather_widget_temperature).text.toString())
  }
 }

}
