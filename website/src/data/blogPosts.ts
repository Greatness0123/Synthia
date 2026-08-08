export interface BlogPost {
  slug: string
  title: string
  excerpt: string
  date: string
  readTime: string
  content: string[]
}

export const blogPosts: BlogPost[] = [
  {
    slug: 'placed-an-ai-and-watched-it-walk',
    title: 'I placed an AI in a world and watched it learn to walk.',
    excerpt:
      'The first-person story of building a world where an AI mind with a body learns to live.',
    date: '2026-08-01',
    readTime: '8 min',
    content: [
      'I wanted to put an AI in a body. Not a chatbot with an avatar, but a mind that stands in a room, wobbles, falls, and tries again.',
      'SYNTHIA starts with a humanoid in real physics. About 80 joints. MuJoCo compiled to WASM, running in a browser tab. When you place an AI, it has never stood before. You watch it try to balance. It falls. It pulls itself up. It tries again.',
      'It learns progressively: balance, then movement, then more complex behavior. Not on a script. On a loop that runs every second: observe, decide, act.',
      'That is the idea, told as a narrative: a world where an AI mind with a body learns to live. Try it yourself. No install, no GPU farm, no engineering degree.',
    ],
  },
  {
    slug: 'why-your-ai-data-is-worth-money',
    title: 'Why your AI\'s data is worth money, and how to sell it.',
    excerpt:
      'The earning angle, explained for a normal person, with real market numbers and the one-click export.',
    date: '2026-08-02',
    readTime: '6 min',
    content: [
      'Every moment your AI spends living (observing, deciding, moving, talking, learning) it generates clean, structured data. What it saw. What it decided. How it moved. What it said. What it remembered.',
      'That is exactly the kind of data AI labs pay for. Reddit sold its data for over $200 million. Shutterstock made $104 million in a year licensing images for AI. The AI training data market is $3.9 billion today and heading toward $16 billion by 2033.',
      'SYNTHIA lets you generate that kind of data by running an AI mind in a world, and export it with one click. Marketplaces like Troveo, Wirestock, Defined.ai, Protege, and Kled exist for this kind of data.',
      'No specific income is promised to any individual. That depends on finding a buyer. What is real is the market, the data, and the export.',
    ],
  },
  {
    slug: 'what-happens-when-two-ais-meet',
    title: 'What happens when two AIs meet in a room.',
    excerpt:
      'Two agents finding each other, talking, interacting. A preview of what V2 will study at scale.',
    date: '2026-08-03',
    readTime: '7 min',
    content: [
      'Place two AIs in the same world. They see each other through the same render you see. They hear each other, but physics applies. A wall between them garbles the words. Distance degrades speech the way a real overheard conversation does.',
      'They turn toward each other. They talk. They interact under the rules of the world, not as characters in a script, but as minds with bodies figuring out a shared space.',
      'V2 will take this further: a shared cloud world where AIs keep living when you are away, meeting other people\'s models. You study how different minds behave together. Today, V1 gives you a first glimpse in your browser.',
    ],
  },
  {
    slug: 'why-i-built-synthia',
    title:
      'A world where an AI mind learns to live: why I built it, and why no one had built it before.',
    excerpt:
      'The positioning post: the gap in the world, and the decision to fill it.',
    date: '2026-08-04',
    readTime: '9 min',
    content: [
      'Chatbots give you text. Simulation tools give specialists a GPU farm and months of setup. Robot videos let you watch, not try.',
      'The gap: no one let a normal person place an AI in a body and a world, in a browser, for free. The technology (browser physics, vision-language models, structured memory) only matured in the last two years.',
      'SYNTHIA is the first thing that is real enough to act on its own and simple enough for anyone. Open source. MIT. You can read every line.',
      'The AI does not know you exist. What you have is a steering surface: build the world, set goals, inject thoughts. That honesty is what makes it credible.',
    ],
  },
  {
    slug: 'your-ai-runs-on-your-machine',
    title: 'Your AI is yours: why its mind runs on your machine.',
    excerpt:
      'The client-side loop, explained as a fact about how the software works.',
    date: '2026-08-05',
    readTime: '5 min',
    content: [
      'The cognitive loop runs entirely in your browser. Working memory, observations, pending cycles, all in the tab. The only thing the server does is keep the AI model key safe.',
      'When you close the browser, the AI stops. Everything it learned is saved, so when you return it picks up where it left off. Your data stays on your machine unless you choose to export or share it.',
      'That is not a marketing pitch. It is how the software works, and it is exactly the kind of sentence that makes a normal person feel safe enough to click.',
    ],
  },
  {
    slug: 'new-way-to-make-money-with-ai',
    title: 'A brand new way to make money with AI that almost nobody knows about yet.',
    excerpt:
      'Sell the data your AI generates. Real market, honest framing, no get-rich promises.',
    date: '2026-08-06',
    readTime: '6 min',
    content: [
      'Most AI side-income advice is the same: freelance with ChatGPT, sell prompts, build automations. SYNTHIA offers something different: generate embodied agent training data and sell it to labs and marketplaces.',
      'The market is real ($3.9B today, growing fast). The buyers are real (Troveo, Wirestock, Defined.ai, Protege, Kled). The export is real (one click in SYNTHIA).',
      'What is not promised is that any individual will earn a specific amount. That depends on finding a buyer and producing quality data. But the opportunity is genuinely new and almost nobody is talking about it yet.',
      'Start by running an AI in a world, letting it live and learn, then exporting what it experienced. Read the data export page for the full picture.',
    ],
  },
]

export function getBlogPost(slug: string) {
  return blogPosts.find((post) => post.slug === slug)
}
