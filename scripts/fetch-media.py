"""Download generated source media listed in media-src/manifest.json into media-src/.
Usage: python scripts/fetch-media.py"""
import json, pathlib, urllib.request, concurrent.futures as cf

root = pathlib.Path(__file__).resolve().parent.parent / 'media-src'
manifest = json.loads((root / 'manifest.json').read_text())

def get(item):
    name, url = item
    dest = root / name
    if dest.exists() and dest.stat().st_size > 0:
        return f'skip {name}'
    urllib.request.urlretrieve(url, dest)
    return f'ok   {name} ({dest.stat().st_size // 1024} KB)'

with cf.ThreadPoolExecutor(8) as ex:
    for line in ex.map(get, manifest.items()):
        print(line)
