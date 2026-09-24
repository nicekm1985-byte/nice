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

// 스폰 시 동시 존재 가능한 최대 적 수. 스테이지 진행에 따라 stage1 스케줄에서 동적으로 조절됨
// (사이드 HTML의 스폰 루프는 MAX_ENEMIES_ON_SCREEN 대신 이 값을 사용).
let stageSpawnCap = 10;

// ---- 스테이지1 등장 스케줄 (조준형 아님, 시간 기반으로 활성 타입만 순차 확대) ----
// 0~10초: 인원 상한 4대
// R/W 아이템은 격파와 완전히 무관하게, 시간 기반으로 독립적으로 랜덤 등장(각자 최초 등장 시점 + 이후 랜덤 간격)
// 10~20초: 인원 상한 5대
// 20~60초: 인원 상한 5대 유지 (30초에 일반3/4/5 활성화는 별도로 진행)
// 30초: 일반3/4/5 활성화 시작
// 60초(1분)~120초(2분): 인원 상한 7대, 일반6/7/8(spiral) 활성화 (spiral은 화면 내 최대 2대)
// 120초(2분): 화면의 모든 적/탄 제거 후 보스 등장(BGM 전환)
// 보스전 중에는 일반 적 스폰이 전부 멈추고, spiral(일반8)만 보스 등장 10초/20초 후 각 1회씩 총 2번 등장
const STAGE1_R_SPAWN_FIRST_MS = 15000; // 최초 R 아이템 등장 시점(15초)
const STAGE1_R_SPAWN_INTERVAL_MIN_MS = 25000; // R 재등장 최소 간격(25초)
const STAGE1_R_SPAWN_INTERVAL_MAX_MS = 35000; // R 재등장 최대 간격(35초), 매번 이 범위 안에서 랜덤
const STAGE1_W_SPAWN_FIRST_MS = 30000; // 최초 W 아이템 등장 시점(30초)
const STAGE1_W_SPAWN_INTERVAL_MIN_MS = 30000; // W 재등장 최소 간격(30초)
const STAGE1_W_SPAWN_INTERVAL_MAX_MS = 45000; // W 재등장 최대 간격(45초), 매번 이 범위 안에서 랜덤
const STAGE1_CAP_STAGE1_END_MS = 10000; // 0~10초: 4대
const STAGE1_CAP_STAGE2_END_MS = 20000; // 10~20초: 5대
const STAGE1_CAP_STAGE3_END_MS = 60000; // 20~60초: 5대 (일반3/4/5는 30초에 별도로 활성화)
const STAGE1_CAP_STAGE4_START_MS = 60000; // 60초부터 7대 제한 시작
const STAGE1_CAP_STAGE4_END_MS = 120000; // 120초(보스 트리거)까지 7대 유지
const STAGE1_CAP_STAGE1_LIMIT = 4;
const STAGE1_CAP_STAGE2_LIMIT = 5;
const STAGE1_CAP_STAGE3_LIMIT = 5;
const STAGE1_CAP_STAGE4_LIMIT = 7;
const STAGE1_PHASE2_MS = 30000; // 일반3/4/5 활성화
const STAGE1_PHASE3_MS = 60000; // 일반6/7 활성화, 일반8(spiral) 활성화
const STAGE1_BOSS_TRIGGER_MS = 120000; // 2분 경과 시 보스 등장
const STAGE_BGM_FADE_MS = 3000; // 보스 트리거 직전 3초간 스테이지 BGM 페이드아웃
const MAX_NORMAL8_ON_SCREEN = 2; // spiral(일반8) 화면 내 동시 존재 상한 (스테이지1/보스전 공통)

// 보스전 spiral(일반8) 전용 등장 스케줄: 보스 등장 시점부터 10초/30초 후 각 2기씩(총 2회, 4기) 동시 등장.
// 두 기는 보스와 겹치지 않도록 좌우로 벌려서 배치(spawnBossSpiralPair 참고).
const BOSS_SPIRAL_SPAWN_TIMES_MS = [10000, 30000];
let bossSpiralSpawnIdx = 0; // 다음에 소환할 인덱스(0,1 순서로 진행)
let bossPhaseElapsed = 0; // ms, 보스 단계 진입 이후 누적 경과

// 스테이지1에서만 사용하는 진행 플래그(중복 활성화 방지)
let stage1Phase2Applied = false;
let stage1Phase3Applied = false;
let stage1NextRSpawnMs = STAGE1_R_SPAWN_FIRST_MS; // 다음 R 아이템 등장 예정 시각(ms), 매 등장 후 12~18초 랜덤 간격으로 갱신
let stage1NextWSpawnMs = STAGE1_W_SPAWN_FIRST_MS; // 다음 W 아이템 등장 예정 시각(ms), 매 등장 후 18~28초 랜덤 간격으로 갱신

