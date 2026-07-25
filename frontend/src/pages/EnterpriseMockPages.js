import React from "react";
import {
  Search, Plus, Filter, Building2, MapPin, ChefHat, ClipboardList,
  BarChart3, Wallet, Coins, TrendingUp, TrendingDown, Factory, Boxes,
  Users, User, Clock, CheckCircle2, XCircle, AlertTriangle, Bike, Phone,
  PhoneIncoming, PhoneOutgoing, PhoneMissed, Headphones, Star, ThumbsUp,
  Gift, Store, Printer, FileText, Receipt, CalendarRange, Grid, Monitor,
  ShoppingCart, ArrowUp, ArrowDown, ChevronDown, Scissors, Stethoscope, Package
} from "lucide-react";

/**
 * مكتبة نسخ الصفحات — كل مكوّن يعرض نسخة مطابقة لصفحة موجودة في النظام
 * مع فلتر المشروع الجديد في الأعلى ولافتة توضيح
 */

// شارة صفراء داخلية لكل صفحة
export const ProjectFilterBar = ({ projectName }) => (
  <div className="flex items-center justify-between mb-4 p-3 rounded-xl bg-amber-500/10 border-2 border-amber-500/40 flex-wrap gap-2">
    <div className="flex items-center gap-2">
      <Building2 className="w-4 h-4 text-amber-400" />
      <p className="text-xs text-amber-300 font-bold">فلتر المشروع النشط: {projectName}</p>
    </div>
    <p className="text-[10px] text-amber-200">🎯 نفس الصفحة الحالية — فقط تُصفَّى تلقائياً حسب المشروع المختار من القائمة العلوية</p>
  </div>
);

