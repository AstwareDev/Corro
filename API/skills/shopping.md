---
name: shopping
description: Use this skill when the user asks about product prices, availability, or where to buy something — Armenian retailers (Yerevan City, Parma, SAS, iStore) or US retailers (Amazon, Walmart, Apple). Covers which tool to use per region/product and how to avoid mixing currencies or conflating separate retailers.
---

# Shopping Skill

## Armenia (AM)

Three supermarket chains are readable live — Yerevan City (yerevan_city_*), Parma (parma_*) and SAS (sas_*). Each has a search, a product-detail and a category tool, and returns real prices in Armenian dram, current discounts, descriptions and product photos.

One chain answers "what does X cost"; search all three when the user asks where something is cheapest, or wants the best price without naming a shop. Say which chain each price came from — they stock different ranges and a product missing from one may simply not be sold there.

istore_search / istore_product / istore_categories read iStore (istore.am), the Apple Authorised Reseller in Armenia — iPhone, iPad, Mac, Watch, TV, AirPods, audio and accessories at the reseller's own live AMD prices and sale markdowns, with photos and stock status. This is the shop to check for what an Apple product actually costs or is in stock for in Armenia; it is a separate retailer from apple_search/apple_product, which read Apple's own configurator and its own USD pricing — do not mix the two currencies or treat one as confirming the other.

## United States (US)

amazon_search / amazon_product read Amazon.com, walmart_search / walmart_product read Walmart.com — both live, in US dollars, with ratings, review counts and current markdowns. Search both when the user wants the better price or is not tied to one retailer. These two sites actively rate-limit automated requests; a tool that returns an error about a bot check has been blocked, not told the product doesn't exist — say so plainly and offer to try again rather than reporting it as unavailable.

apple_search / apple_product read Apple.com directly for iPhone and iPad — Apple sets one price, so there is nothing to compare against Amazon or Walmart for those; use it whenever the question is about an iPhone or iPad configuration or price, and equally when it is about what Apple is selling now — "what is new", "the latest iPhone", "what does the lineup look like" — since the buy pages list exactly the models and configurations currently on sale. It does not cover Mac, Apple Watch, AirPods or Vision Pro, and it reports what is on sale rather than release dates or announcements — for those, say so and use web_search rather than answering from memory.

## General rules

For any question about a product — what it costs, whether it is sold, what is in it, what is on discount, what a shop is carrying now, comparing two items — prefer the local catalogue tool for that region over web_search, and over answering from memory. Catalogues change constantly, so a remembered price or lineup is never good enough: call the tool before you describe what a shop sells. It is the retailer's own live data, so it is primary evidence for price and availability, where a search result is not.

Web search remains the right tool for reviews, recalls, nutrition claims and anything the shop does not publish.

Show what you found: catalogue results carry photo URLs in their image/images fields. When reviewing products or comparing options, embed each product's photo in the chat with `![product name](image-url)` — one image per line for a swipeable carousel, or inside the first cell of a comparison-table row so the table shows the products themselves. Use only URLs a tool actually returned; never guess an image URL.

Use a region's catalogue only when the question is about that country, or the user says they are shopping there. When the user is known to be in Armenia, treat the Armenian sources as the default first step for product, price and shopping questions, unless they name a different country or shop. Prices are local currency; do not convert unless asked.
