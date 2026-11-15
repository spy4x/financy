import type { TagColor } from "@domain/tags"

/**
 * The words and names the demo's fake data is built from (docs/demo.md): people's names by
 * culture, one theme per household with notes that each read as their own, the browsers people sign in
 * with, and the newsletter's sent issues. Data only; `fake-data.ts` picks from it.
 */

/** First and last names that belong together, one pool per Western culture. */
export const NAME_POOLS: readonly { first: readonly string[]; last: readonly string[] }[] = [
  {
    first: [`James`, `Olivia`, `William`, `Emma`, `Benjamin`, `Charlotte`, `Henry`, `Amelia`],
    last: [`Smith`, `Johnson`, `Taylor`, `Walker`, `Wright`, `Carter`, `Hughes`, `Bennett`],
  },
  {
    first: [`Siobhan`, `Liam`, `Aoife`, `Conor`, `Niamh`, `Cian`, `Ciara`, `Seán`],
    last: [`Murphy`, `Walsh`, `O'Brien`, `Byrne`, `Kelly`, `Ryan`, `Doyle`, `Gallagher`],
  },
  {
    first: [`Élodie`, `Julien`, `Camille`, `Hugo`, `Léa`, `Mathis`, `Chloé`, `Antoine`],
    last: [`Dubois`, `Moreau`, `Laurent`, `Lefèvre`, `Girard`, `Bonnet`, `Fontaine`, `Rousseau`],
  },
  {
    first: [`Lukas`, `Hannah`, `Felix`, `Lena`, `Jonas`, `Mia`, `Paul`, `Clara`],
    last: [`Müller`, `Schmidt`, `Becker`, `Wagner`, `Hoffmann`, `Schulz`, `Fischer`, `Weber`],
  },
  {
    first: [`Daan`, `Sanne`, `Bram`, `Fleur`, `Joris`, `Lotte`, `Thijs`, `Femke`],
    last: [`de Vries`, `Jansen`, `Visser`, `Bakker`, `Smit`, `Meijer`, `de Boer`, `Mulder`],
  },
  {
    first: [`Astrid`, `Lars`, `Ingrid`, `Erik`, `Sigrid`, `Nils`, `Freya`, `Magnus`],
    last: [`Lindqvist`, `Andersen`, `Johansson`, `Berg`, `Nilsen`, `Holm`, `Larsen`, `Eriksson`],
  },
  {
    first: [`Giulia`, `Marco`, `Chiara`, `Luca`, `Francesca`, `Matteo`, `Alessia`, `Lorenzo`],
    last: [`Rossi`, `Ricci`, `Esposito`, `Romano`, `Conti`, `Bruno`, `Gallo`, `Marino`],
  },
  {
    first: [`Mateo`, `Valentina`, `Diego`, `Lucía`, `Santiago`, `Carmen`, `Pablo`, `Elena`],
    last: [`García`, `Hernández`, `López`, `Martínez`, `Ramírez`, `Torres`, `Navarro`, `Ruiz`],
  },
  {
    first: [`João`, `Ana`, `Lucas`, `Beatriz`, `Rafael`, `Inês`, `Tiago`, `Marta`],
    last: [`Silva`, `Santos`, `Oliveira`, `Costa`, `Pereira`, `Almeida`, `Ferreira`, `Carvalho`],
  },
]

/**
 * The person the admin panel's video follows (`docs/screenshots/admin-video.ts`): always there.
 * No pool has the surname, so the video's search for it finds her and her {@link VIDEO_NAMESAKES}.
 */
export const VIDEO_PERSON = { firstName: `Claire`, lastName: `Hartley` } as const

/** The first names of the two other people who share {@link VIDEO_PERSON}'s surname. */
export const VIDEO_NAMESAKES = [`Daniel`, `Rose`] as const

/** A sample note: its title and a body that reads as its own. */
/** A sample note: its title and a body that reads as its own. */
export interface ThemeNote {
  title: string
  body: string
}

/**
 * One theme per household: its name, how many members besides the owner, its tags and notes, and
 * the zone its days are cut in when the household names a place; without one, the zone is picked
 * by its name (`demoTimeZone` in `fake-data.ts`).
 */
export interface Theme {
  name: string
  members: readonly [min: number, max: number]
  tags: readonly { name: string; color: TagColor }[]
  notes: readonly ThemeNote[]
  timeZone?: string
}

