import 'dotenv/config'
import { fileURLToPath } from 'node:url'
import express, { type NextFunction, type Request, type Response } from 'express'
import { BODY_LIMIT, PORT } from './config.js'
import { TOOL_NAMES } from './agent/tools/index.js'
import { MODEL_KEYS } from './models/registry.js'
import { deviceMiddleware } from './sessions/device.js'
import { DATA_DIR } from './sessions/store.js'
import { logError, printBanner, requestLogger } from './lib/logger.js'
import { chatRoutes } from './routes/chat.js'
import { metaRoutes } from './routes/meta.js'
import { modelRoutes } from './routes/models.js'
import { promptRoutes } from './routes/prompt.js'
import { sessionRoutes } from './routes/sessions.js'
import { tokenRoutes } from './routes/tokens.js'
import { toolRoutes } from './routes/tools.js'
import { speechRoutes } from './routes/speech.js'
import { suggestionRoutes } from './routes/suggestions.js'
import { workspaceRoutes } from './routes/workspace.js'

const app = express()

app.use((req, res, next) => {
  const origin = req.headers.origin
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Corro-Device')
  res.setHeader('Access-Control-Expose-Headers', 'X-Corro-Device, X-Corro-Session')
  if (req.method === 'OPTIONS') {
    res.sendStatus(204)
    return
  }
  next()
})

app.use(express.json({ limit: BODY_LIMIT }))
app.use(deviceMiddleware)
app.use(requestLogger)
app.use(express.static(fileURLToPath(new URL('../public/', import.meta.url))))

app.use(metaRoutes)
app.use(chatRoutes)
app.use(sessionRoutes)
app.use(modelRoutes)
app.use(toolRoutes)
app.use(workspaceRoutes)
app.use(speechRoutes)
app.use(promptRoutes)
app.use(tokenRoutes)
app.use(suggestionRoutes)

app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const message = err instanceof Error ? err.message : 'Unknown error'
  logError(err, req)
  if (res.headersSent) {
    res.end()
    return
  }
  res.status(500).json({ error: message })
})

app.listen(PORT, () => {
  printBanner({ port: PORT, models: MODEL_KEYS, tools: TOOL_NAMES, dataDir: DATA_DIR })
})
