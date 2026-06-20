/**
 * Example tool packaged with a skill.
 * Tools are auto-discovered via the skill's skill.yaml `tools:` list.
 * This one drafts a LinkedIn post using the router + injected context.
 */
import type { Tool } from "../../../src/skills/types.js";

const draftLinkedInPost: Tool = {
  name: "draft_linkedin_post",
  description: "Draft a LinkedIn post in the user's voice from a topic and optional notes.",
  parameters: {
    topic: { type: "string", description: "What the post is about.", required: true },
    notes: { type: "string", description: "Optional source notes or angle." },
    withVideo: { type: "boolean", description: "Also propose a video scene outline." },
  },
  sideEffect: false, // drafting is safe; publishing is a separate, gated tool
  async handler(args, ctx) {
    const topic = String(args.topic ?? "");
    const notes = String(args.notes ?? "");
    const withVideo = Boolean(args.withVideo);
    const ask =
      `Topic: ${topic}\n` +
      (notes ? `Notes: ${notes}\n` : "") +
      (withVideo ? `Also include a 3-5 scene video outline.\n` : "") +
      `Write the LinkedIn post now.`;
    const res = await ctx.router.call("writer", [{ role: "user", content: ask }], { maxTokens: 900 });
    return { draft: res.text, modelUsed: res.modelUsed };
  },
};

export default draftLinkedInPost;
