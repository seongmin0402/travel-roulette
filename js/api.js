const API_KEY = '4469e769ecf4f4d4eba6d45fa6bae59255a630daa5034a0d42042b1aa87f2b54';
const TOUR_BASE = '/tour-api/B551011/KorService2';

/* ===== 시도 기본 테마 ===== */
const PROVINCE_BASE_THEMES = {
  1:  ['city', 'food', 'history', 'photo'],
  2:  ['city', 'food', 'history', 'photo'],
  3:  ['city', 'food', 'nature'],
  4:  ['city', 'food', 'history', 'nature'],
  5:  ['city', 'food', 'history'],
  6:  ['beach', 'city', 'food', 'photo', 'activity'],
  7:  ['city', 'food', 'nature', 'hot_spring'],
  8:  ['city', 'nature', 'history'],
  31: ['nature', 'activity', 'city', 'food', 'photo'],
  32: ['nature', 'activity', 'food', 'photo', 'hot_spring'],
  33: ['nature', 'history', 'activity', 'food'],
  34: ['history', 'nature', 'food'],
  35: ['history', 'nature', 'food', 'photo'],
  36: ['nature', 'food', 'history', 'photo'],
  37: ['history', 'food', 'nature', 'city'],
  38: ['nature', 'food', 'history', 'photo'],
  39: ['beach', 'nature', 'food', 'photo', 'activity'],
};

const COASTAL_PROVINCES = new Set([6, 39]);
const INLAND_PROVINCES  = new Set([1, 3, 4, 5, 8, 33]);

const COASTAL_SIGUNGU_MAP = {
  2:  new Set(['강화군', '옹진군']),
  7:  new Set(['동구', '남구', '울주군']),
  31: new Set(['안산시', '화성시', '평택시', '시흥시', '김포시']),
  32: new Set(['강릉시', '속초시', '동해시', '삼척시', '고성군', '양양군']),
  34: new Set(['보령시', '태안군', '서산시', '당진시', '홍성군', '서천군']),
  35: new Set(['포항시', '경주시', '영덕군', '울진군', '울릉군']),
  36: new Set(['거제시', '통영시', '사천시', '남해군', '고성군', '하동군', '창원시']),
  37: new Set(['군산시', '부안군', '고창군']),
  38: new Set(['목포시', '여수시', '순천시', '광양시', '완도군', '신안군', '진도군',
               '해남군', '강진군', '장흥군', '보성군', '고흥군', '무안군', '영광군', '함평군']),
};

function getThemesForSigungu(ac, sigunguName) {
  const base = [...(PROVINCE_BASE_THEMES[ac] || ['nature', 'food', 'city'])];
  if (COASTAL_PROVINCES.has(ac) || INLAND_PROVINCES.has(ac)) return base;
  if (COASTAL_SIGUNGU_MAP[ac]?.has(sigunguName)) base.unshift('beach');
  return base;
}

/* 광역시·특별시는 구 이름이 중복되므로 "부산 중구" 형태의 표시 이름 생성 */
const METRO_CODES = new Set([1, 2, 3, 4, 5, 6, 7, 8]); // 서울·인천·대전·대구·광주·부산·울산·세종

function makeDisplayName(ac, sigunguName, regionName) {
  if (!METRO_CODES.has(ac)) return sigunguName;
  const short = regionName
    .replace('특별자치시', '')
    .replace('특별시', '')
    .replace('광역시', '')
    .replace('시', '');
  return `${short} ${sigunguName}`;
}

/* ===== 전국 시군구 동적 로드 ===== */
const ALL_AREA_CODES = [1, 2, 3, 4, 5, 6, 7, 8, 31, 32, 33, 34, 35, 36, 37, 38, 39];

