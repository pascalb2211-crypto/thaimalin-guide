/* ===================== SERVICE WORKER — THAÏ MALIN GUIDE PREMIUM =====================
   Mode hors ligne : met en cache les pages, les données JSON et les images
   pour que le guide reste consultable sans connexion après une première visite.

   Limites à connaître :
   - Les tuiles de la carte (OpenStreetMap) ne sont mises en cache qu'au fur et à
     mesure de la navigation : seules les zones déjà affichées en ligne restent
     visibles hors connexion.
   - Le calcul d'itinéraire (bouton "🧭 Itinéraire") a besoin d'internet, c'est un
     service en ligne (Leaflet Routing Machine / OSRM).
   - La géolocalisation ("Votre position") fonctionne hors ligne, mais le tracé
     d'itinéraire ci-dessus non.

   À incrémenter (CACHE_VERSION) à chaque mise à jour du contenu du site, pour que
   les visiteurs récupèrent la nouvelle version plutôt que l'ancienne mise en cache.
====================================================================================== */

const CACHE_VERSION = 'v2';
const CACHE_NAME = `thaimalin-guide-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  './',
  'index.html',
  'bangkok-premium.html',
  'phuket-premium.html',
  'krabi-premium.html',
  'koh-samui-premium.html',
  'chiang-mai-premium.html',
  'pattaya-premium.html',
  'hua-hin-premium.html',
  'koh-tao-premium.html',
  'koh-phangan-premium.html',
  'chiang-rai-premium.html',
  'phrases-utiles.html',
  'itineraire.html',
  'transport.html',
  'budget.html',
  'calendrier.html',
  'carnet.html',
  'checklist.html',
  'legendes.html',
  'seven-eleven.html',
  'quiz.html',
  'reunion.html',
  'glossaire.html',
  'marches.html',
  'presentation.html',

  'manifest.json',

  'assets/style.css',
  'assets/app.js',
  'assets/favicon.ico',
  'assets/favicon-16x16.png',
  'assets/favicon-32x32.png',
  'assets/favicon-192x192.png',
  'assets/icon-512x512.png',
  'assets/apple-touch-icon.png',

  'bangkok-districts.json',
  'bangkok-restaurants.json',
  'extras-bangkok.json',

  'phuket-districts.json',
  'phuket-restaurants.json',
  'extras-phuket.json',

  'krabi-districts.json',
  'krabi-restaurants.json',
  'extras-krabi.json',

  'koh-samui-districts.json',
  'koh-samui-restaurants.json',
  'extras-koh-samui.json',

  'chiang-mai-districts.json',
  'chiang-mai-restaurants.json',
  'extras-chiang-mai.json',

  'pattaya-districts.json',
  'pattaya-restaurants.json',
  'extras-pattaya.json',

  'hua-hin-districts.json',
  'hua-hin-restaurants.json',
  'extras-hua-hin.json',

  'koh-tao-districts.json',
  'koh-tao-restaurants.json',
  'extras-koh-tao.json',

  'koh-phangan-districts.json',
  'koh-phangan-restaurants.json',
  'extras-koh-phangan.json',

  'chiang-rai-districts.json',
  'chiang-rai-restaurants.json',
  'extras-chiang-rai.json',

  'mini-guide-thai-150-phrases-complet.json'
];

/* Installation : on précharge l'essentiel du site (pages + données + assets).
   On tolère l'échec d'une ressource individuelle pour ne pas bloquer toute
   l'installation si un fichier venait à manquer. */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.all(
        PRECACHE_URLS.map(url =>
          cache.add(url).catch(err => console.warn('Pré-cache échoué pour', url, err))
        )
      )
    ).then(() => self.skipWaiting())
  );
});

/* Activation : on supprime les anciennes versions du cache. */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

/* Stratégie de récupération :
   - Pages/données/assets du site (même origine, précachés) : cache d'abord,
     réseau en secours, et on remet à jour le cache silencieusement.
   - Images externes (Unsplash) et tuiles de carte (OpenStreetMap) : réseau
     d'abord, on les ajoute au cache au passage pour un usage hors ligne futur.
   - Le reste (API de routage, etc.) : réseau uniquement, pas de cache. */
self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;

  const url = new URL(req.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isImageOrTile = /images\.unsplash\.com|tile\.openstreetmap\.org/.test(url.hostname);

  if(isSameOrigin){
    event.respondWith(
      caches.match(req).then(cached => {
        const network = fetch(req).then(res => {
          if(res && res.status === 200){
            const copy = res.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
  } else if(isImageOrTile){
    event.respondWith(
      caches.open(CACHE_NAME).then(cache =>
        cache.match(req).then(cached => {
          const network = fetch(req).then(res => {
            if(res && res.status === 200){ cache.put(req, res.clone()); }
            return res;
          }).catch(() => cached);
          return cached || network;
        })
      )
    );
  }
  /* autres requêtes (routage, géolocalisation...) : comportement par défaut, réseau uniquement */
});
