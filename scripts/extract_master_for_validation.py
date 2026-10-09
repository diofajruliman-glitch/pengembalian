"""Read-only extraction to ignored local storage. Never uploads the workbook."""
import sys, json, zipfile, xml.etree.ElementTree as ET
from pathlib import Path

source = Path(sys.argv[1])
output = Path(sys.argv[2])
ns = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'
with zipfile.ZipFile(source) as archive:
    strings = [''.join(e.itertext()) for e in ET.fromstring(archive.read('xl/sharedStrings.xml'))]
    workbook = ET.fromstring(archive.read('xl/workbook.xml'))
    relns = '{http://schemas.openxmlformats.org/package/2006/relationships}'
    rels = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))}
    names = {'BNBA PENGEMBALIAN MANDIRI','BNBA PENGEMBALIAN BRI','BNBA PENGEMBALIAN BSI','REKAPITULASI'}
    result = {}
    for sheet in workbook.find(ns+'sheets'):
        name = sheet.attrib['name']
        if name not in names:
            continue
        rid = sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']
        target = rels[rid].lstrip('/')
        if not target.startswith('xl/'):
            target = 'xl/'+target
        rows = []
        with archive.open(target) as stream:
            for _, row in ET.iterparse(stream, events=('end',)):
                if row.tag != ns+'row':
                    continue
                number = int(row.attrib['r'])
                values = []
                for cell in row:
                    ref = cell.attrib.get('r','')
                    col = 0
                    for ch in ref:
                        if ch.isalpha(): col = col*26+ord(ch.upper())-64
                    if col < 1 or col > 100: continue
                    v = cell.find(ns+'v')
                    if v is None: continue
                    value = v.text
                    kind = cell.attrib.get('t')
                    if kind == 's': value = strings[int(value)]
                    elif kind not in ('e','str'):
                        try:
                            amount = float(value)
                            value = int(amount) if amount.is_integer() else amount
                        except (ValueError,TypeError): pass
                    while len(values)<col: values.append(None)
                    values[col-1]=value
                # Preserve leading header rows, omit the enormous formatted empty tail.
                if values:
                    while len(rows)<number: rows.append([])
                    rows[number-1]=values
                row.clear()
        result[name]=rows
output.parent.mkdir(parents=True, exist_ok=True)
output.write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
print(json.dumps({'sheets':list(result),'local_only':True,'output':str(output)}))
