let currentDestination = null;
let particles = null;
let roulette  = null;

document.addEventListener('DOMContentLoaded', async () => {
  const season = getCurrentSeason();
  document.body.classList.add(`season-${season}`);
  setSeasonChip(season);

  particles = new ParticleSystem(document.getElementById('particleCanvas'), season);
  roulette  = new Roulette(document.getElementById('slotReel'));

  await loadDestinations();

  initChips();
  initButtons();
  updateMatchCount();
});

async function loadDestinations() {
  const overlay = document.getElementById('loaderOverlay');
  const subEl   = document.getElementById('loaderSub');
  const barEl   = document.getElementById('loaderBar');

  try {
    DESTINATIONS = await loadAllDestinations((done, total, name) => {
      barEl.style.width = `${Math.round((done / total) * 100)}%`;
      subEl.textContent = `${name} 로딩 중... (${done}/${total})`;
    });
  } catch {
    DESTINATIONS = [...CURATED];
  }

  subEl.textContent = `✓ 총 ${DESTINATIONS.length}개 시군구 로드 완료!`;
  barEl.style.width = '100%';

  await new Promise(r => setTimeout(r, 600));
  overlay.classList.add('fade-out');
  setTimeout(() => overlay.remove(), 500);
}

function getCurrentSeason() {
  const m = new Date().getMonth() + 1;
  if (m >= 3 && m <= 5)  return 'spring';
  if (m >= 6 && m <= 8)  return 'summer';
  if (m >= 9 && m <= 11) return 'fall';
  return 'winter';
}

function setSeasonChip(season) {
  const group = document.getElementById('seasonChips');
  group.querySelector('.chip[data-value="any"]')?.classList.remove('active');
  const target = group.querySelector(`.chip[data-value="${season}"]`);
  if (target) target.classList.add('active');
}

function initChips() {
  document.querySelectorAll('.chips').forEach(group => {
    const mode = group.dataset.mode;
    group.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;

      if (mode === 'single') {
        group.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      } else {
        if (chip.dataset.value === 'any') {
          group.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
        } else {
          group.querySelector('.chip[data-value="any"]')?.classList.remove('active');
          chip.classList.toggle('active');
          const anyActive = [...group.querySelectorAll('.chip:not([data-value="any"])')].some(c => c.classList.contains('active'));
          if (!anyActive) group.querySelector('.chip[data-value="any"]')?.classList.add('active');
        }
      }

      if (group.id === 'seasonChips') {
        const active = group.querySelector('.chip.active');
        const s = active?.dataset.value;
        if (s && s !== 'any') {
          document.body.className = `season-${s}`;
          particles?.setSeason(s);
        }
      }

      updateMatchCount();
    });
  });
}

function getConditions() {
  const get = id => [...document.getElementById(id).querySelectorAll('.chip.active')].map(c => c.dataset.value);
  return {
    season:    get('seasonChips'),
    duration:  get('durationChips'),
    budget:    get('budgetChips'),
    themes:    get('themeChips'),
    companion: get('companionChips'),
    transport: get('transportChips'),
  };
}

function filterDestinations(cond) {
  const matches = (arr, condArr) => {
    if (!condArr.length || condArr.includes('any')) return true;
    return condArr.some(v => arr.includes(v));
  };
  return DESTINATIONS.filter(d =>
    matches(d.seasons,   cond.season) &&
    matches(d.duration,  cond.duration) &&
    matches(d.budget,    cond.budget) &&
    matches(d.themes,    cond.themes) &&
    matches(d.companion, cond.companion) &&
    matches(d.transport, cond.transport)
  );
}

function updateMatchCount() {
  const pool = filterDestinations(getConditions());
  const el = document.getElementById('matchCount');
  if (!DESTINATIONS.length) {
    el.textContent = '⏳ 여행지 목록 불러오는 중...';
    el.style.color = '';
    return;
  }
  if (pool.length === 0) {
    el.textContent = '⚠️ 조건에 맞는 여행지가 없어요';
    el.style.color = '#ff6b6b';
  } else {
    el.textContent = `✓ 총 ${DESTINATIONS.length}개 중 ${pool.length}개 후보`;
    el.style.color = '';
  }
}

function initButtons() {
  document.getElementById('spinBtn').addEventListener('click', handleSpin);
  document.getElementById('reSpinBtn').addEventListener('click', handleSpin);
  document.getElementById('detailBtn').addEventListener('click', openModal);
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', e => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });

  document.querySelectorAll('.modal-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.modal-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.modal-tab-content').forEach(c => {
        c.classList.add('hidden');
        c.classList.remove('active');
      });
      tab.classList.add('active');
      const content = document.getElementById(`tab-${tab.dataset.tab}`);
      content?.classList.remove('hidden');
      content?.classList.add('active');

      if (tab.dataset.tab === 'transit' && currentDestination) {
        initTransitTab(currentDestination);
      }
    });
  });
}

