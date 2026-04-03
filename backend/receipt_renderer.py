"""
Receipt bitmap generator for thermal printers.
Renders Arabic/English text as ESC/POS raster bitmap commands.
"""
import os
import struct
import math
from PIL import Image, ImageDraw, ImageFont
import arabic_reshaper
from bidi.algorithm import get_display

FONT_DIR = os.path.join(os.path.dirname(__file__), "static", "fonts")
CAIRO_FONT = os.path.join(FONT_DIR, "Cairo-Variable.ttf")
MIXED_FONT_BOLD = "/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf"
MIXED_FONT_REG = "/usr/share/fonts/truetype/freefont/FreeSerif.ttf"
PAPER_WIDTH = 384  # 58mm thermal printer = 384 dots


def _has_arabic(text):
    for ch in text:
        if '\u0600' <= ch <= '\u06FF' or '\uFE70' <= ch <= '\uFEFF':
            return True
    return False


def _has_latin(text):
    for ch in text:
        if 'A' <= ch <= 'Z' or 'a' <= ch <= 'z':
            return True
    return False


def _get_font(size, bold=True):
    """Use Cairo for all text (supports Arabic+Latin+Numbers natively)."""
    try:
        return ImageFont.truetype(CAIRO_FONT, size)
    except Exception:
        try:
            font_path = MIXED_FONT_BOLD if bold else MIXED_FONT_REG
            return ImageFont.truetype(font_path, size)
        except Exception:
            return ImageFont.load_default()


def _shape_text(text):
    if _has_arabic(text):
        reshaped = arabic_reshaper.reshape(text)
        return get_display(reshaped)
    return text


def _draw_line(draw, text, y, font, align, paper_width):
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]

    if align == "center":
        x = (paper_width - tw) / 2
    elif align == "right":
        x = paper_width - tw - 4
    else:
        x = 4

    draw.text((x, y), text, font=font, fill=0)
    return bbox[3] - bbox[1] + 4


