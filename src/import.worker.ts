import { importFiles } from './import';
self.onmessage = async (event: MessageEvent<File[]>) => {
  try {
    const archive = await importFiles(event.data, (message) =>
      self.postMessage({ type: 'progress', message }),
    );
    self.postMessage({ type: 'success', archive });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'Could not read these files. Try a fresh JSON export.',
    });
  }
};
