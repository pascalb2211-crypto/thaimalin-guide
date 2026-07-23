/* ===================== APP THAÏ MALIN — PARTAGÉ ENTRE TOUTES LES DESTINATIONS =====================
   Ce fichier est commun à toutes les pages (Bangkok, Phuket, Krabi, Koh Samui, et les suivantes).
   Chaque page doit définir un objet window.THAIMALIN_CONFIG AVANT d'inclure ce script, avec :

   window.THAIMALIN_CONFIG = {
     citySlug: 'bangkok',          // sert à construire <citySlug>-districts.json / <citySlug>-restaurants.json
     cityLabel: 'Bangkok',         // utilisé dans les messages d'erreur
     mapCenter: [13.7563, 100.5018],
     mapZoom: 12,
     locationField: 'station',     // 'station' (villes avec métro) ou 'zone' (îles sans métro)
     locationIcon: '🚆'            // icône affichée à côté du champ ci-dessus ('🚆' ou '📍')
   };

   Voir bangkok-premium.html pour un exemple d'intégration complet.
====================================================================================================== */

const CONFIG = window.THAIMALIN_CONFIG || {};

/* ===================== INDICATEUR DE CHARGEMENT ===================== */

const loaderEl = document.createElement('div');
loaderEl.id = 'thaimalin-loader';
loaderEl.innerHTML = '<div class="thaimalin-spinner"></div><p>Chargement du guide…</p>';
document.body.appendChild(loaderEl);

function hideLoader(){
  const loader = document.getElementById('thaimalin-loader');
  if(!loader) return;
  loader.classList.add('hidden');
  setTimeout(()=> loader.remove(), 400);
}
const CITY = CONFIG.citySlug || 'ville';
const CITY_LABEL = CONFIG.cityLabel || CITY;

function restaurantMapsUrl(r){
  const locationHint = r.zone || r.station || '';
  const query = `${r.name} ${locationHint} ${CITY_LABEL} Thailand`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
const LOC_FIELD = CONFIG.locationField || 'zone';
const LOC_ICON = CONFIG.locationIcon || '📍';
const MAP_CENTER = CONFIG.mapCenter || [13.7563, 100.5018];
const MAP_ZOOM = CONFIG.mapZoom || 12;
const FAV_KEY = `thaimalin_favorites_${CITY}`;
const HOTEL_KEY = `thaimalin_hotel_${CITY}`;
const NOTES_KEY = `thaimalin_notes_${CITY}`;

/* ===================== DONNÉES ===================== */

let districts = [];
let restaurants = [];
let extras = { sites: [], transport: [], hotels: [], budget: [] };

/* ===================== SÉLECTEUR DE DEVISE ===================== */

let CURRENCY_EUR = false;
let THB_PER_EUR = 38.4; // taux indicatif de repli, remplacé par le taux réel dès que possible
let rateIsLive = false;

async function fetchLiveRate(){
  try{
    const res = await fetch('https://api.frankfurter.app/latest?from=EUR&to=THB');
    if(!res.ok) return;
    const data = await res.json();
    if(data && data.rates && data.rates.THB){
      THB_PER_EUR = data.rates.THB;
      rateIsLive = true;
      syncCurrencyButton();
    }
  } catch(e){
    console.warn('Taux de change en direct indisponible, taux de repli utilisé.', e);
  }
}

function convertText(str){
  if(!CURRENCY_EUR || !str) return str;
  return str.replace(/(\d[\d\s]*)(\s*[–-]\s*(\d[\d\s]*))?\s*THB/g, (match, n1, sep, n2) => {
    const num1 = parseInt(n1.replace(/\s/g,''), 10);
    if(isNaN(num1)) return match;
    const eur1 = Math.round(num1 / THB_PER_EUR);
    if(n2){
      const num2 = parseInt(n2.replace(/\s/g,''), 10);
      const eur2 = Math.round(num2 / THB_PER_EUR);
      return `${match} (≈ ${eur1}–${eur2} €)`;
    }
    return `${match} (≈ ${eur1} €)`;
  });
}

function toggleCurrency(){
  CURRENCY_EUR = !CURRENCY_EUR;
  renderSites();
  renderTransport();
  renderHotels();
  renderBudget();
  syncCurrencyButton();
}

function syncCurrencyButton(){
  const btn = document.getElementById('currencyToggle');
  if(!btn) return;
  const liveTag = rateIsLive ? ' (taux en direct)' : '';
  btn.textContent = CURRENCY_EUR ? '🇹🇭 Revenir aux THB' : `🇪🇺 Afficher en €${liveTag}`;
}

async function loadData(){
  fetchLiveRate();
  fetchWeather();
  const districtsFile = `${CITY}-districts.json`;
  const restaurantsFile = `${CITY}-restaurants.json`;
  const extrasFile = `extras-${CITY}.json`;
  try {
    const [dRes, rRes, eRes] = await Promise.all([
      fetch(districtsFile),
      fetch(restaurantsFile),
      fetch(extrasFile)
    ]);
    if(!dRes.ok || !rRes.ok || !eRes.ok) throw new Error('Fichier JSON introuvable');
    districts = await dRes.json();
    restaurants = await rRes.json();
    extras = await eRes.json();
  } catch(e){
    console.error(`Erreur de chargement des données ${CITY_LABEL} :`, e);
    document.body.insertAdjacentHTML('afterbegin',
      '<div style="background:#c0392b;color:#fff;padding:14px;text-align:center">'
      + `Impossible de charger les données (${districtsFile} / ${restaurantsFile} / ${extrasFile}). `
      + 'Vérifiez qu\'elles sont bien à côté de ce fichier HTML et que la page est servie en http(s), pas ouverte en local.</div>');
  }
  renderSites();
  renderTransport();
  renderHotels();
  renderBudget();
  renderDistricts();
  renderRestaurants('all');
  renderItinerary();
  initMap();
  injectStructuredData();
  if(hotelLocation){ placeHotelMarker(); renderHotelResults(); }
  renderCheapestTransport();
  hideLoader();
}

const catLabel = {street:"Street Food",gastro:"Gastronomique",rooftop:"Rooftop",cafe:"Café"};
const catColor = {street:"#e8983b",gastro:"#c0392b",rooftop:"#9b59b6",cafe:"#3d8bd4"};

/* ===================== NAV MOBILE ===================== */

const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');

navToggle.addEventListener('click', ()=>{
  const isOpen = navLinks.classList.toggle('open');
  navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
});
navLinks.querySelectorAll('a').forEach(link=>{
  link.addEventListener('click', ()=>{
    navLinks.classList.remove('open');
    navToggle.setAttribute('aria-expanded','false');
  });
});

/* ===================== MENU DESTINATIONS (correctif clic mobile) ===================== */
// Avant ce correctif, le menu <details class="dest-menu"> restait ouvert après un
// premier clic sur une destination (bug connu sur mobile/iOS avec <details>/<summary> :
// le premier tap ne fait qu'ouvrir/mettre le focus, il fallait retaper pour que le lien
// soit réellement pris en compte). On gère maintenant l'ouverture/fermeture nous-mêmes.
document.querySelectorAll('.dest-menu').forEach(menu => {
  const summary = menu.querySelector('summary');
  if(!summary) return;

  summary.addEventListener('click', e => {
    e.preventDefault();
    const isOpen = menu.hasAttribute('open');
    document.querySelectorAll('.dest-menu[open]').forEach(m => { if(m !== menu) m.removeAttribute('open'); });
    if(isOpen){ menu.removeAttribute('open'); }
    else{ menu.setAttribute('open', ''); }
  });

  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => { menu.removeAttribute('open'); });
  });
});

document.addEventListener('click', e => {
  document.querySelectorAll('.dest-menu[open]').forEach(menu => {
    if(!menu.contains(e.target)){ menu.removeAttribute('open'); }
  });
});

/* ===================== QUARTIERS ===================== */

const districtGrid = document.getElementById('districtGrid');
const districtSearch = document.getElementById('districtSearch');
const districtFilter = document.getElementById('districtFilter');

function renderDistricts(){
  const q = districtSearch.value.toLowerCase();
  const cat = districtFilter.value;
  districtGrid.innerHTML = districts
    .filter(d => d.name.toLowerCase().includes(q) && (cat==='all' || d.cat===cat))
    .map(d => `
      <article class="tile">
        <img src="${d.img}" alt="${d.emoji} ${d.name}" loading="lazy">
        <div class="body">
          <h3>${d.emoji} ${d.name}</h3>
          <p>${d.desc}</p>
          <p><strong>Attractions :</strong> ${d.attractions}</p>
          <p><strong>Restaurant conseillé :</strong> ${d.restaurant}</p>
          <p><strong>Hôtel conseillé :</strong> ${d.hotel}</p>
          <p class="tip">${d.tip}</p>
        </div>
      </article>
    `).join('');
}
districtSearch.addEventListener('input', renderDistricts);
districtFilter.addEventListener('change', renderDistricts);

/* ===================== INCONTOURNABLES / TRANSPORT / HÔTELS / BUDGET ===================== */

function fieldLine(label, value){
  return value ? `<p><strong>${label} :</strong> ${convertText(value)}</p>` : '';
}

function renderSites(){
  const grid = document.getElementById('sitesGrid');
  if(!grid) return;
  grid.innerHTML = extras.sites.map(s => `
    <div class="card">
      <h3>${s.name}</h3>
      <p>${s.desc}</p>
      ${fieldLine('🎟️', s.price)}
      ${fieldLine('🕒', s.hours)}
      ${s.tip ? `<p class="tip">${s.tip}</p>` : ''}
    </div>
  `).join('');
}

