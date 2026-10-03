// ==========================================================================
// stage.js — Air2 스테이지 진행 관리
// (스테이지별 적 스폰 스케줄, 보스 등장 트리거, 스테이지 전환/클리어 판정)
// canvas/ctx/W/H, enemies, bullets, playerBullets 등은 메인 HTML의 게임 루프
// 스크립트에서 전역으로 선언되며, 이 파일의 함수들은 호출 시점에 그 전역을
// 참조합니다. characters.js의 spawnXXX()/enabledTypes/bgmAudio 등도 그대로 사용합니다.
// ==========================================================================

// ---- 스테이지 진행 상태 ----
let currentStage = 1;
let stageElapsed = 0; // ms, 현재 스테이지 시작부터 누적 경과 시간
let stageActive = false; // true면 스테이지 진행 중(스폰/보스 트리거 등이 동작)

// 스테이지 진행 단계: 'spawn'(일반 적 등장 구간) -> 'bossIntro'(등장 연출, 화면 정리+BGM 전환)
// -> 'boss'(보스 전투 중) -> 'clear'(격파 후 클리어 연출) 순으로 전이.
let stagePhase = 'spawn';
let stageClearTimer = 0; // ms, 'clear' 단계 진입 후 누적 경과

// ---- 'clear' 단계 세부 진행(클리어 연출 시퀀스) ----
// clearSubPhase: 'wait'(격파 직후 2초 대기, 화면 정리) -> 'music'(3초, STAGE N CLEAR 표시+클리어 음악)
// -> 'fly'(주인공 가속 축소 비행으로 행성 쪽으로 사라짐) -> 'toBeContinued'(TO BE CONTINUED 표시)
// -> 'fadeout'(3초에 걸쳐 화면 어두워짐) -> 완료 시 타이틀로 복귀.
let clearSubPhase = 'wait';
let clearSubPhaseElapsed = 0; // ms, 현재 clearSubPhase 진입 후 누적 경과
const CLEAR_WAIT_MS = 2000; // 격파 후 화면 정리 대기 시간(기존 STAGE_CLEAR_SCREEN_DELAY_MS와 동일)
const CLEAR_MUSIC_MS = 5000; // stage_clear.wav 재생 시간(5초) 동안 STAGE N CLEAR 표시
const CLEAR_FLY_MS = 1500; // 주인공이 가속 축소되며 행성으로 사라지는 시간
const CLEAR_TO_BE_CONTINUED_MS = 1500; // TO BE CONTINUED 표시 시간
const CLEAR_FADEOUT_MS = 3000; // 화면이 서서히 어두워지는 시간(요청: 3초)

// 스폰 시 동시 존재 가능한 최대 적 수. 스테이지 진행에 따라 stage1 스케줄에서 동적으로 조절됨
// (사이드 HTML의 스폰 루프는 MAX_ENEMIES_ON_SCREEN 대신 이 값을 사용).
let stageSpawnCap = 10;

// ---- 스테이지1 등장 스케줄 데이터 소스 ----
// 통합 타임라인 에디터에서 내보낸 STAGE1_SCHEDULE_DATA(assets/bg/stage1new/stage1_schedule.js)가 있으면
// 그 값을 사용하고, 없으면 기존 하드코딩 기본값을 그대로 사용합니다(하위 호환).
const STAGE1_SCHEDULE_DEFAULT = {
  phases: [
    { startMs: 0,     enabled: ['normal1','normal2'], cap: 4 },
    { startMs: 10000, enabled: ['normal1','normal2'], cap: 5 },
    { startMs: 30000, enabled: ['normal1','normal2','normal3','normal4','normal5'], cap: 5 },
    { startMs: 60000, enabled: ['normal1','normal2','normal3','normal4','normal5','normal6','normal7','normal8'], cap: 7 }
  ],
  items: { rFirstMs: 15000, rIntervalMinMs: 25000, rIntervalMaxMs: 35000, wFirstMs: 30000, wIntervalMinMs: 30000, wIntervalMaxMs: 45000 },
  bossTriggerMs: 120000
};
const STAGE2_SCHEDULE_DEFAULT = {
  phases: [],
  items: { rFirstMs: 999999999, rIntervalMinMs: 999999999, rIntervalMaxMs: 999999999, wFirstMs: 999999999, wIntervalMinMs: 999999999, wIntervalMaxMs: 999999999 },
  bossTriggerMs: Infinity
};
function getScheduleData(stageNum){
  if(stageNum === 1) return (typeof STAGE1_SCHEDULE_DATA !== 'undefined') ? STAGE1_SCHEDULE_DATA : STAGE1_SCHEDULE_DEFAULT;
  if(stageNum === 2) return (typeof STAGE2_SCHEDULE_DATA !== 'undefined') ? STAGE2_SCHEDULE_DATA : STAGE2_SCHEDULE_DEFAULT;
  return STAGE1_SCHEDULE_DEFAULT;
}

