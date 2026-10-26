/** Match editor intents only. Direct read/saved flags and uploads remain queued. */
/** @param {{path:string,id:string,kind?:string}|null} target */
export function queuedEditMatches(item, scope, target = null) {
    if(item.path==='/api/calendar'||item.path==='/api/series-watch-settings'||item.path==='/api/series'&&item.body?.kind==='json'&&item.body.text.includes('set-release-watch')){
      if(scope!=='calendar'&&scope!=='watch')return false;
      if((item.path==='/api/calendar')!==(scope==='calendar'))return false;
      if(!target)return true;
      try{const input=JSON.parse(item.body.text);return item.path==='/api/calendar'?(input.change?.event?.id||input.change?.id)===target.id:item.path==='/api/series-watch-settings'?target.id==='settings':(input.target?.imdbId||`${input.target?.title}|${input.target?.startYear??''}`)===target.id;}catch{return false;}
    }
    if (item.path === '/api/economy') {
        if (scope !== 'economy') return false;
        if (!target) return true;
        if (item.body?.kind !== 'json') return false;
        try {
            const input = JSON.parse(item.body.text);
            return input.path === target.path && (target.kind
                ? input.kind === target.kind && input.entry?.id === target.id : input.id === target.id);
        } catch { return false; }
    }
    const media = item.path === '/api/media-register', film = item.path === '/api/films';
    let stories = item.path === '/api/story-register';
    if (item.path === '/api/story-status' && item.body?.kind === 'json') {
        try { stories = JSON.parse(item.body.text)?.action === 'batch'; } catch { return false; }
    }
    return scope === 'all-drafts' ? media || film || stories : scope === 'media' ? media : scope === 'film' ? film : scope === 'stories' && stories;
}
