"""Prepare the supplied BAP package, preserving its letterhead and paraf footer.

Usage: python scripts/prepare_bap_template.py /path/to/original-bap.docx
It also accepts an existing prepared template for repeatable layout repairs.
Requires lxml. The original attachment is deliberately not committed separately.
"""
from copy import deepcopy
import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree

ROOT = Path(__file__).resolve().parent.parent
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main',
      'wp': 'http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing',
      'a': 'http://schemas.openxmlformats.org/drawingml/2006/main'}
W = '{' + NS['w'] + '}'
WIDTH = 9617  # Original A4 page width minus its left and right margins, twips.


def text(node):
    return ''.join(node.xpath('.//w:t/text()', namespaces=NS))


def element(tag, **attrs):
    return etree.Element(W + tag, {W + key: str(value) for key, value in attrs.items()})


def property_node(node, name):
    found = node.find('w:' + name, NS)
    if found is None:
        found = element(name)
        node.insert(0, found)
    return found


def paragraph(value='', after=60, bold=False, keep=False):
    p = element('p')
    pp = etree.SubElement(p, W + 'pPr')
    pp.append(element('spacing', after=after, line=276, lineRule='auto'))
    if keep:
        pp.append(element('keepNext'))
    run = etree.SubElement(p, W + 'r')
    rp = etree.SubElement(run, W + 'rPr')
    rp.append(element('rFonts', ascii='Arial', hAnsi='Arial', cs='Arial'))
    rp.append(element('sz', val=22))
    rp.append(element('color', val='000000'))
    if bold:
        rp.append(element('b'))
    t = etree.SubElement(run, W + 't')
    t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    t.text = value
    return p


def settext(p, value):
    # Replace content, retaining paragraph formatting but removing inherited tabs.
    for child in list(p):
        if child.tag != W + 'pPr':
            p.remove(child)
    run = paragraph(value).find('w:r', NS)
    p.append(run)


def borderless_table(widths, values, signature=False):
    table = element('tbl')
    pr = etree.SubElement(table, W + 'tblPr')
    pr.append(element('tblW', w=sum(widths), type='dxa'))
    pr.append(element('tblLayout', type='fixed'))
    borders = etree.SubElement(pr, W + 'tblBorders')
    for edge in ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']:
        borders.append(element(edge, val='nil'))
    grid = etree.SubElement(table, W + 'tblGrid')
    for width in widths:
        grid.append(element('gridCol', w=width))
    for index, row in enumerate(values):
        tr = etree.SubElement(table, W + 'tr')
        trpr = etree.SubElement(tr, W + 'trPr')
        trpr.append(element('cantSplit'))
        if signature and not any(row):
            trpr.append(element('trHeight', val=800, hRule='atLeast'))
        for width, value in zip(widths, row):
            tc = etree.SubElement(tr, W + 'tc')
            cp = etree.SubElement(tc, W + 'tcPr')
            cp.append(element('tcW', w=width, type='dxa'))
            cp.append(element('shd', val='clear', color='auto', fill='FFFFFF'))
            cb = etree.SubElement(cp, W + 'tcBorders')
            for edge in ['top', 'left', 'bottom', 'right']:
                cb.append(element(edge, val='nil'))
            margins = etree.SubElement(cp, W + 'tcMar')
            for edge in ['top', 'left', 'bottom', 'right']:
                margins.append(element(edge, w=0, type='dxa'))
            p = paragraph(value, after=100 if signature else 60,
                          bold=signature and index == 0, keep=signature and index < len(values) - 1)
            tc.append(p)
    return table


def identity_table(examiner=False):
    if examiner:
        pairs = [('Nama', 'Faisal'), ('NIP', '19761106 200502 1 001'),
                 ('Pangkat', 'IV-c/ Pembina Utama Muda'),
                 ('Jabatan', 'Direktur Perlindungan Sosial Non Kebencanaan')]
    else:
        pairs = [('Nama', '{nama}'), ('NIP', '{nip}'), ('Pangkat', '{pangkat}'),
                 ('Jabatan', '{jabatan}'), ('Unit Kerja', '{unitKerja}')]
    return borderless_table([1900, 220, WIDTH - 2120], [[label, ':', value] for label, value in pairs])


with ZipFile(sys.argv[1]) as source:
    files = {item.filename: source.read(item.filename) for item in source.infolist()}
document = etree.fromstring(files['word/document.xml'])
body = document.find('w:body', NS)
question_table = next((t for t in body.findall('w:tbl', NS) if len(t.findall('w:tr', NS)) == 88), None)
if question_table is None:
    raise ValueError('Expected 22 questions, each using four table rows.')

