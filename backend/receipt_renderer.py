"""
Receipt bitmap generator for thermal printers.
Uses Pillow with HarfBuzz/raqm for proper Arabic text shaping.
Professional two-column layout matching restaurant POS standards.
"""
import os
import io
import math
from PIL import Image, ImageDraw, ImageFont
from datetime import datetime

FONT_DIR = os.path.join(os.path.dirname(__file__), "static", "fonts")
CAIRO_FONT = os.path.join(FONT_DIR, "Cairo-Variable.ttf")
PAPER_WIDTH = 384
MARGIN = 8


def _has_arabic(text):
    for ch in str(text):
        if '\u0600' <= ch <= '\u06FF' or '\uFE70' <= ch <= '\uFEFF':
            return True
    return False


def _font(size):
    try:
        return ImageFont.truetype(CAIRO_FONT, size)
    except Exception:
        return ImageFont.load_default()


def _center(draw, text, y, size, pw=PAPER_WIDTH):
    f = _font(size)
    is_ar = _has_arabic(text)
    try:
        if is_ar:
            bbox = draw.textbbox((0, 0), text, font=f, direction='rtl')
        else:
            bbox = draw.textbbox((0, 0), text, font=f)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
    except Exception:
        bbox = draw.textbbox((0, 0), text, font=f)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        is_ar = False
    x = (pw - tw) / 2
    if is_ar:
        draw.text((x + tw, y), text, font=f, fill=0, anchor='rt', direction='rtl')
    else:
        draw.text((x, y), text, font=f, fill=0)
    return th + 3


def _left(draw, text, y, size, x=MARGIN, pw=PAPER_WIDTH):
    f = _font(size)
    is_ar = _has_arabic(text)
    try:
        if is_ar:
            bbox = draw.textbbox((0, 0), text, font=f, direction='rtl')
            th = bbox[3] - bbox[1]
            draw.text((pw - x, y), text, font=f, fill=0, anchor='rt', direction='rtl')
        else:
            bbox = draw.textbbox((0, 0), text, font=f)
            th = bbox[3] - bbox[1]
            draw.text((x, y), text, font=f, fill=0)
    except Exception:
        bbox = draw.textbbox((0, 0), text, font=f)
        th = bbox[3] - bbox[1]
        draw.text((x, y), text, font=f, fill=0)
    return th + 3


def _two_col(draw, right_text, left_text, y, right_size=14, left_size=14, pw=PAPER_WIDTH):
    """Draw two columns: right side (Arabic RTL) and left side."""
    fr = _font(right_size)
    fl = _font(left_size)
    rh, lh = 0, 0

    # Right side (Arabic - RTL from right edge)
    if right_text:
        is_ar = _has_arabic(right_text)
        try:
            if is_ar:
                bbox = draw.textbbox((0, 0), right_text, font=fr, direction='rtl')
                rh = bbox[3] - bbox[1]
                draw.text((pw - MARGIN, y), right_text, font=fr, fill=0, anchor='rt', direction='rtl')
            else:
                bbox = draw.textbbox((0, 0), right_text, font=fr)
                rh = bbox[3] - bbox[1]
                draw.text((pw - MARGIN, y), right_text, font=fr, fill=0, anchor='rt')
        except Exception:
            bbox = draw.textbbox((0, 0), right_text, font=fr)
            rh = bbox[3] - bbox[1]
            draw.text((pw - MARGIN, y), right_text, font=fr, fill=0, anchor='rt')

    # Left side
    if left_text:
        is_ar_l = _has_arabic(left_text)
        try:
            if is_ar_l:
                bbox = draw.textbbox((0, 0), left_text, font=fl, direction='rtl')
                lh = bbox[3] - bbox[1]
                tw = bbox[2] - bbox[0]
                draw.text((MARGIN + tw, y), left_text, font=fl, fill=0, anchor='rt', direction='rtl')
            else:
                bbox = draw.textbbox((0, 0), left_text, font=fl)
                lh = bbox[3] - bbox[1]
                draw.text((MARGIN, y), left_text, font=fl, fill=0, anchor='lt')
        except Exception:
            bbox = draw.textbbox((0, 0), left_text, font=fl)
            lh = bbox[3] - bbox[1]
            draw.text((MARGIN, y), left_text, font=fl, fill=0, anchor='lt')

    return max(rh, lh) + 4


