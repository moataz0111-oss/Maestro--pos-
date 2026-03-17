/**
 * ZKTeco Manager - إدارة أجهزة البصمة ZKTeco
 * يدعم جميع أجهزة ZKTeco التي تتصل عبر Ethernet/WiFi
 * المنفذ الافتراضي: 4370
 */

const EventEmitter = require('events');

class ZKTecoManager extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.devices = new Map(); // قائمة الأجهزة المتصلة
    this.ZKLib = null;
    this.isInitialized = false;
  }

  /**
   * تهيئة المكتبة
   */
  async initialize() {
    try {
      // محاولة تحميل مكتبة zkteco-js
      this.ZKLib = require('zkteco-js');
      this.isInitialized = true;
      console.log('✅ ZKTeco Manager initialized');
      return { success: true };
    } catch (error) {
      console.error('❌ فشل تهيئة ZKTeco:', error.message);
      console.log('💡 لتثبيت المكتبة: npm install zkteco-js');
      this.isInitialized = false;
      return { success: false, error: error.message };
    }
  }

  /**
   * الاتصال بجهاز ZKTeco
   * @param {string} ip - عنوان IP للجهاز
   * @param {number} port - المنفذ (افتراضي: 4370)
   * @param {string} name - اسم الجهاز للتعريف
   */
  async connectDevice(ip, port = 4370, name = 'Device') {
    if (!this.isInitialized) {
      const init = await this.initialize();
      if (!init.success) {
        return { success: false, error: 'مكتبة ZKTeco غير متوفرة' };
      }
    }

    try {
      console.log(`🔌 جاري الاتصال بجهاز ${name} على ${ip}:${port}...`);
      
      const device = new this.ZKLib(ip, port, 10000, 5000);
      await device.createSocket();
      
      // الحصول على معلومات الجهاز
      const deviceInfo = await this.getDeviceInfo(device);
      
      // حفظ الجهاز
      const deviceId = `${ip}:${port}`;
      this.devices.set(deviceId, {
        instance: device,
        ip,
        port,
        name,
        info: deviceInfo,
        connectedAt: new Date(),
        status: 'connected'
      });

      console.log(`✅ تم الاتصال بجهاز ${name}`);
      this.emit('device-connected', { deviceId, name, ip, info: deviceInfo });
      
      return { 
        success: true, 
        deviceId,
        info: deviceInfo 
      };
    } catch (error) {
      console.error(`❌ فشل الاتصال بجهاز ${name}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * قطع الاتصال بجهاز
   */
  async disconnectDevice(deviceId) {
    const deviceData = this.devices.get(deviceId);
    if (!deviceData) {
      return { success: false, error: 'الجهاز غير موجود' };
    }

    try {
      await deviceData.instance.disconnect();
      this.devices.delete(deviceId);
      
      console.log(`🔌 تم قطع الاتصال بجهاز ${deviceData.name}`);
      this.emit('device-disconnected', { deviceId, name: deviceData.name });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * الحصول على معلومات الجهاز
   */
  async getDeviceInfo(device) {
    try {
      const info = {};
      
      // محاولة الحصول على معلومات مختلفة
      try {
        info.serialNumber = await device.getSerialNumber();
      } catch (e) { info.serialNumber = 'N/A'; }
      
      try {
        info.version = await device.getVersion();
      } catch (e) { info.version = 'N/A'; }
      
      try {
        info.deviceName = await device.getDeviceName();
      } catch (e) { info.deviceName = 'ZKTeco Device'; }
      
      try {
        info.platform = await device.getPlatform();
      } catch (e) { info.platform = 'N/A'; }
      
      try {
        info.fingerPrintAlgorithm = await device.getFPVersion();
      } catch (e) { info.fingerPrintAlgorithm = 'N/A'; }
      
      try {
        const time = await device.getTime();
        info.deviceTime = time;
      } catch (e) { info.deviceTime = 'N/A'; }
      
      return info;
    } catch (error) {
      return { error: error.message };
    }
  }

  /**
   * جلب جميع المستخدمين من الجهاز
   */
  async getUsers(deviceId) {
    const deviceData = this.devices.get(deviceId);
    if (!deviceData) {
      return { success: false, error: 'الجهاز غير متصل' };
    }

    try {
      const users = await deviceData.instance.getUsers();
      console.log(`📋 تم جلب ${users.length} مستخدم من ${deviceData.name}`);
      return { success: true, users };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * جلب سجلات الحضور
   */
  async getAttendanceLogs(deviceId) {
    const deviceData = this.devices.get(deviceId);
    if (!deviceData) {
      return { success: false, error: 'الجهاز غير متصل' };
    }

    try {
      const logs = await deviceData.instance.getAttendances();
      console.log(`📊 تم جلب ${logs.length} سجل حضور من ${deviceData.name}`);
      return { success: true, logs };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * جلب السجلات الجديدة فقط (منذ تاريخ معين)
   */
  async getNewAttendanceLogs(deviceId, sinceDate) {
    const result = await this.getAttendanceLogs(deviceId);
    if (!result.success) return result;

    const since = new Date(sinceDate);
    const newLogs = result.logs.filter(log => new Date(log.recordTime) > since);
    
    return { success: true, logs: newLogs };
  }

  /**
   * إضافة مستخدم جديد للجهاز
   */
  async addUser(deviceId, userData) {
    const deviceData = this.devices.get(deviceId);
    if (!deviceData) {
      return { success: false, error: 'الجهاز غير متصل' };
    }

    try {
      const { uid, name, password = '', role = 0, cardNo = '' } = userData;
      
      await deviceData.instance.setUser(uid, name, password, role, cardNo);
      console.log(`👤 تم إضافة المستخدم ${name} للجهاز ${deviceData.name}`);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * حذف مستخدم من الجهاز
   */
  async deleteUser(deviceId, uid) {
    const deviceData = this.devices.get(deviceId);
    if (!deviceData) {
      return { success: false, error: 'الجهاز غير متصل' };
    }

    try {
      await deviceData.instance.deleteUser(uid);
      console.log(`🗑️ تم حذف المستخدم ${uid} من ${deviceData.name}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * مسح جميع سجلات الحضور
   */
  async clearAttendanceLogs(deviceId) {
    const deviceData = this.devices.get(deviceId);
    if (!deviceData) {
      return { success: false, error: 'الجهاز غير متصل' };
    }

    try {
      await deviceData.instance.clearAttendanceLog();
      console.log(`🧹 تم مسح سجلات الحضور من ${deviceData.name}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * ضبط وقت الجهاز
   */
  async setDeviceTime(deviceId, time = new Date()) {
    const deviceData = this.devices.get(deviceId);
    if (!deviceData) {
      return { success: false, error: 'الجهاز غير متصل' };
    }

    try {
      await deviceData.instance.setTime(time);
      console.log(`🕐 تم ضبط وقت جهاز ${deviceData.name}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * إعادة تشغيل الجهاز
   */
  async restartDevice(deviceId) {
    const deviceData = this.devices.get(deviceId);
    if (!deviceData) {
      return { success: false, error: 'الجهاز غير متصل' };
    }

    try {
      await deviceData.instance.restart();
      this.devices.delete(deviceId);
      console.log(`🔄 تم إعادة تشغيل جهاز ${deviceData.name}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * تفعيل الاستماع للأحداث الحية (Real-time)
   */
  async startRealTimeCapture(deviceId) {
    const deviceData = this.devices.get(deviceId);
    if (!deviceData) {
      return { success: false, error: 'الجهاز غير متصل' };
    }

    try {
      await deviceData.instance.getRealTimeLogs((data) => {
        console.log('📡 بصمة جديدة:', data);
        this.emit('attendance-captured', {
          deviceId,
          deviceName: deviceData.name,
          ...data
        });
      });
      
      console.log(`📡 بدء الاستماع للبصمات الحية من ${deviceData.name}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * فحص الاتصال بجهاز
   */
  async pingDevice(ip, port = 4370) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    if (!this.ZKLib) {
      return { success: false, error: 'مكتبة ZKTeco غير متوفرة' };
    }

    try {
      const device = new this.ZKLib(ip, port, 5000, 3000);
      await device.createSocket();
      const info = await this.getDeviceInfo(device);
      await device.disconnect();
      
      return { success: true, info };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * البحث عن أجهزة على الشبكة المحلية
   */
  async scanNetwork(baseIp = '192.168.1', startRange = 1, endRange = 254, port = 4370) {
    console.log(`🔍 جاري البحث عن أجهزة ZKTeco على الشبكة ${baseIp}.${startRange}-${endRange}...`);
    
    const foundDevices = [];
    const promises = [];

    for (let i = startRange; i <= endRange; i++) {
      const ip = `${baseIp}.${i}`;
      promises.push(
        this.pingDevice(ip, port)
          .then(result => {
            if (result.success) {
              foundDevices.push({ ip, port, info: result.info });
              console.log(`✅ وجد جهاز على ${ip}`);
            }
          })
          .catch(() => {})
      );
    }

    // تنفيذ بالتوازي مع حد أقصى 10 اتصالات
    const batchSize = 10;
    for (let i = 0; i < promises.length; i += batchSize) {
      await Promise.all(promises.slice(i, i + batchSize));
    }

    console.log(`🔍 تم العثور على ${foundDevices.length} جهاز ZKTeco`);
    return { success: true, devices: foundDevices };
  }

  /**
   * الحصول على قائمة الأجهزة المتصلة
   */
  getConnectedDevices() {
    const devices = [];
    this.devices.forEach((data, id) => {
      devices.push({
        id,
        name: data.name,
        ip: data.ip,
        port: data.port,
        status: data.status,
        connectedAt: data.connectedAt,
        info: data.info
      });
    });
    return devices;
  }

  /**
   * قطع الاتصال بجميع الأجهزة
   */
  async disconnectAll() {
    const promises = [];
    this.devices.forEach((_, deviceId) => {
      promises.push(this.disconnectDevice(deviceId));
    });
    await Promise.all(promises);
    console.log('🔌 تم قطع الاتصال بجميع الأجهزة');
  }

  /**
   * حفظ إعدادات الأجهزة
   */
  saveDeviceSettings(devices) {
    this.store.set('zktecoDevices', devices);
  }

  /**
   * جلب إعدادات الأجهزة المحفوظة
   */
  getSavedDevices() {
    return this.store.get('zktecoDevices', []);
  }

  /**
   * الاتصال بجميع الأجهزة المحفوظة
   */
  async connectSavedDevices() {
    const savedDevices = this.getSavedDevices();
    const results = [];

    for (const device of savedDevices) {
      const result = await this.connectDevice(device.ip, device.port, device.name);
      results.push({ ...device, ...result });
    }

    return results;
  }
}

module.exports = { ZKTecoManager };
