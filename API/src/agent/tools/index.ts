import { amazonProduct, amazonSearch } from './amazon/index.js'
import { calculator } from './calculator.js'
import { createFsTools, FS_TOOL_NAMES } from './fs/index.js'
import { parmaCategories, parmaProduct, parmaSearch } from './parma/index.js'
import { sasCategories, sasProduct, sasSearch } from './sas/index.js'
import { webCrawl, webExtract, webMap, webSearch } from './tavily/index.js'
import { walmartProduct, walmartSearch } from './walmart/index.js'
import { yerevanCityCategories, yerevanCityProduct, yerevanCitySearch } from './yerevan-city/index.js'


const SHARED = {
  calculator,
  web_search: webSearch,
  web_extract: webExtract,
  web_crawl: webCrawl,
  web_map: webMap,
  yerevan_city_search: yerevanCitySearch,
  yerevan_city_product: yerevanCityProduct,
  yerevan_city_categories: yerevanCityCategories,
  parma_search: parmaSearch,
  parma_product: parmaProduct,
  parma_categories: parmaCategories,
  sas_search: sasSearch,
  sas_product: sasProduct,
  sas_categories: sasCategories,
  amazon_search: amazonSearch,
  amazon_product: amazonProduct,
  walmart_search: walmartSearch,
  walmart_product: walmartProduct,
} as const

export type SharedToolName = keyof typeof SHARED

export const TOOL_NAMES: string[] = [...Object.keys(SHARED), ...FS_TOOL_NAMES]

export interface ToolContext {
  
  workspace?: string
}





export function buildTools(ctx: ToolContext = {}): Record<string, unknown> {
  return {
    ...SHARED,
    ...(ctx.workspace ? createFsTools(ctx.workspace) : {}),
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
export { webSearch, webExtract, webCrawl, webMap, hasTavilyKey, TavilyError } from './tavily/index.js'
export {
  yerevanCitySearch,
  yerevanCityProduct,
  yerevanCityCategories,
  YerevanCityError,
  YEREVAN_CITY_TOOL_NAMES,
} from './yerevan-city/index.js'
export { parmaSearch, parmaProduct, parmaCategories, PARMA_TOOL_NAMES } from './parma/index.js'
export { sasSearch, sasProduct, sasCategories, SAS_TOOL_NAMES } from './sas/index.js'
export { amazonSearch, amazonProduct, AMAZON_TOOL_NAMES } from './amazon/index.js'
export { walmartSearch, walmartProduct, WALMART_TOOL_NAMES } from './walmart/index.js'
export { ShopError } from './shops/scrape.js'
export { createFsTools, FS_TOOL_NAMES } from './fs/index.js'
export { listFiles, workspaceRoot, WorkspaceError } from './fs/workspace.js'
