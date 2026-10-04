// ==========================================================================
// stage1bg.js — Air2 스테이지1 레이어 배경(별/반짝이 입자/먼지/파편/오브젝트)
// 그리기 로직은 stage1layers.js(에디터와 공용)에 있고, 이 파일은 데이터 적용과 프레임 진행만 담당.
// index.html이 drawStage1Layers()를 호출(스테이지1 타이틀/발사 연출/플레이 공통). bg.js의 먼지/파편은
// 스테이지2 발사 연출에서만 계속 사용됨.
// (이하 원래 설명)
// 스테이지1 우주 배경 위에 얹는 행성/우주 오브젝트 레이어
// "/stage1 editor/stage1_bg_editor.html"에서 디자인한 배치를 그대로 게임에 반영.
// 기존 bg.js의 3레이어 패럴랙스(별/먼지/파편)는 그대로 유지하고, 그 위에 이 레이어가
// 추가로 그려집니다(행성/정거장/위성/운석 등 큼직한 배경 장식 오브젝트).
// canvas/ctx/W/H는 index.html 상단 인라인 스크립트에서 전역으로 선언되며,
// 이 파일은 그 전역을 그대로 참조합니다(bg.js와 동일한 패턴).
// index.html의 update() 루프에서 currentStage===1일 때 drawStage1Objects(dt)를
// drawStarBackground(dt) 다음에 호출하면 우주 배경 위에 오브젝트가 자동으로 그려집니다.
// ==========================================================================

// 네오지오 퀄리티 우주 오브젝트 (baseScale 1.0 = 원본 이미지 크기 그대로)
const STAGE1_OBJECT_DEFS = {
  spaceStation: { src: 'assets/bg/stage1new/object/obj_space_station.png' },
  asteroidCluster: { src: 'assets/bg/stage1new/object/obj_asteroid_cluster.png' },
  satellite: { src: 'assets/bg/stage1new/object/obj_satellite.png' },
  distantSun: { src: 'assets/bg/stage1new/object/obj_distant_sun.png' },
  planetMars: { src: 'assets/bg/stage1new/object/obj_planet_mars.png' },
  planetGasGiant: { src: 'assets/bg/stage1new/object/obj_planet_gas_giant.png' },
  planetRinged: { src: 'assets/bg/stage1new/object/obj_planet_ringed.png' },
  planetMoon: { src: 'assets/bg/stage1new/object/obj_planet_moon.png' },
  wreckShip: { src: 'assets/bg/stage1new/object/obj_wreck_ship.png' },
  repairRobot: { src: 'assets/bg/stage1new/object/obj_repair_robot.png' },
  cargoContainer: { src: 'assets/bg/stage1new/object/obj_cargo_container.png' },
  escapePod: { src: 'assets/bg/stage1new/object/obj_escape_pod.png' },
  debrisField: { src: 'assets/bg/stage1new/object/obj_debris_field.png' },
  miningDrone: { src: 'assets/bg/stage1new/object/obj_mining_drone.png' },
  brokenSolarPanel: { src: 'assets/bg/stage1new/object/obj_broken_solar_panel.png' },
  navBuoy: { src: 'assets/bg/stage1new/object/obj_nav_buoy.png' }
  // 신규 오브젝트 추가 시 여기에 이어서 등록
};

const stage1ObjImgs = {};
Object.entries(STAGE1_OBJECT_DEFS).forEach(([k, def]) => {
  const img = new Image();
  img.src = def.src;
  stage1ObjImgs[k] = img;
});

// 데이터 파일(stage1_layout.js)이 없을 때의 기본 배치(구버전 하드코딩 값과 동일한 화면)
const STAGE1_DEFAULT_LEGACY = {
  loopHeight: 3700, scrollSpeed: 90, dustSpeed: 400, debrisSpeed: 1600,
  objects: [
    { type: 'distantSun', x: 380, y: 100, z: 0 }, { type: 'planetMars', x: 340, y: 500, z: 1 },
    { type: 'asteroidCluster', x: 100, y: 1000, z: 2 }, { type: 'spaceStation', x: 360, y: 1450, z: 3 },
    { type: 'planetGasGiant', x: 110, y: 1950, z: 4 }, { type: 'satellite', x: 350, y: 2350, z: 5 },
    { type: 'planetRinged', x: 320, y: 2800, z: 6 }, { type: 'planetMoon', x: 130, y: 3300, z: 7 }
  ]
};

