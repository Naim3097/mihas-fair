#!/usr/bin/env python3
"""MIHAS exhibitor list (the Lean X spreadsheet) -> public/data/exhibitors.json, the directory exhibitors search when
they register. Standard library only (an .xlsx is a zip of XML).

    python3 tools/import-exhibitors.py MIHAS_2026_Exhibitors_Hall_6-7-8.xlsx

Reads the master sheet (the first one), expands booth lists and ranges ("7D10, 7D11", "6H13; 7B13", "8D06–8D09"),
takes the other-hall booths too, and marks which booth numbers exist on the game's floor plan."""
import json, re, sys, zipfile, xml.etree.ElementTree as ET
from pathlib import Path

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
ROOT = Path(__file__).resolve().parent.parent

def col_index(ref):
    n = 0
    for ch in re.match(r'[A-Z]+', ref).group(): n = n * 26 + ord(ch) - 64
    return n - 1

def first_sheet(path):
    z = zipfile.ZipFile(path)
    shared = [''.join(t.text or '' for t in si.iter('{%s}t' % NS['m'])) for si in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('m:si', NS)] if 'xl/sharedStrings.xml' in z.namelist() else []
    wb, rels = ET.fromstring(z.read('xl/workbook.xml')), ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))
    target = {r.get('Id'): r.get('Target') for r in rels}
    sheet = wb.find('m:sheets', NS)[0]
    xml = ET.fromstring(z.read('xl/' + target[sheet.get('{%s}id' % NS['r'])].replace('/xl/', '').lstrip('/')))
    rows = []
    for row in xml.iter('{%s}row' % NS['m']):
        cells = {}
        for c in row.findall('m:c', NS):
            v, t = c.find('m:v', NS), c.get('t')
            cells[col_index(c.get('r'))] = shared[int(v.text)] if t == 's' and v is not None else ''.join(x.text or '' for x in c.iter('{%s}t' % NS['m'])) if t == 'inlineStr' else (v.text if v is not None else '')
        if cells: rows.append([cells.get(i, '') or '' for i in range(max(cells) + 1)])
    return rows

def booths(text):
    """'8D06–8D09, 8D28' -> ['8D06', '8D07', '8D08', '8D09', '8D28']; drops 'Hall 2:' labels."""
    out = []
    for part in re.split(r'[,;]', re.sub(r'Hall\s*\d+\s*:', ',', text or '')):
        part = part.strip().upper()
        if not part: continue
        m = re.fullmatch(r'(\d+[A-Z])(\d+)\s*[–—-]\s*(?:\1)?(\d+)', part)
        if m:
            width = len(m.group(2))
            out += [f'{m.group(1)}{n:0{width}d}' for n in range(int(m.group(2)), int(m.group(3)) + 1)]
        elif re.fullmatch(r'\d+[A-Z]\d+[A-Z]?', part): out.append(part)
    return list(dict.fromkeys(out))

def main(path):
    rows = first_sheet(path)
    head = next(i for i, r in enumerate(rows) if r and r[0].strip() == 'No.')
    cols = {name.strip(): i for i, name in enumerate(rows[head])}
    plan = {b['id'] for b in json.loads((ROOT / 'public/data/floor.json').read_text())['booths']}
    out = []
    for r in rows[head + 1:]:
        get = lambda k: (r[cols[k]] if k in cols and cols[k] < len(r) else '').strip()
        company = get('Company')
        if not company: continue
        all_booths = booths(get('Booth No. (Halls 6–8)')) + booths(get('Also in other halls'))
        out.append({'company': company, 'halls': get('Hall(s)'), 'booths': all_booths, 'onPlan': [b for b in all_booths if b in plan], 'website': get('Website')})
    dest = ROOT / 'public/data/exhibitors.json'
    dest.write_text(json.dumps({'source': Path(path).name, 'exhibitors': out}, ensure_ascii=False, separators=(',', ':')) + '\n')
    missing = [e['company'] for e in out if not e['onPlan']]
    print(f'exhibitors.json: {len(out)} companies, {sum(len(e["booths"]) for e in out)} booth numbers, {len(missing)} with no booth on the floor plan{": " + ", ".join(missing) if missing else ""}')

main(sys.argv[1] if len(sys.argv) > 1 else 'MIHAS_2026_Exhibitors_Hall_6-7-8.xlsx')
