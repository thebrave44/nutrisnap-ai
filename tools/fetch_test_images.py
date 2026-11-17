import json, urllib.request, os

queries = {
    'pizza': 'pizza margherita',
    'burger': 'hamburger',
    'sushi': 'sushi rolls',
    'pancakes': 'pancakes with syrup',
    'salad': 'caesar salad',
    'icecream': 'ice cream sundae',
    'friedrice': 'fried rice',
    'steak': 'grilled steak',
}
outdir = os.path.join(os.path.dirname(__file__), 'testimg')
os.makedirs(outdir, exist_ok=True)

for name, q in queries.items():
    url = ('https://commons.wikimedia.org/w/api.php?action=query&generator=search'
           '&gsrsearch=' + urllib.parse.quote(q + ' filetype:bitmap') +
           '&gsrnamespace=6&gsrlimit=5&prop=imageinfo&iiprop=url|size&iiurlwidth=512&format=json')
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'nutrisnap-test/1.0 (course project)'})
        data = json.load(urllib.request.urlopen(req, timeout=30))
        pages = data.get('query', {}).get('pages', {})
        got = False
        for p in pages.values():
            ii = p.get('imageinfo', [{}])[0]
            if ii.get('width', 0) >= 400 and ii.get('thumburl'):
                img_url = ii['thumburl']
                dest = os.path.join(outdir, name + '.jpg')
                req2 = urllib.request.Request(img_url, headers={'User-Agent': 'nutrisnap-test/1.0'})
                with urllib.request.urlopen(req2, timeout=60) as r, open(dest, 'wb') as f:
                    f.write(r.read())
                print(name, '<-', img_url, os.path.getsize(dest), 'bytes')
                got = True
                break
        if not got:
            print(name, 'NO IMAGE')
    except Exception as e:
        print(name, 'ERROR', e)
