#!/usr/bin/env python3
"""Pre-deploy safety check — يُشغَّل قبل أي نشر إلى الإنتاج.

يضمن أن السيرفر يستطيع الاستيراد والإقلاع بدون أخطاء، مما يمنع فئة كاملة من
الفشل (مثل الشاشة البيضاء بسبب ImportError).

الاستخدام:
    python3 /app/backend/scripts/pre_deploy_check.py

يخرج بـ exit code 1 إن وُجدت مشكلة، 0 إن كل شيء سليم.
"""
import importlib.util
import os
import sys
import traceback

# تأكَّد من المسار
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

# Env vars آمنة للاختبار
os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "maestro_pos_smoke")


CHECKS = []


def check(name):
    """Decorator: register a check function."""
    def deco(fn):
        CHECKS.append((name, fn))
        return fn
    return deco


@check("import server.py")
def check_server_import():
    """server.py يجب أن يُستورد دون أخطاء (يحرس ضد الشاشة البيضاء)."""
    import server  # noqa: F401
    return "loaded successfully"


@check("FastAPI app exists")
def check_app_exists():
    import server
    assert hasattr(server, "app"), "server must export `app`"
    return f"app = {type(server.app).__name__}"


@check("critical helpers callable")
def check_critical_helpers():
    import server
    assert callable(server._convert_link_consumption_to_main), "missing converter"
    # Round-trip sanity
    assert server._convert_link_consumption_to_main(2, "كغم", "غرام", 0, "") == 2000.0
    return "converter ok"


@check("routes/inventory_system imports")
def check_inventory_routes():
    import routes.inventory_system  # noqa: F401
    return "ok"


@check("no syntax errors in server.py")
def check_syntax():
    spec = importlib.util.spec_from_file_location("__syn_check__", os.path.join(ROOT, "server.py"))
    spec.loader.exec_module(importlib.util.module_from_spec(spec))
    return "no syntax issues"


def main():
    print("=" * 70)
    print("🛡️  Pre-Deploy Safety Check — Maestro POS")
    print("=" * 70)
    failed = []
    for name, fn in CHECKS:
        try:
            result = fn()
            print(f"  ✅ {name:<40} → {result}")
        except Exception as e:
            print(f"  ❌ {name:<40} → {type(e).__name__}: {e}")
            traceback.print_exc(limit=3)
            failed.append((name, e))
    print("=" * 70)
    if failed:
        print(f"❌ {len(failed)} check(s) failed — DO NOT DEPLOY!")
        for name, e in failed:
            print(f"   • {name}: {e}")
        return 1
    print(f"✅ All {len(CHECKS)} checks passed — safe to deploy.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