def render_receipt_image(order, config=None):
    show_prices = True
    if config and config.get("show_prices") is False:
        show_prices = False

    lang = order.get("language", "ar")

    lines = []

    # Restaurant name
    rname = order.get("restaurant_name", "")
    if rname:
        lines.append({"text": rname, "size": 22, "bold": True, "align": "center"})

    lines.append({"text": "=" * 32, "size": 11, "bold": False, "align": "center"})

    # Order number
    onum = order.get("order_number", "")
    if onum:
        lines.append({"text": f"#{onum}", "size": 18, "bold": True, "align": "left"})

    # Order type
    otype = order.get("order_type", "")
    if otype:
        type_map_ar = {"dine_in": "طلب داخلي", "takeaway": "طلب سفري", "delivery": "توصيل"}
        type_map_en = {"dine_in": "Dine In", "takeaway": "Takeaway", "delivery": "Delivery"}
        tmap = type_map_ar if lang == "ar" else type_map_en
        lines.append({"text": tmap.get(otype, otype), "size": 18, "bold": True, "align": "center"})

    # Table number
    tbl = order.get("table_number", "")
    if tbl:
        label = "طاولة" if lang == "ar" else "Table"
        lines.append({"text": f"{label}: {tbl}", "size": 16, "bold": True, "align": "center"})

    # Buzzer number
    buz = order.get("buzzer_number", "")
    if buz:
        label = "بزون" if lang == "ar" else "Buzzer"
        lines.append({"text": f"{label}: {buz}", "size": 16, "bold": True, "align": "center"})

    # Date
    from datetime import datetime
    lines.append({"text": datetime.now().strftime("%Y/%m/%d %H:%M"), "size": 12, "bold": False, "align": "center"})

    # Customer name
    cname = order.get("customer_name", "")
    if cname:
        lines.append({"text": cname, "size": 14, "bold": True, "align": "center"})

    lines.append({"text": "=" * 32, "size": 11, "bold": False, "align": "center"})

    # Items
    items = order.get("items", [])
    for item in items:
        name = item.get("product_name") or item.get("name", "")
        qty = item.get("quantity", 1)
        price = item.get("price", 0)

        if show_prices:
            total_price = int(round(price * qty))
            lines.append({"text": f"{name} x{qty}  {total_price}", "size": 15, "bold": True, "align": "left"})
        else:
            lines.append({"text": f"{name}  x{qty}", "size": 22, "bold": True, "align": "left"})

        notes = item.get("notes", "")
        if notes:
            lines.append({"text": f"  >> {notes}", "size": 12, "bold": False, "align": "left"})

        extras = item.get("extras", [])
        if extras:
            for extra in extras:
                ename = extra.get("name", "")
                if ename:
                    if show_prices and extra.get("price"):
                        lines.append({"text": f"  + {ename}  {int(round(extra['price']))}", "size": 11, "bold": False, "align": "left"})
                    else:
                        lines.append({"text": f"  + {ename}", "size": 11, "bold": False, "align": "left"})

    lines.append({"text": "=" * 32, "size": 11, "bold": False, "align": "center"})

    # Discount
    discount = order.get("discount", 0)
    if show_prices and discount and discount > 0:
        label = "خصم" if lang == "ar" else "Discount"
        lines.append({"text": f"{label}: -{int(round(discount))}", "size": 15, "bold": True, "align": "center"})

    # Total
    total = order.get("total")
    if show_prices and total is not None:
        label = "الاجمالي" if lang == "ar" else "Total"
        lines.append({"text": f"{label}: {int(round(total))}", "size": 22, "bold": True, "align": "center"})

    # Payment method
    pm = order.get("payment_method", "")
    if show_prices and pm:
        pm_map_ar = {"cash": "نقدي", "card": "بطاقة", "credit": "آجل"}
        pm_map_en = {"cash": "Cash", "card": "Card", "credit": "Credit"}
        pmap = pm_map_ar if lang == "ar" else pm_map_en
        label = "الدفع" if lang == "ar" else "Payment"
        lines.append({"text": f"{label}: {pmap.get(pm, pm)}", "size": 14, "bold": True, "align": "center"})

    # Cashier name
    cashier = order.get("cashier_name", "")
    if show_prices and cashier:
        label = "الكاشير" if lang == "ar" else "Cashier"
        lines.append({"text": f"{label}: {cashier}", "size": 11, "bold": False, "align": "center"})

    lines.append({"text": "=" * 32, "size": 11, "bold": False, "align": "center"})

    # Thank you
    thank = "شكرا لزيارتكم" if lang == "ar" else "Thank you!"
    lines.append({"text": thank, "size": 16, "bold": True, "align": "center"})

    # Maestro
    lines.append({"text": "Maestro EGP", "size": 10, "bold": False, "align": "center"})

    return _render_lines_to_escpos(lines)


def _render_lines_to_escpos(lines):
    max_height = 4000
    img = Image.new('1', (PAPER_WIDTH, max_height), 1)
    draw = ImageDraw.Draw(img)

    y = 8
    for line_info in lines:
        text = line_info["text"]
        size = line_info["size"]
        bold = line_info["bold"]
        align = line_info["align"]

        font = _get_font(size, bold)
        shaped = _shape_text(text)

        h = _draw_line(draw, shaped, y, font, align, PAPER_WIDTH)
        y += h

    actual_height = int(y) + 30
    if actual_height > max_height:
        actual_height = max_height

    img = img.crop((0, 0, PAPER_WIDTH, actual_height))

    result = bytearray()
    result.extend(b'\x1b\x40')  # ESC @ - Initialize printer

    bytes_per_row = (PAPER_WIDTH + 7) // 8

    # GS v 0 - Print raster bit image
    result.extend(b'\x1d\x76\x30\x00')
    result.append(bytes_per_row & 0xFF)
    result.append((bytes_per_row >> 8) & 0xFF)
    result.append(actual_height & 0xFF)
    result.append((actual_height >> 8) & 0xFF)

    pixels = img.load()
    for row in range(actual_height):
        for col_byte in range(bytes_per_row):
            byte_val = 0
            for bit in range(8):
                px = col_byte * 8 + bit
                if px < PAPER_WIDTH:
                    pixel = pixels[px, row]
                    if pixel == 0:  # Black pixel
                        byte_val |= (0x80 >> bit)
            result.append(byte_val)

    # Feed and cut
    result.extend(b'\x0a\x0a\x0a\x0a')
    result.extend(b'\x1d\x56\x42\x00')  # GS V B - Partial cut

    return bytes(result)
