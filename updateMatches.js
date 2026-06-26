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
        homeScore: f.homeScore?.integerValue ?? null,
        awayScore: f.awayScore?.integerValue ?? null,
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

      if (!match) {
        console.warn(`⚠️ No emparejó: ${apiHome} vs ${apiAway}`);
        continue;
      }

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
        if (!updResp.ok) {
          console.error(`❌ Error al actualizar ${match.id}: ${updResp.status} ${await updResp.text()}`);
          continue;
        }
        console.log(`✔ ${apiHome} vs ${apiAway} → ${homeScore ?? '?'}-${awayScore ?? '?'} [${status}]`);
        updatedCount++;
      } catch (err) {
        console.error(`❌ Excepción al actualizar ${match.id}: ${err.message}`);
      }
    }

    // --- Actualización continua del cuadro de dieciseisavos ---
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

const getGroupStandingsLocal = (matches, group) => {
    const teams = GROUPS[group].map(t => cleanName(t));   // equipos limpios
    const stats = {};
    teams.forEach(t => stats[t] = {team:t, pts:0, gf:0, ga:0, pj:0, w:0, d:0, l:0});
    matches.filter(m => m.group === group && m.homeScore !== null).forEach(m => {
        const h = stats[cleanName(m.homeRaw)];   // usar nombres limpios
        const a = stats[cleanName(m.awayRaw)];
        if (!h || !a) return;
        h.pj++; a.pj++; h.gf += m.homeScore; h.ga += m.awayScore; a.gf += m.awayScore; a.ga += m.homeScore;
        if (m.homeScore > m.awayScore) { h.w++; h.pts += 3; a.l++; }
        else if (m.homeScore < m.awayScore) { a.w++; a.pts += 3; h.l++; }
        else { h.d++; a.d++; h.pts++; a.pts++; }
    });
    return Object.values(stats).sort((a,b) => (b.pts - a.pts) || ((b.gf-b.ga) - (a.gf-a.ga)) || (b.gf - a.gf));
};

    const currentStandings = {};
    for (const g of Object.keys(GROUPS)) {
        currentStandings[g] = getGroupStandingsLocal(firestoreMatches, g);
    }

// Función para saber si un equipo ya tiene asegurada su posición (1º o 2º)
// Si el grupo ya terminó, la posición es segura automáticamente.
const isPositionSecure = (team, group, position) => {
    const st = currentStandings[group];
    if (!st || st.length < 3) return false;
    
    // Verificar si el grupo ya ha terminado (todos los partidos jugados)
    const groupMatches = firestoreMatches.filter(m => m.group === group);
    const allPlayed = groupMatches.every(m => m.homeScore !== null);
    
    const idx = st.findIndex(t => t.team === team);
    if (idx === -1) return false;
    
    // Si el grupo terminó, la posición es segura si coincide con la esperada
    if (allPlayed) {
        if (position === 1) return idx === 0;
        if (position === 2) return idx === 1;
        return false;
    }
    
    // Si el grupo no ha terminado, verificar diferencia de puntos y goles con el tercero
    if (position === 1) {
        return idx === 0 && (st[0].pts - st[2].pts > 3 || (st[0].pts - st[2].pts === 3 && (st[0].gf - st[0].ga) > (st[2].gf - st[2].ga)));
    }
    if (position === 2) {
        return idx === 1 && (st[1].pts - st[2].pts > 3 || (st[1].pts - st[2].pts === 3 && (st[1].gf - st[1].ga) > (st[2].gf - st[2].ga)));
    }
    return false;
};

