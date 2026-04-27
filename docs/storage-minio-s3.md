# Object Storage Guide (MinIO and AWS S3)

## Purpose and Scope

This guide explains how object storage is wired in this backend, how backend and frontend developers should use it, how to troubleshoot common issues, and how to run it in production.

This project uses an S3-compatible integration through AWS SDK v3. In local development, MinIO is the default S3-compatible provider. In production, AWS S3 is recommended.

## Architecture Summary

Storage access is abstracted behind a storage service and consumed by the files module.

1. Client calls `POST /files/upload` with file metadata.
2. Backend creates a `TEMP` file row and returns a presigned PUT URL.
3. Client uploads bytes directly to object storage using that URL.
4. Backend later attaches the uploaded file to a business resource (for example, proposal creation).
5. Client requests `GET /files/:id` to get access URL:
   - Public bucket: direct URL from `S3_PUBLIC_BASE_URL`
   - Private bucket: short-lived presigned GET URL

## Source of Truth in Code

- Upload/download endpoints: `src/common/files/files.controller.ts`
- File lifecycle and bucket resolution: `src/common/files/files.service.ts`
- S3/MinIO adapter: `src/common/files/storage/s3.storage.ts`
- Upload request DTO: `src/common/files/dto/initiate-upload.dto.ts`
- Upload response DTO: `src/common/files/dto/file-upload-init-response.dto.ts`
- Access response DTO: `src/common/files/dto/file-access-response.dto.ts`
- Proposal flow attachment example: `src/proposals/proposals.service.ts`

## Storage Behavior and Invariants

These rules should remain true unless intentionally redesigned.

1. Every upload starts as `TEMP` in the `files` table.
2. Only `TEMP` files can be attached to resources.
3. `resourceType = USER_AVATAR` is stored in the public bucket.
4. All other resource types are stored in the private bucket.
5. Public access URL is computed from `S3_PUBLIC_BASE_URL`.
6. Private access URL is returned as a signed URL with expiration.

## Environment Variables

Used by both MinIO and AWS S3 mode:

```bash
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_ENDPOINT=...              # required for MinIO, optional/empty for AWS S3
S3_FORCE_PATH_STYLE=true     # true for MinIO, false for AWS S3
S3_BUCKET_PUBLIC=crmp-public
S3_BUCKET_PRIVATE=crmp-private
S3_PUBLIC_BASE_URL=...
S3_SIGNED_URL_EXPIRES_SECONDS=900
```

Current templates:

- `.env.example` for local app execution
- `.env.docker` for Docker Compose execution

## Local Setup for Backend Developers (Docker Compose + MinIO)

`docker-compose.yml` already starts these storage services:

- `minio` on ports `9000` (API) and `9001` (console)
- `minio-init` bootstrap container that:
  - creates `crmp-public`
  - creates `crmp-private`
  - sets anonymous download policy on `crmp-public`

### Steps

1. Ensure `.env.docker` has the MinIO-compatible values:

```bash
S3_REGION=us-east-1
S3_ACCESS_KEY_ID=minioadmin
S3_SECRET_ACCESS_KEY=minioadmin
S3_ENDPOINT=http://minio:9000
S3_FORCE_PATH_STYLE=true
S3_BUCKET_PUBLIC=crmp-public
S3_BUCKET_PRIVATE=crmp-private
S3_PUBLIC_BASE_URL=http://localhost:9000/crmp-public
S3_SIGNED_URL_EXPIRES_SECONDS=900
```

2. Build and run:

```bash
docker compose --env-file .env.docker up --build
```

3. Verify MinIO is healthy:

```bash
docker compose ps
docker compose logs minio --tail=100
docker compose logs minio-init --tail=100
```

4. Optional manual check in browser:
   - MinIO API: `http://localhost:9000`
   - MinIO Console: `http://localhost:9001`

### Running backend outside Docker while using MinIO in Docker

Use `.env` (or equivalent) with:

```bash
S3_ENDPOINT=http://localhost:9000
S3_FORCE_PATH_STYLE=true
S3_PUBLIC_BASE_URL=http://localhost:9000/crmp-public
```

## Local Setup for Frontend Developers

Frontend should upload directly to object storage using the presigned PUT URL from backend.

### Required flow

1. Call `POST /files/upload` with JWT and metadata.
2. Receive response:

```json
{
  "fileId": "uuid",
  "storageKey": "uploads/<user>/<file>/<name>",
  "uploadUrl": "https://...signed-put...",
  "publicUrl": "https://..." 
}
```

