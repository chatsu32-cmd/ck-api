#!/usr/bin/env python3
"""仕込み指示書PDF生成。stdin から JSON を受け取り PDF を stdout に出力する。"""
import sys
import json
from io import BytesIO
from collections import defaultdict

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import os

# 日本語フォント（環境に合わせて自動選択）
FONT_CANDIDATES = [
    'C:/Windows/Fonts/msgothic.ttc',                        # Windows MSゴシック
    'C:/Windows/Fonts/meiryo.ttc',                          # Windows メイリオ
    '/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc',       # macOS
    '/System/Library/Fonts/Hiragino Sans GB.ttc',
    '/usr/share/fonts/opentype/ipafont-gothic/ipag.ttf',    # Linux
]
FONT_NAME = 'Helvetica'
for fp in FONT_CANDIDATES:
    if os.path.exists(fp):
        try:
            pdfmetrics.registerFont(TTFont('JpFont', fp))
            FONT_NAME = 'JpFont'
        except Exception:
            pass
        break

STATUS_LABELS = {
    'pending':   '未確認',
    'confirmed': '確認済み',
    'preparing': '仕込み中',
    'delivered': '納品済み',
    'cancelled': 'キャンセル',
}

ACCENT  = colors.HexColor('#4A90A4')
ROW_ALT = colors.HexColor('#F0F8FF')


def build_pdf(data: dict) -> bytes:
    order = data['order']
    items = data['items']

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=20*mm, bottomMargin=20*mm,
    )

    title_style = ParagraphStyle('T', fontName=FONT_NAME, fontSize=20, alignment=TA_CENTER, spaceAfter=4)
    meta_style  = ParagraphStyle('M', fontName=FONT_NAME, fontSize=10, spaceAfter=2)
    cat_style   = ParagraphStyle('C', fontName=FONT_NAME, fontSize=13, spaceBefore=6, spaceAfter=3, textColor=ACCENT)

    status_label = STATUS_LABELS.get(order.get('status', ''), order.get('status', ''))

    elems = [
        Paragraph('仕込み指示書', title_style),
        Spacer(1, 3*mm),
        Paragraph(f"発注 No.{order['id']}　　店舗: {order['store_name']}　　ステータス: {status_label}", meta_style),
        Paragraph(f"発注日時: {order['ordered_at']}　　納品予定: {order.get('delivery_date') or '未定'}", meta_style),
    ]
    if order.get('notes'):
        elems.append(Paragraph(f"備考: {order['notes']}", meta_style))
    elems.append(Spacer(1, 6*mm))

    by_cat = defaultdict(list)
    for item in items:
        by_cat[item.get('category', 'その他')].append(item)

    for cat, cat_items in by_cat.items():
        elems.append(Paragraph(f"【{cat}】", cat_style))

        table_data = [['商品名', '数量', '単位']]
        for item in cat_items:
            qty = item['quantity']
            qty_str = str(int(qty)) if float(qty) == int(qty) else str(qty)
            table_data.append([item['product_name'], qty_str, item['unit']])

        t = Table(table_data, colWidths=[100*mm, 40*mm, 30*mm])
        t.setStyle(TableStyle([
            ('FONTNAME',       (0, 0), (-1, -1), FONT_NAME),
            ('FONTSIZE',       (0, 0), (-1, -1), 10),
            ('BACKGROUND',     (0, 0), (-1,  0), ACCENT),
            ('TEXTCOLOR',      (0, 0), (-1,  0), colors.white),
            ('FONTSIZE',       (0, 0), (-1,  0), 11),
            ('ALIGN',          (1, 0), (-1, -1), 'CENTER'),
            ('VALIGN',         (0, 0), (-1, -1), 'MIDDLE'),
            ('GRID',           (0, 0), (-1, -1), 0.5, colors.grey),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, ROW_ALT]),
            ('TOPPADDING',     (0, 0), (-1, -1), 5),
            ('BOTTOMPADDING',  (0, 0), (-1, -1), 5),
        ]))
        elems.append(t)
        elems.append(Spacer(1, 3*mm))

    doc.build(elems)
    return buf.getvalue()


if __name__ == '__main__':
    data = json.loads(sys.stdin.read())
    pdf  = build_pdf(data)
    sys.stdout.buffer.write(pdf)