function renderTransport(){
  const grid = document.getElementById('transportGrid');
  if(!grid) return;
  grid.innerHTML = extras.transport.map(t => `
    <div class="card">
      <h3>${t.icon} ${t.title}</h3>
      <p>${t.desc}</p>
      ${fieldLine('💰 Prix', t.price)}
      ${fieldLine('🕒 Horaires', t.hours)}
      ${t.tip ? `<p class="tip">${t.tip}</p>` : ''}
      ${t.buttonUrl ? `<p><a class="btn" style="padding:10px 20px;font-size:14px" href="${t.buttonUrl}" target="_blank" rel="noopener">${t.buttonText}</a></p>` : ''}
    </div>
  `).join('');
}

function renderHotels(){
  const grid = document.getElementById('hotelsGrid');
  if(!grid) return;
  grid.innerHTML = extras.hotels.map(h => `
    <div class="card">
      <h3>${h.tier}</h3>
      <p>${h.desc}</p>
      <p><strong>💰 ${convertText(h.price)}</strong></p>
      <p><a class="btn" style="padding:10px 20px;font-size:14px" href="${h.bookingUrl}" target="_blank" rel="noopener">Voir sur Booking.com</a></p>
    </div>
  `).join('');
}

function renderBudget(){
  const grid = document.getElementById('budgetGrid');
  if(!grid) return;
  grid.innerHTML = extras.budget.map(b => `
    <div class="card">
      <h3>${b.icon} ${b.tier} — ${convertText(b.price)}</h3>
      <p>${b.desc}</p>
    </div>
  `).join('');
}

/* ===================== DONNÉES STRUCTURÉES SCHEMA.ORG ===================== */

function injectStructuredData(){
  const graph = [];

  restaurants.forEach(r=>{
    graph.push({
      "@type": "Restaurant",
      "name": r.name,
      "description": r.desc,
      "servesCuisine": r.spec,
      "priceRange": r.price,
      "geo": {
        "@type": "GeoCoordinates",
        "latitude": r.lat,
        "longitude": r.lng
      },
      "address": {
        "@type": "PostalAddress",
        "addressLocality": r[LOC_FIELD],
        "addressCountry": "TH"
      }
    });
  });

  extras.sites.forEach(s=>{
    graph.push({
      "@type": "TouristAttraction",
      "name": s.name,
      "description": s.desc
    });
  });

  const data = {
    "@context": "https://schema.org",
    "@graph": graph
  };

  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(data);
  document.head.appendChild(script);
}

/* ===================== FICHES RESTAURANTS ===================== */

const restGrid = document.getElementById('restGrid');
const restToolbar = document.getElementById('restToolbar');

let favorites;
try {
  favorites = new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]'));
} catch(e) {
  favorites = new Set(); // localStorage indisponible (aperçu isolé, navigation privée...) : favoris en mémoire uniquement
}

function saveFavorites(){
  try { localStorage.setItem(FAV_KEY, JSON.stringify([...favorites])); }
  catch(e) { /* stockage indisponible, on continue en mémoire */ }
}

let personalNotes;
try {
  personalNotes = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}');
} catch(e) {
  personalNotes = {}; // notes en mémoire uniquement si le stockage est indisponible
}

function saveNotes(){
  try { localStorage.setItem(NOTES_KEY, JSON.stringify(personalNotes)); }
  catch(e) { /* stockage indisponible, on continue en mémoire */ }
}

function updateNote(el, name){
  personalNotes[name] = el.value;
  saveNotes();
}

function renderRestaurants(cat){
  const list = restaurants.filter(r => cat==='all' || r.cat===cat);
  restGrid.innerHTML = list.map(r => `
    <article class="tile" data-name="${r.name}">
      <img src="${r.img}" alt="${r.name}" loading="lazy">
      <div class="body">
        <span class="badge b-${r.cat}">${catLabel[r.cat]}</span>
        <h3>${r.name}</h3>
        <p>${r.desc}</p>
        <p><strong>Prix :</strong> ${r.price} · <strong>Horaires :</strong> ${r.hours}</p>
        <p><strong>⭐ Note Thaï Malin :</strong> ${r.note} · <strong>${LOC_ICON}</strong> ${r[LOC_FIELD]}</p>
        <p class="tip">${r.tip}</p>
        <p><a href="${restaurantMapsUrl(r)}" target="_blank" rel="noopener" class="btn" style="display:inline-block;font-size:13px;padding:6px 12px;margin-top:4px">📍 Voir sur Maps / Réserver par téléphone</a></p>
        <button class="fav-btn" onclick="toggleFav(this,'${r.name.replace(/'/g,"\\'")}')">☆ Ajouter aux favoris</button>
        <div class="note-wrap" style="display:${favorites.has(r.name) ? 'block' : 'none'};margin-top:8px">
          <textarea class="personal-note" placeholder="📝 Note personnelle (ex : réserver avant 19h, demander la terrasse...)"
            style="width:100%;min-height:50px;padding:8px;border-radius:8px;border:1px solid #444;background:#1a1e26;color:#fff;font-size:13px;resize:vertical"
            oninput="updateNote(this,'${r.name.replace(/'/g,"\\'")}')">${(personalNotes[r.name] || '').replace(/</g,'&lt;')}</textarea>
        </div>
      </div>
    </article>
  `).join('');
  syncFavButtons();
}

function toggleFav(btn, name){
  if(favorites.has(name)){ favorites.delete(name); }
  else{ favorites.add(name); }
  saveFavorites();
  syncFavButtons();
  const noteWrap = btn.closest('.tile') ? btn.closest('.tile').querySelector('.note-wrap') : null;
  if(noteWrap){ noteWrap.style.display = favorites.has(name) ? 'block' : 'none'; }
  renderItinerary();
}

function syncFavButtons(){
  document.querySelectorAll('.fav-btn').forEach(btn=>{
    const name = btn.getAttribute('onclick').match(/'([^']+)'/)[1];
    if(favorites.has(name)){ btn.classList.add('on'); btn.innerHTML='★ Ajouté aux favoris'; }
    else{ btn.classList.remove('on'); btn.innerHTML='☆ Ajouter aux favoris'; }
  });
}

restToolbar.addEventListener('click', e=>{
  if(e.target.tagName!=='BUTTON') return;
  restToolbar.querySelectorAll('button').forEach(b=>b.classList.remove('active'));
  e.target.classList.add('active');
  renderRestaurants(e.target.dataset.cat);
});

/* ===================== CARTE INTERACTIVE ===================== */

let map, clusterGroup, routeControl, userMarker;

function initMap(){
  if(typeof L === 'undefined') return;

  map = L.map('leafletMap').setView(MAP_CENTER, MAP_ZOOM);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap contributors'
  }).addTo(map);

  clusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    zoomToBoundsOnClick: true,
    maxClusterRadius: 60
  });

  renderMapMarkers('all');
  map.addLayer(clusterGroup);

  map.on('click', e => {
    if(hotelPlacementMode){
      setHotelFromClick(e.latlng.lat, e.latlng.lng);
      hotelPlacementMode = false;
      const hint = document.getElementById('hotelMapHint');
      if(hint){ hint.style.display = 'none'; }
    }
  });

  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(pos=>{
      const {latitude, longitude} = pos.coords;
      userMarker = L.circleMarker([latitude, longitude], {color:'#fff', fillColor:'#1e88e5', fillOpacity:1})
        .addTo(map).bindPopup('Votre position');
    });
  }
}

function popupHTML(r){
  return `
    <strong>${r.name}</strong><br>
    ${catLabel[r.cat]} · ${r.price}<br>
    ⭐ ${r.note} · ${LOC_ICON} ${r[LOC_FIELD]}<br>
    🍽️ ${r.spec}<br><br>
    <button onclick="startRouteTo(${r.lat},${r.lng})">🧭 Itinéraire</button>
  `;
}

function renderMapMarkers(cat){
  if(!clusterGroup) return;
  clusterGroup.clearLayers();
  const list = cat === 'favorites'
    ? restaurants.filter(r => favorites.has(r.name))
    : restaurants.filter(r => cat==='all' || r.cat===cat);
  list.forEach(r=>{
      const icon = L.divIcon({
        className:'',
        html:`<div style="background:${catColor[r.cat]};width:16px;height:16px;border-radius:50%;border:2px solid white;"></div>`,
        iconSize:[16,16]
      });
      const marker = L.marker([r.lat, r.lng], {icon});
      marker.bindPopup(popupHTML(r));
      clusterGroup.addLayer(marker);
    });
}

function startRouteTo(lat,lng){
  if(!navigator.geolocation){ alert("La géolocalisation n'est pas disponible."); return; }
  navigator.geolocation.getCurrentPosition(pos=>{
    if(routeControl){ map.removeControl(routeControl); }
    routeControl = L.Routing.control({
      waypoints: [
        L.latLng(pos.coords.latitude, pos.coords.longitude),
        L.latLng(lat, lng)
      ],
      routeWhileDragging:false,
      show:true,
      addWaypoints:false,
      draggableWaypoints:false,
      fitSelectedRoutes:true
    }).addTo(map);
  }, err=>{
    alert("Impossible d'obtenir votre position : "+err.message);
  });
}

/* ===================== MON ITINÉRAIRE ===================== */

