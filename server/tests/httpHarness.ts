import type { Express } from "express";
import { IncomingMessage, ServerResponse } from "http";
import { Duplex } from "stream";

type HeaderValue = string | string[] | undefined;

interface DispatchOptions {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: unknown;
}

export interface TestResponse {
  status: number;
  headers: Record<string, HeaderValue>;
  body: any;
  text: string;
}

class MockSocket extends Duplex {
  private readonly chunks: Buffer[] = [];

  _read(_size: number): void {}

  _write(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void,
  ): void {
    this.chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
    callback();
  }

  _final(callback: (error?: Error | null) => void): void {
    callback();
  }

  get data(): Buffer {
    return Buffer.concat(this.chunks);
  }
}

function normalizeHeaders(headers: Record<string, HeaderValue>): Record<string, HeaderValue> {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
}

async function dispatch(app: Express, options: DispatchOptions): Promise<TestResponse> {
  const socket = new MockSocket();
  const req = new IncomingMessage(socket);
  const res = new ServerResponse(req);

  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  let payloadBuffer: Buffer | undefined;

  if (options.body !== undefined) {
    if (Buffer.isBuffer(options.body)) {
      payloadBuffer = options.body;
    } else if (typeof options.body === "string") {
      payloadBuffer = Buffer.from(options.body);
    } else {
      payloadBuffer = Buffer.from(JSON.stringify(options.body));
      if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
        headers["content-type"] = "application/json";
      }
    }

    if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-length")) {
      headers["content-length"] = String(payloadBuffer.length);
    }
  }

  req.method = options.method.toUpperCase();
  req.url = options.path;
  req.headers = normalizeHeaders(headers) as Record<string, string>;
  req.push(payloadBuffer ?? null);
  if (payloadBuffer) {
    req.push(null);
  }

  (res as any).assignSocket(socket);

  await new Promise<void>((resolve, reject) => {
    res.on("finish", resolve);
    res.on("error", reject);
    (app as any)(req, res);
  });

  const rawResponse = socket.data.toString("utf8");
  const headerSeparator = rawResponse.indexOf("\r\n\r\n");
  const text = headerSeparator >= 0 ? rawResponse.slice(headerSeparator + 4) : rawResponse;
  const responseHeaders = normalizeHeaders(res.getHeaders());
  const contentType = Array.isArray(responseHeaders["content-type"])
    ? responseHeaders["content-type"][0]
    : responseHeaders["content-type"];

  let body: any = text;
  if (contentType?.includes("application/json") && text) {
    body = JSON.parse(text);
  }

  return {
    status: res.statusCode,
    headers: responseHeaders,
    body,
    text,
  };
}

class TestRequestBuilder {
  private readonly headers = new Map<string, string>();
  private body: unknown;

  constructor(
    private readonly app: Express,
    private readonly method: string,
    private readonly path: string,
  ) {}

  set(name: string, value: string): this {
    this.headers.set(name, value);
    return this;
  }

  send(body: unknown): this {
    this.body = body;
    return this;
  }

  async execute(): Promise<TestResponse> {
    return dispatch(this.app, {
      method: this.method,
      path: this.path,
      headers: Object.fromEntries(this.headers),
      body: this.body,
    });
  }

  then<TResult1 = TestResponse, TResult2 = never>(
    onfulfilled?: ((value: TestResponse) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export function request(app: Express) {
  return {
    get: (path: string) => new TestRequestBuilder(app, "GET", path),
    post: (path: string) => new TestRequestBuilder(app, "POST", path),
    patch: (path: string) => new TestRequestBuilder(app, "PATCH", path),
    put: (path: string) => new TestRequestBuilder(app, "PUT", path),
    delete: (path: string) => new TestRequestBuilder(app, "DELETE", path),
  };
}
