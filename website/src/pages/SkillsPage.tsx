import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { skillLevels } from '@/data/skills'
import { FadeContent } from '@/components/react-bits/FadeContent'
import { PageLayout } from '@/components/layout/PageLayout'
import { PageMeta } from '@/components/seo/PageMeta'
import { ShimmerButton } from '@/components/ui/ShimmerButton'
import { siteConfig } from '@/config/site'

export function SkillsPage() {
  return (
    <PageLayout>
      <PageMeta
        title="Watch your AI learn — the embodied AI skill ladder"
        description="Watch an AI character learn physical skills step by step: from holding still and balancing, to walking, turning, climbing stairs, and reaching goals. AI that learns skills in a real physics simulation. AI that learns to walk."
        path="/skills"
        keywords="AI that learns to walk, AI that learns skills, watch an AI learn, skill ladder AI, AI physical evolution, AI learning progression, AI balance skills, AI walking skills, AI motor skills, embodied AI skills, AI obstacle navigation, AI stair climbing, AI reaching goals, AI body control, AI movement learning, progressive AI learning, AI skill levels, AI physical milestones, AI standing balance, AI turning skills, AI negotiation obstacles, humanoid AI skills, AI motor programs, AI reusable movements, AI skill persistence, AI skill export, how do AI agents learn skills, can AI learn to walk, AI task benchmark, AI character you can watch learn, AI physical learning, AI body learning, AI movement mastery, AI coordination skills, AI balance training, AI locomotion skills, AI dexterity skills, AI spatial awareness, AI terrain navigation, AI physics skills, real physics AI learning, browser AI skills, AI skill demonstration, AI progress tracking, AI learning visualization, AI evolution stages, AI capability ladder, AI skill acquisition, AI motor learning, AI physical intelligence"
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'SYNTHIA AI Skill Ladder',
          description: 'A 10-level progression of physical skills an AI learns in a browser-based physics simulation',
          numberOfItems: skillLevels.length,
          itemListElement: skillLevels.map((lvl, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            name: lvl.name,
            description: lvl.description,
          })),
        }}
      />
      <div className="section-padding mx-auto max-w-4xl pt-28">
        <FadeContent>
          <p className="mb-4 text-xs uppercase tracking-[0.2em] text-teal">
            Physical Evolution
          </p>
          <h1 className="font-serif text-4xl leading-tight text-ink md:text-5xl">
            Watch your AI master physical skills step by step
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-ink-muted">
            It starts out barely able to balance. Step by step, level by level, it learns: standing, walking, turning, negotiating obstacles, climbing stairs, and reaching goals. You watch a mind learn to use its body in real time.
          </p>
        </FadeContent>

        <div className="relative my-16">
          <div
            aria-hidden
            className="absolute left-4 top-0 hidden h-full w-px bg-gradient-to-b from-teal via-amber to-transparent md:block"
          />

          <div className="space-y-4">
            {skillLevels.map((lvl, index) => (
              <FadeContent key={lvl.id} delay={index * 0.05}>
                <motion.div
                  whileHover={{ scale: 1.01 }}
                  className="relative rounded-2xl border border-ink/10 bg-surface-elevated p-6 shadow-sm md:pl-14"
                >
                  <span className="absolute left-6 top-6 hidden h-3 w-3 rounded-full bg-teal md:block" />
                  <div className="flex flex-wrap items-baseline gap-3">
                    <span className="font-mono text-sm text-amber font-semibold">
                      Level {lvl.id < 10 ? `0${lvl.id}` : lvl.id}
                    </span>
                    <h2 className="font-serif text-xl text-ink">{lvl.name}</h2>
                  </div>
                  <p className="mt-2 text-ink">{lvl.description}</p>
                  <p className="mt-2 text-sm text-ink-muted">Success: {lvl.criteria}</p>
                </motion.div>
              </FadeContent>
            ))}
          </div>
        </div>

        <FadeContent>
          <ShimmerButton href={siteConfig.appUrl}>Try SYNTHIA. It's Free</ShimmerButton>
        </FadeContent>

        <div className="mt-12">
          <Link
            to="/how-it-works"
            className="text-sm text-teal underline-offset-4 hover:underline"
          >
            ← Back to architecture
          </Link>
        </div>
      </div>
    </PageLayout>
  )
}
