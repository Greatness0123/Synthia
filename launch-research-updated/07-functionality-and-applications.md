# 07 — What SYNTHIA Can Do (And What That Means For You)

> **How to read this file.** Every section below opens with one sentence a non-technical person can understand — the thing SYNTHIA does that makes you say "wow" or "I could use that." Under that, you'll find a short **How it actually works** note for the curious — the real machinery, named by source file, so an engineer or researcher can verify nothing here is invented. The benefit always comes first. The engine is always second. That is the whole principle.

---

## The six things that matter most

Before the full list, here are the six capabilities that define SYNTHIA — the ones a stranger should grasp in their first minute on the site, in plain language.

1. **You give it a body.** You create an AI character and it stands up inside a real 3D world with real physics. It can fall over, get back up, and learn to walk. It is not a chatbot in a box. It is a body that moves.

2. **It remembers what happened.** It has a memory shaped like ours — short-term, medium-term, and long-term. It remembers what it tried, what worked, what hurt, who it met. When you come back tomorrow, it picks up where it left off.

3. **You can watch it grow.** It starts out barely able to stand. Step by step, rung by rung, it learns — balance, walking, turning, avoiding obstacles, climbing stairs, grabbing objects, navigating to goals. You watch a mind learn to use its body in real time.

4. **It talks and listens.** It has a voice. It can speak out loud, with a distinct voice per character. You can talk to it out loud and it hears you and answers. In a room full of AI characters, each one sounds different.

5. **It can meet other AIs.** Put two or more in the same world and they see each other, hear each other, and talk to each other — but the rules of physics apply. If one is too far away, or a wall is between them, the words break up, just like a real overheard conversation across a room.

6. **You can export everything it learns as data — and that data is worth money.** Every thought it had, every move it made, every memory it formed, every conversation it held — you can download all of it with one click. That data is exactly the kind AI labs pay for. You turn play into income.

Everything else in this file is a deeper look at these six, plus the supporting capabilities that make them real. Read the first line of each entry. That is all most people need. Read the rest only if you want to know what is under the hood.

---

## 1. It thinks for itself, every second, inside your browser

**What that means for you:** Your AI character is not waiting for you to type a message. It is alive the whole time you are watching. It senses the world, decides what to do, and acts — on a constant loop — all by itself. You are not driving it. You are watching a mind run.

**How it actually works:** Each agent runs a `setInterval`-driven cognitive loop entirely in the browser (`src/world/agent/AgentLoop.ts`). On every cycle the loop captures the world state, builds a perception payload, ships it to the inference provider via `InferenceClient`, parses the returned joint actions (converting degrees to radians, clamping to ±π), and writes the outcome into memory. Heartbeat tracking and a 4-second pending-cycle finalization timeout keep it from stalling. The entire loop state — working memory, current observation, pending cycle — lives in the browser tab and never crosses the wire. No server compute required for the loop itself.

---

## 2. It has a real body that obeys real physics

**What that means for you:** When your AI tries to take a step, it has to actually balance. It can fall. It can trip over a box. It can push a ball and the ball rolls. The world is not a movie — it is a real physical place, and your character lives inside those rules. That is what makes it feel alive instead of scripted.

**How it actually works:** The body is an ~80-joint humanoid in a MuJoCo physics simulation compiled to WASM and running in the browser. The `MotorController.ts` maps joint commands to MuJoCo actuators via an `actuatorMap`, applies PD control with base gains (kp/kv) and a `globalStiffnessScale`, and uses a `simulationStepCount` ramp that eases the agent into full actuation on spawn so it does not tear itself apart. A `gaitActive` flag toggles locomotion behavior. Mis-tuned gains produce a humanoid that folds even with correct commands — the physics is real, not faked.

---

## 3. It cannot accidentally break its own body

**What that means for you:** You never have to worry about your AI commanding its arm to rotate 400 degrees and snapping in half. The system quietly protects every joint from impossible movements, so the character can experiment wildly without destroying itself. It can fail — but it fails safely, the way a toddler learning to walk falls down rather than dislocating.

**How it actually works:** The system prompt (`InferenceClient.ts` JOINT CONTROL CONTRACT) instructs the model to emit joint commands in degrees and to distinguish scalar values for 1-DOF joints from 3D arrays for 3-DOF joints (hips, spine). The client-side parser converts degrees to radians and clamps every command to ±π before the value reaches the MuJoCo actuator. This guardrail exists because an unconstrained LLM will request physically impossible angles. The contract is the difference between an agent that can stand and one that collapses on step one.

---

## 4. It can feel its own body

