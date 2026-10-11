"""Read cached XLSX values without recalculating or loading external workbooks."""
import argparse
import hashlib
import json
import pathlib
import posixpath
import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
REL = '{http://schemas.openxmlformats.org/officeDocument/2006/relationships}'


def extract(source, destination):
    destination.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256()
    with source.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    with zipfile.ZipFile(source) as archive:
        strings = []
        if 'xl/sharedStrings.xml' in archive.namelist():
            for _, item in ET.iterparse(archive.open('xl/sharedStrings.xml'), events=('end',)):
                if item.tag == NS + 'si':
                    strings.append(''.join(t.text or '' for t in item.iter(NS + 't')))
                    item.clear()
        links = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
        sheets = ET.fromstring(archive.read('xl/workbook.xml')).find(NS + 'sheets')
        paths = {}
        for sheet in sheets:
            target = links[sheet.attrib[REL + 'id']]
            paths[sheet.attrib['name']] = target.lstrip('/') if target.startswith('/') else posixpath.normpath('xl/' + target)
        if '3 bulan' not in paths:
            raise ValueError('Sheet 3 bulan tidak ditemukan')

        def rows(path):
            for _, row in ET.iterparse(archive.open(path), events=('end',)):
                if row.tag != NS + 'row':
                    continue
                values = []
                for cell in row:
                    column = 0
                    for char in cell.attrib.get('r', ''):
                        if char.isalpha():
                            column = column * 26 + ord(char.upper()) - 64
                    if not column:
                        continue
                    while len(values) < column:
                        values.append(None)
                    value_node = cell.find(NS + 'v')
                    value = value_node.text if value_node is not None else None
                    kind = cell.attrib.get('t')
                    if kind == 's' and value is not None:
                        value = strings[int(value)]
                    elif kind == 'inlineStr':
                        value = ''.join(t.text or '' for t in cell.iter(NS + 't'))
                    elif value is not None and kind not in ('e', 'str'):
                        value = float(value)
                        if value.is_integer():
                            value = int(value)
                    # Only #N/A means missing, as defined by the workbook owner.
                    values[column - 1] = None if value == '#N/A' else value
                yield int(row.attrib['r']), values
                row.clear()

        count = 0
        headers = None
        with (destination / 'raw.ndjson').open('w', encoding='utf-8') as output:
            for number, values in rows(paths['3 bulan']):
                if number == 1:
                    headers = values
                elif len(values) > 1 and values[1] is not None:
                    output.write(json.dumps({'sourceRow': number, 'values': values}, ensure_ascii=False, separators=(',', ':')) + '\n')
                    count += 1
        recap = [{'row': number, 'values': values} for number, values in rows(paths['rekap 3 bulan']) if any(v is not None for v in values)] if 'rekap 3 bulan' in paths else []
        manifest = {'schemaVersion': 1, 'fileName': source.name, 'sha256': digest.hexdigest(), 'fileBytes': source.stat().st_size, 'preparedAt': datetime.now(timezone.utc).isoformat(), 'sheet': '3 bulan', 'headers': headers, 'expectedRows': count, 'recap': recap, 'valuePolicy': '#N/A = kosong; nilai rumus memakai cache workbook, tidak dihitung ulang'}
        (destination / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({'rows': count, 'destination': str(destination), 'localOnly': True}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=pathlib.Path)
    parser.add_argument('--output', type=pathlib.Path, default=pathlib.Path('.local-analysis/adjustments'))
    args = parser.parse_args()
    extract(args.source, args.output)
