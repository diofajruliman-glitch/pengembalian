"""Fillable SPTJM package from the supplied original. Usage: script source.docx."""
import sys
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from lxml import etree
ROOT=Path(__file__).resolve().parent.parent
NS={'w':'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
def settext(p,text):
 nodes=p.xpath('.//w:t',namespaces=NS)
 if not nodes: raise ValueError('Missing text in template paragraph')
 nodes[0].text=text
 nodes[0].set('{http://www.w3.org/XML/1998/namespace}space','preserve')
 for t in nodes[1:]:t.text=''
with ZipFile(sys.argv[1]) as source:
 root=etree.fromstring(source.read('word/document.xml'))
 ps=root.find('w:body',NS).findall('w:p',NS)
 for p in ps:
  text=''.join(p.xpath('.//w:t/text()',namespaces=NS))
  for label,key in [('Nama','nama'),('NIP','nip'),('NIK','nik'),('Jabatan','jabatan'),('Unit Kerja','unitKerja'),('Provinsi','provinsi'),('Kabupaten/Kota','kabKota'),('Nomor Handphone','noHp')]:
   if text.startswith(label+':'):
    for node in p.xpath('.//w:t',namespaces=NS):
     if '…' in (node.text or ''):node.text=': {'+key+'}'
  if text.startswith('Berdasarkan Temuan'):
   settext(p,'Berdasarkan Temuan Pusat Pelaporan dan Analisis Transaksi Keuangan (PPATK) Tahun 2026 terkait dengan dugaan aktivitas Judi online yang dilakukan oleh ASN PPPK di lingkungan Direktorat Perlindungan Sosial Non Kebencanaan (Dit. PSNK), dengan ini saya menyatakan {pengakuan} melakukan aktifitas Judi online sebagaimana data temuan PPATK Tahun 2026. {periode} {lampiran}')
  if text=='Tempat tanggal, bulan, tahun':settext(p,'{kota}, {tanggal_angka} {bulan} {tahun_angka}')
  if text=='--------------------------------':settext(p,'{nama}')
  if text.startswith('NIP. '):settext(p,'NIP. {nip}')
 with ZipFile(ROOT/'public/templates/sptjm-2026.docx','w',ZIP_DEFLATED) as output:
  for item in source.infolist():output.writestr(item,etree.tostring(root,xml_declaration=True,encoding='UTF-8',standalone=True) if item.filename=='word/document.xml' else source.read(item.filename))
