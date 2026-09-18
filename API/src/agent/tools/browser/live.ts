import type { CDPSession, Page } from 'playwright-core'

export interface ScreencastMetadata {
  offsetTop: number
  pageScaleFactor: number
  deviceWidth: number
  deviceHeight: number
  scrollOffsetX: number
  scrollOffsetY: number
  timestamp?: number
}

export class LiveSession {
  private cdp: CDPSession | null = null
  private page: Page | null = null
  private frameListener?: (event: { data: string; metadata: ScreencastMetadata; sessionId: number }) => void

  constructor(
    private readonly onFrame: (data: string, metadata: ScreencastMetadata) => void,
    private readonly onNav: (url: string, title: string) => void
  ) {}

  get attachedPage(): Page | null {
    return this.page
  }

  async attach(page: Page): Promise<void> {
    await this.detach()
    const cdp = await page.context().newCDPSession(page)
    this.cdp = cdp
    this.page = page

    this.frameListener = (event) => {
      this.onFrame(event.data, event.metadata)
      cdp.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {})
    }
    cdp.on('Page.screencastFrame', this.frameListener)
    cdp.on('Page.frameNavigated', (event: { frame: { url: string; parentId?: string } }) => {
      if (event.frame.parentId) return
      page
        .title()
        .then((title) => this.onNav(event.frame.url, title))
        .catch(() => {})
    })

    await cdp.send('Page.enable')
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, maxWidth: 1280, maxHeight: 800 })

    const title = await page.title().catch(() => '')
    this.onNav(page.url(), title)
  }

  async detach(): Promise<void> {
    if (this.cdp) {
      await this.cdp.send('Page.stopScreencast').catch(() => {})
      await this.cdp.detach().catch(() => {})
    }
    this.cdp = null
    this.page = null
    this.frameListener = undefined
  }
}
