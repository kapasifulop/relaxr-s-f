import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import * as isDev from 'electron-is-dev';
import ytdl from '@distube/ytdl-core';
import * as fs from 'fs';
import { join, dirname } from 'path';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

interface VideoMetadata {
  title: string;
  artist: string;
}

let defaultSaveDirectory: string | null = null;

async function convertM4aToMp3(inputPath: string, outputPath: string, metadata: VideoMetadata): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg()
      .input(inputPath)
      .outputOptions('-metadata', `title=${metadata.title || ''}`)
      .outputOptions('-metadata', `artist=${metadata.artist || ''}`)
      .toFormat('mp3')
      .on('end', () => {
        // Delete the temporary m4a file after conversion
        fs.unlink(inputPath, (err) => {
          if (err) console.error('Error deleting temporary file:', err);
        });
        resolve();
      })
      .on('error', (err: Error) => {
        console.error(`An error occurred during conversion: ${err.message}`);
        reject(err);
      })
      .save(outputPath);
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    title: 'Relaxr S F',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false
    },
  });

  win.loadURL(
    isDev
      ? 'http://localhost:5173'
      : `file://${join(__dirname, '../dist/index.html')}`
  );

  if (isDev) {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('set-default-directory', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
      title: 'Select Default Save Directory'
    });

    if (!result.canceled && result.filePaths.length > 0) {
      defaultSaveDirectory = result.filePaths[0];
      return { success: true, path: defaultSaveDirectory };
    }
    return { success: false, message: 'No directory selected' };
  } catch (error) {
    return { success: false, message: 'Failed to set default directory' };
  }
});

ipcMain.handle('get-default-directory', () => {
  return { path: defaultSaveDirectory };
});

ipcMain.handle('open-file-location', async (_, filePath: string) => {
  try {
    const folderPath = dirname(filePath);
    if (fs.existsSync(folderPath)) {
      await shell.openPath(folderPath);
      return { success: true };
    } else {
      return { success: false, message: 'Folder not found' };
    }
  } catch (error) {
    return { 
      success: false, 
      message: error instanceof Error ? error.message : 'Failed to open folder' 
    };
  }
});

ipcMain.handle('convert-to-mp3', async (event, url: string) => {
  try {
    if (!ytdl.validateURL(url)) {
      return { success: false, message: 'Invalid YouTube URL. Please enter a valid YouTube video URL.' };
    }

    try {
      const info = await ytdl.getInfo(url);
      const videoTitle = info.videoDetails.title.replace(/[^\w\s]/gi, '_');
      const artist = info.videoDetails.author?.name?.replace(/[^\w\s]/gi, '_') || 'Unknown Artist';
      
      let outputPath: string;
      if (defaultSaveDirectory) {
        outputPath = join(defaultSaveDirectory, `${videoTitle}.mp3`);
      } else {
        const saveDialog = await dialog.showSaveDialog({
          title: 'Save MP3',
          defaultPath: join(app.getPath('music'), `${videoTitle}.mp3`),
          filters: [{ name: 'MP3 Files', extensions: ['mp3'] }]
        });

        if (saveDialog.canceled || !saveDialog.filePath) {
          return { success: false, message: 'Save operation cancelled' };
        }
        outputPath = saveDialog.filePath;
      }

      // Temporary file for m4a
      const tempM4aPath = join(app.getPath('temp'), `${Date.now()}_temp.m4a`);

      return new Promise((resolve, reject) => {
        try {
          const videoStream = ytdl(url, {
            quality: 'highestaudio',
            filter: 'audioonly'
          });

          const writeStream = fs.createWriteStream(tempM4aPath);

          let lastProgress = 0;
          videoStream.on('progress', (_, downloaded, total) => {
            const percent = (downloaded / total) * 100;
            if (percent - lastProgress >= 1) {
              lastProgress = percent;
              event.sender.send('download-progress', { progress: Math.round(percent / 2) }); // First 50%
            }
          });

          videoStream.on('error', (error) => {
            reject({ success: false, message: `Download error: ${error.message}` });
          });

          writeStream.on('error', (error) => {
            reject({ success: false, message: `File write error: ${error.message}` });
          });

          writeStream.on('finish', async () => {
            try {
              // Convert to MP3
              await convertM4aToMp3(tempM4aPath, outputPath, {
                title: info.videoDetails.title,
                artist: artist
              });
              
              event.sender.send('download-progress', { progress: 100 }); // Conversion complete
              resolve({ 
                success: true, 
                filePath: outputPath,
                fileName: `${videoTitle}.mp3`
              });
            } catch (error) {
              reject({ 
                success: false, 
                message: `Conversion error: ${error instanceof Error ? error.message : 'Unknown error'}`
              });
            }
          });

          videoStream.pipe(writeStream);
        } catch (error) {
          if (error instanceof Error) {
            reject({ success: false, message: `Conversion error: ${error.message}` });
          } else {
            reject({ success: false, message: 'An unknown error occurred during conversion' });
          }
        }
      });
    } catch {
      return { 
        success: false, 
        message: 'Could not access video information. Please check if the video is available and not private.' 
      };
    }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, message: `General error: ${error.message}` };
    }
    return { success: false, message: 'An unknown error occurred' };
  }
}); 