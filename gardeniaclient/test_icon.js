const { app, BrowserWindow, nativeImage } = require('electron');
const path = require('path');

app.whenReady().then(() => {
  const iconPath = path.join(__dirname, 'public/icon.png');
  const icon = nativeImage.createFromPath(iconPath);
  console.log('Icon path:', iconPath);
  console.log('Icon is empty?', icon.isEmpty());
  
  const win = new BrowserWindow({
    width: 400,
    height: 400,
    icon: icon
  });
  
  setTimeout(() => {
    app.quit();
  }, 2000);
});
