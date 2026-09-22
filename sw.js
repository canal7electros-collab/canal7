/* ═══════════════════════════════════════════════════════════════════════════════════════
   Canal 7 — SERVICE WORKER

   v1556 — CE FICHIER NE DOIT JAMAIS EMPECHER L'APP DE S'OUVRIR.
   Panne du 02/08 (Yo) : « quand j'ai mis sw et index sur mon serveur ça marche plus, l'app ne
   s'ouvre pas, mais sur web oui ». Reproduite au banc (`node swtest.js`), trois causes qui se
   cumulent :

     1. `cache.addAll(ASSETS)` est TOUT-OU-RIEN. La liste contenait quatre scripts hebergés chez
        cdnjs : sur le plateau, le telephone voit le serveur local mais pas internet, donc UN
        echec suffisait a faire rater TOUTE l'installation. Le cache restait cree et VIDE.

     2. Sur une navigation, `respondWith()` recevait
        `caches.match(key).then(c => c || caches.match('./'))`, qui peut valoir `undefined` quand
        le cache est vide. Une promesse resolue a `undefined` est traduite par le navigateur en
        ERREUR RESEAU : l'app installee sur l'ecran d'accueil s'ouvre alors sur une page blanche.
        Dans Safari on recharge et ca passe — d'ou « sur web oui ».

     3. `activate` supprimait les anciens caches SANS verifier que le nouveau contenait de quoi
        ouvrir l'app.

   Les trois regles qui en decoulent, et qu'il ne faut plus jamais enfreindre :
     · on met en cache ASSET PAR ASSET, jamais avec `addAll` ;
     · une navigation rend TOUJOURS une `Response`, jamais `undefined` ;
     · on ne fait le menage QUE si le nouveau cache sait ouvrir l'app.
   ═══════════════════════════════════════════════════════════════════════════════════════ */
const CACHE_NAME = 'canal7-v2416';
const SHARE_CACHE = 'canal7-share';

/* VITAL : ce sans quoi l'app ne peut pas s'ouvrir hors reseau. */
const ESSENTIELS = ['./index.html', './'];
/* CONFORT : utile hors reseau, mais son absence ne doit RIEN casser.
   v1589 — les 8 bibliotheques sont maintenant LOCALES (`lib/`). Elles restent en BONUS et
   non en ESSENTIELS : la regle de la v1556 ne change pas, un echec de mise en cache ne doit
   jamais empecher l'app de s'ouvrir. Etant locales, elles ne peuvent plus echouer a cause
   d'un plateau sans internet — c'est justement le but.
   Leaflet en fait desormais partie : la carte n'avait aucun fond hors reseau. */
const BONUS = [
  './manifest.json',
  './icon192.png',
  './icon512.png',
  './lib/jspdf.umd.min.js',
  './lib/jspdf.plugin.autotable.min.js',
  './lib/xlsx.full.min.js',
  './lib/mammoth.browser.min.js',
  './lib/pdf.min.js',
  './lib/pdf.worker.min.js',
  './lib/leaflet.min.js',
  './lib/leaflet.min.css'
];

/* Met en cache un par un et ENCAISSE les echecs. C'est toute la difference avec `addAll`. */
async function _garder(cache, liste) {
  await Promise.all(liste.map(async function (u) {
    try {
      const r = await fetch(u, { cache: 'reload' });
      if (r && (r.ok || r.type === 'opaque')) await cache.put(u, r);
    } catch (e) { /* celui-la manquera, tant pis : l'app s'ouvre quand meme */ }
  }));
}

