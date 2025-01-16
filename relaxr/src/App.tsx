import { useState, useEffect } from 'react'
import { SunIcon, MoonIcon, FolderIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'
const { ipcRenderer } = window.require('electron');

interface Download {
  id: string;
  url: string;
  status: 'pending' | 'downloading' | 'completed' | 'error';
  progress: number;
  filePath?: string;
  fileName?: string;
  error?: string;
}

function App() {
  const [url, setUrl] = useState('');
  const [downloads, setDownloads] = useState<Download[]>([]);
  const [isDark, setIsDark] = useState(false);
  const [defaultDirectory, setDefaultDirectory] = useState<string | null>(null);

  useEffect(() => {
    // Load default directory setting
    ipcRenderer.invoke('get-default-directory').then((result) => {
      setDefaultDirectory(result.path);
    });
  }, []);

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  useEffect(() => {
    const handleProgress = (_: unknown, { progress }: { progress: number }) => {
      setDownloads(prev => 
        prev.map(d => 
          d.status === 'downloading' 
            ? { ...d, progress }
            : d
        )
      );
    };

    ipcRenderer.on('download-progress', handleProgress);
    return () => {
      ipcRenderer.removeListener('download-progress', handleProgress);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;

    const newDownload: Download = {
      id: Date.now().toString(),
      url,
      status: 'downloading',
      progress: 0
    };

    setDownloads(prev => [newDownload, ...prev]);
    setUrl('');

    try {
      const result = await ipcRenderer.invoke('convert-to-mp3', url);
      if (result.success) {
        setDownloads(prev => 
          prev.map(d => 
            d.id === newDownload.id 
              ? { 
                  ...d, 
                  status: 'completed', 
                  filePath: result.filePath,
                  fileName: result.fileName,
                  progress: 100 
                }
              : d
          )
        );
      } else {
        setDownloads(prev => 
          prev.map(d => 
            d.id === newDownload.id 
              ? { ...d, status: 'error', error: result.message, progress: 0 }
              : d
          )
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      setDownloads(prev => 
        prev.map(d => 
          d.id === newDownload.id 
            ? { ...d, status: 'error', error: errorMessage, progress: 0 }
            : d
        )
      );
    }
  };

  const openFile = async (filePath: string) => {
    try {
      const result = await ipcRenderer.invoke('open-file-location', filePath);
      if (!result.success) {
        setDownloads(prev => 
          prev.map(d => 
            d.filePath === filePath 
              ? { ...d, error: result.message }
              : d
          )
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to open folder';
      setDownloads(prev => 
        prev.map(d => 
          d.filePath === filePath 
            ? { ...d, error: errorMessage }
            : d
        )
      );
    }
  };

  const handleSetDefaultDirectory = async () => {
    try {
      const result = await ipcRenderer.invoke('set-default-directory');
      if (result.success) {
        setDefaultDirectory(result.path);
      }
    } catch (error) {
      console.error('Failed to set default directory:', error);
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-200 ${isDark ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary-600 to-purple-500 text-transparent bg-clip-text">
            Relaxr S F
          </h1>
          <div className="flex items-center gap-4">
            <button
              onClick={handleSetDefaultDirectory}
              className="p-2 rounded-full hover:bg-primary-100 dark:hover:bg-primary-800 transition-colors
                       relative group"
              title={defaultDirectory || 'Set default save directory'}
            >
              <Cog6ToothIcon className="h-6 w-6 text-primary-600 dark:text-primary-400" />
              {defaultDirectory && (
                <div className="absolute bottom-full mb-2 hidden group-hover:block w-64 p-2 bg-white dark:bg-gray-800 
                              rounded-lg shadow-lg text-sm text-gray-600 dark:text-gray-300 text-center">
                  {defaultDirectory}
                </div>
              )}
            </button>
            <button
              onClick={() => setIsDark(!isDark)}
              className="p-2 rounded-full hover:bg-primary-100 dark:hover:bg-primary-800 transition-colors"
            >
              {isDark ? (
                <SunIcon className="h-6 w-6 text-primary-400" />
              ) : (
                <MoonIcon className="h-6 w-6 text-primary-600" />
              )}
            </button>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 mb-8 backdrop-blur-lg bg-opacity-90">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="flex gap-4">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Enter YouTube URL"
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 
                         bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                         focus:ring-2 focus:ring-primary-500 focus:border-transparent
                         placeholder-gray-400 dark:placeholder-gray-300"
              />
              <button
                type="submit"
                disabled={!url}
                className="px-6 py-2 bg-primary-600 hover:bg-primary-700 
                         disabled:bg-gray-400 disabled:cursor-not-allowed
                         text-white rounded-lg shadow-md hover:shadow-lg
                         transition-all duration-200 ease-in-out
                         disabled:hover:bg-gray-400"
              >
                Convert
              </button>
            </div>
          </form>
        </div>

        <div className="space-y-4">
          {downloads.map(download => (
            <div
              key={download.id}
              className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4
                       border border-gray-200 dark:border-gray-700
                       backdrop-blur-lg bg-opacity-90
                       hover:shadow-xl transition-shadow duration-200"
            >
              <div className="flex justify-between items-center">
                <div className="flex-1">
                  <p className="text-gray-900 dark:text-white font-medium truncate">
                    {download.url}
                  </p>
                  {download.fileName && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                      {download.fileName}
                    </p>
                  )}
                  <div className="mt-2">
                    {download.status === 'completed' ? (
                      <div className="flex items-center text-green-500 gap-2">
                        <span>Completed</span>
                        <button
                          onClick={() => download.filePath && openFile(download.filePath)}
                          className="flex items-center gap-1 text-primary-500 hover:text-primary-600
                                   transition-colors duration-200"
                        >
                          <FolderIcon className="h-5 w-5" />
                          <span>Show in Folder</span>
                        </button>
                      </div>
                    ) : download.status === 'error' ? (
                      <p className="text-red-500">{download.error}</p>
                    ) : (
                      <div>
                        <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400 mb-1">
                          <span>Downloading...</span>
                          <span>{download.progress}%</span>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                          <div
                            className="bg-primary-600 h-2.5 rounded-full transition-all duration-200"
                            style={{ width: `${download.progress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
