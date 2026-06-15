import { useState, useRef, useEffect, useCallback } from 'react';
import axios from 'axios';

// خوادم STUN عامة (مجانية) لاجتياز NAT — تكفي لأغلب الحالات بدون TURN.
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

// انتظر اكتمال تجميع مرشّحات ICE (non-trickle) لإرسال SDP كامل دفعة واحدة.
function waitIceComplete(pc, timeout = 3500) {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') return resolve();
    const check = () => {
      if (pc.iceGatheringState === 'complete') {
        pc.removeEventListener('icegatheringstatechange', check);
        resolve();
      }
    };
    pc.addEventListener('icegatheringstatechange', check);
    setTimeout(() => {
      pc.removeEventListener('icegatheringstatechange', check);
      resolve();
    }, timeout);
  });
}

/**
 * Hook موحّد لمكالمة صوتية داخل التطبيق (WebRTC) بين الزبون والسائق.
 * @param {string} API - رابط الـ backend مع /api
 * @param {'driver'|'customer'} role - دور المستخدم الحالي
 * @param {string} driverId - معرف السائق (لتطبيق السائق)
 * @param {string} orderId - معرف الطلب الحالي (لتطبيق الزبون)
 * @param {string} callerName - اسم المتصل لعرضه للطرف الآخر
 */