/**
 * The population's households. A new account gets the first, second and fourth (`YOUR_ROLES` in
 * `fake-data.ts`). The Hanoi house share is the largest on every seed: the admin panel's video
 * opens it from the top of Groups.
 */
export const THEMES: readonly Theme[] = [
  {
    name: `Home in Da Nang`,
    members: [1, 1],
    timeZone: `Asia/Ho_Chi_Minh`,
    tags: [
      { name: `visa`, color: `#1d4ed8` },
      { name: `bills`, color: `#c2410c` },
      { name: `savings`, color: `#15803d` },
    ],
    notes: [
      {
        title: `Visa renewal`,
        body:
          `My work visa runs out in March. The agency needs the passport, two photos and the contract by mid-February.`,
      },
      {
        title: `How we split rent`,
        body:
          `Rent comes out of the euro account. My partner pays the electricity and water in dong, so we call it even.`,
      },
      {
        title: `Emergency fund`,
        body: `Goal: three months of costs in euros. Top it up first, before trips.`,
      },
      {
        title: `Flights to Europe at Tết`,
        body: `Prices double after November. Book before the 15th from the travel card.`,
      },
    ],
  },
  {
    name: `Family in Lisbon`,
    members: [2, 3],
    timeZone: `Europe/Lisbon`,
    tags: [
      { name: `school`, color: `#1d4ed8` },
      { name: `home`, color: `#15803d` },
      { name: `kids`, color: `#7e22ce` },
      { name: `bills`, color: `#c2410c` },
    ],
    notes: [
      {
        title: `School fees`,
        body:
          `The international school bills each term: September, January and April. Ask for the sibling discount again.`,
      },
      {
        title: `NIF and residency`,
        body:
          `My residence card renewal is booked at AIMA for the 12th. Bring the proof of address.`,
      },
      {
        title: `Summer camp`,
        body: `The two weeks in July fill up by March. Deposit 150 €, the rest in June.`,
      },
      {
        title: `Who pays what`,
        body: `Joint account for the house and the kids. Everything else is our own.`,
      },
    ],
  },
  {
    name: `Flat 3, Berlin`,
    members: [2, 3],
    tags: [
      { name: `bills`, color: `#c2410c` },
      { name: `shared`, color: `#15803d` },
      { name: `to buy`, color: `#7e22ce` },
    ],
    notes: [
      {
        title: `Kitty rules`,
        body:
          `Everyone puts in 40 € on the 1st. Cleaning things, toilet paper and oil come out of it.`,
      },
      {
        title: `Internet contract`,
        body: `It runs until August. Cancel by June or it renews for a year.`,
      },
      {
        title: `Deposit`,
        body:
          `2,400 € held by the landlord. When someone moves out, the next person pays them their share.`,
      },
    ],
  },
  {
    name: `Mum & Dad's care fund`,
    members: [2, 3],
    tags: [
      { name: `care`, color: `#b91c1c` },
      { name: `house`, color: `#15803d` },
      { name: `monthly`, color: `#1d4ed8` },
    ],
    notes: [
      {
        title: `What the fund covers`,
        body: `The carer three mornings a week, the pharmacy and repairs to the house. Not gifts.`,
      },
      {
        title: `Carer's invoice`,
        body: `It arrives on the 25th. Pay by the 5th. Ask for the receipt in Dad's name.`,
      },
      {
        title: `Who sends what`,
        body: `Each of us sends a monthly transfer. Whoever earns more this year puts in more.`,
      },
    ],
  },
  {
    name: `Sofia freelance`,
    members: [1, 1],
    tags: [
      { name: `invoice`, color: `#15803d` },
      { name: `tax`, color: `#b91c1c` },
      { name: `client`, color: `#1d4ed8` },
    ],
    notes: [
      {
        title: `Tax set-aside`,
        body: `30 % of every invoice goes straight to savings. Never touch it before April.`,
      },
      {
        title: `Late invoices`,
        body: `Studio North is 40 days late. Second reminder sent Monday.`,
      },
      {
        title: `Accountant`,
        body: `Send the receipts every quarter as one PDF with the bank statement.`,
      },
    ],
  },
  {
    name: `Moving to Singapore`,
    members: [1, 2],
    tags: [
      { name: `move`, color: `#7e22ce` },
      { name: `visa`, color: `#1d4ed8` },
      { name: `budget`, color: `#b91c1c` },
    ],
    notes: [
      {
        title: `Moving checklist`,
        body:
          `Ship 12 boxes, sell the car, close the gym membership, tell the bank about the new address.`,
      },
      {
        title: `First month's costs`,
        body: `Two months' deposit, the agent's fee and the first rent. Have it ready in dollars.`,
      },
      {
        title: `Employment pass`,
        body: `Approved. Collect the card within two weeks of arriving.`,
      },
    ],
  },
  {
    name: `Wedding fund`,
    members: [1, 1],
    tags: [
      { name: `venue`, color: `#7e22ce` },
      { name: `guests`, color: `#1d4ed8` },
      { name: `budget`, color: `#b91c1c` },
    ],
    notes: [
      {
        title: `Budget so far`,
        body: `The venue is paid. Catering and photos are next. Keep the total under 18,000 €.`,
      },
      {
        title: `Deposits paid`,
        body: `Venue 2,000 €, photographer 500 €. Both are non-refundable after May.`,
      },
    ],
  },
  {
    name: `Hanoi house share`,
    members: [4, 4],
    tags: [
      { name: `bills`, color: `#c2410c` },
      { name: `rent`, color: `#1d4ed8` },
    ],
    notes: [
      {
        title: `Electricity`,
        body: `The bill comes from the landlord in dong. Split it by the meter in each room.`,
      },
      {
        title: `House rules for money`,
        body: `Pay rent to the landlord's agent by the 3rd.`,
      },
    ],
  },
  {
    name: `Family in Hanoi`,
    members: [2, 3],
    tags: [
      { name: `school`, color: `#1d4ed8` },
      { name: `family`, color: `#7e22ce` },
      { name: `home`, color: `#15803d` },
    ],
    notes: [
      {
        title: `Tuition`,
        body: `The second term is due in January, in dong. Grandma helps with part of it.`,
      },
      {
        title: `Lunar New Year`,
        body:
          `Lucky money for the kids, gifts for both families and the trip to Huế. Start saving in October.`,
      },
    ],
  },
  {
    name: `Remote couple, Lisbon & Dubai`,
    members: [1, 1],
    tags: [
      { name: `travel`, color: `#1d4ed8` },
      { name: `shared`, color: `#15803d` },
    ],
    notes: [
      {
        title: `Flights between us`,
        body: `One trip each month. Book with the dollar card for the miles.`,
      },
      {
        title: `Shared costs`,
        body: `The flat in Lisbon, insurance and the car. Split them by income: 60 and 40.`,
      },
    ],
  },
  {
    name: `Studio Mar, two partners`,
    members: [1, 2],
    tags: [
      { name: `client`, color: `#1d4ed8` },
      { name: `invoice`, color: `#15803d` },
      { name: `tax`, color: `#b91c1c` },
    ],
    notes: [
      {
        title: `Payout rule`,
        body:
          `Keep two months of costs in the studio account and pay the rest to the partners at the end of the quarter.`,
      },
      {
        title: `Software subscriptions`,
        body: `Review them in January. We still pay for two tools nobody opens.`,
      },
    ],
  },
  {
    name: `Saving for a flat`,
    members: [1, 1],
    tags: [
      { name: `savings`, color: `#15803d` },
      { name: `goal`, color: `#7e22ce` },
    ],
    notes: [
      {
        title: `The goal`,
        body: `A 20 % deposit by the end of next year. Every bonus goes here.`,
      },
      {
        title: `Mortgage questions`,
        body:
          `A fixed or variable rate, the fee for paying it back early, and what the notary costs.`,
      },
    ],
  },
  {
    name: `Year in Southeast Asia`,
    members: [1, 2],
    tags: [
      { name: `travel`, color: `#1d4ed8` },
      { name: `visa`, color: `#b91c1c` },
      { name: `budget`, color: `#c2410c` },
    ],
    notes: [
      {
        title: `Daily budget`,
        body:
          `45 $ a day each, flights not included. Vietnam is under that, Singapore is far over.`,
      },
      {
        title: `Visa runs`,
        body: `Vietnam e-visa for 90 days. Thailand on arrival. Check Cambodia's rules.`,
      },
    ],
  },
  {
    name: `Kids' savings`,
    members: [1, 2],
    tags: [
      { name: `goal`, color: `#15803d` },
      { name: `school`, color: `#1d4ed8` },
    ],
    notes: [
      {
        title: `Pocket money`,
        body: `5 € a week each. Half goes to their savings.`,
      },
      {
        title: `University fund`,
        body: `Monthly transfer on the 2nd. Don't touch it until they are 18.`,
      },
    ],
  },
]

