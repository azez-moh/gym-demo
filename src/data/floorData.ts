// Demo layout of the cardio hall: 40 machines in three rows plus a bench area. Positions in metres.
// x = east-west, z = depth, rotation in degrees about Y. Zone codes are kept in data only;
// the UI shows human names ("Treadmill 3, zone 1").
import type { FloorPlacement, LibraryModelSeed } from './types';

export const FLOOR_SIZE_M = { x: [-15.5, 14.5] as [number, number], z: [-1.5, 14] as [number, number], width: 30, depth: 15.5 };

export const DEMO_PLACEMENTS: FloorPlacement[] = [
 {
  "id": "fbtreadmill1",
  "num": 1,
  "type": "treadmill",
  "nameEn": "Treadmill 1",
  "nameAr": "مشاية 1",
  "x": -14.0,
  "z": 0.6,
  "rot": 0,
  "camera": "cam-1",
  "zones": [
   {
    "code": "Z_TREADM_1_Z1",
    "camera": "cam-1",
    "n": 1
   },
   {
    "code": "Z_TREADM_1_Z2",
    "camera": "cam-1",
    "n": 2
   }
  ],
  "rule": "and",
  "todaySessions": 10,
  "todayUsedMin": 90.9
 },
 {
  "id": "fbtreadmill2",
  "num": 2,
  "type": "treadmill",
  "nameEn": "Treadmill 2",
  "nameAr": "مشاية 2",
  "x": -12.2,
  "z": 0.6,
  "rot": 0,
  "camera": "cam-1",
  "zones": [
   {
    "code": "Z_TREADM_2_Z1",
    "camera": "cam-1",
    "n": 1
   },
   {
    "code": "Z_TREADM_2_Z2",
    "camera": "cam-1",
    "n": 2
   }
  ],
  "rule": "and",
  "todaySessions": 15,
  "todayUsedMin": 134.3
 },
 {
  "id": "fbtreadmill3",
  "num": 3,
  "type": "treadmill",
  "nameEn": "Treadmill 3",
  "nameAr": "مشاية 3",
  "x": -10.4,
  "z": 0.6,
  "rot": 0,
  "camera": "cam-1",
  "zones": [
   {
    "code": "Z_TREADM_3_Z1",
    "camera": "cam-1",
    "n": 1
   },
   {
    "code": "Z_TREADM_3_Z2",
    "camera": "cam-1",
    "n": 2
   }
  ],
  "rule": "and",
  "todaySessions": 9,
  "todayUsedMin": 78.4
 },
 {
  "id": "fbtreadmill4",
  "num": 4,
  "type": "treadmill",
  "nameEn": "Treadmill 4",
  "nameAr": "مشاية 4",
  "x": -8.6,
  "z": 0.6,
  "rot": 0,
  "camera": "cam-1",
  "zones": [
   {
    "code": "Z_TREADM_4_Z1",
    "camera": "cam-1",
    "n": 1
   },
   {
    "code": "Z_TREADM_4_Z2",
    "camera": "cam-1",
    "n": 2
   }
  ],
  "rule": "and",
  "todaySessions": 4,
  "todayUsedMin": 33.0
 },
 {
  "id": "fbtreadmill5",
  "num": 5,
  "type": "treadmill",
  "nameEn": "Treadmill 5",
  "nameAr": "مشاية 5",
  "x": -6.8,
  "z": 0.6,
  "rot": 0,
  "camera": "cam-1",
  "zones": [
   {
    "code": "Z_TREADM_5_Z1",
    "camera": "cam-1",
    "n": 1
   },
   {
    "code": "Z_TREADM_5_Z2",
    "camera": "cam-1",
    "n": 2
   }
  ],
  "rule": "and",
  "todaySessions": 20,
  "todayUsedMin": 147.6
 },
 {
  "id": "fbtreadmill6",
  "num": 6,
  "type": "treadmill",
  "nameEn": "Treadmill 6",
  "nameAr": "مشاية 6",
  "x": -5.0,
  "z": 0.6,
  "rot": 0,
  "camera": "cam-1",
  "zones": [
   {
    "code": "Z_TREADM_6_Z1",
    "camera": "cam-1",
    "n": 1
   },
   {
    "code": "Z_TREADM_6_Z2",
    "camera": "cam-1",
    "n": 2
   }
  ],
  "rule": "and",
  "todaySessions": 9,
  "todayUsedMin": 192.9
 },
 {
  "id": "sbtreadmill1",
  "num": 1,
  "type": "slat-treadmill",
  "nameEn": "Slat treadmill 1",
  "nameAr": "مشاية بسير شرائحي 1",
  "x": -3.2,
  "z": 0.6,
  "rot": 0,
  "camera": "cam-1",
  "zones": [
   {
    "code": "Z_SLATTR_1_Z1",
    "camera": "cam-1",
    "n": 1
   },
   {
    "code": "Z_SLATTR_1_Z2",
    "camera": "cam-1",
    "n": 2
   }
  ],
  "rule": "and",
  "todaySessions": 16,
  "todayUsedMin": 230.7
 },
 {
  "id": "sbtreadmill2",
  "num": 2,
  "type": "slat-treadmill",
  "nameEn": "Slat treadmill 2",
  "nameAr": "مشاية بسير شرائحي 2",
  "x": -1.4,
  "z": 0.6,
  "rot": 0,
  "camera": "cam-1",
  "zones": [
   {
    "code": "Z_SLATTR_2_Z1",
    "camera": "cam-1",
    "n": 1
   },
   {
    "code": "Z_SLATTR_2_Z2",
    "camera": "cam-1",
    "n": 2
   }
  ],
  "rule": "and",
  "todaySessions": 15,
  "todayUsedMin": 343.8
 },
 {
  "id": "sbtreadmill3",
  "num": 3,
  "type": "slat-treadmill",
  "nameEn": "Slat treadmill 3",
  "nameAr": "مشاية بسير شرائحي 3",
  "x": 0.4,
  "z": 0.6,
  "rot": 0,
  "camera": "cam-2",
  "zones": [
   {
    "code": "Z_SLATTR_3_Z1",
    "camera": "cam-2",
    "n": 1
   },
   {
    "code": "Z_SLATTR_3_Z2",
    "camera": "cam-2",
    "n": 2
   }
  ],
  "rule": "and",
  "todaySessions": 16,
  "todayUsedMin": 352.3
 },
 {
  "id": "sbtreadmill4",
  "num": 4,
  "type": "slat-treadmill",
  "nameEn": "Slat treadmill 4",
  "nameAr": "مشاية بسير شرائحي 4",
  "x": 2.2,
  "z": 0.6,
  "rot": 0,
  "camera": "cam-2",
  "zones": [
   {
    "code": "Z_SLATTR_4_Z1",
    "camera": "cam-2",
    "n": 1
   },
   {
    "code": "Z_SLATTR_4_Z2",
    "camera": "cam-2",
    "n": 2
   }
  ],
  "rule": "and",
  "todaySessions": 22,
  "todayUsedMin": 246.0
 },
 {
  "id": "sbtreadmill5",
  "num": 5,
  "type": "slat-treadmill",
  "nameEn": "Slat treadmill 5",
  "nameAr": "مشاية بسير شرائحي 5",
  "x": 4.0,
  "z": 0.6,
  "rot": 0,
  "camera": "cam-2",
  "zones": [
   {
    "code": "Z_SLATTR_5_Z1",
    "camera": "cam-2",
    "n": 1
   },
   {
    "code": "Z_SLATTR_5_Z2",
    "camera": "cam-2",
    "n": 2
   }
  ],
  "rule": "and",
  "todaySessions": 20,
  "todayUsedMin": 324.9
 },
 {
  "id": "fbtreadmill7",
  "num": 7,
  "type": "treadmill",
  "nameEn": "Treadmill 7",
  "nameAr": "مشاية 7",
  "x": 5.8,
  "z": 0.6,
  "rot": 0,
  "camera": "cam-2",
  "zones": [
   {
    "code": "Z_TREADM_7_Z1",
    "camera": "cam-2",
    "n": 1
   },
   {
    "code": "Z_TREADM_7_Z2",
    "camera": "cam-2",
    "n": 2
   }
  ],
  "rule": "and",
  "todaySessions": 5,
  "todayUsedMin": 112.3
 },
 {
  "id": "fbtreadmill8",
  "num": 8,
  "type": "treadmill",
  "nameEn": "Treadmill 8",
  "nameAr": "مشاية 8",
  "x": 7.6,
  "z": 0.6,
  "rot": 0,
  "camera": "cam-2",
  "zones": [
   {
    "code": "Z_TREADM_8_Z1",
    "camera": "cam-2",
    "n": 1
   },
   {
    "code": "Z_TREADM_8_Z2",
    "camera": "cam-2",
    "n": 2
   }
  ],
  "rule": "and",
  "todaySessions": 8,
  "todayUsedMin": 157.4
 },
 {
  "id": "fbtreadmill9",
  "num": 9,
  "type": "treadmill",
  "nameEn": "Treadmill 9",
  "nameAr": "مشاية 9",
  "x": 9.4,
  "z": 0.6,
  "rot": 0,
  "camera": "cam-2",
  "zones": [
   {
    "code": "Z_TREADM_9_Z1",
    "camera": "cam-2",
    "n": 1
   },
   {
    "code": "Z_TREADM_9_Z2",
    "camera": "cam-2",
    "n": 2
   }
  ],
  "rule": "and",
  "todaySessions": 4,
  "todayUsedMin": 78.0
 },
 {
  "id": "fbtreadmill10",
  "num": 10,
  "type": "treadmill",
  "nameEn": "Treadmill 10",
  "nameAr": "مشاية 10",
  "x": 11.2,
  "z": 0.6,
  "rot": 0,
  "camera": "cam-2",
  "zones": [
   {
    "code": "Z_TREADM_10_Z1",
    "camera": "cam-2",
    "n": 1
   },
   {
    "code": "Z_TREADM_10_Z2",
    "camera": "cam-2",
    "n": 2
   }
  ],
  "rule": "and",
  "todaySessions": 13,
  "todayUsedMin": 203.2
 },
 {
  "id": "fbtreadmill11",
  "num": 11,
  "type": "treadmill",
  "nameEn": "Treadmill 11",
  "nameAr": "مشاية 11",
  "x": 13.0,
  "z": 0.6,
  "rot": 0,
  "camera": "cam-2",
  "zones": [
   {
    "code": "Z_TREADM_11_Z1",
    "camera": "cam-2",
    "n": 1
   },
   {
    "code": "Z_TREADM_11_Z2",
    "camera": "cam-2",
    "n": 2
   }
  ],
  "rule": "and",
  "todaySessions": 28,
  "todayUsedMin": 384.2
 },
 {
  "id": "ellipticaltrainer1",
  "num": 1,
  "type": "elliptical",
  "nameEn": "Elliptical 1",
  "nameAr": "جهاز إهليلجي 1",
  "x": -13.0,
  "z": 4.2,
  "rot": 0,
  "camera": "cam-1",
  "zones": [
   {
    "code": "Z_ELLIPT_1_Z1",
    "camera": "cam-1",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 7,
  "todayUsedMin": 135.0
 },
 {
  "id": "ellipticaltrainer2",
  "num": 2,
  "type": "elliptical",
  "nameEn": "Elliptical 2",
  "nameAr": "جهاز إهليلجي 2",
  "x": -11.2,
  "z": 4.2,
  "rot": 0,
  "camera": "cam-1",
  "zones": [
   {
    "code": "Z_ELLIPT_2_Z1",
    "camera": "cam-1",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 31,
  "todayUsedMin": 161.1
 },
 {
  "id": "ellipticaltrainer3",
  "num": 3,
  "type": "elliptical",
  "nameEn": "Elliptical 3",
  "nameAr": "جهاز إهليلجي 3",
  "x": -9.4,
  "z": 4.2,
  "rot": 0,
  "camera": "cam-1",
  "zones": [
   {
    "code": "Z_ELLIPT_3_Z1",
    "camera": "cam-1",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 10,
  "todayUsedMin": 150.4
 },
 {
  "id": "ellipticaltrainer4",
  "num": 4,
  "type": "elliptical",
  "nameEn": "Elliptical 4",
  "nameAr": "جهاز إهليلجي 4",
  "x": -7.6,
  "z": 4.2,
  "rot": 0,
  "camera": "cam-1",
  "zones": [
   {
    "code": "Z_ELLIPT_4_Z1",
    "camera": "cam-1",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 5,
  "todayUsedMin": 38.3
 },
 {
  "id": "ellipticaltrainer5",
  "num": 5,
  "type": "elliptical",
  "nameEn": "Elliptical 5",
  "nameAr": "جهاز إهليلجي 5",
  "x": -5.8,
  "z": 4.2,
  "rot": 0,
  "camera": "cam-1",
  "zones": [
   {
    "code": "Z_ELLIPT_5_Z1",
    "camera": "cam-1",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 9,
  "todayUsedMin": 109.7
 },
 {
  "id": "ellipticaltrainer6",
  "num": 6,
  "type": "elliptical",
  "nameEn": "Elliptical 6",
  "nameAr": "جهاز إهليلجي 6",
  "x": -4.0,
  "z": 4.2,
  "rot": 0,
  "camera": "cam-1",
  "zones": [
   {
    "code": "Z_ELLIPT_6_Z1",
    "camera": "cam-1",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 3,
  "todayUsedMin": 6.0
 },
 {
  "id": "ellipticaltrainer7",
  "num": 7,
  "type": "elliptical",
  "nameEn": "Elliptical 7",
  "nameAr": "جهاز إهليلجي 7",
  "x": -2.2,
  "z": 4.2,
  "rot": 0,
  "camera": "cam-1",
  "zones": [
   {
    "code": "Z_ELLIPT_7_Z1",
    "camera": "cam-1",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 10,
  "todayUsedMin": 89.7
 },
 {
  "id": "ellipticaltrainer8",
  "num": 8,
  "type": "elliptical",
  "nameEn": "Elliptical 8",
  "nameAr": "جهاز إهليلجي 8",
  "x": -0.4,
  "z": 4.2,
  "rot": 0,
  "camera": "cam-1",
  "zones": [
   {
    "code": "Z_ELLIPT_8_Z1",
    "camera": "cam-1",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 2,
  "todayUsedMin": 9.3
 },
 {
  "id": "stairclimber1",
  "num": 1,
  "type": "stair-climber",
  "nameEn": "Stair climber 1",
  "nameAr": "جهاز صعود الدرج 1",
  "x": 2.2,
  "z": 4.2,
  "rot": 0,
  "camera": "cam-2",
  "zones": [
   {
    "code": "Z_STAIRC_1_Z1",
    "camera": "cam-2",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 24,
  "todayUsedMin": 73.2
 },
 {
  "id": "stairclimber2",
  "num": 2,
  "type": "stair-climber",
  "nameEn": "Stair climber 2",
  "nameAr": "جهاز صعود الدرج 2",
  "x": 4.2,
  "z": 4.2,
  "rot": 0,
  "camera": "cam-2",
  "zones": [
   {
    "code": "Z_STAIRC_2_Z1",
    "camera": "cam-2",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 19,
  "todayUsedMin": 130.1
 },
 {
  "id": "stairclimber3",
  "num": 3,
  "type": "stair-climber",
  "nameEn": "Stair climber 3",
  "nameAr": "جهاز صعود الدرج 3",
  "x": 6.2,
  "z": 4.2,
  "rot": 0,
  "camera": "cam-2",
  "zones": [
   {
    "code": "Z_STAIRC_3_Z1",
    "camera": "cam-2",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 17,
  "todayUsedMin": 66.9
 },
 {
  "id": "recumbentbike1",
  "num": 1,
  "type": "recumbent-bike",
  "nameEn": "Recumbent bike 1",
  "nameAr": "دراجة بمسند ظهر 1",
  "x": 9.0,
  "z": 4.2,
  "rot": 0,
  "camera": "cam-2",
  "zones": [
   {
    "code": "Z_RECUMB_1_Z1",
    "camera": "cam-2",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 44,
  "todayUsedMin": 148.9
 },
 {
  "id": "recumbentbike2",
  "num": 2,
  "type": "recumbent-bike",
  "nameEn": "Recumbent bike 2",
  "nameAr": "دراجة بمسند ظهر 2",
  "x": 11.2,
  "z": 4.2,
  "rot": 0,
  "camera": "cam-2",
  "zones": [
   {
    "code": "Z_RECUMB_2_Z1",
    "camera": "cam-2",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 38,
  "todayUsedMin": 66.0
 },
 {
  "id": "bikeindoor1",
  "num": 1,
  "type": "indoor-bike",
  "nameEn": "Indoor bike 1",
  "nameAr": "دراجة داخلية 1",
  "x": -13.0,
  "z": 8.2,
  "rot": 0,
  "camera": "cam-3",
  "zones": [
   {
    "code": "Z_INDOOR_1_Z1",
    "camera": "cam-3",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 3,
  "todayUsedMin": 53.9
 },
 {
  "id": "bikeindoor2",
  "num": 2,
  "type": "indoor-bike",
  "nameEn": "Indoor bike 2",
  "nameAr": "دراجة داخلية 2",
  "x": -11.2,
  "z": 8.2,
  "rot": 0,
  "camera": "cam-3",
  "zones": [
   {
    "code": "Z_INDOOR_2_Z1",
    "camera": "cam-3",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 3,
  "todayUsedMin": 49.0
 },
 {
  "id": "bikeindoor3",
  "num": 3,
  "type": "indoor-bike",
  "nameEn": "Indoor bike 3",
  "nameAr": "دراجة داخلية 3",
  "x": -9.4,
  "z": 8.2,
  "rot": 0,
  "camera": "cam-3",
  "zones": [
   {
    "code": "Z_INDOOR_3_Z1",
    "camera": "cam-3",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 2,
  "todayUsedMin": 32.6
 },
 {
  "id": "bikeindoor4",
  "num": 4,
  "type": "indoor-bike",
  "nameEn": "Indoor bike 4",
  "nameAr": "دراجة داخلية 4",
  "x": -7.6,
  "z": 8.2,
  "rot": 0,
  "camera": "cam-3",
  "zones": [
   {
    "code": "Z_INDOOR_4_Z1",
    "camera": "cam-3",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 15,
  "todayUsedMin": 113.6
 },
 {
  "id": "bikeindoor5",
  "num": 5,
  "type": "indoor-bike",
  "nameEn": "Indoor bike 5",
  "nameAr": "دراجة داخلية 5",
  "x": -5.8,
  "z": 8.2,
  "rot": 0,
  "camera": "cam-3",
  "zones": [
   {
    "code": "Z_INDOOR_5_Z1",
    "camera": "cam-3",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 17,
  "todayUsedMin": 106.0
 },
 {
  "id": "bikeindoor6",
  "num": 6,
  "type": "indoor-bike",
  "nameEn": "Indoor bike 6",
  "nameAr": "دراجة داخلية 6",
  "x": -4.0,
  "z": 8.2,
  "rot": 0,
  "camera": "cam-3",
  "zones": [
   {
    "code": "Z_INDOOR_6_Z1",
    "camera": "cam-3",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 17,
  "todayUsedMin": 34.3
 },
 {
  "id": "rowingmachine1",
  "num": 1,
  "type": "rower",
  "nameEn": "Rowing machine 1",
  "nameAr": "جهاز تجديف 1",
  "x": -1.0,
  "z": 8.2,
  "rot": 0,
  "camera": "cam-3",
  "zones": [
   {
    "code": "Z_ROWER_1_Z1",
    "camera": "cam-3",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 5,
  "todayUsedMin": 12.8
 },
 {
  "id": "rowingmachine2",
  "num": 2,
  "type": "rower",
  "nameEn": "Rowing machine 2",
  "nameAr": "جهاز تجديف 2",
  "x": 1.6,
  "z": 8.2,
  "rot": 0,
  "camera": "cam-4",
  "zones": [
   {
    "code": "Z_ROWER_2_Z1",
    "camera": "cam-4",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 0,
  "todayUsedMin": 0.0
 },
 {
  "id": "rowingmachine3",
  "num": 3,
  "type": "rower",
  "nameEn": "Rowing machine 3",
  "nameAr": "جهاز تجديف 3",
  "x": 4.2,
  "z": 8.2,
  "rot": 0,
  "camera": "cam-4",
  "zones": [
   {
    "code": "Z_ROWER_3_Z1",
    "camera": "cam-4",
    "n": 1
   }
  ],
  "rule": "and",
  "todaySessions": 7,
  "todayUsedMin": 20.2
 },
 {
  "id": "flatbenchpress1",
  "num": 1,
  "type": "flat-bench",
  "nameEn": "Flat bench press 1",
  "nameAr": "بنش أفقي 1",
  "x": 6.0,
  "z": 12.2,
  "rot": 0,
  "camera": "cam-5",
  "zones": [
   {
    "code": "Z_FLATBE_1_Z1",
    "camera": "cam-5",
    "n": 1
   },
   {
    "code": "Z_FLATBE_1_Z2",
    "camera": "cam-5",
    "n": 2
   }
  ],
  "rule": "and",
  "todaySessions": 11,
  "todayUsedMin": 17.9
 },
 {
  "id": "flatbenchpress2",
  "num": 2,
  "type": "flat-bench",
  "nameEn": "Flat bench press 2",
  "nameAr": "بنش أفقي 2",
  "x": 9.0,
  "z": 12.2,
  "rot": 0,
  "camera": "cam-5",
  "zones": [
   {
    "code": "Z_FLATBE_2_Z1",
    "camera": "cam-5",
    "n": 1
   },
   {
    "code": "Z_FLATBE_2_Z2",
    "camera": "cam-5",
    "n": 2
   }
  ],
  "rule": "and",
  "todaySessions": 11,
  "todayUsedMin": 27.4
 }
];

export const LIBRARY_SEED: LibraryModelSeed[] = [
 {
  "number": "01",
  "id": "stair-climber",
  "name": "Stair climber",
  "category": "Cardio",
  "subcategory": "Stair Climber",
  "description": "A tall step machine with a broad console, sculpted housing and wraparound handrails.",
  "motion_zone": "A visible step edge or a foot on the steps",
  "operator_zone": "Torso between the handrails",
  "provisional": true,
  "instances_on_live_floor": 3
 },
 {
  "number": "02",
  "id": "rower",
  "name": "Rowing machine",
  "category": "Cardio",
  "subcategory": "Rower",
  "description": "A long sliding-seat rail, front flywheel, footplates and a pull handle.",
  "motion_zone": "The sliding seat, exposed rail beside it, or the pull handle",
  "operator_zone": "Torso along the rowing path, excluding neighboring stations",
  "provisional": false,
  "instances_on_live_floor": 3
 },
 {
  "number": "03",
  "id": "indoor-bike",
  "name": "Indoor bike",
  "category": "Cardio",
  "subcategory": "Indoor Bike",
  "description": "A compact cycle with a front flywheel, adjustable saddle, handlebars and a small display.",
  "motion_zone": "A pedal/crank edge or the rider's lower leg",
  "operator_zone": "Torso above the saddle",
  "provisional": false,
  "instances_on_live_floor": 6
 },
 {
  "number": "04",
  "id": "elliptical",
  "name": "Elliptical trainer",
  "category": "Cardio",
  "subcategory": "Elliptical",
  "description": "Long pedal linkages, an enclosed rear drive and paired upright handles.",
  "motion_zone": "One pedal linkage or a moving handle below the grip",
  "operator_zone": "Torso behind the console",
  "provisional": false,
  "instances_on_live_floor": 8
 },
 {
  "number": "05",
  "id": "treadmill",
  "name": "Flat-belt treadmill",
  "category": "Cardio",
  "subcategory": "Treadmill",
  "description": "A flat running belt, broad side rails, twin uprights and a large console.",
  "motion_zone": "Feet or lower legs above the running belt",
  "operator_zone": "Torso centered between the side rails",
  "provisional": false,
  "instances_on_live_floor": 11
 },
 {
  "number": "06",
  "id": "slat-treadmill",
  "name": "Slatted-belt treadmill",
  "category": "Cardio",
  "subcategory": "Slat Treadmill",
  "description": "A ribbed running surface, tall uprights, console and yellow trim at the belt ends.",
  "motion_zone": "Feet or lower legs above the slats",
  "operator_zone": "Torso inside the running lane",
  "provisional": true,
  "instances_on_live_floor": 5
 },
 {
  "number": "07",
  "id": "preacher-curl",
  "name": "Seated preacher curl",
  "category": "Strength",
  "subcategory": "Preacher Curl",
  "description": "Tan sloping arm pad, adjustable seat, dark frame and EZ curl bar.",
  "motion_zone": "Hands and bar in front of the arm pad",
  "operator_zone": "Torso within this machine footprint, excluding adjacent stations.",
  "provisional": true,
  "instances_on_live_floor": 0
 },
 {
  "number": "08",
  "id": "standing-preacher",
  "name": "Standing preacher curl",
  "category": "Strength",
  "subcategory": "Standing Preacher",
  "description": "Tall tan arm-support pad and twin storage/support rails. Standing use is inferred from the visible frame.",
  "motion_zone": "Hands lifting in front of the pad",
  "operator_zone": "Torso within this machine footprint, excluding adjacent stations.",
  "provisional": true,
  "instances_on_live_floor": 0
 },
 {
  "number": "09",
  "id": "incline-bench",
  "name": "Incline bench press",
  "category": "Strength",
  "subcategory": "Incline Bench",
  "description": "Tan inclined back pad, separate seat and Olympic bar rack.",
  "motion_zone": "One bar end above the upper chest",
  "operator_zone": "Torso within this machine footprint, excluding adjacent stations.",
  "provisional": true,
  "instances_on_live_floor": 0
 },
 {
  "number": "10",
  "id": "flat-bench",
  "name": "Flat bench press",
  "category": "Strength",
  "subcategory": "Flat Bench",
  "description": "Long tan flat bench with twin rack uprights and Olympic bar.",
  "motion_zone": "One bar end above the chest",
  "operator_zone": "Torso within this machine footprint, excluding adjacent stations.",
  "provisional": true,
  "instances_on_live_floor": 2
 },
 {
  "number": "11",
  "id": "incline-treadmill",
  "name": "Incline treadmill",
  "category": "Cardio",
  "subcategory": "Incline Treadmill",
  "description": "Broad flat belt on an inclined deck, front console and long side handles.",
  "motion_zone": "Feet above the belt; exclude an empty running belt",
  "operator_zone": "Torso within this machine footprint, excluding adjacent stations.",
  "provisional": true,
  "instances_on_live_floor": 0
 },
 {
  "number": "12",
  "id": "upper-body-ergometer",
  "name": "Upper-body ergometer",
  "category": "Cardio",
  "subcategory": "Upper Body Ergometer",
  "description": "Standing platform, raised hand crank and screen.",
  "motion_zone": "One hand crank or forearm",
  "operator_zone": "Torso within this machine footprint, excluding adjacent stations.",
  "provisional": true,
  "instances_on_live_floor": 0
 },
 {
  "number": "13",
  "id": "recumbent-bike",
  "name": "Recumbent bike",
  "category": "Cardio",
  "subcategory": "Recumbent Bike",
  "description": "Low supported seat and backrest with forward pedals and console.",
  "motion_zone": "Pedal crank or lower leg",
  "operator_zone": "Torso within this machine footprint, excluding adjacent stations.",
  "provisional": true,
  "instances_on_live_floor": 2
 },
 {
  "number": "14",
  "id": "adaptive-cross-trainer",
  "name": "Adaptive-stride trainer",
  "category": "Cardio",
  "subcategory": "Adaptive Cross Trainer",
  "description": "Front linkage housing, suspended pedals, tall paired handles and rear access step.",
  "motion_zone": "Pedal linkage or moving handle",
  "operator_zone": "Torso within this machine footprint, excluding adjacent stations.",
  "provisional": true,
  "instances_on_live_floor": 0
 }
];
