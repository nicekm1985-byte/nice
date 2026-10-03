// ==========================================================================
// stage2bg.js — Air2 스테이지2 지면(붉은 화산 행성) + 오브젝트 렌더링
// "/stage2 editor/stage2_bg_editor.html"에서 디자인한 에셋/배치를 그대로
// 게임에 반영. canvas/ctx/W/H는 index.html 상단 인라인 스크립트에서 전역으로
// 선언되며, 이 파일은 그 전역을 그대로 참조합니다(bg.js와 동일한 패턴).
// index.html의 update() 루프에서 currentStage===2일 때 drawStage2Background(dt)만
// 호출하면 지면 스크롤 + 오브젝트가 자동으로 그려집니다.
// ==========================================================================

const STAGE2_TILE_H = 1040; // 타일 규격: 480x1040 (경계가 어색하지 않도록 상하 시임리스 처리된 에셋)

const STAGE2_TILE_DEFS = {
  plain: { src: 'assets/bg/stage2new/tiles/tile_plain.png' },
  transition: { src: 'assets/bg/stage2new/tiles/tile_transition.png' },
  lavaRiver: { src: 'assets/bg/stage2new/tiles/tile_lava_river.png' }
};

// 네오지오 퀄리티 오브젝트 (baseScale 1.0 = 원본 이미지 자체가 이미 1/2로 축소되어 있음)
const STAGE2_OBJECT_DEFS = {
  bunkerTurret: { src: 'assets/bg/stage2new/object/obj_bunker_turret.png' },
  radarTower: { src: 'assets/bg/stage2new/object/obj_radar_tower.png' },
  rockSpire: { src: 'assets/bg/stage2new/object/obj_rock_spire.png' },
  meteorCrater: { src: 'assets/bg/stage2new/object/obj_meteor_crater.png' },
  alienFlora: { src: 'assets/bg/stage2new/object/obj_alien_flora.png' },
  missileSilo: { src: 'assets/bg/stage2new/object/obj_missile_silo.png' },
  rockCrystalMound: { src: 'assets/bg/stage2new/object/obj_rock_crystal_mound.png' },
  rockBoulders: { src: 'assets/bg/stage2new/object/obj_rock_boulders.png' },
  rockPillar: { src: 'assets/bg/stage2new/object/obj_rock_pillar.png' },
  rockObsidian: { src: 'assets/bg/stage2new/object/obj_rock_obsidian.png' },
  rockBasalt: { src: 'assets/bg/stage2new/object/obj_rock_basalt.png' },
  wallVentPanel: { src: 'assets/bg/stage2new/object/obj_wall_vent_panel.png' },
  wallSensorPanel: { src: 'assets/bg/stage2new/object/obj_wall_sensor_panel.png' },
  wallControlPanel: { src: 'assets/bg/stage2new/object/obj_wall_control_panel.png' },
  crashedShip: { src: 'assets/bg/stage2new/object/obj_crashed_ship.png' },
  lavaGeyser: { src: 'assets/bg/stage2new/object/obj_lava_geyser.png' },
  alienEggPods: { src: 'assets/bg/stage2new/object/obj_alien_egg_pods.png' },
  bioPylon: { src: 'assets/bg/stage2new/object/obj_bio_pylon.png' },
  beastFossil: { src: 'assets/bg/stage2new/object/obj_beast_fossil.png' },
  alienLandingPad: { src: 'assets/bg/stage2new/object/obj_alien_landing_pad.png' },
  bioPipeline: { src: 'assets/bg/stage2new/object/obj_bio_pipeline.png' },
  energyCrystal: { src: 'assets/bg/stage2new/object/obj_energy_crystal.png' },
  salvageRobot: { src: 'assets/bg/stage2new/object/obj_salvage_robot.png' },
  cargoContainer: { src: 'assets/bg/stage2new/object/obj_cargo_container.png' },
  escapePod: { src: 'assets/bg/stage2new/object/obj_escape_pod.png' }
  // 신규 오브젝트(식물4종/다리/용암강 등) 추가 시 여기에 이어서 등록
};

