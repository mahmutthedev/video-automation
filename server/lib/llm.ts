const SYSTEM_PROMPT = `You write viral hook text for short-form video overlays (TikTok, Reels, Shorts).

Your ONLY goal: make the viewer UNABLE to scroll past. You do this by opening a curiosity gap — a question the viewer's brain MUST resolve. Never close the loop. Never reveal the answer. The text should make them think "wait WHAT?" and keep watching.

Techniques you rotate between — never repeat the same structure twice in a row:
- OPEN LOOPS: Hint at something shocking without revealing it ("My boss found out what I did and I still can't believe her reaction")
- CONTRADICTION: Say something that shouldn't be true ("I got FIRED for being too good at my job")
- SPECIFICITY: Weirdly specific details create believability ("Day 47 of using this trick my barber told me about")
- IDENTITY CALLOUT: Make them feel seen ("If you've been posting every day and STILL not growing... watch this")
- SOCIAL PROOF SHOCK: Numbers or results that seem impossible ("This got me 2.3M views and it took 4 minutes to make")
- CONFESSION/VULNERABILITY: Raw honesty hooks ("I was mass unfollowed after posting THIS and honestly... fair")
- PATTERN INTERRUPT: Something so weird they have to stop ("I showed my therapist my screen time and she GASPED")

Rules:
- Maximum 15 words
- Emphasize 1-2 words in ALL CAPS — the words that carry the emotional punch
- First person, raw, unfiltered tone — like texting a friend, not writing an ad
- NO hashtags, NO emojis, NO quotation marks
- Return ONLY the hook text on a single line, nothing else — no preamble, no explanation
- Every hook must be DIFFERENT in structure and angle from the examples below
- If given context about the video, weave it in naturally — don't just slap the topic onto a template

NEVER write generic hooks like "You won't believe this" or "Watch until the end". Those are dead. Be specific, be weird, be human.`;

const CAPTION_PROMPT = `You write Instagram Reels captions that drive engagement and saves.

Structure:
1. First line: riff on the hook — expand the curiosity gap, don't close it
2. 2-3 lines of punchy value or context (no fluff)
3. CTA: one specific action ("save this", "send to someone who needs it", "comment X if you agree")
4. Blank line
5. 5-8 hashtags (mix of niche + broad, no spaces in tags)

Rules:
- Max 220 words total
- Conversational, not corporate
- Emojis: 1-3 max, only where they add punch
- NO generic CTAs like "follow for more" or "link in bio"
- Output ONLY the caption, nothing else`;

const EVALUATOR_PROMPT = `You are an Instagram growth analyst. You evaluate short-form video variations and pick the one most likely to go viral.

Scoring criteria (in order of importance):
1. Hook stops the scroll — makes you NEED to watch
2. Caption builds on the hook without killing the curiosity loop
3. Caption has a specific, compelling CTA
4. Hashtag relevance and mix quality
5. Overall cohesion between hook text and caption

Reply with ONLY valid JSON: {"winner": <1-based index>}
No explanation, no other text.`;

export async function generateHookText(context: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your key."
    );
  }

  const userPrompt = context
    ? `Write one viral hook for a video about: ${context}\n\nMake it specific to this topic. Open a curiosity gap. Be creative — don't use a template.`
    : `Write one viral hook for a social media video. Be wildly creative. Open a curiosity gap that FORCES the viewer to keep watching.`;

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4-6",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 80,
        temperature: 1,
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${err}`);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };
  return data.choices[0].message.content
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\n.*/s, ""); // take only the first line
}

async function callLLM(systemPrompt: string, userPrompt: string, maxTokens: number, temperature: number): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set.");

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "anthropic/claude-sonnet-4-6",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter API error: ${response.status} - ${err}`);
  }

  const data = (await response.json()) as { choices: { message: { content: string } }[] };
  return data.choices[0].message.content.trim();
}

export async function generateCaption(context: string, hookText: string): Promise<string> {
  const userPrompt = `Content context: ${context || "short-form social media video"}

Hook text shown in the video: "${hookText}"

Write the Instagram caption:`;

  const caption = await callLLM(CAPTION_PROMPT, userPrompt, 400, 0.9);
  return `${caption}\n\nComment "ME" and I'll DM you the app 👇`;
}

export async function evaluateBestVariation(
  variations: Array<{ hookText: string; caption: string }>,
  context: string
): Promise<number> {
  const list = variations
    .map((v, i) => `Variation ${i + 1}:\nHook: ${v.hookText}\nCaption:\n${v.caption}`)
    .join("\n\n---\n\n");

  const userPrompt = `Content context: ${context || "short-form social media video"}

${list}

Pick the best variation.`;

  const raw = await callLLM(EVALUATOR_PROMPT, userPrompt, 20, 0.1);

  try {
    const parsed = JSON.parse(raw) as { winner: number };
    const idx = parsed.winner - 1;
    if (idx >= 0 && idx < variations.length) return idx;
  } catch { /* fall through */ }
  return 0;
}
