import type { Element, Observation } from './rules'

// Bot-protection pages as the driver reports them (title, main text, visible frames), one per
// provider, and pages that only look like one. Shared by rules.test.ts and index.test.ts.

const link = (id: string, label: string, href: string): Element => ({ id, tag: 'a', role: 'link', label, href })

export const BOT_PAGES: Record<string, { provider: string; obs: Observation }> = {
  cloudflare: { provider: 'Cloudflare', obs: {
    url: 'https://shop.test/', title: 'Just a moment...', elements: [],
    text: 'shop.test\nVerifying you are human. This may take a few seconds.\nshop.test needs to review the security of your connection before proceeding.',
    frames: ['https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv/abc'],
  } },
  cloudflareLegacy: { provider: 'Cloudflare', obs: {
    url: 'https://shop.test/?__cf_chl_rt_tk=abc', title: 'shop.test', elements: [],
    text: 'Checking your browser before accessing shop.test. This process is automatic.',
  } },
  hcaptcha: { provider: 'hCaptcha', obs: {
    url: 'https://shop.test/verify', title: 'Shop', elements: [link('e1', 'Help', 'https://shop.test/help')],
    text: 'One more thing before you continue.',
    frames: ['https://newassets.hcaptcha.com/captcha/v1/abc/static/hcaptcha.html#frame=checkbox',
      'https://newassets.hcaptcha.com/captcha/v1/abc/static/hcaptcha.html#frame=challenge'],
  } },
  recaptcha: { provider: 'reCAPTCHA', obs: {
    url: 'https://www.google.com/sorry/index', title: 'https://www.google.com/search', elements: [],
    text: 'Our systems have detected unusual traffic from your computer network. This page checks to see if it\'s really you sending the requests, and not a robot.',
    frames: ['https://www.google.com/recaptcha/api2/anchor', 'https://www.google.com/recaptcha/api2/bframe'],
  } },
  datadome: { provider: 'DataDome', obs: {
    url: 'https://shop.test/', title: 'shop.test', elements: [], text: '',
    frames: ['https://geo.captcha-delivery.com/captcha/'],
  } },
  perimeterx: { provider: 'PerimeterX', obs: {
    url: 'https://shop.test/', title: 'Access to this page has been denied', elements: [],
    text: 'Press & Hold to confirm you are\na human (and not a bot).\nReference ID 1234',
  } },
}

/** Pages that mention or embed a captcha but are not a bot check: the run goes on. */
const RICH = 'Our shop sells plans for teams of every size. '.repeat(30)
const many = Array.from({ length: 14 }, (_, i) => link(`e${i + 1}`, `Page ${i + 1}`, `https://shop.test/p${i + 1}`))

export const NOT_BOT_PAGES: Record<string, Observation> = {
  // a contact form with a reCAPTCHA box and the invisible badge: a rich page, no challenge shown
  contactForm: { url: 'https://shop.test/contact', title: 'Contact us', elements: many, text: RICH,
    frames: ['https://www.google.com/recaptcha/api2/anchor', 'https://www.google.com/recaptcha/api2/anchor#size=invisible'] },
  // a privacy page that names the providers
  privacy: { url: 'https://shop.test/privacy', title: 'Privacy', elements: many,
    text: `${RICH} We use hCaptcha, DataDome and PerimeterX to verify you are human when you sign in.` },
  // a thin page with only the invisible reCAPTCHA badge
  invisible: { url: 'https://shop.test/', title: 'Shop', elements: [link('e1', 'Home', 'https://shop.test/')], text: 'Welcome.',
    frames: ['https://www.google.com/recaptcha/api2/anchor#size=invisible'] },
}
