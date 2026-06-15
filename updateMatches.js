const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

const API_KEY = 'zwc_free_2e9cd56bfb85c5e89b1031d7';
const API_URL = 'https://api.zafronix.com/fifa/worldcup/v1/matches?year=2026';
const PROJECT_ID = 'porra-mundial-2026-7fb4c';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Mapeo completo API -> español (sin banderas)
const TEAM_MAP = {
  "mexico": "México",
  "south africa": "Sudáfrica",
  "korea republic": "Corea del Sur",
  "czechia": "República Checa",
  "canada": "Canadá",
  "bosnia and herzegovina": "Bosnia",   // ← sin la 'e' extra
  "qatar": "Catar",
  "switzerland": "Suiza",
  "brazil": "Brasil",
  "morocco": "Marruecos",
  "haiti": "Haití",
  "scotland": "Escocia",
  "usa": "Estados Unidos",
  "australia": "Australia",
  "paraguay": "Paraguay",
  "türkiye": "Turquía",
  "germany": "Alemania",
  "curaçao": "Curazao",
  "côte d'ivoire": "Costa de Marfil",
  "ecuador": "Ecuador",
  "netherlands": "Países Bajos",
  "japan": "Japón",
  "sweden": "Suecia",
  "tunisia": "Túnez",
  "belgium": "Bélgica",
  "iran": "Irán",
  "egypt": "Egipto",
  "new zealand": "Nueva Zelanda",
  "spain": "España",
  "uruguay": "Uruguay",
  "saudi arabia": "Arabia Saudita",
  "cape verde": "Cabo Verde",
  "france": "Francia",
  "senegal": "Senegal",
  "norway": "Noruega",
  "iraq": "Irak",
  "argentina": "Argentina",
  "austria": "Austria",
  "algeria": "Argelia",
  "jordan": "Jordania",
  "portugal": "Portugal",
  "colombia": "Colombia",
  "uzbekistan": "Uzbekistán",
  "dr congo": "RD Congo",
  "england": "Inglaterra",
  "croatia": "Croacia",
  "panama": "Panamá",
  "ghana": "Ghana"
};

// Función para limpiar nombres (quitar banderas y acentos)
const cleanName = (str) => {
  if (!str) return '';
  return str
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')   // quitar banderas
    .replace(/[^\wáéíóúüñÁÉÍÓÚÜÑ \-]/gu, '')   // solo letras, espacios y guiones
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');          // quitar acentos
};

// Traducir nombre de la API a español
const translateToSpanish = (apiName) => {
  const lower = apiName.toLowerCase().trim();
  return TEAM_MAP[lower] || apiName;   // si no está, devuelve el original (raro)
};

// Obtener token de acceso con cuenta de servicio
async function getAccessToken() {
  const key = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
  const email = process.env.FIREBASE_CLIENT_EMAIL;

  const token = jwt.sign(
    {
      iss: email,
      scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token',
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000)
    },
    key,
    { algorithm: 'RS256' }
  );

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${token}`
  });
  const data = await res.json();
  return data.access_token;
}

(async function main() {
  try {
    const token = await getAccessToken();

    // 1. Obtener todos los partidos de Firestore (una sola petición)
    console.log('⏳ Leyendo Firestore...');
    const matchesResp = await fetch(`${BASE_URL}/matches?pageSize=200`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!matchesResp.ok) throw new Error(`Firestore error: ${matchesResp.status}`);
    const matchesData = await matchesResp.json();
    const firestoreMatches = (matchesData.documents || []).map(doc => {
      const f = doc.fields || {};
      return {
        id: doc.name.split('/').pop(),
        homeRaw: f.home?.stringValue || '',
        awayRaw: f.away?.stringValue || '',
        // Campos limpios (sin banderas) para comparación
        homeClean: cleanName(f.home?.stringValue || ''),
        awayClean: cleanName(f.away?.stringValue || ''),
        round: f.round?.stringValue || f.round?.integerValue?.toString() || '',
        group: f.group?.stringValue || '',
        homeScore: f.homeScore?.integerValue ?? null,
        awayScore: f.awayScore?.integerValue ?? null
      };
    });

    // 2. Consultar API
    console.log('⏳ Consultando API...');
    const apiResp = await fetch(API_URL, { headers: { 'X-API-Key': API_KEY } });
    if (!apiResp.ok) throw new Error(`API error: ${apiResp.status}`);
    const apiData = await apiResp.json();
    if (!apiData.data) throw new Error('Formato inesperado');

    const batchUpdates = [];
    for (const apiMatch of apiData.data) {
      if (apiMatch.status !== 'finished' && apiMatch.status !== 'live') continue;
      if (!apiMatch.homeTeam || !apiMatch.awayTeam) continue;

      // Traducir nombres de la API a español y limpiarlos (sin banderas ya que vienen limpias)
      const apiHome = translateToSpanish(apiMatch.homeTeam);
      const apiAway = translateToSpanish(apiMatch.awayTeam);
      const apiHomeClean = cleanName(apiHome);
      const apiAwayClean = cleanName(apiAway);

      let homeScore = apiMatch.homeScore ?? null;
      let awayScore = apiMatch.awayScore ?? null;
      const status = apiMatch.status;
      const liveMinute = apiMatch.liveMinute ?? 0;
      const extraTime = apiMatch.extraTime || false;
      const penalties = apiMatch.penalties || null;

      // Buscar en Firestore (ignorando banderas)
      let match = firestoreMatches.find(m => {
        return (m.homeClean === apiHomeClean && m.awayClean === apiAwayClean) ||
               (m.homeClean === apiAwayClean && m.awayClean === apiHomeClean);
      });

      if (!match) {
        console.warn(`⚠️ No emparejó: ${apiHome} vs ${apiAway}`);
        continue;
      }

      // Invertir goles si el orden de los equipos está al revés
      const mHomeClean = match.homeClean;
      if (mHomeClean !== apiHomeClean) {
        // El local en Firestore es el visitante de la API → invertir
        if (homeScore !== null && awayScore !== null) {
          [homeScore, awayScore] = [awayScore, homeScore];
        }
      }

      if (match.homeScore === homeScore && match.awayScore === awayScore &&
          status === (match.homeScore !== null ? 'finished' : 'scheduled')) continue;

      const updateUrl = `${BASE_URL}/matches/${match.id}?updateMask.fieldPaths=homeScore&updateMask.fieldPaths=awayScore&updateMask.fieldPaths=matchStatus&updateMask.fieldPaths=liveMinute&updateMask.fieldPaths=extraTime&updateMask.fieldPaths=penalties`;
      const body = {
        fields: {
          homeScore: { integerValue: homeScore },
          awayScore: { integerValue: awayScore },
          matchStatus: { stringValue: status },
          liveMinute: { integerValue: liveMinute },
          extraTime: { booleanValue: extraTime },
          penalties: penalties ? {
            mapValue: {
              fields: {
                home: { integerValue: penalties.home || 0 },
                away: { integerValue: penalties.away || 0 }
              }
            }
          } : { nullValue: null }
        }
      };
      batchUpdates.push(
        fetch(updateUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(body)
        })
      );
      console.log(`✔ ${apiHome} vs ${apiAway} → ${homeScore ?? '?'}-${awayScore ?? '?'} [${status}]`);
    }

    if (batchUpdates.length > 0) {
      await Promise.all(batchUpdates);
      console.log(`Actualizados ${batchUpdates.length} partidos.`);
    } else {
      console.log('Nada que actualizar.');
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
})();