const ALL_NORMAL_TYPES = ['normal1','normal2','normal3','normal4','normal5','normal6','normal7','normal8'];
const BOSS_WARNING_DURATION_MS = 2000; // 화면이 빈 뒤 WARNING! 문구가 깜빡이는 총 시간(2초)
const BULLET_FADE_MS = 500; // 화면에 남은 적 탄환이 페이드아웃되는 시간(WARNING! 표시 시간과 별개로 더 빠르게)
const BOSS_WARNING_BLINK_COUNT = 5; // 2초 동안 5회 깜빡임
const MAX_NORMAL8_ON_SCREEN = 2; // spiral(일반8) 화면 내 동시 존재 상한 (스테이지1/보스전 공통)

// 보스전 spiral(일반8) 전용 등장 스케줄: 보스 등장 시점부터 10초/30초 후 각 2기씩(총 2회, 4기) 동시 등장.
// 두 기는 보스와 겹치지 않도록 좌우로 벌려서 배치(spawnBossSpiralPair 참고).
const BOSS_SPIRAL_SPAWN_TIMES_MS = [10000, 30000];
let bossSpiralSpawnIdx = 0; // 다음에 소환할 인덱스(0,1 순서로 진행)
let bossPhaseElapsed = 0; // ms, 보스 단계 진입 이후 누적 경과
let bossWarningTimer = 0; // ms, 'warning' 단계(화면 빈 뒤 WARNING! 깜빡임) 진입 이후 누적 경과
let bulletFadeAlpha = 1; // 0~1, warning/clear 단계 동안 화면에 남은 적 탄환의 불투명도(1=평상시, 0=완전히 사라짐)
let clearBulletFadeTimer = 0; // ms, 'clear' 단계(보스 폭발) 진입 이후 누적 경과(탄환 페이드아웃 전용 타이머)

// 스테이지 진행 중 사용하는 구간(phase) 인덱스/아이템 스폰 타이머(스테이지 시작 시 리셋됨)
let stage1CurPhaseIdx = -1; // 현재 적용된 phases 배열의 인덱스(중복 적용 방지, startStage에서 -1로 리셋)
let stage1NextRSpawnMs = 0; // 다음 R 아이템 등장 예정 시각(ms)
let stage1NextWSpawnMs = 0; // 다음 W 아이템 등장 예정 시각(ms)