function handleSpin() {
  const pool = filterDestinations(getConditions());
  if (pool.length === 0) {
    showHint('⚠️ 조건에 맞는 여행지가 없어요. 조건을 완화해보세요!');
    return;
  }

  document.getElementById('resultSection').classList.add('hidden');
  const spinBtn = document.getElementById('spinBtn');
  spinBtn.disabled = true;
  showHint('🎰 돌리는 중...');

  const target   = pool[Math.floor(Math.random() * pool.length)];
  const spinPool = pool.length >= 5 ? pool : DESTINATIONS;

  roulette.spin(spinPool, target, async (dest) => {
    currentDestination = dest;
    spinBtn.disabled = false;
    showHint('조건을 바꾸고 다시 돌려보세요!');
    await showResult(dest);
  });
}

async function showResult(dest) {
  const [weather, imgUrl] = await Promise.all([
    getWeather(dest.lat, dest.lon),
    getRepresentativeImage(dest.areaCode, dest.sigunguCode),
  ]);

  const img = document.getElementById('resultImage');
  const fallback = `https://picsum.photos/seed/${dest.id || dest.areaCode}/800/500`;
  img.src = imgUrl || fallback;
  img.onerror = () => { img.src = fallback; };
  img.alt = dest.name;

  if (weather) {
    document.getElementById('weatherIcon').textContent = weather.icon;
    document.getElementById('weatherTemp').textContent = `${weather.temp}°C`;
  }

  document.getElementById('resultRegion').textContent = dest.region;
  /* 결과 카드 제목에 displayName 사용 (부산 중구 등) */
  document.getElementById('resultName').textContent = dest.displayName || dest.name;
  document.getElementById('resultDesc').textContent = dest.desc;

  const hl = document.getElementById('resultHighlights');
  hl.innerHTML = dest.highlights.length
    ? dest.highlights.map(h => `<span class="highlight-tag">📍 ${h}</span>`).join('')
    : '';

  const section = document.getElementById('resultSection');
  section.classList.remove('hidden');
  setTimeout(() => section.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
}

function showHint(msg) {
  document.getElementById('spinHint').textContent = msg;
}

async function openModal() {
  if (!currentDestination) return;
  const dest = currentDestination;
  const displayName = dest.displayName || dest.name;

  document.getElementById('modalTitle').textContent = `✈️ ${displayName} 상세 정보`;
  document.getElementById('modalSubtitle').textContent = `${dest.region} · ${dest.desc}`;

  document.querySelectorAll('.modal-tab').forEach((t, i) => t.classList.toggle('active', i === 0));
  document.querySelectorAll('.modal-tab-content').forEach((c, i) => {
    c.classList.toggle('active', i === 0);
    c.classList.toggle('hidden', i !== 0);
  });

  document.getElementById('modalOverlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  setGridLoading('attractionGrid');
  setGridLoading('restaurantGrid');
  setGridLoading('accommodationGrid');

  const [attractions, restaurants, accommodations] = await Promise.all([
    getAttractions(dest.areaCode, dest.sigunguCode),
    getRestaurants(dest.areaCode, dest.sigunguCode),
    getAccommodations(dest.areaCode, dest.sigunguCode),
  ]);

  renderSpots('attractionGrid',    attractions,   '🏛️');
  renderSpots('restaurantGrid',    restaurants,   '🍽️');
  renderSpots('accommodationGrid', accommodations,'🏨');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.add('hidden');
  document.body.style.overflow = '';
}

function setGridLoading(gridId) {
  document.getElementById(gridId).innerHTML =
    '<div class="loading-wrap"><div class="loading-spinner"></div><p>불러오는 중...</p></div>';
}

function renderSpots(gridId, items, fallbackEmoji) {
  const grid = document.getElementById(gridId);

  if (!items || items.length === 0) {
    grid.innerHTML = `<div class="loading-wrap" style="color:var(--text3)">
      <span style="font-size:32px">${fallbackEmoji}</span>
      <p>정보를 불러오지 못했어요</p>
      <p style="font-size:11px;margin-top:4px">API 키를 확인하거나 잠시 후 다시 시도해보세요</p>
    </div>`;
    return;
  }

  grid.innerHTML = items.slice(0, 20).map(item => {
    const name   = item.title || '이름 없음';
    const addr   = item.addr1 || item.addr2 || '';
    const imgSrc = item.firstimage || item.firstimage2 || '';
    const mapx   = item.mapx || '';
    const mapy   = item.mapy || '';

    const kakaoUrl = (mapx && mapy)
      ? `https://map.kakao.com/link/map/${encodeURIComponent(name)},${mapy},${mapx}`
      : `https://map.kakao.com/?q=${encodeURIComponent(name)}`;

    const imgTag = imgSrc
      ? `<img src="${imgSrc}" alt="${name}" class="spot-card-img" loading="lazy"
             onerror="this.outerHTML='<div class=\\'spot-card-img no-img\\'>${fallbackEmoji}</div>'">`
      : `<div class="spot-card-img no-img">${fallbackEmoji}</div>`;

    return `<div class="spot-card" onclick="window.open('${kakaoUrl}','_blank')" title="카카오맵에서 보기">
      <div class="spot-card-map-badge">🗺️ 지도</div>
      ${imgTag}
      <div class="spot-card-body">
        <div class="spot-card-name">${name}</div>
        <div class="spot-card-addr">${addr}</div>
      </div>
    </div>`;
  }).join('');
}
