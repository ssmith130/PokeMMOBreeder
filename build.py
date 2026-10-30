"""Build the PokeMMO Breeding Planner.

Outputs:
  dist/index.html       the website: one self-contained HTML file
  dist/*.png, dist/favicon.ico, dist/manifest.webmanifest, dist/fonts/
                        icons, link-preview image, install info and the page's fonts, copied from public/
  dist/box-icons.png    the Pokémon icon sheet (the Artifact has it built in instead)
  dist/.nojekyll        tells GitHub Pages to serve dist/ as-is
  build/artifact.html   the same page as a fragment, for publishing as a claude.ai Artifact

  dist/404.html, dist/robots.txt, dist/sitemap.xml
                        the not-found page and search engine files (sitemap.xml only once the address is known)

Upload everything in dist/ to any static host. Only needs Python 3's standard library:

  python3 build.py

The site's address (such as https://www.example.com/) goes in site-url.txt, or in the SITE_URL
environment variable, which wins. Link previews (Discord, social sites) need the image's full address
and the sitemap needs the page's, so without it previews show text only and there is no sitemap.
The GitHub Pages workflow sets SITE_URL itself.

Visitor counts are off unless goatcounter.txt (or the GOATCOUNTER environment variable) holds a
GoatCounter site code, such as smearguru for https://smearguru.goatcounter.com.
"""
import base64
import datetime
import html
import os
import shutil
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src'))
import items  # noqa: E402  the brace and Everstone icons

here = os.path.dirname(os.path.abspath(__file__))


def read(path, mode='r'):
    # UTF-8 spelled out: Windows would otherwise read the page in its own code page and stop at the first ♀ or ←
    with open(os.path.join(here, path), mode, encoding=None if 'b' in mode else 'utf-8') as f:
        return f.read()


def write(path, text):
    full = os.path.join(here, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, 'w', encoding='utf-8') as f:
        f.write(text)


today = datetime.date.today()
page = read('src/page.html').replace('/*BUILT*/', f"{today.day} {today.strftime('%b %Y')}")
def png(path):
    return 'data:image/png;base64,' + base64.b64encode(read(path, 'rb')).decode()


sheet = png('data/box-icons.png')
page = (page.replace('/*PLANNER*/', read('src/planner.js'))
            .replace('/*SPECIES*/[]', read('data/species.json'))
            .replace('/*TMS*/{}', read('data/tms.json'))
            .replace('/*LEARNERS*/{}', read('data/learners.json'))
            .replace('/*SHEET*/', sheet)
            .replace('<!--ITEM-ICONS-->', items.symbols())
            .replace('/*LOGO*/', png('data/logo.png')))

# The Artifact host wraps the page in its own <html>/<head>, so it gets the fragment as-is.
write('build/artifact.html', page)

# The website needs a full document: everything up to the end of the <style> block is head content.
# The icon sheet becomes its own file there, so browsers can cache it.
site_page = page.replace(sheet, 'box-icons.png')
split = site_page.index('</style>') + len('</style>')
head, body = site_page[:split], site_page[split:]
head = head.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')  # only means something on claude.ai
# The website serves its own copy of the fonts (public/fonts) instead of loading them from Google.
google_fonts = head[head.index('<link rel="preconnect" href="https://fonts.googleapis.com">'):head.index('<style>')]
FONTS = [('Chakra Petch', '500', 'chakra-petch-500'), ('Chakra Petch', '600', 'chakra-petch-600'),
         ('Chakra Petch', '700', 'chakra-petch-700'), ('IBM Plex Sans', '400 600', 'ibm-plex-sans'),
         ('IBM Plex Mono', '400', 'ibm-plex-mono-400'), ('IBM Plex Mono', '500', 'ibm-plex-mono-500')]
own_fonts = ('<link rel="preload" href="fonts/ibm-plex-sans.woff2" as="font" type="font/woff2" crossorigin>\n'
             '<link rel="preload" href="fonts/chakra-petch-600.woff2" as="font" type="font/woff2" crossorigin>\n<style>\n'
             + ''.join(f"@font-face {{ font-family: '{family}'; font-style: normal; font-weight: {weight}; font-display: swap; "
                       f"src: url(fonts/{file}.woff2) format('woff2'); }}\n" for family, weight, file in FONTS)
             + '</style>\n')
head = head.replace(google_fonts, own_fonts)
DESCRIPTION = ('Plan PokeMMO breeding: enter the Pokémon you have and the one you want, '
               'and get the fewest-breed tree with braces, Everstones, gender picks and a rough cost.')
FAVICON = png('data/logo-square.png')  # Smearguru, made by src/build-logo.py; the 404 page keeps it built in