/** A browser people sign in with: its user agent, from which the API names the device. */
export const DEVICES: readonly string[] = [
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0`,
  `Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1`,
  `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36`,
  `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36`,
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0`,
  `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15`,
  `Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0`,
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36`,
  `Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1`,
  `Mozilla/5.0 (Linux; Android 14; SM-S921B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36`,
]

/** The video person's two browsers: Firefox on Windows and Safari on an iPhone. */
export const VIDEO_PERSON_DEVICES = [0, 1] as const

/** The newsletter's sent issues, newest first: the issue's id, its subject, days since it went. */
export const SENT_ISSUES: readonly { issue: string; subject: string; daysAgo: number }[] = [
  { issue: `search-first-time`, subject: `Search that finds it the first time`, daysAgo: 5 },
  {
    issue: `hand-a-group-over`,
    subject: `Hand a group over without losing a thing`,
    daysAgo: 34,
  },
  { issue: `tags-and-colours`, subject: `Tags, colours and a calmer list`, daysAgo: 63 },
]

/** What people rename their first group, "Personal", to. */
export const FIRST_GROUP_NAMES = [
  `Me`,
  `My money`,
  `Personal finances`,
  `Savings`,
  `Travel fund`,
  `Freelance`,
  `Side income`,
  `Emergency fund`,
  `Holiday fund`,
  `Moving abroad`,
  `Cash`,
  `Monthly budget`,
] as const

/** Small households a few recent sign-ups start together: two or three people, one note. */
export const SMALL_THEMES: readonly Theme[] = [
  {
    name: `Our flat`,
    members: [1, 2],
    tags: [{ name: `bills`, color: `#c2410c` }],
    notes: [{
      title: `Utilities split`,
      body: `Electricity, water and internet, split three ways on the 1st.`,
    }],
  },
  {
    name: `Trip to Japan`,
    members: [1, 2],
    tags: [{ name: `booking`, color: `#1d4ed8` }],
    notes: [{ title: `Yen cash`, body: `Take 50,000 yen. Most small places take no cards.` }],
  },
  {
    name: `Holiday in Bali`,
    members: [1, 2],
    tags: [{ name: `booking`, color: `#1d4ed8` }],
    notes: [{ title: `Villa deposit`, body: `30 % now, the rest on arrival, in cash.` }],
  },
  {
    name: `Couple budget`,
    members: [1, 1],
    tags: [{ name: `savings`, color: `#15803d` }],
    notes: [{ title: `Fun money`, body: `150 € each a month, no questions asked.` }],
  },
  {
    name: `New baby`,
    members: [1, 1],
    tags: [{ name: `baby`, color: `#7e22ce` }],
    notes: [{ title: `Before May`, body: `Pram, cot, car seat. Ask the cousins first.` }],
  },
  {
    name: `Student in Porto`,
    members: [1, 2],
    tags: [{ name: `rent`, color: `#1d4ed8` }],
    notes: [{ title: `Monthly allowance`, body: `600 € from Mum on the 1st. Rent is 380 €.` }],
  },
  {
    name: `Car fund`,
    members: [1, 1],
    tags: [{ name: `goal`, color: `#15803d` }],
    notes: [{ title: `Target`, body: `9,000 € for a used hybrid by spring.` }],
  },
  {
    name: `Freelance taxes`,
    members: [1, 1],
    tags: [{ name: `tax`, color: `#b91c1c` }],
    notes: [{
      title: `Quarterly payment`,
      body: `Due on the 20th. Pay it from the savings, not the everyday account.`,
    }],
  },
  {
    name: `Christmas presents`,
    members: [1, 2],
    tags: [{ name: `gifts`, color: `#7e22ce` }],
    notes: [{ title: `Limit`, body: `40 € each for the adults, more for the kids.` }],
  },
  {
    name: `House repairs`,
    members: [1, 2],
    tags: [{ name: `repairs`, color: `#4b5563` }],
    notes: [{
      title: `Roof quotes`,
      body: `Three quotes so far. The middle one includes the gutters.`,
    }],
  },
  {
    name: `Grandma's visit`,
    members: [1, 2],
    tags: [{ name: `travel`, color: `#1d4ed8` }],
    notes: [{
      title: `Her flights`,
      body: `We pay for the flights. She insists on paying for dinners.`,
    }],
  },
  {
    name: `Dog costs`,
    members: [1, 1],
    tags: [{ name: `pet`, color: `#c2410c` }],
    notes: [{ title: `Vet`, body: `Vaccines due in June. Insurance renews in August.` }],
  },
  {
    name: `Gym and health`,
    members: [1, 1],
    tags: [{ name: `health`, color: `#b91c1c` }],
    notes: [{
      title: `Dentist`,
      body: `The cleaning in Da Nang costs 400,000 dong, a fraction of the price at home.`,
    }],
  },
  {
    name: `Side income`,
    members: [1, 1],
    tags: [{ name: `invoice`, color: `#15803d` }],
    notes: [{ title: `Tutoring`, body: `Three students a week. They pay cash in dong.` }],
  },
  {
    name: `Shared car`,
    members: [1, 2],
    tags: [{ name: `car`, color: `#4b5563` }],
    notes: [{
      title: `Who drives pays`,
      body: `Fuel goes to whoever drives. Insurance and service are split.`,
    }],
  },
  {
    name: `Moving in together`,
    members: [1, 1],
    tags: [{ name: `move`, color: `#7e22ce` }],
    notes: [{
      title: `One account or two?`,
      body: `Joint account for rent and food. Everything else stays our own.`,
    }],
  },
]

