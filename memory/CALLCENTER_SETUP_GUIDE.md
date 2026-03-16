# دليل إعداد نظام الكول سنتر (Caller ID)

## المتطلبات الأساسية
- نظام كول سنتر يدعم Webhook أو API
- اتصال إنترنت مستقر
- رابط Webhook الخاص بنظامك

---

## رابط Webhook الخاص بك:
```
https://dine-control-12.preview.emergentagent.com/api/callcenter/webhook
```

---

## 1. إعداد 3CX

### الخطوات:
1. سجل دخول إلى لوحة تحكم 3CX
2. اذهب إلى **Settings** → **Integrations** → **CRM**
3. اختر **Custom CRM**
4. أضف الإعدادات التالية:

```
CRM Server URL: https://dine-control-12.preview.emergentagent.com/api/callcenter/webhook
HTTP Method: POST
Content Type: application/json
```

5. في قسم **Call Events**, أضف:
```json
{
  "phone": "[CallerNumber]",
  "caller_name": "[CallerName]",
  "call_id": "[CallID]",
  "direction": "[CallDirection]",
  "extension": "[Extension]"
}
```

6. احفظ الإعدادات

---

## 2. إعداد RingCentral

### الخطوات:
1. اذهب إلى [Developer Console](https://developers.ringcentral.com)
2. أنشئ تطبيق جديد أو استخدم تطبيق موجود
3. في **Webhooks**, أضف:

```
Webhook URL: https://dine-control-12.preview.emergentagent.com/api/callcenter/webhook
Event Filter: /restapi/v1.0/account/~/extension/~/telephony/sessions
```

4. احفظ **Client ID** و **Client Secret**
5. أضفهم في إعدادات النظام

---

## 3. إعداد CloudTalk

### الخطوات:
1. سجل دخول إلى CloudTalk Dashboard
2. اذهب إلى **Settings** → **Integrations** → **Webhooks**
3. أضف Webhook جديد:

```
URL: https://dine-control-12.preview.emergentagent.com/api/callcenter/webhook
Events: call.started, call.answered, call.ended
```

4. انسخ API Key من **Settings** → **API**
5. أضفه في إعدادات النظام

---

## 4. إعداد Freshdesk Contact Center

### الخطوات:
1. اذهب إلى **Admin** → **Apps** → **Webhooks**
2. أنشئ Webhook جديد:

```
Name: Maestro POS Integration
URL: https://dine-control-12.preview.emergentagent.com/api/callcenter/webhook
Events: incoming_call, call_answered, call_ended
```

3. احفظ API Key وأضفه في إعدادات النظام

---

## 5. إعداد Asterisk / FreePBX

### الخطوة 1: إنشاء AGI Script
أنشئ ملف `/var/lib/asterisk/agi-bin/maestro_caller.php`:

```php
#!/usr/bin/php -q
<?php
// Maestro POS Caller ID Integration
$webhook_url = "https://dine-control-12.preview.emergentagent.com/api/callcenter/webhook";

// قراءة متغيرات AGI
$stdin = fopen('php://stdin', 'r');
while (!feof($stdin)) {
    $line = trim(fgets($stdin));
    if (empty($line)) break;
    if (strpos($line, ':') !== false) {
        list($key, $value) = explode(':', $line, 2);
        $agi[trim($key)] = trim($value);
    }
}

// إرسال البيانات للنظام
$data = [
    'phone' => $agi['agi_callerid'] ?? '',
    'caller_name' => $agi['agi_calleridname'] ?? '',
    'call_id' => $agi['agi_uniqueid'] ?? '',
    'direction' => 'incoming',
    'extension' => $agi['agi_extension'] ?? ''
];

$ch = curl_init($webhook_url);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 5);
curl_exec($ch);
curl_close($ch);

echo "RESULT=0\n";
?>
```

### الخطوة 2: إعطاء صلاحيات التنفيذ
```bash
chmod +x /var/lib/asterisk/agi-bin/maestro_caller.php
chown asterisk:asterisk /var/lib/asterisk/agi-bin/maestro_caller.php
```

### الخطوة 3: تعديل extensions.conf
أضف في `/etc/asterisk/extensions.conf`:

```ini
[from-internal]
exten => _X.,1,AGI(maestro_caller.php)
exten => _X.,n,Dial(${EXTEN})
```

### الخطوة 4: إعادة تحميل Asterisk
```bash
asterisk -rx "dialplan reload"
```

---

## 6. إعداد Twilio

### الخطوات:
1. سجل دخول إلى [Twilio Console](https://console.twilio.com)
2. اذهب إلى **Phone Numbers** → **Manage** → **Active Numbers**
3. اختر الرقم واذهب إلى **Voice Configuration**
4. في **A CALL COMES IN**, اختر **Webhook** وأضف:

```
URL: https://dine-control-12.preview.emergentagent.com/api/callcenter/webhook
HTTP: POST
```

5. احفظ **Account SID** و **Auth Token** من Dashboard
6. أضفهم في إعدادات النظام

---

## 7. إعداد Zoiper (Softphone)

### ملاحظة:
Zoiper هو تطبيق Softphone ولا يدعم Webhooks مباشرة.
يمكنك استخدامه مع نظام PBX (مثل Asterisk أو 3CX) الذي يرسل Webhooks.

### البديل:
استخدم **Zoiper API** مع برنامج وسيط:
1. قم بتشغيل سكريبت محلي يراقب مكالمات Zoiper
2. أرسل البيانات إلى Webhook

---

## اختبار الاتصال

### طريقة 1: محاكاة مكالمة من النظام
1. اذهب إلى **الإعدادات** → **الكول سنتر**
2. اضغط **محاكاة مكالمة واردة**
3. ستظهر نافذة المكالمة الواردة

### طريقة 2: اختبار Webhook يدوياً
```bash
curl -X POST "https://dine-control-12.preview.emergentagent.com/api/callcenter/webhook" \
  -H "Content-Type: application/json" \
  -d '{"phone": "07801234567", "caller_name": "عميل اختبار", "direction": "incoming"}'
```

---

## استكشاف الأخطاء

### المكالمات لا تظهر؟
1. تأكد من أن رابط Webhook صحيح
2. تأكد من أن نظام الكول سنتر يرسل الـ Events
3. تحقق من سجلات الخادم

### رقم الهاتف لا يظهر؟
1. تأكد من أن الحقل `phone` أو `caller_id` موجود في البيانات
2. تأكد من تفعيل Caller ID في نظام الهاتف

### العميل لا يظهر؟
1. تأكد من أن رقم الهاتف محفوظ بنفس الصيغة في قاعدة البيانات
2. جرب إضافة العميل يدوياً أولاً

---

## الدعم
للمساعدة، تواصل مع فريق الدعم أو راجع الوثائق التفصيلية لمزود الكول سنتر الخاص بك.
