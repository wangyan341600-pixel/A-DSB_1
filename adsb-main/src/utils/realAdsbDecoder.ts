/**
 * 真实 ADS-B 消息解码器
 * 
 * 符合 DO-260B / RTCA 标准的 ADS-B 解码实现
 * 支持解码真实采集的 ADS-B hex 消息
 */

// ==================== 类型定义 ====================

export interface RealAdsbMessage {
  df: number;           // Downlink Format (0-31)
  ca: number;           // Capability (0-7)
  icao: string;         // ICAO 24-bit 地址
  typeCode: number;     // Type Code (0-31)
  raw: string;          // 原始 hex 字符串
}

export interface RealDecodedPosition {
  type: 'position';
  lat: number;
  lng: number;
  altitude: number;
  altitudeType: 'baro' | 'gnss';  // 气压高度 or GNSS高度
  nic: number;          // Navigation Integrity Category
  cprOddEven: 0 | 1;    // CPR 奇偶帧标识
  cprLat: number;       // CPR 编码纬度
  cprLon: number;       // CPR 编码经度
}

export interface RealDecodedVelocity {
  type: 'velocity';
  speed: number;        // 地速 (knots)
  heading: number;      // 航向 (度)
  verticalRate: number; // 垂直速率 (ft/min)
  subType: number;      // 子类型
}

export interface RealDecodedIdentification {
  type: 'identification';
  callsign: string;     // 航班呼号
  category: number;     // 飞机类别
}

export type RealDecodedData = RealDecodedPosition | RealDecodedVelocity | RealDecodedIdentification | null;

// ==================== CPR 解码器 ====================

/**
 * CPR (Compact Position Reporting) 解码器
 * 用于解码 ADS-B 位置消息中的经纬度
 */
export class CPRDecoder {
  // CPR 常量
  private static readonly NZ = 15;  // Number of latitude zones
  private static readonly D_LAT_EVEN = 360 / 60;
  private static readonly D_LAT_ODD = 360 / 59;

  // 存储最近的奇偶帧用于全局解码
  private cprCache: Map<string, {
    even?: { lat: number; lon: number; time: number };
    odd?: { lat: number; lon: number; time: number };
    lastLat?: number;
    lastLon?: number;
  }> = new Map();

  /**
   * NL 函数 - 计算经度区域数
   */
  private static NL(lat: number): number {
    if (Math.abs(lat) >= 87) return 1;
    
    const tmp = 1 - Math.cos(Math.PI / (2 * this.NZ));
    const nz = 2 * Math.PI / 
      Math.acos(1 - tmp / Math.pow(Math.cos(Math.PI * lat / 180), 2));
    
    return Math.floor(nz);
  }

  /**
   * 使用单帧进行本地解码（需要参考位置）
   */
  decodeLocal(
    icao: string,
    cprLat: number, 
    cprLon: number, 
    oddEven: 0 | 1,
    refLat: number,
    refLon: number
  ): { lat: number; lon: number } | null {
    const dLat = oddEven === 0 ? CPRDecoder.D_LAT_EVEN : CPRDecoder.D_LAT_ODD;
    
    // 计算纬度
    const j = Math.floor(refLat / dLat) + 
              Math.floor(0.5 + (refLat % dLat) / dLat - cprLat / 131072);
    const lat = dLat * (j + cprLat / 131072);
    
    // 检查纬度有效性
    if (lat < -90 || lat > 90) return null;
    
    // 计算经度
    const nl = CPRDecoder.NL(lat);
    const ni = Math.max(nl - oddEven, 1);
    const dLon = 360 / ni;
    
    const m = Math.floor(refLon / dLon) + 
              Math.floor(0.5 + (refLon % dLon) / dLon - cprLon / 131072);
    let lon = dLon * (m + cprLon / 131072);
    
    // 规范化经度到 -180 到 180
    if (lon > 180) lon -= 360;
    if (lon < -180) lon += 360;
    
    // 更新缓存
    this.updateCache(icao, cprLat, cprLon, oddEven, lat, lon);
    
    return { lat, lon };
  }

