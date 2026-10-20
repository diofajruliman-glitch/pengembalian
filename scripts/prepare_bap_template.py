"""Prepare the supplied BAP without rebuilding its Word layout.

Usage: python scripts/prepare_bap_template.py /path/to/original-bap.docx
Requires lxml. The original attachment is deliberately not committed separately.
"""
import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree

ROOT = Path(__file__).resolve().parent.parent
NS = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
W = '{' + NS['w'] + '}'


def settext(paragraph, text):
    nodes = paragraph.xpath('.//w:t', namespaces=NS)
    if nodes:
        nodes[0].text = text
        nodes[0].set('{http://www.w3.org/XML/1998/namespace}space', 'preserve')
        for node in nodes[1:]:
            node.text = ''
    else:
        etree.SubElement(etree.SubElement(paragraph, W + 'r'), W + 't').text = text


with ZipFile(sys.argv[1]) as source:
    document = etree.fromstring(source.read('word/document.xml'))
    body = document.find('w:body', NS)
    for paragraph in body.findall('w:p', NS):
        text = ''.join(paragraph.xpath('.//w:t/text()', namespaces=NS))
        if 'Pada hari ini' in text:
            settext(paragraph, '-------------------------Pada hari ini {hari}, tanggal {tanggal_huruf}, bulan {bulan}, tahun {tahun_huruf}, saya:')
        for label, key in [('Nama', 'nama'), ('NIP', 'nip'), ('Pangkat', 'pangkat'), ('Jabatan', 'jabatan')]:
            if text.startswith(label + ':') and '...' in text:
                # Keep the label, tab stops, runs, and original colon alignment.
                for node in paragraph.xpath('.//w:t', namespaces=NS):
                    node.text = re.sub(r'\.{3,}', '{' + key + '}', node.text or '')
        if text.startswith('Unit Kerja:'):
            for node in paragraph.xpath('.//w:t', namespaces=NS):
                if node.text == 'Direktorat Perlindungan Sosial Non Kebencanaan':
                    node.text = '{unitKerja}'
        if text.startswith('Jakarta,'):
            settext(paragraph, '{kota}, {tanggal_angka} {bulan} {tahun_angka}')
    tables = body.findall('w:tbl', NS)
    rows = tables[0].findall('w:tr', NS)
    if len(rows) != 88:
        raise ValueError('Expected 22 questions, each using four table rows.')
    questions = []
    for index in range(22):
        question_cell = rows[index * 4].findall('w:tc', NS)[3]
        question = ''.join(question_cell.xpath('.//w:t/text()', namespaces=NS)).rstrip('-').strip()
        if index == 1:
            question = question.replace('....................', '{nomorSurat}').replace('15 Oktober 2026', '{tanggalSuratTeks}')
            settext(question_cell.find('w:p', NS), question + '----------------------')
        questions.append(question)
        answer_cell = rows[index * 4 + 2].findall('w:tc', NS)[3]
        settext(answer_cell.find('w:p', NS), '{jawaban_' + str(index + 1) + '}')
        for row in rows[index * 4:index * 4 + 4]:
            for height in row.xpath('./w:trPr/w:trHeight', namespaces=NS):
                height.getparent().remove(height)
    for index, key in [(1, 'nama'), (2, 'nip')]:
        settext(tables[1].findall('w:tr', NS)[index].findall('w:tc', NS)[2].find('w:p', NS), '{' + key + '}')
    target = ROOT / 'public/templates/bap-2026.docx'
    target.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(target, 'w', ZIP_DEFLATED) as output:
        for item in source.infolist():
            content = etree.tostring(document, xml_declaration=True, encoding='UTF-8', standalone=True) if item.filename == 'word/document.xml' else source.read(item.filename)
            output.writestr(item, content)
    (ROOT / 'src/bap/questions.json').write_text(json.dumps(questions, ensure_ascii=False, indent=2) + '\n')
