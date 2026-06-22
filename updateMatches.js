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
        const teams = GROUPS[group];
        const stats = {};
        teams.forEach(t => stats[t] = {team:t, pts:0, gf:0, ga:0, pj:0, w:0, d:0, l:0});
        matches.filter(m => m.group === group && m.homeScore !== null).forEach(m => {
            const h = stats[m.home], a = stats[m.away];
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
    const isPositionSecure = (team, group, position) => {
        const st = currentStandings[group];
        if (!st || st.length < 3) return false;
        const idx = st.findIndex(t => t.team === team);
        if (idx === -1) return false;
        if (position === 1) {
            return idx === 0 && (st[0].pts - st[2].pts > 3 || (st[0].pts - st[2].pts === 3 && (st[0].gf - st[0].ga) > (st[2].gf - st[2].ga)));
        }
        if (position === 2) {
            return idx === 1 && (st[1].pts - st[2].pts > 3 || (st[1].pts - st[2].pts === 3 && (st[1].gf - st[1].ga) > (st[2].gf - st[2].ga)));
        }
        return false;
    };

    const r32Map = {
        73: () => {
            const firstA = currentStandings.A[0]?.team;
            const secondB = currentStandings.B[1]?.team;
            const secure1 = firstA && isPositionSecure(firstA, 'A', 1);
            const secure2 = secondB && isPositionSecure(secondB, 'B', 2);
            return (secure1 && secure2) ? [firstA, secondB] : null;
        },
        74: () => null,
        75: () => {
            const firstF = currentStandings.F[0]?.team;
            const secondC = currentStandings.C[1]?.team;
            const secure1 = firstF && isPositionSecure(firstF, 'F', 1);
            const secure2 = secondC && isPositionSecure(secondC, 'C', 2);
            return (secure1 && secure2) ? [firstF, secondC] : null;
        },
        76: () => {
            const firstC = currentStandings.C[0]?.team;
            const secondF = currentStandings.F[1]?.team;
            const secure1 = firstC && isPositionSecure(firstC, 'C', 1);
            const secure2 = secondF && isPositionSecure(secondF, 'F', 2);
            return (secure1 && secure2) ? [firstC, secondF] : null;
        },
        77: () => null,
        78: () => {
            const secondE = currentStandings.E[1]?.team;
            const secondI = currentStandings.I[1]?.team;
            const secure1 = secondE && isPositionSecure(secondE, 'E', 2);
            const secure2 = secondI && isPositionSecure(secondI, 'I', 2);
            return (secure1 && secure2) ? [secondE, secondI] : null;
        },
        79: () => null,
        80: () => null,
        81: () => null,
        82: () => null,
        83: () => {
            const secondK = currentStandings.K[1]?.team;
            const secondL = currentStandings.L[1]?.team;
            const secure1 = secondK && isPositionSecure(secondK, 'K', 2);
            const secure2 = secondL && isPositionSecure(secondL, 'L', 2);
            return (secure1 && secure2) ? [secondK, secondL] : null;
        },
        84: () => {
            const firstH = currentStandings.H[0]?.team;
            const secondJ = currentStandings.J[1]?.team;
            const secure1 = firstH && isPositionSecure(firstH, 'H', 1);
            const secure2 = secondJ && isPositionSecure(secondJ, 'J', 2);
            return (secure1 && secure2) ? [firstH, secondJ] : null;
        },
        85: () => null,
        86: () => {
            const firstJ = currentStandings.J[0]?.team;
            const secondH = currentStandings.H[1]?.team;
            const secure1 = firstJ && isPositionSecure(firstJ, 'J', 1);
            const secure2 = secondH && isPositionSecure(secondH, 'H', 2);
            return (secure1 && secure2) ? [firstJ, secondH] : null;
        },
        87: () => null,
        88: () => {
            const secondD = currentStandings.D[1]?.team;
            const secondG = currentStandings.G[1]?.team;
            const secure1 = secondD && isPositionSecure(secondD, 'D', 2);
            const secure2 = secondG && isPositionSecure(secondG, 'G', 2);
            return (secure1 && secure2) ? [secondD, secondG] : null;
        }
    };

    for (const [idStr, getTeams] of Object.entries(r32Map)) {
        const teams = getTeams();
        if (!teams) continue;

        const matchId = parseInt(idStr);
        const match = firestoreMatches.find(m => m.id == matchId);
        if (!match) continue;

        if (match.homeRaw !== 'Por definir' && match.awayRaw !== 'Por definir') {
            if (match.homeRaw === teams[0] && match.awayRaw === teams[1]) continue;
        }

        const url = `${BASE_URL}/matches/${matchId}?updateMask.fieldPaths=home&updateMask.fieldPaths=away`;
        const body = {
            fields: {
                home: { stringValue: teams[0] },
                away: { stringValue: teams[1] }
            }
        };
        try {
            const upd = await fetch(url, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify(body)
            });
            if (upd.ok) console.log(`✔ R32 ${matchId}: ${teams[0]} vs ${teams[1]} (actualizado en vivo)`);
        } catch (err) {
            console.warn(`No se pudo actualizar R32 ${matchId}: ${err.message}`);
        }
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
