import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2, Utensils, Scissors, Stethoscope, ShoppingCart, Truck, Package,
  Factory, Plus, ChevronDown, Star, BarChart3, ClipboardList, Grid, LayoutGrid,
  Users, Wallet, Boxes, Receipt, Phone, Headphones, UserSquare2, CalendarRange,
  Bell, ArrowLeftCircle, Eye, Store, Tag, Bike, ShieldCheck, Zap, Gift,
  ArrowUp, ArrowDown, Lock, Sun, Moon, Monitor, Search, Filter, MapPin,
  User, Clock, CheckCircle2, XCircle, AlertTriangle, Coins, TrendingUp, TrendingDown,
  MessageSquare, ThumbsUp, PhoneCall, PhoneIncoming, PhoneOutgoing, PhoneMissed,
  Printer, FileText, ChefHat
} from "lucide-react";
import { PAGE_MAP, MockGeneric } from "./EnterpriseMockPages";

/**
 * معاينة "وضع المؤسسة" — نسخ طبق الأصل من شاشات النظام الحقيقية
 * مع أسهم وتعليقات صفراء توضح مكان الميزات الجديدة
 * ملاحظة: هذه معاينة بصرية فقط، لا تتصل بأي API
 */

const ACTIVITIES = [
  { key: "restaurant", label: "مطعم / كافيه", Icon: Utensils, color: "#F5B84E" },
  { key: "salon", label: "صالون / حلاقة", Icon: Scissors, color: "#EC4899" },
  { key: "clinic", label: "عيادة طبية", Icon: Stethoscope, color: "#3B82F6" },
  { key: "supermarket", label: "سوبر ماركت", Icon: ShoppingCart, color: "#10B981" },
  { key: "distribution", label: "توزيع مواد غذائية", Icon: Truck, color: "#8B5CF6" },
  { key: "delivery", label: "شركة توصيل", Icon: Package, color: "#F97316" },
  { key: "retail", label: "متجر تجزئة", Icon: Tag, color: "#06B6D4" },
  { key: "manufacturing", label: "مصنع / إنتاج", Icon: Factory, color: "#EF4444" },
];

// ═══════════════════════════════════════════════════════════════
// Annotation Arrow + Callout — يظهر فوق أي عنصر
// ═══════════════════════════════════════════════════════════════
const Note = ({ children, side = "left", strong = false }) => (
  <div className={`relative ${side === "left" ? "ms-0 me-auto" : "me-0 ms-auto"}`}>
    <div className={`relative rounded-lg px-3 py-2 text-xs font-bold shadow-lg ${strong ? "bg-[#F5B84E] text-[#0D1A2E]" : "bg-[#F5B84E]/95 text-[#0D1A2E]"}`}>
      {children}
      <div className={`absolute w-3 h-3 rotate-45 bg-[#F5B84E] top-1/2 -translate-y-1/2 ${side === "left" ? "-end-1" : "-start-1"}`} />
    </div>
  </div>
);

