"""Build the PokeMMO Breeding Planner.

Outputs:
  dist/index.html       the website: one self-contained HTML file
  dist/*.png, dist/manifest.webmanifest
                        app icons, link-preview image and install info, copied from public/
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
    with open(os.path.join(here, path), mode) as f:
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
            .replace('/*SHEET*/', sheet)
            .replace('<!--ITEM-ICONS-->', items.symbols())
            .replace('/*LOGO*/', png('data/logo.png')))

# The Artifact host wraps the page in its own <html>/<head>, so it gets the fragment as-is.
write('build/artifact.html', page)

# The website needs a full document: everything up to the end of the <style> block is head content.
split = page.index('</style>') + len('</style>')
head, body = page[:split], page[split:]
head = head.replace('<meta name="claude:viewport-fit-sides" content="cover">\n', '')  # only means something on claude.ai
DESCRIPTION = ('Plan PokeMMO breeding: enter the Pokémon you have and the one you want, '
               'and get the fewest-breed tree with braces, Everstones, gender picks and a rough cost.')
FAVICON = png('data/logo-square.png')  # Smearguru, made by src/build-logo.py


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
site = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="{DESCRIPTION}">
<meta property="og:title" content="PokeMMO Breeding Planner">
<meta property="og:description" content="{DESCRIPTION}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#eef1f4" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#10151b" media="(prefers-color-scheme: dark)">
<link rel="icon" type="image/png" href="{FAVICON}">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<link rel="manifest" href="manifest.webmanifest">
{share}{head}
</head>
<body>
{body}
</body>
</html>
"""
write('dist/index.html', site)
write('dist/.nojekyll', '')
for name in sorted(os.listdir(os.path.join(here, 'public'))):
    shutil.copyfile(os.path.join(here, 'public', name), os.path.join(here, 'dist', name))

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
      + (f', site address {site_url}' if site_url else ', no site address yet (site-url.txt) so link previews are text only'))
