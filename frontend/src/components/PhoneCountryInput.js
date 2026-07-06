import React, { useMemo } from 'react';
import { Input } from './ui/input';

// قائمة الدول الشائعة (رمز الاتصال الدولي) — العراق افتراضياً
export const COUNTRY_CODES = [
  { code: 'IQ', dial: '+964', name: 'العراق', flag: '🇮🇶' },
  { code: 'SA', dial: '+966', name: 'السعودية', flag: '🇸🇦' },
  { code: 'AE', dial: '+971', name: 'الإمارات', flag: '🇦🇪' },
  { code: 'EG', dial: '+20', name: 'مصر', flag: '🇪🇬' },
  { code: 'JO', dial: '+962', name: 'الأردن', flag: '🇯🇴' },
  { code: 'KW', dial: '+965', name: 'الكويت', flag: '🇰🇼' },
  { code: 'QA', dial: '+974', name: 'قطر', flag: '🇶🇦' },
  { code: 'BH', dial: '+973', name: 'البحرين', flag: '🇧🇭' },
  { code: 'OM', dial: '+968', name: 'عُمان', flag: '🇴🇲' },
  { code: 'LB', dial: '+961', name: 'لبنان', flag: '🇱🇧' },
  { code: 'SY', dial: '+963', name: 'سوريا', flag: '🇸🇾' },
  { code: 'YE', dial: '+967', name: 'اليمن', flag: '🇾🇪' },
  { code: 'PS', dial: '+970', name: 'فلسطين', flag: '🇵🇸' },
  { code: 'TR', dial: '+90', name: 'تركيا', flag: '🇹🇷' },
  { code: 'US', dial: '+1', name: 'أمريكا', flag: '🇺🇸' },
  { code: 'GB', dial: '+44', name: 'بريطانيا', flag: '🇬🇧' },
];

const DEFAULT_DIAL = '+964';

// تفكيك رقم كامل (E.164) إلى رمز دولة + الرقم المحلي
function parseValue(fullValue) {
  const v = (fullValue || '').toString().trim().replace(/\s/g, '');
  if (!v) return { dial: DEFAULT_DIAL, local: '' };
  let norm = v;
  if (norm.startsWith('00')) norm = '+' + norm.slice(2);
  if (norm.startsWith('+')) {
    // أطول رمز مطابق
    const sorted = [...COUNTRY_CODES].sort((a, b) => b.dial.length - a.dial.length);
    const match = sorted.find((c) => norm.startsWith(c.dial));
    if (match) return { dial: match.dial, local: norm.slice(match.dial.length) };
    return { dial: DEFAULT_DIAL, local: norm.replace('+', '') };
  }
  // رقم محلي يبدأ بصفر → العراق افتراضياً
  const local = norm.startsWith('0') ? norm.slice(1) : norm;
  return { dial: DEFAULT_DIAL, local };
}

export default function PhoneCountryInput({ value, onChange, placeholder = '7xxxxxxxx', testId = 'phone-input' }) {
  const { dial, local } = useMemo(() => parseValue(value), [value]);

  const emit = (newDial, newLocal) => {
    const digits = (newLocal || '').replace(/[^0-9]/g, '');
    onChange(digits ? `${newDial}${digits}` : '');
  };

  return (
    <div className="flex gap-2" dir="ltr">
      <select
        value={dial}
        onChange={(e) => emit(e.target.value, local)}
        className="w-[130px] shrink-0 rounded-md bg-background border border-input text-foreground text-sm px-2 py-2 focus:outline-none focus:ring-1 focus:ring-ring"
        data-testid={`${testId}-country`}
      >
        {COUNTRY_CODES.map((c) => (
          <option key={c.code} value={c.dial}>
            {c.flag} {c.dial}
          </option>
        ))}
      </select>
      <Input
        type="tel"
        inputMode="numeric"
        placeholder={placeholder}
        value={local}
        onChange={(e) => emit(dial, e.target.value)}
        className="flex-1"
        dir="ltr"
        data-testid={testId}
      />
    </div>
  );
}