def site_address():
    """Where the site lives: SITE_URL if set, else the first line of site-url.txt that isn't a # comment."""
    url = os.environ.get('SITE_URL', '').strip()
    if not url and os.path.exists(os.path.join(here, 'site-url.txt')):
        url = next((line.strip() for line in read('site-url.txt').splitlines()
                    if line.strip() and not line.strip().startswith('#')), '')
    if url and '://' not in url:
        url = 'https://' + url
    if url and not url.endswith('/'):
        url += '/'
    return url


site_url = site_address()
share = ''
if site_url:
    u = html.escape(site_url, quote=True)
    share = (f'<link rel="canonical" href="{u}">\n<meta property="og:url" content="{u}">\n'
             f'<meta property="og:image" content="{u}og-image.png">\n'
             '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
             '<meta name="twitter:card" content="summary_large_image">\n')


def goatcounter_code():
    """The GoatCounter site code: GOATCOUNTER if set, else the first line of goatcounter.txt that isn't a # comment."""
    code = os.environ.get('GOATCOUNTER', '').strip()
    if not code and os.path.exists(os.path.join(here, 'goatcounter.txt')):
        code = next((line.strip() for line in read('goatcounter.txt').splitlines()
                     if line.strip() and not line.strip().startswith('#')), '')
    return code if code.replace('-', '').isalnum() else ''


gc = goatcounter_code()
analytics = (f'<script data-goatcounter="https://{gc}.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>\n'
             if gc else '')
site = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="{DESCRIPTION}">
<meta property="og:title" content="PokeMMO Breeding Planner (Alpha)">
<meta property="og:description" content="{DESCRIPTION}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#eef1f4" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#10151b" media="(prefers-color-scheme: dark)">
<link rel="icon" href="favicon.ico" sizes="32x32 64x64">
<link rel="icon" type="image/png" href="favicon-96.png" sizes="96x96">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="manifest.webmanifest">
{share}{analytics}{head}
</head>
<body>
{body}
</body>
</html>
"""
write('dist/index.html', site)
write('dist/.nojekyll', '')
shutil.copytree(os.path.join(here, 'public'), os.path.join(here, 'dist'), dirs_exist_ok=True)
shutil.copyfile(os.path.join(here, 'data', 'box-icons.png'), os.path.join(here, 'dist', 'box-icons.png'))

# Hosts show 404.html for addresses that don't exist (GitHub Pages, Netlify and Cloudflare all look for it).
home = html.escape(site_url or '/', quote=True)
write('dist/404.html', f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Page not found · PokeMMO Breeding Planner</title>
<link rel="icon" type="image/png" href="{FAVICON}">
<script>try {{ const t = localStorage.getItem('pokemmo-breeding-theme'); if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; }} catch (e) {{}}</script>
<style>
:root {{ --bg: #eef1f4; --ink: #18202b; --muted: #5b6676; --accent: #1d7656; color-scheme: light; }}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{ --bg: #10151b; --ink: #e6ebf1; --muted: #93a0b0; --accent: #4cc195; color-scheme: dark; }} }}
:root[data-theme="dark"] {{ --bg: #10151b; --ink: #e6ebf1; --muted: #93a0b0; --accent: #4cc195; color-scheme: dark; }}
body {{ margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; box-sizing: border-box;
  background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, sans-serif; text-align: center; }}
img {{ width: 84px; height: 69px; image-rendering: pixelated; }}
h1 {{ font-size: 26px; margin: 12px 0 6px; }}
p {{ color: var(--muted); margin: 0; }}
a {{ color: var(--accent); font-weight: 600; }}
</style>
</head>
<body>
<main>
<img src="{png('data/logo.png')}" alt="" width="84" height="69">
<h1>Page not found</h1>
<p>There's nothing at this address. <a href="{home}">Open the breeding planner</a></p>
</main>
</body>
</html>
""")

# Search engines: robots.txt lets them in, and sitemap.xml (which needs the full address) points them at the page.
robots = 'User-agent: *\nAllow: /\n'
if site_url:
    robots += f'\nSitemap: {site_url}sitemap.xml\n'
    write('dist/sitemap.xml', '<?xml version="1.0" encoding="UTF-8"?>\n'
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
          f'  <url><loc>{html.escape(site_url)}</loc><lastmod>{today.isoformat()}</lastmod></url>\n</urlset>\n')
elif os.path.exists(os.path.join(here, 'dist', 'sitemap.xml')):
    os.remove(os.path.join(here, 'dist', 'sitemap.xml'))  # left over from a build that had an address
write('dist/robots.txt', robots)
print(f'dist/index.html {len(site):,} bytes, build/artifact.html {len(page):,} bytes'
      + (f', site address {site_url}' if site_url else ', no site address yet (site-url.txt) so link previews are text only')
      + (f', visitor counts on {gc}.goatcounter.com' if gc else ''))
