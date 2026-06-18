"""اختبار منطق مزامنة الوارد + إنشاء إشعار فوري للبريد الجديد (مع محاكاة IMAP)."""
import asyncio
import os
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')

import server


async def run():
    db = server.db
    # تنظيف الحالة قبل الاختبار
    await db.email_inbox_state.delete_many({"_id": "inbox"})
    await db.notifications.delete_many({"type": "new_email", "data.subject": {"$in": ["TEST-A", "TEST-B"]}})

    # تأكد من وجود إعداد بريد (وهمي) حتى يتجاوز فحص "غير مُعد"
    await db.email_config.update_one(
        {}, {"$set": {"smtp_user": "owner@maestroegp.com", "smtp_password": "x",
                      "smtp_host": "mail.privateemail.com"}}, upsert=True)

    fake = {"messages": []}

    def fake_fetch(host, user, password, limit=25):
        return fake["messages"]

    orig = server._fetch_inbox_messages
    server._fetch_inbox_messages = fake_fetch
    try:
        cur = {"role": "super_admin"}
        # المزامنة الأولى: رسالة واحدة موجودة → يجب أن تُعلَّم كمرئية بلا إشعارات
        fake["messages"] = [{"message_id": "<a@x>", "from": "a@x.com", "from_name": "A",
                             "subject": "TEST-A", "date": "now", "snippet": "hi", "body_text": "", "body_html": ""}]
        r1 = await server.sync_inbox(limit=25, current_user=cur)
        assert r1["new_count"] == 0, f"first sync should not notify, got {r1['new_count']}"

        # المزامنة الثانية: وصلت رسالة جديدة → يجب إنشاء إشعار واحد
        fake["messages"] = [
            {"message_id": "<b@x>", "from": "b@x.com", "from_name": "B", "subject": "TEST-B",
             "date": "now2", "snippet": "new", "body_text": "", "body_html": ""},
            {"message_id": "<a@x>", "from": "a@x.com", "from_name": "A", "subject": "TEST-A",
             "date": "now", "snippet": "hi", "body_text": "", "body_html": ""},
        ]
        r2 = await server.sync_inbox(limit=25, current_user=cur)
        assert r2["new_count"] == 1, f"second sync should notify exactly 1, got {r2['new_count']}"

        notif = await db.notifications.find_one({"type": "new_email", "data.subject": "TEST-B"})
        assert notif is not None, "new_email notification not created"
        assert notif["is_read"] is False
        assert "B" in notif["message"] and "TEST-B" in notif["message"]

        # المزامنة الثالثة: لا جديد → 0
        r3 = await server.sync_inbox(limit=25, current_user=cur)
        assert r3["new_count"] == 0, f"third sync should be 0, got {r3['new_count']}"

        print("PASS: inbox sync notification logic works (silent first run, detects new, no dupes)")
    finally:
        server._fetch_inbox_messages = orig
        # تنظيف
        await db.email_inbox_state.delete_many({"_id": "inbox"})
        await db.notifications.delete_many({"type": "new_email", "data.subject": {"$in": ["TEST-A", "TEST-B"]}})
        # أعد ضبط كلمة المرور الوهمية (إزالتها لتبقى البيئة كما كانت)
        await db.email_config.update_one({}, {"$set": {"smtp_password": ""}})


if __name__ == "__main__":
    asyncio.run(run())