function buildItinerarySection(){
  const section = document.createElement('section');
  section.id = 'mon-itineraire';
  section.innerHTML = `
    <h2>★ Mon itinéraire</h2>
    <p>Retrouve ici tous les restaurants ajoutés en favori depuis la section Restaurants — prêts à consulter ou imprimer avant de partir.</p>
    <div id="itineraireList" class="rest-grid"></div>
    <p id="itineraireEmpty" class="tip" style="display:none">Aucun favori pour l'instant — clique sur ☆ sur une fiche restaurant pour l'ajouter ici.</p>
    <p>
      <button id="itineraireOptimizeBtn" class="btn" style="border:none;cursor:pointer">📍 Optimiser l'ordre par proximité</button>
      <button id="itineraireResetBtn" class="btn" style="border:none;cursor:pointer;background:transparent;border:1px solid var(--gold);color:#fff">↺ Ordre par défaut</button>
      <button id="itinerairePrintBtn" class="btn" style="border:none;cursor:pointer">🖨️ Imprimer mon itinéraire</button>
      <button id="itineraireGpxBtn" class="btn" style="border:none;cursor:pointer;background:transparent;border:1px solid var(--gold);color:#fff">📥 Exporter en GPX</button>
    </p>
    <p id="itineraireStatus" class="tip"></p>
  `;
  const footer = document.querySelector('footer');
  if(footer && footer.parentNode){ footer.parentNode.insertBefore(section, footer); }

  const printBtn = document.getElementById('itinerairePrintBtn');
  if(printBtn){ printBtn.addEventListener('click', ()=> window.print()); }

  const gpxBtn = document.getElementById('itineraireGpxBtn');
  if(gpxBtn){ gpxBtn.addEventListener('click', downloadFavoritesGpx); }

  const optimizeBtn = document.getElementById('itineraireOptimizeBtn');
  if(optimizeBtn){ optimizeBtn.addEventListener('click', optimizeItinerary); }

  const resetBtn = document.getElementById('itineraireResetBtn');
  if(resetBtn){ resetBtn.addEventListener('click', ()=>{
    itineraryOrder = null;
    const status = document.getElementById('itineraireStatus');
    if(status){ status.textContent = ''; }
    renderItinerary();
  }); }

  if(navLinks){
    const link = document.createElement('a');
    link.href = '#mon-itineraire';
    link.textContent = '★ Mon itinéraire';
    link.addEventListener('click', ()=>{
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded','false');
    });
    navLinks.appendChild(link);

    const currencyBtn = document.createElement('a');
    currencyBtn.href = '#';
    currencyBtn.id = 'currencyToggle';
    currencyBtn.textContent = '🇪🇺 Afficher en €';
    currencyBtn.addEventListener('click', (e)=>{
      e.preventDefault();
      toggleCurrency();
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded','false');
    });
    navLinks.appendChild(currencyBtn);
  }

  const mapToolbar = document.querySelector('#carte .toolbar');
  if(mapToolbar){
    const favBtn = document.createElement('button');
    favBtn.dataset.mapcat = 'favorites';
    favBtn.textContent = '★ Mes favoris';
    mapToolbar.appendChild(favBtn);
  }
}

/* ===================== ITINÉRAIRE OPTIMISÉ PAR PROXIMITÉ ===================== */

let itineraryOrder = null; // tableau de noms de restaurants dans l'ordre optimisé, ou null = ordre par défaut

function haversineKm(lat1, lng1, lat2, lng2){
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) ** 2
    + Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) * Math.sin(dLng/2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function greedyOrder(favRestaurants, startLat, startLng){
  const remaining = [...favRestaurants];
  const ordered = [];
  let curLat = startLat, curLng = startLng;
  while(remaining.length){
    let bestIdx = 0, bestDist = Infinity;
    remaining.forEach((r, i) => {
      const d = haversineKm(curLat, curLng, r.lat, r.lng);
      if(d < bestDist){ bestDist = d; bestIdx = i; }
    });
    const next = remaining.splice(bestIdx, 1)[0];
    ordered.push(next);
    curLat = next.lat; curLng = next.lng;
  }
  return ordered;
}

function applyOptimizedOrder(ordered, fromLabel){
  itineraryOrder = ordered.map(r => r.name);
  renderItinerary();
  const status = document.getElementById('itineraireStatus');
  if(status){ status.textContent = `Ordre optimisé par proximité (${fromLabel}).`; }
}

function optimizeItinerary(){
  const favRestaurants = restaurants.filter(r => favorites.has(r.name));
  if(favRestaurants.length < 2){ return; }

  if(hotelLocation){
    const ordered = greedyOrder(favRestaurants, hotelLocation.lat, hotelLocation.lng);
    applyOptimizedOrder(ordered, 'depuis votre hôtel');
    return;
  }

  if(navigator.geolocation){
    navigator.geolocation.getCurrentPosition(
      pos => {
        const ordered = greedyOrder(favRestaurants, pos.coords.latitude, pos.coords.longitude);
        applyOptimizedOrder(ordered, 'depuis votre position actuelle');
      },
      () => {
        const first = favRestaurants[0];
        const ordered = greedyOrder(favRestaurants, first.lat, first.lng);
        applyOptimizedOrder(ordered, `en partant de ${first.name}, position non disponible`);
      }
    );
  } else {
    const first = favRestaurants[0];
    const ordered = greedyOrder(favRestaurants, first.lat, first.lng);
    applyOptimizedOrder(ordered, `en partant de ${first.name}`);
  }
}

function downloadFavoritesGpx(){
  let favRestaurants = restaurants.filter(r => favorites.has(r.name) && r.lat && r.lng);
  if(itineraryOrder){
    const orderMap = new Map(itineraryOrder.map((name, i) => [name, i]));
    const known = favRestaurants.filter(r => orderMap.has(r.name)).sort((a,b) => orderMap.get(a.name) - orderMap.get(b.name));
    const newOnes = favRestaurants.filter(r => !orderMap.has(r.name));
    favRestaurants = known.concat(newOnes);
  }
  if(favRestaurants.length === 0) return;

  const escapeXml = s => (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const gpxBody = favRestaurants.map((r, i) => `
  <wpt lat="${r.lat}" lon="${r.lng}">
    <name>${escapeXml(`${i+1}. ${r.name}`)}</name>
    <desc>${escapeXml(r.tip || r.desc || '')}</desc>
  </wpt>`).join('');

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Thaï Malin" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${escapeXml(`Mon itinéraire ${CITY_LABEL}`)}</name></metadata>${gpxBody}
</gpx>`;

  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `thaimalin-${CITY}-favoris.gpx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderItinerary(){
  const list = document.getElementById('itineraireList');
  const empty = document.getElementById('itineraireEmpty');
  if(!list) return;
  let favRestaurants = restaurants.filter(r => favorites.has(r.name));

  if(itineraryOrder){
    const orderMap = new Map(itineraryOrder.map((name, i) => [name, i]));
    const known = favRestaurants
      .filter(r => orderMap.has(r.name))
      .sort((a, b) => orderMap.get(a.name) - orderMap.get(b.name));
    const newOnes = favRestaurants.filter(r => !orderMap.has(r.name));
    favRestaurants = known.concat(newOnes); // les favoris ajoutés après l'optimisation arrivent en fin de liste
  }

  if(favRestaurants.length === 0){
    list.innerHTML = '';
    if(empty) empty.style.display = 'block';
    return;
  }
  if(empty) empty.style.display = 'none';
  list.innerHTML = favRestaurants.map((r, i) => `
    <article class="tile">
      <img src="${r.img}" alt="${r.name}" loading="lazy">
      <div class="body">
        <span class="badge b-${r.cat}">${itineraryOrder ? `Étape ${i+1} · ` : ''}${catLabel[r.cat]}</span>
        <h3>${r.name}</h3>
        <p>${r.desc}</p>
        <p><strong>Prix :</strong> ${r.price} · <strong>Horaires :</strong> ${r.hours}</p>
        <p><strong>${LOC_ICON}</strong> ${r[LOC_FIELD]}</p>
        <p class="tip">${r.tip}</p>
        <p><a href="${restaurantMapsUrl(r)}" target="_blank" rel="noopener" class="btn" style="display:inline-block;font-size:13px;padding:6px 12px;margin-top:4px">📍 Voir sur Maps / Réserver par téléphone</a></p>
        <div class="note-wrap" style="margin-top:8px">
          <textarea class="personal-note" placeholder="📝 Note personnelle (ex : réserver avant 19h, demander la terrasse...)"
            style="width:100%;min-height:50px;padding:8px;border-radius:8px;border:1px solid #444;background:#1a1e26;color:#fff;font-size:13px;resize:vertical"
            oninput="updateNote(this,'${r.name.replace(/'/g,"\\'")}')">${(personalNotes[r.name] || '').replace(/</g,'&lt;')}</textarea>
        </div>
      </div>
    </article>
  `).join('');
}

/* ===================== MON HÔTEL : LIEUX À PROXIMITÉ ===================== */

let hotelLocation = null; // { lat, lng, label }
let hotelMarker = null;
let hotelPlacementMode = false;

const ISLAND_CITIES = ['koh-tao', 'koh-phangan', 'koh-samui', 'koh-chang'];
const METRO_CITIES = ['bangkok', 'chiang-mai'];

function loadHotel(){
  try{
    const raw = localStorage.getItem(HOTEL_KEY);
    if(raw) hotelLocation = JSON.parse(raw);
  } catch(e){ hotelLocation = null; }
}

function saveHotel(){
  try{ localStorage.setItem(HOTEL_KEY, JSON.stringify(hotelLocation)); }
  catch(e){ /* stockage indisponible, on continue en mémoire */ }
}

function suggestTransport(distanceKm){
  const isIsland = ISLAND_CITIES.includes(CITY);
  const hasMetro = METRO_CITIES.includes(CITY);

  if(distanceKm < 1) return { icon:'🚶', label:'À pied', speed:5 };
  if(isIsland && distanceKm >= 2) return { icon:'🛵', label:'Location de scooter', speed:30 };
  if(distanceKm < 3) return { icon:'🛺', label:'Tuk-tuk / songthaew', speed:20 };
  if(distanceKm < 8){
    return hasMetro
      ? { icon:'🚆', label:'BTS/MRT ou Taxi/Grab', speed:25 }
      : { icon:'🚕', label:'Taxi / Grab', speed:28 };
  }
  return { icon:'🚌', label:'Grab longue distance / bus', speed:35 };
}

function estimateMinutes(distanceKm, speedKmh){
  return Math.max(1, Math.round((distanceKm / speedKmh) * 60));
}

async function searchHotel(){
  const input = document.getElementById('hotelSearch');
  const status = document.getElementById('hotelStatus');
  const q = input.value.trim();
  if(!q) return;
  status.textContent = 'Recherche en cours...';
  try{
    const viewbox = [MAP_CENTER[1]-0.3, MAP_CENTER[0]+0.3, MAP_CENTER[1]+0.3, MAP_CENTER[0]-0.3].join(',');
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&viewbox=${viewbox}&bounded=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    const data = await res.json();
    if(!data.length){
      status.textContent = "Aucun résultat trouvé près de cette destination. Essaie avec le nom du quartier, ou clique directement sur la carte plus bas.";
      return;
    }
    hotelLocation = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: q };
    saveHotel();
    status.textContent = `📍 Hôtel positionné : ${data[0].display_name.split(',').slice(0,3).join(',')}`;
    renderHotelResults();
    placeHotelMarker();
  } catch(e){
    status.textContent = "Erreur de recherche — vérifie ta connexion, ou clique directement sur la carte plus bas.";
    console.error('Erreur de géocodage hôtel :', e);
  }
}

function activateHotelMapPlacement(){
  hotelPlacementMode = true;
  const status = document.getElementById('hotelStatus');
  if(status){ status.textContent = '👉 Clique à l\'endroit de ton hôtel sur la carte interactive (section Carte, plus bas).'; }
  const carte = document.getElementById('carte');
  if(carte){ carte.scrollIntoView({behavior:'smooth'}); }
}

function setHotelFromClick(lat, lng){
  hotelLocation = { lat, lng, label: 'Position choisie sur la carte' };
  saveHotel();
  const status = document.getElementById('hotelStatus');
  if(status){ status.textContent = '📍 Hôtel positionné sur la carte.'; }
  renderHotelResults();
  placeHotelMarker();
}

function placeHotelMarker(){
  if(!map || !hotelLocation) return;
  if(hotelMarker){ map.removeLayer(hotelMarker); }
  hotelMarker = L.marker([hotelLocation.lat, hotelLocation.lng], {
    icon: L.divIcon({ className:'', html:'<div style="font-size:26px;line-height:1">🏨</div>', iconSize:[28,28] })
  }).addTo(map).bindPopup('Mon hôtel');
}

function renderHotelResults(){
  const container = document.getElementById('hotelResultsList');
  if(!container || !hotelLocation) return;

  const restaurantItems = restaurants
    .filter(r => r.lat && r.lng)
    .map(r => ({ type:'Restaurant', icon:'🍽️', name:r.name, lat:r.lat, lng:r.lng, extra:catLabel[r.cat] || '' }));

  const districtItems = districts
    .filter(d => d.lat && d.lng)
    .map(d => ({ type:'Quartier', icon: d.emoji || '📍', name:d.name, lat:d.lat, lng:d.lng, extra:'' }));

  const siteItems = (extras.sites || [])
    .filter(s => s.lat && s.lng)
    .map(s => ({ type:'Incontournable', icon:'🏛️', name:s.name, lat:s.lat, lng:s.lng, extra:'' }));

  const all = [...restaurantItems, ...districtItems, ...siteItems]
    .map(item => {
      const dist = haversineKm(hotelLocation.lat, hotelLocation.lng, item.lat, item.lng);
      const transport = suggestTransport(dist);
      const minutes = estimateMinutes(dist, transport.speed);
      return { ...item, dist, transport, minutes };
    })
    .sort((a, b) => a.dist - b.dist)
    .slice(0, 30);

  if(all.length === 0){
    container.innerHTML = '<p class="tip">Pas encore de coordonnées GPS disponibles pour les quartiers/incontournables de cette destination — seuls les restaurants s\'affichent ici pour l\'instant dès qu\'ils ont des coordonnées.</p>';
    return;
  }

  container.innerHTML = `<div class="grid">` + all.map(item => `
    <div class="card">
      <h3>${item.icon} ${item.name}</h3>
      <p><small>${item.type}${item.extra ? ' · ' + item.extra : ''}</small></p>
      <p><strong>${item.dist < 1 ? Math.round(item.dist*1000)+' m' : item.dist.toFixed(1)+' km'}</strong> · ${item.transport.icon} ${item.transport.label} · ~${item.minutes} min</p>
    </div>
  `).join('') + `</div>`;
}

function buildHotelSection(){
  const section = document.createElement('section');
  section.id = 'mon-hotel';
  section.innerHTML = `
    <h2>🏨 Près de mon hôtel</h2>
    <p>Indique le nom ou l'adresse de ton hôtel pour découvrir les restaurants, quartiers et incontournables les plus proches, avec le trajet le plus adapté pour t'y rendre.</p>
    <div class="toolbar">
      <input id="hotelSearch" type="text" placeholder="Nom ou adresse de l'hôtel...">
      <button id="hotelSearchBtn" class="btn" style="border:none;cursor:pointer">🔍 Chercher</button>
      <button id="hotelMapBtn" class="btn" style="border:none;cursor:pointer;background:transparent;border:1px solid var(--gold);color:#fff">🗺️ Choisir sur la carte</button>
    </div>
    <p id="hotelStatus" class="tip"></p>
    <div id="hotelResultsList"></div>
  `;
  const hotelTarget = document.querySelector('#mon-itineraire') || document.querySelector('footer');
  if(hotelTarget && hotelTarget.parentNode){ hotelTarget.parentNode.insertBefore(section, hotelTarget); }

  const searchBtn = document.getElementById('hotelSearchBtn');
  if(searchBtn){ searchBtn.addEventListener('click', searchHotel); }

  const searchInput = document.getElementById('hotelSearch');
  if(searchInput){
    searchInput.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); searchHotel(); } });
  }

  const mapBtn = document.getElementById('hotelMapBtn');
  if(mapBtn){ mapBtn.addEventListener('click', activateHotelMapPlacement); }

  if(navLinks){
    const link = document.createElement('a');
    link.href = '#mon-hotel';
    link.textContent = '🏨 Mon hôtel';
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
    navLinks.appendChild(link);
  }

  loadHotel();
  if(hotelLocation){ renderHotelResults(); }
}