# A drawing behind the text is not reliably painted by browser PDF capture.
# Keep the exact original image, as an inline drawing scaled to the printable width.
for anchor in document.findall('.//wp:anchor', NS):
    inline = etree.Element('{' + NS['wp'] + '}inline', distT='0', distB='0', distL='0', distR='0')
    extent = deepcopy(anchor.find('wp:extent', NS))
    scale = min(1, WIDTH * 635 / int(extent.get('cx')))
    cx, cy = round(int(extent.get('cx')) * scale), round(int(extent.get('cy')) * scale)
    extent.set('cx', str(cx)); extent.set('cy', str(cy)); inline.append(extent)
    for name in ['effectExtent', 'docPr', 'cNvGraphicFramePr']:
        child = anchor.find('wp:' + name, NS)
        if child is not None:
            inline.append(deepcopy(child))
    graphic = deepcopy(anchor.find('a:graphic', NS))
    for ext in graphic.findall('.//a:xfrm/a:ext', NS):
        ext.set('cx', str(cx)); ext.set('cy', str(cy))
    inline.append(graphic)
    anchor.getparent().replace(anchor, inline)

# Convert the two identity blocks into borderless fixed columns. Colons now occupy
# exactly the same x-coordinate in Word and the HTML/PDF preview.
for examiner in [True, False]:
    if any(text(t).startswith('Nama:Faisal') if examiner else text(t).startswith('Nama:{nama}')
           for t in body.findall('w:tbl', NS) if t is not question_table):
        continue
    candidates = []
    for p in body.findall('w:p', NS):
        value = text(p)
        if examiner and value.startswith('Nama: Faisal'):
            candidates = [p]
        elif not examiner and (value.startswith('Nama: {nama}') or (value.startswith('Nama:') and '...' in value)):
            candidates = [p]
        elif candidates and value.startswith(('NIP:', 'Pangkat:', 'Jabatan:', 'Unit Kerja:')):
            candidates.append(p)
        elif candidates:
            break
    if not candidates:
        raise ValueError('Identity block was not found in the supplied BAP.')
    index = body.index(candidates[0])
    for p in candidates:
        body.remove(p)
    body.insert(index, identity_table(examiner))

for p in body.findall('w:p', NS):
    value = text(p)
    if 'Pada hari ini' in value:
        settext(p, '-------------------------Pada hari ini {hari}, tanggal {tanggal_huruf}, bulan {bulan}, tahun {tahun_huruf}, saya:')
    if value.startswith('Jakarta,') or value.startswith('{kota},'):
        settext(p, '{kota}, {tanggal_angka} {bulan} {tahun_angka}')
        property_node(property_node(p, 'pPr'), 'keepNext')
    if value and value not in ['RAHASIA', 'BERITA  ACARA PEMERIKSAAN']:
        spacing = property_node(property_node(p, 'pPr'), 'spacing')
        spacing.set(W + 'after', '120')
    # A real inline letterhead reserves its own height; extra empty paragraphs
    # before the title only create blank space and were anchor positioning aids.
    if not value and p.find('.//w:drawing', NS) is None and body.index(p) < body.index(question_table):
        body.remove(p)

rows = question_table.findall('w:tr', NS)
questions = []
for index in range(22):
    qcell = rows[index * 4].findall('w:tc', NS)[3]
    question = text(qcell).rstrip('-').strip()
    if index == 1:
        question = question.replace('....................', '{nomorSurat}').replace('15 Oktober 2026', '{tanggalSuratTeks}')
        settext(qcell.find('w:p', NS), question + '----------------------')
    questions.append(question)
    acell = rows[index * 4 + 2].findall('w:tc', NS)[3]
    ap = acell.find('w:p', NS)
    settext(ap, '{jawaban_' + str(index + 1) + '}')
    pp = property_node(ap, 'pPr')
    oldtabs = pp.find('w:tabs', NS)
    if oldtabs is not None:
        pp.remove(oldtabs)
    tabs = etree.SubElement(pp, W + 'tabs')
    tabs.append(element('tab', val='right', leader='hyphen', pos=6719))
    leader_run = etree.SubElement(ap, W + 'r')
    leader_text = etree.SubElement(leader_run, W + 't')
    leader_text.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    leader_text.text = ' -- '
    etree.SubElement(etree.SubElement(ap, W + 'r'), W + 'tab')
    for offset, row in enumerate(rows[index * 4:index * 4 + 4]):
        # Keep short question/answer groups together while allowing a genuinely
        # long answer to continue onto another page.
        if offset != 2:
            property_node(property_node(row, 'trPr'), 'cantSplit')
        else:
            for rule in row.findall('w:trPr/w:cantSplit', NS):
                rule.getparent().remove(rule)
        for row_paragraph in row.findall('.//w:p', NS):
            pp = property_node(row_paragraph, 'pPr')
            if offset != 3:
                property_node(pp, 'keepNext')
            else:
                for rule in pp.findall('w:keepNext', NS):
                    pp.remove(rule)
        for height in row.xpath('./w:trPr/w:trHeight', namespaces=NS):
            height.getparent().remove(height)
    # Printed underscore placeholders in the two spacer rows are obsolete once
    # actual answers are filled. Keep the empty rows for paragraph separation.
    for spacer_row in [rows[index * 4 + 1], rows[index * 4 + 3]]:
        for spacer_paragraph in spacer_row.findall('.//w:p', NS):
            if re.fullmatch(r'[_\s]+', text(spacer_paragraph)):
                settext(spacer_paragraph, '')
    # Six points after both a question and its answer make paragraphs legible.
    for paragraph_node in [qcell.find('w:p', NS), ap]:
        spacing = property_node(property_node(paragraph_node, 'pPr'), 'spacing')
        spacing.set(W + 'after', '120')