// 매 프레임 호출: 데이터 기반(phases 배열) 시간 구간에 따라 활성 타입/상한을 갱신.
// elapsedMs 시점에 해당하는 마지막 구간(startMs <= elapsedMs)을 찾아 그 구간의 enabled/cap을 적용.
function updateStage1Spawns(elapsedMs){
  const sched = getScheduleData(currentStage);
  const phases = sched.phases || [];

  // 현재 시각에 해당하는 구간 인덱스 찾기(구간은 startMs 오름차순으로 정렬되어 있다고 가정)
  let idx = -1;
  for(let i=0; i<phases.length; i++){
    if(elapsedMs >= phases[i].startMs) idx = i; else break;
  }
  if(idx !== stage1CurPhaseIdx && idx >= 0){
    stage1CurPhaseIdx = idx;
    const phase = phases[idx];
    stageSpawnCap = phase.cap != null ? phase.cap : MAX_ENEMIES_ON_SCREEN;
    // 이 구간에서 활성화해야 할 타입만 true, 나머지는 false로 정확히 맞춤(누적 방식이 아니라 구간별 완전 재설정)
    ALL_NORMAL_TYPES.forEach(t => { enabledTypes[t] = phase.enabled.includes(t); });
    if(phase.enabled.includes('normal8') && normal8SpawnTimer === 0){
      normal8SpawnTimer = NORMAL8_SPAWN_INTERVAL; // 방금 활성화된 경우 첫 1기 즉시 소환 유도
    }
  }

  const items_ = sched.items || STAGE1_SCHEDULE_DEFAULT.items;
  // R 아이템: 시간 기반으로 독립 등장 (화면에 아이템이 있으면 겹치지 않도록 다음 프레임으로 넘김)
  if(items.length === 0 && elapsedMs >= stage1NextRSpawnMs){
    stage1NextRSpawnMs = elapsedMs + items_.rIntervalMinMs + Math.random()*(items_.rIntervalMaxMs - items_.rIntervalMinMs);
    spawnItem('R', W/2, -40); // 화면 상단 중앙에서 낙하 시작
  }

  // W 아이템: 시간 기반으로 독립 등장 (이미 획득했으면 더 이상 등장 안 함,
  // 화면에 아이템이 있으면 겹치지 않도록 다음 프레임으로 넘김)
  if(!playerHasW && items.length === 0 && elapsedMs >= stage1NextWSpawnMs){
    stage1NextWSpawnMs = elapsedMs + items_.wIntervalMinMs + Math.random()*(items_.wIntervalMaxMs - items_.wIntervalMinMs);
    const margin = ITEM_SIZE_W/2 + 10;
    spawnItem('W', margin + Math.random()*(W - margin*2), -40); // 화면 상단 랜덤 x위치에서 낙하 시작
  }
}

// ---- 스테이지별 설정 ----
const stageConfigs = {
  1: {
    get bossTriggerMs(){ return getScheduleData(1).bossTriggerMs; },
    bossSpawnFn: spawnBoss1, // 이 스테이지에서 소환할 보스 스폰 함수
    spawnScheduleFn: updateStage1Spawns
  },
  2: {
    get bossTriggerMs(){ return getScheduleData(2).bossTriggerMs; },
    bossSpawnFn: spawnBoss1, // 스테이지2 전용 보스 제작 전까지 보스1 재사용
    spawnScheduleFn: updateStage1Spawns // 스테이지2도 동일한 데이터 기반 스케줄러 재사용(STAGE2_SCHEDULE_DATA가 phases:[]이면 아무 일도 안 함)
  }
};

// ---- BGM 구간 데이터 소스 ----
// 통합 타임라인 에디터에서 내보낸 STAGE{N}_BGM_DATA(assets/bg/stage{N}new/stage{N}_bgm.js)가 있으면
// 구간(segments)에 따라 트랙을 전환하고, 없으면 기존 방식(main.m4a 고정, boss.m4a 고정)으로 동작합니다.
function getBgmScheduleData(stageNum){
  if(stageNum === 1 && typeof STAGE1_BGM_DATA !== 'undefined') return STAGE1_BGM_DATA;
  if(stageNum === 2 && typeof STAGE2_BGM_DATA !== 'undefined') return STAGE2_BGM_DATA;
  return null;
}
// 구간별 BGM 재생을 위한 Audio 객체 캐시(트랙 슬롯 번호 -> Audio). 스테이지별로 분리 관리.
const stageBgmAudioCache = { 1:{}, 2:{} };
let stageBgmCurTrack = null; // 현재 재생 중인 트랙 식별자('1'/'2'/'3'/'boss' 또는 null)
let stage1CurBgmSegIdx = -1; // 현재 적용된 BGM 구간 인덱스(중복 전환 방지)

