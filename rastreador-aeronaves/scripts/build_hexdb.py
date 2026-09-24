#!/usr/bin/env python3
"""Atualiza as bases estáticas de matrícula e aeródromos, sem dependências externas."""
import csv
import argparse
import gzip
import io
import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parents[1]
AIRCRAFT_URL = 'https://raw.githubusercontent.com/wiedehopf/tar1090-db/csv/aircraft.csv.gz'
AIRPORT_URL = 'https://davidmegginson.github.io/ourairports-data/airports.csv'


def write(name, value):
    path = OUT / name
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print(f'{path}: {path.stat().st_size} bytes')


def fetch(url, local_file=None):
    if local_file:
        return Path(local_file).read_bytes()
    request = urllib.request.Request(url, headers={'User-Agent': 'datafixers-rastreador/1.0'})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--aircraft-file', help='cópia local de aircraft.csv.gz')
    parser.add_argument('--airports-file', help='cópia local de airports.csv')
    args = parser.parse_args()
    generated = datetime.now(timezone.utc).isoformat()
    raw = gzip.decompress(fetch(AIRCRAFT_URL, args.aircraft_file)).decode('utf-8-sig', 'replace')
    brazil, world = {}, {}
    for row in csv.reader(io.StringIO(raw), delimiter=';'):
        if len(row) < 2 or not row[0] or not row[1]:
            continue
        hexcode, reg = row[0].strip().lower(), row[1].strip().upper()
        if len(hexcode) != 6 or not all(c in '0123456789abcdef' for c in hexcode):
            continue
        if reg.startswith(('PP-', 'PR-', 'PS-', 'PT-', 'PU-')):
            brazil[reg] = hexcode
        else:
            world[reg] = hexcode
    body = {'generated_utc': generated, 'source': AIRCRAFT_URL, 'registrations': {**brazil, **world}}
    size = len(gzip.compress(json.dumps(body, separators=(',', ':')).encode()))
    if size >= 5_000_000:
        selected = {r: h for r, h in world.items() if r.startswith(('N', 'LV-', 'XA-', 'XB-', 'XC-', 'CC-', 'CP-', 'CX-', 'YV-', 'HK-', 'HP-', 'OB-', 'ZP-'))}
        body['registrations'] = {**brazil, **selected}
        body['scope'] = 'Brasil, EUA e prefixos regionais; hex direto aceita demais países'
    else:
        body['scope'] = 'Mundo'
    write('hexdb.json', body)

    airports = []
    for row in csv.DictReader(io.StringIO(fetch(AIRPORT_URL, args.airports_file).decode('utf-8-sig', 'replace'))):
        if row['type'] in ('closed', 'heliport', 'seaplane_base', 'balloonport'):
            continue
        if row['type'] == 'small_airport' and row['iso_country'] != 'BR' and not row['iata_code']:
            continue
        try:
            lat, lon = float(row['latitude_deg']), float(row['longitude_deg'])
        except (ValueError, TypeError):
            continue
        airports.append([row['ident'], row['iata_code'], row['name'], row['municipality'], row['iso_country'], lat, lon, row['type']])
    write('airports.json', {'generated_utc': generated, 'source': AIRPORT_URL, 'airports': airports})


if __name__ == '__main__':
    main()
