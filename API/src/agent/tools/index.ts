import { amazonProduct, amazonSearch } from './amazon/index.js'
import { appleProduct, appleSearch } from './apple/index.js'
import { calculator } from './calculator.js'
import { currencyConvert } from './currency/index.js'
import { createFsTools, FS_TOOL_NAMES } from './fs/index.js'
import { createBrowserTools, BROWSER_TOOL_NAMES } from './browser/index.js'
import { createPresentationTools, PRESENTATION_TOOL_NAMES } from './presentation/index.js'
import { istoreCategories, istoreProduct, istoreSearch } from './istore/index.js'
import { parmaCategories, parmaProduct, parmaSearch } from './parma/index.js'
import { sasCategories, sasProduct, sasSearch } from './sas/index.js'
import { webCrawl, webExtract, webMap, webSearch } from './tavily/index.js'
import { walmartProduct, walmartSearch } from './walmart/index.js'
import { yerevanCityCategories, yerevanCityProduct, yerevanCitySearch } from './yerevan-city/index.js'


const SHARED = {
  calculator,
  currency_convert: currencyConvert,
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
  apple_search: appleSearch,
  apple_product: appleProduct,
  istore_search: istoreSearch,
  istore_product: istoreProduct,
  istore_categories: istoreCategories,
} as const

export type SharedToolName = keyof typeof SHARED

export const TOOL_NAMES: string[] = [...Object.keys(SHARED), ...FS_TOOL_NAMES, ...BROWSER_TOOL_NAMES, ...PRESENTATION_TOOL_NAMES]

export interface ToolContext {
  
  workspace?: string
}





export function buildTools(ctx: ToolContext = {}): Record<string, unknown> {
  return {
    ...SHARED,
    ...(ctx.workspace ? createFsTools(ctx.workspace) : {}),
    ...(ctx.workspace ? createBrowserTools(ctx.workspace) : {}),
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
export { currencyConvert, CURRENCY_TOOL_NAMES } from './currency/index.js'
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
export { appleSearch, appleProduct, APPLE_TOOL_NAMES } from './apple/index.js'
export { istoreSearch, istoreProduct, istoreCategories, ISTORE_TOOL_NAMES } from './istore/index.js'
export { ShopError } from './shops/scrape.js'
export { createFsTools, FS_TOOL_NAMES } from './fs/index.js'
export { listFiles, workspaceRoot, viewUrl, WorkspaceError } from './fs/workspace.js'
export { createBrowserTools, BROWSER_TOOL_NAMES, BrowserError } from './browser/index.js'
export { createPresentationTools, PRESENTATION_TOOL_NAMES } from './presentation/index.js'
