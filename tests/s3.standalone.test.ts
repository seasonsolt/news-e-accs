// Signature V4 against the worked examples in the AWS S3 documentation ("Signature Calculations for the
// Authorization Header" and "Authenticating Requests: Using Query Parameters").
import assert from "node:assert/strict";
import { test } from "node:test";
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