export function useWebRTCCall({ API, role, driverId, orderId, callerName = '' }) {
  // idle | calling | ringing(incoming) | connecting | connected | ended
  const [callState, setCallState] = useState('idle');
  const [incomingCall, setIncomingCall] = useState(null);
  const [muted, setMuted] = useState(false);
  const [peerName, setPeerName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const callIdRef = useRef(null);
  const statusPollRef = useRef(null);
  const callStateRef = useRef('idle');

  useEffect(() => { callStateRef.current = callState; }, [callState]);

  const stopStatusPoll = () => {
    if (statusPollRef.current) { clearInterval(statusPollRef.current); statusPollRef.current = null; }
  };

  const cleanup = useCallback(() => {
    stopStatusPoll();
    if (pcRef.current) { try { pcRef.current.close(); } catch (e) { /* noop */ } pcRef.current = null; }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    if (remoteAudioRef.current) { try { remoteAudioRef.current.srcObject = null; } catch (e) { /* noop */ } }
    callIdRef.current = null;
    setMuted(false);
  }, []);

  const getMic = async () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('المتصفح لا يدعم المكالمات الصوتية');
    }
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStreamRef.current = stream;
    return stream;
  };

  const createPc = useCallback((stream) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);
    stream.getTracks().forEach((t) => pc.addTrack(t, stream));
    pc.ontrack = (e) => {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = e.streams[0];
        remoteAudioRef.current.play().catch(() => { /* autoplay */ });
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') setCallState('connected');
    };
    pcRef.current = pc;
    return pc;
  }, []);

  const hangup = useCallback(async (notify = true) => {
    if (notify && callIdRef.current) {
      try { await axios.post(`${API}/calls/${callIdRef.current}/end`); } catch (e) { /* noop */ }
    }
    cleanup();
    setCallState('ended');
    setTimeout(() => setCallState('idle'), 1200);
  }, [API, cleanup]);

  // المتصل: بدء مكالمة للطرف الآخر في هذا الطلب
  const startCall = useCallback(async (targetOrderId, theirName = '') => {
    setErrorMsg('');
    setPeerName(theirName);
    setCallState('calling');
    try {
      const stream = await getMic();
      const pc = createPc(stream);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitIceComplete(pc);
      const res = await axios.post(`${API}/calls/initiate`, {
        order_id: targetOrderId,
        caller: role,
        caller_name: callerName,
        offer: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
      });
      callIdRef.current = res.data.call_id;
      statusPollRef.current = setInterval(async () => {
        if (!callIdRef.current) return;
        try {
          const r = await axios.get(`${API}/calls/${callIdRef.current}`);
          const call = r.data.call;
          if (!call) return;
          if (call.status === 'answered' && call.answer && pcRef.current && !pcRef.current.remoteDescription) {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(call.answer));
            setCallState('connected');
          } else if (['rejected', 'ended', 'missed'].includes(call.status)) {
            stopStatusPoll();
            cleanup();
            setCallState('ended');
            setTimeout(() => setCallState('idle'), 1200);
          }
        } catch (e) { /* noop */ }
      }, 1200);
    } catch (e) {
      cleanup();
      setCallState('idle');
      const msg = e?.response?.data?.detail || e?.message || 'تعذّر بدء المكالمة';
      setErrorMsg(typeof msg === 'string' ? msg : 'تعذّر بدء المكالمة');
    }
  }, [API, role, callerName, createPc, cleanup]);

  // المستلِم: قبول مكالمة واردة
  const acceptCall = useCallback(async () => {
    const call = incomingCall;
    if (!call) return;
    setErrorMsg('');
    setPeerName(call.caller === 'customer' ? (call.customer_name || 'الزبون') : (call.driver_name || call.caller_name || 'السائق'));
    setCallState('connecting');
    callIdRef.current = call.id;
    try {
      const stream = await getMic();
      const pc = createPc(stream);
      await pc.setRemoteDescription(new RTCSessionDescription(call.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitIceComplete(pc);
      await axios.post(`${API}/calls/${call.id}/answer`, {
        answer: { type: pc.localDescription.type, sdp: pc.localDescription.sdp },
      });
      setIncomingCall(null);
      setCallState('connected');
      statusPollRef.current = setInterval(async () => {
        if (!callIdRef.current) return;
        try {
          const r = await axios.get(`${API}/calls/${callIdRef.current}`);
          if (['ended', 'rejected'].includes(r.data.call?.status)) {
            stopStatusPoll();
            cleanup();
            setCallState('ended');
            setTimeout(() => setCallState('idle'), 1200);
          }
        } catch (e) { /* noop */ }
      }, 1500);
    } catch (e) {
      cleanup();
      setIncomingCall(null);
      setCallState('idle');
      const msg = e?.message || 'تعذّر قبول المكالمة';
      setErrorMsg(typeof msg === 'string' ? msg : 'تعذّر قبول المكالمة');
    }
  }, [incomingCall, API, createPc, cleanup]);

  const rejectCall = useCallback(async () => {
    if (incomingCall) {
      try { await axios.post(`${API}/calls/${incomingCall.id}/reject`); } catch (e) { /* noop */ }
    }
    setIncomingCall(null);
    setCallState('idle');
  }, [incomingCall, API]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      setMuted((prev) => {
        const next = !prev;
        localStreamRef.current.getAudioTracks().forEach((t) => { t.enabled = !next; });
        return next;
      });
    }
  }, []);

  // طلب إذن الميكروفون مسبقاً (لتهيئة المكالمات قبل أول اتصال)
  const primeMic = useCallback(async () => {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({ name: 'microphone' });
        if (status.state !== 'prompt') return; // مُنح/رُفض مسبقاً — لا تطلب مجدداً
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      stream.getTracks().forEach((t) => t.stop());
    } catch (e) { /* المستخدم قد يرفض — لا بأس */ }
  }, []);

  // استطلاع المكالمات الواردة (فقط أثناء الخمول)
  useEffect(() => {
    if (role === 'driver' && !driverId) return undefined;
    if (role === 'customer' && !orderId) return undefined;
    const poll = async () => {
      if (callStateRef.current !== 'idle') return;
      try {
        const params = role === 'driver' ? { driver_id: driverId } : { order_id: orderId };
        const r = await axios.get(`${API}/calls/incoming`, { params });
        if (r.data.call && callStateRef.current === 'idle') {
          setIncomingCall(r.data.call);
          setPeerName(r.data.call.caller === 'customer' ? (r.data.call.customer_name || 'الزبون') : (r.data.call.driver_name || r.data.call.caller_name || 'السائق'));
          setCallState('ringing');
        }
      } catch (e) { /* noop */ }
    };
    const iv = setInterval(poll, 2500);
    poll();
    return () => clearInterval(iv);
  }, [API, role, driverId, orderId]);

  useEffect(() => () => cleanup(), [cleanup]);

  return {
    callState,
    incomingCall,
    muted,
    peerName,
    errorMsg,
    remoteAudioRef,
    startCall,
    acceptCall,
    rejectCall,
    hangup,
    toggleMute,
    primeMic,
  };
}