const stage2TileImgs = {};
const stage2ObjImgs = {};

Object.entries(STAGE2_TILE_DEFS).forEach(([k, def]) => {
  const img = new Image();
  img.src = def.src;
  stage2TileImgs[k] = img;
});

Object.entries(STAGE2_OBJECT_DEFS).forEach(([k, def]) => {
  const img = new Image();
  img.src = def.src;
  stage2ObjImgs[k] = img;
});

// 타일 시퀀스: {key, flipped} 객체 배열. 개수 제한 없이 이어붙일 수 있으며, 에디터에서 만든 배치를 그대로 옮김.
// (에디터의 "배치 JSON 복사" 결과 track 배열을 그대로 여기에 붙여넣으면 됨)
let stage2TrackSequence = [
  { key: 'plain', flipped: false },
  { key: 'transition', flipped: false },
  { key: 'lavaRiver', flipped: false }
];
// 오브젝트 기본 크기 배율(원본 이미지 × 이 값 × 개별 scale). stage_editor.html의 OBJ_BASE_SCALE[2]와 반드시 동일하게 유지.
const STAGE2_OBJ_BASE_SCALE = 0.7;
let stage2ScrollY = 0;
let STAGE2_SCROLL_SPEED = 100; // px/s, 지면 타일 스크롤 속도(에디터 기본값과 동일, 맵 에디터 내보내기 파일로 덮어써질 수 있음)
// 오브젝트(터렛/타워/암석 등) 레이어 전용 스크롤 좌표/속도. 지면과 분리해서 서로 다른 속도로 흘려
// 패럴랙스 깊이감을 줄 수 있음(통합 타임라인 에디터의 "레이어별 스크롤 속도" 설정으로 조절).
let stage2ObjScrollY = 0;
let STAGE2_OBJ_SCROLL_SPEED = 100; // px/s, 기본값은 지면과 동일(에디터에서 값을 바꾸면 지면과 다른 속도로 흐름)

// 초기 배치: 에디터에 등록된 오브젝트 배치를 그대로 옮김
// z: 그리기 순서(숫자가 클수록 나중에/위에 그려짐). opacity: 불투명도.
let stage2WorldObjects = [
  { type: 'bunkerTurret', x: 240, y: 180, scale: 1.0, rot: 0, opacity: 1, z: 0 },
  { type: 'radarTower', x: 100, y: 500, scale: 1.0, rot: 35, opacity: 1, z: 1 },
  { type: 'rockSpire', x: 380, y: 900, scale: 1.0, rot: -20, opacity: 1, z: 2 },
  { type: 'bunkerTurret', x: 130, y: 1500, scale: 1.0, rot: 90, opacity: 1, z: 3 },
  { type: 'meteorCrater', x: 300, y: 320, scale: 1.0, rot: 0, opacity: 1, z: 4 },
  { type: 'alienFlora', x: 400, y: 700, scale: 1.0, rot: 0, opacity: 1, z: 5 },
  { type: 'missileSilo', x: 150, y: 1150, scale: 1.0, rot: 0, opacity: 1, z: 6 },
  { type: 'rockCrystalMound', x: 60, y: 250, scale: 1.0, rot: 0, opacity: 1, z: 7 },
  { type: 'rockBoulders', x: 420, y: 460, scale: 1.0, rot: 0, opacity: 1, z: 8 },
  { type: 'rockPillar', x: 200, y: 620, scale: 1.0, rot: 0, opacity: 1, z: 9 },
  { type: 'rockObsidian', x: 340, y: 1050, scale: 1.0, rot: 0, opacity: 1, z: 10 },
  { type: 'rockBasalt', x: 90, y: 1350, scale: 1.0, rot: 0, opacity: 1, z: 11 }
];

