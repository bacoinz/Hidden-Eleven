// Códigos FIFA (e alguns nomes em inglês usados pela Wikipédia) → códigos de bandeira (ISO 3166-1 alfa-2, minúsculas).
export const FIFA_PARA_ISO = {
  AFG: 'af', ALB: 'al', ALG: 'dz', AND: 'ad', ANG: 'ao', ARG: 'ar', ARM: 'am', AUS: 'au', AUT: 'at', AZE: 'az',
  BEL: 'be', BEN: 'bj', BFA: 'bf', BIH: 'ba', BLR: 'by', BOL: 'bo', BRA: 'br', BUL: 'bg', BDI: 'bi',
  CAN: 'ca', CHI: 'cl', CHN: 'cn', CIV: 'ci', CMR: 'cm', COD: 'cd', CGO: 'cg', COL: 'co', CPV: 'cv', CRC: 'cr',
  CRO: 'hr', CUB: 'cu', CUW: 'cw', CYP: 'cy', CZE: 'cz', TCH: 'cz',
  DEN: 'dk', DOM: 'do', ECU: 'ec', EGY: 'eg', ENG: 'gb-eng', EQG: 'gq', ESP: 'es', EST: 'ee', ETH: 'et',
  FIN: 'fi', FRA: 'fr', FRO: 'fo', GAB: 'ga', GAM: 'gm', GEO: 'ge', GER: 'de', FRG: 'de', GDR: 'de', GHA: 'gh',
  GNB: 'gw', GRE: 'gr', GRN: 'gd', GUA: 'gt', GUI: 'gn', GUY: 'gy', HAI: 'ht', HON: 'hn', HUN: 'hu',
  IDN: 'id', IND: 'in', IRL: 'ie', IRN: 'ir', IRQ: 'iq', ISL: 'is', ISR: 'il', ITA: 'it', JAM: 'jm', JOR: 'jo', JPN: 'jp',
  KAZ: 'kz', KEN: 'ke', KOR: 'kr', KSA: 'sa', KOS: 'xk', KUW: 'kw', LBY: 'ly', LIB: 'lb', LIE: 'li', LTU: 'lt',
  LUX: 'lu', LVA: 'lv', MAR: 'ma', MDA: 'md', MAD: 'mg', MEX: 'mx', MKD: 'mk', MLI: 'ml', MLT: 'mt', MNE: 'me',
  MOZ: 'mz', MTN: 'mr', NED: 'nl', NGA: 'ng', NIR: 'gb-nir', NOR: 'no', NZL: 'nz', OMA: 'om', PAN: 'pa', PAR: 'py',
  PER: 'pe', PHI: 'ph', POL: 'pl', POR: 'pt', PRK: 'kp', PUR: 'pr', QAT: 'qa', ROU: 'ro', RSA: 'za', RUS: 'ru',
  RWA: 'rw', SCO: 'gb-sct', SEN: 'sn', SRB: 'rs', SCG: 'rs', SLE: 'sl', SLV: 'sv', SMR: 'sm', SUI: 'ch', SUR: 'sr',
  SVK: 'sk', SVN: 'si', SWE: 'se', SYR: 'sy', TAN: 'tz', THA: 'th', TOG: 'tg', TRI: 'tt', TUN: 'tn', TUR: 'tr',
  UAE: 'ae', UGA: 'ug', UKR: 'ua', URU: 'uy', USA: 'us', UZB: 'uz', VEN: 've', WAL: 'gb-wls', ZAM: 'zm', ZIM: 'zw',
  YUG: 'rs', SUD: 'sd', CTA: 'cf', CHA: 'td', COM: 'km', LBR: 'lr', NIG: 'ne', SOM: 'so', ERI: 'er', MWI: 'mw',
  NAM: 'na', BOT: 'bw', LES: 'ls', SWZ: 'sz', ESW: 'sz', STP: 'st', SEY: 'sc', MRI: 'mu', GLP: 'gp', MTQ: 'mq',
  GUF: 'gf', NCL: 'nc', TAH: 'pf', FIJ: 'fj', PNG: 'pg', SOL: 'sb', VAN: 'vu', NCA: 'ni', BLZ: 'bz', BER: 'bm',
  CAY: 'ky', BAH: 'bs', BRB: 'bb', ATG: 'ag', SKN: 'kn', LCA: 'lc', VIN: 'vc', DMA: 'dm', ARU: 'aw', HKG: 'hk',
  TPE: 'tw', VIE: 'vn', MAS: 'my', SIN: 'sg', MYA: 'mm', CAM: 'kh', LAO: 'la', BAN: 'bd', SRI: 'lk', NEP: 'np',
  PAK: 'pk', TJK: 'tj', TKM: 'tm', KGZ: 'kg', MGL: 'mn', BHR: 'bh', YEM: 'ye', PLE: 'ps', GIB: 'gi',
};

