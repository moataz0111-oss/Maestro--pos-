"""
Professional thermal receipt renderer.
HarfBuzz/raqm for Arabic shaping. Two-column layout.
"""
import os
import io
from PIL import Image, ImageDraw, ImageFont
from datetime import datetime

FONT_DIR = os.path.join(os.path.dirname(__file__), "static", "fonts")
CAIRO_FONT = os.path.join(FONT_DIR, "Cairo-Variable.ttf")
PW = 384
M = 10  # margin


def _f(sz):
    try:
        return ImageFont.truetype(CAIRO_FONT, sz)
    except Exception:
        return ImageFont.load_default()


def _ar(t):
    for c in str(t):
        if '\u0600' <= c <= '\u06FF' or '\uFE70' <= c <= '\uFEFF':
            return True
    return False


def _tw(draw, text, font):
    """Get text width and height."""
    try:
        if _ar(text):
            bb = draw.textbbox((0, 0), text, font=font, direction='rtl')
        else:
            bb = draw.textbbox((0, 0), text, font=font)
        return bb[2] - bb[0], bb[3] - bb[1]
    except:
        bb = draw.textbbox((0, 0), text, font=font)
        return bb[2] - bb[0], bb[3] - bb[1]


def _txt(draw, text, x, y, font, anchor='lt'):
    """Draw text with auto RTL detection."""
    text = str(text)
    try:
        if _ar(text):
            draw.text((x, y), text, font=font, fill=0, anchor=anchor, direction='rtl')
        else:
            draw.text((x, y), text, font=font, fill=0, anchor=anchor)
    except:
        draw.text((x, y), text, font=font, fill=0, anchor=anchor)