**What that means for you:** Your AI knows where its limbs are without looking. It knows whether it is standing or fallen. It knows how fast it is moving. This is the same sense humans call proprioception — the feeling that lets you touch your nose with your eyes closed. Your character has that, and it is how it learns to coordinate itself.

**How it actually works:** Each cycle, the agent's body state is compiled into a proprioception observation (`src/world/engine/ObservationBuilder.ts`) built around 14 key joints (`VLM_KEY_JOINTS`). The `Float32Array` includes root height, projected gravity, local linear and angular velocity, and joint angles plus joint velocities. A `buildVLMProprioception` method produces a rolling history of three poses (converted to degrees) so the model receives a short temporal window, not a single static frame.

---

## 5. It can feel what it touches

**What that means for you:** When your AI's foot touches the ground, it knows that is firm support. When its hand brushes a wall, it knows that is a light touch. It does not get a wall of numbers — it gets something closer to a sentence: "your right foot has firm ground contact." That is how a mind that lives in words can make sense of a body that lives in forces.

**How it actually works:** Rather than handing the model a raw contact-force array, the payload builder translates per-bone contact and impulse data into labeled natural-language descriptions (`payloadBuilder.ts`, `buildTactileContext`): "light touch," "moderate force," "firm contact," "strong ground support." The LLM receives a sentence about what its foot or hand is touching, attached to a named bone, instead of numbers it would have to interpret. This translation layer is the bridge between a physics engine's contact output and a language model's input space.

---

## 6. It can see — it sees what you see

**What that means for you:** There are no hidden cameras or secret feeds. What the AI perceives is the same lit 3D scene you are looking at on your screen. It looks out at the world through its own eyes. If you put a red box in front of it, it sees a red box. If you move the box, it sees the box move. You and your character share the same world, visually.

**How it actually works:** The agent's "eyes" are an offscreen render at 448×448 pixels, captured from the same WebGL context that draws the visible scene — so the agent literally sees what the user sees. That frame goes to a vision-language model — Qwen2.5-VL-7B-Instruct, run in 4-bit quantization via bitsandbytes on a Kaggle T4×2 notebook (`kaggle_server.py`, FastAPI) — which returns a visual description feeding the perception summary. The dual-use render context (display + perception) is what makes "the agent sees what you see" literally true. *[Setup note]* the vision pipeline depends on a connected inference backend (Kaggle notebook or equivalent VLM provider); the architecture is provider-agnostic and a different endpoint can be swapped in.

---

## 7. It gets a paragraph, not a data dump, describing its world each moment

**What that means for you:** Every single moment, your AI receives a plain-language summary of its situation: which way it is facing, whether it is standing or on the ground, who is nearby, what objects are around it, what it is touching, and what it should try to do next. It reads that paragraph like a person reads a situation, and then it acts. This is why it behaves like someone thinking, not like a robot executing code.

**How it actually works:** The perception summary (`payloadBuilder.ts`, `buildPerceptionSummary`) is a natural-language digest the LLM receives each cycle. It includes head orientation translated to a cardinal direction ("facing north"), hip height translated to a posture classification (STANDING / FALLEN / PRONE), overheard speech from other agents (with distance and occlusion degradation), nearby objects within a 5-meter radius, current contact forces, and locomotion instructions. This is the layer where raw multimodal sensor data becomes a coherent paragraph the model can act on — and it is the single most important design surface for controlling what the agent "knows."

---

## 8. It can hear — and it hears the scene around it

**What that means for you:** If something in the world makes a sound — a collision, another character speaking, an object it interacts with — your AI can hear it and factor that sound into what it does next. It is not deaf. It lives in a world with sound, the way you do.

**How it actually works:** The Kaggle inference backend loads LAION-CLAP alongside Qwen2.5-VL, so audio captured from the browser (`AudioEngine.ts` buffer capture) can be classified and described. An agent can "hear" the scene — a collision sound, a piano note, another agent's speech — and that auditory information enters its perception summary. Together with vision, proprioception, and touch, this makes the agent's perception genuinely multimodal, which is rare in browser-side agent demos.

---

## 9. It remembers — and it remembers the way a person does

**What that means for you:** Your AI does not just keep a chat log. It has layers of memory. It holds onto the last few things that happened (working memory), remembers the important episodes from recent sessions (episodic memory), and keeps a deep long-term store of everything that mattered (long-term memory). It decides what is worth remembering. The system quietly forgets what is not. When you come back, it remembers you and what it was doing. It grows a personal history.

