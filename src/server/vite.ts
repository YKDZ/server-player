const port = Number(process.env.PORT) || 3000

export const vite = import.meta?.env?.PROD
  ? undefined
  : await (
      await import('vite')
    ).createServer({
      configFile: 'vite.client.config.ts',
      server: { middlewareMode: true, port },
      appType: 'custom',
    })
