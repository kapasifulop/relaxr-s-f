"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const isDev = __importStar(require("electron-is-dev"));
const ytdl_core_1 = __importDefault(require("@distube/ytdl-core"));
const fs = __importStar(require("fs"));
const path_1 = require("path");
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffmpeg_1 = __importDefault(require("@ffmpeg-installer/ffmpeg"));
// Set ffmpeg path
fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_1.default.path);
let defaultSaveDirectory = null;
async function convertM4aToMp3(inputPath, outputPath, metadata) {
    return new Promise((resolve, reject) => {
        (0, fluent_ffmpeg_1.default)()
            .input(inputPath)
            .outputOptions('-metadata', `title=${metadata.title || ''}`)
            .outputOptions('-metadata', `artist=${metadata.artist || ''}`)
            .toFormat('mp3')
            .on('end', () => {
            // Delete the temporary m4a file after conversion
            fs.unlink(inputPath, (err) => {
                if (err)
                    console.error('Error deleting temporary file:', err);
            });
            resolve();
        })
            .on('error', (err) => {
            console.error(`An error occurred during conversion: ${err.message}`);
            reject(err);
        })
            .save(outputPath);
    });
}
function createWindow() {
    const win = new electron_1.BrowserWindow({
        width: 1024,
        height: 768,
        title: 'Relaxr S',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false
        },
    });
    win.loadURL(isDev
        ? 'http://localhost:5173'
        : `file://${(0, path_1.join)(__dirname, '../dist/index.html')}`);
    if (isDev) {
        win.webContents.openDevTools();
    }
}
electron_1.app.whenReady().then(createWindow);
electron_1.app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('activate', () => {
    if (electron_1.BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
electron_1.ipcMain.handle('set-default-directory', async () => {
    try {
        const result = await electron_1.dialog.showOpenDialog({
            properties: ['openDirectory'],
            title: 'Select Default Save Directory'
        });
        if (!result.canceled && result.filePaths.length > 0) {
            defaultSaveDirectory = result.filePaths[0];
            return { success: true, path: defaultSaveDirectory };
        }
        return { success: false, message: 'No directory selected' };
    }
    catch (error) {
        return { success: false, message: 'Failed to set default directory' };
    }
});
electron_1.ipcMain.handle('get-default-directory', () => {
    return { path: defaultSaveDirectory };
});
electron_1.ipcMain.handle('open-file-location', async (_, filePath) => {
    try {
        const folderPath = (0, path_1.dirname)(filePath);
        if (fs.existsSync(folderPath)) {
            await electron_1.shell.openPath(folderPath);
            return { success: true };
        }
        else {
            return { success: false, message: 'Folder not found' };
        }
    }
    catch (error) {
        return {
            success: false,
            message: error instanceof Error ? error.message : 'Failed to open folder'
        };
    }
});
electron_1.ipcMain.handle('convert-to-mp3', async (event, url) => {
    try {
        if (!ytdl_core_1.default.validateURL(url)) {
            return { success: false, message: 'Invalid YouTube URL. Please enter a valid YouTube video URL.' };
        }
        try {
            const info = await ytdl_core_1.default.getInfo(url);
            const videoTitle = info.videoDetails.title.replace(/[^\w\s]/gi, '_');
            const artist = info.videoDetails.author?.name?.replace(/[^\w\s]/gi, '_') || 'Unknown Artist';
            let outputPath;
            if (defaultSaveDirectory) {
                outputPath = (0, path_1.join)(defaultSaveDirectory, `${videoTitle}.mp3`);
            }
            else {
                const saveDialog = await electron_1.dialog.showSaveDialog({
                    title: 'Save MP3',
                    defaultPath: (0, path_1.join)(electron_1.app.getPath('music'), `${videoTitle}.mp3`),
                    filters: [{ name: 'MP3 Files', extensions: ['mp3'] }]
                });
                if (saveDialog.canceled || !saveDialog.filePath) {
                    return { success: false, message: 'Save operation cancelled' };
                }
                outputPath = saveDialog.filePath;
            }
            // Temporary file for m4a
            const tempM4aPath = (0, path_1.join)(electron_1.app.getPath('temp'), `${Date.now()}_temp.m4a`);
            return new Promise((resolve, reject) => {
                try {
                    const videoStream = (0, ytdl_core_1.default)(url, {
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
                        }
                        catch (error) {
                            reject({
                                success: false,
                                message: `Conversion error: ${error instanceof Error ? error.message : 'Unknown error'}`
                            });
                        }
                    });
                    videoStream.pipe(writeStream);
                }
                catch (error) {
                    if (error instanceof Error) {
                        reject({ success: false, message: `Conversion error: ${error.message}` });
                    }
                    else {
                        reject({ success: false, message: 'An unknown error occurred during conversion' });
                    }
                }
            });
        }
        catch {
            return {
                success: false,
                message: 'Could not access video information. Please check if the video is available and not private.'
            };
        }
    }
    catch (error) {
        if (error instanceof Error) {
            return { success: false, message: `General error: ${error.message}` };
        }
        return { success: false, message: 'An unknown error occurred' };
    }
});