/* ===================== SURPRENDS-MOI : RESTAURANT ===================== */
let lastSurpriseRestaurant = null;

function buildRestaurantSurprise(){
  const toolbar = document.getElementById('restToolbar');
  if(!toolbar) return;

  const btn = document.createElement('button');
  btn.id = 'restSurpriseBtn';
  btn.textContent = '🎲 Surprends-moi';
  btn.style.marginLeft = 'auto';
  btn.style.background = 'transparent';
  btn.style.border = '1px solid var(--gold, #d4af37)';
  btn.style.color = '#fff';
  toolbar.appendChild(btn);

  const reveal = document.createElement('div');
  reveal.id = 'restSurpriseReveal';
  reveal.style.margin = '16px 0';
  toolbar.parentNode.insertBefore(reveal, toolbar.nextSibling);

  btn.addEventListener('click', () => {
    const activeCatBtn = toolbar.querySelector('button.active');
    const catFilter = activeCatBtn ? activeCatBtn.dataset.cat : 'all';
    let pool = restaurants.filter(r => catFilter === 'all' || r.cat === catFilter);
    if(pool.length === 0) pool = restaurants;
    let candidates = pool.filter(r => r.name !== lastSurpriseRestaurant);
    if(candidates.length === 0) candidates = pool;
    if(candidates.length === 0) return;

    reveal.innerHTML = '<p class="tip">🎲 Tirage en cours...</p>';

    setTimeout(() => {
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      lastSurpriseRestaurant = pick.name;
      reveal.innerHTML = `
        <article class="tile" style="border:2px solid var(--gold, #d4af37)">
          <img src="${pick.img}" alt="${pick.name}" loading="lazy">
          <div class="body">
            <span class="badge b-${pick.cat}">🎉 Surprise du jour · ${catLabel[pick.cat]}</span>
            <h3>${pick.name}</h3>
            <p>${pick.desc}</p>
            <p><strong>Prix :</strong> ${pick.price} · <strong>Horaires :</strong> ${pick.hours}</p>
            <p><strong>⭐ Note Thaï Malin :</strong> ${pick.note} · <strong>${LOC_ICON}</strong> ${pick[LOC_FIELD]}</p>
            <p class="tip">${pick.tip}</p>
            <p><a href="${restaurantMapsUrl(pick)}" target="_blank" rel="noopener" class="btn" style="display:inline-block;font-size:13px;padding:6px 12px;margin-top:4px">📍 Voir sur Maps / Réserver par téléphone</a></p>
            <button class="fav-btn" onclick="toggleFav(this,'${pick.name.replace(/'/g,"\\'")}')">☆ Ajouter aux favoris</button>
            <div class="note-wrap" style="display:${favorites.has(pick.name) ? 'block' : 'none'};margin-top:8px">
              <textarea class="personal-note" placeholder="📝 Note personnelle (ex : réserver avant 19h, demander la terrasse...)"
                style="width:100%;min-height:50px;padding:8px;border-radius:8px;border:1px solid #444;background:#1a1e26;color:#fff;font-size:13px;resize:vertical"
                oninput="updateNote(this,'${pick.name.replace(/'/g,"\\'")}')">${(personalNotes[pick.name] || '').replace(/</g,'&lt;')}</textarea>
            </div>
          </div>
        </article>
      `;
      syncFavButtons();
    }, 600);
  });
}