// 1) POS — يعرض منتجات المشروع المختار حسب النشاط
export const MockPOS = ({ projectName }) => {
  // خرائط المنتجات لكل نوع مشروع
  const PROJECT_ITEMS = {
    "GRaffiti BURGER": {
      categories: ["الكل","برجر","بيتزا","مشاوي","حلويات","مشروبات"],
      items: [
        {n:"برجر لحم",p:"12,000"},{n:"برجر دجاج",p:"10,000"},{n:"بيتزا مارغريتا",p:"15,000"},{n:"شاورما",p:"8,000"},
        {n:"كوكاكولا",p:"1,500"},{n:"ماء",p:"500"},{n:"سلطة",p:"4,000"},{n:"بطاطا",p:"3,000"},
      ],
      cart: [{n:"برجر لحم",q:2,p:"24,000"},{n:"كوكاكولا",q:2,p:"3,000"},{n:"بطاطا",q:1,p:"3,000"}],
      icon: ChefHat,
    },
    "صالون الحلاقة الملكي": {
      categories: ["الكل","حلاقة","صبغة","تصفيف","عناية بالبشرة","منتجات"],
      items: [
        {n:"حلاقة رجالي",p:"7,000"},{n:"حلاقة أطفال",p:"5,000"},{n:"صبغة كاملة",p:"45,000"},{n:"تصفيف عرائسي",p:"80,000"},
        {n:"مانيكير",p:"15,000"},{n:"بيديكير",p:"20,000"},{n:"تنظيف بشرة",p:"35,000"},{n:"حمام مغربي",p:"25,000"},
      ],
      cart: [{n:"صبغة كاملة",q:1,p:"45,000"},{n:"تصفيف عرائسي",q:1,p:"80,000"},{n:"حمام مغربي",q:1,p:"25,000"}],
      icon: Scissors,
    },
    "عيادة الأسنان": {
      categories: ["الكل","فحص","تنظيف","حشوات","تقويم","تركيبات"],
      items: [
        {n:"فحص عام",p:"25,000"},{n:"تنظيف أسنان",p:"50,000"},{n:"حشوة بيضاء",p:"75,000"},{n:"قلع سن",p:"40,000"},
        {n:"تقويم دائم",p:"1,500,000"},{n:"زراعة سن",p:"800,000"},{n:"تبييض",p:"180,000"},{n:"تركيبة بورسلين",p:"350,000"},
      ],
      cart: [{n:"فحص عام",q:1,p:"25,000"},{n:"تنظيف أسنان",q:1,p:"50,000"}],
      icon: Stethoscope,
    },
    "توصيل مايسترو": {
      categories: ["الكل","المطاعم الشريكة","الطلبات النشطة","تعيين سائق","السائقون"],
      items: [
        {n:"مطعم الشيف",p:"شراكة 15%"},{n:"برجر ماستر",p:"شراكة 18%"},{n:"بيتزا فورنو",p:"شراكة 20%"},{n:"مشاوي الحطب",p:"شراكة 17%"},
        {n:"طلب #1247",p:"12 كم"},{n:"طلب #1248",p:"5 كم"},{n:"طلب #1249",p:"8 كم"},{n:"طلب #1250",p:"3 كم"},
      ],
      cart: [{n:"طلب #1247 - علي محمد",q:1,p:"32,000"},{n:"عمولة (15%)",q:1,p:"4,800"}],
      icon: Package,
    },
    "مؤسسة مايسترو": {
      categories: ["كل المشاريع","GRaffiti BURGER","صالون الحلاقة","عيادة الأسنان","توصيل مايسترو"],
      items: [
        {n:"برجر لحم (مطعم)",p:"12,000"},{n:"صبغة كاملة (صالون)",p:"45,000"},{n:"فحص أسنان (عيادة)",p:"25,000"},{n:"طلب توصيل",p:"5,000"},
        {n:"بيتزا (مطعم)",p:"15,000"},{n:"مانيكير (صالون)",p:"15,000"},{n:"تنظيف (عيادة)",p:"50,000"},{n:"عمولة (توصيل)",p:"—"},
      ],
      cart: [{n:"من كل المشاريع",q:1,p:"—"}],
      icon: Store,
    },
  };
  const data = PROJECT_ITEMS[projectName] || PROJECT_ITEMS["GRaffiti BURGER"];
  const total = data.cart.reduce((s,i)=>{
    const price = parseInt(String(i.p).replace(/[^0-9]/g,''),10);
    if (isNaN(price)) return s;
    return s + price * i.q;
  }, 0);
  return (
    <div>
      <ProjectFilterBar projectName={projectName} />
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 bg-[#16263F] rounded-xl border border-[#253959] p-3">
          <div className="flex items-center gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute end-3 top-1/2 -translate-y-1/2" />
              <input placeholder={`بحث في ${projectName}...`} className="w-full pe-10 ps-3 py-2 bg-[#0D1A2E] border border-[#253959] rounded-lg text-sm text-white" />
            </div>
            <button className="px-3 py-2 rounded-lg bg-amber-500 text-[#0D1A2E] font-bold text-xs">+ جديد</button>
          </div>
          <div className="flex gap-2 mb-3 overflow-x-auto">
            {data.categories.map((c,i) => (
              <span key={i} className={`px-3 py-1.5 rounded-full text-[10px] whitespace-nowrap ${i===0 ? "bg-amber-500 text-[#0D1A2E] font-bold" : "bg-[#0D1A2E] text-slate-300 border border-[#253959]"}`}>{c}</span>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-2">
            {data.items.map((it,i) => {
              const Ic = data.icon;
              return (
                <div key={i} className="p-2 rounded-lg bg-[#0D1A2E] border border-[#253959] hover:border-amber-400/40">
                  <div className="w-full h-16 rounded-md bg-gradient-to-br from-amber-500/20 to-orange-600/20 mb-1 flex items-center justify-center">
                    <Ic className="w-6 h-6 text-amber-400/60" />
                  </div>
                  <p className="text-[10px] text-white truncate">{it.n}</p>
                  <p className="text-[10px] font-bold text-amber-400">{it.p}</p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-[#16263F] rounded-xl border border-[#253959] p-3">
          <p className="text-xs font-bold text-white mb-2">🛒 الفاتورة الحالية</p>
          <div className="space-y-1.5 mb-3 max-h-40 overflow-y-auto">
            {data.cart.map((it,i)=>(
              <div key={i} className="flex items-center justify-between text-[10px] p-1.5 rounded bg-[#0D1A2E]">
                <span className="text-white truncate flex-1">{it.n} ×{it.q}</span>
                <span className="text-amber-400 font-bold">{it.p}</span>
              </div>
            ))}
          </div>
          <div className="pt-2 border-t border-[#253959] space-y-1 text-[10px]">
            <div className="flex justify-between text-slate-300"><span>المجموع الفرعي:</span><span>{total.toLocaleString()}</span></div>
            <div className="flex justify-between text-slate-300"><span>الضريبة:</span><span>{Math.round(total*0.08).toLocaleString()}</span></div>
            <div className="flex justify-between text-emerald-400 font-bold text-sm"><span>الإجمالي:</span><span>{Math.round(total*1.08).toLocaleString()} IQD</span></div>
          </div>
          <button className="w-full mt-3 py-2 rounded-lg bg-emerald-500 text-white font-bold text-xs">إتمام الدفع</button>
        </div>
      </div>
    </div>
  );
};

// 2) Orders
export const MockOrders = ({ projectName }) => (
  <div>
    <ProjectFilterBar projectName={projectName} />
    <div className="flex gap-2 mb-3 flex-wrap">
      {[{l:"الكل",c:"#94A3B8",n:483},{l:"جديد",c:"#F59E0B",n:12},{l:"قيد التحضير",c:"#3B82F6",n:22},{l:"جاهز",c:"#10B981",n:8},{l:"مُوصَّل",c:"#64748B",n:441}].map((s,i)=>(
        <span key={i} className={`px-3 py-1.5 rounded-full text-[10px] font-bold flex items-center gap-1.5 ${i===0 ? "bg-white/10 text-white border border-white/20" : ""}`} style={i>0?{background:`${s.c}20`,color:s.c,border:`1px solid ${s.c}40`}:{}}>{s.l}<span className="opacity-60">({s.n})</span></span>
      ))}
    </div>
    <div className="bg-[#16263F] rounded-xl border border-[#253959] overflow-hidden">
      <div className="grid grid-cols-6 gap-2 p-2 bg-[#0D1A2E] text-[10px] font-bold text-slate-400 border-b border-[#253959]">
        <div>#</div><div>العميل</div><div>الفرع</div><div>الحالة</div><div>الإجمالي</div><div>الوقت</div>
      </div>
      {[
        {n:"1247",c:"أحمد سالم",b:"Al Yarmouk",s:"جديد",sc:"#F59E0B",t:"32,400",tm:"12:32"},
        {n:"1246",c:"مريم كريم",b:"Al-Jadriya",s:"قيد التحضير",sc:"#3B82F6",t:"18,000",tm:"12:28"},
        {n:"1245",c:"علي محمد",b:"Al sidyah",s:"جاهز",sc:"#10B981",t:"45,600",tm:"12:15"},
        {n:"1244",c:"زينب فاضل",b:"Al Yarmouk",s:"مُوصَّل",sc:"#64748B",t:"22,000",tm:"11:58"},
      ].map((o,i)=>(
        <div key={i} className="grid grid-cols-6 gap-2 p-2 border-b border-[#253959] text-[10px] items-center hover:bg-[#0D1A2E]/40">
          <div className="text-amber-400 font-bold">#{o.n}</div>
          <div className="text-white">{o.c}</div>
          <div className="text-slate-400">{o.b}</div>
          <div><span className="px-2 py-0.5 rounded-full font-bold" style={{background:`${o.sc}20`,color:o.sc}}>{o.s}</span></div>
          <div className="text-emerald-400 font-bold">{o.t} IQD</div>
          <div className="text-slate-500">{o.tm}</div>
        </div>
      ))}
    </div>
  </div>
);

// 3) Reports
export const MockReports = ({ projectName }) => (
  <div>
    <ProjectFilterBar projectName={projectName} />
    <div className="grid grid-cols-4 gap-2 mb-3">
      {[{l:"مبيعات",v:"1.9M",c:"#10B981"},{l:"طلبات",v:"149",c:"#3B82F6"},{l:"ربح",v:"1.2M",c:"#F59E0B"},{l:"تكاليف",v:"680K",c:"#EF4444"}].map((k,i)=>(
        <div key={i} className="p-3 rounded-xl bg-[#16263F] border border-[#253959]">
          <p className="text-[9px] text-slate-400">{k.l}</p>
          <p className="text-sm font-bold" style={{color:k.c}}>{k.v} IQD</p>
        </div>
      ))}
    </div>
    <div className="flex gap-1 border-b border-[#253959] mb-3 overflow-x-auto">
      {["الشامل","المبيعات","المصاريف","الأرباح","الأصناف","التوصيل","إغلاق الصندوق"].map((t,i)=>(
        <span key={i} className={`text-[10px] px-3 py-2 whitespace-nowrap ${i===0 ? "text-emerald-400 border-b-2 border-emerald-400" : "text-slate-400"}`}>{t}</span>
      ))}
    </div>
    <div className="bg-[#16263F] rounded-xl border border-[#253959] p-3">
      <p className="text-xs text-white mb-2">📊 مخطط المبيعات اليومية</p>
      <div className="flex items-end gap-1 h-32">
        {[45,60,80,55,75,90,85,95,70,60,80,110].map((h,i)=>(
          <div key={i} className="flex-1 rounded-t" style={{height:`${h}%`,background:`linear-gradient(to top,#10B981,#059669)`}} />
        ))}
      </div>
    </div>
  </div>
);

// 4) Owner Wallet
export const MockOwnerWallet = ({ projectName }) => (
  <div>
    <ProjectFilterBar projectName={projectName} />
    <div className="grid grid-cols-4 gap-2 mb-3">
      {[
        {l:"الإيداعات",v:"103M",c:"#10B981",i:TrendingUp},
        {l:"السحوبات",v:"57M",c:"#EC4899",i:TrendingDown},
        {l:"الرصيد",v:"46M",c:"#3B82F6",i:Wallet},
        {l:"الخزينة",v:"0",c:"#F59E0B",i:Coins},
      ].map((k,i)=>(
        <div key={i} className="p-3 rounded-xl border-2" style={{borderColor:`${k.c}40`,background:`${k.c}10`}}>
          <div className="flex items-center gap-1 mb-1"><k.i className="w-3 h-3" style={{color:k.c}} /><p className="text-[9px]" style={{color:k.c}}>{k.l}</p></div>
          <p className="text-sm font-bold" style={{color:k.c}}>{k.v} IQD</p>
        </div>
      ))}
    </div>
    <p className="text-xs text-white font-bold mb-2">أرصدة الفروع / المصادر (تُصفَّى حسب المشروع)</p>
    <div className="grid grid-cols-4 gap-2">
      {[
        {n:"Al Yarmouk",t:"فرع",b:"+2.6M",c:"#10B981"},
        {n:"Al-Jadriya",t:"فرع",b:"+2.1M",c:"#10B981"},
        {n:"Al sidyah",t:"فرع",b:"+192K",c:"#10B981"},
        {n:"المطبخ المركزي",t:"مصدر",b:"-171K",c:"#EF4444"},
      ].map((b,i)=>(
        <div key={i} className="p-2 rounded-lg border" style={{borderColor:`${b.c}40`,background:`${b.c}10`}}>
          <p className="text-[10px] text-white font-bold">{b.n}</p>
          <p className="text-[9px] text-slate-400">{b.t}</p>
          <p className="text-xs font-bold mt-1" style={{color:b.c}}>{b.b} IQD</p>
        </div>
      ))}
    </div>
  </div>
);

// 5) Warehouse
export const MockWarehouse = ({ projectName }) => (
  <div>
    <ProjectFilterBar projectName={projectName} />
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-[#16263F] rounded-xl border border-[#253959] p-3">
        <p className="text-xs font-bold text-blue-300 mb-2">📦 المواد الخام</p>
        {[{n:"لحم بقر",q:"45 كغ",l:false},{n:"زيت زيتون",q:"5 لتر",l:true},{n:"أرز",q:"80 كغ",l:false}].map((m,i)=>(
          <div key={i} className="flex items-center gap-2 p-1.5 border-b border-[#253959] last:border-0">
            <div className={`w-1.5 h-1.5 rounded-full ${m.l?"bg-red-400":"bg-emerald-400"}`} />
            <div className="flex-1">
              <p className="text-[11px] text-white">{m.n}</p>
              <p className="text-[9px] text-slate-500">{m.q}</p>
            </div>
            {m.l && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold">نقص</span>}
          </div>
        ))}
      </div>
      <div className="bg-[#16263F] rounded-xl border border-[#253959] p-3">
        <p className="text-xs font-bold text-purple-300 mb-2">🏭 المنتجات المصنّعة</p>
        {[{n:"برجر لحم",r:"لحم + خبز + جبن",c:"3,200"},{n:"بيتزا مارغريتا",r:"عجين + جبن + طماطم",c:"4,800"}].map((p,i)=>(
          <div key={i} className="p-1.5 border-b border-[#253959] last:border-0">
            <div className="flex justify-between mb-0.5">
              <p className="text-[11px] text-white">{p.n}</p>
              <p className="text-[10px] font-bold text-amber-400">{p.c} د.ع</p>
            </div>
            <p className="text-[9px] text-slate-500">{p.r}</p>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// 6) Expenses
export const MockExpenses = ({ projectName }) => (
  <div>
    <ProjectFilterBar projectName={projectName} />
    <div className="flex items-center justify-between mb-3">
      <div className="flex gap-2">
        <span className="px-3 py-1.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold border border-red-500/40">47 مصروف اليوم</span>
        <span className="px-3 py-1.5 rounded-full bg-[#16263F] text-slate-300 text-[10px] border border-[#253959]">إجمالي: 680K IQD</span>
      </div>
      <button className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-[10px] font-bold flex items-center gap-1"><Plus className="w-3 h-3" /> مصروف</button>
    </div>
    <div className="bg-[#16263F] rounded-xl border border-[#253959] overflow-hidden">
      <div className="grid grid-cols-6 gap-2 p-2 bg-[#0D1A2E] text-[10px] font-bold text-slate-400 border-b border-[#253959]">
        <div>البيان</div><div>الفئة</div><div>الفرع</div><div>المبلغ</div><div>المستلم</div><div>التاريخ</div>
      </div>
      {[
        {b:"إيجار المحل",c:"إيجار",br:"Al Yarmouk",a:"250,000",r:"محمد ياسين",d:"20/07"},
        {b:"كهرباء الشهر",c:"مرافق",br:"Al-Jadriya",a:"85,000",r:"شركة الكهرباء",d:"19/07"},
        {b:"صيانة الفرن",c:"صيانة",br:"Al sidyah",a:"45,000",r:"فني الصيانة",d:"18/07"},
        {b:"مواد نظافة",c:"مستلزمات",br:"Al Yarmouk",a:"32,000",r:"سوبرماركت",d:"17/07"},
      ].map((e,i)=>(
        <div key={i} className="grid grid-cols-6 gap-2 p-2 border-b border-[#253959] text-[10px] items-center">
          <div className="text-white font-semibold">{e.b}</div>
          <div className="text-slate-400">{e.c}</div>
          <div className="text-slate-400">{e.br}</div>
          <div className="text-red-400 font-bold">-{e.a}</div>
          <div className="text-slate-400">{e.r}</div>
          <div className="text-slate-500">{e.d}</div>
        </div>
      ))}
    </div>
  </div>
);

// 7) HR
export const MockHR = ({ projectName }) => (
  <div>
    <ProjectFilterBar projectName={projectName} />
    <div className="flex gap-1 border-b border-[#253959] mb-3 overflow-x-auto">
      {["الموظفون","الحضور","الإجازات","الرواتب","التقييم"].map((t,i)=>(
        <span key={i} className={`text-[10px] px-3 py-2 whitespace-nowrap ${i===0 ? "text-emerald-400 border-b-2 border-emerald-400" : "text-slate-400"}`}>{t}</span>
      ))}
    </div>
    <div className="grid grid-cols-4 gap-2 mb-3">
      {[{l:"إجمالي",v:87,c:"#3B82F6"},{l:"حاضر",v:74,c:"#10B981"},{l:"غائب",v:8,c:"#EF4444"},{l:"إجازة",v:5,c:"#F59E0B"}].map((k,i)=>(
        <div key={i} className="p-2 rounded-lg border" style={{borderColor:`${k.c}40`,background:`${k.c}10`}}>
          <p className="text-[9px]" style={{color:k.c}}>{k.l}</p>
          <p className="text-sm font-bold" style={{color:k.c}}>{k.v}</p>
        </div>
      ))}
    </div>
    <div className="bg-[#16263F] rounded-xl border border-[#253959] overflow-hidden">
      {[
        {n:"أحمد سالم",r:"مدير مطعم",b:"Al Yarmouk",s:"حاضر",sc:"#10B981"},
        {n:"علي محمد",r:"كاشير",b:"Al-Jadriya",s:"حاضر",sc:"#10B981"},
        {n:"زينب كريم",r:"طاهية",b:"Al sidyah",s:"إجازة",sc:"#F59E0B"},
        {n:"محمد ياسين",r:"نادل",b:"Al Yarmouk",s:"غائب",sc:"#EF4444"},
      ].map((e,i)=>(
        <div key={i} className="flex items-center gap-2 p-2 border-b border-[#253959] last:border-0 text-[10px]">
          <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-[10px] font-bold">{e.n.charAt(0)}</div>
          <div className="flex-1"><p className="text-white font-bold">{e.n}</p><p className="text-slate-500">{e.r} • {e.b}</p></div>
          <span className="px-2 py-0.5 rounded-full font-bold" style={{background:`${e.sc}20`,color:e.sc}}>{e.s}</span>
        </div>
      ))}
    </div>
  </div>
);

// 8) Delivery
export const MockDelivery = ({ projectName }) => (
  <div>
    <ProjectFilterBar projectName={projectName} />
    <div className="grid grid-cols-3 gap-2 mb-3">
      {[{l:"قيد التوصيل",v:12,c:"#F97316"},{l:"سائقون نشطون",v:8,c:"#10B981"},{l:"تم توصيله اليوم",v:47,c:"#3B82F6"}].map((k,i)=>(
        <div key={i} className="p-2 rounded-lg border" style={{borderColor:`${k.c}40`,background:`${k.c}10`}}>
          <p className="text-[9px]" style={{color:k.c}}>{k.l}</p>
          <p className="text-sm font-bold" style={{color:k.c}}>{k.v}</p>
        </div>
      ))}
    </div>
    <p className="text-xs text-white font-bold mb-2">🛵 السائقون النشطون</p>
    <div className="grid grid-cols-2 gap-2 mb-3">
      {[
        {n:"علي محمد",o:2,d:"1.2 كم",s:"في طريقه"},
        {n:"أحمد ياسين",o:1,d:"800 م",s:"في المطعم"},
        {n:"مصطفى جواد",o:3,d:"2.5 كم",s:"في طريقه"},
        {n:"حسن كريم",o:0,d:"—",s:"متاح"},
      ].map((d,i)=>(
        <div key={i} className="flex items-center gap-2 p-2 bg-[#16263F] border border-[#253959] rounded-lg">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-orange-500/20 text-orange-400 flex items-center justify-center text-[10px] font-bold">{d.n.charAt(0)}</div>
            <div className="absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-[#16263F]" />
          </div>
          <div className="flex-1">
            <p className="text-[11px] text-white font-bold">{d.n}</p>
            <p className="text-[9px] text-slate-500">{d.o} طلب • {d.d}</p>
          </div>
          <span className="text-[9px] text-orange-400">{d.s}</span>
        </div>
      ))}
    </div>
  </div>
);

// 9) Kitchen Display
export const MockKitchen = ({ projectName }) => (
  <div>
    <ProjectFilterBar projectName={projectName} />
    <div className="grid grid-cols-3 gap-2">
      {[
        {n:"1247",c:"#F59E0B",items:["برجر لحم ×2","بطاطا ×1","كوكاكولا ×2"],t:"3:20",st:"جديد"},
        {n:"1246",c:"#3B82F6",items:["بيتزا مارغريتا","سلطة سيزر"],t:"7:45",st:"قيد التحضير"},
        {n:"1245",c:"#3B82F6",items:["شاورما ×3","حمص"],t:"12:10",st:"قيد التحضير"},
        {n:"1244",c:"#10B981",items:["برجر دجاج","بطاطا"],t:"15:30",st:"جاهز"},
      ].map((o,i)=>(
        <div key={i} className="p-3 rounded-xl border-2" style={{borderColor:o.c,background:`${o.c}10`}}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-black text-white">#{o.n}</p>
            <span className="text-[9px] px-2 py-0.5 rounded-full font-bold" style={{background:o.c,color:"#fff"}}>{o.st}</span>
          </div>
          <div className="space-y-1 mb-2">
            {o.items.map((it,idx)=>(
              <p key={idx} className="text-[10px] text-white">• {it}</p>
            ))}
          </div>
          <div className="flex items-center gap-1 pt-2 border-t border-white/10"><Clock className="w-3 h-3 text-slate-400" /><p className="text-[9px] text-slate-400">{o.t}</p></div>
        </div>
      ))}
    </div>
  </div>
);

// 10) Tables
export const MockTables = ({ projectName }) => (
  <div>
    <ProjectFilterBar projectName={projectName} />
    <div className="grid grid-cols-6 gap-2">
      {Array.from({length:18}).map((_,i)=>{
        const status = i % 4 === 0 ? "متاحة" : i % 4 === 1 ? "مشغولة" : i % 4 === 2 ? "محجوزة" : "دفع";
        const c = i%4===0?"#10B981":i%4===1?"#EF4444":i%4===2?"#F59E0B":"#3B82F6";
        return (
          <div key={i} className="aspect-square rounded-xl border-2 flex flex-col items-center justify-center gap-1" style={{borderColor:c,background:`${c}15`}}>
            <p className="text-sm font-black" style={{color:c}}>{i+1}</p>
            <p className="text-[9px]" style={{color:c}}>{status}</p>
          </div>
        );
      })}
    </div>
  </div>
);

// 11) Reservations
export const MockReservations = ({ projectName }) => (
  <div>
    <ProjectFilterBar projectName={projectName} />
    <div className="grid grid-cols-7 gap-1 mb-3">
      {["السبت","الأحد","الاثنين","الثلاثاء","الأربعاء","الخميس","الجمعة"].map((d,i)=>(
        <div key={i} className={`p-2 rounded-lg text-center ${i===3?"bg-amber-500 text-[#0D1A2E]":"bg-[#16263F] text-slate-300"}`}>
          <p className="text-[9px]">{d}</p>
          <p className="text-sm font-bold">{18+i}</p>
        </div>
      ))}
    </div>
    <p className="text-xs text-white font-bold mb-2">📅 حجوزات اليوم (7 حجوزات)</p>
    <div className="space-y-1.5">
      {[
        {t:"12:00 - 14:00",n:"عائلة الأحمدي",p:6,tbl:"طاولة 5"},
        {t:"13:30 - 15:30",n:"شركة النخبة",p:12,tbl:"صالة كبار"},
        {t:"19:00 - 21:00",n:"حفل تخرج",p:20,tbl:"صالة العائلات"},
      ].map((r,i)=>(
        <div key={i} className="flex items-center gap-2 p-2 bg-[#16263F] border border-[#253959] rounded-lg">
          <div className="w-10 text-center">
            <p className="text-[10px] text-amber-400 font-bold">{r.t.split(" ")[0]}</p>
          </div>
          <div className="flex-1"><p className="text-[11px] text-white font-bold">{r.n}</p><p className="text-[9px] text-slate-500">{r.tbl}</p></div>
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400">👥 {r.p}</span>
        </div>
      ))}
    </div>
  </div>
);

// 12) Call Logs
export const MockCallLogs = ({ projectName }) => (
  <div>
    <ProjectFilterBar projectName={projectName} />
    <div className="grid grid-cols-4 gap-2 mb-3">
      {[{l:"إجمالي",v:128,c:"#14B8A6",i:Phone},{l:"واردة",v:87,c:"#10B981",i:PhoneIncoming},{l:"صادرة",v:32,c:"#3B82F6",i:PhoneOutgoing},{l:"فائتة",v:9,c:"#EF4444",i:PhoneMissed}].map((k,i)=>(
        <div key={i} className="p-2 rounded-lg border flex items-center gap-2" style={{borderColor:`${k.c}40`,background:`${k.c}10`}}>
          <k.i className="w-4 h-4" style={{color:k.c}} />
          <div><p className="text-[9px]" style={{color:k.c}}>{k.l}</p><p className="text-sm font-bold" style={{color:k.c}}>{k.v}</p></div>
        </div>
      ))}
    </div>
    <div className="bg-[#16263F] rounded-xl border border-[#253959] overflow-hidden">
      {[
        {n:"07701234567",cn:"أحمد سالم",t:"12:45",d:"3:24",st:"مكتملة"},
        {n:"07807654321",cn:"مريم كريم",t:"12:32",d:"1:15",st:"مكتملة"},
        {n:"07705555555",cn:"—",t:"12:18",d:"0:00",st:"فائتة"},
      ].map((c,i)=>(
        <div key={i} className="flex items-center gap-2 p-2 border-b border-[#253959] last:border-0 text-[10px]">
          <PhoneIncoming className="w-3.5 h-3.5 text-emerald-400" />
          <div className="flex-1"><p className="text-white font-bold">{c.cn || c.n}</p><p className="text-slate-500 text-[9px]">{c.n}</p></div>
          <span className="text-slate-400">{c.t}</span>
          <span className="text-slate-500">{c.d}</span>
        </div>
      ))}
    </div>
  </div>
);

// Generic mock for less-detailed pages
export const MockGeneric = ({ projectName, title, icon: Icon, color }) => (
  <div>
    <ProjectFilterBar projectName={projectName} />
    <div className="bg-[#16263F] rounded-xl border border-[#253959] p-6 text-center">
      <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center mb-3" style={{background:`${color}20`,border:`2px solid ${color}40`}}>
        <Icon className="w-8 h-8" style={{color}} />
      </div>
      <p className="text-white font-bold text-sm mb-1">{title}</p>
      <p className="text-[10px] text-slate-400 mb-4">هذه الصفحة تعمل بالضبط كما تعمل الآن في نظامك</p>
      <div className="grid grid-cols-3 gap-2">
        {[1,2,3,4,5,6].map(n=>(
          <div key={n} className="p-2 rounded-lg bg-[#0D1A2E] border border-[#253959]">
            <p className="text-[9px] text-slate-500">عنصر {n}</p>
            <p className="text-xs text-white font-bold">--</p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-emerald-300 mt-4">✅ الصفحة الحقيقية في النظام: كامل الوظائف + فلتر المشروع</p>
    </div>
  </div>
);

// خريطة كل أيقونة → مكوّن الصفحة المطابق
export const PAGE_MAP = {
  "نقطة البيع": MockPOS,
  "الطلبات": MockOrders,
  "التقارير": MockReports,
  "خزينة المالك": MockOwnerWallet,
  "المخزن والتصنيع": MockWarehouse,
  "المصاريف": MockExpenses,
  "الموارد البشرية": MockHR,
  "التوصيل": MockDelivery,
  "شاشة المطبخ": MockKitchen,
  "الطاولات": MockTables,
  "الحجوزات": MockReservations,
  "سجل المكالمات": MockCallLogs,
};
