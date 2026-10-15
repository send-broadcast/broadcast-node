import { BaseResource, compact, type Id, type Params } from './base.ts';
import { idempotencyHeaders } from './transactionals.ts';

/** Content types by extension, for a file whose type is not given. */
export const FILE_ASSET_CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
});

export interface FileAssetListParams extends Params {
  /** Finds files by file name (closest matches first). */
  filter?: string;
  /** 1 to 1000. */
  limit?: number;
  offset?: number;
}

export interface FileAssetUploadOptions {
  /** Required for bytes and a Blob; a path's own name is used otherwise. */
  filename?: string;
  /** Follows the filename's extension when left out. */
  contentType?: string;
  /** true links the file to this channel only (default: every channel, as in the web app). */
  channelRestricted?: boolean;
  /** Makes a retry safe; see TransactionalCreateParams.idempotencyKey. */
  idempotencyKey?: string;
}

export interface FileAssetBase64Params {
  filename: string;
  /** The file, base64-encoded (standard alphabet, padded). */
  data: string;
  /** Detected from the bytes and the filename when left out. */
  contentType?: string;
  channelRestricted?: boolean;
  idempotencyKey?: string;
}

export interface FileAsset {
  id: number;
  filename: string;
  content_type: string;
  byte_size: number;
  /** Public /files/<slug> address that never expires; the brand kit logo_url takes it. */
  url: string;
  created_at: string;
}

/** A file path, or the bytes themselves. */
export type FileAssetSource = string | Uint8Array | ArrayBuffer | Blob;

/**
 * The channel's file library (Broadcast 2.48.0 or later): images (PNG, JPEG,
 * GIF, under 10 MB) with public URLs that never expire. Use a file's `url` in
 * emails, or as the brand kit logo:
 *
 *   const file = await client.fileAssets.upload('logo.png');
 *   await client.channelDesign.update({ brand: { logo_url: file.url } });
 *
 * Requires the `file_assets_read` permission to read and `file_assets_write`
 * to upload and delete.
 */
export class FileAssets extends BaseResource {
  /** Files the channel can see, newest first. Resolves to `{ data, total }`. */
  list<T = any>(params: FileAssetListParams = {}): Promise<T> {
    return this.httpGet<T>('/api/v1/file_assets', params);
  }

  get<T = any>(id: Id): Promise<T> {
    return this.httpGet<T>(`/api/v1/file_assets/${id}`);
  }

  /**
   * Uploads a file as multipart/form-data. `file` is a path (Node only), or
   * bytes / a Blob with `filename`. The content type follows the extension
   * unless `contentType` is given.
   */
  async upload<T = any>(file: FileAssetSource, options: FileAssetUploadOptions = {}): Promise<T> {
    const { bytes, filename } = await readSource(file, options.filename);
    const contentType = options.contentType ?? contentTypeFor(filename);

    const body = new FormData();
    body.append('file', new File([bytes], filename, { type: contentType }));
    if (options.channelRestricted !== undefined) body.append('channel_restricted', String(options.channelRestricted));

    return this.httpPost<T>('/api/v1/file_assets', body, {
      headers: idempotencyHeaders(options.idempotencyKey),
    });
  }

  /**
   * Uploads base64-encoded bytes in a JSON body, for callers that already
   * hold base64 (or cannot send multipart).
   */
  async uploadBase64<T = any>(params: FileAssetBase64Params): Promise<T> {
    const payload = compact({
      filename: params.filename,
      data: params.data,
      content_type: params.contentType,
      channel_restricted: params.channelRestricted,
    });

    return this.httpPost<T>('/api/v1/file_assets', payload, {
      headers: idempotencyHeaders(params.idempotencyKey),
    });
  }

  /**
   * A file that is a channel's brand kit logo is refused with
   * ValidationError (422): choose another logo first.
   */
  delete<T = any>(id: Id): Promise<T> {
    return this.httpDelete<T>(`/api/v1/file_assets/${id}`);
  }
}

async function readSource(
  file: FileAssetSource,
  filename: string | undefined,
): Promise<{ bytes: Blob | Uint8Array; filename: string }> {
  if (typeof file === 'string') {
    // Imported lazily so the SDK still loads on edge runtimes without node:fs.
    const { readFile } = await import('node:fs/promises');
    return { bytes: new Uint8Array(await readFile(file)), filename: filename ?? basename(file) };
  }

  if (filename === undefined || filename.trim() === '') {
    throw new TypeError('filename is required when uploading bytes or a Blob');
  }
  return { bytes: file instanceof ArrayBuffer ? new Uint8Array(file) : file, filename };
}

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function contentTypeFor(filename: string): string {
  const dot = filename.lastIndexOf('.');
  const extension = dot === -1 ? '' : filename.slice(dot).toLowerCase();
  return FILE_ASSET_CONTENT_TYPES[extension] ?? 'application/octet-stream';
}
