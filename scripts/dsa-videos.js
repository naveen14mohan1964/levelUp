// YouTube reference videos for every DSA lesson in the plan (Striver / take U forward + Kunal Kushwaha).
// Each key is a plan day: W<week>d<dow> (weeks 1–13 have their own lesson per day), or W<week> for a whole
// revision week (14–22). Every ID must exist in server/data/youtube-catalog.json (videos read from the confirmed
// channel playlists), so a typo or an invented ID fails the build instead of showing a broken card.
//
//   node scripts/dsa-videos.js      -> writes server/data/dsa-videos.json (keyed by the plan's original dates)
const fs = require('fs');
const path = require('path');

const MAP = {
  // Week 1: foundations
  W1d0: ['FPu9Uld7W-E', 'mV3wrLBbuuE', '9ogGan-R1pc', 'n60Dn0UsbEk', 'UXDSeD9mN-k'],
  W1d1: ['1xNbjMdbjug', 'lmSpZ0bjCyQ', 'mV3wrLBbuuE'],
  W1d2: ['37E9ckMDdTk', 'wvcQg43_V8U', 'n60Dn0UsbEk'],
  W1d3: ['bYWLJb3vCWY', 'nP_ns3uSh80', 'sFBCAl8yBfE'],
  W1d4: ['qQd-ViW7bfk', 'nttpF8kwgd4', 'fzip9Aml6og', 'sFBCAl8yBfE'],
  W1d5: ['Z0R2u6gd3GU', '3Zv-s9UUrFM', 'N0MgLvceX7M'],
  W1d6: ['3Zv-s9UUrFM', 'lmSpZ0bjCyQ'],
  // Week 2: arrays II
  W2d0: ['9kdHxplyl5I', 'UXDSeD9mN-k', 'n7uwj04E0I4'],
  W2d1: ['DhFh8Kw7ymk', 'onLoX6Nhvmg', 'tp8JIuCXBaU', 'eD95WRfh81c'],
  W2d2: ['xvNwoz-ufXA', 'frf7qxiN2qU'],
  W2d3: ['AHZpyENo7k4', 'excAOvwF_Wk', 'hnswaLJvr6g'],
  W2d4: ['JDOXKqF60RQ', 'h4aBagy4Uok', 'oO5uLE7EUlM'],
  W2d5: ['IexN60k62jo', 'xxRE-46OCC8', 'HDHQ8lAWakY', '1_5VuquLbXg'],
  W2d6: ['frf7qxiN2qU', 'IexN60k62jo'],
  // Week 3: hashing, strings, sliding window
  W3d0: ['KEs5UyBJ39g', 'XLbvmMz8Fr8', 'dRUpbt8vHpo'],
  W3d1: ['zL1DPZ0Ovlo', 'YFZai3fPUQI'],
  W3d2: ['zL1DPZ0Ovlo', '6i_T5kkfv4A', 'swciWFPq3NE'],
  W3d3: ['9kdHxplyl5I', 'pBWCOCS636U'],
  W3d4: ['-zSxTJkcdAo', '_eNhaDCr6P0', '3E4JBHSLpYk', 'teM9ZsVRQyc'],
  W3d5: ['XnMdNUkX6VM', 'j_QOv9OT9Og', 'WJaij9ffOIY', '7wYGbV_LsX4'],
  W3d6: ['pBWCOCS636U', 'xtqN4qlgr8s'],
  // Week 4: sorting + binary search
  W4d0: ['HGk_ypEuS24', 'ogjf7ORKfd8', 'WIrA4YexLRQ', 'F5MZyqRp_IM', 'Nd4SCCIHFWk', 'By_5-RRqVeE', 'iKGAgWdgoRk', 'Z8svOqamag8'],
  W4d1: ['AseUmwVNaoY', '0e4bZaP3MDI', 'iKGAgWdgoRk', 'JfinxytTYFQ'],
  W4d2: ['MHf6awe89xw', '6zhGS79oQ4k', 'hjR1IYVx9lY', 'Bsv3FPUX_BA', 'f6UU7V3szVw'],
  W4d3: ['5qGrJbHhqFs', 'w2G2W8l__pc', 'nhEMDKMB44g', 'cXxmbemS6XM', 'AZOmHuHadxQ', 'W9QJ8HaRvJQ'],
  W4d4: ['qyfekrNni90', 'MG-Ac4TAvTY', 'TXAuxeYBTdg', 'UvBKTVaG6U8', 'thUd_WJn6wk'],
  W4d5: ['uZ0N_hZpyps', 'JXU4Akft7yk', '9ZbB397jU4k', 'enI_KyGLYPo'],
  W4d6: ['cXxmbemS6XM', 'R_Mfw4ew-Vo'],
  // Week 5: recursion + backtracking
  W5d0: ['yVdKa8dnKiE', 'un6PLygfXrA', '69ZCDFy-OUo', 'twuC1F6gLI8', 'kvRjNm4rVBE', 'M2uO2nMT0Bk', 'JxILxTwHukM'],
  W5d1: ['AxNNVECce8c', 'eQCS_v3bw0Q', 'rYkfBRtMJr8', 'RIn3gOkbhQE', 'gdifkIwCJyg', '9ByWqPzfXDU'],
  W5d2: ['OyZFFqQtu98', 'G1fRTGRxXU8'],
  W5d3: ['YK78FU5Ffjw', 'f2ic2Rsc9pU', 'WBgsABoClE0', 'gDGw0cvFXPQ'],
  W5d4: ['i05Ju7AftcM', 'FWAIf_EVUKE', 'zg5v2rlV1tM', 'nC1rbW2YSz0'],
  W5d5: ['bLGZhJlt4y0', 'wuVwUK25Rfc', 'zg5v2rlV1tM'],
  W5d6: ['eQCS_v3bw0Q', 'gdifkIwCJyg'],
  // Week 6: linked lists
  W6d0: ['Nq7ok-OyEpg', 'VaECK03Dz-g', 'D2vI2DNJGd8', '7LjQ57RqgEc', '58YbpRDc4yw'],
  W6d1: ['wiOo4DC5GGA', 'lRY_G-u_8jk', '2Kd0KKmmHFc', '3kMKYQ2wNIU', 'ePpV-_pfOeI', '70tx7KcMROc'],
  W6d2: ['jXu-H7XuClE', '0DYoPz2Tpt4', 'XmRrGzR6udg', 'qf6qp7GzD5Q', '8ocB7a_c-Cc'],
  W6d3: ['D2vI2DNJGd8', 'uT7YI7XbTY8', 'lIar1skcQYI'],
  W6d4: ['0eKMU10uEDI', 'q570bKdrnlw', 'ykelywHJWLg', '1zktEppsdig'],
  W6d5: ['YJKVTnOJXSY', 'z9bJUPxzFOw', 'mG3KLugbOdc'],
  W6d6: ['XmRrGzR6udg', 'aXQWhbvT3w0', '70tx7KcMROc'],
  // Week 7: stacks, queues, monotonic stack, deque
  W7d0: ['tqQ5fTamIN4', 'xwjS0iZhw4I', 'NdDIaH91P0g', 'rHQI4mrJ3cg'],
  W7d1: ['4pIc9UBHJtk', 'S9LUYztYLu4'],
  W7d2: ['e7XQLtOQM3I', '7PrncD7v9YQ', 'zMdbdGJNlh4', 'eay-zoSRkVc', 'jmbuRzYPGrg'],
  W7d3: ['v0e8p9JCgRc', 'gIrMptNPf5M', 'Bzat9vgD0fs', 'ttVu6G7Ayik'],
  W7d4: ['_eYGqw_VDR4', 'NwBvene4Imo', 'rHQI4mrJ3cg'],
  W7d5: ['jmbuRzYPGrg', 'xwjS0iZhw4I', 'S9LUYztYLu4'],
  W7d6: ['e7XQLtOQM3I', '7PrncD7v9YQ'],
  // Week 8: binary trees
  W8d0: ['_ANrF3FJm7I', 'hyLyW7rP24I', 'jmy0LaGET1I', 'RlUu72JrOCQ', 'Z_NEgBgbRVI', 'COQOU6klsBg', 'EoAsWbO7sqg', 'Bfqd8BsPVuw', 'lxTGsVXjwvM', '2YBhNLodD8Q', 'NzIGLLwZBS8', '4s1Tcvm00pA'],
  W8d1: ['eD3tmO66aBA', 'Yt50Jfbd8Po', 'Rezetez59Nk', 'WszrfSwMz58'],
  W8d2: ['BhuvF_-PWS0', 'nKggNAiEpBE', '3OXWEdlIGl4', 'KV4mRzTjlAk', '9D-vP-jcc-Y'],
  W8d3: ['fmflMqVOC7k', 'ZbybYvcVLks', '0ca1nvR0be4', 'q_a6lpbKJdw', 'Et9OCDNvJ78', '0FtVY6I4pB8', 'Qdr3ohMSxBo'],
  W8d4: ['_-QHfMDde90', '9D-vP-jcc-Y'],
  W8d5: ['LFGBTFxHJII', 'kNZ5VIkqReU', 'ySp2epYvgTE'],
  W8d6: ['9D-vP-jcc-Y', 'ySp2epYvgTE'],
  // Week 9: BST, heaps, tries
  W9d0: ['4s1Tcvm00pA', 'CVA85JuJEn0'],
  W9d1: ['oB1EIXIDS8s', 'guzgnCSafg4', 'CxNRKTp6_9s', '4s1Tcvm00pA'],
  W9d2: ['Qf-TDPr0nYw'],
  W9d3: ['Qf-TDPr0nYw', 'XLfgeaYHinM'],
  W9d4: ['Qf-TDPr0nYw', 'kMSBvlZ-_HA'],
  W9d5: ['dBGUmUQhjaM', 'K5pcpkEMCN0', 'AWnBa91lThI', '5iyuU4hQFrw', 'EIhAwfHubE8'],
  W9d6: ['4s1Tcvm00pA', 'RV0QeTyHZxo'],
  // Week 10: graphs I
  W10d0: ['M3_pLsDdeuU', 'OsNklbh9gYI', 'lea-Wl_uWXY', '-tgVpUgsQ5k', 'Qzf1a--rhp8', 'ACzkVtewUYA', 'muncqlKJrH0', 'C-2_uSRli8o'],
  W10d1: ['yf3oUhkvqA0', 'edXdVwkYHF8', 'BtdgAys4yMk', 'rxKcepXQgU4'],
  W10d2: ['BPlrALf1LDU', 'zQ3zgFypzX4', '-vu34sct1g8', 'KG5YFfR0j8A', '9twcmtQj4DU', 'uRbJ1OF9aYM', '2gtg3VsDGyc'],
  W10d3: ['5lZ0iJMrUMk', '73sneFXuTEg', 'iTBaI90lpDQ', 'WAOfKpxYHR8', 'U3N_je7tWAs'],
  W10d4: ['C4gxoTaI71U', 'ZUFQfFaU-8U', 'U5Mw4eyUmw4', 'tRPda0rcf8E', '2odLxQWYDi0'],
  W10d5: ['7zmgQSJghpo', 'muncqlKJrH0', 'Qzf1a--rhp8'],
  W10d6: ['rxKcepXQgU4', 'edXdVwkYHF8'],
  // Week 11: graphs II + greedy
  W11d0: ['V6H1qAeB-l4', 'PATgNiuTP20', '3dINsjyfooY', 'rp1SMw7HSO8', '0ytpZyiZFhA'],
  W11d1: ['9XybHVqTHcQ', '0vVofAhAYjc', 'YbY8cVwWAvw', 'PwMVNSJ5SLI', '_-0mx0SmYxA'],
  W11d2: ['aBxjDBC4M1U', 'ZGr5nX-Gi6Y', 'FYrl7iz9_ZU', 'FMwpt_aQOGw', 'OwMNX8SPavM'],
  W11d3: ['ZSPjZuZWCME', 'mJcZjjKzeqk', 'DMnDM_sxVig', 'qrAub5z8FeA', 'j1QDfU21iZk'],
  W11d4: ['DIX2p7vb9co', 'n_tmibEhO6Q', 'tZAa_jJ3SwQ', '7SBVnw7GSTk', 'cHT6sG_hUZI'],
  W11d5: ['HDHQ8lAWakY', 'mKfhTotEguk', 'IIqVFvKE6RY', 'AsGzwR_FWok'],
  W11d6: ['1ibsQrnuEEg', 'QbwltemZbRg', 'R6uoSjZ2imo'],
  // Week 12: dynamic programming I
  W12d0: ['tyB0ztf0DNY', 'mLfjzJsN8us', 'EgG3jsGoPvQ', 'GrMBfJNk_NY', '3WaxQMELSkw'],
  W12d1: ['Kmh3rhyEtB8', 'AE39gJYuRog', 'myPeWb3Y68A'],
  W12d2: ['sdE0A2Oxofw', 'TmhpgXScLyY', '_rgTlyky1uQ', 'SrP-PiLSYC0', 'N_aJ5qQbYA0'],
  W12d3: ['fWX9xDmIzRI', '7win3dcgo3k', 'GS_OqZb2CWc', 'ZHyb-A2Mte4', 'GqOmJHQZivw', 'b3GD8263-PQ'],
  W12d4: ['OgvOZ6OrJoY', 'mO8XpGoJwuo', 'HgyouUi11zk'],
  W12d5: ['NPZn9jBrX8U', '-zI4mrF2Pb4', '6i_T5kkfv4A', 'xPBLEj41rFU', 'yMnH0jrir0Q'],
  W12d6: ['zoilQD1kYSg', '_wP9mWNPL5w'],
  // Week 13: DP II + advanced
  W13d0: ['fJaKO8FbDdo', 'nVG7eTiD2bY', 'ZmlQ3vgAOMo', 'xElxAuBcvsU'],
  W13d1: ['ekcwMsSIzVc', 'IFfYfonAFGc', 'on2hvxBXJH4', 'gDuZwBW9VvM', 'YY8iBaYcc4g', 'cKVl1TFdNXg'],
  W13d2: ['excAOvwF_Wk', 'nGJmxkUJQGs', '-uQGzhYj8BQ', 'IV1dHbk5CDc', 'IGIe46xw3YY', 'k4eK-vEmnKg'],
  W13d3: ['vRVfmbCFW7Y', 'pDCXsbAw5Cg', 'xwomavsC86c', 'Yz4LlDSlkns', 'MM7fXopgyjw'],
  W13d4: ['tOylVCugy9k', 'auS1fynpnjo', 'PhWWJmaKfMc'],
  W13d5: ['ciHThtTVNto', 'swciWFPq3NE', 'U4YmISZViSs'],
  W13d6: ['y4vN0WNdrlg', '_H8V5hJUGd0'],
  // Revision weeks: one set per week
  W14: ['AHZpyENo7k4', '9kdHxplyl5I', 'D2vI2DNJGd8', 'wiOo4DC5GGA', 'e7XQLtOQM3I', 'Bzat9vgD0fs', '70tx7KcMROc', 'S9LUYztYLu4'],
  W15: ['eQCS_v3bw0Q', 'i05Ju7AftcM', 'jmy0LaGET1I', 'WszrfSwMz58', '_-QHfMDde90', '9D-vP-jcc-Y'],
  W16: ['4s1Tcvm00pA', 'Qf-TDPr0nYw', '-tgVpUgsQ5k', '5lZ0iJMrUMk', 'V6H1qAeB-l4', 'aBxjDBC4M1U'],
  W17: ['tyB0ztf0DNY', 'fWX9xDmIzRI', 'NPZn9jBrX8U', 'ekcwMsSIzVc', 'vRVfmbCFW7Y', 'HDHQ8lAWakY', 'ciHThtTVNto'],
};
// Weak-area and interview weeks: the first lesson of every topic series, so you can jump back into any of them.
const TOPIC_STARTS = ['9kdHxplyl5I', 'MHf6awe89xw', 'yVdKa8dnKiE', 'Nq7ok-OyEpg', 'tqQ5fTamIN4', '_ANrF3FJm7I', '4s1Tcvm00pA', 'Qf-TDPr0nYw', 'M3_pLsDdeuU', 'DIX2p7vb9co', 'tyB0ztf0DNY', 'dBGUmUQhjaM', 'qQd-ViW7bfk'];
MAP.W18 = TOPIC_STARTS;
MAP.W19 = TOPIC_STARTS;
MAP.W20 = ['waGfV-IoOt8', ...TOPIC_STARTS];
MAP.W21 = ['waGfV-IoOt8', ...TOPIC_STARTS];
MAP.W22 = ['waGfV-IoOt8', ...TOPIC_STARTS];

