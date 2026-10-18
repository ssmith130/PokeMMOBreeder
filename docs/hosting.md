# Hosting the planner

The site is static: `python3 build.py` puts everything it needs in `dist/`, and any static host can serve
that folder. This repo publishes to GitHub Pages on every push to `main`; the steps below also cover
Netlify and pointing your own domain at either one.

## GitHub Pages

1. The repository has to be public, unless your account has GitHub Pro, Team or Enterprise.
2. In the repo, open Settings > Pages and set Source to **GitHub Actions**.
3. Push to `main`, or run the "Deploy to GitHub Pages" workflow from the Actions tab.
   `.github/workflows/pages.yml` builds the site and publishes `dist/` to
   `https://<your-username>.github.io/<repo-name>/`, or to your custom domain once one is set.

## Netlify

Either connect the repo (`netlify.toml` has the build command and output folder, and every push
redeploys), or build locally and drag the `dist` folder onto https://app.netlify.com/drop. With
drag and drop, update the site by dragging a new `dist` folder onto the project's
**Production deploys** area. Choose the project's name before setting up a domain, because the
domain will point at `<project-name>.netlify.app`.

## Your own domain

These steps use Squarespace, where smearguru.org is registered. Other registrars have the same
record types under similar names.

1. **Add the domain on the host.**
   - GitHub Pages: optionally verify the domain first (your GitHub account's Settings > Pages >
     Add a domain, which asks for a TXT record). Then in the repo's Settings > Pages, enter the domain
     under Custom domain and Save.
   - Netlify: the project's **Domain management** > **Add a domain** > "Add a domain you already own".
     Netlify adds the `www` version too and suggests making it the primary domain when your DNS is
     elsewhere. Skip its offer to move your DNS to Netlify.
2. **Add the DNS records.** In Squarespace, open account.squarespace.com/domains, click the domain, then
   **DNS**. Delete the **Squarespace Defaults** records, which point the domain at a Squarespace site,
   but keep any MX or TXT records you use for email. Then use **Add record** under Custom records. The
   Name is relative to the domain, so `@` is the bare domain and `www` is the www version.

   | Type | Name | GitHub Pages | Netlify |
   | --- | --- | --- | --- |
   | A | `@` | `185.199.108.153` | `75.2.60.5` |
   | A | `@` | `185.199.109.153` | |
   | A | `@` | `185.199.110.153` | |
   | A | `@` | `185.199.111.153` | |
   | CNAME | `www` | `<your-username>.github.io` | `<project-name>.netlify.app` |
   | AAAA | `@` | `2606:50c0:8000::153` | |
   | AAAA | `@` | `2606:50c0:8001::153` | |
   | AAAA | `@` | `2606:50c0:8002::153` | |
   | AAAA | `@` | `2606:50c0:8003::153` | |

   The AAAA records are optional: they let visitors on IPv6-only networks reach a GitHub Pages site.

3. **Wait.** DNS changes often work within the hour but can take up to 48 hours. Both hosts then set up
   HTTPS on their own; on GitHub Pages, tick **Enforce HTTPS** once it's offered.
4. **Tell the build its address.** Put the final address in `site-url.txt` (this repo has
   `https://smearguru.org/`). Link previews on Discord and social sites use it to show the preview
   image, and `dist/sitemap.xml` is made from it. On GitHub Pages the workflow passes the address
   itself, which takes priority.

## Visitor counts (optional)

The site counts nothing by default. To see how many people visit, without cookies or a cookie banner:

1. Sign up at https://www.goatcounter.com/signup (free for personal sites) and pick a code, such as
   `smearguru`; your dashboard is then at `https://smearguru.goatcounter.com`.
2. Put the code on its own line in `goatcounter.txt` and push. The next build adds GoatCounter's script
   to the site (not to the claude.ai version). Empty the file to turn it off again.

The record values come from [GitHub's custom domain docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
and [Netlify's external DNS guide](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/).
