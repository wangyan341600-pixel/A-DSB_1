/**
 * 航空公司数据库
 * 
 * 根据 ICAO 航空公司代码（呼号前缀）识别航空公司
 * 包含全球主要航空公司，重点覆盖中国及亚太地区航空公司
 */

export interface AirlineInfo {
  icaoCode: string;      // ICAO 三字代码 (如 CCA, CSN)
  iataCode: string;      // IATA 二字代码 (如 CA, CZ)
  name: string;          // 航空公司名称
  nameEn: string;        // 英文名称
  country: string;       // 国家/地区
  callsignPrefix: string; // 无线电呼号前缀
}

// ==================== 航空公司数据库 ====================

export const airlineDatabase: Map<string, AirlineInfo> = new Map([
  // ==================== 中国大陆航空公司 ====================
  ['CCA', { icaoCode: 'CCA', iataCode: 'CA', name: '中国国际航空', nameEn: 'Air China', country: '中国', callsignPrefix: 'AIR CHINA' }],
  ['CSN', { icaoCode: 'CSN', iataCode: 'CZ', name: '中国南方航空', nameEn: 'China Southern Airlines', country: '中国', callsignPrefix: 'CHINA SOUTHERN' }],
  ['CES', { icaoCode: 'CES', iataCode: 'MU', name: '中国东方航空', nameEn: 'China Eastern Airlines', country: '中国', callsignPrefix: 'CHINA EASTERN' }],
  ['CHH', { icaoCode: 'CHH', iataCode: 'HU', name: '海南航空', nameEn: 'Hainan Airlines', country: '中国', callsignPrefix: 'HAINAN' }],
  ['CSZ', { icaoCode: 'CSZ', iataCode: 'ZH', name: '深圳航空', nameEn: 'Shenzhen Airlines', country: '中国', callsignPrefix: 'SHENZHEN AIR' }],
  ['CXA', { icaoCode: 'CXA', iataCode: 'MF', name: '厦门航空', nameEn: 'Xiamen Airlines', country: '中国', callsignPrefix: 'XIAMEN AIR' }],
  ['CSC', { icaoCode: 'CSC', iataCode: 'SZ', name: '山东航空', nameEn: 'Shandong Airlines', country: '中国', callsignPrefix: 'SHANDONG' }],
  ['CQH', { icaoCode: 'CQH', iataCode: 'QW', name: '青岛航空', nameEn: 'Qingdao Airlines', country: '中国', callsignPrefix: 'SKY LEGEND' }],
  ['CDC', { icaoCode: 'CDC', iataCode: 'EU', name: '成都航空', nameEn: 'Chengdu Airlines', country: '中国', callsignPrefix: 'CHENGDU' }],
  ['CUA', { icaoCode: 'CUA', iataCode: 'KN', name: '中国联合航空', nameEn: 'China United Airlines', country: '中国', callsignPrefix: 'LIANHANG' }],
  ['CBJ', { icaoCode: 'CBJ', iataCode: 'HX', name: '北京首都航空', nameEn: 'Capital Airlines', country: '中国', callsignPrefix: 'CAPITAL JET' }],
  ['GCR', { icaoCode: 'GCR', iataCode: 'G5', name: '华夏航空', nameEn: 'China Express Airlines', country: '中国', callsignPrefix: 'CHINA EXPRESS' }],
  ['SJO', { icaoCode: 'SJO', iataCode: 'PN', name: '西部航空', nameEn: 'West Air', country: '中国', callsignPrefix: 'WEST CHINA' }],
  ['LKE', { icaoCode: 'LKE', iataCode: 'LQ', name: '瑞丽航空', nameEn: 'Ruili Airlines', country: '中国', callsignPrefix: 'SEALAND' }],
  ['GDC', { icaoCode: 'GDC', iataCode: 'CN', name: '大新华航空', nameEn: 'Grand China Air', country: '中国', callsignPrefix: 'GRAND CHINA' }],
  ['CGH', { icaoCode: 'CGH', iataCode: 'O7', name: '桂林航空', nameEn: 'Guilin Airlines', country: '中国', callsignPrefix: 'WELKIN' }],
  ['JYH', { icaoCode: 'JYH', iataCode: 'JD', name: '首都航空', nameEn: 'Beijing Capital Airlines', country: '中国', callsignPrefix: 'CAPITAL JET' }],
  ['DKH', { icaoCode: 'DKH', iataCode: 'CN', name: '金鹏航空', nameEn: 'Juneyao Airlines', country: '中国', callsignPrefix: 'JUNEYAO' }],
  ['OKA', { icaoCode: 'OKA', iataCode: 'BK', name: '奥凯航空', nameEn: 'Okay Airways', country: '中国', callsignPrefix: 'OKAY JET' }],
  ['HBH', { icaoCode: 'HBH', iataCode: 'NS', name: '河北航空', nameEn: 'Hebei Airlines', country: '中国', callsignPrefix: 'HEBEI AIR' }],
  ['CHB', { icaoCode: 'CHB', iataCode: 'E5', name: '春秋航空', nameEn: 'Spring Airlines', country: '中国', callsignPrefix: 'AIR SPRING' }],
  ['CQN', { icaoCode: 'CQN', iataCode: 'OQ', name: '重庆航空', nameEn: 'Chongqing Airlines', country: '中国', callsignPrefix: 'CHONG QING' }],
  ['CLH', { icaoCode: 'CLH', iataCode: 'K6', name: '东海航空', nameEn: 'Donghai Airlines', country: '中国', callsignPrefix: 'DONGHAI AIR' }],
  ['KNA', { icaoCode: 'KNA', iataCode: 'Y8', name: '天津航空', nameEn: 'Tianjin Airlines', country: '中国', callsignPrefix: 'TIANJIN AIR' }],
  ['UEA', { icaoCode: 'UEA', iataCode: 'EU', name: '成都航空', nameEn: 'Chengdu Airlines', country: '中国', callsignPrefix: 'UNITED EAGLE' }],
  ['CYZ', { icaoCode: 'CYZ', iataCode: '8Y', name: '长安航空', nameEn: 'Chang\'an Airlines', country: '中国', callsignPrefix: 'CHANGAN' }],
  ['JXX', { icaoCode: 'JXX', iataCode: 'JX', name: '江西航空', nameEn: 'Jiangxi Air', country: '中国', callsignPrefix: 'AIR CRANE' }],
  ['CRL', { icaoCode: 'CRL', iataCode: 'A6', name: '多彩贵州航空', nameEn: 'Colorful Guizhou Airlines', country: '中国', callsignPrefix: 'COLORFUL' }],
  ['HXA', { icaoCode: 'HXA', iataCode: 'H4', name: '红土航空', nameEn: 'Hongtu Airlines', country: '中国', callsignPrefix: 'HONGTU' }],
  ['FZL', { icaoCode: 'FZL', iataCode: 'Y4', name: '福州航空', nameEn: 'Fuzhou Airlines', country: '中国', callsignPrefix: 'STRAIT AIR' }],
  ['LHA', { icaoCode: 'LHA', iataCode: 'GS', name: '龙江航空', nameEn: 'Longjiang Airlines', country: '中国', callsignPrefix: 'LONGJIANG' }],
  ['KXA', { icaoCode: 'KXA', iataCode: 'PN', name: '昆明航空', nameEn: 'Kunming Airlines', country: '中国', callsignPrefix: 'KUNMING AIR' }],
  ['UTP', { icaoCode: 'UTP', iataCode: 'UQ', name: '乌鲁木齐航空', nameEn: 'Urumqi Air', country: '中国', callsignPrefix: 'LOULAN' }],
  
  // ==================== 中国货运航空 ====================
  ['CAO', { icaoCode: 'CAO', iataCode: 'C8', name: '中国货运航空', nameEn: 'China Cargo Airlines', country: '中国', callsignPrefix: 'CARGO KING' }],
  ['CSS', { icaoCode: 'CSS', iataCode: '', name: '顺丰航空', nameEn: 'SF Airlines', country: '中国', callsignPrefix: 'SHUN FENG' }],
  ['CYZ', { icaoCode: 'CYZ', iataCode: 'O3', name: '圆通航空', nameEn: 'YTO Cargo Airlines', country: '中国', callsignPrefix: 'QUICK AIR' }],
  
  // ==================== 港澳台航空公司 ====================
  ['CPA', { icaoCode: 'CPA', iataCode: 'CX', name: '国泰航空', nameEn: 'Cathay Pacific', country: '香港', callsignPrefix: 'CATHAY' }],
  ['CRK', { icaoCode: 'CRK', iataCode: 'KA', name: '港龙航空', nameEn: 'Cathay Dragon', country: '香港', callsignPrefix: 'DRAGON' }],
  ['HKE', { icaoCode: 'HKE', iataCode: 'HX', name: '香港快运', nameEn: 'HK Express', country: '香港', callsignPrefix: 'HONGKONG SHUTTLE' }],
  ['HDA', { icaoCode: 'HDA', iataCode: 'UO', name: '香港航空', nameEn: 'Hong Kong Airlines', country: '香港', callsignPrefix: 'BAUHINIA' }],
  ['AHK', { icaoCode: 'AHK', iataCode: 'LD', name: '香港华民航空', nameEn: 'Air Hong Kong', country: '香港', callsignPrefix: 'AIR HONGKONG' }],
  ['CAL', { icaoCode: 'CAL', iataCode: 'CI', name: '中华航空', nameEn: 'China Airlines', country: '台湾', callsignPrefix: 'DYNASTY' }],
  ['EVA', { icaoCode: 'EVA', iataCode: 'BR', name: '长荣航空', nameEn: 'EVA Air', country: '台湾', callsignPrefix: 'EVA' }],
  ['TTW', { icaoCode: 'TTW', iataCode: 'IT', name: '台湾虎航', nameEn: 'Tigerair Taiwan', country: '台湾', callsignPrefix: 'SMART CAT' }],
  ['MDA', { icaoCode: 'MDA', iataCode: 'AE', name: '华信航空', nameEn: 'Mandarin Airlines', country: '台湾', callsignPrefix: 'MANDARIN' }],
  ['SJX', { icaoCode: 'SJX', iataCode: 'JX', name: '星宇航空', nameEn: 'Starlux Airlines', country: '台湾', callsignPrefix: 'STARWALKER' }],
  ['AMU', { icaoCode: 'AMU', iataCode: 'NX', name: '澳门航空', nameEn: 'Air Macau', country: '澳门', callsignPrefix: 'AIR MACAU' }],
  
  // ==================== 亚洲主要航空公司 ====================
  // 日本
  ['JAL', { icaoCode: 'JAL', iataCode: 'JL', name: '日本航空', nameEn: 'Japan Airlines', country: '日本', callsignPrefix: 'JAPANAIR' }],
  ['ANA', { icaoCode: 'ANA', iataCode: 'NH', name: '全日空', nameEn: 'All Nippon Airways', country: '日本', callsignPrefix: 'ALL NIPPON' }],
  ['APJ', { icaoCode: 'APJ', iataCode: 'MM', name: '乐桃航空', nameEn: 'Peach Aviation', country: '日本', callsignPrefix: 'AIR PEACH' }],
  ['JJP', { icaoCode: 'JJP', iataCode: 'GK', name: '捷星日本', nameEn: 'Jetstar Japan', country: '日本', callsignPrefix: 'ORANGE LINER' }],
  ['SJO', { icaoCode: 'SJO', iataCode: '7G', name: '星悦航空', nameEn: 'StarFlyer', country: '日本', callsignPrefix: 'STARFLYER' }],
  ['SKY', { icaoCode: 'SKY', iataCode: 'BC', name: '天马航空', nameEn: 'Skymark Airlines', country: '日本', callsignPrefix: 'SKYMARK' }],
  ['SNJ', { icaoCode: 'SNJ', iataCode: '7C', name: '日本春秋航空', nameEn: 'Spring Airlines Japan', country: '日本', callsignPrefix: 'J-SPRING' }],
  
  // 韩国
  ['KAL', { icaoCode: 'KAL', iataCode: 'KE', name: '大韩航空', nameEn: 'Korean Air', country: '韩国', callsignPrefix: 'KOREANAIR' }],
  ['AAR', { icaoCode: 'AAR', iataCode: 'OZ', name: '韩亚航空', nameEn: 'Asiana Airlines', country: '韩国', callsignPrefix: 'ASIANA' }],
  ['JNA', { icaoCode: 'JNA', iataCode: 'LJ', name: '真航空', nameEn: 'Jin Air', country: '韩国', callsignPrefix: 'JIN AIR' }],
  ['JJA', { icaoCode: 'JJA', iataCode: '7C', name: '济州航空', nameEn: 'Jeju Air', country: '韩国', callsignPrefix: 'JEJU AIR' }],
  ['TWB', { icaoCode: 'TWB', iataCode: 'TW', name: '德威航空', nameEn: 'T\'way Air', country: '韩国', callsignPrefix: 'TWAY AIR' }],
  ['ESR', { icaoCode: 'ESR', iataCode: 'ZE', name: '易斯达航空', nameEn: 'Eastar Jet', country: '韩国', callsignPrefix: 'EASTAR' }],
  ['ABL', { icaoCode: 'ABL', iataCode: 'BX', name: '釜山航空', nameEn: 'Air Busan', country: '韩国', callsignPrefix: 'AIR BUSAN' }],
  
  // 新加坡
  ['SIA', { icaoCode: 'SIA', iataCode: 'SQ', name: '新加坡航空', nameEn: 'Singapore Airlines', country: '新加坡', callsignPrefix: 'SINGAPORE' }],
  ['SLK', { icaoCode: 'SLK', iataCode: 'MI', name: '胜安航空', nameEn: 'SilkAir', country: '新加坡', callsignPrefix: 'SILKAIR' }],
  ['TGW', { icaoCode: 'TGW', iataCode: 'TR', name: '酷航', nameEn: 'Scoot', country: '新加坡', callsignPrefix: 'SCOOTER' }],
  
  // 马来西亚
  ['MAS', { icaoCode: 'MAS', iataCode: 'MH', name: '马来西亚航空', nameEn: 'Malaysia Airlines', country: '马来西亚', callsignPrefix: 'MALAYSIAN' }],
  ['AXM', { icaoCode: 'AXM', iataCode: 'AK', name: '亚洲航空', nameEn: 'AirAsia', country: '马来西亚', callsignPrefix: 'ASIASTAR' }],
  ['XAX', { icaoCode: 'XAX', iataCode: 'D7', name: '亚航X', nameEn: 'AirAsia X', country: '马来西亚', callsignPrefix: 'XANADU' }],
  ['MXD', { icaoCode: 'MXD', iataCode: 'OD', name: '马印航空', nameEn: 'Malindo Air', country: '马来西亚', callsignPrefix: 'MALINDO' }],
  
  // 泰国
  ['THA', { icaoCode: 'THA', iataCode: 'TG', name: '泰国国际航空', nameEn: 'Thai Airways', country: '泰国', callsignPrefix: 'THAI' }],
  ['TAX', { icaoCode: 'TAX', iataCode: 'XJ', name: '泰国亚洲航空X', nameEn: 'Thai AirAsia X', country: '泰国', callsignPrefix: 'EXPRESS WING' }],
  ['AIQ', { icaoCode: 'AIQ', iataCode: 'FD', name: '泰国亚洲航空', nameEn: 'Thai AirAsia', country: '泰国', callsignPrefix: 'THAI ASIA' }],
  ['TLM', { icaoCode: 'TLM', iataCode: 'SL', name: '泰狮航', nameEn: 'Thai Lion Air', country: '泰国', callsignPrefix: 'MENTARI' }],
  ['NOK', { icaoCode: 'NOK', iataCode: 'DD', name: '飞鸟航空', nameEn: 'Nok Air', country: '泰国', callsignPrefix: 'NOK AIR' }],
  ['BKP', { icaoCode: 'BKP', iataCode: 'PG', name: '曼谷航空', nameEn: 'Bangkok Airways', country: '泰国', callsignPrefix: 'BANGKOK AIR' }],
  
  // 越南
  ['HVN', { icaoCode: 'HVN', iataCode: 'VN', name: '越南航空', nameEn: 'Vietnam Airlines', country: '越南', callsignPrefix: 'VIETNAM' }],
  ['PIC', { icaoCode: 'PIC', iataCode: 'BL', name: '太平洋航空', nameEn: 'Pacific Airlines', country: '越南', callsignPrefix: 'BLUE PACIFIC' }],
  ['VJC', { icaoCode: 'VJC', iataCode: 'VJ', name: '越捷航空', nameEn: 'VietJet Air', country: '越南', callsignPrefix: 'VIETJET' }],
  ['BAV', { icaoCode: 'BAV', iataCode: 'QH', name: '竹航空', nameEn: 'Bamboo Airways', country: '越南', callsignPrefix: 'BAMBOO' }],
  
  // 菲律宾
  ['PAL', { icaoCode: 'PAL', iataCode: 'PR', name: '菲律宾航空', nameEn: 'Philippine Airlines', country: '菲律宾', callsignPrefix: 'PHILIPPINE' }],
  ['CEB', { icaoCode: 'CEB', iataCode: '5J', name: '宿务太平洋航空', nameEn: 'Cebu Pacific', country: '菲律宾', callsignPrefix: 'CEBU' }],
  ['APG', { icaoCode: 'APG', iataCode: 'Z2', name: '菲亚航', nameEn: 'AirAsia Philippines', country: '菲律宾', callsignPrefix: 'ZEST' }],
  
  // 印度尼西亚
  ['GIA', { icaoCode: 'GIA', iataCode: 'GA', name: '印尼鹰航', nameEn: 'Garuda Indonesia', country: '印度尼西亚', callsignPrefix: 'INDONESIA' }],
  ['LNI', { icaoCode: 'LNI', iataCode: 'JT', name: '狮子航空', nameEn: 'Lion Air', country: '印度尼西亚', callsignPrefix: 'LION INTER' }],
  ['BTK', { icaoCode: 'BTK', iataCode: 'ID', name: '巴泽航空', nameEn: 'Batik Air', country: '印度尼西亚', callsignPrefix: 'BATIK' }],
  ['AWQ', { icaoCode: 'AWQ', iataCode: 'QZ', name: '印尼亚航', nameEn: 'Indonesia AirAsia', country: '印度尼西亚', callsignPrefix: 'WAGON AIR' }],
  
  // 印度
  ['AIC', { icaoCode: 'AIC', iataCode: 'AI', name: '印度航空', nameEn: 'Air India', country: '印度', callsignPrefix: 'AIR INDIA' }],
  ['IGO', { icaoCode: 'IGO', iataCode: '6E', name: '靛蓝航空', nameEn: 'IndiGo', country: '印度', callsignPrefix: 'IFLY' }],
  ['JAI', { icaoCode: 'JAI', iataCode: '9W', name: '捷特航空', nameEn: 'Jet Airways', country: '印度', callsignPrefix: 'JET AIRWAYS' }],
  ['SEJ', { icaoCode: 'SEJ', iataCode: 'SG', name: '香料航空', nameEn: 'SpiceJet', country: '印度', callsignPrefix: 'SPICEJET' }],
  ['GOW', { icaoCode: 'GOW', iataCode: 'G8', name: '印度捷航', nameEn: 'GoAir', country: '印度', callsignPrefix: 'GOAIR' }],
  ['VTI', { icaoCode: 'VTI', iataCode: 'UK', name: 'Vistara', nameEn: 'Vistara', country: '印度', callsignPrefix: 'VISTARA' }],
  
  // ==================== 中东航空公司 ====================
  ['UAE', { icaoCode: 'UAE', iataCode: 'EK', name: '阿联酋航空', nameEn: 'Emirates', country: '阿联酋', callsignPrefix: 'EMIRATES' }],
  ['ETD', { icaoCode: 'ETD', iataCode: 'EY', name: '阿提哈德航空', nameEn: 'Etihad Airways', country: '阿联酋', callsignPrefix: 'ETIHAD' }],
  ['QTR', { icaoCode: 'QTR', iataCode: 'QR', name: '卡塔尔航空', nameEn: 'Qatar Airways', country: '卡塔尔', callsignPrefix: 'QATARI' }],
  ['SVA', { icaoCode: 'SVA', iataCode: 'SV', name: '沙特阿拉伯航空', nameEn: 'Saudi Arabian Airlines', country: '沙特阿拉伯', callsignPrefix: 'SAUDIA' }],
  ['GFA', { icaoCode: 'GFA', iataCode: 'GF', name: '海湾航空', nameEn: 'Gulf Air', country: '巴林', callsignPrefix: 'GULF AIR' }],
  ['OMA', { icaoCode: 'OMA', iataCode: 'WY', name: '阿曼航空', nameEn: 'Oman Air', country: '阿曼', callsignPrefix: 'OMAN AIR' }],
  ['MEA', { icaoCode: 'MEA', iataCode: 'ME', name: '中东航空', nameEn: 'Middle East Airlines', country: '黎巴嫩', callsignPrefix: 'CEDAR JET' }],
  ['ELY', { icaoCode: 'ELY', iataCode: 'LY', name: '以色列航空', nameEn: 'El Al', country: '以色列', callsignPrefix: 'ELAL' }],
  ['THY', { icaoCode: 'THY', iataCode: 'TK', name: '土耳其航空', nameEn: 'Turkish Airlines', country: '土耳其', callsignPrefix: 'TURKISH' }],
  ['PGT', { icaoCode: 'PGT', iataCode: 'PC', name: '飞马航空', nameEn: 'Pegasus Airlines', country: '土耳其', callsignPrefix: 'SUNTURK' }],
  
  // ==================== 欧洲航空公司 ====================
  ['BAW', { icaoCode: 'BAW', iataCode: 'BA', name: '英国航空', nameEn: 'British Airways', country: '英国', callsignPrefix: 'SPEEDBIRD' }],
  ['VIR', { icaoCode: 'VIR', iataCode: 'VS', name: '维珍大西洋', nameEn: 'Virgin Atlantic', country: '英国', callsignPrefix: 'VIRGIN' }],
  ['EZY', { icaoCode: 'EZY', iataCode: 'U2', name: '易捷航空', nameEn: 'easyJet', country: '英国', callsignPrefix: 'EASY' }],
  ['AFR', { icaoCode: 'AFR', iataCode: 'AF', name: '法国航空', nameEn: 'Air France', country: '法国', callsignPrefix: 'AIRFRANS' }],
  ['DLH', { icaoCode: 'DLH', iataCode: 'LH', name: '汉莎航空', nameEn: 'Lufthansa', country: '德国', callsignPrefix: 'LUFTHANSA' }],
  ['EWG', { icaoCode: 'EWG', iataCode: '4U', name: '欧洲之翼', nameEn: 'Eurowings', country: '德国', callsignPrefix: 'EUROWINGS' }],
  ['SWR', { icaoCode: 'SWR', iataCode: 'LX', name: '瑞士航空', nameEn: 'Swiss International Air Lines', country: '瑞士', callsignPrefix: 'SWISS' }],
  ['AUA', { icaoCode: 'AUA', iataCode: 'OS', name: '奥地利航空', nameEn: 'Austrian Airlines', country: '奥地利', callsignPrefix: 'AUSTRIAN' }],
  ['KLM', { icaoCode: 'KLM', iataCode: 'KL', name: '荷兰皇家航空', nameEn: 'KLM Royal Dutch Airlines', country: '荷兰', callsignPrefix: 'KLM' }],
  ['IBE', { icaoCode: 'IBE', iataCode: 'IB', name: '西班牙国家航空', nameEn: 'Iberia', country: '西班牙', callsignPrefix: 'IBERIA' }],
  ['VLG', { icaoCode: 'VLG', iataCode: 'VY', name: '伏林航空', nameEn: 'Vueling', country: '西班牙', callsignPrefix: 'VUELING' }],
  ['TAP', { icaoCode: 'TAP', iataCode: 'TP', name: '葡萄牙航空', nameEn: 'TAP Air Portugal', country: '葡萄牙', callsignPrefix: 'AIR PORTUGAL' }],
  ['AZA', { icaoCode: 'AZA', iataCode: 'AZ', name: '意大利航空', nameEn: 'Alitalia', country: '意大利', callsignPrefix: 'ALITALIA' }],
  ['SAS', { icaoCode: 'SAS', iataCode: 'SK', name: '北欧航空', nameEn: 'Scandinavian Airlines', country: '瑞典', callsignPrefix: 'SCANDINAVIAN' }],
  ['FIN', { icaoCode: 'FIN', iataCode: 'AY', name: '芬兰航空', nameEn: 'Finnair', country: '芬兰', callsignPrefix: 'FINNAIR' }],
  ['NAX', { icaoCode: 'NAX', iataCode: 'DY', name: '挪威航空', nameEn: 'Norwegian Air Shuttle', country: '挪威', callsignPrefix: 'NORSEMAN' }],
  ['AFL', { icaoCode: 'AFL', iataCode: 'SU', name: '俄罗斯航空', nameEn: 'Aeroflot', country: '俄罗斯', callsignPrefix: 'AEROFLOT' }],
  ['RYR', { icaoCode: 'RYR', iataCode: 'FR', name: '瑞安航空', nameEn: 'Ryanair', country: '爱尔兰', callsignPrefix: 'RYANAIR' }],
  ['LOT', { icaoCode: 'LOT', iataCode: 'LO', name: '波兰航空', nameEn: 'LOT Polish Airlines', country: '波兰', callsignPrefix: 'LOT' }],
  ['CSA', { icaoCode: 'CSA', iataCode: 'OK', name: '捷克航空', nameEn: 'Czech Airlines', country: '捷克', callsignPrefix: 'CSA' }],
  
  // ==================== 美洲航空公司 ====================
  ['AAL', { icaoCode: 'AAL', iataCode: 'AA', name: '美国航空', nameEn: 'American Airlines', country: '美国', callsignPrefix: 'AMERICAN' }],
  ['DAL', { icaoCode: 'DAL', iataCode: 'DL', name: '达美航空', nameEn: 'Delta Air Lines', country: '美国', callsignPrefix: 'DELTA' }],
  ['UAL', { icaoCode: 'UAL', iataCode: 'UA', name: '美国联合航空', nameEn: 'United Airlines', country: '美国', callsignPrefix: 'UNITED' }],
  ['SWA', { icaoCode: 'SWA', iataCode: 'WN', name: '西南航空', nameEn: 'Southwest Airlines', country: '美国', callsignPrefix: 'SOUTHWEST' }],
  ['JBU', { icaoCode: 'JBU', iataCode: 'B6', name: '捷蓝航空', nameEn: 'JetBlue Airways', country: '美国', callsignPrefix: 'JETBLUE' }],
  ['ASA', { icaoCode: 'ASA', iataCode: 'AS', name: '阿拉斯加航空', nameEn: 'Alaska Airlines', country: '美国', callsignPrefix: 'ALASKA' }],
  ['FFT', { icaoCode: 'FFT', iataCode: 'F9', name: '边疆航空', nameEn: 'Frontier Airlines', country: '美国', callsignPrefix: 'FRONTIER' }],
  ['NKS', { icaoCode: 'NKS', iataCode: 'NK', name: '精神航空', nameEn: 'Spirit Airlines', country: '美国', callsignPrefix: 'SPIRIT WINGS' }],
  ['HAL', { icaoCode: 'HAL', iataCode: 'HA', name: '夏威夷航空', nameEn: 'Hawaiian Airlines', country: '美国', callsignPrefix: 'HAWAIIAN' }],
  ['FDX', { icaoCode: 'FDX', iataCode: 'FX', name: '联邦快递', nameEn: 'FedEx Express', country: '美国', callsignPrefix: 'FEDEX' }],
  ['UPS', { icaoCode: 'UPS', iataCode: '5X', name: 'UPS航空', nameEn: 'UPS Airlines', country: '美国', callsignPrefix: 'UPS' }],
  ['ACA', { icaoCode: 'ACA', iataCode: 'AC', name: '加拿大航空', nameEn: 'Air Canada', country: '加拿大', callsignPrefix: 'AIR CANADA' }],
  ['WJA', { icaoCode: 'WJA', iataCode: 'WS', name: '西捷航空', nameEn: 'WestJet', country: '加拿大', callsignPrefix: 'WESTJET' }],
  ['AMX', { icaoCode: 'AMX', iataCode: 'AM', name: '墨西哥航空', nameEn: 'Aeromexico', country: '墨西哥', callsignPrefix: 'AEROMEXICO' }],
  ['VOI', { icaoCode: 'VOI', iataCode: 'Y4', name: '沃拉里斯航空', nameEn: 'Volaris', country: '墨西哥', callsignPrefix: 'VOLARIS' }],
  ['LAN', { icaoCode: 'LAN', iataCode: 'LA', name: '南美航空', nameEn: 'LATAM Airlines', country: '智利', callsignPrefix: 'LAN' }],
  ['AVA', { icaoCode: 'AVA', iataCode: 'AV', name: '哥伦比亚航空', nameEn: 'Avianca', country: '哥伦比亚', callsignPrefix: 'AVIANCA' }],
  ['GLO', { icaoCode: 'GLO', iataCode: 'G3', name: '戈尔航空', nameEn: 'Gol Airlines', country: '巴西', callsignPrefix: 'GOL' }],
  ['AZU', { icaoCode: 'AZU', iataCode: 'AD', name: '蓝色巴西航空', nameEn: 'Azul Brazilian Airlines', country: '巴西', callsignPrefix: 'AZUL' }],
  
  // ==================== 大洋洲航空公司 ====================
  ['QFA', { icaoCode: 'QFA', iataCode: 'QF', name: '澳洲航空', nameEn: 'Qantas', country: '澳大利亚', callsignPrefix: 'QANTAS' }],
  ['VOZ', { icaoCode: 'VOZ', iataCode: 'VA', name: '维珍澳洲', nameEn: 'Virgin Australia', country: '澳大利亚', callsignPrefix: 'VELOCITY' }],
  ['JST', { icaoCode: 'JST', iataCode: 'JQ', name: '捷星航空', nameEn: 'Jetstar Airways', country: '澳大利亚', callsignPrefix: 'JETSTAR' }],
  ['ANZ', { icaoCode: 'ANZ', iataCode: 'NZ', name: '新西兰航空', nameEn: 'Air New Zealand', country: '新西兰', callsignPrefix: 'NEW ZEALAND' }],
  ['FJI', { icaoCode: 'FJI', iataCode: 'FJ', name: '斐济航空', nameEn: 'Fiji Airways', country: '斐济', callsignPrefix: 'FIJI' }],
  
  // ==================== 非洲航空公司 ====================
  ['ETH', { icaoCode: 'ETH', iataCode: 'ET', name: '埃塞俄比亚航空', nameEn: 'Ethiopian Airlines', country: '埃塞俄比亚', callsignPrefix: 'ETHIOPIAN' }],
  ['SAA', { icaoCode: 'SAA', iataCode: 'SA', name: '南非航空', nameEn: 'South African Airways', country: '南非', callsignPrefix: 'SPRINGBOK' }],
  ['MSR', { icaoCode: 'MSR', iataCode: 'MS', name: '埃及航空', nameEn: 'EgyptAir', country: '埃及', callsignPrefix: 'EGYPTAIR' }],
  ['RAM', { icaoCode: 'RAM', iataCode: 'AT', name: '摩洛哥皇家航空', nameEn: 'Royal Air Maroc', country: '摩洛哥', callsignPrefix: 'ROYALAIR MAROC' }],
  ['KQA', { icaoCode: 'KQA', iataCode: 'KQ', name: '肯尼亚航空', nameEn: 'Kenya Airways', country: '肯尼亚', callsignPrefix: 'KENYA' }],
]);

