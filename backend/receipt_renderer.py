"""
Receipt bitmap generator for thermal printers.
Uses Pillow with HarfBuzz/raqm for proper Arabic text shaping.
Generates ESC/POS raster bitmap commands.
"""
import os
from PIL import Image, ImageDraw, ImageFont
from datetime import datetime

FONT_DIR = os.path.join(os.path.dirname(__file__), "static", "fonts")
CAIRO_FONT = os.path.join(FONT_DIR, "Cairo-Variable.ttf")
FALLBACK_FONT = "/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf"
PAPER_WIDTH = 384  # 58mm thermal printer = 384 dots


def _has_arabic(text):
    for ch in str(text):
        if '\u0600' <= ch <= '\u06FF' or '\uFE70' <= ch <= '\uFEFF':
            return True
    return False


def _get_font(size):
    try:
        return ImageFont.truetype(CAIRO_FONT, size)
    except Exception:
        try:
            return ImageFont.truetype(FALLBACK_FONT, size)
        except Exception:
            return ImageFont.load_default()


def _draw_text(draw, text, y, size, align, paper_width):
    """Draw text with proper Arabic RTL support using raqm layout."""
    font = _get_font(size)
    text = str(text)
    is_arabic = _has_arabic(text)

    try:
        if is_arabic:
            bbox = draw.textbbox((0, 0), text, font=font, direction='rtl')
        else:
            bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
    except Exception:
        bbox = draw.textbbox((0, 0), text, font=font)
        tw = bbox[2] - bbox[0]
        th = bbox[3] - bbox[1]
        is_arabic = False

    if align == "center":
        x = (paper_width - tw) / 2
    elif align == "right":
        x = paper_width - tw - 6
    else:
        x = 6

    try:
        if is_arabic:
            draw.text((x, y), text, font=font, fill=0, direction='rtl')
        else:
            draw.text((x, y), text, font=font, fill=0)
    except Exception:
        draw.text((x, y), text, font=font, fill=0)

    return th + 4


def _image_to_escpos(img):
    """Convert a 1-bit PIL Image to ESC/POS GS v 0 raster bit-image bytes."""
    width, height = img.size
    if img.mode != '1':
        img = img.convert('1')

    result = bytearray()
    result.extend(b'\x1b\x40')  # ESC @ - Initialize

    bytes_per_row = (width + 7) // 8

    # GS v 0 - Print raster bit image
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
                if px < width:
                    if pixels[px, row] == 0:  # Black pixel
                        byte_val |= (0x80 >> bit)
            result.append(byte_val)

    # Feed and partial cut
    result.extend(b'\x0a\x0a\x0a\x0a')
    result.extend(b'\x1d\x56\x42\x00')

    return bytes(result)


