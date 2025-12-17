use serde::{Deserialize, Serialize};
use std::f64::consts::PI;

/// 飞机数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Aircraft {
    pub id: String,           // ICAO 地址
    pub callsign: String,     // 航班号
    pub lat: f64,             // 纬度
    pub lng: f64,             // 经度
    pub altitude: f64,        // 高度 (ft)
    pub speed: f64,           // 速度 (kts)
    pub heading: f64,         // 航向 (度)
    pub nic: u8,              // GNSS 质量 (0-11)
}

/// ADS-B 消息事件
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdsbEvent {
    pub hex_message: String,
    pub aircraft_id: String,
    pub message_type: String, // "position" or "velocity"
}

/// ADS-B 信号模拟器
pub struct AdsbSimulator {
    aircrafts: Vec<Aircraft>,
    center_lat: f64,
    center_lng: f64,
}

impl AdsbSimulator {
    pub fn new(center_lat: f64, center_lng: f64) -> Self {
        AdsbSimulator {
            aircrafts: Vec::new(),
            center_lat,
            center_lng,
        }
    }

    /// 生成模拟飞机
    pub fn generate_mock_aircrafts(&mut self, count: usize) {
        self.aircrafts.clear();
        
        // 航空公司前缀
        let airlines = ["CZ", "CA", "MU", "BZ", "FM", "ZH", "HU", "SC", "3U", "GS"];
        
        // 使用伪随机种子生成飞机位置（基于索引的确定性随机）
        for i in 0..count {
            // 使用黄金分割角度确保均匀分布，避免螺旋
            let golden_angle = PI * (3.0 - (5.0_f64).sqrt()); // ≈ 137.5°
            let angle = (i as f64) * golden_angle;
            
            // 随机化距离（使用伪随机方式）
            let seed = (i * 7919 + 104729) % 10000; // 质数伪随机
            let distance = 0.15 + (seed as f64 / 10000.0) * 0.45; // 0.15-0.6 度范围
            
            let lat = self.center_lat + distance * angle.sin();
            let lng = self.center_lng + distance * angle.cos();
            
            // 随机生成航班号
            let airline = airlines[i % airlines.len()];
            let flight_num = 1000 + (i * 111) % 9000;
            let callsign = format!("{}{}", airline, flight_num);
            
            // 随机 ICAO 地址
            let icao = format!("{:06X}", 0x780000 + i * 0x1111);
            
            // 航向基于位置指向或离开中心，更真实
            let seed2 = (i * 6997 + 99991) % 360;
            let heading = seed2 as f64; // 伪随机航向
            
            let aircraft = Aircraft {
                id: icao,
                callsign,
                lat,
                lng,
                altitude: 5000.0 + ((i * 2749) % 10000) as f64, // 伪随机高度
                speed: 400.0 + ((i * 3571) % 250) as f64,       // 伪随机速度
                heading,
                nic: (5 + i % 7) as u8, // NIC 5-11
            };
            
            self.aircrafts.push(aircraft);
        }
    }

    /// 更新飞机位置
    pub fn update_positions(&mut self) {
        for aircraft in &mut self.aircrafts {
            // 根据速度和航向更新位置
            // 速度单位：km/h，转换为度/秒（简化计算）
            // 1度纬度 ≈ 111km，所以 speed(km/h) / 3600 / 111 ≈ degree/s
            let speed_deg_per_sec = aircraft.speed / 3600.0 / 111.0;
            
            // 航向角转数学角度：航向0度=正北=数学90度
            // 数学角度 = 90 - 航向角
            let math_rad = (90.0 - aircraft.heading) * PI / 180.0;
            
            // 使用正确的三角函数：
            // lat (南北) 使用 sin，lng (东西) 使用 cos
            aircraft.lat += speed_deg_per_sec * math_rad.sin();
            aircraft.lng += speed_deg_per_sec * math_rad.cos();
            
            // 随机微调 NIC (GNSS 质量波动)
            if rand_simple() > 0.9 {
                let nic_change = rand_range(-1, 1) as i8;
                let new_nic = (aircraft.nic as i8 + nic_change).clamp(0, 11);
                aircraft.nic = new_nic as u8;
            }
            
            // 保持高度稳定，只有小幅波动
            aircraft.altitude += rand_range(-20, 20) as f64;
            aircraft.altitude = aircraft.altitude.clamp(3000.0, 12000.0);
            
            // 航向小幅微调（模拟轻微转弯）
            aircraft.heading += rand_range(-1, 1) as f64;
            aircraft.heading = (aircraft.heading + 360.0) % 360.0;
        }
    }

