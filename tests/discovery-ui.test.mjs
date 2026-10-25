import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filmDiscovery, seriesDiscovery } from '../lib/media-discovery.mjs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
test('series: provider count is series count, not season count or actual viewing provider', () => {
    const items = [
        { title: 'A', genres: ['Drama'], allSeasonsAvailableInSwedenWatched: true, favorite: true, seasonAvailabilityResearch: { swedenAvailableSeasonNumbers: [2, 3], swedenProviderSeasonCounts: [{ provider: 'Netflix', seasons: 2 }, { provider: 'Netflix', seasons: 3 }] } },
        { title: 'B', genres: ['Drama', 'Thriller'], allSeasonsAvailableInSwedenWatched: true, favorite: false, wantToWatch: true, seasonAvailabilityResearch: { swedenAvailableSeasonNumbers: [1], swedenProviderSeasonCounts: [{ provider: 'Netflix', seasons: 1 }, { provider: 'Max', seasons: 2 }] } },
        { title: 'C', genres: ['Historia'], allSeasonsAvailableInSwedenWatched: false, favorite: false, seasonAvailabilityResearch: { swedenAvailableSeasonNumbers: [], swedenProviderSeasonCounts: [] } }
    ];
    const d = seriesDiscovery(items);
    assert.deepEqual(d.metrics.map(x => x.value), [3, 1]);
    assert.equal(d.groups[0].id, 'genre');
    assert.equal(d.groups.find(g => g.id === 'status').items.find(x => x.id === 'status:villse').count, 1);
    assert.deepEqual(d.groups.find(g => g.id === 'provider').items.map(x => [x.label, x.count]), [['Netflix', 2], ['Max', 1]]);
    assert.equal(d.groups.find(g => g.id === 'status').items.find(x => x.id === 'status:favoriter').count, 1);
    assert.equal(d.groups.find(g => g.id === 'status').items.find(x => x.id === 'status:övriga').count, 1);
});
test('empty or incomplete registries do not invent categories', () => {
    assert.deepEqual(filmDiscovery(null), { total: 0, metrics: [{ label: 'Registrerade', value: 0 }, { label: 'Vill se', value: 0 }], groups: [] });
    assert.equal(seriesDiscovery([]).groups.length, 0);
    const d = seriesDiscovery([{ genres: [], status: 'Sedd', allSeasonsAvailableInSwedenWatched: false }]);
    assert.equal(d.groups.length, 1);
});
test('mobile category cards are compact and advanced filters remain accessible', () => {
    const css = read('app/discovery-polish.css'), toolbar = read('components/dashboard/DiscoveryToolbar.tsx');
    assert.match(css, /\.nh-module-category-card\{min-height:78px/);
    assert.match(css, /@media\(max-width:700px\)/);
    assert.match(css, /min-height:84px/);
    assert.match(css, /\.nh-media-quick-links/);
    assert.match(css, /\.nh-media-dashboard/);
    assert.match(css, /@media\(max-width:375px\)/);
    assert.match(css, /:focus-visible/);
    assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
    assert.match(toolbar, /onQuery\(e\.target\.value\)/);
    assert.match(toolbar, /onShowAll/);
    assert.match(toolbar, /onClose/);
    assert.match(toolbar, /\{children\}/);
});
