# 🛡️ دليل النشر الآمن — Maestro POS

> **قاعدة ذهبية**: لا تنشر أي تحديث على VPS قبل تشغيل `pre_deploy_check.py`.
> هذا يمنع 99% من حالات "الشاشة البيضاء" والتعطّل المفاجئ.

---

## ✅ خطوات النشر الآمن (ترتيب إلزامي)

### الخطوة 1 — على Emergent (قبل ضغط "Save to GitHub")
كل تحديث جديد يجب أن يمر بـ:
1. الـ Agent يُشغّل `pytest` ويتأكد من نجاح كل الاختبارات.
2. الـ Agent يُشغّل `python3 backend/scripts/pre_deploy_check.py` ويتأكد من ✅.
3. فقط بعد ذلك يُقترح ضغط "Save to GitHub".

### الخطوة 2 — على VPS (قبل `systemctl restart`)
بعد `git pull` من GitHub، اتبع هذا بدقة:

```bash
cd /path/to/maestro-pos/backend

# (1) فحص استيراد السيرفر — يكشف ImportError قبل إعادة التشغيل
python3 scripts/pre_deploy_check.py

# (2) إن نجح الفحص → أعد تشغيل السيرفر
sudo systemctl restart maestro-backend

# (3) تحقق من السيرفر يعمل
curl -s http://localhost:8001/api/health | grep -q "ok" && echo "✅ Backend up" || echo "❌ BACKEND DOWN"

# (4) ابنِ الفرونت إند
cd ../frontend
yarn build

# (5) أعد تشغيل nginx (أو ما يقدّم الفرونت)
sudo systemctl reload nginx
```

### الخطوة 3 — تحقق ما بعد النشر
```bash
# افتح الموقع في متصفح: يجب أن تظهر شاشة تسجيل الدخول خلال 3 ثوانٍ
# إن ظهرت شاشة بيضاء → نفّذ rollback فوراً (الخطوة 4)
```

### الخطوة 4 — Rollback آمن (إن حدث خطأ)
```bash
cd /path/to/maestro-pos
git log --oneline -10                    # شاهد آخر commits
git checkout <previous_good_commit>      # ارجع لآخر نسخة ناجحة
sudo systemctl restart maestro-backend
sudo systemctl reload nginx
```

---

## 🔒 ضمانات بنية تحتية (مُضافة في فبراير 2026)

| الحارس | الموقع | يحرس ضد |
|---|---|---|
| `test_server_import_smoke.py` | `backend/tests/` | فشل استيراد server.py |
| `pre_deploy_check.py` | `backend/scripts/` | شامل: استيراد + تركيب FastAPI + helpers |
| `conftest.py` | `backend/` | منع `__pycache__` يكسر auto-commit |
| `pytest.ini` | `backend/` | عزل pytest cache خارج /app |
| Offline POS Mode | `frontend/src/lib/` | منع فقدان طلبات أثناء توقف السيرفر |

---

## 🛟 ضمان البيانات

> **حقيقة محاسبية**: لا يمكن حدوث فقدان بيانات بسبب فشل استيراد السيرفر،
> لأن السيرفر إن لم يبدأ → لا يكتب أي شيء في MongoDB. قاعدة البيانات لا تُلمَس.

**أثناء توقف السيرفر:**
- ✅ POS Offline Mode يحفظ كل الطلبات محلياً (IndexedDB).
- ✅ بعد عودة السيرفر، تتم المزامنة تلقائياً مع de-duplication.
- ✅ المخزون والتقارير غير متأثرة (لم تُعدَّل).
- ✅ بيانات العملاء غير متأثرة.

---

## 📞 إن واجهت مشكلة في النشر

1. شغّل: `tail -100 /var/log/maestro-backend.log` → ابحث عن `Error`/`Exception`.
2. إن وجدت `ModuleNotFoundError` أو `ImportError` → ارجع للنسخة السابقة فوراً عبر `git checkout`.
3. أرسل السطر الأخير من السجل لـ Emergent للحل السريع.
