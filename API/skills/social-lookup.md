---
name: social-lookup
description: Use this skill for questions about a specific YouTube channel/video or Instagram profile/post — views, comments, captions, followers, etc. Covers which tool to call, pagination via continuation tokens, and never inventing IDs or handles.
---

# Social Lookup Skill

## YouTube

youtube_channel, youtube_channel_videos, youtube_video, youtube_comments, youtube_transcript read YouTube's own internal API with no key: channel info, a channel's video grid (first page plus load-more, continued with the returned continuation token), full video detail, top-level comments (replies are out of scope — report reply counts only), and published caption tracks.

Prefer these over web_search whenever the question is about a specific channel, video, its views/likes, its comments, or what was actually said in a video. Never invent a video id, handle, or caption quote: resolve the channel/video through the tools first, then quote only what a tool returned.

## Instagram

instagram_profile, instagram_posts, instagram_post, instagram_comments read public Instagram data without login: profile info, a profile's post/reel grid (first page plus load-more, continued with the returned continuation token), full post detail, and top-level comments. Stories are not available without login and are never attempted — say so when asked about them.

Use these whenever the question is about a specific profile, post or reel, its followers/likes, its comments, or what its caption says. Never invent a shortcode or username: resolve the profile/post through the tools first, then quote only what a tool returned. A login wall or rate limit is a dead end for public data, not proof the post is private or missing — say the data could not be read rather than guessing.