/* ===================== MODE JOUR DE PLUIE ===================== */
const RAINY_DAY = {
  'bangkok': [
    { icon:'🛍️', name:'ICONSIAM / Siam Paragon', desc:"Deux des plus grands centres commerciaux d'Asie, largement de quoi occuper une journée entière au sec." },
    { icon:'🖼️', name:'Jim Thompson House & Museum', desc:"Maison-musée en teck consacrée à la soie thaïe, en grande partie couverte." },
    { icon:'💆', name:'Spa & massage thaï', desc:"Health Land ou un spa d'hôtel — le moment parfait pour un massage de 2h." },
    { icon:'🎬', name:'Cinéma en VOST', desc:"Les salles IMAX/4DX d'ICONSIAM ou de Central World projettent souvent en anglais sous-titré thaï." },
    { icon:'🏛️', name:'Museum Siam', desc:"Musée interactif sur l'histoire et l'identité thaïe, ludique et entièrement couvert." }
  ],
  'phuket': [
    { icon:'🛍️', name:'Central Phuket (Floresta & Festival)', desc:"Le plus grand centre commercial de l'île, boutiques, cinéma et restaurants." },
    { icon:'🏛️', name:'Thai Hua Museum', desc:"Musée sino-portugais dans une ancienne école, au cœur de Phuket Old Town." },
    { icon:'💆', name:'Spa & massage thaï', desc:"Let's Relax ou un spa d'hôtel pour une après-midi détente à l'abri." },
    { icon:'🐠', name:'Phuket Aquarium', desc:"Aquarium couvert à Cape Panwa, sympa en famille par mauvais temps." },
    { icon:'🍳', name:'Cours de cuisine thaïe', desc:"La majorité des cours se déroulent en cuisine couverte, quelle que soit la météo." }
  ],
  'krabi': [
    { icon:'🛍️', name:'Vogue Department Store', desc:"Le principal centre commercial de Krabi Town, pratique par jour de pluie." },
    { icon:'💆', name:'Spa & massage thaï', desc:"De nombreux spas à Ao Nang proposent des formules à la demi-journée." },
    { icon:'🍳', name:'Cours de cuisine thaïe', desc:"Cours couverts très populaires à Ao Nang, une bonne activité de repli." },
    { icon:'🎬', name:'Cinéma', desc:"Salle de cinéma climatisée à Vogue Department Store, films VO parfois disponibles." }
  ],
  'koh-samui': [
    { icon:'🛍️', name:'Central Festival Samui', desc:"Centre commercial climatisé à Chaweng, boutiques, cinéma et food court." },
    { icon:'💆', name:'Spa & retraite bien-être', desc:"L'île est réputée pour ses spas haut de gamme, parfait plan B pluvieux." },
    { icon:'🍳', name:'Cours de cuisine thaïe', desc:"Ateliers couverts disponibles dans la plupart des grandes zones touristiques." },
    { icon:'🎬', name:'Cinéma', desc:"Salle de cinéma à Central Festival Samui, souvent en VO sous-titrée." }
  ],
  'chiang-mai': [
    { icon:'🛍️', name:'MAYA Lifestyle Shopping Center', desc:"Centre commercial moderne à Nimman, boutiques et restaurants sur plusieurs étages." },
    { icon:'🖼️', name:'MAIIAM Contemporary Art Museum', desc:"Musée d'art contemporain thaïlandais, entièrement couvert." },
    { icon:'💆', name:'Cours de massage thaï traditionnel', desc:"De nombreuses écoles proposent des cours à la demi-journée, en intérieur." },
    { icon:'🍳', name:'Cours de cuisine thaïe', desc:"Chiang Mai est réputée pour ses cours de cuisine, en grande partie couverts." },
    { icon:'☕', name:'Tournée des cafés de Nimman', desc:"Le quartier concentre une densité incroyable de cafés de spécialité pour s'abriter en beauté." }
  ],
  'pattaya': [
    { icon:'🛍️', name:'Central Festival Pattaya Beach / Terminal 21', desc:"Deux grands centres commerciaux climatisés en bord de mer." },
    { icon:'🎨', name:'Art in Paradise', desc:"Musée d'illusions 3D entièrement en intérieur, très ludique." },
    { icon:'🐠', name:'Pattaya Underwater World', desc:"Aquarium couvert, tunnel sous-marin et bassins tactiles." },
    { icon:'💆', name:'Spa & massage thaï', desc:"Nombreux spas le long de Beach Road et à Pratumnak." }
  ],
  'hua-hin': [
    { icon:'🛍️', name:'BluPort Hua Hin / Market Village', desc:"Centres commerciaux en bord de mer, boutiques et cinéma." },
    { icon:'🛒', name:'Cicada Market (zones couvertes)', desc:"Une partie du marché est couverte, pratique en cas d'averse passagère." },
    { icon:'💆', name:'Spa & massage thaï', desc:"Hua Hin concentre de nombreux spas réputés, parfait plan B pluvieux." },
    { icon:'🍳', name:'Cours de cuisine thaïe', desc:"Ateliers couverts proposés par plusieurs hôtels et écoles de la ville." }
  ],
  'koh-tao': [
    { icon:'🤿', name:'Cours de plongée théorique', desc:"Les centres de plongée proposent la partie théorique en salle, jour de pluie idéal pour valider ce module." },
    { icon:'💆', name:'Spa & massage thaï', desc:"Plusieurs spas à Sairee Beach pour une après-midi à l'abri." },
    { icon:'☕', name:'Tournée des cafés de Sairee Beach', desc:"Cafés cosy avec vue mer, parfait pour attendre une averse." },
    { icon:'🍳', name:'Cours de cuisine thaïe', desc:"Quelques restaurants proposent des ateliers cuisine couverts." }
  ],
  'koh-phangan': [
    { icon:'🧘', name:'Cours de yoga en studio couvert', desc:"L'île est réputée pour ses studios de yoga, souvent en intérieur ou sous shala couverte." },
    { icon:'💆', name:'Spa & massage thaï', desc:"Nombreux spas à Thong Sala et Srithanu." },
    { icon:'☕', name:'Tournée des cafés de Srithanu', desc:"Le quartier concentre une belle densité de cafés healthy et cosy." },
    { icon:'🍳', name:'Cours de cuisine thaïe', desc:"Quelques ateliers couverts disponibles près de Thong Sala." }
  ],
  'chiang-rai': [
    { icon:'🛒', name:'OTOP Cultural Center', desc:"Marché couvert dédié à l'artisanat régional, bonne alternative aux marchés en plein air." },
    { icon:'🖤', name:'Baan Dam Museum (pavillons couverts)', desc:"La plupart des pavillons de la Maison Noire sont couverts, visite possible même sous la pluie." },
    { icon:'💆', name:'Spa & massage thaï', desc:"Plusieurs spas dans le centre-ville et les hôtels de la région." },
    { icon:'🍳', name:'Cours de cuisine thaïe', desc:"Ateliers couverts proposés par plusieurs guesthouses de la ville." }
  ]
};

/* ===================== MÉTÉO EN DIRECT ===================== */
const WEATHER_ICONS = {
  0:'☀️', 1:'🌤️', 2:'⛅', 3:'☁️',
  45:'🌫️', 48:'🌫️',
  51:'🌦️', 53:'🌦️', 55:'🌦️',
  61:'🌧️', 63:'🌧️', 65:'🌧️',
  80:'🌧️', 81:'🌧️', 82:'⛈️',
  95:'⛈️', 96:'⛈️', 99:'⛈️'
};

function buildWeatherWidget(){
  const hero = document.querySelector('.hero div');
  if(!hero) return;
  const widget = document.createElement('div');
  widget.id = 'weatherWidget';
  widget.style.marginTop = '12px';
  widget.style.fontSize = '15px';
  widget.innerHTML = '<span class="tip">🌡️ Chargement de la météo...</span>';
  hero.appendChild(widget);
}

async function fetchWeather(){
  buildWeatherWidget();
  const widget = document.getElementById('weatherWidget');
  try{
    const [lat, lng] = MAP_CENTER;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=1`;
    const res = await fetch(url);
    if(!res.ok) throw new Error('Météo indisponible');
    const data = await res.json();
    const temp = Math.round(data.current.temperature_2m);
    const code = data.current.weather_code;
    const icon = WEATHER_ICONS[code] || '🌡️';
    const min = Math.round(data.daily.temperature_2m_min[0]);
    const max = Math.round(data.daily.temperature_2m_max[0]);
    if(widget){
      widget.innerHTML = `<span class="tip">${icon} Actuellement ${temp}°C à ${CITY_LABEL} · min ${min}°C / max ${max}°C aujourd'hui</span>`;
    }
    if([51,53,55,61,63,65,80,81,82,95,96,99].includes(code)){
      const rainNotice = document.getElementById('jour-de-pluie');
      if(rainNotice && !document.getElementById('rainSuggestionBanner')){
        const banner = document.createElement('p');
        banner.id = 'rainSuggestionBanner';
        banner.className = 'tip';
        banner.textContent = "🌧️ Il pleut (ou ça y ressemble) aujourd'hui à " + CITY_LABEL + " — voici de quoi t'occuper au sec :";
        rainNotice.insertBefore(banner, rainNotice.querySelector('.grid'));
      }
    }
  } catch(e){
    if(widget){ widget.innerHTML = ''; }
    console.warn('Météo indisponible :', e);
  }
}

/* ===================== FICHE SÉCURITÉ ===================== */
const EMERGENCY_NUMBERS = [
  { icon:'🚓', label:'Police', number:'191' },
  { icon:'🧭', label:'Police touristique (multilingue, faite pour les visiteurs étrangers)', number:'1155' },
  { icon:'🚑', label:'Ambulance / urgences médicales', number:'1669' },
  { icon:'🚒', label:'Pompiers', number:'199' }
];

const EMBASSY_INFO = {
  name: "Ambassade de France en Thaïlande",
  address: "35 Charoen Krung Soi 36, Bangkok",
  phone: "+66 2 657 5100",
  tip: "Un consulat honoraire de France existe aussi à Phuket pour les urgences dans le sud. Pense à t'inscrire sur Ariane (le portail du Ministère des Affaires étrangères) avant de partir : en cas de crise, l'ambassade sait que tu es sur place."
};

