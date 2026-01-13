// Sound utilities for POS interactions

// Click sound as base64 (short click sound)
const CLICK_SOUND_URL = 'data:audio/wav;base64,UklGRl4FAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YToFAAB/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f3t7e3t7e3t7e3t7e3t7f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f39/f4GBgYGBgYGBgYGBgYKCgoKDg4ODg4ODg4ODg4ODg4ODg4OCgoKCgoKCgoKCgoKBgYGBgYGBgYGBgYGBgYCAgICAgICAgICAgICAgICAgH9/f39/f39/f39/f39/f39/f39/f39/f39/f39+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fX19fX19fX19fX19fX19fX19fX19fX19fX19fXx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fH19fX19fX19fX19fX19fX19fX19fX19fX19fX5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5/f39/f39/f39/f39/f39/f39/f39/f39/gICAgICAgICAgICAgICAgICAgYGBgYGBgYGBgYGBgYGBgYGCgoKCgoKCgoKCgoKCgoKCgoKDg4ODg4ODg4ODg4ODg4ODhISEhISEhISEhISEhISEhISEhISEhISEhISEhIODg4ODg4ODg4ODg4ODg4OCgoKCgoKCgoKCgoKCgoKBgYGBgYGBgYGBgYGBgYGAgICAgICAgICAgICAgIB/f39/f39/f39/f39/fn5+fn5+fn5+fn5+fn19fX19fX19fX19fX19fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx9fX19fX19fX19fX19fX19fn5+fn5+fn5+fn5+fn5/f39/f39/f39/f39/f39/gICAgICAgICAgICAgICAgYGBgYGBgYGBgYGBgYKCgoKCgoKCgoKCgoKCg4ODg4ODg4ODg4ODg4OEhISEhISEhISEhISEhISFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWEhISEhISEhISEhISEhISEhISEhIODg4ODg4ODg4ODg4OCgoKCgoKCgoKCgoKCgYGBgYGBgYGBgYGBgYCAgICAgICAgICAgIB/f39/f39/f39/f39/fn5+fn5+fn5+fn5+fX19fX19fX19fX19fX18fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx9fX19fX19fX19fX19fX1+fn5+fn5+fn5+fn5+fn9/f39/f39/f39/f39/f4CAgICAgICAgICAgICAgYGBgYGBgYGBgYGBgYKCgoKCgoKCgoKCgoKCg4ODg4ODg4ODg4ODg4OEhISEhISEhISEhISEhIWFhYWFhYWFhYWFhYWFhYaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhoaGhYWFhYWFhYWFhYWFhYWFhYWFhYSEhISEhISEhISEhISDg4ODg4ODg4ODg4ODgoKCgoKCgoKCgoKCgoGBgYGBgYGBgYGBgYGAgICAgICAgICAgICAf39/f39/f39/f39/f35+fn5+fn5+fn5+fn19fX19fX19fX19fX19fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fHx8fX19fX19fX19fX19fX1+fn5+fn5+fn5+fn5+fn9/f39/f39/f39/f39/gICAgICAgICAgICAgICAgYGBgYGBgYGBgYGBgYKCgoKCgoKCgoKCgoKCg4ODg4ODg4ODg4ODg4Q=';

let audioContext = null;
let clickBuffer = null;

// Initialize audio context
const initAudio = async () => {
  if (audioContext) return;
  
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Decode the click sound
    const response = await fetch(CLICK_SOUND_URL);
    const arrayBuffer = await response.arrayBuffer();
    clickBuffer = await audioContext.decodeAudioData(arrayBuffer);
  } catch (error) {
    console.warn('Audio initialization failed:', error);
  }
};

/**
 * Play click sound effect
 */
export const playClick = async () => {
  try {
    // Initialize on first use (browser requires user interaction)
    if (!audioContext) {
      await initAudio();
    }
    
    if (!audioContext || !clickBuffer) {
      // Fallback: create simple beep
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.05);
      
      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.05);
      
      return;
    }
    
    // Resume context if suspended
    if (audioContext.state === 'suspended') {
      await audioContext.resume();
    }
    
    // Play the sound
    const source = audioContext.createBufferSource();
    const gainNode = audioContext.createGain();
    
    source.buffer = clickBuffer;
    gainNode.gain.value = 0.3;
    
    source.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    source.start(0);
  } catch (error) {
    console.warn('Sound playback failed:', error);
  }
};

