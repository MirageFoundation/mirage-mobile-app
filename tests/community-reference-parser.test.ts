// @ts-nocheck -- Bun's test types are runtime-provided and not a project dependency.
import { describe, expect, test } from "bun:test";

import { hasCommunityMentions, splitCommunityMentions } from "../src/utils/community-reference";

describe("community reference parser", () => {
  test("recognizes valid lowercase-normalized [slug] mentions", () => {
    expect(splitCommunityMentions("hello [news] world")).toEqual([
      { type: "text", value: "hello " },
      { type: "community", slug: "news" },
      { type: "text", value: " world" },
    ]);
    expect(splitCommunityMentions("hello [News] world")).toEqual([
      { type: "text", value: "hello [News] world" },
    ]);
    expect(hasCommunityMentions("see [bitcoin]")).toBe(true);
  });

  test("skips markdown links, images, and reference syntax", () => {
    expect(splitCommunityMentions("[text](https://example.com)")).toEqual([
      { type: "text", value: "[text](https://example.com)" },
    ]);
    expect(splitCommunityMentions("![alt](https://example.com/a.png)")).toEqual([
      { type: "text", value: "![alt](https://example.com/a.png)" },
    ]);
    expect(splitCommunityMentions("See [docs]: https://example.com")).toEqual([
      { type: "text", value: "See [docs]: https://example.com" },
    ]);
    expect(hasCommunityMentions("[text](https://example.com) and ![x](y)")).toBe(false);
  });

  test("excludes reserved all/home/following slugs", () => {
    const parts = splitCommunityMentions("[all] [home] [following] [news]");
    expect(parts.filter((part) => part.type === "community")).toEqual([
      { type: "community", slug: "news" },
    ]);
    expect(parts.filter((part) => part.type === "text").map((part) => part.value).join("")).toBe(
      "[all] [home] [following] ",
    );
  });

  test("treats leftover c/slug as a community mention", () => {
    expect(splitCommunityMentions("visit c/news today")).toEqual([
      { type: "text", value: "visit " },
      { type: "community", slug: "news" },
      { type: "text", value: " today" },
    ]);
  });

  test("#slug is ordinary text and not a community mention", () => {
    expect(splitCommunityMentions("talk about #news please")).toEqual([
      { type: "text", value: "talk about #news please" },
    ]);
    expect(hasCommunityMentions("#bitcoin")).toBe(false);
  });
});
