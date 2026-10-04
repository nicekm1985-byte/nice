const STAGE1_SCHEDULE_DATA = {
  "phases": [
    {
      "startMs": 0,
      "enabled": [
        "normal1",
        "normal2"
      ],
      "cap": 3
    },
    {
      "startMs": 15000,
      "enabled": [
        "normal1",
        "normal2",
        "normal3"
      ],
      "cap": 4
    },
    {
      "startMs": 35000,
      "enabled": [
        "normal2",
        "normal3",
        "normal4",
        "normal5"
      ],
      "cap": 5
    },
    {
      "startMs": 55000,
      "enabled": [
        "normal2",
        "normal3",
        "normal4",
        "normal5",
        "normal6"
      ],
      "cap": 6
    },
    {
      "startMs": 80000,
      "enabled": [
        "normal1",
        "normal2",
        "normal3",
        "normal4",
        "normal5",
        "normal6",
        "normal7"
      ],
      "cap": 7
    },
    {
      "startMs": 105000,
      "enabled": [
        "normal1",
        "normal2",
        "normal3",
        "normal4",
        "normal5",
        "normal6",
        "normal7",
        "normal8"
      ],
      "cap": 8
    },
    {
      "startMs": 130000,
      "enabled": [
        "normal1",
        "normal2",
        "normal3",
        "normal4",
        "normal5",
        "normal6",
        "normal7",
        "normal8"
      ],
      "cap": 10
    },
    {
      "startMs": 170000,
      "enabled": [],
      "cap": 0
    }
  ],
  "items": {
    "rFirstMs": 15000,
    "rIntervalMinMs": 30000,
    "rIntervalMaxMs": 40000,
    "pSpawnChance": 55,
    "wFirstMs": 40000,
    "wIntervalMinMs": 40000,
    "wIntervalMaxMs": 55000
  },
  "bossTriggerMs": 180000
};
