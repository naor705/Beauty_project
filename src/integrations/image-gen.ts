/**
 * Image generation provider abstraction.
 *
 * TODO(real): wire OpenAI Images, Stability, or Ideogram.
 *   - For OpenAI: client.images.generate({ model: "gpt-image-1", prompt, size: "1024x1024" })
 *   - Persist binary output to local /data/assets/ or to S3 and store the URL.
 */
import { nanoid } from "nanoid";
import { env } from "../config/env.js";
import { createLogger } from "../utils/logger.js";
import { createVideo, waitForVideo } from "./blotato.js";

const log = createLogger("image-gen");

export interface ImageGenInput {
  prompt: string;
  size?: "1024x1024" | "1024x1792" | "1792x1024";
}

export interface ImageGenResult {
  url: string;
  provider: string;
  payload: unknown;
}

export async function generateImage(input: ImageGenInput): Promise<ImageGenResult> {
  if (env.image.provider === "blotato") {
    log.info("blotato image creation starting");
    const created = await createVideo({ prompt: input.prompt, title: `beauty-img-${Date.now()}` });
    const { mediaUrl } = await waitForVideo(created.item.id);
    return { url: mediaUrl, provider: "blotato", payload: { creationId: created.item.id } };
  }

  if (env.image.provider === "mock") {
    const url = `https://placehold.co/${(input.size ?? "1024x1024").replace("x", "x")}/png?text=mock+${nanoid(4)}`;
    log.info("mock image generated", { url });
    return { url, provider: "mock", payload: { mock: true, prompt: input.prompt } };
  }

  // TODO(real): wire OpenAI Images / Stability
  log.warn("real image provider not implemented; falling back to mock");
  const url = `https://placehold.co/${(input.size ?? "1024x1024")}/png?text=mock+${nanoid(4)}`;
  return { url, provider: env.image.provider, payload: { mock: true, prompt: input.prompt } };
}