def _sep(draw, y, pw=PAPER_WIDTH):
    """Draw separator line."""
    draw.line([(MARGIN, y + 2), (pw - MARGIN, y + 2)], fill=0, width=1)
    return 8


def _time_12h():
    """Get current time in 12-hour format with seconds."""
    now = datetime.now()
    hour = now.hour
    ampm = "AM" if hour < 12 else "PM"
    if hour == 0:
        hour = 12
    elif hour > 12:
        hour -= 12
    return f"{hour}:{now.minute:02d}:{now.second:02d} {ampm}"


def _date_formatted():
    now = datetime.now()
    return f"{now.day}/{now.month}/{now.year}"


def _image_to_escpos(img):
    """Convert a 1-bit PIL Image to ESC/POS GS v 0 raster bytes."""
    width, height = img.size
    if img.mode != '1':
        img = img.convert('1')

    result = bytearray()
    result.extend(b'\x1b\x40')  # Initialize

    bytes_per_row = (width + 7) // 8
    result.extend(b'\x1d\x76\x30\x00')
    result.append(bytes_per_row & 0xFF)
    result.append((bytes_per_row >> 8) & 0xFF)
    result.append(height & 0xFF)
    result.append((height >> 8) & 0xFF)

    pixels = img.load()
    for row in range(height):
        for col_byte in range(bytes_per_row):
            byte_val = 0
            for bit in range(8):
                px = col_byte * 8 + bit
                if px < width and pixels[px, row] == 0:
                    byte_val |= (0x80 >> bit)
            result.append(byte_val)

    result.extend(b'\x0a\x0a\x0a\x0a')
    result.extend(b'\x1d\x56\x42\x00')  # Partial cut
    return bytes(result)