// 매 프레임 호출: stage1 전용 시간 기반 활성 타입/상한 갱신
function updateStage1Spawns(elapsedMs){
  if(elapsedMs < STAGE1_CAP_STAGE1_END_MS){
    stageSpawnCap = STAGE1_CAP_STAGE1_LIMIT; // 0~10초: 4대
  } else if(elapsedMs < STAGE1_CAP_STAGE2_END_MS){
    stageSpawnCap = STAGE1_CAP_STAGE2_LIMIT; // 10~20초: 5대
  } else if(elapsedMs < STAGE1_CAP_STAGE3_END_MS){
    stageSpawnCap = STAGE1_CAP_STAGE3_LIMIT; // 20~30초: 5대
  } else if(elapsedMs >= STAGE1_CAP_STAGE4_START_MS && elapsedMs < STAGE1_CAP_STAGE4_END_MS){
    stageSpawnCap = STAGE1_CAP_STAGE4_LIMIT; // 60~120초: 7대
  } else {
    stageSpawnCap = MAX_ENEMIES_ON_SCREEN; // 30~60초 등 그 외 구간은 기본치 유지
  }

  // R 아이템: 시간 기반으로 독립 등장 (화면에 아이템이 있으면 겹치지 않도록 다음 프레임으로 넘김)
  if(items.length === 0 && elapsedMs >= stage1NextRSpawnMs){
    stage1NextRSpawnMs = elapsedMs + STAGE1_R_SPAWN_INTERVAL_MIN_MS + Math.random()*(STAGE1_R_SPAWN_INTERVAL_MAX_MS - STAGE1_R_SPAWN_INTERVAL_MIN_MS);
    spawnItem('R', W/2, -40); // 화면 상단 중앙에서 낙하 시작
  }

  // W 아이템: 시간 기반으로 독립 등장 (이미 획득했으면 더 이상 등장 안 함,
  // 화면에 아이템이 있으면 겹치지 않도록 다음 프레임으로 넘김)
  if(!playerHasW && items.length === 0 && elapsedMs >= stage1NextWSpawnMs){
    stage1NextWSpawnMs = elapsedMs + STAGE1_W_SPAWN_INTERVAL_MIN_MS + Math.random()*(STAGE1_W_SPAWN_INTERVAL_MAX_MS - STAGE1_W_SPAWN_INTERVAL_MIN_MS);
    const margin = ITEM_SIZE_W/2 + 10;
    spawnItem('W', margin + Math.random()*(W - margin*2), -40); // 화면 상단 랜덤 x위치에서 낙하 시작
  }

  if(!stage1Phase2Applied && elapsedMs >= STAGE1_PHASE2_MS){
    stage1Phase2Applied = true;
    enabledTypes.normal3 = true;
    enabledTypes.normal4 = true;
    enabledTypes.normal5 = true;
  }
  if(!stage1Phase3Applied && elapsedMs >= STAGE1_PHASE3_MS){
    stage1Phase3Applied = true;
    enabledTypes.normal6 = true;
    enabledTypes.normal7 = true;
    enabledTypes.normal8 = true; // 바람개비 UFO(나선형 탄막)는 60초부터 등장
    normal8SpawnTimer = NORMAL8_SPAWN_INTERVAL; // 활성화 즉시 첫 1기 소환
  }
}

// ---- 스테이지별 설정 ----
const stageConfigs = {
  1: {
    bossTriggerMs: STAGE1_BOSS_TRIGGER_MS,
    bossSpawnFn: spawnBoss1, // 이 스테이지에서 소환할 보스 스폰 함수
    spawnScheduleFn: updateStage1Spawns
  }
};

// ---- BGM 전환 (스테이지 진행용 main.mp3 <-> 보스전용 boss.mp3) ----
// 성능 최적화: boss.mp3(12MB)도 스크립트 로드 시점이 아니라 실제 보스전 진입 시점에 생성(지연 생성).
let bossBgmAudio = null;
function getBossBgmAudio(){
  if(!bossBgmAudio){
    bossBgmAudio = registerAudio(new Audio('sound/boss.m4a'));
    bossBgmAudio.loop = true;
    bossBgmAudio.volume = 0.028; // BGM 볼륨 소폭 추가 상향
  }
  return bossBgmAudio;
}