// ==================== 基于ICAO地址前缀的国家/地区分配 ====================
// ICAO 24位地址分配给不同国家
export const icaoCountryRanges: { start: string; end: string; country: string }[] = [
  // 中国
  { start: '780000', end: '7BFFFF', country: '中国' },
  
  // 香港
  { start: '780500', end: '780FFF', country: '香港' },
  
  // 台湾
  { start: '899000', end: '899FFF', country: '台湾' },
  
  // 日本
  { start: '840000', end: '87FFFF', country: '日本' },
  
  // 韩国
  { start: '718000', end: '71FFFF', country: '韩国' },
  
  // 澳大利亚
  { start: '7C0000', end: '7FFFFF', country: '澳大利亚' },
  
  // 新加坡
  { start: '76C000', end: '76FFFF', country: '新加坡' },
  
  // 马来西亚
  { start: '750000', end: '75FFFF', country: '马来西亚' },
  
  // 泰国
  { start: '880000', end: '887FFF', country: '泰国' },
  
  // 越南
  { start: '888000', end: '88FFFF', country: '越南' },
  
  // 印度
  { start: '800000', end: '83FFFF', country: '印度' },
  
  // 阿联酋
  { start: '896000', end: '896FFF', country: '阿联酋' },
  
  // 美国
  { start: 'A00000', end: 'AFFFFF', country: '美国' },
  
  // 英国
  { start: '400000', end: '43FFFF', country: '英国' },
  
  // 德国
  { start: '3C0000', end: '3FFFFF', country: '德国' },
  
  // 法国
  { start: '380000', end: '3BFFFF', country: '法国' },
  
  // 俄罗斯
  { start: '140000', end: '15FFFF', country: '俄罗斯' },
];