# Body tables are layout guides, never printed grid lines.
for border in question_table.xpath('.//w:tblBorders/*|.//w:tcBorders/*', namespaces=NS):
    border.attrib.clear(); border.set(W + 'val', 'nil')
for shading in question_table.xpath('.//w:shd', namespaces=NS):
    shading.set(W + 'val', 'clear'); shading.set(W + 'fill', 'FFFFFF')

signature = next(t for t in body.findall('w:tbl', NS) if t is not question_table and 'Yang diperiksa:' in text(t))
clean_signature = borderless_table([1400, 200, 2920, 450, 1400, 200, 3047], [
    ['Yang diperiksa:', '', '', '', 'Pemeriksa:', '', ''],
    ['Nama', ':', '{nama}', '', 'Nama', ':', 'Faisal'],
    ['NIP', ':', '{nip}', '', 'NIP', ':', '19761106 200502 1 001'],
    ['Tanda tangan', ':', '', '', 'Tanda tangan', ':', ''],
    ['', '', '', '', '', '', ''],
    ['', '', '', '', 'Pewawancara:', '', ''],
    ['', '', '', '', 'Nama', ':', '{pewawancaraNama}'],
    ['', '', '', '', 'NIP', ':', '{pewawancaraNip}'],
    ['', '', '', '', 'Tanda tangan', ':', ''],
    ['', '', '', '', '', '', ''],
], signature=True)
# Headings span the complete left/right signature groups without wrapping.
for heading_index in [0, 5]:
    heading_cells = clean_signature.findall('w:tr', NS)[heading_index].findall('w:tc', NS)
    for start, width in [(0, 4520), (4, 4647)]:
        cp = heading_cells[start].find('w:tcPr', NS)
        cp.find('w:tcW', NS).set(W + 'w', str(width))
        cp.append(element('gridSpan', val=3))
        for removed in heading_cells[start + 1:start + 3]:
            removed.getparent().remove(removed)
        for run in heading_cells[start].findall('.//w:r', NS):
            property_node(property_node(run, 'rPr'), 'b')
body.replace(signature, clean_signature)
# Word requires a paragraph after the final table. Replace inherited blank
# paragraphs with one 1-point paragraph so signature space cannot create an
# otherwise empty final page.
section = body.find('w:sectPr', NS)
last_content = body.index(section) - 1 if section is not None else len(body) - 1
while last_content >= 0:
    node = body[last_content]
    if node.tag != W + 'p' or text(node).strip() or node.find('.//w:drawing', NS) is not None:
        break
    body.remove(node)
    last_content -= 1
trailer = paragraph('', after=0)
trailer.find('w:pPr/w:spacing', NS).set(W + 'line', '20')
trailer.find('w:pPr/w:spacing', NS).set(W + 'lineRule', 'exact')
trailer.find('w:r/w:rPr/w:sz', NS).set(W + 'val', '2')
body.insert(body.index(section) if section is not None else len(body), trailer)

# Imported theme/table styles must not tint text blue or change body fonts.
for run in document.findall('.//w:r', NS):
    rp = property_node(run, 'rPr')
    color = property_node(rp, 'color'); color.set(W + 'val', '000000')
    for key in ['themeColor', 'themeTint', 'themeShade']:
        color.attrib.pop(W + key, None)
    fonts = property_node(rp, 'rFonts')
    for key in ['ascii', 'hAnsi', 'cs', 'eastAsia']:
        fonts.set(W + key, 'Arial')
    for key in ['asciiTheme', 'hAnsiTheme', 'cstheme', 'eastAsiaTheme']:
        fonts.attrib.pop(W + key, None)
for color in document.findall('.//w:color', NS):
    color.set(W + 'val', '000000')
    for key in ['themeColor', 'themeTint', 'themeShade']:
        color.attrib.pop(W + key, None)

footer = etree.fromstring(files['word/footer1.xml'])
page_cell = footer.find('.//w:tr/w:tc', NS)
page_paragraph = page_cell.find('w:p', NS)
settext(page_paragraph, '')
for run in list(page_paragraph.findall('w:r', NS)):
    page_paragraph.remove(run)
page_field = etree.SubElement(page_paragraph, W + 'fldSimple', {W + 'instr': ' PAGE '})
page_number_run = paragraph('1').find('w:r', NS)
page_number_run.find('w:rPr/w:sz', NS).set(W + 'val', '16')
page_field.append(page_number_run)
files['word/footer1.xml'] = etree.tostring(footer, xml_declaration=True, encoding='UTF-8', standalone=True)
files['word/document.xml'] = etree.tostring(document, xml_declaration=True, encoding='UTF-8', standalone=True)
target = ROOT / 'public/templates/bap-2026.docx'
target.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(target, 'w', ZIP_DEFLATED) as output:
    for name, content in files.items():
        output.writestr(name, content)
(ROOT / 'src/bap/questions.json').write_text(json.dumps(questions, ensure_ascii=False, indent=2) + '\n')