function switchToBossBgm(){
  if(bgmAudio) bgmAudio.pause();
  const audio = getBossBgmAudio();
  audio.currentTime = 0;
  audio.play().catch(()=>{});
}

function switchToStageBgm(){
  if(bossBgmAudio) bossBgmAudio.pause();
  const audio = getBgmAudio();
  audio.volume = STAGE_BGM_BASE_VOLUME;
  if(audio.paused){
    audio.currentTime = 0;
    audio.play().catch(()=>{});
  }
  // 이미 재생 중이면(발사 연출 중 startBgm()으로 이미 흐르고 있는 경우) 끊지 않고 그대로 이어서 재생
}

// 보스 트리거 직전 STAGE_BGM_FADE_MS 구간 동안 스테이지 BGM 볼륨을 선형으로 줄임 (실제 시간 기반)
const STAGE_BGM_BASE_VOLUME = 0.028; // BGM 볼륨 소폭 추가 상향
let stageBgmFading = false;
function fadeOutStageBgm(remainingMs){
  if(!bgmAudio) return;
  stageBgmFading = true;
  const t = Math.max(0, Math.min(1, remainingMs / STAGE_BGM_FADE_MS)); // 1(페이드 시작)->0(끝)
  bgmAudio.volume = STAGE_BGM_BASE_VOLUME * t;
}

// ---- 스테이지 클리어 연출 ----
// triggerStageClear() 직후 stageClearTimer가 STAGE_CLEAR_SCREEN_DELAY_MS(2초)에 도달하면
// stageClearScreenActive를 true로 세워 메인 HTML이 "TEST STAGE CLEAR!" + GO TITLE 오버레이를
// 표시하도록 함 (자동 진행 없음 — 사용자가 GO TITLE을 눌러야 타이틀로 돌아감).
const STAGE_CLEAR_SCREEN_DELAY_MS = 2000; // 격파 후 2초 뒤 클리어 화면 노출
let stageClearActive = false; // 격파 직후부터 true(BGM 정지 등 즉시 처리용)
let stageClearScreenActive = false; // 2초 뒤부터 true(실제 오버레이 표시 트리거)

// ---- 스테이지 시작/전이 ----

// 스테이지 시작: 상태 초기화 후 진행 플래그 on, 스테이지 BGM 재생
function startStage(stageNum){
  currentStage = stageNum;
  stageElapsed = 0;
  stageActive = true;
  stagePhase = 'spawn';
  stageClearTimer = 0;
  stageClearActive = false;
  stageClearScreenActive = false;
  stage1Phase2Applied = false;
  stage1Phase3Applied = false;
  stage1NextRSpawnMs = STAGE1_R_SPAWN_FIRST_MS;
  stage1NextWSpawnMs = STAGE1_W_SPAWN_FIRST_MS;
  bossSpiralSpawnIdx = 0;
  bossPhaseElapsed = 0;
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
  switchToStageBgm();
}

// 보스 트리거 시점 호출: 화면의 모든 적/탄을 제거하고 보스 전용 BGM으로 전환 후 보스를 소환.
function triggerBossPhase(){
  stagePhase = 'bossIntro';
  bossPhaseElapsed = 0;
  bossSpiralSpawnIdx = 0;
  enemies = enemies.filter(e => false); // 화면의 모든 적 즉시 제거
  bullets = []; // 화면의 모든 적 탄환 즉시 제거
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
  stageClearActive = true;
  if(bossBgmAudio) bossBgmAudio.pause();
}

// 매 프레임 호출: 단계별 진행/전이 판정 (실제 시간 기반 ms 누적, 델타타임 원칙 준수)
function updateStage(dtMs){
  if(!stageActive) return;
  stageElapsed += dtMs;

  if(stagePhase === 'spawn'){
    const cfg = stageConfigs[currentStage];
    if(cfg && cfg.spawnScheduleFn) cfg.spawnScheduleFn(stageElapsed);
    const triggerMs = (cfg && cfg.bossTriggerMs) || STAGE1_BOSS_TRIGGER_MS;
    const remaining = triggerMs - stageElapsed;
    if(remaining <= STAGE_BGM_FADE_MS){
      fadeOutStageBgm(remaining);
    }
    if(stageElapsed >= triggerMs){
      triggerBossPhase();
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
    if(!stageClearScreenActive && stageClearTimer >= STAGE_CLEAR_SCREEN_DELAY_MS){
      stageClearScreenActive = true; // 2초 후 클리어 화면 노출 (이후 자동 진행 없음, GO TITLE 대기)
    }
  }
}

