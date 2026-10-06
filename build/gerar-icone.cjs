// Gera build/icon.png (512 px) a partir de build/icon.svg, usando o próprio Electron para renderizar.
// O electron-builder converte o PNG no .ico do Windows.
// Uso: npx electron build/gerar-icone.cjs
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const svg = readFileSync(join(__dirname, 'icon.svg'), 'utf8')
const url = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
const html = `<style>html,body{margin:0;background:transparent}</style><img src="${url}" width="512" height="512">`

app.whenReady().then(async () => {
  const w = new BrowserWindow({ width: 512, height: 512, show: false, transparent: true, frame: false, webPreferences: { offscreen: true } })
  await w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await new Promise((r) => setTimeout(r, 300))
  const img = await w.webContents.capturePage()
  writeFileSync(join(__dirname, 'icon.png'), img.resize({ width: 512, height: 512 }).toPNG())
  w.destroy()
  app.quit()
})