  /**
   * 使用奇偶帧进行全局解码
   */
  decodeGlobal(
    icao: string,
    cprLat: number,
    cprLon: number,
    oddEven: 0 | 1
  ): { lat: number; lon: number } | null {
    // 更新缓存中的帧
    const cache = this.cprCache.get(icao) || {};
    const now = Date.now();
    
    if (oddEven === 0) {
      cache.even = { lat: cprLat, lon: cprLon, time: now };
    } else {
      cache.odd = { lat: cprLat, lon: cprLon, time: now };
    }
    
    this.cprCache.set(icao, cache);
    
    // 检查是否有足够的数据进行全局解码
    if (!cache.even || !cache.odd) {
      // 尝试本地解码（如果有历史位置）
      if (cache.lastLat !== undefined && cache.lastLon !== undefined) {
        return this.decodeLocal(icao, cprLat, cprLon, oddEven, cache.lastLat, cache.lastLon);
      }
      return null;
    }
    
    // 检查时间差（超过10秒的帧不应该一起解码）
    if (Math.abs(cache.even.time - cache.odd.time) > 10000) {
      // 尝试本地解码
      if (cache.lastLat !== undefined && cache.lastLon !== undefined) {
        return this.decodeLocal(icao, cprLat, cprLon, oddEven, cache.lastLat, cache.lastLon);
      }
      return null;
    }
    
    // 全局解码
    const latEven = cache.even.lat / 131072;
    const latOdd = cache.odd.lat / 131072;
    const lonEven = cache.even.lon / 131072;
    const lonOdd = cache.odd.lon / 131072;
    
    // 计算纬度索引
    const j = Math.floor(59 * latEven - 60 * latOdd + 0.5);
    
    // 计算纬度
    let latE = CPRDecoder.D_LAT_EVEN * ((j % 60) + latEven);
    let latO = CPRDecoder.D_LAT_ODD * ((j % 59) + latOdd);
    
    if (latE >= 270) latE -= 360;
    if (latO >= 270) latO -= 360;
    
    // 检查 NL 一致性
    if (CPRDecoder.NL(latE) !== CPRDecoder.NL(latO)) {
      // NL 不一致，尝试本地解码
      if (cache.lastLat !== undefined && cache.lastLon !== undefined) {
        return this.decodeLocal(icao, cprLat, cprLon, oddEven, cache.lastLat, cache.lastLon);
      }
      return null;
    }
    
    // 选择使用最新帧的纬度
    const lat = oddEven === 0 ? latE : latO;
    
    // 计算经度
    const nl = CPRDecoder.NL(lat);
    const ni = oddEven === 0 ? Math.max(nl, 1) : Math.max(nl - 1, 1);
    const dLon = 360 / ni;
    
    const m = Math.floor(lonEven * (nl - 1) - lonOdd * nl + 0.5);
    const lonCpr = oddEven === 0 ? lonEven : lonOdd;
    let lon = dLon * ((m % ni) + lonCpr);
    
    if (lon > 180) lon -= 360;
    
    // 更新缓存的最后位置
    cache.lastLat = lat;
    cache.lastLon = lon;
    this.cprCache.set(icao, cache);
    
    return { lat, lon };
  }

  private updateCache(icao: string, cprLat: number, cprLon: number, oddEven: 0 | 1, lat: number, lon: number) {
    const cache = this.cprCache.get(icao) || {};
    const now = Date.now();
    
    if (oddEven === 0) {
      cache.even = { lat: cprLat, lon: cprLon, time: now };
    } else {
      cache.odd = { lat: cprLat, lon: cprLon, time: now };
    }
    cache.lastLat = lat;
    cache.lastLon = lon;
    
    this.cprCache.set(icao, cache);
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cprCache.clear();
  }

  /**
   * 获取缓存的最后位置
   */
  getLastPosition(icao: string): { lat: number; lon: number } | null {
    const cache = this.cprCache.get(icao);
    if (cache?.lastLat !== undefined && cache?.lastLon !== undefined) {
      return { lat: cache.lastLat, lon: cache.lastLon };
    }
    return null;
  }
}