def render_receipt_image(order, config=None):
    """Generate professional ESC/POS receipt bitmap."""
    show_prices = True
    if config and config.get("show_prices") is False:
        show_prices = False

    is_ar = order.get("language", "ar") == "ar"
    img = Image.new('L', (PAPER_WIDTH, 5000), 255)
    draw = ImageDraw.Draw(img)
    y = 6

    # ============ شعار المطعم ============
    logo_data = order.get("logo_base64") or order.get("logo")
    if logo_data:
        try:
            import base64
            if logo_data.startswith("data:"):
                logo_data = logo_data.split(",", 1)[1]
            logo_bytes = base64.b64decode(logo_data)
            logo_img = Image.open(io.BytesIO(logo_bytes)).convert('L')
            max_w, max_h = 200, 100
            logo_img.thumbnail((max_w, max_h), Image.LANCZOS)
            lx = (PAPER_WIDTH - logo_img.width) // 2
            img.paste(logo_img, (lx, y))
            y += logo_img.height + 4
        except Exception:
            pass

    # ============ اسم المطعم ============
    rname = order.get("restaurant_name", "")
    if rname:
        y += _center(draw, rname, y, 24)

    # ============ اسم القسم (من بيانات الطابعة) ============
    section = order.get("section_name") or order.get("printer_section") or ""
    if section:
        y += _center(draw, section, y, 14)

    y += _sep(draw, y)

    # ============ صف 1: رقم الطلب + نوع الطلب ============
    onum = order.get("order_number", "")
    otype = order.get("order_type", "")
    type_map = {
        "dine_in": "داخلي" if is_ar else "Dine In",
        "takeaway": "سفري" if is_ar else "Takeaway",
        "delivery": "توصيل" if is_ar else "Delivery"
    }
    order_label = f"طلب #{onum}" if is_ar else f"Order #{onum}"
    type_label = type_map.get(otype, otype)

    y += _two_col(draw, order_label, type_label, y, 18, 18)

    # ============ صف 2: اسم الفرع + اسم الكاشير ============
    bname = order.get("branch_name", "")
    cashier = order.get("cashier_name", "")
    cashier_text = f"الكاشير {cashier}" if (is_ar and cashier) else (f"Cashier {cashier}" if cashier else "")
    y += _two_col(draw, bname, cashier_text, y, 13, 13)

    # ============ صف 3: التاريخ + الوقت (12 ساعة) ============
    date_str = _date_formatted()
    time_str = _time_12h()
    y += _two_col(draw, time_str, date_str, y, 12, 12)

    # ============ تفاصيل حسب نوع الطلب ============
    if otype == "dine_in":
        tbl = order.get("table_number", "")
        if tbl:
            tbl_label = f"طاولة {tbl}" if is_ar else f"Table {tbl}"
            y += _left(draw, tbl_label, y, 16)

    elif otype == "takeaway":
        buz = order.get("buzzer_number", "")
        if buz:
            buz_label = f"الجهاز {buz}" if is_ar else f"Buzzer {buz}"
            y += _left(draw, buz_label, y, 16)
        cname = order.get("customer_name", "")
        if cname:
            y += _left(draw, cname, y, 14)

    elif otype == "delivery":
        cname = order.get("customer_name", "")
        if cname:
            c_label = f"العميل: {cname}" if is_ar else f"Customer: {cname}"
            y += _left(draw, c_label, y, 14)
        driver = order.get("driver_name", "")
        company = order.get("delivery_company", "")
        if company:
            co_label = f"شركة التوصيل: {company}" if is_ar else f"Delivery: {company}"
            y += _left(draw, co_label, y, 14)
        elif driver:
            dr_label = f"السائق: {driver}" if is_ar else f"Driver: {driver}"
            y += _left(draw, dr_label, y, 14)
        addr = order.get("delivery_address", "")
        if addr:
            y += _left(draw, addr, y, 12)

    y += _sep(draw, y)

    # ============ عناصر الطلب ============
    items = order.get("items", [])
    for item in items:
        name = item.get("product_name") or item.get("name", "")
        qty = item.get("quantity", 1)
        price = item.get("price", 0)

        if show_prices:
            total_price = f"{int(round(price * qty)):,}"
            item_text = f"{qty}  {name}"
            y += _two_col(draw, item_text, total_price, y, 16, 16)
        else:
            item_text = f"{qty}  {name}"
            y += _left(draw, item_text, y, 22)

        notes = item.get("notes", "")
        if notes:
            y += _left(draw, f">> {notes}", y, 12)

        extras = item.get("extras") or []
        for extra in extras:
            ename = extra.get("name", "")
            if ename:
                if show_prices and extra.get("price"):
                    ep = f"{int(round(extra['price'])):,}"
                    y += _two_col(draw, f"+ {ename}", ep, y, 12, 12)
                else:
                    y += _left(draw, f"+ {ename}", y, 13)

    y += _sep(draw, y)

    # ============ الأقسام المالية (فاتورة الكاشير فقط) ============
    if show_prices:
        discount = order.get("discount", 0)
        if discount and float(discount) > 0:
            label = "خصم" if is_ar else "Discount"
            y += _two_col(draw, label, f"-{int(round(float(discount))):,}", y, 14, 14)

        total = order.get("total")
        if total is not None:
            label = "الاجمالي" if is_ar else "Total"
            y += _two_col(draw, label, f"{int(round(float(total))):,}", y, 22, 22)

        pm = order.get("payment_method", "")
        if pm:
            pm_map = {"cash": "نقدي" if is_ar else "Cash", "card": "بطاقة" if is_ar else "Card", "credit": "آجل" if is_ar else "Credit"}
            label = "الدفع" if is_ar else "Payment"
            y += _two_col(draw, label, pm_map.get(pm, pm), y, 13, 13)

        y += _sep(draw, y)
        thank = "شكرا لزيارتكم" if is_ar else "Thank you!"
        y += _center(draw, thank, y, 16)

    # ============ رقم الطلب مكرر أسفل ============
    if onum:
        y += _center(draw, f"طلب#{onum}" if is_ar else f"Order#{onum}", y, 18)

    # ============ تاريخ الطباعة ============
    now = datetime.now()
    printed = f"Printed On {now.strftime('%d-%m-%Y')} {_time_12h()}"
    y += _center(draw, printed, y, 9)

    # Maestro
    y += _center(draw, "Maestro EGP", y, 9)

    # Crop and convert
    actual_h = int(y) + 20
    img = img.crop((0, 0, PAPER_WIDTH, actual_h))
    img_bw = img.point(lambda x: 0 if x < 128 else 255, '1')
    return _image_to_escpos(img_bw)