export const PERSONAL_NOTES: readonly ThemeNote[] = [
  { title: `Groceries`, body: `Oat milk, lemons, rice, coffee beans, dish soap.` },
  { title: `Books to read`, body: `"Piranesi", "The Dispossessed", "Educated".` },
  { title: `Gift ideas`, body: `Mum: a good scarf. Leo: the Lego set he keeps looking at.` },
  {
    title: `Subscriptions`,
    body: `Streaming, cloud storage, the language app. Cancel the one I forgot.`,
  },
  { title: `Running plan`, body: `3 runs a week: one long, one easy, one with hills.` },
  {
    title: `Recipe: dal`,
    body: `Red lentils, onion, garlic, ginger, cumin, a tin of tomatoes. 25 minutes.`,
  },
  { title: `Call the dentist`, body: `Ask about the cleaning and the cracked filling, top left.` },
  { title: `Holiday packing`, body: `Charger, adapter, swim things, the good sunglasses.` },
  { title: `Bank fees`, body: `The old bank charges 4 € a month. Move everything and close it.` },
  {
    title: `Ideas for the weekend`,
    body: `Flea market Saturday morning, the new exhibition on Sunday.`,
  },
  { title: `Car service`, body: `Due in 1,000 km. Ask them to look at the left rear tyre.` },
  { title: `Exchange tip`, body: `Send euros to dong through the app, not the airport booth.` },
  {
    title: `Insurance renewals`,
    body: `Health insurance in March, the flat's insurance in September.`,
  },
  { title: `Budget for the month`, body: `Rent first, then savings, then everything else.` },
  { title: `Plants`, body: `Water the fern twice a week. The cactus is fine on its own.` },
  { title: `Films to watch`, body: `"Perfect Days", "Past Lives", the new Miyazaki.` },
  { title: `Learning Spanish`, body: `Ten minutes a day. This week: the past tense, again.` },
  { title: `Things to fix at home`, body: `Dripping tap, the wobbly chair, the hallway light.` },
  { title: `Birthday list`, body: `Freya on the 3rd, Matteo on the 19th, Dad on the 28th.` },
  { title: `Work ideas`, body: `A checklist for new hires; a shorter weekly report.` },
  { title: `Bike route`, body: `Along the canal to the bridge, back through the park: 18 km.` },
  {
    title: `Tax documents`,
    body: `Keep the payslips, rent receipts and donation receipts in one folder.`,
  },
  { title: `Moving checklist`, body: `Change the address with the bank, the doctor and the post.` },
  {
    title: `Questions for the landlord`,
    body: `Heating schedule, bike storage, when the deposit comes back.`,
  },
]
