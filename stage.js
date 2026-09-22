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
// 10초: R 아이템 1개 화면에 등장
// 10~20초: 인원 상한 5대
// 20~60초: 인원 상한 5대 유지 (30초에 일반3/4/5 활성화는 별도로 진행)
// 30초: 일반3/4/5 활성화 시작
// 60초(1분)~120초(2분): 인원 상한 7대, 일반6/7 활성화
// 120초(2분): 화면의 모든 적/탄 제거 후 보스 등장(BGM 전환)
const STAGE1_ITEM_SPAWN_MS = 10000; // 10초 시점 R 아이템 1개 등장
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
const STAGE1_PHASE3_MS = 60000; // 일반6/7 활성화
const STAGE1_BOSS_TRIGGER_MS = 120000; // 2분 경과 시 보스 등장
const STAGE_BGM_FADE_MS = 3000; // 보스 트리거 직전 3초간 스테이지 BGM 페이드아웃

// 스테이지1에서만 사용하는 진행 플래그(중복 활성화 방지)
let stage1Phase2Applied = false;
let stage1Phase3Applied = false;
let stage1ItemSpawned = false;

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

  if(!stage1ItemSpawned && elapsedMs >= STAGE1_ITEM_SPAWN_MS){
    stage1ItemSpawned = true;
    spawnItem('R', W/2, -40); // 화면 상단 중앙에서 낙하 시작
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
const bossBgmAudio = registerAudio(new Audio('sound/boss.mp3'));
bossBgmAudio.loop = true;
bossBgmAudio.volume = 0.05; // 스테이지 BGM과 동일한 볼륨 기준

function switchToBossBgm(){
  if(typeof bgmAudio !== 'undefined'){
    bgmAudio.pause();
  }
  bossBgmAudio.currentTime = 0;
  bossBgmAudio.play().catch(()=>{});
}

function switchToStageBgm(){
  bossBgmAudio.pause();
  if(typeof bgmAudio !== 'undefined'){
    bgmAudio.volume = STAGE_BGM_BASE_VOLUME;
    bgmAudio.currentTime = 0;
    bgmAudio.play().catch(()=>{});
  }
}

// 보스 트리거 직전 STAGE_BGM_FADE_MS 구간 동안 스테이지 BGM 볼륨을 선형으로 줄임 (실제 시간 기반)
const STAGE_BGM_BASE_VOLUME = 0.05;
let stageBgmFading = false;
function fadeOutStageBgm(remainingMs){
  if(typeof bgmAudio === 'undefined') return;
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
  stage1ItemSpawned = false;
  stageSpawnCap = MAX_ENEMIES_ON_SCREEN;
  // stage1은 초반(0~30초) 일반1/2만 노출되어야 하므로 3~7은 시작 시점에 꺼둠
  if(stageNum === 1){
    enabledTypes.normal1 = true;
    enabledTypes.normal2 = true;
    enabledTypes.normal3 = false;
    enabledTypes.normal4 = false;
    enabledTypes.normal5 = false;
    enabledTypes.normal6 = false;
    enabledTypes.normal7 = false;
  }
  switchToStageBgm();
}

// 보스 트리거 시점 호출: 화면의 모든 적/탄을 제거하고 보스 전용 BGM으로 전환 후 보스를 소환.
function triggerBossPhase(){
  stagePhase = 'bossIntro';
  enemies = enemies.filter(e => false); // 화면의 모든 적 즉시 제거
  bullets = []; // 화면의 모든 적 탄환 즉시 제거
  switchToBossBgm();
  const cfg = stageConfigs[currentStage];
  if(cfg && cfg.bossSpawnFn) cfg.bossSpawnFn();
}

// 보스 격파 시 호출: 클리어 단계로 전이, 스테이지 BGM 정지 (실제 화면 노출은 2초 뒤)
function triggerStageClear(){
  stagePhase = 'clear';
  stageClearTimer = 0;
  stageClearActive = true;
  bossBgmAudio.pause();
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
    // 보스 스폰 함수가 enemies에 push한 개체가 실제로 배열에 들어온 시점부터 'boss' 단계로 전이
    if(enemies.some(e => e.type === 'boss1')){
      stagePhase = 'boss';
    }
  } else if(stagePhase === 'boss'){
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