function getStageBgmAudioForTrack(stageNum, trackKey, src){
  const cache = stageBgmAudioCache[stageNum];
  if(!cache[trackKey]){
    const audio = registerAudio(new Audio(src));
    audio.loop = true;
    audio.addEventListener('ended', ()=>{ audio.currentTime = 0; audio.play().catch(()=>{}); });
    cache[trackKey] = audio;
  }
  return cache[trackKey];
}
// 현재 재생 중인 모든 스테이지 BGM 트랙(일반 진행용)을 정지. 보스 BGM은 별도(bossBgmAudio)로 관리되므로 대상에서 제외.
function pauseAllStageBgmTracks(stageNum){
  const cache = stageBgmAudioCache[stageNum];
  Object.values(cache).forEach(audio => audio.pause());
}
// elapsedMs 시점에 맞는 BGM 구간을 찾아 필요 시 트랙을 전환(같은 트랙이 계속 이어지는 경우엔 끊지 않음).
function updateStageBgmSegments(elapsedMs){
  const bgmData = getBgmScheduleData(currentStage);
  if(!bgmData || !Array.isArray(bgmData.segments) || bgmData.segments.length === 0) return; // 데이터 없으면 기존 switchToStageBgm() 방식 그대로 유지
  const segs = bgmData.segments;
  let idx = -1;
  for(let i=0; i<segs.length; i++){
    if(elapsedMs >= segs[i].startMs) idx = i; else break;
  }
  if(idx < 0 || idx === stage1CurBgmSegIdx) return;
  stage1CurBgmSegIdx = idx;
  const seg = segs[idx];
  pauseAllStageBgmTracks(currentStage);
  if(!seg.track || seg.track === 0){ stageBgmCurTrack = null; return; } // 무음 구간
  const src = bgmData.tracks[seg.track];
  if(!src) return;
  const audio = getStageBgmAudioForTrack(currentStage, seg.track, src);
  audio.volume = getBgmVolume();
  audio.currentTime = 0;
  audio.play().catch(()=>{});
  stageBgmCurTrack = String(seg.track);
}

// ---- BGM 전환 (스테이지 진행용 <-> 보스전용) ----
// 성능 최적화: 보스 BGM도 스크립트 로드 시점이 아니라 실제 보스전 진입 시점에 생성(지연 생성).
// BGM 구간 데이터(STAGE{N}_BGM_DATA)가 있으면 그 데이터의 bossTrack 경로를, 없으면 기존 sound/boss.m4a를 사용.
let bossBgmAudio = null;
function getBossBgmAudio(){
  const bgmData = getBgmScheduleData(currentStage);
  const src = (bgmData && bgmData.bossTrack) ? bgmData.bossTrack : 'sound/boss.m4a';
  if(!bossBgmAudio || bossBgmAudio.dataset_src !== src){
    if(bossBgmAudio) bossBgmAudio.pause();
    bossBgmAudio = registerAudio(new Audio(src));
    bossBgmAudio.dataset_src = src; // 스테이지 전환 시 보스 트랙 경로가 바뀌었는지 확인하기 위한 태그
    bossBgmAudio.loop = true;
    bossBgmAudio.volume = getBossBgmVolume(); // 효과음 평균 볼륨의 30% 수준(모바일에서는 2배 증폭)
    // main.m4a와 동일하게, loop 속성이 안 먹는 브라우저 대응용 강제 재시작.
    bossBgmAudio.addEventListener('ended', ()=>{
      bossBgmAudio.currentTime = 0;
      bossBgmAudio.play().catch(()=>{});
    });
  }
  return bossBgmAudio;
}

function switchToBossBgm(){
  if(bgmAudio) bgmAudio.pause();
  pauseAllStageBgmTracks(currentStage); // BGM 구간 데이터로 재생 중이던 일반 트랙도 정지
  stage1CurBgmSegIdx = -1; // 다음 스테이지 진입 시 구간을 처음부터 다시 판정하도록 리셋
  const audio = getBossBgmAudio();
  audio.currentTime = 0;
  audio.play().catch(()=>{});
}