function build() {
  const root = path.join(__dirname, '..', 'server', 'data');
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'youtube-catalog.json'), 'utf8')).videos;
  const plan = JSON.parse(fs.readFileSync(path.join(root, 'plan.json'), 'utf8'));
  const unknown = Object.entries(MAP).flatMap(([k, ids]) => ids.filter((id) => !catalog[id]).map((id) => `${k}: ${id}`));
  if (unknown.length) throw new Error(`Not in the confirmed catalog: ${unknown.join(', ')}`);
  const out = {};
  const missing = [];
  for (const d of plan.days) {
    const ids = MAP[`W${d.week}d${d.dow}`] || MAP[`W${d.week}`];
    if (!ids?.length) { missing.push(`${d.date} W${d.week}d${d.dow}`); continue; }
    out[d.date] = [...new Set(ids)].map((id) => ({ id, ...catalog[id] }));
  }
  if (missing.length) throw new Error(`Days without videos: ${missing.join(', ')}`);
  fs.writeFileSync(path.join(root, 'dsa-videos.json'), JSON.stringify(out, null, 1));
  const total = Object.values(out).reduce((n, v) => n + v.length, 0);
  console.log(`dsa-videos.json: ${Object.keys(out).length} of ${plan.days.length} days, ${total} video cards, ${new Set(Object.values(out).flat().map((v) => v.id)).size} different videos`);
}

if (require.main === module) build();
module.exports = { MAP, build };
