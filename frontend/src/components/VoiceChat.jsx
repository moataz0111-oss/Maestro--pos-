import React, { useRef, useState, useEffect } from 'react';
import { Mic, Square, Trash2, Play, Pause, Send, Check, CheckCheck } from 'lucide-react';

const MEDIA_BASE = (process.env.REACT_APP_BACKEND_URL || '').replace(/\/$/, '');

const fmtTime = (s) => {
  s = Math.max(0, Math.round(s || 0));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

// زر تسجيل الرسائل الصوتية — يضغط مرة للبدء ومرة للإيقاف والإرسال
export const VoiceRecordButton = ({ onUpload, accentClass = 'bg-green-500 hover:bg-green-600', testid = 'voice-record-btn' }) => {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [busy, setBusy] = useState(false);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const startedRef = useRef(0);
  const cancelRef = useRef(false);

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      cancelRef.current = false;
      mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const dur = Math.round((Date.now() - startedRef.current) / 1000);
        if (cancelRef.current) { chunksRef.current = []; return; }
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        if (blob.size > 0 && dur >= 1) {
          setBusy(true);
          try { await onUpload(blob, dur); } finally { setBusy(false); }
        }
      };
      mediaRef.current = mr;
      startedRef.current = Date.now();
      mr.start();
      setRecording(true);
      setSeconds(0);
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      alert('يرجى السماح بالوصول إلى الميكروفون لإرسال رسالة صوتية');
    }
  };

  const finish = (cancel) => {
    cancelRef.current = !!cancel;
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    const mr = mediaRef.current;
    if (mr && mr.state !== 'inactive') mr.stop();
  };

  if (recording) {
    return (
      <div className="flex items-center gap-2" data-testid="voice-recording-bar">
        <button type="button" onClick={() => finish(true)} className="w-9 h-9 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center text-gray-600 shrink-0" data-testid="voice-cancel-btn">
          <Trash2 className="h-4 w-4" />
        </button>
        <div className="flex-1 flex items-center gap-2 text-red-500 text-sm font-medium">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
          <span data-testid="voice-recording-timer">{fmtTime(seconds)}</span>
          <span className="text-gray-400">جارٍ التسجيل…</span>
        </div>
        <button type="button" onClick={() => finish(false)} className={`w-9 h-9 rounded-full ${accentClass} flex items-center justify-center text-white shrink-0`} data-testid="voice-stop-send-btn">
          <Send className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <button type="button" onClick={start} disabled={busy} className="w-9 h-9 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center text-gray-600 shrink-0 disabled:opacity-50" data-testid={testid} title="رسالة صوتية">
      <Mic className="h-4 w-4" />
    </button>
  );
};

// فقاعة تشغيل الرسالة الصوتية
export const VoiceBubble = ({ url, duration, mine, onListen }) => {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const listenedRef = useRef(false);
  const src = url && url.startsWith('http') ? url : `${MEDIA_BASE}${url || ''}`;

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); } else { a.play().catch(() => {}); }
  };

  const handlePlay = () => {
    setPlaying(true);
    if (!mine && !listenedRef.current && typeof onListen === 'function') {
      listenedRef.current = true;
      onListen();
    }
  };

  return (
    <div className="flex items-center gap-2 min-w-[150px]" data-testid="voice-bubble">
      <button type="button" onClick={toggle} className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${mine ? 'bg-white/25 text-white' : 'bg-gray-200 text-gray-700'}`} data-testid="voice-play-btn">
        {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div className={`h-1.5 rounded-full ${mine ? 'bg-white/30' : 'bg-gray-300'}`}>
          <div className={`h-full rounded-full ${mine ? 'bg-white' : 'bg-gray-600'}`} style={{ width: `${progress}%` }} />
        </div>
        <span className={`text-[11px] ${mine ? 'text-white/80' : 'text-gray-500'}`}>🎤 {fmtTime(duration)}</span>
      </div>
      <audio
        ref={audioRef}
        src={src}
        preload="none"
        onPlay={handlePlay}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); }}
        onTimeUpdate={(e) => { const a = e.target; if (a.duration) setProgress((a.currentTime / a.duration) * 100); }}
      />
    </div>
  );
};

// مؤشّر حالة الرسالة (✓ أُرسلت / ✓✓ تم الرؤية أو الاستماع) — يظهر فقط على رسائلي
export const MessageTicks = ({ msg, mine }) => {
  if (!mine) return null;
  const isVoice = msg.type === 'voice';
  if (isVoice) {
    if (msg.listened) {
      return <span title="تم الاستماع" className="inline-flex items-center text-sky-300" data-testid="msg-tick-listened"><CheckCheck className="h-3.5 w-3.5" /></span>;
    }
    if (msg.read) {
      return <span title="تم التسليم" className="inline-flex items-center text-white/70" data-testid="msg-tick-delivered"><CheckCheck className="h-3.5 w-3.5" /></span>;
    }
    return <span title="أُرسلت" className="inline-flex items-center text-white/70" data-testid="msg-tick-sent"><Check className="h-3.5 w-3.5" /></span>;
  }
  if (msg.read) {
    return <span title="تم الرؤية" className="inline-flex items-center text-sky-300" data-testid="msg-tick-read"><CheckCheck className="h-3.5 w-3.5" /></span>;
  }
  return <span title="أُرسلت" className="inline-flex items-center text-white/70" data-testid="msg-tick-sent"><Check className="h-3.5 w-3.5" /></span>;
};