def _center(draw, text, y, sz):
    f = _f(sz)
    w, h = _tw(draw, text, f)
    _txt(draw, text, PW // 2, y, f, 'mt')
    return h + 5


def _right_align(draw, text, y, sz):
    """Draw text aligned to right side (for Arabic)."""
    f = _f(sz)
    w, h = _tw(draw, text, f)
    _txt(draw, text, PW - M, y, f, 'rt')
    return h + 4


def _row2(draw, right_text, left_text, y, rsz=14, lsz=14):
    """Two columns: right and left."""
    fr, fl = _f(rsz), _f(lsz)
    rh, lh = 0, 0
    if right_text:
        _, rh = _tw(draw, right_text, fr)
        _txt(draw, right_text, PW - M, y, fr, 'rt')
    if left_text:
        _, lh = _tw(draw, left_text, fl)
        _txt(draw, left_text, M, y, fl, 'lt')
    return max(rh, lh) + 5


def _thick_sep(draw, y):
    """Bold double separator line."""
    draw.line([(M, y), (PW - M, y)], fill=0, width=2)
    draw.line([(M, y + 4), (PW - M, y + 4)], fill=0, width=2)
    return 12


def _thin_sep(draw, y):
    """Thin dashed separator."""
    for x in range(M, PW - M, 6):
        draw.line([(x, y + 1), (x + 3, y + 1)], fill=0, width=1)
    return 7


def _time12():
    n = datetime.now()
    h = n.hour
    ap = "AM" if h < 12 else "PM"
    if h == 0: h = 12
    elif h > 12: h -= 12
    return f"{h}:{n.minute:02d}:{n.second:02d} {ap}"


def _date():
    n = datetime.now()
    return f"{n.day}/{n.month}/{n.year}"


def _escpos(img):
    w, h = img.size
    if img.mode != '1':
        img = img.convert('1')
    r = bytearray(b'\x1b\x40')
    bpr = (w + 7) // 8
    r.extend(b'\x1d\x76\x30\x00')
    r.append(bpr & 0xFF); r.append((bpr >> 8) & 0xFF)
    r.append(h & 0xFF); r.append((h >> 8) & 0xFF)
    px = img.load()
    for row in range(h):
        for cb in range(bpr):
            bv = 0
            for bit in range(8):
                p = cb * 8 + bit
                if p < w and px[p, row] == 0:
                    bv |= (0x80 >> bit)
            r.append(bv)
    r.extend(b'\x0a\x0a\x0a\x0a\x1d\x56\x42\x00')
    return bytes(r)


def render_receipt_image(order, config=None):
    show_prices = True
    if config and config.get("show_prices") is False:
        show_prices = False
    is_ar = order.get("language", "ar") == "ar"

    img = Image.new('L', (PW, 5000), 255)
    d = ImageDraw.Draw(img)
    y = 8

    # ══════════ LOGO ══════════
    logo_data = order.get("logo_base64") or order.get("logo")
    if logo_data:
        try:
            import base64 as b64
            raw = logo_data.split(",", 1)[1] if logo_data.startswith("data:") else logo_data
            logo_img = Image.open(io.BytesIO(b64.b64decode(raw))).convert('L')
            logo_img.thumbnail((180, 90), Image.LANCZOS)
            img.paste(logo_img, ((PW - logo_img.width) // 2, y))
            y += logo_img.height + 4
        except:
            pass

    # ══════════ RESTAURANT NAME ══════════
    rname = order.get("restaurant_name", "")
    if rname:
        y += _center(d, rname, y, 26)

    # ══════════ SECTION NAME ══════════
    section = order.get("section_name") or order.get("printer_section") or ""
    if section:
        y += _center(d, section, y, 16)

    y += _thick_sep(d, y)

    # ══════════ ORDER INFO (two columns) ══════════
    onum = order.get("order_number", "")
    otype = order.get("order_type", "")
    tmap = {"dine_in": "داخلي", "takeaway": "سفري", "delivery": "توصيل"} if is_ar else {"dine_in": "Dine In", "takeaway": "Takeaway", "delivery": "Delivery"}

    if onum:
        olabel = f"طلب #{onum}" if is_ar else f"Order #{onum}"
        tlabel = tmap.get(otype, otype)
        y += _row2(d, olabel, tlabel, y, 20, 20)

    # Branch + Cashier
    bname = order.get("branch_name", "")
    cashier = order.get("cashier_name", "")
    cr = f"الكاشير {cashier}" if (is_ar and cashier) else (f"Cashier {cashier}" if cashier else "")
    if bname or cr:
        y += _row2(d, bname, cr, y, 13, 13)

    # Date + Time 12h
    y += _row2(d, _time12(), _date(), y, 13, 13)

    # ══════════ ORDER TYPE DETAILS ══════════
    if otype == "dine_in":
        tbl = order.get("table_number", "")
        if tbl:
            y += _right_align(d, f"طاولة {tbl}" if is_ar else f"Table {tbl}", y, 18)

    elif otype == "takeaway":
        buz = order.get("buzzer_number", "")
        if buz:
            y += _right_align(d, f"الجهاز {buz}" if is_ar else f"Buzzer {buz}", y, 18)
        cname = order.get("customer_name", "")
        if cname:
            y += _right_align(d, cname, y, 16)

    elif otype == "delivery":
        cname = order.get("customer_name", "")
        if cname:
            y += _right_align(d, f"العميل: {cname}" if is_ar else f"Customer: {cname}", y, 15)
        company = order.get("delivery_company", "")
        driver = order.get("driver_name", "")
        if company:
            y += _right_align(d, f"شركة التوصيل: {company}" if is_ar else f"Delivery: {company}", y, 15)
        elif driver:
            y += _right_align(d, f"السائق: {driver}" if is_ar else f"Driver: {driver}", y, 15)

    y += _thick_sep(d, y)

    # ══════════ ITEMS ══════════
    items = order.get("items", [])
    for idx, item in enumerate(items):
        name = item.get("product_name") or item.get("name", "")
        qty = item.get("quantity", 1)
        price = item.get("price", 0)

        if show_prices:
            # Invoice: qty + name (right) | price (left)
            tp = f"{int(round(price * qty)):,}"
            y += _row2(d, f"{qty}  {name}", tp, y, 17, 17)
        else:
            # Kitchen: qty + name ONLY, big bold
            y += _right_align(d, f"{qty}  {name}", y, 24)

        # Notes
        notes = item.get("notes", "")
        if notes:
            y += _right_align(d, f"** {notes}", y, 14)

        # Extras
        extras = item.get("extras") or []
        for ex in extras:
            ename = ex.get("name", "")
            if ename:
                if show_prices and ex.get("price"):
                    y += _row2(d, f"  + {ename}", f"{int(round(ex['price'])):,}", y, 13, 13)
                else:
                    y += _right_align(d, f"  + {ename}", y, 15)

        # Thin separator between items
        if idx < len(items) - 1:
            y += _thin_sep(d, y)

    y += _thick_sep(d, y)

    # ══════════ TOTALS (Invoice only) ══════════
    if show_prices:
        disc = order.get("discount", 0)
        if disc and float(disc) > 0:
            lbl = "خصم" if is_ar else "Discount"
            y += _row2(d, lbl, f"-{int(round(float(disc))):,}", y, 15, 15)

        total = order.get("total")
        if total is not None:
            lbl = "الاجمالي" if is_ar else "Total"
            y += _row2(d, lbl, f"{int(round(float(total))):,}", y, 24, 24)

        pm = order.get("payment_method", "")
        if pm:
            pmm = {"cash": "نقدي" if is_ar else "Cash", "card": "بطاقة" if is_ar else "Card", "credit": "آجل" if is_ar else "Credit"}
            lbl = "الدفع" if is_ar else "Payment"
            y += _row2(d, lbl, pmm.get(pm, pm), y, 14, 14)

        y += _thick_sep(d, y)
        y += _center(d, "شكرا لزيارتكم" if is_ar else "Thank you!", y, 18)
        y += 3

    # ══════════ FOOTER ══════════
    if onum:
        y += _center(d, f"*** طلب #{onum} ***" if is_ar else f"*** Order #{onum} ***", y, 16)

    now = datetime.now()
    y += _center(d, f"Printed On {now.strftime('%d-%m-%Y')} {_time12()}", y, 9)
    y += _center(d, "Maestro EGP", y, 9)

    # Crop + convert
    img = img.crop((0, 0, PW, int(y) + 20))
    return _escpos(img.point(lambda x: 0 if x < 128 else 255, '1'))