// Nomes usados por {{flagicon|Portugal}} em vez do código.
export const NOME_PARA_ISO = {
  portugal: 'pt', spain: 'es', france: 'fr', england: 'gb-eng', scotland: 'gb-sct', wales: 'gb-wls',
  'northern ireland': 'gb-nir', germany: 'de', 'west germany': 'de', italy: 'it', netherlands: 'nl', brazil: 'br',
  argentina: 'ar', croatia: 'hr', greece: 'gr', belgium: 'be', 'czech republic': 'cz', denmark: 'dk', sweden: 'se',
  norway: 'no', switzerland: 'ch', austria: 'at', poland: 'pl', russia: 'ru', ukraine: 'ua', serbia: 'rs',
  uruguay: 'uy', colombia: 'co', chile: 'cl', mexico: 'mx', 'united states': 'us', cameroon: 'cm',
  'ivory coast': 'ci', "côte d'ivoire": 'ci', ghana: 'gh', nigeria: 'ng', senegal: 'sn', morocco: 'ma',
  algeria: 'dz', egypt: 'eg', turkey: 'tr', japan: 'jp', 'south korea': 'kr', australia: 'au',
  'republic of ireland': 'ie', ireland: 'ie', hungary: 'hu', romania: 'ro', slovakia: 'sk', slovenia: 'si',
  bosnia: 'ba', 'bosnia and herzegovina': 'ba', montenegro: 'me', 'north macedonia': 'mk', georgia: 'ge',
  finland: 'fi', iceland: 'is', paraguay: 'py', peru: 'pe', ecuador: 'ec', venezuela: 've', bolivia: 'bo',
  'dr congo': 'cd', 'congo dr': 'cd', mali: 'ml', guinea: 'gn', 'south africa': 'za', togo: 'tg', gabon: 'ga',
  'cape verde': 'cv', angola: 'ao', mozambique: 'mz', 'guinea-bissau': 'gw', 'são tomé and príncipe': 'st',
  israel: 'il', iran: 'ir', 'saudi arabia': 'sa', qatar: 'qa', canada: 'ca', 'costa rica': 'cr', jamaica: 'jm',
  'new zealand': 'nz', china: 'cn', albania: 'al', kosovo: 'xk', bulgaria: 'bg', cyprus: 'cy', latvia: 'lv',
  lithuania: 'lt', estonia: 'ee', belarus: 'by', moldova: 'md', armenia: 'am', azerbaijan: 'az', kazakhstan: 'kz',
  luxembourg: 'lu', malta: 'mt', 'faroe islands': 'fo', tunisia: 'tn', 'burkina faso': 'bf', zambia: 'zm',
  zimbabwe: 'zw', uzbekistan: 'uz', 'equatorial guinea': 'gq', benin: 'bj', 'czechoslovakia': 'cz', yugoslavia: 'rs',
  'serbia and montenegro': 'rs', curaçao: 'cw', suriname: 'sr', haiti: 'ht', honduras: 'hn', panama: 'pa',
};

/** Converte um código FIFA ou nome de país num código de bandeira; devolve null se não souber. */
export function paraIso(valor) {
  if (!valor) return null;
  const v = String(valor).trim();
  if (FIFA_PARA_ISO[v.toUpperCase()]) return FIFA_PARA_ISO[v.toUpperCase()];
  return NOME_PARA_ISO[v.toLowerCase()] ?? null;
}

/** Código em maiúsculas para os JSON ("PT", "GB-ENG"). */
export const paraCodigoJson = (iso) => (iso ? iso.toUpperCase() : null);
