# -*- coding: utf-8 -*-
"""
الملف التعريفي لنظام Maestro EGP (PDF) — إعادة إنتاج مطابقة للأصل.
التعديلات الوحيدة عن الأصل:
  1) إضافة الشعار الرسمي (سداسي ذهبي + M) موسّطاً في الغلاف.
  2) استبدال كل ذكر "الذكاء الاصطناعي / ذكاء اصطناعي" بـ "نظام ذكي ومتطور".
  3) توحيد المربعات بشكل متوازن ومصفوف ومتباعد غير متداخل.
  4) إضافة صفحة ختامية (رسالة المؤسس) بنفس الألوان ونفس التصميم.
"""
import base64
from pathlib import Path
import cairosvg
from weasyprint import HTML

OUTPUT = Path("/app/frontend/public/Maestro-EGP-Profile.pdf")

LOGO_SVG = """<svg viewBox="0 0 200 200" width="200" height="200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffe7a0"/><stop offset="50%" stop-color="#ffd166"/><stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
    <radialGradient id="d" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#1a1a2e"/><stop offset="70%" stop-color="#0f0f1e"/><stop offset="100%" stop-color="#000000"/>
    </radialGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.5" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <circle cx="100" cy="100" r="86" fill="url(#d)"/>
  <circle cx="100" cy="100" r="86" stroke="url(#g)" stroke-width="2" fill="none" opacity="0.7"/>
  <circle cx="100" cy="100" r="94" stroke="url(#g)" stroke-width="3" fill="none" stroke-dasharray="40 200" stroke-linecap="round"/>
  <polygon points="100,30 158,62 158,138 100,170 42,138 42,62" fill="none" stroke="url(#g)" stroke-width="3.5" filter="url(#glow)"/>
  <path d="M55 142 V70 L100 120 L145 70 V142" fill="none" stroke="url(#g)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow)"/>
  <circle cx="100" cy="100" r="4" fill="url(#g)"/>
</svg>"""
_png = cairosvg.svg2png(bytestring=LOGO_SVG.encode("utf-8"), output_width=700, output_height=700)
LOGO = "data:image/png;base64," + base64.b64encode(_png).decode("ascii")