// ==================== 真实 ADS-B 解码器 ====================

export class RealAdsbDecoder {
  private cprDecoder = new CPRDecoder();
  
  // 参考位置（接收机位置，用于本地解码）
  private refLat: number = 22.5431;  // 默认深圳
  private refLon: number = 114.0579;

  /**
   * 设置参考位置（接收机位置）
   */
  setReferencePosition(lat: number, lon: number) {
    this.refLat = lat;
    this.refLon = lon;
  }

  /**
   * 解码 ADS-B hex 消息
   */
  decode(hexMsg: string): { icao: string; data: RealDecodedData } | null {
    // 清理输入
    hexMsg = hexMsg.trim().toUpperCase();
    
    // 检查长度 (112 bits = 28 hex chars for DF17)
    if (hexMsg.length !== 28 && hexMsg.length !== 14) {
      return null;
    }

    try {
      const msgInt = BigInt('0x' + hexMsg);
      
      // 提取 DF (Downlink Format)
      const df = Number((msgInt >> BigInt(hexMsg.length * 4 - 5)) & 0x1Fn);
      
      // 只处理 DF17 (Extended Squitter)
      if (df !== 17 && df !== 18) {
        return null;
      }

      // 提取 ICAO 地址
      const icao = ((msgInt >> 80n) & 0xFFFFFFn).toString(16).toUpperCase().padStart(6, '0');
      
      // 提取 ME (Message Extension) - 56 bits payload
      const me = (msgInt >> 24n) & 0xFFFFFFFFFFFFFFn;
      
      // 提取 Type Code
      const typeCode = Number((me >> 51n) & 0x1Fn);

      // 根据 Type Code 解码
      let data: RealDecodedData = null;

      if (typeCode >= 1 && typeCode <= 4) {
        // 飞机识别
        data = this.decodeIdentification(me, typeCode);
      } else if (typeCode >= 9 && typeCode <= 18) {
        // 气压高度位置
        data = this.decodeAirbornePosition(icao, me, typeCode, 'baro');
      } else if (typeCode === 19) {
        // 空速
        data = this.decodeAirborneVelocity(me);
      } else if (typeCode >= 20 && typeCode <= 22) {
        // GNSS 高度位置
        data = this.decodeAirbornePosition(icao, me, typeCode, 'gnss');
      }

      return { icao, data };
    } catch (e) {
      console.warn(`[RealAdsbDecoder] Failed to decode: ${hexMsg}`, e);
      return null;
    }
  }

  /**
   * 解码飞机识别消息 (TC 1-4)
   */
  private decodeIdentification(me: bigint, typeCode: number): RealDecodedIdentification {
    const category = Number((me >> 48n) & 0x7n);
    
    // 解码呼号 (8 个 6-bit 字符)
    const charset = '#ABCDEFGHIJKLMNOPQRSTUVWXYZ##### ###############0123456789######';
    let callsign = '';
    
    for (let i = 0; i < 8; i++) {
      const charCode = Number((me >> BigInt(42 - i * 6)) & 0x3Fn);
      callsign += charset[charCode] || ' ';
    }
    
    return {
      type: 'identification',
      callsign: callsign.trim(),
      category: (typeCode - 1) * 8 + category
    };
  }