const r32Map = {
    // --- Partidos fijos (sin terceros) ---
    73: () => ({   // 2°A vs 2°B
        home: currentStandings.A[1]?.team && isPositionSecure(currentStandings.A[1].team, 'A', 2) ? currentStandings.A[1].team : '2°A',
        away: currentStandings.B[1]?.team && isPositionSecure(currentStandings.B[1].team, 'B', 2) ? currentStandings.B[1].team : '2°B'
    }),
    74: () => ({   // 1°C vs 2°F
        home: currentStandings.C[0]?.team && isPositionSecure(currentStandings.C[0].team, 'C', 1) ? currentStandings.C[0].team : '1°C',
        away: currentStandings.F[1]?.team && isPositionSecure(currentStandings.F[1].team, 'F', 2) ? currentStandings.F[1].team : '2°F'
    }),
    75: () => null,   // 1°E vs 3°A/B/C/D/F (tercero) – lo tratamos abajo
    76: () => ({   // 1°F vs 2°C
        home: currentStandings.F[0]?.team && isPositionSecure(currentStandings.F[0].team, 'F', 1) ? currentStandings.F[0].team : '1°F',
        away: currentStandings.C[1]?.team && isPositionSecure(currentStandings.C[1].team, 'C', 2) ? currentStandings.C[1].team : '2°C'
    }),
    77: () => ({   // 2°E vs 2°I
        home: currentStandings.E[1]?.team && isPositionSecure(currentStandings.E[1].team, 'E', 2) ? currentStandings.E[1].team : '2°E',
        away: currentStandings.I[1]?.team && isPositionSecure(currentStandings.I[1].team, 'I', 2) ? currentStandings.I[1].team : '2°I'
    }),
    78: () => null,   // 1°I vs 3°C/D/F/G/H
    79: () => null,   // 1°A vs 3°C/E/F/H/I
    80: () => null,   // 1°L vs 3°E/H/I/J/K
    81: () => null,   // 1°G vs 3°A/E/H/I/J
    82: () => null,   // 1°D vs 3°B/E/F/I/J
    83: () => ({   // 1°H vs 2°J
        home: currentStandings.H[0]?.team && isPositionSecure(currentStandings.H[0].team, 'H', 1) ? currentStandings.H[0].team : '1°H',
        away: currentStandings.J[1]?.team && isPositionSecure(currentStandings.J[1].team, 'J', 2) ? currentStandings.J[1].team : '2°J'
    }),
    84: () => ({   // 2°K vs 2°L
        home: currentStandings.K[1]?.team && isPositionSecure(currentStandings.K[1].team, 'K', 2) ? currentStandings.K[1].team : '2°K',
        away: currentStandings.L[1]?.team && isPositionSecure(currentStandings.L[1].team, 'L', 2) ? currentStandings.L[1].team : '2°L'
    }),
    85: () => null,   // 1°B vs 3°E/F/G/I/J
    86: () => ({   // 2°D vs 2°G
        home: currentStandings.D[1]?.team && isPositionSecure(currentStandings.D[1].team, 'D', 2) ? currentStandings.D[1].team : '2°D',
        away: currentStandings.G[1]?.team && isPositionSecure(currentStandings.G[1].team, 'G', 2) ? currentStandings.G[1].team : '2°G'
    }),
    87: () => ({   // 1°J vs 2°H
        home: currentStandings.J[0]?.team && isPositionSecure(currentStandings.J[0].team, 'J', 1) ? currentStandings.J[0].team : '1°J',
        away: currentStandings.H[1]?.team && isPositionSecure(currentStandings.H[1].team, 'H', 2) ? currentStandings.H[1].team : '2°H'
    }),
    88: () => null    // 1°K vs 3°D/E/I/J/L
};

// --- Partidos con terceros: mostramos siempre las posiciones ---
const thirdPlaceholders = {
    75: { home: '1°E', away: '3°A/B/C/D/F' },
    78: { home: '1°I', away: '3°C/D/F/G/H' },
    79: { home: '1°A', away: '3°C/E/F/H/I' },
    80: { home: '1°L', away: '3°E/H/I/J/K' },
    81: { home: '1°G', away: '3°A/E/H/I/J' },
    82: { home: '1°D', away: '3°B/E/F/I/J' },
    85: { home: '1°B', away: '3°E/F/G/I/J' },
    88: { home: '1°K', away: '3°D/E/I/J/L' }
};

for (const [idStr, getTeams] of Object.entries(r32Map)) {
    const teams = getTeams();
    const matchId = parseInt(idStr);
    const match = firestoreMatches.find(m => m.id == matchId);
    if (!match) continue;

    // Si el partido depende de terceros, usamos los placeholders fijos
    let newHome, newAway;
    if (teams === null) {
        newHome = thirdPlaceholders[matchId]?.home || 'Por definir';
        newAway = thirdPlaceholders[matchId]?.away || 'Por definir';
    } else {
        newHome = teams.home || 'Por definir';
        newAway = teams.away || 'Por definir';
    }

    if (match.homeRaw === newHome && match.awayRaw === newAway) continue;

    const url = `${BASE_URL}/matches/${matchId}?updateMask.fieldPaths=home&updateMask.fieldPaths=away`;
    const body = {
        fields: {
            home: { stringValue: newHome },
            away: { stringValue: newAway }
        }
    };
    try {
        const upd = await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        });
        if (upd.ok) console.log(`✔ R32 ${matchId}: ${newHome} vs ${newAway}`);
    } catch (err) { console.warn(`No se pudo actualizar R32 ${matchId}: ${err.message}`); }
}
// --- Placeholders para octavos, cuartos, semis y final ---
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