3. PUT file bytes to `uploadUrl` with matching `Content-Type`.
4. Use returned `fileId` in subsequent business APIs (for example proposal creation where `fileId` is required).
5. To access later, call `GET /files/:id` and use returned `url`.

### Minimal frontend upload example

```ts
async function uploadFileToStorage(file: File, token: string) {
  const initRes = await fetch('/files/upload', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      originalName: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      resourceType: 'PROPOSAL',
    }),
  });

  if (!initRes.ok) throw new Error('Failed to initialize upload');
  const init = await initRes.json();

  const putRes = await fetch(init.uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  });

  if (!putRes.ok) throw new Error('Failed to upload bytes to storage');

  return init.fileId;
}
```

### Frontend notes

1. Presigned URLs expire; upload immediately after receiving them.
2. Do not send app JWT to storage endpoint; send JWT only to backend endpoints.
3. Keep `Content-Type` consistent between initiate and PUT upload.
4. Treat `fileId` as the durable reference in app data.

## Common Troubleshooting

### 1) Signature mismatch / 403 on PUT

Symptoms:

- Upload URL is generated, but PUT returns 403.

Checks:

1. `S3_ENDPOINT` must match reachable host from signer context:
   - backend in Docker -> `http://minio:9000`
   - backend on host -> `http://localhost:9000`
2. `S3_FORCE_PATH_STYLE=true` for MinIO.
3. PUT `Content-Type` matches `mimeType` sent to `POST /files/upload`.
4. Upload URL is not expired (`S3_SIGNED_URL_EXPIRES_SECONDS`).

### 2) Public URL returns 403/404

Checks:

1. `S3_PUBLIC_BASE_URL` points to correct bucket base path.
2. Bucket exists and object key is correct.
3. Public bucket policy allows anonymous read.
4. For MinIO Compose setup, ensure `minio-init` completed successfully.

### 3) GET /files/:id fails for existing DB file

Checks:

1. `files.bucket` must not be null.
2. File may have been deleted from storage while DB record remained.
3. If private URL generation fails, verify credentials and endpoint.

### 4) File upload works but business API rejects fileId

Checks:

1. Ensure returned `fileId` is passed unchanged.
2. Ensure file is still in `TEMP` when attaching.
3. Ensure calling user has permission in target business workflow.

### 5) CORS errors in browser during direct upload

Checks:

1. Configure CORS on bucket/provider for frontend origin.
2. Allow methods: `PUT`, `GET`, `HEAD`.
3. Allow headers including `Content-Type`.
4. For local development, include localhost frontend origins.

## Production Setup (AWS S3)

Recommended baseline:

1. Use separate buckets or prefixes for public/private assets.
2. Keep private bucket fully private; serve via presigned GET only.
3. Prefer IAM roles (ECS/EKS/EC2) over long-lived access keys.
4. Enable bucket versioning and server-side encryption.
5. Set lifecycle rules for temporary/abandoned files.
6. Put CDN in front of public bucket if needed.

### Suggested production env values

```bash
S3_REGION=<aws-region>
S3_ACCESS_KEY_ID=<or omit when using IAM role>
S3_SECRET_ACCESS_KEY=<or omit when using IAM role>
S3_ENDPOINT=
S3_FORCE_PATH_STYLE=false
S3_BUCKET_PUBLIC=<public-bucket>
S3_BUCKET_PRIVATE=<private-bucket>
S3_PUBLIC_BASE_URL=https://<public-bucket>.s3.<aws-region>.amazonaws.com
S3_SIGNED_URL_EXPIRES_SECONDS=900
```

### Security checklist for production

1. Do not commit real credentials to repository.
2. Rotate any leaked credentials immediately.
3. Restrict IAM permissions to required bucket actions only.
4. Audit bucket policies for accidental public exposure.
5. Add monitoring/alerts for 4xx/5xx spikes on storage operations.

## Verification Checklist

Use this checklist after any storage config change:

1. `POST /files/upload` returns `fileId` and `uploadUrl`.
2. Direct PUT to `uploadUrl` succeeds.
3. `GET /files/:id` returns:
   - direct URL for public file
   - signed URL for private file
4. Business endpoint can consume `fileId` and attach successfully.
5. Uploaded file can be fetched/previewed by intended consumers.

## Change History

- 2026-04-27: Initial guide for MinIO/AWS S3 setup, frontend flow, troubleshooting, and production notes.