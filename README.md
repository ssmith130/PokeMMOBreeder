# PokeMMO Breeding Planner

Enter the Pokémon you have and the one you want; get the breeding tree with the fewest breeds,
which brace or Everstone each parent holds, the gender picks, and the total cost.

The site is one static HTML file (`dist/index.html`, about 460 KB) plus its app icons, link-preview
image and `manifest.webmanifest`, all in `dist/`. It needs no server code, database or API keys, so
any static host can serve it. On phones it can be added to the home screen and opens like an app.

Saved builds live in the browser's localStorage on a self-hosted copy, and in the viewer's own
Claude account when the page runs as a claude.ai artifact. Build codes (Saved builds > "Move builds
to another device or site") carry builds between the two.

## Run it locally

On Windows, double-click `start-localhost.bat`. It serves the site at http://localhost:8000 and
opens your browser; close its window to stop it. It only uses PowerShell, which comes with Windows.

You can also open `dist/index.html` directly, or serve it with Python:

```sh
python3 build.py
python3 -m http.server 8000 -d dist
# then open http://localhost:8000
```

## Host it

Run `python3 build.py`, then put everything in `dist/` on any static host. Two good free ones:

**Netlify (no GitHub needed).** Sign up at netlify.com, open https://app.netlify.com/drop and drag the
`dist` folder onto it. The site goes live at an address ending in `.netlify.app`; pick a nicer name in
the project settings before setting up your domain, since the domain will point at that name. If
Netlify says the project is private, make it public. To update the site later, rebuild and drag the new
`dist` folder onto the project's **Production deploys** area. (Connecting a GitHub repo also works:
`netlify.toml` has the build settings, and every push redeploys.)

**GitHub Pages.** Push this folder to a GitHub repository, then in the repo go to Settings > Pages and
set Source to "GitHub Actions". Every push to `main` runs `.github/workflows/pages.yml`, which builds the
site and publishes it at `https://<your-username>.github.io/<repo-name>/`.

## Use your own domain (Squarespace)

1. **Add the domain on the host first.**
   - Netlify: the project's **Domain management** > **Add a domain** > "Add a domain you already own",
     and enter `yourdomain.com`. Netlify adds `www.yourdomain.com` too. Netlify suggests making the
     `www` one the primary domain when your DNS is elsewhere; the other then redirects to it. If it
     offers to move your DNS to Netlify, skip that, since the records go in Squarespace below.
   - GitHub Pages: Settings > Pages > Custom domain, enter `www.yourdomain.com` and Save.
2. **Point the domain at the host in Squarespace.** Go to account.squarespace.com/domains, click the
   domain, then **DNS**. Delete the **Squarespace Defaults** records with their trash can (they point the
   domain at a Squarespace site), but keep any MX or TXT records you use for email. Then add these
   under custom records, with Host `@` meaning the bare domain:

   | Type | Host | Netlify | GitHub Pages |
   | --- | --- | --- | --- |
   | A | `@` | `75.2.60.5` | `185.199.108.153` |
   | A | `@` | | `185.199.109.153` |
   | A | `@` | | `185.199.110.153` |
   | A | `@` | | `185.199.111.153` |
   | CNAME | `www` | `<project-name>.netlify.app` | `<your-username>.github.io` |

3. **Wait for it.** DNS changes often work within the hour but can take up to 48 hours. Both hosts then
   add HTTPS on their own; on GitHub Pages, tick **Enforce HTTPS** once it is offered.
4. **Tell the build its address.** Put the final address (for example `https://www.yourdomain.com/`) in
   `site-url.txt`, rebuild and redeploy. Discord and social sites then show the preview image, and
   `dist/sitemap.xml` is made for search engines. The GitHub Pages workflow fills the address in itself.

## Change it

| File | What it is |
| --- | --- |
| `src/page.html` | The page: layout, styles and UI code. |
| `src/planner.js` | The breeding search. Also runs in Node: `require('./src/planner.js')`. |
| `data/species.json` | Gen 1–5 species: dex number, egg groups, gender ratio, abilities, egg moves. |
| `data/tms.json` | Which species can learn each TM the page offers (dex numbers per move). |
| `data/box-icons.png` | Box icons for all 649 species, 25 per row in dex order. |
| `build.py` | Combines the above into `dist/index.html` (the site) and `build/artifact.html` (the claude.ai version), copies `public/` into `dist/`, and adds `404.html`, `robots.txt` and `sitemap.xml`. |
| `site-url.txt` | The site's address, for link previews and the sitemap. |
| `public/` | App icons, the link-preview image and the web app manifest. |
| `src/items.py` | The brace and Everstone icons, drawn as SVG after the in-game item sprites. |
| `data/logo.png`, `data/logo-square.png` | The Smearguru logo (header, tab icon), also used for the app icons and preview image. |
| `src/build-logo.py` | Paints the logo onto Smeargle's box icon from `data/box-icons.png`; needs Pillow. |
| `src/build-icons.py` | Redraws the icons and preview image (needs Pillow). |
| `src/extract-species.js`, `src/extract-tms.js`, `src/build-sprites.py` | Regenerate the data files from Pokémon Showdown's data and PokeAPI's sprites. |

After editing, run `python3 build.py`. The site runs no server code. Saved inputs live in each
visitor's browser (`localStorage`).

## Rules the planner uses

- A Power item guarantees the holder's IV in its stat, and a stat both parents share always carries over (unbraced IVs average).
- An Everstone passes nature and uses the parent's item slot. Both parents are consumed.
- The egg takes the mother's species, or the non-Ditto parent's. The ability passes from that parent by chance (hidden ≈60%). Egg moves come from the father.
- Incense babies (Azurill, Wynaut, Munchlax, Mime Jr., Bonsly, Budew, Chingling, Happiny, Mantyke) only hatch when a parent holds their incense ($9,600), which uses that parent's item slot. Otherwise the egg is the next stage, such as Marill.
- Gender selection costs $5k, $10k or $25k for 1:1, 3:1 or 7:1 species. All prices are editable on the page.

## Credits

Species data comes from [Pokémon Showdown](https://github.com/smogon/pokemon-showdown) and box icons, including the
Smeargle icon the Smearguru logo is painted on, from [PokeAPI/sprites](https://github.com/PokeAPI/sprites). Pokémon and its sprites are © Nintendo, Game Freak
and The Pokémon Company. This is an unofficial fan tool, not affiliated with PokeMMO.