def render_receipt_image(order, config=None):
    """Generate ESC/POS bitmap bytes for a receipt."""
    show_prices = True
    if config and config.get("show_prices") is False:
        show_prices = False

    lang = order.get("language", "ar")
    is_ar = (lang == "ar")

    img = Image.new('L', (PAPER_WIDTH, 4000), 255)
    draw = ImageDraw.Draw(img)
    y = 10

    # === اسم المطعم ===
    rname = order.get("restaurant_name", "")
    if rname:
        y += _draw_text(draw, rname, y, 24, "center", PAPER_WIDTH)

    # === اسم الفرع ===
    bname = order.get("branch_name", "")
    if bname:
        y += _draw_text(draw, bname, y, 14, "center", PAPER_WIDTH)

    y += _draw_text(draw, "=" * 32, y, 11, "center", PAPER_WIDTH)

    # === رقم الطلب ===
    onum = order.get("order_number", "")
    if onum:
        label = "فاتورة" if is_ar else "Invoice"
        y += _draw_text(draw, f"#{onum}  {label}", y, 20, "center", PAPER_WIDTH)

    # === نوع الطلب ===
    otype = order.get("order_type", "")
    if otype:
        type_map = {
            "dine_in": "طلب داخلي" if is_ar else "Dine In",
            "takeaway": "طلب سفري" if is_ar else "Takeaway",
            "delivery": "توصيل" if is_ar else "Delivery"
        }
        type_text = type_map.get(otype, otype)
        y += _draw_text(draw, type_text, y, 20, "center", PAPER_WIDTH)

    # === اسم السائق / شركة التوصيل (للتوصيل فقط) ===
    if otype == "delivery":
        driver = order.get("driver_name", "")
        company = order.get("delivery_company", "")
        if driver:
            label = "السائق" if is_ar else "Driver"
            y += _draw_text(draw, f"{label}: {driver}", y, 14, "center", PAPER_WIDTH)
        if company:
            label = "شركة التوصيل" if is_ar else "Delivery Co"
            y += _draw_text(draw, f"{label}: {company}", y, 14, "center", PAPER_WIDTH)

    # === رقم الطاولة ===
    tbl = order.get("table_number", "")
    if tbl:
        label = "طاولة" if is_ar else "Table"
        y += _draw_text(draw, f"{label}: {tbl}", y, 18, "center", PAPER_WIDTH)

    # === رقم البزون ===
    buz = order.get("buzzer_number", "")
    if buz:
        label = "بزون" if is_ar else "Buzzer"
        y += _draw_text(draw, f"{label}: {buz}", y, 18, "center", PAPER_WIDTH)

    # === التاريخ ===
    y += _draw_text(draw, datetime.now().strftime("%Y/%m/%d %H:%M"), y, 12, "center", PAPER_WIDTH)

    # === اسم العميل ===
    cname = order.get("customer_name", "")
    if cname:
        y += _draw_text(draw, cname, y, 14, "center", PAPER_WIDTH)

    y += _draw_text(draw, "=" * 32, y, 11, "center", PAPER_WIDTH)

    # === عناصر الطلب ===
    items = order.get("items", [])
    for item in items:
        name = item.get("product_name") or item.get("name", "")
        qty = item.get("quantity", 1)
        price = item.get("price", 0)

        if show_prices:
            # فاتورة الكاشير: اسم + كمية + سعر
            total_price = int(round(price * qty))
            y += _draw_text(draw, f"{name}  x{qty}  {total_price}", y, 16, "left", PAPER_WIDTH)
        else:
            # طلب المطبخ: اسم + كمية فقط (خط كبير)
            y += _draw_text(draw, f"{name}  x{qty}", y, 24, "left", PAPER_WIDTH)

        # ملاحظات
        notes = item.get("notes", "")
        if notes:
            y += _draw_text(draw, f">> {notes}", y, 14, "left", PAPER_WIDTH)

        # إضافات
        extras = item.get("extras") or []
        for extra in extras:
            ename = extra.get("name", "")
            if ename:
                if show_prices and extra.get("price"):
                    y += _draw_text(draw, f"+ {ename}  {int(round(extra['price']))}", y, 12, "left", PAPER_WIDTH)
                else:
                    y += _draw_text(draw, f"+ {ename}", y, 14, "left", PAPER_WIDTH)

    y += _draw_text(draw, "=" * 32, y, 11, "center", PAPER_WIDTH)

    # === أقسام الفاتورة فقط (للكاشير) ===
    if show_prices:
        # الخصم
        discount = order.get("discount", 0)
        if discount and float(discount) > 0:
            label = "خصم" if is_ar else "Discount"
            y += _draw_text(draw, f"{label}: -{int(round(float(discount)))}", y, 16, "center", PAPER_WIDTH)

        # الإجمالي
        total = order.get("total")
        if total is not None:
            label = "الاجمالي" if is_ar else "Total"
            y += _draw_text(draw, f"{label}: {int(round(float(total)))}", y, 26, "center", PAPER_WIDTH)

        # طريقة الدفع
        pm = order.get("payment_method", "")
        if pm:
            pm_map = {"cash": "نقدي" if is_ar else "Cash", "card": "بطاقة" if is_ar else "Card", "credit": "آجل" if is_ar else "Credit"}
            label = "الدفع" if is_ar else "Payment"
            y += _draw_text(draw, f"{label}: {pm_map.get(pm, pm)}", y, 14, "center", PAPER_WIDTH)

        # اسم الكاشير
        cashier = order.get("cashier_name", "")
        if cashier:
            label = "الكاشير" if is_ar else "Cashier"
            y += _draw_text(draw, f"{label}: {cashier}", y, 12, "center", PAPER_WIDTH)

    y += _draw_text(draw, "=" * 32, y, 11, "center", PAPER_WIDTH)

    # شكراً
    if show_prices:
        thank = "شكرا لزيارتكم" if is_ar else "Thank you!"
        y += _draw_text(draw, thank, y, 18, "center", PAPER_WIDTH)

    # Maestro
    y += _draw_text(draw, "Maestro EGP", y, 10, "center", PAPER_WIDTH)

    # Crop to actual content height
    actual_height = int(y) + 25
    img = img.crop((0, 0, PAPER_WIDTH, actual_height))

    # Convert to 1-bit and generate ESC/POS
    img_bw = img.point(lambda x: 0 if x < 128 else 255, '1')
    return _image_to_escpos(img_bw)