**How it actually works:** Memories persist in Supabase with pgvector embeddings and are organized into three tiers (`src/world/agent/memoryManager.ts`, `supabase_schema.sql`): Working Memory (tier 1, short-term, highest recall priority, pruned after the 2 most recent sessions), Episodic Memory (tier 2, medium-term, included in vector search, pruned after the 20 most recent sessions), and Long-term / Archival (tier 3, lowest priority, pruned first). A `match_memories` RPC performs vector similarity search to retrieve relevant memories. The agent decides what to write; the system decides what to forget — shaped like a nervous system, not a chat log. *[Setup note]* the embeddings driving vector search currently use a deterministic hash placeholder (`embeddingEngine.ts`); the storage and pruning machinery is real and ready, and wiring in a real client-side embedding model (the presumed original intent, with `@xenova/transformers` still listed in `package.json`) is a documented next step — the architecture is built for it.

---

## 10. It learns new skills on a ladder, and you can watch it climb

**What that means for you:** Your AI starts out barely able to stay standing. Then, one rung at a time, it gets better. First it balances. Then it takes a single step. Then it walks in a line. Then it turns. Then it avoids obstacles. Then it recovers from stumbles. Then it climbs stairs. Then it grabs and moves objects. Then it navigates to a goal. Then it pursues a dynamic objective on its own. Ten rungs, from helpless to capable, and you watch every one happen.

**How it actually works:** The agent's development is a curriculum of 10 rungs (`src/constants/progressionLadder.ts`), each with a name, description, and pass criteria: (0) Static Balance — balance > 10s; (1) Single Step — 1 successful step; (2) Linear Walk — walk > 5m; (3) Directional Turning — 90° turn; (4) Obstacle Avoidance — 0 collisions; (5) Dynamic Recovery — 0 falls; (6) Stair Ascent — 3 steps up; (7) Object Manipulation — relocate object; (8) Complex Navigation — reach goal; (9) Full Autonomy — dynamic objective. Skills and motor programs the agent writes are persisted in Supabase, so progression survives across sessions.

---

## 11. When it learns a move, it keeps it forever

**What that means for you:** Once your AI figures out how to take a step, it does not have to figure it out again. It saves that skill as a named move — "step forward" — and can call on it later the way you call on riding a bike. This is why it gets better over time instead of starting from zero every session. It builds a personal library of things its body can do.

**How it actually works:** The agent can emit a `new_motor_program` in its output schema — a named, reusable sequence of joint actions (`AgentLoop.ts`, `motor_programs` table in `supabase_schema.sql`). These are stored and can be referenced in later cycles via `program_sequence`, so an agent that learns a "step forward" program can invoke it by name instead of re-deriving the joint trajectory each cycle. This is the mechanism that makes the skill ladder meaningful — skills persist as reusable motor programs rather than being relearned every session. It is the substrate for any "the agent gets better over time" claim.

---

## 12. You can put more than one in the same world

**What that means for you:** You are not limited to one character. You can fill a world with several AI characters at once. They each have their own body, their own mind, their own memory. They share the same floor, the same objects, the same physics. This is where SYNTHIA starts to become a place rather than a pet.

**How it actually works:** Multiple agents share a single MuJoCo world. Each is instantiated as a prefixed MJCF subtree (e.g., `agent_0_`, `agent_1_`) so their bodies, joints, and actuators coexist without name collisions, with a documented 1.75-meter spacing at spawn (`src/world/engine/`). The shared world is what makes agent-to-agent contact, communication, and shared object interaction possible — the foundation for any multi-agent scenario.

---

## 13. They can talk to each other — but physics gets in the way, like real life

**What that means for you:** When two AI characters are in the same world, they can speak to each other. But they cannot magically beam thoughts across the room. If one is too far away, the words break up. If a wall is between them, the message gets garbled. They hear fragments, the way you hear a muffled conversation through a wall. This is what makes a multi-AI world feel like a real place with real people in it, not a chat room.

**How it actually works:** Agents in a shared scene can exchange text, but the channel is constrained by physics (Phase 6.1 documentation + `payloadBuilder.ts` overheard-speech logic): a 15-meter maximum range, occlusion raycasting that applies a +0.4 degradation penalty when a wall blocks the line between speakers, and word-level replacement of out-of-range or occluded words with `[inaudible]`. A distant or occluded agent's speech arrives to the listener as a fragmented sentence, exactly as a real overheard conversation would. This is physical constraints as a design language for multi-agent systems.

---

## 14. It has a voice — and every character sounds different

**What that means for you:** Your AI does not just think in silence. It speaks out loud, in a voice. And if you have several characters in one world, each one has its own voice, so you can tell them apart by ear. When one is talking, the others quiet down, the way a polite room works. You can listen to a conversation between AIs happen.

