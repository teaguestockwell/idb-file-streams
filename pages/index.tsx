import React from "react";

type FilesState = {
  [fileKey: string]: {
    fileKey: string;
    left: number;
    right: number;
    file: File;
  };
};

type StoreEvent =
  | { fileKey: string; name: "file-change" }
  | { fileKey: string; name: "chunk-read" };

type StoreSubscriber = (e: StoreEvent) => void;

const getStore = () => {
  const chunkSize = 1024 * 100;
  const fileStates: FilesState = {};
  const subs = new Set<StoreSubscriber>();

  const self = {
    /**
     * events do not have a payload because subs can read from the file store
     */
    fileStates,
    /**
     * subscribers listen for new files, then start pulling chunks from them
     */
    subscribe: (cb: StoreSubscriber) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    /**
     * notify subs that a new file was registered so they can begin pulling chunks
     */
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>): void => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }
      const fileKey = file.name + Date.now();
      fileStates[fileKey] = {
        fileKey,
        left: 0,
        right: Math.min(chunkSize, file.size),
        file,
      };
      subs.forEach((s) => s({ name: "file-change", fileKey }));
    },
    /**
     * called when sender receives an ack from the chunk recipient
     * this will move the window to the next chunk
     */
    acknowledgeChunk: (fileKey: string): void => {
      const state = fileStates[fileKey];
      if (!state) {
        throw new Error(`acknowledgeChunk: no file at ${fileKey}`);
      }
      state.left = state.right;
      state.right = Math.min(state.right + chunkSize, state.file.size);
    },
    /**
     * chunks are pulled instead of pushed to not overload the udp connection
     * this way you can wait for an ack before pulling another chunk
     */
    readChunk: (fileKey: string): Promise<ArrayBuffer> => {
      return new Promise((resolve, reject) => {
        const state = fileStates[fileKey];
        if (!state) {
          return reject(`readChunk: file not found for fileKey: ${fileKey}`);
        }
        if (state.left === state.right) {
          return reject(
            `readChunk: cant read empty chunk for fileKey: ${fileKey}`
          );
        }
        const reader = new FileReader();
        reader.onload = (event) => {
          const chunk = event?.target?.result;
          if (!chunk || typeof chunk === "string") {
            return reject(`readChunk: cant chunk for fileKey: ${fileKey}`);
          }
          resolve(chunk);
        };
        reader.readAsArrayBuffer(state.file.slice(state.left, state.right));
      });
    },
  };

  return self;
};

const store = getStore();

const FilePicker = () => {
  return <input type="file" onChange={store.onFileChange} />;
};

const StoreInfo = () => {
  const [events, setEvents] = React.useState<StoreEvent[]>([]);
  React.useEffect(() => {
    return store.subscribe((next) => {
      setEvents((prev) => [...prev, next]);
    });
  }, []);
  return (
    <pre>{JSON.stringify({ store: store.fileStates, events }, null, 2)}</pre>
  );
};

export default function Home() {
  return (
    <>
      <FilePicker />
      <StoreInfo />
    </>
  );
}