# ============ بيانات المحتوى (مطابقة للأصل مع استبدال ذكر الذكاء الاصطناعي) ============
STAT_BOXES = [
    ("‎10+", "وحدات إدارية متكاملة"),
    ("Offline", "يعمل بدون إنترنت"),
    ("Multi", "متعدد الفروع والصلاحيات"),
    ("ذكي", "نظام ذكي ومتطور"),
]
WHY = [
    ("دقة محاسبية مطلقة", "حساب تكلفة الوحدة، والعائد، والهدر، والربح الصافي لحظياً وبلا أخطاء بشرية."),
    ("يعمل بدون إنترنت", "تقنية PWA تتيح البيع والإدارة أثناء انقطاع الشبكة، ثم المزامنة الآمنة تلقائياً."),
    ("نظام ذكي ومتطور مدمج", "ترجمة تلقائية للقوائم، واستخراج بيانات الفواتير من الصور دون إدخال يدوي."),
    ("منظومة توصيل لحظية", "تتبع حي للسائق على الخريطة، وتوزيع آلي للطلبات، ومكالمات صوتية داخل التطبيق."),
    ("تكامل مالي كامل", "خزينة المالك، وسداد الموردين والرواتب والمخالصات، كلها مترابطة في تدفّق مالي واحد."),
    ("أمان وفصل صلاحيات", "نظام متعدّد المستأجرين والفروع، بصلاحيات دقيقة لكل دور دون أي تداخل أمني."),
]
TECH = [
    ("لغة الواجهة (Frontend)", "JavaScript / JSX", "بمكتبة React لبناء واجهات تفاعلية حديثة وسلسة."),
    ("التصميم والتنسيق", "Tailwind CSS + Shadcn UI", "بنية عصرية متجاوبة مع HTML5 وCSS."),
    ("الإشعارات الفورية", "Web Push (VAPID)", "إشعارات لحظية عبر Service Workers حتى والتطبيق مغلق."),
    ("لغة الخادم (Backend)", "Python", "بإطار FastAPI عالي الأداء لبناء واجهات برمجية (APIs) سريعة وآمنة."),
    ("قاعدة البيانات", "MongoDB", "قاعدة بيانات NoSQL مرنة وسريعة للتعامل مع كميات بيانات ضخمة."),
    ("الاتصال الصوتي", "WebRTC", "مكالمات صوتية مباشرة داخل التطبيق بين الزبون والسائق دون أرقام هاتف."),
    ("العمل دون إنترنت", "PWA + IndexedDB", "تطبيق ويب تقدّمي مع تخزين محلي ومزامنة تلقائية عند عودة الاتصال."),
    ("الخرائط والمسارات", "OpenStreetMap + OSRM", "تتبع حي وحساب أقصر مسار للتوصيل عبر مكتبة Leaflet."),
    ("نظام ذكي ومتطور", "محرّك ذكي متطور", "للترجمة التلقائية واستخراج بيانات الفواتير آلياً من الصور."),
]
MODULES_1 = [
    ("نقطة البيع (POS)", [
        "واجهة بيع سريعة تعمل بدون إنترنت مع مزامنة تلقائية آمنة.",
        "منع تكرار الطلبات (Deduplication) ودعم الطاولات والتوصيل والاستلام.",
        "طرق دفع متعددة (نقدي، بطاقة، أجل) وطباعة فواتير فورية.",
    ]),
    ("المخزون والتصنيع", [
        "حساب دقيق لتكلفة البضاعة المباعة (COGS)، ونسبة العائد (Yield)، وتكلفة الوحدة.",
        "وصفات تصنيع، وتنبيهات نقص المخزون، وتقارير هدر تفصيلية.",
        "وضعان للمخزون: مركزي موحّد، أو مخزن منفصل لكل فرع مع تحويلات بين المخازن.",
    ]),
    ("المشتريات والموردون", [
        "تقرير مشتريات خارجية كامل (الدائن والمدين)، وكل فاتورة بموادها وصورتها.",
        "سداد الموردين (كامل أو جزئي) يُخصم آلياً من خزينة المالك مع تتبع المتبقي.",
        "كشف حساب لكل مورد وطباعة A4 احترافية، واستخراج بيانات الفواتير بنظام ذكي ومتطور.",
    ]),
    ("منظومة التوصيل والسائقين", [
        "تتبع حي للسائق على الخريطة وحساب أقصر مسار للزبون.",
        "توزيع آلي للطلبات على السائقين (Batching) وحساب رسوم التوصيل الداخلية.",
        "تطبيق سائق مستقل مع مكالمات صوتية داخل التطبيق وإشعارات فورية.",
    ]),
]
MODULES_2 = [
    ("تطبيق الزبون (PWA)", [
        "قائمة طعام تفاعلية بلغتين مع ترجمة تلقائية ذكية ومتطورة.",
        "تتبّع الطلب لحظياً، وتواصل مباشر مع السائق، وتقييم الطلب بعد التسليم.",
        "إشعارات فورية عند جهوزية الطلب وعند تسليمه.",
    ]),
    ("الموارد البشرية والرواتب", [
        "إدارة الموظفين، والحضور البيومتري، والرواتب مع الخصومات والسلف.",
        "صرف الرواتب آلياً من خزينة المالك حسب فرع الموظف.",
        "دورة إنهاء خدمة كاملة مع إيصال مخالصة نهائية قابل للطباعة A4.",
    ]),
    ("الخزينة والتقارير المالية", [
        "خزينة المالك مع إيداعات وسحوبات وتحويل أرباح متعدد الفروع.",
        "تقارير شاملة (المبيعات، والمشتريات، والمصاريف، والأرباح، والأجل، والمرتجعات).",
        "تقرير ذكي يحلّل الأداء ويعرض المؤشرات الحيوية لحظياً.",
    ]),
    ("الإدارة المركزية والأمان", [
        "نظام متعدّد المستأجرين والفروع بصلاحيات دقيقة لكل دور.",
        "كوبونات وبرامج ولاء وبطاقات، وإدارة الكول سنتر والطلبات الواردة.",
        "حماية كاملة للبيانات وفصل أمني تام بين الأدوار والفروع.",
    ]),
]
SECURITY = [
    ("تشفير وحماية", "مصادقة آمنة (JWT) وحماية كاملة لبيانات المستخدمين والعمليات المالية."),
    ("موثوقية عالية", "عمل دون إنترنت مع منع فقدان البيانات ومزامنة آمنة عند عودة الاتصال."),
    ("نسخ ومزامنة", "قاعدة بيانات قوية مع تتبّع كامل لكل حركة مالية ومخزنية."),
    ("فصل الصلاحيات", "كل دور يرى ما يخصّه فقط دون أي تداخل أمني بين الفروع أو الأنظمة."),
]
ROADMAP = [
    ("التوسع لنظام مؤسسة شامل", "تطوير النظام ليدير كل أنشطة المؤسسة لا المطاعم فقط، من منصة واحدة موحدة."),
    ("تنبيهات مالية ذكية", "تنبيهات آلية عند اقتراب استحقاق دفعات الموردين الآجلة لإدارة السيولة بذكاء."),
    ("مقارنة أسعار الموردين", "رصد آلي للمورد الأرخص لكل مادة عبر تحليل الفواتير واقتراحه عند الشراء."),
]

