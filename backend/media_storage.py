from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Protocol


class S3Client(Protocol):
    def upload_file(self, filename: str, bucket: str, key: str) -> None: ...
    def download_file(self, bucket: str, key: str, filename: str) -> None: ...
    def delete_object(self, *, Bucket: str, Key: str) -> object: ...
    def head_object(self, *, Bucket: str, Key: str) -> object: ...
    def get_object(self, *, Bucket: str, Key: str, **kwargs: Any) -> dict[str, Any]: ...


class MediaStorage:
    def __init__(self, bucket: str | None = None, client: S3Client | None = None):
        self.bucket = bucket
        self.client = client

    @classmethod
    def from_environment(cls) -> MediaStorage:
        endpoint = os.environ.get("VOXERA_S3_ENDPOINT_URL")
        bucket = os.environ.get("VOXERA_S3_BUCKET")
        access_key = os.environ.get("VOXERA_S3_ACCESS_KEY_ID")
        secret_key = os.environ.get("VOXERA_S3_SECRET_ACCESS_KEY")
        configured = (endpoint, bucket, access_key, secret_key)
        if not any(configured):
            return cls()
        if not all(configured):
            raise RuntimeError("Configure all VOXERA_S3_* settings to enable object storage.")
        if not endpoint.startswith("https://"):
            raise RuntimeError("VOXERA_S3_ENDPOINT_URL must use HTTPS.")
        import boto3

        client = boto3.client(
            "s3",
            endpoint_url=endpoint,
            region_name=os.environ.get("VOXERA_S3_REGION", "auto"),
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )
        return cls(bucket, client)

    @property
    def enabled(self) -> bool:
        return self.client is not None

    def _key(self, namespace: str, filename: str) -> str:
        if Path(filename).name != filename or "/" in filename or "\\" in filename or filename in {"", ".", ".."}:
            raise ValueError("Media filenames must be a single safe path component.")
        if namespace not in {"uploads", "profile-photos"}:
            raise ValueError("Unsupported media namespace.")
        return f"{namespace}/{filename}"

    def save(self, path: Path, namespace: str) -> None:
        key = self._key(namespace, path.name)
        if self.client is not None and self.bucket is not None:
            self.client.upload_file(str(path), self.bucket, key)

    def resolve(self, directory: Path, filename: str, namespace: str) -> Path:
        key = self._key(namespace, filename)
        path = directory / filename
        if path.is_file() or self.client is None or self.bucket is None:
            return path
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = path.with_name(f".{path.name}.download")
        try:
            self.client.download_file(self.bucket, key, str(temporary_path))
            temporary_path.replace(path)
        except Exception:
            temporary_path.unlink(missing_ok=True)
            raise
        return path

    def exists(self, directory: Path, filename: str, namespace: str) -> bool:
        key = self._key(namespace, filename)
        path = directory / filename
        if path.is_file():
            return True
        if self.client is None or self.bucket is None:
            return False
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
        except Exception as error:
            from botocore.exceptions import ClientError

            if not isinstance(error, ClientError):
                raise
            code = error.response.get("Error", {}).get("Code")
            if code in {"404", "NoSuchKey", "NotFound"}:
                return False
            raise
        return True

    def get_object(self, filename: str, namespace: str, range_header: str | None = None) -> dict[str, Any]:
        if self.client is None or self.bucket is None:
            raise RuntimeError("Object storage is not configured.")
        key = self._key(namespace, filename)
        options = {"Range": range_header} if range_header else {}
        return self.client.get_object(Bucket=self.bucket, Key=key, **options)

    def head_object(self, filename: str, namespace: str) -> dict[str, Any]:
        if self.client is None or self.bucket is None:
            raise RuntimeError("Object storage is not configured.")
        return self.client.head_object(Bucket=self.bucket, Key=self._key(namespace, filename))

    def delete(self, directory: Path, filename: str, namespace: str) -> None:
        key = self._key(namespace, filename)
        if self.client is not None and self.bucket is not None:
            self.client.delete_object(Bucket=self.bucket, Key=key)
        (directory / filename).unlink(missing_ok=True)