/**
 * 根据 ICAO 地址判断飞机注册国家
 */
export function getCountryByIcao(icao: string): string {
  const icaoNum = parseInt(icao, 16);
  
  for (const range of icaoCountryRanges) {
    const start = parseInt(range.start, 16);
    const end = parseInt(range.end, 16);
    
    if (icaoNum >= start && icaoNum <= end) {
      return range.country;
    }
  }
  
  return '未知';
}

/**
 * 根据呼号前缀查询航空公司信息
 * @param callsign 航班呼号 (如 "CCA1234", "CSN789")
 * @returns 航空公司信息，如果未找到则返回 null
 */
export function getAirlineByCallsign(callsign: string): AirlineInfo | null {
  if (!callsign || callsign === 'Unknown') {
    return null;
  }
  
  // 呼号通常是 3 个字母的 ICAO 代码 + 航班号
  // 提取前 3 个字符作为 ICAO 代码
  const prefix = callsign.substring(0, 3).toUpperCase();
  
  const airline = airlineDatabase.get(prefix);
  if (airline) {
    return airline;
  }
  
  // 尝试 2 个字符匹配（某些呼号可能不是标准格式）
  const prefix2 = callsign.substring(0, 2).toUpperCase();
  for (const [code, info] of airlineDatabase) {
    if (info.iataCode === prefix2) {
      return info;
    }
  }
  
  return null;
}