/**
 * Play success sound
 */
export const playSuccess = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.value = 880;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.2);
  } catch (error) {
    console.warn('Sound playback failed:', error);
  }
};

/**
 * Play error sound
 */
export const playError = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.frequency.value = 200;
    oscillator.type = 'sawtooth';
    
    gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.15);
  } catch (error) {
    console.warn('Sound playback failed:', error);
  }
};

/**
 * Play new order notification sound - للمطبخ
 * صوت تنبيه مميز للطلبات الجديدة
 */
export const playNewOrderNotification = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Play a sequence of tones for attention
    const playTone = (frequency, startTime, duration) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.15, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };
    
    // Play ascending notes: C5, E5, G5 (major chord arpeggio)
    playTone(523.25, ctx.currentTime, 0.15);        // C5
    playTone(659.25, ctx.currentTime + 0.15, 0.15); // E5
    playTone(783.99, ctx.currentTime + 0.3, 0.25);  // G5
    
    // Optional: Add a final high note
    playTone(1046.50, ctx.currentTime + 0.55, 0.3); // C6
    
  } catch (error) {
    console.warn('Notification sound playback failed:', error);
  }
};

/**
 * Play kitchen bell sound - جرس المطبخ
 * صوت جرس مطبخ تقليدي
 */
export const playKitchenBell = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create a bell-like sound
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    // Bell frequency
    oscillator.frequency.value = 1200;
    oscillator.type = 'sine';
    
    // Quick attack, longer decay (bell-like)
    gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.8);
    
    // Add harmonics for richer bell sound
    const harmonic = ctx.createOscillator();
    const harmonicGain = ctx.createGain();
    
    harmonic.connect(harmonicGain);
    harmonicGain.connect(ctx.destination);
    
    harmonic.frequency.value = 2400; // 2x frequency
    harmonic.type = 'sine';
    
    harmonicGain.gain.setValueAtTime(0.1, ctx.currentTime);
    harmonicGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
    
    harmonic.start(ctx.currentTime);
    harmonic.stop(ctx.currentTime + 0.4);
    
  } catch (error) {
    console.warn('Kitchen bell sound failed:', error);
  }
};

/**
 * Play urgent notification - تنبيه عاجل
 * للطلبات المستعجلة أو المتأخرة
 */
export const playUrgentAlert = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    const playBeep = (startTime) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = 1000;
      oscillator.type = 'square';
      
      gainNode.gain.setValueAtTime(0.15, startTime);
      gainNode.gain.setValueAtTime(0, startTime + 0.1);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.1);
    };
    
    // Play 3 rapid beeps
    playBeep(ctx.currentTime);
    playBeep(ctx.currentTime + 0.15);
    playBeep(ctx.currentTime + 0.3);
    
  } catch (error) {
    console.warn('Urgent alert sound failed:', error);
  }
};

/**
 * Play driver new order notification - إشعار طلب جديد للسائق
 * صوت مميز وقوي لتنبيه السائق بوصول طلب جديد
 */
export const playDriverNotification = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    // صوت تنبيه مميز للسائق - 3 نغمات صاعدة قوية
    const playTone = (frequency, startTime, duration, gain = 0.2) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(gain, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };
    
    // نغمات صاعدة قوية (D5, F#5, A5, D6) - وتر ماجور
    playTone(587.33, ctx.currentTime, 0.2, 0.25);        // D5
    playTone(739.99, ctx.currentTime + 0.2, 0.2, 0.25);  // F#5
    playTone(880.00, ctx.currentTime + 0.4, 0.2, 0.25);  // A5
    playTone(1174.66, ctx.currentTime + 0.6, 0.4, 0.3);  // D6 - أطول وأقوى
    
    // إضافة نغمة ثانية بعد فترة قصيرة للتأكيد
    setTimeout(() => {
      try {
        const ctx2 = new (window.AudioContext || window.webkitAudioContext)();
        playTone(1174.66, ctx2.currentTime, 0.3, 0.2);
        playTone(880.00, ctx2.currentTime + 0.15, 0.3, 0.2);
      } catch (e) {
        // ignore audio context errors
      }
    }, 1200);
    
  } catch (error) {
    console.warn('Driver notification sound failed:', error);
  }
};

/**
 * Play delivery complete sound - صوت إتمام التوصيل
 */