// ---- 맵 에디터에서 내보낸 배치 데이터 적용 ----
// stage.js가 (전역으로 로드된 STAGE2_LAYOUT_DATA가 있으면) 이 함수를 호출해서
// 트랙/오브젝트/스크롤 속도를 에디터에서 만든 값으로 덮어씁니다.
function applyStage2LayoutData(data){
  if(!data) return;
  if(Array.isArray(data.track) && data.track.length > 0){
    stage2TrackSequence = data.track.map(t => ({ key: t.key, flipped: !!t.flipped }));
  }
  if(Array.isArray(data.objects)){
    stage2WorldObjects = data.objects.map((o, idx) => ({
      type: o.type, x: o.x, y: o.y, scale: o.scale || 1.0, rot: o.rot || 0,
      opacity: o.opacity != null ? o.opacity : 1, brightness: o.brightness != null ? o.brightness : 1, z: o.z != null ? o.z : idx,
      floatAmp: o.floatAmp || 0, floatSpeed: o.floatSpeed || 1,
      swayAmp: o.swayAmp || 0, swaySpeed: o.swaySpeed || 1,
      motionSeed: o.motionSeed != null ? o.motionSeed : Math.random() * Math.PI * 2,
      speedMul: o.speedMul != null ? o.speedMul : 1
    }));
  }
  if(typeof data.scrollSpeed === 'number'){
    STAGE2_SCROLL_SPEED = data.scrollSpeed;
  }
  // 오브젝트 레이어 전용 속도(레이어별 스크롤 속도 설정에서 내보낸 값). 없으면 지면과 동일 속도 유지.
  if(typeof data.objScrollSpeed === 'number'){
    STAGE2_OBJ_SCROLL_SPEED = data.objScrollSpeed;
  } else if(typeof data.scrollSpeed === 'number'){
    STAGE2_OBJ_SCROLL_SPEED = data.scrollSpeed;
  }
  console.log('[stage2bg] 맵 에디터에서 내보낸 배치 데이터를 적용했습니다.');
}

function stage2TrackLength() {
  return stage2TrackSequence.length * STAGE2_TILE_H;
}

// 스테이지2 재진입(재도전 등) 시 스크롤 위치 초기화용
function resetStage2Background() {
  stage2ScrollY = 0;
  stage2ObjScrollY = 0;
  stage2ProcReset();
}