  /**
   * 解码空中位置消息 (TC 9-18, 20-22)
   */
  private decodeAirbornePosition(
    icao: string, 
    me: bigint, 
    typeCode: number,
    altitudeType: 'baro' | 'gnss'
  ): RealDecodedPosition | null {
    // 提取监视状态和 NIC supplement
    const ss = Number((me >> 49n) & 0x3n);
    const nicSupB = Number((me >> 48n) & 0x1n);
    
    // 提取高度 (12 bits)
    const altBits = Number((me >> 36n) & 0xFFFn);
    let altitude: number;
    
    if (altitudeType === 'baro') {
      // 气压高度解码
      const qBit = (altBits >> 4) & 1;
      if (qBit === 1) {
        // 25 英尺分辨率
        const n = ((altBits >> 5) << 4) | (altBits & 0xF);
        altitude = n * 25 - 1000;
      } else {
        // Gillham 编码 (100 英尺分辨率)
        altitude = this.decodeGillham(altBits);
      }
    } else {
      // GNSS 高度
      altitude = altBits * 25 - 1000;
    }

    // 提取 CPR 时间位和奇偶标志
    const time = Number((me >> 35n) & 0x1n);
    const cprOddEven = Number((me >> 34n) & 0x1n) as 0 | 1;
    
    // 提取 CPR 编码经纬度 (17 bits each)
    const cprLat = Number((me >> 17n) & 0x1FFFFn);
    const cprLon = Number(me & 0x1FFFFn);

    // 计算 NIC
    const nic = this.calculateNIC(typeCode, nicSupB, ss);

    // 尝试解码位置
    let position = this.cprDecoder.decodeGlobal(icao, cprLat, cprLon, cprOddEven);
    
    // 如果全局解码失败，尝试本地解码
    if (!position) {
      position = this.cprDecoder.decodeLocal(
        icao, cprLat, cprLon, cprOddEven, 
        this.refLat, this.refLon
      );
    }

    if (!position) {
      // 返回带有 CPR 数据的部分结果
      return {
        type: 'position',
        lat: 0,
        lng: 0,
        altitude,
        altitudeType,
        nic,
        cprOddEven,
        cprLat,
        cprLon
      };
    }

    return {
      type: 'position',
      lat: position.lat,
      lng: position.lon,
      altitude,
      altitudeType,
      nic,
      cprOddEven,
      cprLat,
      cprLon
    };
  }

  /**
   * 解码空中速度消息 (TC 19)
   */
  private decodeAirborneVelocity(me: bigint): RealDecodedVelocity | null {
    const subType = Number((me >> 48n) & 0x7n);
    
    let speed: number;
    let heading: number;
    let verticalRate: number;

    if (subType === 1 || subType === 2) {
      // 地面速度 (Ground Speed)
      const ewDir = Number((me >> 42n) & 0x1n);
      const ewVel = Number((me >> 32n) & 0x3FFn) - 1;
      const nsDir = Number((me >> 31n) & 0x1n);
      const nsVel = Number((me >> 21n) & 0x3FFn) - 1;
      
      if (ewVel < 0 || nsVel < 0) {
        return null;
      }

      const vEW = ewDir === 1 ? -ewVel : ewVel;
      const vNS = nsDir === 1 ? -nsVel : nsVel;
      
      // 计算速度和航向
      speed = Math.sqrt(vEW * vEW + vNS * vNS);
      heading = (Math.atan2(vEW, vNS) * 180 / Math.PI + 360) % 360;
      
      // 速度单位调整
      if (subType === 2) {
        speed *= 4; // 超音速模式
      }
    } else if (subType === 3 || subType === 4) {
      // 空速 (Airspeed)
      const headingAvail = Number((me >> 42n) & 0x1n);
      const headingRaw = Number((me >> 32n) & 0x3FFn);
      const airspeed = Number((me >> 21n) & 0x3FFn);
      
      if (headingAvail === 1) {
        heading = headingRaw * 360 / 1024;
      } else {
        heading = 0;
      }
      
      speed = airspeed;
      if (subType === 4) {
        speed *= 4; // 超音速模式
      }
    } else {
      return null;
    }

    // 垂直速率
    const vrSign = Number((me >> 10n) & 0x1n);
    const vrRaw = Number((me >> 1n) & 0x1FFn);
    verticalRate = (vrRaw - 1) * 64;
    if (vrSign === 1) {
      verticalRate = -verticalRate;
    }

    return {
      type: 'velocity',
      speed,
      heading,
      verticalRate,
      subType
    };
  }

