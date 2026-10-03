const STAGE1_SCHEDULE_DATA = {
  "phases": [
    {
      "startMs": 0,
      "enabled": [
        "normal1",
        "normal2"
      ],
      "cap": 4
    },
    {
      "startMs": 12000,
      "enabled": [
        "normal1",
        "normal2",
        "normal3"
      ],
      "cap": 5
    },
    {
      "startMs": 30000,
      "enabled": [
        "normal1",
        "normal2",
        "normal3",
        "normal4",
        "normal5"
      ],
      "cap": 6
    },
    {
      "startMs": 55000,
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
      "startMs": 80000,
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
    }
  ],
  "items": {
    "rFirstMs": 15000,
    "rIntervalMinMs": 25000,
    "rIntervalMaxMs": 35000,
    "wFirstMs": 35000,
    "wIntervalMinMs": 35000,
    "wIntervalMaxMs": 45000
  },
  "bossTriggerMs": 120000
};
