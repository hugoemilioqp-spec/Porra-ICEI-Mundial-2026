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

(async function main() {
  try {
    const token = await getAccessToken();

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
        round: f.round?.stringValue || f.round?.integerValue?.toString() || '',
        group: f.group?.stringValue || '',
        homeScore: f.homeScore?.integerValue != null ? parseInt(f.homeScore.integerValue) : null,
        awayScore: f.awayScore?.integerValue != null ? parseInt(f.awayScore.integerValue) : null,
        matchStatus: f.matchStatus?.stringValue || null
      };
    });

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

      // Determinar ganador automáticamente
      let winnerTeam = null;
      // 1. Por penaltis
      if (penalties && penalties.home !== undefined && penalties.away !== undefined) {
        winnerTeam = (penalties.home > penalties.away) ? apiHome : apiAway;
      }
      // 2. Si hay marcador y no hay penaltis: ganador por goles
      if (!winnerTeam && homeScore !== null && awayScore !== null) {
        if (homeScore > awayScore) winnerTeam = apiHome;
        else if (awayScore > homeScore) winnerTeam = apiAway;
      }
      // 3. Si la API trae un campo explícito de ganador (por si acaso)
      if (!winnerTeam && apiMatch.winner) {
        winnerTeam = translateToSpanish(apiMatch.winner);
      }
      // Si sigue sin definirse (empate sin penaltis aún), se queda null

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

      if (match.homeScore === homeScore && match.awayScore === awayScore && match.matchStatus === status) continue;

      const updateUrl = `${BASE_URL}/matches/${match.id}?updateMask.fieldPaths=homeScore&updateMask.fieldPaths=awayScore&updateMask.fieldPaths=matchStatus&updateMask.fieldPaths=liveMinute&updateMask.fieldPaths=extraTime&updateMask.fieldPaths=penalties&updateMask.fieldPaths=winnerTeam`;
      const body = {
        fields: {
          homeScore: toFirestoreValue(homeScore),
          awayScore: toFirestoreValue(awayScore),
          matchStatus: { stringValue: status },
          liveMinute: toFirestoreValue(liveMinute),
          extraTime: { booleanValue: extraTime },
          penalties: penalties ? {
            mapValue: {
              fields: {
                home: { integerValue: penalties.home || 0 },
                away: { integerValue: penalties.away || 0 }
              }
            }
          } : { nullValue: null },
          winnerTeam: winnerTeam ? { stringValue: winnerTeam } : { nullValue: null }
        }
      };

      try {
        const updResp = await fetch(updateUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify(body)
        });
        if (!updResp.ok) { console.error(`❌ Error ${match.id}: ${updResp.status}`); continue; }
        console.log(`✔ ${apiHome} vs ${apiAway} → ${homeScore ?? '?'}-${awayScore ?? '?'} [${status}] ${winnerTeam ? '(Ganador: ' + winnerTeam + ')' : ''}`);
        updatedCount++;
      } catch (err) { console.error(`❌ Excepción ${match.id}: ${err.message}`); }
    }

    // Placeholders para octavos, cuartos, semis y final
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
        100: { home: 'Ganador M95', away: 'Ganador M96' },
        101: { home: 'Ganador M97', away: 'Ganador M98' },
        102: { home: 'Ganador M99', away: 'Ganador M100' },
        103: { home: 'Perdedor M101', away: 'Perdedor M102' },
        104: { home: 'Ganador M101', away: 'Ganador M102' }
    };

    const isPlaceholder = (value) => {
        return !value || value === 'Por definir' || value.includes('°') || value.includes('Ganador') || value.includes('Perdedor');
    };

    for (const [idStr, teams] of Object.entries(KO_PLACEHOLDERS)) {
        const matchId = parseInt(idStr);
        const match = firestoreMatches.find(m => m.id == matchId);
        if (!match) continue;
        if (!isPlaceholder(match.homeRaw) && !isPlaceholder(match.awayRaw)) continue;

        const url = `${BASE_URL}/matches/${matchId}?updateMask.fieldPaths=home&updateMask.fieldPaths=away`;
        const body = { fields: { home: { stringValue: teams.home }, away: { stringValue: teams.away } } };
        try {
            const upd = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body)
            });
            if (upd.ok) console.log(`✔ KO ${matchId}: ${teams.home} vs ${teams.away}`);
        } catch (err) { console.warn(`No se pudo actualizar KO ${matchId}`); }
    }

    console.log(`Actualizados ${updatedCount} partidos.`);

    // Emparejamientos oficiales de dieciseisavos (COMENTADOS para no sobrescribir equipos existentes)
    // const OFFICIAL_R32 = { ... };
    // ... bucle de actualización comentado

    console.log('✅ Dieciseisavos verificados/corregidos.');
  } catch (error) {
    console.error('Error general:', error);
    process.exit(1);
  }
})();