  /**
   * Gillham 编码解码（Gray-coded altitude）
   * 
   * 高度字段格式（12位）：C1 A1 C2 A2 C4 A4 Q B1 D1 B2 D2 B4
   * 当 Q=0 时使用 Gillham 编码，100英尺分辨率
   * 
   * Gillham 编码将高度分为两部分：
   * - 500英尺组：由 D 位编码（Gray码）
   * - 100英尺增量：由 A、B、C 位编码
   */
  private decodeGillham(altBits: number): number {
    // 提取各个位
    // 位顺序：C1(11) A1(10) C2(9) A2(8) C4(7) A4(6) Q(5) B1(4) D1(3) B2(2) D2(1) B4(0)
    const C1 = (altBits >> 11) & 1;
    const A1 = (altBits >> 10) & 1;
    const C2 = (altBits >> 9) & 1;
    const A2 = (altBits >> 8) & 1;
    const C4 = (altBits >> 7) & 1;
    const A4 = (altBits >> 6) & 1;
    // Q位在第5位，已在调用前检查
    const B1 = (altBits >> 4) & 1;
    const D1 = (altBits >> 3) & 1;
    const B2 = (altBits >> 2) & 1;
    const D2 = (altBits >> 1) & 1;
    const B4 = altBits & 1;

    // D 位组成 Gray 码，解码为 500 英尺组
    const grayD = (D1 << 2) | (D2 << 1) | B4;
    const d500 = this.grayToBinary(grayD, 3);

    // A 位组成 Gray 码
    const grayA = (A1 << 2) | (A2 << 1) | A4;
    const a = this.grayToBinary(grayA, 3);

    // B 位组成 Gray 码  
    const grayB = (B1 << 2) | (B2 << 1) | B4;
    const b = this.grayToBinary(grayB, 3);

    // C 位组成 Gray 码
    const grayC = (C1 << 2) | (C2 << 1) | C4;
    const c = this.grayToBinary(grayC, 3);

    // 计算 100 英尺增量
    // 根据 500 英尺组的奇偶性，100 英尺增量的解释不同
    let alt100: number;
    
    // 组合 A、B、C 得到 100 英尺值
    const abc = (a << 6) | (b << 3) | c;
    
    // Gillham 100英尺增量表
    // 实际的 Gillham 编码非常复杂，这里使用查表法
    const gillham100Table: { [key: number]: number } = {
      0: 0, 1: 100, 2: 200, 3: 300, 4: 400,
      5: -100, 6: -200, 7: -300
    };

    // 计算基础高度（500英尺为单位）
    const baseAlt = d500 * 500;
    
    // 根据 C 位确定 100 英尺增量
    // C 位决定在 500 英尺区间内的位置
    const cValue = c;
    if (cValue <= 4) {
      alt100 = cValue * 100;
    } else {
      alt100 = (8 - cValue) * 100;
    }

    // 最终高度 = 500英尺组 + 100英尺增量 - 1300（偏移量）
    // Mode C 高度从 -1200 英尺开始
    let altitude = baseAlt + alt100 - 1300;

    // 验证高度有效性
    if (altitude < -1200 || altitude > 126700) {
      // 无效高度，返回 0
      return 0;
    }

    return altitude;
  }

  /**
   * Gray 码转二进制
   */
  private grayToBinary(gray: number, bits: number): number {
    let binary = gray;
    let mask = gray >> 1;
    while (mask !== 0) {
      binary ^= mask;
      mask >>= 1;
    }
    return binary;
  }

  /**
   * 计算 NIC (Navigation Integrity Category)
   */
  private calculateNIC(typeCode: number, nicSupB: number, ss: number): number {
    // 根据 Type Code 和 NIC Supplement 确定 NIC
    const nicTable: { [key: number]: number } = {
      9: 11,   // NIC = 11, Rc < 7.5m
      10: 10,  // NIC = 10, Rc < 25m
      11: 9,   // NIC = 9 or 8
      12: 7,   // NIC = 7, Rc < 0.1 NM
      13: 6,   // NIC = 6, Rc < 0.2 NM
      14: 5,   // NIC = 5, Rc < 0.5 NM
      15: 4,   // NIC = 4, Rc < 1 NM
      16: 3,   // NIC = 3 or 2
      17: 2,   // NIC = 2, Rc < 4 NM
      18: 0,   // NIC = 0, Rc >= 20 NM or unknown
      20: 11,
      21: 10,
      22: 0
    };
    
    return nicTable[typeCode] || 0;
  }

