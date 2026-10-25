import { validatedPatch } from './media-validation.mjs';
// Filmregistrets domänregler. GitHub/Filmer/register.json är enda auktoritativa filen.
export const FILM_PATH = 'Filmer/register.json';
export const FILM_STATUSES = ['Inte sett', 'Sedd', 'Pågående', 'Vill se', 'Avbruten'];
export const FILM_ACCESS = ['okänt', 'abonnemang', 'gratis', 'hyrd', 'köpt', 'annat'];
const EDITABLE_FIELDS = ['imdbId', 'title', 'year', 'displayTitle', 'genres', 'status', 'favorite', 'ourRating', 'ourReview', 'synopsis', 'series', 'viewings', 'startedViewingDate', 'plannedViewingDate', 'statusEvidence', 'metadataSource'];
const nonempty = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const optional = (v, max) => v === null || (typeof v === 'string' && v.length <= max);
const date = (v) => v === null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T12:00:00Z')) && new Date(v + 'T12:00:00Z').toISOString().slice(0, 10) === v);
export function validateFilm(f) {
    if (!f || typeof f !== 'object' || Array.isArray(f))
        throw Error('Ogiltig filmpost.');
    validatedPatch(Object.fromEntries(['title', 'year', 'genres', 'status', 'favorite', 'ourRating', 'ourReview', 'synopsis'].filter(k => Object.hasOwn(f, k)).map(k => [k, f[k]])), 'films');
    if (!/^tt\d{7,9}$/.test(f.imdbId || ''))
        throw Error('Ange ett giltigt IMDb-ID (tt följt av 7–9 siffror).');
    if (!nonempty(f.title, 250) || !Number.isInteger(f.year) || f.year < 1880 || f.year > 2100)
        throw Error('Ange filmtitel och giltigt årtal.');
    if (!Array.isArray(f.genres) || !f.genres.length || f.genres.length > 15 || f.genres.some(g => !nonempty(g, 80)) || new Set(f.genres.map(g => g.toLocaleLowerCase('sv'))).size !== f.genres.length)
        throw Error('Ange minst en unik genre.');
    if (!FILM_STATUSES.includes(f.status))
        throw Error('Ogiltig tittarstatus.');
    if (Object.hasOwn(f, 'favorite') && typeof f.favorite !== 'boolean')
        throw Error('Favoritmarkeringen måste vara sann eller falsk.');
    if (f.ourRating !== null && (!Number.isInteger(f.ourRating) || f.ourRating < 1 || f.ourRating > 10))
        throw Error('Betyget måste vara ett heltal från 1 till 10.');
    if (!optional(f.ourReview, 12000) || !optional(f.synopsis, 5000))
        throw Error('Omdöme eller handling är för lång.');
    if (f.series !== null && (!f.series || !nonempty(f.series.name, 150) || !Number.isInteger(f.series.number) || f.series.number < 1))
        throw Error('Ogiltig filmserie.');
    if (!date(f.startedViewingDate) || !date(f.plannedViewingDate))
        throw Error('Ogiltigt datum.');
    if (!Array.isArray(f.viewings) || f.viewings.length > 500)
        throw Error('Ogiltig visningshistorik.');
    for (const v of f.viewings) {
        if (!v || Object.keys(v).some(k => !['date', 'provider', 'accessType', 'priceSek'].includes(k)) || !date(v.date) || !optional(v.provider, 160) || !FILM_ACCESS.includes(v.accessType) || !(v.priceSek === null || (typeof v.priceSek === 'number' && Number.isFinite(v.priceSek) && v.priceSek >= 0 && v.priceSek <= 1000000)))
            throw Error('Kontrollera datum, tjänst, visningstyp och pris.');
    }
    if (!f.statusEvidence || !['direkt', 'serieuppgift'].includes(f.statusEvidence.type) || !nonempty(f.statusEvidence.note, 1000))
        throw Error('Statusens källa saknas.');
    if (typeof f.metadataSource !== 'string' || f.metadataSource !== `https://www.imdb.com/title/${f.imdbId}/`)
        throw Error('IMDb-källan måste matcha filmens IMDb-ID.');
    return { ...f, displayTitle: `${f.title.trim()} – (${f.year})`, title: f.title.trim(), genres: f.genres.map(x => x.trim()) };
}
export function applyFilmChange(registry, action, film) {
    if (!registry || !['1.0.0', '1.3.0'].includes(registry.schemaVersion) || !Array.isArray(registry.films))
        throw Error('Filmregistrets datamodell har ändrats. Ingen fil skrevs över.');
    if (action !== 'update')
        throw Error('Okänd filmändring.');
    const validated = validateFilm(film);
    const next = Object.fromEntries(EDITABLE_FIELDS.filter(key => Object.hasOwn(validated, key)).map(key => [key, validated[key]]));
    const count = registry.films.filter(f => f.imdbId === next.imdbId).length;
    if (action === 'update' && count !== 1)
        throw Object.assign(Error('Filmen kan inte hittas entydigt. Läs om registret.'), { status: 409 });
    const films = registry.films.map(f => f.imdbId === next.imdbId ? { ...f, ...next } : f);
    return { ...registry, lastUpdated: new Date().toISOString().slice(0, 10), films };
}