for (const [idStr, teams] of Object.entries(KO_PLACEHOLDERS)) {
    const matchId = parseInt(idStr);
    const match = firestoreMatches.find(m => m.id == matchId);
    if (!match) continue;
    // Solo actualizar si está completamente vacío (evitar sobrescribir equipos reales)
    if (match.homeRaw !== 'Por definir' && match.awayRaw !== 'Por definir') continue;
    if (match.homeRaw === teams.home && match.awayRaw === teams.away) continue;

    const url = `${BASE_URL}/matches/${matchId}?updateMask.fieldPaths=home&updateMask.fieldPaths=away`;
    const body = {
        fields: {
            home: { stringValue: teams.home },
            away: { stringValue: teams.away }
        }
    };
    try {
        const upd = await fetch(url, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify(body)
        });
        if (upd.ok) console.log(`✔ KO ${matchId}: ${teams.home} vs ${teams.away} (placeholder)`);
    } catch (err) { console.warn(`No se pudo actualizar KO ${matchId}`); }
}
    console.log(`Actualizados ${updatedCount} partidos.`);

    // --- Generar automáticamente los dieciseisavos cuando termine la fase de grupos ---
    const allGroupMatches = firestoreMatches.filter(m => m.group !== 'KO');
    const allPlayed = allGroupMatches.every(m => m.homeScore !== null);

    if (allPlayed) {
        console.log('⏳ Todos los partidos de grupo finalizados. Generando dieciseisavos...');

        const qual = {};
        for (const g of Object.keys(GROUPS)) {
            const st = getGroupStandingsLocal(firestoreMatches, g);
            qual[g] = [st[0]?.team, st[1]?.team, st[2]?.team];
        }

        const thirds = [];
        for (const g of Object.keys(GROUPS)) {
            if (qual[g][2]) {
                const st = getGroupStandingsLocal(firestoreMatches, g);
                thirds.push({ team: qual[g][2], group: g, pts: st[2].pts, gd: st[2].gf - st[2].ga, gf: st[2].gf });
            }
        }
        thirds.sort((a, b) => b.pts - a.pts || (b.gd - a.gd) || (b.gf - a.gf));
        const bestThirds = thirds.slice(0, 8).map(t => t.team);

        const thirdSlots = [
            { matchId: 74, eligible: ['A','B','C','D','F'] },
            { matchId: 77, eligible: ['C','D','F','G','H'] },
            { matchId: 79, eligible: ['C','E','F','H','I'] },
            { matchId: 80, eligible: ['E','H','I','J','K'] },
            { matchId: 81, eligible: ['B','E','F','I','J'] },
            { matchId: 82, eligible: ['A','E','H','I','J'] },
            { matchId: 85, eligible: ['E','F','G','I','J'] },
            { matchId: 87, eligible: ['D','E','I','J','L'] }
        ];
        const assigned = {};
        const used = new Set();
        for (const slot of thirdSlots) {
            const selected = bestThirds.find(t => slot.eligible.includes(t.group) && !used.has(t));
            if (selected) {
                assigned[slot.matchId] = selected;
                used.add(selected);
            } else {
                assigned[slot.matchId] = 'Por definir';
            }
        }

        const r32 = {
            73: [qual.A[1], qual.B[1]],
            74: [qual.E[0], assigned[74] || 'Por definir'],
            75: [qual.F[0], qual.C[1]],
            76: [qual.C[0], qual.F[1]],
            77: [qual.I[0], assigned[77] || 'Por definir'],
            78: [qual.E[1], qual.I[1]],
            79: [qual.A[0], assigned[79] || 'Por definir'],
            80: [qual.L[0], assigned[80] || 'Por definir'],
            81: [qual.D[0], assigned[81] || 'Por definir'],
            82: [qual.G[0], assigned[82] || 'Por definir'],
            83: [qual.K[1], qual.L[1]],
            84: [qual.H[0], qual.J[1]],
            85: [qual.B[0], assigned[85] || 'Por definir'],
            86: [qual.J[0], qual.H[1]],
            87: [qual.K[0], assigned[87] || 'Por definir'],
            88: [qual.D[1], qual.G[1]]
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
        console.log('✅ Dieciseisavos generados automáticamente.');
    }
  } catch (error) {
    console.error('Error general:', error);
    process.exit(1);
  }
})();