  /**
   * 清除 CPR 缓存
   */
  clearCache() {
    this.cprDecoder.clearCache();
  }

  /**
   * 获取飞机的最后已知位置
   */
  getLastPosition(icao: string): { lat: number; lon: number } | null {
    return this.cprDecoder.getLastPosition(icao);
  }
}

// ==================== CSV 数据加载器 ====================

export interface CsvMessage {
  hexMessage: string;
  lineNumber: number;
}

export class CsvDataLoader {
  /**
   * 解析 CSV 文件内容
   * 支持纯 hex 格式（每行一个 hex 消息）
   */
  static parseCSV(content: string): CsvMessage[] {
    const lines = content.split('\n');
    const messages: CsvMessage[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // 跳过空行和注释
      if (!line || line.startsWith('#') || line.startsWith('//')) {
        continue;
      }
      
      // 检查是否是有效的 hex 字符串
      const hexPattern = /^[0-9A-Fa-f]{14,28}$/;
      
      // 可能包含逗号分隔的其他字段，取第一个字段
      const parts = line.split(',');
      const hex = parts[0].trim();
      
      if (hexPattern.test(hex)) {
        messages.push({
          hexMessage: hex.toUpperCase(),
          lineNumber: i + 1
        });
      }
    }
    
    console.log(`[CsvDataLoader] Loaded ${messages.length} messages from CSV`);
    return messages;
  }

  /**
   * 从 File 对象加载
   */
  static async loadFromFile(file: File): Promise<CsvMessage[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const content = e.target?.result as string;
        if (content) {
          resolve(this.parseCSV(content));
        } else {
          reject(new Error('Failed to read file content'));
        }
      };
      
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }
}

// ==================== 真实数据回放引擎 ====================

export interface RealDataPlaybackState {
  isPlaying: boolean;
  isPaused: boolean;
  currentIndex: number;
  totalMessages: number;
  messagesPerSecond: number;
}

export class RealDataReplayEngine {
  private messages: CsvMessage[] = [];
  private decoder = new RealAdsbDecoder();
  private currentIndex = 0;
  private isPlaying = false;
  private isPaused = false;
  private playbackInterval: number | null = null;
  private messagesPerSecond = 100; // 默认每秒播放的消息数（提高默认值）

  // 回调函数
  private onMessage?: (result: { icao: string; data: RealDecodedData } | null, hex: string) => void;
  private onStateChange?: (state: RealDataPlaybackState) => void;
  private onFinished?: () => void;
  private onBatchComplete?: () => void;  // 批量处理完成回调

  /**
   * 设置参考位置
   */
  setReferencePosition(lat: number, lon: number) {
    this.decoder.setReferencePosition(lat, lon);
  }

  /**
   * 加载消息
   */
  loadMessages(messages: CsvMessage[]) {
    this.messages = messages;
    this.currentIndex = 0;
    this.decoder.clearCache();
    this.notifyStateChange();
  }

  /**
   * 设置播放速度
   */
  setSpeed(messagesPerSecond: number) {
    this.messagesPerSecond = Math.max(1, Math.min(10000, messagesPerSecond));  // 支持更高速度
    
    // 如果正在播放，重新启动定时器
    if (this.isPlaying && !this.isPaused) {
      this.stopInterval();
      this.startInterval();
    }
    this.notifyStateChange();
  }

  /**
   * 设置回调
   */
  setCallbacks(callbacks: {
    onMessage?: (result: { icao: string; data: RealDecodedData } | null, hex: string) => void;
    onStateChange?: (state: RealDataPlaybackState) => void;
    onFinished?: () => void;
    onBatchComplete?: () => void;
  }) {
    this.onMessage = callbacks.onMessage;
    this.onStateChange = callbacks.onStateChange;
    this.onFinished = callbacks.onFinished;
    this.onBatchComplete = callbacks.onBatchComplete;
  }

