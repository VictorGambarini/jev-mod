// The made-up pages the web-filter task bench fetches: long handbooks and FAQs of plain filler
// prose (bench/prose.ts) with the sentence or two a question needs buried in them, and a few
// look-alike sentences that answer a different question. Nothing in them is real.

import { htmlOf, type PageSpec } from '../../../bench/prose'

const FERRY = ['mooring lines', 'life jackets', 'the ticket kiosk', 'lost property', 'the galley', 'deck cleaning', 'engine room visits',
  'the gangway', 'pet travellers', 'bicycle racks', 'fog procedures', 'the wheelhouse', 'visitor tours', 'the staff canteen', 'uniform care',
  'fuel deliveries', 'the noticeboard', 'tide tables', 'the first aid cabinet', 'radio checks', 'harbour fees', 'the car deck', 'rain gear',
  'the apprentice scheme', 'shift handovers', 'the winter timetable', 'the summer timetable', 'safety drills', 'the suggestion box', 'paint stores',
  'weather boards', 'the rescue boat', 'crew parking', 'school parties', 'the souvenir shelf', 'night lighting', 'the bilge log', 'cargo manifests']
const LIBRARY = ['the reading room', 'the children\'s corner', 'newspaper archives', 'the photocopier', 'study carrels', 'the returns slot',
  'large print books', 'the local history shelf', 'the community noticeboard', 'the teen collection', 'reference desk questions', 'audiobook loans',
  'the seed library', 'quiet study rules', 'toy lending', 'the mobile library', 'volunteer shelving', 'book club evenings', 'lost cards',
  'the reading garden', 'the repair table', 'homework help', 'public computers', 'the map drawer', 'donated books', 'the film shelf',
  'story time', 'the microfilm reader', 'poetry nights', 'the staff room', 'overdue notices', 'the rare books cabinet', 'the gift shop', 'wheelchair access']
const BIKES = ['the workshop floor', 'spare tubes', 'the parts wall', 'frame stands', 'the wash bay', 'chain lube', 'second-hand sales', 'the tool board',
  'volunteer aprons', 'the kids\' bikes', 'the loan fleet', 'wheel truing', 'the paint cupboard', 'open evenings', 'the delivery bike', 'saddle storage',
  'the cargo trailer', 'the bell collection', 'helmet checks', 'the donation bin', 'brake bleeding', 'the safety poster', 'the tea corner',
  'the repair queue', 'the forecourt', 'lock-up routines', 'the member newsletter', 'the old rack', 'the lighting kit', 'the ride-out group', 'the mudguard shelf']
const GARDEN = ['the compost bays', 'the tool shed', 'seed swaps', 'the water butts', 'the greenhouse', 'the bean rows', 'the herb spiral', 'the wormery',
  'hedge trimming', 'the bee hives', 'the pond edge', 'the orchard', 'visitor paths', 'the potting bench', 'the bird feeders', 'the harvest table',
  'the shade tent', 'the wheelbarrows', 'the notice frame', 'the plot map', 'the kids\' patch', 'the cold frames', 'the gate latch', 'the spring clean',
  'weed piles', 'the picnic benches', 'the hose reel', 'the rain gauge', 'the mulch heap', 'the plant sale', 'the leaf mould pen']
const LAB = ['the sample fridge', 'glassware washing', 'the fume cupboard', 'the booking sheet', 'the centrifuge room', 'safety goggles', 'waste bins',
  'the autoclave', 'the stockroom', 'visiting students', 'the shared printer', 'the cold room', 'the tea rota', 'the noticeboard', 'the chemical register',
  'bench cleaning', 'the microscope room', 'the balance table', 'lab coats', 'the delivery bay', 'the seminar room', 'the key cabinet', 'spill kits',
  'the freezer log', 'the pipette shelf', 'the fire exits', 'the hand-over notes', 'the plant room', 'the library corner', 'the coat hooks']
