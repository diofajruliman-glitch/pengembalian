import fs from 'node:fs';import {zipSync,strToU8} from 'fflate';
export const fixtures=[{name:'stage-baseline',first:[25000,10,10]},{name:'stage-added',first:[25000,10,10],second:[5000,20,30]},{name:'stage-corrected',first:[20000,10,10],second:[5000,20,30]},{name:'stage-missing',first:[20000,10,10],second:[null,null,null]},{name:'stage-zero',first:[0,10,10],second:[5000,20,30]}];
export function stageWorkbook(config){
 const names=['BNBA PENGEMBALIAN MANDIRI','BNBA PENGEMBALIAN BRI','BNBA PENGEMBALIAN BSI','REKAPITULASI'];
 const h=['NIP','Nama sk','Final Total Piutang Tukin',null,'Piutang Uang Makan Total',null,'Pengembalian Tukin Tahap I',null];const y=[null,null,2025,2026,2025,2026,2025,2026];if(config.second){h.push('Pengembalian Tukin Tahap II',null);y.push(2025,2026)}
 const files={'xl/workbook.xml':strToU8('<workbook><sheets>'+names.map((n,i)=>`<sheet name="${n}" r:id="rId${i+1}"/>`).join('')+'</sheets></workbook>'),'xl/_rels/workbook.xml.rels':strToU8('<Relationships>'+names.map((n,i)=>`<Relationship Id="rId${i+1}" Target="worksheets/sheet${i+1}.xml"/>`).join('')+'</Relationships>')};
 const letter=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s};
 const xml=rows=>'<worksheet><sheetData>'+rows.map((row,r)=>`<row r="${r+1}">`+row.map((v,c)=>v==null?'':`<c r="${letter(c)}${r+1}"${typeof v==='string'?' t="inlineStr"':''}>${typeof v==='string'?'<is><t>'+v+'</t></is>':'<v>'+v+'</v>'}</c>`).join('')+'</row>').join('')+'</sheetData></worksheet>';
 names.slice(0,3).forEach((n,i)=>{const p=[String(i+901).padStart(18,'0'),'SDM SIMULASI '+(i+1),i===0?100000:100,i===0?0:100,i===0?0:100,i===0?0:100,config.first[i],0];if(config.second)p.push(config.second[i],0);files[`xl/worksheets/sheet${i+1}.xml`]=strToU8(xml([h,y,p]))});
 files['xl/worksheets/sheet4.xml']=strToU8(xml(['MANDIRI','BRI','BSI'].map((b,i)=>[null,b,null,null,null,null,i===0?100000:400,null,null,null,null,config.first[i]+(config.second?.[i]||0)])));
 return zipSync(files)
}
if(process.argv.includes('--write')){fs.mkdirSync('.local-analysis',{recursive:true});for(const config of fixtures)fs.writeFileSync(`.local-analysis/${config.name}.xlsx`,stageWorkbook(config));console.log('Created five synthetic software-test fixtures')}
