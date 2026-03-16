import { api } from "@/src/api/client";
import type { MirageWallet } from "@/src/wallet";
import { buildSignedEnvelope, canonBaseAnnotate } from "../signing";
import type { WriteResponse, PoWProgressCallback } from "../signing";

export interface AnnotateInput {
  override: string;
  topic?: string;
  title?: string;
  content?: string;
  tag?: string;
  media?: string[];
  appendix?: string;
}

export async function annotate(
  wallet: MirageWallet,
  input: AnnotateInput,
  onPoWProgress?: PoWProgressCallback
): Promise<WriteResponse> {
  const payload = await buildSignedEnvelope({
    wallet,
    baseBuilder: canonBaseAnnotate,
    payloadFields: {
      topic: input.topic ?? ".",
      title: input.title ?? ".",
      content: input.content ?? ".",
      tag: input.tag ?? ".",
      override: input.override,
      media: input.media ?? ["."],
      appendix: input.appendix ?? "",
    },
    skipPoW: true,
    onPoWProgress,
  });

  return api.post<WriteResponse>("/core/annotate", payload);
}