// ==========================================================================
// 절차적 오브젝트 배치 (지면 타일은 무한 반복, 오브젝트는 계속 새로 랜덤 생성)
// 배치 기준(규칙):
//  1. 지형별 풀: 화면 맨 위에 들어오는 지면 타일 종류(평지/전환/용암)에 맞는 오브젝트만 고름.
//     평지 = 외계 기지·잔해·암석·분화구, 용암 = 크리스탈·흑요석·첨탑 등 위험 지형, 전환 = 둘 섞음.
//     분화구(meteorCrater)는 용암지대에는 노출 금지(평지 풀에만 둠) — 용암 자체가 이미 지형 특징이라 중복됨.
//  2. 금지 구역: 용암강(가운데 x 190~290)에는 아무것도 놓지 않음(용암 타일/전환 타일 아래쪽 절반).
//  3. 간격: 직전 오브젝트와 세로로 최소 140px, 같은 줄(세로 차 < 200px)에서는 가로로 최소 170px 떨어뜨림
//     → 두 개가 같은 높이에 나란히 서는 배치 방지. 위치는 좌/중/우 3구역 중 최근에 덜 쓴 쪽 우선.
//     추가로 같은 줄에서 크기(scale)가 ±8% 이내로 비슷하면 가로 간격 기준을 260px로 확대
//     → 같은 크기 오브젝트가 나란히 늘어서는 배치(열 맞춘 듯한 부자연스러움) 방지.
//  4. 반복 방지: 직전 2개와 같은 종류는 피함. 크기 ±20%, 밝기 0.85~1.1 범위로 매번 다르게.
//     회전은 오브젝트 성격별 kind로 차등 적용(지형에 어울리게):
//       - base(터렛/타워/활주로 등 기지 시설): 0/90/270/270 근처 ±6도 — 수직 구조물이라 기울임 최소화.
//       - pipe(배관): 0 또는 90도만 — 파이프는 수평/수직만 자연스러움.
//       - crystal(에너지 크리스탈/수정 더미): -50~50도 범위만 — 땅에서 솟은 결정체라 뒤집히면 부자연스러움.
//       - fossil(뼈 화석): 머리가 왼쪽(180도)/오른쪽(0도)/아래(90도)로만 향하게 ±18도 jitter,
//         270도(머리가 위로 향함) 근처는 절대 금지 — 지면에 누운 뼈가 위로 솟아오르면 안 됨.
//       - flat(분화구): 완전 자유 회전 — 원형 지형 자국이라 방향 무관.
//       - wreck(추락선/잔해)·rockFree(자연 암석류): 완전 자유 회전 유지(불규칙한 자연물/사고 흔적).
//  5. 밀도 리듬: 기본 간격 1.1~2.0초(100px/s 기준 110~200px)마다 1개, 가끔(15%) 2~3개 군집 → 빽빽함과 여백 반복.
//  6. 빠른 스크롤감: 지면 100px/s + "가까운 잔해" 일부(25%)는 1.35배 속도로 앞에서 스쳐 지나감(패럴랙스).
//  7. 지면 스테이지는 공중 부유가 있을 수 없으므로, 오브젝트는 둥둥 떠다니거나(float) 좌우로 흔들리지(sway)
//     않음 — drawStage2Background에서 float/sway 오프셋 자체를 적용하지 않음(고정 배치/절차 생성 공통).
// 에디터에서 배치한 오브젝트(STAGE2_LAYOUT_DATA.objects)는 첫 화면 연출용으로 그대로 쓰고,
// 그 뒤부터는 이 생성기가 계속 이어서 만들어 냄(STAGE2_PROC_ENABLED=false면 기존 고정 배치만 반복).
let STAGE2_PROC_ENABLED = true;
const STAGE2_LAVA_X_MIN = 190, STAGE2_LAVA_X_MAX = 290;
const STAGE2_PROC_POOLS = {
  plain: [
    ['bunkerTurret',0.55,'base'],['missileSilo',0.5,'base'],['radarTower',0.65,'base'],['alienLandingPad',0.85,'base'],
    ['bioPipeline',1.2,'pipe'],['crashedShip',0.75,'wreck'],['salvageRobot',0.6,'wreck'],['cargoContainer',0.6,'wreck'],
    ['escapePod',0.6,'wreck'],['beastFossil',0.9,'fossil'],['rockBoulders',0.7,'rockFree'],['rockPillar',0.75,'rockFree'],
    ['rockCrystalMound',0.5,'crystal'],['alienFlora',0.42,'rockFree'],['meteorCrater',0.7,'flat']
  ],
  lava: [
    ['energyCrystal',0.85,'crystal'],['rockObsidian',0.85,'rockFree'],['rockSpire',0.5,'rockFree'],['rockBasalt',0.85,'rockFree'],
    ['crashedShip',0.65,'wreck'],['escapePod',0.55,'wreck']
  ]
};
let stage2ProcObjs = [];       // {type,x,y(화면),scale,rot,brightness,speedMul}
let stage2ProcNextGap = 0;     // 다음 생성까지 남은 스크롤 거리(px)
let stage2ProcRecentTypes = [];
let stage2ProcZoneUse = [0,0,0];
let stage2ProcStartDelay = 0;  // 에디터 고정 배치 구간(첫 화면) 동안은 생성 안 함(px)
function stage2ProcReset(){
  stage2ProcObjs = [];
  stage2ProcRecentTypes = [];
  stage2ProcZoneUse = [0,0,0];
  stage2ProcNextGap = 0;
  // 첫 화면은 에디터 배치 그대로 보여주고, 그 아래 화면 높이만큼 내려온 뒤부터 생성 시작
  stage2ProcStartDelay = STAGE2_PROC_ENABLED ? 620 : Infinity; // 첫 화면 고정 배치(약 6초)가 지나간 뒤부터
}
// 화면 맨 위(y=0)에 지금 들어오고 있는 지면 타일 종류와, 그 타일 안에서의 위치(0~1)
function stage2TileAtTop(){
  const totalH = stage2TrackLength();
  for(let idx = 0; idx < stage2TrackSequence.length; idx++){
    let sy = (idx * STAGE2_TILE_H + stage2ScrollY) % totalH;
    if(sy > 0) sy -= totalH;
    if(sy <= 0 && sy + STAGE2_TILE_H > 0){
      const t = stage2TrackSequence[idx];
      let f = -sy / STAGE2_TILE_H; // 타일 위쪽 끝=0 기준, 화면 맨 위가 타일의 어느 높이인지
      if(t.flipped) f = 1 - f;
      return { key: t.key, f };
    }
  }
  return { key: 'plain', f: 0 };
}
function stage2ProcSpawnOne(yOffset){
  const top = stage2TileAtTop();
  // 전환 타일은 이미지 아래쪽(f>0.45)부터 용암 → 위치에 따라 평지/용암 풀 선택
  const lavaHere = top.key === 'lavaRiver' || (top.key === 'transition' && top.f > 0.45);
  const pool = STAGE2_PROC_POOLS[lavaHere ? 'lava' : 'plain'];
  let pick, guard = 0;
  do { pick = pool[Math.floor(Math.random() * pool.length)]; } while(stage2ProcRecentTypes.includes(pick[0]) && guard++ < 8);
  const [type, baseScale, kind] = pick;
  const img = stage2ObjImgs[type];
  const scale = +(baseScale * (0.8 + Math.random() * 0.4)).toFixed(2);
  const halfW = img && img.naturalWidth ? img.width * scale * STAGE2_OBJ_BASE_SCALE / 2 : 60;
  const halfH = img && img.naturalWidth ? img.height * scale * STAGE2_OBJ_BASE_SCALE / 2 : 60;
  // 3구역(좌/중/우) 중 최근에 덜 쓴 구역 우선. 용암 지대면 가운데 구역 금지.
  const zones = lavaHere ? [0, 2] : [0, 1, 2];
  zones.sort((a, b) => stage2ProcZoneUse[a] - stage2ProcZoneUse[b] + (Math.random() - 0.5) * 0.8);
  const y = -halfH - 20 - (yOffset || 0);
  let x = null;
  for(const z of zones){
    for(let tries = 0; tries < 6; tries++){
      let cx;
      if(z === 0) cx = 20 + Math.random() * 150;
      else if(z === 1) cx = 170 + Math.random() * 140;
      else cx = 310 + Math.random() * 150;
      if(lavaHere && cx + halfW > STAGE2_LAVA_X_MIN && cx - halfW < STAGE2_LAVA_X_MAX){
        cx = z === 0 ? Math.min(cx, STAGE2_LAVA_X_MIN - halfW) : Math.max(cx, STAGE2_LAVA_X_MAX + halfW);
      }
      // 같은 줄(세로 200px 이내)에 이미 있는 오브젝트와 가로 170px 이상 떨어져야 함
      const clash = stage2ProcObjs.some(o => Math.abs(o.y - y) < 200 && Math.abs(o.x - cx) < 170);
      if(!clash){ x = cx; stage2ProcZoneUse[z]++; break; }
    }
    if(x !== null) break;
  }
  if(x === null) return false; // 자리가 없으면 이번엔 건너뜀(간격 규칙 우선)
  let rot;
  if(kind === 'base') rot = [0, 90, 180, 270][Math.floor(Math.random() * 4)] + Math.round((Math.random() - 0.5) * 12);
  else if(kind === 'pipe') rot = Math.random() < 0.5 ? 0 : 90;
  else if(kind === 'crystal') rot = Math.round((Math.random() - 0.5) * 100); // -50~50도
  else if(kind === 'fossil'){
    // 머리가 왼쪽(180)/오른쪽(0)/아래(90)로만 향하게. 270(위쪽) 근처는 절대 금지.
    rot = [0, 90, 180][Math.floor(Math.random() * 3)] + Math.round((Math.random() - 0.5) * 36);
  }
  else rot = Math.round(Math.random() * 360); // flat/wreck/rockFree: 완전 자유 회전
  const near = kind === 'wreck' && Math.random() < 0.25; // 가까운 잔해: 더 빨리 스쳐 지나감
  stage2ProcObjs.push({ type, x: Math.round(x), y, scale: near ? +(scale * 1.15).toFixed(2) : scale, rot,
    brightness: +(0.85 + Math.random() * 0.25).toFixed(2), speedMul: near ? 1.35 : 1, z: near ? 2 : 1 });
  stage2ProcRecentTypes.push(type);
  if(stage2ProcRecentTypes.length > 2) stage2ProcRecentTypes.shift();
  return true;
}
function stage2ProcUpdate(dy){
  if(!STAGE2_PROC_ENABLED) return;
  for(const o of stage2ProcObjs) o.y += dy * o.speedMul;
  stage2ProcObjs = stage2ProcObjs.filter(o => o.y < H + 260);
  if(stage2ProcStartDelay > 0){ stage2ProcStartDelay -= dy; return; }
  stage2ProcNextGap -= dy;
  if(stage2ProcNextGap <= 0){
    const cluster = Math.random() < 0.15 ? 2 + Math.floor(Math.random() * 2) : 1;
    for(let i = 0; i < cluster; i++) stage2ProcSpawnOne(i * 150);
    // 기본 간격 110~200px(100px/s 기준 1.1~2.0초), 군집 뒤에는 여백을 조금 더 줌
    stage2ProcNextGap = (110 + Math.random() * 90) * (cluster > 1 ? 1.6 : 1);
  }
}
function drawStage2ProcObjects(ea){
  const list = stage2ProcObjs.slice().sort((a, b) => a.z - b.z);
  for(const o of list){
    const img = stage2ObjImgs[o.type];
    if(!img || !img.complete || !img.naturalWidth) continue;
    const sc = o.scale * STAGE2_OBJ_BASE_SCALE, w = img.width * sc, h = img.height * sc;
    if(o.y + h < -80 || o.y - h > H + 80) continue;
    ctx.save();
    ctx.globalAlpha = ea;
    ctx.translate(o.x, o.y);
    ctx.rotate(o.rot * Math.PI / 180);
    ctx.drawImage(getBrightnessImage(img, o.brightness), -w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

// 발사 시퀀스 종료 직후 배경이 갑자기 튀어나오지 않도록 서서히 페이드인시키는 내부 타이머.
// stage1bg.js의 동일한 패턴과 맞춤(STAGE1_OBJECTS_FADE_MS와 동일 길이).
let stage2RevealElapsed = 0; // ms
const STAGE2_FADE_MS = 1200;
let stage2WasHidden = true;

// alpha: 지면 타일 + 오브젝트 전체의 불투명도(0~1, 기본 1). 발사 시퀀스가 진행되는 동안(STAGE N
// 타이틀이 뜨기 전까지)은 0으로 넘겨 화산 지면/오브젝트를 완전히 숨기고, 0에서 양수로 전환되는
// 순간부터 서서히 페이드인시켜(STAGE2_FADE_MS) 갑자기 나타나는 느낌 없이 자연스럽게 이어지게 함.
function drawStage2Background(dt, alpha) {
  const a = (alpha === undefined) ? 1 : alpha;
  const totalH = stage2TrackLength();
  stage2ScrollY = (stage2ScrollY + STAGE2_SCROLL_SPEED * dt) % totalH;
  stage2ObjScrollY += STAGE2_OBJ_SCROLL_SPEED * dt; // 절차 생성 모드: 고정 배치는 한 번만 지나감(%totalH 안 함)
  if(!STAGE2_PROC_ENABLED) stage2ObjScrollY %= totalH;
  stage2ProcUpdate(STAGE2_OBJ_SCROLL_SPEED * dt);

  if(a <= 0){
    stage2WasHidden = true;
    stage2RevealElapsed = 0;
    return; // 완전히 숨김 상태면 스크롤 위치만 갱신하고 그리기는 생략
  }
  if(stage2WasHidden){
    stage2RevealElapsed = 0;
    stage2WasHidden = false;
  }
  stage2RevealElapsed += dt * 1000;
  const fadeInMul = Math.min(1, stage2RevealElapsed / STAGE2_FADE_MS);
  const ea = a * fadeInMul;
  if(ea <= 0) return;

  ctx.save();
  ctx.globalAlpha = ea;

  // 1. 지면 타일 (상하 시임리스 480x1040 반복 스크롤, 뒤집기 지원)
  // 배경이 위→아래로 흘러야 하므로(플레이어가 앞으로 나아가는 느낌) tileWorldY에 scrollY를 더함(빼면 반대 방향).
  stage2TrackSequence.forEach((tile, idx) => {
    const img = stage2TileImgs[tile.key];
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const tileWorldY = idx * STAGE2_TILE_H;
    let screenY = (tileWorldY + stage2ScrollY) % totalH;
    if (screenY < -STAGE2_TILE_H) screenY += totalH;

    [screenY, screenY - totalH, screenY + totalH].forEach(sy => {
      if (sy + STAGE2_TILE_H >= 0 && sy <= H) {
        if (tile.flipped) {
          ctx.save();
          ctx.translate(0, sy + STAGE2_TILE_H / 2);
          ctx.scale(1, -1);
          ctx.drawImage(img, 0, -STAGE2_TILE_H / 2, W, STAGE2_TILE_H);
          ctx.restore();
        } else {
          ctx.drawImage(img, 0, sy, W, STAGE2_TILE_H);
        }
      }
    });
  });

  // 2. 네오지오 오브젝트 (z 순서대로, 회전/스케일/불투명도 반영, 지면과 동일하게 위→아래로 흐르도록 +stage2ScrollY 사용)
  const sortedObjects = [...stage2WorldObjects].sort((a, b) => (a.z || 0) - (b.z || 0));
  sortedObjects.forEach(o => {
    const img = stage2ObjImgs[o.type];
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const scale = (o.scale || 1.0) * STAGE2_OBJ_BASE_SCALE;
    const w = img.width * scale, h = img.height * scale;
    const rad = (o.rot || 0) * Math.PI / 180;
    const opacity = o.opacity != null ? o.opacity : 1;
    // 지면 스테이지는 공중 부유가 있을 수 없으므로 float/sway 오프셋을 적용하지 않음(규칙 7).

    let screenY, copies;
    if (STAGE2_PROC_ENABLED) {
      // 고정 배치: 첫 화면 연출용. 처음 화면 안(또는 바로 위)에 있던 것만 한 번 흘러 지나감
      if (o.y > H + 100 && o.y < totalH - 1200) return;
      screenY = (o.y >= totalH - 1200 ? o.y - totalH : o.y) + stage2ObjScrollY * (o.speedMul != null ? o.speedMul : 1);
      copies = [screenY];
    } else {
      screenY = (o.y + stage2ObjScrollY * (o.speedMul != null ? o.speedMul : 1)) % totalH;
      if (screenY < -h) screenY += totalH;
      copies = [screenY, screenY - totalH, screenY + totalH];
    }

    copies.forEach(sy => {
      if (sy + h >= -80 && sy - h <= H + 80) {
        ctx.save();
        ctx.globalAlpha = opacity * ea; // 발사 시퀀스의 전체 숨김/페이드인(ea)과 오브젝트 개별 불투명도(opacity)를 함께 반영
        ctx.translate(o.x, sy);
        ctx.rotate(rad);
        ctx.drawImage(getBrightnessImage(img, o.brightness), -w / 2, -h / 2, w, h);
        ctx.restore();
      }
    });
  });

  // 2-1. 절차 생성 오브젝트(규칙 기반 랜덤, 무한히 이어짐)
  if(STAGE2_PROC_ENABLED) drawStage2ProcObjects(ea);

  // 3. 화산 행성 대기 헤이즈(스테이지1과 색조 통일)
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(80, 15, 5, 0.12)');
  grad.addColorStop(0.5, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, 'rgba(60, 10, 2, 0.22)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.restore(); // 함수 시작부의 ctx.save()(전체 alpha 적용)에 대응
}
