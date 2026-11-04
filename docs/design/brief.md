# Financy: design brief

What every screen of Financy is for and how it should feel. The house style (type, spacing, shell,
components) is preact-components' `docs/design-language.md`; this page says only what is Financy's
own. Who Financy is for and what it does in detail: [product.md](../financy/product.md).

## Who it is for

- **The money keeper**: an expat, a remote worker or an immigrant whose income, rent and savings
  sit in different currencies. They leave a spreadsheet for Financy and judge it by whether the
  total is honest.
- **The partner**: adds a coffee in five seconds and checks what is left this month. If logging
  feels like work, the household stops using Financy, so every screen is judged by them.
- **The self-hoster**: runs Financy at home and reads the code and the docs before trusting it.
- **The operator**: the person who runs a Financy server, in the admin panel, answering "who is
  this person, what happened, and what can I do about it".

## Its job

Financy shows a household where its money is and where it went, in every currency it holds, with
one total in the household's base currency. Everyone in the household sees the same numbers live.
It is free and open source (AGPL-3.0) to self-host, or a paid cloud for people who do not want to.

## Voice

- Calm and exact. Money makes people anxious; the screen never adds to it. Say what happened and
  what to do next; no "Oops", no exclamation marks, no jokes in errors, no praise for spending
  less.
- Honest about numbers. An amount shows its currency; a converted amount says it is converted and
  at which rate; a total with a gap (a missing rate) says so in one line.
- Sentence case, digits for numbers, one wording per action across the app.
- Inside the app Financy speaks about the household's money, not about itself.

## Brand

- Hue: a deep blue, 262°: `oklch(0.48 0.19 262)` (`#1853c6`), set as `--color-primary` and
  `--color-accent` in `libs/ui/brand.css`. Dark mode is the house ink palette with the same hue.
  It is the hue preact-components' `docs/design-language.md` keeps for Financy.
- Restraint: the blue marks the one primary action, focus rings, selected states and the mark. No
  blue panels or gradients, and the browser's `theme-color` stays on the page colours. Status
  colours (income, spending, errors) are never this blue.
- The icon is `IconWallet`: "my money", without naming a currency. The brand mark is the house
  construction: a rounded square in the hue with the white wallet, then "Financy" in Geist 500.
  One SVG (`apps/spa/public/favicon.svg`) is the source of every favicon and launcher icon. The
  wallet is the brand only: no rail or tab-bar item uses it.
- The admin panel is told apart by a neutral gray "Admin" badge, never by a second accent: under
  the operator's avatar in the rail, beside "Financy" on its sign-in page, and in its page titles
  ("Users · Admin · Financy").
- The name, icon and hue live in their constants only (`libs/ui/frame.tsx`,
  `libs/ui/admin-frame.tsx`, `libs/ui/brand.css`, `apps/mpa/brand.ts`, the apps' `index.html` and
  manifest), never drawn into artwork, so a rename is one short change.

## Reference products

- **Actual Budget**: open source and self-hostable, fast entry, a local-first app that respects the
  keyboard.
- **Monarch Money**: a calm household view of every account, shared by a couple.
- **YNAB**: "what is left this month" as the question every screen answers.