# ============ بناء الكتل ============
def stat_box(big, cap):
    return f'<div class="stat"><div class="stat-big">{big}</div><div class="stat-cap">{cap}</div></div>'

def detail_card(title, desc):
    return f'<div class="dcard"><div class="dcard-t">{title}</div><div class="dcard-d">{desc}</div></div>'

def tech_card(cat, name, desc):
    return (f'<div class="tcard"><div class="tcard-cat">{cat}</div>'
            f'<div class="tcard-name">{name}</div><div class="tcard-d">{desc}</div></div>')

def module_card(title, items):
    lis = "".join(f'<div class="mitem">{x}</div>' for x in items)
    return f'<div class="mcard"><div class="mcard-t">{title}</div><div class="mcard-l">{lis}</div></div>'

def roadmap_item(n, title, desc):
    return (f'<div class="rmap"><div class="rmap-n">{n}</div>'
            f'<div class="rmap-b"><div class="rmap-t">{title}</div><div class="rmap-d">{desc}</div></div></div>')

stats_html = "".join(stat_box(b, c) for b, c in STAT_BOXES)
why_html = "".join(detail_card(t, d) for t, d in WHY)
tech_html = "".join(tech_card(*t) for t in TECH)
mod1_html = "".join(module_card(t, items) for t, items in MODULES_1)
mod2_html = "".join(module_card(t, items) for t, items in MODULES_2)
sec_html = "".join(detail_card(t, d) for t, d in SECURITY)
road_html = "".join(roadmap_item(i, t, d) for i, (t, d) in enumerate(ROADMAP, start=1))

