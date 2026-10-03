import { amazonProduct, amazonSearch } from './amazon/index.js'
import { appleProduct, appleSearch } from './apple/index.js'
import { calculator } from './calculator.js'
import { ameriabankRates, currencyConvert, idbankRates } from './currency/index.js'
import { createFsTools, FS_TOOL_NAMES } from './fs/index.js'
import { createPresentationTools, PRESENTATION_TOOL_NAMES } from './presentation/index.js'
import { readSkill } from '../skills/readSkill.js'
import { youtubeChannel, youtubeChannelVideos, youtubeComments, youtubeTranscript, youtubeVideo } from './youtube/index.js'
import { instagramComments, instagramPost, instagramPosts, instagramProfile } from './instagram/index.js'
import { istoreCategories, istoreProduct, istoreSearch } from './istore/index.js'
import { parmaCategories, parmaProduct, parmaSearch, parmaStores } from './parma/index.js'
import { sasCategories, sasProduct, sasSearch, sasStores } from './sas/index.js'
import { webCrawl, webExtract, webMap, webSearch } from './tavily/index.js'
import { walmartProduct, walmartSearch } from './walmart/index.js'
import { yerevanCityCategories, yerevanCityProduct, yerevanCitySearch, yerevanCityStores } from './yerevan-city/index.js'


const SHARED = {
  calculator,
  currency_convert: currencyConvert,
  ameriabank_rates: ameriabankRates,
  idbank_rates: idbankRates,
  read_skill: readSkill,
  web_search: webSearch,
  web_extract: webExtract,
  web_crawl: webCrawl,
  web_map: webMap,
  yerevan_city_search: yerevanCitySearch,
  yerevan_city_product: yerevanCityProduct,
  yerevan_city_categories: yerevanCityCategories,
  yerevan_city_stores: yerevanCityStores,
  parma_search: parmaSearch,
  parma_product: parmaProduct,
  parma_categories: parmaCategories,
  parma_stores: parmaStores,
  sas_search: sasSearch,
  sas_product: sasProduct,
  sas_categories: sasCategories,
  sas_stores: sasStores,
  amazon_search: amazonSearch,
  amazon_product: amazonProduct,
  walmart_search: walmartSearch,
  walmart_product: walmartProduct,
  apple_search: appleSearch,
  apple_product: appleProduct,
  istore_search: istoreSearch,
  istore_product: istoreProduct,
  istore_categories: istoreCategories,
  youtube_channel: youtubeChannel,
  youtube_channel_videos: youtubeChannelVideos,
  youtube_video: youtubeVideo,
  youtube_comments: youtubeComments,
  youtube_transcript: youtubeTranscript,
  instagram_profile: instagramProfile,
  instagram_posts: instagramPosts,
  instagram_post: instagramPost,
  instagram_comments: instagramComments,
} as const

export type SharedToolName = keyof typeof SHARED

export const TOOL_NAMES: string[] = [...Object.keys(SHARED), ...FS_TOOL_NAMES, ...PRESENTATION_TOOL_NAMES]

export interface ToolContext {
  
  workspace?: string
}





export function buildTools(ctx: ToolContext = {}): Record<string, unknown> {
  return {
    ...SHARED,
    ...(ctx.workspace ? createFsTools(ctx.workspace) : {}),
    ...(ctx.workspace ? createPresentationTools(ctx.workspace) : {}),
  }
}

export function selectTools(
  names?: string[],
  ctx: ToolContext = {}
): Record<string, unknown> {
  const all = buildTools(ctx)
  if (names === undefined) return all
  return Object.fromEntries(Object.entries(all).filter(([name]) => names.includes(name)))
}

export { calculator, evaluate, CalcError } from './calculator.js'
export { readSkill } from '../skills/readSkill.js'
export { listSkills, readSkillBody, parseSkillCommand, parseSkillCommands, SkillNotFound } from '../skills/loader.js'
export { currencyConvert, ameriabankRates, idbankRates, CURRENCY_TOOL_NAMES } from './currency/index.js'
export { webSearch, webExtract, webCrawl, webMap, hasTavilyKey, TavilyError } from './tavily/index.js'
export {
  yerevanCitySearch,
  yerevanCityProduct,
  yerevanCityCategories,
  yerevanCityStores,
  YerevanCityError,
  YEREVAN_CITY_TOOL_NAMES,
} from './yerevan-city/index.js'
export { parmaSearch, parmaProduct, parmaCategories, parmaStores, PARMA_TOOL_NAMES } from './parma/index.js'
export { sasSearch, sasProduct, sasCategories, sasStores, SAS_TOOL_NAMES } from './sas/index.js'
export { amazonSearch, amazonProduct, AMAZON_TOOL_NAMES } from './amazon/index.js'
export { walmartSearch, walmartProduct, WALMART_TOOL_NAMES } from './walmart/index.js'
export { appleSearch, appleProduct, APPLE_TOOL_NAMES } from './apple/index.js'
export { istoreSearch, istoreProduct, istoreCategories, ISTORE_TOOL_NAMES } from './istore/index.js'
export {
  youtubeChannel,
  youtubeChannelVideos,
  youtubeVideo,
  youtubeComments,
  youtubeTranscript,
  YOUTUBE_TOOL_NAMES,
  YouTubeError,
} from './youtube/index.js'
export {
  instagramProfile,
  instagramPosts,
  instagramPost,
  instagramComments,
  INSTAGRAM_TOOL_NAMES,
  InstagramError,
} from './instagram/index.js'
export { ShopError } from './shops/scrape.js'
export { createFsTools, FS_TOOL_NAMES } from './fs/index.js'
export { listFiles, workspaceRoot, viewUrl, WorkspaceError } from './fs/workspace.js'
export { createPresentationTools, PRESENTATION_TOOL_NAMES } from './presentation/index.js'