const HOSPITALS_BY_CITY = {
  'bangkok': ['Bumrungrad International Hospital', 'Bangkok Hospital', 'Samitivej Hospital'],
  'phuket': ['Bangkok Hospital Phuket', 'Phuket International Hospital'],
  'krabi': ['Krabi Nakharin International Hospital', 'Krabi Hospital (public)'],
  'koh-samui': ['Bangkok Hospital Samui', 'Samui International Hospital'],
  'chiang-mai': ['Chiang Mai Ram Hospital', 'Bangkok Hospital Chiang Mai'],
  'pattaya': ['Bangkok Hospital Pattaya', 'Pattaya International Hospital'],
  'hua-hin': ['Bangkok Hospital Hua Hin', 'San Paulo Hospital Hua Hin'],
  'koh-tao': ['Badalveda Clinic / centre de santé local — les cas graves sont évacués vers Koh Samui (Bangkok Hospital Samui)'],
  'koh-phangan': ['Koh Phangan Hospital (Thong Sala) — les cas graves sont évacués vers Koh Samui (Bangkok Hospital Samui)'],
  'chiang-rai': ['Chiangrai Prachanukroh Hospital', 'Overbrook Hospital']
};

const SCAMS_BY_CITY = {
  'bangkok': [
    "Un inconnu affirme que le Grand Palace est \"fermé aujourd'hui\" et propose un tuk-tuk vers d'autres boutiques/temples — le Palais n'est jamais fermé sans préavis officiel, ignore et continue ton chemin.",
    "L'arnaque aux pierres précieuses (\"gem scam\") : on te propose un investissement soi-disant très rentable dans des pierres à revendre en Europe — c'est toujours une arnaque.",
    "Certains taxis refusent le compteur en zone touristique — descends et prends le suivant plutôt que de négocier un prix fixe."
  ],
  'phuket': [
    "L'arnaque aux dégâts de jet-ski/scooter : un loueur affirme après coup que tu as endommagé le véhicule (dégâts parfois préexistants) pour te faire payer une réparation exagérée. Filme l'état du véhicule avant de partir.",
    "Certains loueurs gardent ton passeport en caution — préfère les enseignes qui acceptent un dépôt d'argent à la place."
  ],
  'krabi': [
    "Même arnaque aux dégâts de scooter qu'à Phuket — un état des lieux filmé avant location évite bien des ennuis.",
    "Sur les excursions bateau bon marché, certains équipages poussent à l'achat d'activités ou de photos supplémentaires une fois en mer — clarifie ce qui est inclus avant de partir."
  ],
  'koh-samui': [
    "Arnaque aux dégâts de location (scooter/jet-ski) identique aux autres îles — photos/vidéos avant location fortement conseillées.",
    "Sur les plages les plus touristiques, méfie-toi des transats \"gratuits\" qui entraînent une pression pour consommer au bar attenant."
  ],
  'chiang-mai': [
    "Des guides de trek non officiels abordent les touristes près des sites populaires — vérifie que l'agence est enregistrée avant de payer un acompte.",
    "Variante locale de l'arnaque aux pierres précieuses, parfois présentée comme une \"offre spéciale du jour\" par un chauffeur de tuk-tuk sympathique."
  ],
  'pattaya': [
    "Dans certains bars, l'addition inclut des \"lady drinks\" non clairement annoncés — vérifie toujours le prix affiché avant de commander.",
    "Arnaque aux dégâts de scooter fréquente également ici — état des lieux filmé recommandé."
  ],
  'hua-hin': [
    "Arnaque aux dégâts de location de scooter, comme ailleurs dans le pays — même réflexe : photos/vidéos avant de prendre les clés.",
    "Sur le marché de nuit, certains vendeurs affichent un prix différent à l'oral de celui indiqué — fais confirmer le prix avant l'achat."
  ],
  'koh-tao': [
    "Certains centres de plongée peu scrupuleux bradent les prix en sacrifiant la sécurité (matériel, ratio moniteur/élève) — privilégie un centre certifié PADI/SSI avec de bons avis récents.",
    "Arnaque aux dégâts de scooter, l'île n'y échappe pas non plus."
  ],
  'koh-phangan': [
    "Autour de la Full Moon Party, la contrefaçon d'alcool circule parfois — privilégie les bars et stands reconnus.",
    "Arnaque aux dégâts de scooter fréquente également, comme sur les autres îles."
  ],
  'chiang-rai': [
    "Ville moins touristique donc moins d'arnaques organisées, mais la vigilance de base (prix confirmé avant course en tuk-tuk, éviter les \"guides\" non officiels près des temples) reste de mise."
  ]
};

function buildSecuritySection(){
  const hospitals = HOSPITALS_BY_CITY[CITY] || [];
  const scams = SCAMS_BY_CITY[CITY] || [];

  const section = document.createElement('section');
  section.id = 'securite';
  section.innerHTML = `
    <h2>🚨 Fiche sécurité — ${CITY_LABEL}</h2>

    <h3>Numéros d'urgence (valables dans tout le pays)</h3>
    <div class="grid">
      ${EMERGENCY_NUMBERS.map(n => `
        <div class="card">
          <h3>${n.icon} ${n.label}</h3>
          <p style="font-size:20px;font-weight:bold">${n.number}</p>
        </div>
      `).join('')}
    </div>

    ${hospitals.length ? `
      <h3 style="margin-top:20px">Hôpitaux internationaux les plus proches</h3>
      <div class="grid">
        ${hospitals.map(h => `<div class="card"><p>🏥 ${h}</p></div>`).join('')}
      </div>
    ` : ''}

    <h3 style="margin-top:20px">Ambassade de France</h3>
    <div class="card">
      <p><strong>${EMBASSY_INFO.name}</strong></p>
      <p>${EMBASSY_INFO.address}</p>
      <p>☎️ ${EMBASSY_INFO.phone}</p>
      <p class="tip">${EMBASSY_INFO.tip}</p>
    </div>

    ${scams.length ? `
      <h3 style="margin-top:20px">Arnaques locales à connaître</h3>
      ${scams.map(s => `<p class="tip">⚠️ ${s}</p>`).join('')}
    ` : ''}
  `;

  const anchor = document.querySelector('#jour-de-pluie') || document.querySelector('footer');
  if(anchor && anchor.parentNode){ anchor.parentNode.insertBefore(section, anchor); }

  if(navLinks){
    const link = document.createElement('a');
    link.href = '#securite';
    link.textContent = '🚨 Sécurité';
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
    navLinks.appendChild(link);
  }
}

function buildRainyDaySection(){
  const items = RAINY_DAY[CITY];
  if(!items || items.length === 0) return;

  const section = document.createElement('section');
  section.id = 'jour-de-pluie';
  section.innerHTML = `
    <h2>🌧️ Jour de pluie ?</h2>
    <p>Voici de quoi occuper ta journée à l'abri si le temps ne joue pas le jeu.</p>
    <div class="grid">
      ${items.map(it => `
        <div class="card">
          <h3>${it.icon} ${it.name}</h3>
          <p>${it.desc}</p>
        </div>
      `).join('')}
    </div>
  `;

  const anchor = document.querySelector('#mon-hotel') || document.querySelector('footer');
  if(anchor && anchor.parentNode){ anchor.parentNode.insertBefore(section, anchor); }

  if(navLinks){
    const link = document.createElement('a');
    link.href = '#jour-de-pluie';
    link.textContent = '🌧️ Jour de pluie';
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
    navLinks.appendChild(link);
  }
}

buildItinerarySection();
buildHotelSection();
/* ===================== MODE LOCAL ===================== */
const LOCAL_PRICES = [
  { icon:'💧', label:"Bouteille d'eau (500ml)", local:'7–10 THB (7-Eleven)', tourist:'30–50 THB (plage / site touristique)' },
  { icon:'🍺', label:'Bière locale (Chang/Singha)', local:'60–80 THB (bar de quartier)', tourist:'150–250 THB (rooftop / plage)' },
  { icon:'🛺', label:'Trajet tuk-tuk courte distance', local:'40–60 THB (négocié)', tourist:'150–300 THB (zone touristique, prix non négocié)' },
  { icon:'🍜', label:'Pad Thaï street food', local:'40–60 THB', tourist:'100–200 THB (restaurant pour touristes)' },
  { icon:'🥥', label:'Noix de coco fraîche', local:'20–30 THB', tourist:'60–100 THB (bord de plage)' },
  { icon:'💆', label:'Massage thaï (1h)', local:'200–300 THB (salon de quartier)', tourist:'500–800 THB (spa d\'hôtel)' }
];

