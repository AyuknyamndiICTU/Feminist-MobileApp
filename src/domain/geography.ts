/**
 * Administrative reference data (Region > Department > Arrondissement).
 * Region codes follow ISO 3166-2:CM. Arrondissements are seeded only for the suggested pilot
 * departments (urban Centre/Littoral, rural East, Far North with security issues). In production the
 * full list of 360 arrondissements is downloaded from the register's reference-data endpoint.
 */
export interface Arrondissement { code: string; name: string }
export interface Department { code: string; name: string; arrondissements?: Arrondissement[] }
export interface Region { code: string; name: { en: string; fr: string }; departments: Department[] }

const d = (code: string, name: string, arrondissements?: Arrondissement[]): Department => ({ code, name, arrondissements });
const a = (code: string, name: string): Arrondissement => ({ code, name });

export const REGIONS: Region[] = [
  {
    code: 'AD', name: { en: 'Adamawa', fr: 'Adamaoua' },
    departments: [d('DJE', 'Djérem'), d('FAD', 'Faro-et-Déo'), d('MBA', 'Mayo-Banyo'), d('MBE', 'Mbéré'), d('VIN', 'Vina')],
  },
  {
    code: 'CE', name: { en: 'Centre', fr: 'Centre' },
    departments: [
      d('HSA', 'Haute-Sanaga'), d('LEK', 'Lekié'), d('MBI', 'Mbam-et-Inoubou'), d('MBK', 'Mbam-et-Kim'),
      d('MEA', 'Méfou-et-Afamba'), d('MEK', 'Méfou-et-Akono'),
      d('MFO', 'Mfoundi', [
        a('YDE1', 'Yaoundé I'), a('YDE2', 'Yaoundé II'), a('YDE3', 'Yaoundé III'), a('YDE4', 'Yaoundé IV'),
        a('YDE5', 'Yaoundé V'), a('YDE6', 'Yaoundé VI'), a('YDE7', 'Yaoundé VII'),
      ]),
      d('NYK', 'Nyong-et-Kéllé'), d('NYM', 'Nyong-et-Mfoumou'), d('NYS', "Nyong-et-So'o"),
    ],
  },
  {
    code: 'ES', name: { en: 'East', fr: 'Est' },
    departments: [
      d('BON', 'Boumba-et-Ngoko'), d('HNY', 'Haut-Nyong'), d('KAD', 'Kadey'),
      d('LOD', 'Lom-et-Djérem', [
        a('BTA1', 'Bertoua I'), a('BTA2', 'Bertoua II'), a('BEL', 'Bélabo'), a('BOY', 'Bétaré-Oya'),
        a('DIA', 'Diang'), a('GBO', 'Garoua-Boulaï'), a('MAN', 'Mandjou'), a('NGO', 'Ngoura'),
      ]),
    ],
  },
  {
    code: 'EN', name: { en: 'Far North', fr: 'Extrême-Nord' },
    departments: [
      d('DIM', 'Diamaré', [
        a('MRA1', 'Maroua I'), a('MRA2', 'Maroua II'), a('MRA3', 'Maroua III'), a('BOG', 'Bogo'),
        a('DAR', 'Dargala'), a('GAZ', 'Gazawa'), a('MER', 'Meri'), a('NDK', 'Ndoukoula'), a('PET', 'Pétté'),
      ]),
      d('LOC', 'Logone-et-Chari'), d('MDA', 'Mayo-Danay'), d('MKA', 'Mayo-Kani'),
      d('MSA', 'Mayo-Sava', [a('MOR', 'Mora'), a('KOL', 'Kolofata'), a('TOK', 'Tokombéré')]),
      d('MTS', 'Mayo-Tsanaga'),
    ],
  },
  {
    code: 'LT', name: { en: 'Littoral', fr: 'Littoral' },
    departments: [
      d('MOU', 'Moungo'), d('NKA', 'Nkam'), d('SAM', 'Sanaga-Maritime'),
      d('WOU', 'Wouri', [
        a('DLA1', 'Douala I'), a('DLA2', 'Douala II'), a('DLA3', 'Douala III'),
        a('DLA4', 'Douala IV'), a('DLA5', 'Douala V'), a('DLA6', 'Douala VI'),
      ]),
    ],
  },
  {
    code: 'NO', name: { en: 'North', fr: 'Nord' },
    departments: [d('BEN', 'Bénoué'), d('FAR', 'Faro'), d('MLO', 'Mayo-Louti'), d('MRE', 'Mayo-Rey')],
  },
  {
    code: 'NW', name: { en: 'North-West', fr: 'Nord-Ouest' },
    departments: [
      d('BOY', 'Boyo'), d('BUI', 'Bui'), d('DMA', 'Donga-Mantung'), d('MEN', 'Menchum'),
      d('MEZ', 'Mezam'), d('MOM', 'Momo'), d('NGK', 'Ngo-Ketunjia'),
    ],
  },
  {
    code: 'OU', name: { en: 'West', fr: 'Ouest' },
    departments: [
      d('BAM', 'Bamboutos'), d('HNK', 'Haut-Nkam'), d('HPL', 'Hauts-Plateaux'), d('KKH', 'Koung-Khi'),
      d('MEO', 'Menoua'), d('MIF', 'Mifi'), d('NDE', 'Ndé'), d('NOU', 'Noun'),
    ],
  },
  {
    code: 'SU', name: { en: 'South', fr: 'Sud' },
    departments: [d('DJL', 'Dja-et-Lobo'), d('MVI', 'Mvila'), d('OCE', 'Océan'), d('VNT', 'Vallée-du-Ntem')],
  },
  {
    code: 'SW', name: { en: 'South-West', fr: 'Sud-Ouest' },
    departments: [
      d('FAK', 'Fako'), d('KMA', 'Koupé-Manengouba'), d('LEB', 'Lebialem'),
      d('MNY', 'Manyu'), d('MEM', 'Meme'), d('NDI', 'Ndian'),
    ],
  },
];

export function findRegion(code?: string): Region | undefined {
  return REGIONS.find((r) => r.code === code);
}

export function findDepartment(regionCode?: string, deptCode?: string): Department | undefined {
  return findRegion(regionCode)?.departments.find((dep) => dep.code === deptCode);
}

export function hasArrondissementList(regionCode?: string, deptCode?: string): boolean {
  return (findDepartment(regionCode, deptCode)?.arrondissements?.length ?? 0) > 0;
}

/** Arrondissements seeded on the device; used as the denominator of the Layer 3 coverage indicator. */
export function seededArrondissementKeys(): string[] {
  return REGIONS.flatMap((r) =>
    r.departments.flatMap((dep) => (dep.arrondissements ?? []).map((arr) => `${r.code}.${dep.code}.${arr.code}`)),
  );
}

export function locationLabel(
  loc: { region?: string; department?: string; arrondissement?: string },
  lang: 'en' | 'fr',
): string {
  const region = findRegion(loc.region);
  if (!region) return '—';
  const dep = region.departments.find((x) => x.code === loc.department);
  const arr = dep?.arrondissements?.find((x) => x.code === loc.arrondissement);
  return [arr?.name, dep?.name, region.name[lang]].filter(Boolean).join(', ');
}