function switchToStageBgm(){
  if(bossBgmAudio) bossBgmAudio.pause();
  // BGM 구간 데이터가 있으면 그 쪽 로직(updateStageBgmSegments)이 매 프레임 트랙을 갱신하므로 여기선 초기 트랙만 즉시 재생.
  const bgmData = getBgmScheduleData(currentStage);
  if(bgmData && Array.isArray(bgmData.segments) && bgmData.segments.length > 0){
    updateStageBgmSegments(stageElapsed);
    return;
  }
  const audio = getBgmAudio();
  audio.volume = getBgmVolume();
  if(audio.paused){
    audio.currentTime = 0;
    audio.play().catch(()=>{});
  }
  // 이미 재생 중이면(발사 연출 중 startBgm()으로 이미 흐르고 있는 경우) 끊지 않고 그대로 이어서 재생
}

// ---- 스테이지 클리어 연출 ----
// triggerStageClear() 호출 후 clearSubPhase가 순서대로 진행되며(위 상수 선언부 참고),
// 각 단계의 렌더링은 index.html의 update() 루프에서 stagePhase==='clear'&& clearSubPhase 값으로 분기 처리.
let stageClearActive = false; // 격파 직후부터 true(BGM 정지 등 즉시 처리용)

// ---- 스테이지 시작/전이 ----

// 스테이지 시작: 상태 초기화 후 진행 플래그 on, 스테이지 BGM 재생
// skipBgReset: true면 배경(오브젝트/지면) 스크롤 위치를 리셋하지 않음. 발사 시퀀스(startLaunchSequence)를
// 거쳐 자연스럽게 이어지는 경우 이 값을 true로 넘겨서, 발사대 화면부터 흘러오던 배경이 스테이지 시작
// 순간 다른 위치로 순간이동하듯 튀지 않고 그대로 이어지게 함. 개발자 모드처럼 발사 연출 없이 곧바로
// 진입하는 경우(이전에 흘러온 배경이 없음)에는 false(기본값)로 호출해 처음 위치로 초기화.
function startStage(stageNum, skipBgReset){
  if(typeof normal45SpawnTimer !== 'undefined'){ normal45SpawnTimer = 0; normal45NextIs5 = false; }
  // 이전 스테이지(보스전)에 남아 있던 적·적 탄환 제거. 클리어 연출 중 투명하게 페이드됐던 탄이
  // bulletFadeAlpha=1 리셋과 함께 다시 보이며 날아오던 문제 방지.
  if(typeof enemies !== 'undefined') enemies = [];
  if(typeof bullets !== 'undefined') bullets = [];
  currentStage = stageNum;
  stageElapsed = 0;
  stageActive = true;
  stagePhase = 'spawn';
  stageClearTimer = 0;
  stageClearActive = false;
  clearSubPhase = 'wait';
  clearSubPhaseElapsed = 0;
  stage1CurPhaseIdx = -1; // 스케줄 구간 판정을 처음부터 다시 시작
  const sched = getScheduleData(stageNum);
  stage1NextRSpawnMs = (sched.items && sched.items.rFirstMs) || STAGE1_SCHEDULE_DEFAULT.items.rFirstMs;
  stage1NextWSpawnMs = (sched.items && sched.items.wFirstMs) || STAGE1_SCHEDULE_DEFAULT.items.wFirstMs;
  stage1CurBgmSegIdx = -1; // BGM 구간도 처음부터 다시 판정
  bossSpiralSpawnIdx = 0;
  bossPhaseElapsed = 0;
  bossWarningTimer = 0;
  bulletFadeAlpha = 1;
  clearBulletFadeTimer = 0;
  normal8SpawnTimer = 0;
  stageSpawnCap = MAX_ENEMIES_ON_SCREEN;
  // stage1은 초반(0~60초) 일반1/2만 노출되어야 하므로 나머지는 시작 시점에 꺼둠
  if(stageNum === 1){
    enabledTypes.normal1 = true;
    enabledTypes.normal2 = true;
    enabledTypes.normal3 = false;
    enabledTypes.normal4 = false;
    enabledTypes.normal5 = false;
    enabledTypes.normal6 = false;
    enabledTypes.normal7 = false;
    enabledTypes.normal8 = false; // 바람개비 UFO는 60초(STAGE1_PHASE3_MS)부터 활성화
  }
  if(stageNum === 1 && !skipBgReset && typeof resetStage1Objects === 'function'){
    resetStage1Objects(); // 우주 오브젝트(행성/정거장 등) 스크롤 위치 초기화(발사 시퀀스를 거쳐온 경우 건너뜀)
  }
  // 맵 에디터(stage1 editor)에서 "게임용 파일로 내보내기"로 만든 stage1_layout.js가
  // assets/bg/stage1new/에 존재하면(index.html에서 <script>로 로드됨) STAGE1_LAYOUT_DATA
  // 전역 변수가 정의되어 있음 — 이 맵 데이터를 스테이지1 배경(stage1bg.js)에 적용.
  if(stageNum === 1 && typeof STAGE1_LAYOUT_DATA !== 'undefined' && typeof applyStage1LayoutData === 'function'){
    applyStage1LayoutData(STAGE1_LAYOUT_DATA);
  }
  // 맵 에디터(stage2 editor)에서 "게임용 파일로 내보내기"로 만든 stage2_layout.js가
  // assets/bg/stage2new/에 존재하면(index.html에서 <script>로 로드됨) STAGE2_LAYOUT_DATA
  // 전역 변수가 정의되어 있음 — 이 맵 데이터를 스테이지2 배경(stage2bg.js)에 적용.
  if(stageNum === 2 && typeof STAGE2_LAYOUT_DATA !== 'undefined' && typeof applyStage2LayoutData === 'function'){
    applyStage2LayoutData(STAGE2_LAYOUT_DATA);
  }
  // 타일 트랙 데이터(순서)가 확정된 뒤에 스크롤 위치를 0으로 리셋해야, 트랙의 첫 번째 타일
  // (에디터에서 "#1"로 표시되는 타일)이 항상 화면 맨 위에서부터 시작하는 것이 보장됨.
  if(stageNum === 2 && !skipBgReset && typeof resetStage2Background === 'function'){
    resetStage2Background(); // 화산 행성 배경 스크롤 위치를 #1번 타일 시작 지점으로 초기화(발사 시퀀스를 거쳐온 경우 건너뜀)
  }
  switchToStageBgm();
}

