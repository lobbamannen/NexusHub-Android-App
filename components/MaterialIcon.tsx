import React from 'react';
export type MaterialTone = 'ruby' | 'blue' | 'pink' | 'green' | 'violet' | 'gold' | 'orange';
type Props = {children: React.ReactElement<any>; tone?: MaterialTone; size?: number | 'module'; className?: string};
/** One approved homepage material. Only hue, glyph and intended size vary. */
export default function MaterialIcon({children, tone='violet', size=38, className=''}: Props) {
 const glyph=React.cloneElement(children,{className:'v3-glyph',stroke:'url(#ink-'+(tone==='ruby'?'red':tone==='gold'?'gold':tone==='orange'?'orange':'blue')+')',strokeWidth:1.65,'aria-hidden':true});
 const style=size==='module'?undefined:{'--material-size':size+'px','--material-scale':size/38,'--material-glow-size':124*size/58+'px','--material-blur':12*size/58+'px'} as React.CSSProperties;
 return <span className={'nh-material-icon nh-material-'+tone+' '+className} style={style} aria-hidden="true">
  <span className="nh-icon-object">{glyph}</span>
 </span>;
}
