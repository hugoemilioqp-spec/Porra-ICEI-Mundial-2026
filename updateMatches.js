const fetch = require('node-fetch');
const jwt = require('jsonwebtoken');

const API_KEY = 'zwc_free_2e9cd56bfb85c5e89b1031d7';
const API_URL = 'https://api.zafronix.com/fifa/worldcup/v1/matches?year=2026';
const PROJECT_ID = 'porra-mundial-2026-7fb4c';
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

const TEAM_MAP = {
  "mexico": "México",
  "south africa": "Sudáfrica",
  "korea republic": "Corea del Sur",
  "czechia": "República Checa",
  "canada": "Canadá",
  "bosnia and herzegovina": "Bosnia",   // ← CORREGIDO (era "herzegovina")
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

    const apiResp = await fetch(API_URL, { headers: { 'X-API-Key': API_KEY } });
    if (!apiResp.ok) throw new Error(`API error: ${apiResp.status}`);
    const data = await apiResp.json();
    if (!data.data) throw new Error('Formato inesperado');

    const batchUpdates = [];
    for (const apiMatch of data.data) {
      if (apiMatch.status !== 'finished' && apiMatch.status !== 'live') continue;
      if (!apiMatch.homeTeam || !apiMatch.awayTeam) continue;

      let homeScore = apiMatch.homeScore ?? null;
      let awayScore = apiMatch.awayScore ?? null;
      const status = apiMatch.status;
      const liveMinute = apiMatch.liveMinute ?? 0;

      const apiHome = TEAM_MAP[apiMatch.homeTeam.toLowerCase()];
      const apiAway = TEAM_MAP[apiMatch.awayTeam.toLowerCase()];
      if (!apiHome || !apiAway) {
        console.warn(`Equipo no encontrado: ${apiMatch.homeTeam} o ${apiMatch.awayTeam}`);
        continue;
      }

      // Buscar match exacto
      let searchUrl = `${BASE_URL}/matches?where=home==${encodeURIComponent(apiHome)}&where=away==${encodeURIComponent(apiAway)}`;
      let resp = await fetch(searchUrl, { headers: { 'Authorization': `Bearer ${token}` } });
      let found = await resp.json();

      let invert = false;
      if (!found.documents || found.documents.length === 0) {
        searchUrl = `${BASE_URL}/matches?where=home==${encodeURIComponent(apiAway)}&where=away==${encodeURIComponent(apiHome)}`;
        resp = await fetch(searchUrl, { headers: { 'Authorization': `Bearer ${token}` } });
        found = await resp.json();
        if (found.documents && found.documents.length > 0) {
          invert = true;
        }
      }

      if (!found.documents || found.documents.length === 0) {
        console.warn(`No se encontró: ${apiHome} vs ${apiAway}`);
        continue;
      }

      const docPath = found.documents[0].name.split('/').pop();
      const curFields = found.documents[0].fields || {};
      const curHome = curFields.homeScore?.integerValue ?? null;
      const curAway = curFields.awayScore?.integerValue ?? null;
      const curStatus = curFields.matchStatus?.stringValue;
      const curLiveMinute = curFields.liveMinute?.integerValue ?? 0;

      if (invert && homeScore !== null && awayScore !== null) {
        [homeScore, awayScore] = [awayScore, homeScore];
      }

      if (curHome === homeScore && curAway === awayScore && curStatus === status && curLiveMinute === liveMinute) continue;

      const updateUrl = `${BASE_URL}/matches/${docPath}?updateMask.fieldPaths=homeScore&updateMask.fieldPaths=awayScore&updateMask.fieldPaths=matchStatus&updateMask.fieldPaths=liveMinute`;
      const body = {
        fields: {
          homeScore: { integerValue: homeScore },
          awayScore: { integerValue: awayScore },
          matchStatus: { stringValue: status },
          liveMinute: { integerValue: liveMinute }
        }
      };
      batchUpdates.push(
        fetch(updateUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(body)
        })
      );
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