// 보스 트리거 시점(2분 경과)에는 화면을 즉시 정리하지 않고, 신규 스폰만 전부 차단.
// 화면에 남아있던 적들이 자연 퇴장/격파로 전부 사라질 때까지 대기(preBossWait 단계)한 뒤
// WARNING! 경고 단계로 넘어감.
function stopAllEnemySpawning(){
  enabledTypes.normal1 = false;
  enabledTypes.normal2 = false;
  enabledTypes.normal3 = false;
  enabledTypes.normal4 = false;
  enabledTypes.normal5 = false;
  enabledTypes.normal6 = false;
  enabledTypes.normal7 = false;
  enabledTypes.normal8 = false;
}

// 보스 트리거 시점 호출: 화면의 모든 적/탄을 제거하고 보스 전용 BGM으로 전환 후 보스를 소환.
function triggerBossPhase(){
  stagePhase = 'bossIntro';
  bossPhaseElapsed = 0;
  bossSpiralSpawnIdx = 0;
  enemies = enemies.filter(e => false); // 화면의 모든 적 즉시 제거
  bullets = []; // 화면의 모든 적 탄환 즉시 제거
  bulletFadeAlpha = 1; // 페이드 상태 리셋(이후 보스전 탄환은 다시 평상시 불투명도로 그려짐)
  // 보스전에는 spiral(일반8)만 등장해야 하므로, 공용 스폰 사이클이 도는 일반 적 타입을 전부 비활성화
  enabledTypes.normal1 = false;
  enabledTypes.normal2 = false;
  enabledTypes.normal3 = false;
  enabledTypes.normal4 = false;
  enabledTypes.normal5 = false;
  enabledTypes.normal6 = false;
  enabledTypes.normal7 = false;
  enabledTypes.normal8 = true; // spiral은 보스전 전용 타이머(updateBossSpiralSpawns)로 별도 소환
  normal8SpawnTimer = 0;
  normal7Alive = false;
  normal7RespawnTimer = 0;
  switchToBossBgm();
  const cfg = stageConfigs[currentStage];
  if(cfg && cfg.bossSpawnFn) cfg.bossSpawnFn();
}

