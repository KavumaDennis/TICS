// Live smoke test: Wikimedia Commons resolver for famous + obscure POIs.
const UA = { 'User-Agent': 'TICS/1.0 (React Native; https://tics.app)' };

async function commons(params) {
  const r = await fetch('https://commons.wikimedia.org/w/api.php?' + params, { headers: UA });
  const j = await r.json();
  return Object.values((j && j.query && j.query.pages) || {});
}

(async () => {
  const geo = await commons(new URLSearchParams({
    action: 'query', generator: 'geosearch', ggscoord: '0.3476|32.5825',
    ggsradius: '10000', ggslimit: '6', ggsnamespace: '6',
    prop: 'imageinfo', iiprop: 'url|mime', iiurlwidth: '800', format: 'json',
  }));
  console.log('geo Kampala photos:', geo.length, geo[0] ? String(geo[0].title).slice(0, 60) : 'none');

  for (const n of ['Norfolk Gardens', 'Katosi Landing', 'Speke Camp Site', 'Kampala Serena Hotel']) {
    const pgs = await commons(new URLSearchParams({
      action: 'query', generator: 'search', gsrsearch: n, gsrnamespace: '6',
      gsrlimit: '5', prop: 'imageinfo', iiprop: 'url|mime', iiurlwidth: '800', format: 'json',
    }));
    const hit = pgs.find((p) => p.imageinfo && p.imageinfo[0] && /image\/(jpeg|png)/i.test(p.imageinfo[0].mime || ''));
    console.log(n, '->', hit ? hit.title : 'NO COMMONS PHOTO');
  }
})();
