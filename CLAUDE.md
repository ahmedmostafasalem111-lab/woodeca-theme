# Woodeca theme: project rules

## Themes (since 9 Oct 2026)
- **Live:** "refined-mood" (188621685056). Push to it only after the change has passed on the QA duplicate **and** Ahmed says "push live".
- **QA:** "refined-mood QA" (188939698496), an unpublished duplicate of the live theme. All theme work is pushed and tested here first.
- **Backup:** "Woodeca 103" (183093559616). Never pushed to.

## Content lives in the theme editor
Before ANY `shopify theme push` to a theme, first pull that theme's editor files, commit the pulled content, and only then push. Never push over un-pulled editor changes. Never edit content via `theme dev` themes.

In practice (QA):

```sh
shopify theme pull --theme 188939698496 --store 27b575-6a.myshopify.com --path .
git add -A && git commit -m "Pull QA theme content"   # skip if nothing changed
shopify theme push --theme 188939698496 --store 27b575-6a.myshopify.com --path .
```

- Never add `--publish`.
- Editor changes Ahmed makes on the live theme must be pulled from 188621685056 before anything is pushed live.