// 보스전 spiral(일반8) 스폰: 보스 등장 시점부터 10초/30초 후 각 2기씩 소환 시도(좌우로 벌려서 배치, 보스와 안 겹침).
// 화면 내 spiral이 이미 있으면(2대 상한) 다음 프레임에 재시도.
function updateBossSpiralSpawns(){
  if(bossSpiralSpawnIdx >= BOSS_SPIRAL_SPAWN_TIMES_MS.length) return;
  const nextTime = BOSS_SPIRAL_SPAWN_TIMES_MS[bossSpiralSpawnIdx];
  if(bossPhaseElapsed >= nextTime){
    const normal8Count = enemies.filter(e => e.type === 'normal8').length;
    if(normal8Count === 0){
      spawnBossSpiralPair(); // 2기를 좌우로 벌려서 동시 소환
      bossSpiralSpawnIdx++;
    }
  }
}

// 보스 격파 시 호출: 클리어 단계로 전이, 스테이지 BGM 정지 (실제 화면 노출은 2초 뒤)
function triggerStageClear(){
  stagePhase = 'clear';
  stageClearTimer = 0;
  clearBulletFadeTimer = 0;
  clearSubPhase = 'wait';
  clearSubPhaseElapsed = 0;
  stageClearActive = true;
  enabledTypes.normal8 = false; // 보스 폭발 순간부터 spiral(일반8) 신규 등장 완전 차단
  if(bossBgmAudio) bossBgmAudio.pause();
}

