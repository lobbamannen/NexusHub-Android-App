import React from 'react';
/** A single path keeps straight base strokes visible through shared material gradients. */
export default function IdeaBulb({size=24,strokeWidth=2,className,...props}: React.SVGProps<SVGSVGElement> & {size?:number;strokeWidth?:number}) {
 return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} {...props}><path d="M9 18h6 M10 22h4 M15.09 14a6 6 0 1 0-6.18 0c.8.54 1.09 1.2 1.09 2v.5h4V16c0-.8.29-1.46 1.09-2Z"/></svg>;
}