// Adresses fréquentées par les habitants, vérifiées via plusieurs sources (Michelin Guide, blogs locaux, retours de résidents).
// Rempli progressivement ville par ville — uniquement quand une vraie source fiable est disponible.
const LOCAL_ADDRESSES = {
  'bangkok': [
    {
      icon: '🍗',
      name: 'Kuang Heng Kaiton Pratunam',
      area: 'Phaya Thai (930 Phetchaburi Rd)',
      desc: "Cantine ouverte 24h/24 spécialisée dans le khao man kai (poulet-riz) — le repas du quotidien des Bangkokois, souvent bondée de locaux.",
      source: "Sources : guides locaux spécialisés street food thaï"
    },
    {
      icon: '🍲',
      name: 'Krua Apsorn (Dusit)',
      area: 'Dusit (503-505 Sam Sen Road)',
      desc: "Distinction Michelin Bib Gourmand \"Eat like a local\" — cuisine familiale appréciée jusqu'à la famille royale thaïe, curry jaune aux crevettes et porc sauté au piment.",
      source: "Source : Guide Michelin Thaïlande"
    },
    {
      icon: '🛍️',
      name: 'Wang Lang Market',
      area: 'Bangkok Noi, Siriraj (juste en face du Grand Palace, rive opposée)',
      desc: "Marché de quartier qui nourrit depuis des générations le personnel de l'hôpital Siriraj et les étudiants du coin — prix locaux, très peu de touristes malgré sa proximité immédiate avec les grands sites.",
      source: "Sources : plusieurs guides et retours de résidents de longue date"
    },
    {
      icon: '🏬',
      name: 'Food courts des grands centres commerciaux',
      area: 'Siam Paragon, EmQuartier, Central World',
      desc: "Contre-intuitif mais vérifié : beaucoup de Bangkokois de la classe moyenne préfèrent manger en food court plutôt qu'en street food, pour l'hygiène et la qualité des ingrédients — pas \"que pour les touristes\".",
      source: "Sources : témoignages de résidents de Bangkok"
    }
  ],
  'koh-samui': [
    {
      icon: '🐟',
      name: 'Marché matinal de Nathon',
      area: 'Nathon (capitale administrative de l\'île, côte ouest)',
      desc: "Marché où les habitants font leurs courses quotidiennes dès l'aube — prix locaux (20-50 THB), très peu de touristes. Idéal avant 8h pour le voir en pleine effervescence.",
      source: "Sources : guides locaux spécialisés Koh Samui"
    },
    {
      icon: '🍛',
      name: 'Échoppes \"Khao Gaeng\" de Mae Nam',
      area: 'Maenam (nord de l\'île)',
      desc: "Petites cantines de quartier servant riz et curry du sud de la Thaïlande — le cœur de la cuisine locale au quotidien, loin des grandes plages touristiques.",
      source: "Sources : guides locaux spécialisés cuisine thaïe du sud"
    },
    {
      icon: '🎣',
      name: 'Hua Thanon Market',
      area: 'Hua Thanon (sud de Lamai)',
      desc: "Marché traditionnel principalement fréquenté par les habitants, fruits de mer fraîchement débarqués — nettement moins touristique que les marchés de Chaweng ou Bophut.",
      source: "Sources : guides locaux et retours de résidents"
    },
    {
      icon: '🌃',
      name: 'Maenam Walking Street',
      area: 'Maenam',
      desc: "Marché nocturne plus modeste et posé que ceux de Chaweng ou Bophut — ambiance locale prisée par les résidents de longue date de l'île.",
      source: "Sources : guides locaux spécialisés Koh Samui"
    }
  ],
  'phuket': [
    {
      icon: '🏪',
      name: 'Marché central (Ranong Road)',
      area: 'Phuket Town',
      desc: "Le cœur de la vie locale phukétoise depuis des générations — marché de gros et de frais, avec la gare des bus locaux juste à l'extérieur.",
      source: "Sources : blogs de résidents de longue date à Phuket"
    },
    {
      icon: '🥟',
      name: 'Street food de Ranong Road',
      area: 'Phuket Town',
      desc: "Cuisine sino-thaïe transmise sur plusieurs générations, souvent sans menu en anglais — une clientèle presque exclusivement locale, à deux pas du quartier rénové de Old Town.",
      source: "Sources : guides locaux Phuket Town"
    },
    {
      icon: '🌙',
      name: 'Banzaan Market',
      area: 'Patong',
      desc: "Marché frais le jour, marché nocturne street food le soir — ambiance nettement plus locale que le marché de Bangla juste à côté.",
      source: "Sources : guides Phuket et retours de résidents"
    },
    {
      icon: '🛒',
      name: 'G-Market',
      area: 'Phuket (à côté d\'un supermarché local)',
      desc: "Prisé des expatriés de longue durée pour ses prix locaux — supermarché et petit marché avec street food en soirée à l'extérieur, très peu fréquenté par les touristes de passage.",
      source: "Sources : retours d'expatriés résidents à Phuket"
    }
  ],
  'krabi': [
    {
      icon: '🌅',
      name: 'Maharaj Market',
      area: 'Krabi Town',
      desc: "Marché matinal où les habitants achètent produits frais et petit-déjeuner à emporter — nettement moins touristique que les marchés d'Ao Nang.",
      source: "Sources : guides locaux spécialisés street food Krabi"
    },
    {
      icon: '🌃',
      name: 'Chao Fah Night Market',
      area: 'Krabi Town (près de la jetée)',
      desc: "Marché plus local et posé que le grand Walking Street du week-end — ambiance \"sortie entre collègues après le travail\", loin de l'agitation d'Ao Nang.",
      source: "Sources : guides locaux et blogs voyage spécialisés Krabi"
    },
    {
      icon: '🕌',
      name: 'Cuisine matinale à influence musulmane',
      area: 'Krabi Town, avant 8h',
      desc: "La province de Krabi a une importante population musulmane : curry de poisson au lait de coco, massaman parfumé à la cardamome et roti fin comme du papier, servis dès l'aube par des vendeurs aux racines malaisiennes.",
      source: "Sources : guides culinaires spécialisés sud de la Thaïlande"
    },
    {
      icon: '🛍️',
      name: 'Ao Nang Local Market',
      area: 'Ao Nang (marché couvert, près du temple)',
      desc: "Un vrai marché local niché en plein cœur d'Ao Nang malgré son environnement touristique — prix nettement inférieurs à ceux du bord de plage, clientèle presque exclusivement thaïlandaise.",
      source: "Sources : retours de visiteurs et guides locaux"
    }
  ],
  'chiang-mai': [
    {
      icon: '🌶️',
      name: 'Warorot Market',
      area: 'Vieille ville / bord de la rivière Ping',
      desc: "Le grand marché local de Chiang Mai, ouvert toute la journée — les habitants de Bangkok eux-mêmes s'y arrêtent spécialement pour le sai oua (saucisse du nord) et les pâtes de piment maison.",
      source: "Sources : guides locaux spécialisés marchés de Chiang Mai"
    },
    {
      icon: '🍲',
      name: 'Ton Payom Fresh Market',
      area: 'Derrière l\'Université de Chiang Mai',
      desc: "Marché de quartier étudiant, loin des circuits touristiques — une vendeuse y est réputée pour son gaeng hang lay (curry de porc du nord), en rupture de stock dès 14h certains jours.",
      source: "Sources : guides culinaires spécialisés cuisine du nord"
    },
    {
      icon: '🥢',
      name: 'San Pa Koi Market',
      area: 'Chiang Mai (hors circuits touristiques)',
      desc: "Marché peu connu des visiteurs, plats préparés et produits frais à prix locaux — une vraie ambiance de quartier, loin de l'agitation des marchés nocturnes.",
      source: "Sources : retours de résidents et voyageurs de longue durée"
    },
    {
      icon: '🌃',
      name: 'Chang Phuak Gate Market',
      area: 'Porte nord de la vieille ville',
      desc: "Marché de rue en plein air spécialisé dans la cuisine thaïe authentique, nettement plus local que le Night Bazaar de Chang Klan Road.",
      source: "Sources : guides locaux spécialisés marchés de nuit"
    }
  ],
  'pattaya': [
    {
      icon: '🦐',
      name: 'Lan Pho Market',
      area: 'Naklua (nord de Pattaya)',
      desc: "Marché aux poissons et fruits de mer où les habitants achètent la pêche du jour et la font griller sur place — le cœur du quartier de pêcheurs de Naklua.",
      source: "Sources : guides locaux spécialisés cuisine de Pattaya"
    },
    {
      icon: '🍜',
      name: 'Stands de nouilles de Soi Yamoto',
      area: 'Central Pattaya (derrière Soi Buakhao)',
      desc: "Une poignée de gargotes sans enseigne, juste des tabourets numérotés — nouilles bateaux et soupe wonton pour 80 à 140 THB, le petit-déjeuner quotidien des habitants du quartier. Arriver avant 11h pour le choix complet.",
      source: "Sources : guides food spécialisés Pattaya"
    },
    {
      icon: '🛒',
      name: 'Ratanakorn Market',
      area: 'Bang Lamung',
      desc: "Marché de quartier pour la vie de tous les jours — produits frais, viandes et articles ménagers, loin des marchés nocturnes conçus pour les visiteurs.",
      source: "Sources : guides locaux spécialisés marchés de Pattaya"
    },
    {
      icon: '🌶️',
      name: 'Restaurants isaan de l\'East Pattaya',
      area: 'À l\'est de Sukhumvit Road',
      desc: "Pattaya compte une importante communauté originaire du Nord-Est (Isaan) — cette zone résidentielle concentre des restaurants isaan authentiques (som tam, larb, poulet grillé) fréquentés presque exclusivement par des Thaïlandais et des résidents de longue date.",
      source: "Sources : guides culinaires spécialisés Pattaya 2026"
    }
  ],
  'hua-hin': [
    {
      icon: '🐟',
      name: 'Chatchai Market',
      area: 'Phetkasem Road',
      desc: "Marché de gros matinal (5h-12h) où les restaurants locaux s'approvisionnent chaque jour — nouilles bateaux et congee au petit-déjeuner pour 40-60 THB. Idéal entre 6h et 8h pour l'ambiance la plus authentique.",
      source: "Sources : guides locaux spécialisés marchés de Hua Hin"
    },
    {
      icon: '🚚',
      name: 'Pai Mai Market (marché du mardi)',
      area: 'Klong Road (terminus des songthaews)',
      desc: "Marché d'appoint pour les habitants, uniquement le mardi — stands installés dans d'anciens conteneurs, prix nettement en dessous de ceux de Cicada ou Tamarind pour une ambiance comparable.",
      source: "Sources : guides locaux spécialisés Hua Hin 2026"
    },
    {
      icon: '🦑',
      name: 'Huana Market',
      area: 'Nong Kae (face au parc aquatique)',
      desc: "Marché du soir authentique où les touristes sont rares — immense choix de poissons et fruits de mer vivants, prisé des habitants pour leur repas du soir.",
      source: "Sources : guides locaux spécialisés marchés de Hua Hin"
    },
    {
      icon: '🎣',
      name: 'Fah Muey',
      area: 'Centre-ville (à chercher, peu signalé)',
      desc: "Petit restaurant de fruits de mer que même certains habitants ne connaissent pas — demander le menu en thaï plutôt que la carte en anglais pour la vraie expérience.",
      source: "Sources : blogs spécialisés cuisine locale de Hua Hin"
    }
  ],
  'chiang-rai': [
    {
      icon: '🌙',
      name: 'Sunday Night Market',
      area: 'Phaholyothin Road',
      desc: "Moins fréquenté et plus local que le grand marché du samedi soir — ambiance non-touristique, danses traditionnelles et enfants du quartier qui jouent entre les stands.",
      source: "Sources : retours de voyageurs et guides locaux 2026"
    },
    {
      icon: '🍜',
      name: 'Porchai Khao Soi',
      area: 'Jetyod Road (extrémité nord)',
      desc: "Café local simple, néons et tables en aluminium — un khao soi authentique à environ 40 THB, une véritable institution du quartier.",
      source: "Source : guide Travelfish Chiang Rai"
    },
    {
      icon: '🥗',
      name: 'Som Tam Jetyod',
      area: 'Jetyod Road (face au wat du même nom)',
      desc: "Spécialités du Nord-Est thaïlandais (Isaan) — som tam, larb, soupe de pousses de bambou — fréquenté avant tout par les habitants du quartier.",
      source: "Source : guide Travelfish Chiang Rai"
    },
    {
      icon: '🏪',
      name: 'Marché municipal du centre-ville',
      area: 'Près de la tour de l\'horloge',
      desc: "Le vrai cœur commerçant de Chiang Rai — les habitants s'y retrouvent au quotidien pour manger et faire leurs courses, loin des marchés pensés pour les visiteurs.",
      source: "Sources : guides locaux Chiang Rai"
    }
  ],
  'koh-tao': [
    {
      icon: '🍛',
      name: 'Long Thai Food',
      area: 'Mae Haad (rue qui monte depuis la jetée)',
      desc: "Adresse discrète connue surtout des habitants et résidents de longue durée — cuisine thaïe traditionnelle sans la majoration touristique habituelle de l'île.",
      source: "Sources : guides locaux spécialisés restaurants de Koh Tao"
    },
    {
      icon: '🍚',
      name: 'Marché matinal de Mae Haad',
      area: 'Près de la jetée, 7h-10h',
      desc: "Bien différent du marché nocturne pour touristes — jok (bouillie de riz) et patongo (beignets thaïs) pour le petit-déjeuner des habitants qui travaillent au port.",
      source: "Sources : guides street food spécialisés Koh Tao"
    },
    {
      icon: '🦐',
      name: 'Mae Haad Seafood',
      area: 'Près de la jetée de Mae Haad',
      desc: "Petit restaurant familial tenu par un couple de longue date — fruits de mer authentiques et accueil chaleureux, loin des adresses plus commerciales du front de mer.",
      source: "Sources : retours de voyageurs de longue durée"
    },
    {
      icon: '🌴',
      name: 'Street food de Chalok Baan Kao',
      area: 'Chalok Baan Kao (carrefour principal)',
      desc: "Secteur nettement plus calme que Sairee ou Mae Haad — moins de touristes, quelques stands de street food fréquentés presque exclusivement par les habitants du coin.",
      source: "Sources : guides street food spécialisés Koh Tao 2026"
    }
  ],
  'koh-phangan': [
    {
      icon: '🍜',
      name: 'Pantip Market',
      area: 'Thong Sala (centre-ville)',
      desc: "Marché quotidien avec des prix pensés pour les résidents (40-80 THB le plat) — le réflexe local : si une file de Thaïlandais se forme devant un stand, c'est le bon.",
      source: "Sources : guides locaux spécialisés Koh Phangan 2026"
    },
    {
      icon: '🎣',
      name: 'Chaloklum Sunday Market',
      area: 'Chaloklum (village de pêcheurs, nord de l\'île)',
      desc: "Plus petit et nettement plus local que le grand marché du samedi de Thong Sala — fruits de mer grillés et douceurs thaïes dans une ambiance de village.",
      source: "Sources : guides culinaires spécialisés Koh Phangan"
    },
    {
      icon: '🥬',
      name: 'Marché frais de Thong Sala',
      area: 'Thong Sala (occupe toute une rue)',
      desc: "Marché d'approvisionnement quotidien des habitants — produits frais, pâtes de curry maison et épices, bien loin de l'ambiance festive du reste de l'île.",
      source: "Sources : guides locaux spécialisés marchés de Koh Phangan"
    },
    {
      icon: '🍛',
      name: 'Échoppes \"riz et curry\" du sud',
      area: 'Autour de Thong Sala',
      desc: "Grandes marmites de curry du sud de la Thaïlande, clientèle presque exclusivement locale — à privilégier plutôt que les restaurants de plage pour une vraie authenticité.",
      source: "Sources : guides culinaires spécialisés cuisine du sud thaïlandais"
    }
  ]
};

