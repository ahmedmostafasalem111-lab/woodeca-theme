# Woodeca theme: project rules

## Content lives in the QA theme editor
From now on, content is edited in the QA theme (188621685056) editor. Before ANY `shopify theme push` to that theme, first run `shopify theme pull --theme 188621685056`, commit the pulled content, and only then push. Never push over un-pulled editor changes. Never edit content via `theme dev` themes.

In practice:

```sh
shopify theme pull --theme 188621685056 --store 27b575-6a.myshopify.com --path .
git add -A && git commit -m "Pull QA theme content"   # skip if nothing changed
shopify theme push --theme 188621685056 --store 27b575-6a.myshopify.com --path .
```

- Never add `--publish`.
- The live theme "Woodeca 103" (183093559616) is never pushed to.
