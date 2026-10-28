import React from 'react';
import {ChevronRight} from 'lucide-react';
import {useWeather} from '@/lib/weather/use-weather';
import {temperature,conditionLabel} from '@/lib/weather/presentation.mjs';
import WeatherGlyph from './WeatherGlyph';
import './weather.css';
export default function HomeWeatherIndicator({onNavigate}:{onNavigate:(view:string)=>void}){
 const {state,error}=useWeather();const current=state?.current;
 return <button type="button" className={'nh-home-weather'+(state?.status==='stale'?' is-stale':'')} onClick={()=>onNavigate('vader')} aria-label={'Öppna väder. '+(current?temperature(current.temperature)+', '+conditionLabel(current.condition)+', '+state?.location.name+'. Prognos.':'Väder saknas.')+(state?.status==='stale'?' Tidigare prognos visas.':'')} title={error||state?.error||state?.location.name||'Öppna väder'}><WeatherGlyph condition={current?.condition} isDay={current?.isDay} size={17}/><span>{current?temperature(current.temperature):'Väder'}</span>{state?.status==='stale'&&<span className="nh-weather-old-dot" aria-label="Äldre prognos"/>}<ChevronRight size={12} aria-hidden="true"/></button>;
}
