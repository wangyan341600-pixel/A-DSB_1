/**
 * 共享的 TypeScript 类型定义
 */

export interface AircraftState {
  id: string;
  lat: number;
  lng: number;
  heading: number;
  speed: number;
  altitude: number;
  nic: number;
  callsign: string;
  lastSeen: number;
}

/**
 * 轨迹点数据
 */
export interface TrajectoryPoint {
  lat: number;
  lng: number;
  altitude: number;
  heading: number;
  speed: number;
  nic: number;
  timestamp: number;  // 相对于录制开始的时间（毫秒）
}

/**
 * 飞机完整轨迹
 */
export interface AircraftTrajectory {
  id: string;           // ICAO 地址
  callsign: string;     // 呼号
  points: TrajectoryPoint[];  // 轨迹点列表（按时间排序）
}
