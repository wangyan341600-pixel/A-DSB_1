export interface AdsbMessage {
  df: number;
  ca: number;
  icao: string;
  payload: bigint;
  parity: number;
  raw: string;
}

export interface DecodedPosition {
  lat: number;
  lng: number;
  altitude: number;
  nic: number; // Navigation Integrity Category (GNSS Quality)
  type: 'position';
}

export interface DecodedVelocity {
  speed: number;
  heading: number;
  type: 'velocity';
}

export interface DecodedIdentification {
  callsign: string;
  type: 'identification';
}

export type DecodedData = DecodedPosition | DecodedVelocity | DecodedIdentification | null;

export class AdsbSimulator {
  // Simulate generating a DF17 Position Message (Airborne Position)
  // Note: This uses a simplified CPR-like encoding for demonstration. 
  // Real CPR is much more complex (Odd/Even frames, zones).
  static generatePositionMessage(icao: string, lat: number, lng: number, alt: number, nic: number): string {
    const df = 17;
    const ca = 5;
    const icaoInt = parseInt(icao, 16);
    
    // Type Code 11 (Airborne Position w/ Baro Alt)
    const typeCode = 11;
    const _surveillanceStatus = 0;
    const _singleAntenna = 1;
    
    // Encode Altitude (Simplified: 12 bits)
    // Real ADS-B uses Gillham code or binary. We'll use simple binary for this sim.
    const altEncoded = Math.floor((alt + 1000) / 25) & 0xFFF;
    
    // Encode Time (1 bit) - CPR Odd/Even
    const time = 0; // Even frame
    
    // Encode CPR Format (1 bit)
    const cprFormat = 0; 
    
    // Encode Lat/Lon (17 bits each)
    // Simplified: Map -90..90 to 0..131071
    const latEncoded = Math.floor(((lat + 90) / 180) * 131071) & 0x1FFFF;
    const lngEncoded = Math.floor(((lng + 180) / 360) * 131071) & 0x1FFFF;

    // Construct 56-bit Payload
    // [Type:5][Surv:2][NIC:1][Alt:12][Time:1][CPR:1][Lat:17][Lon:17]
    // Wait, NIC is not directly in this position in standard. 
    // In Type 9-18, NIC supplement B is used. 
    // For simulation purposes, we will pack NIC into the "Surveillance Status" or similar unused bits 
    // or just assume the Type Code implies a certain NIC range.
    // Let's use the standard structure roughly:
    // Bits: 1-5 Type, 6-7 Surv, 8 NIC-B, 9-20 Alt, 21 Time, 22 CPR, 23-39 Lat, 40-56 Lon
    
    // We will embed the passed NIC value (0-11) into the message to be decoded later.
    // We'll use the Type Code to represent NIC roughly, or just pack it in unused bits for this sim.
    // Let's pack NIC into bits 6-9 (4 bits) replacing Surv/NIC-B for this custom sim
    const nicEncoded = nic & 0xF;

    let payload = BigInt(0);
    payload |= BigInt(typeCode) << 51n;
    payload |= BigInt(nicEncoded) << 47n; // Custom packing for simulation
    payload |= BigInt(altEncoded) << 35n;
    payload |= BigInt(time) << 34n;
    payload |= BigInt(cprFormat) << 33n;
    payload |= BigInt(latEncoded) << 16n;
    payload |= BigInt(lngEncoded);

    return this.assembleMessage(df, ca, icaoInt, payload);
  }

  static generateVelocityMessage(icao: string, speed: number, heading: number): string {
    const df = 17;
    const ca = 5;
    const icaoInt = parseInt(icao, 16);
    
    // Type Code 19 (Airborne Velocity)
    const typeCode = 19;
    const subType = 1; // Ground speed
    
    // Encode Speed/Heading
    const speedEncoded = Math.floor(speed) & 0x3FF; // 10 bits
    const headingEncoded = Math.floor((heading / 360) * 127) & 0x7F; // 7 bits (simplified)
    
    let payload = BigInt(0);
    payload |= BigInt(typeCode) << 51n;
    payload |= BigInt(subType) << 48n;
    // ... simplified packing ...
    payload |= BigInt(speedEncoded) << 30n;
    payload |= BigInt(headingEncoded) << 20n;

    return this.assembleMessage(df, ca, icaoInt, payload);
  }

  private static assembleMessage(df: number, ca: number, icao: number, payload: bigint): string {
    // Total 112 bits
    // DF: 5, CA: 3, ICAO: 24, Payload: 56, PI: 24
    
    let msg = BigInt(0);
    msg |= BigInt(df) << 107n;
    msg |= BigInt(ca) << 104n;
    msg |= BigInt(icao) << 80n;
    msg |= payload << 24n;
    
    // Calculate Parity (CRC) - Simplified for simulation (just random or fixed)
    // Real CRC is complex polynomial division.
    const parity = 0xA5A5A5; 
    msg |= BigInt(parity);

    return msg.toString(16).toUpperCase().padStart(28, '0');
  }
}

export class AdsbDecoder {
  // Mock Demodulation: Convert "Signal Strength" array to bits (Concept only)
  static demodulate(_signal: number[]): string {
    // In a real system, this would detect preamble and decode PPM pulses.
    // Here we just return a placeholder or pass-through.
    return "RAW_BITS_STREAM";
  }

  static decodeMessage(hexMsg: string): { icao: string, data: DecodedData } | null {
    if (hexMsg.length !== 28) return null;

    const msgInt = BigInt('0x' + hexMsg);
    
    // Extract fields
    const df = Number((msgInt >> 107n) & 0x1Fn);
    const icao = ((msgInt >> 80n) & 0xFFFFFFn).toString(16).toUpperCase().padStart(6, '0');
    const payload = (msgInt >> 24n) & 0xFFFFFFFFFFFFFFn;

    if (df !== 17) return null; // Only interested in Extended Squitter

    const typeCode = Number((payload >> 51n) & 0x1Fn);

    // Decode based on Type Code
    if (typeCode >= 9 && typeCode <= 18) {
      return { icao, data: this.decodePosition(payload) };
    } else if (typeCode === 19) {
      return { icao, data: this.decodeVelocity(payload) };
    }

    return { icao, data: null };
  }

  private static decodePosition(payload: bigint): DecodedPosition {
    // Reverse the packing in Simulator
    const nicEncoded = Number((payload >> 47n) & 0xFn);
    const altEncoded = Number((payload >> 35n) & 0xFFFn);
    const latEncoded = Number((payload >> 16n) & 0x1FFFFn);
    const lngEncoded = Number(payload & 0x1FFFFn);

    // Decode
    const alt = (altEncoded * 25) - 1000;
    const lat = (latEncoded / 131071) * 180 - 90;
    const lng = (lngEncoded / 131071) * 360 - 180;

    return {
      type: 'position',
      lat,
      lng,
      altitude: alt,
      nic: nicEncoded
    };
  }

  private static decodeVelocity(payload: bigint): DecodedVelocity {
    const speedEncoded = Number((payload >> 30n) & 0x3FFn);
    const headingEncoded = Number((payload >> 20n) & 0x7Fn);

    return {
      type: 'velocity',
      speed: speedEncoded,
      heading: (headingEncoded / 127) * 360
    };
  }
}