    /// 获取所有飞机数据
    pub fn get_aircrafts(&self) -> &Vec<Aircraft> {
        &self.aircrafts
    }

    /// 生成位置消息 (DF17 Type 11)
    pub fn generate_position_message(aircraft: &Aircraft) -> String {
        let df: u8 = 17;
        let ca: u8 = 5;
        let icao_int = u32::from_str_radix(&aircraft.id, 16).unwrap_or(0);
        
        let type_code: u64 = 11;
        let nic_encoded = (aircraft.nic & 0xF) as u64;
        let alt_encoded = (((aircraft.altitude + 1000.0) / 25.0) as u64) & 0xFFF;
        let lat_encoded = (((aircraft.lat + 90.0) / 180.0) * 131071.0) as u64 & 0x1FFFF;
        let lng_encoded = (((aircraft.lng + 180.0) / 360.0) * 131071.0) as u64 & 0x1FFFF;
        
        let mut payload: u64 = 0;
        payload |= type_code << 51;
        payload |= nic_encoded << 47;
        payload |= alt_encoded << 35;
        payload |= lat_encoded << 16;
        payload |= lng_encoded;
        
        assemble_message(df, ca, icao_int, payload)
    }

    /// 生成速度消息 (DF17 Type 19)
    pub fn generate_velocity_message(aircraft: &Aircraft) -> String {
        let df: u8 = 17;
        let ca: u8 = 5;
        let icao_int = u32::from_str_radix(&aircraft.id, 16).unwrap_or(0);
        
        let type_code: u64 = 19;
        let sub_type: u64 = 1;
        let speed_encoded = (aircraft.speed as u64) & 0x3FF;
        let heading_encoded = ((aircraft.heading / 360.0) * 127.0) as u64 & 0x7F;
        
        let mut payload: u64 = 0;
        payload |= type_code << 51;
        payload |= sub_type << 48;
        payload |= speed_encoded << 30;
        payload |= heading_encoded << 20;
        
        assemble_message(df, ca, icao_int, payload)
    }

    /// 生成所有飞机的 ADS-B 消息
    pub fn generate_all_messages(&self) -> Vec<AdsbEvent> {
        let mut events = Vec::new();
        
        for aircraft in &self.aircrafts {
            // 位置消息
            events.push(AdsbEvent {
                hex_message: Self::generate_position_message(aircraft),
                aircraft_id: aircraft.id.clone(),
                message_type: "position".to_string(),
            });
            
            // 速度消息
            events.push(AdsbEvent {
                hex_message: Self::generate_velocity_message(aircraft),
                aircraft_id: aircraft.id.clone(),
                message_type: "velocity".to_string(),
            });
        }
        
        events
    }
}

/// 组装 ADS-B 消息
fn assemble_message(df: u8, ca: u8, icao: u32, payload: u64) -> String {
    // 112 bits total: DF(5) + CA(3) + ICAO(24) + Payload(56) + PI(24)
    let mut msg: u128 = 0;
    msg |= (df as u128) << 107;
    msg |= (ca as u128) << 104;
    msg |= (icao as u128) << 80;
    msg |= (payload as u128) << 24;
    msg |= 0xA5A5A5; // 简化的校验码
    
    format!("{:028X}", msg)
}

/// 简单随机数生成（不依赖外部库）
fn rand_simple() -> f64 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .subsec_nanos();
    (nanos % 1000) as f64 / 1000.0
}

fn rand_range(min: i32, max: i32) -> i32 {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .subsec_nanos() as i32;
    min + (nanos.abs() % (max - min + 1))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_simulator() {
        let mut sim = AdsbSimulator::new(22.5431, 114.0579);
        sim.generate_mock_aircrafts(5);
        
        assert_eq!(sim.get_aircrafts().len(), 5);
        
        let messages = sim.generate_all_messages();
        assert_eq!(messages.len(), 10); // 5 飞机 * 2 消息类型
    }
}
