# MELUVIRA Website — GitHub Pages Prototype

A plain static HTML/CSS/JS prototype of the MELUVIRA public website
(Home, Support, Privacy Policy), built to compare against the current
production Wix site at <https://meluviradev.wixsite.com/meluvira-1> and
help decide whether to migrate.

**This is a prototype only.** The Wix site remains production. Nothing
here is linked from the App Store or any production Privacy/Support URL.

## Why this exists

The live Wix site has a few confirmed mobile/tablet issues (navigation
links clipped off-screen on phone widths, a hero image that balloons to
over a full screen's height specifically at the 768px tablet breakpoint,
and the Support page's "01–04" step numbers rendering as a group
disconnected from their matching content). This prototype intentionally
avoids all three by construction — see `qa/check.mjs`.

## Structure

```
/
  index.html          Home
  support/index.html  Support
  privacy/index.html  Privacy Policy
  assets/
    css/styles.css    one shared stylesheet
    js/main.js        one small shared script (mobile nav toggle only)
  qa/check.mjs         lightweight Playwright QA script
```

No build step, no framework, no bundler. Every page is plain semantic
HTML referencing the one shared stylesheet/script directly.

## Running locally

```sh
npm run serve   # static file server on http://localhost:4173
npm install     # installs Playwright, only needed for qa
npm run qa      # runs qa/check.mjs against the local server
```

## Content source

Page content was transcribed directly from the live, rendered Wix pages
(not invented). Where the original page's content or link target could
not be verified from the rendered page, that is called out in the
project's own audit notes rather than guessed.

## Privacy

Fully static, no analytics, no trackers, no cookies, no third-party
scripts, no login/account system.