const STUDIO = ['the kiln room', 'glaze buckets', 'the wheel area', 'clay recycling', 'the drying shelves', 'studio aprons', 'the slab roller', 'open days',
  'the glaze library', 'the pug mill', 'the sink traps', 'the sales table', 'the member lockers', 'the cleaning rota', 'the kiln log', 'tool rolls',
  'the sieve station', 'the plaster bats', 'the class sign-up', 'the dust mask drawer', 'the delivery door', 'the photo corner', 'the broom cupboard',
  'the class snacks', 'the pottery wheels', 'the shelf labels', 'the bisque shelf', 'the first aid box', 'the guest potter', 'the extension lead rule']

const ALL = [...new Set([...FERRY, ...LIBRARY, ...BIKES, ...GARDEN, ...LAB, ...STUDIO])]
/** A page's own topics first, then others from the rest of the pool, so that a page runs to `n` sections. */
const topicsOf = (own: string[], n = 64): string[] => own.concat(ALL.filter(t => !own.includes(t))).slice(0, Math.max(n, own.length))

export type FilterTask = {
  id: string
  /** Pages by path; the task fetches the first, or all in order. */
  pages: Record<string, PageSpec>
  /** The question, and the patterns an answer must each match. */
  question: string
  answer: RegExp[]
}

const spec = (title: string, intro: string, topics: string[], seed: number, needles: PageSpec['needles']): PageSpec =>
  ({ title, intro, topics, seed, needles })

