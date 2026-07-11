import React, { useEffect, useState, useRef } from "react";

/**
 * SingleTabGuard — يمنع فتح نظام الإدارة في أكثر من تبويب/نافذة على نفس الجهاز.
 * - يعتمد على BroadcastChannel + heartbeat في localStorage كاحتياط.
 * - يُستثنى منه تطبيق الزبون (/menu)، السائق (/driver-app)، صفحة التتبع (/track)،
 *   صفحة التواصل (/contact)، والتثبيت (/install-app).
 * - عند اكتشاف تبويب آخر نشط، يعرض شاشة حظر مع خيار «استخدام هنا» (يُغلق التبويب الآخر).
 */

const CHANNEL_NAME = "maestro-egp-tabs-v1";
const HEARTBEAT_KEY = "maestro_active_tab";
const HEARTBEAT_INTERVAL_MS = 1500;
const HEARTBEAT_STALE_MS = 5000; // بعدها يُعتبر التبويب الآخر ميتاً

// يُطبَّق على كل الصفحات بلا استثناء (المشرف/السائق/الزبون)
// كل جهاز = تبويب واحد فقط.

const genTabId = () => {
  return `tab-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const readActiveTab = () => {
  try {
    const raw = localStorage.getItem(HEARTBEAT_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.id || !obj.ts) return null;
    return obj;
  } catch {
    return null;
  }
};

const writeActiveTab = (id) => {
  try {
    localStorage.setItem(HEARTBEAT_KEY, JSON.stringify({ id, ts: Date.now() }));
  } catch (_e) { /* ignore */ }
};

const clearActiveTab = (id) => {
  try {
    const cur = readActiveTab();
    if (!cur || cur.id === id) {
      localStorage.removeItem(HEARTBEAT_KEY);
    }
  } catch (_e) { /* ignore */ }
};

export default function SingleTabGuard() {
  const [blocked, setBlocked] = useState(false);
  const tabIdRef = useRef(genTabId());
  const channelRef = useRef(null);
  const heartbeatRef = useRef(null);
  const isOwnerRef = useRef(false);

  useEffect(() => {
    const myId = tabIdRef.current;

    // 1) فحص حي عبر BroadcastChannel — أسرع وأدق من localStorage
    let bc = null;
    try {
      if (typeof BroadcastChannel !== "undefined") {
        bc = new BroadcastChannel(CHANNEL_NAME);
        channelRef.current = bc;
      }
    } catch (_e) { /* ignore */ }

    const takeOwnership = () => {
      isOwnerRef.current = true;
      writeActiveTab(myId);
      // heartbeat دوري
      heartbeatRef.current = setInterval(() => {
        if (isOwnerRef.current) writeActiveTab(myId);
      }, HEARTBEAT_INTERVAL_MS);
    };

    // 2) عند فتح التبويب — إن وُجد تبويب آخر نشط، احظر نفسي
    const existing = readActiveTab();
    const now = Date.now();
    const otherAliveViaStorage = existing && existing.id !== myId && now - existing.ts < HEARTBEAT_STALE_MS;

    if (otherAliveViaStorage) {
      setBlocked(true);
    } else {
      // لا يوجد تبويب حي → استلم الملكية فوراً
      takeOwnership();
    }

    // 3) اسأل التبويبات الأخرى مباشرة عبر القناة
    let receivedPongTimer = null;
    const handleMessage = (ev) => {
      const data = ev?.data || {};
      if (!data || data.tabId === myId) return;

      // تبويب جديد يسأل: هل يوجد أحد؟
      if (data.type === "PING" && isOwnerRef.current) {
        try {
          bc && bc.postMessage({ type: "PONG", tabId: myId });
        } catch (_e) { /* ignore */ }
      }

      // تبويب موجود مسبقاً يرد → أنا الجديد فأحظر نفسي
      if (data.type === "PONG" && !isOwnerRef.current) {
        // ألغِ استلام الملكية وامسح heartbeat لو كنت كتبته
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
        // لا تمسح active_tab لأن المالك الأصلي يكتبها
        setBlocked(true);
      }

      // المستخدم اختار «استخدام هنا» في تبويب آخر — نفسي أنغلق
      if (data.type === "TAKEOVER" && data.tabId !== myId && isOwnerRef.current) {
        isOwnerRef.current = false;
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
        setBlocked(true);
      }
    };

    if (bc) {
      bc.onmessage = handleMessage;
      // ping للسؤال إن كان هناك مالك
      try {
        bc.postMessage({ type: "PING", tabId: myId });
      } catch (_e) { /* ignore */ }
      // إن لم يصل PONG خلال 400ms ولم يكن هناك مالك → استلم الملكية
      receivedPongTimer = setTimeout(() => {
        if (!isOwnerRef.current && !blocked) {
          // تأكد مرة أخرى من localStorage قبل الاستلام
          const cur = readActiveTab();
          const alive = cur && cur.id !== myId && Date.now() - cur.ts < HEARTBEAT_STALE_MS;
          if (!alive) takeOwnership();
        }
      }, 400);
    }

    // عند إغلاق التبويب امسح ملكيتي حتى يستطيع تبويب جديد الفتح
    const handleUnload = () => {
      if (isOwnerRef.current) {
        clearActiveTab(myId);
        try {
          bc && bc.postMessage({ type: "BYE", tabId: myId });
        } catch (_e) { /* ignore */ }
      }
    };
    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (receivedPongTimer) clearTimeout(receivedPongTimer);
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
      if (isOwnerRef.current) clearActiveTab(myId);
      try {
        bc && bc.close();
      } catch (_e) { /* ignore */ }
    };
  }, []);

  if (!blocked) return null;

  const handleTakeOver = () => {
    const myId = tabIdRef.current;
    // اطلب من التبويب الآخر أن يُغلق نفسه
    try {
      channelRef.current && channelRef.current.postMessage({ type: "TAKEOVER", tabId: myId });
    } catch (_e) { /* ignore */ }
    // اكتب ملكيتي وأعد التحميل — بذلك يفقد التبويب الآخر ملكيته أيضاً (heartbeat يتجاوز)
    writeActiveTab(myId);
    setTimeout(() => {
      window.location.reload();
    }, 200);
  };

  const handleClose = () => {
    // حاول الإغلاق (يعمل فقط لو التبويب فُتح عبر window.open — وإلا يوجّه لشاشة الدخول)
    try {
      window.close();
    } catch (_e) { /* ignore */ }
    // احتياطي: إعادة توجيه لصفحة فارغة داخل نفس النطاق
    setTimeout(() => {
      window.location.href = "about:blank";
    }, 100);
  };

  return (
    <div
      dir="rtl"
      data-testid="single-tab-block-overlay"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483647,
        background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
      }}
    >
      <div
        style={{
          background: "#0b1220",
          color: "#f8fafc",
          border: "1px solid rgba(234,179,8,0.35)",
          borderRadius: 20,
          maxWidth: 480,
          width: "100%",
          padding: "32px 28px",
          textAlign: "center",
          boxShadow: "0 20px 60px rgba(0,0,0,0.55), 0 0 0 1px rgba(234,179,8,0.08)",
          fontFamily: "inherit",
        }}
      >
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            margin: "0 auto 20px",
            background: "linear-gradient(135deg,#eab308,#f59e0b)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 34,
            color: "#0b1220",
            fontWeight: 900,
            boxShadow: "0 6px 22px rgba(234,179,8,0.35)",
          }}
        >
          ⚠️
        </div>
        <h2
          style={{
            margin: "0 0 12px",
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: 0.2,
          }}
        >
          النظام مفتوح بالفعل في نافذة أخرى
        </h2>
        <p
          style={{
            margin: "0 0 22px",
            fontSize: 15,
            lineHeight: 1.75,
            color: "#cbd5e1",
          }}
        >
          لضمان دقة المحاسبة والورديات، لا يُسمح بفتح Maestro EGP في أكثر من تبويب أو نافذة على نفس الجهاز.
          <br />
          يمكنك متابعة العمل في النافذة الأصلية، أو نقل الجلسة إلى هنا.
        </p>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <button
            data-testid="single-tab-takeover-btn"
            onClick={handleTakeOver}
            style={{
              background: "linear-gradient(135deg,#eab308,#f59e0b)",
              color: "#0b1220",
              border: "none",
              borderRadius: 12,
              padding: "12px 20px",
              fontSize: 15,
              fontWeight: 800,
              cursor: "pointer",
              boxShadow: "0 6px 16px rgba(234,179,8,0.28)",
            }}
          >
            استخدام هنا وإغلاق النافذة الأخرى
          </button>
          <button
            data-testid="single-tab-close-btn"
            onClick={handleClose}
            style={{
              background: "transparent",
              color: "#94a3b8",
              border: "1px solid rgba(148,163,184,0.35)",
              borderRadius: 12,
              padding: "10px 20px",
              fontSize: 14,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            إغلاق هذا التبويب
          </button>
        </div>
        <p
          style={{
            margin: "18px 0 0",
            fontSize: 12,
            color: "#64748b",
          }}
        >
          Maestro EGP — حماية الجلسة
        </p>
      </div>
    </div>
  );
}
