const filmFields = new Set(['title', 'year', 'genres', 'status', 'ourRating', 'favorite', 'ourReview', 'synopsis']);
const seriesFields = new Set(['title', 'startYear', 'genres', 'status', 'allSeasonsAvailableInSwedenWatched', 'wantToWatch', 'ourRating', 'favorite', 'ourReview', 'synopsis']);
const filmStatuses = new Set(['Inte sett', 'Sedd', 'Pågående', 'Vill se', 'Avbruten']);
const seriesStatuses = new Set(['Inte sett', 'Pågående', 'Vill se', 'Avbruten', 'Sedd – angivna säsonger', 'Sedd – alla säsonger tillgängliga i Sverige', 'Sedd – alla hittills släppta avsnitt i Sverige', 'Sedd – alla hittills släppta säsonger']);
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
export function validatedPatch(input, kind) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
        fail('Ogiltiga redigerade fält.');
    const patch = input;
    const allowed = kind === 'films' ? filmFields : seriesFields;
    const fields = Object.keys(patch);
    if (!fields.length || fields.some(field => !allowed.has(field)))
        fail('Ändringen innehåller otillåtna eller tomma fält.');
    const next = {};
    for (const field of fields) {
        const value = patch[field];
        if (field === 'title') {
            if (typeof value !== 'string' || !value.trim() || value.length > 250)
                fail('Ange en giltig titel.');
            next.title = value.trim();
        }
        else if (field === 'genres') {
            if (!Array.isArray(value) || value.length < 1 || value.length > 15 || value.some(g => typeof g !== 'string' || !g.trim() || g.length > 80))
                fail('Ange minst en giltig genre.');
            const genres = value.map(g => g.trim());
            if (new Set(genres.map(g => g.toLocaleLowerCase('sv'))).size !== genres.length)
                fail('En genre får inte förekomma flera gånger.');
            next.genres = genres;
        }
        else if (field === 'year') {
            if (!Number.isInteger(value) || Number(value) < 1880 || Number(value) > 2100)
                fail('Ogiltigt filmår.');
            next.year = value;
        }
        else if (field === 'startYear') {
            if (value !== null && (!Number.isInteger(value) || Number(value) < 1880 || Number(value) > 2100))
                fail('Ogiltigt startår för serien.');
            next.startYear = value;
        }
        else if (field === 'status') {
            if (typeof value !== 'string' || !(kind === 'films' ? filmStatuses : seriesStatuses).has(value))
                fail('Ogiltig tittarstatus.');
            next.status = value;
        }
        else if (field === 'allSeasonsAvailableInSwedenWatched' || field === 'wantToWatch') {
            if (typeof value !== 'boolean')
                fail('Ogiltig markering för serien.');
            next[field] = value;
        }
        else if (field === 'ourRating') {
            if (value !== null && (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 10))
                fail('Betyget måste vara 1–10 eller tomt.');
            next.ourRating = value;
        }
        else if (field === 'favorite') {
            if (typeof value !== 'boolean')
                fail('Ogiltig favoritmarkering.');
            next.favorite = value;
        }
        else if (field === 'ourReview' || field === 'synopsis') {
            const limit = field === 'ourReview' ? 12000 : 5000;
            if (value !== null && (typeof value !== 'string' || value.length > limit))
                fail('Omdömet eller handlingen är för lång.');
            next[field] = value;
        }
    }
    return next;
}