/**
 * 格式化航班显示信息
 * @param callsign 航班呼号
 * @param icao ICAO 24位地址
 * @returns 格式化后的显示字符串
 */
export function formatFlightInfo(callsign: string, icao: string): {
  displayName: string;
  airlineName: string;
  flightNumber: string;
  country: string;
} {
  const airline = getAirlineByCallsign(callsign);
  const country = getCountryByIcao(icao);
  
  if (airline) {
    // 提取航班号（呼号中除了航空公司代码的部分）
    const flightNumber = callsign.substring(3).trim();
    
    return {
      displayName: `${airline.name} ${callsign}`,
      airlineName: airline.name,
      flightNumber: flightNumber || callsign,
      country: airline.country
    };
  }
  
  return {
    displayName: callsign === 'Unknown' ? `[${icao}]` : callsign,
    airlineName: '未知航空公司',
    flightNumber: callsign === 'Unknown' ? icao : callsign,
    country: country
  };
}

/**
 * 分析CSV数据中的航空公司分布
 */
export function analyzeAirlines(callsigns: string[]): {
  known: Map<string, { airline: AirlineInfo; count: number }>;
  unknown: Map<string, number>;
  totalKnown: number;
  totalUnknown: number;
} {
  const known = new Map<string, { airline: AirlineInfo; count: number }>();
  const unknown = new Map<string, number>();
  let totalKnown = 0;
  let totalUnknown = 0;
  
  for (const callsign of callsigns) {
    if (!callsign || callsign === 'Unknown') {
      totalUnknown++;
      unknown.set('NO_CALLSIGN', (unknown.get('NO_CALLSIGN') || 0) + 1);
      continue;
    }
    
    const airline = getAirlineByCallsign(callsign);
    const prefix = callsign.substring(0, 3).toUpperCase();
    
    if (airline) {
      totalKnown++;
      const existing = known.get(airline.icaoCode);
      if (existing) {
        existing.count++;
      } else {
        known.set(airline.icaoCode, { airline, count: 1 });
      }
    } else {
      totalUnknown++;
      unknown.set(prefix, (unknown.get(prefix) || 0) + 1);
    }
  }
  
  return { known, unknown, totalKnown, totalUnknown };
}

export default {
  airlineDatabase,
  getAirlineByCallsign,
  getCountryByIcao,
  formatFlightInfo,
  analyzeAirlines
};