// ═══════════════════════════════════════════════════════════════
// شاشة 6: المخزن والتصنيع مع التعليقات
// ═══════════════════════════════════════════════════════════════
function RealWarehouseAnnotated() {
  const rawMaterials = [
    { name: "لحم بقر", qty: "45 كغ", cost: "12,000/كغ", project: "GRaffiti BURGER", low: false },
    { name: "أرز", qty: "80 كغ", cost: "2,500/كغ", project: "GRaffiti BURGER", low: false },
    { name: "زيت زيتون", qty: "5 لتر", cost: "8,000/لتر", project: "GRaffiti BURGER", low: true },
    { name: "شامبو محترف", qty: "12 قنينة", cost: "15,000/قنينة", project: "صالون الحلاقة", low: false },
    { name: "صبغة شعر", qty: "6 عبوة", cost: "22,000/عبوة", project: "صالون الحلاقة", low: true },
    { name: "أدوات فحص أسنان", qty: "50 قطعة", cost: "5,000/قطعة", project: "عيادة الأسنان", low: false },
  ];
  const products = [
    { name: "برجر لحم", raw: "لحم + خبز + جبن", cost: "3,200", project: "GRaffiti BURGER" },
    { name: "صبغة كاملة (خدمة)", raw: "صبغة شعر + شامبو", cost: "45,000", project: "صالون الحلاقة" },
    { name: "فحص أسنان شامل", raw: "أدوات + مواد تعقيم", cost: "15,000", project: "عيادة الأسنان" },
  ];
  return (
    <div className="bg-[#0D1A2E] p-6 rounded-2xl border border-[#253959]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-2xl font-bold text-white text-end">المخزن والتصنيع</p>
          <p className="text-xs text-slate-400 text-end">إدارة المواد الخام والمنتجات المصنّعة</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
          <Boxes className="w-5 h-5 text-blue-400" />
        </div>
      </div>

      {/* Selector annotation */}
      <div className="relative mb-6">
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 rounded-xl bg-[#16263F] border-2 border-amber-400 shadow-[0_0_15px_rgba(245,184,78,0.2)]">
            <p className="text-[10px] text-slate-400 mb-1">تصفية حسب المشروع</p>
            <div className="flex items-center gap-2">
              <select className="bg-transparent text-white text-sm flex-1 outline-none">
                <option>كل المشاريع (موحّد)</option>
                <option>GRaffiti BURGER</option>
                <option>صالون الحلاقة</option>
                <option>عيادة الأسنان</option>
              </select>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-[#16263F] border border-[#253959]">
            <p className="text-[10px] text-slate-400 mb-1">نوع الحركة</p>
            <select className="bg-transparent text-white text-sm w-full outline-none">
              <option>الكل</option>
              <option>مواد خام</option>
              <option>تصنيع</option>
            </select>
          </div>
          <div className="p-3 rounded-xl bg-[#16263F] border border-[#253959]">
            <p className="text-[10px] text-slate-400 mb-1">التاريخ</p>
            <input type="date" defaultValue="2026-07-20" className="bg-transparent text-white text-sm w-full outline-none" />
          </div>
        </div>
        <div className="absolute -bottom-16 start-0 z-20 max-w-sm">
          <Note strong>
            🎯 نفس المخزن الحالي — لكن الآن كل مادة خام / كل منتج مصنّع يعرف مشروعه.<br/>
            المواد الخام للصالون لا تظهر في مطعم البرجر، والعكس.
          </Note>
        </div>
      </div>

      <div className="h-16" />

      {/* Two sections: raw materials + manufactured products */}
      <div className="grid grid-cols-2 gap-4">
        {/* Raw Materials */}
        <div className="bg-[#16263F] rounded-2xl border border-[#253959] overflow-hidden">
          <div className="p-3 border-b border-[#253959] bg-blue-500/10 flex items-center justify-between">
            <p className="text-sm font-bold text-blue-300">📦 المواد الخام</p>
            <span className="text-[10px] text-slate-400">{rawMaterials.length} مادة</span>
          </div>
          <div className="divide-y divide-[#253959]">
            {rawMaterials.map((m, i) => (
              <div key={i} className="p-3 flex items-center gap-2 hover:bg-[#0D1A2E]/40">
                <div className={`w-2 h-2 rounded-full ${m.low ? "bg-red-400 shadow-[0_0_8px_currentColor]" : "bg-emerald-400"}`} />
                <div className="flex-1">
                  <p className="text-sm text-white font-semibold">{m.name}</p>
                  <p className="text-[10px] text-slate-400">
                    <span className="inline-block px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 me-1 font-bold">🏢 {m.project}</span>
                    {m.qty} • {m.cost}
                  </p>
                </div>
                {m.low && <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold">نقص!</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Manufactured products */}
        <div className="bg-[#16263F] rounded-2xl border border-[#253959] overflow-hidden">
          <div className="p-3 border-b border-[#253959] bg-purple-500/10 flex items-center justify-between">
            <p className="text-sm font-bold text-purple-300">🏭 المنتجات المصنّعة / الوصفات</p>
            <span className="text-[10px] text-slate-400">{products.length} منتج</span>
          </div>
          <div className="divide-y divide-[#253959]">
            {products.map((p, i) => (
              <div key={i} className="p-3 hover:bg-[#0D1A2E]/40">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm text-white font-semibold">{p.name}</p>
                  <p className="text-sm text-amber-400 font-bold">{p.cost} د.ع</p>
                </div>
                <p className="text-[10px] text-slate-400">
                  <span className="inline-block px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 me-1 font-bold">🏢 {p.project}</span>
                  مكونات: {p.raw}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Highlight card */}
      <div className="mt-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
        <p className="text-emerald-400 text-sm font-bold mb-2">🔒 عزل تام بين مخازن المشاريع:</p>
        <div className="grid grid-cols-3 gap-2 text-xs text-emerald-200">
          <p>• مطعم البرجر يحرك مخزونه فقط</p>
          <p>• الصالون يحرك مخزونه فقط</p>
          <p>• العيادة تحرك مخزونها فقط</p>
          <p>• التصنيع في كل مشروع مستقل</p>
          <p>• الوصفات مرتبطة بمنتجات مشروعها</p>
          <p>• التقارير المالية تفصل حسب المشروع</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// شاشة 1: Dashboard الحقيقية مع التعليقات + تفاعل ديناميكي
// (شعار المؤسسة الأم في الأعلى، يتغير حسب اختيار المشروع من الفلتر)
// ═══════════════════════════════════════════════════════════════
function RealDashboardAnnotated() {
  // قائمة المشاريع (كل مشروع: اسم + شعار + لون + إحصائيات)
  const PROJECTS = {
    "all": { name: "مؤسسة مايسترو", subtitle: "كل المشاريع", logo: "M", logoBg: "linear-gradient(135deg,#F5B84E 0%,#C78B28 100%)", logoText: "#0D1A2E", stats: { orders: 483, ratings: 92, expenses: 47, calls: 128, kitchen: 22, notif: 8, hr: 87 } },
    "graffiti": { name: "GRaffiti BURGER", subtitle: "مطعم / كافيه", logo: "G.B", logoBg: "linear-gradient(135deg,#F97316 0%,#EA580C 100%)", logoText: "#FFFFFF", stats: { orders: 149, ratings: 34, expenses: 18, calls: 42, kitchen: 12, notif: 3, hr: 42 } },
    "salon": { name: "صالون الحلاقة الملكي", subtitle: "صالون تجميل", logo: "SL", logoBg: "linear-gradient(135deg,#EC4899 0%,#BE185D 100%)", logoText: "#FFFFFF", stats: { orders: 68, ratings: 21, expenses: 9, calls: 31, kitchen: 0, notif: 2, hr: 14 } },
    "clinic": { name: "عيادة الأسنان", subtitle: "عيادة طبية", logo: "MD", logoBg: "linear-gradient(135deg,#3B82F6 0%,#1D4ED8 100%)", logoText: "#FFFFFF", stats: { orders: 24, ratings: 12, expenses: 5, calls: 18, kitchen: 0, notif: 1, hr: 9 } },
    "delivery": { name: "توصيل مايسترو", subtitle: "شركة توصيل (Toters-Style)", logo: "DL", logoBg: "linear-gradient(135deg,#F97316 0%,#C2410C 100%)", logoText: "#FFFFFF", stats: { orders: 94, ratings: 15, expenses: 4, calls: 22, kitchen: 0, notif: 2, hr: 22 } },
  };

  const [selectedProj, setSelectedProj] = useState("all");
  const [openTile, setOpenTile] = useState(null);
  const proj = PROJECTS[selectedProj];

  // شارات الأيقونات بناء على المشروع المختار
  const quickActions = [
    { label: "التقييمات", color: "#F59E0B", Icon: Star, badge: proj.stats.ratings, badgeLabel: "تقييم" },
    { label: "التقارير", color: "#F59E0B", Icon: BarChart3, badge: null },
    { label: "شاشة المطبخ", color: "#F59E0B", Icon: Monitor, badge: proj.stats.kitchen, badgeLabel: "قيد التحضير" },
    { label: "الطلبات", color: "#F59E0B", Icon: ClipboardList, badge: proj.stats.orders, badgeLabel: "طلب" },
    { label: "الطاولات", color: "#F59E0B", Icon: Grid, badge: null },
    { label: "نقطة البيع", color: "#F97316", Icon: Store, badge: null },
    { label: "تقارير المخزون", color: "#8B5CF6", Icon: BarChart3, badge: null },
    { label: "طلبات الفروع", color: "#10B981", Icon: Boxes, badge: 5, badgeLabel: "جديد" },
    { label: "المخزن والتصنيع", color: "#3B82F6", Icon: Factory, badge: 3, badgeLabel: "منخفض" },
    { label: "تقرير المشتريات الخارجية", color: "#3B82F6", Icon: Receipt, badge: null },
    { label: "المشتريات", color: "#3B82F6", Icon: ShoppingCart, badge: null },
    { label: "المصاريف", color: "#EF4444", Icon: Wallet, badge: proj.stats.expenses, badgeLabel: "مصروف" },
    { label: "سجل المكالمات", color: "#14B8A6", Icon: Phone, badge: proj.stats.calls, badgeLabel: "مكالمة" },
    { label: "لوحة كول سنتر", color: "#3B82F6", Icon: Headphones, badge: 2, badgeLabel: "نشطة" },
    { label: "الموارد البشرية", color: "#10B981", Icon: UserSquare2, badge: proj.stats.hr, badgeLabel: "موظف" },
    { label: "الحجوزات", color: "#EF4444", Icon: CalendarRange, badge: 7, badgeLabel: "اليوم" },
    { label: "التوصيل", color: "#F97316", Icon: Bike, badge: 12, badgeLabel: "قيد التوصيل" },
    { label: "تقرير زيادة الأسعار", color: "#EF4444", Icon: ArrowUp, badge: null },
    { label: "الإعدادات", color: "#94A3B8", Icon: Store, badge: null },
    { label: "الفروع الخارجية", color: "#3B82F6", Icon: Store, badge: null },
    { label: "إدارة الطلبات والكابتن", color: "#F97316", Icon: Users, badge: null },
    { label: "خزينة المالك", color: "#F59E0B", Icon: Wallet, badge: null },
    { label: "الكوبونات", color: "#EC4899", Icon: Gift, badge: 4, badgeLabel: "نشط" },
    { label: "برنامج الولاء", color: "#EC4899", Icon: Gift, badge: null },
  ];

  return (
    <div className="bg-[#0D1A2E] p-6 rounded-2xl border border-[#253959]">
      {/* Header — الشعار والاسم للمؤسسة، يتغير حسب المشروع المختار */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3 relative">
        <div className="flex items-center gap-3 relative">
          {/* الشعار الديناميكي */}
          <div className="w-16 h-16 rounded-full flex items-center justify-center border-2 border-white/10 shadow-[0_0_30px_rgba(245,184,78,0.3)] transition-all duration-500" style={{ background: proj.logoBg }}>
            <p className="font-black text-sm" style={{ color: proj.logoText }}>{proj.logo}</p>
          </div>
          <div className="text-end">
            <p className="text-white font-bold text-xl transition-all">{proj.name}</p>
            <p className="text-slate-400 text-xs">{proj.subtitle} • مرحباً معتز مهنا</p>
          </div>
          {/* تعليق على الشعار */}
          <div className="absolute -bottom-16 start-0 z-30 max-w-xs">
            <Note strong>
              🎯 الشعار والاسم في الأعلى = المؤسسة (مؤسسة مايسترو). عند اختيار مشروع من الفلتر ← يتحول للشعار واسم المشروع تلقائياً.
            </Note>
          </div>
        </div>

        {/* المنسدلة الجديدة والأزرار */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <div className="flex items-center gap-1 bg-amber-500/15 border-2 border-amber-500 rounded-full ps-2 pe-1 py-1.5 shadow-[0_0_25px_rgba(245,184,78,0.4)]">
              <div className="flex items-center gap-1 border-e border-amber-500/40 pe-2">
                <Building2 className="w-3.5 h-3.5 text-amber-400" />
                <select
                  value={selectedProj}
                  onChange={(e) => setSelectedProj(e.target.value)}
                  data-testid="preview-project-dropdown"
                  className="bg-transparent text-white text-[11px] font-bold outline-none cursor-pointer"
                >
                  <option value="all">كل المشاريع (المؤسسة)</option>
                  <option value="graffiti">GRaffiti BURGER</option>
                  <option value="salon">صالون الحلاقة الملكي</option>
                  <option value="clinic">عيادة الأسنان</option>
                  <option value="delivery">توصيل مايسترو</option>
                </select>
              </div>
              <select className="bg-transparent text-white text-[11px] outline-none cursor-pointer">
                <option>جميع الفروع</option>
                <option>Al-Jadriya</option>
                <option>Al sidyah</option>
                <option>Al Yarmouk</option>
              </select>
              <ChevronDown className="w-3 h-3 text-white" />
            </div>
            <div className="absolute -bottom-16 end-0 z-30 max-w-xs">
              <Note strong>
                💡 جرّب الآن: اختر مشروعاً من المنسدلة ← ستشاهد الشعار والأرقام تتغير كلها ديناميكياً.
              </Note>
            </div>
          </div>

          <button className="px-3 py-1.5 rounded-full border-2 border-emerald-500 text-emerald-400 text-[11px] font-semibold">قائمة العملاء</button>
          <button className="px-3 py-1.5 rounded-full border-2 border-orange-500 text-orange-400 text-[11px] font-semibold">إغلاق الصندوق</button>
          <button className="px-3 py-1.5 rounded-full border-2 border-pink-500 text-pink-400 text-[11px] font-semibold">الخلفيات</button>
          <div className="w-9 h-9 rounded-full bg-[#16263F] border border-[#253959] flex items-center justify-center"><Sun className="w-4 h-4 text-slate-400" /></div>
          <div className="w-9 h-9 rounded-full bg-[#16263F] border border-[#253959] flex items-center justify-center relative">
            <Bell className="w-4 h-4 text-slate-400" />
            <span className="absolute -top-1 -end-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-black">{proj.stats.notif}</span>
          </div>
        </div>
      </div>

      {/* Spacer */}
      <div className="h-20" />

      {/* Quick Actions */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-white text-2xl font-bold">الإجراءات السريعة</p>
        <p className="text-xs text-slate-500">اضغط مطولاً لإعادة ترتيب</p>
      </div>

      {/* Tiles مع شارات ديناميكية + نقر لعرض المحتوى */}
      <div className="grid grid-cols-6 gap-3">
        {quickActions.slice(0, 24).map((a, i) => {
          const { Icon } = a;
          return (
            <button key={i} onClick={() => setOpenTile(a)} className="relative p-4 rounded-2xl bg-[#101F36] border border-[#1F3355] hover:border-amber-400 hover:-translate-y-0.5 transition-all cursor-pointer text-start" data-testid={`tile-${i}`}>
              {/* شارة عدد العناصر */}
              {a.badge != null && a.badge > 0 && (
                <div className="absolute top-2 end-2 min-w-[22px] h-[22px] px-1.5 rounded-full flex items-center justify-center text-[10px] font-black shadow-lg z-10" style={{ background: a.color, color: "#fff", boxShadow: `0 0 10px ${a.color}80` }} title={a.badgeLabel}>
                  {a.badge > 999 ? "999+" : a.badge}
                </div>
              )}
              <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-2 shadow-[0_4px_10px_rgba(0,0,0,0.3)]" style={{ background: a.color }}>
                <Icon className="w-5 h-5 text-white" />
              </div>
              <p className="text-xs text-white leading-tight font-medium">{a.label}</p>
              {a.badge != null && a.badge > 0 && (
                <p className="text-[9px] text-slate-500 mt-1">{a.badge} {a.badgeLabel}</p>
              )}
            </button>
          );
        })}
      </div>

      {/* Modal يعرض نسخة الصفحة الحقيقية عند الضغط */}
      {openTile && (
        <div onClick={() => setOpenTile(null)} className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 backdrop-blur-sm" data-testid="tile-modal">
          <div onClick={(e) => e.stopPropagation()} className="max-w-6xl w-full max-h-[92vh] bg-[#0D1A2E] border-2 rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ borderColor: openTile.color }}>
            {/* Header */}
            <div className="p-4 border-b border-[#253959] flex items-center gap-3 bg-[#16263F]">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: openTile.color }}>
                <openTile.Icon className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1">
                <p className="text-white font-bold text-lg">{openTile.label}</p>
                <p className="text-xs text-slate-400 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/40 text-amber-400 font-bold">
                    🏢 {proj.name}
                  </span>
                  <span>معاينة الصفحة الحقيقية</span>
                </p>
              </div>
              <button onClick={() => setOpenTile(null)} className="w-9 h-9 rounded-full bg-[#0D1A2E] border border-[#253959] text-slate-400 hover:text-white hover:bg-red-500/20 transition-all">✕</button>
            </div>
            {/* Body — renders the mock page or generic fallback */}
            <div className="flex-1 overflow-y-auto p-4">
              {(() => {
                const PageComp = PAGE_MAP[openTile.label];
                if (PageComp) return <PageComp projectName={proj.name} />;
                return <MockGeneric projectName={proj.name} title={openTile.label} icon={openTile.Icon} color={openTile.color} />;
              })()}
            </div>
            <div className="p-3 border-t border-[#253959] bg-emerald-500/5">
              <p className="text-[10px] text-emerald-300 text-center">✅ هذه نسخة مطابقة لصفحتك الحقيقية — البيانات ديناميكية حسب المشروع المختار</p>
            </div>
          </div>
        </div>
      )}

      {/* Break-even alerts — متعدد المشاريع */}
      <div className="mt-6 flex items-center justify-between">
        <p className="text-white text-lg font-bold flex items-center gap-2"><Bell className="w-4 h-4 text-amber-400" /> تنبيهات نقطة التعادل — {selectedProj === "all" ? "كل المشاريع وفروعها" : proj.subtitle}</p>
        <p className="text-xs text-slate-500">عرض التفاصيل</p>
      </div>
      <div className={`grid gap-3 mt-3 ${selectedProj === "all" ? "grid-cols-2 md:grid-cols-4" : "grid-cols-3"}`}>
        {(selectedProj === "all" ? [
          { proj: "GRaffiti BURGER", branch: "Al Yarmouk", title: "تحقيق", pct: "167.1%", val: "+98K", color: "#10B981", icon: "✓" },
          { proj: "GRaffiti BURGER", branch: "Al sidyah", title: "اقتراب", pct: "83.4%", val: "-51K", color: "#F59E0B", icon: "⚠" },
          { proj: "GRaffiti BURGER", branch: "Al-Jadriya", title: "تقدم جيد", pct: "78.5%", val: "-98K", color: "#3B82F6", icon: "↗" },
          { proj: "صالون الحلاقة", branch: "الفرع الرئيسي", title: "تحقيق", pct: "142.0%", val: "+62K", color: "#10B981", icon: "✓" },
          { proj: "صالون الحلاقة", branch: "فرع الحمرا", title: "تقدم جيد", pct: "71.2%", val: "-28K", color: "#3B82F6", icon: "↗" },
          { proj: "عيادة الأسنان", branch: "المركز الطبي", title: "اقتراب", pct: "88.5%", val: "-15K", color: "#F59E0B", icon: "⚠" },
          { proj: "توصيل مايسترو", branch: "المكتب المركزي", title: "تحقيق", pct: "115.3%", val: "+45K", color: "#10B981", icon: "✓" },
          { proj: "توصيل مايسترو", branch: "منطقة الجادرية", title: "أقل من المتوقع", pct: "62.0%", val: "-42K", color: "#EF4444", icon: "⛔" },
        ] : [
          { proj: proj.name, branch: "Al Yarmouk", title: "تحقيق", pct: "167.1%", val: "+98K", color: "#10B981", icon: "✓" },
          { proj: proj.name, branch: "Al sidyah", title: "اقتراب", pct: "83.4%", val: "-51K", color: "#F59E0B", icon: "⚠" },
          { proj: proj.name, branch: "Al-Jadriya", title: "تقدم جيد", pct: "78.5%", val: "-98K", color: "#3B82F6", icon: "↗" },
        ]).map((c, i) => (
          <div key={i} className="p-3 rounded-xl border-2" style={{ borderColor: c.color, background: `linear-gradient(135deg, ${c.color}18 0%, ${c.color}05 100%)` }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px]" style={{ background: c.color }}>{c.icon}</div>
                <p className="text-[10px] font-bold text-white">{c.title}</p>
              </div>
            </div>
            <p className="text-[9px] font-bold text-amber-400 mb-0.5">🏢 {c.proj}</p>
            <p className="text-[10px] text-slate-400 mb-2">📍 {c.branch}</p>
            <div className="flex items-center justify-between pt-2 border-t border-white/5">
              <p className="text-sm font-bold" style={{ color: c.color }}>{c.val} IQD</p>
              <p className="text-[9px] text-slate-400">{c.pct}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Stats */}
      <div className="mt-6">
        <p className="text-white text-2xl font-bold mb-4">الإحصائيات — {proj.name}</p>
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "إجمالي المبيعات", val: selectedProj === "all" ? "5.8M IQD" : "1.9M IQD", color: "#10B981", Icon: Receipt },
            { label: "عدد الطلبات", val: proj.stats.orders, color: "#3B82F6", Icon: ShoppingCart },
            { label: "متوسط الطلب", val: "IQD 12,708", color: "#F59E0B", Icon: BarChart3 },
            { label: "صافي الربح", val: selectedProj === "all" ? "+IQD 380K" : "-IQD 124K", color: selectedProj === "all" ? "#10B981" : "#EF4444", Icon: selectedProj === "all" ? ArrowUp : ArrowDown },
          ].map((k, i) => (
            <div key={i} className="p-4 rounded-2xl bg-[#101F36] border border-[#1F3355] flex items-center justify-between">
              <div>
                <p className="text-xs text-slate-400 mb-1">{k.label}</p>
                <p className="text-lg font-bold" style={{ color: k.color }}>{k.val}</p>
              </div>
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${k.color}20` }}>
                <k.Icon className="w-4 h-4" style={{ color: k.color }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Final annotation with 3 key points */}
      <div className="mt-6 grid grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-amber-500/10 border-2 border-amber-500/40">
          <p className="text-amber-400 text-xs font-bold mb-1">🎨 الشعار والاسم</p>
          <p className="text-[10px] text-amber-200 leading-relaxed">في الأعلى = شعار المؤسسة الأم. يتغير للمشروع المختار عند الاختيار من الفلتر.</p>
        </div>
        <div className="p-3 rounded-xl bg-emerald-500/10 border-2 border-emerald-500/40">
          <p className="text-emerald-400 text-xs font-bold mb-1">🔢 شارات الأيقونات</p>
          <p className="text-[10px] text-emerald-200 leading-relaxed">كل أيقونة تعرض عدد العناصر داخلها (طلبات، مصاريف، تقييمات). الأرقام تتغير حسب المشروع.</p>
        </div>
        <div className="p-3 rounded-xl bg-blue-500/10 border-2 border-blue-500/40">
          <p className="text-blue-400 text-xs font-bold mb-1">⚡ تفاعل ديناميكي</p>
          <p className="text-[10px] text-blue-200 leading-relaxed">اختر مشروعاً من المنسدلة العلوية الآن → كل الأرقام والشعار يتغيرون فوراً بدون إعادة تحميل الصفحة.</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// شاشة 2: Reports Page مع التعليقات
// ═══════════════════════════════════════════════════════════════
function RealReportsAnnotated() {
  return (
    <div className="bg-[#0D1A2E] p-6 rounded-2xl border border-[#253959]">
      {/* Reports header — replica */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-2xl font-bold text-white text-end">التقارير</p>
          <p className="text-xs text-slate-400 text-end">تقارير شاملة للمبيعات والمصاريف والأرباح</p>
        </div>
        <div className="w-9 h-9 rounded-full bg-[#16263F] border border-[#253959] flex items-center justify-center">
          <ArrowLeftCircle className="w-4 h-4 text-slate-400" />
        </div>
      </div>

      {/* Filter row with NEW 2-level selector */}
      <div className="grid grid-cols-3 gap-4 mb-6 relative">
        <div className="relative">
          <label className="text-xs text-slate-400 mb-1 block">الفرع</label>
          <div className="flex items-center gap-2 bg-[#16263F] border-2 border-amber-400 rounded-lg p-2 shadow-[0_0_15px_rgba(245,184,78,0.2)]">
            <select className="bg-transparent text-white text-sm flex-1 outline-none">
              <option>GRaffiti BURGER</option>
              <option>كل المشاريع</option>
            </select>
            <span className="text-amber-400">▸</span>
            <select className="bg-transparent text-white text-sm flex-1 outline-none">
              <option>جميع الفروع</option>
              <option>Al-Jadriya</option>
              <option>Al sidyah</option>
              <option>Al Yarmouk</option>
            </select>
          </div>
          <div className="absolute -bottom-16 start-0 z-20 max-w-xs">
            <Note strong>
              🎯 نفس الفلتر الحالي «الفرع»، لكن يصبح مستويين. لما تختار «كل المشاريع» → التقرير يُجمّع كل المشاريع.
            </Note>
          </div>
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">من تاريخ</label>
          <input type="date" defaultValue="2026-07-20" className="w-full bg-[#16263F] border border-[#253959] rounded-lg p-2 text-white text-sm" />
        </div>
        <div>
          <label className="text-xs text-slate-400 mb-1 block">إلى تاريخ</label>
          <input type="date" defaultValue="2026-07-20" className="w-full bg-[#16263F] border border-[#253959] rounded-lg p-2 text-white text-sm" />
        </div>
      </div>

      <div className="h-14" />

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#253959] mb-4 overflow-x-auto pb-1">
        {["التقرير الشامل", "المبيعات", "المصاريف", "الأرباح", "الأصناف", "التوصيل", "إغلاق الصندوق", "الإلغاءات", "الخصومات", "المرتجعات", "الأجل"].map((t, i) => (
          <span key={i} className={`text-xs px-3 py-2 whitespace-nowrap ${i === 0 ? "text-emerald-400 border-b-2 border-emerald-400" : "text-slate-400"}`}>{t}</span>
        ))}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-3 mb-4">
        {[
          { label: "إجمالي المبيعات", val: "1,893,563 IQD", color: "#10B981" },
          { label: "عدد الطلبات", val: "149", color: "#3B82F6" },
          { label: "إجمالي الأرباح", val: "1,213,703 IQD", color: "#F59E0B" },
          { label: "إجمالي التكاليف", val: "679,860 IQD", color: "#EF4444" },
        ].map((k, i) => (
          <div key={i} className="p-4 rounded-xl bg-[#16263F] border border-[#253959]">
            <p className="text-xs text-slate-400 mb-1">{k.label}</p>
            <p className="text-lg font-bold" style={{ color: k.color }}>{k.val}</p>
          </div>
        ))}
      </div>

      <div className="relative">
        <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
          <p className="text-emerald-400 font-bold text-sm">📊 التقرير أعلاه يتغير حسب المشروع/الفرع المختار من الأعلى — بدون تعديل تصميم الصفحة</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// شاشة 3: Owner Wallet مع التعليقات
// ═══════════════════════════════════════════════════════════════
function RealOwnerWalletAnnotated() {
  const branches = [
    { name: "المطبخ المركزي", type: "مصدر خارجي", deposits: "0 IQD", ops1: 0, withdrawals: "171,000 IQD", ops2: 1, balance: "171,000-", negative: true },
    { name: "Al sidyah", type: "فرع", deposits: "208,500 IQD", ops1: 17, withdrawals: "15,750 IQD", ops2: 1, balance: "192,750", negative: false },
    { name: "Al-Jadriya", type: "فرع", deposits: "2,126,750 IQD", ops1: 24, withdrawals: "0 IQD", ops2: 0, balance: "2,126,750", negative: false },
    { name: "Al Yarmouk", type: "فرع", deposits: "2,635,750 IQD", ops1: 11, withdrawals: "0 IQD", ops2: 0, balance: "2,635,750", negative: false },
  ];

  return (
    <div className="bg-[#0D1A2E] p-6 rounded-2xl border border-[#253959]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-2xl font-bold text-white text-end">خزينة المالك</p>
          <p className="text-xs text-slate-400 text-end">إدارة الحساب الشخصي</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center">
          <Wallet className="w-5 h-5 text-orange-400" />
        </div>
      </div>

      {/* KPIs — same as user's screenshot */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <div className="p-4 rounded-xl bg-emerald-500/15 border border-emerald-500/40">
          <p className="text-xs text-emerald-300 mb-1">إجمالي الإيداعات</p>
          <p className="text-lg font-bold text-emerald-400">103,637,961 IQD</p>
          <p className="text-[10px] text-emerald-200 mt-1">142 عملية</p>
        </div>
        <div className="p-4 rounded-xl bg-pink-500/15 border border-pink-500/40">
          <p className="text-xs text-pink-300 mb-1">إجمالي السحوبات</p>
          <p className="text-lg font-bold text-pink-400">57,198,236 IQD</p>
          <p className="text-[10px] text-pink-200 mt-1">99 عملية</p>
        </div>
        <div className="p-4 rounded-xl bg-blue-500/15 border border-blue-500/40">
          <p className="text-xs text-blue-300 mb-1">الرصيد المتاح</p>
          <p className="text-lg font-bold text-blue-400">46,439,725 IQD</p>
          <p className="text-[10px] text-blue-200 mt-1">للسحب أو التحويل</p>
        </div>
        <div className="p-4 rounded-xl bg-orange-500/15 border border-orange-500/40">
          <p className="text-xs text-orange-300 mb-1">الخزينة الشخصية</p>
          <p className="text-lg font-bold text-orange-400">0 IQD</p>
          <p className="text-[10px] text-orange-200 mt-1">صافي الأرباح المحولة</p>
        </div>
      </div>

      {/* Branch balances section with annotation */}
      <div className="flex items-center justify-between mb-3 relative">
        <p className="text-white font-bold text-lg text-end">أرصدة الفروع / المصادر <span className="text-slate-500 text-xs">5</span></p>
        <div className="absolute -top-4 start-0 max-w-xs">
          <Note strong>
            🎯 لما تختار «كل المشاريع» من الأعلى → تشوف كل الفروع من كل المشاريع مجمّعة هنا (بدون تعديل تصميم الصفحة)
          </Note>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        {branches.map((b, i) => (
          <div key={i} className={`p-4 rounded-xl border-2 ${b.negative ? "border-red-500/40 bg-red-500/5" : "border-emerald-500/30 bg-[#16263F]"}`}>
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-sm font-bold text-white">{b.name}</p>
                <p className="text-[10px] text-slate-400">{b.type}</p>
              </div>
              {b.negative && <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-500 text-white font-bold">سالب!</span>}
            </div>
            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#253959]">
              <div>
                <p className="text-[9px] text-emerald-400">↓ إيداعات</p>
                <p className="text-xs font-bold text-emerald-300">{b.deposits}</p>
                <p className="text-[9px] text-slate-500">{b.ops1} عملية</p>
              </div>
              <div>
                <p className="text-[9px] text-red-400">↑ سحوبات</p>
                <p className="text-xs font-bold text-red-300">{b.withdrawals}</p>
                <p className="text-[9px] text-slate-500">{b.ops2} عملية</p>
              </div>
            </div>
            <div className="mt-2 pt-2 border-t border-[#253959]">
              <p className="text-[9px] text-slate-400">الرصيد المتاح</p>
              <p className={`text-sm font-bold ${b.negative ? "text-red-400" : "text-emerald-400"}`}>{b.balance} IQD</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// شاشة 4: Settings > Branches → NEW "Projects" tab
// ═══════════════════════════════════════════════════════════════
function RealSettingsAnnotated() {
  const tabs = ["المظهر", "المطعم", "المستخدمين", "العملاء", "الفروع", "المشاريع", "الفئات", "المنتجات", "الطابعات", "شركات التوصيل", "الكول سنتر", "الإشعارات"];
  return (
    <div className="bg-[#0D1A2E] p-6 rounded-2xl border border-[#253959]">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-2xl font-bold text-white text-end">الإعدادات</p>
          <p className="text-xs text-slate-400 text-end">إدارة النظام والمستخدمين</p>
        </div>
        <div className="w-9 h-9 rounded-full bg-[#16263F] border border-[#253959] flex items-center justify-center">
          <ArrowLeftCircle className="w-4 h-4 text-slate-400" />
        </div>
      </div>

      {/* Tabs row — replica */}
      <div className="relative mb-6">
        <div className="flex flex-wrap gap-2 pb-3 border-b border-[#253959]">
          {tabs.map((t, i) => {
            const isNew = t === "المشاريع";
            return (
              <div key={i} className={`px-3 py-2 rounded-lg text-xs relative ${isNew ? "bg-amber-500 text-[#0D1A2E] font-bold shadow-[0_0_20px_rgba(245,184,78,0.4)]" : "text-slate-300 bg-[#16263F]"}`}>
                {t}
                {isNew && (
                  <>
                    <span className="absolute -top-2 -end-2 w-5 h-5 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-black">🆕</span>
                    <div className="absolute -bottom-14 start-0 z-20 w-56">
                      <Note strong>
                        🎯 التبويب الوحيد الجديد في كل الإعدادات — نسخة من تبويب «الفروع» تماماً، لكن لإدارة المشاريع.
                      </Note>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="h-14" />

      {/* Projects tab content */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-white font-bold text-lg text-end">إدارة المشاريع</p>
        <button className="px-4 py-2 rounded-full bg-amber-500 text-[#0D1A2E] font-bold text-xs flex items-center gap-2">
          <Plus className="w-3.5 h-3.5" /> إضافة مشروع
        </button>
      </div>

      <div className="space-y-2">
        {[
          { name: "GRaffiti BURGER", activity: "restaurant", branches: 3, note: "المشروع الحالي (تم تحويله تلقائياً بدون فقدان بيانات)" },
          { name: "صالون الحلاقة الملكي", activity: "salon", branches: 2, note: "مشروع جديد أُضيف بعد التفعيل" },
          { name: "عيادة الأسنان", activity: "clinic", branches: 1, note: "مشروع جديد" },
        ].map((p, i) => {
          const meta = ACTIVITIES.find(a => a.key === p.activity);
          const { Icon } = meta;
          return (
            <div key={i} className="flex items-center gap-3 p-4 rounded-xl bg-[#16263F] border border-[#253959] hover:border-amber-400/40">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `${meta.color}15`, border: `1px solid ${meta.color}40` }}>
                <Icon className="w-5 h-5" style={{ color: meta.color }} />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-white">{p.name}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{meta.label} • {p.branches} فرع • {p.note}</p>
              </div>
              <button className="px-3 py-1 rounded-md bg-[#0D1A2E] border border-[#253959] text-xs text-slate-300">تعديل</button>
              <button className="px-3 py-1 rounded-md bg-[#0D1A2E] border border-[#253959] text-xs text-slate-300">رفع لوجو</button>
              <button className="px-3 py-1 rounded-md bg-[#0D1A2E] border border-[#253959] text-xs text-red-400">تعطيل</button>
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
        <p className="text-emerald-400 text-sm font-bold mb-1">🛡️ الحماية:</p>
        <p className="text-xs text-emerald-200 leading-relaxed">تعطيل مشروع لا يحذف بياناته — فقط يخفيه من القوائم. إعادة تفعيله تُرجع كل شيء كما كان. لا يمكن حذف المشروع الأول (الافتراضي).</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// شاشة 5: نظرة كاملة على "قبل / بعد"
// ═══════════════════════════════════════════════════════════════
function BeforeAfterOverview() {
  const items = [
    { area: "Header العلوي", before: "GRaffiti BURGER + قائمة «جميع الفروع»", after: "GRaffiti BURGER + قائمة «مشروع ← فرع» (مستويين)" },
    { area: "التقارير", before: "فلتر «الفرع» + من/إلى تاريخ", after: "فلتر «مشروع ← فرع» + من/إلى تاريخ (نفس التصميم)" },
    { area: "خزينة المالك", before: "أرصدة فروع المطعم فقط", after: "أرصدة فروع كل المشاريع (تُصفَّى تلقائياً حسب الاختيار)" },
    { area: "الإعدادات > التبويبات", before: "المظهر • المطعم • المستخدمين • العملاء • الفروع • ...", after: "نفس التبويبات + تبويب واحد جديد «المشاريع»" },
    { area: "الشعار / اسم المشروع", before: "شعار GRaffiti + اسمه بالأعلى", after: "شعار المشروع المختار + اسمه (يتغير حسب الاختيار)" },
    { area: "الموظفون", before: "كل موظف مرتبط بفرع", after: "كل موظف مرتبط بمشروع + فرع (يشوف مشروعه فقط)" },
    { area: "شركة توصيل (نشاط جديد)", before: "غير موجودة", after: "شاشات Marketplace خاصة (تجار + سائقون + عمولات — مثل Toters)" },
    { area: "قاعدة البيانات", before: "الفروع تنتمي لتنانت", after: "الفروع تنتمي لمشروع، المشروع ينتمي لتنانت (Migration آمن)" },
  ];
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-sm">
        <p className="font-bold mb-1">📊 مقارنة تفصيلية «قبل» ↔ «بعد» لكل تغيير على النظام:</p>
      </div>
      <div className="bg-[#0D1A2E] rounded-2xl border border-[#253959] overflow-hidden">
        <div className="grid grid-cols-12 gap-2 p-3 bg-[#16263F] border-b border-[#253959] text-xs font-bold text-slate-400">
          <div className="col-span-3">الجزء</div>
          <div className="col-span-4 text-red-400">قبل التغيير</div>
          <div className="col-span-5 text-emerald-400">بعد التغيير (النتيجة النهائية)</div>
        </div>
        {items.map((it, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 p-3 border-b border-[#253959] text-xs items-center">
            <div className="col-span-3 text-white font-bold">{it.area}</div>
            <div className="col-span-4 text-slate-400">{it.before}</div>
            <div className="col-span-5 text-emerald-300">{it.after}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// Main Container
// ═══════════════════════════════════════════════════════════════
const TABS = [
  { key: "dashboard", label: "1. لوحة التحكم الرئيسية", Icon: LayoutGrid },
  { key: "reports", label: "2. صفحة التقارير", Icon: BarChart3 },
  { key: "wallet", label: "3. خزينة المالك", Icon: Wallet },
  { key: "warehouse", label: "4. المخزن والتصنيع", Icon: Boxes },
  { key: "settings", label: "5. الإعدادات > المشاريع", Icon: Store },
  { key: "overview", label: "6. مقارنة قبل/بعد (تفصيلي)", Icon: ShieldCheck },
];

export default function EnterprisePreview() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("dashboard");

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-[#0D1A2E] to-[#0A1526] text-white" data-testid="enterprise-preview-root">
      <div className="bg-gradient-to-l from-[#F5B84E]/20 to-[#F5B84E]/5 border-b border-[#F5B84E]/30 px-6 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-[#F5B84E]/20 border border-[#F5B84E]/40">
            <Eye className="w-4 h-4 text-[#F5B84E]" />
          </div>
          <div>
            <p className="text-sm font-bold text-[#F5B84E]">معاينة على شاشاتك الحقيقية — أسهم صفراء تحدد كل تعديل</p>
            <p className="text-[11px] text-slate-300">هذه نُسخ من صفحاتك الفعلية • لا اتصال بقاعدة البيانات • البيانات محاكاة لواقعك</p>
          </div>
        </div>
        <button onClick={() => navigate(-1)} className="px-4 py-2 rounded-full bg-[#0D1A2E] border border-[#253959] text-slate-300 hover:border-[#F5B84E]/50 text-sm flex items-center gap-2" data-testid="btn-back">
          <ArrowLeftCircle className="w-4 h-4" /> رجوع للنظام
        </button>
      </div>

      <div className="sticky top-0 z-30 bg-[#0D1A2E]/95 backdrop-blur-xl border-b border-[#253959] px-4 md:px-6">
        <div className="flex overflow-x-auto no-scrollbar gap-1 py-3">
          {TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              data-testid={`preview-tab-${key}`}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold flex items-center gap-2 transition-all ${
                tab === key ? "bg-[#F5B84E] text-[#0D1A2E]" : "text-slate-400 hover:text-white hover:bg-[#16263F]"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 md:p-8 pb-24">
        {tab === "dashboard" && <RealDashboardAnnotated />}
        {tab === "reports" && <RealReportsAnnotated />}
        {tab === "wallet" && <RealOwnerWalletAnnotated />}
        {tab === "warehouse" && <RealWarehouseAnnotated />}
        {tab === "settings" && <RealSettingsAnnotated />}
        {tab === "overview" && <BeforeAfterOverview />}
      </div>
    </div>
  );
}
