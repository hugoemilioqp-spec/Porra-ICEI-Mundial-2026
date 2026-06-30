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
  "bosnia and herzegovina": "Bosnia",
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
  "ir iran": "Irán",
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
  "congo dr": "RD Congo",
  "england": "Inglaterra",
  "croatia": "Croacia",
  "panama": "Panamá",
  "ghana": "Ghana"
};

const cleanName = (str) => {
  if (!str) return '';
  return str
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')
    .replace(/[^\wáéíóúüñÁÉÍÓÚÜÑ \-]/gu, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const translateToSpanish = (apiName) => {
  const lower = apiName.toLowerCase().trim();
  return TEAM_MAP[lower] || apiName;
};

const toFirestoreValue = (val) => {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'number') return { integerValue: val };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  return { stringValue: String(val) };
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

// Mismo KO_ADVANCE_MAP que en index.html
const KO_ADVANCE_MAP = {
    73: { nextMatch: 90, position: 'home' },
    75: { nextMatch: 89, position: 'home' },
    76: { nextMatch: 90, position: 'away' },
    78: { nextMatch: 89, position: 'away' },
    74: { nextMatch: 91, position: 'home' },
    77: { nextMatch: 91, position: 'away' },
    79: { nextMatch: 92, position: 'home' },
    80: { nextMatch: 92, position: 'away' },
    83: { nextMatch: 93, position: 'home' },
    84: { nextMatch: 93, position: 'away' },
    81: { nextMatch: 94, position: 'home' },
    82: { nextMatch: 94, position: 'away' },
    86: { nextMatch: 95, position: 'home' },
    88: { nextMatch: 95, position: 'away' },
    85: { nextMatch: 96, position: 'home' },
    87: { nextMatch: 96, position: 'away' },
    89: { nextMatch: 97, position: 'home' },
    90: { nextMatch: 97, position: 'away' },
    91: { nextMatch: 99, position: 'home' },
    92: { nextMatch: 99, position: 'away' },
    93: { nextMatch: 98, position: 'home' },
    94: { nextMatch: 98, position: 'away' },
    95: { nextMatch: 100, position: 'home' },
    96: { nextMatch: 100, position: 'away' },
    97: { nextMatch: 101, position: 'home' },
    98: { nextMatch: 101, position: 'away' },
    99: { nextMatch: 102, position: 'home' },
    100:{ nextMatch: 102, position: 'away' },
    101:{ nextMatchWin: 104, positionWin: 'home', nextMatchLose: 103, positionLose: 'home' },
    102:{ nextMatchWin: 104, positionWin: 'away', nextMatchLose: 103, positionLose: 'away' }
};

(async function main() {
  try {
    const token = await getAccessToken();

    // ========== 1. REPARAR GRUPO, RONDA Y FECHA DE TODOS LOS PARTIDOS KO ==========
    const KO_DEFAULTS = {
      73: { round: 'Dieciseisavos', date: '2026-06-28T19:00:00Z' },
      74: { round: 'Dieciseisavos', date: '2026-06-29T17:00:00Z' },
      75: { round: 'Dieciseisavos', date: '2026-06-29T20:30:00Z' },
      76: { round: 'Dieciseisavos', date: '2026-06-30T01:00:00Z' },
      77: { round: 'Dieciseisavos', date: '2026-06-30T17:00:00Z' },
      78: { round: 'Dieciseisavos', date: '2026-06-30T21:00:00Z' },
      79: { round: 'Dieciseisavos', date: '2026-07-01T01:00:00Z' },
      80: { round: 'Dieciseisavos', date: '2026-07-01T16:00:00Z' },
      81: { round: 'Dieciseisavos', date: '2026-07-01T20:00:00Z' },
      82: { round: 'Dieciseisavos', date: '2026-07-02T00:00:00Z' },
      83: { round: 'Dieciseisavos', date: '2026-07-02T19:00:00Z' },
      84: { round: 'Dieciseisavos', date: '2026-07-02T23:00:00Z' },
      85: { round: 'Dieciseisavos', date: '2026-07-03T03:00:00Z' },
      86: { round: 'Dieciseisavos', date: '2026-07-03T18:00:00Z' },
      87: { round: 'Dieciseisavos', date: '2026-07-03T22:00:00Z' },
      88: { round: 'Dieciseisavos', date: '2026-07-04T01:30:00Z' },
      89: { round: 'Octavos',      date: '2026-07-04T17:00:00Z' },
      90: { round: 'Octavos',      date: '2026-07-04T21:00:00Z' },
      91: { round: 'Octavos',      date: '2026-07-05T19:00:00Z' },
      92: { round: 'Octavos',      date: '2026-07-06T00:00:00Z' },
      93: { round: 'Octavos',      date: '2026-07-06T19:00:00Z' },
      94: { round: 'Octavos',      date: '2026-07-07T00:00:00Z' },
      95: { round: 'Octavos',      date: '2026-07-07T16:00:00Z' },
      96: { round: 'Octavos',      date: '2026-07-07T20:00:00Z' },
      97: { round: 'Cuartos',      date: '2026-07-09T20:00:00Z' },
      98: { round: 'Cuartos',      date: '2026-07-10T19:00:00Z' },
      99: { round: 'Cuartos',      date: '2026-07-11T21:00:00Z' },
      100:{ round: 'Cuartos',      date: '2026-07-12T01:00:00Z' },
      101:{ round: 'Semifinales',  date: '2026-07-14T19:00:00Z' },
      102:{ round: 'Semifinales',  date: '2026-07-15T19:00:00Z' },
      103:{ round: '3er Puesto',   date: '2026-07-18T21:00:00Z' },
      104:{ round: 'Final',        date: '2026-07-19T18:00:00Z' }
    };

    for (const [id, info] of Object.entries(KO_DEFAULTS)) {
      const matchId = parseInt(id);
      const url = `${BASE_URL}/matches/${matchId}?updateMask.fieldPaths=group&updateMask.fieldPaths=round&updateMask.fieldPaths=date`;
      const fields = {
        group: { stringValue: 'KO' },
        round: { stringValue: info.round },
        date: { stringValue: info.date }
      };
      await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ fields })
      }).catch(err => console.error(`Error reparando KO ${matchId}: ${err.message}`));
    }

    // ========== 2. LEER FIRESTORE ==========
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
        homeClean: cleanName(f.home?.stringValue || ''),
        awayClean: cleanName(f.away?.stringValue || ''),
        round: f.round?.stringValue || '',
        group: f.group?.stringValue || '',
        homeScore: f.homeScore?.integerValue != null ? parseInt(f.homeScore.integerValue) : null,
        awayScore: f.awayScore?.integerValue != null ? parseInt(f.awayScore.integerValue) : null,
        matchStatus: f.matchStatus?.stringValue || null,
        liveMinute: f.liveMinute?.integerValue != null ? parseInt(f.liveMinute.integerValue) : null,
        extraTime: f.extraTime?.booleanValue || false,
        winnerTeam: f.winnerTeam?.stringValue || null   // importante para el avance
      };
    });

    // ========== 3. CONSULTAR API Y ACTUALIZAR SOLO CAMPOS NECESARIOS ==========
    console.log('⏳ Consultando API...');
    const apiResp = await fetch(API_URL, { headers: { 'X-API-Key': API_KEY } });
    if (!apiResp.ok) throw new Error(`API error: ${apiResp.status}`);
    const apiData = await apiResp.json();
    if (!apiData.data) throw new Error('Formato inesperado');

    let updatedCount = 0;
    for (const apiMatch of apiData.data) {
      if (apiMatch.status !== 'finished' && apiMatch.status !== 'live') continue;
      if (!apiMatch.homeTeam || !apiMatch.awayTeam) continue;

      const apiHome = translateToSpanish(apiMatch.homeTeam);
      const apiAway = translateToSpanish(apiMatch.awayTeam);
      const apiHomeClean = cleanName(apiHome);
      const apiAwayClean = cleanName(apiAway);

      let homeScore = apiMatch.homeScore ?? null;
      let awayScore = apiMatch.awayScore ?? null;
      const status = apiMatch.status;
      const liveMinute = apiMatch.liveMinute ?? null;
      const extraTime = apiMatch.extraTime || false;
      const penalties = apiMatch.penalties || null;

      let winnerTeam = null;
      if (penalties && penalties.home !== undefined && penalties.away !== undefined) {
        winnerTeam = (penalties.home > penalties.away) ? apiHome : apiAway;
      }
      if (!winnerTeam && homeScore !== null && awayScore !== null && homeScore !== awayScore) {
        winnerTeam = homeScore > awayScore ? apiHome : apiAway;
      }
      if (!winnerTeam && apiMatch.winner) {
        winnerTeam = translateToSpanish(apiMatch.winner);
      }

      let match = firestoreMatches.find(m => {
        return (m.homeClean === apiHomeClean && m.awayClean === apiAwayClean) ||
               (m.homeClean === apiAwayClean && m.awayClean === apiHomeClean);
      });
      if (!match) { console.warn(`⚠️ No emparejó: ${apiHome} vs ${apiAway}`); continue; }

      if (match.homeClean !== apiHomeClean) {
        if (homeScore !== null && awayScore !== null) {
          [homeScore, awayScore] = [awayScore, homeScore];
        }
      }

      const fields = {};
      let hasChanged = false;

      if (match.homeScore !== homeScore || match.awayScore !== awayScore) {
        fields.homeScore = toFirestoreValue(homeScore);
        fields.awayScore = toFirestoreValue(awayScore);
        hasChanged = true;
      }
      if (match.matchStatus !== status) {
        fields.matchStatus = { stringValue: status };
        hasChanged = true;
      }
      if (status === 'live' && liveMinute !== match.liveMinute) {
        fields.liveMinute = toFirestoreValue(liveMinute);
        hasChanged = true;
      }
      if (extraTime !== match.extraTime) {
        fields.extraTime = { booleanValue: extraTime };
        hasChanged = true;
      }
      if (penalties) {
        fields.penalties = penalties ? {
          mapValue: {
            fields: {
              home: { integerValue: penalties.home || 0 },
              away: { integerValue: penalties.away || 0 }
            }
          }
        } : { nullValue: null };
        hasChanged = true;
      }
      if (winnerTeam) {
        fields.winnerTeam = { stringValue: winnerTeam };
        hasChanged = true;
      }

      if (!hasChanged) continue;

      const updateMask = Object.keys(fields).join('&updateMask.fieldPaths=');
      const updateUrl = `${BASE_URL}/matches/${match.id}?updateMask.fieldPaths=${updateMask}`;
      const body = { fields };

      try {
        const updResp = await fetch(updateUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(body)
        });
        if (!updResp.ok) { console.error(`❌ Error ${match.id}: ${updResp.status}`); continue; }
        console.log(`✔ ${apiHome} vs ${apiAway} → ${homeScore ?? '?'}-${awayScore ?? '?'} [${status}] ${winnerTeam ? '(Ganador: ' + winnerTeam + ')' : ''}`);
        updatedCount++;
        // Actualizar también el array local para el avance posterior
        match.homeScore = homeScore;
        match.awayScore = awayScore;
        match.winnerTeam = winnerTeam || match.winnerTeam;
      } catch (err) { console.error(`❌ Excepción ${match.id}: ${err.message}`); }
    }

    console.log(`Actualizados ${updatedCount} partidos.`);

    // ========== 4. PLACEHOLDERS (SOLO SI AMBOS SON PLACEHOLDER) ==========
    const KO_PLACEHOLDERS = {
      89: { home: 'Ganador M73', away: 'Ganador M75' },
      90: { home: 'Ganador M74', away: 'Ganador M77' },
      91: { home: 'Ganador M76', away: 'Ganador M78' },
      92: { home: 'Ganador M79', away: 'Ganador M80' },
      93: { home: 'Ganador M83', away: 'Ganador M84' },
      94: { home: 'Ganador M81', away: 'Ganador M82' },
      95: { home: 'Ganador M86', away: 'Ganador M88' },
      96: { home: 'Ganador M85', away: 'Ganador M87' },
      97: { home: 'Ganador M89', away: 'Ganador M90' },
      98: { home: 'Ganador M93', away: 'Ganador M94' },
      99: { home: 'Ganador M91', away: 'Ganador M92' },
      100:{ home: 'Ganador M95', away: 'Ganador M96' },
      101:{ home: 'Ganador M97', away: 'Ganador M98' },
      102:{ home: 'Ganador M99', away: 'Ganador M100' },
      103:{ home: 'Perdedor M101', away: 'Perdedor M102' },
      104:{ home: 'Ganador M101', away: 'Ganador M102' }
    };

    const isPlaceholder = (value) => {
      return !value || value === 'Por definir' || value.includes('Ganador') || value.includes('Perdedor') || value.includes('°');
    };

    for (const [idStr, teams] of Object.entries(KO_PLACEHOLDERS)) {
      const matchId = parseInt(idStr);
      const match = firestoreMatches.find(m => m.id == matchId);
      if (!match) continue;
      // 🔁 Solo actualiza si AMBOS equipos son placeholders
      if (!isPlaceholder(match.homeRaw) || !isPlaceholder(match.awayRaw)) continue;

      const url = `${BASE_URL}/matches/${matchId}?updateMask.fieldPaths=home&updateMask.fieldPaths=away`;
      const body = { fields: { home: { stringValue: teams.home }, away: { stringValue: teams.away } } };
      await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
      }).catch(err => console.warn(`No se pudo actualizar KO ${matchId}`));
    }

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
  "bosnia and herzegovina": "Bosnia",
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
  "ir iran": "Irán",
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
  "congo dr": "RD Congo",
  "england": "Inglaterra",
  "croatia": "Croacia",
  "panama": "Panamá",
  "ghana": "Ghana"
};

