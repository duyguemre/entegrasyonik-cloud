const { app, BrowserWindow } = require('electron/main')
const path = require('node:path')
const express = require('express');

function createWindow () {
  const win = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
/*       preload: path.join(__dirname, 'preload.js') */
    }
  })

  win.loadURL('http://localhost:3000');

/*   win.loadFile(path.join(__dirname, "dist/index.html")); */
/*   win.loadFile('dist/index.html') */

  //win.webContents.openDevTools();

}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})


// Create express server
const server = express();

// Serve static files from the resource directory
server.use(express.static(path.join(__dirname, 'dist')));

// Start server
const port = 3000; // Change port if needed
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});