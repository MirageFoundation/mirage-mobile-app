#!/usr/bin/env bun
import assert from "node:assert/strict";

import { isAppRoute, resolveMirageUrl } from "../src/navigation/route-map.ts";

const postId = "9d3eb841f64e0956f01796572f43dcee6e0b1d3b68cbd1b017bb9a1a89acc351";

const customScheme = resolveMirageUrl(`miragedev://p/${postId}`);
assert(customScheme, "custom-scheme post link should resolve");
assert.equal(customScheme.route, `/post/${postId}`);
assert.equal(customScheme.type, "post");

const webLink = resolveMirageUrl(`https://mirage.talk/p/${postId}`);
assert(webLink, "web post link should resolve");
assert.equal(webLink.route, `/post/${postId}`);
assert.equal(webLink.type, "post");

const unsupportedScheme = resolveMirageUrl("miragedev://unknown/foo");
assert.equal(unsupportedScheme, null, "unsupported custom-scheme route should not resolve");

const externalHost = resolveMirageUrl(`https://example.com/p/${postId}`);
assert.equal(externalHost, null, "external host should not resolve as Mirage route");

assert.equal(isAppRoute(`/post/${postId}`), true);
assert.equal(isAppRoute(`/p/${postId}`), false);
assert.equal(isAppRoute("/(tabs)"), true);

console.log("Navigation smoke checks passed.");