CSS = """
@font-face { font-family:'Cairo'; font-weight: 400; src: url('file:///app/backend/static/fonts/Cairo-Variable.ttf'); }
@font-face { font-family:'Cairo'; font-weight: 600; src: url('file:///app/backend/static/fonts/Cairo-Variable.ttf'); }
@font-face { font-family:'Cairo'; font-weight: 700; src: url('file:///app/backend/static/fonts/Cairo-Variable.ttf'); }
@page { size: A4; margin: 0; }
@page content {
  margin: 18mm 15mm 10mm 15mm;
  @bottom-center { content: "Maestro EGP   •   Moataz Mehana   •   2026"; font-family:'Cairo'; font-size: 8.5pt; color:#9aa1b0; }
}
* { box-sizing: border-box; }
body { font-family:'Cairo', sans-serif; color:#1f2433; margin:0; }

/* ===== الغلاف وصفحة الختام (داكن) ===== */
.dark {
  height:297mm; width:210mm; position:relative; color:#fff;
  background: linear-gradient(160deg, #050A24 0%, #0c1738 45%, #1A2B5B 100%);
  page-break-after: always; overflow:hidden;
}
/* إطار ذهبي مزدوج فاخر (تصميم B) */
.cover-frame { position:absolute; top:9mm; left:9mm; right:9mm; bottom:9mm;
  border:0.5mm solid rgba(246,166,35,.5); border-radius:7mm; }
.cover-frame-in { position:absolute; top:12mm; left:12mm; right:12mm; bottom:12mm;
  border:0.3mm solid rgba(246,166,35,.2); border-radius:6mm; }
/* علامة مائية سداسية كبيرة خلف الشعار */
.cover-wm { position:absolute; top:62mm; left:50mm; width:110mm; height:110mm; opacity:0.05; }
.cover-mid { position:absolute; top:60mm; left:22mm; right:22mm; text-align:center; }
.cover-logo { width:42mm; height:42mm; display:block; margin:0 auto 7mm auto; }
.cover-brand { font-size:44pt; font-weight:700; letter-spacing:.5px; direction:ltr; }
.cover-brand .o { color:#f6a623; }
.cover-rule { display:inline-block; width:60mm; height:3px; background:#f6a623; border-radius:9px; margin:5mm 0 7mm 0; }
.cover-sub { font-size:18pt; font-weight:700; color:#eef2ff; line-height:1.8; }
.cover-desc { font-size:11.5pt; color:#c3cae0; line-height:2.15; max-width:168mm; margin:7mm auto 0 auto; }
.cover-bottom { position:absolute; bottom:22mm; left:22mm; right:22mm; text-align:center; }
.cover-tag { text-align:center; font-size:10pt; color:#cdb37a; letter-spacing:3px; direction:ltr;
  text-transform:uppercase; margin-bottom:7mm; }
.cover-owner { display:inline-block; padding:6mm 18mm; border:0.4mm solid rgba(246,166,35,.45);
  border-radius:20mm; background:rgba(0,0,0,.2); }
.cover-year { font-size:22pt; font-weight:700; color:#f6a623; direction:ltr; margin-bottom:2mm; }
.cover-dev { text-align:center; direction:ltr; }
.cover-dev .nm { font-size:13pt; font-weight:700; }
.cover-dev .rl { font-size:9.5pt; color:#aeb6cc; }

/* ===== صفحات المحتوى ===== */
.page { page: content; }
.closing-layout { width:100%; height:269mm; border-collapse:collapse; }
.closing-mid { vertical-align:middle; text-align:center; padding-bottom:22mm; }
.closing-bot { vertical-align:bottom; padding-bottom:0; }
.sec-head { margin-bottom:5mm; text-align:center; }
.sec-head .ar { font-size:21pt; font-weight:700; color:#0b1430; }
.sec-head .en { font-size:9.5pt; font-weight:600; color:#f6a623; letter-spacing:2px; direction:ltr; text-transform:uppercase; }
.sec-head .bar { width:46mm; height:3px; background:#f6a623; border-radius:9px; margin:3mm auto 0 auto; }
.intro { font-size:11.5pt; color:#3b4357; line-height:2.05; margin:5mm 0 7mm 0; text-align:center; }

/* مربعات الإحصاء — 4 في صف، متباعدة وموزونة */
.grid { font-size:0; margin:0 -2.5mm; }
.stat { display:inline-block; vertical-align:top; width:calc(25% - 5mm); margin:0 2.5mm;
  height:30mm; border-radius:12px; text-align:center; color:#fff; padding:5mm 2mm;
  background: linear-gradient(160deg,#328EE3,#164D9E); }
.stat-big { font-size:18pt; font-weight:700; }
.stat-cap { font-size:9.5pt; margin-top:2mm; line-height:1.5; }

/* بطاقات المزايا/الأمان — 2 في صف، متساوية ومتباعدة */
.dcard { display:inline-block; vertical-align:top; width:calc(50% - 5mm); margin:0 2.5mm 5mm 2.5mm;
  height:34mm; border:1px solid #e6e8ee; border-top:3px solid #f6a623; border-radius:12px;
  background:#fcfcfe; padding:5mm; page-break-inside:avoid; text-align:center; }
.dcard-t { font-size:13pt; font-weight:700; color:#13203f; margin-bottom:2.5mm; }
.dcard-d { font-size:10.5pt; color:#535b70; line-height:1.85; }

/* بطاقات التقنيات — 3 في صف */
.tcard { display:inline-block; vertical-align:top; width:calc(33.333% - 5mm); margin:0 2.5mm 5mm 2.5mm;
  height:42mm; border:1px solid #e6e8ee; border-radius:12px; background:#fff; overflow:hidden;
  page-break-inside:avoid; text-align:center; }
.tcard-cat { font-size:10.5pt; font-weight:700; color:#13203f; padding:3.5mm 4mm 1mm 4mm; }
.tcard-name { font-size:10pt; font-weight:700; color:#fff; direction:ltr; text-align:center;
  background: linear-gradient(160deg,#328EE3,#164D9E); padding:2mm 3mm; margin:0 4mm; border-radius:8px; }
.tcard-d { font-size:9.5pt; color:#535b70; line-height:1.7; padding:2.5mm 4mm 0 4mm; }
.tcard.wide { width:calc(100% - 5mm); height:auto; }
.tcard.wide .tcard-name { display:inline-block; }

/* بطاقات الوحدات — 2 في صف مع قائمة */
.mcard { display:inline-block; vertical-align:top; width:calc(50% - 5mm); margin:0 2.5mm 5mm 2.5mm;
  min-height:48mm; border:1px solid #e6e8ee; border-radius:12px; background:#fff; padding:5mm;
  page-break-inside:avoid; text-align:center; }
.mcard-t { font-size:13pt; font-weight:700; color:#13203f; margin-bottom:3mm;
  border-bottom:1px solid #eef0f4; padding-bottom:2.5mm; }
.mcard-l { margin:0; padding:0; text-align:center; }
.mitem { font-size:10pt; color:#444c61; line-height:1.8; margin-bottom:2mm; text-align:center; }
.mitem:before { content:"• "; color:#f6a623; font-weight:700; }

/* رقم الوحدة */
.modnum { display:inline-block; width:11mm; height:11mm; line-height:11mm; text-align:center;
  background:#164D9E; color:#fff; border-radius:50%; font-size:14pt; font-weight:700; direction:ltr;
  vertical-align:middle; margin-left:4mm; }

/* صندوق الفلسفة (داكن) */
.philo { background:linear-gradient(160deg,#050A24,#1A2B5B); color:#fff; border-radius:14px;
  padding:7mm; margin-top:3mm; text-align:center; }
.philo-t { font-size:15pt; font-weight:700; margin-bottom:3mm; color:#fff; }
.philo-d { font-size:11pt; color:#cdd4e8; line-height:2; }

/* خارطة الطريق */
.rmap { display:block; text-align:center; border:1px solid #e6e8ee; border-radius:12px;
  background:#fff; padding:4mm 5mm; margin-bottom:4mm; page-break-inside:avoid; }
.rmap-n { display:block; width:9mm; height:9mm; line-height:9mm; text-align:center; background:#164D9E;
  color:#fff; border-radius:50%; font-weight:700; font-size:12pt; direction:ltr; margin:0 auto 3mm auto; }
.rmap-t { font-size:12.5pt; font-weight:700; color:#13203f; margin-bottom:1mm; text-align:center; }
.rmap-d { font-size:10.5pt; color:#535b70; line-height:1.8; text-align:center; }

/* الختام */
.closing-body { font-size:12pt; color:#dfe4f2; line-height:2.3; text-align:center; max-width:158mm; margin:0 auto; }
.closing-body p { margin:0 0 5mm 0; }
.closing-sign { text-align:center; margin-top:12mm; }
.closing-sign .line { width:48mm; height:2px; background:#f6a623; margin:0 auto 5mm auto; border-radius:9px; }
.closing-sign .nm { font-size:15pt; font-weight:700; color:#fff; }
.closing-sign .rl { font-size:10.5pt; color:#aeb6cc; margin-top:2mm; }
.gold { color:#f6a623; font-weight:700; }

/* الصفحة الختامية (بيضاء أنيقة + شريط أسفل باسم المؤسس) */
.fmsg { font-size:11.5pt; color:#3b4357; line-height:2.05; text-align:center; max-width:162mm; display:inline-block; margin:0; }
.fmsg p { margin:0 0 5mm 0; text-align:center; }
.fstrip { margin-top:0; background:linear-gradient(160deg,#050A24,#1A2B5B); border-radius:12px;
  padding:5mm 8mm; display:block; text-align:center; }
.fstrip-logo { width:15mm; height:15mm; display:block; margin:0 auto 3mm auto; }
.fstrip-txt { text-align:center; }
.fstrip-txt .nm { font-size:13pt; font-weight:700; color:#fff; direction:ltr; }
.fstrip-txt .ar { font-size:10pt; color:#f6a623; font-weight:700; margin-top:1mm; }
.fstrip-txt .rl { font-size:8.5pt; color:#aeb6cc; direction:ltr; margin-top:1mm; }
.fstrip-contact { width:100%; margin-top:4mm; padding-top:3mm; border-top:1px solid rgba(246,166,35,0.35); direction:ltr; border-collapse:collapse; }
.fstrip-contact td { padding:0 2mm; }
.fc-email { color:#f6a623; font-weight:700; font-size:9pt; direction:ltr; text-align:left; }
.fc-phone { color:#f6a623; font-weight:700; font-size:9pt; direction:ltr; text-align:right; }
.phone-ico { display:inline-block; width:4.6mm; height:4.6mm; line-height:4.6mm; border-radius:50%; background:#f6a623; color:#081333; text-align:center; font-size:8pt; margin-right:1.6mm; vertical-align:middle; }
"""