const TOURIST_TRAPS = {
  'bangkok': "Khao San Road et les abords immédiats du Grand Palace sont connus pour les prix gonflés et les rabatteurs proposant de fausses fermetures de sites.",
  'phuket': "Bangla Road et le centre de Patong pratiquent des prix nettement plus élevés qu'ailleurs sur l'île pour une prestation équivalente.",
  'krabi': "Le front de plage principal d'Ao Nang facture souvent les excursions plus cher qu'en réservant depuis Krabi Town.",
  'koh-samui': "Chaweng Beach Road (le tronçon principal) applique des prix plus élevés que Lamai ou Maenam pour des prestations comparables.",
  'chiang-mai': "Les abords immédiats du Night Bazaar principal pratiquent des prix touristiques — les rues adjacentes sont souvent moins chères pour la même qualité.",
  'pattaya': "Walking Street est nettement plus cher que le reste de la ville pour la restauration et les boissons.",
  'hua-hin': "Les stands en bordure immédiate du marché de nuit principal, côté afflux touristique, sont plus chers que ceux situés à l'intérieur.",
  'koh-tao': "La zone principale de Sairee Beach pratique des prix plus élevés que Chalok Baan Kao ou Mae Haad pour un service équivalent.",
  'koh-phangan': "Haad Rin pratique des prix nettement gonflés les soirs de Full Moon Party — le reste de l'île reste à des tarifs plus raisonnables.",
  'chiang-rai': "Ville globalement peu touristique — la vigilance de base (confirmer le prix avant une course en tuk-tuk) suffit largement."
};

function findCheapestTransport(extras){
  const transport = (extras && extras.transport) || [];
  let cheapest = null;
  let cheapestValue = Infinity;
  transport.forEach(t => {
    const nums = (t.price || '').match(/\d[\d\s]*/g);
    if(!nums) return;
    const val = parseInt(nums[0].replace(/\s/g,''), 10);
    if(!isNaN(val) && val < cheapestValue){
      cheapestValue = val;
      cheapest = t;
    }
  });
  return cheapest;
}

function buildLocalModeSection(){
  const trap = TOURIST_TRAPS[CITY];
  const localAddresses = LOCAL_ADDRESSES[CITY];

  const section = document.createElement('section');
  section.id = 'mode-local';
  section.innerHTML = `
    <h2>🇹🇭 Mode Local</h2>
    <p>Les prix réels, le transport le plus économique et les zones où l'on paie plus cher que nécessaire — pour voyager comme quelqu'un qui vit ici.</p>

    <h3>💰 Prix locaux vs prix touristiques</h3>
    <div class="grid">
      ${LOCAL_PRICES.map(p => `
        <div class="card">
          <h3>${p.icon} ${p.label}</h3>
          <p>🟢 Prix local : <strong>${p.local}</strong></p>
          <p>🔴 Prix touriste : ${p.tourist}</p>
        </div>
      `).join('')}
    </div>

    <div id="localCheapestTransport"></div>

    ${trap ? `
      <h3 style="margin-top:20px">🚫 Zone à prix touristiques à connaître</h3>
      <p class="tip">${trap}</p>
    ` : ''}

    ${localAddresses ? `
      <h3 style="margin-top:20px">📍 Adresses fréquentées par les habitants</h3>
      <div class="grid">
        ${localAddresses.map(a => `
          <div class="card">
            <h3>${a.icon} ${a.name}</h3>
            <p><small>${a.area}</small></p>
            <p>${a.desc}</p>
            <p class="tip">${a.source}</p>
          </div>
        `).join('')}
      </div>
    ` : ''}

    <p class="tip" style="margin-top:16px">💡 Prix indicatifs et variables selon la saison et le lieu exact — donnés à titre de repère pour identifier un tarif anormalement élevé, pas comme référence figée.</p>
  `;

  const anchor = document.querySelector('#jour-de-pluie') || document.querySelector('footer');
  if(anchor && anchor.parentNode){ anchor.parentNode.insertBefore(section, anchor); }

  if(navLinks){
    const link = document.createElement('a');
    link.href = '#mode-local';
    link.textContent = '🇹🇭 Mode Local';
    link.addEventListener('click', () => {
      navLinks.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
    navLinks.appendChild(link);
  }
}

function renderCheapestTransport(){
  const container = document.getElementById('localCheapestTransport');
  if(!container) return;
  const cheapestTransport = findCheapestTransport(extras);
  if(!cheapestTransport){ container.innerHTML = ''; return; }
  container.innerHTML = `
    <h3 style="margin-top:20px">🚌 Le transport le plus économique ici</h3>
    <div class="card">
      <h3>${cheapestTransport.icon || '🚌'} ${cheapestTransport.title}</h3>
      <p>${cheapestTransport.desc || ''}</p>
      <p><strong>${cheapestTransport.price}</strong></p>
    </div>
  `;
}

buildRainyDaySection();
buildLocalModeSection();
buildSecuritySection();
buildRestaurantSurprise();

document.querySelectorAll('#carte .toolbar button').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('#carte .toolbar button').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    renderMapMarkers(btn.dataset.mapcat);
  });
});

document.addEventListener('DOMContentLoaded', loadData);
window.addEventListener('resize', ()=>{ if(map){ map.invalidateSize(); } });

/* ===================== MODE HORS LIGNE (SERVICE WORKER) ===================== */

if('serviceWorker' in navigator){
  window.addEventListener('load', ()=>{
    navigator.serviceWorker.register('service-worker.js')
      .catch(err => console.warn('Service worker non enregistré :', err));
  });
}