async function loadAllDestinations(onProgress) {
  const total = ALL_AREA_CODES.length;
  let done = 0;

  const results = [];
  for (let i = 0; i < ALL_AREA_CODES.length; i += 3) {
    const batch = ALL_AREA_CODES.slice(i, i + 3);
    const batchResults = await Promise.allSettled(
      batch.map(ac =>
        getSigunguList(ac).then(items => {
          done++;
          onProgress && onProgress(done, total, PROVINCE_INFO[ac]?.name || '');
          return { ac, items };
        })
      )
    );
    results.push(...batchResults);
    if (i + 3 < ALL_AREA_CODES.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  const all = [];
  const curatedMap = new Map(CURATED.map(d => [`${d.areaCode}_${d.sigunguCode}`, d]));

  for (const result of results) {
    if (result.status !== 'fulfilled') continue;
    const { ac, items } = result.value;
    const prov = PROVINCE_INFO[ac] || { name: '', lat: 37, lon: 127 };

    for (const item of items) {
      const code = parseInt(item.code);
      const name = item.name;
      const key  = `${ac}_${code}`;

      if (curatedMap.has(key)) {
        const curated = curatedMap.get(key);
        /* 큐레이션 항목에도 displayName 부여 */
        all.push({
          ...curated,
          displayName: makeDisplayName(ac, curated.name, prov.name),
        });
      } else {
        all.push({
          id: key,
          name,
          displayName: makeDisplayName(ac, name, prov.name),
          region: prov.name,
          areaCode: ac,
          sigunguCode: code,
          lat: prov.lat,
          lon: prov.lon,
          budget: ['low', 'mid', 'high', 'luxury'],
          duration: ['day', '1night', '2night', 'long'],
          themes: getThemesForSigungu(ac, name),
          seasons: ['spring', 'summer', 'fall', 'winter'],
          companion: ['solo', 'couple', 'family', 'friends'],
          transport: ['car', 'transit'],
          desc: `${prov.name} ${name}의 숨겨진 매력을 발견하세요`,
          highlights: [],
        });
      }
    }
  }

  return all.length > 0 ? all : [...CURATED];
}

async function getSigunguList(areaCode) {
  return tourFetch('areaCode2', { areaCode, numOfRows: 100, pageNo: 1 });
}

async function tourFetch(endpoint, params) {
  const allParams = {
    serviceKey: API_KEY,
    MobileOS: 'ETC',
    MobileApp: 'TravelRoulette',
    _type: 'json',
    numOfRows: 20,
    pageNo: 1,
    ...params,
  };
  const qs = new URLSearchParams(allParams).toString();
  try {
    const res = await fetch(`${TOUR_BASE}/${endpoint}?${qs}`);
    if (!res.ok) return [];
    const data = await res.json();
    return normalizeItems(data?.response?.body);
  } catch {
    return [];
  }
}

function normalizeItems(body) {
  if (!body || !body.items || !body.items.item) return [];
  const item = body.items.item;
  if (Array.isArray(item)) return item;
  if (typeof item === 'object') return [item];
  return [];
}

async function getAttractions(areaCode, sigunguCode) {
  const params = { contentTypeId: 12, areaCode };
  if (sigunguCode) params.sigunguCode = sigunguCode;
  return tourFetch('areaBasedList2', params);
}

async function getRestaurants(areaCode, sigunguCode) {
  const params = { contentTypeId: 39, areaCode };
  if (sigunguCode) params.sigunguCode = sigunguCode;
  return tourFetch('areaBasedList2', params);
}

async function getAccommodations(areaCode, sigunguCode) {
  const params = { contentTypeId: 32, areaCode };
  if (sigunguCode) params.sigunguCode = sigunguCode;
  return tourFetch('areaBasedList2', params);
}

async function getRepresentativeImage(areaCode, sigunguCode) {
  const items = await getAttractions(areaCode, sigunguCode);
  const withImg = items.find(i => i.firstimage);
  return withImg ? withImg.firstimage : null;
}

/* ===== Open-Meteo 날씨 ===== */
const WMO = {
  0: ['☀️', '맑음'],
  1: ['🌤️', '대체로 맑음'], 2: ['⛅', '구름 조금'], 3: ['☁️', '흐림'],
  45: ['🌫️', '안개'], 48: ['🌫️', '안개'],
  51: ['🌦️', '이슬비'], 53: ['🌦️', '이슬비'], 55: ['🌧️', '이슬비'],
  61: ['🌧️', '비'], 63: ['🌧️', '비'], 65: ['🌧️', '강한 비'],
  71: ['🌨️', '눈'], 73: ['🌨️', '눈'], 75: ['❄️', '강한 눈'],
  77: ['🌨️', '눈날림'],
  80: ['🌦️', '소나기'], 81: ['🌦️', '소나기'], 82: ['⛈️', '강한 소나기'],
  95: ['⛈️', '뇌우'], 96: ['⛈️', '뇌우'], 99: ['⛈️', '뇌우'],
};

async function getWeather(lat, lon) {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode&timezone=Asia%2FSeoul`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const code = data.current?.weathercode ?? 0;
    const temp = Math.round(data.current?.temperature_2m ?? 0);
    const [icon, label] = WMO[code] ?? ['🌡️', '알 수 없음'];
    return { icon, label, temp };
  } catch {
    return null;
  }
}
