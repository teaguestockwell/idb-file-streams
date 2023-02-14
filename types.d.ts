declare module "native-file-system-adapter" {
  declare function showSaveFilePicker(options: {
    _preferPolyfill: boolean;
    suggestedName: string;
    types: Array<{
      description: string;
      accept: { [mimeType: string]: [string] };
    }>;
  }): Promise<{
    createWritable: () => Promise<{
      write: (data: ArrayBuffer | DataView | Blob | string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
}
