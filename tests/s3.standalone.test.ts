// Signature V4 against the worked examples in the AWS S3 documentation ("Signature Calculations for the
// Authorization Header" and "Authenticating Requests: Using Query Parameters"), and the object store
// (lib/objects.ts) against a bucket of its own.
import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { config } from "@aihot/backend/config";
import { getObject, objectLink, ObjectStoreError, putObject } from "@aihot/backend/lib/objects";
import { presignV4, signV4 } from "@aihot/backend/lib/s3";

const example = { region: "us-east-1", accessKey: "AKIAIOSFODNN7EXAMPLE", secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY", now: new Date("2013-05-24T00:00:00Z") };
const url = () => new URL("https://examplebucket.s3.amazonaws.com/test.txt");

test("header signature matches the AWS GET example", () => {
  const headers = signV4({ ...example, method: "GET", url: url(), payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855", headers: { Range: "bytes=0-9" } });
  assert.equal(headers.authorization, "AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request, SignedHeaders=host;range;x-amz-content-sha256;x-amz-date, Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41");
});

test("presigned URL matches the AWS query-string example", () => {
  const signed = presignV4({ ...example, url: url(), expires: 86400 });
  assert.equal(signed.searchParams.get("X-Amz-Signature"), "aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404");
  assert.equal(signed.searchParams.get("X-Amz-Credential"), "AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request");
});

test("objects round-trip through a bucket, and through uploads/ without one", async () => {
  const stored = new Map<string, Buffer>();
  const seen: Array<{ method: string; url: string; authorization: string; type: string | undefined }> = [];
  let failPut = false;
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      seen.push({ method: req.method!, url: req.url!, authorization: String(req.headers.authorization), type: req.headers["content-type"] });
      if (req.method === "PUT" && !failPut) { stored.set(req.url!, Buffer.concat(chunks)); res.writeHead(200).end(); return; }
      const body = req.method === "GET" ? stored.get(req.url!) : undefined;
      if (body) res.writeHead(200).end(body);
      else res.writeHead(req.method === "PUT" ? 500 : 404).end("<Error/>");
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const dataDir = config.dataDir;
  config.dataDir = await mkdtemp(path.join(tmpdir(), "objects-"));
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01]);
  try {
    await putObject("essays/abc.jpg", bytes, "image/jpeg");
    assert.deepEqual(await readFile(path.join(config.dataDir, "uploads", "essays", "abc.jpg")), bytes);
    assert.deepEqual(await getObject("essays/abc.jpg"), bytes);
    assert.equal(await getObject("essays/missing.jpg"), null);
    assert.throws(() => objectLink("essays/abc.jpg", "abc.jpg", 300), /not configured/);

    Object.assign(process.env, { OBJECT_STORE_ENDPOINT: `${endpoint}/`, OBJECT_STORE_BUCKET: "e-acc", OBJECT_STORE_ACCESS_KEY_ID: "test-access", OBJECT_STORE_SECRET_ACCESS_KEY: "test-secret" });
    await putObject("wechat-illustrations/def.jpg", bytes, "image/jpeg");
    assert.deepEqual(await getObject("wechat-illustrations/def.jpg"), bytes);
    assert.equal(await getObject("wechat-illustrations/missing.jpg"), null);
    assert.deepEqual(seen.slice(0, 2).map((s) => [s.method, s.url, s.type]), [["PUT", "/e-acc/wechat-illustrations/def.jpg", "image/jpeg"], ["GET", "/e-acc/wechat-illustrations/def.jpg", undefined]]);
    assert.ok(seen.every((s) => s.authorization.startsWith("AWS4-HMAC-SHA256 Credential=test-access/") && s.authorization.includes("/auto/s3/aws4_request")));
    const link = new URL(objectLink("wallpapers/x.jpg", "x.jpg", 300));
    assert.equal(`${link.origin}${link.pathname}`, `${endpoint}/e-acc/wallpapers/x.jpg`);
    assert.equal(link.searchParams.get("X-Amz-Expires"), "300");

    failPut = true;
    await assert.rejects(putObject("essays/ghi.jpg", bytes, "image/jpeg"), (error) => error instanceof ObjectStoreError && /500/.test(error.message));
    for (const key of ["../etc/passwd", "essays/../x.jpg", "essays/.hidden", "essays", "Essays/a.jpg", "essays/a/b.jpg"]) {
      await assert.rejects(getObject(key), /invalid object key/, key);
    }
  } finally {
    for (const k of ["OBJECT_STORE_ENDPOINT", "OBJECT_STORE_BUCKET", "OBJECT_STORE_ACCESS_KEY_ID", "OBJECT_STORE_SECRET_ACCESS_KEY"]) delete process.env[k];
    await rm(config.dataDir, { recursive: true, force: true });
    config.dataDir = dataDir;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
