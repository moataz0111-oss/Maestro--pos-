#!/usr/bin/env python3
"""
سكريبت لتحويل جميع النصوص العربية الثابتة إلى استخدام دالة الترجمة t()
"""
import os
import re
import json

# مسار مجلد الصفحات
PAGES_DIR = "/app/frontend/src/pages"
COMPONENTS_DIR = "/app/frontend/src/components"

# نمط للبحث عن النصوص العربية
# البحث عن نصوص بين علامات تنصيص تحتوي على أحرف عربية
ARABIC_PATTERN = re.compile(r'(["\'])([^"\']*[\u0600-\u06FF]+[^"\']*)\1')

# استثناءات - لا نريد تحويل هذه
EXCEPTIONS = [
    'console.log',
    'console.error',
    '//',  # تعليقات
    '/*',  # تعليقات
    'className',
    'placeholder:',
    'font-',
    'text-',
    'dir=',
]

# ملفات لا نريد تعديلها
SKIP_FILES = [
    'autoTranslate.js',
    'translations.js',
]

def should_skip_line(line):
    """تحقق إذا كان السطر يجب تخطيه"""
    stripped = line.strip()
    
    # تخطي التعليقات
    if stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('*'):
        return True
    
    # تخطي console
    if 'console.' in line:
        return True
        
    return False

def process_line(line):
    """معالجة سطر واحد وتحويل النصوص العربية"""
    if should_skip_line(line):
        return line
    
    # البحث عن النصوص العربية التي لم يتم تحويلها بعد
    # تجنب النصوص المحاطة بـ t(' أو t("
    
    def replace_arabic(match):
        quote = match.group(1)
        text = match.group(2)
        
        # تحقق إذا كان النص بالفعل داخل t()
        # نبحث قبل المطابقة
        start = match.start()
        before = line[max(0, start-3):start]
        
        if 't(' in before or 't (' in before:
            return match.group(0)  # لا تغيير
        
        # تحقق إذا كان هناك أحرف عربية فعلية
        arabic_chars = [c for c in text if '\u0600' <= c <= '\u06FF']
        if len(arabic_chars) < 2:
            return match.group(0)  # نص قصير جداً
        
        # تحويل النص
        return f"{{t({quote}{text}{quote})}}"
    
    # تطبيق التحويل
    result = ARABIC_PATTERN.sub(replace_arabic, line)
    
    return result

def process_file(filepath):
    """معالجة ملف واحد"""
    filename = os.path.basename(filepath)
    
    if filename in SKIP_FILES:
        print(f"  Skipping: {filename}")
        return 0
    
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    # تحقق من وجود useTranslation
    has_translation = any('useTranslation' in line for line in lines)
    
    if not has_translation:
        print(f"  Warning: {filename} doesn't have useTranslation import")
        return 0
    
    modified = False
    new_lines = []
    changes = 0
    
    for line in lines:
        new_line = process_line(line)
        if new_line != line:
            modified = True
            changes += 1
        new_lines.append(new_line)
    
    if modified:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(new_lines)
        print(f"  Modified: {filename} ({changes} changes)")
    
    return changes

def main():
    total_changes = 0
    
    print("Processing pages...")
    for filename in os.listdir(PAGES_DIR):
        if filename.endswith('.js') or filename.endswith('.jsx'):
            filepath = os.path.join(PAGES_DIR, filename)
            changes = process_file(filepath)
            total_changes += changes
    
    print("\nProcessing components...")
    for filename in os.listdir(COMPONENTS_DIR):
        if filename.endswith('.js') or filename.endswith('.jsx'):
            filepath = os.path.join(COMPONENTS_DIR, filename)
            changes = process_file(filepath)
            total_changes += changes
    
    print(f"\nTotal changes: {total_changes}")

if __name__ == "__main__":
    main()