HTML_DOC = f"""<!DOCTYPE html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"/><style>{CSS}</style></head><body>

<!-- صفحة 1: الغلاف (تصميم B — إطار ذهبي فاخر) -->
<div class="dark">
  <div class="cover-frame"></div>
  <div class="cover-frame-in"></div>
  <img class="cover-wm" src="{LOGO}" alt=""/>
  <div class="cover-mid">
    <img class="cover-logo" src="{LOGO}" alt="Maestro EGP"/>
    <div class="cover-brand">Maestro <span class="o">EGP</span></div>
    <div class="cover-rule"></div>
    <div class="cover-sub">نظام محاسبي وإداري متكامل<br/>للمؤسسات والمطاعم والمشاريع التجارية الكبرى</div>
    <div class="cover-desc">منصة شاملة ذكية ومتطورة تدير العمليات، والمخزون، والتصنيع، والمشتريات، والتوصيل، والموارد البشرية والمالية في نظام واحد دقيق يعمل حتى بدون إنترنت.</div>
  </div>
  <div class="cover-bottom">
    <div class="cover-tag">System Profile — 2026</div>
    <div class="cover-owner">
      <div class="cover-year">2026</div>
      <div class="cover-dev">
        <div class="nm">Moataz Mehana</div>
        <div class="rl">المالك ومطوّر النظام — System Owner &amp; Developer</div>
      </div>
    </div>
  </div>
</div>

<!-- صفحة 2: نبذة عن النظام -->
<div class="page">
  <div class="sec-head"><div class="ar">نبذة عن النظام</div><div class="en">About the System</div><div class="bar"></div></div>
  <div class="intro">
    Maestro EGP نظام محاسبي وإداري متكامل (ERP) صُمّم خصيصاً ليكون عقلاً رقمياً واحداً يدير المنشأة بالكامل. يجمع النظام بين نقطة البيع، وإدارة المخزون والتصنيع بحسابات تكلفة دقيقة، والمشتريات والموردين ومنظومة توصيل لحظية، وإدارة الموارد البشرية والرواتب، والخزينة والتقارير المالية، كل ذلك في واجهة عربية حديثة وسريعة، قادرة على العمل دون اتصال بالإنترنت ثم المزامنة تلقائياً.
    <br/><br/>
    بُني النظام على فلسفة واضحة: الأتمتة الكاملة وتقليل العمل اليدوي إلى الصفر. كل عملية محسوبة بدقة، من تكلفة البضاعة المباعة (COGS) ونسبة الهدر والعائد إلى توزيع الطلبات على السائقين آلياً، وحتى استخراج بيانات فواتير الموردين بنظام ذكي ومتطور.
  </div>
  <div class="grid">{stats_html}</div>
  <div class="sec-head" style="margin-top:8mm"><div class="ar">لماذا يتميّز Maestro EGP؟</div><div class="bar"></div></div>
  <div class="intro" style="margin:4mm 0 6mm 0">يتميّز <b>Maestro EGP</b> بأنه لا يكتفي بإدارة العمليات، بل يرتقي بها عبر دقةٍ محاسبية مطلقة، وأتمتةٍ كاملة تُلغي العمل اليدوي إلى الصفر، وقدرةٍ فريدة على العمل دون إنترنت — ليمنح صاحب القرار تحكّماً كاملاً ورؤيةً واضحة في أدقّ التفاصيل وأكبرها. وفيما يلي أبرز ما يجعله الخيار الأذكى لإدارة منشأتك:</div>
  <div class="grid">{why_html}</div>
</div>

<!-- صفحة 3: التقنيات -->
<div class="page">
  <div class="sec-head"><div class="ar">لغات البرمجة والتقنيات المستخدمة</div><div class="en">Technology Stack</div><div class="bar"></div></div>
  <div class="intro">بُني النظام بأحدث لغات وتقنيات البرمجة العالمية لضمان الأداء العالي، والأمان، وقابلية التوسع.</div>
  <div class="grid">{tech_html}
    <div class="tcard wide"><div class="tcard-cat">بنية احترافية قابلة للتوسع</div>
      <div class="tcard-name">Microservices-ready</div>
      <div class="tcard-d">معمارية تفصل الخادم والواجهة وقاعدة البيانات، جاهزة للنمو من مشروع واحد إلى مؤسسة كاملة.</div></div>
  </div>
</div>

<!-- صفحة 4: الوحدات (1) -->
<div class="page">
  <div class="sec-head"><div class="ar">الوحدات والميزات الرئيسية <span class="modnum">1</span></div><div class="en">Core Modules</div><div class="bar"></div></div>
  <div class="grid">{mod1_html}</div>
</div>

<!-- صفحة 5: الوحدات (2) -->
<div class="page">
  <div class="sec-head"><div class="ar">الوحدات والميزات الرئيسية <span class="modnum">2</span></div><div class="en">Core Modules</div><div class="bar"></div></div>
  <div class="grid">{mod2_html}</div>
  <div class="philo"><div class="philo-t">فلسفة «صفر عمل يدوي»</div>
    <div class="philo-d">كل وحدة في النظام مصمّمة لتقليل التدخّل البشري: الحسابات تلقائية، والتوزيع تلقائي، والتقارير تُبنى لحظياً، ما يرفع الدقة ويقلّل التكلفة والأخطاء.</div></div>
</div>

<!-- صفحة 6: الأمان وخارطة الطريق -->
<div class="page">
  <div class="sec-head"><div class="ar">الأمان والموثوقية</div><div class="en">Security &amp; Reliability</div><div class="bar"></div></div>
  <div class="grid">{sec_html}</div>
  <div class="sec-head" style="margin-top:8mm"><div class="ar">خارطة الطريق المستقبلية</div><div class="en">Future Roadmap</div><div class="bar"></div></div>
  {road_html}
</div>

<!-- صفحة 7: الرسالة الختامية (بيضاء أنيقة) -->
<div class="page closing-page">
  <table class="closing-layout">
  <tr><td class="closing-mid">
  <div class="sec-head"><div class="ar">رسالة المؤسس</div><div class="en">Founder's Message</div><div class="bar"></div></div>
  <div class="fmsg">
    <p>بدأت فكرة <span class="gold">Maestro EGP</span> من إيمانٍ عميق بأن الإدارة الناجحة تقوم على الدقة والوضوح والقرار السليم في الوقت المناسب. ومن هذا المبدأ وُلد هذا النظام ليكون رفيقاً ذكياً ومتطوراً لكل صاحب مؤسسةٍ يسعى للنمو دون أن يُثقله تعقيد الأنظمة أو كثرة التفاصيل.</p>
    <p>حرصتُ على أن يجمع النظام بين البساطة في الاستخدام والعمق في التحليل، ليخدم أصحاب المؤسسات والمشاريع والشركات في إدارةٍ متطورةٍ وذكيةٍ ودقيقة، تُقلّل الحاجة إلى توظيف كوادر كبيرة، وتمنح صاحب القرار رؤيةً شاملةً تحت سيطرته الكاملة.</p>
    <p>وقد أُنجز هذا النظام على أيدي مختصين محترفين عالميين في مجال البرمجيات من أوروبا وشركاتٍ عالمية متطوّرة في الأنظمة، عبر فكرةٍ ذكية ومتطوّرة وعملٍ دؤوب تجاوز العامين من الجهد والتعب، ليتفوّق على أنظمةٍ رصينةٍ كبيرةٍ وعريقة في هذا المجال، ويمنح المشاريع إدارةً بأقل التكاليف الإدارية ويحدّ من الحاجة إلى الكوادر الإدارية الكبيرة — ليكون الأول في الشرق الأوسط والعالم.</p>
    <p>أتقدّم بخالص الشكر والتقدير لكل من وثق بهذا النظام واهتمّ به، ولكل من ساهم في تطويره ووصوله إلى هذه المرحلة. هذا الجهد مُهدًى لكل صاحب طموحٍ يؤمن بأن الإدارة الذكية المتطوّرة هي طريق النجاح.</p>
  </div>
  </td></tr>
  <tr><td class="closing-bot">
  <div class="fstrip">
    <img class="fstrip-logo" src="{LOGO}" alt="Maestro EGP"/>
    <div class="fstrip-txt">
      <div class="nm">Moataz <span style="color:#f6a623">Mehana</span></div>
      <div class="ar">معتز مهنا</div>
      <div class="rl">مؤسس ومطوّر نظام Maestro EGP — System Owner &amp; Developer</div>
      <table class="fstrip-contact"><tr>
        <td class="fc-email">✉ owner@maestroegp.com</td>
        <td class="fc-phone"><span class="phone-ico">☎</span>+9647707775910</td>
      </tr></table>
    </div>
  </div>
  </td></tr>
  </table>
</div>

</body></html>"""


def main():
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    HTML(string=HTML_DOC).write_pdf(str(OUTPUT))
    print(f"PDF generated -> {OUTPUT}  ({OUTPUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
