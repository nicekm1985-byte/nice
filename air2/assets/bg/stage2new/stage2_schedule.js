const STAGE2_SCHEDULE_DATA = {
  "phases": [
    {
      "startMs": 0,
      "enabled": [
        "normal1",
        "normal2",
        "normal3"
      ],
      "cap": 6
    },
    {
      "startMs": 6000,
      "enabled": [
        "normal1",
        "normal2",
        "normal3",
        "normal4",
        "normal5"
      ],
      "cap": 7
    },
    {
      "startMs": 18000,
      "enabled": [
        "normal1",
        "normal2",
        "normal3",
        "normal4",
        "normal5"
      ],
      "cap": 8
    },
    {
      "startMs": 30000,
      "enabled": [
        "normal1",
        "normal2",
        "normal3",
        "normal4",
        "normal5",
        "normal7",
        "normal8"
      ],
      "cap": 9
    },
    {
      "startMs": 50000,
      "enabled": [
        "normal3",
        "normal4",
        "normal5",
        "normal7",
        "normal8"
      ],
      "cap": 9
    },
    {
      "startMs": 70000,
      "enabled": [
        "normal1",
        "normal2",
        "normal3",
        "normal4",
        "normal5",
        "normal7",
        "normal8"
      ],
      "cap": 10
    },
    {
      "startMs": 95000,
      "enabled": [
        "normal1",
        "normal2",
        "normal3",
        "normal4",
        "normal5",
        "normal7",
        "normal8"
      ],
      "cap": 11
    }
  ],
  "items": {
    "rFirstMs": 20000,
    "rIntervalMinMs": 35000,
    "rIntervalMaxMs": 45000,
    "wFirstMs": 45000,
    "wIntervalMinMs": 45000,
    "wIntervalMaxMs": 60000
  },
  "bossTriggerMs": 120000
};