const cleanName = (str) => {
  if (!str) return '';
  return str
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')
    .replace(/[^\wáéíóúüñÁÉÍÓÚÜÑ \-]/gu, '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
};

const translateToSpanish = (apiName) => {
  const lower = apiName.toLowerCase().trim();
  return TEAM_MAP[lower] || apiName;
};

const toFirestoreValue = (val) => {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'number') return { integerValue: val };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  return { stringValue: String(val) };
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

// Mismo KO_ADVANCE_MAP que en index.html
const KO_ADVANCE_MAP = {
    73: { nextMatch: 90, position: 'home' },
    75: { nextMatch: 89, position: 'home' },
    76: { nextMatch: 90, position: 'away' },
    78: { nextMatch: 89, position: 'away' },
    74: { nextMatch: 91, position: 'home' },
    77: { nextMatch: 91, position: 'away' },
    79: { nextMatch: 92, position: 'home' },
    80: { nextMatch: 92, position: 'away' },
    83: { nextMatch: 93, position: 'home' },
    84: { nextMatch: 93, position: 'away' },
    81: { nextMatch: 94, position: 'home' },
    82: { nextMatch: 94, position: 'away' },
    86: { nextMatch: 95, position: 'home' },
    88: { nextMatch: 95, position: 'away' },
    85: { nextMatch: 96, position: 'home' },
    87: { nextMatch: 96, position: 'away' },
    89: { nextMatch: 97, position: 'home' },
    90: { nextMatch: 97, position: 'away' },
    91: { nextMatch: 99, position: 'home' },
    92: { nextMatch: 99, position: 'away' },
    93: { nextMatch: 98, position: 'home' },
    94: { nextMatch: 98, position: 'away' },
    95: { nextMatch: 100, position: 'home' },
    96: { nextMatch: 100, position: 'away' },
    97: { nextMatch: 101, position: 'home' },
    98: { nextMatch: 101, position: 'away' },
    99: { nextMatch: 102, position: 'home' },
    100:{ nextMatch: 102, position: 'away' },
    101:{ nextMatchWin: 104, positionWin: 'home', nextMatchLose: 103, positionLose: 'home' },
    102:{ nextMatchWin: 104, positionWin: 'away', nextMatchLose: 103, positionLose: 'away' }
};

(async function main() {
  try {
    const token = await getAccessToken();

    // ========== 1. REPARAR GRUPO, RONDA Y FECHA DE TODOS LOS PARTIDOS KO ==========
    const KO_DEFAULTS = {
      73: { round: 'Dieciseisavos', date: '2026-06-28T19:00:00Z' },
      74: { round: 'Dieciseisavos', date: '2026-06-29T17:00:00Z' },
      75: { round: 'Dieciseisavos', date: '2026-06-29T20:30:00Z' },
      76: { round: 'Dieciseisavos', date: '2026-06-30T01:00:00Z' },
      77: { round: 'Dieciseisavos', date: '2026-06-30T17:00:00Z' },
      78: { round: 'Dieciseisavos', date: '2026-06-30T21:00:00Z' },
      79: { round: 'Dieciseisavos', date: '2026-07-01T01:00:00Z' },
      80: { round: 'Dieciseisavos', date: '2026-07-01T16:00:00Z' },
      81: { round: 'Dieciseisavos', date: '2026-07-01T20:00:00Z' },
      82: { round: 'Dieciseisavos', date: '2026-07-02T00:00:00Z' },
      83: { round: 'Dieciseisavos', date: '2026-07-02T19:00:00Z' },
      84: { round: 'Dieciseisavos', date: '2026-07-02T23:00:00Z' },
      85: { round: 'Dieciseisavos', date: '2026-07-03T03:00:00Z' },
      86: { round: 'Dieciseisavos', date: '2026-07-03T18:00:00Z' },
      87: { round: 'Dieciseisavos', date: '2026-07-03T22:00:00Z' },
      88: { round: 'Dieciseisavos', date: '2026-07-04T01:30:00Z' },
      89: { round: 'Octavos',      date: '2026-07-04T17:00:00Z' },
      90: { round: 'Octavos',      date: '2026-07-04T21:00:00Z' },
      91: { round: 'Octavos',      date: '2026-07-05T19:00:00Z' },
      92: { round: 'Octavos',      date: '2026-07-06T00:00:00Z' },
      93: { round: 'Octavos',      date: '2026-07-06T19:00:00Z' },
      94: { round: 'Octavos',      date: '2026-07-07T00:00:00Z' },
      95: { round: 'Octavos',      date: '2026-07-07T16:00:00Z' },
      96: { round: 'Octavos',      date: '2026-07-07T20:00:00Z' },
      97: { round: 'Cuartos',      date: '2026-07-09T20:00:00Z' },
      98: { round: 'Cuartos',      date: '2026-07-10T19:00:00Z' },
      99: { round: 'Cuartos',      date: '2026-07-11T21:00:00Z' },
      100:{ round: 'Cuartos',      date: '2026-07-12T01:00:00Z' },
      101:{ round: 'Semifinales',  date: '2026-07-14T19:00:00Z' },
      102:{ round: 'Semifinales',  date: '2026-07-15T19:00:00Z' },
      103:{ round: '3er Puesto',   date: '2026-07-18T21:00:00Z' },
      104:{ round: 'Final',        date: '2026-07-19T18:00:00Z' }
    };

    for (const [id, info] of Object.entries(KO_DEFAULTS)) {
      const matchId = parseInt(id);
      const url = `${BASE_URL}/matches/${matchId}?updateMask.fieldPaths=group&updateMask.fieldPaths=round&updateMask.fieldPaths=date`;
      const fields = {
        group: { stringValue: 'KO' },
        round: { stringValue: info.round },
        date: { stringValue: info.date }
      };
      await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ fields })
      }).catch(err => console.error(`Error reparando KO ${matchId}: ${err.message}`));
    }

    // ========== 2. LEER FIRESTORE ==========
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
        homeClean: cleanName(f.home?.stringValue || ''),
        awayClean: cleanName(f.away?.stringValue || ''),
        round: f.round?.stringValue || '',
        group: f.group?.stringValue || '',
        homeScore: f.homeScore?.integerValue != null ? parseInt(f.homeScore.integerValue) : null,
        awayScore: f.awayScore?.integerValue != null ? parseInt(f.awayScore.integerValue) : null,
        matchStatus: f.matchStatus?.stringValue || null,
        liveMinute: f.liveMinute?.integerValue != null ? parseInt(f.liveMinute.integerValue) : null,
        extraTime: f.extraTime?.booleanValue || false,
        winnerTeam: f.winnerTeam?.stringValue || null   // importante para el avance
      };
    });

    // ========== 3. CONSULTAR API Y ACTUALIZAR SOLO CAMPOS NECESARIOS ==========
    console.log('⏳ Consultando API...');
    const apiResp = await fetch(API_URL, { headers: { 'X-API-Key': API_KEY } });
    if (!apiResp.ok) throw new Error(`API error: ${apiResp.status}`);
    const apiData = await apiResp.json();
    if (!apiData.data) throw new Error('Formato inesperado');

    let updatedCount = 0;
    for (const apiMatch of apiData.data) {
      if (apiMatch.status !== 'finished' && apiMatch.status !== 'live') continue;
      if (!apiMatch.homeTeam || !apiMatch.awayTeam) continue;

      const apiHome = translateToSpanish(apiMatch.homeTeam);
      const apiAway = translateToSpanish(apiMatch.awayTeam);
      const apiHomeClean = cleanName(apiHome);
      const apiAwayClean = cleanName(apiAway);

      let homeScore = apiMatch.homeScore ?? null;
      let awayScore = apiMatch.awayScore ?? null;
      const status = apiMatch.status;
      const liveMinute = apiMatch.liveMinute ?? null;
      const extraTime = apiMatch.extraTime || false;
      const penalties = apiMatch.penalties || null;

      let winnerTeam = null;
      if (penalties && penalties.home !== undefined && penalties.away !== undefined) {
        winnerTeam = (penalties.home > penalties.away) ? apiHome : apiAway;
      }
      if (!winnerTeam && homeScore !== null && awayScore !== null && homeScore !== awayScore) {
        winnerTeam = homeScore > awayScore ? apiHome : apiAway;
      }
      if (!winnerTeam && apiMatch.winner) {
        winnerTeam = translateToSpanish(apiMatch.winner);
      }

      let match = firestoreMatches.find(m => {
        return (m.homeClean === apiHomeClean && m.awayClean === apiAwayClean) ||
               (m.homeClean === apiAwayClean && m.awayClean === apiHomeClean);
      });
      if (!match) { console.warn(`⚠️ No emparejó: ${apiHome} vs ${apiAway}`); continue; }

      if (match.homeClean !== apiHomeClean) {
        if (homeScore !== null && awayScore !== null) {
          [homeScore, awayScore] = [awayScore, homeScore];
        }
      }

      const fields = {};
      let hasChanged = false;

      if (match.homeScore !== homeScore || match.awayScore !== awayScore) {
        fields.homeScore = toFirestoreValue(homeScore);
        fields.awayScore = toFirestoreValue(awayScore);
        hasChanged = true;
      }
      if (match.matchStatus !== status) {
        fields.matchStatus = { stringValue: status };
        hasChanged = true;
      }
      if (status === 'live' && liveMinute !== match.liveMinute) {
        fields.liveMinute = toFirestoreValue(liveMinute);
        hasChanged = true;
      }
      if (extraTime !== match.extraTime) {
        fields.extraTime = { booleanValue: extraTime };
        hasChanged = true;
      }
      if (penalties) {
        fields.penalties = penalties ? {
          mapValue: {
            fields: {
              home: { integerValue: penalties.home || 0 },
              away: { integerValue: penalties.away || 0 }
            }
          }
        } : { nullValue: null };
        hasChanged = true;
      }
      if (winnerTeam) {
        fields.winnerTeam = { stringValue: winnerTeam };
        hasChanged = true;
      }

      if (!hasChanged) continue;

      const updateMask = Object.keys(fields).join('&updateMask.fieldPaths=');
      const updateUrl = `${BASE_URL}/matches/${match.id}?updateMask.fieldPaths=${updateMask}`;
      const body = { fields };

      try {
        const updResp = await fetch(updateUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(body)
        });
        if (!updResp.ok) { console.error(`❌ Error ${match.id}: ${updResp.status}`); continue; }
        console.log(`✔ ${apiHome} vs ${apiAway} → ${homeScore ?? '?'}-${awayScore ?? '?'} [${status}] ${winnerTeam ? '(Ganador: ' + winnerTeam + ')' : ''}`);
        updatedCount++;
        // Actualizar también el array local para el avance posterior
        match.homeScore = homeScore;
        match.awayScore = awayScore;
        match.winnerTeam = winnerTeam || match.winnerTeam;
      } catch (err) { console.error(`❌ Excepción ${match.id}: ${err.message}`); }
    }

    console.log(`Actualizados ${updatedCount} partidos.`);

    // ========== 4. PLACEHOLDERS (SOLO SI AMBOS SON PLACEHOLDER) ==========
    const KO_PLACEHOLDERS = {
      89: { home: 'Ganador M73', away: 'Ganador M75' },
      90: { home: 'Ganador M74', away: 'Ganador M77' },
      91: { home: 'Ganador M76', away: 'Ganador M78' },
      92: { home: 'Ganador M79', away: 'Ganador M80' },
      93: { home: 'Ganador M83', away: 'Ganador M84' },
      94: { home: 'Ganador M81', away: 'Ganador M82' },
      95: { home: 'Ganador M86', away: 'Ganador M88' },
      96: { home: 'Ganador M85', away: 'Ganador M87' },
      97: { home: 'Ganador M89', away: 'Ganador M90' },
      98: { home: 'Ganador M93', away: 'Ganador M94' },
      99: { home: 'Ganador M91', away: 'Ganador M92' },
      100:{ home: 'Ganador M95', away: 'Ganador M96' },
      101:{ home: 'Ganador M97', away: 'Ganador M98' },
      102:{ home: 'Ganador M99', away: 'Ganador M100' },
      103:{ home: 'Perdedor M101', away: 'Perdedor M102' },
      104:{ home: 'Ganador M101', away: 'Ganador M102' }
    };

    const isPlaceholder = (value) => {
      return !value || value === 'Por definir' || value.includes('Ganador') || value.includes('Perdedor') || value.includes('°');
    };

    for (const [idStr, teams] of Object.entries(KO_PLACEHOLDERS)) {
      const matchId = parseInt(idStr);
      const match = firestoreMatches.find(m => m.id == matchId);
      if (!match) continue;
      // 🔁 Solo actualiza si AMBOS equipos son placeholders
      if (!isPlaceholder(match.homeRaw) || !isPlaceholder(match.awayRaw)) continue;

      const url = `${BASE_URL}/matches/${matchId}?updateMask.fieldPaths=home&updateMask.fieldPaths=away`;
      const body = { fields: { home: { stringValue: teams.home }, away: { stringValue: teams.away } } };
      await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(body)
      }).catch(err => console.warn(`No se pudo actualizar KO ${matchId}`));
    }

    // ========== 5. AVANCE AUTOMÁTICO DE GANADORES ==========
    console.log('⏳ Avanzando ganadores...');
    // Volver a leer Firestore para tener los datos más recientes
    const freshResp = await fetch(`${BASE_URL}/matches?pageSize=200`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const freshData = await freshResp.json();
    const allMatches = (freshData.documents || []).map(doc => {
      const f = doc.fields || {};
      return {
        id: parseInt(doc.name.split('/').pop()),
        home: f.home?.stringValue || '',
        away: f.away?.stringValue || '',
        homeScore: f.homeScore?.integerValue != null ? parseInt(f.homeScore.integerValue) : null,
        awayScore: f.awayScore?.integerValue != null ? parseInt(f.awayScore.integerValue) : null,
        winnerTeam: f.winnerTeam?.stringValue || null,
        group: f.group?.stringValue || ''
      };
    });

    const koMatches = allMatches.filter(m => m.group === 'KO' && m.homeScore !== null && m.awayScore !== null);
    for (const m of koMatches) {
      const advance = KO_ADVANCE_MAP[m.id];
      if (!advance) continue;

      const winner = m.homeScore > m.awayScore ? m.home : (m.homeScore < m.awayScore ? m.away : (m.winnerTeam || null));
      if (!winner) continue;

      // Ganador a siguiente partido
      let nextMatchWinId = advance.nextMatchWin || advance.nextMatch;
      let positionWin = advance.positionWin || advance.position;
      if (nextMatchWinId) {
        const nextMatch = allMatches.find(n => n.id === nextMatchWinId);
        if (nextMatch) {
          const updateFields = {};
          if (positionWin === 'home') {
            if (nextMatch.home !== winner) updateFields.home = { stringValue: winner };
          } else {
            if (nextMatch.away !== winner) updateFields.away = { stringValue: winner };
          }
          if (Object.keys(updateFields).length) {
            const url = `${BASE_URL}/matches/${nextMatchWinId}?updateMask.fieldPaths=${Object.keys(updateFields).join('&updateMask.fieldPaths=')}`;
            await fetch(url, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ fields: updateFields })
            }).catch(err => console.error(`Error avanzando a ${nextMatchWinId}: ${err.message}`));
            console.log(`✔ Avanza: ${winner} → M${nextMatchWinId} (${positionWin})`);
          }
        }
      }

      // Perdedor de semifinales a 3er puesto
      if (m.id === 101 || m.id === 102) {
        const loser = winner === m.home ? m.away : m.home;
        const thirdMatchId = advance.nextMatchLose;
        const positionLose = advance.positionLose;
        if (thirdMatchId && loser) {
          const thirdMatch = allMatches.find(n => n.id === thirdMatchId);
          if (thirdMatch) {
            const updateFields = {};
            if (positionLose === 'home') {
              if (thirdMatch.home !== loser) updateFields.home = { stringValue: loser };
            } else {
              if (thirdMatch.away !== loser) updateFields.away = { stringValue: loser };
            }
            if (Object.keys(updateFields).length) {
              const url = `${BASE_URL}/matches/${thirdMatchId}?updateMask.fieldPaths=${Object.keys(updateFields).join('&updateMask.fieldPaths=')}`;
              await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({ fields: updateFields })
              }).catch(err => console.error(`Error avanzando perdedor a ${thirdMatchId}: ${err.message}`));
              console.log(`✔ Perdedor: ${loser} → M${thirdMatchId} (3er puesto)`);
            }
          }
        }
      }
    }

    console.log('✅ Avance automático completado.');
  } catch (error) {
    console.error('Error general:', error);
    process.exit(1);
  }
})();
