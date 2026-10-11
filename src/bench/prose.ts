// Made-up filler for bench pages: one short entry per topic (who looks after it, which form, where
// the paper copies live), every entry with names of its own so that a summary of the page has to
// list them one by one. The order comes from a seed, so a page is the same on every run. No
// digits, dates, code or figures (the web filter keeps those without asking), and none of the
// names a bench question asks about.

const PEOPLE = ['Marta Lindqvist', 'Oluwaseun Adeyemi', 'Henrik Strand', 'Priya Venkataraman', 'Callum Draper', 'Noor Hakimi', 'Elodie Fabre',
  'Tomasz Wrona', 'Imogen Pryce', 'Kofi Mensah', 'Sunita Rao', 'Declan Moriarty', 'Anneli Koskinen', 'Ravi Chandra', 'Freya Lockhart',
  'Mateus Ferreira', 'Yara Haddad', 'Dougal McAllister', 'Chiara Romano', 'Jonas Becker', 'Lindiwe Dube', 'Hamish Ogilvie', 'Sofia Petrova',
  'Idris Whitlock', 'Mei Tanaka', 'Gareth Pugh', 'Ayesha Qureshi', 'Bjorn Halldor', 'Rosalind Achebe', 'Viktor Sandberg']
const COLOURS = ['Amber', 'Teal', 'Violet', 'Crimson', 'Olive', 'Slate', 'Coral', 'Ivory', 'Indigo', 'Saffron', 'Russet', 'Jade']
const FORMS = ['Request Slip', 'Change Form', 'Log Sheet', 'Booking Card', 'Return Note', 'Sign-off Sheet', 'Handover Card', 'Query Form']
const PLACES = ['in the filing cabinet by the door', 'in the tin on the top shelf', 'behind the front desk', 'in the crate in the stores',
  'on the clipboard by the kettle', 'in the drawer under the noticeboard', 'in the folder on the long table', 'in the cupboard at the end of the hall']
const NOTICES = ['on the noticeboard', 'by message to the whole group', 'at the Monday huddle', 'in the monthly newsletter', 'on the staff chat']

/** A small deterministic generator: the same seed gives the same page. */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13; s >>>= 0
    s ^= s >>> 17
    s ^= s << 5; s >>>= 0
    return s / 0x100000000
  }
}

/** Three short sentences about one topic, each holding names a summary would have to list. */
export function paragraph(topic: string, next: () => number): string {
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(next() * xs.length)]!
  return `${pick(PEOPLE)} looks after ${topic}, and requests about it go on the ${pick(COLOURS)} ${pick(FORMS)}. ` +
    `The paper copies are kept ${pick(PLACES)}. Any change to the arrangements is announced ${pick(NOTICES)} by ${pick(PEOPLE)}.`
}

export type Needle = { /** After this many filler sections. */ at: number; heading: string; text: string }
export type PageSpec = { title: string; intro: string; topics: string[]; seed: number; needles: Needle[] }

const heading = (topic: string) => topic.charAt(0).toUpperCase() + topic.slice(1)

/** The page as HTML: its intro, a section per topic, and the needles where they belong. */
export function htmlOf(spec: PageSpec): string {
  const next = rng(spec.seed)
  const sections: string[] = []
  spec.topics.forEach((topic, i) => {
    for (const n of spec.needles) if (n.at === i) sections.push(`<h2>${n.heading}</h2>\n<p>${n.text}</p>`)
    sections.push(`<h2>${heading(topic)}</h2>\n<p>${paragraph(topic, next)}</p>`)
  })
  for (const n of spec.needles) if (n.at >= spec.topics.length) sections.push(`<h2>${n.heading}</h2>\n<p>${n.text}</p>`)
  return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${spec.title}</title></head>\n<body>\n<h1>${spec.title}</h1>\n` +
    `<p>${spec.intro}</p>\n${sections.join('\n')}\n</body></html>\n`
}
