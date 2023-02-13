import React from "react";

type State = {
  [fileKey: string]: {
    left: number;
    right: number;
    file: File;
  };
};

type Event =
  | { fileKey: string; name: "file-select" }
  | { fileKey: string; name: "chunk-read" }
  | { fileKey: string; name: "chunk-acknowledge" };

type Subscriber = (e: Event) => void;

type AcknowledgeChunkError = "no-file" | "eof";
type ReadChunkError = "no-file" | "eof" | "no-chunk";

type Options = Readonly<{ chunkSize: number }>;

const getStore = (options: Options) => {
  const state: State = {};
  const subscribers = new Set<Subscriber>();
  return {
    /**
     * events do not have a payload because subs can read the state
     */
    state,
    /**
     * subscribers listen for new files, then start pulling chunks from them
     */
    subscribe: (cb: Subscriber) => {
      subscribers.add(cb);
      return () => {
        subscribers.delete(cb);
      };
    },
    /**
     * notify subscribers that a new file was registered so they can begin pulling chunks
     */
    onFileSelect: (e: React.ChangeEvent<HTMLInputElement>): void => {
      const file = e.target.files?.[0];
      if (!file) {
        return;
      }
      const fileKey = file.name + Date.now();
      state[fileKey] = {
        left: 0,
        right: Math.min(options.chunkSize, file.size),
        file,
      };
      subscribers.forEach((s) => s({ name: "file-select", fileKey }));
    },
    /**
     * called when this client receives an ack from a chunk recipient
     * this will move the window to the next chunk
     * @throws {AcknowledgeChunkError}
     */
    acknowledgeChunk: (fileKey: string): void => {
      const fileMeta = state[fileKey];
      if (!fileMeta) {
        throw "no-file" satisfies AcknowledgeChunkError;
      }
      if (fileMeta.left === fileMeta.right) {
        throw "eof" satisfies AcknowledgeChunkError;
      }
      fileMeta.left = fileMeta.right;
      fileMeta.right = Math.min(
        fileMeta.right + options.chunkSize,
        fileMeta.file.size
      );
      subscribers.forEach((s) => s({ fileKey, name: "chunk-acknowledge" }));
    },
    /**
     * chunks are pulled instead of pushed to not overload the udp connection
     * this way you can wait for an ack before pulling another chunk
     * @throws {ReadChunkError}
     */
    readChunk: (fileKey: string): Promise<ArrayBuffer> => {
      return new Promise((resolve, reject) => {
        const fileMeta = state[fileKey];
        if (!fileMeta) {
          return reject("no-file" satisfies ReadChunkError);
        }
        if (fileMeta.left === fileMeta.right) {
          return reject("eof" satisfies ReadChunkError);
        }
        const reader = new FileReader();
        reader.onload = (event) => {
          const chunk = event?.target?.result;
          if (!chunk || typeof chunk === "string") {
            return reject("no-chunk" satisfies ReadChunkError);
          }
          resolve(chunk);
          subscribers.forEach((s) => s({ fileKey, name: "chunk-read" }));
        };
        reader.readAsArrayBuffer(
          fileMeta.file.slice(fileMeta.left, fileMeta.right)
        );
      });
    },
  };
};

const store = getStore({chunkSize: 1024 * 16});

const FilePicker = () => {
  return <input type="file" onChange={store.onFileSelect} />;
};

const StoreInfo = () => {
  const [events, setEvents] = React.useState<Event[]>([]);
  React.useEffect(() => {
    return store.subscribe((next) => {
      setEvents((prev) => [...prev, next]);
    });
  }, []);
  return <pre>{JSON.stringify({ state: store.state, events }, null, 2)}</pre>;
};

const withError = async <
  Fn extends (...args: any) => any,
  Args extends Parameters<Fn>
>(
  fn: Fn,
  ...args: Args
) => {
  try {
    await fn(...args);
  } catch (e) {
    alert(`${fn.name}(${[...args].join(",")}) ${e}`);
  }
};

const UDPSocket = () => {
  const [fileKey, setFileKey] = React.useState("");
  return (
    <>
      <label>fileKey</label>
      <input value={fileKey} onChange={(e) => setFileKey(e.target.value)} />
      <button onClick={() => withError(store.acknowledgeChunk, fileKey)}>
        acknowledgeChunk
      </button>
      <button onClick={() => withError(store.readChunk, fileKey)}>
        readChunk
      </button>
    </>
  );
};

export default function Home() {
  return (
    <>
      <FilePicker />
      <UDPSocket />
      <StoreInfo />
    </>
  );
}
