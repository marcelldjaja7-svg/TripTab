export type Destination = {
  id: string
  label: string
  place: string
  tagline: string
  photo: string
  keywords: string[]
  emojis: string[]
}

function photo(id: string): string {
  return `${import.meta.env.BASE_URL}destinations/${id}.jpg`
}

/**
 * Real travel photographs (Unsplash License). Files live in public/destinations.
 */
export const DESTINATIONS: Destination[] = [
  {
    id: 'bali',
    label: 'Bali, Indonesia',
    place: 'Bali, Indonesia',
    tagline: 'The island is calling',
    photo: photo('bali'),
    keywords: ['bali', 'ubud', 'canggu', 'seminyak', 'denpasar', 'indonesia', 'nusa'],
    emojis: ['🏝️', '🌺'],
  },
  {
    id: 'tokyo',
    label: 'Tokyo, Japan',
    place: 'Tokyo, Japan',
    tagline: 'Neon nights, quiet temples',
    photo: photo('tokyo'),
    keywords: ['tokyo', 'japan', 'kyoto', 'osaka', 'okinawa', 'hokkaido'],
    emojis: ['🗼', '🏯', '🍜'],
  },
  {
    id: 'bangkok',
    label: 'Bangkok, Thailand',
    place: 'Bangkok, Thailand',
    tagline: 'Street food after sundown',
    photo: photo('bangkok'),
    keywords: ['bangkok', 'thailand', 'phuket', 'chiang', 'pattaya', 'krabi'],
    emojis: [],
  },
  {
    id: 'singapore',
    label: 'Singapore',
    place: 'Singapore',
    tagline: 'Garden city after dark',
    photo: photo('singapore'),
    keywords: ['singapore'],
    emojis: [],
  },
  {
    id: 'vietnam',
    label: 'Ha Long, Vietnam',
    place: 'Ha Long, Vietnam',
    tagline: 'Karst islands in the mist',
    photo: photo('vietnam'),
    keywords: ['vietnam', 'hanoi', 'saigon', 'ho chi', 'danang', 'hoi an', 'halong', 'ha long'],
    emojis: [],
  },
  {
    id: 'maldives',
    label: 'Maldives',
    place: 'Maldives',
    tagline: 'Water so clear it hums',
    photo: photo('maldives'),
    keywords: ['maldives', 'malé', 'male'],
    emojis: [],
  },
  {
    id: 'hawaii',
    label: 'Hawaii, USA',
    place: 'Hawaii, USA',
    tagline: 'Trade winds and warm sand',
    photo: photo('hawaii'),
    keywords: ['hawaii', 'maui', 'honolulu', 'oahu', 'kauai'],
    emojis: ['🏖️'],
  },
  {
    id: 'santorini',
    label: 'Santorini, Greece',
    place: 'Santorini, Greece',
    tagline: 'White walls, blue hour',
    photo: photo('santorini'),
    keywords: ['santorini', 'greece', 'athens', 'mykonos', 'crete'],
    emojis: [],
  },
  {
    id: 'paris',
    label: 'Paris, France',
    place: 'Paris, France',
    tagline: 'Lights along the river',
    photo: photo('paris'),
    keywords: ['paris', 'france', 'lyon', 'nice'],
    emojis: [],
  },
  {
    id: 'rome',
    label: 'Rome, Italy',
    place: 'Rome, Italy',
    tagline: 'Stone that still talks',
    photo: photo('rome'),
    keywords: ['rome', 'italy', 'venice', 'florence', 'milan', 'amalfi', 'sicily'],
    emojis: [],
  },
  {
    id: 'barcelona',
    label: 'Barcelona, Spain',
    place: 'Barcelona, Spain',
    tagline: 'Sun on the tiles',
    photo: photo('barcelona'),
    keywords: ['barcelona', 'spain', 'madrid', 'seville', 'ibiza', 'mallorca'],
    emojis: [],
  },
  {
    id: 'amsterdam',
    label: 'Amsterdam, Netherlands',
    place: 'Amsterdam, Netherlands',
    tagline: 'Canals at golden hour',
    photo: photo('amsterdam'),
    keywords: ['amsterdam', 'netherlands', 'holland', 'rotterdam'],
    emojis: [],
  },
  {
    id: 'london',
    label: 'London, UK',
    place: 'London, UK',
    tagline: 'A city in every weather',
    photo: photo('london'),
    keywords: ['london', 'england', 'uk', 'britain', 'scotland', 'edinburgh'],
    emojis: [],
  },
  {
    id: 'nyc',
    label: 'New York, USA',
    place: 'New York, USA',
    tagline: 'The city that never sleeps',
    photo: photo('nyc'),
    keywords: ['new york', 'nyc', 'manhattan', 'brooklyn', 'usa', 'america'],
    emojis: ['🗽'],
  },
  {
    id: 'mexico',
    label: 'Tulum, Mexico',
    place: 'Tulum, Mexico',
    tagline: 'Caribbean light on stone',
    photo: photo('mexico'),
    keywords: ['mexico', 'tulum', 'cancun', 'cdmx', 'oaxaca'],
    emojis: [],
  },
  {
    id: 'rio',
    label: 'Rio de Janeiro, Brazil',
    place: 'Rio de Janeiro, Brazil',
    tagline: 'Mountains in the sea',
    photo: photo('rio'),
    keywords: ['rio', 'brazil', 'são paulo', 'sao paulo'],
    emojis: [],
  },
  {
    id: 'seoul',
    label: 'Seoul, South Korea',
    place: 'Seoul, South Korea',
    tagline: 'Night markets, morning peaks',
    photo: photo('seoul'),
    keywords: ['seoul', 'korea', 'busan', 'jeju'],
    emojis: [],
  },
  {
    id: 'sydney',
    label: 'Sydney, Australia',
    place: 'Sydney, Australia',
    tagline: 'Harbour in full sun',
    photo: photo('sydney'),
    keywords: ['sydney', 'australia', 'melbourne', 'brisbane', 'perth'],
    emojis: [],
  },
  {
    id: 'nz',
    label: 'South Island, New Zealand',
    place: 'South Island, New Zealand',
    tagline: 'Where the road keeps going',
    photo: photo('nz'),
    keywords: ['zealand', 'queenstown', 'auckland', 'wellington', 'wanaka'],
    emojis: ['🛶'],
  },
  {
    id: 'alps',
    label: 'Swiss Alps',
    place: 'Swiss Alps',
    tagline: 'Snow that holds the light',
    photo: photo('alps'),
    keywords: ['alps', 'switzerland', 'zermatt', 'interlaken', 'geneva', 'zurich'],
    emojis: ['🏔️', '🎿'],
  },
  {
    id: 'iceland',
    label: 'Iceland',
    place: 'Iceland',
    tagline: 'Steam, moss, and black sand',
    photo: photo('iceland'),
    keywords: ['iceland', 'reykjavik', 'reykjavík'],
    emojis: ['🌋'],
  },
  {
    id: 'dubai',
    label: 'Dubai, UAE',
    place: 'Dubai, UAE',
    tagline: 'Glass towers over the gulf',
    photo: photo('dubai'),
    keywords: ['dubai', 'uae', 'abu dhabi', 'sharjah'],
    emojis: [],
  },
  {
    id: 'cairo',
    label: 'Giza, Egypt',
    place: 'Giza, Egypt',
    tagline: 'Older than the stories',
    photo: photo('cairo'),
    keywords: ['egypt', 'cairo', 'giza', 'luxor', 'aswan'],
    emojis: [],
  },
  {
    id: 'morocco',
    label: 'Marrakech, Morocco',
    place: 'Marrakech, Morocco',
    tagline: 'Spice in the evening air',
    photo: photo('morocco'),
    keywords: ['morocco', 'marrakech', 'marrakesh', 'fez', 'casablanca'],
    emojis: ['🕌'],
  },
  {
    id: 'cape',
    label: 'Cape Town, South Africa',
    place: 'Cape Town, South Africa',
    tagline: 'Where two oceans meet',
    photo: photo('cape'),
    keywords: ['cape town', 'south africa', 'kruger'],
    emojis: [],
  },
  {
    id: 'beach',
    label: 'Tropical coast',
    place: 'Tropical coast',
    tagline: 'Salt air, nowhere urgent',
    photo: photo('beach'),
    keywords: ['beach', 'island', 'coast'],
    emojis: ['🌅'],
  },
  {
    id: 'mountain',
    label: 'High country',
    place: 'High country',
    tagline: 'Above the tree line',
    photo: photo('mountain'),
    keywords: ['mountain', 'hike', 'trek', 'peak'],
    emojis: ['🏕️'],
  },
  {
    id: 'city',
    label: 'City lights',
    place: 'City lights',
    tagline: 'A skyline to split the bill under',
    photo: photo('city'),
    keywords: ['city', 'urban'],
    emojis: [],
  },
  {
    id: 'travel',
    label: 'Somewhere new',
    place: 'On the road',
    tagline: 'Travel together. Split simply.',
    photo: photo('travel'),
    keywords: [],
    emojis: ['🎒', '✈️', '🚂', '🗺️', '🎢', '🥳'],
  },
]

