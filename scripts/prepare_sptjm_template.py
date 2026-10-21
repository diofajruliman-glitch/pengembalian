"""Prepare the supplied SPTJM package without changing its declaration or signature.

Usage: python scripts/prepare_sptjm_template.py /path/to/source.docx
An already prepared template can be supplied for repeatable layout repairs.
"""
from pathlib import Path
import sys
from zipfile import ZipFile, ZIP_DEFLATED

from lxml import etree

ROOT = Path(__file__).resolve().parent.parent
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{' + NS['w'] + '}'
IDENTITY = [('Nama', 'nama'), ('NIP', 'nip'), ('NIK', 'nik'),
            ('Jabatan', 'jabatan'), ('Unit Kerja', 'unitKerja'),
            ('Provinsi', 'provinsi'), ('Kabupaten/Kota', 'kabKota'),
            ('Nomor Handphone', 'noHp')]
WIDTHS = [2700, 220, 6719]  # Printable A4 width: 11906 - 1276 - 991 twips.


def text(node):
    return ''.join(node.xpath('.//w:t/text()', namespaces=NS))


def element(tag, **attrs):
    return etree.Element(W + tag, {W + key: str(value) for key, value in attrs.items()})


def settext(p, value):
    nodes = p.xpath('.//w:t', namespaces=NS)
    if not nodes:
        raise ValueError('Missing text in template paragraph')
    nodes[0].text = value
    nodes[0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
    for node in nodes[1:]:
        node.text = ''


def identity_table():
    """Separate labels, colons and values so long values cannot move the colons."""
    table = element('tbl')
    properties = etree.SubElement(table, W + 'tblPr')
    properties.append(element('tblW', w=sum(WIDTHS), type='dxa'))
    properties.append(element('tblInd', w=0, type='dxa'))
    properties.append(element('tblLayout', type='fixed'))
    borders = etree.SubElement(properties, W + 'tblBorders')
    for edge in ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']:
        borders.append(element(edge, val='nil'))
    grid = etree.SubElement(table, W + 'tblGrid')
    for width in WIDTHS:
        grid.append(element('gridCol', w=width))
    for label, key in IDENTITY:
        row = etree.SubElement(table, W + 'tr')
        row_properties = etree.SubElement(row, W + 'trPr')
        row_properties.append(element('cantSplit'))
        for width, value in zip(WIDTHS, [label, ':', '{' + key + '}']):
            cell = etree.SubElement(row, W + 'tc')
            cell_properties = etree.SubElement(cell, W + 'tcPr')
            cell_properties.append(element('tcW', w=width, type='dxa'))
            margins = etree.SubElement(cell_properties, W + 'tcMar')
            for edge in ['top', 'left', 'bottom', 'right']:
                margins.append(element(edge, w=0, type='dxa'))
            cell_properties.append(element('vAlign', val='top'))
            p = etree.SubElement(cell, W + 'p')
            p_properties = etree.SubElement(p, W + 'pPr')
            p_properties.append(element('spacing', before=0, after=0, line=360, lineRule='auto'))
            p_properties.append(element('jc', val='left'))
            run = etree.SubElement(p, W + 'r')
            run_properties = etree.SubElement(run, W + 'rPr')
            run_properties.append(element('rFonts', ascii='Bookman Old Style',
                                          hAnsi='Bookman Old Style',
                                          eastAsia='Bookman Old Style', cs='Bookman Old Style'))
            run_properties.append(element('sz', val=24))
            run_properties.append(element('szCs', val=24))
            run_properties.append(element('color', val='000000'))
            t = etree.SubElement(run, W + 't')
            t.set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
            t.text = value
    return table


def prepare(source_path, target_path=None):
    # Read every ZIP entry before writing, including when input and output match.
    with ZipFile(source_path) as source:
        files = [(item, source.read(item.filename)) for item in source.infolist()]
    root = etree.fromstring(next(content for item, content in files
                                 if item.filename == 'word/document.xml'))
    body = root.find('w:body', NS)
    paragraphs = body.findall('w:p', NS)
    for p in paragraphs:
        value = text(p)
        for label, key in IDENTITY:
            if value.startswith(label + ':'):
                for node in p.xpath('.//w:t', namespaces=NS):
                    if '…' in (node.text or ''):
                        node.text = ': {' + key + '}'
        if value.startswith('Berdasarkan Temuan'):
            settext(p, 'Berdasarkan Temuan Pusat Pelaporan dan Analisis Transaksi Keuangan (PPATK) Tahun 2025 terkait dengan dugaan aktivitas Judi online yang dilakukan oleh ASN PPPK di lingkungan Direktorat Perlindungan Sosial Non Kebencanaan (Dit. PSNK), dengan ini saya menyatakan {pengakuan} melakukan aktifitas Judi online sebagaimana data temuan PPATK Tahun 2025. {periode} {lampiran}')
        if value == 'Tempat tanggal, bulan, tahun':
            settext(p, '{kota}, {tanggal_angka} {bulan} {tahun_angka}')
        if value == '--------------------------------':
            settext(p, '{nama}')
        if value.startswith('NIP. '):
            settext(p, 'NIP. {nip}')

    # The original uses differing counts of implicit tabs. Replace only its
    # identity block with fixed columns in both Word and browser PDF rendering.
    expected = ''.join(label + ':{' + key + '}' for label, key in IDENTITY)
    existing = next((table for table in body.findall('w:tbl', NS)
                     if text(table) == expected), None)
    if existing is not None:
        body.replace(existing, identity_table())
    else:
        candidates = [p for p in paragraphs
                      if any(text(p).startswith(label + ':') for label, _ in IDENTITY)]
        if len(candidates) != len(IDENTITY):
            raise ValueError('Expected eight SPTJM identity paragraphs.')
        if [text(p).split(':', 1)[0] for p in candidates] != [label for label, _ in IDENTITY]:
            raise ValueError('Unexpected SPTJM identity order.')
        index = body.index(candidates[0])
        for p in candidates:
            body.remove(p)
        body.insert(index, identity_table())
    intro = next((p for p in body.findall('w:p', NS)
                  if text(p).startswith('Yang bertanda tangan')), None)
    if intro is None:
        raise ValueError('SPTJM identity introduction was not found.')
    # Preserve the original 12-point gap above Nama outside the table cells.
    properties = intro.find('w:pPr', NS)
    if properties is None:
        properties = element('pPr')
        intro.insert(0, properties)
    spacing = properties.find('w:spacing', NS)
    if spacing is None:
        spacing = etree.SubElement(properties, W + 'spacing')
    spacing.set(W + 'after', '240')

    xml = etree.tostring(root, xml_declaration=True, encoding='UTF-8', standalone=True)
    target = Path(target_path) if target_path else ROOT / 'public/templates/sptjm-2026.docx'
    with ZipFile(target, 'w', ZIP_DEFLATED) as output:
        for item, content in files:
            output.writestr(item, xml if item.filename == 'word/document.xml' else content)


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: prepare_sptjm_template.py source.docx')
    prepare(sys.argv[1])
