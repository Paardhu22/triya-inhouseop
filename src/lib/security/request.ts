/** Bounds apply to bytes read, including chunked bodies without Content-Length. */
export class RequestError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

export function requestErrorResponse(error: unknown): Response {
  if (!(error instanceof RequestError)) throw error;
  return Response.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
}

export async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    throw new RequestError("Request is too large", 413);
  }
  if (!request.body) throw new RequestError("Request body is required", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RequestError("Request body timed out", 408)), 10_000);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new RequestError("Request is too large", 413);
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readJsonBody(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new RequestError("Content-Type must be application/json", 415);
  }
  const bytes = await readBoundedBody(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new RequestError("Invalid JSON body", 400);
  }
}

export async function readFormBody(request: Request, maxBytes: number): Promise<FormData> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data;")) {
    throw new RequestError("Content-Type must be multipart/form-data", 415);
  }
  const bytes = await readBoundedBody(request, maxBytes);
  try {
    return await new Response(bytes as Uint8Array<ArrayBuffer>, { headers: { "Content-Type": request.headers.get("content-type")! } }).formData();
  } catch {
    throw new RequestError("Invalid upload body", 400);
  }
}