**How it actually works:** Speech output uses the Web Speech API, with a distinct voice assigned per agent so a multi-agent scene is audibly distinguishable (`src/world/engine/AudioEngine.ts`). Background agents are ducked (their volume reduced) so the agent currently in focus remains intelligible. The agent's speech is emitted via `<speak>` tags in its output schema, parsed by the loop and routed to the audio engine. This is the difference between a multi-agent scene that is listenable and one that is a wall of overlapping voices.

---

## 15. You can talk to it out loud

**What that means for you:** You do not have to type. You can just speak to your AI character, out loud, through your microphone, and it hears you and responds — in voice and in action. It is a spoken conversation with a being that has a body, happening in your browser.

**How it actually works:** The browser's SpeechRecognition API transcribes the user's spoken input (Phase 6 documentation), which is routed into the agent's cognitive context — letting a user talk to an agent out loud and have the agent respond in speech and action. This pairs with the TTS path to form a full voice interaction loop — a hands-free interaction mode for demonstrations and accessibility.

---

## 16. You can steer it with a thought, mid-action

**What that means for you:** While your AI is doing its own thing, you can drop a thought into its mind — "think about your left foot," "try to reach the red box," "say hello to the other one" — and it folds that thought into what it does next, without you reprogramming anything. It is a gentle steering wheel for a living mind, not a remote control.

**How it actually works:** A user can inject a thought — a text string — directly into an agent's cognitive stream mid-loop (`AgentLoop.ts` thought injection path, `InferenceClient.ts`). The injected thought is folded into the next cycle's prompt context, changing what the agent decides to do next without altering its memory or its directive. This is a real-time steering mechanism distinct from the directive switch — a live control surface for influencing an agent without reprogramming it.

---

## 17. You can set it free or give it a goal

**What that means for you:** You get two modes. In one, your AI just does whatever it wants — it explores, it wanders, it plays, it figures things out on its own. In the other, you give it a specific goal and it works toward it. Same character, same world, two entirely different ways to spend time with it. Sandbox or challenge, your choice.

**How it actually works:** The agent operates under one of two directive modes (`InferenceClient.ts` system prompt directives, `AgentLoop.ts`). In **free_will** mode the prompt positions it as "a curious, autonomous agent" and every response is required to include motor actions. In **training** mode it is given explicit goals and evaluated against them. The directive is injected into the system prompt and shapes the agent's entire behavioral posture for the session — a clean toggle between open-ended exploration and goal-directed evaluation.

---

## 18. You can build the world around it — objects, terrain, obstacles

**What that means for you:** You are handed a God Mode control over the scene. You can drop in boxes, balls, slopes, stairs, ramps, a piano, a ball pit, a swing. You can place them wherever you want. You can build an obstacle course, a playground, a task. Your AI has to live in whatever world you build for it. You are the set designer; it is the actor.

**How it actually works:** The scene is populated via spawnable object presets in three categories (`src/constants/objectPresets.ts`): Primitives (cube, sphere, cylinder, wedge — each with tuned mass, friction, restitution), Terrain (slope, step, ramp — mass 0, high friction), and Interactive (piano mass 50; ball pit mass 10; swing mass 5). Interactive objects can have outcome-detection components — the piano has a reward/outcome path (`PianoReward.tsx`) that registers when the agent successfully interacts. The God Mode UI lets the user spawn, place, and select objects and agents.

---

## 19. You can measure whether it succeeded

**What that means for you:** If you give your AI a task — "play the piano," "move the box over there," "get to the red goal" — the world can tell you whether it actually did it. You get a clean yes or no, not a vibe. That is what turns playing with SYNTHIA into something you can show off, grade, or turn into a benchmark someone else can run.

**How it actually works:** Interactive objects can have outcome-detection components (`PianoReward.tsx` is the example in the repo). A researcher or user can build a task ("reach and play the piano"), spawn the objects, run the agent, and measure success via the outcome component — then export the dataset. This closes the loop from scene setup → agent run → outcome measurement → data export.

---

## 20. You can export everything it learned as a dataset — with one click

**What that means for you:** This is the money capability. Every moment your AI spends thinking, sensing, moving, talking, and remembering, it is generating clean, structured records. And you can download all of it — every observation, every action, every memory, every outcome — as a tidy dataset with one click. That dataset is exactly the kind of thing AI labs and data marketplaces pay real money for. You are not just playing. You are producing a sellable product, as a side effect of playing. **This is a brand new way to earn money that almost nobody knows about yet.**