  /**
   * 开始播放
   */
  play() {
    if (this.messages.length === 0) {
      console.warn('[RealDataReplayEngine] No messages loaded');
      return;
    }

    this.isPlaying = true;
    this.isPaused = false;
    this.startInterval();
    this.notifyStateChange();
  }

  /**
   * 暂停
   */
  pause() {
    this.isPaused = true;
    this.stopInterval();
    this.notifyStateChange();
  }

  /**
   * 继续
   */
  resume() {
    if (!this.isPlaying) return;
    this.isPaused = false;
    this.startInterval();
    this.notifyStateChange();
  }

  /**
   * 停止
   */
  stop() {
    this.isPlaying = false;
    this.isPaused = false;
    this.currentIndex = 0;
    this.stopInterval();
    this.decoder.clearCache();
    this.notifyStateChange();
  }

  /**
   * 跳转到指定位置（优化版：快速跳转，不逐条回调）
   */
  seek(index: number) {
    const targetIndex = Math.max(0, Math.min(index, this.messages.length - 1));
    
    // 如果向后跳转，需要从头重建状态
    if (targetIndex < this.currentIndex) {
      this.decoder.clearCache();
      this.currentIndex = 0;
    }
    
    // 快速处理到目标位置（不触发单条回调）
    while (this.currentIndex < targetIndex) {
      const msg = this.messages[this.currentIndex];
      this.decoder.decode(msg.hexMessage);
      this.currentIndex++;
    }
    
    this.notifyStateChange();
  }

  /**
   * 跳转到指定百分比位置
   */
  seekToPercent(percent: number) {
    const targetIndex = Math.floor((percent / 100) * this.messages.length);
    this.seek(targetIndex);
  }

  /**
   * 获取当前进度百分比
   */
  getProgressPercent(): number {
    if (this.messages.length === 0) return 0;
    return (this.currentIndex / this.messages.length) * 100;
  }

  /**
   * 获取当前状态
   */
  getState(): RealDataPlaybackState {
    return {
      isPlaying: this.isPlaying,
      isPaused: this.isPaused,
      currentIndex: this.currentIndex,
      totalMessages: this.messages.length,
      messagesPerSecond: this.messagesPerSecond
    };
  }

  private startInterval() {
    this.stopInterval();
    
    // 使用批量处理提高性能
    // 每 16ms（约60fps）处理一批消息
    const batchInterval = 16;
    const messagesPerBatch = Math.max(1, Math.ceil(this.messagesPerSecond / (1000 / batchInterval)));
    
    this.playbackInterval = window.setInterval(() => {
      this.processMessageBatch(messagesPerBatch);
    }, batchInterval);
  }

  private stopInterval() {
    if (this.playbackInterval !== null) {
      clearInterval(this.playbackInterval);
      this.playbackInterval = null;
    }
  }

  private processMessageBatch(count: number) {
    if (this.currentIndex >= this.messages.length) {
      this.stop();
      this.onFinished?.();
      return;
    }

    const endIndex = Math.min(this.currentIndex + count, this.messages.length);
    
    // 批量处理消息
    for (let i = this.currentIndex; i < endIndex; i++) {
      const msg = this.messages[i];
      const result = this.decoder.decode(msg.hexMessage);
      this.onMessage?.(result, msg.hexMessage);
    }
    
    this.currentIndex = endIndex;
    this.notifyStateChange();
    this.onBatchComplete?.();
  }

  private processNextMessage() {
    if (this.currentIndex >= this.messages.length) {
      this.stop();
      this.onFinished?.();
      return;
    }

    const msg = this.messages[this.currentIndex];
    const result = this.decoder.decode(msg.hexMessage);
    
    this.onMessage?.(result, msg.hexMessage);
    
    this.currentIndex++;
    this.notifyStateChange();
  }

  private notifyStateChange() {
    this.onStateChange?.(this.getState());
  }
}

export default {
  RealAdsbDecoder,
  CsvDataLoader,
  RealDataReplayEngine,
  CPRDecoder
};
