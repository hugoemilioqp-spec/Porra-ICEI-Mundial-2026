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

      let winnerTeam = null;
      if (penalties && penalties.home !== undefined && penalties.away !== undefined) {
          winnerTeam = (penalties.home > penalties.away) ? apiHome : apiAway;
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
        console.log(`✔ ${apiHome} vs ${apiAway} → ${homeScore ?? '?'}-${awayScore ?? '?'} [${status}]`);
        updatedCount++;
      } catch (err) { console.error(`❌ Excepción ${match.id}: ${err.message}`); }
    }

    // --- Placeholders para octavos, cuartos, semis y final (sin tocar dieciseisavos) ---
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

    // Función para saber si un valor ya es un equipo real
    const isPlaceholder = (value) => {
        return !value || value === 'Por definir' || value.includes('°') || value.includes('Ganador') || value.includes('Perdedor');
    };

    for (const [idStr, teams] of Object.entries(KO_PLACEHOLDERS)) {
        const matchId = parseInt(idStr);
        const match = firestoreMatches.find(m => m.id == matchId);
        if (!match) continue;
        // Si ya tiene equipos reales, no los tocamos
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

    // --- Generar automáticamente los dieciseisavos (con terceros reales) cuando la fase de grupos termine ---
    const GROUPS = {
        A: ['🇲🇽 México','🇿🇦 Sudáfrica','🇰🇷 Corea del Sur','🇨🇿 República Checa'],
        B: ['🇨🇦 Canadá','🇧🇦 Bosnia','🇶🇦 Catar','🇨🇭 Suiza'],
        C: ['🇧🇷 Brasil','🇲🇦 Marruecos','🏴󠁧󠁢󠁳󠁣󠁴󠁿 Escocia','🇭🇹 Haití'],
        D: ['🇺🇸 Estados Unidos','🇦🇺 Australia','🇵🇾 Paraguay','🇹🇷 Turquía'],
        E: ['🇩🇪 Alemania','🇨🇼 Curazao','🇨🇮 Costa de Marfil','🇪🇨 Ecuador'],
        F: ['🇳🇱 Países Bajos','🇯🇵 Japón','🇹🇳 Túnez','🇸🇪 Suecia'],
        G: ['🇧🇪 Bélgica','🇮🇷 Irán','🇪🇬 Egipto','🇳🇿 Nueva Zelanda'],
        H: ['🇪🇸 España','🇺🇾 Uruguay','🇸🇦 Arabia Saudita','🇨🇻 Cabo Verde'],
        I: ['🇫🇷 Francia','🇸🇳 Senegal','🇳🇴 Noruega','🇮🇶 Irak'],
        J: ['🇦🇷 Argentina','🇦🇹 Austria','🇩🇿 Argelia','🇯🇴 Jordania'],
        K: ['🇵🇹 Portugal','🇨🇴 Colombia','🇺🇿 Uzbekistán','🇨🇩 RD Congo'],
        L: ['🏴󠁧󠁢󠁥󠁮󠁧󠁿 Inglaterra','🇭🇷 Croacia','🇵🇦 Panamá','🇬🇭 Ghana']
    };

    const allGroupMatches = firestoreMatches.filter(m => m.group !== 'KO');
    const allPlayed = allGroupMatches.every(m => m.homeScore !== null);

    if (allPlayed) {
        console.log('⏳ Fase de grupos terminada. Generando dieciseisavos...');

        const getStandings = (group) => {
            const teams = GROUPS[group];
            const stats = {};
            teams.forEach(t => stats[t] = { team: t, pts:0, gf:0, ga:0 });
            firestoreMatches.filter(m => m.group === group && m.homeScore !== null).forEach(m => {
                const h = stats[m.homeRaw], a = stats[m.awayRaw];
                if (!h || !a) return;
                h.gf += m.homeScore; h.ga += m.awayScore; a.gf += m.awayScore; a.ga += m.homeScore;
                if (m.homeScore > m.awayScore) h.pts += 3;
                else if (m.homeScore < m.awayScore) a.pts += 3;
                else { h.pts += 1; a.pts += 1; }
            });
            return Object.values(stats).sort((a,b) => (b.pts - a.pts) || ((b.gf-b.ga) - (a.gf-a.ga)) || (b.gf - a.gf));
        };

        const qual = {};
        for (const g of Object.keys(GROUPS)) {
            const st = getStandings(g);
            qual[g] = [st[0]?.team, st[1]?.team, st[2]?.team];
        }

        // Mejores terceros
        const thirds = [];
        for (const g of Object.keys(GROUPS)) {
            if (qual[g][2]) {
                const st = getStandings(g);
                thirds.push({ team: st[2].team, group: g, pts: st[2].pts, gd: (st[2].gf||0) - (st[2].ga||0), gf: st[2].gf||0 });
            }
        }
        thirds.sort((a,b) => b.pts - a.pts || (b.gd - a.gd) || (b.gf - a.gf));
        const bestThirds = thirds.slice(0,8).map(t => t.team);

        // Asignación oficial FIFA de terceros
        const thirdSlots = [
            { matchId: 75, eligible: ['A','B','C','D','F'] },
            { matchId: 78, eligible: ['C','D','F','G','H'] },
            { matchId: 79, eligible: ['C','E','F','H','I'] },
            { matchId: 80, eligible: ['E','H','I','J','K'] },
            { matchId: 81, eligible: ['B','E','F','I','J'] },
            { matchId: 82, eligible: ['A','E','H','I','J'] },
            { matchId: 85, eligible: ['E','F','G','I','J'] },
            { matchId: 88, eligible: ['D','E','I','J','L'] }
        ];
        const assigned = {};
        const used = new Set();
        for (const slot of thirdSlots) {
            const selected = bestThirds.find(t => slot.eligible.includes(t.group) && !used.has(t));
            assigned[slot.matchId] = selected || 'Por definir';
            if (selected) used.add(selected);
        }

        // Emparejamientos oficiales
        const r32 = {
            73: [qual.A[1], qual.B[1]],                     // 2A vs 2B
            74: [qual.C[0], qual.F[1]],                     // 1C vs 2F
            75: [qual.E[0], assigned[75]],                  // 1E vs 3ABCDF
            76: [qual.F[0], qual.C[1]],                     // 1F vs 2C
            77: [qual.E[1], qual.I[1]],                     // 2E vs 2I
            78: [qual.I[0], assigned[78]],                  // 1I vs 3CDFGH
            79: [qual.A[0], assigned[79]],                  // 1A vs 3CEFHI
            80: [qual.L[0], assigned[80]],                  // 1L vs 3EHIJK
            81: [qual.D[0], assigned[81]],                  // 1D vs 3BEFIJ
            82: [qual.G[0], assigned[82]],                  // 1G vs 3AEHIJ
            83: [qual.K[1], qual.L[1]],                     // 2K vs 2L
            84: [qual.H[0], qual.J[1]],                     // 1H vs 2J
            85: [qual.B[0], assigned[85]],                  // 1B vs 3EFGIJ
            86: [qual.J[0], qual.H[1]],                     // 1J vs 2H
            87: [qual.K[0], assigned[87]],                  // 1K vs 3DEIJL
            88: [qual.D[1], qual.G[1]]                      // 2D vs 2G
        };

        for (const [id, teams] of Object.entries(r32)) {
            const url = `${BASE_URL}/matches/${id}?updateMask.fieldPaths=home&updateMask.fieldPaths=away`;
            const body = {
                fields: {
                    home: { stringValue: teams[0] },
                    away: { stringValue: teams[1] }
                }
            };
            await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body)
            });
            console.log(`✔ R32 ${id}: ${teams[0]} vs ${teams[1]}`);
        }
        console.log('✅ Dieciseisavos generados con terceros reales.');
    }
  } catch (error) {
    console.error('Error general:', error);
    process.exit(1);
  }
})();
