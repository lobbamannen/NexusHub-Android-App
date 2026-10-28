import React from 'react';
import {Sun,Moon,CloudSun,CloudMoon,Cloud,CloudFog,CloudRain,CloudSnow,CloudLightning,CloudDrizzle,CircleHelp} from 'lucide-react';
export default function WeatherGlyph({condition,isDay=true,size=26,className=''}:{condition?:string;isDay?:boolean;size?:number;className?:string}){
 const Icon=condition==='clear'?(isDay?Sun:Moon):condition==='partly_cloudy'?(isDay?CloudSun:CloudMoon):condition==='cloudy'?Cloud:condition==='fog'?CloudFog:condition==='rain'?CloudRain:condition==='snow'?CloudSnow:condition==='sleet'?CloudDrizzle:condition==='thunder'?CloudLightning:CircleHelp;
 return <Icon aria-hidden="true" className={'nh-weather-glyph '+className} size={size} strokeWidth={1.6}/>;
}