let stage1Layers = [];
let stage1DurSec = 180;
let stage1AppliedData = null; // 같은 데이터를 다시 적용할 때(발사 연출 → startStage) 입자 위치가 튀지 않도록

// ---- 맵 에디터에서 내보낸 배치 데이터 적용 ----
// 신규 형식: { version: 2, durSec, layers: [...] } / 구버전 형식(objects, starLayers, dustSpeed...)은 자동 변환.
function applyStage1LayoutData(data){
  if(!data || data === stage1AppliedData) return;
  stage1AppliedData = data;
  if(Array.isArray(data.layers)){
    stage1DurSec = data.durSec || 180;
    stage1Layers = data.layers.map(l => Object.assign({}, l, {
      objects: (l.objects || []).map(o => Object.assign({}, o)),
      particles: (l.particles || []).map(p => Object.assign({}, p))
    }));
  } else {
    const conv = s1lFromLegacy(data);
    stage1Layers = conv.layers;
    stage1DurSec = conv.durSec;
  }
  stage1Layers.forEach(l => { l.loopH = s1lLoopH(l, stage1DurSec); l._scroll = 0; });
  console.log('[stage1bg] 레이어 배경 데이터 적용: ' + stage1Layers.length + '개 레이어');
}

function ensureStage1Layers(){
  if(stage1AppliedData) return;
  applyStage1LayoutData(typeof STAGE1_LAYOUT_DATA !== 'undefined' ? STAGE1_LAYOUT_DATA : STAGE1_DEFAULT_LEGACY);
}

// 스테이지1 재진입(재도전 등) 시 스크롤 위치 초기화용
function resetStage1Objects(){
  stage1Layers.forEach(l => { l._scroll = 0; });
  stage1BossLock = null;
  stage1RedPlanetActive = false; // 붉은 행성 등장 상태도 재진입 시 초기화
  stage1RedPlanetY = -400;
  stage1RedPlanetFadeElapsed = 0;
}

// ---- 보스전 배경 잠금 ----
// WARNING!부터 클리어까지: 그 순간 화면에 보이던(또는 걸쳐 있던) 오브젝트만 계속 흘려보내고,
// 새 오브젝트는 위에서 더 내려오지 않게 함(보스전 화면을 깔끔하게 유지).
const STAGE1_BOSS_PHASES = ['warning', 'bossIntro', 'boss', 'clear'];
let stage1BossLock = null; // null 또는 Set(허용 오브젝트)
function stage1ObjVisibleNow(layer, o){
  const img = stage1ObjImgs[o.type];
  const h = (img && img.naturalWidth ? Math.max(img.width, img.height) : 300) * (o.scale || 1) / 2 + 10;
  const m = o.speedMul > 0 ? o.speedMul : 1, Lo = layer.loopH * m;
  let sy = (o.y + (layer._scroll || 0) * m) % Lo; if(sy < 0) sy += Lo;
  return [sy - Lo, sy, sy + Lo].some(yy => yy + h > 0 && yy - h < H);
}
function updateStage1BossLock(){
  const inBoss = typeof stagePhase !== 'undefined' && typeof currentStage !== 'undefined' && currentStage === 1 && STAGE1_BOSS_PHASES.includes(stagePhase);
  if(!inBoss){ stage1BossLock = null; return; }
  if(stage1BossLock) return;
  stage1BossLock = new Set();
  stage1Layers.forEach(l => { if(l.kind === 'objects') (l.objects || []).forEach(o => { if(stage1ObjVisibleNow(l, o)) stage1BossLock.add(o); }); });
}

// 발사 연출 중(objectAlpha<=0)에는 오브젝트 레이어를 멈춰 두고 그리지 않음. 연출이 끝나 처음 보이는 순간
// 스크롤을 0으로 되돌려, 배치된 오브젝트가 화면 위에서부터 자연스럽게 내려오게 함(페이드인 없음).
let stage1ObjectsWasHidden = true;