export const playDeliveryComplete = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    const playTone = (frequency, startTime, duration) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.15, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };
    
    // صوت نجاح (نغمات هابطة مريحة)
    playTone(880, ctx.currentTime, 0.15);
    playTone(659.25, ctx.currentTime + 0.15, 0.15);
    playTone(523.25, ctx.currentTime + 0.3, 0.25);
    
  } catch (error) {
    console.warn('Delivery complete sound failed:', error);
  }
};

// ==================== إعدادات الصوت ====================

const DEFAULT_SOUND_SETTINGS = {
  enabled: true,
  buttonSounds: true,
  orderNotifications: true,
  callRingtone: true,
  driverNotifications: true,
  volume: 0.7
};

/**
 * جلب إعدادات الصوت من localStorage
 */
export const getSoundSettings = () => {
  try {
    const saved = localStorage.getItem('soundSettings');
    if (saved) {
      return { ...DEFAULT_SOUND_SETTINGS, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.warn('Failed to load sound settings:', e);
  }
  return DEFAULT_SOUND_SETTINGS;
};

/**
 * حفظ إعدادات الصوت
 */
export const saveSoundSettings = (settings) => {
  try {
    localStorage.setItem('soundSettings', JSON.stringify(settings));
    return true;
  } catch (e) {
    console.warn('Failed to save sound settings:', e);
    return false;
  }
};

/**
 * تشغيل صوت رنين المكالمة الواردة
 */
export const playIncomingCall = () => {
  const settings = getSoundSettings();
  if (!settings.enabled || !settings.callRingtone) return;
  
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const volume = settings.volume || 0.7;
    
    // نغمة رنين هاتف كلاسيكية
    const playRingTone = (startTime) => {
      // النغمة الأولى (عالية)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.frequency.value = 440; // A4
      osc1.type = 'sine';
      gain1.gain.setValueAtTime(volume * 0.2, startTime);
      gain1.gain.setValueAtTime(0, startTime + 0.1);
      osc1.start(startTime);
      osc1.stop(startTime + 0.1);
      
      // النغمة الثانية (منخفضة)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.frequency.value = 480; // B4
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(volume * 0.2, startTime + 0.1);
      gain2.gain.setValueAtTime(0, startTime + 0.2);
      osc2.start(startTime + 0.1);
      osc2.stop(startTime + 0.2);
    };
    
    // تشغيل الرنين 3 مرات
    playRingTone(ctx.currentTime);
    playRingTone(ctx.currentTime + 0.25);
    playRingTone(ctx.currentTime + 0.5);
    
    // فترة صمت ثم رنين آخر
    setTimeout(() => {
      try {
        const ctx2 = new (window.AudioContext || window.webkitAudioContext)();
        const playRingTone2 = (startTime) => {
          const osc1 = ctx2.createOscillator();
          const gain1 = ctx2.createGain();
          osc1.connect(gain1);
          gain1.connect(ctx2.destination);
          osc1.frequency.value = 440;
          osc1.type = 'sine';
          gain1.gain.setValueAtTime(volume * 0.2, startTime);
          gain1.gain.setValueAtTime(0, startTime + 0.1);
          osc1.start(startTime);
          osc1.stop(startTime + 0.1);
          
          const osc2 = ctx2.createOscillator();
          const gain2 = ctx2.createGain();
          osc2.connect(gain2);
          gain2.connect(ctx2.destination);
          osc2.frequency.value = 480;
          osc2.type = 'sine';
          gain2.gain.setValueAtTime(volume * 0.2, startTime + 0.1);
          gain2.gain.setValueAtTime(0, startTime + 0.2);
          osc2.start(startTime + 0.1);
          osc2.stop(startTime + 0.2);
        };
        playRingTone2(ctx2.currentTime);
        playRingTone2(ctx2.currentTime + 0.25);
        playRingTone2(ctx2.currentTime + 0.5);
      } catch (e) {
        // ignore audio context errors
      }
    }, 1000);
    
  } catch (error) {
    console.warn('Incoming call sound failed:', error);
  }
};

export default {
  playClick,
  playSuccess,
  playError,
  playNewOrderNotification,
  playKitchenBell,
  playUrgentAlert,
  playDriverNotification,
  playDeliveryComplete,
  playIncomingCall,
  getSoundSettings,
  saveSoundSettings,
};