export const FILTER_TASKS: FilterTask[] = [
  {
    // one fact, with a look-alike for another kind of swap
    id: 'ferry-swap',
    pages: { '/ferries/crew-handbook': spec('Tidewater Ferries crew handbook', 'Welcome aboard. This handbook collects the everyday arrangements for the crew.', topicsOf(FERRY), 11, [
      { at: 14, heading: 'Swapping weekend sailings', text: 'A crew member who wants to swap a weekend sailing hands in the Blue Swap Sheet, and the swap is approved by the harbour duty officer, Ingrid Halvorsen.' },
      { at: 27, heading: 'Changing the weekday timetable', text: 'A change to a weekday sailing is requested on the Green Change Form, and it is approved by the operations manager, Pavel Dunn.' },
    ]) },
    question: 'Who approves a swap of a weekend sailing, and what is the form called?',
    answer: [/Halvorsen/i, /Blue Swap/i],
  },
  {
    // a fact in a short section among many
    id: 'library-quiet-hour',
    pages: { '/library/visitor-guide': spec('Millbrook Community Library: visitor guide', 'Everything a first-time visitor might want to know.', topicsOf(LIBRARY), 23, [
      { at: 19, heading: 'The quiet hour', text: 'The quiet hour is held in the Linden Room, and the key to it is kept by the caretaker, Mr Osei, who unlocks it at the start of the hour.' },
      { at: 8, heading: 'Booking the meeting room', text: 'The meeting room is booked at the front desk and the key is held by the librarian on duty.' },
    ]) },
    question: 'Which room holds the library\'s quiet hour, and who keeps its key?',
    answer: [/Linden/i, /Osei/i],
  },
  {
    // supplier name, one needle
    id: 'bike-coop-returns',
    pages: { '/bikes/coop-notes': spec('Spokes & Co bicycle co-op: working notes', 'Notes for volunteers and members of the workshop.', topicsOf(BIKES), 37, [
      { at: 22, heading: 'Faulty brake pads', text: 'Faulty brake pads are never sold on. They go back to the supplier, Corvane Components, in a bag with a pink returns slip.' },
      { at: 5, heading: 'Faulty tyres', text: 'Faulty tyres are returned to the wholesaler, Haldane Rubber, with the yellow returns slip.' },
    ]) },
    question: 'Which supplier gets faulty brake pads back?',
    answer: [/Corvane/i],
  },
  {
    // two facts about one thing in one section
    id: 'repair-clinic-lead',
    pages: { '/bikes/repair-clinic': spec('Spokes & Co: the Saturday repair clinic', 'How the weekly clinic runs, for new volunteers.', topicsOf(BIKES.slice().reverse()), 41, [
      { at: 25, heading: 'Who leads the clinic', text: 'The Saturday repair clinic is led by Beatriz Quillan, who wears an orange sash so that people can find her in a crowd.' },
    ]) },
    question: 'Who leads the Saturday repair clinic, and what does she wear so people can spot her?',
    answer: [/Quillan/i, /orange sash/i],
  },
  {
    // the answer is in two sections far apart
    id: 'garden-hotline',
    pages: { '/garden/plot-holder-faq': spec('Eastfield Community Garden: plot holder FAQ', 'Questions plot holders ask us most.', topicsOf(GARDEN), 53, [
      { at: 6, heading: 'Out of hours problems', text: 'If something goes wrong out of hours, ring the Lantern Line. That is the garden\'s emergency number and every plot holder has it on their gate tag.' },
      { at: 26, heading: 'Holiday cover', text: 'On public holidays the Lantern Line is answered by Joaquin Reyes, who lives next to the east gate.' },
    ]) },
    question: 'What is the garden\'s out-of-hours emergency line called, and who answers it on public holidays?',
    answer: [/Lantern Line/i, /Joaquin|Reyes/i],
  },
  {
    // two pages, one fact on each
    id: 'lab-two-pages',
    pages: {
      '/lab/safety': spec('Harrow Lab: safety and spills', 'The rules we all follow.', topicsOf(LAB), 61, [
        { at: 17, heading: 'Where the spill kits live', text: 'The spill kits are kept in the green cabinet beside the fume cupboard, and the safety officer, Dr Nakamura, checks them.' },
      ]),
      '/lab/ordering': spec('Harrow Lab: ordering and deliveries', 'How supplies reach the bench.', topicsOf(LAB.slice().reverse()), 67, [
        { at: 12, heading: 'Who orders consumables', text: 'Consumables are ordered through the lab manager, Tamsin Fenwick, who places the weekly order on the first working day.' },
      ]),
    },
    question: 'Who checks the spill kits, and who places the lab\'s weekly order for consumables?',
    answer: [/Nakamura/i, /Fenwick/i],
  },
  {
    // several look-alikes: only one is for the night shift
    id: 'ferry-lockup',
    pages: { '/ferries/shift-notes': spec('Tidewater Ferries: shift notes', 'Who does what at the end of a shift.', topicsOf(FERRY.slice(5).concat(FERRY.slice(0, 5))), 71, [
      { at: 9, heading: 'Morning opening', text: 'The morning opening of the ticket hall is done by the first clerk in, who signs the opening sheet.' },
      { at: 18, heading: 'Evening lock-up', text: 'The evening lock-up of the ticket hall is done by the last clerk out, who signs the evening sheet.' },
      { at: 24, heading: 'Night lock-up of the pier', text: 'The night lock-up of the pier gates is done by Rashid Okafor, the night watchman, who hangs the key on the red hook.' },
    ]) },
    question: 'Who does the night lock-up of the pier gates, and where does he hang the key?',
    answer: [/Okafor/i, /red hook/i],
  },
  {
    // a very long page
    id: 'studio-kiln',
    pages: { '/studio/members-guide': spec('Clayworks pottery studio: members\' guide', 'Everything a member needs to know about using the studio.', topicsOf(STUDIO.concat(LIBRARY.slice(0, 20), GARDEN.slice(0, 20))), 83, [
      { at: 36, heading: 'Firing the big kiln', text: 'Only members who have passed the kiln induction may load the big kiln. The induction is run by Odile Marchetti, and passes are recorded in the blue folder.' },
    ]) },
    question: 'Who runs the induction for loading the big kiln, and where are passes recorded?',
    answer: [/Marchetti/i, /blue folder/i],
  },
  {
    // the needle is near the end of a page that opens with look-alikes
    id: 'lab-booking',
    pages: { '/lab/booking-guide': spec('Harrow Lab: booking guide', 'How to book rooms and equipment.', topicsOf(LAB.slice(10).concat(LAB.slice(0, 10))), 97, [
      { at: 3, heading: 'Booking the seminar room', text: 'The seminar room is booked on the paper sheet outside the lab manager\'s office.' },
      { at: 13, heading: 'Booking the microscope room', text: 'The microscope room is booked on the shared online calendar called Lumen.' },
      { at: 27, heading: 'Booking the cold room', text: 'The cold room is not booked at all. Shelves in it are claimed by putting a name label on them.' },
    ]) },
    question: 'What is the online calendar for booking the microscope room called?',
    answer: [/Lumen/i],
  },
]

/** The page's HTML. */
export const pageHtml = (page: PageSpec): string => htmlOf(page)