self.addEventListener('install', function (e) {
  e.waitUntil((async function () {
    const cache = await caches.open(CACHE_NAME);
    await _garder(cache, ESSENTIELS);
    /* Le serveur peut etre coupe pile pendant la mise a jour. Plutot que de laisser un cache
       sans page, on REPREND l'index.html de l'ancien cache : une version en retard vaut
       infiniment mieux qu'une app qui ne s'ouvre plus. */
    if (!(await cache.match('./index.html'))) {
      const vieux = await caches.match('./index.html');
      if (vieux) await cache.put('./index.html', vieux.clone());
    }
    await _garder(cache, BONUS);   // jamais bloquant
  })());
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async function () {
    const cache = await caches.open(CACHE_NAME);
    const pret = !!(await cache.match('./index.html'));
    // On ne supprime l'ancien cache QUE si le nouveau sait ouvrir l'app.
    if (pret) {
      const keys = await caches.keys();
      await Promise.all(keys
        .filter(function (k) { return k !== CACHE_NAME && k !== SHARE_CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }
    await self.clients.claim();
  })());
});

/* Page de secours : elle ne s'affiche que si l'app n'a jamais reussi a se mettre en cache ET
   que le serveur est injoignable. Elle dit quoi faire, au lieu d'un ecran blanc. */
const _SECOURS = '<!doctype html><html lang="fr"><meta charset="utf-8">'
  + '<meta name="viewport" content="width=device-width,initial-scale=1">'
  + '<title>Canal 7</title>'
  + '<body style="margin:0;font:16px/1.5 -apple-system,system-ui,sans-serif;background:#f0ede8;color:#333;'
  + 'display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center;">'
  + '<div><div style="font-size:22px;font-weight:700;margin-bottom:10px;">Canal 7</div>'
  + '<div style="color:#666;">Le serveur n\'est pas joignable et l\'app n\'a pas encore de copie hors ligne.</div>'
  + '<div style="color:#666;margin-top:10px;">Reconnecte-toi au serveur et recharge : la copie hors ligne se fera toute seule.</div>'
  + '<button onclick="location.reload()" style="margin-top:18px;padding:10px 18px;border:none;border-radius:8px;'
  + 'background:#111;color:#fff;font-size:15px;font-weight:600;">Réessayer</button></div></body></html>';

self.addEventListener('fetch', function (e) {
  const req = e.request;
  const url = new URL(req.url);

  // ── Web Share Target (Android) : réception d'un contact partagé (.vcf) ──
  if (req.method === 'POST' && url.searchParams.has('share-target')) {
    e.respondWith((async function () {
      let text = '';
      try {
        const form = await req.formData();
        const file = form.get('contact');
        if (file && typeof file.text === 'function') text = await file.text();
        if (!text) text = String(form.get('text') || '');
      } catch (err) { /* ignore */ }
      try {
        const cache = await caches.open(SHARE_CACHE);
        await cache.put('shared-contact', new Response(text || '', { headers: { 'Content-Type': 'text/plain' } }));
      } catch (err) { /* ignore */ }
      return Response.redirect('./index.html?shared=contact', 303);
    })());
    return;
  }

  /* v1908 — LES TUILES DE CARTE NE PASSENT PLUS PAR LE SERVICE WORKER (bug des trous gris,
     capture iPhone de Yo). Elles tombaient dans la branche « tout le reste » plus bas, qui
     transforme le moindre hoquet reseau en `new Response('', {status:504})` : une image vide,
     donc un carre GRIS definitif. Et le SW ne les met de toute facon jamais en cache
     (`resp.type === 'basic'` exclut le cross-origin), il n'y avait donc rien a y gagner.
     On les laisse au navigateur, comme on le fait deja pour nominatim / open-meteo. */
  if (req.url.includes('server.arcgisonline.com')) return;
  if (req.url.includes('nominatim.openstreetmap.org')) return;
  if (req.url.includes('api.open-meteo.com')) return;
  if (req.url.includes('archive-api.open-meteo.com')) return;
  if (req.url.includes('api.anthropic.com')) return;

  const isHTML = req.mode === 'navigate'
    || url.pathname === '/' || url.pathname.endsWith('/')
    || url.pathname.endsWith('index.html');

  if (isHTML) {
    // Les pages HTML sont précachées à l'install. On ne les réécrit JAMAIS depuis une
    // navigation (v2321 : plan-feux.html supprimé, seule la page index.html reste).
    const key = './index.html';
    e.respondWith((async function () {
      try {
        const r = await fetch(req);
        if (r) return r;
      } catch (err) { /* hors réseau : on sert la copie hors ligne */ }
      // v1556 : on rend TOUJOURS une Response — jamais `undefined` (voir l'en-tête du fichier).
      return (await caches.match(key))
          || (await caches.match('./index.html'))
          || (await caches.match('./'))
          || new Response(_SECOURS, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    })());
    return;
  }

  e.respondWith((async function () {
    const cached = await caches.match(req);
    if (cached) return cached;
    try {
      const resp = await fetch(req);
      if (resp && resp.status === 200 && resp.type === 'basic') {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(req, clone); }).catch(function () {});
      }
      return resp;
    } catch (err) {
      /* v1556 : une Response plutôt que `undefined` — mais surtout PAS index.html.
         L'ancien code renvoyait la page d'accueil pour n'importe quelle ressource manquante :
         un script absent recevait du HTML et le navigateur criait « SyntaxError: Unexpected
         token '<' », ce qui envoyait chercher un bug de code là où il n'y avait qu'un fichier
         hors ligne. */
      return new Response('', { status: 504, statusText: 'hors ligne' });
    }
  })());
});
