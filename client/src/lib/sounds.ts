// Chat sound notification service
// Uses Web Audio API to generate notification sounds

type SoundType = "messageSent" | "messageReceived" | "notification";

interface SoundSettings {
  enabled: boolean;
  volume: number;
}

const STORAGE_KEY = "chat-sound-settings";

// Load settings from localStorage
function loadSettings(): SoundSettings {
  if (typeof window === "undefined") {
    return { enabled: true, volume: 0.5 };
  }
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn("Failed to load sound settings:", e);
  }
  return { enabled: true, volume: 0.5 };
}

// Save settings to localStorage
function saveSettings(settings: SoundSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (e) {
    console.warn("Failed to save sound settings:", e);
  }
}

let settings = loadSettings();
let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioContext) {
    audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioContext;
}

// Generate a simple beep/notification sound using Web Audio API
function playTone(frequency: number, duration: number, type: OscillatorType = "sine"): void {
  if (!settings.enabled) return;
  
  try {
    const ctx = getAudioContext();
    
    // Resume context if suspended (browser autoplay policy)
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
    
    // Envelope for smooth sound
    gainNode.gain.setValueAtTime(0, ctx.currentTime);
    gainNode.gain.linearRampToValueAtTime(settings.volume * 0.3, ctx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);
  } catch (e) {
    console.warn("Failed to play sound:", e);
  }
}

// Play a two-tone notification (like a "ding")
function playDing(): void {
  if (!settings.enabled) return;
  
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    
    const playNote = (freq: number, startTime: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(freq, startTime);
      
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(settings.volume * 0.2, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };
    
    const now = ctx.currentTime;
    playNote(880, now, 0.15); // A5
    playNote(1108.73, now + 0.1, 0.2); // C#6
  } catch (e) {
    console.warn("Failed to play ding:", e);
  }
}

// Play a "whoosh" sound for message sent
function playWhoosh(): void {
  if (!settings.enabled) return;
  
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(400, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.1);
    
    gainNode.gain.setValueAtTime(settings.volume * 0.15, ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.15);
  } catch (e) {
    console.warn("Failed to play whoosh:", e);
  }
}

// Play notification alert (more attention-grabbing)
function playAlert(): void {
  if (!settings.enabled) return;
  
  try {
    const ctx = getAudioContext();
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    
    const playNote = (freq: number, startTime: number, duration: number) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      
      oscillator.type = "triangle";
      oscillator.frequency.setValueAtTime(freq, startTime);
      
      gainNode.gain.setValueAtTime(0, startTime);
      gainNode.gain.linearRampToValueAtTime(settings.volume * 0.25, startTime + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };
    
    const now = ctx.currentTime;
    playNote(587.33, now, 0.12); // D5
    playNote(659.25, now + 0.1, 0.12); // E5
    playNote(783.99, now + 0.2, 0.15); // G5
  } catch (e) {
    console.warn("Failed to play alert:", e);
  }
}

export const chatSounds = {
  play(type: SoundType): void {
    switch (type) {
      case "messageSent":
        playWhoosh();
        break;
      case "messageReceived":
        playDing();
        break;
      case "notification":
        playAlert();
        break;
    }
  },
  
  setEnabled(enabled: boolean): void {
    settings.enabled = enabled;
    saveSettings(settings);
  },
  
  isEnabled(): boolean {
    return settings.enabled;
  },
  
  setVolume(volume: number): void {
    settings.volume = Math.max(0, Math.min(1, volume));
    saveSettings(settings);
  },
  
  getVolume(): number {
    return settings.volume;
  },
  
  // Test sound (plays a short ding)
  test(): void {
    const wasEnabled = settings.enabled;
    settings.enabled = true;
    playDing();
    settings.enabled = wasEnabled;
  },
};