// 스테이지1 배경 전체를 레이어 순서(0번이 가장 뒤)대로 그림.
// speedMul: 발사 연출 배속(기본 1, 워프 시 최대 20배. warp=true 레이어는 세로 스트릭으로 늘어남)
// flakeAlpha: 먼지/파편 레이어 알파(발사대가 보이는 동안 0 → 퇴장하며 1). 별/반짝이 입자는 항상 표시.
// objectAlpha: 0이면 오브젝트 레이어 정지+숨김(발사 연출 중), 0보다 크면 표시
function drawStage1Layers(dt, speedMul, flakeAlpha, objectAlpha){
  ensureStage1Layers();
  const mul = speedMul === undefined ? 1 : speedMul;
  const fa = flakeAlpha === undefined ? 1 : flakeAlpha;
  const oa = objectAlpha === undefined ? 1 : objectAlpha;
  if(oa <= 0){
    stage1ObjectsWasHidden = true;
  } else if(stage1ObjectsWasHidden){
    stage1ObjectsWasHidden = false;
    stage1Layers.forEach(l => { if(l.kind === 'objects') l._scroll = 0; }); // 위에서부터 내려오도록 시작점으로
  }
  // 요청사항: 붉은 행성은 다른 모든 오브젝트/별보다 가장 아래(가장 먼 배경)에 그려져야 하므로,
  // 전체 레이어 루프보다도 먼저(가장 뒤에) 그림.
  if(oa > 0 && !stage1ObjectsWasHidden) drawStage1RedPlanet(dt);
  const alphas = { objects: oa, flakes: fa, stars: 1 };
  updateStage1BossLock();
  for(const layer of stage1Layers){
    if(layer.kind === 'objects' && stage1ObjectsWasHidden) continue; // 발사 연출 중: 정지 + 숨김
    if(layer.kind !== 'dust' && layer.kind !== 'debris'){
      layer._scroll = ((layer._scroll || 0) + s1lSpeed(layer) * mul * dt) % layer.loopH;
    }
    s1lDrawLayer(layer, {
      scrollPx: layer._scroll || 0, loopH: layer.loopH, alpha: alphas[s1lAlphaGroup(layer)],
      dt, speedMul: mul, objects: layer.objects, imgs: stage1ObjImgs, baseScale: 1, only: stage1BossLock,
      warpAll: true // 발사대 질주(배속>1) 때 모든 레이어가 같은 방식으로 세로로 늘어남
    });
  }
}

// ---- 붉은 행성 전용 등장 로직(요청사항) ----
// 자동 루프 레이어 시스템(위 drawStage1Layers의 objects 레이어)에서는 완전히 제외하고
// (stage1_layout.js에서 "붉은 행성 (아주 느림)" 레이어를 visible:false로 숨겨둠), 대신 이 함수가
// 전용으로 관리: 스테이지1 시작 30초 후 화면 맨 위에서 등장해 느린 속도로 아래로 흐르다가,
// WARNING 단계(stagePhase==='warning' 이상)에 들어가면 서서히 사라짐.
const STAGE1_RED_PLANET_APPEAR_MS = 30000; // 스테이지1 시작 30초 후 등장
const STAGE1_RED_PLANET_SPEED = 10; // px/s, 느리게 흐르는 속도
const STAGE1_RED_PLANET_FADE_MS = 1000; // WARNING 진입 시 페이드아웃 시간
let stage1RedPlanetY = -400; // 화면 위 바깥에서 시작(이미지 자체 크기 고려해 충분히 위)
let stage1RedPlanetActive = false;
let stage1RedPlanetFadeElapsed = 0;
function drawStage1RedPlanet(dt){
  if(typeof stageElapsed === 'undefined' || typeof stagePhase === 'undefined') return;
  const inWarningOrLater = ['warning','bossIntro','boss','clear'].includes(stagePhase);
  if(!stage1RedPlanetActive){
    if(stageElapsed >= STAGE1_RED_PLANET_APPEAR_MS && !inWarningOrLater){
      stage1RedPlanetActive = true;
      stage1RedPlanetY = -400;
      stage1RedPlanetFadeElapsed = 0;
    } else {
      return;
    }
  }
  stage1RedPlanetY += STAGE1_RED_PLANET_SPEED * dt;
  let alpha = 1;
  if(inWarningOrLater){
    stage1RedPlanetFadeElapsed += dt * 1000;
    alpha = Math.max(0, 1 - stage1RedPlanetFadeElapsed / STAGE1_RED_PLANET_FADE_MS);
    if(alpha <= 0){ stage1RedPlanetActive = false; return; }
  }
  const img = stage1ObjImgs['planetMars'];
  if(!img || !img.complete || !img.naturalWidth) return;
  const scale = 2.2, w = img.width * scale, h = img.height * scale;
  if(stage1RedPlanetY - h > H + 80){ stage1RedPlanetActive = false; return; } // 화면 아래로 완전히 지나가면 종료(재등장 안 함)
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(20, stage1RedPlanetY);
  ctx.drawImage(getBrightnessImage(img, 1), -w/2, -h/2, w, h);
  ctx.restore();
}