// 매 프레임 호출: 단계별 진행/전이 판정 (실제 시간 기반 ms 누적, 델타타임 원칙 준수)
function updateStage(dtMs){
  if(!stageActive) return;
  stageElapsed += dtMs;

  if(stagePhase === 'spawn'){
    const cfg = stageConfigs[currentStage];
    if(cfg && cfg.spawnScheduleFn) cfg.spawnScheduleFn(stageElapsed);
    updateStageBgmSegments(stageElapsed); // BGM 구간 데이터가 있으면 시간에 따라 트랙 전환
    const triggerMs = (cfg && cfg.bossTriggerMs != null) ? cfg.bossTriggerMs : STAGE1_SCHEDULE_DEFAULT.bossTriggerMs;
    if(stageElapsed >= triggerMs){
      stagePhase = 'preBossWait'; // 신규 스폰 차단, 화면의 적이 전부 사라질 때까지 대기
      stopAllEnemySpawning();
    }
  } else if(stagePhase === 'preBossWait'){
    // WARNING! 문구가 뜨기 직전까지 스테이지 BGM을 정상 재생하다가, 적이 전부 사라져
    // warning 단계로 넘어가는 바로 그 순간 BGM을 정지.
    if(enemies.length === 0){
      if(bgmAudio) bgmAudio.pause();
      pauseAllStageBgmTracks(currentStage); // BGM 구간 데이터로 재생 중이던 트랙도 함께 정지
      stagePhase = 'warning';
      bossWarningTimer = 0;
    }
  } else if(stagePhase === 'warning'){
    bossWarningTimer += dtMs;
    // 화면에 남아있던 적 탄환은 즉시 지우지 않고 BULLET_FADE_MS(0.5초, WARNING! 전체 표시 시간보다 빠르게)
    // 동안 서서히 페이드아웃시켜 자연스럽게 사라지게 함(liteBullet 렌더 시 bulletFadeAlpha 참고).
    bulletFadeAlpha = Math.max(0, 1 - bossWarningTimer / BULLET_FADE_MS);
    if(bossWarningTimer >= BOSS_WARNING_DURATION_MS){
      triggerBossPhase(); // 경고 종료 후 보스 하강 시작(+보스 전용 BGM 전환), 여기서 bullets 완전히 비워짐
    }
  } else if(stagePhase === 'bossIntro'){
    bossPhaseElapsed += dtMs;
    updateBossSpiralSpawns();
    // 보스 스폰 함수가 enemies에 push한 개체가 실제로 배열에 들어온 시점부터 'boss' 단계로 전이
    if(enemies.some(e => e.type === 'boss1')){
      stagePhase = 'boss';
    }
  } else if(stagePhase === 'boss'){
    bossPhaseElapsed += dtMs;
    updateBossSpiralSpawns();
    // 보스가 배열에서 사라졌다면(격파 처리 완료) 클리어 단계로 전이
    if(!enemies.some(e => e.type === 'boss1')){
      triggerStageClear();
    }
  } else if(stagePhase === 'clear'){
    stageClearTimer += dtMs;
    // 보스 폭발 시점에 화면에 남아있던 적 탄환도 BULLET_FADE_MS(0.5초) 동안 빠르게 페이드아웃.
    // clear 단계 진입(triggerStageClear) 시 clearBulletFadeTimer가 0으로 리셋되어 있음.
    clearBulletFadeTimer += dtMs;
    bulletFadeAlpha = Math.max(0, 1 - clearBulletFadeTimer / BULLET_FADE_MS);
    clearSubPhaseElapsed += dtMs;
    if(clearSubPhase === 'wait' && clearSubPhaseElapsed >= CLEAR_WAIT_MS){
      clearSubPhase = 'music'; clearSubPhaseElapsed = 0;
      playStageClearMusic(); // STAGE N CLEAR 표시와 동시에 클리어 음악 재생 시작
    } else if(clearSubPhase === 'music' && clearSubPhaseElapsed >= CLEAR_MUSIC_MS){
      clearSubPhase = 'fly'; clearSubPhaseElapsed = 0;
    } else if(clearSubPhase === 'fly' && clearSubPhaseElapsed >= CLEAR_FLY_MS){
      // 다음 스테이지가 있으면 TO BE CONTINUED 없이 바로 암전 후 다음 스테이지로
      clearSubPhase = currentStage < 2 ? 'fadeout' : 'toBeContinued'; clearSubPhaseElapsed = 0;
    } else if(clearSubPhase === 'toBeContinued' && clearSubPhaseElapsed >= CLEAR_TO_BE_CONTINUED_MS){
      clearSubPhase = 'fadeout'; clearSubPhaseElapsed = 0;
    } else if(clearSubPhase === 'fadeout' && clearSubPhaseElapsed >= CLEAR_FADEOUT_MS){
      clearSubPhase = 'done'; // index.html의 update()가 이 값을 보고 타이틀로 복귀시킴
    }
  }
}

// ---- 개발자 모드 전용: 특정 스테이지의 보스 전투로 즉시 진입 ----
// 스테이지를 정상적으로 시작(startStage)한 뒤, 다음 프레임의 updateStage()에서
// 곧바로 보스 트리거 조건(stageElapsed >= bossTriggerMs)을 만족하도록 stageElapsed를
// 트리거 시각 이상으로 강제 설정. 이후 흐름(preBossWait -> warning -> bossIntro -> boss)은
// 정상 게임 로직 그대로 진행되므로 보스 등장 연출/BGM 전환도 그대로 재생됨.
function devJumpToStageBoss(stageNum){
  startStage(stageNum);
  const cfg = stageConfigs[stageNum];
  const triggerMs = (cfg && cfg.bossTriggerMs != null) ? cfg.bossTriggerMs : STAGE1_SCHEDULE_DEFAULT.bossTriggerMs;
  if(triggerMs === Infinity){
    console.warn('스테이지 ' + stageNum + '은 아직 보스 트리거가 구현되지 않았습니다.');
    return;
  }
  stageElapsed = triggerMs;
}