**How it actually works:** Each agent's session data — observations, actions, memory writes, outcomes — can be exported as CSV or JSONL, with a ZIP option that uses `zipPerAgent` folder isolation so a multi-agent session exports as a clean per-agent directory structure (Phase 5 documentation, `src/constants/strings.ts`, `jszip` dependency). This is a research-grade data-export path, not just a log dump. The exported datasets are the raw material for offline analysis, replay, training-data generation, sharing experimental results — or selling to the data marketplaces named in `06-seo-plan.md` and `04-creators-and-reddit.md` (Troveo, Wirestock, Defined.ai, Protege, Kled). The AI training data market is $3.9B in 2026 and projected to reach $16.3B by 2033 at 22.6% CAGR. Reddit sold its data for $203M+. Shutterstock made $104M in a year from AI licensing. SYNTHIA is, as far as we know, the first tool that lets a normal person with a browser generate this kind of embodied, multimodal, structured agent data and export it in a clean format — and that is the economic engine under the wow.

---

## The real applications — what people will actually do with this

The capabilities above are the ingredients. Here is what people will actually build with them — the applications that travel, because they are the ones a normal person can picture themselves doing.

### For the curious and the imaginative

**A pet that grows up.** You create a character, you give it a name and a personality, and you visit it every day. Over weeks, you watch it learn to walk, learn to talk, remember you, develop habits. It is a digital companion that actually changes because of the time you spent with it — not because a script told it to.

**A character you direct.** You build a world, you set a goal, you drop in obstacles, and you watch your AI try to solve it. You steer it with thoughts when it gets stuck. You film the best moments and share them. It is a tiny interactive movie where the actor is a real mind.

### For the side-hustle minded

**A data farm.** You run your AI through scenarios — walking, climbing, interacting with objects, talking to other AIs — and you export everything it generates. Each session is a clean dataset. You list those datasets on a marketplace. You earn. The more your AI learns, the richer the data. Play becomes a product.

**A demo that gets you hired.** If you are learning AI, robotics, or simulation, the dataset you export from a SYNTHIA session is a portfolio piece. It is real embodied-agent data, structured and reproducible, that you generated yourself. That is a differentiator in a field flooded with notebook tutorials.

### For the researcher and the builder

**A reproducible embodied-agent experiment.** You set up a scene, define a task, run an agent under a chosen directive, measure the outcome, and export the full dataset. Someone else can run the same scene and compare. The skill ladder gives you a shared benchmark structure. The export gives you shareable results. This is a research platform that fits in a browser tab.

**A multi-agent behavior study.** This is the bridge to V2. You put several AIs in one world, give them personalities and directives, and watch what emerges — who talks to whom, what they argue about, what cooperation and competition look like when the participants are minds with bodies constrained by physics. V2 takes this to the cloud and makes it persistent, so you can study how your model interacts with other people's models over days, not minutes. That is a category of research no one has been able to do before.

### For the content creator

**The clip that travels.** A video of an AI character learning to stand, falling, getting back up, and finally walking — with the real physics, the real stumbles — is inherently watchable. A clip of two AIs meeting and talking for the first time is inherently watchable. A clip of someone exporting their AI's entire mind as a sellable dataset is inherently watchable. SYNTHIA generates the kind of footage that makes people stop scrolling, because the thing on screen is genuinely new.

---

## What is real today, what is planned, and one honest setup note

Everything in entries 1–8 and 10–20 is real and working in the repository today — the cognitive loop, the body and physics, the joint protection, proprioception, touch, vision, hearing, the perception summary, the memory storage and pruning, the skill ladder, the motor programs, the PD control, multi-agent scenes, agent-to-agent speech with physics, TTS, STT, thought injection, directive modes, the object library with outcome detection, and the dataset export. These are not mockups. They are in the code.

**One honest setup note (entry 9):** The memory system's storage, tiering, and pruning are real and working. The part that ranks which memories are most relevant — the embedding model — is currently a deterministic placeholder, not a true semantic model. The architecture is fully built to accept a real embedding model, and wiring one in is a documented next step. We flag this openly because the right move with SYNTHIA is always to show the real thing and be honest about what is still being finished — that is what builds the trust that makes the wow land.

**What is planned, not built (V2):** A hosted, persistent, server-side world on cloud infrastructure where AIs keep living when you are away, meet other people's AIs, and form emergent societies you can study. User accounts, shared worlds, spectator mode, sleep systems, and recording. These exist as planning documents today. They are the destination, not the launch.

---

## The one-line summary

SYNTHIA lets you give an AI a body, a world, a memory, a voice, other AIs to meet, and skills to learn — and then export everything it experiences as data you can sell. It is the first place on the internet where a normal person can do that, in a browser, for free. The wow is the living character. The money is the dataset. Everything in this file is the machinery that makes both real.