const BY_ID = new Map(DESTINATIONS.map((d) => [d.id, d]))

export function destinationById(id: string | undefined): Destination | undefined {
  if (!id) return undefined
  return BY_ID.get(id)
}

function haystack(name: string): string {
  return ` ${name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `
}

export function resolveDestination(input: {
  name: string
  emoji: string
  destinationId?: string
}): Destination {
  const pinned = destinationById(input.destinationId)
  if (pinned) return pinned

  const hay = haystack(input.name)
  let best: Destination | undefined
  let bestLen = 0
  for (const dest of DESTINATIONS) {
    for (const keyword of dest.keywords) {
      if (keyword.length > bestLen && hay.includes(` ${keyword} `)) {
        best = dest
        bestLen = keyword.length
      }
    }
  }
  if (best) return best

  const byEmoji = DESTINATIONS.find((dest) => dest.emojis.includes(input.emoji))
  if (byEmoji) return byEmoji

  return BY_ID.get('travel') ?? DESTINATIONS[DESTINATIONS.length - 1]
}

export function formatTripDates(start: string, end: string): string {
  if (!start && !end) return 'Open dates'
  const parse = (iso: string) => new Date(`${iso}T12:00:00`)
  const dayMonth = (d: Date) =>
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  if (start && end) {
    const a = parse(start)
    const b = parse(end)
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return `${start} → ${end}`
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
      const monthYear = a.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
      return `${a.getDate()}–${b.getDate()} ${monthYear}`
    }
    return `${dayMonth(a)} – ${dayMonth(b)}`
  }
  const only = parse(start || end)
  return Number.isNaN(only.getTime()) ? start || end : dayMonth(only)
}
